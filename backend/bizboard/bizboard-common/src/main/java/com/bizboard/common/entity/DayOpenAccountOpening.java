package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ledger v2 (Faz B — Gün Açılışı) — bir gün-açılışındaki TEK para-hesabın açılış
 * bacağı. {@link DayCloseAccountCount} (gün sonu sayımı) ile simetrik.
 *
 * <ul>
 *   <li>{@code carriedOver} — önceki gün CLOSED actual'ından OTOMATİK gelen devir
 *       (hesap özelinde; {@code accountComputedAsOf(account, prevCloseDate)} ya da
 *       prior DayClose.account_count.counted).</li>
 *   <li>{@code rounded}     — kullanıcının elle düzelttiği (yuvarladığı) açılış.
 *       Verilmezse carriedOver'a eşittir (delta=0).</li>
 *   <li>{@code roundingDelta} — rounded − carriedOver (bu hesabın yuvarlama farkı).
 *       Σ delta için gün-seviyesi "Devir Yuvarlama" posting'i üretilir (Σ=0).</li>
 * </ul>
 *
 * <p>"Parası olan" (posting-türetilebilir konum) her hesap için bir satır:
 * CASH_HOLDER/CHECKING/SAVINGS/POS_SETTLEMENT/ASSET. MAIN_CASH/SUB_CASH dahil
 * edilmez (aggregate/read-only).</p>
 */
@Entity
@Table(name = "day_open_account_openings", uniqueConstraints = {
        @UniqueConstraint(name = "uk_doao_dayopen_account",
                columnNames = {"day_open_id", "account_id"})
}, indexes = {
        @Index(name = "idx_doao_dayopen", columnList = "day_open_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DayOpenAccountOpening {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "day_open_id", nullable = false)
    private DayOpen dayOpen;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private BankAccount account;

    /** Önceki CLOSED gün actual'ından otomatik devir (hesap özelinde). */
    @Column(name = "carried_over", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal carriedOver = BigDecimal.ZERO;

    /** Kullanıcının yuvarladığı açılış (verilmezse carriedOver). */
    @Column(name = "rounded", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal rounded = BigDecimal.ZERO;

    /** rounded − carriedOver (bu hesabın yuvarlama farkı). */
    @Column(name = "rounding_delta", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal roundingDelta = BigDecimal.ZERO;
}
