package com.bizboard.service.pdf;

/**
 * Banka ekstresi PDF parse hatası — okunamayan/şifreli/beklenmedik içerik.
 * Controller bunu 400 + anlamlı Türkçe mesaja çevirir.
 */
public class StatementParseException extends RuntimeException {

    public StatementParseException(String message) {
        super(message);
    }

    public StatementParseException(String message, Throwable cause) {
        super(message, cause);
    }
}
