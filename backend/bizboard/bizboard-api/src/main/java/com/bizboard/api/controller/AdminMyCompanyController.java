package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateMyCompanyRequest;
import com.bizboard.common.dto.MyCompanyDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.MyCompanyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * "Benim Firmalarım" admin yönetim endpoint'leri.
 *
 * <p>{@code /admin/my-companies} path'i {@code SecurityConfig}'deki
 * {@code /admin/**} kuralı altında, yalnız ROLE_ADMIN erişebilir.</p>
 */
@RestController
@RequestMapping("/admin/my-companies")
@RequiredArgsConstructor
public class AdminMyCompanyController {

    private final MyCompanyService service;

    @GetMapping
    public ResponseEntity<List<MyCompanyDto>> list() {
        return ResponseEntity.ok(service.list());
    }

    @GetMapping("/{id}")
    public ResponseEntity<MyCompanyDto> get(@PathVariable UUID id) {
        return ResponseEntity.ok(service.get(id));
    }

    @PostMapping
    public ResponseEntity<MyCompanyDto> create(
            @Valid @RequestBody CreateMyCompanyRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(request, principal.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<MyCompanyDto> update(
            @PathVariable UUID id,
            @Valid @RequestBody CreateMyCompanyRequest request,
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
