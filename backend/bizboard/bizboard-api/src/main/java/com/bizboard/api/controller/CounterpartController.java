package com.bizboard.api.controller;

import com.bizboard.common.dto.CounterpartDto;
import com.bizboard.common.dto.CreateCounterpartRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.CounterpartService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * "Karşı Firmalar" CRUD. {@code /counterparts/**} authenticated kullanıcılar
 * için açık. (Cari hesap ekstre endpoint'i v1.5.1'de geliyor.)
 */
@RestController
@RequestMapping("/counterparts")
@RequiredArgsConstructor
public class CounterpartController {

    private final CounterpartService service;

    @GetMapping
    public ResponseEntity<List<CounterpartDto>> list(
            @RequestParam(required = false) String role) {
        return ResponseEntity.ok(service.list(role));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CounterpartDto> get(@PathVariable UUID id) {
        return ResponseEntity.ok(service.get(id));
    }

    @PostMapping
    public ResponseEntity<CounterpartDto> create(
            @Valid @RequestBody CreateCounterpartRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(request, principal.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CounterpartDto> update(
            @PathVariable UUID id,
            @Valid @RequestBody CreateCounterpartRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.update(id, request, principal.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        service.delete(id, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
