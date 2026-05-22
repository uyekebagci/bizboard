package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.7.x WP fbb2ef55: Bir alacak/verecek üzerinde yapılan kısmi veya tam ödemenin
 * kaydı. Bir payment birden fazla debt'e allocate edilebilir; her allocation için
 * bir debt_payment satırı oluşur (debt_id NULL ise generic FIFO ile dağıtılmıştır).
 *
 * <p>linked_transaction_id: nakit/havale için tx ile bağ. Çek/senet için
 * PORTFOLIO durumunda null; CLEARED olunca o noktada açılan tx ile bağlanır.</p>
 *
 * <p>linked_instrument_id: çek/senet ödemesi ise hangi instrument ile yapıldığı.</p>
 */
@Entity
@Table(name = "debt_payments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DebtPayment {

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

    /** Hangi debt'e allocate. null = generic payment, FIFO ile dağıtılmış. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "debt_id")
    private Debt debt;

    /** RECEIVED (alacak tahsili) | PAID (verecek ödemesi) */
    @Column(name = "payment_direction", nullable = false, length = 10)
    private String paymentDirection;

    /** NAKIT | HESAPDAN | CHEQUE | PROMISSORY_NOTE */
    @Column(name = "payment_method", nullable = false, length = 20)
    private String paymentMethod;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(name = "payment_date", nullable = false)
    private LocalDate paymentDate;

    /** Nakit/havale ile yapılmış ödemenin tx kaydı. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_transaction_id")
    private Transaction linkedTransaction;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private BankAccount bankAccount;

    /** Çek/senet ödemesi ise. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_instrument_id")
    private PaymentInstrument linkedInstrument;

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
