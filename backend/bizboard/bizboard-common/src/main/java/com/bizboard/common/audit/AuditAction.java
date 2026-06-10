package com.bizboard.common.audit;

/** Canonical action names used in {@link com.bizboard.common.entity.AuditLog#action}. */
public final class AuditAction {
    private AuditAction() {}

    // ── File operations ──────────────────────────────────────────────────
    public static final String FILE_UPLOAD          = "FILE_UPLOAD";
    public static final String FILE_DOWNLOAD        = "FILE_DOWNLOAD";
    public static final String FILE_DELETE          = "FILE_DELETE";
    public static final String FILE_DOWNLOAD_DENIED = "FILE_DOWNLOAD_DENIED";

    // ── Auth / session ───────────────────────────────────────────────────
    public static final String USER_LOGIN_SUCCESS = "USER_LOGIN_SUCCESS";
    public static final String USER_LOGIN_FAILED  = "USER_LOGIN_FAILED";
    public static final String USER_LOGOUT        = "USER_LOGOUT";
    public static final String PASSWORD_CHANGED   = "PASSWORD_CHANGED";
    public static final String REFRESH_TOKEN_THEFT_DETECTED = "REFRESH_TOKEN_THEFT_DETECTED";

    // ── User management (admin actions) ──────────────────────────────────
    public static final String USER_CREATE        = "USER_CREATE";
    public static final String USER_UPDATE        = "USER_UPDATE";
    public static final String USER_DELETE        = "USER_DELETE";
    public static final String USER_ROLE_CHANGE   = "USER_ROLE_CHANGE";

    // ── Business ─────────────────────────────────────────────────────────
    public static final String BUSINESS_CREATE    = "BUSINESS_CREATE";
    public static final String BUSINESS_UPDATE    = "BUSINESS_UPDATE";
    public static final String BUSINESS_DELETE    = "BUSINESS_DELETE";
    public static final String BUSINESS_MODULE_ADD    = "BUSINESS_MODULE_ADD";
    public static final String BUSINESS_MODULE_REMOVE = "BUSINESS_MODULE_REMOVE";

    // ── Transactions (financial) ─────────────────────────────────────────
    public static final String TRANSACTION_CREATE = "TRANSACTION_CREATE";
    public static final String TRANSACTION_UPDATE = "TRANSACTION_UPDATE";
    public static final String TRANSACTION_DELETE = "TRANSACTION_DELETE";

    // ── Employees (HR / payroll) ─────────────────────────────────────────
    public static final String EMPLOYEE_CREATE    = "EMPLOYEE_CREATE";
    public static final String EMPLOYEE_UPDATE    = "EMPLOYEE_UPDATE";
    public static final String EMPLOYEE_DELETE    = "EMPLOYEE_DELETE";

    // ── Debts / receivables ──────────────────────────────────────────────
    public static final String DEBT_CREATE        = "DEBT_CREATE";
    /** WP a9da4e9d: bireysel borç düzenleme (amount/due_date/description). */
    public static final String DEBT_UPDATE        = "DEBT_UPDATE";
    public static final String DEBT_DELETE        = "DEBT_DELETE";
    public static final String DEBT_SETTLED       = "DEBT_SETTLED";
    public static final String DEBT_MIGRATION     = "DEBT_MIGRATION";
    /** WP a9da4e9d: ödeme almadan manuel düşüm (af/iskonto/mutabakat). */
    public static final String DEBT_WRITEOFF      = "DEBT_WRITEOFF";
    public static final String DEBT_WRITEOFF_REVERSE = "DEBT_WRITEOFF_REVERSE";

    // ── Notifications ────────────────────────────────────────────────────
    public static final String NOTIFICATION_SENT  = "NOTIFICATION_SENT";

    // ── MyCompany (legal entity) ─────────────────────────────────────────
    public static final String MY_COMPANY_CREATE  = "MY_COMPANY_CREATE";
    public static final String MY_COMPANY_UPDATE  = "MY_COMPANY_UPDATE";
    public static final String MY_COMPANY_DELETE  = "MY_COMPANY_DELETE";

    // ── Counterpart (karşı firma / cari hesap) ───────────────────────────
    public static final String COUNTERPART_CREATE = "COUNTERPART_CREATE";
    public static final String COUNTERPART_UPDATE = "COUNTERPART_UPDATE";
    public static final String COUNTERPART_DELETE = "COUNTERPART_DELETE";

    // ── v1.6.19 (WP-2): Günlük kasa kapanışı ─────────────────────────────
    public static final String CASH_CLOSING_CLOSED      = "CASH_CLOSING_CLOSED";
    public static final String CASH_CLOSING_AUTO_CLOSED = "CASH_CLOSING_AUTO_CLOSED";
    public static final String CASH_CLOSING_REOPENED    = "CASH_CLOSING_REOPENED";
    // v1.6.23.4 (BUG-2 fix): backdate kapanış action'ı
    public static final String CASH_CLOSING_BACKDATED   = "CASH_CLOSING_BACKDATED";

    // ── v1.6.19 (WP-2): Audit highlight type sabitleri (AuditLog.highlightType) ───
    public static final String HIGHLIGHT_BACKDATED         = "BACKDATED";
    public static final String HIGHLIGHT_CORRECTION        = "CORRECTION";
    public static final String HIGHLIGHT_CLOSING_REOPEN    = "CLOSING_REOPEN";
    public static final String HIGHLIGHT_POS_RATE_OVERRIDE = "POS_RATE_OVERRIDE";
    // v1.6.23.4 (BUG-2 fix): backdate kapanış için highlight (UI rozet için)
    public static final String HIGHLIGHT_BACKDATED_CLOSING = "BACKDATED_CLOSING";

    // ── v1.6.23.9 (TODO 6ee7a9f1): POS settle akışı ───────────────────────
    public static final String POS_SETTLED                 = "POS_SETTLED";
    public static final String POS_UNSETTLED               = "POS_UNSETTLED";
    public static final String HIGHLIGHT_POS_SETTLED       = "POS_SETTLED";
    public static final String HIGHLIGHT_POS_UNSETTLED     = "POS_UNSETTLED";

    // ── Kategori (cat-be WP): gelir/gider kategori CRUD ───────────────────
    public static final String CATEGORY_CREATE = "CATEGORY_CREATE";
    public static final String CATEGORY_UPDATE = "CATEGORY_UPDATE";
    /** Soft-delete: kategori pasif (active=false); bağlı tx'ler korunur. */
    public static final String CATEGORY_DELETE = "CATEGORY_DELETE";

    // ── Bankalar WP (bakiye düzeltme): admin-only saf bakiye eşitleme ──────
    /**
     * Banka hesabı / kasa / kişide tutulan nakit bakiyesinin doğrudan
     * düzeltilmesi (mutabakat). Gelir/gider <b>yaratmaz</b> — tx oluşmaz; fark
     * yalnız cached current_balance'a yazılır. ADMIN-only. Metadata: eski→yeni
     * bakiye, fark, açıklama, varlık tipi/id. "Görünmez para değişimi" olamaz.
     */
    public static final String BANK_BALANCE_ADJUST = "BANK_BALANCE_ADJUST";
    /** UI vurgu rozeti: bakiye düzeltme audit kaydı için. */
    public static final String HIGHLIGHT_BALANCE_ADJUST = "BALANCE_ADJUST";

    // ── v2.2.0 (Advanced Search, L6): her arama audit'lenir ───────────────
    /** Global arama sorgusu (raw query, filtrelenen business sayısı, sonuç sayısı). */
    public static final String SEARCH_QUERY = "SEARCH_QUERY";
    /** Parser tarafından reddedilen/şüpheli sorgu (T5 injection denemesi vb.). */
    public static final String SEARCH_QUERY_REJECTED = "SEARCH_QUERY_REJECTED";

    // ── Ledger v2 (Faz A): çift-giriş posting backfill / reversal (admin-only) ──
    /** Transaction → Posting backfill (manuel tetik); metadata: total/derived/skip/flagged. */
    public static final String LEDGER_POSTING_BACKFILL = "LEDGER_POSTING_BACKFILL";
    /** Bir tx'in türetilmiş posting'lerinin geri alınması (reversible). */
    public static final String LEDGER_POSTING_REVERSE = "LEDGER_POSTING_REVERSE";
}
