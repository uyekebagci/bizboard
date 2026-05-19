package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.18 (WP-1): Tek tenant ayarları için anahtar-değer tablosu.
 * <p>
 * En önemli kullanımı: {@code tenant.single_business_id} — DGR roll-out'unda
 * sistemin tek bir işletmeye sabit kalması için. Boot anında değer NULL ise
 * {@link com.bizboard.service.SystemSettingBootGuard} uyarı log düşürür.
 * <p>
 * Tablo ileride özellik bayrakları (feature flags) ve diğer global ayarlar için
 * de kullanılır — JSONB değer yerine basit text tutulur (parse application
 * katmanında).
 */
@Entity
@Table(name = "system_setting")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SystemSetting {

    @Id
    @Column(name = "setting_key", length = 128)
    private String key;

    @Column(name = "setting_value", columnDefinition = "TEXT")
    private String value;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /** İsteğe bağlı son güncelleyen user id (denormalized — User entity'sine FK yok). */
    @Column(name = "updated_by")
    private UUID updatedBy;

    /** v1.6.18 (WP-1): tek-tenant business id ayar key'i. */
    public static final String KEY_TENANT_BUSINESS_ID = "tenant.single_business_id";
}
