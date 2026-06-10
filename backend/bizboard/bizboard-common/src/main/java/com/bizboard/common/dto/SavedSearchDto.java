package com.bizboard.common.dto;

import com.bizboard.common.entity.SavedSearch;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * v2.2.0 — kayıtlı arama yanıt DTO'su (spec §9.1). user_id sızdırılmaz.
 */
@Data
@Builder
public class SavedSearchDto {
    private UUID id;
    private String name;
    private String query;
    private Map<String, Object> filters;
    private LocalDateTime createdAt;

    public static SavedSearchDto from(SavedSearch s) {
        return SavedSearchDto.builder()
                .id(s.getId())
                .name(s.getName())
                .query(s.getQuery())
                .filters(s.getFilters())
                .createdAt(s.getCreatedAt())
                .build();
    }
}
