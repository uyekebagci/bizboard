package com.bizboard.api.controller;

import com.bizboard.service.ResourceNotAccessibleException;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }

    /**
     * M-4 (R1): "kayıt bulunamadı" → 400 yerine <b>404</b>. Servisler bir
     * kaynağı bulamadığında {@link jakarta.persistence.EntityNotFoundException}
     * fırlatır; validation hataları {@link IllegalArgumentException} ile 400
     * kalmaya devam eder.
     */
    @ExceptionHandler(jakarta.persistence.EntityNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleEntityNotFound(
            jakarta.persistence.EntityNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("message", e.getMessage() != null ? e.getMessage() : "Kayit bulunamadi"));
    }

    /**
     * 409 Conflict — "Talep geçerli ama mevcut state izin vermiyor". Örnekler:
     * varsayılan firma silinemez, bağlı borç olan karşı firma silinemez, otomatik
     * hesaplanan sabit gider manuel güncellenemez, vb.
     */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleIllegalState(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
    }

    /**
     * H-2 (arch-rules §1.5): cross-tenant READ reddi → 404 "bulunamadı"
     * (varlık sızdırma yok). Mutate reddi {@link SecurityException} ile 403 kalır.
     */
    @ExceptionHandler(ResourceNotAccessibleException.class)
    public ResponseEntity<Map<String, String>> handleNotAccessible(ResourceNotAccessibleException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("message", e.getMessage() != null ? e.getMessage() : "Kayit bulunamadi"));
    }

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, String>> handleSecurity(SecurityException e) {
        // arch-rules §1.5: mutate-deny → 403 (varlık path'ten zaten biliniyor).
        log.warn("[SecurityException -> 403] message={}", e.getMessage(), e);
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", e.getMessage() != null ? e.getMessage() : "Access denied"));
    }

    /**
     * Bozuk/okunamaz request body → 400. Tipik durum: geçersiz enum değeri
     * (ör. bilinmeyen {@code event} / {@code channel}) — Jackson
     * {@link InvalidFormatException} fırlatır. Ham 500 yerine anlamlı 400 döner;
     * hangi değerin geçersiz olduğu mesajda belirtilir.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleNotReadable(HttpMessageNotReadableException e) {
        if (e.getCause() instanceof InvalidFormatException ife
                && ife.getTargetType() != null && ife.getTargetType().isEnum()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "message", "Gecersiz deger: '" + ife.getValue() + "' ("
                            + ife.getTargetType().getSimpleName() + " icin kabul edilmiyor)"));
        }
        return ResponseEntity.badRequest().body(Map.of("message", "Gecersiz istek govdesi"));
    }

    /**
     * DB bütünlük ihlali (unique/check/FK) → 409 Conflict. Ham 500 sızmaz; iç
     * SQL detayı (constraint adı vb.) yalnız sunucu log'una yazılır, istemciye
     * generic ama anlamlı mesaj döner. (notif-pref bug: eski enum CHECK ihlali
     * artık 500 değil 409.)
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrity(DataIntegrityViolationException e) {
        log.error("[data integrity -> 409] message={}", e.getMostSpecificCause().getMessage(), e);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "Kayit kaydedilemedi: veri butunlugu kisitlamasi"));
    }

    /**
     * Desteklenmeyen HTTP method → <b>405 Method Not Allowed</b> (eskiden bu
     * exception yakalanmıyor, generic handler üzerinden 500 dönüyordu — bkz.
     * bug 4b679467, {@code PATCH /categories/{id}} 500). İzin verilen method'lar
     * {@code Allow} header'ında döner; istemciye iç detay sızmaz.
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException e) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED);
        if (e.getSupportedHttpMethods() != null && !e.getSupportedHttpMethods().isEmpty()) {
            builder.allow(e.getSupportedHttpMethods().toArray(new org.springframework.http.HttpMethod[0]));
        }
        return builder.body(Map.of("message", "Bu kaynak icin '" + e.getMethod() + "' metodu desteklenmiyor"));
    }

    /**
     * Zorunlu query/path parametresi eksik (ör. business_id gönderilmedi) → 400.
     * Yakalanmazsa Spring generic 500'e düşürür.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, String>> handleMissingParam(
            MissingServletRequestParameterException e) {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "Zorunlu parametre eksik: " + e.getParameterName()));
    }

    /**
     * Query/path parametresi yanlış tipte (ör. geçersiz UUID formatı) → 400.
     * Yakalanmazsa generic 500'e düşer.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> handleTypeMismatch(
            MethodArgumentTypeMismatchException e) {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "Gecersiz parametre degeri: " + e.getName()));
    }

    /**
     * M-6 (R1): yakalanmamış exception'lar → 500. İç hata mesajı / sınıf adı
     * istemciye SIZMAZ; tam stack trace + tip yalnızca sunucu log'una yazılır
     * (Sevalla log'undan teşhis için). İstemci generic mesaj alır.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGeneric(Exception e) {
        log.error("[unhandled exception -> 500] type={} message={}",
                e.getClass().getName(), e.getMessage(), e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", "Beklenmeyen bir sunucu hatasi olustu"));
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Map<String, String>> handleBadCredentials(BadCredentialsException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Kullanici adi veya sifre hatali"));
    }

    /**
     * Devre dışı (pasifleştirilmiş) hesapla login → <b>403 Forbidden</b>.
     * Spring Security {@code DaoAuthenticationProvider}, {@link UserPrincipal#isEnabled()}
     * {@code false} dönünce şifre doğru olsa bile {@link DisabledException} fırlatır.
     * Bu exception {@link BadCredentialsException} değildir; daha önce yakalanmadığı
     * için generic handler üzerinden <b>500</b>'e düşüyordu (bug: "umut-login 500").
     * Artık temiz 403 + anlamlı Türkçe mesaj döner.
     */
    @ExceptionHandler(DisabledException.class)
    public ResponseEntity<Map<String, String>> handleDisabled(DisabledException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", "Hesabiniz devre disi birakilmis. Lutfen yonetici ile iletisime gecin."));
    }

    /**
     * Kilitli hesapla login → <b>403 Forbidden</b>. {@link LockedException} de
     * {@link DisabledException} gibi {@code AccountStatusException} alt tipidir ve
     * {@code BadCredentialsException} değildir; yakalanmazsa 500'e düşerdi.
     */
    @ExceptionHandler(LockedException.class)
    public ResponseEntity<Map<String, String>> handleLocked(LockedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", "Hesabiniz kilitlenmis. Lutfen yonetici ile iletisime gecin."));
    }

    /**
     * Diğer tüm kimlik-doğrulama hataları (örn. {@code AccountExpiredException},
     * {@code CredentialsExpiredException}) → <b>401</b>. Güvenli son durak: hiçbir
     * {@link AuthenticationException} alt tipi generic 500 handler'ına düşmesin.
     * Daha spesifik handler'lar ({@code BadCredentials} 401, {@code Disabled}/{@code Locked}
     * 403) Spring tarafından önce seçilir; bu sadece kalanları yakalar.
     */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, String>> handleAuthentication(AuthenticationException e) {
        log.warn("[auth -> 401] type={} message={}", e.getClass().getSimpleName(), e.getMessage());
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("message", "Kullanici adi veya sifre hatali"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .reduce((a, b) -> a + ", " + b)
                .orElse("Validation failed");
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }
}
