package com.bizboard.api.controller;

import com.bizboard.common.dto.ChangePasswordRequest;
import com.bizboard.common.dto.ProfileDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.UserService;
import com.bizboard.service.UserService.InvalidCurrentPasswordException;
import com.bizboard.service.UserService.SamePasswordException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @Value("${app.refresh.cookie.name:rt}")
    private String cookieName;

    @Value("${app.refresh.cookie.secure:true}")
    private boolean cookieSecure;

    @Value("${app.refresh.cookie.same-site:None}")
    private String cookieSameSite;

    @Value("${app.refresh.cookie.path:/auth}")
    private String cookiePath;

    @Value("${app.refresh.cookie.domain:}")
    private String cookieDomain;

    @GetMapping("/me")
    public ResponseEntity<ProfileDto> getProfile(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(userService.getProfile(principal.getId()));
    }

    /**
     * Şifre değiştir.
     *
     * <p>Başarılı olduğunda backend tüm aktif refresh token'ları DB'de revoke
     * eder. Aynı response'ta refresh cookie'sini de temizleyerek bu tarayıcıyı
     * da logout durumuna geçiririz. Diğer cihazlarda kullanıcı sonraki silent
     * refresh denemesinde 401 alır ve login'e yönlenir.</p>
     */
    @PostMapping("/me/password")
    public ResponseEntity<?> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        try {
            userService.changePassword(principal.getId(), request, httpRequest);
        } catch (InvalidCurrentPasswordException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("code", "AUTH-CURRENT", "message", "Mevcut sifre hatali"));
        } catch (SamePasswordException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("code", "VAL-SAME", "message", "Yeni sifre eski sifreyle ayni olamaz"));
        }

        // Bu tarayıcının refresh cookie'sini de temizle — tüm cihazlardan global logout etkisi.
        ResponseCookie cleared = ResponseCookie.from(cookieName, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path(cookiePath)
                .maxAge(0)
                .build();
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cleared.toString())
                .build();
    }
}
