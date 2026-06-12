package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * "Para İzi" (fund-trail) — bir işlemin parasını bir KAYNAK işleme bağlayan
 * hafif izlenebilirlik kaydı.
 *
 * <p><b>Senaryo:</b> 3M çek tahsil edildi → nakit kasaya GİRDİ (source tx).
 * Sonra 1.5M nakit harcama yapıldı (target tx). Kullanıcı 1.5M'i 3M'lik girişe
 * BIND'lerse: bu entity (source=3M giriş, target=1.5M çıkış, amount=1.5M) yazılır.
 * Artık 1.5M'in detayında "3M tahsilattan geldi", 3M'in detayında "1.5M şuna
 * harcandı + kalan 1.5M" görünür.</p>
 *
 * <h3>STRICT: Bu SADECE İZLENEBİLİRLİK KATMANIDIR — bakiye/P&L/posting'i
 * DEĞİŞTİRMEZ.</h3>
 * Sayılar zaten doğru (her tx kendi başına bakiyeye/P&L'e yansıdı). FundLink
 * yalnız metadata; hiçbir {@link JournalEntry}/{@link Posting} üretmez, hiçbir
 * bakiyeyi okumaz/yazmaz. Çift sayım yoktur.
 *
 * <h3>Tahsis (allocation) modeli:</h3>
 * <ul>
 *   <li>Bir kaynak işlemin {@code amount}'u vardır (örn. 3M giriş).</li>
 *   <li>Bağlar (FundLink) bu tutarın parçalarını tahsis eder.</li>
 *   <li>{@code allocated = Σ (o source'a bağlı FundLink.amount)}.</li>
 *   <li>{@code kalan = source.amount − allocated}. Over-allocation engellenir
 *       (servis: yeni bağ tutarı kalandan büyükse reddedilir).</li>
 *   <li>Kısmi bağ olabilir (1.5M of 3M).</li>
 * </ul>
 *
 * <p>Veri sınıfı: <b>A (Business-bound)</b> — {@code business_id NOT NULL FK}.
 * source/target tx silindiğinde FundLink CASCADE silinir (DB FK
 * ON DELETE CASCADE; ilgili tx silme akışı zaten audit'li).</p>
 */
@Entity
@Table(
        name = "fund_link",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_fund_link_source_target",
                columnNames = {"source_transaction_id", "target_transaction_id"}),
        indexes = {
                @Index(name = "idx_fund_link_source", columnList = "source_transaction_id"),
                @Index(name = "idx_fund_link_target", columnList = "target_transaction_id"),
                @Index(name = "idx_fund_link_business", columnList = "business_id")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FundLink {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Tenant binding — source/target tx ile aynı business olmalı (service validate). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /**
     * Kaynak (genelde GİRİŞ/tahsilat) işlem — "para buradan geldi".
     * Bu işlemin {@code amount}'u tahsis havuzudur.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_transaction_id", nullable = false)
    private Transaction sourceTransaction;

    /**
     * Hedef (genelde ÇIKIŞ/gider/masraf) işlem — "para buraya gitti".
     * Bu işlem kaynağın tutarından {@code amount} kadar tahsis tüketir.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "target_transaction_id", nullable = false)
    private Transaction targetTransaction;

    /**
     * Bu bağda tahsis edilen tutar (kısmi olabilir). Daima &gt; 0 ve
     * kaynağın kalanından (≤) küçük/eşit (servis over-allocation guard).
     */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    /** Opsiyonel kullanıcı notu (ör. "kira ödemesi için"). */
    @Column(length = 500)
    private String note;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
