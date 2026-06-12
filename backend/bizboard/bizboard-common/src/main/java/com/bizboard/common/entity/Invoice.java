package com.bizboard.common.entity;

import com.bizboard.common.enums.InvoiceScenario;
import com.bizboard.common.enums.InvoiceStatus;
import com.bizboard.common.enums.InvoiceType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * e-Fatura — UBL-TR 1.2 fatura başlığı (modül: e-Fatura, Çatı v1.1).
 *
 * <p>Tek bir Türk e-Faturasının kalıcı modeli. UBL-TR şemasının zorunlu
 * başlık alanlarını (ETTN/UUID, fatura no, tarih, senaryo/tip, satıcı &amp;
 * alıcı VKN/unvan/adres, KDV ve toplamlar) taşır; satır kalemleri
 * {@link InvoiceLine} ile {@code OneToMany} ilişkide tutulur.</p>
 *
 * <p><b>Tenant-scope:</b> her fatura bir {@link Business}'a bağlıdır
 * ({@code business_id} NOT NULL FK). Tüm okuma/yazma {@code BusinessAccessGuard}
 * ile filtrelenir — cross-tenant sızıntı yoktur.</p>
 *
 * <p><b>Entegratör-bağımsız:</b> XML üretimi ve imzalama yerelde çalışır;
 * gönderim {@code EInvoiceIntegrator} arayüzü üzerinden yapılır. Entegratör
 * yapılandırılmamışsa fatura DRAFT/SIGNED kalır, gönderim "yapılandırılmadı"
 * hatası verir (graceful degradation).</p>
 *
 * <p><b>Migration:</b> {@code @ColumnDefault} + Hibernate {@code ddl-auto=update}
 * ile idempotent — boş tablo oluşur, var olan satırlar bozulmaz.</p>
 */
@Entity
@Table(
        name = "invoices",
        uniqueConstraints = {
                // Aynı işletme içinde fatura numarası benzersiz olmalı.
                @UniqueConstraint(name = "uk_invoice_business_number",
                        columnNames = {"business_id", "invoice_number"})
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Invoice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Tenant binding — fatura mutlaka bir işletmeye aittir. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    // ── Kimlik / numara ──────────────────────────────────────────────

    /**
     * Fatura numarası — GİB formatı 16 hane (3 harf seri + 4 hane yıl + 9 hane
     * sıra, örn. "ABC2026000000001"). v1.1'de kullanıcı/servis üretebilir;
     * işletme bazında benzersizdir.
     */
    @Column(name = "invoice_number", nullable = false, length = 32)
    private String invoiceNumber;

    /**
     * ETTN — Evrensel Tekil Tanımlama Numarası (UBL-TR {@code cbc:UUID}).
     * Her e-Fatura için zorunlu, üretimde otomatik atanır.
     */
    @Column(name = "ettn", nullable = false, length = 36)
    private String ettn;

    @Column(name = "issue_date", nullable = false)
    private LocalDate issueDate;

    /** İsteğe bağlı — fatura saati (UBL-TR {@code cbc:IssueTime}). */
    @Column(name = "issue_time")
    private java.time.LocalTime issueTime;

    @Enumerated(EnumType.STRING)
    @Column(name = "scenario", nullable = false, length = 16)
    @ColumnDefault("'TEMEL'")
    @Builder.Default
    private InvoiceScenario scenario = InvoiceScenario.TEMEL;

    @Enumerated(EnumType.STRING)
    @Column(name = "invoice_type", nullable = false, length = 16)
    @ColumnDefault("'SATIS'")
    @Builder.Default
    private InvoiceType invoiceType = InvoiceType.SATIS;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    @ColumnDefault("'DRAFT'")
    @Builder.Default
    private InvoiceStatus status = InvoiceStatus.DRAFT;

    @Column(name = "currency", nullable = false, length = 3)
    @ColumnDefault("'TRY'")
    @Builder.Default
    private String currency = "TRY";

    // ── Satıcı (supplier) snapshot — MyCompany'den kopyalanır ────────────
    //
    // Snapshot tutulur çünkü MyCompany sonradan değişse bile kesilmiş faturanın
    // satıcı bilgisi hukuki olarak sabit kalmalıdır.

    @Column(name = "supplier_tax_id", nullable = false, length = 11)
    private String supplierTaxId;

    @Column(name = "supplier_title", nullable = false, length = 500)
    private String supplierTitle;

    @Column(name = "supplier_tax_office", length = 255)
    private String supplierTaxOffice;

    @Column(name = "supplier_address", columnDefinition = "text")
    private String supplierAddress;

    @Column(name = "supplier_city", length = 100)
    private String supplierCity;

    @Column(name = "supplier_district", length = 100)
    private String supplierDistrict;

    @Column(name = "supplier_country", length = 100)
    @ColumnDefault("'Türkiye'")
    @Builder.Default
    private String supplierCountry = "Türkiye";

    /** Opsiyonel kaynak FK — hangi MyCompany'den snapshot alındı (iz için). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supplier_company_id")
    private MyCompany supplierCompany;

    // ── Alıcı (customer) snapshot — Counterpart'tan kopyalanır ───────────

    /** Bireysel (TCKN) faturalarda null olabilir; tüzel için VKN zorunlu. */
    @Column(name = "customer_tax_id", length = 11)
    private String customerTaxId;

    @Column(name = "customer_title", nullable = false, length = 500)
    private String customerTitle;

    @Column(name = "customer_tax_office", length = 255)
    private String customerTaxOffice;

    @Column(name = "customer_address", columnDefinition = "text")
    private String customerAddress;

    @Column(name = "customer_city", length = 100)
    private String customerCity;

    @Column(name = "customer_district", length = 100)
    private String customerDistrict;

    @Column(name = "customer_country", length = 100)
    @ColumnDefault("'Türkiye'")
    @Builder.Default
    private String customerCountry = "Türkiye";

    /** Opsiyonel kaynak FK — hangi Counterpart'tan snapshot alındı. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_counterpart_id")
    private Counterpart customerCounterpart;

    // ── Toplamlar (UBL-TR LegalMonetaryTotal) ────────────────────────────

    /** Satır toplamları (KDV hariç) — LineExtensionAmount Σ. */
    @Column(name = "line_extension_amount", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal lineExtensionAmount = BigDecimal.ZERO;

    /** İskonto sonrası vergi hariç matrah — TaxExclusiveAmount. */
    @Column(name = "tax_exclusive_amount", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal taxExclusiveAmount = BigDecimal.ZERO;

    /** Vergi dahil tutar — TaxInclusiveAmount. */
    @Column(name = "tax_inclusive_amount", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal taxInclusiveAmount = BigDecimal.ZERO;

    /** Toplam KDV tutarı. */
    @Column(name = "total_tax_amount", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal totalTaxAmount = BigDecimal.ZERO;

    /** Toplam iskonto. */
    @Column(name = "allowance_total_amount", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal allowanceTotalAmount = BigDecimal.ZERO;

    /** Ödenecek tutar — PayableAmount. */
    @Column(name = "payable_amount", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal payableAmount = BigDecimal.ZERO;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    // ── Üretim / entegratör izleri ───────────────────────────────────────

    /**
     * Üretilen UBL-TR XML — başvuru/önizleme/yeniden indirme için saklanır.
     * İmzasız (mali mühür entegratörde/yerelde uygulanır). Büyük olabilir → text.
     */
    @Column(name = "ubl_xml", columnDefinition = "text")
    private String ublXml;

    /** XML üretim/imza zaman damgası. */
    @Column(name = "generated_at")
    private LocalDateTime generatedAt;

    /** Hangi entegratör gönderdi (örn. "noop", "foriba"). Gönderilmediyse null. */
    @Column(name = "integrator_key", length = 64)
    private String integratorKey;

    /** Entegratörün döndürdüğü işlem/dış referans no. */
    @Column(name = "integrator_ref", length = 128)
    private String integratorRef;

    /** Entegratör tarafındaki ham durum metni (kabul/ret/bekliyor). */
    @Column(name = "integrator_status", length = 64)
    private String integratorStatus;

    /** Son entegratör hata mesajı (varsa). */
    @Column(name = "integrator_error", columnDefinition = "text")
    private String integratorError;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    // ── Satır kalemleri ──────────────────────────────────────────────────

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("lineNumber ASC")
    @Builder.Default
    private List<InvoiceLine> lines = new ArrayList<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /** Helper — satır ekle + iki yönlü ilişkiyi kur. */
    public void addLine(InvoiceLine line) {
        line.setInvoice(this);
        this.lines.add(line);
    }
}
