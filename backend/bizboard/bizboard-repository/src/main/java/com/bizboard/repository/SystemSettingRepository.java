package com.bizboard.repository;

import com.bizboard.common.entity.SystemSetting;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * v1.7.0 (WP-1): system_setting repository — basit key-value erişimi.
 */
public interface SystemSettingRepository extends JpaRepository<SystemSetting, String> {
}
