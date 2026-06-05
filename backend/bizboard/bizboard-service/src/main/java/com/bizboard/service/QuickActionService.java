package com.bizboard.service;

import com.bizboard.common.dto.CreateQuickActionRequest;
import com.bizboard.common.dto.CreateTransactionRequest;
import com.bizboard.common.dto.CreateTransferRequest;
import com.bizboard.common.dto.ExecuteQuickActionRequest;
import com.bizboard.common.dto.QuickActionDto;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.dto.TransferDto;
import com.bizboard.common.dto.UpdateQuickActionRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.QuickAction;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.QuickActionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WP e4dc5271 (Beta v1.4): Hızlı İşlemler servisi.
 *
 * <h3>Sorumluluklar</h3>
 * <ul>
 *   <li>CRUD: kullanıcının {business, user} scope'lu şablonları.</li>
 *   <li>12 şablon limit (service-layer enforced).</li>
 *   <li>Execute akışı: template + overrides merge → TransactionService.create
 *       veya TransferService.create çağrısı; usage_count++ + last_used_at.</li>
 *   <li>Cross-tenant: tüm endpoint'ler user_id == actor'a göre filtreli.</li>
 *   <li>Entity ref validation execute zamanı altta yatan service'ler yapar
 *       (bank/POS/counterpart yoksa veya pasifse onlar 400 fırlatır).</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class QuickActionService {

    /** Spec'te belirtilen kullanıcı başı şablon limiti. */
    public static final int MAX_QUICK_ACTIONS_PER_BUSINESS = 12;

    private final QuickActionRepository repository;
    private final UserRepository userRepository;
    private final BusinessRepository businessRepository;
    private final BusinessAccessGuard accessGuard;
    private final TransactionService transactionService;
    private final TransferService transferService;
    private final AuditLogService auditLogService;

    // ───────────────────────── LIST ─────────────────────────

    @Transactional(readOnly = true)
    public List<QuickActionDto> list(UUID actorUserId, UUID businessId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        List<QuickAction> items = repository
                .findByUserIdAndBusinessIdOrderByOrderIndexAscLastUsedAtDesc(actorUserId, businessId);
        // NULLS LAST for last_used_at DESC — Postgres default for DESC = NULLS FIRST,
        // so we re-sort in-memory (max 12 items).
        items.sort(Comparator
                .comparingInt(QuickAction::getOrderIndex)
                .thenComparing((QuickAction q) -> q.getLastUsedAt(),
                        Comparator.nullsLast(Comparator.reverseOrder())));
        return items.stream().map(QuickActionService::toDto).toList();
    }

    // ───────────────────────── CREATE ─────────────────────────

    @Transactional
    public QuickActionDto create(CreateQuickActionRequest req, UUID actorUserId) {
        if (req.getBusinessId() == null) {
            throw new IllegalArgumentException("business_id zorunlu");
        }
        if (req.getName() == null || req.getName().isBlank()) {
            throw new IllegalArgumentException("name zorunlu");
        }
        if (req.getTxTemplate() == null || req.getTxTemplate().isEmpty()) {
            throw new IllegalArgumentException("tx_template zorunlu");
        }
        validateTemplateShape(req.getTxTemplate());

        accessGuard.assertCanAccessBusiness(actorUserId, req.getBusinessId());

        long count = repository.countByUserIdAndBusinessId(actorUserId, req.getBusinessId());
        if (count >= MAX_QUICK_ACTIONS_PER_BUSINESS) {
            throw new IllegalArgumentException(
                    "Maksimum " + MAX_QUICK_ACTIONS_PER_BUSINESS + " hızlı işlem (limit dolu)");
        }
        String trimmedName = req.getName().trim();
        repository.findByUserIdAndBusinessIdAndName(actorUserId, req.getBusinessId(), trimmedName)
                .ifPresent(existing -> {
                    throw new IllegalArgumentException(
                            "Bu isimde bir hızlı işlem zaten var: " + trimmedName);
                });

        User user = userRepository.findById(actorUserId)
                .orElseThrow(() -> new IllegalArgumentException("Kullanici bulunamadi: " + actorUserId));
        Business business = businessRepository.findById(req.getBusinessId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "business_id bulunamadi: " + req.getBusinessId()));

        // order_index: mevcut max + 1 (yeni eklenenler sona)
        int nextOrder = (int) count;

        QuickAction qa = QuickAction.builder()
                .user(user)
                .business(business)
                .name(trimmedName)
                .txTemplate(req.getTxTemplate())
                .icon(req.getIcon())
                .color(req.getColor())
                .orderIndex(nextOrder)
                .usageCount(0)
                .build();
        qa = repository.save(qa);

        auditLogService.recordEntityAction(
                "QUICK_ACTION_CREATE",
                actorUserId, user.getUsername(),
                "QUICK_ACTION", qa.getId(),
                "Hızlı işlem oluşturuldu: " + qa.getName(),
                Map.of("name", qa.getName(), "businessId", business.getId().toString()));
        log.info("[quick-action] created id={} name='{}' user={} biz={}",
                qa.getId(), qa.getName(), actorUserId, business.getId());
        return toDto(qa);
    }

    // ───────────────────────── UPDATE ─────────────────────────

    @Transactional
    public QuickActionDto update(UUID id, UpdateQuickActionRequest req, UUID actorUserId) {
        QuickAction qa = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Hızlı işlem bulunamadi: " + id));
        // Cross-tenant: yalnız sahibi düzenleyebilir.
        if (qa.getUser() == null || !qa.getUser().getId().equals(actorUserId)) {
            throw new SecurityException("Bu hızlı işleme erişim yok");
        }
        Map<String, Object> changes = new HashMap<>();
        if (req.getName() != null && !req.getName().isBlank()
                && !req.getName().trim().equals(qa.getName())) {
            final String newName = req.getName().trim();
            final UUID currentId = qa.getId(); // lambda için effectively final
            // Name uniqueness check (user_id+business_id+name)
            repository.findByUserIdAndBusinessIdAndName(
                            actorUserId, qa.getBusiness().getId(), newName)
                    .ifPresent(existing -> {
                        if (!existing.getId().equals(currentId)) {
                            throw new IllegalArgumentException(
                                    "Bu isimde bir hızlı işlem zaten var: " + newName);
                        }
                    });
            changes.put("name", Map.of("from", qa.getName(), "to", newName));
            qa.setName(newName);
        }
        if (req.getTxTemplate() != null) {
            validateTemplateShape(req.getTxTemplate());
            qa.setTxTemplate(req.getTxTemplate());
            changes.put("tx_template_updated", true);
        }
        if (req.getIcon() != null) {
            qa.setIcon(req.getIcon().isBlank() ? null : req.getIcon());
            changes.put("icon", req.getIcon());
        }
        if (req.getColor() != null) {
            qa.setColor(req.getColor().isBlank() ? null : req.getColor());
            changes.put("color", req.getColor());
        }
        if (req.getOrderIndex() != null && req.getOrderIndex() != qa.getOrderIndex()) {
            changes.put("order_index", Map.of("from", qa.getOrderIndex(), "to", req.getOrderIndex()));
            qa.setOrderIndex(req.getOrderIndex());
        }
        if (changes.isEmpty()) {
            return toDto(qa);
        }
        qa = repository.save(qa);
        auditLogService.recordEntityAction(
                "QUICK_ACTION_UPDATE",
                actorUserId, lookupUsername(actorUserId),
                "QUICK_ACTION", qa.getId(),
                "Hızlı işlem güncellendi: " + qa.getName(),
                Map.of("changes", changes));
        return toDto(qa);
    }

    // ───────────────────────── DELETE ─────────────────────────

    @Transactional
    public void delete(UUID id, UUID actorUserId) {
        QuickAction qa = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Hızlı işlem bulunamadi: " + id));
        if (qa.getUser() == null || !qa.getUser().getId().equals(actorUserId)) {
            throw new SecurityException("Bu hızlı işleme erişim yok");
        }
        String name = qa.getName();
        repository.delete(qa);
        auditLogService.recordEntityAction(
                "QUICK_ACTION_DELETE",
                actorUserId, lookupUsername(actorUserId),
                "QUICK_ACTION", id,
                "Hızlı işlem silindi: " + name,
                Map.of("name", name));
        log.info("[quick-action] deleted id={} name='{}'", id, name);
    }

    // ───────────────────────── EXECUTE ─────────────────────────

    /**
     * Hızlı işlemi çalıştırır: template + overrides → tx oluşturma.
     * Atomic: tx başarısız olursa usage sayacı artmaz.
     */
    @Transactional
    public ExecuteResult execute(UUID id, ExecuteQuickActionRequest req, UUID actorUserId) {
        QuickAction qa = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Hızlı işlem bulunamadi: " + id));
        if (qa.getUser() == null || !qa.getUser().getId().equals(actorUserId)) {
            throw new SecurityException("Bu hızlı işleme erişim yok");
        }
        accessGuard.assertCanAccessBusiness(actorUserId, qa.getBusiness().getId());

        // Template + overrides merge (overrides öncelikli)
        Map<String, Object> merged = new HashMap<>(qa.getTxTemplate() != null
                ? qa.getTxTemplate() : Map.of());
        if (req != null && req.getOverrides() != null) {
            merged.putAll(req.getOverrides());
        }

        String kind = stringOrNull(merged.get("kind"));
        TransactionDto outNormal = null;
        TransferDto outTransfer = null;
        try {
            if ("TRANSFER".equalsIgnoreCase(kind)) {
                outTransfer = executeTransfer(merged, actorUserId);
            } else {
                outNormal = executeNormal(qa.getBusiness().getId(), merged, actorUserId);
            }
        } catch (IllegalArgumentException e) {
            // Underlying service'ten gelen "entity bulunamadi/pasif" mesajını
            // kullanıcı dostu hale getir.
            throw new IllegalArgumentException(
                    "Hızlı işlem geçersiz: " + e.getMessage() + " — Şablonu güncelleyin.");
        }

        // Başarılı — usage_count++, last_used_at = NOW
        qa.setUsageCount(qa.getUsageCount() + 1);
        qa.setLastUsedAt(LocalDateTime.now());
        qa = repository.save(qa);

        log.info("[quick-action] executed id={} name='{}' kind={} usage_count={}",
                qa.getId(), qa.getName(), kind, qa.getUsageCount());
        return new ExecuteResult(toDto(qa), outNormal, outTransfer);
    }

    /** WP e4dc5271 result wrapper — tx + güncellenmiş quick_action. */
    public static class ExecuteResult {
        public final QuickActionDto quickAction;
        public final TransactionDto transaction;
        public final TransferDto transfer;
        public ExecuteResult(QuickActionDto qa, TransactionDto tx, TransferDto tr) {
            this.quickAction = qa; this.transaction = tx; this.transfer = tr;
        }
    }

    private TransactionDto executeNormal(UUID businessId, Map<String, Object> m, UUID actorUserId) {
        CreateTransactionRequest req = new CreateTransactionRequest();
        req.setDirection(stringOrNull(m.get("direction")));
        req.setAmount(toBigDecimal(m.get("amount")));
        req.setCurrency(stringOrNull(m.get("currency")));
        req.setDescription(stringOrNull(m.get("description")));
        // date: override anahtarı "transaction_date" veya "date"
        Object dateObj = m.containsKey("transaction_date") ? m.get("transaction_date") : m.get("date");
        req.setDate(toLocalDate(dateObj));
        req.setCategoryId(toUuid(m.get("category_id")));
        req.setPaymentMethod(stringOrNull(m.get("payment_method")));
        req.setPosRate(toBigDecimal(m.get("applied_pos_rate"))); // template snapshot
        req.setOurCommissionRate(toBigDecimal(m.get("applied_our_commission_rate")));
        req.setTargetCounterpartId(toUuid(m.get("counterpart_id")));
        req.setPosDeviceId(toUuid(m.get("pos_device_id")));
        req.setBankAccountId(toUuid(m.get("bank_account_id")));
        // Beta v1.1 hotfix: alt kasa atamasını template'tan oku — execute
        // zamanı TransactionService MANUAL inclusion eklesin + SUB_CASH
        // bakiyesini güncellesin.
        req.setManualSubCashId(toUuid(m.get("manual_sub_cash_id")));
        // Validation
        if (req.getDirection() == null || req.getDirection().isBlank()) {
            throw new IllegalArgumentException("direction template'te eksik");
        }
        if (req.getAmount() == null || req.getAmount().signum() <= 0) {
            throw new IllegalArgumentException("amount template/override'da geçerli değil");
        }
        if (req.getDate() == null) {
            req.setDate(LocalDate.now());
        }
        return transactionService.createTransaction(businessId, req, actorUserId);
    }

    private TransferDto executeTransfer(Map<String, Object> m, UUID actorUserId) {
        CreateTransferRequest req = new CreateTransferRequest();
        // Transfer akışında kaynak hesap "bank_account_id" veya "from_bank_account_id"
        UUID fromId = toUuid(m.get("from_bank_account_id") != null
                ? m.get("from_bank_account_id") : m.get("bank_account_id"));
        req.setFromBankAccountId(fromId);
        req.setToBankAccountId(toUuid(m.get("to_bank_account_id")));
        req.setToExternalName(stringOrNull(m.get("to_external_name")));
        req.setAmount(toBigDecimal(m.get("amount")));
        Object dateObj = m.containsKey("transaction_date") ? m.get("transaction_date") : m.get("date");
        req.setDate(toLocalDate(dateObj != null ? dateObj : LocalDate.now()));
        req.setDescription(stringOrNull(m.get("description")));
        if (req.getFromBankAccountId() == null) {
            throw new IllegalArgumentException("from_bank_account_id template'te eksik");
        }
        if (req.getAmount() == null || req.getAmount().signum() <= 0) {
            throw new IllegalArgumentException("amount geçerli değil");
        }
        return transferService.create(req, actorUserId);
    }

    // ───────────────────────── helpers ─────────────────────────

    private void validateTemplateShape(Map<String, Object> tpl) {
        // Spec: zorunlu = direction, payment_method (NORMAL için).
        // TRANSFER için kind=TRANSFER + from_bank_account_id zorunlu.
        String kind = stringOrNull(tpl.get("kind"));
        if ("TRANSFER".equalsIgnoreCase(kind)) {
            // En azından from_bank_account_id olmalı (to_external_name veya to_bank_account_id execute zamanı)
            if (tpl.get("from_bank_account_id") == null && tpl.get("bank_account_id") == null) {
                throw new IllegalArgumentException(
                        "TRANSFER şablonu için from_bank_account_id (veya bank_account_id) zorunlu");
            }
        } else {
            // NORMAL — kind eksikse "NORMAL" varsay
            if (tpl.get("direction") == null) {
                throw new IllegalArgumentException(
                        "tx_template.direction zorunlu (income/expense)");
            }
            if (tpl.get("payment_method") == null) {
                throw new IllegalArgumentException(
                        "tx_template.payment_method zorunlu (POS/NAKIT/HESAPDAN)");
            }
        }
    }

    private String lookupUsername(UUID userId) {
        if (userId == null) return null;
        return userRepository.findById(userId).map(User::getUsername).orElse(null);
    }

    public static QuickActionDto toDto(QuickAction q) {
        return QuickActionDto.builder()
                .id(q.getId())
                .userId(q.getUser() != null ? q.getUser().getId() : null)
                .businessId(q.getBusiness() != null ? q.getBusiness().getId() : null)
                .businessName(q.getBusiness() != null ? q.getBusiness().getName() : null)
                .name(q.getName())
                .txTemplate(q.getTxTemplate())
                .icon(q.getIcon())
                .color(q.getColor())
                .orderIndex(q.getOrderIndex())
                .usageCount(q.getUsageCount())
                .lastUsedAt(q.getLastUsedAt())
                .createdAt(q.getCreatedAt())
                .updatedAt(q.getUpdatedAt())
                .build();
    }

    // ───────── primitive conversion helpers ─────────

    private static String stringOrNull(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static BigDecimal toBigDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try { return new BigDecimal(v.toString()); } catch (Exception e) { return null; }
    }

    private static UUID toUuid(Object v) {
        if (v == null) return null;
        if (v instanceof UUID u) return u;
        try { return UUID.fromString(v.toString()); } catch (Exception e) { return null; }
    }

    private static LocalDate toLocalDate(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDate d) return d;
        try { return LocalDate.parse(v.toString()); } catch (Exception e) { return null; }
    }
}
