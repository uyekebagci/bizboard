package com.bizboard.api.controller;

import com.bizboard.common.dto.PagedResponseDto;
import com.bizboard.common.dto.PortfolioActivityDto;
import com.bizboard.common.dto.PortfolioComparisonDto;
import com.bizboard.common.dto.PortfolioSummaryDto;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.SummaryService;
import com.bizboard.service.TransactionService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/portfolio")
@RequiredArgsConstructor
public class PortfolioController {

    private final SummaryService summaryService;
    private final TransactionService transactionService;

    /**
     * Portfolio özeti — tüm işletmelerin toplamı.
     *
     * Kullanım:
     *   GET /portfolio?period=monthly                         → Bu ayın 1'inden bugüne
     *   GET /portfolio?period=weekly                          → Bu haftanın başından bugüne
     *   GET /portfolio?period=quarterly                       → Bu çeyreğin başından bugüne
     *   GET /portfolio?from=2026-01-01&to=2026-03-26          → Özel tarih aralığı
     *   GET /portfolio?year=2026&month=3                      → Geriye uyumlu aylık format
     */
    @GetMapping
    public ResponseEntity<PortfolioSummaryDto> getPortfolio(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        // Geriye uyumluluk: year + month gelirse
        if (year != null && month != null && period == null && from == null) {
            LocalDate start = LocalDate.of(year, month, 1);
            LocalDate today = LocalDate.now();
            LocalDate end = (year == today.getYear() && month == today.getMonthValue())
                    ? today
                    : start.withDayOfMonth(start.lengthOfMonth());
            return ResponseEntity.ok(
                    summaryService.getPortfolioSummary(principal.getId(), "monthly", start, end));
        }

        return ResponseEntity.ok(
                summaryService.getPortfolioSummary(principal.getId(), period, from, to));
    }

    /**
     * Portfolio günlük aktivite serisi — dashboard "Haftalık Hareket" bar-chart'ı.
     *
     * <p>GET /portfolio/activity/daily?days=7</p>
     *
     * <p>Erişilebilir TÜM işletmelerin son N gün gün-bazında gelir/gider/net'i.
     * Salt-okunur, additive; mevcut /portfolio (consolidated net) hesabını
     * DEĞİŞTİRMEZ. Tenant-scope ve net tutarlılığı servis katmanında
     * ({@code SummaryService} → {@code BusinessAccessGuard} +
     * {@code PosIncomeCalculator}). {@code days} clamp: 1..31, default 7.
     * Erişilebilir işletme yoksa {@code business_count=0} + sıfır seri (nötr).</p>
     */
    @GetMapping("/activity/daily")
    public ResponseEntity<PortfolioActivityDto> getDailyActivity(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(value = "days", required = false) Integer days) {
        return ResponseEntity.ok(
                summaryService.getPortfolioActivity(principal.getId(), days));
    }

    /**
     * Portfolio dönem karşılaştırması (delta %) — dashboard MetricCard yüzdeleri.
     *
     * <p>GET /portfolio/comparison?period=monthly</p>
     * <p>GET /portfolio/comparison?from=2026-01-01&to=2026-03-31</p>
     *
     * <p>Seçili dönem vs önceki eşdeğer dönem (aynı uzunluk) gelir/gider/net +
     * yüzde değişim. Önceki dönem 0 ise ilgili delta {@code null} (FE uydurma
     * yüzde göstermez). Salt-okunur, additive, tenant-scope.</p>
     */
    @GetMapping("/comparison")
    public ResponseEntity<PortfolioComparisonDto> getComparison(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(
                summaryService.getPortfolioComparison(principal.getId(), period, from, to));
    }

    @GetMapping("/transactions/recent")
    public ResponseEntity<List<TransactionDto>> getRecentTransactions(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(transactionService.getRecentTransactionsForUser(principal.getId(), limit));
    }

    /**
     * Tum islemler — filtreleme destekli.
     *
     * <p>GET /portfolio/transactions/all?business_id=xxx&direction=income</p>
     *
     * <p>PERF (server-pagination, non-breaking): {@code page} parametresi
     * GELMEZSE eski davranış AYNEN korunur — tüm tx'ler {@code List<TransactionDto>}
     * JSON dizisi olarak döner (mevcut FE çağrıları kırılmaz). {@code page}
     * GELİRSE {@link PagedResponseDto} zarfı döner ({@code items + total_elements
     * + ...}) ve direction filtresi DB'de uygulanır. {@code size} clamp: 1..200,
     * default 50. Sonuç kümesi/sırası ikisinde de aynı ({@code date DESC}).</p>
     */
    @GetMapping("/transactions/all")
    public ResponseEntity<?> getAllTransactions(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(value = "business_id", required = false) java.util.UUID businessId,
            @RequestParam(value = "direction", required = false) String direction,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {

        // Geriye uyumluluk: page yoksa eski tam-liste davranışı.
        if (page == null) {
            return ResponseEntity.ok(
                    transactionService.getAllTransactionsForUser(principal.getId(), businessId, direction));
        }

        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size == null ? 50 : size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize);
        return ResponseEntity.ok(PagedResponseDto.of(
                transactionService.getAllTransactionsForUserPaged(
                        principal.getId(), businessId, direction, pageable)));
    }
}
