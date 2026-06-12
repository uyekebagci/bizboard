package com.bizboard.repository;

import com.bizboard.common.entity.SystemSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * v1.6.18 (WP-1): system_setting repository — basit key-value erişimi.
 */
public interface SystemSettingRepository extends JpaRepository<SystemSetting, String> {

    /**
     * Raporlar v1.1 (R7): prefix'e göre ayar satırları (full-scan yerine
     * index-friendly LIKE 'prefix%'). Bütçe-eşik konfigürasyonu işletme-başına
     * {@code report.budget:<businessId>:%} okumak için.
     */
    List<SystemSetting> findByKeyStartingWith(String prefix);
}
