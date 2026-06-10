package com.bizboard.common.entity;

import com.bizboard.common.enums.ProfitShareRuleType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.4 / §6 / TODO 3) — operatör başına konfigüre POS kâr-payı
 * kuralı. Kâr-payı motorunun ({@code ProfitShareEngine}) çekirdek girdisi.
 *
 * <p>Bir kural bir operatörü ({@code operatorCounterpart}) + onun kâr-merkezi
 * kasasını ({@code targetSubCashAccount}, SUB_CASH/PROFIT_CENTER) + hesaplama
 * tipini ({@link ProfitShareRuleType}) + opsiyonel oran override'ını
 * ({@code overridePct}) taşır.</p>
 *
 * <h3>Oran kaynağı hiyerarşisi (§3.4 — KİLİTLİ):</h3>
 * <ol>
 *   <li>{@code overridePct} (bu kural — operatör/cihaz başına override; bugün boş)</li>
 *   <li>{@code posDevice.ourCommissionRate}/{@code defaultRate} (cihaz başına)</li>
 *   <li>Global config default ({@code ProfitShareConfig}: sahip%5/Fatih%4.5/Tuncay%5)</li>
 * </ol>
 * <p>Bugün override'lar boş → tek global config satırı tüm payları besler.
 * İleride bir operatör/cihaz farklılaşırsa SADECE {@code overridePct} girilir —
 * şema/akış değişmez (rakam hard-code edilmez).</p>
 *
 * <p>{@code posDevice} NULL = tüm cihazlar için (operatör-bazlı kural);
 * dolu = sadece o cihaz için (cihaz-bazlı override). {@code priority} çakışmada
 * en spesifik (düşük sayı = yüksek öncelik) kazanır.</p>
 */
@Entity
@Table(name = "profit_share_rules", indexes = {
        @Index(name = "idx_psr_business", columnList = "business_id"),
        @Index(name = "idx_psr_operator", columnList = "operator_counterpart_id"),
        @Index(name = "idx_psr_device", columnList = "pos_device_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProfitShareRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /**
     * Operatörün kimliği (Kemal/Fatih/Tuncay — kişi/{@code Counterpart}).
     * RESIDUAL (şirket) kuralında NULL olabilir.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "operator_counterpart_id")
    private Counterpart operatorCounterpart;

    /**
     * Operatörün kâr-merkezi kasası (SUB_CASH/PROFIT_CENTER). Pay buraya
     * auto-postalanır. RESIDUAL kuralında NULL (şirket P&L'ine yazılır).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_subcash_account_id")
    private BankAccount targetSubCashAccount;

    /**
     * Cihaz-bazlı kural (NULL = tüm cihazlar / operatör-bazlı). Dolu = sadece bu
     * cihazdaki deal'lere uygulanır.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pos_device_id")
    private PosDevice posDevice;

    @Enumerated(EnumType.STRING)
    @Column(name = "rule_type", nullable = false, length = 24)
    private ProfitShareRuleType ruleType;

    /**
     * Oran override (yüzde) — §3.4 hiyerarşi 1. NULL = config/cihaz oranına düş.
     * Semantiği kural tipine göre: MARGIN_PCT'te marj çarpanı (Fatih %4.5);
     * RATE_SPREAD/OWNER_COMMISSION'da sahip baz oranı override'ı.
     */
    @Column(name = "override_pct", precision = 7, scale = 4)
    private BigDecimal overridePct;

    @Column(name = "is_active", nullable = false)
    @ColumnDefault("true")
    @Builder.Default
    private boolean active = true;

    /** Çakışmada öncelik — düşük sayı = yüksek öncelik (cihaz-bazlı < operatör-bazlı). */
    @Column(nullable = false)
    @ColumnDefault("100")
    @Builder.Default
    private int priority = 100;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
