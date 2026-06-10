package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5 / §6 / TODO 2) — gün + POS-cihaz bazlı T+1 yatış toplu
 * kaydı. Gün kapanışında o POS cihazına banka yatışı girilince ortalama
 * komisyon kesinleşir:
 *
 * <pre>
 *   ort.komisyon = 1 − (yatan ÷ o gün POS brüt)
 *   avgCommissionRate (yüzde) = (1 − deposited/gross) × 100
 * </pre>
 *
 * <p><b>Zamanlama:</b> deal günü her PosDeal {@code PROVISIONAL} (OWNER_COMMISSION
 * payı deviceBankRate tahminiyle); settlement girilince batch {@code FINALIZED}
 * olur → bu batch'e bağlı her deal için OWNER_COMMISSION (Tuncay) payı ort.
 * komisyonla yeniden hesaplanır ve provisional ile arasındaki fark "final adjust"
 * posting'i olarak operatör kasasına yazılır (§3.11, KARAR 2 azaltma: provisional
 * ve final ayrı izli + idempotent).</p>
 *
 * <p><b>FLAGGED bekleyen (KARAR 2):</b> bir gün için POS brüt > 0 ama settlement
 * girilmemişse deal'ler PROVISIONAL kalır; UI bunu "yatış bekliyor" olarak
 * gösterir (kaçak adayı). {@code deposited=null} = henüz yatış girilmedi.</p>
 *
 * <p>UNIQUE(business, settle_date, pos_device) — bir gün + cihaz için tek batch
 * (idempotent finalize; tekrar koşturma aynı sonuç).</p>
 */
@Entity
@Table(name = "pos_settlement_batches", uniqueConstraints = {
        @UniqueConstraint(name = "uk_pos_batch_biz_date_device",
                columnNames = {"business_id", "settle_date", "pos_device_id"})
}, indexes = {
        @Index(name = "idx_pos_batch_biz_date", columnList = "business_id, settle_date")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PosSettlementBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Yatışın ait olduğu (deal'lerin) günü = POS brüt günü. */
    @Column(name = "settle_date", nullable = false)
    private LocalDate settleDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pos_device_id", nullable = false)
    private PosDevice posDevice;

    /** O gün o cihazdaki tüm deal'lerin brüt toplamı (settlement anında snapshot). */
    @Column(name = "gross_total", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal grossTotal = BigDecimal.ZERO;

    /**
     * Bankadan yatan net tutar (kullanıcı gün kapanışında girer). NULL = henüz
     * girilmedi (deal'ler PROVISIONAL/FLAGGED bekliyor).
     */
    @Column(name = "deposited_amount", precision = 19, scale = 2)
    private BigDecimal depositedAmount;

    /**
     * Ortalama komisyon oranı (yüzde) = (1 − deposited/gross) × 100. NULL =
     * henüz finalize edilmedi. Bu, OWNER_COMMISSION payında "ort.komisyon"dur.
     */
    @Column(name = "avg_commission_rate", precision = 7, scale = 4)
    private BigDecimal avgCommissionRate;

    /** Banka hesabı (yatışın düştüğü) — opsiyonel iz. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deposit_account_id")
    private BankAccount depositAccount;

    /** Finalize edildi mi? (ort.komisyon hesaplandı + OWNER_COMMISSION adjust postalandı). */
    @Column(name = "finalized", nullable = false)
    @Builder.Default
    private boolean finalized = false;

    @Column(name = "finalized_at")
    private LocalDateTime finalizedAt;

    @Column(name = "finalized_by")
    private UUID finalizedBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
