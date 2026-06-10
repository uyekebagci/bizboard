package com.bizboard.service;

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

    private final SystemSettingRepository settingRepository;

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

    private boolean getBoolean(String key, boolean defaultValue) {
        String raw = settingRepository.findById(key).map(SystemSetting::getValue).orElse(null);
        if (raw == null || raw.isBlank()) return defaultValue;
        String v = raw.trim().toLowerCase();
        if (v.equals("true") || v.equals("1") || v.equals("on") || v.equals("yes")) return true;
        if (v.equals("false") || v.equals("0") || v.equals("off") || v.equals("no")) return false;
        return defaultValue;
    }
}
