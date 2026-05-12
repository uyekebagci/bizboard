package com.bizboard.common.audit;

/** Canonical action names used in {@link com.bizboard.common.entity.AuditLog#action}. */
public final class AuditAction {
    private AuditAction() {}

    public static final String FILE_UPLOAD       = "FILE_UPLOAD";
    public static final String FILE_DOWNLOAD     = "FILE_DOWNLOAD";
    public static final String FILE_DELETE       = "FILE_DELETE";
    public static final String FILE_DOWNLOAD_DENIED = "FILE_DOWNLOAD_DENIED";

    public static final String USER_LOGIN_SUCCESS = "USER_LOGIN_SUCCESS";
    public static final String USER_LOGIN_FAILED  = "USER_LOGIN_FAILED";
    public static final String USER_LOGOUT        = "USER_LOGOUT";
}
