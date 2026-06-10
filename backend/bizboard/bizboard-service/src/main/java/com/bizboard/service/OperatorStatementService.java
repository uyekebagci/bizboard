package com.bizboard.service;

import com.bizboard.common.dto.OperatorStatementDto;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.JournalEntry;
import com.bizboard.common.entity.Posting;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.JournalSourceType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.PostingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.11 / TODO 4+7) — operatör kâr-merkezi READ-ONLY statement.
 *
 * <p>Operatör alt kasası MANUEL girişe kapalı; bakiye TÜRETİLİR:</p>
 * <pre>
 *   bakiye = Σ(otomatik kâr payı posting source=auto) − Σ(operatöre ödeme)
 *          = Σ(o hesaba ait tüm posting.amount)
 * </pre>
 * <p>Statement = biriken kâr posting'leri + ödemeler + güncel bakiye. CRUD yok;
 * yalnız görüntü + drill-down. Provisional (T+1 bekleyen) ayrı gösterilir.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OperatorStatementService {

    private final PostingRepository postingRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessAccessGuard accessGuard;

    /** Bir işletmenin operatör kâr-merkezi (PROFIT_CENTER) hesapları. */
    @Transactional(readOnly = true)
    public List<BankAccount> profitCenters(UUID businessId) {
        return bankAccountRepository
                .findByBusinessIdAndTypeOrderByNameAsc(businessId, BankAccountType.SUB_CASH)
                .stream()
                .filter(BankAccount::isProfitCenter)
                .toList();
    }

    /** Operatör listesi (özet bakiyelerle) — read-only ekran üst-listesi. */
    @Transactional(readOnly = true)
    public List<OperatorStatementDto> listOperators(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        List<OperatorStatementDto> out = new ArrayList<>();
        for (BankAccount acc : profitCenters(businessId)) {
            out.add(buildStatement(acc, false));
        }
        return out;
    }

    /** Tek operatörün tam statement'ı (satır satır). */
    @Transactional(readOnly = true)
    public OperatorStatementDto statement(UUID userId, UUID businessId, UUID accountId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        BankAccount acc = bankAccountRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Operatör kasası bulunamadı"));
        if (acc.getBusiness() == null || !acc.getBusiness().getId().equals(businessId)) {
            throw new IllegalArgumentException("Operatör kasası farklı işletmeye ait");
        }
        if (!acc.isProfitCenter()) {
            throw new IllegalArgumentException(
                    "Bu hesap operatör kâr-merkezi değil (read-only statement yok): " + acc.getName());
        }
        return buildStatement(acc, true);
    }

    // ──────────────────────────── BUILD ────────────────────────────

    private OperatorStatementDto buildStatement(BankAccount acc, boolean withLines) {
        List<Posting> postings = postingRepository.findByAccountIdWithEntry(acc.getId());

        BigDecimal earned = BigDecimal.ZERO;     // PROFIT_SHARE giriş (+)
        BigDecimal paidOut = BigDecimal.ZERO;    // ödeme çıkış (− → +olarak topla)
        BigDecimal provisional = BigDecimal.ZERO;
        BigDecimal balance = BigDecimal.ZERO;
        List<OperatorStatementDto.StatementLine> lines = withLines ? new ArrayList<>() : null;

        for (Posting p : postings) {
            JournalEntry e = p.getJournalEntry();
            BigDecimal amt = p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO;
            balance = balance.add(amt);
            boolean isProfitShare = e != null && e.getSourceType() == JournalSourceType.PROFIT_SHARE;
            boolean isProvisional = isProfitShare && e.getDescription() != null
                    && e.getDescription().startsWith("[PROV]");
            if (amt.signum() > 0) {
                earned = earned.add(amt);
                if (isProvisional) provisional = provisional.add(amt);
            } else if (amt.signum() < 0) {
                paidOut = paidOut.add(amt.abs());
            }
            if (withLines) {
                lines.add(OperatorStatementDto.StatementLine.builder()
                        .postingId(p.getId())
                        .journalEntryId(e != null ? e.getId() : null)
                        .date(e != null ? e.getEntryDate() : null)
                        .sourceType(e != null && e.getSourceType() != null ? e.getSourceType().name() : null)
                        .description(e != null ? e.getDescription() : null)
                        .amount(amt)
                        .provisional(isProvisional)
                        .build());
            }
        }

        return OperatorStatementDto.builder()
                .accountId(acc.getId())
                .accountName(acc.getName())
                .operatorCounterpartId(acc.getOperatorCounterpart() != null
                        ? acc.getOperatorCounterpart().getId() : null)
                .operatorName(acc.getOperatorCounterpart() != null
                        ? acc.getOperatorCounterpart().getName() : null)
                .totalEarned(earned)
                .totalPaidOut(paidOut)
                .balance(balance)
                .provisionalPending(provisional)
                .lines(lines)
                .build();
    }
}
