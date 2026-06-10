package com.bizboard.common.search;

import lombok.Builder;
import lombok.Data;

import java.util.UUID;

/**
 * v2.2.0 — autocomplete önerisi (spec §9.1 /suggest, §10.1).
 *
 * <p>Suggestion'lar da arama ile <b>aynı access filter</b> altındadır (spec T9) —
 * yetkisiz entity adı yazarken bile görünmez.</p>
 */
@Data
@Builder
public class Suggestion {
    private SearchEntityType type;
    private UUID id;
    private String label;
    private UUID businessId;
    private String businessName;
    private String url;
}
