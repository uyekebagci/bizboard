package com.bizboard.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * v1.1 small-win: Correlation-Id / Request-Id filtresi.
 * <p>
 * Gelen istekteki {@code X-Request-Id} header'ı okunur; yoksa yeni bir
 * UUID üretilir. Değer SLF4J {@link MDC}'ye {@code requestId} anahtarıyla
 * konur (log pattern'deki {@code %X{requestId}} bunu basar) ve response
 * header'ına geri yansıtılır; böylece istemci/proxy aynı isteği uçtan
 * uca izleyebilir.
 * </p>
 * <p>
 * Güvenlik filtre zincirinin EN BAŞINDA çalışmalı ki JWT doğrulama,
 * yetki ve hata loglarının hepsi requestId taşısın. {@code finally}
 * bloğunda MDC temizlenir — thread havuzunda sızıntı olmaması için.
 * </p>
 *
 * @see SecurityConfig#securityFilterChain(org.springframework.security.config.annotation.web.builders.HttpSecurity)
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    /** Hem gelen hem giden HTTP header adı. */
    public static final String REQUEST_ID_HEADER = "X-Request-Id";

    /** SLF4J MDC anahtarı — application*.yml log pattern'i ile uyumlu. */
    public static final String REQUEST_ID_MDC_KEY = "requestId";

    /** Bozuk/aşırı uzun header değerlerine karşı üst sınır. */
    private static final int MAX_REQUEST_ID_LENGTH = 64;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String requestId = resolveRequestId(request);
        MDC.put(REQUEST_ID_MDC_KEY, requestId);
        response.setHeader(REQUEST_ID_HEADER, requestId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(REQUEST_ID_MDC_KEY);
        }
    }

    private String resolveRequestId(HttpServletRequest request) {
        String incoming = request.getHeader(REQUEST_ID_HEADER);
        if (StringUtils.hasText(incoming)) {
            // Boundary validation: sadece güvenli karakterler, sınırlı uzunluk.
            String trimmed = incoming.trim();
            if (trimmed.length() <= MAX_REQUEST_ID_LENGTH
                    && trimmed.matches("[A-Za-z0-9._-]+")) {
                return trimmed;
            }
        }
        return UUID.randomUUID().toString();
    }
}
