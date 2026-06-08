package com.bizboard.service.report;

import com.bizboard.common.dto.AgingReportDto;
import com.bizboard.common.dto.CashClosingDto;
import com.bizboard.common.dto.FinanceOverviewDto;
import com.bizboard.common.entity.CashClosing;
import com.bizboard.repository.CashClosingRepository;
import com.bizboard.service.BusinessAccessGuard;
import com.bizboard.service.FinanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * WP 4c75e95c: Raporlama orkestratörü. Mevcut agregasyonları REUSE eder
 * (FinanceService, AgingReportService, CashClosing) ve {@link ReportTable}
 * üretip {@link PdfExporter}/{@link ExcelExporter}'a verir.
 *
 * <p>Raporlar: R1 Gelir-Gider (P&L), R2 Nakit Akışı, R3 Aging, R4 Kasa Mutabakat.</p>
 */
@Service
@RequiredArgsConstructor
public class ReportService {

    private final FinanceService financeService;
    private final AgingReportService agingReportService;
    private final CashClosingRepository cashClosingRepository;
    private final BusinessAccessGuard accessGuard;

    private static final DateTimeFormatter D = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    // ── JSON builders (ekran) — mevcut DTO'ları döner ──

    public FinanceOverviewDto plJson(UUID userId, int months) {
        return financeService.getFinanceOverview(userId, months);
    }

    public FinanceOverviewDto cashFlowJson(UUID userId, int days) {
        return financeService.getFinanceOverview(userId, 1, days);
    }

    public AgingReportDto agingJson(UUID userId, UUID businessId) {
        return agingReportService.build(userId, businessId);
    }

    @Transactional(readOnly = true)
    public CashReconciliation cashReconciliationJson(UUID userId, UUID businessId, LocalDate from, LocalDate to) {
        return buildReconciliation(userId, businessId, from, to);
    }

    // ── ReportTable builders (export) ──

    /** R1: Gelir-Gider (P&L). */
    public ReportTable plTable(UUID userId, int months) {
        FinanceOverviewDto f = financeService.getFinanceOverview(userId, months);
        FinanceOverviewDto.PeriodData p = f.getCurrentPeriod();
        ReportTable t = new ReportTable("Gelir-Gider Raporu", "Son " + months + " ay");

        ReportTable.Section sum = t.addSection("Özet", List.of("Kalem", "Tutar"));
        sum.addRow("Toplam Gelir", money(p.getIncome()));
        sum.addRow("İşlem Gideri", money(p.getExpense()));
        sum.addRow("Sabit Gider", money(p.getFixedCost()));
        sum.addRow("Toplam Gider", money(p.getTotalExpenseWithFixed()));
        sum.addBoldRow("Net Kâr", money(p.getNetProfitWithFixed()));

        if (f.getBusinessBreakdown() != null && !f.getBusinessBreakdown().isEmpty()) {
            ReportTable.Section biz = t.addSection("İşletme Bazlı",
                    List.of("İşletme", "Gelir", "Gider", "Net Kâr"));
            for (FinanceOverviewDto.BusinessFinance b : f.getBusinessBreakdown()) {
                biz.addRow(b.getBusinessName(), money(b.getIncome()), money(b.getExpense()), money(b.getNetProfit()));
            }
        }
        return t;
    }

    /** R2: Nakit Akışı (fiziksel kasa = NAKIT+POS, HESAPDAN/TRANSFER hariç — ClosingCalculator semantiği). */
    public ReportTable cashFlowTable(UUID userId, int days) {
        FinanceOverviewDto f = financeService.getFinanceOverview(userId, 1, days);
        ReportTable t = new ReportTable("Nakit Akışı Raporu", "Son " + days + " gün");
        ReportTable.Section s = t.addSection(
                "Günlük Nakit Akışı (NAKIT + POS · HESAPDAN/TRANSFER hariç)",
                List.of("Tarih", "Gelen", "Giden", "Net", "Kümülatif"));
        List<FinanceOverviewDto.DailyCashFlow> rows =
                f.getDailyCashFlow() != null ? f.getDailyCashFlow() : List.of();
        for (FinanceOverviewDto.DailyCashFlow d : rows) {
            s.addRow(d.getDate(), money(d.getIncome()), money(d.getExpense()),
                    money(d.getNet()), money(d.getCumulative()));
        }
        return t;
    }

    /** R3: Aging — Alacaklar + Verecekler bölümleri. */
    public ReportTable agingTable(UUID userId, UUID businessId) {
        AgingReportDto a = agingReportService.build(userId, businessId);
        ReportTable t = new ReportTable("Alacak/Verecek Yaşlandırma", "Referans: " + a.getAsOf());
        addAgingSection(t, "Alacaklar (Yaşlandırma)", a.getReceivables());
        addAgingSection(t, "Verecekler (Yaşlandırma)", a.getPayables());
        return t;
    }

    private void addAgingSection(ReportTable t, String heading, AgingReportDto.AgingSection sec) {
        ReportTable.Section s = t.addSection(heading,
                List.of("Cari", "0-30 gün", "30-60 gün", "60-90 gün", "90+ gün", "Vadesiz", "Toplam"));
        for (AgingReportDto.AgingRow r : sec.getRows()) {
            s.addRow(r.getCounterpartName(), money(r.getBucket0to30()), money(r.getBucket30to60()),
                    money(r.getBucket60to90()), money(r.getBucket90plus()), money(r.getNoDueDate()), money(r.getTotal()));
        }
        s.addBoldRow("TOPLAM", money(sec.getBucket0to30()), money(sec.getBucket30to60()),
                money(sec.getBucket60to90()), money(sec.getBucket90plus()), money(sec.getNoDueDate()), money(sec.getTotal()));
    }

    /** R4: Kasa Mutabakat. */
    public ReportTable cashReconciliationTable(UUID userId, UUID businessId, LocalDate from, LocalDate to) {
        CashReconciliation rec = buildReconciliation(userId, businessId, from, to);
        ReportTable t = new ReportTable("Kasa Mutabakat Raporu",
                D.format(rec.from()) + " – " + D.format(rec.to()));
        ReportTable.Section s = t.addSection(null,
                List.of("Tarih", "Açılış", "Hesaplanan", "Sayılan", "Fark", "Durum"));
        for (CashClosingDto c : rec.closings()) {
            s.addRow(c.getClosingDate() != null ? D.format(c.getClosingDate()) : "—",
                    money(c.getOpeningBalance()), money(c.getComputedClosing()),
                    c.getActualBalance() != null ? money(c.getActualBalance()) : "—",
                    c.getDifference() != null ? money(c.getDifference()) : "—",
                    statusLabel(c.getStatus()));
        }
        s.addBoldRow("TOPLAM FARK", "", "", "", money(rec.totalDifference()), rec.unclosedDays() + " gün açık");
        return t;
    }

    // ── reconciliation helper ──

    private CashReconciliation buildReconciliation(UUID userId, UUID businessId, LocalDate from, LocalDate to) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        LocalDate f = from != null ? from : LocalDate.now().minusDays(30);
        LocalDate tt = to != null ? to : LocalDate.now();
        List<CashClosing> list = cashClosingRepository
                .findByBusinessIdAndClosingDateBetweenOrderByClosingDateAsc(businessId, f, tt);

        BigDecimal totalDiff = BigDecimal.ZERO;
        int unclosed = 0;
        List<CashClosingDto> dtos = new ArrayList<>();
        for (CashClosing c : list) {
            if (c.getDifference() != null) totalDiff = totalDiff.add(c.getDifference());
            if (c.getActualBalance() == null) unclosed++;
            dtos.add(CashClosingDto.builder()
                    .closingDate(c.getClosingDate())
                    .openingBalance(c.getOpeningBalance())
                    .computedClosing(c.getComputedClosing())
                    .actualBalance(c.getActualBalance())
                    .difference(c.getDifference())
                    .status(c.getActualBalance() != null ? "CLOSED" : "OPEN")
                    .build());
        }
        return new CashReconciliation(f, tt, dtos, totalDiff, unclosed);
    }

    /** R4 json payload. */
    public record CashReconciliation(LocalDate from, LocalDate to, List<CashClosingDto> closings,
                                     BigDecimal totalDifference, int unclosedDays) {}

    // ── formatters ──

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

    private static String statusLabel(String s) {
        if (s == null) return "—";
        return switch (s) {
            case "CLOSED" -> "Kapandı";
            case "OPEN" -> "Açık";
            default -> s;
        };
    }
}
