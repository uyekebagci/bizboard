package com.bizboard.service;

import com.bizboard.common.dto.CreateFixedCostRequest;
import com.bizboard.common.dto.FixedCostDto;
import com.bizboard.common.dto.FixedCostSummaryDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.FixedCost;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.FixedCostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class FixedCostService {

    private final FixedCostRepository fixedCostRepository;
    private final BusinessRepository businessRepository;
    private final BusinessAccessGuard accessGuard;

    // ─── İşletmeye ait sabit giderleri getir ────────────────────

    @Transactional(readOnly = true)
    public List<FixedCostDto> getFixedCostsForBusiness(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanReadBusiness(actorUserId, businessId);
        return fixedCostRepository.findByBusinessIdOrderByCreatedAtDesc(businessId)
                .stream().map(this::toDto).toList();
    }

    // ─── Sabit gider özeti ──────────────────────────────────────

    @Transactional(readOnly = true)
    public FixedCostSummaryDto getFixedCostSummary(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanReadBusiness(actorUserId, businessId);
        List<FixedCost> costs = fixedCostRepository
                .findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(businessId);

        BigDecimal rentCost = BigDecimal.ZERO;
        BigDecimal personnelCost = BigDecimal.ZERO;
        BigDecimal otherCost = BigDecimal.ZERO;

        for (FixedCost fc : costs) {
            switch (fc.getType().toUpperCase(java.util.Locale.ENGLISH)) {
                case "RENT" -> rentCost = rentCost.add(fc.getAmount());
                case "PERSONNEL" -> personnelCost = personnelCost.add(fc.getAmount());
                default -> otherCost = otherCost.add(fc.getAmount());
            }
        }

        return FixedCostSummaryDto.builder()
                .totalMonthlyCost(rentCost.add(personnelCost).add(otherCost))
                .rentCost(rentCost)
                .personnelCost(personnelCost)
                .otherCost(otherCost)
                .fixedCosts(costs.stream().map(this::toDto).toList())
                .build();
    }

    // ─── Sabit gider oluştur ────────────────────────────────────

    @Transactional
    public FixedCostDto createFixedCost(UUID businessId, CreateFixedCostRequest request, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Isletme bulunamadi"));

        FixedCost fixedCost = FixedCost.builder()
                .business(business)
                .name(request.getName())
                .type(request.getType() != null ? request.getType().toUpperCase(java.util.Locale.ENGLISH) : "OTHER")
                .amount(request.getAmount())
                .frequency(request.getFrequency() != null ? request.getFrequency() : "MONTHLY")
                .notes(request.getNotes())
                .autoGenerate(Boolean.TRUE.equals(request.getAutoGenerate()))
                .build();

        fixedCost = fixedCostRepository.save(fixedCost);
        log.info("Sabit gider olusturuldu: {} - {} TL - isletme={}",
                fixedCost.getName(), fixedCost.getAmount(), business.getName());

        return toDto(fixedCost);
    }

    // ─── Sabit gider güncelle ───────────────────────────────────

    @Transactional
    public FixedCostDto updateFixedCost(UUID fixedCostId, CreateFixedCostRequest request, UUID actorUserId) {
        FixedCost fc = fixedCostRepository.findById(fixedCostId)
                .orElseThrow(() -> new IllegalArgumentException("Sabit gider bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, fc.getBusiness().getId());

        // Otomatik hesaplanan giderleri manual güncellemeye izin verme
        if (fc.isAuto()) {
            throw new IllegalStateException("Otomatik hesaplanan sabit giderler manuel olarak guncellenemez");
        }

        if (request.getName() != null) fc.setName(request.getName());
        if (request.getAmount() != null) fc.setAmount(request.getAmount());
        if (request.getFrequency() != null) fc.setFrequency(request.getFrequency());
        if (request.getNotes() != null) fc.setNotes(request.getNotes());
        if (request.getAutoGenerate() != null) fc.setAutoGenerate(request.getAutoGenerate());

        fc = fixedCostRepository.save(fc);
        log.info("Sabit gider guncellendi: {} - {} TL", fc.getName(), fc.getAmount());

        return toDto(fc);
    }

    // ─── Sabit gider sil ────────────────────────────────────────

    @Transactional
    public void deleteFixedCost(UUID fixedCostId, UUID actorUserId) {
        FixedCost fc = fixedCostRepository.findById(fixedCostId)
                .orElseThrow(() -> new IllegalArgumentException("Sabit gider bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, fc.getBusiness().getId());

        if (fc.isAuto()) {
            throw new IllegalStateException("Otomatik hesaplanan sabit giderler silinemez");
        }

        fixedCostRepository.delete(fc);
        log.info("Sabit gider silindi: {}", fc.getName());
    }

    // ─── DTO Mapper ─────────────────────────────────────────────

    private FixedCostDto toDto(FixedCost fc) {
        return FixedCostDto.builder()
                .id(fc.getId())
                .businessId(fc.getBusiness().getId())
                .businessName(fc.getBusiness().getName())
                .name(fc.getName())
                .type(fc.getType())
                .amount(fc.getAmount())
                .frequency(fc.getFrequency())
                .auto(fc.isAuto())
                .autoGenerate(fc.isAutoGenerate())
                .lastAutoRun(fc.getLastAutoRun())
                .notes(fc.getNotes())
                .active(fc.isActive())
                .createdAt(fc.getCreatedAt())
                .updatedAt(fc.getUpdatedAt())
                .build();
    }
}
