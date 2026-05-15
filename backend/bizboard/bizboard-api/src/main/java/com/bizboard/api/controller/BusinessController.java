package com.bizboard.api.controller;

import com.bizboard.common.dto.BusinessDto;
import com.bizboard.common.dto.CategoryDto;
import com.bizboard.common.dto.CreateBusinessRequest;
import com.bizboard.common.dto.CreateTransactionRequest;
import com.bizboard.common.dto.DeleteTransactionRequest;
import com.bizboard.common.dto.PeriodSummaryDto;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.dto.UpdateTransactionRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BusinessService;
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
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(transactionService.getTransactions(id, limit));
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

    @PutMapping("/{id}/transactions/{txId}")
    public ResponseEntity<TransactionDto> updateTransaction(
            @PathVariable UUID id,
            @PathVariable UUID txId,
            @RequestBody UpdateTransactionRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(transactionService.updateTransaction(txId, request, principal.getId()));
    }

    @DeleteMapping("/{id}/transactions/{txId}")
    public ResponseEntity<Void> deleteTransaction(
            @PathVariable UUID id,
            @PathVariable UUID txId,
            @Valid @RequestBody DeleteTransactionRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        transactionService.deleteTransaction(txId, principal.getId(), request.getReason());
        return ResponseEntity.noContent().build();
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
}
