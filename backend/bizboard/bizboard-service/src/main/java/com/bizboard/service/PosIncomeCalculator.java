package com.bizboard.service;

import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;

import java.math.BigDecimal;

/**
 * TEK kaynak (single source of truth): bir işlemin gelir/gider hesaplarına
 * KATKISI. Konsolide net, dönem özeti, finans özeti ve ledger arşivi AYNI
 * formülü kullanmalı ki gösterilen sayılar her yerde TUTARLI olsun.
 *
 * <h2>Neden bu sınıf var (bug a1d58d6e / a90a8d42)</h2>
 * <p>Geçmişte aynı POS geliri için İKİ çelişen formül vardı:</p>
 * <ul>
 *   <li>{@code ConsolidatedDashboardService.incomeContribution} → POS = TAM tutar
 *       (Beta v1.1, commit 888edc6 — "kaç liralık POS işlem yaptıysam o kadar
 *       gözüksün gelir olarak").</li>
 *   <li>{@code SummaryService.effectiveAmount} → POS = KÂR (our − bank), null-rate → 0
 *       (eski v1.7.x POS Komisyon WP, commit 97274ea — Beta v1.1 ile terk edildi
 *       ama bu metod güncellenmeden kaldı).</li>
 * </ul>
 * <p>İki formül farklı sonuç verdiği için consolidated net ile summary net
 * tutarsızdı (örn. 150.000 TL POS geliri konsolidede 150.000, özette ~2.565
 * görünüyordu). Bu yardımcı, terk edilmiş kâr modelini kaldırıp TÜM hesaplama
 * noktalarını Beta v1.1'in BENİMSENMİŞ tam-tutar modeline bağlar.</p>
 *
 * <h2>Benimsenen model (Beta v1.1 — canonical)</h2>
 * <ul>
 *   <li>TRANSFER / LOAN → 0 (gelir-gider değil; bilanço/transfer hareketi).</li>
 *   <li>POS dahil tüm GELİR → tam {@code amount} (banka komisyonu DÜŞÜLMEZ;
 *       eski {@code applied_*_rate} snapshot'ları YOK SAYILIR).</li>
 *   <li>GİDER → tam {@code amount}.</li>
 * </ul>
 * <p>Bu, kardeş yardımcılarla zaten tutarlıdır: {@code SubCashService.incomeValue}
 * ve {@code SubCashInclusionService.incomeValueForTx} de tam-tutar kullanır.</p>
 *
 * <p>Salt-hesaplama: hiçbir veri yazmaz, hiçbir yan etki üretmez.</p>
 */
public final class PosIncomeCalculator {

    private PosIncomeCalculator() {
    }

    /**
     * İşlemin net'e KATKISI (işaretli): GELİR → {@code +amount},
     * GİDER → {@code -amount}, TRANSFER/LOAN → 0. POS = tam tutar.
     *
     * <p>Konsolide net hesabı için kullanılır
     * ({@code SUM(incomeContribution) + opening_balance}).</p>
     */
    public static BigDecimal incomeContribution(Transaction t) {
        if (t == null || t.getAmount() == null) {
            return BigDecimal.ZERO;
        }
        if (t.getKind() == TransactionKind.TRANSFER
                || t.getKind() == TransactionKind.LOAN) {
            return BigDecimal.ZERO;
        }
        if (t.getDirection() == TransactionDirection.INCOME) {
            return t.getAmount();
        }
        if (t.getDirection() == TransactionDirection.EXPENSE) {
            return t.getAmount().negate();
        }
        return BigDecimal.ZERO;
    }

    /**
     * İşlemin yöne göre toplanan BÜYÜKLÜĞÜ (işaretsiz): POS dahil tüm income/
     * expense için tam {@code amount}; TRANSFER/LOAN → 0.
     *
     * <p>{@code sumByDirection(txs, dir)} desenini kullanan tüketiciler için
     * (önce direction'a göre filtrelenir, sonra bu değerler toplanır):
     * {@code SummaryService}, {@code FinanceService}, {@code LedgerService}.</p>
     *
     * <p>Eskiden POS için kâr (our − bank) döndürürdü; Beta v1.1 ile tam tutara
     * hizalandı — böylece özet net = konsolide net.</p>
     */
    public static BigDecimal effectiveAmount(Transaction t) {
        if (t == null || t.getAmount() == null) {
            return BigDecimal.ZERO;
        }
        if (t.getKind() == TransactionKind.TRANSFER
                || t.getKind() == TransactionKind.LOAN) {
            return BigDecimal.ZERO;
        }
        return t.getAmount();
    }
}
