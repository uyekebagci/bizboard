package com.bizboard.api.controller;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.report.ExcelExporter;
import com.bizboard.service.report.LedgerReportService;
import com.bizboard.service.report.PdfExporter;
import com.bizboard.service.report.ReportTable;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §9 / TODO 3) — PATRON Excel-vari rapor indirme uçları.
 *
 * <p>{@code GET /ledger-reports/{type}?format=json|pdf|xlsx&business_id=&from=&to=&year=&month=}</p>
 * <ul>
 *   <li>treasury — Hazine durumu (anlık)</li>
 *   <li>daybook — Günlük hareket defteri (from/to)</li>
 *   <li>category-pl — Kategori P&L dönem-kıyas (year/month)</li>
 *   <li>pos-reconciliation — POS mutabakat (from/to)</li>
 *   <li>variance — KAÇAK/fark raporu (from/to)</li>
 *   <li>operator-profit — Operatör kâr (anlık)</li>
 * </ul>
 *
 * <p>İKİ AYRI eksen (§3.10): category-pl (NE tür) ⊥ operator-profit (KİM).</p>
 * <p>Mevcut {@code /reports} (Faz-eski) DEĞİŞMEZ — bu posting-tabanlı ledger-v2 seti.</p>
 */
@RestController
@RequestMapping("/ledger-reports")
@RequiredArgsConstructor
public class LedgerReportController {

    private final LedgerReportService reportService;
    private final PdfExporter pdfExporter;
    private final ExcelExporter excelExporter;
    private final AuditLogService auditLogService;

    @GetMapping("/treasury")
    public ResponseEntity<?> treasury(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(defaultValue = "json") String format) {
        return serve(principal, businessId, format, "hazine-durumu", "treasury",
                () -> reportService.treasuryTable(principal.getId(), businessId));
    }

    @GetMapping("/daybook")
    public ResponseEntity<?> daybook(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(defaultValue = "json") String format,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate f = parseDate(from), t = parseDate(to);
        return serve(principal, businessId, format, "hareket-defteri", "daybook",
                () -> reportService.daybookTable(principal.getId(), businessId, f, t));
    }

    @GetMapping("/category-pl")
    public ResponseEntity<?> categoryPl(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(defaultValue = "json") String format,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        YearMonth ym = (year != null && month != null) ? YearMonth.of(year, month) : YearMonth.now();
        return serve(principal, businessId, format, "kategori-pl", "category-pl",
                () -> reportService.categoryPlTable(principal.getId(), businessId,
                        ym.getYear(), ym.getMonthValue()));
    }

    @GetMapping("/pos-reconciliation")
    public ResponseEntity<?> posReconciliation(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(defaultValue = "json") String format,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate f = parseDate(from), t = parseDate(to);
        return serve(principal, businessId, format, "pos-mutabakat", "pos-reconciliation",
                () -> reportService.posReconciliationTable(principal.getId(), businessId, f, t));
    }

    @GetMapping("/variance")
    public ResponseEntity<?> variance(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(defaultValue = "json") String format,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate f = parseDate(from), t = parseDate(to);
        return serve(principal, businessId, format, "kacak-raporu", "variance",
                () -> reportService.varianceTable(principal.getId(), businessId, f, t));
    }

    @GetMapping("/operator-profit")
    public ResponseEntity<?> operatorProfit(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(defaultValue = "json") String format) {
        return serve(principal, businessId, format, "operator-kar", "operator-profit",
                () -> reportService.operatorProfitTable(principal.getId(), businessId));
    }

    // ── helpers ──

    private ResponseEntity<?> serve(UserPrincipal principal, UUID businessId, String format,
                                    String baseName, String reportType,
                                    java.util.function.Supplier<ReportTable> builder) {
        try {
            ReportTable table = builder.get();
            if (isBinary(format)) {
                auditExport(principal, businessId, reportType, format);
                return file(format, baseName, table);
            }
            return ResponseEntity.ok(table); // json — ekran önizleme (sections/rows)
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(Map.of("message", "Yetki yok"));
        }
    }

    private void auditExport(UserPrincipal principal, UUID businessId, String reportType, String format) {
        auditLogService.recordEntityAction(
                AuditAction.REPORT_EXPORTED, principal.getId(), principal.getUsername(),
                "LEDGER_REPORT", businessId,
                "Rapor indirildi: " + reportType + " (" + format + ")",
                Map.of("reportType", reportType, "format", format,
                        "businessId", businessId.toString()));
    }

    private boolean isBinary(String format) {
        return "pdf".equalsIgnoreCase(format) || "xlsx".equalsIgnoreCase(format);
    }

    private ResponseEntity<byte[]> file(String format, String baseName, ReportTable table) {
        boolean pdf = "pdf".equalsIgnoreCase(format);
        byte[] body = pdf ? pdfExporter.export(table) : excelExporter.export(table);
        String ext = pdf ? "pdf" : "xlsx";
        MediaType mt = pdf ? MediaType.APPLICATION_PDF
                : MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        String filename = baseName + "-" + LocalDate.now() + "." + ext;
        return ResponseEntity.ok()
                .contentType(mt)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(body);
    }

    private static LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
