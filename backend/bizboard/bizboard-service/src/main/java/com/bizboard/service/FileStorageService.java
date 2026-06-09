package com.bizboard.service;

import com.bizboard.common.dto.FileUploadDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.FileUpload;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.FileUploadRepository;
import com.bizboard.service.storage.FileStorage;
import com.bizboard.service.storage.StoredFile;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;

/**
 * Business-layer service for uploaded files.
 *
 * <p>Storage is delegated to a {@link FileStorage} adapter (local disk vs S3-compatible
 * object storage) selected at startup by the {@code app.storage.type} property.</p>
 *
 * <p><b>Authorization (v1.3.7+):</b> read/delete/link operations gate on a per-file
 * authorization policy — see {@link #canRead}, {@link #canMutate}. The controller
 * threads the caller principal in; service never reads {@code SecurityContext}.</p>
 */
@Slf4j
@Service
public class FileStorageService {

    private final FileUploadRepository fileUploadRepository;
    private final BusinessRepository businessRepository;
    private final BusinessAccessGuard accessGuard;
    private final FileStorage storage;
    private final long maxFileSize;

    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"
    );

    private static final Set<String> ALLOWED_DOCUMENT_TYPES = Set.of(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain", "text/csv"
    );

    private static final Set<String> ALL_ALLOWED_TYPES;

    static {
        ALL_ALLOWED_TYPES = new HashSet<>();
        ALL_ALLOWED_TYPES.addAll(ALLOWED_IMAGE_TYPES);
        ALL_ALLOWED_TYPES.addAll(ALLOWED_DOCUMENT_TYPES);
    }

    public FileStorageService(
            FileUploadRepository fileUploadRepository,
            BusinessRepository businessRepository,
            BusinessAccessGuard accessGuard,
            FileStorage storage,
            @Value("${app.file.max-size-bytes:10485760}") long maxFileSize) {
        this.fileUploadRepository = fileUploadRepository;
        this.businessRepository = businessRepository;
        this.accessGuard = accessGuard;
        this.storage = storage;
        this.maxFileSize = maxFileSize;
    }

    @PostConstruct
    void logBackend() {
        log.info("[file-service] active storage backend: {} (max file size: {} bytes)",
                storage.backendName(), maxFileSize);
    }

    // ── Upload ──────────────────────────────────────────────────────────────

    @Transactional
    public FileUploadDto upload(MultipartFile file, String category, String entityType,
                                UUID entityId, UUID userId, String userName,
                                String description, boolean adminOnly,
                                boolean isAdmin) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Dosya bos olamaz");
        }
        if (file.getSize() > maxFileSize) {
            throw new IllegalArgumentException("Dosya boyutu " + (maxFileSize / (1024 * 1024)) + " MB'yi asamaz");
        }

        String contentType = file.getContentType();
        if (contentType == null || !ALL_ALLOWED_TYPES.contains(contentType)) {
            throw new IllegalArgumentException("Desteklenmeyen dosya tipi: " + contentType
                    + ". Izin verilenler: JPEG, PNG, GIF, WebP, SVG, PDF, DOC, DOCX, XLS, XLSX, TXT, CSV");
        }

        // Eğer kullanıcı "business" entity'sine dosya bağlıyorsa, o işletmeye
        // erişimi olduğundan emin ol. Aksi halde yabancı işletmeye dosya yapıştırılabilir.
        if (isBusinessLinked(entityType) && entityId != null && !isAdmin) {
            accessGuard.assertCanAccessBusiness(userId, entityId);
        }

        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unnamed";
        String extension = getExtension(originalName);
        String storedName = UUID.randomUUID() + (extension.isEmpty() ? "" : "." + extension);
        String storageKey = sanitizeCategory(category) + "/" + storedName;

        StoredFile stored;
        try (InputStream in = file.getInputStream()) {
            stored = storage.store(storageKey, in, file.getSize(), contentType);
        } catch (IOException e) {
            throw new RuntimeException("Dosya akisi okunamadi: " + e.getMessage(), e);
        }

        FileUpload upload = FileUpload.builder()
                .originalName(originalName)
                .storedName(stored.storageKey())
                .contentType(contentType)
                .size(stored.size())
                .category(category)
                .entityType(entityType)
                .entityId(entityId)
                .description(description)
                .adminOnly(adminOnly)
                .uploadedBy(userId)
                .uploadedByName(userName)
                .build();

        upload = fileUploadRepository.save(upload);
        log.info("Dosya yuklendi: {} -> {} ({}KB) by {} adminOnly={} backend={}",
                originalName, stored.storageKey(), stored.size() / 1024, userName, adminOnly, storage.backendName());

        return toDto(upload);
    }

    // ── Authorization policy ────────────────────────────────────────────────

    /**
     * Bir dosyayı okuyabilir/indirebilir mi?
     * - admin → her zaman (sadece {@code adminOnly} bayrağı normalde admin'i de etkilemez, true döner)
     * - uploader → her zaman
     * - entityType=BUSINESS ve user'ın o işletmeye erişimi → adminOnly olmadığı sürece evet
     * - diğer durumlar → no
     */
    public boolean canRead(UUID userId, boolean isAdmin, FileUpload file) {
        if (file == null) return false;
        if (isAdmin) return true;
        // adminOnly bayrağı non-admin'i her durumda kapatır
        if (file.isAdminOnly()) return false;
        if (Objects.equals(file.getUploadedBy(), userId)) return true;
        if (isBusinessLinked(file.getEntityType()) && file.getEntityId() != null) {
            return accessGuard.canAccessBusiness(userId, file.getEntityId());
        }
        // Diğer entityType'lar (transaction/employee/...) için kapsayıcı parent-business
        // çözünürlüğü v1.4+'a bırakıldı; şu an admin/uploader fallback.
        return false;
    }

    /**
     * Dosya üzerinde mutate edebilir mi (delete, link, metadata change)?
     * Read'den daha katı: business access yetmez, admin veya uploader olmak gerekir.
     */
    public boolean canMutate(UUID userId, boolean isAdmin, FileUpload file) {
        if (file == null) return false;
        if (isAdmin) return true;
        return Objects.equals(file.getUploadedBy(), userId);
    }

    private static boolean isBusinessLinked(String entityType) {
        if (entityType == null) return false;
        return "business".equalsIgnoreCase(entityType) || "BUSINESS".equalsIgnoreCase(entityType);
    }

    // ── Download / Serve ────────────────────────────────────────────────────

    /**
     * Open a streaming read of a stored file. Caller is responsible for closing
     * the returned stream. Use this from controller code together with a
     * {@code StreamingResponseBody} so neither backend nor S3 buffers the whole file.
     */
    public InputStream openStream(UUID fileId) {
        FileUpload upload = fileUploadRepository.findById(fileId)
                .orElseThrow(() -> new IllegalArgumentException("Dosya bulunamadi: " + fileId));
        return storage.openStream(upload.getStoredName());
    }

    public FileUpload getFileEntity(UUID fileId) {
        return fileUploadRepository.findById(fileId)
                .orElseThrow(() -> new IllegalArgumentException("Dosya bulunamadi: " + fileId));
    }

    // ── List ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<FileUploadDto> getFilesByEntity(String entityType, UUID entityId,
                                                UUID userId, boolean isAdmin) {
        // Business'a bağlı dosya listeleniyorsa o işletmeye erişim zorunlu.
        if (isBusinessLinked(entityType) && entityId != null && !isAdmin) {
            accessGuard.assertCanReadBusiness(userId, entityId);
        }
        List<FileUpload> files;
        if (isAdmin) {
            files = fileUploadRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc(entityType, entityId);
        } else {
            files = fileUploadRepository.findByEntityTypeAndEntityIdAndAdminOnlyFalseOrderByCreatedAtDesc(entityType, entityId);
        }
        // v1.6.23.20 (Security WP / arch-rules §1.3): per-file canRead — non-business
        // entityType (transaction/debt/note/...) için cross-tenant fiş leakage'ı
        // önler. canRead non-business non-uploader için zaten false döner.
        if (!isAdmin) {
            files = files.stream().filter(f -> canRead(userId, false, f)).toList();
        }
        return files.stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<FileUploadDto> getFilesByEntityIds(String entityType, List<UUID> entityIds, boolean isAdmin) {
        List<FileUpload> files;
        if (isAdmin) {
            files = fileUploadRepository.findByEntityTypeAndEntityIdInOrderByCreatedAtDesc(entityType, entityIds);
        } else {
            files = fileUploadRepository.findByEntityTypeAndEntityIdInAndAdminOnlyFalseOrderByCreatedAtDesc(entityType, entityIds);
        }
        return files.stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<FileUploadDto> getAllFiles(UUID userId, boolean isAdmin) {
        List<FileUpload> files;
        if (isAdmin) {
            files = fileUploadRepository.findAllByOrderByCreatedAtDesc();
            return files.stream().map(this::toDto).toList();
        }
        // Non-admin: yalnız {@link #canRead} cevabı evet olan dosyalar.
        files = fileUploadRepository.findByAdminOnlyFalseOrderByCreatedAtDesc();
        return files.stream()
                .filter(f -> canRead(userId, false, f))
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<FileUploadDto> getFilesByUser(UUID userId) {
        return fileUploadRepository.findByUploadedByOrderByCreatedAtDesc(userId)
                .stream().map(this::toDto).toList();
    }

    // ── Link ───────────────────────────────────────────────────────────────

    @Transactional
    public void linkToEntity(UUID fileId, String entityType, UUID entityId,
                             UUID actorUserId, boolean isAdmin) {
        FileUpload upload = fileUploadRepository.findById(fileId)
                .orElseThrow(() -> new IllegalArgumentException("Dosya bulunamadi: " + fileId));
        if (!canMutate(actorUserId, isAdmin, upload)) {
            throw new SecurityException("Access denied");
        }
        // Yeni hedef business'a yapıştırılıyorsa hedef işletmeye de erişim şart.
        if (isBusinessLinked(entityType) && entityId != null && !isAdmin) {
            accessGuard.assertCanAccessBusiness(actorUserId, entityId);
        }
        upload.setEntityType(entityType);
        upload.setEntityId(entityId);
        fileUploadRepository.save(upload);
        log.info("Dosya iliskilendirildi: {} -> {}:{}", upload.getOriginalName(), entityType, entityId);
    }

    // ── Delete ──────────────────────────────────────────────────────────────

    @Transactional
    public FileUpload deleteFile(UUID fileId, UUID actorUserId, boolean isAdmin) {
        FileUpload upload = fileUploadRepository.findById(fileId)
                .orElseThrow(() -> new IllegalArgumentException("Dosya bulunamadi: " + fileId));
        if (!canMutate(actorUserId, isAdmin, upload)) {
            throw new SecurityException("Access denied");
        }

        storage.delete(upload.getStoredName());
        fileUploadRepository.delete(upload);
        log.info("Dosya silindi: {} ({}) backend={}", upload.getOriginalName(), upload.getId(), storage.backendName());
        return upload;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static String getExtension(String filename) {
        int dotIndex = filename.lastIndexOf('.');
        if (dotIndex > 0 && dotIndex < filename.length() - 1) {
            return filename.substring(dotIndex + 1).toLowerCase(Locale.ENGLISH);
        }
        return "";
    }

    /** Keep category in a safe character set so it can't be used to escape the storage root. */
    private static String sanitizeCategory(String category) {
        if (category == null || category.isBlank()) return "document";
        String cleaned = category.replaceAll("[^a-zA-Z0-9_-]", "");
        return cleaned.isEmpty() ? "document" : cleaned;
    }

    private FileUploadDto toDto(FileUpload f) {
        String businessName = null;
        if ("business".equals(f.getEntityType()) && f.getEntityId() != null) {
            businessName = businessRepository.findById(f.getEntityId())
                    .map(Business::getName).orElse(null);
        }

        return FileUploadDto.builder()
                .id(f.getId())
                .originalName(f.getOriginalName())
                .contentType(f.getContentType())
                .size(f.getSize())
                .category(f.getCategory())
                .description(f.getDescription())
                .adminOnly(f.isAdminOnly())
                .entityType(f.getEntityType())
                .entityId(f.getEntityId())
                .businessName(businessName)
                .url("/files/" + f.getId())
                .uploadedByName(f.getUploadedByName())
                .createdAt(f.getCreatedAt())
                .build();
    }
}
