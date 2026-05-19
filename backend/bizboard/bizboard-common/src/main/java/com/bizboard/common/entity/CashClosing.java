package com.bizboard.common.entity;

import com.bizboard.common.enums.CashClosingStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.18 (WP-1): Günlük kasa kapanışı.
 *
 * <p>Her takvim günü için bir kayıt (UNIQUE closing_date). Sistem cron ile gün
 * sonu otomatik kayıt açar (status=PENDING); kullanıcı physical sayım sonucu
 * {@code actualBalance}'i girip {@code difference}'i not ederek kapatır
 * (status=CLOSED). Düzeltme için CLOSED → REOPENED.</p>
 *
 * <p>{@code reasonCategory} fark için kategorik açıklama:
 * LOSS / MIS_ENTRY / ROUNDING / OTHER.</p>
 */
@Entity
@Table(name = "cash_closings", uniqueConstraints = {
        @UniqueConstraint(name = "uk_cash_closing_date", columnNames = "closing_date")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CashClosing {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "closing_date", nullable = false, unique = true)
    private LocalDate closingDate;

    /** Açılış bakiyesi — bir önceki günün kapanışı (chain). */
    @Column(name = "opening_balance", nullable = false, precision = 19, scale = 2)
    private BigDecimal openingBalance;

    /**
     * Sistemin hesapladığı kapanış: opening + gün içinde girilen
     * (gelir - gider) nakit hareketleri.
     */
    @Column(name = "computed_closing", nullable = false, precision = 19, scale = 2)
    private BigDecimal computedClosing;

    /**
     * Kullanıcının physical sayımdan girdiği gerçek bakiye.
     * status=PENDING iken null; CLOSED'da doldurulmuş olmalı.
     */
    @Column(name = "actual_balance", precision = 19, scale = 2)
    private BigDecimal actualBalance;

    /** actual_balance - computed_closing. Pozitif: fazla; negatif: eksik. */
    @Column(precision = 19, scale = 2)
    private BigDecimal difference;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private CashClosingStatus status = CashClosingStatus.PENDING;

    /** Sistem otomatik mi açtı yoksa kullanıcı manuel mi? */
    @Column(name = "is_auto", nullable = false)
    @Builder.Default
    private boolean auto = false;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "closed_by")
    private UUID closedBy;

    /**
     * Fark sebebi (closed iken doldurulur, difference != 0 ise zorunlu önerilir):
     * LOSS / MIS_ENTRY / ROUNDING / OTHER.
     */
    @Column(name = "reason_category", length = 32)
    private String reasonCategory;

    @Column(name = "reason_note", columnDefinition = "TEXT")
    private String reasonNote;

    /** Sabitler — reason_category için kanonik değerler. */
    public static final String REASON_LOSS = "LOSS";
    public static final String REASON_MIS_ENTRY = "MIS_ENTRY";
    public static final String REASON_ROUNDING = "ROUNDING";
    public static final String REASON_OTHER = "OTHER";
}
