package com.bizboard.api.controller;

import com.bizboard.common.dto.BusinessTypeDefaultCostDto;
import com.bizboard.common.dto.UpsertDefaultCostRequest;
import com.bizboard.service.BusinessTypeDefaultCostService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Admin tarafı: işletme tiplerine bağlı default cost şablonları yönetimi.
 *
 * <p>{@code /admin/**} kuralı ROLE_ADMIN gerektirir.</p>
 */
@RestController
@RequestMapping("/admin/business-types")
@RequiredArgsConstructor
public class AdminBusinessTypeController {

    private final BusinessTypeDefaultCostService service;

    @GetMapping("/{businessTypeId}/default-costs")
    public ResponseEntity<List<BusinessTypeDefaultCostDto>> list(@PathVariable UUID businessTypeId) {
        return ResponseEntity.ok(service.listForType(businessTypeId));
    }

    @PostMapping("/{businessTypeId}/default-costs")
    public ResponseEntity<BusinessTypeDefaultCostDto> create(
            @PathVariable UUID businessTypeId,
            @Valid @RequestBody UpsertDefaultCostRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(businessTypeId, request));
    }

    @PutMapping("/default-costs/{id}")
    public ResponseEntity<BusinessTypeDefaultCostDto> update(
            @PathVariable UUID id,
            @Valid @RequestBody UpsertDefaultCostRequest request) {
        return ResponseEntity.ok(service.update(id, request));
    }

    @DeleteMapping("/default-costs/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
