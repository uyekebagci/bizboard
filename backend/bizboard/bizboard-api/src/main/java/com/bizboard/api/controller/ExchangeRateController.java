package com.bizboard.api.controller;

import com.bizboard.common.dto.ExchangeRateDto;
import com.bizboard.common.entity.CurrencyRate;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.ExchangeRateScheduler;
import com.bizboard.service.ExchangeRateService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

/**
 * WP a9da4e9d (USD+Altın): güncel kur gösterimi + manuel "Anlık Güncelle".
 *
 * <p>Kur global (multi-tenant değil); authenticated her kullanıcı okuyabilir/
 * tetikleyebilir. Manuel refresh backend'de cooldown'lu (ExchangeRateService
 * min-interval): cooldown içinde dış API'ye gitmez, cache döner — sürü istek yok.</p>
 */
@RestController
@RequestMapping("/exchange-rates")
@RequiredArgsConstructor
public class ExchangeRateController {

    private final ExchangeRateService exchangeRateService;
    private final ExchangeRateScheduler exchangeRateScheduler;

    /** Güncel kurlar (USD + GOLD) — ekranda "son güncelleme" ile gösterim için. */
    @GetMapping
    public List<ExchangeRateDto> current(@AuthenticationPrincipal UserPrincipal principal) {
        return collect();
    }

    /**
     * Manuel "Anlık Güncelle": kuru çek (cooldown'lu) + tüm cari bakiyeleri
     * recompute → güncel TL anında yansır. Güncel kurları döner (toast için).
     */
    @PostMapping("/refresh")
    public List<ExchangeRateDto> refresh(@AuthenticationPrincipal UserPrincipal principal) {
        // force=false → ExchangeRateService cooldown uygular (arka arkaya basışta cache).
        exchangeRateScheduler.refreshAndRecompute(false);
        return collect();
    }

    private List<ExchangeRateDto> collect() {
        List<ExchangeRateDto> out = new ArrayList<>();
        // WP a9da4e9d: USD + gram + çeyrek + yarım + tam altın.
        String[] codes = {
                ExchangeRateService.USD,
                ExchangeRateService.GOLD,
                ExchangeRateService.GOLD_QUARTER,
                ExchangeRateService.GOLD_HALF,
                ExchangeRateService.GOLD_FULL,
        };
        for (String code : codes) {
            exchangeRateService.getCached(code).map(ExchangeRateController::toDto).ifPresent(out::add);
        }
        return out;
    }

    private static ExchangeRateDto toDto(CurrencyRate r) {
        return ExchangeRateDto.builder()
                .code(r.getCode())
                .rateToTry(r.getRateToTry())
                .source(r.getSource())
                .fetchedAt(r.getFetchedAt())
                .stale(r.isStale())
                .build();
    }
}
