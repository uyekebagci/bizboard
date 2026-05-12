package com.bizboard.api.controller;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.FileUploadDto;
import com.bizboard.common.entity.FileUpload;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.FileStorageService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * File upload / download endpoints.
 *
 * <p>Downloads are served via {@link StreamingResponseBody} — the backend never
 * buffers the whole file in memory, which lets us proxy large objects from S3
 * without OOM risk. Every download is recorded in {@code audit_logs} (when
 * {@code app.audit.log-file-downloads=true}).</p>
 */
@Slf4j
@RestController
@RequestMapping("/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService fileStorageService;
    private final AuditLogService auditLog;

    @Value("${app.audit.log-file-downloads:true}")
    private boolean auditDownloads;

    /** Default streaming buffer (8 KB) — small enough not to spike memory, big enough for throughput. */
    private static final int STREAM_BUFFER = 8 * 1024;

    /**
     * Upload a file.
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileUploadDto> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "category", defaultValue = "document") String category,
            @RequestParam(value = "entity_type", required = false) String entityType,
            @RequestParam(value = "entity_id", required = false) UUID entityId,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "admin_only", required = false, defaultValue = "false") boolean adminOnly,
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest request) {

        boolean effectiveAdminOnly = principal.isAdmin() && adminOnly;

        FileUploadDto dto = fileStorageService.upload(
                file, category, entityType, entityId,
                principal.getId(), principal.getFullName(),
                description, effectiveAdminOnly
        );

        auditLog.recordFileAction(
                AuditAction.FILE_UPLOAD,
                principal.getId(), principal.getFullName(),
                dto.getId(), dto.getOriginalName(), dto.getSize(),
                request);

        return ResponseEntity.status(HttpStatus.CREATED).body(dto);
    }

    /**
     * Stream a file back to the client (proxy from storage backend).
     */
    @GetMapping("/{fileId}")
    public ResponseEntity<StreamingResponseBody> downloadFile(
            @PathVariable UUID fileId,
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest request) {

        FileUpload entity = fileStorageService.getFileEntity(fileId);

        if (entity.isAdminOnly() && !principal.isAdmin()) {
            if (auditDownloads) {
                auditLog.recordFileAction(
                        AuditAction.FILE_DOWNLOAD_DENIED,
                        principal.getId(), principal.getFullName(),
                        fileId, entity.getOriginalName(), entity.getSize(),
                        request);
            }
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        if (auditDownloads) {
            auditLog.recordFileAction(
                    AuditAction.FILE_DOWNLOAD,
                    principal.getId(), principal.getFullName(),
                    fileId, entity.getOriginalName(), entity.getSize(),
                    request);
        }

        String disposition = entity.getContentType() != null
                && entity.getContentType().startsWith("image/")
                ? "inline" : "attachment";

        StreamingResponseBody body = out -> {
            try (InputStream in = fileStorageService.openStream(fileId)) {
                in.transferTo(out);
                out.flush();
            } catch (Exception e) {
                log.warn("[files] stream interrupted for {} ({}): {}", fileId, entity.getOriginalName(), e.getMessage());
            }
        };

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(entity.getContentType()))
                .contentLength(entity.getSize())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        disposition + "; filename=\"" + sanitiseFilename(entity.getOriginalName()) + "\"")
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300, must-revalidate")
                .body(body);
    }

    /**
     * File metadata only (no body).
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
     * Files attached to a particular entity (e.g. business documents tab).
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
     * Optionally filtered list of all files.
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
     * Link an existing file to an entity.
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
     * Delete a file from storage and metadata table.
     */
    @DeleteMapping("/{fileId}")
    public ResponseEntity<Void> deleteFile(
            @PathVariable UUID fileId,
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest request) {
        FileUpload deleted = fileStorageService.deleteFile(fileId);
        auditLog.recordFileAction(
                AuditAction.FILE_DELETE,
                principal.getId(), principal.getFullName(),
                fileId, deleted.getOriginalName(), deleted.getSize(),
                request);
        return ResponseEntity.noContent().build();
    }

    /** Strip characters that would break Content-Disposition; keep simple ASCII. */
    private static String sanitiseFilename(String name) {
        if (name == null) return "download";
        return name.replaceAll("[\\\\/\\x00-\\x1F\"]", "_");
    }
}
