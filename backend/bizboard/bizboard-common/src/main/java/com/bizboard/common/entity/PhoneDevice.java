package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * v1.6.23.12 (WP 3c8401f6): DGR'nin yönettiği fiziki telefon.
 *
 * <p>Use case: her firma için ayrı SIM/telefon (mobil bankacılık, OTP, SMS).
 * {@code assigned_counterpart_id} hangi karşı firmaya/kişiye atandığını
 * gösterir (null = atanmamış / havuz).</p>
 *
 * <p>Marka/model: ya {@code brand+model} (master listeden) ya da
 * {@code custom_model} (master'da yoksa fallback). İkisi birden olamaz.
 * Marka tek başına da boş bırakılabilir.</p>
 *
 * <p>UNIQUE(business_id, device_number) — her işletme içinde sıralı numara.</p>
 */
@Entity
@Table(name = "phone_device",
       uniqueConstraints = @UniqueConstraint(name = "uk_phone_device_biz_num",
                                              columnNames = {"business_id", "device_number"}),
       indexes = {
               @Index(name = "idx_phone_device_counterpart", columnList = "assigned_counterpart_id"),
               @Index(name = "idx_phone_device_brand", columnList = "brand_id"),
               @Index(name = "idx_phone_device_active", columnList = "is_active")
       })
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PhoneDevice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /**
     * İşletme içindeki sıra numarası (1, 2, 3, ...). UI'da "#1, #2" diye
     * gösterilir. Aynı işletmede UNIQUE.
     */
    @Column(name = "device_number", nullable = false)
    private int deviceNumber;

    @Column(name = "phone_number", length = 32)
    private String phoneNumber;

    /**
     * Atanmış karşı taraf — bu telefon hangi firma/kişi için kullanılıyor.
     * Null = atanmamış (havuzda).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_counterpart_id")
    private Counterpart assignedCounterpart;

    /**
     * Marka — master listeden. {@code customModel} kullanıldıysa null olabilir.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "brand_id")
    private PhoneBrand brand;

    /**
     * Model — master listeden. {@code brand} ile aynı marka olmalı (servis
     * tarafında validate). {@code customModel} ile mutex.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "model_id")
    private PhoneModel model;

    /**
     * Master listede yoksa fallback — serbest metin model adı.
     * {@code brand_id + model_id} ile mutex.
     */
    @Column(name = "custom_model", length = 128)
    private String customModel;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @OneToMany(mappedBy = "phoneDevice", cascade = CascadeType.ALL, orphanRemoval = true,
               fetch = FetchType.LAZY)
    @Builder.Default
    private Set<PhoneDeviceBank> banks = new HashSet<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
