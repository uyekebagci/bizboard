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
     * @deprecated Beta v1.1 (WP 2786a36e): CASH_HOLDER artık counterpart'a
     * bağımlı değil — standalone. Yeni create'lerde NULL olur; geriye dönük
     * compat için kolon kalır. Yerine {@link #holderName} kullanılır.
     */
    @Deprecated
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "holder_person_id")
    private Counterpart holderPerson;

    /**
     * Beta v1.1 (WP 2786a36e): CASH_HOLDER bank_account'larda nakdi tutan
     * kişinin adı. Counterpart concept'i artık sadece dış taraflar için
     * (müşteri/tedarikçi/diğer). Eldeki nakit için holderName + opsiyonel
     * telefon/notes. {@code type=CASH_HOLDER} ise yeni create'lerde zorunlu.
     */
    @Column(name = "holder_name", length = 200)
    private String holderName;

    @Column(name = "holder_phone", length = 20)
    private String holderPhone;

    @Column(name = "holder_notes", columnDefinition = "TEXT")
    private String holderNotes;

    /**
     * v1.7.0.x: Banka hesabının ait olduğu kendi firmamız (MyCompany).
     * Opsiyonel — null ise henüz firma atanmamış. POS tx settlement'ında
     * ve transfer akışında UI bu alanı kullanarak hesap dropdown'unu
     * filtreler (POS device.ownerMyCompany ile eşleşen banka hesapları).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_my_company_id")
    private MyCompany ownerMyCompany;

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

    /**
     * v1.6.23.27 (UI Fix WP TODO 7e0c5333): Sistem-managed hesap.
     * Her business için 1 default "Genel Nakit" CASH_HOLDER auto-create
     * edilir ({@code is_system=true}). NAKIT tx bank_account_id boşsa buraya
     * route edilir. User silinemez, name dışındaki alanları edit edemez.
     * Validation: {@code is_system=true} CASH_HOLDER için
     * {@code holder_person_id} null olabilir.
     */
    @Column(name = "is_system", nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean system = false;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
