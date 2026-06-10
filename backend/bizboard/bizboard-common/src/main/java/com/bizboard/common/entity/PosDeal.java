package com.bizboard.common.entity;

import com.bizboard.common.enums.PosDealStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5 / §6 / TODO 1) — tek bir POS işlemi (deal). Kâr-payı
 * şelalesinin atıf (attribution) kaynağıdır.
 *
 * <p><b>Operatör girer:</b> brüt tutar + müşteri oranı (ör. %6.5/6/5.5) + POS
 * cihazı (→ sahip otomatik {@code posDevice.ownerMyCompany}) + opsiyonel getiren
 * ({@code referrerCounterpart}). Tarih + işletme.</p>
 *
 * <p><b>İki oran:</b> {@code customerRate} operatörün müşteriden aldığı oran;
 * {@code posDevice.defaultRate} banka oranı (T+1 ort.komisyon tahmini için);
 * {@code posDevice.ourCommissionRate}/config sahip baz oranı. Şelale bu
 * girdilerden payları hesaplar.</p>
 *
 * <p><b>Yaşam döngüsü ({@link PosDealStatus}):</b> create → PROVISIONAL (aynı-gün
 * payları final, OWNER_COMMISSION tahmini); settlement batch finalize → FINALIZED
 * (OWNER_COMMISSION ort.komisyonla kesin). Reversal → REVERSED.</p>
 *
 * <p><b>İdempotency / posting bağı:</b> üretilen kâr-payı journal entry'leri
 * {@code source_type=PROFIT_SHARE} + {@code source_ref_id=deal.id} ile bu deal'e
 * bağlanır (read-only operatör kasası posting'i; §3.11).</p>
 */
@Entity
@Table(name = "pos_deals", indexes = {
        @Index(name = "idx_pos_deal_biz_date", columnList = "business_id, deal_date"),
        @Index(name = "idx_pos_deal_device_date", columnList = "pos_device_id, deal_date"),
        @Index(name = "idx_pos_deal_batch", columnList = "settlement_batch_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PosDeal {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(name = "deal_date", nullable = false)
    private LocalDate dealDate;

    /** Brüt çekilen tutar (komisyon öncesi). */
    @Column(name = "gross_amount", nullable = false, precision = 19, scale = 2)
    private BigDecimal grossAmount;

    /**
     * Operatörün müşteriden aldığı oran (yüzde, ör. 6.50). Kâr-payı şelalesinin
     * temel girdisi: RATE_SPREAD/MARGIN_PCT payı (customerRate − sahip_baz%)'tan.
     */
    @Column(name = "customer_rate", nullable = false, precision = 7, scale = 4)
    private BigDecimal customerRate;

    /** POS cihazı (→ sahip otomatik = posDevice.ownerMyCompany; banka oranı = defaultRate). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pos_device_id", nullable = false)
    private PosDevice posDevice;

    /**
     * Bu deal'in yatış havuzu hesabı (POS sahibi firma adına). Opsiyonel —
     * settlement banka yatışı bu hesaba düşer. Genelde
     * {@code posDevice.ownerMyCompany}'ye bağlı CHECKING/POS_SETTLEMENT.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_account_id")
    private BankAccount ownerAccount;

    /** Opsiyonel getiren (işi getiren kişi/firma — pay kuralında kullanılabilir). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "referrer_counterpart_id")
    private Counterpart referrerCounterpart;

    /**
     * Bağlı olduğu T+1 settlement batch'i (gün+cihaz). Finalize olunca set edilir;
     * OWNER_COMMISSION payı bu batch'in ort.komisyonuyla kesinleşir.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "settlement_batch_id")
    private PosSettlementBatch settlementBatch;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private PosDealStatus status = PosDealStatus.PENDING;

    @Column(name = "settled_at")
    private LocalDateTime settledAt;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
