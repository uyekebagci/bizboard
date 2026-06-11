package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.SystemSetting;
import com.bizboard.repository.SystemSettingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ledger v2 (Faz B) — özellik bayrakları ({@link SystemSetting} key-value üstünde).
 *
 * <p><b>{@code day_close.backdate_enabled} (§4.1):</b> geri dönük gün-kapanışı
 * geçici bir migrasyon capability'sidir — kullanıcı tarihsel günleri tek tek
 * girip v1.2'yi gerçek defterle doğrulayacak. Geçiş döneminde DEFAULT AÇIK;
 * tarihsel giriş bitince admin kapatabilir. Flag kapalıyken backdated kapanış
 * ve geçmiş kapanış düzenleme reddedilir (admin-gate'in üstünde ikinci kapı).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LedgerFeatureFlagService {

    /** §4.1: geri dönük kapanış + geçmiş düzenleme kapısı. */
    public static final String KEY_BACKDATE_ENABLED = "day_close.backdate_enabled";

    /**
     * Gün Açılışı: işlem-giriş enforcement kapısı.
     *
     * <p><b>PER-BUSINESS (işletme-başına).</b> Açıkken yalnız AÇIK güne
     * (DayOpen.OPEN) işlem girilebilir; AÇILMAMIŞ gün → "Günü Aç" gerekir,
     * KAPALI gün → kilitli. <b>HER İŞLETMEDE DEFAULT KAPALI</b> (NON-BREAKING) —
     * mevcut canlı giriş akışı anında kırılmaz; DGR dahil hiçbir işletme
     * etkilenmez. Geçiş döneminde admin tek bir işletmede (örn. TEST) açıp
     * gün-açılışını DGR'yi etkilemeden E2E test edebilir.</p>
     *
     * <p>Önceden bu key GLOBAL ({@code SystemSetting} tek satır) idi; tek
     * işletmede açmak tüm işletmeleri (DGR dahil) etkiliyordu. Artık işletme-başına:
     * key = {@code day_open.enforce_enabled:<businessId>}. Satır yoksa = KAPALI.
     * Eski global satır okunmaz (per-business default off galip gelir).</p>
     */
    public static final String KEY_DAY_OPEN_ENFORCE = "day_open.enforce_enabled";

    /** İşletme-başına enforcement key'i: {@code day_open.enforce_enabled:<businessId>}. */
    public static String dayOpenEnforceKey(UUID businessId) {
        return KEY_DAY_OPEN_ENFORCE + ":" + businessId;
    }

    private final SystemSettingRepository settingRepository;
    private final AuditLogService auditLogService;

    /**
     * §4.1 default AÇIK (geçiş dönemi). Ayar yoksa true döner; "false"/"0"/"off"
     * açıkça kapatır.
     */
    @Transactional(readOnly = true)
    public boolean isBackdateEnabled() {
        return getBoolean(KEY_BACKDATE_ENABLED, true);
    }

    /** Admin flag'i değiştirir (denormalized updatedBy). */
    @Transactional
    public void setBackdateEnabled(boolean enabled, UUID actorUserId) {
        SystemSetting s = settingRepository.findById(KEY_BACKDATE_ENABLED)
                .orElseGet(() -> SystemSetting.builder().key(KEY_BACKDATE_ENABLED).build());
        s.setValue(Boolean.toString(enabled));
        s.setUpdatedBy(actorUserId);
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
        log.info("[feature-flag] {} = {} by={}", KEY_BACKDATE_ENABLED, enabled, actorUserId);
    }

    /**
     * Gün Açılışı enforcement — İŞLETME-BAŞINA. O işletmenin bayrağına bakar
     * (global değil). HER İŞLETMEDE DEFAULT KAPALI (NON-BREAKING) — satır yoksa
     * false. DGR dahil hiçbir işletme, kendi satırı açılmadıkça etkilenmez.
     *
     * @param businessId null ise (defansif) false döner — gating'e takılmasın.
     */
    @Transactional(readOnly = true)
    public boolean isDayOpenEnforceEnabled(UUID businessId) {
        if (businessId == null) return false;
        return getBoolean(dayOpenEnforceKey(businessId), false);
    }

    /** Admin enforcement bayrağını İŞLETME-BAŞINA değiştirir (audit + businessId). */
    @Transactional
    public void setDayOpenEnforceEnabled(UUID businessId, boolean enabled, UUID actorUserId) {
        if (businessId == null) {
            throw new IllegalArgumentException("business_id zorunlu (per-business enforcement)");
        }
        String key = dayOpenEnforceKey(businessId);
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(Boolean.toString(enabled));
        s.setUpdatedBy(actorUserId);
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
        auditLogService.recordEntityAction(
                AuditAction.DAY_OPEN_ENFORCE_TOGGLE, actorUserId, "admin",
                "SYSTEM_SETTING", null,
                "Gün açılışı işlem-giriş enforcement = " + enabled + " (business=" + businessId + ")",
                java.util.Map.of("key", key, "businessId", businessId.toString(), "enabled", enabled),
                null);
        log.info("[feature-flag] {} = {} by={}", key, enabled, actorUserId);
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
