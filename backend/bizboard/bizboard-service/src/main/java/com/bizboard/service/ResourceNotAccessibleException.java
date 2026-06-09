package com.bizboard.service;

/**
 * H-2 güvenlik fix (arch-rules §1.5): cross-tenant READ reddi.
 *
 * <p>Bir kullanıcı erişemediği bir işletmenin verisini OKUMAYA çalıştığında
 * fırlatılır. {@code GlobalExceptionHandler} bunu <b>404 "Kayıt bulunamadı"</b>
 * yapar — varlık sızdırmamak için (403 "var ama erişemezsin" sinyali vermez).</p>
 *
 * <p>Mutate (create/update/delete) reddi için {@link SecurityException} → 403
 * kullanılmaya devam eder (varlık zaten path'ten biliniyor; 403 doğru).</p>
 */
public class ResourceNotAccessibleException extends RuntimeException {
    public ResourceNotAccessibleException() {
        super("Kayit bulunamadi");
    }

    public ResourceNotAccessibleException(String message) {
        super(message);
    }
}
