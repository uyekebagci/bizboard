package com.bizboard.api.controller;

import com.bizboard.common.dto.PosDeviceDto;
import com.bizboard.common.entity.PosDevice;
import com.bizboard.repository.PosDeviceRepository;
import com.bizboard.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * v1.6.20 (WP-3): POS cihazı listeleme endpoint'i.
 * (Full CRUD WP-4 kapsamında — burada listeleme + tx form select için.)
 */
@RestController
@RequestMapping("/pos-devices")
@RequiredArgsConstructor
public class PosDeviceController {

    private final PosDeviceRepository repository;

    @GetMapping
    public ResponseEntity<List<PosDeviceDto>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "include_inactive", defaultValue = "false") boolean includeInactive) {
        List<PosDevice> all = includeInactive
                ? repository.findAllByOrderByActiveDescNameAsc()
                : repository.findByActiveTrueOrderByNameAsc();
        return ResponseEntity.ok(all.stream().map(PosDeviceController::toDto).toList());
    }

    static PosDeviceDto toDto(PosDevice d) {
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
