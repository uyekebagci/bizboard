package com.bizboard.api.controller;

import com.bizboard.common.dto.BusinessDto;
import com.bizboard.common.dto.CategoryDto;
import com.bizboard.common.dto.ConsolidatedDashboardDto;
import com.bizboard.common.dto.CreateBusinessRequest;
import com.bizboard.common.dto.CreateTransactionRequest;
import com.bizboard.common.dto.DeleteTransactionRequest;
import com.bizboard.common.dto.PeriodSummaryDto;
import com.bizboard.common.dto.PosSettleRequest;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.dto.UpdateTransactionRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BusinessService;
import com.bizboard.service.ConsolidatedDashboardService;
import com.bizboard.service.SummaryService;
import com.bizboard.service.TransactionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/businesses")
@RequiredArgsConstructor
public class BusinessController {

    private final BusinessService businessService;
    private final TransactionService transactionService;
    private final SummaryService summaryService;
    private final ConsolidatedDashboardService consolidatedService;
    /** WP 2786a36e (Beta v1.1): Elde Tutulan Nakitler widget endpoint. */
    private final com.bizboard.service.BankAccountService bankAccountService;

    @GetMapping
    public ResponseEntity<List<BusinessDto>> getBusinesses(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(businessService.getBusinessesForUser(principal.getId()));
    }

    @PostMapping
    public ResponseEntity<BusinessDto> createBusiness(
            @Valid @RequestBody CreateBusinessRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(businessService.createBusiness(request, principal.getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<BusinessDto> getBusiness(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(businessService.getBusinessById(id, principal.getId()));
    }

    @GetMapping("/{id}/transactions")
    public ResponseEntity<List<TransactionDto>> getTransactions(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "20") int limit,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(transactionService.getTransactions(id, limit, principal.getId()));
    }

    @PostMapping("/{id}/transactions")
    public ResponseEntity<TransactionDto> createTransaction(
            @PathVariable UUID id,
            @Valid @RequestBody CreateTransactionRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(transactionService.createTransaction(id, request, principal.getId()));
    }

    /**
     * Esnek dönem bazlı özet.
     *
     * Kullanım:
     *   GET /businesses/{id}/summary?period=monthly           → Bu ayın 1'inden bugüne
     *   GET /businesses/{id}/summary?period=weekly             → Bu haftanın Pazartesi'sinden bugüne
     *   GET /businesses/{id}/summary?period=daily              → Bugün
     *   GET /businesses/{id}/summary?period=quarterly          → Bu çeyreğin başından bugüne
     *   GET /businesses/{id}/summary?period=yearly             → Yıl başından bugüne
     *   GET /businesses/{id}/summary?from=2026-01-01&to=2026-03-26  → Özel tarih aralığı
     *   GET /businesses/{id}/summary?year=2026&month=3         → Geriye uyumlu aylık (eski format)
     */
    @GetMapping("/{id}/summary")
    public ResponseEntity<PeriodSummaryDto> getSummary(
            @PathVariable UUID id,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        // Geriye uyumluluk: year + month parametreleri gelirse aylık hesapla
        if (year != null && month != null && period == null && from == null) {
            LocalDate start = LocalDate.of(year, month, 1);
            LocalDate today = LocalDate.now();
            LocalDate end = (year == today.getYear() && month == today.getMonthValue())
                    ? today
                    : start.withDayOfMonth(start.lengthOfMonth());
            return ResponseEntity.ok(summaryService.getBusinessSummary(id, "monthly", start, end));
        }

        return ResponseEntity.ok(summaryService.getBusinessSummary(id, period, from, to));
    }

    /**
     * v1.6.20 (WP-3): İşletme detay sayfasının tek-shot consolidated endpoint'i.
     * Tüm widget verisini tek round-trip ile döner.
     */
    @GetMapping("/{id}/consolidated")
    public ResponseEntity<ConsolidatedDashboardDto> getConsolidated(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(consolidatedService.getConsolidated(principal.getId(), id));
    }

    /**
     * WP 2786a36e (Beta v1.1): "Elde Tutulan Nakitler" widget — business-scoped
     * CASH_HOLDER bank_account özeti. Yalnız aktif hesaplar, bakiye DESC.
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    @GetMapping("/{id}/cash-holders-summary")
    public ResponseEntity<com.bizboard.common.dto.CashHoldersSummaryDto> getCashHoldersSummary(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(bankAccountService.cashHoldersSummary(id, principal.getId()));
    }

    @PutMapping("/{id}/transactions/{txId}")
    public ResponseEntity<TransactionDto> updateTransaction(
            @PathVariable UUID id,
            @PathVariable UUID txId,
            @RequestBody UpdateTransactionRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(transactionService.updateTransaction(txId, request, principal.getId()));
    }

    /**
     * Beta v1.1 hotfix: DELETE artık body değil query param ile reason alıyor —
     * bazı proxy/CDN'ler (Cloudflare vb.) DELETE body'sini strip eder ve
     * @Valid @RequestBody null fırlatıp "Kimlik dogrulamasi gerekli" 401'e
     * benzer hatalar üretir.
     *
     * <p>Geriye dönük uyumluluk için body de kabul edilir (body var ise body
     * reason'u tercih edilir).</p>
     */
    @DeleteMapping("/{id}/transactions/{txId}")
    public ResponseEntity<Void> deleteTransaction(
            @PathVariable UUID id,
            @PathVariable UUID txId,
            @RequestParam(name = "reason", required = false) String reasonParam,
            @RequestBody(required = false) DeleteTransactionRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        String reason = (request != null && request.getReason() != null && !request.getReason().isBlank())
                ? request.getReason()
                : reasonParam;
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Silme sebebi zorunludur");
        }
        transactionService.deleteTransaction(txId, principal.getId(), reason);
        return ResponseEntity.noContent().build();
    }

    /**
     * v1.6.23.9 (TODO 6ee7a9f1): POS tx "hesaba düştü" onayı.
     *
     * <p>Body: {@code { bank_account_id, settled_at? }}. Validation servis tarafında
     * (POS olmalı, henüz settled olmamalı, bank aktif CHECKING/SAVINGS olmalı).</p>
     *
     * <p>Effect: tx.pos_settled=true + bank_account_id + settled_at;
     * bank.current_balance += net.</p>
     */
    @PatchMapping("/{id}/transactions/{txId}/settle")
    public ResponseEntity<?> settlePosTransaction(
            @PathVariable UUID id,
            @PathVariable UUID txId,
            @Valid @RequestBody PosSettleRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.ok(transactionService.settlePosTransaction(
                    txId, principal.getId(), request.getBankAccountId(), request.getSettledAt()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(java.util.Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("error", e.getMessage()));
        }
    }

    /**
     * v1.6.23.9 (TODO 6ee7a9f1): POS settle iptali (admin-only).
     * Bank balance'tan net düşülür, tx pos_settled=false set edilir.
     */
    @PatchMapping("/{id}/transactions/{txId}/unsettle")
    public ResponseEntity<?> unsettlePosTransaction(
            @PathVariable UUID id,
            @PathVariable UUID txId,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.ok(transactionService.unsettlePosTransaction(txId, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(java.util.Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(java.util.Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/categories")
    public ResponseEntity<List<CategoryDto>> getCategories(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(businessService.getCategoriesForBusiness(id, principal.getId()));
    }

    @PostMapping("/{id}/modules/{module}")
    public ResponseEntity<BusinessDto> addModule(
            @PathVariable UUID id,
            @PathVariable String module,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(businessService.addModule(id, module, principal.getId()));
    }

    @DeleteMapping("/{id}/modules/{module}")
    public ResponseEntity<BusinessDto> removeModule(
            @PathVariable UUID id,
            @PathVariable String module,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(businessService.removeModule(id, module, principal.getId()));
    }

    /**
     * v1.6.2: İşletme silme — yalnız admin. Cascade: bağlı transaction/fixed_cost/
     * member/module kayıtları otomatik temizlenir; FK kalan başka kayıt varsa
     * 409 Conflict döner.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteBusiness(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        businessService.deleteBusiness(id, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
