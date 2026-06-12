package com.bizboard.service.approval;

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
 * Onay (Approval) modülü v1.1 — İŞLETME-BAŞINA özellik bayrağı + eşik.
 *
 * <p>{@link SystemSetting} key-value üstünde, {@link LedgerFeatureFlagService}
 * deseniyle. İki ayar (her ikisi de işletme-başına):</p>
 * <ul>
 *   <li><b>{@code approval.enabled:&lt;businessId&gt;}</b> — onay gereksinimi açık mı?
 *       <b>DEFAULT KAPALI (NON-BREAKING)</b>. Satır yoksa false → mevcut akış
 *       (örn. bakiye düzeltme) HİÇ değişmeden çalışır. DGR dahil hiçbir işletme
 *       kendi satırı açılmadıkça etkilenmez.</li>
 *   <li><b>{@code approval.balance_adjust_threshold:&lt;businessId&gt;}</b> — bakiye
 *       düzeltme eşiği (mutlak tutar). |düzeltme| ≥ eşik ise onay istenir. Null/0
 *       = eşik yok (bayrak açıksa her düzeltme onaya gider).</li>
 * </ul>
 *
 * <p>Bu sınıf {@code com.bizboard.service.LedgerFeatureFlagService}'i import
 * etmeden aynı paket-kardeşine erişebilsin diye fully-qualified referans
 * kullanır; davranış aynı (getBoolean default-off).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApprovalFeatureFlagService {

    /** İşletme-başına onay gereksinimi bayrağı (DEFAULT KAPALI). */
    public static final String KEY_ENABLED = "approval.enabled";

    /** İşletme-başına bakiye düzeltme onay eşiği (mutlak tutar). */
    public static final String KEY_BALANCE_ADJUST_THRESHOLD = "approval.balance_adjust_threshold";

    private final SystemSettingRepository settingRepository;

    public static String enabledKey(UUID businessId) {
        return KEY_ENABLED + ":" + businessId;
    }

    public static String balanceAdjustThresholdKey(UUID businessId) {
        return KEY_BALANCE_ADJUST_THRESHOLD + ":" + businessId;
    }

    /**
     * Onay gereksinimi bu işletmede açık mı? <b>DEFAULT KAPALI</b> (satır yoksa
     * false). null businessId → false (gating'e takılmaz).
     */
    @Transactional(readOnly = true)
    public boolean isEnabled(UUID businessId) {
        if (businessId == null) return false;
        return getBoolean(enabledKey(businessId), false);
    }

    /** Admin onay gereksinimini işletme-başına açar/kapatır. */
    @Transactional
    public void setEnabled(UUID businessId, boolean enabled, UUID actorUserId) {
        if (businessId == null) {
            throw new IllegalArgumentException("business_id zorunlu (per-business approval)");
        }
        upsert(enabledKey(businessId), Boolean.toString(enabled), actorUserId);
        log.info("[approval-flag] {} = {} by={}", enabledKey(businessId), enabled, actorUserId);
    }

    /**
     * Bakiye düzeltme onay eşiği (mutlak tutar). null = eşik yok.
     */
    @Transactional(readOnly = true)
    public BigDecimal balanceAdjustThreshold(UUID businessId) {
        if (businessId == null) return null;
        String raw = settingRepository.findById(balanceAdjustThresholdKey(businessId))
                .map(SystemSetting::getValue).orElse(null);
        if (raw == null || raw.isBlank()) return null;
        try {
            return new BigDecimal(raw.trim());
        } catch (NumberFormatException e) {
            log.warn("[approval-flag] geçersiz eşik değeri '{}' (business={}) — yok sayıldı",
                    raw, businessId);
            return null;
        }
    }

    /** Admin bakiye düzeltme eşiğini işletme-başına ayarlar (null/0 = eşik yok). */
    @Transactional
    public void setBalanceAdjustThreshold(UUID businessId, BigDecimal threshold, UUID actorUserId) {
        if (businessId == null) {
            throw new IllegalArgumentException("business_id zorunlu");
        }
        String value = (threshold == null) ? "" : threshold.toPlainString();
        upsert(balanceAdjustThresholdKey(businessId), value, actorUserId);
        log.info("[approval-flag] {} = {} by={}",
                balanceAdjustThresholdKey(businessId), value, actorUserId);
    }

    private void upsert(String key, String value, UUID actorUserId) {
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(value);
        s.setUpdatedBy(actorUserId);
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
    }

    private boolean getBoolean(String key, boolean defaultValue) {
        String raw = settingRepository.findById(key).map(SystemSetting::getValue).orElse(null);
        if (raw == null || raw.isBlank()) return defaultValue;
        String v = raw.trim().toLowerCase();
        if (v.equals("true") || v.equals("1") || v.equals("on") || v.equals("yes")) return true;
        if (v.equals("false") || v.equals("0") || v.equals("off") || v.equals("no")) return false;
        return defaultValue;
    }
}
