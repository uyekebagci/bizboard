package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.ChangePasswordRequest;
import com.bizboard.common.dto.ProfileDto;
import com.bizboard.common.entity.AuditLog;
import com.bizboard.common.entity.User;
import com.bizboard.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final AuditLogService auditLogService;
    // Kullanıcı-bazlı sidebar sayfa-erişimini /me response'una eklemek için.
    private final PageAccessService pageAccessService;

    public ProfileDto getProfile(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        ProfileDto dto = DtoMapper.toProfileDto(user);
        // İzinli sayfaları FE'ye expose. "all"/admin → ["all"] sentinel'i (FE
        // tüm sayfaları gösterir); aksi takdirde açık anahtar listesi.
        if (pageAccessService.isAll(user.getAllowedPages(), user.getRole())) {
            dto.setAllowedPages(List.of(PageAccessService.ALL));
        } else {
            dto.setAllowedPages(List.copyOf(
                    pageAccessService.resolveAllowed(user.getAllowedPages(), user.getRole())));
        }
        return dto;
    }

    /**
     * Şifre değiştir. Başarılı olursa:
     * <ul>
     *   <li>Yeni şifre hash'lenip kaydedilir.</li>
     *   <li>Bu kullanıcının TÜM aktif refresh token'ları revoke edilir
     *       (tüm cihazlardan otomatik logout — güvenlik için kritik).</li>
     *   <li>Audit log düşülür.</li>
     * </ul>
     *
     * <p>Çağıran controller'ın kendi yaptığı isteğe ait refresh cookie'sini
     * de temizlemesi beklenir; aksi takdirde tarayıcı eski (artık revoke
     * edilmiş) token'ı yollamaya devam eder.</p>
     */
    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest request, HttpServletRequest httpRequest) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new InvalidCurrentPasswordException();
        }
        if (passwordEncoder.matches(request.getNewPassword(), user.getPassword())) {
            // Aynı şifre — UX için 400, brute force surface yok.
            throw new SamePasswordException();
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        // İlk-giriş zorunlu parola değişikliği akışı tamamlandı — bayrağı sıfırla.
        if (user.isMustChangePassword()) {
            user.setMustChangePassword(false);
        }
        userRepository.save(user);

        int revoked = refreshTokenService.revokeAllForUser(user.getId());
        log.info("[password-change] user={} active sessions revoked={}", user.getId(), revoked);

        auditLogService.recordPasswordChange(user.getId(), user.getUsername(), revoked, httpRequest);
    }

    /** Mevcut şifre yanlış — controller 400 BAD_REQUEST veya 401 dönebilir. */
    public static class InvalidCurrentPasswordException extends RuntimeException {
        public InvalidCurrentPasswordException() { super("current password is incorrect"); }
    }

    /** Yeni şifre eskisiyle aynı. */
    public static class SamePasswordException extends RuntimeException {
        public SamePasswordException() { super("new password must differ from current"); }
    }
}
