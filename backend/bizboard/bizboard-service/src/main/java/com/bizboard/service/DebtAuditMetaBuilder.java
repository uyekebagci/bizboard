package com.bizboard.service;

import com.bizboard.common.dto.UpdateDebtRequest;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.DebtPayment;
import com.bizboard.repository.DebtPaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * WP a9da4e9d: Bireysel borç düzenleme (DEBT_UPDATE) yardımcısı.
 *
 * <p>DebtService'ten ayrı tutulur ki (1) servis 500 satır sınırının altında
 * kalsın, (2) "amount değişince remaining/status nasıl türer" ve "kim hangi
 * alanı eski→yeni nasıl değiştirdi" mantığı tek yerden test/inceleme yapılabilsin.</p>
 */
@Component
@RequiredArgsConstructor
public class DebtAuditMetaBuilder {

    private final DebtPaymentRepository debtPaymentRepository;

    /**
     * amount değiştiğinde remaining_amount / status / settled / settled_at
     * alanlarını yapılan ödemelere göre yeniden türetir.
     *
     * <ul>
     *   <li>remaining = newAmount − paid (negatifse 0)</li>
     *   <li>remaining == 0 → PAID + settled</li>
     *   <li>remaining < newAmount → PARTIAL; aksi halde OPEN; settled=false</li>
     * </ul>
     */
    public void recomputeRemainingForAmount(Debt debt, BigDecimal newAmount) {
        BigDecimal paid = debtPaymentRepository.findByDebtId(debt.getId()).stream()
                .map(DebtPayment::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal remaining = newAmount.subtract(paid);
        if (remaining.signum() < 0) {
            remaining = BigDecimal.ZERO;
        }
        debt.setRemainingAmount(remaining);
        if (remaining.signum() == 0) {
            debt.setStatus("PAID");
            debt.setSettled(true);
            debt.setSettledAt(LocalDateTime.now());
        } else {
            debt.setStatus(remaining.compareTo(newAmount) < 0 ? "PARTIAL" : "OPEN");
            debt.setSettled(false);
            debt.setSettledAt(null);
        }
    }

    /**
     * DEBT_UPDATE audit metadata: sabit alanlar + DEĞİŞEN her alan için
     * {field}_old / {field}_new çiftleri. Yalnız gerçekten değişen alanlar yazılır.
     *
     * @param debt           güncellenmiş (kaydedilmiş) borç — yeni değerler buradan
     * @param oldAmount      mutate öncesi tutar
     * @param oldDueDate     mutate öncesi vade
     * @param oldDescription mutate öncesi açıklama
     * @param req            hangi alanların güncellenmek istendiğini belirler (non-null)
     */
    public Map<String, Object> buildUpdateMeta(Debt debt,
                                               BigDecimal oldAmount,
                                               LocalDate oldDueDate,
                                               String oldDescription,
                                               UpdateDebtRequest req) {
        Map<String, Object> meta = new HashMap<>();
        meta.put("debtId", debt.getId());
        meta.put("businessId", debt.getBusiness().getId());
        meta.put("counterparty", debt.getCounterparty());
        if (debt.getCounterpartRef() != null) {
            meta.put("counterpartId", debt.getCounterpartRef().getId());
        }
        if (req.getAmount() != null && !Objects.equals(oldAmount, debt.getAmount())) {
            meta.put("amount_old", oldAmount);
            meta.put("amount_new", debt.getAmount());
        }
        // Vade: ya yeni tarih verildi ya da "belli değil" (clearDueDate) ile null'a çekildi.
        // Her iki durumda da debt.getDueDate() güncel değeri tutar (clearDueDate → null).
        boolean dueDateTouched = req.getDueDate() != null || Boolean.TRUE.equals(req.getClearDueDate());
        if (dueDateTouched && !Objects.equals(oldDueDate, debt.getDueDate())) {
            meta.put("due_date_old", oldDueDate);
            meta.put("due_date_new", debt.getDueDate());
        }
        if (req.getDescription() != null && !Objects.equals(oldDescription, debt.getDescription())) {
            meta.put("description_old", oldDescription);
            meta.put("description_new", debt.getDescription());
        }
        return meta;
    }
}
