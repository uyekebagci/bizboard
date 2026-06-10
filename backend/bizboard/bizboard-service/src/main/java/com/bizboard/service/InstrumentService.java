package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CashInstrumentRequest;
import com.bizboard.common.dto.CreateInstrumentRequest;
import com.bizboard.common.dto.EndorseInstrumentRequest;
import com.bizboard.common.dto.InstrumentDto;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.*;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.7 / TODO 1) — çek/senet (Instrument) yönetimi.
 *
 * <p>Posting çekirdeğine bağlı: PENDING_OCR/CONFIRMED iken para hesabını
 * ETKİLEMEZ (portföy/takip); tahsil/ödeme (CASHED) anında para hesabına dengeli
 * (Σ=0) {@link JournalEntry}+{@link Posting} yazılır
 * ({@code source_type=INSTRUMENT}, {@code source_ref_id=instrument.id}).</p>
 *
 * <h3>Tahsil/ödeme posting'i (LOCATION_MOVE çifti — gelir/gider değil):</h3>
 * Çek tahsili gelir tanıma DEĞİL, alacağın nakde dönüşümüdür (gelir altta yatan
 * satışta tanındı). Bu yüzden iki bacak da {@code LOCATION_MOVE}:
 * <pre>
 *   RECEIVED tahsil: paraHesabı += amount         (LOCATION_MOVE)
 *                    clearing(account NULL) −= amount, counterpart=keşideci
 *   GIVEN   ödeme:   paraHesabı −= amount          (LOCATION_MOVE)
 *                    clearing(account NULL) += amount, counterpart=keşideci
 * </pre>
 * Σ = 0. (Cari alacak/borç takibi clearing bacağındaki {@code counterpart}'tan.)
 *
 * <p><b>STRICT:</b> tüm mutate guard'lı + audit; posting Σ=0; idempotent +
 * reversible (BOUNCED → tahsil entry'si silinir).</p>
 *
 * <p><b>Telegram-foto/OCR (NOT):</b> gerçek inbound-foto + OCR akışı AYRI modülde
 * (Telegram Bot WP b7779199 + OCR Modülü WP 1bdb8116). O modül {@link #create}
 * çağrısını {@code source=TELEGRAM_PHOTO} + {@code status=PENDING_OCR} ile yapıp
 * {@link #confirm} ile onaylatacaktır; model + manuel giriş + API burada hazırdır.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InstrumentService {

    private final InstrumentRepository instrumentRepository;
    private final CounterpartRepository counterpartRepository;
    private final MyCompanyRepository myCompanyRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    // ──────────────────────────── CREATE ────────────────────────────

    @Transactional
    public InstrumentDto create(UUID userId, UUID businessId, CreateInstrumentRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = loadUser(userId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        InstrumentType type = parseType(req.getType());
        InstrumentDirection direction = parseDirection(req.getDirection());
        if (req.getAmount() == null || req.getAmount().signum() <= 0) {
            throw new IllegalArgumentException("amount > 0 olmalı");
        }
        if (req.getDueDate() == null) {
            throw new IllegalArgumentException("due_date (vade) zorunlu");
        }

        Counterpart issuer = null;
        if (req.getIssuerCounterpartId() != null) {
            issuer = counterpartRepository.findById(req.getIssuerCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException("Keşideci/karşı taraf bulunamadı"));
            assertSameBusiness(issuer.getBusiness(), businessId, "Keşideci");
        }
        MyCompany ourCompany = null;
        if (req.getOurCompanyId() != null) {
            ourCompany = myCompanyRepository.findById(req.getOurCompanyId())
                    .orElseThrow(() -> new IllegalArgumentException("Firma (MyCompany) bulunamadı"));
        }

        String source = req.getSource() != null && !req.getSource().isBlank()
                ? req.getSource().trim().toUpperCase(Locale.ROOT) : Instrument.SOURCE_MANUAL;
        // Telegram-foto kaynağı OCR onayı bekler; manuel doğrudan CONFIRMED.
        InstrumentStatus initialStatus = Instrument.SOURCE_TELEGRAM_PHOTO.equals(source)
                ? InstrumentStatus.PENDING_OCR : InstrumentStatus.CONFIRMED;

        Instrument ins = Instrument.builder()
                .business(business)
                .type(type)
                .direction(direction)
                .amount(req.getAmount())
                .currency(req.getCurrency() != null ? req.getCurrency() : "TRY")
                .issuerCounterpart(issuer)
                .ourCompany(ourCompany)
                .bankName(req.getBankName())
                .serialNo(req.getSerialNo())
                .issueDate(req.getIssueDate())
                .dueDate(req.getDueDate())
                .status(initialStatus)
                .source(source)
                .photoUrl(req.getPhotoUrl())
                .ocrMeta(req.getOcrMeta())
                .notes(req.getNotes())
                .createdBy(user)
                .build();
        ins = instrumentRepository.save(ins);

        audit(AuditAction.INSTRUMENT_CREATE, userId, user, ins,
                "Çek/senet girildi: " + type + " " + direction + " " + req.getAmount()
                        + " vade=" + req.getDueDate() + " kaynak=" + source, null);
        log.info("[instrument] created id={} type={} dir={} amount={} status={}",
                ins.getId(), type, direction, req.getAmount(), initialStatus);
        return toDto(ins);
    }

    // ──────────────────────────── CONFIRM (OCR onayı) ────────────────────────────

    @Transactional
    public InstrumentDto confirm(UUID userId, UUID businessId, UUID id) {
        Instrument ins = loadForMutate(userId, businessId, id);
        if (ins.getStatus() != InstrumentStatus.PENDING_OCR) {
            throw new IllegalStateException("Sadece PENDING_OCR durumundaki evrak onaylanabilir");
        }
        ins.setStatus(InstrumentStatus.CONFIRMED);
        ins = instrumentRepository.save(ins);
        audit(AuditAction.INSTRUMENT_CONFIRM, userId, loadUser(userId), ins,
                "Çek/senet onaylandı (OCR → CONFIRMED)", null);
        return toDto(ins);
    }

    // ──────────────────────────── CASH (tahsil/ödeme) ────────────────────────────

    @Transactional
    public InstrumentDto cash(UUID userId, UUID businessId, UUID id, CashInstrumentRequest req) {
        Instrument ins = loadForMutate(userId, businessId, id);
        if (!ins.getStatus().isCashable()) {
            throw new IllegalStateException(
                    "Bu durumda tahsil/ödeme yapılamaz (status=" + ins.getStatus() + ")");
        }
        BankAccount account = bankAccountRepository.findById(req.getAccountId())
                .orElseThrow(() -> new IllegalArgumentException("Para hesabı bulunamadı"));
        assertSameBusiness(account.getBusiness(), businessId, "Para hesabı");

        LocalDate cashedDate = req.getCashedDate() != null ? req.getCashedDate() : LocalDate.now();
        if (cashedDate.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("cashed_date gelecek tarih olamaz: " + cashedDate);
        }

        // RECEIVED → para girer (+); GIVEN → para çıkar (−).
        BigDecimal signed = ins.getDirection() == InstrumentDirection.RECEIVED
                ? ins.getAmount() : ins.getAmount().negate();

        JournalEntry entry = JournalEntry.builder()
                .business(ins.getBusiness())
                .entryDate(cashedDate)
                .sourceType(JournalSourceType.INSTRUMENT)
                .sourceRefId(ins.getId())
                .description((ins.getDirection() == InstrumentDirection.RECEIVED ? "Çek tahsil" : "Çek ödeme")
                        + " — " + ins.getType() + " " + ins.getAmount()
                        + (ins.getIssuerCounterpart() != null ? " (" + ins.getIssuerCounterpart().getName() + ")" : ""))
                .createdBy(loadUser(userId))
                .build();
        // Bacak 1: para hesabı (konum hareketi).
        Posting accLeg = Posting.builder().journalEntry(entry).account(account)
                .amount(signed).legKind(PostingLegKind.LOCATION_MOVE)
                .counterpart(ins.getIssuerCounterpart()).build();
        // Bacak 2: clearing (alacak/borç dönüşümü; account NULL, ters işaret).
        Posting clearing = Posting.builder().journalEntry(entry).account(null)
                .amount(signed.negate()).legKind(PostingLegKind.LOCATION_MOVE)
                .counterpart(ins.getIssuerCounterpart()).build();
        entry.setPostings(List.of(accLeg, clearing));
        assertBalanced(entry);
        entry = journalEntryRepository.save(entry); // cascade postings

        ins.setStatus(InstrumentStatus.CASHED);
        ins.setCashedAccount(account);
        ins.setCashedAt(LocalDateTime.now());
        ins.setJournalEntryId(entry.getId());
        ins = instrumentRepository.save(ins);

        Map<String, Object> meta = baseMeta(ins);
        meta.put("accountId", account.getId().toString());
        meta.put("journalEntryId", entry.getId().toString());
        audit(AuditAction.INSTRUMENT_CASH, userId, loadUser(userId), ins,
                (ins.getDirection() == InstrumentDirection.RECEIVED ? "Tahsil edildi" : "Ödendi")
                        + " — " + ins.getAmount() + " → " + account.getName(), meta);
        log.info("[instrument] cashed id={} dir={} amount={} account={} entry={}",
                ins.getId(), ins.getDirection(), ins.getAmount(), account.getName(), entry.getId());
        return toDto(ins);
    }

    // ──────────────────────────── BOUNCE (karşılıksız) ────────────────────────────

    @Transactional
    public InstrumentDto bounce(UUID userId, UUID businessId, UUID id) {
        Instrument ins = loadForMutate(userId, businessId, id);
        if (ins.getStatus().isTerminal()) {
            throw new IllegalStateException("Nihai durumdaki evrak karşılıksız işaretlenemez (status="
                    + ins.getStatus() + ")");
        }
        // CASHED değil, ama defensive: tahsil entry'si varsa reversible sil.
        reverseCashEntry(ins);
        ins.setStatus(InstrumentStatus.BOUNCED);
        ins.setBouncedAt(LocalDateTime.now());
        ins = instrumentRepository.save(ins);
        audit(AuditAction.INSTRUMENT_BOUNCE, userId, loadUser(userId), ins,
                "KARŞILIKSIZ — " + ins.getType() + " " + ins.getAmount(), null,
                AuditAction.HIGHLIGHT_INSTRUMENT_BOUNCE);
        log.warn("[instrument] BOUNCED id={} amount={}", ins.getId(), ins.getAmount());
        return toDto(ins);
    }

    // ──────────────────────────── ENDORSE (ciro/devir) ────────────────────────────

    @Transactional
    public InstrumentDto endorse(UUID userId, UUID businessId, UUID id, EndorseInstrumentRequest req) {
        Instrument ins = loadForMutate(userId, businessId, id);
        if (ins.getDirection() != InstrumentDirection.RECEIVED) {
            throw new IllegalStateException("Sadece alınan (RECEIVED) evrak ciro edilebilir");
        }
        if (!ins.getStatus().isEndorsable()) {
            throw new IllegalStateException("Bu durumda ciro yapılamaz (status=" + ins.getStatus() + ")");
        }
        Counterpart to = counterpartRepository.findById(req.getToCounterpartId())
                .orElseThrow(() -> new IllegalArgumentException("Devralan counterpart bulunamadı"));
        assertSameBusiness(to.getBusiness(), businessId, "Devralan");

        ins.setStatus(InstrumentStatus.ENDORSED);
        ins.setEndorsedToCounterpart(to);
        ins.setEndorsedAt(LocalDateTime.now());
        if (req.getNotes() != null && !req.getNotes().isBlank()) {
            ins.setNotes((ins.getNotes() != null ? ins.getNotes() + "\n" : "") + "Ciro: " + req.getNotes());
        }
        ins = instrumentRepository.save(ins);
        audit(AuditAction.INSTRUMENT_ENDORSE, userId, loadUser(userId), ins,
                "Ciro edildi → " + to.getName(), null);
        log.info("[instrument] endorsed id={} to={}", ins.getId(), to.getName());
        return toDto(ins);
    }

    // ──────────────────────────── QUERY ────────────────────────────

    @Transactional(readOnly = true)
    public List<InstrumentDto> list(UUID userId, UUID businessId, String status) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        List<Instrument> rows;
        if (status != null && !status.isBlank()) {
            rows = instrumentRepository.findByBusinessIdAndStatusOrderByDueDateAsc(
                    businessId, parseStatus(status));
        } else {
            rows = instrumentRepository.findByBusinessIdOrderByDueDateAsc(businessId);
        }
        return rows.stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public InstrumentDto get(UUID userId, UUID businessId, UUID id) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        Instrument ins = instrumentRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Çek/senet bulunamadı"));
        assertSameBusiness(ins.getBusiness(), businessId, "Çek/senet");
        return toDto(ins);
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    private Instrument loadForMutate(UUID userId, UUID businessId, UUID id) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        Instrument ins = instrumentRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Çek/senet bulunamadı"));
        assertSameBusiness(ins.getBusiness(), businessId, "Çek/senet");
        return ins;
    }

    private void reverseCashEntry(Instrument ins) {
        if (ins.getJournalEntryId() == null) return;
        journalEntryRepository.findById(ins.getJournalEntryId())
                .ifPresent(journalEntryRepository::delete); // cascade + orphanRemoval
        ins.setJournalEntryId(null);
        ins.setCashedAccount(null);
        ins.setCashedAt(null);
    }

    private User loadUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }

    private void assertBalanced(JournalEntry entry) {
        BigDecimal sum = entry.getPostings().stream()
                .map(Posting::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (sum.compareTo(BigDecimal.ZERO) != 0) {
            throw new IllegalStateException("Posting dengesiz (Σ=" + sum + ") — entry yazılmadı");
        }
    }

    private void assertSameBusiness(Business owner, UUID businessId, String label) {
        if (owner == null || !owner.getId().equals(businessId)) {
            throw new IllegalArgumentException(label + " farklı işletmeye ait (tenant ihlali)");
        }
    }

    private InstrumentType parseType(String raw) {
        try {
            return InstrumentType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            throw new IllegalArgumentException("Geçersiz type: " + raw + " — CHECK | PROMISSORY_NOTE");
        }
    }

    private InstrumentDirection parseDirection(String raw) {
        try {
            return InstrumentDirection.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            throw new IllegalArgumentException("Geçersiz direction: " + raw + " — RECEIVED | GIVEN");
        }
    }

    private InstrumentStatus parseStatus(String raw) {
        try {
            return InstrumentStatus.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            throw new IllegalArgumentException("Geçersiz status: " + raw);
        }
    }

    private Map<String, Object> baseMeta(Instrument ins) {
        Map<String, Object> m = new HashMap<>();
        m.put("instrumentId", ins.getId().toString());
        m.put("type", ins.getType().name());
        m.put("direction", ins.getDirection().name());
        m.put("amount", ins.getAmount());
        m.put("dueDate", ins.getDueDate() != null ? ins.getDueDate().toString() : null);
        return m;
    }

    private void audit(String action, UUID userId, User user, Instrument ins,
                       String detail, Map<String, Object> meta) {
        audit(action, userId, user, ins, detail, meta, null);
    }

    private void audit(String action, UUID userId, User user, Instrument ins,
                       String detail, Map<String, Object> meta, String highlight) {
        auditLogService.recordEntityAction(action, userId,
                user != null ? user.getUsername() : "system",
                "INSTRUMENT", ins.getId(), detail,
                meta != null ? meta : baseMeta(ins), highlight);
    }

    InstrumentDto toDto(Instrument i) {
        Long daysToDue = i.getDueDate() != null
                ? ChronoUnit.DAYS.between(LocalDate.now(), i.getDueDate()) : null;
        return InstrumentDto.builder()
                .id(i.getId())
                .type(i.getType() != null ? i.getType().name() : null)
                .direction(i.getDirection() != null ? i.getDirection().name() : null)
                .amount(i.getAmount())
                .currency(i.getCurrency())
                .issuerCounterpartId(i.getIssuerCounterpart() != null ? i.getIssuerCounterpart().getId() : null)
                .issuerName(i.getIssuerCounterpart() != null ? i.getIssuerCounterpart().getName() : null)
                .ourCompanyId(i.getOurCompany() != null ? i.getOurCompany().getId() : null)
                .ourCompanyName(i.getOurCompany() != null ? i.getOurCompany().getLegalName() : null)
                .bankName(i.getBankName())
                .serialNo(i.getSerialNo())
                .issueDate(i.getIssueDate())
                .dueDate(i.getDueDate())
                .status(i.getStatus() != null ? i.getStatus().name() : null)
                .endorsedToCounterpartId(i.getEndorsedToCounterpart() != null
                        ? i.getEndorsedToCounterpart().getId() : null)
                .endorsedToName(i.getEndorsedToCounterpart() != null
                        ? i.getEndorsedToCounterpart().getName() : null)
                .endorsedAt(i.getEndorsedAt())
                .journalEntryId(i.getJournalEntryId())
                .cashedAccountId(i.getCashedAccount() != null ? i.getCashedAccount().getId() : null)
                .cashedAccountName(i.getCashedAccount() != null ? i.getCashedAccount().getName() : null)
                .cashedAt(i.getCashedAt())
                .bouncedAt(i.getBouncedAt())
                .source(i.getSource())
                .photoUrl(i.getPhotoUrl())
                .notes(i.getNotes())
                .createdAt(i.getCreatedAt())
                .daysToDue(daysToDue)
                .build();
    }
}
