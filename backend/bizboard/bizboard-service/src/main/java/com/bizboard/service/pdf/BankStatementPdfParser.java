package com.bizboard.service.pdf;

import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Türk banka hesap ekstresi PDF parser'ı (Apache PDFBox).
 *
 * <p>Strateji (DGR/Enpara tarzı ekstreler): PDFBox metni yatay-dikey konuma
 * göre çıkarır. Çok-satırlı açıklamalar şu düzendedir:</p>
 *
 * <pre>
 *   DESC  (girintili, açıklamanın sarkan ilk satırı)
 *   ANCHOR (sol marj: TARİH KANAL ... TUTAR BAKİYE)
 *   DESC  (girintili, açıklamanın devamı)
 * </pre>
 *
 * <p>Bu yüzden satırları Y-konumuna göre görsel satırlara kümeleyip, her
 * <b>ANCHOR</b> (tarih + işaretli tutar + bakiye taşıyan) satırı bir harekete
 * çevirir; her <b>DESC</b> (açıklama) satırını dikey olarak <i>en yakın</i>
 * ANCHOR'a iliştiririz. Sonuç yürüyen bakiye zinciriyle DOĞRULANIR
 * (önceki_bakiye + tutar ≈ yeni_bakiye, kuruş toleransı).</p>
 *
 * <p>"DEVREDEN BAKİYE" açılış bakiyesi olarak ayrılır (hareket değildir).</p>
 *
 * <p>Konum çıkarma + kümeleme {@link StatementLineExtractor}'da; bu sınıf
 * gruplama + doğrulama + alan çıkarımı yapar.</p>
 */
@Slf4j
@Component
public class BankStatementPdfParser {

    /** Kuruş toleransı: yürüyen bakiye karşılaştırması için. */
    private static final BigDecimal TOLERANCE = new BigDecimal("0.01");

    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /** Satır başı tarih: 15/06/2026 */
    private static final Pattern DATE_AT_START =
            Pattern.compile("^(\\d{2}/\\d{2}/\\d{4})\\b");

    /**
     * Satır sonunda işaretli tutar + bakiye çifti.
     * Sayı formatı: binlik ',' ondalık '.' → -247,000.00  1,752,364.11
     */
    private static final Pattern AMOUNT_BALANCE_TAIL = Pattern.compile(
            "(-?[\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s*$");

    /** Tek sayı (açılış bakiyesi gibi). */
    private static final Pattern SINGLE_NUMBER =
            Pattern.compile("([\\d,]+\\.\\d{2})");

    /** Karşı-taraf: "Alıcı : <ad>" / "Gönderen: <ad>" → Sorgu No'ya kadar. */
    private static final Pattern COUNTERPARTY = Pattern.compile(
            "(?:Alıcı|Gönderen)\\s*:\\s*(.+?)(?:\\s+Sorgu\\s*No|$)",
            Pattern.CASE_INSENSITIVE);

    private static final List<String> CHANNELS =
            List.of("ŞB", "MB", "İNT", "ÇM", "GO");

    /** Açılış bakiyesi satırı. */
    private static final String OPENING_MARKER = "DEVREDEN BAKİYE";

    /** Hareket OLMAYAN, atlanacak başlık/footer satır önekleri. */
    private static final List<String> SKIP_PREFIXES = List.of(
            "Hesap Hareketleri", "İşlem Tarihi", "Bu doküman", "uyuşmaması",
            "*ŞB", "Sayfa:", "Iban", "Unvan", "Hesap Adı", "Vkn", "Şube",
            "Tarih Aralığı", "Hareket Tipi", "Minimum Tutar");

    /**
     * PDF byte'larını parse et.
     *
     * @param pdfBytes ham PDF içeriği
     * @return açılış bakiyesi + hareketler + zincir doğrulama sonucu
     * @throws StatementParseException PDF okunamaz/içerik beklenmedikse
     */
    public ParsedStatement parse(byte[] pdfBytes) {
        if (pdfBytes == null || pdfBytes.length == 0) {
            throw new StatementParseException("PDF dosyası boş");
        }
        List<StatementLineExtractor.VisualLine> visualLines;
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            if (doc.isEncrypted()) {
                throw new StatementParseException("Şifreli PDF desteklenmiyor");
            }
            StatementLineExtractor extractor = new StatementLineExtractor();
            extractor.setSortByPosition(true);
            extractor.getText(doc); // writeString tetiklenir → satırlar dolar
            visualLines = extractor.getVisualLines();
        } catch (IOException e) {
            throw new StatementParseException("PDF okunamadı: " + e.getMessage(), e);
        }
        return buildStatement(visualLines);
    }

    // ──────────────────────── GRUPLAMA + DOĞRULAMA ────────────────────────

    private ParsedStatement buildStatement(List<StatementLineExtractor.VisualLine> lines) {
        BigDecimal opening = null;
        List<Anchor> anchors = new ArrayList<>();
        List<DescLine> descs = new ArrayList<>();

        for (StatementLineExtractor.VisualLine vl : lines) {
            String text = vl.text().trim();
            if (text.isEmpty()) continue;

            if (text.startsWith(OPENING_MARKER)) {
                opening = parseOpening(text);
                continue;
            }
            if (isSkippable(text)) continue;

            Matcher tail = AMOUNT_BALANCE_TAIL.matcher(text);
            Matcher date = DATE_AT_START.matcher(text);
            boolean hasDate = date.find();
            boolean hasTail = tail.find();

            if (hasDate && hasTail) {
                anchors.add(toAnchor(vl.y(), text, date, tail));
            } else {
                // Açıklama (girintili sarkan) satır.
                descs.add(new DescLine(vl.y(), text));
            }
        }

        attachDescriptions(anchors, descs);
        return assemble(opening, anchors);
    }

    /** Açılış bakiyesi satırı atlanmalı olanlardan değil; ama hareket de değil. */
    private boolean isSkippable(String text) {
        for (String p : SKIP_PREFIXES) {
            if (text.startsWith(p)) return true;
        }
        return false;
    }

    private BigDecimal parseOpening(String text) {
        Matcher m = SINGLE_NUMBER.matcher(text);
        return m.find() ? toDecimal(m.group(1)) : null;
    }

    private Anchor toAnchor(float y, String text, Matcher date, Matcher tail) {
        String dateStr = date.group(1);
        BigDecimal amount = toDecimal(tail.group(1));
        BigDecimal balance = toDecimal(tail.group(2));
        // Tarih ile tutar arasındaki orta metin (tek-satırlık açıklama + kanal).
        String mid = text.substring(date.end(), tail.start()).trim();
        String channel = null;
        for (String ch : CHANNELS) {
            if (mid.equals(ch) || mid.startsWith(ch + " ")) {
                channel = ch;
                mid = mid.substring(ch.length()).trim();
                break;
            }
        }
        return new Anchor(y, dateStr, channel, amount, balance, mid);
    }

    /** Her açıklama satırını dikey olarak EN YAKIN anchor'a iliştir. */
    private void attachDescriptions(List<Anchor> anchors, List<DescLine> descs) {
        if (anchors.isEmpty()) return;
        for (DescLine d : descs) {
            int best = 0;
            float bestDist = Float.MAX_VALUE;
            for (int i = 0; i < anchors.size(); i++) {
                float dist = Math.abs(anchors.get(i).y - d.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = i;
                }
            }
            anchors.get(best).descFragments.add(d);
        }
    }

    private ParsedStatement assemble(BigDecimal opening, List<Anchor> anchors) {
        List<ParsedStatement.ParsedMovement> movements = new ArrayList<>();
        BigDecimal prevBalance = opening;
        int inconsistent = 0;

        for (Anchor a : anchors) {
            String description = a.buildDescription();
            String counterparty = extractCounterparty(description);
            ParsedStatement.Direction dir = a.amount.signum() >= 0
                    ? ParsedStatement.Direction.INCOME
                    : ParsedStatement.Direction.EXPENSE;

            boolean chainOk = true;
            if (prevBalance != null) {
                BigDecimal expected = prevBalance.add(a.amount);
                chainOk = expected.subtract(a.balance).abs().compareTo(TOLERANCE) <= 0;
            }
            if (!chainOk) inconsistent++;

            movements.add(ParsedStatement.ParsedMovement.builder()
                    .date(parseDate(a.dateStr))
                    .channel(a.channel)
                    .rawDescription(description)
                    .counterpartyName(counterparty)
                    .amount(a.amount)
                    .direction(dir)
                    .balance(a.balance)
                    .chainOk(chainOk)
                    .build());
            prevBalance = a.balance;
        }

        return ParsedStatement.builder()
                .openingBalance(opening)
                .movements(movements)
                .chainConsistent(inconsistent == 0)
                .inconsistentCount(inconsistent)
                .build();
    }

    // ──────────────────────────── ALAN ÇIKARIMI ────────────────────────────

    private String extractCounterparty(String description) {
        if (description == null) return null;
        Matcher m = COUNTERPARTY.matcher(description);
        if (m.find()) {
            String name = m.group(1).trim();
            return name.isEmpty() ? null : name;
        }
        return null;
    }

    private LocalDate parseDate(String dateStr) {
        try {
            return LocalDate.parse(dateStr, DATE_FMT);
        } catch (Exception e) {
            log.warn("Tarih parse edilemedi: {}", dateStr);
            return null;
        }
    }

    private static BigDecimal toDecimal(String s) {
        // Binlik ',' kaldır, ondalık '.' kalsın: -247,000.00 → -247000.00
        return new BigDecimal(s.replace(",", ""));
    }

    // ──────────────────────────── İÇ MODELLER ────────────────────────────

    /** Tarih + tutar + bakiye taşıyan satır (bir hareketin çekirdeği). */
    private static final class Anchor {
        final float y;
        final String dateStr;
        final String channel;
        final BigDecimal amount;
        final BigDecimal balance;
        final String inlineDesc;
        final List<DescLine> descFragments = new ArrayList<>();

        Anchor(float y, String dateStr, String channel, BigDecimal amount,
               BigDecimal balance, String inlineDesc) {
            this.y = y;
            this.dateStr = dateStr;
            this.channel = channel;
            this.amount = amount;
            this.balance = balance;
            this.inlineDesc = inlineDesc;
        }

        /** Açıklamayı dikey sıraya göre birleştir: üst-fragmanlar → inline → alt. */
        String buildDescription() {
            descFragments.sort((a, b) -> Float.compare(a.y, b.y));
            StringBuilder sb = new StringBuilder();
            for (DescLine d : descFragments) {
                if (d.y < y) appendPart(sb, d.text);
            }
            if (inlineDesc != null && !inlineDesc.isEmpty()) appendPart(sb, inlineDesc);
            for (DescLine d : descFragments) {
                if (d.y >= y) appendPart(sb, d.text);
            }
            return sb.toString().trim();
        }

        private static void appendPart(StringBuilder sb, String part) {
            if (part == null || part.isBlank()) return;
            if (sb.length() > 0) sb.append(' ');
            sb.append(part.trim());
        }
    }

    /** Girintili açıklama satırı (bir anchor'a iliştirilecek). */
    private record DescLine(float y, String text) {}

    /**
     * PDFBox metnini Y-konumuna göre görsel satırlara kümeleyen stripper.
     * {@code writeString} her metin parçasını verir; satır başı Y'sine göre
     * (yuvarlanmış) gruplarız ki sarkan açıklamalar ayrı satır kalsın.
     */
    static final class StatementLineExtractor extends PDFTextStripper {

        /** Aynı satır kabul edilen Y toleransı (punto yüksekliği altı). */
        private static final float Y_TOLERANCE = 3.0f;

        private final Map<Integer, LineBucket> buckets = new LinkedHashMap<>();

        StatementLineExtractor() throws IOException {
            super();
        }

        @Override
        protected void writeString(String text, List<TextPosition> positions) {
            if (positions == null || positions.isEmpty()) return;
            float y = positions.get(0).getYDirAdj();
            int key = Math.round(y / Y_TOLERANCE);
            buckets.computeIfAbsent(key, k -> new LineBucket(y))
                    .append(positions);
        }

        List<VisualLine> getVisualLines() {
            List<VisualLine> out = new ArrayList<>();
            buckets.values().stream()
                    .sorted((a, b) -> Float.compare(a.y, b.y))
                    .forEach(b -> out.add(new VisualLine(b.y, b.render())));
            return out;
        }

        /** Bir görsel satırın parçalarını x-sırasıyla biriktirir. */
        private static final class LineBucket {
            final float y;
            final List<TextPosition> parts = new ArrayList<>();

            LineBucket(float y) {
                this.y = y;
            }

            void append(List<TextPosition> positions) {
                parts.addAll(positions);
            }

            String render() {
                parts.sort((a, b) -> Float.compare(a.getXDirAdj(), b.getXDirAdj()));
                StringBuilder sb = new StringBuilder();
                float prevEnd = -1;
                for (TextPosition tp : parts) {
                    float x = tp.getXDirAdj();
                    if (prevEnd >= 0 && (x - prevEnd) > (tp.getWidthOfSpace() * 0.3f)
                            && sb.length() > 0 && sb.charAt(sb.length() - 1) != ' ') {
                        sb.append(' ');
                    }
                    sb.append(tp.getUnicode());
                    prevEnd = x + tp.getWidth();
                }
                return sb.toString();
            }
        }

        record VisualLine(float y, String text) {}
    }
}
