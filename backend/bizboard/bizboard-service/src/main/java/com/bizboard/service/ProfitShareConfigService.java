package com.bizboard.service;

import com.bizboard.common.entity.SystemSetting;
import com.bizboard.repository.SystemSettingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.4 — KİLİTLİ KARAR A3) — POS kâr-payı GLOBAL config
 * default'ları (oran kaynağı hiyerarşisinin 3. seviyesi).
 *
 * <p><b>Bugün:</b> tüm cihaz/operatörlerde SABİT — sahip baz %5, Fatih marj %4.5,
 * Tuncay spread %5. Bu servis bu rakamları {@link SystemSetting} key-value'dan
 * okur; <b>kod rakamı hard-code etmez</b> (kanonik default sadece DB'de ayar
 * yoksa fallback). İleride bir operatör/cihaz farklılaşırsa
 * {@code ProfitShareRule.overridePct} girilir; şema/akış değişmez.</p>
 *
 * <h3>Oran kaynağı hiyerarşisi (resolve sırası):</h3>
 * <ol>
 *   <li>{@code ProfitShareRule.overridePct} (operatör/cihaz override) — bugün boş</li>
 *   <li>{@code PosDevice.ourCommissionRate}/{@code defaultRate} (cihaz banka oranı)</li>
 *   <li>Bu servis (global default) — bugünkü tek kaynak</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProfitShareConfigService {

    /** Sahip baz oranı (yüzde) — RATE_SPREAD/MARGIN_PCT marjının ve OWNER_COMMISSION'ın temel oranı. */
    public static final String KEY_OWNER_BASE_PCT = "profit_share.owner_base_pct";
    /** Fatih marj çarpanı (yüzde) — MARGIN_PCT. */
    public static final String KEY_FATIH_MARGIN_PCT = "profit_share.fatih_margin_pct";
    /** Tuncay spread baz oranı (yüzde) — OWNER_COMMISSION (sahip baz%). */
    public static final String KEY_TUNCAY_SPREAD_PCT = "profit_share.tuncay_spread_pct";

    // Kanonik default'lar (yalnız DB'de ayar yoksa fallback — KİLİTLİ rakamlar §3.4).
    static final BigDecimal DEFAULT_OWNER_BASE_PCT = new BigDecimal("5.0");
    static final BigDecimal DEFAULT_FATIH_MARGIN_PCT = new BigDecimal("4.5");
    static final BigDecimal DEFAULT_TUNCAY_SPREAD_PCT = new BigDecimal("5.0");

    private final SystemSettingRepository settingRepository;

    @Transactional(readOnly = true)
    public BigDecimal ownerBasePct() {
        return getDecimal(KEY_OWNER_BASE_PCT, DEFAULT_OWNER_BASE_PCT);
    }

    @Transactional(readOnly = true)
    public BigDecimal fatihMarginPct() {
        return getDecimal(KEY_FATIH_MARGIN_PCT, DEFAULT_FATIH_MARGIN_PCT);
    }

    @Transactional(readOnly = true)
    public BigDecimal tuncaySpreadPct() {
        return getDecimal(KEY_TUNCAY_SPREAD_PCT, DEFAULT_TUNCAY_SPREAD_PCT);
    }

    /** Tüm config'i snapshot olarak döndürür (DTO / rapor için). */
    @Transactional(readOnly = true)
    public ProfitShareDefaults snapshot() {
        return new ProfitShareDefaults(ownerBasePct(), fatihMarginPct(), tuncaySpreadPct());
    }

    /** Admin global config'i günceller (her alan opsiyonel; null = değişme). */
    @Transactional
    public ProfitShareDefaults update(BigDecimal ownerBasePct, BigDecimal fatihMarginPct,
                                      BigDecimal tuncaySpreadPct, UUID actorUserId) {
        if (ownerBasePct != null) setDecimal(KEY_OWNER_BASE_PCT, ownerBasePct, actorUserId);
        if (fatihMarginPct != null) setDecimal(KEY_FATIH_MARGIN_PCT, fatihMarginPct, actorUserId);
        if (tuncaySpreadPct != null) setDecimal(KEY_TUNCAY_SPREAD_PCT, tuncaySpreadPct, actorUserId);
        return snapshot();
    }

    private BigDecimal getDecimal(String key, BigDecimal defaultValue) {
        String raw = settingRepository.findById(key).map(SystemSetting::getValue).orElse(null);
        if (raw == null || raw.isBlank()) return defaultValue;
        try {
            return new BigDecimal(raw.trim());
        } catch (NumberFormatException e) {
            log.warn("[profit-share-config] gecersiz {} = '{}' → default {}", key, raw, defaultValue);
            return defaultValue;
        }
    }

    private void setDecimal(String key, BigDecimal value, UUID actorUserId) {
        if (value.signum() < 0) {
            throw new IllegalArgumentException(key + " negatif olamaz: " + value);
        }
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(value.toPlainString());
        s.setUpdatedBy(actorUserId);
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
        log.info("[profit-share-config] {} = {} by={}", key, value, actorUserId);
    }

    /** Config snapshot (immutable). */
    public record ProfitShareDefaults(BigDecimal ownerBasePct, BigDecimal fatihMarginPct,
                                      BigDecimal tuncaySpreadPct) {}
}
