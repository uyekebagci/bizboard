package com.bizboard.service;

import com.bizboard.common.dto.ConsolidatedDashboardDto;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * v1.6.20 (WP-3): İşletme detay sayfasının "tek-shot" consolidated endpoint
 * yardımcı servisi. Tüm widget verisini tek round-trip ile toparlar.
 *
 * <p>Tek-tenant DGR mantığı: bir işletme id ile çağrılır, geri kalan
 * agregasyonlar tek-tenant olduğu için system-wide. {@code businessId}
 * authorization + döndürülen DTO başlığı için kullanılır.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConsolidatedDashboardService {

    private final BusinessAccessGuard accessGuard;
    private final BusinessRepository businessRepository;
    private final BankAccountRepository bankAccountRepository;
    private final PosDeviceRepository posDeviceRepository;
    private final TransactionRepository transactionRepository;
    private final DebtRepository debtRepository;
    private final CashClosingRepository cashClosingRepository;
    private final ClosingCalculator closingCalculator;
    // v1.7.x WP fbb2ef55: portföy çek/senet
    private final com.bizboard.repository.PaymentInstrumentRepository paymentInstrumentRepository;
    // WP a9da4e9d (USD+Altın): borç toplamlarını güncel kurla TL'ye çevirir.
    private final DebtAmountConverter amountConverter;

    @Transactional(readOnly = true)
    public ConsolidatedDashboardDto getConsolidated(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        // Mevcudiyet kontrolü (404 vs.)
        businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        LocalDate today = LocalDate.now();

        // ── BANK ACCOUNTS ────────────────────────────────────────────
        // v1.6.23.21 (Security WP / arch-rules §1.1): business-scoped.
        // Eskiden findByActiveTrueOrderByNameAsc() çağrısı tüm tenant'ların
        // bank hesaplarını döndürüyor, böylece konsolide widget'lar diğer
        // tenant'ın bakiyelerini gösteriyordu (Test İşletmesi A → DGR
        // bank balance leak). Şu an business_id filter zorunlu.
        List<BankAccount> banks = bankAccountRepository
                .findByActiveTrueAndBusinessIdInOrderByNameAsc(List.of(businessId));

        // v1.6.23.7 (BUG-V2 fix): total_cash hesabını ayrıştırıyoruz.
        // CHECKING/SAVINGS hesapları bankada duran para — bunlar receivables/payables
        // bütçesinde ayrı bir kategori, kasa pozisyonuyla karıştırılmamalı.
        // CASH_HOLDER hesapları (örn. GÖKHAN ELDEKİ) fiziksel kişide tutulan nakit —
        // bu kasa pozisyonunun parçası.
        //
        // Önceki davranış (v1.6.23.5): totalCash = sum(active banks) + closing.actual
        //   → CHECKING bakiyesi + physical kasa double-counted (HESAPDAN tx kasayı
        //   azaltmamış ama bank balance'a yansımış). Round 2 verification raporu
        //   bunu BUG-V2 olarak işaretledi.
        //
        // Yeni: totalCash = closing.actual_balance + sum(CASH_HOLDER bakiyeleri).
        // CHECKING/SAVINGS bakiyeleri ayrı widget olarak (bankRows zaten gönderiliyor).
        BigDecimal cashHolderTotal = banks.stream()
                .filter(b -> b.getType() != null
                        && "CASH_HOLDER".equals(b.getType().name()))
                .map(BankAccount::getCurrentBalance)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        // v1.7.0.x (BUG fix, defansif): SUB_CASH/MAIN_CASH bakiyeleri assigned
        // bank'lerin aggregate'i — bank'lerin kendileri zaten toplamda var.
        // Explicit CHECKING/SAVINGS filter ile çift sayım riskini sıfırla.
        // (Şu an current_balance=0 ile teknik olarak doğru sonuç dönüyor ama
        // ileride değişebilir; explicit filter daha güvenli.)
        BigDecimal totalBankBalance = banks.stream()
                .filter(b -> b.getType() != null
                        && ("CHECKING".equals(b.getType().name())
                            || "SAVINGS".equals(b.getType().name())))
                .map(BankAccount::getCurrentBalance)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // ── PHYSICAL CASH KASA (en son closing) ──────────────────────
        // v1.6.23.21: business-scoped. Eski tek-tenant fallback DGR'ye sızıyordu.
        BigDecimal physicalCash = cashClosingRepository
                .findFirstByBusinessIdOrderByClosingDateDesc(businessId)
                .map(c -> c.getActualBalance() != null
                        ? c.getActualBalance()
                        : (c.getComputedClosing() != null ? c.getComputedClosing() : BigDecimal.ZERO))
                .orElse(BigDecimal.ZERO);

        // total_cash = fiziksel kasa + CASH_HOLDER bakiyeleri (her ikisi de "kasa" semantik)
        BigDecimal totalCash = physicalCash.add(cashHolderTotal);

        List<ConsolidatedDashboardDto.BankAccountSummary> bankRows = banks.stream()
                .map(this::toBankSummary)
                .toList();

        // ── DEBTS: payables (BORC) + receivables ─────────────────────
        // v1.6.23.21: business-scoped.
        List<Debt> payableDebts = debtRepository
                .findByBusinessIdAndDirectionAndSettledFalseOrderByDueDateAsc(
                        businessId, DebtDirection.PAYABLE);
        BigDecimal totalPayables = sumDebt(payableDebts);

        List<Debt> receivableDebts = debtRepository
                .findByBusinessIdAndDirectionAndSettledFalseOrderByDueDateAsc(
                        businessId, DebtDirection.RECEIVABLE);
        BigDecimal totalReceivables = sumDebt(receivableDebts);

        // ── PENDING POS RECEIVABLES (v1.6.23.9 TODO 8c7ffaac) ────────
        // Settled olmamış POS tx'lerinin net toplamı. Net'e DAHIL DEĞİL —
        // settled olunca bank_balance'a yansıyacak (çift sayım önlemi).
        // v1.6.23.21: business-scoped.
        BigDecimal pendingPosReceivables = computePendingPosReceivables(businessId);

        // ── KONSOLİDE NET (v1.7.x WP 8b961444 TODO b92d05fe) ─────────
        // YENİ FORMÜL (A yaklaşımı — locked):
        //   NET = SUM(income_contribution) + opening_balance
        //   income_contribution =
        //     POS gelir → (amount × our_rate − amount × bank_rate) / 100   (= profit)
        //     non-POS gelir (kind=NORMAL) → amount
        //     gider (kind=NORMAL) → −amount
        //     transfer (kind=TRANSFER) → 0
        //     else → 0
        //
        // Alacak/verecek bu formüle DAHİL DEĞİL — widget'ta ayrı satır.
        // GENEL KASA (= total_cash + total_bank_balance) ile karıştırılmamalı:
        //   - GENEL KASA: fiziksel para, aggregator parası dahil (DOĞRU, dokunma).
        //   - KONSOLİDE NET: ekonomik gelir, POS'ta profit, non-POS'ta gross.
        //
        // TODO: business.opening_balance kolonu eklenince oradan okunacak;
        // şimdilik 0 (test senaryolarına uygun).
        BigDecimal openingBalance = BigDecimal.ZERO;
        BigDecimal netCurrent = computeKonsolideNet(businessId).add(openingBalance);
        BigDecimal expectedNet = netCurrent.add(pendingPosReceivables);

        // ── CONSOLIDATED POSITION ────────────────────────────────────
        // KK / loan rezerve — WP-5 öncesi 0.
        // v1.7.x: net artık formula bazlı (yukarıdaki net hesabı).
        ConsolidatedDashboardDto.ConsolidatedPosition consolidated =
                ConsolidatedDashboardDto.ConsolidatedPosition.builder()
                        .totalCash(totalCash)
                        .totalBankBalance(totalBankBalance)
                        .creditCardDebt(BigDecimal.ZERO)
                        .loanPrincipal(BigDecimal.ZERO)
                        .receivables(totalReceivables)
                        .payables(totalPayables)
                        .net(netCurrent)
                        .pendingPosReceivables(pendingPosReceivables)
                        .expectedNet(expectedNet)
                        .build();

        // ── TODAY CLOSING ────────────────────────────────────────────
        // v1.6.23.21: business-scoped opening/computed + closing record.
        BigDecimal opening = closingCalculator.getOpeningBalance(businessId, today);
        BigDecimal computed = closingCalculator.computeClosing(businessId, today);
        Optional<CashClosing> existing = cashClosingRepository
                .findByBusinessIdAndClosingDate(businessId, today);
        // Beta v1.1 hotfix v2: bugünün kasa durumu artık POS gelir/gider'i de
        // dahil eder. POS gelir kasaya settle olunca yansıyor ama günlük hareket
        // raporlamasında dahil olmalı; POS gider de simetrik.
        BigDecimal incoming = sumByDirection(businessId, today, "NAKIT", TransactionDirection.INCOME)
                .add(sumByDirectionPosLike(businessId, today, TransactionDirection.INCOME));
        BigDecimal outgoing = sumByDirection(businessId, today, "NAKIT", TransactionDirection.EXPENSE)
                .add(sumByDirectionPosLike(businessId, today, TransactionDirection.EXPENSE));

        ConsolidatedDashboardDto.TodayClosing todayClosing =
                ConsolidatedDashboardDto.TodayClosing.builder()
                        .openingBalance(opening)
                        .incoming(incoming)
                        .outgoing(outgoing)
                        .computedClosing(computed)
                        .actualBalance(existing.map(CashClosing::getActualBalance).orElse(null))
                        .difference(existing.map(CashClosing::getDifference).orElse(null))
                        .closed(existing.isPresent()
                                && existing.get().getStatus() != null
                                && "CLOSED".equals(existing.get().getStatus().name()))
                        .auto(existing.map(CashClosing::isAuto).orElse(false))
                        .closingId(existing.map(CashClosing::getId).orElse(null))
                        .build();

        // ── POS DEVICES (bugün) ──────────────────────────────────────
        // v1.6.23.21: business-scoped.
        List<PosDevice> activeDevices = posDeviceRepository
                .findByActiveTrueAndBusinessIdInOrderByNameAsc(List.of(businessId));
        // M-2 (R3): cihaz-başı findByPosDeviceIdAndDate yerine TEK toplu sorgu +
        // bellek-içi gruplama (N+1 fix).
        List<UUID> activeDeviceIds = activeDevices.stream().map(PosDevice::getId).toList();
        Map<UUID, List<Transaction>> txByDevice = activeDeviceIds.isEmpty()
                ? Map.of()
                : transactionRepository.findByPosDeviceIdInAndDate(activeDeviceIds, today).stream()
                        .filter(t -> t.getPosDevice() != null && t.getPosDevice().getId() != null)
                        .collect(Collectors.groupingBy(t -> t.getPosDevice().getId()));
        List<ConsolidatedDashboardDto.PosDeviceToday> posRows = activeDevices.stream()
                .map(d -> buildPosDeviceToday(d, txByDevice.getOrDefault(d.getId(), List.of())))
                .toList();

        // ── PAYABLES rows ────────────────────────────────────────────
        List<ConsolidatedDashboardDto.DebtRow> payableRows = payableDebts.stream()
                .map(d -> toDebtRow(d, today))
                .toList();

        // ── RECEIVABLES summary ──────────────────────────────────────
        Map<String, List<Debt>> byType = receivableDebts.stream()
                .collect(Collectors.groupingBy(
                        d -> d.getReceivableType() == null || d.getReceivableType().isBlank()
                                ? "UNSPECIFIED" : d.getReceivableType(),
                        LinkedHashMap::new, Collectors.toList()));
        List<ConsolidatedDashboardDto.TypeBreakdown> breakdowns = new ArrayList<>();
        for (Map.Entry<String, List<Debt>> e : byType.entrySet()) {
            breakdowns.add(ConsolidatedDashboardDto.TypeBreakdown.builder()
                    .type(e.getKey())
                    .amount(sumDebt(e.getValue()))
                    .count(e.getValue().size())
                    .build());
        }
        int overdueCount = (int) receivableDebts.stream()
                .filter(d -> d.getDueDate() != null && d.getDueDate().isBefore(today))
                .count();
        ConsolidatedDashboardDto.ReceivablesSummary receivablesSummary =
                ConsolidatedDashboardDto.ReceivablesSummary.builder()
                        .total(totalReceivables)
                        .typeBreakdown(breakdowns)
                        .overdueCount(overdueCount)
                        .totalCount(receivableDebts.size())
                        .build();

        // ── CASH OUTFLOWS (bugün, NAKIT, EXPENSE) ────────────────────
        // v1.6.23.21: business-scoped.
        // v1.7.0-beta (TODO d0567538): TRANSFER tx dışla (hesaplar arası taşıma).
        // Beta v1.1 hotfix v2: pos_tx_subtype set edilmiş tx'ler POS gider
        // olarak Closure sayfasında ayrı listeleniyor — buraya dahil edilmesin.
        // FİNANSAL KURAL (Z, 2026-06): LOAN (cari ödeme/tahsilat) kasa çıkışı
        // DEĞİL — bu listede gösterilmez (kasaya yansımıyor).
        List<Transaction> outflowsToday = transactionRepository
                .findByBusinessIdAndDateAndPaymentMethodAndDirection(
                        businessId, today, "NAKIT", TransactionDirection.EXPENSE)
                .stream()
                .filter(t -> t.getKind() != com.bizboard.common.enums.TransactionKind.TRANSFER
                        && t.getKind() != com.bizboard.common.enums.TransactionKind.LOAN)
                .filter(t -> t.getPosTxSubtype() == null)
                .toList();
        List<ConsolidatedDashboardDto.TxRow> outflowRows = outflowsToday.stream()
                .map(this::toTxRow)
                .toList();

        // ── UPCOMING CHEQUES (next 30 days) ──────────────────────────
        // v1.6.23.21: business-scoped.
        List<Debt> upcomingCheques = debtRepository
                .findUpcomingChequesByBusiness(businessId, today, today.plusDays(30));
        List<ConsolidatedDashboardDto.ChequeRow> chequeRows = upcomingCheques.stream()
                .map(d -> ConsolidatedDashboardDto.ChequeRow.builder()
                        .debtId(d.getId())
                        .counterpartName(displayCounterpartName(d))
                        .amount(d.getAmount())
                        .chequeDueDate(d.getChequeDueDate())
                        .chequeNo(d.getChequeNo())
                        .collectorBank(d.getChequeCollectorBank())
                        .daysToDue((int) java.time.temporal.ChronoUnit.DAYS.between(today, d.getChequeDueDate()))
                        .build())
                .toList();

        // ── UPCOMING REMINDERS (next 7 days) ─────────────────────────
        // v1.6.23.21: business-scoped.
        List<Debt> upcomingReminders = debtRepository
                .findUpcomingRemindersByBusiness(businessId, today, today.plusDays(7));
        List<ConsolidatedDashboardDto.ReminderRow> reminderRows = upcomingReminders.stream()
                .map(d -> ConsolidatedDashboardDto.ReminderRow.builder()
                        .debtId(d.getId())
                        .counterpartName(displayCounterpartName(d))
                        .amount(d.getAmount())
                        .reminderDate(d.getReminderDate())
                        .reminderNote(d.getReminderNote())
                        .daysToRemind((int) java.time.temporal.ChronoUnit.DAYS.between(today, d.getReminderDate()))
                        .build())
                .toList();

        // ── NET POSITION ─────────────────────────────────────────────
        BigDecimal net = totalReceivables.subtract(totalPayables);
        ConsolidatedDashboardDto.NetPosition netPosition =
                ConsolidatedDashboardDto.NetPosition.builder()
                        .receivables(totalReceivables)
                        .payables(totalPayables)
                        .net(net)
                        .netPositive(net.signum() >= 0)
                        .build();

        return ConsolidatedDashboardDto.builder()
                .businessId(businessId)
                .consolidated(consolidated)
                .todayClosing(todayClosing)
                .posDevices(posRows)
                .bankAccounts(bankRows)
                .payables(payableRows)
                .receivables(receivablesSummary)
                .cashOutflowsToday(outflowRows)
                .upcomingCheques(chequeRows)
                .upcomingReminders(reminderRows)
                .netPosition(netPosition)
                .portfolioInstruments(buildPortfolioInstruments(businessId, today))
                .build();
    }

    /**
     * v1.7.x WP fbb2ef55 / TODO 40fd733f: Çek + senet portföy özet (PORTFOLIO statu).
     */
    private ConsolidatedDashboardDto.PortfolioInstruments buildPortfolioInstruments(
            UUID businessId, LocalDate today) {
        List<com.bizboard.common.entity.PaymentInstrument> instruments =
                paymentInstrumentRepository.findByBusinessIdAndStatusOrderByDueDateAsc(
                        businessId, "PORTFOLIO");
        BigDecimal chIn = BigDecimal.ZERO, chOut = BigDecimal.ZERO;
        BigDecimal noIn = BigDecimal.ZERO, noOut = BigDecimal.ZERO;
        LocalDate cutoff = today.plusDays(30);
        List<ConsolidatedDashboardDto.PortfolioInstrumentRow> upcoming = new ArrayList<>();
        for (com.bizboard.common.entity.PaymentInstrument pi : instruments) {
            boolean isCheque = "CHEQUE".equals(pi.getInstrumentType());
            boolean isIn = "INCOMING".equals(pi.getDirection());
            if (isCheque && isIn) chIn = chIn.add(pi.getAmount());
            else if (isCheque) chOut = chOut.add(pi.getAmount());
            else if (isIn) noIn = noIn.add(pi.getAmount());
            else noOut = noOut.add(pi.getAmount());
            if (pi.getDueDate() != null && !pi.getDueDate().isAfter(cutoff)) {
                upcoming.add(ConsolidatedDashboardDto.PortfolioInstrumentRow.builder()
                        .id(pi.getId())
                        .instrumentType(pi.getInstrumentType())
                        .direction(pi.getDirection())
                        .amount(pi.getAmount())
                        .dueDate(pi.getDueDate())
                        .counterpartName(pi.getCounterpart() != null
                                ? pi.getCounterpart().getName() : null)
                        .build());
            }
        }
        return ConsolidatedDashboardDto.PortfolioInstruments.builder()
                .chequesIncomingTotal(chIn)
                .chequesOutgoingTotal(chOut)
                .notesIncomingTotal(noIn)
                .notesOutgoingTotal(noOut)
                .upcoming30Days(upcoming)
                .build();
    }

    // ───────────────────────── helpers ─────────────────────────

    /**
     * v1.7.x WP 8b961444 TODO b92d05fe: Konsolide NET formülü.
     *
     * <p>İşletmenin tüm zaman tx'leri üzerinden income_contribution toplamı.
     * POS gelir → profit (our − bank); non-POS gelir → amount; gider → −amount;
     * transfer → 0.</p>
     *
     * <p>Alacak/verecek DAHİL DEĞİL — UI'da ayrı widget olarak gösterilir.</p>
     */
    private BigDecimal computeKonsolideNet(UUID businessId) {
        List<Transaction> all = transactionRepository
                .findByBusinessIdOrderByDateDesc(businessId);
        BigDecimal sum = BigDecimal.ZERO;
        for (Transaction t : all) {
            sum = sum.add(incomeContribution(t));
        }
        return sum;
    }

    /**
     * income_contribution: işlemin konsolide net'e işaretli katkısı.
     *
     * <p>Bug a1d58d6e/a90a8d42 fix: formül artık {@link PosIncomeCalculator}'da
     * TEK kaynak olarak tutulur. {@code SummaryService.effectiveAmount} de aynı
     * yardımcıya bağlandığı için consolidated net ile summary net AYNI POS
     * muamelesini (tam tutar) kullanır — tutarsızlık ortadan kalkar.</p>
     *
     * <p>Model (Beta v1.1): TRANSFER/LOAN → 0; GELİR → +amount (POS dahil tam
     * tutar); GİDER → −amount.</p>
     */
    private static BigDecimal incomeContribution(Transaction t) {
        return PosIncomeCalculator.incomeContribution(t);
    }

    private ConsolidatedDashboardDto.BankAccountSummary toBankSummary(BankAccount b) {
        return ConsolidatedDashboardDto.BankAccountSummary.builder()
                .id(b.getId())
                .name(b.getName())
                .type(b.getType() != null ? b.getType().name() : null)
                .bankName(b.getBankName())
                .holderName(b.getHolderPerson() != null ? b.getHolderPerson().getName() : null)
                .balance(b.getCurrentBalance())
                .currency(b.getCurrency())
                .build();
    }

    /**
     * M-2 (R3): tx listesi artık çağıran tarafça toplu çekilip geçiliyor —
     * cihaz-başı sorgu yok.
     */
    private ConsolidatedDashboardDto.PosDeviceToday buildPosDeviceToday(PosDevice d, List<Transaction> txs) {
        BigDecimal gross = BigDecimal.ZERO;
        // WP b446c696 (Beta v1.1 Hotfix): income/expense ayrı toplamlar.
        BigDecimal incomeGross = BigDecimal.ZERO;
        BigDecimal expenseGross = BigDecimal.ZERO;
        BigDecimal bankCommission = BigDecimal.ZERO;
        // v1.7.x (POS Komisyon WP TODO 8a7a8416): bizim komisyon + kâr toplamı.
        BigDecimal ourCommission = BigDecimal.ZERO;
        int unsettled = 0;
        for (Transaction t : txs) {
            if (t.getAmount() == null) continue;
            // WP b446c696: gross sadece income (geri uyumlu için legacy semantik).
            if (t.getDirection() == com.bizboard.common.enums.TransactionDirection.EXPENSE) {
                expenseGross = expenseGross.add(t.getAmount());
                continue;
            }
            incomeGross = incomeGross.add(t.getAmount());
            gross = gross.add(t.getAmount());
            BigDecimal bankRate = t.getAppliedPosRate() != null
                    ? t.getAppliedPosRate()
                    : (t.getPosRate() != null ? t.getPosRate() : BigDecimal.ZERO);
            BigDecimal ourRate = t.getAppliedOurCommissionRate() != null
                    ? t.getAppliedOurCommissionRate()
                    : bankRate; // backfill safety: profit=0
            BigDecimal bankAmt = t.getAmount().multiply(bankRate)
                    .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
            BigDecimal ourAmt = t.getAmount().multiply(ourRate)
                    .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
            bankCommission = bankCommission.add(bankAmt);
            ourCommission = ourCommission.add(ourAmt);
            if (Boolean.FALSE.equals(t.getPosSettled())) unsettled++;
        }
        BigDecimal profit = ourCommission.subtract(bankCommission);
        return ConsolidatedDashboardDto.PosDeviceToday.builder()
                .deviceId(d.getId())
                .deviceName(d.getName())
                .todayGross(gross)
                // WP b446c696: income/expense ayrı raporlama (POS Hacmi widget).
                .todayIncomeGross(incomeGross)
                .todayExpenseGross(expenseGross)
                .todayCommission(bankCommission) // legacy alias
                .todayBankCommission(bankCommission)
                .todayOurCommission(ourCommission)
                .todayProfit(profit)
                .todayNet(gross.subtract(bankCommission))
                .unsettledCount(unsettled)
                .txCount(txs.size())
                .build();
    }

    private ConsolidatedDashboardDto.DebtRow toDebtRow(Debt d, LocalDate today) {
        Integer daysToDue = d.getDueDate() != null
                ? (int) java.time.temporal.ChronoUnit.DAYS.between(today, d.getDueDate())
                : null;
        return ConsolidatedDashboardDto.DebtRow.builder()
                .debtId(d.getId())
                .counterpartName(displayCounterpartName(d))
                .amount(d.getAmount())
                .currency(d.getCurrency())
                .dueDate(d.getDueDate())
                .daysToDue(daysToDue)
                .instrumentType(d.getInstrumentType())
                .build();
    }

    private ConsolidatedDashboardDto.TxRow toTxRow(Transaction t) {
        return ConsolidatedDashboardDto.TxRow.builder()
                .txId(t.getId())
                .description(t.getDescription())
                .categoryName(t.getCategory() != null ? t.getCategory().getName() : null)
                .amount(t.getAmount())
                .counterpartName(t.getTargetCounterpart() != null
                        ? t.getTargetCounterpart().getName() : null)
                .date(t.getDate())
                .build();
    }

    private static String displayCounterpartName(Debt d) {
        if (d.getCounterpartRef() != null) return d.getCounterpartRef().getName();
        return d.getCounterparty();
    }

    /**
     * v1.7.0.x (BUG fix): Parsiyel ödeme sonrası alacak/borç widget'ı eski
     * orijinal tutarı gösteriyordu. Kullanıcı bir alacağa 1.48M tahsilat aldı,
     * debt.remaining_amount düştü ama widget yine debt.amount sumladığı için
     * stale görünüyordu. Doğru davranış: remaining_amount kullan; null ise
     * (legacy data, parsiyel ödeme öncesi kayıt) amount fallback.
     */
    /**
     * WP a9da4e9d (B): borç toplamı GÜNCEL kurla TL. TRY aynen; USD/GOLD çevrilir.
     * remaining_amount baz (kısmi ödeme), null → amount.
     */
    private BigDecimal sumDebt(List<Debt> debts) {
        return debts.stream()
                .map(d -> {
                    BigDecimal base = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
                    return amountConverter.toTry(d, base);
                })
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * v1.6.23.21 + v1.7.0-beta (TODO d0567538): TRANSFER tx dışla.
     * FİNANSAL KURAL (Z, 2026-06): LOAN (tahsilat/cari kapatma) "Bugünün Kasa
     * Durumu" gelen/giden toplamına da GİRMEZ — operasyonel kasayı etkilemez.
     */
    private BigDecimal sumByDirection(UUID businessId, LocalDate date, String pm, TransactionDirection dir) {
        return transactionRepository
                .findByBusinessIdAndDateAndPaymentMethodAndDirection(businessId, date, pm, dir)
                .stream()
                .filter(t -> t.getKind() != com.bizboard.common.enums.TransactionKind.TRANSFER
                        && t.getKind() != com.bizboard.common.enums.TransactionKind.LOAN)
                .map(Transaction::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Beta v1.1 hotfix v2: pm LIKE 'POS%' direction filter. "Bugünün Kasa
     * Durumu" widget'ı için POS gelir/gider'i de toplama dahil etmek üzere.
     */
    private BigDecimal sumByDirectionPosLike(UUID businessId, LocalDate date, TransactionDirection dir) {
        return transactionRepository
                .findByBusinessIdAndDateBetween(businessId, date, date)
                .stream()
                // FİNANSAL KURAL (Z, 2026-06): TRANSFER + LOAN kasa durumuna girmez.
                .filter(t -> t.getKind() != com.bizboard.common.enums.TransactionKind.TRANSFER
                        && t.getKind() != com.bizboard.common.enums.TransactionKind.LOAN)
                .filter(t -> t.getDirection() == dir)
                .filter(t -> t.getPaymentMethod() != null
                        && t.getPaymentMethod().toUpperCase(Locale.ENGLISH).startsWith("POS"))
                .map(Transaction::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Beta v1.1 (WP 4f6baaa3 follow-up): bekleyen POS tx toplam HACIM —
     * komisyon hesabı kaldırıldı. SUM(amount). POS Hacmi mantığı: kullanıcı
     * banka komisyonunu raporlama'da görmek istemiyor.
     *
     * <p>Önceki sürüm (v1.6.23.21) net döndürüyordu: SUM(amount × (1 − rate/100)).</p>
     */
    private BigDecimal computePendingPosReceivables(UUID businessId) {
        List<Transaction> unsettled = transactionRepository
                .findUnsettledPosTransactionsByBusinessId(businessId);
        BigDecimal total = BigDecimal.ZERO;
        for (Transaction t : unsettled) {
            if (t.getAmount() == null) continue;
            total = total.add(t.getAmount());
        }
        return total;
    }
}
