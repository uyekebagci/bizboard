package com.bizboard.service.notification.telegram;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.ApprovalDto;
import com.bizboard.common.entity.ApprovalRequest;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.NotificationChannelBinding;
import com.bizboard.common.entity.TelegramApprovalCallback;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.ApprovalStatus;
import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.repository.ApprovalRequestRepository;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.NotificationChannelBindingRepository;
import com.bizboard.repository.TelegramApprovalCallbackRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.BusinessAccessGuard;
import com.bizboard.service.approval.ApprovalRequestedEvent;
import com.bizboard.service.approval.ApprovalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Telegram bakiye-düzeltme onay akışı — fan-out gönderim + inline-keyboard
 * callback işleme (tek-kaynak servis).
 *
 * <h3>Gönderim (PENDING → buton-mesajı)</h3>
 * <p>{@link ApprovalRequestedEvent} COMMIT olduktan sonra
 * ({@code AFTER_COMMIT}) tetiklenir. {@code BALANCE_ADJUST} onayları için,
 * onayın işletmesine erişebilen <b>admin-seviye</b> kullanıcıların doğrulanmış
 * Telegram binding'lerine Onayla/Reddet butonlu mesaj gönderir. Her mesaj için
 * tek-kullanımlık bir {@link TelegramApprovalCallback} token'ı saklanır.</p>
 *
 * <h3>Callback (buton tıklaması)</h3>
 * <p>Webhook {@code callback_query} → {@link #handleCallback}. Güvenlik:</p>
 * <ul>
 *   <li><b>Nonce/replay:</b> token tek-kullanım + TTL ({@code isUsable()}).</li>
 *   <li><b>Kimlik:</b> tıklayan chat_id doğrulanmış binding'e ait olmalı; o
 *       kullanıcı <b>admin</b> ve onayın işletmesine erişebilir olmalı.</li>
 *   <li><b>İlk-onay-kazanır:</b> ilk geçerli approve/reject sonucu kilitler;
 *       sonraki butonlar "işlendi" der ve kardeş mesajlar düzenlenir.</li>
 * </ul>
 *
 * <p>STRICT: gerçek onay durumu daima {@link ApprovalRequest}'tedir. Bu servis
 * onay durumunu çoğaltmaz; yalnız Telegram teslim/etkileşim izini yönetir.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TelegramApprovalCallbackService {

    /** Yalnız bu onay türü için Telegram buton-mesajı gönderilir. */
    private static final String ACTION_BALANCE_ADJUST = "BALANCE_ADJUST";

    /** callback_data öneki — webhook'ta hızlı ayrım için. */
    public static final String CALLBACK_PREFIX = "apv";

    /** Buton TTL'i (dk) — bu süre sonra callback reddedilir. */
    private static final long BUTTON_TTL_MINUTES = 60 * 24; // 24 saat

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ApprovalService approvalService;
    private final ApprovalRequestRepository approvalRepository;
    private final TelegramApprovalCallbackRepository callbackRepository;
    private final NotificationChannelBindingRepository bindingRepository;
    private final BankAccountRepository bankAccountRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    private final TelegramClient client;
    private final TelegramProperties props;

    // ──────────────────────── GÖNDERİM (fan-out) ───────────────────────────

    /**
     * Onay PENDING olarak oluşturulup COMMIT olduktan sonra tetiklenir. Telegram
     * yapılandırılmamışsa ya da tür BALANCE_ADJUST değilse sessizce geçer.
     *
     * <p>{@code REQUIRES_NEW}: AFTER_COMMIT'te eski transaction kapandığından
     * lazy alanları ({@code business}) okuyabilmek + callback kayıtlarını
     * kalıcılaştırmak için yeni bir transaction açılır.</p>
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onApprovalRequested(ApprovalRequestedEvent event) {
        try {
            if (!props.isConfigured()) return;
            if (!ACTION_BALANCE_ADJUST.equals(event.actionType())) return;
            sendApprovalButtons(event.approvalRequestId());
        } catch (Exception e) {
            // best-effort: gönderim hatası onay akışını bozmaz (panelden onay yine mümkün).
            log.warn("[tg-approval] buton gönderimi başarısız approval={}: {}",
                    event.approvalRequestId(), e.getMessage());
        }
    }

    void sendApprovalButtons(UUID approvalId) {
        ApprovalRequest req = approvalRepository.findById(approvalId).orElse(null);
        if (req == null || req.getStatus() != ApprovalStatus.PENDING) return;
        UUID businessId = req.getBusiness() != null ? req.getBusiness().getId() : null;
        if (businessId == null) return;

        Set<String> sentChats = new LinkedHashSet<>(); // aynı grup chat'ine tek mesaj
        String html = buildApprovalHtml(req);

        for (NotificationChannelBinding binding :
                bindingRepository.findByChannelAndVerifiedTrue(NotificationChannelType.TELEGRAM)) {
            String chatId = binding.getExternalId();
            if (chatId == null || chatId.isBlank()) continue;
            UUID userId = binding.getUserId();
            // Yalnız admin-seviye + bu işletmeye erişebilen kullanıcılar onaylayabilir.
            if (!accessGuard.isAdmin(userId) || !accessGuard.canAccessBusiness(userId, businessId)) {
                continue;
            }
            if (!sentChats.add(chatId)) continue; // aynı chat'e tekrar gönderme

            String token = newToken();
            List<List<String[]>> keyboard = List.of(List.of(
                    new String[]{"✅ Onayla", CALLBACK_PREFIX + ":" + token + ":A"},
                    new String[]{"❌ Reddet", CALLBACK_PREFIX + ":" + token + ":R"}));

            Optional<Long> messageId = client.sendMessageWithButtons(chatId, html, keyboard);

            callbackRepository.save(TelegramApprovalCallback.builder()
                    .token(token)
                    .approvalRequestId(req.getId())
                    .businessId(businessId)
                    .chatId(chatId)
                    .messageId(messageId.orElse(null))
                    .targetUserId(userId)
                    .expiresAt(LocalDateTime.now().plusMinutes(BUTTON_TTL_MINUTES))
                    .build());
        }

        if (!sentChats.isEmpty()) {
            log.info("[tg-approval] {} sohbete buton gönderildi approval={}", sentChats.size(), approvalId);
        }
    }

    // ──────────────────────── CALLBACK (buton tıklaması) ────────────────────

    /**
     * Telegram {@code callback_query} işleyici. {@code data} formatı:
     * {@code apv:<token>:A|R}. Her dalda kullanıcıya toast cevabı verilir
     * (answerCallbackQuery zorunlu).
     *
     * <p>Kasıtlı olarak DIŞ transaction YOK: karar uygulaması
     * {@code ApprovalService.approve/reject}'in kendi atomik transaction'ında
     * yürür. Token tüketimi/audit, karar COMMIT olduktan sonra ayrı yazılır;
     * "ilk-onay-kazanır" güvencesi durum-kontrolünde (PENDING→terminal) yatar.
     * Böylece içteki rollback dış transaction'ı {@code UnexpectedRollbackException}
     * ile kirletmez.</p>
     */
    public void handleCallback(String callbackQueryId, String data, String fromChatId) {
        // data parse
        String[] parts = data == null ? new String[0] : data.split(":");
        if (parts.length != 3 || !CALLBACK_PREFIX.equals(parts[0])) {
            answer(callbackQueryId, "Geçersiz işlem.", true);
            return;
        }
        String token = parts[1];
        boolean approve = "A".equals(parts[2]);
        if (!approve && !"R".equals(parts[2])) {
            answer(callbackQueryId, "Geçersiz işlem.", true);
            return;
        }

        TelegramApprovalCallback cb = callbackRepository.findByToken(token).orElse(null);
        if (cb == null) {
            answer(callbackQueryId, "Bu buton artık geçerli değil.", true);
            return;
        }

        // 1) Kimlik: tıklayan chat doğrulanmış binding'e ait + admin + işletme erişimi.
        UUID actorUserId = resolveAdminUserForChat(fromChatId, cb.getBusinessId());
        if (actorUserId == null) {
            answer(callbackQueryId, "Bu işlemi onaylama yetkiniz yok.", true);
            return;
        }

        // 2) İlk-onay-kazanır: onay zaten sonuçlanmışsa "işlendi" de + mesajı tazele.
        ApprovalRequest req = approvalRepository.findById(cb.getApprovalRequestId()).orElse(null);
        if (req == null) {
            answer(callbackQueryId, "Onay kaydı bulunamadı.", true);
            return;
        }
        if (req.getStatus() != ApprovalStatus.PENDING) {
            answer(callbackQueryId, "Bu onay zaten işlendi (" + statusTr(req.getStatus()) + ").", true);
            editAllMessages(req, alreadyHandledHtml(req));
            return;
        }

        // 3) Nonce/replay + TTL: token tek-kullanım ve süresi geçmemiş olmalı.
        if (!cb.isUsable()) {
            answer(callbackQueryId,
                    cb.getConsumedAt() != null ? "Bu buton zaten kullanıldı." : "Bu butonun süresi doldu.",
                    true);
            return;
        }

        // 4) Kararı uygula. Red için sabit bir gerekçe (servis red'de reason zorunlu).
        //    Token tüketimi (single-use) BAŞARIDAN SONRA yapılır — geçici hata
        //    butonu yakmaz. Asıl replay koruması durum-kontrolü (PENDING → terminal,
        //    yukarıda step-2); token tek-kullanım ikincil savunmadır.
        try {
            if (approve) {
                approvalService.approve(req.getId(), "Telegram üzerinden onaylandı", actorUserId);
            } else {
                approvalService.reject(req.getId(), "Telegram üzerinden reddedildi", actorUserId);
            }

            // Başarılı → token'ı tüket (replay önleme).
            cb.setConsumedAt(LocalDateTime.now());
            cb.setConsumedBy(actorUserId);
            callbackRepository.save(cb);

            auditCallback(approve ? AuditAction.APPROVAL_APPROVED : AuditAction.APPROVAL_REJECTED,
                    actorUserId, req, fromChatId, approve);

            answer(callbackQueryId, approve ? "Onaylandı ✅" : "Reddedildi ❌", false);
            // İlk-onay-kazanır: bu onaya ait TÜM mesajları sonuç görünümüne çek.
            ApprovalRequest decided = approvalRepository.findById(req.getId()).orElse(req);
            editAllMessages(decided, decisionHtml(decided, actorUserId));
        } catch (IllegalStateException e) {
            // Yarış: bu arada başkası karar vermiş olabilir → işlendi.
            answer(callbackQueryId, "Bu onay az önce işlendi.", true);
            ApprovalRequest fresh = approvalRepository.findById(req.getId()).orElse(req);
            editAllMessages(fresh, alreadyHandledHtml(fresh));
        } catch (Exception e) {
            log.warn("[tg-approval] karar uygulanamadı approval={}: {}", req.getId(), e.getMessage());
            answer(callbackQueryId, "İşlem tamamlanamadı, lütfen panelden deneyin.", true);
        }
    }

    // ──────────────────────── yardımcılar ──────────────────────────────────

    /**
     * Bir chat_id'yi onaylayabilecek admin kullanıcıya çözer: doğrulanmış
     * binding(ler) → admin + işletme-erişimi olan İLK kullanıcı. Grup chat'inde
     * birden çok binding olabilir; sadece admin-seviye olanı yetkilidir.
     */
    private UUID resolveAdminUserForChat(String chatId, UUID businessId) {
        if (chatId == null || chatId.isBlank() || businessId == null) return null;
        return bindingRepository
                .findByChannelAndExternalIdAndVerifiedTrue(NotificationChannelType.TELEGRAM, chatId)
                .stream()
                .map(NotificationChannelBinding::getUserId)
                .filter(uid -> accessGuard.isAdmin(uid) && accessGuard.canAccessBusiness(uid, businessId))
                .findFirst()
                .orElse(null);
    }

    private void editAllMessages(ApprovalRequest req, String html) {
        for (TelegramApprovalCallback cb : callbackRepository.findByApprovalRequestId(req.getId())) {
            if (cb.getMessageId() != null) {
                client.editMessageText(cb.getChatId(), cb.getMessageId(), html);
            }
        }
    }

    private void answer(String callbackQueryId, String text, boolean alert) {
        client.answerCallbackQuery(callbackQueryId, text, alert);
    }

    private String newToken() {
        byte[] buf = new byte[24];
        RANDOM.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf); // ~32 char, URL-safe
    }

    private String buildApprovalHtml(ApprovalRequest req) {
        Map<String, Object> p = req.getPayload() != null ? req.getPayload() : Map.of();
        String accountName = accountName(p.get("id"));
        String amount = format(p.get("newBalance"));
        String desc = strOrNull(p.get("description"));
        String requestedBy = userName(req.getRequestedBy());

        StringBuilder sb = new StringBuilder();
        sb.append("<b>🔔 Bakiye Düzeltme Onayı</b>\n");
        if (accountName != null) sb.append("Hesap: <b>").append(escape(accountName)).append("</b>\n");
        if (amount != null) sb.append("Yeni bakiye: <b>").append(escape(amount)).append("</b>\n");
        if (desc != null) sb.append("Açıklama: ").append(escape(desc)).append("\n");
        if (requestedBy != null) sb.append("Talep eden: ").append(escape(requestedBy)).append("\n");
        sb.append("\nLütfen onaylayın ya da reddedin.");
        return sb.toString();
    }

    private String decisionHtml(ApprovalRequest req, UUID actorUserId) {
        boolean approved = req.getStatus() == ApprovalStatus.APPROVED;
        Map<String, Object> p = req.getPayload() != null ? req.getPayload() : Map.of();
        StringBuilder sb = new StringBuilder();
        sb.append(approved ? "<b>✅ Bakiye Düzeltme Onaylandı</b>\n" : "<b>❌ Bakiye Düzeltme Reddedildi</b>\n");
        String accountName = accountName(p.get("id"));
        if (accountName != null) sb.append("Hesap: <b>").append(escape(accountName)).append("</b>\n");
        String amount = format(p.get("newBalance"));
        if (amount != null) sb.append("Yeni bakiye: <b>").append(escape(amount)).append("</b>\n");
        String who = userName(actorUserId);
        if (who != null) sb.append("Karar veren: ").append(escape(who)).append("\n");
        sb.append("Telegram üzerinden işlendi.");
        return sb.toString();
    }

    private String alreadyHandledHtml(ApprovalRequest req) {
        StringBuilder sb = new StringBuilder();
        sb.append("<b>ℹ️ Bu onay zaten işlendi</b>\n");
        sb.append("Durum: <b>").append(statusTr(req.getStatus())).append("</b>");
        String who = userName(req.getApprover());
        if (who != null) sb.append("\nKarar veren: ").append(escape(who));
        return sb.toString();
    }

    private void auditCallback(String action, UUID actorUserId, ApprovalRequest req,
                              String chatId, boolean approve) {
        Map<String, Object> meta = new HashMap<>();
        meta.put("approvalId", req.getId() != null ? req.getId().toString() : null);
        meta.put("actionType", req.getActionType());
        meta.put("via", "TELEGRAM");
        meta.put("chatId", chatId);
        String detail = (approve ? "Telegram'dan onaylandı: " : "Telegram'dan reddedildi: ") + req.getTitle();
        auditLogService.recordEntityAction(action, actorUserId, userName(actorUserId),
                "APPROVAL_REQUEST", req.getId(), detail, meta, AuditAction.HIGHLIGHT_APPROVAL);
    }

    // ── küçük dönüştürücüler ─────────────────────────────────────────────────

    private String accountName(Object id) {
        UUID accId = uuid(id);
        if (accId == null) return null;
        return bankAccountRepository.findById(accId).map(BankAccount::getName).orElse(null);
    }

    private String userName(UUID userId) {
        if (userId == null) return null;
        return userRepository.findById(userId).map(User::getUsername).orElse(null);
    }

    private static UUID uuid(Object v) {
        if (v == null) return null;
        if (v instanceof UUID u) return u;
        try { return UUID.fromString(v.toString()); } catch (Exception e) { return null; }
    }

    private static String format(Object v) {
        if (v == null) return null;
        try { return new BigDecimal(v.toString()).toPlainString(); } catch (Exception e) { return v.toString(); }
    }

    private static String strOrNull(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private static String statusTr(ApprovalStatus s) {
        return switch (s) {
            case APPROVED -> "Onaylandı";
            case REJECTED -> "Reddedildi";
            case CANCELLED -> "İptal edildi";
            case EXPIRED -> "Süresi doldu";
            case PENDING -> "Bekliyor";
        };
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
