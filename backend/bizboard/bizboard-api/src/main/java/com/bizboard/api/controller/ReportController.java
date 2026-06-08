package com.bizboard.api.controller;

import com.bizboard.security.UserPrincipal;
import com.bizboard.service.report.ExcelExporter;
import com.bizboard.service.report.PdfExporter;
import com.bizboard.service.report.ReportService;
import com.bizboard.service.report.ReportTable;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.UUID;

/**
 * WP 4c75e95c: Finansal Raporlama MVP.
 *
 * <p>{@code GET /reports/{type}?format=json|pdf|xlsx&from=&to=&businessId=&months=&days=}</p>
 * <ul>
 *   <li>type: pl (R1 Gelir-Gider) · cashflow (R2) · aging (R3) · cash-reconciliation (R4)</li>
 *   <li>format=json → ekran DTO'su; pdf/xlsx → attachment binary stream</li>
 * </ul>
 *
 * <p>Multi-tenant: servisler {@code assertCanAccessBusiness}/{@code accessibleBusinessIds}
 * ile koruma uygular. Bu controller yeni kod — mevcut akışları değiştirmez.</p>
 */
@RestController
@RequestMapping("/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;
    private final PdfExporter pdfExporter;
    private final ExcelExporter excelExporter;

    // ── R1: Gelir-Gider (P&L) ──
    @GetMapping("/pl")
    public ResponseEntity<?> pl(
            @RequestParam(defaultValue = "json") String format,
            @RequestParam(defaultValue = "1") int months,
            @AuthenticationPrincipal UserPrincipal principal) {
        UUID uid = principal.getId();
        if (isBinary(format)) {
            return file(format, "gelir-gider", reportService.plTable(uid, months));
        }
        return ResponseEntity.ok(reportService.plJson(uid, months));
    }

    // ── R2: Nakit Akışı ──
    @GetMapping("/cashflow")
    public ResponseEntity<?> cashflow(
            @RequestParam(defaultValue = "json") String format,
            @RequestParam(defaultValue = "30") int days,
            @AuthenticationPrincipal UserPrincipal principal) {
        UUID uid = principal.getId();
        if (isBinary(format)) {
            return file(format, "nakit-akisi", reportService.cashFlowTable(uid, days));
        }
        return ResponseEntity.ok(reportService.cashFlowJson(uid, days));
    }

    // ── R3: Aging (Alacak/Verecek Yaşlandırma) ──
    @GetMapping("/aging")
    public ResponseEntity<?> aging(
            @RequestParam(defaultValue = "json") String format,
            @RequestParam(required = false) UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        UUID uid = principal.getId();
        if (isBinary(format)) {
            return file(format, "yaslandirma", reportService.agingTable(uid, businessId));
        }
        return ResponseEntity.ok(reportService.agingJson(uid, businessId));
    }

    // ── R4: Kasa Mutabakat (businessId zorunlu) ──
    @GetMapping("/cash-reconciliation")
    public ResponseEntity<?> cashReconciliation(
            @RequestParam(defaultValue = "json") String format,
            @RequestParam UUID businessId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @AuthenticationPrincipal UserPrincipal principal) {
        UUID uid = principal.getId();
        LocalDate f = parseDate(from);
        LocalDate t = parseDate(to);
        if (isBinary(format)) {
            return file(format, "kasa-mutabakat", reportService.cashReconciliationTable(uid, businessId, f, t));
        }
        return ResponseEntity.ok(reportService.cashReconciliationJson(uid, businessId, f, t));
    }

    // ── helpers ──

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
