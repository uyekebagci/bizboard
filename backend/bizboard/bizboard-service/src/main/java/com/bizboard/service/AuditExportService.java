package com.bizboard.service;

import com.bizboard.common.dto.AuditLogDto;
import com.bizboard.repository.AuditLogRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Filtreli audit export — CSV veya JSON (mod-audit v2).
 *
 * <p>Aynı filtreler {@code AuditLogQueryService.search} ile uyumlu. Bir export
 * çağrısında azami {@link #MAX_EXPORT_ROWS} satır (OOM / abuse koruması). Çıktı
 * in-memory üretilir; çok büyük export için ileride streaming gerekir.</p>
 */
@Slf4j
@Service
public class AuditExportService {

    /** Tek export çağrısının üst sınırı (DoS / OOM koruması). */
    public static final int MAX_EXPORT_ROWS = 50_000;

    private static final String[] CSV_HEADERS = {
            "occurred_at", "actor_user_id", "actor_username", "action",
            "entity_type", "entity_id", "business_id", "ip", "user_agent",
            "highlight_type", "detail"
    };

    private final AuditLogRepository repository;
    private final ObjectMapper objectMapper;

    public AuditExportService(AuditLogRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    /** Filtreyle eşleşen kayıtları DTO listesine çevirir (yeni→eski, üst-sınırlı). */
    @Transactional(readOnly = true)
    public List<AuditLogDto> fetch(UUID actorId, String action, String entityType,
                                   UUID businessId, LocalDateTime from, LocalDateTime to) {
        String businessIdStr = businessId != null ? businessId.toString() : null;
        return repository.findForExport(actorId, action, entityType, businessIdStr, from, to, MAX_EXPORT_ROWS)
                .stream()
                .map(AuditLogMapper::toDto)
                .toList();
    }

    /** RFC-4180 uyumlu CSV (BOM yok; tüm alanlar quote-safe escape edilir). */
    public String toCsv(List<AuditLogDto> rows) {
        StringBuilder sb = new StringBuilder(rows.size() * 128 + 256);
        sb.append(String.join(",", CSV_HEADERS)).append("\r\n");
        for (AuditLogDto r : rows) {
            sb.append(csv(str(r.getOccurredAt()))).append(',')
              .append(csv(str(r.getActorUserId()))).append(',')
              .append(csv(r.getActorUsername())).append(',')
              .append(csv(r.getAction())).append(',')
              .append(csv(r.getEntityType())).append(',')
              .append(csv(str(r.getEntityId()))).append(',')
              .append(csv(str(r.getBusinessId()))).append(',')
              .append(csv(r.getIp())).append(',')
              .append(csv(r.getUserAgent())).append(',')
              .append(csv(r.getHighlightType())).append(',')
              .append(csv(r.getDetail()))
              .append("\r\n");
        }
        return sb.toString();
    }

    /** JSON array çıktısı (DTO snake_case alan adlarıyla). */
    public String toJson(List<AuditLogDto> rows) {
        try {
            return objectMapper.writeValueAsString(rows);
        } catch (JsonProcessingException e) {
            log.warn("[audit-export] json serialize failed: {}", e.getMessage());
            return "[]";
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }

    /** RFC-4180 escape: ayraç/quote/newline içeren değer çift-tırnaklanır. */
    private static String csv(String v) {
        if (v == null) return "";
        boolean needQuote = v.indexOf(',') >= 0 || v.indexOf('"') >= 0
                || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0;
        if (!needQuote) return v;
        return '"' + v.replace("\"", "\"\"") + '"';
    }
}
