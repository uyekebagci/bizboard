package com.bizboard.api.controller;

import com.bizboard.service.ResourceNotAccessibleException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .reduce((a, b) -> a + ", " + b)
                .orElse("Validation failed");
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }
}
