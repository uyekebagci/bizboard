package com.bizboard.service;

import com.bizboard.common.dto.PeriodSummaryDto;
import com.bizboard.common.dto.PortfolioSummaryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Delegasyon servisi — tüm hesaplamaları SummaryService'e yönlendirir.
 * Geriye uyumluluk ve ince sarmalayıcı (wrapper) olarak kalır.
 */
@Service
@RequiredArgsConstructor
public class PortfolioService {

    private final SummaryService summaryService;

    @Transactional(readOnly = true)
    public PortfolioSummaryDto getPortfolioSummary(UUID userId, int year, int month) {
        // Aylık: ayın 1'inden bugüne (ya da ay sonuna) kadar
        LocalDate start = LocalDate.of(year, month, 1);
        LocalDate today = LocalDate.now();
        LocalDate end = (year == today.getYear() && month == today.getMonthValue())
                ? today
                : start.withDayOfMonth(start.lengthOfMonth());

        return summaryService.getPortfolioSummary(userId, "monthly", start, end);
    }

    @Transactional(readOnly = true)
    public PeriodSummaryDto getMonthlySummary(UUID userId, UUID businessId, int year, int month) {
        LocalDate start = LocalDate.of(year, month, 1);
        LocalDate today = LocalDate.now();
        LocalDate end = (year == today.getYear() && month == today.getMonthValue())
                ? today
                : start.withDayOfMonth(start.lengthOfMonth());

        // C-1: getBusinessSummary artık userId ile guard uyguluyor.
        return summaryService.getBusinessSummary(userId, businessId, "monthly", start, end);
    }
}
