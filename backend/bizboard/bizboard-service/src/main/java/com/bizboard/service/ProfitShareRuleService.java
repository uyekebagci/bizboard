package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.ProfitShareConfigDto;
import com.bizboard.common.dto.ProfitShareRuleDto;
import com.bizboard.common.dto.ProfitShareRuleRequest;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.ProfitShareRuleType;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.4 / TODO 3) — ProfitShareRule + global config admin CRUD.
 *
 * <p>Kâr-payı kuralları + oran config'i (sahip%/Fatih%/Tuncay%) sadece admin
 * tarafından yönetilir (STRICT + audit). Kurallar {@link ProfitShareEngine}'i
 * besler; config {@link ProfitShareConfigService} üstünden.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProfitShareRuleService {

    private final ProfitShareRuleRepository ruleRepository;
    private final CounterpartRepository counterpartRepository;
    private final BankAccountRepository bankAccountRepository;
    private final PosDeviceRepository posDeviceRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final ProfitShareConfigService configService;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    // ──────────────────────────── RULES ────────────────────────────

    @Transactional(readOnly = true)
    public List<ProfitShareRuleDto> listRules(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return ruleRepository.findByBusinessIdOrderByPriorityAsc(businessId)
                .stream().map(this::toDto).toList();
    }

    @Transactional
    public ProfitShareRuleDto upsertRule(UUID userId, UUID businessId, UUID ruleId,
                                         ProfitShareRuleRequest req) {
        User user = requireAdmin(userId);
        accessGuard.assertCanAccessBusiness(userId, businessId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        ProfitShareRuleType type = parseType(req.getRuleType());

        ProfitShareRule rule = ruleId != null
                ? ruleRepository.findById(ruleId)
                .orElseThrow(() -> new IllegalArgumentException("Kural bulunamadı"))
                : ProfitShareRule.builder().business(business).build();
        if (ruleId != null && (rule.getBusiness() == null
                || !rule.getBusiness().getId().equals(businessId))) {
            throw new IllegalArgumentException("Kural farklı işletmeye ait (tenant ihlali)");
        }

        // RESIDUAL dışında operatör + hedef kasa zorunlu.
        if (type != ProfitShareRuleType.RESIDUAL) {
            if (req.getOperatorCounterpartId() == null) {
                throw new IllegalArgumentException(type + " kuralı için operator_counterpart_id zorunlu");
            }
            if (req.getTargetSubCashAccountId() == null) {
                throw new IllegalArgumentException(type + " kuralı için target_subcash_account_id zorunlu");
            }
        }

        Counterpart operator = null;
        if (req.getOperatorCounterpartId() != null) {
            operator = counterpartRepository.findById(req.getOperatorCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException("Operatör bulunamadı"));
            assertSameBusiness(operator.getBusiness(), businessId, "Operatör");
        }
        BankAccount target = null;
        if (req.getTargetSubCashAccountId() != null) {
            target = bankAccountRepository.findById(req.getTargetSubCashAccountId())
                    .orElseThrow(() -> new IllegalArgumentException("Hedef kasa bulunamadı"));
            assertSameBusiness(target.getBusiness(), businessId, "Hedef kasa");
        }
        PosDevice device = null;
        if (req.getPosDeviceId() != null) {
            device = posDeviceRepository.findById(req.getPosDeviceId())
                    .orElseThrow(() -> new IllegalArgumentException("POS cihazı bulunamadı"));
            assertSameBusiness(device.getBusiness(), businessId, "POS cihazı");
        }

        rule.setOperatorCounterpart(operator);
        rule.setTargetSubCashAccount(target);
        rule.setPosDevice(device);
        rule.setRuleType(type);
        rule.setOverridePct(req.getOverridePct());
        if (req.getActive() != null) rule.setActive(req.getActive());
        if (req.getPriority() != null) rule.setPriority(req.getPriority());
        rule.setNotes(req.getNotes());
        rule = ruleRepository.save(rule);

        auditLogService.recordEntityAction(
                AuditAction.PROFIT_SHARE_RULE_UPSERT, userId, user.getUsername(),
                "PROFIT_SHARE_RULE", rule.getId(),
                "Kâr-payı kuralı " + (ruleId != null ? "güncellendi" : "oluşturuldu") + ": "
                        + type + (operator != null ? " — " + operator.getName() : ""),
                Map.of("ruleType", type.name(),
                        "operatorId", operator != null ? operator.getId().toString() : "null",
                        "overridePct", req.getOverridePct() != null ? req.getOverridePct() : "config"),
                null);
        return toDto(rule);
    }

    @Transactional
    public void deleteRule(UUID userId, UUID businessId, UUID ruleId) {
        User user = requireAdmin(userId);
        accessGuard.assertCanAccessBusiness(userId, businessId);
        ProfitShareRule rule = ruleRepository.findById(ruleId)
                .orElseThrow(() -> new IllegalArgumentException("Kural bulunamadı"));
        assertSameBusiness(rule.getBusiness(), businessId, "Kural");
        ruleRepository.delete(rule);
        auditLogService.recordEntityAction(
                AuditAction.PROFIT_SHARE_RULE_DELETE, userId, user.getUsername(),
                "PROFIT_SHARE_RULE", ruleId,
                "Kâr-payı kuralı silindi: " + rule.getRuleType(),
                Map.of("ruleId", ruleId.toString()), null);
    }

    // ──────────────────────────── CONFIG ────────────────────────────

    @Transactional(readOnly = true)
    public ProfitShareConfigDto getConfig(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        ProfitShareConfigService.ProfitShareDefaults d = configService.snapshot();
        return ProfitShareConfigDto.builder()
                .ownerBasePct(d.ownerBasePct())
                .fatihMarginPct(d.fatihMarginPct())
                .tuncaySpreadPct(d.tuncaySpreadPct())
                .build();
    }

    @Transactional
    public ProfitShareConfigDto updateConfig(UUID userId, UUID businessId, ProfitShareConfigDto req) {
        User user = requireAdmin(userId);
        accessGuard.assertCanAccessBusiness(userId, businessId);
        ProfitShareConfigService.ProfitShareDefaults d = configService.update(
                req.getOwnerBasePct(), req.getFatihMarginPct(), req.getTuncaySpreadPct(), userId);
        auditLogService.recordEntityAction(
                AuditAction.PROFIT_SHARE_CONFIG_UPDATE, userId, user.getUsername(),
                "PROFIT_SHARE_CONFIG", null,
                "Kâr-payı config güncellendi — sahip%=" + d.ownerBasePct()
                        + " Fatih%=" + d.fatihMarginPct() + " Tuncay%=" + d.tuncaySpreadPct(),
                Map.of("ownerBasePct", d.ownerBasePct(),
                        "fatihMarginPct", d.fatihMarginPct(),
                        "tuncaySpreadPct", d.tuncaySpreadPct()),
                null);
        return ProfitShareConfigDto.builder()
                .ownerBasePct(d.ownerBasePct())
                .fatihMarginPct(d.fatihMarginPct())
                .tuncaySpreadPct(d.tuncaySpreadPct())
                .build();
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    private User requireAdmin(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!accessGuard.isAdmin(userId)) {
            throw new SecurityException("Sadece admin kâr-payı kural/config yönetebilir");
        }
        return user;
    }

    private ProfitShareRuleType parseType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("rule_type zorunlu");
        }
        try {
            return ProfitShareRuleType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "Geçersiz rule_type: " + raw + " — RATE_SPREAD/MARGIN_PCT/OWNER_COMMISSION/RESIDUAL");
        }
    }

    private void assertSameBusiness(Business owner, UUID businessId, String label) {
        if (owner == null || !owner.getId().equals(businessId)) {
            throw new IllegalArgumentException(label + " farklı işletmeye ait (tenant ihlali)");
        }
    }

    private ProfitShareRuleDto toDto(ProfitShareRule r) {
        Counterpart op = r.getOperatorCounterpart();
        BankAccount tgt = r.getTargetSubCashAccount();
        PosDevice dev = r.getPosDevice();
        return ProfitShareRuleDto.builder()
                .id(r.getId())
                .operatorCounterpartId(op != null ? op.getId() : null)
                .operatorName(op != null ? op.getName() : null)
                .targetSubCashAccountId(tgt != null ? tgt.getId() : null)
                .targetSubCashAccountName(tgt != null ? tgt.getName() : null)
                .posDeviceId(dev != null ? dev.getId() : null)
                .posDeviceName(dev != null ? dev.getName() : null)
                .ruleType(r.getRuleType() != null ? r.getRuleType().name() : null)
                .overridePct(r.getOverridePct())
                .active(r.isActive())
                .priority(r.getPriority())
                .notes(r.getNotes())
                .build();
    }
}
