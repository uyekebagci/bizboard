package com.bizboard.common.entity;

import com.bizboard.common.enums.InstrumentDirection;
import com.bizboard.common.enums.InstrumentStatus;
import com.bizboard.common.enums.InstrumentType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.7) — çek/senet (kıymetli evrak) portföy entity'si.
 *
 * <p>Posting çekirdeğine bağlı YENİ model. Çek/senet PENDING_OCR/CONFIRMED iken
 * bir para hesabını ETKİLEMEZ (sadece portföy/takip); CASHED olunca para hesabına
 * dengeli {@link JournalEntry}+{@link Posting} (Σ=0) yazılır ({@code journalEntryId}
 * o entry'e bağlanır).</p>
 *
 * <h3>İşaret konvansiyonu (tahsil/ödeme posting'i):</h3>
 * <ul>
 *   <li><b>RECEIVED</b> (alacak) tahsil: para hesabı +tutar (LOCATION_MOVE) +
 *       karşı bacak RECEIVABLE clearing (account NULL, −tutar). Net: nakit girer.</li>
 *   <li><b>GIVEN</b> (borç) ödeme: para hesabı −tutar + karşı bacak −(−tutar).
 *       Net: nakit çıkar.</li>
 * </ul>
 *
 * <h3>Ciro/devir (§3.7 ENDORSED):</h3>
 * Bir RECEIVED çek başka bir counterpart'a ciro edilince {@code status=ENDORSED}
 * olur ve {@code endorsedToCounterpart} doldurulur. Ciro zinciri tek seviye
 * (A5 açık karar — basit tutuldu): her ciro yeni bir kayıt değil, mevcut kaydın
 * durum geçişidir; {@code endorsedToCounterpart} son devralanı tutar.
 *
 * <h3>Telegram-foto / OCR (§1 / §7 / TODO 1):</h3>
 * {@code source} = MANUAL | TELEGRAM_PHOTO; {@code photoUrl} + {@code ocrMeta}
 * (jsonb) HAZIRDIR. Gerçek inbound-foto + OCR handler'ı AYRI modülde
 * (Telegram Bot WP b7779199 + OCR Modülü WP 1bdb8116) bu alanları doldurup
 * {@code status=PENDING_OCR} kayıt açacaktır; burada model + manuel giriş +
 * API kurulur.
 *
 * <p>v2.0.0'da Flyway'e taşınınca {@code ddl-auto=update} bağımlılığı kalkar;
 * şema additive — mevcut tablolar etkilenmez.</p>
 */
@Entity
@Table(name = "instruments", indexes = {
        @Index(name = "idx_instrument_business_status", columnList = "business_id, status"),
        @Index(name = "idx_instrument_due", columnList = "business_id, due_date"),
        @Index(name = "idx_instrument_journal", columnList = "journal_entry_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Instrument {

    /** Kaynak: manuel giriş vs Telegram-foto/OCR. */
    public static final String SOURCE_MANUAL = "MANUAL";
    public static final String SOURCE_TELEGRAM_PHOTO = "TELEGRAM_PHOTO";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InstrumentType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private InstrumentDirection direction;

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    @Builder.Default
    private String currency = "TRY";

    /** Keşideci/karşı taraf (çeki yazan/verdiğimiz firma). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issuer_counterpart_id")
    private Counterpart issuerCounterpart;

    /** Bizim hangi firmamız (MyCompany) lehtar/borçlu. Opsiyonel. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "our_company_id")
    private MyCompany ourCompany;

    /** Çekin keşide bankası (serbest metin). */
    @Column(name = "bank_name", length = 120)
    private String bankName;

    /** Çek numarası / senet seri-no (serbest metin). */
    @Column(name = "serial_no", length = 60)
    private String serialNo;

    @Column(name = "issue_date")
    private LocalDate issueDate;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private InstrumentStatus status = InstrumentStatus.CONFIRMED;

    /** Ciro/devir hedefi (status=ENDORSED iken doldurulur). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "endorsed_to_counterpart_id")
    private Counterpart endorsedToCounterpart;

    @Column(name = "endorsed_at")
    private LocalDateTime endorsedAt;

    /** Tahsil/ödeme anında para hesabına yazılan entry (CASHED). */
    @Column(name = "journal_entry_id")
    private UUID journalEntryId;

    /** Tahsil/ödemenin yapıldığı para hesabı (CASHED iken). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cashed_account_id")
    private BankAccount cashedAccount;

    @Column(name = "cashed_at")
    private LocalDateTime cashedAt;

    @Column(name = "bounced_at")
    private LocalDateTime bouncedAt;

    /** §1/§7: kaynak — MANUAL | TELEGRAM_PHOTO. */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String source = SOURCE_MANUAL;

    /** §3.7: foto referansı (Telegram-foto/OCR girişinde dolar). */
    @Column(name = "photo_url", length = 500)
    private String photoUrl;

    /** §3.7: OCR çıktısı/metadata (jsonb-benzeri serbest metin; ayrı modül doldurur). */
    @Column(name = "ocr_meta", columnDefinition = "TEXT")
    private String ocrMeta;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
