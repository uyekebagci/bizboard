package com.bizboard.service;

import com.bizboard.common.entity.CurrencyRate;
import com.bizboard.repository.CurrencyRateRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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
 *   <li>USD/TRY: TCMB {@code today.xml} (primary) → frankfurter.app → truncgil (fallback)</li>
 *   <li>Altın (TL): truncgil v4 {@code finans.truncgil.com/v4/today.json} — GERÇEK
 *       piyasa fiyatları (milyem/prim dahil): gram (GRA), çeyrek (CEYREKALTIN),
 *       yarım (YARIMALTIN), tam (TAMALTIN). frankfurter XAU desteklemediği için
 *       (301) bırakıldı; ağırlıktan türetme YOK — gerçek coin fiyatı kullanılır.</li>
 * </ul>
 *
 * <p><b>Cache + min-interval + stale-ok:</b> kur DB'de cache'lenir. {@code refresh()}
 * min-interval (cooldown) içinde tekrar çağrılırsa dış API'ye GİTMEZ, cache döner.
 * Dış API hatasında / değer bulunamazsa son değer {@code stale=true} ile servis edilir.</p>
 *
 * <p><b>truncgil yanıtı bazen sonu kesik (chunked) gelir;</b> bu yüzden full JSON
 * parse YERİNE anahtar bazlı regex çıkarımı yapılır — hedef alanlar (USD/GRA/coin'ler)
 * payload'ın başında olduğu için kesik gövdede bile okunur.</p>
 *
 * <p>Mimari: B (Master/shared) — multi-tenant değil.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExchangeRateService {

    public static final String USD = "USD";
    public static final String GOLD = "GOLD";               // gram altın
    public static final String GOLD_QUARTER = "GOLD_QUARTER"; // çeyrek
    public static final String GOLD_HALF = "GOLD_HALF";       // yarım
    public static final String GOLD_FULL = "GOLD_FULL";       // tam

    private static final String TRUNCGIL_URL = "https://finans.truncgil.com/v4/today.json";

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
        // truncgil tek çağrı: hem altın (gram+coin) hem USD fallback aynı body'den.
        String truncgil = safeGet(TRUNCGIL_URL);

        // ── USD/TRY: TCMB primary → frankfurter → truncgil ──
        BigDecimal usdTry = fetchUsdTryFromTcmb();
        String usdSource = "TCMB";
        if (usdTry == null) { usdTry = fetchUsdTryFromFrankfurter(); usdSource = "FRANKFURTER"; }
        if (usdTry == null && truncgil != null) { usdTry = truncgilSelling(truncgil, "USD"); usdSource = "TRUNCGIL"; }
        if (usdTry != null) upsert(USD, usdTry, usdSource);
        else { markStale(USD); log.warn("[exchange] USD/TRY çekilemedi — stale."); }

        // ── Altın (gram + çeyrek + yarım + tam): truncgil gerçek piyasa fiyatları ──
        if (truncgil != null) {
            applyTruncgilGold(truncgil, GOLD, "GRA");
            applyTruncgilGold(truncgil, GOLD_QUARTER, "CEYREKALTIN");
            applyTruncgilGold(truncgil, GOLD_HALF, "YARIMALTIN");
            applyTruncgilGold(truncgil, GOLD_FULL, "TAMALTIN");
        } else {
            markStale(GOLD); markStale(GOLD_QUARTER); markStale(GOLD_HALF); markStale(GOLD_FULL);
            log.warn("[exchange] truncgil çekilemedi — altın değerleri stale.");
        }
    }

    /** truncgil body'sinden bir altın anahtarını çıkar; bulunduysa upsert, yoksa stale. */
    private void applyTruncgilGold(String body, String code, String truncgilKey) {
        BigDecimal v = truncgilSelling(body, truncgilKey);
        if (v != null && v.signum() > 0) upsert(code, v, "TRUNCGIL(" + truncgilKey + ")");
        else markStale(code);
    }

    private boolean isWithinCooldown() {
        LocalDateTime threshold = LocalDateTime.now().minusSeconds(minRefreshIntervalSec);
        return repository.findByCode(USD)
                .map(r -> r.getFetchedAt() != null && r.getFetchedAt().isAfter(threshold))
                .orElse(false);
    }

    // ── Dış API çağrıları (best-effort; hata → null) ─────────────────────────

    /**
     * TCMB today.xml USD/TRY (ForexSelling). BUG A FIX: TCMB NOKTA=ondalık kullanır
     * ("46.0973"). Eski kod tr-locale gibi noktayı binlik ayraç sanıp siliyordu
     * (→ 460973). Artık locale-bağımsız {@code new BigDecimal(trimmed)} ile parse
     * edilir (nokta = ondalık nokta). Olası binlik ayraçlar (virgül) temizlenir.
     */
    private BigDecimal fetchUsdTryFromTcmb() {
        try {
            String xml = safeGet("https://www.tcmb.gov.tr/kurlar/today.xml");
            if (xml == null) return null;
            Matcher block = Pattern.compile("Kod=\"USD\".*?</Currency>", Pattern.DOTALL).matcher(xml);
            if (!block.find()) return null;
            Matcher sell = Pattern.compile("<ForexSelling>([\\d.,]+)</ForexSelling>").matcher(block.group());
            if (!sell.find()) return null;
            return parseDotDecimal(sell.group(1));
        } catch (Exception e) {
            log.warn("[exchange] TCMB USD/TRY hata: {}", e.getMessage());
            return null;
        }
    }

    private BigDecimal fetchUsdTryFromFrankfurter() {
        String json = safeGet("https://api.frankfurter.app/latest?from=USD&to=TRY");
        if (json == null) return null;
        Matcher m = Pattern.compile("\"TRY\"\\s*:\\s*([\\d.]+)").matcher(json);
        return m.find() ? parseDotDecimal(m.group(1)) : null;
    }

    /**
     * truncgil v4 body'sinden {@code "KEY":{... "Selling": NUM ...}} çıkarır.
     * Full JSON parse YOK — body bazen sonu kesik gelir; hedef anahtarlar başta
     * olduğu için regex çıkarımı kesik gövdede de çalışır. Değerler nokta=ondalık.
     */
    private static BigDecimal truncgilSelling(String body, String key) {
        if (body == null) return null;
        // "KEY":{ ... "Selling":1234.56 ... }  → Selling sayısını yakala (anahtar bloğu içinde).
        Matcher m = Pattern.compile(
                "\"" + Pattern.quote(key) + "\"\\s*:\\s*\\{[^}]*?\"Selling\"\\s*:\\s*([\\d.]+)",
                Pattern.DOTALL).matcher(body);
        return m.find() ? parseDotDecimal(m.group(1)) : null;
    }

    /** GET → 200 ise body, değilse null. Hata yutulur (best-effort, stale-ok). */
    private String safeGet(String url) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("User-Agent", "Mozilla/5.0 (bizboard-exchange/1.0)")
                    .header("Accept", "application/json,text/xml,*/*")
                    .GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            return resp.statusCode() == 200 ? resp.body() : null;
        } catch (Exception e) {
            log.warn("[exchange] GET hata {}: {}", url, e.getMessage());
            return null;
        }
    }

    /** Nokta=ondalık değer parse (locale-bağımsız). Virgül binlik ayraçsa atılır. */
    private static BigDecimal parseDotDecimal(String raw) {
        try {
            return new BigDecimal(raw.trim().replace(",", ""));
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
