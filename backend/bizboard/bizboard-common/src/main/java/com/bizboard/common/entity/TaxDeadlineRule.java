package com.bizboard.common.entity;

import com.bizboard.common.enums.TaxFrequency;
import com.bizboard.common.enums.TaxObligationType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Vergi Takvimi Modülü — TR vergi son tarihleri için <b>tekrarlayan kural</b>.
 *
 * <p>Vergi takvimi yıl bazlı tekrar eder; bu yüzden her yıl için ayrı satır
 * tutmak yerine kuralları saklarız. {@code TaxCalendarService} verilen bir
 * tarih aralığında bu kurallardan somut son tarihleri (occurrence) üretir.</p>
 *
 * <p>Kural anlamı sıklığa göre:</p>
 * <ul>
 *   <li><b>MONTHLY</b>: her ay; son tarih = (dönem ayı + {@code monthOffset}) ayının
 *       {@code dayOfMonth}'i. {@code dayOfMonth = 0} → ayın son günü.</li>
 *   <li><b>QUARTERLY</b>: her çeyrek; çeyrek bitiminden sonra {@code monthOffset} ay
 *       ilerideki ayın {@code dayOfMonth}'i. {@code quarterMask} hangi çeyreklerin
 *       aktif olduğunu bit olarak tutar (Q1=1, Q2=2, Q3=4, Q4=8).</li>
 *   <li><b>YEARLY</b>: izleyen yılın {@code fixedMonth}. ayının {@code dayOfMonth}'i.</li>
 * </ul>
 *
 * <p>Bu master data tüm tenant'lar için ortaktır (işletmeye bağlı değildir);
 * GİB takvimi geneldir. Seed {@code TaxCalendarSeedRunner} ile idempotent yüklenir.</p>
 */
@Entity
@Table(name = "tax_deadline_rules")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TaxDeadlineRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Vergi yükümlülük türü (KDV, Muhtasar, …). Aynı türde birden fazla kural olabilir. */
    @Enumerated(EnumType.STRING)
    @Column(name = "obligation_type", nullable = false, length = 40)
    private TaxObligationType obligationType;

    /** Tekrarlama sıklığı. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TaxFrequency frequency;

    /**
     * Son tarihin ayın hangi günü olduğu (1-31). {@code 0} → ilgili ayın son günü
     * (ör. BA-BS izleyen ayın son günü). Şubat gibi kısa aylarda gün otomatik
     * o ayın son gününe sıkıştırılır.
     */
    @Column(name = "day_of_month", nullable = false)
    private int dayOfMonth;

    /**
     * MONTHLY/QUARTERLY: dönem (ay/çeyrek) bitiminden son tarihe kadar ileri ay sayısı.
     * Ör. KDV izleyen ay → {@code monthOffset = 1}. Geçici vergi çeyrek bitiminden
     * sonra 2. ay → {@code monthOffset = 2}.
     */
    @Column(name = "month_offset", nullable = false)
    private int monthOffset;

    /**
     * YEARLY: son tarihin sabit ayı (1-12). MONTHLY/QUARTERLY'de kullanılmaz (null).
     */
    @Column(name = "fixed_month")
    private Integer fixedMonth;

    /**
     * QUARTERLY: aktif çeyrek bit maskesi (Q1=1, Q2=2, Q3=4, Q4=8). Ör. Geçici vergi
     * için Q4 2022'den itibaren kaldırıldı → maske {@code 1|2|4 = 7}.
     * Diğer sıklıklarda kullanılmaz (null).
     */
    @Column(name = "quarter_mask")
    private Integer quarterMask;

    /** Kullanıcıya gösterilecek TR açıklama (ör. "KDV beyan ve ödeme son günü"). */
    @Column(nullable = false, length = 200)
    private String description;

    /**
     * Aynı kuralın tekrar seed edilmesini engelleyen idempotent anahtar
     * (ör. "KDV-MONTHLY"). UNIQUE.
     */
    @Column(name = "seed_key", nullable = false, unique = true, length = 80)
    private String seedKey;

    /** Devre dışı bırakılmış kurallar takvimde/bildirimde gözükmez. */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
