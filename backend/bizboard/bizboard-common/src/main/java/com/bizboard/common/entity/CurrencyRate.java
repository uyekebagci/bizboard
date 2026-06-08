package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WP a9da4e9d (USD+Altın): Global döviz/altın kuru cache satırı.
 *
 * <p>1 birim kaynak para = {@code rateToTry} TL. Örn. code="USD" → 1 USD = X TL;
 * code="GOLD" → 1 gram altın = Y TL.</p>
 *
 * <p>Mimari sınıf: <b>B (Master/shared)</b> — multi-tenant DEĞİL, tüm tenant'lar
 * aynı kuru okur. {@code business_id} yok. Yazma yalnız {@code ExchangeRateService}
 * (scheduled + manuel refresh) tarafından.</p>
 *
 * <p>{@code code} unique — kur başına tek satır (upsert). {@code stale} alanı dış
 * API down iken son değerin "bayat" servis edildiğini işaretler.</p>
 */
@Entity
@Table(name = "currency_rates",
        uniqueConstraints = @UniqueConstraint(name = "uq_currency_rate_code", columnNames = "code"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CurrencyRate {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Kur kodu: "USD" veya "GOLD" (gram altın). TRY tutulmaz (her zaman 1). */
    @Column(name = "code", nullable = false, length = 10, unique = true)
    private String code;

    /** 1 birim bu para = rateToTry TL. precision yüksek (altın × usd türevi için). */
    @Column(name = "rate_to_try", nullable = false, precision = 19, scale = 6)
    private BigDecimal rateToTry;

    /** Kaynak: "TCMB", "FRANKFURTER", "FRANKFURTER+TCMB" (XAU türevi), vb. */
    @Column(name = "source", length = 40)
    private String source;

    /** Dış API'den son başarılı çekim anı. */
    @Column(name = "fetched_at")
    private LocalDateTime fetchedAt;

    /** Dış API down → son değer "bayat" servis ediliyor. */
    @Column(name = "stale", nullable = false)
    @Builder.Default
    private boolean stale = false;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
