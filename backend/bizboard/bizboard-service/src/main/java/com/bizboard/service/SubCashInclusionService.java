package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.SubCashAssignment;
import com.bizboard.common.entity.SubCashTxInclusion;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.InclusionScope;
import com.bizboard.common.enums.SubCashEntityType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.SubCashAssignmentRepository;
import com.bizboard.repository.SubCashTxInclusionRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;

/**
 * WP Sub-Cash Retroactive Inclusion servisi.
 *
 * <h3>Roller</h3>
 * <ul>
 *   <li>{@link #autoIncludeIfApplicable(Transaction)}: tx create/update sonrası
 *       — tx'in entity'leri (counterpart/POS/bank) sub-cash assignment'la
 *       eşleşirse her bir sub-cash için AUTOMATIC inclusion kaydı.</li>
 *   <li>{@link #onTransactionUpdated(Transaction, UUID, UUID, UUID)}: entity ID
 *       değişimi → eski inclusion'ları sil + yeniden hesapla.</li>
 *   <li>{@link #bulkInsertRetroactive(UUID, List, UUID)}: kullanıcı UI'sından
 *       RETROACTIVE bulk insert (validation: tx aynı business + entity match).</li>
 *   <li>{@link #removeInclusion(UUID, UUID, UUID)}: tek inclusion sil.</li>
 *   <li>{@link #listAvailableTx(UUID, LocalDate, LocalDate, int, int, UUID)}:
 *       sub-cash assignment'ına ait ama inclusion'da OLMAYAN tx'ler
 *       (paginated, tarih filtreli).</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubCashInclusionService {

    private final SubCashTxInclusionRepository inclusionRepository;
    private final SubCashAssignmentRepository assignmentRepository;
    private final TransactionRepository transactionRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessAccessGuard accessGuard;

    // ───────────────────────── AUTO-INCLUDE ─────────────────────────

    /**
     * Tx oluşturulduktan/güncellendikten sonra çağrılır. Tx'in counterpart/
     * pos_device/bank_account ID'leri hangi sub-cash'lere assigned ise her bir
     * sub-cash için AUTOMATIC inclusion ekler. Var olanları duplicate etmez.
     */
    @Transactional
    public void autoIncludeIfApplicable(Transaction tx) {
        if (tx == null || tx.getBusiness() == null) return;
        UUID businessId = tx.getBusiness().getId();
        UUID cpId = tx.getTargetCounterpart() != null ? tx.getTargetCounterpart().getId() : null;
        UUID posId = tx.getPosDevice() != null ? tx.getPosDevice().getId() : null;
        UUID bankId = tx.getBankAccount() != null ? tx.getBankAccount().getId() : null;

        Set<UUID> matchedSubCashIds = findMatchingSubCashes(businessId, cpId, posId, bankId);
        if (matchedSubCashIds.isEmpty()) return;

        for (UUID subCashId : matchedSubCashIds) {
            if (inclusionRepository.existsBySubCash_IdAndTransaction_Id(subCashId, tx.getId())) {
                continue;
            }
            BankAccount subCash = bankAccountRepository.findById(subCashId).orElse(null);
            if (subCash == null || subCash.getType() != BankAccountType.SUB_CASH) continue;
            SubCashTxInclusion inc = SubCashTxInclusion.builder()
                    .business(tx.getBusiness())
                    .subCash(subCash)
                    .transaction(tx)
                    .scope(InclusionScope.AUTOMATIC)
                    .includedBy(null) // system marker
                    .build();
            inclusionRepository.save(inc);
            log.debug("[inclusion-auto] subCash={} tx={} AUTOMATIC", subCashId, tx.getId());
        }
    }

    /**
     * Tx update'ten sonra çağrılır — entity ID'lerinden herhangi biri değiştiyse
     * tüm mevcut inclusion'ları sil + yeniden hesapla.
     */
    @Transactional
    public void onTransactionUpdated(Transaction tx, UUID oldCpId, UUID oldPosId, UUID oldBankId) {
        if (tx == null) return;
        UUID newCpId = tx.getTargetCounterpart() != null ? tx.getTargetCounterpart().getId() : null;
        UUID newPosId = tx.getPosDevice() != null ? tx.getPosDevice().getId() : null;
        UUID newBankId = tx.getBankAccount() != null ? tx.getBankAccount().getId() : null;
        boolean changed = !Objects.equals(oldCpId, newCpId)
                || !Objects.equals(oldPosId, newPosId)
                || !Objects.equals(oldBankId, newBankId);
        if (!changed) return;
        int removed = inclusionRepository.deleteByTransactionId(tx.getId());
        log.debug("[inclusion-update] tx={} removed {} old inclusions, recomputing", tx.getId(), removed);
        autoIncludeIfApplicable(tx);
    }

    // ───────────────────────── MANUAL (tx-time) ─────────────────────────

    /**
     * Beta v1.1: Tx oluşturulurken kullanıcı bir alt kasaya da bağlamak
     * istiyor → MANUAL inclusion ekle. Validation: tx + sub-cash aynı
     * business; sub-cash SUB_CASH tipinde; duplicate sessiz skip.
     * Transfer kind=TRANSFER tx'lerinde IllegalArgumentException atar
     * (controller 400 dönmesi için).
     */
    @Transactional
    public void addManualInclusion(UUID subCashId, UUID txId, UUID actorUserId) {
        if (subCashId == null || txId == null) return;
        Transaction tx = transactionRepository.findById(txId)
                .orElseThrow(() -> new IllegalArgumentException("Tx bulunamadi: " + txId));
        if (tx.getKind() == com.bizboard.common.enums.TransactionKind.TRANSFER) {
            throw new IllegalArgumentException(
                    "Transfer tx'lerinde manuel alt kasa ataması yapılamaz");
        }
        BankAccount subCash = bankAccountRepository.findById(subCashId)
                .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi: " + subCashId));
        if (subCash.getType() != BankAccountType.SUB_CASH) {
            throw new IllegalArgumentException("Hedef hesap SUB_CASH tipinde olmali");
        }
        if (tx.getBusiness() == null || subCash.getBusiness() == null
                || !tx.getBusiness().getId().equals(subCash.getBusiness().getId())) {
            throw new IllegalArgumentException("Tx ve sub-cash farkli business'a ait");
        }
        if (inclusionRepository.existsBySubCash_IdAndTransaction_Id(subCashId, txId)) {
            return; // duplicate skip (AUTOMATIC zaten varsa)
        }
        SubCashTxInclusion inc = SubCashTxInclusion.builder()
                .business(tx.getBusiness())
                .subCash(subCash)
                .transaction(tx)
                .scope(InclusionScope.MANUAL)
                .includedBy(actorUserId)
                .build();
        inclusionRepository.save(inc);
        // WP Beta v1.1 fix: SUB_CASH.current_balance'ı manuel atamada güncelle.
        // Tx zaten bu sub-cash'in bank_account_id'sine bağlıysa double-count olmasın.
        applyBalanceDelta(subCash, tx, /*add=*/true);
        log.info("[inclusion-manual] subCash={} tx={} added by user={}", subCashId, txId, actorUserId);
    }

    /**
     * WP Beta v1.1 hotfix: Sub-cash bakiye senkronizasyonu.
     *
     * <p>Manuel inclusion ekleyince/silince SUB_CASH.current_balance'ı
     * tx'in income contribution'ı kadar artır/azalt. Eğer tx zaten o sub-cash'in
     * bank_account_id'sine routed ise (NAKIT/HESAPDAN), bakiye zaten doğrudan
     * yansımıştır — double-count önleme.</p>
     */
    private void applyBalanceDelta(BankAccount subCash, Transaction tx, boolean add) {
        if (tx == null || subCash == null) return;
        // Tx zaten bu sub-cash'in bank_account'ına routed → skip (double-count önle).
        if (tx.getBankAccount() != null
                && tx.getBankAccount().getId().equals(subCash.getId())) {
            return;
        }
        java.math.BigDecimal delta = incomeValueForTx(tx);
        if (delta == null || delta.signum() == 0) return;
        java.math.BigDecimal current = subCash.getCurrentBalance() != null
                ? subCash.getCurrentBalance() : java.math.BigDecimal.ZERO;
        subCash.setCurrentBalance(add ? current.add(delta) : current.subtract(delta));
        bankAccountRepository.save(subCash);
    }

    /**
     * income_value formülü — Beta v1.1: KOMİSYON YOK. POS gelir dahil
     * tüm income tx'leri tam tutar (amount), expense tx'leri −amount,
     * transfer 0. Eski rate snapshot'ları (legacy POS Komisyon WP) artık
     * ignore edilir — kullanıcı "kaç liralık POS işlem yaptıysam o kadar
     * gözüksün" istiyor.
     */
    private static java.math.BigDecimal incomeValueForTx(Transaction t) {
        if (t == null || t.getAmount() == null) return java.math.BigDecimal.ZERO;
        if (t.getKind() == com.bizboard.common.enums.TransactionKind.TRANSFER) {
            return java.math.BigDecimal.ZERO;
        }
        if (t.getDirection() == com.bizboard.common.enums.TransactionDirection.INCOME) {
            return t.getAmount();
        }
        if (t.getDirection() == com.bizboard.common.enums.TransactionDirection.EXPENSE) {
            return t.getAmount().negate();
        }
        return java.math.BigDecimal.ZERO;
    }

    // ───────────────────────── MANUAL bulk (retroactive UI) ─────────────────────────

    /**
     * Kullanıcı UI'sından bulk insert (RETROACTIVE scope).
     * Validation: tx'ler aynı business + sub-cash assignment ile entity match.
     * Var olanları sessiz skip.
     */
    @Transactional
    public BulkInclusionResult bulkInsertRetroactive(UUID subCashId, List<UUID> txIds, UUID actorUserId) {
        BankAccount subCash = bankAccountRepository.findById(subCashId)
                .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi: " + subCashId));
        if (subCash.getType() != BankAccountType.SUB_CASH) {
            throw new IllegalArgumentException("Hedef hesap SUB_CASH tipinde olmali");
        }
        UUID businessId = subCash.getBusiness() != null ? subCash.getBusiness().getId() : null;
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);

        // Sub-cash'in assignment'ları (entity ID setleri)
        EntitySets sets = collectAssignedEntityIds(subCashId);

        int added = 0;
        int skipped = 0;
        List<String> failed = new ArrayList<>();
        for (UUID txId : txIds) {
            if (txId == null) continue;
            Transaction tx = transactionRepository.findById(txId).orElse(null);
            if (tx == null) {
                failed.add(txId + ": tx bulunamadi");
                continue;
            }
            if (tx.getBusiness() == null || !tx.getBusiness().getId().equals(businessId)) {
                failed.add(txId + ": farkli business");
                continue;
            }
            boolean matches = entityMatches(tx, sets);
            if (!matches) {
                failed.add(txId + ": tx sub-cash assignment ile eslesmiyor");
                continue;
            }
            if (inclusionRepository.existsBySubCash_IdAndTransaction_Id(subCashId, txId)) {
                skipped++;
                continue;
            }
            SubCashTxInclusion inc = SubCashTxInclusion.builder()
                    .business(tx.getBusiness())
                    .subCash(subCash)
                    .transaction(tx)
                    .scope(InclusionScope.MANUAL)
                    .includedBy(actorUserId)
                    .build();
            inclusionRepository.save(inc);
            added++;
        }
        log.info("[inclusion-retroactive] subCash={} added={} skipped={} failed={}",
                subCashId, added, skipped, failed.size());
        return new BulkInclusionResult(added, skipped, failed);
    }

    public static class BulkInclusionResult {
        public final int added;
        public final int skipped;
        public final List<String> failed;

        public BulkInclusionResult(int added, int skipped, List<String> failed) {
            this.added = added;
            this.skipped = skipped;
            this.failed = failed;
        }
    }

    // ───────────────────────── TX DELETE HOOK ─────────────────────────

    /**
     * Beta v1.1 hotfix: TX silindiğinde MANUAL inclusion'larına bağlı
     * SUB_CASH'lerin current_balance'larını reverse et ve inclusion satırlarını
     * temizle. Aksi takdirde silinen tx bakiyede stale kalır.
     */
    @Transactional
    public void onTransactionDeleted(Transaction tx) {
        if (tx == null) return;
        // Beta v1.1 hotfix: TransientObjectException önleme — inc.transaction
        // lazy proxy üzerinden çalışmak Hibernate'i cascade'e zorluyordu.
        // Önce delta'ları UUID+BigDecimal snapshot olarak çıkar, sonra
        // inclusion'ları sil (modifying query), sonra fresh fetch + save.
        List<SubCashTxInclusion> incs = inclusionRepository.findByTransaction_Id(tx.getId());
        UUID txBankId = tx.getBankAccount() != null ? tx.getBankAccount().getId() : null;
        java.math.BigDecimal contrib = incomeValueForTx(tx);
        java.util.Map<UUID, java.math.BigDecimal> deltasBySubCash = new java.util.HashMap<>();
        for (SubCashTxInclusion inc : incs) {
            if (inc.getScope() != InclusionScope.MANUAL) continue;
            UUID scId = inc.getSubCash() != null ? inc.getSubCash().getId() : null;
            if (scId == null) continue;
            // Double-count guard: tx zaten o sub-cash bank_account'a routed ise skip.
            if (txBankId != null && txBankId.equals(scId)) continue;
            if (contrib == null || contrib.signum() == 0) continue;
            // Reverse: add=false → contrib'i çıkar.
            deltasBySubCash.merge(scId, contrib.negate(), java.math.BigDecimal::add);
        }
        // 1) Inclusion'ları sil (FK CASCADE da var, defensive).
        int removed = inclusionRepository.deleteByTransactionId(tx.getId());
        // 2) Fresh fetch + balance update (cascade'den arınmış).
        for (java.util.Map.Entry<UUID, java.math.BigDecimal> e : deltasBySubCash.entrySet()) {
            BankAccount fresh = bankAccountRepository.findById(e.getKey()).orElse(null);
            if (fresh == null) continue;
            java.math.BigDecimal current = fresh.getCurrentBalance() != null
                    ? fresh.getCurrentBalance() : java.math.BigDecimal.ZERO;
            fresh.setCurrentBalance(current.add(e.getValue()));
            bankAccountRepository.save(fresh);
        }
        if (removed > 0) {
            log.info("[inclusion-tx-deleted] tx={} removed {} inclusion(s), subcash deltas={}",
                    tx.getId(), removed, deltasBySubCash.size());
        }
    }

    // ───────────────────────── RECOMPUTE BALANCE ─────────────────────────

    /**
     * Beta v1.1 hotfix: SUB_CASH bakiyesini inclusion table'dan SIFIRDAN
     * yeniden hesapla. Geçmişteki yanlış delta'ları (legacy formula,
     * silme reverse eksikliği vs.) temizler.
     *
     * <p>Formül: current_balance = Σ MANUAL inclusion.tx.simpleIncomeValue
     * (NAKIT/HESAPDAN tx'in bank_account = SUB_CASH olanları skip — onlar
     * zaten TransactionService tarafından current_balance'a apply edilmiş
     * sayılır; ama burada inclusion authority olduğu için onlar da
     * dahil/dahil değil seçimi tartışmalı).</p>
     *
     * <p>Bu fonksiyon admin recovery için: kullanıcı stale bakiye gördüğünde
     * çağırırlar. Yeni create/delete akışı zaten doğru tutmalı.</p>
     */
    @Transactional
    public java.math.BigDecimal recomputeBalance(UUID subCashId, UUID actorUserId) {
        BankAccount subCash = bankAccountRepository.findById(subCashId)
                .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi: " + subCashId));
        UUID businessId = subCash.getBusiness() != null ? subCash.getBusiness().getId() : null;
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        if (subCash.getType() != BankAccountType.SUB_CASH) {
            throw new IllegalArgumentException("Yalnız SUB_CASH için recompute yapılır");
        }

        java.math.BigDecimal sum = java.math.BigDecimal.ZERO;
        for (SubCashTxInclusion inc : inclusionRepository.findBySubCash_Id(subCashId)) {
            Transaction t = inc.getTransaction();
            if (t == null) continue;
            // Double-count önle: tx zaten sub-cash bank_account'a routed ise
            // TransactionService onu artırmıştı — fakat biz buradaki recompute'da
            // sıfırdan başlayacağız, NAKIT routing kontribüsyonu UYGULANMAYACAK.
            // Bu yüzden bu durum exception: o tutarı ekle. Aksi taktirde
            // bank routing'li tx görünmez.
            sum = sum.add(simpleIncomeValueLocal(t));
        }
        subCash.setCurrentBalance(sum);
        bankAccountRepository.save(subCash);
        log.info("[inclusion-recompute] subCash={} → balance={}", subCashId, sum);
        return sum;
    }

    private static java.math.BigDecimal simpleIncomeValueLocal(Transaction t) {
        if (t == null || t.getAmount() == null) return java.math.BigDecimal.ZERO;
        if (t.getKind() == com.bizboard.common.enums.TransactionKind.TRANSFER) {
            return java.math.BigDecimal.ZERO;
        }
        if (t.getDirection() == com.bizboard.common.enums.TransactionDirection.INCOME) {
            return t.getAmount();
        }
        if (t.getDirection() == com.bizboard.common.enums.TransactionDirection.EXPENSE) {
            return t.getAmount().negate();
        }
        return java.math.BigDecimal.ZERO;
    }

    // ───────────────────────── REMOVE ─────────────────────────

    @Transactional
    public boolean removeInclusion(UUID subCashId, UUID txId, UUID actorUserId) {
        BankAccount subCash = bankAccountRepository.findById(subCashId)
                .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi: " + subCashId));
        UUID businessId = subCash.getBusiness() != null ? subCash.getBusiness().getId() : null;
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        // Beta v1.1 hotfix: bakiye reverse — silmeden önce delta hesapla.
        Transaction tx = transactionRepository.findById(txId).orElse(null);
        int removed = inclusionRepository.deleteBySubCashIdAndTransactionId(subCashId, txId);
        if (removed > 0) {
            applyBalanceDelta(subCash, tx, /*add=*/false);
            log.info("[inclusion-remove] subCash={} tx={}", subCashId, txId);
        }
        return removed > 0;
    }

    // ───────────────────────── LIST AVAILABLE ─────────────────────────

    /**
     * Sub-cash'in assigned entity'lerine ait, henüz inclusion'da OLMAYAN tx'ler.
     * Limit/offset paginated. Date range default: son 90 gün.
     */
    @Transactional(readOnly = true)
    public AvailableTxPage listAvailableTx(UUID subCashId, LocalDate from, LocalDate to,
                                            int offset, int limit, UUID actorUserId) {
        BankAccount subCash = bankAccountRepository.findById(subCashId)
                .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi: " + subCashId));
        UUID businessId = subCash.getBusiness() != null ? subCash.getBusiness().getId() : null;
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);

        EntitySets sets = collectAssignedEntityIds(subCashId);
        if (sets.isEmpty()) {
            return new AvailableTxPage(0, List.of());
        }

        LocalDate today = LocalDate.now();
        LocalDate effFrom = from != null ? from : today.minusDays(90);
        LocalDate effTo = to != null ? to : today;

        Set<UUID> included = inclusionRepository.findIncludedTxIdsBySubCashId(subCashId);

        // İlk fetch: business + date range tüm tx'leri (cap üst limit ile).
        List<Transaction> candidates = transactionRepository
                .findByBusinessIdAndDateBetween(businessId, effFrom, effTo);

        List<Transaction> matched = new ArrayList<>();
        for (Transaction t : candidates) {
            if (included.contains(t.getId())) continue;
            if (entityMatches(t, sets)) matched.add(t);
        }
        // Sort tarih DESC, createdAt DESC
        matched.sort((a, b) -> {
            int dateCmp = b.getDate().compareTo(a.getDate());
            if (dateCmp != 0) return dateCmp;
            if (a.getCreatedAt() == null || b.getCreatedAt() == null) return 0;
            return b.getCreatedAt().compareTo(a.getCreatedAt());
        });
        int total = matched.size();
        int end = Math.min(offset + limit, total);
        List<Transaction> page = offset >= total ? List.of() : matched.subList(offset, end);
        return new AvailableTxPage(total, page);
    }

    public static class AvailableTxPage {
        public final int total;
        public final List<Transaction> items;

        public AvailableTxPage(int total, List<Transaction> items) {
            this.total = total;
            this.items = items;
        }
    }

    // ───────────────────────── helpers ─────────────────────────

    /** Tx'in entity'leri sub-cash assignment'larıyla eşleşiyor mu? */
    private boolean entityMatches(Transaction t, EntitySets sets) {
        UUID cp = t.getTargetCounterpart() != null ? t.getTargetCounterpart().getId() : null;
        UUID pos = t.getPosDevice() != null ? t.getPosDevice().getId() : null;
        UUID bank = t.getBankAccount() != null ? t.getBankAccount().getId() : null;
        return (cp != null && sets.counterpartIds.contains(cp))
                || (pos != null && sets.posIds.contains(pos))
                || (bank != null && sets.bankIds.contains(bank));
    }

    /** Hangi sub-cash'ler bu tx'in entity'lerini içeriyor? */
    private Set<UUID> findMatchingSubCashes(UUID businessId, UUID cpId, UUID posId, UUID bankId) {
        if (businessId == null) return Set.of();
        if (cpId == null && posId == null && bankId == null) return Set.of();
        // Business'taki tüm assignment'ları tara — entity_id match olanların sub-cash'i
        List<SubCashAssignment> all = assignmentRepository
                .findByBusinessIdOrderByAssignedAtDesc(businessId);
        Set<UUID> result = new HashSet<>();
        for (SubCashAssignment a : all) {
            UUID entityId = a.getEntityId();
            SubCashEntityType type = a.getEntityType();
            boolean match = (type == SubCashEntityType.COUNTERPART && Objects.equals(entityId, cpId))
                    || (type == SubCashEntityType.POS_DEVICE && Objects.equals(entityId, posId))
                    || (type == SubCashEntityType.BANK_ACCOUNT && Objects.equals(entityId, bankId));
            if (match && a.getSubCash() != null) {
                result.add(a.getSubCash().getId());
            }
        }
        return result;
    }

    private EntitySets collectAssignedEntityIds(UUID subCashId) {
        EntitySets out = new EntitySets();
        List<SubCashAssignment> assigns = assignmentRepository
                .findBySubCashIdOrderByAssignedAtDesc(subCashId);
        for (SubCashAssignment a : assigns) {
            switch (a.getEntityType()) {
                case COUNTERPART -> out.counterpartIds.add(a.getEntityId());
                case POS_DEVICE -> out.posIds.add(a.getEntityId());
                case BANK_ACCOUNT -> out.bankIds.add(a.getEntityId());
            }
        }
        return out;
    }

    private static class EntitySets {
        final Set<UUID> counterpartIds = new HashSet<>();
        final Set<UUID> posIds = new HashSet<>();
        final Set<UUID> bankIds = new HashSet<>();

        boolean isEmpty() {
            return counterpartIds.isEmpty() && posIds.isEmpty() && bankIds.isEmpty();
        }
    }
}
