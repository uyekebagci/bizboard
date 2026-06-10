package com.bizboard.api.controller;

import com.bizboard.common.dto.CategoryDto;
import com.bizboard.common.dto.CreateCategoryRequest;
import com.bizboard.common.dto.UpdateCategoryRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.CategoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * cat-be WP: gelir/gider kategori CRUD.
 *
 * <p>Listeleme {@code GET /businesses/{id}/categories} mevcut
 * {@link BusinessController}'da kalır. Burada create (business-scoped) ve
 * update/delete (category-scoped) yer alır.</p>
 *
 * <p>Hata mapleme {@link GlobalExceptionHandler} üzerinden:
 * {@link IllegalArgumentException} → 400, {@link SecurityException} → 403.</p>
 */
@RestController
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    @PostMapping("/businesses/{businessId}/categories")
    public ResponseEntity<CategoryDto> create(
            @PathVariable UUID businessId,
            @Valid @RequestBody CreateCategoryRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(categoryService.createCategory(businessId, request, principal.getId()));
    }

    @PutMapping("/categories/{id}")
    public ResponseEntity<CategoryDto> update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateCategoryRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(categoryService.updateCategory(id, request, principal.getId()));
    }

    @DeleteMapping("/categories/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        categoryService.deleteCategory(id, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
