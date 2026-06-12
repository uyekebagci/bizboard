package com.bizboard.api.controller;

import com.bizboard.common.dto.CancelInvoiceRequest;
import com.bizboard.common.dto.CreateInvoiceRequest;
import com.bizboard.common.dto.InvoiceDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.efatura.InvoiceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/**
 * e-Fatura modülü REST uçları (Çatı v1.1).
 *
 * <p>{@code /invoices/**} authenticated kullanıcılar için açık; tenant-scope ve
 * yetkilendirme servis katmanında {@code BusinessAccessGuard} ile zorlanır.
 * Hata haritalama merkezi {@code GlobalExceptionHandler}'a bırakılır
 * (IllegalArgument→400, IllegalState→409, ResourceNotAccessible→404,
 * SecurityException→403).</p>
 */
@RestController
@RequestMapping("/invoices")
@RequiredArgsConstructor
public class InvoiceController {

    private final InvoiceService service;

    @GetMapping
    public ResponseEntity<List<InvoiceDto>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) UUID businessId,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(service.list(businessId, status, principal.getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<InvoiceDto> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        return ResponseEntity.ok(service.get(id, principal.getId()));
    }

    @PostMapping
    public ResponseEntity<InvoiceDto> create(
            @Valid @RequestBody CreateInvoiceRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(request, principal.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<InvoiceDto> update(
            @PathVariable UUID id,
            @Valid @RequestBody CreateInvoiceRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.update(id, request, principal.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        service.delete(id, principal.getId());
        return ResponseEntity.noContent().build();
    }

    /** UBL-TR XML üret (+ varsa mali mühür imzala). */
    @PostMapping("/{id}/generate-xml")
    public ResponseEntity<InvoiceDto> generateXml(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.generateXml(id, principal.getId()));
    }

    /** Üretilmiş UBL-TR XML'i indir (application/xml). */
    @GetMapping(value = "/{id}/xml", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<byte[]> downloadXml(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        String xml = service.getXml(id, principal.getId());
        byte[] body = xml.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"efatura-" + id + ".xml\"")
                .contentType(MediaType.APPLICATION_XML)
                .body(body);
    }

    /** Faturayı entegratöre gönder (yoksa "yapılandırılmadı" döner). */
    @PostMapping("/{id}/send")
    public ResponseEntity<InvoiceDto> send(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.send(id, principal.getId()));
    }

    /** Entegratörden durum sorgula. */
    @PostMapping("/{id}/query-status")
    public ResponseEntity<InvoiceDto> queryStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.queryStatus(id, principal.getId()));
    }

    /** Faturayı iptal et. */
    @PostMapping("/{id}/cancel")
    public ResponseEntity<InvoiceDto> cancel(
            @PathVariable UUID id,
            @RequestBody(required = false) CancelInvoiceRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        String reason = request != null ? request.getReason() : null;
        return ResponseEntity.ok(service.cancel(id, reason, principal.getId()));
    }
}
