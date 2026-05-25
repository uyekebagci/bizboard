package com.bizboard.common.entity;

import com.bizboard.common.enums.CompanyType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * "Benim Firmalarım" — kullanıcının yönettiği tüzel kişiler (Anonim/Limited/Şahıs vb).
 *
 * <p>Bir {@link Business} (ÇATI'daki "işletme") tek bir {@code MyCompany}'ye bağlıdır
 * (operasyonel birim → tüzel kişi). v1.5.0'da {@link Business#myCompany} FK olarak eklendi.</p>
 */
@Entity
@Table(name = "my_companies")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MyCompany {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "legal_name", nullable = false)
    private String legalName;

    /** VKN (10 hane) veya istisnai durumlarda TCKN (11 hane, şahıs). */
    @Column(name = "tax_id", length = 11)
    private String taxId;

    @Column(name = "tax_office")
    private String taxOffice;

    @Column(name = "trade_registry_no")
    private String tradeRegistryNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "company_type", nullable = false, length = 16)
    @Builder.Default
    private CompanyType companyType = CompanyType.OTHER;

    /** NACE faaliyet kodu (örn. "47.11" — perakende gıda mağazaları). */
    @Column(name = "activity_code", length = 32)
    private String activityCode;

    @Column(name = "incorporated_at")
    private LocalDate incorporatedAt;

    @Column(name = "mersis_no", length = 32)
    private String mersisNo;

    @Column(columnDefinition = "text")
    private String address;

    @Column(name = "contact_name")
    private String contactName;

    @Column(name = "contact_phone")
    private String contactPhone;

    @Column(name = "contact_email")
    private String contactEmail;

    /** v1.5.0 bootstrap'inde otomatik oluşturulan "Default Firmam" kaydı için flag. */
    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private boolean isDefault = false;

    /**
     * v1.7.x WP 8b961444 TODO ba04debb: opsiyonel grup atama.
     * ON DELETE SET NULL — grup silinirse firm null'a düşer (gruplanmamış).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id")
    private MyCompanyGroup group;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
