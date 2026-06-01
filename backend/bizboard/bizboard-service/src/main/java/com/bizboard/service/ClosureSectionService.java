package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.SubCashAssignment;
import com.bizboard.common.entity.SubCashTxInclusion;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.common.enums.SubCashEntityType;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.DebtPaymentRepository;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.SubCashAssignmentRepository;
import com.bizboard.repository.SubCashTxInclusionRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

/**
 * Beta v1.1 (Closure WP): Gün kapanışı sayfasının 5 ana section'ı için
 * aggregate veri sağlar.
 *
 * <ol>
 *   <li><b>POS işlemleri</b> alt kasalara göre gruplu (genel toplam)</li>
 *   <li><b>Transferler</b> 3 alt kategori (dışarı/içeride/gelen)</li>
 *   <li><b>Hesaptan para çekme</b> (bank→cash_holder transfer)</li>
 *   <li><b>Borç/alacak hareketleri</b> (ödemeler + yeni debt'ler)</li>
 *   <li><b>Harcamalar</b> (non-HESAPDAN expense)</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClosureSectionService {

    private final TransactionRepository transactionRepository;
    private final DebtRepository debtRepository;
    private final DebtPaymentRepository debtPaymentRepository;
    private final SubCashAssignmentRepository assignmentRepository;
    private final SubCashTxInclusionRepository inclusionRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessAccessGuard accessGuard;

    @Transactional(readOnly = true)
    public Map<String, Object> sectioned(UUID businessId, LocalDate date, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);

        List<Transaction> txs = transactionRepository
                .findByBusinessIdAndDateBetween(businessId, date, date);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("date", date.toString());
        result.put("business_id", businessId.toString());

        // ─── BÖLÜM A: POS by sub-cash ───
        result.put("pos", buildPosSection(businessId, txs));

        // ─── BÖLÜM B: Transferler (3 alt) ───
        result.put("transfers", buildTransfersSection(txs));

        // ─── BÖLÜM C: Hesaptan para çekme ───
        result.put("cash_withdrawals", buildCashWithdrawals(txs));

        // ─── BÖLÜM D: Borç/alacak ───
        result.put("debts", buildDebtSection(businessId, date));

        // ─── BÖLÜM E: Harcamalar (non-HESAPDAN expense) ───
        result.put("expenses", buildExpenseSection(txs));

        return result;
    }

    private Map<String, Object> buildPosSection(UUID businessId, List<Transaction> all) {
        // POS tx'leri al (kind=NORMAL, direction=INCOME, payment_method LIKE 'POS%')
        List<Transaction> posTxs = all.stream()
                .filter(t -> t.getKind() == TransactionKind.NORMAL
                        && t.getDirection() == TransactionDirection.INCOME
                        && t.getPaymentMethod() != null
                        && t.getPaymentMethod().toUpperCase(Locale.ENGLISH).startsWith("POS"))
                .toList();

        // Inclusion table'dan tx → sub-cash mapping
        Map<UUID, Set<UUID>> txToSubCashes = new HashMap<>();
        for (Transaction t : posTxs) {
            for (SubCashTxInclusion inc : inclusionRepository.findByTransaction_Id(t.getId())) {
                if (inc.getSubCash() != null) {
                    txToSubCashes.computeIfAbsent(t.getId(), k -> new HashSet<>())
                            .add(inc.getSubCash().getId());
                }
            }
        }

        // Sub-cash'leri grupla
        Map<UUID, List<Transaction>> bySubCash = new HashMap<>();
        List<Transaction> unassigned = new ArrayList<>();
        for (Transaction t : posTxs) {
            Set<UUID> subs = txToSubCashes.get(t.getId());
            if (subs == null || subs.isEmpty()) {
                unassigned.add(t);
            } else {
                for (UUID subId : subs) {
                    bySubCash.computeIfAbsent(subId, k -> new ArrayList<>()).add(t);
                }
            }
        }

        // Sub-cash names
        List<Map<String, Object>> groups = new ArrayList<>();
        for (Map.Entry<UUID, List<Transaction>> e : bySubCash.entrySet()) {
            String name = bankAccountRepository.findById(e.getKey())
                    .map(BankAccount::getName).orElse("Alt Kasa");
            BigDecimal total = e.getValue().stream()
                    .map(Transaction::getAmount).filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            groups.add(Map.of(
                    "sub_cash_id", e.getKey().toString(),
                    "sub_cash_name", name,
                    "tx_list", e.getValue().stream().map(this::txSummary).toList(),
                    "tx_count", e.getValue().size(),
                    "total", total));
        }
        if (!unassigned.isEmpty()) {
            BigDecimal total = unassigned.stream()
                    .map(Transaction::getAmount).filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            Map<String, Object> u = new LinkedHashMap<>();
            u.put("sub_cash_id", null);
            u.put("sub_cash_name", "Atanmamış POS");
            u.put("tx_list", unassigned.stream().map(this::txSummary).toList());
            u.put("tx_count", unassigned.size());
            u.put("total", total);
            groups.add(u);
        }
        // Grand total — distinct tx
        BigDecimal grandTotal = posTxs.stream()
                .map(Transaction::getAmount).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> section = new LinkedHashMap<>();
        section.put("groups", groups);
        section.put("grand_total", grandTotal);
        section.put("grand_count", posTxs.size());
        return section;
    }

    private Map<String, Object> buildTransfersSection(List<Transaction> all) {
        // Dışarı giden: kind=NORMAL, direction=EXPENSE, payment_method=HESAPDAN
        List<Transaction> outgoing = all.stream()
                .filter(t -> t.getKind() == TransactionKind.NORMAL
                        && t.getDirection() == TransactionDirection.EXPENSE
                        && "HESAPDAN".equalsIgnoreCase(t.getPaymentMethod()))
                .toList();
        // Gelen havale: kind=NORMAL, direction=INCOME, payment_method=HESAPDAN
        List<Transaction> incoming = all.stream()
                .filter(t -> t.getKind() == TransactionKind.NORMAL
                        && t.getDirection() == TransactionDirection.INCOME
                        && "HESAPDAN".equalsIgnoreCase(t.getPaymentMethod()))
                .toList();
        // İçeride: kind=TRANSFER. Cash withdrawal'lar burada DÜŞÜLMELİ (Bölüm C'de göstereceğiz)
        // — yani bank→cash_holder transfer'lerini hariç tutuyoruz.
        List<Transaction> internal = all.stream()
                .filter(t -> t.getKind() == TransactionKind.TRANSFER)
                .filter(t -> !isCashWithdrawal(t))
                // İç transfer paired tx 2 satır oluşturur (OUT + IN). Sadece OUT göster.
                .filter(t -> t.getDirection() == TransactionDirection.EXPENSE)
                .toList();

        Map<String, Object> section = new LinkedHashMap<>();
        section.put("outgoing_external", txGroup(outgoing));
        section.put("internal", txGroup(internal));
        section.put("incoming_external", txGroup(incoming));
        return section;
    }

    private Map<String, Object> buildCashWithdrawals(List<Transaction> all) {
        // Bank → CASH_HOLDER paired transfer = "para çekme"
        List<Transaction> withdrawals = all.stream()
                .filter(t -> t.getKind() == TransactionKind.TRANSFER)
                .filter(this::isCashWithdrawal)
                // Sadece OUT side göster (paired)
                .filter(t -> t.getDirection() == TransactionDirection.EXPENSE)
                .toList();
        return txGroup(withdrawals);
    }

    private Map<String, Object> buildDebtSection(UUID businessId, LocalDate date) {
        // Yeni debt'ler (created_at = date)
        List<Debt> all = debtRepository.findByBusinessIdOrderByCreatedAtDesc(businessId);
        List<Debt> newRcv = new ArrayList<>();
        List<Debt> newPay = new ArrayList<>();
        for (Debt d : all) {
            if (d.getCreatedAt() == null) continue;
            if (!d.getCreatedAt().toLocalDate().equals(date)) continue;
            if (d.getDirection() == DebtDirection.RECEIVABLE) newRcv.add(d);
            else newPay.add(d);
        }

        Map<String, Object> section = new LinkedHashMap<>();
        section.put("new_receivables", debtGroup(newRcv));
        section.put("new_payables", debtGroup(newPay));
        // Ödemeler için DebtPaymentRepository — varsa basit count/total
        // (gerçek günlük debt_payments query'i daha kompleks; v1.1 MVP)
        section.put("payments_received", Map.of("list", List.of(), "count", 0, "total", BigDecimal.ZERO));
        section.put("payments_made", Map.of("list", List.of(), "count", 0, "total", BigDecimal.ZERO));
        return section;
    }

    private Map<String, Object> buildExpenseSection(List<Transaction> all) {
        // Non-HESAPDAN expense (NAKIT vs.) — Bölüm B'deki dışarı giden HESAPDAN'la çakışmaz
        List<Transaction> expenses = all.stream()
                .filter(t -> t.getKind() == TransactionKind.NORMAL
                        && t.getDirection() == TransactionDirection.EXPENSE
                        && !"HESAPDAN".equalsIgnoreCase(t.getPaymentMethod()))
                .toList();
        return txGroup(expenses);
    }

    // ─── helpers ───

    private boolean isCashWithdrawal(Transaction t) {
        if (t.getKind() != TransactionKind.TRANSFER) return false;
        BankAccount bank = t.getBankAccount();
        if (bank == null || bank.getType() == null) return false;
        // OUT tx + bank CHECKING/SAVINGS → check IN tx target via transferPairId
        // Eğer pair_id ile kontrol gerekiyorsa repository call lazım.
        // MVP: bank type CHECKING/SAVINGS olan OUT tarafları "çekilen para"
        // adayı; aslında pair'in IN tarafının CASH_HOLDER olması gerekir.
        // Basit yaklaşım: OUT side CHECKING/SAVINGS ve description'da
        // hint yoksa varsayılan olarak FALSE (yanlış pozitif önle).
        // Doğru yaklaşım: pair_id ile karşı tarafı bul.
        if (t.getTransferPairId() == null) return false;
        if (t.getDirection() != TransactionDirection.EXPENSE) return false;
        if (bank.getType() != BankAccountType.CHECKING
                && bank.getType() != BankAccountType.SAVINGS) return false;
        // IN side
        List<Transaction> pair = transactionRepository
                .findByTransferPairIdOrderByDirectionAsc(t.getTransferPairId());
        for (Transaction p : pair) {
            if (p.getDirection() == TransactionDirection.INCOME) {
                BankAccount toBank = p.getBankAccount();
                if (toBank != null && toBank.getType() == BankAccountType.CASH_HOLDER) {
                    return true;
                }
            }
        }
        return false;
    }

    private Map<String, Object> txSummary(Transaction t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId().toString());
        m.put("amount", t.getAmount());
        m.put("payment_method", t.getPaymentMethod());
        m.put("direction", t.getDirection() != null ? t.getDirection().name() : null);
        m.put("description", t.getDescription());
        m.put("date", t.getDate() != null ? t.getDate().toString() : null);
        m.put("created_at", t.getCreatedAt() != null ? t.getCreatedAt().toString() : null);
        m.put("pos_device_name", t.getPosDevice() != null ? t.getPosDevice().getName() : null);
        m.put("bank_account_name", t.getBankAccount() != null ? t.getBankAccount().getName() : null);
        m.put("counterpart_name", t.getTargetCounterpart() != null
                ? t.getTargetCounterpart().getName() : null);
        return m;
    }

    private Map<String, Object> txGroup(List<Transaction> txs) {
        BigDecimal total = txs.stream()
                .map(Transaction::getAmount).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("list", txs.stream().map(this::txSummary).toList());
        m.put("count", txs.size());
        m.put("total", total);
        return m;
    }

    private Map<String, Object> debtGroup(List<Debt> debts) {
        BigDecimal total = debts.stream()
                .map(Debt::getAmount).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("list", debts.stream().map(d -> {
            Map<String, Object> dm = new LinkedHashMap<>();
            dm.put("id", d.getId().toString());
            dm.put("counterparty", d.getCounterparty());
            dm.put("amount", d.getAmount());
            dm.put("currency", d.getCurrency());
            dm.put("due_date", d.getDueDate() != null ? d.getDueDate().toString() : null);
            dm.put("description", d.getDescription());
            return dm;
        }).toList());
        m.put("count", debts.size());
        m.put("total", total);
        return m;
    }
}
