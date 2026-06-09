package com.bizboard.security;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Slf4j
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    /**
     * Comma-separated allowed origins for CORS.
     * Set via {@code APP_CORS_ALLOWED_ORIGINS} env var on Sevalla.
     * Example: {@code https://app.example.com,https://test.example.com}
     * Default falls back to local development frontends.
     */
    @Value("${app.cors.allowed-origins:http://localhost:3000,http://localhost:3001}")
    private String allowedOriginsRaw;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/auth/**").permitAll()
                        // Kubernetes / Sevalla probes — both legacy and Spring Boot 3 grouped probes.
                        .requestMatchers("/actuator/health",
                                          "/actuator/health/**",
                                          "/actuator/info",
                                          "/actuator/prometheus").permitAll()
                        // Beta v1.1: deploy doğrulama endpoint'i (public).
                        .requestMatchers("/version").permitAll()
                        // Telegram bot webhook: public route ama controller'da
                        // X-Telegram-Bot-Api-Secret-Token env secret'ı ile doğrulanır.
                        .requestMatchers("/telegram/webhook").permitAll()
                        .requestMatchers("/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated()
                )
                // v1.6.23.1: anonymous → 401 (frontend silent refresh tetiklensin),
                // authenticated but missing role → 403. Spring Security 6 default'u
                // her ikisinde de 403 dönüyor (AnonymousAuthenticationFilter
                // "anonymousUser" set ettiği için AuthorizationFilter
                // AccessDeniedException atıyor). Burada principal'ı kontrol
                // ederek anonymous case'i 401'e map'liyoruz — frontend client
                // 401'de silent refresh'i tetikler.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> {
                            res.setStatus(jakarta.servlet.http.HttpServletResponse.SC_UNAUTHORIZED);
                            res.setContentType("application/json;charset=UTF-8");
                            res.getWriter().write(
                                    "{\"status\":401,\"code\":\"AUTH-401\",\"message\":\"Kimlik dogrulamasi gerekli\"}");
                        })
                        .accessDeniedHandler((req, res, e) -> {
                            var auth = org.springframework.security.core.context.SecurityContextHolder
                                    .getContext().getAuthentication();
                            boolean anonymous = auth == null
                                    || auth instanceof org.springframework.security.authentication.AnonymousAuthenticationToken
                                    || !auth.isAuthenticated();
                            if (anonymous) {
                                res.setStatus(jakarta.servlet.http.HttpServletResponse.SC_UNAUTHORIZED);
                                res.setContentType("application/json;charset=UTF-8");
                                res.getWriter().write(
                                        "{\"status\":401,\"code\":\"AUTH-401\",\"message\":\"Kimlik dogrulamasi gerekli\"}");
                            } else {
                                res.setStatus(jakarta.servlet.http.HttpServletResponse.SC_FORBIDDEN);
                                res.setContentType("application/json;charset=UTF-8");
                                res.getWriter().write(
                                        "{\"status\":403,\"code\":\"AUTH-403\",\"message\":\"Bu islem icin yetkin yok\"}");
                            }
                        })
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> origins = Arrays.stream(allowedOriginsRaw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        log.info("[cors] allowed origins: {}", origins);

        CorsConfiguration configuration = new CorsConfiguration();

        // setAllowedOriginPatterns enables wildcard matching for e.g. preview deploys
        // (https://*.sevalla.app). Plain origins still work.
        configuration.setAllowedOriginPatterns(origins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Content-Disposition"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
