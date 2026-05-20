package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v1.6.20 (WP-3): İşletme detay sayfasının tek-shot endpoint cevabı.
 *
 * <p>{@code GET /businesses/{id}/consolidated} — bir round-trip ile dashboard'un
 * tüm widget'ları için gerekli veri. Frontend tek seferde fetch eder, ardından
 * her widget kendi bölümünü render eder.</p>
 */
@Data
@Builder
public class ConsolidatedDashboardDto {

    @JsonProperty("business_id")
    private UUID businessId;

    // ─── ÜST: Konsolide Pozisyon ──────────────────────────────────────────
    private ConsolidatedPosition consolidated;

    // ─── Bugünün Kasa Durumu ──────────────────────────────────────────────
    @JsonProperty("today_closing")
    private TodayClosing todayClosing;

    // ─── POS Cihazları (bugün) ────────────────────────────────────────────
    @JsonProperty("pos_devices")
    private List<PosDeviceToday> posDevices;

    // ─── Para Bulunan Hesaplar ────────────────────────────────────────────
    @JsonProperty("bank_accounts")
    private List<BankAccountSummary> bankAccounts;

    // ─── Verecekler (PAYABLE debts) ───────────────────────────────────────
    private List<DebtRow> payables;

    // ─── Alacaklar özeti (RECEIVABLE) ─────────────────────────────────────
    private ReceivablesSummary receivables;

    // ─── Hesaptan Harcama (bugün NAKIT giderler) ──────────────────────────
    @JsonProperty("cash_outflows_today")
    private List<TxRow> cashOutflowsToday;

    // ─── Yaklaşan Çekler (30 gün) ─────────────────────────────────────────
    @JsonProperty("upcoming_cheques")
    private List<ChequeRow> upcomingCheques;

    // ─── Yaklaşan Hatırlatmalar (7 gün) ───────────────────────────────────
    @JsonProperty("upcoming_reminders")
    private List<ReminderRow> upcomingReminders;

    // ─── Net Alacak/Verecek ───────────────────────────────────────────────
    @JsonProperty("net_position")
    private NetPosition netPosition;

    // ═══════════════════════════ İÇ TİPLER ═══════════════════════════════

    @Data @Builder
    public static class ConsolidatedPosition {
        /**
         * v1.6.23.7 (BUG-V2 fix): total_cash artık YALNIZ fiziksel kasa
         * (closing.actual_balance) + CASH_HOLDER hesapları. CHECKING/SAVINGS
         * hesapları ayrı {@link #totalBankBalance} field'ında. Önceki sürümde
         * her ikisi total_cash'e dahildi → HESAPDAN flow'u double-counted.
         */
        @JsonProperty("total_cash")        private BigDecimal totalCash;        // physical kasa + CASH_HOLDER
        /** v1.6.23.7: CHECKING+SAVINGS toplam — kasa-dışı banka pozisyonu. */
        @JsonProperty("total_bank_balance") private BigDecimal totalBankBalance;
        @JsonProperty("credit_card_debt")  private BigDecimal creditCardDebt;  // (-) [reserved — WP-5]
        @JsonProperty("loan_principal")    private BigDecimal loanPrincipal;   // (-) [reserved]
        private BigDecimal receivables;     // (+)
        private BigDecimal payables;        // (-)
        private BigDecimal net;             // total_cash + total_bank_balance - cc - loan + receivables - payables
    }

    @Data @Builder
    public static class TodayClosing {
        @JsonProperty("opening_balance")  private BigDecimal openingBalance;
        @JsonProperty("incoming")         private BigDecimal incoming;
        @JsonProperty("outgoing")         private BigDecimal outgoing;
        @JsonProperty("computed_closing") private BigDecimal computedClosing;
        @JsonProperty("actual_balance")   private BigDecimal actualBalance;
        private BigDecimal difference;
        private boolean closed;
        @JsonProperty("is_auto")          private boolean auto;
        @JsonProperty("closing_id")       private UUID closingId;
    }

    @Data @Builder
    public static class PosDeviceToday {
        @JsonProperty("device_id")        private UUID deviceId;
        @JsonProperty("device_name")      private String deviceName;
        @JsonProperty("today_gross")      private BigDecimal todayGross;
        @JsonProperty("today_commission") private BigDecimal todayCommission;
        @JsonProperty("today_net")        private BigDecimal todayNet;
        @JsonProperty("unsettled_count")  private int unsettledCount;
        @JsonProperty("tx_count")         private int txCount;
    }

    @Data @Builder
    public static class BankAccountSummary {
        private UUID id;
        private String name;
        private String type; // CHECKING / SAVINGS / CASH / CASH_HOLDER
        @JsonProperty("bank_name")    private String bankName;
        @JsonProperty("holder_name")  private String holderName;  // CASH_HOLDER için
        private BigDecimal balance;
        private String currency;
    }

    @Data @Builder
    public static class DebtRow {
        @JsonProperty("debt_id")          private UUID debtId;
        @JsonProperty("counterpart_name") private String counterpartName;
        private BigDecimal amount;
        private String currency;
        @JsonProperty("due_date")         private LocalDate dueDate;
        @JsonProperty("days_to_due")      private Integer daysToDue;  // null = vade yok
        @JsonProperty("instrument_type")  private String instrumentType;
    }

    @Data @Builder
    public static class ReceivablesSummary {
        private BigDecimal total;
        @JsonProperty("type_breakdown") private List<TypeBreakdown> typeBreakdown;
        @JsonProperty("overdue_count")  private int overdueCount;
        @JsonProperty("total_count")    private int totalCount;
    }

    @Data @Builder
    public static class TypeBreakdown {
        private String type;
        private BigDecimal amount;
        private int count;
    }

    @Data @Builder
    public static class TxRow {
        @JsonProperty("tx_id")   private UUID txId;
        private String description;
        @JsonProperty("category_name") private String categoryName;
        private BigDecimal amount;
        @JsonProperty("counterpart_name") private String counterpartName;
        private LocalDate date;
    }

    @Data @Builder
    public static class ChequeRow {
        @JsonProperty("debt_id")             private UUID debtId;
        @JsonProperty("counterpart_name")    private String counterpartName;
        private BigDecimal amount;
        @JsonProperty("cheque_due_date")     private LocalDate chequeDueDate;
        @JsonProperty("cheque_no")           private String chequeNo;
        @JsonProperty("collector_bank")      private String collectorBank;
        @JsonProperty("days_to_due")         private int daysToDue;
    }

    @Data @Builder
    public static class ReminderRow {
        @JsonProperty("debt_id")          private UUID debtId;
        @JsonProperty("counterpart_name") private String counterpartName;
        private BigDecimal amount;
        @JsonProperty("reminder_date")    private LocalDate reminderDate;
        @JsonProperty("reminder_note")    private String reminderNote;
        @JsonProperty("days_to_remind")   private int daysToRemind;
    }

    @Data @Builder
    public static class NetPosition {
        private BigDecimal receivables;
        private BigDecimal payables;
        private BigDecimal net;            // receivables - payables
        @JsonProperty("net_positive")     private boolean netPositive;
    }
}
