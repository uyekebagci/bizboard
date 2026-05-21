package com.bizboard.common.entity;

import com.bizboard.common.enums.CounterpartKind;
import com.bizboard.common.enums.CounterpartRole;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * "Karşı Firmalar" — müşteriler, tedarikçiler, ve diğer dış paydaşlar.
 *
 * <p>Cari hesap motorunun çekirdek varlığı. {@link Debt} entity'sine
 * v1.5.0'da eklenen {@code counterpart_id} FK üzerinden bağlanır; eski
 * {@code counterparty} string alanı (free-text) geriye uyum için kalır.</p>
 *
 * <p>Counterpart business'a bağlı değil — bir müşteri birden fazla işletme
 * ile çalışabilir. Yetkilendirme: tüm authenticated kullanıcılar listeler;
 * mutation şu an admin-only değil (v1.5.x içinde refine edilebilir).</p>
 */
@Entity
@Table(name = "counterparts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Counterpart {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * v1.6.23.20 (Security WP / arch-rules §1.1): counterpart tenant binding.
     * Eski model "shared lake" kabul ediyordu — multi-tenant gelince leak
     * oluşturuyordu (USER B, USER A'nın müşterilerini görüyordu). NOT NULL FK
     * ile her counterpart bir işletmeye ait; tüm endpoint'ler
     * {@code accessibleBusinessIds} filter'iyla geçer.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(nullable = false)
    private String name;

    /** Opsiyonel — VKN veya TCKN; verilirse format/checksum kontrolü yapılır. */
    @Column(name = "tax_id", length = 11)
    private String taxId;

    @Column(name = "tax_office")
    private String taxOffice;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private CounterpartRole role = CounterpartRole.OTHER;

    /**
     * v1.6.18 (WP-1): Varlık tipi — PERSON (gerçek kişi) veya FIRM (tüzel kişi).
     * `role` (CUSTOMER/SUPPLIER/BOTH/OTHER) iş ilişkisini; `kind` (PERSON/FIRM) varlık
     * tipini tanımlar. Mevcut kayıtlar default FIRM olur (DGR senaryosunda doğru).
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @ColumnDefault("'FIRM'")
    @Builder.Default
    private CounterpartKind kind = CounterpartKind.FIRM;

    /**
     * v1.6.18 (WP-1): Alt-firma hiyerarşisi. Bir firma başka bir firmanın altında
     * olabilir (örn. holding → bağlı şirket). Tree depth maks 2 — uygulama
     * katmanında zorlanır.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Counterpart parent;

    @Column(name = "contact_name")
    private String contactName;

    @Column(name = "contact_phone")
    private String contactPhone;

    @Column(name = "contact_email")
    private String contactEmail;

    @Column(columnDefinition = "text")
    private String address;

    /**
     * Cached cari bakiye: alacak - borç. v1.5.1'de cari motor lazy
     * compute eder; v1.5.0'da default 0. {@code @ColumnDefault} ile
     * existing rows üretildiğinde Hibernate ALTER TABLE temiz çalışsın.
     */
    @Column(name = "current_balance", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal currentBalance = BigDecimal.ZERO;

    @Column(name = "payment_terms_days", nullable = false)
    @ColumnDefault("0")
    @Builder.Default
    private Integer paymentTermsDays = 0;

    @Column(columnDefinition = "text")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
