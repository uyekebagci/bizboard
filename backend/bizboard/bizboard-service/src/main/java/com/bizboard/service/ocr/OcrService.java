package com.bizboard.service.ocr;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.*;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.OcrScan;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.OcrScanStatus;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.OcrScanRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.BusinessAccessGuard;
import com.bizboard.service.FileStorageService;
import com.bizboard.service.InstrumentService;
import com.bizboard.service.TransactionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * OCR Modülü (WP 1bdb8116) — uçtan uca orkestrasyon.
 *
 * <h3>Tarama (scan):</h3>
 * dosya yükle ({@link FileStorageService}, mevcut R2/S3 deseni) → OCR ({@link OcrEngine},
 * Mindee birincil / Tesseract fallback) → alan çıkar ({@link OcrFieldExtractor},
 * field-level confidence) → {@link OcrScan} olarak persist → review DTO döndür.
 *
 * <h3>Onay (confirm):</h3>
 * kullanıcı düzeltilmiş alanları gönderir → belge tipine göre MEVCUT servisleri
 * REUSE eder ({@link TransactionService#createTransaction} fiş için /
 * {@link InstrumentService#create} çek-senet için) → yeni finansal mantık YAZILMAZ.
 *
 * <p><b>STRICT:</b> her giriş guard'lı (tenant-scope), her mutate audit'li,
 * OCR başarısızlığı graceful (scan FAILED durumunda kaydedilir, manuel giriş
 * mümkün). Secret'lar config'ten; bu sınıf key görmez.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OcrService {

    private final OcrEngine ocrEngine;
    private final OcrFieldExtractor fieldExtractor;
    private final OcrProperties props;
    private final FileStorageService fileStorageService;
    private final OcrScanRepository scanRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    private final TransactionService transactionService;
    private final InstrumentService instrumentService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final java.util.Set<String> ALLOWED = java.util.Set.of(
            "image/jpeg", "image/png", "image/webp", "application/pdf");

    public boolean isEnabled() {
        return props.isEnabled();
    }

    // ──────────────────────────── SCAN (tek dosya) ────────────────────────────

    @Transactional
    public OcrDtos.ScanDto scan(UUID userId, String userName, boolean isAdmin,
                                UUID businessId, MultipartFile file, String documentTypeRaw) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        OcrDocumentType docType = OcrDocumentType.parse(documentTypeRaw);
        validateFile(file);

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new IllegalArgumentException("Dosya okunamadı: " + e.getMessage());
        }

        // 1) Dosyayı mevcut storage deseniyle yükle (R2/S3/local).
        FileUploadDto uploaded = fileStorageService.upload(
                file, "ocr", "business", businessId,
                userId, userName, "OCR taraması", false, isAdmin);

        // 2) OCR çalıştır (Mindee → fallback Tesseract). Graceful: hata = FAILED scan.
        OcrRawResult raw = ocrEngine.scan(bytes, file.getContentType(), docType);
        OcrExtraction extraction = fieldExtractor.extract(raw, docType);

        OcrScanStatus status;
        if (!extraction.ocrSucceeded() || extraction.isEmpty()) {
            status = OcrScanStatus.FAILED;
        } else if (extraction.hasLowConfidence()) {
            status = OcrScanStatus.LOW_CONFIDENCE;
        } else {
            status = OcrScanStatus.EXTRACTED;
        }

        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));
        User user = userRepository.findById(userId).orElse(null);

        OcrScan saved = scanRepository.save(OcrScan.builder()
                .business(business)
                .fileId(uploaded.getId())
                .documentType(docType.name())
                .status(status)
                .ocrProvider(extraction.provider())
                .overallConfidence(extraction.overallScore())
                .extractedFields(serializeFields(extraction.fields()))
                .note(extraction.note())
                .createdBy(user)
                .build());

        auditLogService.recordEntityAction(
                AuditAction.OCR_SCAN, userId, userName,
                "OCR_SCAN", saved.getId(),
                "Belge tarandı: " + docType + " (" + extraction.provider() + ", "
                        + status + ")",
                Map.of("documentType", docType.name(),
                        "provider", extraction.provider(),
                        "status", status.name(),
                        "fileId", uploaded.getId().toString()), null);

        log.info("[ocr] scan id={} biz={} type={} provider={} status={} fields={}",
                saved.getId(), businessId, docType, extraction.provider(),
                status, extraction.fields().size());
        return toDto(saved);
    }

    // ──────────────────────────── SCAN (bulk) ────────────────────────────

    @Transactional
    public OcrDtos.BulkScanResponse scanBulk(UUID userId, String userName, boolean isAdmin,
                                             UUID businessId, List<MultipartFile> files,
                                             String documentTypeRaw) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("En az bir dosya gerekli");
        }
        if (files.size() > props.getBulkMaxFiles()) {
            throw new IllegalArgumentException(
                    "Tek seferde en fazla " + props.getBulkMaxFiles() + " dosya yüklenebilir");
        }
        List<OcrDtos.ScanDto> scans = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        for (MultipartFile f : files) {
            try {
                scans.add(scan(userId, userName, isAdmin, businessId, f, documentTypeRaw));
            } catch (Exception e) {
                String name = f != null ? f.getOriginalFilename() : "?";
                log.warn("[ocr] bulk dosya başarısız {}: {}", name, e.getMessage());
                failed.add(name + " — " + e.getMessage());
            }
        }
        return OcrDtos.BulkScanResponse.builder().scans(scans).failedFiles(failed).build();
    }

    // ──────────────────────────── QUERY ────────────────────────────

    @Transactional(readOnly = true)
    public List<OcrDtos.ScanDto> list(UUID userId, UUID businessId, String statusRaw) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        OcrScanStatus status = OcrScanStatus.parse(statusRaw);
        List<OcrScan> rows = status != null
                ? scanRepository.findByBusinessIdAndStatusOrderByCreatedAtDesc(businessId, status)
                : scanRepository.findByBusinessIdOrderByCreatedAtDesc(businessId);
        return rows.stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public OcrDtos.ScanDto get(UUID userId, UUID businessId, UUID scanId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return toDto(requireScan(businessId, scanId));
    }

    // ──────────────────────────── CONFIRM ────────────────────────────

    /**
     * Onay: kullanıcının düzeltilmiş alanlarıyla finansal kaydı oluştur.
     * Belge tipine göre MEVCUT create servislerini reuse eder.
     */
    @Transactional
    public OcrDtos.ScanDto confirm(UUID userId, String userName, UUID businessId,
                                   UUID scanId, OcrDtos.ConfirmRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        OcrScan scan = requireScan(businessId, scanId);
        if (scan.getStatus() == null || !scan.getStatus().isPending()) {
            throw new IllegalStateException("Bu tarama zaten işlendi (status=" + scan.getStatus() + ")");
        }
        if (req.getAmount() == null || req.getAmount().signum() <= 0) {
            throw new IllegalArgumentException("amount > 0 olmalı");
        }

        String target = resolveTarget(req, scan);
        UUID resultId;
        if ("INSTRUMENT".equals(target)) {
            resultId = createInstrument(userId, businessId, scan, req);
            scan.setResultEntityType("INSTRUMENT");
        } else {
            resultId = createTransaction(userId, businessId, scan, req);
            scan.setResultEntityType("TRANSACTION");
        }

        scan.setResultEntityId(resultId);
        scan.setStatus(OcrScanStatus.CONFIRMED);
        scan.setConfirmedAt(LocalDateTime.now());
        scan = scanRepository.save(scan);

        auditLogService.recordEntityAction(
                AuditAction.OCR_CONFIRM, userId, userName,
                "OCR_SCAN", scan.getId(),
                "OCR taraması onaylandı → " + target + " oluşturuldu",
                Map.of("target", target,
                        "resultEntityId", resultId.toString(),
                        "amount", req.getAmount()), null);
        log.info("[ocr] confirm scan={} target={} result={}", scan.getId(), target, resultId);
        return toDto(scan);
    }

    /** Tarama at (kullanıcı vazgeçti). */
    @Transactional
    public OcrDtos.ScanDto discard(UUID userId, String userName, UUID businessId, UUID scanId) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        OcrScan scan = requireScan(businessId, scanId);
        if (scan.getStatus() == OcrScanStatus.CONFIRMED) {
            throw new IllegalStateException("Onaylanmış tarama atılamaz");
        }
        scan.setStatus(OcrScanStatus.DISCARDED);
        scan = scanRepository.save(scan);
        auditLogService.recordEntityAction(
                AuditAction.OCR_DISCARD, userId, userName,
                "OCR_SCAN", scan.getId(), "OCR taraması atıldı", null, null);
        return toDto(scan);
    }

    // ──────────────────────── confirm → reuse mevcut servisler ────────────────────────

    private UUID createTransaction(UUID userId, UUID businessId, OcrScan scan,
                                   OcrDtos.ConfirmRequest req) {
        if (req.getCategoryId() == null) {
            throw new IllegalArgumentException("category_id zorunlu (fiş/dekont onayı)");
        }
        CreateTransactionRequest tx = new CreateTransactionRequest();
        // Fiş genelde gider; kullanıcı override edebilir.
        tx.setDirection(req.getDirection() != null && !req.getDirection().isBlank()
                ? req.getDirection().trim().toUpperCase(Locale.ROOT) : "EXPENSE");
        tx.setAmount(req.getAmount());
        tx.setDate(req.getDate() != null ? req.getDate() : LocalDate.now());
        tx.setCategoryId(req.getCategoryId());
        tx.setDescription(req.getDescription() != null ? req.getDescription()
                : "OCR fiş — " + scan.getDocumentType());
        if (req.getPaymentMethod() != null) tx.setPaymentMethod(req.getPaymentMethod());
        if (req.getBankAccountId() != null) tx.setBankAccountId(req.getBankAccountId());
        if (req.getTargetCounterpartId() != null) tx.setTargetCounterpartId(req.getTargetCounterpartId());

        TransactionDto created = transactionService.createTransaction(businessId, tx, userId);
        return created.getId();
    }

    private UUID createInstrument(UUID userId, UUID businessId, OcrScan scan,
                                  OcrDtos.ConfirmRequest req) {
        CreateInstrumentRequest ins = new CreateInstrumentRequest();
        String type = req.getInstrumentType() != null && !req.getInstrumentType().isBlank()
                ? req.getInstrumentType() : scan.getDocumentType();
        ins.setType(type);
        ins.setDirection(req.getInstrumentDirection() != null ? req.getInstrumentDirection() : "RECEIVED");
        ins.setAmount(req.getAmount());
        if (req.getDueDate() == null) {
            throw new IllegalArgumentException("due_date (vade) zorunlu (çek/senet onayı)");
        }
        ins.setDueDate(req.getDueDate());
        ins.setBankName(req.getBankName());
        ins.setSerialNo(req.getSerialNo());
        ins.setIssuerCounterpartId(req.getIssuerCounterpartId());
        ins.setNotes(req.getDescription());
        // Foto + OCR metadata izini Instrument'a taşı (mevcut alanları reuse).
        ins.setSource(com.bizboard.common.entity.Instrument.SOURCE_TELEGRAM_PHOTO);
        ins.setPhotoUrl(scan.getFileId() != null ? "/files/" + scan.getFileId() : null);
        ins.setOcrMeta(scan.getExtractedFields());

        InstrumentDto created = instrumentService.create(userId, businessId, ins);
        // Instrument source=TELEGRAM_PHOTO → PENDING_OCR açılır; OCR onayını burada
        // veriyoruz → CONFIRMED'e geçir (mevcut confirm akışı reuse).
        if ("PENDING_OCR".equals(created.getStatus())) {
            instrumentService.confirm(userId, businessId, created.getId());
        }
        return created.getId();
    }

    private String resolveTarget(OcrDtos.ConfirmRequest req, OcrScan scan) {
        if (req.getTarget() != null && !req.getTarget().isBlank()) {
            String t = req.getTarget().trim().toUpperCase(Locale.ROOT);
            if (!"TRANSACTION".equals(t) && !"INSTRUMENT".equals(t)) {
                throw new IllegalArgumentException("target TRANSACTION | INSTRUMENT olmalı");
            }
            return t;
        }
        OcrDocumentType dt = OcrDocumentType.parse(scan.getDocumentType());
        return dt.isInstrument() ? "INSTRUMENT" : "TRANSACTION";
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Dosya boş olamaz");
        }
        if (file.getSize() > props.getMaxFileSizeBytes()) {
            throw new IllegalArgumentException(
                    "Dosya boyutu " + (props.getMaxFileSizeBytes() / (1024 * 1024)) + " MB'yi aşamaz");
        }
        String ct = file.getContentType();
        if (ct == null || !ALLOWED.contains(ct)) {
            throw new IllegalArgumentException(
                    "Desteklenmeyen dosya tipi: " + ct + ". İzin verilenler: JPEG, PNG, WebP, PDF");
        }
    }

    private OcrScan requireScan(UUID businessId, UUID scanId) {
        OcrScan scan = scanRepository.findById(scanId)
                .orElseThrow(() -> new IllegalArgumentException("Tarama bulunamadı"));
        if (scan.getBusiness() == null || !businessId.equals(scan.getBusiness().getId())) {
            throw new SecurityException("Tarama bu işletmeye ait değil");
        }
        return scan;
    }

    private String serializeFields(List<OcrField> fields) {
        try {
            List<Map<String, Object>> list = new ArrayList<>();
            for (OcrField f : fields) {
                Map<String, Object> m = new java.util.LinkedHashMap<>();
                m.put("key", f.key());
                m.put("value", f.value());
                m.put("confidence", f.confidence());
                list.add(m);
            }
            return objectMapper.writeValueAsString(list);
        } catch (Exception e) {
            log.warn("[ocr] alanlar serialize edilemedi: {}", e.getMessage());
            return "[]";
        }
    }

    @SuppressWarnings("unchecked")
    private List<OcrDtos.FieldDto> deserializeFields(String json) {
        List<OcrDtos.FieldDto> out = new ArrayList<>();
        if (json == null || json.isBlank()) return out;
        try {
            List<Map<String, Object>> list = objectMapper.readValue(json, List.class);
            for (Map<String, Object> m : list) {
                Double conf = m.get("confidence") != null
                        ? ((Number) m.get("confidence")).doubleValue() : null;
                String value = m.get("value") != null ? String.valueOf(m.get("value")) : null;
                out.add(OcrDtos.FieldDto.builder()
                        .key(String.valueOf(m.get("key")))
                        .value(value)
                        .confidence(conf)
                        .lowConfidence(conf == null || conf < OcrField.LOW_CONFIDENCE_THRESHOLD)
                        .build());
            }
        } catch (Exception e) {
            log.warn("[ocr] alanlar deserialize edilemedi: {}", e.getMessage());
        }
        return out;
    }

    private OcrDtos.ScanDto toDto(OcrScan s) {
        List<OcrDtos.FieldDto> fields = deserializeFields(s.getExtractedFields());
        boolean hasLow = fields.stream()
                .anyMatch(f -> f.getValue() != null && !f.getValue().isBlank() && f.isLowConfidence());
        return OcrDtos.ScanDto.builder()
                .id(s.getId())
                .fileId(s.getFileId())
                .fileUrl(s.getFileId() != null ? "/files/" + s.getFileId() : null)
                .documentType(s.getDocumentType())
                .status(s.getStatus() != null ? s.getStatus().name() : null)
                .ocrProvider(s.getOcrProvider())
                .overallConfidence(s.getOverallConfidence())
                .hasLowConfidence(hasLow)
                .note(s.getNote())
                .fields(fields)
                .resultEntityType(s.getResultEntityType())
                .resultEntityId(s.getResultEntityId())
                .createdAt(s.getCreatedAt())
                .confirmedAt(s.getConfirmedAt())
                .build();
    }
}
