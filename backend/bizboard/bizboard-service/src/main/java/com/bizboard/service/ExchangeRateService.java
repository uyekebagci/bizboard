package com.bizboard.service;

import com.bizboard.common.entity.CurrencyRate;
import com.bizboard.repository.CurrencyRateRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * WP a9da4e9d (USD+Altın): Global döviz/altın kuru servisi.
 *
 * <p><b>Kaynaklar (API key YOK):</b></p>
 * <ul>
 *   <li>USD/TRY: TCMB {@code today.xml} (primary) → frankfurter.app (fallback)</li>
 *   <li>GOLD (gram altın TL): XAU/USD (frankfurter) × USD/TRY türevi.
 *       1 ons = 31.1035 gram → gram fiyatı = (USD/ons → TL) / 31.1035</li>
 * </ul>
 *
 * <p><b>Cache + min-interval + stale-ok:</b> kur DB'de cache'lenir. {@code refresh()}
 * min-interval (cooldown) içinde tekrar çağrılırsa dış API'ye GİTMEZ, cache döner.
 * Dış API down ise son değer {@code stale=true} ile servis edilir (asla patlamaz).</p>
 *
 * <p>Mimari: B (Master/shared) — multi-tenant değil.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExchangeRateService {

    public static final String USD = "USD";
    public static final String GOLD = "GOLD";
    private static final BigDecimal GRAMS_PER_OUNCE = new BigDecimal("31.1035");

    private final CurrencyRateRepository repository;

    /** Manuel/scheduled refresh arası min süre (sn). Cooldown'da cache döner. */
    @Value("${exchange.min-refresh-interval-sec:30}")
    private long minRefreshIntervalSec;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(6))
            .build();

    /** 1 birim {@code code} = ? TL. TRY → 1. Bilinmiyorsa null. Cache'ten okur. */
    @Transactional(readOnly = true)
    public BigDecimal getRateToTry(String code) {
        if (code == null || code.isBlank() || "TRY".equalsIgnoreCase(code)) return BigDecimal.ONE;
        return repository.findByCode(code.toUpperCase()).map(CurrencyRate::getRateToTry).orElse(null);
    }

    /** Cache'teki kur satırı (gösterim — değer + fetched_at + stale). */
    @Transactional(readOnly = true)
    public Optional<CurrencyRate> getCached(String code) {
        return repository.findByCode(code.toUpperCase());
    }

    /**
     * Kurları tazele. Cooldown içindeyse dış API'ye gitmeden cache döner (debounce
     * backend tarafı). Dış API hatasında son değer korunur (stale=true).
     *
     * @param force scheduled job true geçer (cooldown'ı atlar); manuel buton false.
     */
    @Transactional
    public void refresh(boolean force) {
        if (!force && isWithinCooldown()) {
            log.debug("[exchange] cooldown içinde — cache servis ediliyor, dış API atlandı.");
            return;
        }
        BigDecimal usdTry = fetchUsdTry();
        if (usdTry != null) {
            upsert(USD, usdTry, "TCMB/FRANKFURTER");
            BigDecimal goldGramTry = fetchGoldGramTry(usdTry);
            if (goldGramTry != null) {
                upsert(GOLD, goldGramTry, "FRANKFURTER(XAU)×USD/TRY");
            } else {
                markStale(GOLD);
            }
        } else {
            // USD çekilemedi → her ikisini de bayat işaretle (son değer korunur).
            markStale(USD);
            markStale(GOLD);
            log.warn("[exchange] USD/TRY çekilemedi — son değerler stale servis ediliyor.");
        }
    }

    private boolean isWithinCooldown() {
        LocalDateTime threshold = LocalDateTime.now().minusSeconds(minRefreshIntervalSec);
        return repository.findByCode(USD)
                .map(r -> r.getFetchedAt() != null && r.getFetchedAt().isAfter(threshold))
                .orElse(false);
    }

    // ── Dış API çağrıları (best-effort; hata → null) ─────────────────────────

    /** TCMB today.xml primary, frankfurter.app fallback. */
    private BigDecimal fetchUsdTry() {
        BigDecimal tcmb = fetchUsdTryFromTcmb();
        if (tcmb != null) return tcmb;
        return fetchUsdTryFromFrankfurter();
    }

    private BigDecimal fetchUsdTryFromTcmb() {
        try {
            String xml = get("https://www.tcmb.gov.tr/kurlar/today.xml");
            if (xml == null) return null;
            // <Currency Kod="USD" ...> ... <ForexSelling>34,1234</ForexSelling>
            Matcher block = Pattern.compile("Kod=\"USD\".*?</Currency>", Pattern.DOTALL).matcher(xml);
            if (!block.find()) return null;
            Matcher sell = Pattern.compile("<ForexSelling>([\\d.,]+)</ForexSelling>").matcher(block.group());
            if (!sell.find()) return null;
            return parseTr(sell.group(1));
        } catch (Exception e) {
            log.warn("[exchange] TCMB USD/TRY hata: {}", e.getMessage());
            return null;
        }
    }

    private BigDecimal fetchUsdTryFromFrankfurter() {
        try {
            String json = get("https://api.frankfurter.app/latest?from=USD&to=TRY");
            if (json == null) return null;
            return parseJsonNumber(json, "TRY");
        } catch (Exception e) {
            log.warn("[exchange] frankfurter USD/TRY hata: {}", e.getMessage());
            return null;
        }
    }

    /** Gram altın TL = (XAU/USD → 1 ons USD) × USD/TRY / 31.1035. */
    private BigDecimal fetchGoldGramTry(BigDecimal usdTry) {
        try {
            // frankfurter: from=XAU&to=USD → 1 XAU(ons) kaç USD.
            String json = get("https://api.frankfurter.app/latest?from=XAU&to=USD");
            if (json == null) return null;
            BigDecimal ounceUsd = parseJsonNumber(json, "USD");
            if (ounceUsd == null || ounceUsd.signum() <= 0) return null;
            BigDecimal ounceTry = ounceUsd.multiply(usdTry);
            return ounceTry.divide(GRAMS_PER_OUNCE, 6, RoundingMode.HALF_UP);
        } catch (Exception e) {
            log.warn("[exchange] gram altın türev hata: {}", e.getMessage());
            return null;
        }
    }

    private String get(String url) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("User-Agent", "bizboard-exchange/1.0")
                .GET().build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        return resp.statusCode() == 200 ? resp.body() : null;
    }

    /** "34,1234" (TR) → 34.1234. */
    private static BigDecimal parseTr(String raw) {
        try {
            return new BigDecimal(raw.trim().replace(".", "").replace(",", "."));
        } catch (Exception e) {
            return null;
        }
    }

    /** Basit JSON sayı çıkarımı: "rates":{"KEY":value}. */
    private static BigDecimal parseJsonNumber(String json, String key) {
        Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*([\\d.]+)").matcher(json);
        if (!m.find()) return null;
        try {
            return new BigDecimal(m.group(1));
        } catch (Exception e) {
            return null;
        }
    }

    // ── Cache yazımı ─────────────────────────────────────────────────────────

    private void upsert(String code, BigDecimal rate, String source) {
        CurrencyRate r = repository.findByCode(code).orElseGet(() -> {
            CurrencyRate n = new CurrencyRate();
            n.setCode(code);
            return n;
        });
        r.setRateToTry(rate);
        r.setSource(source);
        r.setFetchedAt(LocalDateTime.now());
        r.setStale(false);
        repository.save(r);
        log.info("[exchange] {} = {} TL ({}) güncellendi.", code, rate, source);
    }

    private void markStale(String code) {
        repository.findByCode(code).ifPresent(r -> {
            r.setStale(true);
            repository.save(r);
        });
    }
}
