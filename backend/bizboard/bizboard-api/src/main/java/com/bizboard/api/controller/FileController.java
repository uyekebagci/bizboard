package com.bizboard.api.controller;

import com.bizboard.common.dto.FileUploadDto;
import com.bizboard.common.entity.FileUpload;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService fileStorageService;

    /**
     * Dosya yukle
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileUploadDto> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "category", defaultValue = "document") String category,
            @RequestParam(value = "entity_type", required = false) String entityType,
            @RequestParam(value = "entity_id", required = false) UUID entityId,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "admin_only", required = false, defaultValue = "false") boolean adminOnly,
            @AuthenticationPrincipal UserPrincipal principal) {

        // Admin degilse admin_only olamaz
        boolean effectiveAdminOnly = principal.isAdmin() && adminOnly;

        FileUploadDto dto = fileStorageService.upload(
                file, category, entityType, entityId,
                principal.getId(), principal.getFullName(),
                description, effectiveAdminOnly
        );

        return ResponseEntity.status(HttpStatus.CREATED).body(dto);
    }

    /**
     * Dosya indir / goruntule
     */
    @GetMapping("/{fileId}")
    public ResponseEntity<Resource> downloadFile(
            @PathVariable UUID fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        FileUpload fileEntity = fileStorageService.getFileEntity(fileId);

        // Admin degilse ve admin_only ise erisim yok
        if (fileEntity.isAdminOnly() && !principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Resource resource = fileStorageService.loadAsResource(fileId);

        String disposition = fileEntity.getContentType() != null
                && fileEntity.getContentType().startsWith("image/")
                ? "inline" : "attachment";

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(fileEntity.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        disposition + "; filename=\"" + fileEntity.getOriginalName() + "\"")
                .body(resource);
    }

    /**
     * Dosya bilgisi (meta)
     */
    @GetMapping("/{fileId}/info")
    public ResponseEntity<FileUploadDto> getFileInfo(
            @PathVariable UUID fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        FileUpload entity = fileStorageService.getFileEntity(fileId);

        if (entity.isAdminOnly() && !principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return ResponseEntity.ok(FileUploadDto.builder()
                .id(entity.getId())
                .originalName(entity.getOriginalName())
                .contentType(entity.getContentType())
                .size(entity.getSize())
                .category(entity.getCategory())
                .description(entity.getDescription())
                .adminOnly(entity.isAdminOnly())
                .entityType(entity.getEntityType())
                .entityId(entity.getEntityId())
                .url("/files/" + entity.getId())
                .uploadedByName(entity.getUploadedByName())
                .createdAt(entity.getCreatedAt())
                .build());
    }

    /**
     * Bir entity'ye ait dosyalar (isletme belgeler modulu icin)
     */
    @GetMapping("/by-entity")
    public ResponseEntity<List<FileUploadDto>> getFilesByEntity(
            @RequestParam("entity_type") String entityType,
            @RequestParam("entity_id") UUID entityId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                fileStorageService.getFilesByEntity(entityType, entityId, principal.isAdmin())
        );
    }

    /**
     * Tum dosyalar — genel belgeler sayfasi icin
     * Filtreleme: ?entity_type=business&entity_id=xxx
     */
    @GetMapping("/all")
    public ResponseEntity<List<FileUploadDto>> getAllFiles(
            @RequestParam(value = "entity_type", required = false) String entityType,
            @RequestParam(value = "entity_id", required = false) UUID entityId,
            @AuthenticationPrincipal UserPrincipal principal) {

        if (entityType != null && entityId != null) {
            return ResponseEntity.ok(
                    fileStorageService.getFilesByEntity(entityType, entityId, principal.isAdmin())
            );
        }
        return ResponseEntity.ok(
                fileStorageService.getAllFiles(principal.isAdmin())
        );
    }

    /**
     * Dosya entity iliskilendirme
     */
    @PatchMapping("/{fileId}/link")
    public ResponseEntity<Void> linkFile(
            @PathVariable UUID fileId,
            @RequestBody Map<String, String> body) {
        String entityType = body.get("entity_type");
        String entityIdStr = body.get("entity_id");
        if (entityType == null || entityIdStr == null) {
            return ResponseEntity.badRequest().build();
        }
        fileStorageService.linkToEntity(fileId, entityType, UUID.fromString(entityIdStr));
        return ResponseEntity.ok().build();
    }

    /**
     * Dosya sil
     */
    @DeleteMapping("/{fileId}")
    public ResponseEntity<Void> deleteFile(
            @PathVariable UUID fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        fileStorageService.deleteFile(fileId);
        return ResponseEntity.noContent().build();
    }
}
