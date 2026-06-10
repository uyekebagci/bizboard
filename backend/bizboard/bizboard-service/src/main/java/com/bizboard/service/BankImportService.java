package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.BankImportDtos.*;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.BankImportBatchStatus;
import com.bizboard.common.enums.BankImportLineStatus;
import com.bizboard.common.enums.JournalSourceType;
import com.bizboard.common.enums.PostingLegKind;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

/**
 * Ledger v2 (Faz B, §3.8 / §5) — banka hareketi import servisi (manuel/elle
 * satır girişi İSKELETİ). PDF auto-parser ERTELENDİ (KARAR A4).
 *
 * <p>Akış: parti aç (banka hesabı seç) → satır ekle (tarih/tutar/karşı-taraf) →
 * kategorile (karşı-taraf→kategori öğrenme/öneri) → postala (account bacağı +
 * kategori P&L bacağı, dengeli JournalEntry). Postalanan satır gün-kapanışı
 * mutabakatına girer; açıklanamayan satır FLAGGED (kaçak adayı).</p>
 *
 * <p><b>Çekirdek import'a bağımlı değil</b> — bu servis manuel girişin yerine
 * geçen bir hızlandırıcıdır (§5).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BankImportService {

    private final BankImportBatchRepository batchRepository;
    private final BankImportLineRepository lineRepository;
    private final CategoryLearningRuleRepository learningRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessRepository businessRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    // ──────────────────────────── BATCH ────────────────────────────

    @Transactional
    public BatchDto createBatch(UUID userId, UUID businessId, CreateBatchRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));
        BankAccount account = bankAccountRepository.findById(req.getAccountId())
                .orElseThrow(() -> new IllegalArgumentException("Hesap bulunamadı"));
        if (account.getBusiness() == null || !businessId.equals(account.getBusiness().getId())) {
            throw new SecurityException("Hesap bu işletmeye ait değil");
        }
        BankImportBatch b = BankImportBatch.builder()
                .business(business)
                .account(account)
                .statementDate(req.getStatementDate())
                .status(BankImportBatchStatus.OPEN)
                .createdBy(userId)
                .build();
        b = batchRepository.save(b);

        auditLogService.recordEntityAction(
                AuditAction.BANK_IMPORT_BATCH_CREATE, userId, username(userId),
                "BANK_IMPORT_BATCH", b.getId(),
                "Banka import partisi açıldı: " + account.getName(),
                Map.of("accountId", account.getId().toString()), null);
        return toBatchDto(b, List.of());
    }

    @Transactional(readOnly = true)
    public List<BatchDto> listBatches(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return batchRepository.findByBusinessIdOrderByCreatedAtDesc(businessId)
                .stream().map(b -> toBatchDto(b, null)).toList();
    }

    @Transactional(readOnly = true)
    public BatchDto getBatch(UUID userId, UUID businessId, UUID batchId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        BankImportBatch b = requireBatch(businessId, batchId);
        List<LineDto> lines = lineRepository.findByBatchId(batchId).stream()
                .map(this::toLineDto).toList();
        return toBatchDto(b, lines);
    }

    // ──────────────────────────── LINE ────────────────────────────

    @Transactional
    public LineDto addLine(UUID userId, UUID businessId, UUID batchId, AddLineRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        BankImportBatch b = requireBatch(businessId, batchId);
        if (b.getStatus() != BankImportBatchStatus.OPEN) {
            throw new IllegalStateException("Kapalı partiye satır eklenemez");
        }
        if (req.getParsedAmount() == null || req.getParsedAmount().signum() == 0) {
            throw new IllegalArgumentException("Satır tutarı sıfır olamaz");
        }
        BankImportLine line = BankImportLine.builder()
                .batch(b)
                .parsedDate(req.getParsedDate() != null ? req.getParsedDate() : b.getStatementDate())
                .parsedAmount(req.getParsedAmount())
                .parsedCounterpart(req.getParsedCounterpart())
                .rawText(req.getRawText())
                .status(BankImportLineStatus.PARSED)
                .build();

        // Öğrenme: karşı-taraf → kategori öneri.
        Category suggested = suggestCategory(businessId, req.getParsedCounterpart());
        if (suggested != null) line.setSuggestedCategory(suggested);

        line = lineRepository.save(line);
        bumpCounts(b);
        return toLineDto(line);
    }

    @Transactional
    public LineDto categorizeLine(UUID userId, UUID businessId, UUID lineId,
                                  CategorizeLineRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        BankImportLine line = requireLine(businessId, lineId);
        Category cat = categoryRepository.findById(req.getCategoryId())
                .orElseThrow(() -> new IllegalArgumentException("Kategori bulunamadı"));
        if (cat.getBusiness() == null || !businessId.equals(cat.getBusiness().getId())) {
            throw new SecurityException("Kategori bu işletmeye ait değil");
        }
        line.setConfirmedCategory(cat);
        if (line.getStatus() == BankImportLineStatus.PARSED
                || line.getStatus() == BankImportLineStatus.FLAGGED) {
            line.setStatus(BankImportLineStatus.CATEGORIZED);
        }
        line = lineRepository.save(line);

        // Öğren: karşı-taraf paterni → bu kategori (hit_count++).
        learn(businessId, line.getParsedCounterpart(), cat);
        bumpCounts(line.getBatch());
        return toLineDto(line);
    }

    /** Açıklanamayan satır = FLAGGED (kaçak adayı; gün-kapanışında görünür). */
    @Transactional
    public LineDto flagLine(UUID userId, UUID businessId, UUID lineId) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        BankImportLine line = requireLine(businessId, lineId);
        line.setStatus(BankImportLineStatus.FLAGGED);
        line = lineRepository.save(line);
        bumpCounts(line.getBatch());
        return toLineDto(line);
    }

    /**
     * Onaylı (kategorilenmiş) satırı ledger'a postala: dengeli JournalEntry +
     * account konum bacağı + kategori P&L bacağı.
     *
     * <p>Tutar işareti: + giriş → konum +, P&L gelir (PNL_INCOME); − çıkış →
     * konum −, P&L gider (PNL_EXPENSE). Σ posting = 0 (invariant).</p>
     */
    @Transactional
    public LineDto postLine(UUID userId, UUID businessId, UUID lineId) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        BankImportLine line = requireLine(businessId, lineId);
        if (line.getStatus() == BankImportLineStatus.POSTED) {
            return toLineDto(line); // idempotent
        }
        if (line.getConfirmedCategory() == null) {
            throw new IllegalStateException("Postalamadan önce kategori onaylanmalı");
        }
        BankImportBatch b = line.getBatch();
        BankAccount account = b.getAccount();
        BigDecimal amount = line.getParsedAmount();
        boolean inflow = amount.signum() > 0;

        JournalEntry entry = JournalEntry.builder()
                .business(b.getBusiness())
                .entryDate(line.getParsedDate() != null ? line.getParsedDate() : LocalDate.now())
                .sourceType(JournalSourceType.BANK_IMPORT)
                .sourceRefId(line.getId())
                .description("Banka import: " + (line.getParsedCounterpart() != null
                        ? line.getParsedCounterpart() : "satır"))
                .createdBy(userRepository.findById(userId).orElse(null))
                .build();

        List<Posting> postings = new ArrayList<>();
        // Konum bacağı (account) = işaretli tutar.
        postings.add(Posting.builder()
                .journalEntry(entry).account(account).amount(amount)
                .legKind(PostingLegKind.LOCATION_MOVE).build());
        // Karşı P&L bacağı (account NULL) = ters işaret + kategori.
        PostingLegKind pnl = inflow ? PostingLegKind.PNL_INCOME : PostingLegKind.PNL_EXPENSE;
        postings.add(Posting.builder()
                .journalEntry(entry).account(null).amount(amount.negate())
                .legKind(pnl).category(line.getConfirmedCategory()).build());
        entry.setPostings(postings);
        entry = journalEntryRepository.save(entry);

        line.setStatus(BankImportLineStatus.POSTED);
        line.setJournalEntryId(entry.getId());
        line = lineRepository.save(line);
        bumpCounts(b);

        auditLogService.recordEntityAction(
                AuditAction.BANK_IMPORT_LINE_POSTED, userId, username(userId),
                "BANK_IMPORT_LINE", line.getId(),
                "Banka satırı postalandı: " + amount + " → " + account.getName(),
                Map.of("entryId", entry.getId().toString(), "amount", amount), null);
        return toLineDto(line);
    }

    // ──────────────────────── ÖĞRENME (counterpart→category) ────────────────────────

    private Category suggestCategory(UUID businessId, String counterpart) {
        String pattern = normalize(counterpart);
        if (pattern == null) return null;
        return learningRepository.findByBusinessIdAndCounterpartPattern(businessId, pattern)
                .map(CategoryLearningRule::getCategory).orElse(null);
    }

    private void learn(UUID businessId, String counterpart, Category category) {
        String pattern = normalize(counterpart);
        if (pattern == null) return;
        Optional<CategoryLearningRule> existing =
                learningRepository.findByBusinessIdAndCounterpartPattern(businessId, pattern);
        if (existing.isPresent()) {
            CategoryLearningRule r = existing.get();
            // Kategori değiştiyse yeni kategoriye geç + sayacı resetleme (1'den say).
            if (r.getCategory() == null || !r.getCategory().getId().equals(category.getId())) {
                r.setCategory(category);
                r.setHitCount(1);
            } else {
                r.setHitCount(r.getHitCount() + 1);
            }
            learningRepository.save(r);
        } else {
            learningRepository.save(CategoryLearningRule.builder()
                    .business(businessRepository.findById(businessId).orElseThrow())
                    .counterpartPattern(pattern)
                    .category(category)
                    .hitCount(1)
                    .build());
        }
    }

    private static String normalize(String s) {
        if (s == null) return null;
        String t = s.trim().toLowerCase(Locale.ROOT);
        return t.isEmpty() ? null : t;
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    private void bumpCounts(BankImportBatch b) {
        List<BankImportLine> lines = lineRepository.findByBatchId(b.getId());
        int total = lines.size();
        int matched = (int) lines.stream()
                .filter(l -> l.getStatus() == BankImportLineStatus.POSTED
                        || l.getStatus() == BankImportLineStatus.CATEGORIZED).count();
        int unexplained = (int) lines.stream()
                .filter(l -> l.getStatus() == BankImportLineStatus.FLAGGED).count();
        b.setLineCount(total);
        b.setMatchedCount(matched);
        b.setUnexplainedCount(unexplained);
        batchRepository.save(b);
    }

    private BankImportBatch requireBatch(UUID businessId, UUID batchId) {
        BankImportBatch b = batchRepository.findById(batchId)
                .orElseThrow(() -> new IllegalArgumentException("Parti bulunamadı"));
        if (b.getBusiness() == null || !businessId.equals(b.getBusiness().getId())) {
            throw new SecurityException("Parti bu işletmeye ait değil");
        }
        return b;
    }

    private BankImportLine requireLine(UUID businessId, UUID lineId) {
        BankImportLine l = lineRepository.findById(lineId)
                .orElseThrow(() -> new IllegalArgumentException("Satır bulunamadı"));
        if (l.getBatch() == null || l.getBatch().getBusiness() == null
                || !businessId.equals(l.getBatch().getBusiness().getId())) {
            throw new SecurityException("Satır bu işletmeye ait değil");
        }
        return l;
    }

    private String username(UUID userId) {
        return userRepository.findById(userId).map(User::getUsername).orElse("system");
    }

    private BatchDto toBatchDto(BankImportBatch b, List<LineDto> lines) {
        return BatchDto.builder()
                .id(b.getId())
                .accountId(b.getAccount() != null ? b.getAccount().getId() : null)
                .accountName(b.getAccount() != null ? b.getAccount().getName() : null)
                .statementDate(b.getStatementDate())
                .status(b.getStatus() != null ? b.getStatus().name() : null)
                .lineCount(b.getLineCount())
                .matchedCount(b.getMatchedCount())
                .unexplainedCount(b.getUnexplainedCount())
                .createdAt(b.getCreatedAt())
                .lines(lines)
                .build();
    }

    private LineDto toLineDto(BankImportLine l) {
        return LineDto.builder()
                .id(l.getId())
                .parsedDate(l.getParsedDate())
                .parsedAmount(l.getParsedAmount())
                .parsedCounterpart(l.getParsedCounterpart())
                .rawText(l.getRawText())
                .suggestedCategoryId(l.getSuggestedCategory() != null
                        ? l.getSuggestedCategory().getId() : null)
                .suggestedCategoryName(l.getSuggestedCategory() != null
                        ? l.getSuggestedCategory().getName() : null)
                .confirmedCategoryId(l.getConfirmedCategory() != null
                        ? l.getConfirmedCategory().getId() : null)
                .status(l.getStatus() != null ? l.getStatus().name() : null)
                .journalEntryId(l.getJournalEntryId())
                .build();
    }
}
