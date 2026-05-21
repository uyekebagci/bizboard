package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * v1.6.23.12 (WP 3c8401f6): Telefonda yüklü bankacılık uygulaması kaydı.
 *
 * <p>Composite PK: (phone_device_id, bank_name). Aynı telefonda aynı banka
 * iki kez yazılmaz.</p>
 */
@Entity
@Table(name = "phone_device_bank")
@IdClass(PhoneDeviceBank.PK.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PhoneDeviceBank {

    @Id
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "phone_device_id", nullable = false)
    private PhoneDevice phoneDevice;

    @Id
    @Column(name = "bank_name", nullable = false, length = 64)
    private String bankName;

    /** Banka uygulamasında giriş yapılan kullanıcı (opsiyonel). */
    @Column(name = "app_username", length = 64)
    private String appUsername;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class PK implements Serializable {
        private UUID phoneDevice;
        private String bankName;

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof PK pk)) return false;
            return Objects.equals(phoneDevice, pk.phoneDevice) && Objects.equals(bankName, pk.bankName);
        }
        @Override
        public int hashCode() { return Objects.hash(phoneDevice, bankName); }
    }
}
