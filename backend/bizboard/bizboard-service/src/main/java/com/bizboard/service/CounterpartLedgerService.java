package com.bizboard.service;

import com.bizboard.common.dto.CounterpartStatementDto;
import com.bizboard.common.dto.CounterpartStatementEntryDto;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.DebtRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Cari hesap motoru — counterpart bazlı bakiye hesaplaması + ekstre.
 *
 * <p><b>Bakiye tanımı:</b> aktif (settled=false) borçların net'i.
 * RECEIVABLE pozitif, PAYABLE negatif. Settle edilen borçlar bakiyeyi
 * etkilemez (cari kapanmış sayılır). Bu yaklaşım UX'ten "kapanmamış cari"
 * tablosunu net döndürür.</p>
 *
 * <p><b>Recompute stratejisi:</b> event-driven. {@link DebtService} create/
 * settle/delete'te {@link #recompute(UUID)} çağırır. Drift olursa admin
 * paneli üzerinden manuel tetiklenebilir.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CounterpartLedgerService {

    private final DebtRepository debtRepository;
    private final CounterpartRepository counterpartRepository;
    private final DebtAmountConverter amountConverter;

    /**
     * Counterpart'ın current_balance kolonunu yeniden hesaplayıp persist eder.
     * Tüm aktif borçlar (settled=false) üzerinden: RECEIVABLE toplam - PAYABLE toplam.
     *
     * <p>WP a9da4e9d (B): USD/GOLD borçlar GÜNCEL kurla TL'ye çevrilip toplanır
     * (current_balance TL'dir). TRY borçlar aynen. Çevrilen borçlarda rate_snapshot
     * güncel kura set edilir (gösterim/referans).</p>
     */
    @Transactional
    public BigDecimal recompute(UUID counterpartId) {
        if (counterpartId == null) return BigDecimal.ZERO;
        Counterpart c = counterpartRepository.findById(counterpartId).orElse(null);
        if (c == null) return BigDecimal.ZERO;

        BigDecimal balance = BigDecimal.ZERO;
        for (Debt d : debtRepository.findByCounterpartRefIdOrderByCreatedAtAsc(counterpartId)) {
            // v1.7.x WP fbb2ef55: remaining_amount kullan (kısmi ödenmiş borçlar için).
            if (d.isSettled()) continue;
            BigDecimal remTl = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
            // WP a9da4e9d (B): USD/GOLD → güncel kurla TL.
            if (amountConverter.isForeign(d)) {
                remTl = amountConverter.toTry(d, remTl);
                d.setRateSnapshot(amountConverter.currentRate(d));
                d.setRateSnapshotAt(LocalDateTime.now());
                debtRepository.save(d);
            }
            if (d.getDirection() == DebtDirection.RECEIVABLE) {
                balance = balance.add(remTl);
            } else {
                balance = balance.subtract(remTl);
            }
        }
        c.setCurrentBalance(balance);
        counterpartRepository.save(c);
        log.debug("[counterpart-ledger] recompute counterpart={} balance={}", counterpartId, balance);
        return balance;
    }

    /**
     * Period içi cari ekstre. Hareketler kronolojik; her satırın running balance'ı verilir.
     * Period dışı (open + close): opening = period öncesi aktif net; closing = counterpart'ın
     * kayıtlı current_balance'ı (period sonrası).
     */
    @Transactional(readOnly = true)
    public CounterpartStatementDto getStatement(UUID counterpartId, LocalDate from, LocalDate to) {
        Counterpart c = counterpartRepository.findById(counterpartId)
                .orElseThrow(() -> new IllegalArgumentException("Karsi firma bulunamadi"));

        LocalDate toEff = to != null ? to : LocalDate.now();
        // from null ise period'u counterpart'ın ilk borcundan başlat.
        List<Debt> all = debtRepository.findByCounterpartRefIdOrderByCreatedAtAsc(counterpartId);
        LocalDate fromEff = from;
        if (fromEff == null && !all.isEmpty()) {
            fromEff = all.get(0).getCreatedAt().toLocalDate();
        }
        if (fromEff == null) {
            fromEff = toEff; // borç yoksa period başlangıcı = bugün
        }

        LocalDateTime fromDt = fromEff.atStartOfDay();
        LocalDateTime toDt = toEff.plusDays(1).atStartOfDay();

        // Açılış bakiyesi: from'dan ÖNCE oluşturulmuş aktif (henüz settle edilmemiş ya da
        // settle tarihi from'dan sonra) borçların net'i.
        BigDecimal opening = BigDecimal.ZERO;
        for (Debt d : all) {
            LocalDateTime created = d.getCreatedAt();
            if (created == null || !created.isBefore(fromDt)) continue;
            // Period'dan önce settle edilmiş borç bakiyeye sayılmaz.
            if (d.isSettled() && d.getSettledAt() != null && d.getSettledAt().isBefore(fromDt)) continue;
            opening = signedAmount(d, opening);
        }

        // Period içi hareketler + running balance.
        BigDecimal running = opening;
        BigDecimal totalReceivable = BigDecimal.ZERO;
        BigDecimal totalPayable = BigDecimal.ZERO;
        List<CounterpartStatementEntryDto> entries = new ArrayList<>();
        for (Debt d : all) {
            LocalDateTime created = d.getCreatedAt();
            if (created == null || created.isBefore(fromDt) || !created.isBefore(toDt)) continue;

            // Running balance sadece aktif borçları yansıtır; settle olanlar net'e katılmaz.
            if (!d.isSettled()) {
                running = signedAmount(d, running);
            }
            if (d.getDirection() == DebtDirection.RECEIVABLE) {
                totalReceivable = totalReceivable.add(d.getAmount());
            } else {
                totalPayable = totalPayable.add(d.getAmount());
            }

            entries.add(CounterpartStatementEntryDto.builder()
                    .debtId(d.getId())
                    .businessId(d.getBusiness() != null ? d.getBusiness().getId() : null)
                    .businessName(d.getBusiness() != null ? d.getBusiness().getName() : null)
                    .direction(d.getDirection().name())
                    .amount(d.getAmount())
                    .currency(d.getCurrency())
                    .instrumentType(d.getInstrumentType())
                    .dueDate(d.getDueDate())
                    .settled(d.isSettled())
                    .settledAt(d.getSettledAt())
                    .description(d.getDescription())
                    .createdAt(d.getCreatedAt())
                    .runningBalance(running)
                    .build());
        }

        BigDecimal closing = c.getCurrentBalance() != null ? c.getCurrentBalance() : BigDecimal.ZERO;

        return CounterpartStatementDto.builder()
                .counterpartId(c.getId())
                .counterpartName(c.getName())
                .fromDate(fromEff)
                .toDate(toEff)
                .openingBalance(opening)
                .closingBalance(closing)
                .totalReceivable(totalReceivable)
                .totalPayable(totalPayable)
                .entryCount(entries.size())
                .entries(entries)
                .build();
    }

    private static BigDecimal signedAmount(Debt d, BigDecimal running) {
        return d.getDirection() == DebtDirection.RECEIVABLE
                ? running.add(d.getAmount())
                : running.subtract(d.getAmount());
    }

    /** {@link DebtService} bunu çağırır; null counterpart'a güvenli no-op. */
    @Transactional
    public void recomputeIfPresent(UUID counterpartId) {
        if (counterpartId == null) return;
        recompute(counterpartId);
    }
}
