package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateMyCompanyRequest;
import com.bizboard.common.dto.MyCompanyDto;
import com.bizboard.common.entity.MyCompany;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.CompanyType;
import com.bizboard.common.util.TaxIdValidator;
import com.bizboard.repository.MyCompanyRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * "Benim Firmalarım" CRUD.
 *
 * <p>Tüzel kişi verisi hassas — controller seviyesinde admin-only zorlanır
 * ({@code /admin/my-companies} path'i {@code SecurityConfig}'deki {@code /admin/**}
 * kuralı altında). Service tarafında ek kontrol yok; admin kontrolü tek noktada.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MyCompanyService {

    private final MyCompanyRepository repository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;

    @Transactional(readOnly = true)
    public List<MyCompanyDto> list() {
        return repository.findAll().stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public MyCompanyDto get(UUID id) {
        return toDto(repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Firma bulunamadi")));
    }

    @Transactional
    public MyCompanyDto create(CreateMyCompanyRequest req, UUID actorUserId) {
        validateTaxId(req.getTaxId());
        if (req.getTaxId() != null && !req.getTaxId().isBlank()) {
            repository.findByTaxId(req.getTaxId()).ifPresent(existing -> {
                throw new IllegalArgumentException("Bu vergi numarasi zaten kayitli: " + existing.getLegalName());
            });
        }

        MyCompany c = MyCompany.builder()
                .legalName(req.getLegalName())
                .taxId(blankToNull(req.getTaxId()))
                .taxOffice(blankToNull(req.getTaxOffice()))
                .tradeRegistryNo(blankToNull(req.getTradeRegistryNo()))
                .companyType(parseType(req.getCompanyType()))
                .activityCode(blankToNull(req.getActivityCode()))
                .incorporatedAt(req.getIncorporatedAt())
                .mersisNo(blankToNull(req.getMersisNo()))
                .address(blankToNull(req.getAddress()))
                .contactName(blankToNull(req.getContactName()))
                .contactPhone(blankToNull(req.getContactPhone()))
                .contactEmail(blankToNull(req.getContactEmail()))
                .isDefault(false)
                .build();

        c = repository.save(c);
        log.info("MyCompany olusturuldu: {} (id={})", c.getLegalName(), c.getId());

        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.MY_COMPANY_CREATE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "MY_COMPANY", c.getId(),
                "Firma olusturuldu: " + c.getLegalName(),
                Map.of(
                        "legalName", c.getLegalName(),
                        "companyType", c.getCompanyType().name(),
                        "hasTaxId", c.getTaxId() != null
                ));

        return toDto(c);
    }

    @Transactional
    public MyCompanyDto update(UUID id, CreateMyCompanyRequest req, UUID actorUserId) {
        MyCompany c = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Firma bulunamadi"));

        Map<String, Object> changes = new HashMap<>();

        if (req.getLegalName() != null && !Objects.equals(req.getLegalName(), c.getLegalName())) {
            changes.put("legalName", Map.of("from", c.getLegalName(), "to", req.getLegalName()));
            c.setLegalName(req.getLegalName());
        }
        if (req.getTaxId() != null && !Objects.equals(blankToNull(req.getTaxId()), c.getTaxId())) {
            validateTaxId(req.getTaxId());
            String newTax = blankToNull(req.getTaxId());
            if (newTax != null) {
                repository.findByTaxId(newTax).ifPresent(other -> {
                    if (!other.getId().equals(id)) {
                        throw new IllegalArgumentException("Bu vergi numarasi baska bir firmada kayitli");
                    }
                });
            }
            // tax_id PII; diff'te değer tutmuyoruz, sadece değişti bayrağı.
            changes.put("taxId", "changed");
            c.setTaxId(newTax);
        }
        if (req.getTaxOffice() != null && !Objects.equals(blankToNull(req.getTaxOffice()), c.getTaxOffice())) {
            changes.put("taxOffice", "changed");
            c.setTaxOffice(blankToNull(req.getTaxOffice()));
        }
        if (req.getTradeRegistryNo() != null && !Objects.equals(blankToNull(req.getTradeRegistryNo()), c.getTradeRegistryNo())) {
            changes.put("tradeRegistryNo", "changed");
            c.setTradeRegistryNo(blankToNull(req.getTradeRegistryNo()));
        }
        if (req.getCompanyType() != null) {
            CompanyType newType = parseType(req.getCompanyType());
            if (newType != c.getCompanyType()) {
                changes.put("companyType", Map.of("from", c.getCompanyType().name(), "to", newType.name()));
                c.setCompanyType(newType);
            }
        }
        if (req.getActivityCode() != null && !Objects.equals(blankToNull(req.getActivityCode()), c.getActivityCode())) {
            changes.put("activityCode", Map.of(
                    "from", c.getActivityCode() != null ? c.getActivityCode() : "",
                    "to", blankToNull(req.getActivityCode()) != null ? blankToNull(req.getActivityCode()) : ""));
            c.setActivityCode(blankToNull(req.getActivityCode()));
        }
        if (req.getIncorporatedAt() != null && !Objects.equals(req.getIncorporatedAt(), c.getIncorporatedAt())) {
            changes.put("incorporatedAt", Map.of(
                    "from", c.getIncorporatedAt() != null ? c.getIncorporatedAt().toString() : "",
                    "to", req.getIncorporatedAt().toString()));
            c.setIncorporatedAt(req.getIncorporatedAt());
        }
        if (req.getMersisNo() != null && !Objects.equals(blankToNull(req.getMersisNo()), c.getMersisNo())) {
            changes.put("mersisNo", "changed");
            c.setMersisNo(blankToNull(req.getMersisNo()));
        }
        if (req.getAddress() != null && !Objects.equals(blankToNull(req.getAddress()), c.getAddress())) {
            changes.put("address", "changed");
            c.setAddress(blankToNull(req.getAddress()));
        }
        if (req.getContactName() != null && !Objects.equals(blankToNull(req.getContactName()), c.getContactName())) {
            changes.put("contactName", "changed");
            c.setContactName(blankToNull(req.getContactName()));
        }
        if (req.getContactPhone() != null && !Objects.equals(blankToNull(req.getContactPhone()), c.getContactPhone())) {
            changes.put("contactPhone", "changed");
            c.setContactPhone(blankToNull(req.getContactPhone()));
        }
        if (req.getContactEmail() != null && !Objects.equals(blankToNull(req.getContactEmail()), c.getContactEmail())) {
            changes.put("contactEmail", "changed");
            c.setContactEmail(blankToNull(req.getContactEmail()));
        }

        c = repository.save(c);
        User actor = lookupActor(actorUserId);
        Map<String, Object> meta = new HashMap<>();
        meta.put("myCompanyId", c.getId());
        meta.put("legalName", c.getLegalName());
        meta.put("changes", changes);
        meta.put("fieldsChanged", changes.size());
        auditLogService.recordEntityAction(
                AuditAction.MY_COMPANY_UPDATE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "MY_COMPANY", c.getId(),
                "Firma guncellendi: " + c.getLegalName() + " (" + changes.size() + " alan)",
                meta);

        return toDto(c);
    }

    @Transactional
    public void delete(UUID id, UUID actorUserId) {
        MyCompany c = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Firma bulunamadi"));
        if (c.isDefault()) {
            throw new IllegalStateException("Varsayilan firma silinemez");
        }
        String name = c.getLegalName();
        repository.delete(c);
        log.info("MyCompany silindi: {} (id={})", name, id);

        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.MY_COMPANY_DELETE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "MY_COMPANY", id,
                "Firma silindi: " + name,
                Map.of("legalName", name));
    }

    // ── helpers ──────────────────────────────────────────────

    private static void validateTaxId(String taxId) {
        if (taxId == null || taxId.isBlank()) return;
        if (!TaxIdValidator.isValid(taxId.trim())) {
            throw new IllegalArgumentException("Gecersiz vergi/TC kimlik numarasi");
        }
    }

    private static CompanyType parseType(String s) {
        if (s == null || s.isBlank()) return CompanyType.OTHER;
        try {
            return CompanyType.valueOf(s.trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Gecersiz sirket tipi: " + s);
        }
    }

    private static String blankToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private User lookupActor(UUID actorUserId) {
        if (actorUserId == null) return null;
        return userRepository.findById(actorUserId).orElse(null);
    }

    public MyCompanyDto toDto(MyCompany c) {
        return MyCompanyDto.builder()
                .id(c.getId())
                .legalName(c.getLegalName())
                .taxId(c.getTaxId())
                .taxOffice(c.getTaxOffice())
                .tradeRegistryNo(c.getTradeRegistryNo())
                .companyType(c.getCompanyType() != null ? c.getCompanyType().name() : CompanyType.OTHER.name())
                .activityCode(c.getActivityCode())
                .incorporatedAt(c.getIncorporatedAt())
                .mersisNo(c.getMersisNo())
                .address(c.getAddress())
                .contactName(c.getContactName())
                .contactPhone(c.getContactPhone())
                .contactEmail(c.getContactEmail())
                .isDefault(c.isDefault())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .build();
    }
}
