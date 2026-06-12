package com.bizboard.api.controller;

import com.bizboard.common.dto.OcrDtos;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.ocr.OcrService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * OCR Modülü (WP 1bdb8116) — belge tarama + review/confirm endpoint'leri.
 *
 * <ul>
 *   <li>{@code POST /ocr/scan?business_id=&document_type=}        — tek dosya tara</li>
 *   <li>{@code POST /ocr/scan/bulk?business_id=&document_type=}   — çoklu dosya tara</li>
 *   <li>{@code GET  /ocr/scans?business_id=&status=}              — tarama listesi</li>
 *   <li>{@code GET  /ocr/scans/{id}?business_id=}                 — tek tarama (review)</li>
 *   <li>{@code POST /ocr/scans/{id}/confirm?business_id=}         — onayla → tx/instrument</li>
 *   <li>{@code POST /ocr/scans/{id}/discard?business_id=}         — taramayı at</li>
 * </ul>
 *
 * <p>Mevcut create akışlarını (TransactionService / InstrumentService) reuse eder;
 * yeni finansal mantık YOK. Tenant-scope guard + audit service katmanında.</p>
 */
@RestController
@RequestMapping("/ocr")
@RequiredArgsConstructor
public class OcrController {

    private final OcrService ocrService;

    @PostMapping(value = "/scan", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> scan(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(value = "document_type", required = false) String documentType,
            @RequestParam("file") MultipartFile file) {
        if (!ocrService.isEnabled()) return disabled();
        try {
            OcrDtos.ScanDto dto = ocrService.scan(
                    principal.getId(), principal.getFullName(), principal.isAdmin(),
                    businessId, file, documentType);
            return ResponseEntity.status(HttpStatus.CREATED).body(dto);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping(value = "/scan/bulk", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> scanBulk(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(value = "document_type", required = false) String documentType,
            @RequestParam("files") List<MultipartFile> files) {
        if (!ocrService.isEnabled()) return disabled();
        try {
            OcrDtos.BulkScanResponse resp = ocrService.scanBulk(
                    principal.getId(), principal.getFullName(), principal.isAdmin(),
                    businessId, files, documentType);
            return ResponseEntity.status(HttpStatus.CREATED).body(resp);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @GetMapping("/scans")
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(required = false) String status) {
        try {
            return ResponseEntity.ok(ocrService.list(principal.getId(), businessId, status));
        } catch (IllegalArgumentException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @GetMapping("/scans/{id}")
    public ResponseEntity<?> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id) {
        try {
            return ResponseEntity.ok(ocrService.get(principal.getId(), businessId, id));
        } catch (IllegalArgumentException e) {
            return notFound(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/scans/{id}/confirm")
    public ResponseEntity<?> confirm(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id,
            @Valid @RequestBody OcrDtos.ConfirmRequest req) {
        try {
            return ResponseEntity.ok(ocrService.confirm(
                    principal.getId(), principal.getFullName(), businessId, id, req));
        } catch (IllegalArgumentException e) {
            return badRequest(e.getMessage());
        } catch (IllegalStateException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/scans/{id}/discard")
    public ResponseEntity<?> discard(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id) {
        try {
            return ResponseEntity.ok(ocrService.discard(
                    principal.getId(), principal.getFullName(), businessId, id));
        } catch (IllegalArgumentException e) {
            return notFound(e.getMessage());
        } catch (IllegalStateException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    // ── helpers ──

    private ResponseEntity<?> disabled() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("message", "OCR modülü devre dışı"));
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
    }

    private ResponseEntity<?> notFound(String msg) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", msg));
    }

    private ResponseEntity<?> badRequest(String msg) {
        return ResponseEntity.badRequest().body(Map.of("message", msg));
    }
}
