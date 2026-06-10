package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.6) — bir gün-kapanışındaki TEK hesabın gerçek (sayılan)
 * bakiyesi. "SON KASA = Σ DayCloseAccountCount.countedBalance".
 *
 * <p><b>Zorunlu sayım:</b> gün kapanışında "parası olan" her hesap (CASH_HOLDER,
 * CHECKING, SAVINGS, POS_SETTLEMENT, ASSET — yani posting-türetilebilir konum
 * hesapları) için kullanıcı GERÇEK bakiyeyi girer. MAIN_CASH/SUB_CASH aggregate/
 * read-only kâr-merkezi olduğundan sayıma DAHİL EDİLMEZ (§3.11/§3.12).</p>
 *
 * <p>{@code computedBalance} sistemin o hesap için posting'ten türettiği bakiye
 * (drill-down/kaçak kaynak tespiti için kaydedilir): hesap bazında
 * {@code countedBalance − computedBalance} sapması hangi hesabın kaçtığını
 * gösterir.</p>
 */
@Entity
@Table(name = "day_close_account_counts", uniqueConstraints = {
        @UniqueConstraint(name = "uk_dcac_dayclose_account",
                columnNames = {"day_close_id", "account_id"})
}, indexes = {
        @Index(name = "idx_dcac_dayclose", columnList = "day_close_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DayCloseAccountCount {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "day_close_id", nullable = false)
    private DayClose dayClose;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private BankAccount account;

    /** Kullanıcının physical sayımdan girdiği GERÇEK bakiye (zorunlu). */
    @Column(name = "counted_balance", nullable = false, precision = 19, scale = 2)
    private BigDecimal countedBalance;

    /**
     * Sistemin o hesap için posting'ten türettiği bakiye (snapshot, drill-down
     * için). Sayım girilirken kaydedilir; null olabilir (eski kayıt).
     */
    @Column(name = "computed_balance", precision = 19, scale = 2)
    private BigDecimal computedBalance;

    /**
     * Bu hesap özelinde sapma = computed − counted (drill-down; null olabilir).
     * Faz C: gün-seviyesi {@code variance = computed − actual} ile HİZALI (KARAR A1).
     * Pozitif = beklenenden AZ sayıldı (eksik/kaçak); negatif = fazla.
     * (Eski Faz B davranışı {@code counted − computed} TERS idi; guardian notuyla
     * hizalandı.)
     */
    @Column(name = "account_variance", precision = 19, scale = 2)
    private BigDecimal accountVariance;
}
