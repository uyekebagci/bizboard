package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * CHT-1: Bağlı bir Telegram chat'in admin görünümü.
 *
 * <p>Veri: doğrulanmış {@code NotificationChannelBinding} + Telegram getChat ile
 * zenginleştirilmiş chat tipi/adı + bağlı bizboard kullanıcısı + tercih sayacı.</p>
 */
@Data
@Builder
public class TelegramChatDto {

    /** Binding id (per-chat tercih işlemleri bunu kullanır). */
    @JsonProperty("binding_id")
    private UUID bindingId;

    /** Telegram chat_id (external_id). Hedefli gönderimde kullanılır. */
    @JsonProperty("chat_id")
    private String chatId;

    /** "DM" | "GROUP" (Telegram type → normalize). Zenginleştirilemezse "UNKNOWN". */
    @JsonProperty("chat_type")
    private String chatType;

    /** Telegram'dan zenginleştirilmiş görünen ad (grup başlığı / kişi adı). */
    @JsonProperty("chat_name")
    private String chatName;

    /** Bağlı bizboard kullanıcısı (id). */
    @JsonProperty("user_id")
    private UUID userId;

    /** Bağlı kullanıcının adı (forensik/okunabilirlik). */
    @JsonProperty("user_name")
    private String userName;

    @JsonProperty("username")
    private String username;

    /** Bağlanma (binding oluşturma) tarihi. */
    @JsonProperty("linked_at")
    private LocalDateTime linkedAt;

    /** Kaç event açık (CHT-2 sayacı). */
    @JsonProperty("enabled_event_count")
    private int enabledEventCount;

    /** Toplam event sayısı (NotificationEvent.values().length). */
    @JsonProperty("total_event_count")
    private int totalEventCount;
}
