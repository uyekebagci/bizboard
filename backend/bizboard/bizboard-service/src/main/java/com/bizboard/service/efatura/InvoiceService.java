package com.bizboard.service.efatura;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateInvoiceLineRequest;
import com.bizboard.common.dto.CreateInvoiceRequest;
import com.bizboard.common.dto.InvoiceDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.Invoice;
import com.bizboard.common.entity.InvoiceLine;
import com.bizboard.common.entity.MyCompany;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.InvoiceScenario;
import com.bizboard.common.enums.InvoiceStatus;
import com.bizboard.common.enums.InvoiceType;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.InvoiceRepository;
import com.bizboard.repository.MyCompanyRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.BusinessAccessGuard;
import com.bizboard.service.ResourceNotAccessibleException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * e-Fatura modülü servis çekirdeği (Çatı v1.1, entegratör-pluggable).
 *
 * <p>Sorumluluklar: tenant-scoped CRUD, satıcı/alıcı snapshot, BigDecimal ile
 * KDV/toplam hesabı, UBL-TR XML üretimi (+ mali mühür placeholder imza),
 * entegratör üzerinden gönder/durum/iptal. Entegratör yoksa graceful: XML
 * üret/indir çalışır, gönderim "yapılandırılmadı" der.</p>
 *
 * <p>Yetkilendirme {@link BusinessAccessGuard} ile tek noktadan; her mutasyon
 * {@link AuditLogService} ile loglanır.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InvoiceService {

    private final InvoiceRepository invoiceRepository;
    private final BusinessRepository businessRepository;
    private final MyCompanyRepository myCompanyRepository;
    private final CounterpartRepository counterpartRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    private final UblTrInvoiceGenerator xmlGenerator;
    private final InvoiceTotalsCalculator totalsCalculator;
    private final InvoiceDtoMapper dtoMapper;
    private final EInvoiceIntegratorRegistry integratorRegistry;
    private final EInvoiceSigner signer;

    // ── List / get ──────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<InvoiceDto> list(UUID businessId, String status, UUID actorUserId) {
        List<UUID> allowed = resolveAllowedBusinessIds(businessId, actorUserId);
        if (allowed.isEmpty()) return List.of();

        List<Invoice> invoices;
        if (status != null && !status.isBlank()) {
            InvoiceStatus st = parseStatus(status);
            invoices = invoiceRepository
                    .findByBusinessIdInAndStatusOrderByIssueDateDescCreatedAtDesc(allowed, st);
        } else {
            invoices = invoiceRepository
                    .findByBusinessIdInOrderByIssueDateDescCreatedAtDesc(allowed);
        }
        return invoices.stream().map(i -> toDto(i, false)).toList();
    }

    @Transactional(readOnly = true)
    public InvoiceDto get(UUID id, UUID actorUserId) {
        Invoice inv = loadAndAssertRead(id, actorUserId);
        return toDto(inv, true);
    }

    /** UBL-TR XML — önizleme/indirme. Üretilmemişse 400. */
    @Transactional(readOnly = true)
    public String getXml(UUID id, UUID actorUserId) {
        Invoice inv = loadAndAssertRead(id, actorUserId);
        if (inv.getUblXml() == null || inv.getUblXml().isBlank()) {
            throw new IllegalStateException(
                    "Bu fatura için henüz XML üretilmedi. Önce 'XML Üret' işlemini çalıştırın.");
        }
        return inv.getUblXml();
    }

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public InvoiceDto create(CreateInvoiceRequest req, UUID actorUserId) {
        if (req.getBusinessId() == null) {
            throw new IllegalArgumentException("business_id zorunlu");
        }
        Business business = businessRepository.findById(req.getBusinessId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "İşletme bulunamadı: " + req.getBusinessId()));
        accessGuard.assertCanAccessBusiness(actorUserId, business.getId());

        if (req.getLines() == null || req.getLines().isEmpty()) {
            throw new IllegalArgumentException("En az bir satır kalemi zorunlu");
        }

        Invoice inv = new Invoice();
        inv.setBusiness(business);
        inv.setStatus(InvoiceStatus.DRAFT);
        inv.setScenario(parseScenario(req.getScenario()));
        inv.setInvoiceType(parseType(req.getInvoiceType()));
        inv.setCurrency(normalizeCurrency(req.getCurrency()));
        inv.setIssueDate(req.getIssueDate() != null ? req.getIssueDate() : LocalDate.now());
        inv.setNotes(blankToNull(req.getNotes()));
        inv.setEttn(UUID.randomUUID().toString());
        inv.setCreatedBy(lookupActor(actorUserId));

        // Fatura no: verilmişse benzersizlik kontrolü, yoksa otomatik üret.
        String number = blankToNull(req.getInvoiceNumber());
        if (number == null) {
            number = generateInvoiceNumber(business);
        } else if (invoiceRepository.existsByBusinessIdAndInvoiceNumber(business.getId(), number)) {
            throw new IllegalArgumentException("Bu fatura numarası zaten kayıtlı: " + number);
        }
        inv.setInvoiceNumber(number);

        applySupplierSnapshot(inv, business, req.getSupplierCompanyId(), actorUserId);
        applyCustomerSnapshot(inv, req, actorUserId);
        applyLines(inv, req.getLines());
        totalsCalculator.recompute(inv);

        inv = invoiceRepository.save(inv);
        audit(AuditAction.INVOICE_CREATE, actorUserId, inv,
                "e-Fatura taslağı oluşturuldu: " + inv.getInvoiceNumber(),
                Map.of("invoiceNumber", inv.getInvoiceNumber(),
                        "payable", inv.getPayableAmount(),
                        "lines", inv.getLines().size()));
        return toDto(inv, true);
    }

    // ── Update (yalnız DRAFT) ──────────────────────────────────────────────────

    @Transactional
    public InvoiceDto update(UUID id, CreateInvoiceRequest req, UUID actorUserId) {
        Invoice inv = loadAndAssertWrite(id, actorUserId);
        if (inv.getStatus() != InvoiceStatus.DRAFT) {
            throw new IllegalStateException(
                    "Yalnız taslak (DRAFT) faturalar düzenlenebilir. Mevcut durum: " + inv.getStatus());
        }

        if (req.getScenario() != null) inv.setScenario(parseScenario(req.getScenario()));
        if (req.getInvoiceType() != null) inv.setInvoiceType(parseType(req.getInvoiceType()));
        if (req.getCurrency() != null) inv.setCurrency(normalizeCurrency(req.getCurrency()));
        if (req.getIssueDate() != null) inv.setIssueDate(req.getIssueDate());
        if (req.getNotes() != null) inv.setNotes(blankToNull(req.getNotes()));

        // Alıcı yeniden snapshot al (counterpart veya doğrudan alanlar).
        if (req.getCustomerCounterpartId() != null
                || req.getCustomerTitle() != null
                || req.getCustomerTaxId() != null) {
            applyCustomerSnapshot(inv, req, actorUserId);
        }

        // Satırlar verildiyse tamamen yenile.
        if (req.getLines() != null && !req.getLines().isEmpty()) {
            inv.getLines().clear();
            applyLines(inv, req.getLines());
        }
        totalsCalculator.recompute(inv);
        // XML invalid oldu — yeniden üretilmeli.
        inv.setUblXml(null);
        inv.setGeneratedAt(null);

        inv = invoiceRepository.save(inv);
        audit(AuditAction.INVOICE_UPDATE, actorUserId, inv,
                "e-Fatura güncellendi: " + inv.getInvoiceNumber(),
                Map.of("invoiceNumber", inv.getInvoiceNumber(),
                        "payable", inv.getPayableAmount()));
        return toDto(inv, true);
    }

    // ── XML üret (+ imza) ──────────────────────────────────────────────────────

    @Transactional
    public InvoiceDto generateXml(UUID id, UUID actorUserId) {
        Invoice inv = loadAndAssertWrite(id, actorUserId);
        if (inv.getStatus() == InvoiceStatus.CANCELLED) {
            throw new IllegalStateException("İptal edilmiş fatura için XML üretilemez");
        }

        totalsCalculator.recompute(inv); // güvenlik: kaydedilmiş halden tekrar topla
        String xml = xmlGenerator.generate(inv);
        // Mali mühür placeholder — imza yapılandırılmışsa imzalar, değilse aynen döner.
        String finalXml = signer.sign(xml);

        inv.setUblXml(finalXml);
        inv.setGeneratedAt(java.time.LocalDateTime.now());
        if (inv.getStatus() == InvoiceStatus.DRAFT) {
            inv.setStatus(InvoiceStatus.SIGNED);
        }
        inv = invoiceRepository.save(inv);

        audit(AuditAction.INVOICE_XML_GENERATED, actorUserId, inv,
                "UBL-TR XML üretildi: " + inv.getInvoiceNumber()
                        + (signer.isConfigured() ? " (imzalı)" : " (imzasız)"),
                Map.of("invoiceNumber", inv.getInvoiceNumber(),
                        "signed", signer.isConfigured(),
                        "bytes", finalXml.length()));
        return toDto(inv, true);
    }

    // ── Gönder (entegratör) ─────────────────────────────────────────────────────

    @Transactional
    public InvoiceDto send(UUID id, UUID actorUserId) {
        Invoice inv = loadAndAssertWrite(id, actorUserId);
        if (inv.getStatus() == InvoiceStatus.CANCELLED) {
            throw new IllegalStateException("İptal edilmiş fatura gönderilemez");
        }
        if (inv.getUblXml() == null || inv.getUblXml().isBlank()) {
            // Otomatik üret — gönderim için XML zorunlu.
            String xml = signer.sign(xmlGenerator.generate(inv));
            inv.setUblXml(xml);
            inv.setGeneratedAt(java.time.LocalDateTime.now());
            if (inv.getStatus() == InvoiceStatus.DRAFT) {
                inv.setStatus(InvoiceStatus.SIGNED);
            }
        }

        EInvoiceIntegrator integrator = integratorRegistry.active();
        EInvoiceSendResult result = integrator.send(inv);

        inv.setIntegratorKey(integrator.key());
        if (result.configured() && result.accepted()) {
            inv.setStatus(InvoiceStatus.SENT);
            inv.setIntegratorRef(result.integratorRef());
            inv.setIntegratorStatus(result.statusText());
            inv.setIntegratorError(null);
            inv.setSentAt(java.time.LocalDateTime.now());
        } else if (!result.configured()) {
            // Graceful: entegratör yok — durum değişmez, kullanıcıya bilgi.
            inv.setIntegratorStatus("NOT_CONFIGURED");
            inv.setIntegratorError(result.message());
        } else {
            inv.setStatus(InvoiceStatus.ERROR);
            inv.setIntegratorError(result.message());
        }
        inv = invoiceRepository.save(inv);

        audit(AuditAction.INVOICE_SENT, actorUserId, inv,
                "e-Fatura gönderim: " + inv.getInvoiceNumber() + " — " + result.message(),
                Map.of("invoiceNumber", inv.getInvoiceNumber(),
                        "integrator", integrator.key(),
                        "configured", result.configured(),
                        "accepted", result.accepted()));

        InvoiceDto dto = toDto(inv, true);
        // Entegratör yoksa kullanıcı UI'da net mesaj görsün diye error alanı dolu.
        return dto;
    }

    // ── Durum sorgula ──────────────────────────────────────────────────────────

    @Transactional
    public InvoiceDto queryStatus(UUID id, UUID actorUserId) {
        Invoice inv = loadAndAssertWrite(id, actorUserId);
        EInvoiceIntegrator integrator = integratorRegistry.active();
        EInvoiceSendResult result = integrator.queryStatus(inv);

        if (result.configured()) {
            inv.setIntegratorStatus(result.statusText());
            if (result.integratorRef() != null) inv.setIntegratorRef(result.integratorRef());
            inv = invoiceRepository.save(inv);
        }
        audit(AuditAction.INVOICE_STATUS_QUERIED, actorUserId, inv,
                "e-Fatura durum sorgusu: " + inv.getInvoiceNumber() + " — " + result.message(),
                Map.of("invoiceNumber", inv.getInvoiceNumber(),
                        "integrator", integrator.key(),
                        "configured", result.configured()));
        return toDto(inv, true);
    }

    // ── İptal ──────────────────────────────────────────────────────────────────

    @Transactional
    public InvoiceDto cancel(UUID id, String reason, UUID actorUserId) {
        Invoice inv = loadAndAssertWrite(id, actorUserId);
        if (inv.getStatus() == InvoiceStatus.CANCELLED) {
            return toDto(inv, true);
        }

        EInvoiceIntegrator integrator = integratorRegistry.active();
        EInvoiceSendResult result = integrator.cancel(inv, reason);
        // Entegratör yoksa bile yerel durum CANCELLED yapılır (taslak/imzalı iptali).
        inv.setStatus(InvoiceStatus.CANCELLED);
        if (result.configured()) {
            inv.setIntegratorStatus(result.statusText());
            inv.setIntegratorError(result.accepted() ? null : result.message());
        }
        inv = invoiceRepository.save(inv);

        audit(AuditAction.INVOICE_CANCELLED, actorUserId, inv,
                "e-Fatura iptal edildi: " + inv.getInvoiceNumber()
                        + (reason != null ? " — " + reason : ""),
                Map.of("invoiceNumber", inv.getInvoiceNumber(),
                        "integrator", integrator.key(),
                        "integratorConfigured", result.configured()));
        return toDto(inv, true);
    }

    // ── Sil (yalnız DRAFT) ───────────────────────────────────────────────────────

    @Transactional
    public void delete(UUID id, UUID actorUserId) {
        Invoice inv = loadAndAssertWrite(id, actorUserId);
        if (inv.getStatus() != InvoiceStatus.DRAFT) {
            throw new IllegalStateException(
                    "Yalnız taslak (DRAFT) faturalar silinebilir. Gönderilmiş faturalar iptal edilmelidir.");
        }
        String number = inv.getInvoiceNumber();
        invoiceRepository.delete(inv);
        audit(AuditAction.INVOICE_DELETE, actorUserId, inv,
                "e-Fatura taslağı silindi: " + number,
                Map.of("invoiceNumber", number));
    }

    // ── Snapshot yardımcıları ────────────────────────────────────────────────────

    private void applySupplierSnapshot(Invoice inv, Business business,
                                       UUID supplierCompanyId, UUID actorUserId) {
        MyCompany company = null;
        if (supplierCompanyId != null) {
            company = myCompanyRepository.findById(supplierCompanyId).orElseThrow(
                    () -> new IllegalArgumentException("Satıcı firma bulunamadı: " + supplierCompanyId));
        } else if (business.getMyCompany() != null) {
            company = business.getMyCompany();
        }
        if (company == null) {
            throw new IllegalArgumentException(
                    "Satıcı firma belirlenemedi. İşletmeye bağlı bir firma yok; supplier_company_id verin.");
        }
        inv.setSupplierCompany(company);
        inv.setSupplierTaxId(company.getTaxId());
        inv.setSupplierTitle(company.getLegalName());
        inv.setSupplierTaxOffice(company.getTaxOffice());
        inv.setSupplierAddress(company.getAddress());
        inv.setSupplierCountry("Türkiye");

        if (company.getTaxId() == null || company.getTaxId().isBlank()) {
            throw new IllegalArgumentException(
                    "Satıcı firmanın VKN/TCKN'si tanımlı değil — e-Fatura kesilemez. Firma kaydını tamamlayın.");
        }
    }

    private void applyCustomerSnapshot(Invoice inv, CreateInvoiceRequest req, UUID actorUserId) {
        if (req.getCustomerCounterpartId() != null) {
            Counterpart cp = counterpartRepository.findById(req.getCustomerCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Alıcı (karşı firma) bulunamadı: " + req.getCustomerCounterpartId()));
            // Counterpart tenant doğrulaması — başka işletmenin carisi sızmasın.
            accessGuard.assertCanReadBusiness(actorUserId,
                    cp.getBusiness() != null ? cp.getBusiness().getId() : null);
            inv.setCustomerCounterpart(cp);
            inv.setCustomerTaxId(cp.getTaxId());
            inv.setCustomerTitle(cp.getName());
            inv.setCustomerTaxOffice(cp.getTaxOffice());
            inv.setCustomerAddress(cp.getAddress());
        }
        // Doğrudan girilen alanlar override eder / counterpart yoksa tek kaynaktır.
        if (req.getCustomerTaxId() != null) inv.setCustomerTaxId(blankToNull(req.getCustomerTaxId()));
        if (req.getCustomerTitle() != null) inv.setCustomerTitle(blankToNull(req.getCustomerTitle()));
        if (req.getCustomerTaxOffice() != null) inv.setCustomerTaxOffice(blankToNull(req.getCustomerTaxOffice()));
        if (req.getCustomerAddress() != null) inv.setCustomerAddress(blankToNull(req.getCustomerAddress()));
        if (req.getCustomerCity() != null) inv.setCustomerCity(blankToNull(req.getCustomerCity()));
        if (req.getCustomerDistrict() != null) inv.setCustomerDistrict(blankToNull(req.getCustomerDistrict()));
        inv.setCustomerCountry(blankToNull(req.getCustomerCountry()) != null
                ? req.getCustomerCountry().trim() : "Türkiye");

        if (inv.getCustomerTitle() == null || inv.getCustomerTitle().isBlank()) {
            throw new IllegalArgumentException("Alıcı unvanı zorunlu");
        }
    }

    private void applyLines(Invoice inv, List<CreateInvoiceLineRequest> lineReqs) {
        int n = 1;
        for (CreateInvoiceLineRequest lr : lineReqs) {
            InvoiceLine line = new InvoiceLine();
            line.setLineNumber(n++);
            line.setItemName(lr.getItemName());
            line.setDescription(blankToNull(lr.getDescription()));
            line.setUnitCode(blankToNull(lr.getUnitCode()) != null
                    ? lr.getUnitCode().trim() : "C62");
            line.setQuantity(lr.getQuantity() != null ? lr.getQuantity() : BigDecimal.ONE);
            line.setUnitPrice(lr.getUnitPrice() != null ? lr.getUnitPrice() : BigDecimal.ZERO);
            line.setVatRate(lr.getVatRate() != null ? lr.getVatRate() : new BigDecimal("20.00"));
            line.setDiscountAmount(lr.getDiscountAmount() != null
                    ? lr.getDiscountAmount() : BigDecimal.ZERO);
            inv.addLine(line);
        }
    }

    // ── Erişim / yardımcılar ────────────────────────────────────────────────────────

    private Invoice loadAndAssertRead(UUID id, UUID actorUserId) {
        Invoice inv = invoiceRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Fatura bulunamadı"));
        accessGuard.assertCanReadBusiness(actorUserId,
                inv.getBusiness() != null ? inv.getBusiness().getId() : null);
        return inv;
    }

    private Invoice loadAndAssertWrite(UUID id, UUID actorUserId) {
        Invoice inv = invoiceRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Fatura bulunamadı"));
        accessGuard.assertCanAccessBusiness(actorUserId,
                inv.getBusiness() != null ? inv.getBusiness().getId() : null);
        return inv;
    }

    private List<UUID> resolveAllowedBusinessIds(UUID businessId, UUID actorUserId) {
        if (businessId != null) {
            accessGuard.assertCanReadBusiness(actorUserId, businessId);
            return List.of(businessId);
        }
        return accessGuard.accessibleBusinessIds(actorUserId);
    }

    /**
     * Fatura numarası üret — 3 harf seri (BBE) + yıl + 9 hane sıra. İşletme
     * bazında benzersizlik {@code existsBy...} ile garanti edilir (yarış
     * durumunda 1 deneme yetmezse artırılır).
     */
    private String generateInvoiceNumber(Business business) {
        int year = LocalDate.now().getYear();
        long count = invoiceRepository.countByBusinessId(business.getId());
        for (int attempt = 0; attempt < 1000; attempt++) {
            long seq = count + 1 + attempt;
            String candidate = String.format(Locale.ENGLISH, "BBE%04d%09d", year, seq);
            if (!invoiceRepository.existsByBusinessIdAndInvoiceNumber(business.getId(), candidate)) {
                return candidate;
            }
        }
        // Aşırı uç — UUID tabanlı fallback.
        return "BBE" + year + UUID.randomUUID().toString().replace("-", "").substring(0, 9).toUpperCase();
    }

    private void audit(String action, UUID actorUserId, Invoice inv,
                       String detail, Map<String, Object> meta) {
        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                action, actorUserId, actor != null ? actor.getUsername() : null,
                "INVOICE", inv.getId(), detail, meta);
    }

    private User lookupActor(UUID actorUserId) {
        if (actorUserId == null) return null;
        return userRepository.findById(actorUserId).orElse(null);
    }

    private static InvoiceScenario parseScenario(String s) {
        if (s == null || s.isBlank()) return InvoiceScenario.TEMEL;
        try {
            return InvoiceScenario.valueOf(s.trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Geçersiz senaryo (TEMEL/TICARI): " + s);
        }
    }

    private static InvoiceType parseType(String s) {
        if (s == null || s.isBlank()) return InvoiceType.SATIS;
        try {
            return InvoiceType.valueOf(s.trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Geçersiz fatura tipi: " + s);
        }
    }

    private static InvoiceStatus parseStatus(String s) {
        try {
            return InvoiceStatus.valueOf(s.trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Geçersiz durum: " + s);
        }
    }

    private static String normalizeCurrency(String s) {
        if (s == null || s.isBlank()) return "TRY";
        return s.trim().toUpperCase(Locale.ENGLISH);
    }

    private static String blankToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    // ── DTO mapping ──────────────────────────────────────────────────────────────────

    public InvoiceDto toDto(Invoice inv, boolean withLines) {
        return dtoMapper.toDto(inv, withLines);
    }
}
