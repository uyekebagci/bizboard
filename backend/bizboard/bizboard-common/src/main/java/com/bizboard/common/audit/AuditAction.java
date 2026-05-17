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
    public static final String DEBT_DELETE        = "DEBT_DELETE";
    public static final String DEBT_SETTLED       = "DEBT_SETTLED";
    public static final String DEBT_MIGRATION     = "DEBT_MIGRATION";

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
}
