package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * MAN-1/MAN-2: Manuel gönderim sonucu — UI "gitti/gitmedi" göstergesi.
 */
@Data
@Builder
public class ManualNotificationResult {

    /** Dispatch (in-app/telegram preference akışı) tetiklenen alıcı sayısı. */
    @JsonProperty("dispatched_recipients")
    private int dispatchedRecipients;

    /** Doğrudan Telegram OUTBOUND başarılı chat sayısı. */
    @JsonProperty("telegram_sent")
    private int telegramSent;

    /** Doğrudan Telegram OUTBOUND başarısız chat sayısı. */
    @JsonProperty("telegram_failed")
    private int telegramFailed;

    /** Chat başına ayrıntı (UI'da satır satır gösterilir). */
    @JsonProperty("telegram_targets")
    private List<TargetResult> telegramTargets;

    @Data
    @Builder
    public static class TargetResult {
        @JsonProperty("chat_id")
        private String chatId;
        @JsonProperty("chat_name")
        private String chatName;
        /** "OK" | "FORBIDDEN" | "RATE_LIMITED" | "ERROR" | "NOT_CONFIGURED" | "UNKNOWN_TARGET" */
        private String status;
    }
}
