package com.bizboard.api.controller;

import com.bizboard.common.dto.BusinessTypeDefaultCostDto;
import com.bizboard.common.dto.BusinessTypeDto;
import com.bizboard.service.BusinessService;
import com.bizboard.service.BusinessTypeDefaultCostService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/business-types")
@RequiredArgsConstructor
public class BusinessTypeController {

    private final BusinessService businessService;
    private final BusinessTypeDefaultCostService defaultCostService;

    @GetMapping
    public ResponseEntity<List<BusinessTypeDto>> getBusinessTypes() {
        return ResponseEntity.ok(businessService.getAllBusinessTypes());
    }

    /**
     * v1.5.6: bir tipin varsayılan maliyet şablonlarını döner. Wizard'da
     * "Kurulum maliyetlerini ekle" checkbox işaretlendiğinde önizleme listesi
     * için kullanılır. Read-only — authenticated tüm kullanıcılar görebilir;
     * admin write için ayrı {@code /admin/business-types/...} endpoint'leri var.
     */
    @GetMapping("/{businessTypeId}/default-costs")
    public ResponseEntity<List<BusinessTypeDefaultCostDto>> getDefaultCosts(
            @PathVariable UUID businessTypeId) {
        return ResponseEntity.ok(defaultCostService.listForType(businessTypeId));
    }
}
