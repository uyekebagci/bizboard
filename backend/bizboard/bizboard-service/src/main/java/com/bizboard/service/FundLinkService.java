package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateFundLinkRequest;
import com.bizboard.common.dto.FundLinkDto;
import com.bizboard.common.dto.FundSourceCandidateDto;
import com.bizboard.common.dto.FundTrailDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.FundLink;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.FundLinkRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * "Para İzi" (fund-trail) — işlem↔işlem fon-bağlama + tahsis + çift-yönlü görünüm.
 *
 * <p><b>Senaryo:</b> "3M çek tahsil ettim → nakit kasaya girdi. Sonra 1.5M nakit
 * harcama yaptım. O 1.5M'i 3M'lik nakit girişine bağlarsam: 1.5M'in detayında
 * '3M tahsilattan', 3M'in detayında '1.5M şuna harcandı + kalan 1.5M' görünür."</p>
 *
 * <h3>STRICT — SAF İZLENEBİLİRLİK: bakiye/P&L/posting'e DOKUNMAZ.</h3>
 * Bu servis hiçbir {@code JournalEntry}/{@code Posting} üretmez, hiçbir
 * {@code BankAccount.current_balance} okumaz/yazmaz, hiçbir gelir/gider tanımaz.
 * Sayılar zaten doğru (her tx kendi başına bakiyeye/P&L'e yansıdı); FundLink
 * yalnız "paranın izini" tutan metadata'dır. Çift sayım yoktur. Bağ ekleme veya
 * koparmada Net Kâr Δ=0, bakiye Δ=0.
 *
 * <p><b>Tahsis (allocation) garantileri:</b></p>
 * <ul>
 *   <li>{@code allocated = Σ (source'a bağlı FundLink.amount)}.</li>
 *   <li>{@code kalan = source.amount − allocated}.</li>
 *   <li>Over-allocation engellenir: yeni bağ tutarı kalandan büyükse 400.</li>
 *   <li>Aynı (source, target) çiftine ikinci bağ engellenir (idempotent davranış).</li>
 *   <li>Bir tx kendine bağlanamaz.</li>
 * </ul>
 *
 * <p>STRICT: tenant-scope (her tx aynı business + guard), audit (create/delete),
 * over-allocation guard, idempotent.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FundLinkService {

    private final FundLinkRepository fundLinkRepository;
    private final TransactionRepository transactionRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    // ──────────────────────────── READ (çift-yönlü görünüm) ────────────────────────────

    /**
     * Bir işlemin çift-yönlü fon-izi: sources (nereden geldi) + usages (nereye
     * gitti) + tahsis göstergesi (amount/allocated/remaining). Tek payload.
     */
    @Transactional(readOnly = true)
    public FundTrailDto getTrail(UUID userId, UUID businessId, UUID txId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        Transaction tx = loadTxScoped(businessId, txId);

        List<FundLinkDto> sources = fundLinkRepository.findByTarget(businessId, txId)
                .stream().map(this::toDto).toList();
        List<FundLinkDto> usages = fundLinkRepository.findBySource(businessId, txId)
                .stream().map(this::toDto).toList();

        BigDecimal amount = nz(tx.getAmount());
        BigDecimal allocated = nz(fundLinkRepository.sumAllocatedBySource(businessId, txId));
        BigDecimal remaining = amount.subtract(allocated).max(BigDecimal.ZERO);

        return FundTrailDto.builder()
                .amount(amount)
                .allocated(allocated)
                .remaining(remaining)
                .sources(sources)
                .usages(usages)
                .fullyAllocated(remaining.signum() == 0 && amount.signum() > 0)
                .build();
    }

    /**
     * Bağlanabilir KAYNAK adayları (bind-picker): kalanı ({@code amount −
     * allocated}) &gt; 0 olan işlemler. Hedef işlemin kendisi hariç. En yeni önce,
     * {@code limit} ile sınırlı.
     *
     * <p><b>Yön semantiği (para-izi kuralı):</b> kaynak adayları HEDEFİN
     * TERS-YÖNÜdür. Hedef bir GİDER (EXPENSE) ise para mantıken bir GİRİŞ'ten
     * (INCOME) gelir — başka bir gider kaynak olamaz. Hedef bir GELİR (INCOME)
     * ise "bu para nereye gitti" tarafı çıkışlardır (EXPENSE). Bu yüzden adaylar
     * hedefin yönünün TERSİyle süzülür. Hedefin yönü bilinmiyorsa (null) filtre
     * uygulanmaz (geriye-uyumlu).</p>
     */
    @Transactional(readOnly = true)
    public List<FundSourceCandidateDto> listSourceCandidates(UUID userId, UUID businessId,
                                                             UUID excludeTxId, int limit) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        int cap = limit <= 0 ? 50 : Math.min(limit, 200);

        // Hedefin yönüne göre ters-yön kaynakları süz (gider → giriş kaynakları).
        // Hedef yüklenemiyorsa/yön null ise filtre yok (güvenli geriye-uyum).
        TransactionDirection wantDirection = null;
        if (excludeTxId != null) {
            Transaction target = transactionRepository.findById(excludeTxId).orElse(null);
            if (target != null && target.getBusiness() != null
                    && businessId.equals(target.getBusiness().getId())
                    && target.getDirection() != null) {
                wantDirection = oppositeDirection(target.getDirection());
            }
        }

        List<Object[]> rows = fundLinkRepository.findSourceCandidatesWithAllocation(businessId);
        List<FundSourceCandidateDto> out = new java.util.ArrayList<>();
        for (Object[] row : rows) {
            Transaction tx = (Transaction) row[0];
            BigDecimal allocated = nz((BigDecimal) row[1]);
            if (excludeTxId != null && excludeTxId.equals(tx.getId())) continue;
            // Yön filtresi: hedefin tersi olmayan adayları ele.
            if (wantDirection != null && tx.getDirection() != wantDirection) continue;
            BigDecimal amount = nz(tx.getAmount());
            BigDecimal remaining = amount.subtract(allocated);
            if (remaining.signum() <= 0) continue; // tamamen tahsisli / tutarsız
            out.add(FundSourceCandidateDto.builder()
                    .transactionId(tx.getId())
                    .direction(tx.getDirection() != null ? tx.getDirection().name() : null)
                    .amount(amount)
                    .allocated(allocated)
                    .remaining(remaining)
                    .date(tx.getDate())
                    .description(tx.getDescription())
                    .counterpartName(counterpartName(tx))
                    .build());
            if (out.size() >= cap) break;
        }
        return out;
    }

    // ──────────────────────────── CREATE (bağla) ────────────────────────────

    /**
     * Hedef işlemi ({@code targetTxId}) bir kaynak işleme bağlar (tahsis).
     * Over-allocation guard + tenant scope + audit. <b>Bakiye/P&L DEĞİŞMEZ.</b>
     */
    @Transactional
    public FundLinkDto create(UUID userId, UUID businessId, UUID targetTxId,
                              CreateFundLinkRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);

        if (req.getSourceTransactionId() == null) {
            throw new IllegalArgumentException("source_transaction_id zorunlu");
        }
        if (req.getSourceTransactionId().equals(targetTxId)) {
            throw new IllegalArgumentException("Bir işlem kendisine bağlanamaz");
        }
        BigDecimal amount = req.getAmount();
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("amount > 0 olmalı");
        }

        Transaction source = loadTxScoped(businessId, req.getSourceTransactionId());
        Transaction target = loadTxScoped(businessId, targetTxId);

        // Idempotent / tekrar-bağ: aynı (source, target) çifti zaten varsa reddet.
        fundLinkRepository
                .findBySourceTransaction_IdAndTargetTransaction_Id(source.getId(), target.getId())
                .ifPresent(existing -> {
                    throw new IllegalStateException(
                            "Bu kaynak ile bu işlem arasında zaten bir bağ var "
                                    + "(önce mevcut bağı kopartın veya tutarı düzeltin)");
                });

        // Over-allocation guard: yeni tutar kaynağın KALANINDAN büyük olamaz.
        BigDecimal sourceAmount = nz(source.getAmount());
        BigDecimal allocated = nz(fundLinkRepository.sumAllocatedBySource(businessId, source.getId()));
        BigDecimal remaining = sourceAmount.subtract(allocated);
        if (amount.compareTo(remaining) > 0) {
            throw new IllegalStateException(
                    "Tahsis tutarı kaynağın kalanını aşıyor (kalan=" + remaining
                            + ", istenen=" + amount + ")");
        }

        // Over-explain guard (hedef tarafı): bir hedefe bağlanan toplam, hedefin
        // kendi tutarını aşamaz (1.5M'lik gider en fazla 1.5M kaynaktan beslenir).
        BigDecimal targetAmount = nz(target.getAmount());
        BigDecimal linkedToTarget = nz(fundLinkRepository.sumLinkedToTarget(businessId, target.getId()));
        BigDecimal targetRemaining = targetAmount.subtract(linkedToTarget);
        if (amount.compareTo(targetRemaining) > 0) {
            throw new IllegalStateException(
                    "Tahsis tutarı işlemin kendi tutarını aşıyor (işlem kalanı="
                            + targetRemaining + ", istenen=" + amount + ")");
        }

        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));
        User user = loadUser(userId);

        FundLink link = FundLink.builder()
                .business(business)
                .sourceTransaction(source)
                .targetTransaction(target)
                .amount(amount)
                .note(trimToNull(req.getNote()))
                .createdBy(user)
                .build();
        link = fundLinkRepository.save(link);

        BigDecimal newRemaining = remaining.subtract(amount);
        Map<String, Object> meta = new HashMap<>();
        meta.put("fundLinkId", link.getId().toString());
        meta.put("sourceTransactionId", source.getId().toString());
        meta.put("targetTransactionId", target.getId().toString());
        meta.put("amount", amount);
        meta.put("sourceRemainingAfter", newRemaining);
        meta.put("balanceImpact", "NONE");
        meta.put("pnlImpact", "NONE");
        audit(AuditAction.FUND_LINK_CREATE, userId, user, link.getId(),
                "Fon-bağı eklendi (para izi) — " + amount + " | kaynak=" + source.getId()
                        + " → hedef=" + target.getId() + " | kaynak kalan=" + newRemaining
                        + " (bakiye/P&L değişmedi)", meta);
        log.info("[fund-link] created id={} source={} target={} amount={} sourceRemaining={}",
                link.getId(), source.getId(), target.getId(), amount, newRemaining);
        return toDto(link);
    }

    // ──────────────────────────── DELETE (bağı kopar) ────────────────────────────

    /**
     * Fon-bağını kopartır. Yalnız metadata silinir — bakiye/P&L DEĞİŞMEZ.
     * Idempotent değil: olmayan bağ → 404 (UI zaten var olan satırdan çağırır).
     */
    @Transactional
    public void delete(UUID userId, UUID businessId, UUID txId, UUID linkId) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        FundLink link = fundLinkRepository.findById(linkId)
                .orElseThrow(() -> new IllegalArgumentException("Fon-bağı bulunamadı"));
        // Tenant scope.
        if (link.getBusiness() == null || !link.getBusiness().getId().equals(businessId)) {
            throw new IllegalArgumentException("Fon-bağı bulunamadı");
        }
        // İlişki bütünlüğü: linkId path'teki tx ile gerçekten ilişkili olmalı
        // (source ya da target). Aksi halde 404 (existence reveal açma).
        boolean related = (link.getSourceTransaction() != null
                && link.getSourceTransaction().getId().equals(txId))
                || (link.getTargetTransaction() != null
                && link.getTargetTransaction().getId().equals(txId));
        if (!related) {
            throw new IllegalArgumentException("Fon-bağı bu işleme ait değil");
        }

        UUID sourceId = link.getSourceTransaction() != null ? link.getSourceTransaction().getId() : null;
        UUID targetId = link.getTargetTransaction() != null ? link.getTargetTransaction().getId() : null;
        BigDecimal amount = link.getAmount();
        fundLinkRepository.delete(link);

        Map<String, Object> meta = new HashMap<>();
        meta.put("fundLinkId", linkId.toString());
        meta.put("sourceTransactionId", sourceId != null ? sourceId.toString() : null);
        meta.put("targetTransactionId", targetId != null ? targetId.toString() : null);
        meta.put("amount", amount);
        meta.put("balanceImpact", "NONE");
        meta.put("pnlImpact", "NONE");
        audit(AuditAction.FUND_LINK_DELETE, userId, loadUser(userId), linkId,
                "Fon-bağı kopartıldı (para izi) — " + amount + " | kaynak=" + sourceId
                        + " → hedef=" + targetId + " (bakiye/P&L değişmedi)", meta);
        log.info("[fund-link] deleted id={} source={} target={} amount={}",
                linkId, sourceId, targetId, amount);
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    private Transaction loadTxScoped(UUID businessId, UUID txId) {
        Transaction tx = transactionRepository.findById(txId)
                .orElseThrow(() -> new IllegalArgumentException("İşlem bulunamadı"));
        if (tx.getBusiness() == null || !tx.getBusiness().getId().equals(businessId)) {
            // Existence reveal açma: farklı tenant → bulunamadı.
            throw new IllegalArgumentException("İşlem bulunamadı");
        }
        return tx;
    }

    private User loadUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }

    private void audit(String action, UUID userId, User user, UUID resourceId,
                       String detail, Map<String, Object> meta) {
        auditLogService.recordEntityAction(action, userId,
                user != null ? user.getUsername() : "system",
                "FUND_LINK", resourceId, detail, meta);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    /**
     * Para-izi yön kuralı için ters-yön: GİDER ⇄ GİRİŞ. Hedef bir gider ise
     * kaynak bir giriş; hedef bir giriş ise (kullanım tarafı) kaynak bir çıkıştır.
     */
    private static TransactionDirection oppositeDirection(TransactionDirection d) {
        return d == TransactionDirection.EXPENSE
                ? TransactionDirection.INCOME
                : TransactionDirection.EXPENSE;
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private FundLinkDto toDto(FundLink fl) {
        Transaction s = fl.getSourceTransaction();
        Transaction t = fl.getTargetTransaction();
        return FundLinkDto.builder()
                .id(fl.getId())
                .amount(fl.getAmount())
                .note(fl.getNote())
                .createdAt(fl.getCreatedAt())
                .sourceTransactionId(s != null ? s.getId() : null)
                .sourceDirection(s != null && s.getDirection() != null ? s.getDirection().name() : null)
                .sourceAmount(s != null ? s.getAmount() : null)
                .sourceDate(s != null ? s.getDate() : null)
                .sourceDescription(s != null ? s.getDescription() : null)
                .sourceCounterpartName(counterpartName(s))
                .targetTransactionId(t != null ? t.getId() : null)
                .targetDirection(t != null && t.getDirection() != null ? t.getDirection().name() : null)
                .targetAmount(t != null ? t.getAmount() : null)
                .targetDate(t != null ? t.getDate() : null)
                .targetDescription(t != null ? t.getDescription() : null)
                .targetCounterpartName(counterpartName(t))
                .build();
    }

    private static String counterpartName(Transaction tx) {
        if (tx == null) return null;
        Counterpart cp = tx.getTargetCounterpart();
        return cp != null ? cp.getName() : null;
    }
}
