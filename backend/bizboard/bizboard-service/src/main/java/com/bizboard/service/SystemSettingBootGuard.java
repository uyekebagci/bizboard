package com.bizboard.service;

import com.bizboard.common.entity.SystemSetting;
import com.bizboard.repository.SystemSettingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Optional;

/**
 * v1.6.18 (WP-1): Boot guard — tek-tenant business id ayarı set edilmemişse
 * uyarı log düşürür (sistemin tek-işletme modu için gerekli).
 *
 * <p>Eksik ayar uygulamayı durdurmaz — yalnız operatöre bildirim. DGR
 * roll-out'ta seed migration / manuel SQL ile değer atanır.</p>
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class SystemSettingBootGuard {

    @Bean
    ApplicationRunner systemSettingBootCheck(SystemSettingRepository repo) {
        return args -> {
            Optional<SystemSetting> setting = repo.findById(SystemSetting.KEY_TENANT_BUSINESS_ID);
            if (setting.isEmpty() || setting.get().getValue() == null
                    || setting.get().getValue().isBlank()) {
                log.warn(
                        "[boot-guard] system_setting '{}' set edilmemiş — tek-tenant business id "
                                + "tanımlı değil. Single-business modu için bu değer atanmalı.",
                        SystemSetting.KEY_TENANT_BUSINESS_ID);
            } else {
                log.info("[boot-guard] tenant.single_business_id = {} (single-tenant mode aktif)",
                        setting.get().getValue());
            }
        };
    }
}
