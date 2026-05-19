package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * v1.6.16.1: Spring Data {@link Page} → frontend uyumlu envelope.
 *
 * <p>Spring'in native {@code Page<T>} serializer'ı şu şekilde JSON üretir:
 * <pre>
 *   { "content": [...], "totalElements": N, "totalPages": M, "last": bool, ... }
 * </pre>
 * Bu alan adları camelCase ve frontend'in beklediği snake_case
 * {@code {items, total_elements, total_pages, has_next}} ile uyuşmuyor.
 *
 * <p>Bu DTO controller'ları frontend ile birebir eşleşen şekle koyar.</p>
 */
@Data
@Builder
public class PagedResponseDto<T> {

    private List<T> items;

    private int page;

    private int size;

    @JsonProperty("total_elements")
    private long totalElements;

    @JsonProperty("total_pages")
    private int totalPages;

    @JsonProperty("has_next")
    private boolean hasNext;

    /** Spring {@code Page<T>} → envelope. */
    public static <T> PagedResponseDto<T> of(Page<T> p) {
        return PagedResponseDto.<T>builder()
                .items(p.getContent())
                .page(p.getNumber())
                .size(p.getSize())
                .totalElements(p.getTotalElements())
                .totalPages(p.getTotalPages())
                .hasNext(p.hasNext())
                .build();
    }
}
