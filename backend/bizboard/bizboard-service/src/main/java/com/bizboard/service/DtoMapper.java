package com.bizboard.service;

import com.bizboard.common.dto.*;
import com.bizboard.common.entity.*;
import com.bizboard.common.entity.User;

import java.util.List;

public final class DtoMapper {

    private DtoMapper() {}

    public static BusinessDto toBusinessDto(Business b) {
        return BusinessDto.builder()
                .id(b.getId())
                .ownerId(b.getOwner().getId())
                .businessTypeName(b.getBusinessTypeName())
                .name(b.getName())
                .description(b.getDescription())
                .logoUrl(b.getLogoUrl())
                .color(b.getColor())
                .currency(b.getCurrency())
                .active(b.isActive())
                .metadata(b.getMetadata())
                .createdAt(b.getCreatedAt())
                .updatedAt(b.getUpdatedAt())
                .members(b.getMembers() != null
                        ? b.getMembers().stream().map(DtoMapper::toBusinessMemberDto).toList()
                        : List.of())
                .modules(b.getModules() != null
                        ? b.getModules().stream().map(DtoMapper::toBusinessModuleDto).toList()
                        : List.of())
                .build();
    }

    public static BusinessMemberDto toBusinessMemberDto(BusinessMember m) {
        return BusinessMemberDto.builder()
                .id(m.getId())
                .businessId(m.getBusiness().getId())
                .userId(m.getUser().getId())
                .role(m.getRole().name().toLowerCase(java.util.Locale.ENGLISH))
                .invitedEmail(m.getInvitedEmail())
                .accepted(m.isAccepted())
                .permissions(m.getPermissions())
                .createdAt(m.getCreatedAt())
                .updatedAt(m.getUpdatedAt())
                .build();
    }

    public static BusinessModuleDto toBusinessModuleDto(BusinessModule m) {
        return BusinessModuleDto.builder()
                .id(m.getId())
                .businessId(m.getBusiness().getId())
                .module(m.getModule().name().toLowerCase(java.util.Locale.ENGLISH))
                .enabled(m.isEnabled())
                .config(m.getConfig())
                .createdAt(m.getCreatedAt())
                .build();
    }

    public static TransactionDto toTransactionDto(Transaction t) {
        return TransactionDto.builder()
                .id(t.getId())
                .businessId(t.getBusiness().getId())
                .categoryId(t.getCategory() != null ? t.getCategory().getId() : null)
                .direction(t.getDirection().name().toLowerCase(java.util.Locale.ENGLISH))
                .amount(t.getAmount())
                .currency(t.getCurrency())
                .description(t.getDescription())
                .date(t.getDate())
                .receiptUrl(t.getReceiptUrl())
                .setupCost(t.isSetupCost())
                .tags(t.getTags())
                .metadata(t.getMetadata())
                .createdBy(t.getCreatedBy() != null ? t.getCreatedBy().getId() : null)
                .createdAt(t.getCreatedAt())
                .updatedAt(t.getUpdatedAt())
                .category(t.getCategory() != null ? toCategoryDto(t.getCategory()) : null)
                .build();
    }

    public static CategoryDto toCategoryDto(Category c) {
        return CategoryDto.builder()
                .id(c.getId())
                .businessId(c.getBusiness().getId())
                .name(c.getName())
                .direction(c.getDirection().name().toLowerCase(java.util.Locale.ENGLISH))
                .icon(c.getIcon())
                .color(c.getColor())
                .sortOrder(c.getSortOrder())
                .active(c.isActive())
                .createdAt(c.getCreatedAt())
                .build();
    }

    public static ProfileDto toProfileDto(User u) {
        return ProfileDto.builder()
                .id(u.getId())
                .fullName(u.getFullName())
                .avatarUrl(u.getAvatarUrl())
                .phone(u.getPhone())
                .preferredCurrency(u.getPreferredCurrency())
                .preferredLanguage(u.getPreferredLanguage())
                .onboardingCompleted(u.isOnboardingCompleted())
                .role(u.getRole())
                .createdAt(u.getCreatedAt())
                .updatedAt(u.getUpdatedAt())
                .build();
    }

    // MonthlySummary artık kullanılmıyor.
    // Tüm özet hesaplamaları SummaryService tarafından doğrudan transactions tablosundan yapılır.
}
