package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * e-Fatura satır kalemi — UBL-TR {@code cac:InvoiceLine}.
 *
 * <p>Her satır bir ürün/hizmet: ad, miktar, birim, birim fiyat, iskonto,
 * KDV oranı, satır toplamı (KDV hariç/dahil). KDV tutarı ve toplamlar servis
 * katmanında {@code BigDecimal} ile (HALF_UP, 2 hane) hesaplanır.</p>
 */
@Entity
@Table(name = "invoice_lines")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceLine {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    /** Satır sırası (1'den başlar) — UBL {@code cbc:ID}. */
    @Column(name = "line_number", nullable = false)
    private Integer lineNumber;

    @Column(name = "item_name", nullable = false, length = 500)
    private String itemName;

    @Column(name = "description", columnDefinition = "text")
    private String description;

    /** UBL birim kodu (örn. "C62"=adet, "KGM"=kg, "MTR"=metre). */
    @Column(name = "unit_code", nullable = false, length = 16)
    @ColumnDefault("'C62'")
    @Builder.Default
    private String unitCode = "C62";

    @Column(name = "quantity", nullable = false, precision = 19, scale = 4)
    @ColumnDefault("1")
    @Builder.Default
    private BigDecimal quantity = BigDecimal.ONE;

    /** Birim fiyat (KDV hariç). */
    @Column(name = "unit_price", nullable = false, precision = 19, scale = 4)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal unitPrice = BigDecimal.ZERO;

    /** KDV oranı yüzde olarak (örn. 20.00 = %20). */
    @Column(name = "vat_rate", nullable = false, precision = 5, scale = 2)
    @ColumnDefault("20")
    @Builder.Default
    private BigDecimal vatRate = new BigDecimal("20.00");

    /** Satır iskonto tutarı (KDV hariç). */
    @Column(name = "discount_amount", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal discountAmount = BigDecimal.ZERO;

    // ── Hesaplanan alanlar (servis doldurur) ─────────────────────────────

    /** Satır mal/hizmet tutarı = miktar × birim fiyat − iskonto (KDV hariç). */
    @Column(name = "line_extension_amount", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal lineExtensionAmount = BigDecimal.ZERO;

    /** Satır KDV tutarı. */
    @Column(name = "vat_amount", nullable = false, precision = 19, scale = 2)
    @ColumnDefault("0")
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;
}
