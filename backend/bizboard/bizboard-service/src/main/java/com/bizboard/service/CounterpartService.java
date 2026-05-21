package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CounterpartDto;
import com.bizboard.common.dto.CreateCounterpartRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.CounterpartRole;
import com.bizboard.common.util.TaxIdValidator;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * "Karşı Firmalar" CRUD. Tüm authenticated kullanıcılar erişir; mutation
 * için ek admin kontrolü yok (counterpart paylaşımlı veri).
 *
 * <p>Cari hesap motoru (current_balance compute) v1.5.1'de devreye girecek;
 * bu sürümde {@code currentBalance} default 0 olarak okunur ve update edilmez.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CounterpartService {

    private final CounterpartRepository repository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;
    private final DebtRepository debtRepository;
    private final BusinessRepository businessRepository;
    private final BusinessAccessGuard accessGuard;

    /**
     * v1.6.23.20 (Security WP / arch-rules §1.3.B): tenant-aware list.
     */
    @Transactional(readOnly = true)
    public List<CounterpartDto> list(String role, String kind, UUID actorUserId) {
        List<UUID> allowed = accessGuard.accessibleBusinessIds(actorUserId);
        if (allowed.isEmpty()) return List.of();

        java.util.stream.Stream<Counterpart> base;
        if (role != null && !role.isBlank()) {
            base = repository.findByBusinessIdInAndRoleOrderByNameAsc(allowed, parseRole(role)).stream();
        } else if (kind != null && !kind.isBlank()) {
            com.bizboard.common.enums.CounterpartKind k =
                    com.bizboard.common.enums.CounterpartKind.valueOf(
                            kind.trim().toUpperCase(java.util.Locale.ENGLISH));
            return repository.findByBusinessIdInAndKindOrderByNameAsc(allowed, k).stream()
                    .map(this::toDto).toList();
        } else {
            base = repository.findByBusinessIdInOrderByNameAsc(allowed).stream();
        }
        if (kind != null && !kind.isBlank()) {
            com.bizboard.common.enums.CounterpartKind k =
                    com.bizboard.common.enums.CounterpartKind.valueOf(
                            kind.trim().toUpperCase(java.util.Locale.ENGLISH));
            base = base.filter(c -> c.getKind() == k);
        }
        return base.map(this::toDto).toList();
    }

    /** v1.6.20 (WP-3) + v1.6.23.20: Alt firmalar — tenant filtreli. */
    @Transactional(readOnly = true)
    public List<CounterpartDto> children(UUID parentId, UUID actorUserId) {
        List<UUID> allowed = accessGuard.accessibleBusinessIds(actorUserId);
        if (allowed.isEmpty()) return List.of();
        return repository.findByBusinessIdInAndParentIdOrderByNameAsc(allowed, parentId).stream()
                .map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public CounterpartDto get(UUID id, UUID actorUserId) {
        Counterpart c = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Karsi firma bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId,
                c.getBusiness() != null ? c.getBusiness().getId() : null);
        return toDto(c);
    }

    @Transactional
    public CounterpartDto create(CreateCounterpartRequest req, UUID actorUserId) {
        validateTaxId(req.getTaxId());
        // v1.6.23.20: tenant binding zorunlu — actor erişim kontrolü.
        if (req.getBusinessId() == null) {
            throw new IllegalArgumentException("business_id zorunlu");
        }
        Business business = businessRepository.findById(req.getBusinessId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "business_id bulunamadi: " + req.getBusinessId()));
        accessGuard.assertCanAccessBusiness(actorUserId, business.getId());

        if (req.getTaxId() != null && !req.getTaxId().isBlank()) {
            repository.findByTaxId(req.getTaxId()).ifPresent(existing -> {
                throw new IllegalArgumentException("Bu vergi numarasi zaten kayitli: " + existing.getName());
            });
        }

        Counterpart c = Counterpart.builder()
                .business(business)
                .name(req.getName())
                .taxId(blankToNull(req.getTaxId()))
                .taxOffice(blankToNull(req.getTaxOffice()))
                .role(parseRole(req.getRole()))
                .contactName(blankToNull(req.getContactName()))
                .contactPhone(blankToNull(req.getContactPhone()))
                .contactEmail(blankToNull(req.getContactEmail()))
                .address(blankToNull(req.getAddress()))
                .currentBalance(BigDecimal.ZERO)
                .paymentTermsDays(req.getPaymentTermsDays() != null ? req.getPaymentTermsDays() : 0)
                .notes(blankToNull(req.getNotes()))
                .build();

        c = repository.save(c);
        log.info("Counterpart olusturuldu: {} (role={}, id={})", c.getName(), c.getRole(), c.getId());

        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.COUNTERPART_CREATE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "COUNTERPART", c.getId(),
                "Karsi firma olusturuldu: " + c.getName() + " (" + c.getRole().name() + ")",
                Map.of(
                        "name", c.getName(),
                        "role", c.getRole().name(),
                        "hasTaxId", c.getTaxId() != null
                ));

        return toDto(c);
    }

    @Transactional
    public CounterpartDto update(UUID id, CreateCounterpartRequest req, UUID actorUserId) {
        Counterpart c = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Karsi firma bulunamadi"));
        // v1.6.23.20: cross-tenant update engeli.
        accessGuard.assertCanAccessBusiness(actorUserId,
                c.getBusiness() != null ? c.getBusiness().getId() : null);

        Map<String, Object> changes = new HashMap<>();

        if (req.getName() != null && !req.getName().isBlank()
                && !Objects.equals(req.getName(), c.getName())) {
            changes.put("name", Map.of("from", c.getName(), "to", req.getName()));
            c.setName(req.getName());
        }
        if (req.getTaxId() != null && !Objects.equals(blankToNull(req.getTaxId()), c.getTaxId())) {
            validateTaxId(req.getTaxId());
            String newTax = blankToNull(req.getTaxId());
            if (newTax != null) {
                repository.findByTaxId(newTax).ifPresent(other -> {
                    if (!other.getId().equals(id)) {
                        throw new IllegalArgumentException("Bu vergi numarasi baska bir karsi firmada kayitli");
                    }
                });
            }
            changes.put("taxId", "changed");
            c.setTaxId(newTax);
        }
        if (req.getTaxOffice() != null && !Objects.equals(blankToNull(req.getTaxOffice()), c.getTaxOffice())) {
            changes.put("taxOffice", "changed");
            c.setTaxOffice(blankToNull(req.getTaxOffice()));
        }
        if (req.getRole() != null) {
            CounterpartRole newRole = parseRole(req.getRole());
            if (newRole != c.getRole()) {
                changes.put("role", Map.of("from", c.getRole().name(), "to", newRole.name()));
                c.setRole(newRole);
            }
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
        if (req.getAddress() != null && !Objects.equals(blankToNull(req.getAddress()), c.getAddress())) {
            changes.put("address", "changed");
            c.setAddress(blankToNull(req.getAddress()));
        }
        if (req.getPaymentTermsDays() != null
                && !Objects.equals(req.getPaymentTermsDays(), c.getPaymentTermsDays())) {
            changes.put("paymentTermsDays", Map.of(
                    "from", c.getPaymentTermsDays() != null ? c.getPaymentTermsDays() : 0,
                    "to", req.getPaymentTermsDays()));
            c.setPaymentTermsDays(req.getPaymentTermsDays());
        }
        if (req.getNotes() != null && !Objects.equals(blankToNull(req.getNotes()), c.getNotes())) {
            changes.put("notesUpdated", true);
            c.setNotes(blankToNull(req.getNotes()));
        }

        c = repository.save(c);
        User actor = lookupActor(actorUserId);
        Map<String, Object> meta = new HashMap<>();
        meta.put("counterpartId", c.getId());
        meta.put("name", c.getName());
        meta.put("changes", changes);
        meta.put("fieldsChanged", changes.size());
        auditLogService.recordEntityAction(
                AuditAction.COUNTERPART_UPDATE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "COUNTERPART", c.getId(),
                "Karsi firma guncellendi: " + c.getName() + " (" + changes.size() + " alan)",
                meta);

        return toDto(c);
    }

    @Transactional
    public void delete(UUID id, UUID actorUserId) {
        Counterpart c = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Karsi firma bulunamadi"));
        // v1.6.23.20: cross-tenant delete engeli.
        accessGuard.assertCanAccessBusiness(actorUserId,
                c.getBusiness() != null ? c.getBusiness().getId() : null);
        String name = c.getName();

        // v1.5.1: bağlı borç varsa Postgres FK 500 yerine temiz 400 dön.
        long linkedDebts = debtRepository.countByCounterpartRefId(id);
        if (linkedDebts > 0) {
            throw new IllegalStateException(
                    "Bu firmaya bagli " + linkedDebts + " borc kaydi var; once onlari kaldirin veya baska firmaya tasiyin.");
        }

        repository.delete(c);
        log.info("Counterpart silindi: {} (id={})", name, id);

        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.COUNTERPART_DELETE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "COUNTERPART", id,
                "Karsi firma silindi: " + name,
                Map.of("name", name));
    }

    // ── helpers ──────────────────────────────────────────────

    private static void validateTaxId(String taxId) {
        if (taxId == null || taxId.isBlank()) return;
        if (!TaxIdValidator.isValid(taxId.trim())) {
            throw new IllegalArgumentException("Gecersiz vergi/TC kimlik numarasi");
        }
    }

    private static CounterpartRole parseRole(String s) {
        if (s == null || s.isBlank()) return CounterpartRole.OTHER;
        try {
            return CounterpartRole.valueOf(s.trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Gecersiz rol: " + s);
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

    public CounterpartDto toDto(Counterpart c) {
        return CounterpartDto.builder()
                .id(c.getId())
                .businessId(c.getBusiness() != null ? c.getBusiness().getId() : null)
                .businessName(c.getBusiness() != null ? c.getBusiness().getName() : null)
                .name(c.getName())
                .taxId(c.getTaxId())
                .taxOffice(c.getTaxOffice())
                .role(c.getRole() != null ? c.getRole().name() : CounterpartRole.OTHER.name())
                .contactName(c.getContactName())
                .contactPhone(c.getContactPhone())
                .contactEmail(c.getContactEmail())
                .address(c.getAddress())
                .currentBalance(c.getCurrentBalance() != null ? c.getCurrentBalance() : BigDecimal.ZERO)
                .paymentTermsDays(c.getPaymentTermsDays() != null ? c.getPaymentTermsDays() : 0)
                .notes(c.getNotes())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .build();
    }
}
