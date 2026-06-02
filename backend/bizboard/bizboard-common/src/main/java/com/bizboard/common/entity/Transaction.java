package com.bizboard.common.entity;

import com.bizboard.common.enums.TransactionDirection;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransactionDirection direction;

    /**
     * v1.7.0-beta (Bankalar WP TODO 0aa4c6d1): Tx tip ekseni —
     * NORMAL (gelir/gider) veya TRANSFER (paired tx, transfer_pair_id ile).
     * DB equivalence constraint: TRANSFER ⟺ transferPairId NOT NULL.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @org.hibernate.annotations.ColumnDefault("'NORMAL'")
    @Builder.Default
    private com.bizboard.common.enums.TransactionKind kind = com.bizboard.common.enums.TransactionKind.NORMAL;

    /**
     * v1.7.0-beta: Paired tx UUID — TRANSFER_OUT ve TRANSFER_IN aynı
     * pair_id'yi paylaşır. NORMAL tx için NULL.
     */
    @Column(name = "transfer_pair_id")
    private java.util.UUID transferPairId;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Builder.Default
    private String currency = "TRY";

    private String description;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "receipt_url")
    private String receiptUrl;

    /**
     * v1.5.6: tek seferlik kurulum maliyeti (business açılış gideri) bayrağı.
     * Yeni işletme wizard'ında "Kurulum maliyetlerini ekle" seçilirse otomatik
     * oluşturulan Transaction'lar bu flag ile işaretlenir. Raporlama tarafı
     * bu sayede setup'ı rutin operasyonel giderden ayırabilir.
     */
    @Column(name = "is_setup_cost", nullable = false)
    @org.hibernate.annotations.ColumnDefault("false")
    @Builder.Default
    private boolean setupCost = false;

    /**
     * v1.6.3: ödeme yöntemi. Geçerli değerler: {@code POS}, {@code NAKIT}, {@code HESAPDAN}.
     *
     * <p>v1.6.23.4 (sandbox-test): HESAPDAN eklendi — banka hesabından yapılan
     * harcamalar (havale/EFT/kart). HESAPDAN tx'leri kasa kapanışına (NAKIT
     * havuzu) DAHİL EDİLMEZ; ilgili {@link #bankAccount}'ın bakiyesini etkiler.
     * Validation: HESAPDAN için {@code bankAccount} zorunludur.</p>
     *
     * <p>Geriye uyumluluk: mevcut tüm tx'ler {@code NAKIT} default'una düşer
     * (Hibernate ddl-auto=update + columnDefinition default).</p>
     */
    @Column(name = "payment_method", nullable = false, length = 16)
    @org.hibernate.annotations.ColumnDefault("'NAKIT'")
    @Builder.Default
    private String paymentMethod = "NAKIT";

    /**
     * v1.6.23.4 (sandbox-test): HESAPDAN ödemeleri için banka hesabı FK.
     * {@code paymentMethod=HESAPDAN} iken zorunlu, diğer payment_method'larda null.
     * Tx kaydedildiğinde ilgili bank_account.current_balance bu tx'in
     * direction'ına göre güncellenir (income → +, expense → -).
     *
     * <p>v1.6.23.9: POS tx'in settle olunca bank_account FK buraya yazılır
     * (hangi banka hesabına düştüğünü iz bırakır).</p>
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private BankAccount bankAccount;

    /**
     * v1.6.23.9 (TODO 6ee7a9f1): POS tx'in hesaba düştüğü zaman damgası.
     * {@code pos_settled=true} iken doldurulur; aksi halde null.
     */
    @Column(name = "settled_at")
    private LocalDateTime settledAt;

    /**
     * v1.6.3: POS işlemi için banka komisyon oranı (yüzde). Yalnız
     * {@code paymentMethod=POS} olduğunda anlamlı. NAKIT için null/0.
     * 5,2 precision: 0.00 — 999.99 (gerçekte 0-100 arası ama check yok).
     */
    @Column(name = "pos_rate", precision = 5, scale = 2)
    private java.math.BigDecimal posRate;

    /**
     * v1.6.18 (WP-1): Karşı taraf (counterpart) — işlem girilirken kullanıcı
     * "kimden / kime" diye seçer. Tek-tenant modda işletme zaten DGR sabit;
     * tx'in farkı counterpart'tır. Nullable — eski kayıtlarda doldurulmaz.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_counterpart_id")
    private Counterpart targetCounterpart;

    /**
     * v1.6.18 (WP-1): Geriye dönük girildi mi? Tx tarihi kullanıcının kayıt
     * oluşturma anından önceyse otomatik {@code true} olur. UI'da uyarı/rozet,
     * audit_log'da {@code highlight_type=BACKDATED}.
     */
    @Column(name = "is_backdated", nullable = false)
    @org.hibernate.annotations.ColumnDefault("false")
    @Builder.Default
    private boolean backdated = false;

    /**
     * v1.6.18 (WP-1): Bu kayıt başka bir tx'in düzeltilmesi sonucu oluştu mu?
     * Düzeltme akışı orijinali "is_corrected=true" yapar + bu yeni tx
     * {@code correctionOfTxId}'yi taşır.
     */
    @Column(name = "is_corrected", nullable = false)
    @org.hibernate.annotations.ColumnDefault("false")
    @Builder.Default
    private boolean corrected = false;

    /** v1.6.18 (WP-1): Bu tx başka bir tx'in düzeltmesi ise orijinalin id'si. */
    @Column(name = "correction_of_tx_id")
    private UUID correctionOfTxId;

    /**
     * v1.6.18 (WP-1): Tx oluşturulduğu anki POS oranı snapshot — cihazın
     * {@code defaultRate}'i sonra değişse bile bu tx'in oranı sabit kalır.
     * {@code paymentMethod=POS} için doldurulur; NAKIT için null.
     */
    @Column(name = "applied_pos_rate", precision = 5, scale = 2)
    private java.math.BigDecimal appliedPosRate;

    /**
     * v1.7.x (POS Komisyon WP TODO 79b2feca): Bizim komisyon oranımız snapshot.
     * {@code applied_pos_rate} semantik olarak BANKA oranıdır. Bu kolon
     * bizim DGR olarak müşteriden aldığımız oran.
     *
     * <p>Profit hesabı:
     * {@code profit = amount × (our_rate − bank_rate) / 100}.</p>
     *
     * <p>DB CHECK: NULL-tolerant; ikisi de set ise our &gt;= bank.
     * Servis: POS tx için zorunlu (validation 400).</p>
     */
    @Column(name = "applied_our_commission_rate", precision = 5, scale = 2)
    private java.math.BigDecimal appliedOurCommissionRate;

    /**
     * v1.6.18 (WP-1): POS cihazı FK. {@code paymentMethod=POS} olan tx'ler bu
     * alanı doldurur — hangi cihazda çekildi raporlama için.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pos_device_id")
    private PosDevice posDevice;

    /**
     * v1.6.18 (WP-1): POS çekimi banka hesabına düştü mü?
     * <ul>
     *   <li>null = nakit / non-POS (anlamsız)</li>
     *   <li>false = POS çekildi ama hesaba henüz düşmedi</li>
     *   <li>true = hesaba düştü</li>
     * </ul>
     * Excel'deki "POS ÇEKİM HESABA GELECEK OLAN" raporu bu flag'i kullanır.
     */
    @Column(name = "pos_settled")
    private Boolean posSettled;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private List<String> tags = List.of();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = Map.of();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /**
     * WP 08617251 (Beta v1.1 Closure Modülü): inline tx ekleme akışında
     * tx'i bir closure session'a etiketler. NULL = normal tx. Session
     * finalize'de strip edilir; rollback'te tx'lerle birlikte silinir.
     */
    @Column(name = "closure_session_id")
    private java.util.UUID closureSessionId;
}
