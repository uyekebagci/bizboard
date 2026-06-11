package com.bizboard.service;

/**
 * Ledger v2 (Faz B — Gün Açılışı): işlem-giriş enforcement reddi.
 *
 * <p>{@link IllegalStateException} alt türü → {@code GlobalExceptionHandler}
 * tarafından <b>409 CONFLICT</b> + {@code {message}} ile döner ("talep geçerli
 * ama mevcut state izin vermiyor" — gün AÇIK değil). FE mesajı algılayıp "Günü
 * Aç" yönlendirmesi gösterir.</p>
 *
 * <p>Mesaj sabiti FE'nin metinden bağımsız tespit yapabilmesi için yapısaldır:
 * her mesaj {@code [DAY_NOT_OPEN]} ön-ekiyle başlar.</p>
 */
public class DayNotOpenException extends IllegalStateException {

    /** FE'nin yanıt mesajından enforcement reddini ayırt etmesi için ön-ek. */
    public static final String CODE = "[DAY_NOT_OPEN]";

    public DayNotOpenException(String message) {
        super(CODE + " " + message);
    }
}
