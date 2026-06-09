package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreatePosDeviceRequest;
import com.bizboard.common.dto.PosDeviceDto;
import com.bizboard.common.dto.UpdatePosDeviceRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.MyCompany;
import com.bizboard.common.entity.PosDevice;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.MyCompanyRepository;
import com.bizboard.repository.PosDeviceRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * v1.6.21 (WP-4): POS cihazı yönetim servisi.
 *
 * <p>CRUD aksiyonları (admin kapsamlı kullanım). DELETE soft delete'tir:
 * {@code is_active=false} set edilir, fiziksel silinmez (tx referansları korunur).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PosDeviceManagementService {

    private final PosDeviceRepository repository;
    private final CounterpartRepository counterpartRepository;
    private final MyCompanyRepository myCompanyRepository;
    private final UserRepository userRepository;
    private final BusinessRepository businessRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    // v1.6.23.13 (TODO 5cee5f99): device detay tx listing için
    private final com.bizboard.repository.TransactionRepository transactionRepository;

    /**
     * v1.6.23.13 / v1.6.23.20: POS device'a ait tüm POS tx'leri (en yeni önce).
     * Cross-tenant erişim engellenir.
     */
    @Transactional(readOnly = true)
    public List<com.bizboard.common.dto.TransactionDto> getDeviceTransactions(UUID deviceId, UUID actorUserId) {
        PosDevice d = repository.findById(deviceId)
                .orElseThrow(() -> new IllegalArgumentException("POS cihazi bulunamadi: " + deviceId));
        accessGuard.assertCanReadBusiness(actorUserId,
                d.getBusiness() != null ? d.getBusiness().getId() : null);
        return transactionRepository.findByPosDeviceIdOrderByDateDesc(deviceId).stream()
                .map(DtoMapper::toTransactionDto)
                .toList();
    }

    /**
     * v1.6.23.20 (Security WP / arch-rules §1.3.B): list multi-tenant filter.
     */
    @Transactional(readOnly = true)
    public List<PosDeviceDto> list(boolean includeInactive, UUID actorUserId) {
        List<UUID> allowed = accessGuard.accessibleBusinessIds(actorUserId);
        if (allowed.isEmpty()) return List.of();
        List<PosDevice> all = includeInactive
                ? repository.findByBusinessIdInOrderByActiveDescNameAsc(allowed)
                : repository.findByActiveTrueAndBusinessIdInOrderByNameAsc(allowed);
        return all.stream().map(PosDeviceManagementService::toDto).toList();
    }

    @Transactional(readOnly = true)
    public PosDeviceDto get(UUID id, UUID actorUserId) {
        PosDevice d = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("POS cihazi bulunamadi: " + id));
        accessGuard.assertCanReadBusiness(actorUserId,
                d.getBusiness() != null ? d.getBusiness().getId() : null);
        return toDto(d);
    }

    @Transactional
    public PosDeviceDto create(CreatePosDeviceRequest req, UUID actorUserId) {
        User actor = lookupActor(actorUserId);

        // business_id gönderilmemişse kullanıcının erişebildiği tek işletmeyi otomatik seç.
        final UUID resolvedBusinessId;
        if (req.getBusinessId() != null) {
            resolvedBusinessId = req.getBusinessId();
        } else {
            List<UUID> accessible = accessGuard.accessibleBusinessIds(actorUserId);
            if (accessible.size() == 1) {
                resolvedBusinessId = accessible.get(0);
            } else {
                throw new IllegalArgumentException("business_id zorunlu (birden fazla işletmeye erişiminiz var)");
            }
        }
        Business business = businessRepository.findById(resolvedBusinessId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "business_id bulunamadi: " + resolvedBusinessId));
        accessGuard.assertCanAccessBusiness(actorUserId, business.getId());

        Counterpart owner = null;
        if (req.getOwnerCounterpartId() != null) {
            owner = counterpartRepository.findById(req.getOwnerCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Sahip firma bulunamadi: " + req.getOwnerCounterpartId()));
        }

        // v1.7.x: owner_my_company_id — POS cihazının hangi firmamıza ait olduğu.
        MyCompany ownerMyCompany = null;
        if (req.getOwnerMyCompanyId() != null) {
            ownerMyCompany = myCompanyRepository.findById(req.getOwnerMyCompanyId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Sahip firma (my_company) bulunamadi: " + req.getOwnerMyCompanyId()));
        }

        // v1.7.x (POS Komisyon WP TODO fc3ed50f): device default rate'lerinde
        // de our >= bank validasyonu (constant aynı mesaj).
        if (req.getOurCommissionRate() != null && req.getDefaultRate() != null
                && req.getOurCommissionRate().compareTo(req.getDefaultRate()) < 0) {
            throw new IllegalArgumentException(TransactionService.MSG_OUR_LT_BANK);
        }

        PosDevice d = PosDevice.builder()
                .business(business)
                .name(req.getName().trim())
                .ownerCounterpart(owner)
                .ownerMyCompany(ownerMyCompany)
                .bankName(blankToNull(req.getBankName()))
                .defaultRate(req.getDefaultRate())
                .ourCommissionRate(req.getOurCommissionRate())
                .active(true)
                .notes(blankToNull(req.getNotes()))
                .build();

        d = repository.save(d);

        auditLogService.recordEntityAction(
                "POS_DEVICE_CREATE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "POS_DEVICE", d.getId(),
                "POS cihazi olusturuldu: " + d.getName(),
                java.util.Map.of(
                        "name", d.getName(),
                        "ownerMyCompanyId", ownerMyCompany != null ? ownerMyCompany.getId().toString() : "null",
                        "defaultRate", d.getDefaultRate() != null ? d.getDefaultRate().toPlainString() : "null"));

        log.info("POS device created: id={} name={} owner={}",
                d.getId(), d.getName(), owner != null ? owner.getName() : null);
        return toDto(d);
    }

    @Transactional
    public PosDeviceDto update(UUID id, UpdatePosDeviceRequest req, UUID actorUserId) {
        PosDevice d = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("POS cihazi bulunamadi: " + id));
        accessGuard.assertCanAccessBusiness(actorUserId,
                d.getBusiness() != null ? d.getBusiness().getId() : null);
        User actor = lookupActor(actorUserId);
        Map<String, Object> changes = new HashMap<>();

        if (req.getName() != null && !req.getName().isBlank()
                && !req.getName().trim().equals(d.getName())) {
            changes.put("name", Map.of("from", d.getName(), "to", req.getName().trim()));
            d.setName(req.getName().trim());
        }
        if (req.getOwnerCounterpartId() != null) {
            UUID oldOwnerId = d.getOwnerCounterpart() != null ? d.getOwnerCounterpart().getId() : null;
            if (!Objects.equals(oldOwnerId, req.getOwnerCounterpartId())) {
                Counterpart newOwner = counterpartRepository.findById(req.getOwnerCounterpartId())
                        .orElseThrow(() -> new IllegalArgumentException(
                                "Sahip firma bulunamadi: " + req.getOwnerCounterpartId()));
                d.setOwnerCounterpart(newOwner);
                changes.put("ownerCounterpartId", Map.of(
                        "from", oldOwnerId != null ? oldOwnerId.toString() : "null",
                        "to", req.getOwnerCounterpartId().toString()));
            }
        }
        // v1.7.x: owner_my_company_id — her zaman uygulanır (null = temizle).
        {
            UUID oldMcId = d.getOwnerMyCompany() != null ? d.getOwnerMyCompany().getId() : null;
            if (!Objects.equals(oldMcId, req.getOwnerMyCompanyId())) {
                MyCompany mc = req.getOwnerMyCompanyId() != null
                        ? myCompanyRepository.findById(req.getOwnerMyCompanyId())
                              .orElseThrow(() -> new IllegalArgumentException(
                                      "Sahip firma (my_company) bulunamadi: " + req.getOwnerMyCompanyId()))
                        : null;
                d.setOwnerMyCompany(mc);
                changes.put("ownerMyCompanyId", Map.of(
                        "from", oldMcId != null ? oldMcId.toString() : "null",
                        "to", req.getOwnerMyCompanyId() != null ? req.getOwnerMyCompanyId().toString() : "null"));
            }
        }
        if (req.getBankName() != null && !Objects.equals(req.getBankName(), d.getBankName())) {
            changes.put("bankName", Map.of(
                    "from", d.getBankName() == null ? "" : d.getBankName(),
                    "to", req.getBankName()));
            d.setBankName(blankToNull(req.getBankName()));
        }
        if (req.getDefaultRate() != null
                && !Objects.equals(req.getDefaultRate(), d.getDefaultRate())) {
            changes.put("defaultRate", Map.of(
                    "from", d.getDefaultRate() != null ? d.getDefaultRate().toPlainString() : "null",
                    "to", req.getDefaultRate().toPlainString()));
            d.setDefaultRate(req.getDefaultRate());
        }
        // v1.7.x (POS Komisyon WP TODO 1bb4529a): bizim oran partial update.
        if (req.getOurCommissionRate() != null
                && !Objects.equals(req.getOurCommissionRate(), d.getOurCommissionRate())) {
            changes.put("ourCommissionRate", Map.of(
                    "from", d.getOurCommissionRate() != null ? d.getOurCommissionRate().toPlainString() : "null",
                    "to", req.getOurCommissionRate().toPlainString()));
            d.setOurCommissionRate(req.getOurCommissionRate());
        }
        // Validation: our >= bank (eşit OK)
        if (d.getOurCommissionRate() != null && d.getDefaultRate() != null
                && d.getOurCommissionRate().compareTo(d.getDefaultRate()) < 0) {
            throw new IllegalArgumentException(TransactionService.MSG_OUR_LT_BANK);
        }
        if (req.getActive() != null && req.getActive() != d.isActive()) {
            changes.put("active", Map.of("from", d.isActive(), "to", req.getActive()));
            d.setActive(req.getActive());
        }
        if (req.getNotes() != null && !Objects.equals(req.getNotes(), d.getNotes())) {
            d.setNotes(blankToNull(req.getNotes()));
            changes.put("notesUpdated", true);
        }

        d = repository.save(d);

        auditLogService.recordEntityAction(
                "POS_DEVICE_UPDATE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "POS_DEVICE", d.getId(),
                "POS cihazi guncellendi: " + d.getName() + " (" + changes.size() + " alan)",
                Map.of("changes", changes));

        return toDto(d);
    }

    /** Soft delete: is_active=false. Tx referansları korunur. */
    @Transactional
    public void delete(UUID id, UUID actorUserId) {
        PosDevice d = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("POS cihazi bulunamadi: " + id));
        accessGuard.assertCanAccessBusiness(actorUserId,
                d.getBusiness() != null ? d.getBusiness().getId() : null);
        User actor = lookupActor(actorUserId);

        d.setActive(false);
        repository.save(d);

        auditLogService.recordEntityAction(
                "POS_DEVICE_DELETE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "POS_DEVICE", d.getId(),
                "POS cihazi soft-delete (pasif): " + d.getName(),
                Map.of("name", d.getName(), "softDelete", true));

        log.info("POS device soft-deleted: id={} name={}", d.getId(), d.getName());
    }

    // ───────────────────── helpers ─────────────────────

    private User lookupActor(UUID userId) {
        if (userId == null) return null;
        return userRepository.findById(userId).orElse(null);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public static PosDeviceDto toDto(PosDevice d) {
        return PosDeviceDto.builder()
                .id(d.getId())
                .businessId(d.getBusiness() != null ? d.getBusiness().getId() : null)
                .businessName(d.getBusiness() != null ? d.getBusiness().getName() : null)
                .name(d.getName())
                .ownerCounterpartId(d.getOwnerCounterpart() != null ? d.getOwnerCounterpart().getId() : null)
                .ownerCounterpartName(d.getOwnerCounterpart() != null ? d.getOwnerCounterpart().getName() : null)
                .ownerMyCompanyId(d.getOwnerMyCompany() != null ? d.getOwnerMyCompany().getId() : null)
                .ownerMyCompanyName(d.getOwnerMyCompany() != null ? d.getOwnerMyCompany().getLegalName() : null)
                .bankName(d.getBankName())
                .defaultRate(d.getDefaultRate())
                .lastUsedRate(d.getLastUsedRate())
                .ourCommissionRate(d.getOurCommissionRate())
                .active(d.isActive())
                .notes(d.getNotes())
                .createdAt(d.getCreatedAt())
                .build();
    }
}
