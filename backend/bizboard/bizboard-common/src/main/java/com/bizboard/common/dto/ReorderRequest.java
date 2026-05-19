package com.bizboard.common.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * v1.6.11: Reorder endpoint'leri için ortak body.
 *
 * Kullanım:
 *   POST /api/me/business-groups/reorder         { "ids": [groupId, ...] }
 *   POST /api/me/business-groups/{id}/members/reorder  { "ids": [businessId, ...] }
 *
 * Client gönderdiği sıraya göre `orderIndex` / `orderInGroup` 0,1,2,... atanır.
 */
@Data
public class ReorderRequest {

    @NotNull
    private List<UUID> ids;
}
