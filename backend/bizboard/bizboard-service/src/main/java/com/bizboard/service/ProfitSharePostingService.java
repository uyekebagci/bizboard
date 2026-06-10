package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.CategoryApplicability;
import com.bizboard.common.enums.JournalSourceType;
import com.bizboard.common.enums.PostingLegKind;
import com.bizboard.common.enums.ProfitShareRuleType;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.JournalEntryRepository;
import com.bizboard.repository.PostingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.11 / §6 / TODO 4) — operatör kâr-payını READ-ONLY
 * kâr-merkezi alt kasasına OTOMATİK postalayan servis ({@code source=auto}).
 *
 * <p>Bir {@link com.bizboard.common.entity.PosDeal} için {@link ProfitShareEngine}
 * pay bacaklarını üretir; bu servis onları dengeli {@link JournalEntry}+
 * {@link Posting} olarak yazar. Her pay bacağı için:</p>
 * <pre>
 *   Posting 1: operatör SUB_CASH (PROFIT_CENTER) hesabı  += pay   (LOCATION_MOVE)
 *   Posting 2: PNL_EXPENSE (account NULL, "Operatör Payı") = −pay  (gider ≠ masraf)
 * </pre>
 * <p>Σ = 0 (dengeli). Operatör payı = GİDER (§5: PNL_EXPENSE, masraf değil).</p>
 *
 * <h3>İdempotency + provisional→final (KARAR 2 azaltma):</h3>
 * <ul>
 *   <li>Tüm kâr posting'leri {@code source_type=PROFIT_SHARE} +
 *       {@code source_ref_id=deal.id} ile deal'e bağlı.</li>
 *   <li>Aynı-gün payları (RATE_SPREAD/MARGIN_PCT) = FINAL, deal create'te bir kez.</li>
 *   <li>OWNER_COMMISSION = önce PROVISIONAL (tahmini); settlement finalize'da
 *       eski PROVISIONAL entry SİLİNİR (reversible) + yeni FINAL entry yazılır.
 *       Böylece çift sayım/stale provisional olmaz.</li>
 * </ul>
 *
 * <p><b>READ-ONLY tanımı:</b> bu posting'ler sistem-üretimli ({@code created_by}
 * sistem). Kullanıcı operatör kasasına manuel hareket YAZAMAZ; bakiye yalnız
 * bu posting'ler + operatöre ödemelerden türetilir (§3.11).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProfitSharePostingService {

    /** Operatör payı gider kategorisi (PNL_EXPENSE bacağı). */
    public static final String CATEGORY_OPERATOR_SHARE = "Operatör Payı";
    /** Şirket residual kârı kategorisi (PNL_INCOME bacağı). */
    public static final String CATEGORY_POS_PROFIT = "POS Kâr (Şirket)";

    private final ProfitShareEngine engine;
    private final JournalEntryRepository journalEntryRepository;
    private final PostingRepository postingRepository;
    private final CategoryRepository categoryRepository;
    private final AuditLogService auditLogService;

    /**
     * Bir deal için kâr-payı posting'lerini (yeniden) yazar.
     *
     * <p>İdempotent + reversible: önce bu deal'in TÜM mevcut PROFIT_SHARE
     * entry'lerini siler (provisional dahil), sonra güncel paylarla yeniden
     * yazar. {@code avgCommission} null = PROVISIONAL faz (OWNER_COMMISSION
     * tahmini); dolu = FINAL faz (settlement sonrası).</p>
     *
     * @return yazılan toplam kâr-payı tutarı (operatör kasalarına düşen, +).
     */
    @Transactional
    public BigDecimal postSharesForDeal(PosDeal deal, BigDecimal avgCommission, UUID actorUserId) {
        // 1) Eski kâr posting'lerini temizle (reversible — provisional→final geçişi
        //    veya yeniden hesap). İdempotent: tekrar koşturmada aynı sonuç.
        reverseSharesForDeal(deal.getId());

        // 2) Güncel payları hesapla.
        List<ProfitShareEngine.ShareLeg> legs = engine.computeShares(deal, avgCommission);
        if (legs.isEmpty()) {
            return BigDecimal.ZERO;
        }

        BigDecimal totalOperatorShare = BigDecimal.ZERO;
        int posted = 0;
        for (ProfitShareEngine.ShareLeg leg : legs) {
            JournalEntry entry = buildEntry(deal, leg);
            if (entry == null) continue;
            journalEntryRepository.save(entry); // cascade postings
            posted++;
            if (leg.type() != ProfitShareRuleType.RESIDUAL) {
                totalOperatorShare = totalOperatorShare.add(leg.amount());
            }
        }

        Map<String, Object> meta = new HashMap<>();
        meta.put("dealId", deal.getId().toString());
        meta.put("phase", avgCommission != null ? "FINAL" : "PROVISIONAL");
        meta.put("legs", posted);
        meta.put("operatorShareTotal", totalOperatorShare);
        if (avgCommission != null) meta.put("avgCommission", avgCommission);
        auditLogService.recordEntityAction(
                AuditAction.PROFIT_SHARE_POSTED, actorUserId, "system",
                "POS_DEAL", deal.getId(),
                "Kâr-payı postalandı (" + (avgCommission != null ? "FINAL" : "PROVISIONAL")
                        + ") — " + posted + " bacak, operatör payı=" + totalOperatorShare,
                meta, AuditAction.HIGHLIGHT_PROFIT_SHARE);

        log.info("[profit-share] deal={} phase={} legs={} opShare={}",
                deal.getId(), avgCommission != null ? "FINAL" : "PROVISIONAL",
                posted, totalOperatorShare);
        return totalOperatorShare;
    }

    /**
     * Bir deal'in tüm PROFIT_SHARE entry'lerini siler (reversible). Deal reversal
     * + provisional→final geçişi + yeniden hesap için. İdempotent — yoksa no-op.
     *
     * @return silinen entry sayısı.
     */
    @Transactional
    public int reverseSharesForDeal(UUID dealId) {
        if (dealId == null) return 0;
        List<Posting> existing = postingRepository.findProfitShareByDealId(dealId);
        if (existing.isEmpty()) return 0;
        // Entry'leri tekilleştirip sil (cascade + orphanRemoval bacakları siler).
        Map<UUID, JournalEntry> entries = new HashMap<>();
        for (Posting p : existing) {
            JournalEntry e = p.getJournalEntry();
            if (e != null) entries.put(e.getId(), e);
        }
        for (JournalEntry e : entries.values()) {
            journalEntryRepository.delete(e);
        }
        return entries.size();
    }

    // ───────── entry inşası ─────────

    /**
     * Tek bir pay bacağı için dengeli JournalEntry üretir. RESIDUAL = şirket
     * P&L geliri (operatör kasası yok); diğerleri = operatör kasası += pay
     * (LOCATION_MOVE) + PNL_EXPENSE −pay.
     */
    private JournalEntry buildEntry(PosDeal deal, ProfitShareEngine.ShareLeg leg) {
        ProfitShareRule rule = leg.rule();
        BigDecimal amount = leg.amount();
        if (amount == null || amount.signum() == 0) return null;

        String phaseTag = leg.provisional() ? "[PROV] " : "";
        JournalEntry entry = JournalEntry.builder()
                .business(deal.getBusiness())
                .entryDate(deal.getDealDate())
                .sourceType(JournalSourceType.PROFIT_SHARE)
                .sourceRefId(deal.getId())
                .description(phaseTag + "Kâr-payı: " + leg.type()
                        + (rule.getOperatorCounterpart() != null
                        ? " — " + rule.getOperatorCounterpart().getName() : ""))
                .build();

        List<Posting> postings = new ArrayList<>();
        if (leg.type() == ProfitShareRuleType.RESIDUAL) {
            // Şirket residual = POS kâr geliri. Operatör kasası yok → P&L tanıma
            // bacağı + dengeleyici clearing (account NULL). residual<0 ise gider.
            Category incomeCat = resolveCategory(deal.getBusiness(), CATEGORY_POS_PROFIT,
                    CategoryApplicability.INCOME_ONLY);
            PostingLegKind kind = amount.signum() >= 0
                    ? PostingLegKind.PNL_INCOME : PostingLegKind.PNL_EXPENSE;
            // İşaret konvansiyonu: PNL_INCOME negatif amount (gelir tanıma), karşı
            // clearing pozitif. residual + → income leg −residual, clearing +residual.
            postings.add(Posting.builder()
                    .journalEntry(entry).account(null)
                    .amount(amount.negate()).legKind(kind).category(incomeCat).build());
            postings.add(Posting.builder()
                    .journalEntry(entry).account(null)
                    .amount(amount).legKind(PostingLegKind.LOCATION_MOVE).build());
        } else {
            BankAccount target = rule.getTargetSubCashAccount();
            if (target == null) {
                log.warn("[profit-share] kural {} ({}) hedef alt-kasa YOK — bacak atlandı.",
                        rule.getId(), leg.type());
                return null;
            }
            Category expenseCat = resolveCategory(deal.getBusiness(), CATEGORY_OPERATOR_SHARE,
                    CategoryApplicability.EXPENSE_ONLY);
            // Operatör kasasına pay GİRİŞİ (+); karşı PNL_EXPENSE (operatör payı = gider).
            postings.add(Posting.builder()
                    .journalEntry(entry).account(target)
                    .amount(amount).legKind(PostingLegKind.LOCATION_MOVE)
                    .counterpart(rule.getOperatorCounterpart()).build());
            postings.add(Posting.builder()
                    .journalEntry(entry).account(null)
                    .amount(amount.negate()).legKind(PostingLegKind.PNL_EXPENSE)
                    .category(expenseCat).build());
        }
        entry.setPostings(postings);

        // İnvariant: Σ posting.amount = 0.
        BigDecimal sum = postings.stream().map(Posting::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (sum.signum() != 0) {
            log.error("[profit-share] deal={} bacak DENGESİZ (Σ={}) — atlandı.",
                    deal.getId(), sum);
            return null;
        }
        return entry;
    }

    /**
     * Sistem kategori lookup-or-create (idempotent). PNL bacağı kategori taşır
     * (rapor kırılımı). Yoksa oluşturur (applicability tek-tarafa kilitli).
     */
    private Category resolveCategory(Business business, String name, CategoryApplicability applicability) {
        return categoryRepository
                .findFirstByBusinessIdAndNameIgnoreCaseAndActiveTrue(business.getId(), name)
                .orElseGet(() -> {
                    Category c = new Category();
                    c.setBusiness(business);
                    c.setName(name);
                    c.setApplicability(applicability);
                    c.setActive(true);
                    return categoryRepository.save(c);
                });
    }
}
