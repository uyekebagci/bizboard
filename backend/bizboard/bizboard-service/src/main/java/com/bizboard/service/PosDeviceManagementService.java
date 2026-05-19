package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreatePosDeviceRequest;
import com.bizboard.common.dto.PosDeviceDto;
import com.bizboard.common.dto.UpdatePosDeviceRequest;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.PosDevice;
import com.bizboard.common.entity.User;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.PosDeviceRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * v1.6.21 (WP-4): POS cihazı yönetim servisi.
 *
 * <p>CRUD aksiyonları (admin kapsamlı kullanım). DELETE soft delete'tir:
 * {@code is_active=false} set edilir, fiziksel silinmez (tx referansları korunur).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PosDeviceManagementService {

    private final PosDeviceRepository repository;
    private final CounterpartRepository counterpartRepository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;

    @Transactional(readOnly = true)
    public List<PosDeviceDto> list(boolean includeInactive) {
        List<PosDevice> all = includeInactive
                ? repository.findAllByOrderByActiveDescNameAsc()
                : repository.findByActiveTrueOrderByNameAsc();
        return all.stream().map(PosDeviceManagementService::toDto).toList();
    }

    @Transactional(readOnly = true)
    public PosDeviceDto get(UUID id) {
        return toDto(repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("POS cihazi bulunamadi: " + id)));
    }

    @Transactional
    public PosDeviceDto create(CreatePosDeviceRequest req, UUID actorUserId) {
        User actor = lookupActor(actorUserId);

        Counterpart owner = null;
        if (req.getOwnerCounterpartId() != null) {
            owner = counterpartRepository.findById(req.getOwnerCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Sahip firma bulunamadi: " + req.getOwnerCounterpartId()));
        }

        PosDevice d = PosDevice.builder()
                .name(req.getName().trim())
                .ownerCounterpart(owner)
                .bankName(blankToNull(req.getBankName()))
                .defaultRate(req.getDefaultRate())
                .active(true)
                .notes(blankToNull(req.getNotes()))
                .build();

        d = repository.save(d);

        auditLogService.recordEntityAction(
                "POS_DEVICE_CREATE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "POS_DEVICE", d.getId(),
                "POS cihazi olusturuldu: " + d.getName(),
                java.util.Map.of(
                        "name", d.getName(),
                        "ownerCounterpartId", owner != null ? owner.getId().toString() : "null",
                        "defaultRate", d.getDefaultRate() != null ? d.getDefaultRate().toPlainString() : "null"));

        log.info("POS device created: id={} name={} owner={}",
                d.getId(), d.getName(), owner != null ? owner.getName() : null);
        return toDto(d);
    }

    @Transactional
    public PosDeviceDto update(UUID id, UpdatePosDeviceRequest req, UUID actorUserId) {
        PosDevice d = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("POS cihazi bulunamadi: " + id));
        User actor = lookupActor(actorUserId);
        Map<String, Object> changes = new HashMap<>();

        if (req.getName() != null && !req.getName().isBlank()
                && !req.getName().trim().equals(d.getName())) {
            changes.put("name", Map.of("from", d.getName(), "to", req.getName().trim()));
            d.setName(req.getName().trim());
        }
        if (req.getOwnerCounterpartId() != null) {
            UUID oldOwnerId = d.getOwnerCounterpart() != null ? d.getOwnerCounterpart().getId() : null;
            if (!Objects.equals(oldOwnerId, req.getOwnerCounterpartId())) {
                Counterpart newOwner = counterpartRepository.findById(req.getOwnerCounterpartId())
                        .orElseThrow(() -> new IllegalArgumentException(
                                "Sahip firma bulunamadi: " + req.getOwnerCounterpartId()));
                d.setOwnerCounterpart(newOwner);
                changes.put("ownerCounterpartId", Map.of(
                        "from", oldOwnerId != null ? oldOwnerId.toString() : "null",
                        "to", req.getOwnerCounterpartId().toString()));
            }
        }
        if (req.getBankName() != null && !Objects.equals(req.getBankName(), d.getBankName())) {
            changes.put("bankName", Map.of(
                    "from", d.getBankName() == null ? "" : d.getBankName(),
                    "to", req.getBankName()));
            d.setBankName(blankToNull(req.getBankName()));
        }
        if (req.getDefaultRate() != null
                && !Objects.equals(req.getDefaultRate(), d.getDefaultRate())) {
            changes.put("defaultRate", Map.of(
                    "from", d.getDefaultRate() != null ? d.getDefaultRate().toPlainString() : "null",
                    "to", req.getDefaultRate().toPlainString()));
            d.setDefaultRate(req.getDefaultRate());
        }
        if (req.getActive() != null && req.getActive() != d.isActive()) {
            changes.put("active", Map.of("from", d.isActive(), "to", req.getActive()));
            d.setActive(req.getActive());
        }
        if (req.getNotes() != null && !Objects.equals(req.getNotes(), d.getNotes())) {
            d.setNotes(blankToNull(req.getNotes()));
            changes.put("notesUpdated", true);
        }

        d = repository.save(d);

        auditLogService.recordEntityAction(
                "POS_DEVICE_UPDATE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "POS_DEVICE", d.getId(),
                "POS cihazi guncellendi: " + d.getName() + " (" + changes.size() + " alan)",
                Map.of("changes", changes));

        return toDto(d);
    }

    /** Soft delete: is_active=false. Tx referansları korunur. */
    @Transactional
    public void delete(UUID id, UUID actorUserId) {
        PosDevice d = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("POS cihazi bulunamadi: " + id));
        User actor = lookupActor(actorUserId);

        d.setActive(false);
        repository.save(d);

        auditLogService.recordEntityAction(
                "POS_DEVICE_DELETE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "POS_DEVICE", d.getId(),
                "POS cihazi soft-delete (pasif): " + d.getName(),
                Map.of("name", d.getName(), "softDelete", true));

        log.info("POS device soft-deleted: id={} name={}", d.getId(), d.getName());
    }

    // ───────────────────── helpers ─────────────────────

    private User lookupActor(UUID userId) {
        if (userId == null) return null;
        return userRepository.findById(userId).orElse(null);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public static PosDeviceDto toDto(PosDevice d) {
        return PosDeviceDto.builder()
                .id(d.getId())
                .name(d.getName())
                .ownerCounterpartId(d.getOwnerCounterpart() != null ? d.getOwnerCounterpart().getId() : null)
                .ownerCounterpartName(d.getOwnerCounterpart() != null ? d.getOwnerCounterpart().getName() : null)
                .bankName(d.getBankName())
                .defaultRate(d.getDefaultRate())
                .lastUsedRate(d.getLastUsedRate())
                .active(d.isActive())
                .notes(d.getNotes())
                .createdAt(d.getCreatedAt())
                .build();
    }
}
