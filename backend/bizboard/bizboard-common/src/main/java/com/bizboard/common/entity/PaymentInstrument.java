package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.7.x WP fbb2ef55: Çek + senet portföy entity'si.
 *
 * <p>Mevcut {@code debts} tablosunda {@code instrument_type=CEK} satırlarının
 * "ödeme aracı" boyutu burada modellenir. Bir payment_instrument PORTFOLIO
 * durumunda iken bank_balance'ı etkilemez; CLEARED olunca tx açılır + bank
 * balance update edilir. BOUNCED olduğunda ilişkili debt allocations geri açılır.</p>
 *
 * <p>Lifecycle: PORTFOLIO → (CLEARED | BOUNCED | CANCELLED).</p>
 */
@Entity
@Table(name = "payment_instruments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentInstrument {

    @Id
    @UuidGenerator
    @Column(columnDefinition = "uuid")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "counterpart_id", nullable = false)
    private Counterpart counterpart;

    /** CHEQUE | PROMISSORY_NOTE */
    @Column(name = "instrument_type", nullable = false, length = 20)
    private String instrumentType;

    /** INCOMING (counterpart'tan aldık) | OUTGOING (counterpart'a verdik) */
    @Column(nullable = false, length = 10)
    private String direction;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    @Builder.Default
    private String currency = "TRY";

    @Column(name = "issue_date", nullable = false)
    private LocalDate issueDate;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    // ─── Çek alanları ───
    @Column(name = "cheque_number", length = 50)
    private String chequeNumber;

    @Column(name = "drawer_bank", length = 100)
    private String drawerBank;

    @Column(name = "drawer_branch", length = 100)
    private String drawerBranch;

    // ─── Senet alanları ───
    @Column(name = "note_serial", length = 50)
    private String noteSerial;

    /** PORTFOLIO | CLEARED | BOUNCED | CANCELLED */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "PORTFOLIO";

    @Column(name = "cleared_at")
    private LocalDateTime clearedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cleared_bank_account_id")
    private BankAccount clearedBankAccount;

    @Column(name = "bounced_at")
    private LocalDateTime bouncedAt;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
