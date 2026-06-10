package com.bizboard.common.search;

/**
 * Query parse/validation hatası. {@code IllegalArgumentException}'dan türer ki
 * mevcut {@code GlobalExceptionHandler} bunu otomatik <b>400 Bad Request</b> +
 * {@code {"message": ...}} olarak döndürsün (spec §9.3).
 *
 * <p>Mesaj kullanıcıya gösterilir; permission ipucu / iç detay sızdırmaz.</p>
 */
public class SearchQueryException extends IllegalArgumentException {
    public SearchQueryException(String message) {
        super(message);
    }
}
