package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateFundLinkRequest;
import com.bizboard.common.dto.FundLinkDto;
import com.bizboard.common.dto.FundSourceCandidateDto;
import com.bizboard.common.dto.FundTrailDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.FundLinkService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * "Para İzi" (fund-trail) — işlem↔işlem fon-bağlama + tahsis + çift-yönlü görünüm.
 *
 * <p>Path-scoped (architecture-rules §1.3.A): tüm uçlar
 * {@code /businesses/{businessId}/transactions/{txId}/...} altında. Giriş
 * satırında servis {@code accessGuard.assertCan*Business} ile tenant scope.</p>
 *
 * <ul>
 *   <li>{@code GET    .../fund-trail}                 — çift-yönlü görünüm (sources+usages+kalan)</li>
 *   <li>{@code GET    .../fund-sources?limit=}        — bağlanabilir kaynak adayları (kalan&gt;0)</li>
 *   <li>{@code POST   .../fund-links}                 — fon-bağı oluştur (tahsis)</li>
 *   <li>{@code DELETE .../fund-links/{linkId}}        — fon-bağını kopar</li>
 * </ul>
 *
 * <p><b>STRICT:</b> bakiye/P&L/posting'e dokunmaz — saf izlenebilirlik (metadata).</p>
 */
@RestController
@RequestMapping("/businesses/{businessId}/transactions/{txId}")
@RequiredArgsConstructor
public class FundLinkController {

    private final FundLinkService service;

    /** Çift-yönlü görünüm: bu para nereden geldi (sources) + nereye gitti (usages) + kalan. */
    @GetMapping("/fund-trail")
    public ResponseEntity<?> trail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID businessId,
            @PathVariable UUID txId) {
        try {
            FundTrailDto dto = service.getTrail(principal.getId(), businessId, txId);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException e) {
            return notFound(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    /** Bağlanabilir KAYNAK adayları (kalanı &gt; 0; bu tx hariç). */
    @GetMapping("/fund-sources")
    public ResponseEntity<?> sources(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID businessId,
            @PathVariable UUID txId,
            @RequestParam(defaultValue = "50") int limit) {
        try {
            List<FundSourceCandidateDto> rows =
                    service.listSourceCandidates(principal.getId(), businessId, txId, limit);
            return ResponseEntity.ok(rows);
        } catch (IllegalArgumentException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    /** Fon-bağı oluştur: bu (hedef) işlemi bir kaynak işleme bağla (tahsis). */
    @PostMapping("/fund-links")
    public ResponseEntity<?> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID businessId,
            @PathVariable UUID txId,
            @Valid @RequestBody CreateFundLinkRequest req) {
        try {
            FundLinkDto dto = service.create(principal.getId(), businessId, txId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(dto);
        } catch (IllegalArgumentException e) {
            return notFound(e.getMessage());
        } catch (IllegalStateException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    /** Fon-bağını kopar (unlink) — bakiye/P&L değişmez. */
    @DeleteMapping("/fund-links/{linkId}")
    public ResponseEntity<?> delete(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID businessId,
            @PathVariable UUID txId,
            @PathVariable UUID linkId) {
        try {
            service.delete(principal.getId(), businessId, txId, linkId);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return notFound(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    // ── helpers ──

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
