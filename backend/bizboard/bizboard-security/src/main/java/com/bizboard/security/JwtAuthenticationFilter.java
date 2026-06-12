package com.bizboard.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final CustomUserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String token = extractToken(request);

        if (token != null && jwtUtil.validateToken(token)) {
            String username = jwtUtil.getUsernameFromToken(token);
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            // Defense-in-depth: pasifleştirilmiş kullanıcının elindeki JWT hâlâ geçerli
            // olsa bile burada reddet. UserPrincipal.isEnabled de kontrol eder ama
            // Spring Security'nin AuthenticationManager akışından geçtiğimiz için
            // her request'te kendi başımıza da doğruluyoruz.
            if (!userDetails.isEnabled()) {
                log.warn("[auth-filter] rejecting request: user '{}' is not enabled (active=false). "
                        + "If this happens for an existing user post-deploy, check users.is_active "
                        + "for NULL — see UserActiveBackfill.", username);
                filterChain.doFilter(request, response);
                return;
            }

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        // mod-audit: SSE (EventSource) header set edemez → yalnız SSE stream
        // endpoint'i için query-param fallback. Header daima öncelikli; bu
        // fallback SADECE Authorization header yokken ve yalnız bu path için
        // devreye girer (token'ın URL'de loglanma yüzeyi en aza indirilir).
        if (isSseStreamRequest(request)) {
            String qp = request.getParameter("access_token");
            if (StringUtils.hasText(qp)) {
                return qp;
            }
        }
        return null;
    }

    /** Query-param token fallback'i SADECE canlı audit SSE akışına izinli. */
    private boolean isSseStreamRequest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri != null && uri.endsWith("/admin/audit/stream");
    }
}
