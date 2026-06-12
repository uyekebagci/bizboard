package com.bizboard.service.approval;

import com.bizboard.common.entity.ApprovalRequest;
import com.bizboard.service.BankAccountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

/**
 * Onay (Approval) modülü v1.1 — {@code BALANCE_ADJUST} onayı yürütücüsü.
 *
 * <p>Onaylanmış bakiye düzeltme talebinin payload'ından ({@code id},
 * {@code newBalance}, {@code description}, {@code actorUserId}) parametreleri
 * okur ve {@link BankAccountService#adjustBalance} çağırır. Bu, AOP-sarılı
 * {@code adjustBalanceWithApproval} yerine DOĞRUDAN düzeltme metodunu çağırır —
 * yani yeniden onaya gitmez (sonsuz döngü yok).</p>
 *
 * <p>Yürütme {@code ApprovalService.approve} transaction'ı içinde gerçekleşir;
 * bir hata fırlatırsa onay geçişi de rollback olur — "onayladım ama düzeltme
 * yapılmadı" tutarsızlığı imkânsız.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BalanceAdjustApprovalExecutor implements ApprovalExecutor {

    private final BankAccountService bankAccountService;

    @Override
    public String actionType() {
        return "BALANCE_ADJUST";
    }

    @Override
    public void execute(ApprovalRequest request) {
        Map<String, Object> p = request.getPayload();
        if (p == null) {
            throw new IllegalStateException("Onay payload'ı boş — bakiye düzeltme yürütülemez.");
        }
        UUID accountId = uuid(p.get("id"));
        BigDecimal newBalance = decimal(p.get("newBalance"));
        String description = str(p.get("description"));
        UUID actorUserId = uuid(p.get("actorUserId"));

        if (accountId == null || newBalance == null) {
            throw new IllegalStateException(
                    "Onay payload'ı eksik (id/newBalance) — bakiye düzeltme yürütülemez.");
        }

        // DOĞRUDAN düzeltme — AOP-sarılı wrapper DEĞİL → yeniden onaya gitmez.
        bankAccountService.adjustBalance(accountId, newBalance, description, actorUserId);
        log.info("[approval-exec] BALANCE_ADJUST yürütüldü approval={} account={} newBalance={}",
                request.getId(), accountId, newBalance.toPlainString());
    }

    private static UUID uuid(Object v) {
        if (v == null) return null;
        if (v instanceof UUID) return (UUID) v;
        try {
            return UUID.fromString(v.toString());
        } catch (Exception e) {
            return null;
        }
    }

    private static BigDecimal decimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal) return (BigDecimal) v;
        if (v instanceof Number) return BigDecimal.valueOf(((Number) v).doubleValue());
        try {
            return new BigDecimal(v.toString());
        } catch (Exception e) {
            return null;
        }
    }

    private static String str(Object v) {
        return v != null ? v.toString() : null;
    }
}
