package com.bizboard.service;

import com.bizboard.common.entity.*;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.SubCashEntityType;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * v1.6.23.27 (UI Fix WP TODO 7cc85a10 + df12d130 + 85a7e425 + 8764a6a4 +
 * 298dedc3): Sub-Cash assignment + tx routing servisi.
 *
 * <h3>Sorumluluklar:</h3>
 * <ul>
 *   <li>assign(subCashId, entityType, entityId) — UNIQUE + cross-tenant +
 *       eligibility validation</li>
 *   <li>unassign(assignmentId) — entity verisi etkilenmez</li>
 *   <li>listAssignments(subCashId) — UI sub-cash detay sayfası</li>
 *   <li>resolveSubCashForTx(tx) — COALESCE(bank_account &gt; pos_device &gt;
 *       counterpart) ile tx'in hangi sub-cash'e route edildiğini bulur</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubCashService {

    private final SubCashAssignmentRepository repository;
    private final BankAccountRepository bankAccountRepository;
    private final CounterpartRepository counterpartRepository;
    private final PosDeviceRepository posDeviceRepository;
    private final TransactionRepository transactionRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;

    // ─────────────────────── ASSIGN ───────────────────────

    /**
     * v1.6.23.27 (TODO 7cc85a10 + a9aea833 + c2566418): Bir entity'yi
     * sub-cash'e ata.
     *
     * <p>Validation kuralları:</p>
     * <ol>
     *   <li>Sub-cash gerçekten SUB_CASH tipinde + actor erişimi var</li>
     *   <li>Entity'nin business_id'si sub-cash ile aynı (cross-tenant yasak)</li>
     *   <li>BANK_ACCOUNT entity için: CHECKING/SAVINGS/CASH_HOLDER kabul;
     *       MAIN_CASH ve SUB_CASH REDDEDİLİR (Σ invariant'ı kırar)</li>
     *   <li>UNIQUE: entity zaten başka sub-cash'te ise reddet</li>
     *   <li>System bank_account (Genel Nakit) assign edilebilir mi?
     *       — EVET, normal CASH_HOLDER gibi davranır. is_user_deletable
     *       sadece doğrudan silmeyi engeller.</li>
     * </ol>
     */
    @Transactional
    public SubCashAssignment assign(UUID subCashId, SubCashEntityType type, UUID entityId,
                                    UUID actorUserId) {
        BankAccount subCash = bankAccountRepository.findById(subCashId)
                .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi: " + subCashId));
        if (subCash.getType() != BankAccountType.SUB_CASH) {
            throw new IllegalArgumentException(
                    "Assignment yalniz SUB_CASH'e yapilabilir (gonderilen: " + subCash.getType() + ")");
        }
        Business biz = subCash.getBusiness();
        if (biz == null) throw new IllegalStateException("Sub-cash business yok: " + subCashId);
        accessGuard.assertCanAccessBusiness(actorUserId, biz.getId());

        // Entity tipine göre fetch + cross-tenant + eligibility kontrolü
        UUID entityBizId = resolveEntityBusinessId(type, entityId);
        if (entityBizId == null) {
            throw new IllegalArgumentException("Entity bulunamadi: " + type + " " + entityId);
        }
        if (!biz.getId().equals(entityBizId)) {
            throw new IllegalArgumentException(
                    "Cross-tenant assignment yasak: entity business=" + entityBizId
                            + " sub-cash business=" + biz.getId());
        }
        // BANK_ACCOUNT için ek eligibility (MAIN_CASH/SUB_CASH yasak)
        if (type == SubCashEntityType.BANK_ACCOUNT) {
            BankAccount ba = bankAccountRepository.findById(entityId).orElse(null);
            if (ba == null || !SubCashAggregateService.isEligibleBankAccount(ba)) {
                throw new IllegalArgumentException(
                        "BANK_ACCOUNT assignment yalniz CHECKING/SAVINGS/CASH_HOLDER icin gecerli " +
                                "(MAIN_CASH ve SUB_CASH yasak)");
            }
        }
        // UNIQUE kontrolü — entity zaten başka sub-cash'te mi?
        repository.findByEntityTypeAndEntityId(type, entityId).ifPresent(existing -> {
            if (!existing.getSubCash().getId().equals(subCashId)) {
                throw new IllegalStateException(
                        "Bu entity zaten baska bir sub-cash'te (" +
                                existing.getSubCash().getName() + "). Once unassign et.");
            }
        });

        SubCashAssignment a = SubCashAssignment.builder()
                .subCash(subCash)
                .business(biz)
                .entityType(type)
                .entityId(entityId)
                .assignedBy(actorUserId)
                .build();
        a = repository.save(a);

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        auditLogService.recordEntityAction(
                "SUB_CASH_ASSIGN",
                actorUserId, actor != null ? actor.getUsername() : null,
                "SUB_CASH_ASSIGNMENT", a.getId(),
                "Atama: " + type + " " + entityId + " -> " + subCash.getName(),
                Map.of(
                        "subCashId", subCashId,
                        "subCashName", subCash.getName(),
                        "entityType", type.name(),
                        "entityId", entityId));
        log.info("[sub-cash assign] {} {} -> {}", type, entityId, subCash.getName());
        return a;
    }

    private UUID resolveEntityBusinessId(SubCashEntityType type, UUID entityId) {
        return switch (type) {
            case BANK_ACCOUNT -> bankAccountRepository.findById(entityId)
                    .map(ba -> ba.getBusiness() != null ? ba.getBusiness().getId() : null)
                    .orElse(null);
            case COUNTERPART -> counterpartRepository.findById(entityId)
                    .map(c -> c.getBusiness() != null ? c.getBusiness().getId() : null)
                    .orElse(null);
            case POS_DEVICE -> posDeviceRepository.findById(entityId)
                    .map(p -> p.getBusiness() != null ? p.getBusiness().getId() : null)
                    .orElse(null);
        };
    }

    // ─────────────────────── UNASSIGN ───────────────────────

    /**
     * v1.6.23.27 (TODO df12d130 + b38789be): Sub-cash atamasını kaldır.
     * Entity verisi etkilenmez — sadece label/grouping silinir.
     */
    @Transactional
    public void unassign(UUID assignmentId, UUID actorUserId) {
        SubCashAssignment a = repository.findById(assignmentId)
                .orElseThrow(() -> new IllegalArgumentException("Assignment bulunamadi: " + assignmentId));
        accessGuard.assertCanAccessBusiness(actorUserId,
                a.getBusiness() != null ? a.getBusiness().getId() : null);

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        UUID subCashId = a.getSubCash() != null ? a.getSubCash().getId() : null;
        String subCashName = a.getSubCash() != null ? a.getSubCash().getName() : "?";
        repository.delete(a);
        auditLogService.recordEntityAction(
                "SUB_CASH_UNASSIGN",
                actorUserId, actor != null ? actor.getUsername() : null,
                "SUB_CASH_ASSIGNMENT", assignmentId,
                "Atama kaldirildi: " + a.getEntityType() + " " + a.getEntityId() + " (" + subCashName + ")",
                Map.of(
                        "subCashId", subCashId != null ? subCashId : "",
                        "entityType", a.getEntityType().name(),
                        "entityId", a.getEntityId()));
        log.info("[sub-cash unassign] {} {} (from {})", a.getEntityType(), a.getEntityId(), subCashName);
    }

    /**
     * v1.6.23.27 (TODO 63229465): Sub-cash silme cascade.
     * Sub-cash silinmeden önce tüm assignment'ları kaldırılır (entity Ana
     * Kasa'ya iade olur). BankAccountService.delete tarafından çağrılır.
     */
    @Transactional
    public int unassignAllFromSubCash(UUID subCashId, UUID actorUserId) {
        List<SubCashAssignment> all = repository.findBySubCashIdOrderByAssignedAtDesc(subCashId);
        for (SubCashAssignment a : all) {
            repository.delete(a);
        }
        if (!all.isEmpty()) {
            User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
            auditLogService.recordEntityAction(
                    "SUB_CASH_CASCADE_UNASSIGN",
                    actorUserId, actor != null ? actor.getUsername() : null,
                    "SUB_CASH", subCashId,
                    all.size() + " atama Ana Kasa'ya iade edildi",
                    Map.of("count", all.size()));
        }
        return all.size();
    }

    // ─────────────────────── LIST ───────────────────────

    /** v1.6.23.27 (TODO 85a7e425): Sub-cash'in tüm atamaları. */
    @Transactional(readOnly = true)
    public List<SubCashAssignment> listForSubCash(UUID subCashId, UUID actorUserId) {
        BankAccount subCash = bankAccountRepository.findById(subCashId)
                .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi: " + subCashId));
        accessGuard.assertCanAccessBusiness(actorUserId,
                subCash.getBusiness() != null ? subCash.getBusiness().getId() : null);
        return repository.findBySubCashIdOrderByAssignedAtDesc(subCashId);
    }

    // ─────────────────────── TX ROUTING (298dedc3) ───────────────────────

    /**
     * v1.6.23.27 (TODO 298dedc3 + 8764a6a4): Bir tx'in sub-cash route'unu
     * çöz — COALESCE öncelik sırası:
     *
     * <ol>
     *   <li>tx.bank_account → assignment varsa o sub-cash</li>
     *   <li>tx.pos_device → assignment varsa o sub-cash</li>
     *   <li>tx.target_counterpart → assignment varsa o sub-cash</li>
     *   <li>hiçbiri yoksa null (unassigned — Ana Kasa display)</li>
     * </ol>
     */
    @Transactional(readOnly = true)
    public Optional<UUID> resolveSubCashForTx(Transaction tx) {
        if (tx == null) return Optional.empty();
        // 1) bank_account
        if (tx.getBankAccount() != null) {
            Optional<SubCashAssignment> a = repository.findByEntityTypeAndEntityId(
                    SubCashEntityType.BANK_ACCOUNT, tx.getBankAccount().getId());
            if (a.isPresent()) return Optional.of(a.get().getSubCash().getId());
        }
        // 2) pos_device
        if (tx.getPosDevice() != null) {
            Optional<SubCashAssignment> a = repository.findByEntityTypeAndEntityId(
                    SubCashEntityType.POS_DEVICE, tx.getPosDevice().getId());
            if (a.isPresent()) return Optional.of(a.get().getSubCash().getId());
        }
        // 3) target_counterpart
        if (tx.getTargetCounterpart() != null) {
            Optional<SubCashAssignment> a = repository.findByEntityTypeAndEntityId(
                    SubCashEntityType.COUNTERPART, tx.getTargetCounterpart().getId());
            if (a.isPresent()) return Optional.of(a.get().getSubCash().getId());
        }
        return Optional.empty();
    }

    /**
     * v1.6.23.27 (TODO 85a7e425): Sub-cash'e bağlı tx listesi (COALESCE
     * resolve sonucu bu sub-cash olan tx'ler). UI detay sayfasında
     * "tx listesi kartı" için. {@code limit} parametresi optional.
     */
    @Transactional(readOnly = true)
    public List<Transaction> transactionsForSubCash(UUID subCashId, UUID actorUserId, int limit) {
        BankAccount subCash = bankAccountRepository.findById(subCashId)
                .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi: " + subCashId));
        UUID bizId = subCash.getBusiness() != null ? subCash.getBusiness().getId() : null;
        accessGuard.assertCanAccessBusiness(actorUserId, bizId);
        if (bizId == null) return List.of();

        // assignment'larda entity_id'leri set olarak topla
        Set<UUID> bankIds = new HashSet<>();
        Set<UUID> posIds = new HashSet<>();
        Set<UUID> cpIds = new HashSet<>();
        repository.findBySubCashIdOrderByAssignedAtDesc(subCashId).forEach(a -> {
            switch (a.getEntityType()) {
                case BANK_ACCOUNT -> bankIds.add(a.getEntityId());
                case POS_DEVICE -> posIds.add(a.getEntityId());
                case COUNTERPART -> cpIds.add(a.getEntityId());
            }
        });
        if (bankIds.isEmpty() && posIds.isEmpty() && cpIds.isEmpty()) return List.of();

        // tx listesini business genelinde çek + in-memory COALESCE filter.
        // Performans: tx sayısı 1000+ olunca repository tarafına spesifik
        // query taşınabilir; v1'de in-memory yeterli.
        List<Transaction> all = transactionRepository.findByBusinessIdOrderByDateDesc(bizId);
        return all.stream()
                .filter(t -> {
                    // COALESCE öncelik — bank > pos > counterpart
                    if (t.getBankAccount() != null && bankIds.contains(t.getBankAccount().getId())) return true;
                    if (t.getPosDevice() != null && posIds.contains(t.getPosDevice().getId())) return true;
                    if (t.getTargetCounterpart() != null && cpIds.contains(t.getTargetCounterpart().getId())) return true;
                    return false;
                })
                .limit(limit > 0 ? limit : Long.MAX_VALUE)
                .toList();
    }

    // Helper — transactionRepository pageable üzerinden bank_account txs alır;
    // kullanılmıyorsa silinebilir (mevcut, ek olarak).
    @SuppressWarnings("unused")
    private void touchPageRequest() { PageRequest.of(0, 1); }
}
