package com.bizboard.service;

import com.bizboard.common.dto.BusinessTypeDefaultCostDto;
import com.bizboard.common.dto.UpsertDefaultCostRequest;
import com.bizboard.common.entity.BusinessType;
import com.bizboard.common.entity.BusinessTypeDefaultCost;
import com.bizboard.repository.BusinessTypeDefaultCostRepository;
import com.bizboard.repository.BusinessTypeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * v1.5.6: işletme tipi başına varsayılan maliyet şablonları için master-data
 * CRUD servisi. Sadece admin tarafından kullanılır (controller {@code /admin/**}
 * altında).
 */
@Service
@RequiredArgsConstructor
public class BusinessTypeDefaultCostService {

    private final BusinessTypeDefaultCostRepository repository;
    private final BusinessTypeRepository businessTypeRepository;

    @Transactional(readOnly = true)
    public List<BusinessTypeDefaultCostDto> listForType(UUID businessTypeId) {
        return repository.findByBusinessTypeIdOrderBySortOrderAscNameAsc(businessTypeId)
                .stream().map(this::toDto).toList();
    }

    @Transactional
    public BusinessTypeDefaultCostDto create(UUID businessTypeId, UpsertDefaultCostRequest req) {
        BusinessType bt = businessTypeRepository.findById(businessTypeId)
                .orElseThrow(() -> new IllegalArgumentException("Business type bulunamadi"));
        BusinessTypeDefaultCost entity = BusinessTypeDefaultCost.builder()
                .businessType(bt)
                .name(req.getName())
                .category(req.getCategory() != null ? req.getCategory().toUpperCase(java.util.Locale.ENGLISH) : "OTHER")
                .amount(req.getAmount() != null ? req.getAmount() : BigDecimal.ZERO)
                .currency(req.getCurrency() != null && !req.getCurrency().isBlank() ? req.getCurrency() : "TRY")
                .setup(req.isSetup())
                .frequency(req.getFrequency() != null && !req.getFrequency().isBlank() ? req.getFrequency().toUpperCase(java.util.Locale.ENGLISH) : "MONTHLY")
                .sortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0)
                .notes(req.getNotes())
                .build();
        return toDto(repository.save(entity));
    }

    @Transactional
    public BusinessTypeDefaultCostDto update(UUID id, UpsertDefaultCostRequest req) {
        BusinessTypeDefaultCost e = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Default cost bulunamadi"));
        if (req.getName() != null && !req.getName().isBlank()) e.setName(req.getName());
        if (req.getCategory() != null) e.setCategory(req.getCategory().toUpperCase(java.util.Locale.ENGLISH));
        if (req.getAmount() != null) e.setAmount(req.getAmount());
        if (req.getCurrency() != null && !req.getCurrency().isBlank()) e.setCurrency(req.getCurrency());
        // setup boolean primitive — request her zaman set ediyor; null kontrolü yok
        e.setSetup(req.isSetup());
        if (req.getFrequency() != null && !req.getFrequency().isBlank()) {
            e.setFrequency(req.getFrequency().toUpperCase(java.util.Locale.ENGLISH));
        }
        if (req.getSortOrder() != null) e.setSortOrder(req.getSortOrder());
        if (req.getNotes() != null) e.setNotes(req.getNotes());
        return toDto(repository.save(e));
    }

    @Transactional
    public void delete(UUID id) {
        if (!repository.existsById(id)) {
            throw new IllegalArgumentException("Default cost bulunamadi");
        }
        repository.deleteById(id);
    }

    private BusinessTypeDefaultCostDto toDto(BusinessTypeDefaultCost e) {
        return BusinessTypeDefaultCostDto.builder()
                .id(e.getId())
                .businessTypeId(e.getBusinessType() != null ? e.getBusinessType().getId() : null)
                .name(e.getName())
                .category(e.getCategory())
                .amount(e.getAmount())
                .currency(e.getCurrency())
                .setup(e.isSetup())
                .frequency(e.getFrequency())
                .sortOrder(e.getSortOrder())
                .notes(e.getNotes())
                .createdAt(e.getCreatedAt())
                .updatedAt(e.getUpdatedAt())
                .build();
    }
}
