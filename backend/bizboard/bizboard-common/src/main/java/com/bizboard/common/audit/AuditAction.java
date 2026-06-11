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
    /** Çatı v1.2: Verilen/Alınan Borç (kasa ↔ alacak/verecek TRANSFER'i). */
    public static final String LOAN_CREATE        = "LOAN_CREATE";

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

    // ── Ledger v2 (Faz B): gün-kapanışı / mutabakat / kaçak omurgası ──────────
    /** DayClose finalize (çok-hesaplı sayım + SAĞLAMA HESAP); metadata: opening/in/out/computed/actual/variance. */
    public static final String DAY_CLOSE_CLOSED        = "DAY_CLOSE_CLOSED";
    /** Cron otomatik gün açma/kapama (actual=null). */
    public static final String DAY_CLOSE_AUTO          = "DAY_CLOSE_AUTO";
    /** Admin gün-kapanışını yeniden açtı (REOPENED). */
    public static final String DAY_CLOSE_REOPENED      = "DAY_CLOSE_REOPENED";
    /** §4.1 admin geçmiş tarihe kapanış (feature flag arkasında). */
    public static final String DAY_CLOSE_BACKDATED     = "DAY_CLOSE_BACKDATED";
    /** Variance eşik aşımı — kaçak alarmı. */
    public static final String DAY_CLOSE_ALARM         = "DAY_CLOSE_ALARM";
    /** §4.1 devir zinciri ileri-yeniden-hesap (recomputeChainFrom). */
    public static final String DAY_CLOSE_CHAIN_RECOMPUTE = "DAY_CLOSE_CHAIN_RECOMPUTE";
    /** §8.5 CashClosing → DayClose migrate (idempotent). */
    public static final String DAY_CLOSE_MIGRATED      = "DAY_CLOSE_MIGRATED";

    // ── Ledger v2 (Faz B — Gün Açılışı): state machine + devir yuvarlama ──────
    /** Gün açıldı (hesap açılışları + devir yuvarlama onaylandı). */
    public static final String DAY_OPEN_OPENED          = "DAY_OPEN_OPENED";
    /** Admin geçmiş tarihe gün açtı (feature flag arkasında). */
    public static final String DAY_OPEN_BACKDATED       = "DAY_OPEN_BACKDATED";
    /** Devir-yuvarlama düzeltme posting'i üretildi (Σ=0, DAY_CLOSE_ADJUST). */
    public static final String DAY_OPEN_ROUNDING_POSTED = "DAY_OPEN_ROUNDING_POSTED";
    /** Gün açılışı geri alındı/yeniden açıldı (yuvarlama posting reverse). */
    public static final String DAY_OPEN_REVERTED        = "DAY_OPEN_REVERTED";
    /** DayClose finalize → DayOpen CLOSED senkronu (geriye-uyum backfill dahil). */
    public static final String DAY_OPEN_CLOSED_SYNC     = "DAY_OPEN_CLOSED_SYNC";
    /** İşlem-giriş enforcement bayrağı admin tarafından değiştirildi. */
    public static final String DAY_OPEN_ENFORCE_TOGGLE  = "DAY_OPEN_ENFORCE_TOGGLE";
    /** AÇILMAMIŞ güne işlem girişi bloklandı (enforcement; teşhis izi). */
    public static final String DAY_OPEN_BLOCKED_ENTRY   = "DAY_OPEN_BLOCKED_ENTRY";

    // Highlight rozetleri (UI vurgu)
    public static final String HIGHLIGHT_DAY_OPEN          = "DAY_OPEN";
    public static final String HIGHLIGHT_DAY_OPEN_ROUNDING = "DAY_OPEN_ROUNDING";
    public static final String HIGHLIGHT_DAY_OPEN_BACKDATED = "DAY_OPEN_BACKDATED";

    // ── Ledger v2 (Faz B, §4.2): onaylı kapanış düzenleme ─────────────────────
    public static final String DAY_CLOSE_EDIT_REQUESTED = "DAY_CLOSE_EDIT_REQUESTED";
    public static final String DAY_CLOSE_EDIT_APPROVED  = "DAY_CLOSE_EDIT_APPROVED";
    public static final String DAY_CLOSE_EDIT_REJECTED  = "DAY_CLOSE_EDIT_REJECTED";
    public static final String DAY_CLOSE_EDIT_APPLIED   = "DAY_CLOSE_EDIT_APPLIED";

    // Highlight rozetleri (UI vurgu)
    public static final String HIGHLIGHT_DAY_CLOSE_BACKDATED = "DAY_CLOSE_BACKDATED";
    public static final String HIGHLIGHT_DAY_CLOSE_ALARM     = "DAY_CLOSE_ALARM";
    public static final String HIGHLIGHT_DAY_CLOSE_REOPEN    = "DAY_CLOSE_REOPEN";
    public static final String HIGHLIGHT_DAY_CLOSE_EDIT      = "DAY_CLOSE_EDIT";

    // ── Ledger v2 (Faz B, §3.8 / §5): banka import (manuel satır iskeleti) ─────
    public static final String BANK_IMPORT_BATCH_CREATE = "BANK_IMPORT_BATCH_CREATE";
    public static final String BANK_IMPORT_LINE_POSTED  = "BANK_IMPORT_LINE_POSTED";

    // ── Ledger v2 (Faz C): POS kâr-payı motoru + gider/masraf + aylık kâr ─────
    /** POS işlem (deal) girişi — cihaz/getiren/müşteri oranı + kâr-payı şelalesi. */
    public static final String POS_DEAL_CREATE        = "POS_DEAL_CREATE";
    /** POS deal geri alındı — tüm kâr posting'leri ters çevrildi. */
    public static final String POS_DEAL_REVERSE       = "POS_DEAL_REVERSE";
    /** T+1 settlement finalize — ort.komisyon + OWNER_COMMISSION final adjust. */
    public static final String POS_SETTLEMENT_FINALIZE = "POS_SETTLEMENT_FINALIZE";
    /** Operatör kâr-payı sistem postası (source=auto, read-only kâr-merkezi). */
    public static final String PROFIT_SHARE_POSTED    = "PROFIT_SHARE_POSTED";
    /** ProfitShareRule CRUD (admin). */
    public static final String PROFIT_SHARE_RULE_UPSERT = "PROFIT_SHARE_RULE_UPSERT";
    public static final String PROFIT_SHARE_RULE_DELETE = "PROFIT_SHARE_RULE_DELETE";
    /** Kâr-payı global config (sahip%/Fatih%/Tuncay%) değişikliği. */
    public static final String PROFIT_SHARE_CONFIG_UPDATE = "PROFIT_SHARE_CONFIG_UPDATE";

    // ── Ledger v2 (Faz D, §3.7): çek/senet (Instrument) ─────
    /** Çek/senet portföy girişi (manuel ya da Telegram-foto/OCR onayı). */
    public static final String INSTRUMENT_CREATE      = "INSTRUMENT_CREATE";
    /** Çek/senet onayı (PENDING_OCR → CONFIRMED). */
    public static final String INSTRUMENT_CONFIRM     = "INSTRUMENT_CONFIRM";
    /** Çek/senet tahsil/ödeme (CASHED) — para hesabına Σ=0 posting. */
    public static final String INSTRUMENT_CASH        = "INSTRUMENT_CASH";
    /** Çek/senet karşılıksız (BOUNCED). */
    public static final String INSTRUMENT_BOUNCE      = "INSTRUMENT_BOUNCE";
    /** Çek/senet ciro/devir (ENDORSED) — başka counterpart'a aktarım. */
    public static final String INSTRUMENT_ENDORSE     = "INSTRUMENT_ENDORSE";

    // ── Ledger v2 (Faz D, §3.1 / §7): ayni varlık (ASSET) ─────
    /** Ayni varlık edinimi (iş karşılığı araba/mal) → ASSET hesabına Σ=0 posting. */
    public static final String ASSET_ACQUIRE          = "ASSET_ACQUIRE";
    /** Ayni varlık satışı → ASSET çıkışı + PNL gelir/zarar. */
    public static final String ASSET_SELL             = "ASSET_SELL";

    // ── Ledger v2 (Faz D): patron Excel raporları ─────
    /** Excel/CSV rapor indirildi (hazine/hareket/kategori P&L/POS mutabakat/kaçak/operatör). */
    public static final String REPORT_EXPORTED        = "REPORT_EXPORTED";

    // Highlight rozetleri (UI vurgu)
    public static final String HIGHLIGHT_PROFIT_SHARE   = "PROFIT_SHARE";
    public static final String HIGHLIGHT_POS_DEAL       = "POS_DEAL";
    /** Faz D: çek/senet karşılıksız (kritik — vurgu). */
    public static final String HIGHLIGHT_INSTRUMENT_BOUNCE = "INSTRUMENT_BOUNCE";
}
