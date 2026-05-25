package com.bizboard.common.entity;

import com.bizboard.common.enums.InclusionScope;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WP Sub-Cash Retroactive Inclusion: bir sub-cash ile bir tx arasındaki
 * "dahil" ilişkisi.
 *
 * <p>Eski model (multi-attribution runtime query) yerine: sub-cash income
 * yalnız bu tabloda kayıtlı tx'leri sayar. Tx create/update'te
 * {@link InclusionScope#AUTOMATIC}, kullanıcı UI'sından manuel ekleme
 * {@link InclusionScope#RETROACTIVE}.</p>
 *
 * <p>Aynı (sub_cash, tx) çifti yalnız 1 kez (DB unique). Tx silindiğinde
 * inclusion CASCADE silinir; sub-cash (bank_account SUB_CASH tipi) silindiğinde
 * de aynı.</p>
 */
@Entity
@Table(name = "sub_cash_tx_inclusion")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubCashTxInclusion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Tenant binding — sub-cash ile aynı business olmalı (service validate). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Sub-cash (BankAccount, type=SUB_CASH). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sub_cash_bank_account_id", nullable = false)
    private BankAccount subCash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "transaction_id", nullable = false)
    private Transaction transaction;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false, length = 15)
    private InclusionScope scope;

    @CreationTimestamp
    @Column(name = "included_at", updatable = false)
    private LocalDateTime includedAt;

    /** AUTOMATIC için null (system marker); RETROACTIVE için user_id. */
    @Column(name = "included_by")
    private UUID includedBy;
}
