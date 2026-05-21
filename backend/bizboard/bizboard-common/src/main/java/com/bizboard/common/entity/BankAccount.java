package com.bizboard.common.entity;

import com.bizboard.common.enums.BankAccountType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.18 (WP-1): Banka hesabı / kasa varlığı.
 *
 * <p>Tek-tenant (DGR) modelinde işletmeye bağlı değil — sistem genelinde
 * tek bir liste. {@code type=CASH_HOLDER} ise {@code holderPerson} doldurulmalı
 * ({@code PERSON} tipinde counterpart). Diğer tipler için holderPerson null.</p>
 *
 * <p>{@code isActive=false} olan hesaplar UI'da gizlenir; "pasif hesapları göster"
 * toggle'ı ile erişilir. Audit izi için fiziksel olarak silinmez.</p>
 */
@Entity
@Table(name = "bank_accounts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BankAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * v1.6.23.19 (Security WP 667d8a71 / TODO 7432143f): multi-tenant izolasyon
     * için zorunlu. Önceki sürümlerde bu kolon yoktu — DGR tek tenant olduğu
     * sürece tetiklenmeyen data leakage riskiydi. Migration: SQL ile mevcut tüm
     * satırlara DGR id'si yazıldı, sonra NOT NULL constraint set edildi.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(nullable = false, length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private BankAccountType type;

    /** Banka adı (CHECKING/SAVINGS için anlamlı; CASH/CASH_HOLDER için null). */
    @Column(name = "bank_name", length = 120)
    private String bankName;

    /** IBAN — opsiyonel (CHECKING/SAVINGS için doldurulabilir). */
    @Column(length = 34)
    private String iban;

    /** Para birimi — default TRY. */
    @Column(nullable = false, length = 3)
    @ColumnDefault("'TRY'")
    @Builder.Default
    private String currency = "TRY";

    /**
     * {@code type=CASH_HOLDER} ise zorunlu — kasada kimi tuttuğumuz (PERSON
     * tipinde counterpart). Diğer tiplerde null.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "holder_person_id")
    private Counterpart holderPerson;

    /** Cached cari bakiye — application-level recompute. */
    @Column(name = "current_balance", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal currentBalance = BigDecimal.ZERO;

    /**
     * v1.6.18 (WP-1): Master havuzu için aktiflik flag'i. Pasif hesaplar
     * varsayılan listelerden gizlenir; "göster" toggle'ı ile görünür kalır.
     */
    @Column(name = "is_active", nullable = false)
    @ColumnDefault("true")
    @Builder.Default
    private boolean active = true;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
