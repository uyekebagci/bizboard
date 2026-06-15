package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.BankImportDtos.*;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.BankImportBatchStatus;
import com.bizboard.common.enums.BankImportLineStatus;
import com.bizboard.common.enums.JournalSourceType;
import com.bizboard.common.enums.PostingLegKind;
import com.bizboard.repository.*;
import com.bizboard.service.pdf.BankStatementPdfParser;
import com.bizboard.service.pdf.ParsedStatement;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
    private final BankStatementPdfParser pdfParser;

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

    // ──────────────────────────── PDF PARSE (persist YOK) ────────────────────────────

    /**
     * Banka ekstresi PDF'ini parse eder ve satırları DB'ye YAZMADAN döndürür.
     * Kullanıcı önizleme ekranında bu satırları görür/düzenler, sonra
     * seçtiklerini {@link #bulkAddLines} ile partiye ekler (PARSED).
     *
     * <p>Açılış bakiyesi ("DEVREDEN BAKİYE") hareket değildir, ayrı raporlanır.
     * Her satıra parti-içi dedupe hash'i + bu hash zaten parti içinde var mı
     * ({@code isDuplicate}) bilgisi eklenir; bakiye zinciri tutmayan satır
     * {@code chainOk=false} olarak işaretlenir (eklenince FLAGGED gelir).</p>
     */
    @Transactional(readOnly = true)
    public ParsedPdfResult parsePdf(UUID userId, UUID businessId, byte[] pdfBytes) {
        accessGuard.assertCanReadBusiness(userId, businessId);

        ParsedStatement parsed = pdfParser.parse(pdfBytes);

        // En son açık partinin dedupe hash'lerine bakmıyoruz; her parti kendi
        // içinde tekil. Önizleme dedupe'i tüm açık-partiler yerine PDF satırları
        // arasında ve isteğe bağlı bir batchId verilmediği için parti-içi
        // kontrol bulkAddLines'da yapılır. Burada PDF içindeki tekrarları
        // (aynı PDF'te dönen satır) işaretleriz.
        Set<String> seenInPdf = new HashSet<>();
        List<ParsedPdfLine> lines = new ArrayList<>();
        int flagged = 0, duplicate = 0;

        for (ParsedStatement.ParsedMovement mv : parsed.getMovements()) {
            if (mv.getAmount() == null || mv.getAmount().signum() == 0) {
                continue; // sıfır tutar = hareket değil, atla
            }
            String hash = dedupeHash(mv.getDate(), mv.getAmount(),
                    mv.getBalance(), mv.getRawDescription());
            boolean dup = !seenInPdf.add(hash);
            if (dup) duplicate++;
            if (!mv.isChainOk()) flagged++;

            lines.add(ParsedPdfLine.builder()
                    .parsedDate(mv.getDate())
                    .channel(mv.getChannel())
                    .rawText(mv.getRawDescription())
                    .parsedCounterpart(mv.getCounterpartyName())
                    .parsedAmount(mv.getAmount())
                    .direction(mv.getDirection() != null ? mv.getDirection().name() : null)
                    .parsedBalance(mv.getBalance())
                    .chainOk(mv.isChainOk())
                    .dedupeHash(hash)
                    .duplicate(dup)
                    .build());
        }

        return ParsedPdfResult.builder()
                .openingBalance(parsed.getOpeningBalance())
                .parsedCount(lines.size())
                .flaggedCount(flagged)
                .duplicateCount(duplicate)
                .chainConsistent(parsed.isChainConsistent())
                .lines(lines)
                .build();
    }

    // ──────────────────────────── SEÇİLEN SATIRLARI EKLE ────────────────────────────

    /**
     * Önizlemeden seçilen satırları partiye toplu (veya tek) ekler. Her satır
     * {@link BankImportLine} PARSED olur; {@code chainOk=false} olan FLAGGED
     * gelir. Parti-içi dedupe korunur (mevcut hash mantığı): aynı hash zaten
     * partide varsa satır atlanır. Eklenen satır SADECE PARSED — ledger'a /
     * kasaya GİRMEZ (kategorile→postala onayı aynen kalır).
     */
    @Transactional
    public BulkAddResult bulkAddLines(UUID userId, UUID businessId, UUID batchId,
                                      BulkAddLinesRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        BankImportBatch b = requireBatch(businessId, batchId);
        if (b.getStatus() != BankImportBatchStatus.OPEN) {
            throw new IllegalStateException("Kapalı partiye satır eklenemez");
        }
        if (req.getLines() == null || req.getLines().isEmpty()) {
            throw new IllegalArgumentException("Eklenecek satır yok");
        }

        Set<String> existingHashes =
                new HashSet<>(lineRepository.findDedupeHashesByBatchId(batchId));
        int added = 0, skipped = 0, flagged = 0;

        for (BulkAddLineItem item : req.getLines()) {
            if (item.getParsedAmount() == null || item.getParsedAmount().signum() == 0) {
                continue; // sıfır tutar = hareket değil, atla
            }
            // Hash istemciden gelebilir (parse'tan); yoksa/yeniden güvenmek için
            // sunucuda hesapla (düzenlenmiş satırlar için doğru tekillik).
            String hash = (item.getDedupeHash() != null && !item.getDedupeHash().isBlank())
                    ? item.getDedupeHash()
                    : dedupeHash(item.getParsedDate(), item.getParsedAmount(),
                            item.getParsedBalance(), item.getRawText());
            if (existingHashes.contains(hash)) {
                skipped++;
                continue;
            }
            existingHashes.add(hash);

            boolean chainOk = item.getChainOk() == null || item.getChainOk();
            BankImportLine line = BankImportLine.builder()
                    .batch(b)
                    .parsedDate(item.getParsedDate() != null
                            ? item.getParsedDate() : b.getStatementDate())
                    .parsedAmount(item.getParsedAmount())
                    .parsedCounterpart(item.getParsedCounterpart())
                    .parsedBalance(item.getParsedBalance())
                    .rawText(item.getRawText())
                    .dedupeHash(hash)
                    // Bakiye zinciri tutmayan satır → FLAGGED (parse şüphesi).
                    .status(chainOk ? BankImportLineStatus.PARSED : BankImportLineStatus.FLAGGED)
                    .build();
            if (!chainOk) flagged++;

            Category suggested = suggestCategory(businessId, item.getParsedCounterpart());
            if (suggested != null) line.setSuggestedCategory(suggested);

            lineRepository.save(line);
            added++;
        }
        bumpCounts(b);

        auditLogService.recordEntityAction(
                AuditAction.BANK_IMPORT_PDF, userId, username(userId),
                "BANK_IMPORT_BATCH", b.getId(),
                "Banka import satır ekleme: " + added + " satır eklendi"
                        + (skipped > 0 ? " (" + skipped + " çift atlandı)" : ""),
                Map.of("added", added, "skipped", skipped, "flagged", flagged), null);

        List<LineDto> lines = lineRepository.findByBatchId(batchId).stream()
                .map(this::toLineDto).toList();
        return BulkAddResult.builder()
                .addedCount(added)
                .skippedDuplicateCount(skipped)
                .flaggedCount(flagged)
                .batch(toBatchDto(b, lines))
                .build();
    }

    /** Dedupe anahtarı: tarih|tutar|bakiye|desc → SHA-256 (parti içi tekillik). */
    private String dedupeHash(LocalDate date, BigDecimal amount,
                              BigDecimal balance, String description) {
        String raw = (date != null ? date.toString() : "")
                + "|" + (amount != null ? amount.toPlainString() : "")
                + "|" + (balance != null ? balance.toPlainString() : "")
                + "|" + (description != null ? description : "");
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte x : digest) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) {
            // SHA-256 her JVM'de var; pratikte buraya düşmez.
            return Integer.toHexString(raw.hashCode());
        }
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
                .parsedBalance(l.getParsedBalance())
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
