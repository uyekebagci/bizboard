package com.bizboard.service.report;

import com.bizboard.common.dto.MonthlyProfitReportDto;
import com.bizboard.common.dto.OperatorStatementDto;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.DayClose;
import com.bizboard.common.entity.PosDeal;
import com.bizboard.common.entity.Posting;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.DayCloseRepository;
import com.bizboard.repository.PosDealRepository;
import com.bizboard.repository.PostingRepository;
import com.bizboard.service.BusinessAccessGuard;
import com.bizboard.service.LedgerBalanceService;
import com.bizboard.service.MonthlyProfitReportService;
import com.bizboard.service.OperatorStatementService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §9 / TODO 3) — PATRON için Excel-vari rapor seti
 * (posting-tabanlı). Mevcut {@link ReportTable}/{@link ExcelExporter}/
 * {@link PdfExporter} altyapısını REUSE eder; veri kaynakları Ledger v2:
 *
 * <ul>
 *   <li><b>treasury</b> (Hazine durumu) — tüm hesap bakiyeleri, firma-bazlı (§7).</li>
 *   <li><b>daybook</b> (Günlük hareket defteri) — dönem konum hareketleri.</li>
 *   <li><b>category-pl</b> (Kategori P&L dönem-kıyas) — Faz C MonthlyProfit (a) ekseni.</li>
 *   <li><b>pos-reconciliation</b> (POS mutabakat) — PosDeal + settlement.</li>
 *   <li><b>variance</b> (KAÇAK/fark raporu) — Faz B DayClose SAĞLAMA HESAP.</li>
 *   <li><b>operator-profit</b> (Operatör kâr) — Faz C operatör statement (b) ekseni.</li>
 * </ul>
 *
 * <p>İKİ AYRI eksen (§3.10): kategori-bazlı P&L (NE tür) ⊥ operatör-bazlı kâr
 * (KİM/hangi cep) — ayrı raporlar, asla karıştırılmaz.</p>
 *
 * <p>Multi-tenant: tüm metodlar {@code businessId} ile guard'lı.</p>
 */
@Service
@RequiredArgsConstructor
public class LedgerReportService {

    private static final DateTimeFormatter D = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final BankAccountRepository bankAccountRepository;
    private final PostingRepository postingRepository;
    private final DayCloseRepository dayCloseRepository;
    private final PosDealRepository posDealRepository;
    private final LedgerBalanceService balanceService;
    private final MonthlyProfitReportService monthlyProfitReportService;
    private final OperatorStatementService operatorStatementService;
    private final BusinessAccessGuard accessGuard;

    // ── (a) HAZİNE DURUMU — tüm hesap bakiyeleri, firma-bazlı ──

    @Transactional(readOnly = true)
    public ReportTable treasuryTable(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        ReportTable t = new ReportTable("Hazine Durumu (Param Nerede?)", "Anlık · " + D.format(LocalDate.now()));
        ReportTable.Section s = t.addSection(null,
                List.of("Hesap", "Tip", "Firma", "Bakiye"));

        List<BankAccount> accounts = bankAccountRepository
                .findByBusinessIdInOrderByActiveDescNameAsc(List.of(businessId));
        BigDecimal grand = BigDecimal.ZERO;
        for (BankAccount a : accounts) {
            if (!a.isActive()) continue;
            // Bakiye: posting-türetilebilir hesaplarda Σ posting; aggregate'lerde snapshot.
            BigDecimal bal = a.getType() != null && a.getType().isPostingDerivable()
                    ? balanceService.derivedBalance(a.getId())
                    : (a.getCurrentBalance() != null ? a.getCurrentBalance() : BigDecimal.ZERO);
            // Hazine = gerçek para konumları (cari/ayni hariç tutulur — ayrı eksen).
            boolean isCari = a.getType() == BankAccountType.RECEIVABLE
                    || a.getType() == BankAccountType.PAYABLE;
            if (isCari) continue;
            String firma = a.getOwnerMyCompany() != null ? a.getOwnerMyCompany().getLegalName() : "—";
            s.addRow(a.getName(), typeLabel(a.getType()), firma, money(bal));
            if (a.getType() != BankAccountType.ASSET) {
                grand = grand.add(bal); // ASSET ayni; nakit hazineye katma
            }
        }
        s.addBoldRow("TOPLAM NAKİT/BANKA HAZİNE", "", "", money(grand));
        return t;
    }

    // ── (b) GÜNLÜK HAREKET DEFTERİ — dönem konum hareketleri ──

    @Transactional(readOnly = true)
    public ReportTable daybookTable(UUID userId, UUID businessId, LocalDate from, LocalDate to) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        LocalDate f = from != null ? from : LocalDate.now().minusDays(30);
        LocalDate tt = to != null ? to : LocalDate.now();
        ReportTable t = new ReportTable("Günlük Hareket Defteri",
                D.format(f) + " – " + D.format(tt));
        ReportTable.Section s = t.addSection(null,
                List.of("Tarih", "Hesap", "Kategori", "Açıklama", "Giriş", "Çıkış"));

        List<Posting> legs = postingRepository.findAccountLegsForPeriod(businessId, f, tt);
        BigDecimal totalIn = BigDecimal.ZERO;
        BigDecimal totalOut = BigDecimal.ZERO;
        for (Posting p : legs) {
            BigDecimal amt = p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO;
            String in = amt.signum() > 0 ? money(amt) : "";
            String out = amt.signum() < 0 ? money(amt.abs()) : "";
            if (amt.signum() > 0) totalIn = totalIn.add(amt);
            if (amt.signum() < 0) totalOut = totalOut.add(amt.abs());
            s.addRow(
                    p.getJournalEntry() != null && p.getJournalEntry().getEntryDate() != null
                            ? D.format(p.getJournalEntry().getEntryDate()) : "—",
                    p.getAccount() != null ? p.getAccount().getName() : "—",
                    p.getCategory() != null ? p.getCategory().getName() : "—",
                    p.getJournalEntry() != null && p.getJournalEntry().getDescription() != null
                            ? p.getJournalEntry().getDescription() : "",
                    in, out);
        }
        s.addBoldRow("TOPLAM", "", "", "", money(totalIn), money(totalOut));
        return t;
    }

    // ── (c) KATEGORİ P&L DÖNEM-KIYAS (NE tür) ──

    @Transactional(readOnly = true)
    public ReportTable categoryPlTable(UUID userId, UUID businessId, int year, int month) {
        MonthlyProfitReportDto cur = monthlyProfitReportService.report(userId, businessId, year, month);
        YearMonth ym = YearMonth.of(year, month);
        YearMonth prevYm = ym.minusMonths(1);
        MonthlyProfitReportDto prev = monthlyProfitReportService.report(
                userId, businessId, prevYm.getYear(), prevYm.getMonthValue());

        ReportTable t = new ReportTable("Kategori P&L — Dönem Kıyas",
                trMonth(ym) + " vs " + trMonth(prevYm));

        // Özet
        ReportTable.Section sum = t.addSection("Özet (NE tür gelir/gider)",
                List.of("Kalem", trMonth(ym), trMonth(prevYm), "Değişim"));
        sum.addRow("Toplam Gelir", money(cur.getTotalIncome()), money(prev.getTotalIncome()),
                money(cur.getTotalIncome().subtract(prev.getTotalIncome())));
        sum.addRow("Gider (operasyonel)", money(cur.getTotalExpense()), money(prev.getTotalExpense()),
                money(cur.getTotalExpense().subtract(prev.getTotalExpense())));
        sum.addRow("Masraf (komisyon/ücret)", money(cur.getTotalCost()), money(prev.getTotalCost()),
                money(cur.getTotalCost().subtract(prev.getTotalCost())));
        sum.addBoldRow("NET KÂR", money(cur.getNetProfit()), money(prev.getNetProfit()),
                money(cur.getNetProfit().subtract(prev.getNetProfit())));

        // Gelir kategorileri
        ReportTable.Section inc = t.addSection("Gelir Kategorileri", List.of("Kategori", "Tutar"));
        for (MonthlyProfitReportDto.CategoryLine c : safe(cur.getIncomeByCategory())) {
            inc.addRow(c.getCategoryName(), money(c.getAmount()));
        }
        // Gider + Masraf
        ReportTable.Section exp = t.addSection("Gider Kategorileri", List.of("Kategori", "Tutar"));
        for (MonthlyProfitReportDto.CategoryLine c : safe(cur.getExpenseByCategory())) {
            exp.addRow(c.getCategoryName(), money(c.getAmount()));
        }
        for (MonthlyProfitReportDto.CategoryLine c : safe(cur.getCostByCategory())) {
            exp.addRow(c.getCategoryName() + " (masraf)", money(c.getAmount()));
        }
        return t;
    }

    // ── (d) POS MUTABAKAT ──

    @Transactional(readOnly = true)
    public ReportTable posReconciliationTable(UUID userId, UUID businessId, LocalDate from, LocalDate to) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        LocalDate f = from != null ? from : LocalDate.now().minusDays(30);
        LocalDate tt = to != null ? to : LocalDate.now();
        ReportTable t = new ReportTable("POS Mutabakat", D.format(f) + " – " + D.format(tt));
        ReportTable.Section s = t.addSection(null,
                List.of("Tarih", "Cihaz", "Brüt", "Müşteri %", "Yatış Hesabı", "Durum"));

        List<PosDeal> deals = posDealRepository
                .findByBusinessIdAndDealDateBetweenOrderByDealDateAscCreatedAtAsc(businessId, f, tt);
        BigDecimal totalGross = BigDecimal.ZERO;
        for (PosDeal d : deals) {
            BigDecimal gross = d.getGrossAmount() != null ? d.getGrossAmount() : BigDecimal.ZERO;
            totalGross = totalGross.add(gross);
            s.addRow(
                    d.getDealDate() != null ? D.format(d.getDealDate()) : "—",
                    d.getPosDevice() != null ? d.getPosDevice().getName() : "—",
                    money(gross),
                    d.getCustomerRate() != null ? "%" + d.getCustomerRate().toPlainString() : "—",
                    d.getOwnerAccount() != null ? d.getOwnerAccount().getName() : "—",
                    d.getStatus() != null ? d.getStatus().name() : "—");
        }
        s.addBoldRow("TOPLAM BRÜT", "", money(totalGross), "", "", deals.size() + " işlem");
        return t;
    }

    // ── (e) KAÇAK / VARIANCE RAPORU (Faz B DayClose) ──

    @Transactional(readOnly = true)
    public ReportTable varianceTable(UUID userId, UUID businessId, LocalDate from, LocalDate to) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        LocalDate f = from != null ? from : LocalDate.now().minusDays(30);
        LocalDate tt = to != null ? to : LocalDate.now();
        ReportTable t = new ReportTable("KAÇAK / Fark Raporu (SAĞLAMA HESAP)",
                D.format(f) + " – " + D.format(tt));
        ReportTable.Section s = t.addSection(null,
                List.of("Tarih", "Önceki Kasa", "Olması Gereken", "Son Kasa (Sayım)", "Kaçak (Fark)", "Alarm"));

        List<DayClose> closes = dayCloseRepository
                .findByBusinessIdAndCloseDateBetweenOrderByCloseDateAsc(businessId, f, tt);
        BigDecimal totalVariance = BigDecimal.ZERO;
        int alarms = 0;
        for (DayClose dc : closes) {
            BigDecimal v = dc.getVariance();
            if (v != null) totalVariance = totalVariance.add(v);
            if (dc.isAlarmFired()) alarms++;
            s.addRow(
                    dc.getCloseDate() != null ? D.format(dc.getCloseDate()) : "—",
                    money(dc.getOpeningBalance()),
                    money(dc.getComputedClosing()),
                    dc.getActualTotal() != null ? money(dc.getActualTotal()) : "— (sayım yok)",
                    v != null ? money(v) : "—",
                    dc.isAlarmFired() ? "⚠ EŞİK AŞILDI" : (dc.getActualTotal() != null ? "OK" : "—"));
        }
        s.addBoldRow("TOPLAM KAÇAK", "", "", "", money(totalVariance), alarms + " alarm");
        return t;
    }

    // ── (f) OPERATÖR KÂR (KİM/hangi cep — Faz C) ──

    @Transactional(readOnly = true)
    public ReportTable operatorProfitTable(UUID userId, UUID businessId) {
        ReportTable t = new ReportTable("Operatör Kâr (KİM / Hangi Cep)",
                "Anlık · " + D.format(LocalDate.now()));
        ReportTable.Section s = t.addSection(null,
                List.of("Operatör Kasası", "Operatör", "Biriken Kâr", "Ödenen", "Bakiye", "Bekleyen (Prov.)"));

        List<OperatorStatementDto> operators = operatorStatementService.listOperators(userId, businessId);
        BigDecimal totalBalance = BigDecimal.ZERO;
        for (OperatorStatementDto op : operators) {
            if (op.getBalance() != null) totalBalance = totalBalance.add(op.getBalance());
            s.addRow(
                    op.getAccountName(),
                    op.getOperatorName() != null ? op.getOperatorName() : "—",
                    money(op.getTotalEarned()),
                    money(op.getTotalPaidOut()),
                    money(op.getBalance()),
                    op.getProvisionalPending() != null ? money(op.getProvisionalPending()) : "—");
        }
        s.addBoldRow("TOPLAM OPERATÖR BAKİYE", "", "", "", money(totalBalance), "");
        return t;
    }

    // ── helpers ──

    private static String typeLabel(BankAccountType type) {
        if (type == null) return "—";
        return switch (type) {
            case CHECKING -> "Vadesiz";
            case SAVINGS -> "Vadeli";
            case MAIN_CASH -> "Ana Kasa";
            case SUB_CASH -> "Alt Kasa";
            case CASH_HOLDER -> "Eldeki Nakit";
            case POS_SETTLEMENT -> "POS Havuzu";
            case RECEIVABLE -> "Alacak";
            case PAYABLE -> "Borç";
            case ASSET -> "Ayni Varlık";
        };
    }

    private static <T> List<T> safe(List<T> list) {
        return list != null ? list : List.of();
    }

    private static String trMonth(YearMonth ym) {
        String[] months = {"Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"};
        return months[ym.getMonthValue() - 1] + " " + ym.getYear();
    }

    private static final NumberFormat TRY_FMT;
    static {
        TRY_FMT = NumberFormat.getNumberInstance(new Locale("tr", "TR"));
        TRY_FMT.setMinimumFractionDigits(2);
        TRY_FMT.setMaximumFractionDigits(2);
    }

    private static String money(BigDecimal v) {
        if (v == null) return "₺0,00";
        return "₺" + TRY_FMT.format(v);
    }
}
