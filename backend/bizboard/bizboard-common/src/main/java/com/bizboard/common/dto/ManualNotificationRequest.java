package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * MAN-1: Admin manuel bildirim gönderim isteği.
 *
 * <p>Hedef tipi:</p>
 * <ul>
 *   <li>{@code ALL_ADMINS} — tüm admin kullanıcılar (dispatch + tercih saygısı).</li>
 *   <li>{@code USERS} — {@code recipientIds} kullanıcılar (dispatch).</li>
 *   <li>{@code TELEGRAM_CHATS} — {@code telegramChatIds} bağlı chat'lere DOĞRUDAN
 *       Telegram OUTBOUND (admin kasıtlı; preference bypass).</li>
 * </ul>
 *
 * <p>Sanitasyon: başlık ≤ 200, gövde ≤ 2000 (design §3.3).</p>
 */
@Data
public class ManualNotificationRequest {

    public enum RecipientType { ALL_ADMINS, USERS, TELEGRAM_CHATS }

    public enum Channel { IN_APP, TELEGRAM, BOTH }

    @NotNull
    @JsonProperty("recipient_type")
    private RecipientType recipientType;

    /** USERS için bizboard kullanıcı id'leri. */
    @JsonProperty("recipient_ids")
    private List<UUID> recipientIds;

    /** TELEGRAM_CHATS için Telegram chat_id'leri (CHT-1 listesinden). */
    @JsonProperty("telegram_chat_ids")
    private List<String> telegramChatIds;

    /** ALL_ADMINS / USERS için hangi kanal(lar). TELEGRAM_CHATS'te yok sayılır. */
    @JsonProperty("channel")
    private Channel channel;

    @Size(max = 200, message = "Başlık en fazla 200 karakter olabilir")
    private String title;

    @NotBlank(message = "Mesaj boş olamaz")
    @Size(max = 2000, message = "Mesaj en fazla 2000 karakter olabilir")
    private String body;
}
