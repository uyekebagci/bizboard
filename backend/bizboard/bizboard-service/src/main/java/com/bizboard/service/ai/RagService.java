package com.bizboard.service.ai;

import com.bizboard.common.entity.AiEmbedding;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * AI modülü (v1.1): RAG sorgu orkestrasyonu. Kullanıcı sorusu → ilgili finansal
 * context retrieve ({@link EmbeddingService}) → Claude ({@link ClaudeChatClient})
 * ile cevap.
 *
 * <p>Örnek sorular: "param nerede", "kâr-zarar durumu", "gider neden arttı".
 * Cevap YALNIZ retrieve edilen tenant-scope context'e dayanır — model
 * uydurmaması için system prompt'ta açıkça sınırlanır.</p>
 *
 * <p><b>Graceful:</b> LLM veya embedding kapalıysa kibar bir "AI kullanılamıyor"
 * cevabı döner; istisna fırlatmaz, app çökmez.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RagService {

    private final EmbeddingService embeddingService;
    private final ClaudeChatClient claudeClient;
    private final AiProperties props;

    private static final String SYSTEM_PROMPT = """
            Sen ÇATI (BizBoard) işletme finans uygulamasının yardımcı AI asistanısın.
            Kullanıcının SADECE kendi işletmesinin finansal verisi hakkında konuşuyorsun.
            Cevaplarını YALNIZCA sana verilen "BAĞLAM" bölümündeki verilere dayandır.
            Bağlamda olmayan bir bilgiyi UYDURMA; bilmiyorsan "Bu konuda elimde yeterli
            veri yok" de. Para tutarlarını Türk Lirası (TL) olarak, kısa ve net yanıtla.
            Finansal tavsiye verme; yalnız mevcut veriyi özetle ve açıkla.
            """;

    public record RagAnswer(String answer, boolean aiUsed, int contextCount) {}

    /**
     * Bir işletme bağlamında kullanıcı sorusunu yanıtlar.
     *
     * @param businessId guard'dan geçmiş tenant id (çağıran doğrulamış olmalı)
     * @param question   kullanıcı sorusu
     */
    public RagAnswer answer(UUID businessId, String question) {
        if (!props.isEnabled() || !props.getRag().isEnabled()) {
            return new RagAnswer("AI asistanı şu an devre dışı.", false, 0);
        }
        if (!claudeClient.isAvailable()) {
            return new RagAnswer("AI asistanı yapılandırılmamış (LLM anahtarı eksik).", false, 0);
        }
        if (question == null || question.isBlank()) {
            return new RagAnswer("Lütfen bir soru yazın.", false, 0);
        }

        List<AiEmbedding> context = embeddingService.retrieve(
                businessId, question, props.getRag().getTopK());

        String contextBlock = context.isEmpty()
                ? "(Bu işletme için indekslenmiş veri bulunamadı.)"
                : context.stream().map(AiEmbedding::getContent)
                        .collect(Collectors.joining("\n- ", "- ", ""));

        String userMessage = """
                BAĞLAM (yalnız bu işletmenin verisi):
                %s

                SORU: %s
                """.formatted(contextBlock, question.trim());

        try {
            String answer = claudeClient.complete(SYSTEM_PROMPT, userMessage);
            return new RagAnswer(answer, true, context.size());
        } catch (ClaudeChatClient.LlmException e) {
            log.warn("[ai-rag] LLM hatası (business={}): {}", businessId, e.getMessage());
            return new RagAnswer("AI şu an cevap veremiyor, lütfen daha sonra tekrar deneyin.",
                    false, context.size());
        }
    }
}
