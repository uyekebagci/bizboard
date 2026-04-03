package com.bizboard.service;

import com.bizboard.common.dto.FileUploadDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.FileUpload;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.FileUploadRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.*;

@Slf4j
@Service
public class FileStorageService {

    private final FileUploadRepository fileUploadRepository;
    private final BusinessRepository businessRepository;
    private final Path rootLocation;

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

    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;

    public FileStorageService(
            FileUploadRepository fileUploadRepository,
            BusinessRepository businessRepository,
            @Value("${app.file.upload-dir:./uploads}") String uploadDir) {
        this.fileUploadRepository = fileUploadRepository;
        this.businessRepository = businessRepository;
        this.rootLocation = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    @PostConstruct
    public void init() {
        try {
            Files.createDirectories(rootLocation);
            log.info("Dosya yukleme dizini hazir: {}", rootLocation);
        } catch (IOException e) {
            throw new RuntimeException("Dosya yukleme dizini olusturulamadi: " + rootLocation, e);
        }
    }

    // ── Upload ──────────────────────────────────────────────────────────────

    @Transactional
    public FileUploadDto upload(MultipartFile file, String category, String entityType,
                                UUID entityId, UUID userId, String userName,
                                String description, boolean adminOnly) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Dosya bos olamaz");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("Dosya boyutu 10 MB'yi asamaz");
        }

        String contentType = file.getContentType();
        if (contentType == null || !ALL_ALLOWED_TYPES.contains(contentType)) {
            throw new IllegalArgumentException("Desteklenmeyen dosya tipi: " + contentType
                    + ". Izin verilenler: JPEG, PNG, GIF, WebP, SVG, PDF, DOC, DOCX, XLS, XLSX, TXT, CSV");
        }

        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unnamed";
        String extension = getExtension(originalName);
        String storedName = UUID.randomUUID() + (extension.isEmpty() ? "" : "." + extension);

        Path categoryDir = rootLocation.resolve(category);
        try {
            Files.createDirectories(categoryDir);
            Path targetPath = categoryDir.resolve(storedName);
            Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new RuntimeException("Dosya kaydetme hatasi: " + e.getMessage(), e);
        }

        FileUpload upload = FileUpload.builder()
                .originalName(originalName)
                .storedName(category + "/" + storedName)
                .contentType(contentType)
                .size(file.getSize())
                .category(category)
                .entityType(entityType)
                .entityId(entityId)
                .description(description)
                .adminOnly(adminOnly)
                .uploadedBy(userId)
                .uploadedByName(userName)
                .build();

        upload = fileUploadRepository.save(upload);
        log.info("Dosya yuklendi: {} -> {} ({}KB) by {} adminOnly={}",
                originalName, storedName, file.getSize() / 1024, userName, adminOnly);

        return toDto(upload);
    }

    // ── Download / Serve ────────────────────────────────────────────────────

    public Resource loadAsResource(UUID fileId) {
        FileUpload upload = fileUploadRepository.findById(fileId)
                .orElseThrow(() -> new IllegalArgumentException("Dosya bulunamadi: " + fileId));

        try {
            Path filePath = rootLocation.resolve(upload.getStoredName()).normalize();
            Resource resource = new UrlResource(filePath.toUri());
            if (resource.exists() && resource.isReadable()) {
                return resource;
            } else {
                throw new RuntimeException("Dosya okunamiyor: " + upload.getStoredName());
            }
        } catch (MalformedURLException e) {
            throw new RuntimeException("Dosya yolu hatasi: " + e.getMessage(), e);
        }
    }

    public FileUpload getFileEntity(UUID fileId) {
        return fileUploadRepository.findById(fileId)
                .orElseThrow(() -> new IllegalArgumentException("Dosya bulunamadi: " + fileId));
    }

    // ── List ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<FileUploadDto> getFilesByEntity(String entityType, UUID entityId, boolean isAdmin) {
        List<FileUpload> files;
        if (isAdmin) {
            files = fileUploadRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc(entityType, entityId);
        } else {
            files = fileUploadRepository.findByEntityTypeAndEntityIdAndAdminOnlyFalseOrderByCreatedAtDesc(entityType, entityId);
        }
        return files.stream().map(this::toDto).toList();
    }

    /** Birden fazla entity ID icin dosyalar (isletme listesi) */
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

    /** Tum dosyalar */
    @Transactional(readOnly = true)
    public List<FileUploadDto> getAllFiles(boolean isAdmin) {
        List<FileUpload> files;
        if (isAdmin) {
            files = fileUploadRepository.findAllByOrderByCreatedAtDesc();
        } else {
            files = fileUploadRepository.findByAdminOnlyFalseOrderByCreatedAtDesc();
        }
        return files.stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<FileUploadDto> getFilesByUser(UUID userId) {
        return fileUploadRepository.findByUploadedByOrderByCreatedAtDesc(userId)
                .stream().map(this::toDto).toList();
    }

    // ── Link ───────────────────────────────────────────────────────────────

    @Transactional
    public void linkToEntity(UUID fileId, String entityType, UUID entityId) {
        FileUpload upload = fileUploadRepository.findById(fileId)
                .orElseThrow(() -> new IllegalArgumentException("Dosya bulunamadi: " + fileId));
        upload.setEntityType(entityType);
        upload.setEntityId(entityId);
        fileUploadRepository.save(upload);
        log.info("Dosya iliskilendirildi: {} -> {}:{}", upload.getOriginalName(), entityType, entityId);
    }

    // ── Delete ──────────────────────────────────────────────────────────────

    @Transactional
    public void deleteFile(UUID fileId) {
        FileUpload upload = fileUploadRepository.findById(fileId)
                .orElseThrow(() -> new IllegalArgumentException("Dosya bulunamadi: " + fileId));

        try {
            Path filePath = rootLocation.resolve(upload.getStoredName()).normalize();
            Files.deleteIfExists(filePath);
        } catch (IOException e) {
            log.warn("Dosya diskten silinemedi: {} - {}", upload.getStoredName(), e.getMessage());
        }

        fileUploadRepository.delete(upload);
        log.info("Dosya silindi: {} ({})", upload.getOriginalName(), upload.getId());
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private String getExtension(String filename) {
        int dotIndex = filename.lastIndexOf('.');
        if (dotIndex > 0 && dotIndex < filename.length() - 1) {
            return filename.substring(dotIndex + 1).toLowerCase(Locale.ENGLISH);
        }
        return "";
    }

    private FileUploadDto toDto(FileUpload f) {
        // İşletme adını bul
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
