package com.bizboard.service.report;

import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * WP 4c75e95c: {@link ReportTable} → PDF (OpenPDF, LGPL).
 *
 * <p>Ortak brand: üstte ÇATI başlık + rapor adı + dönem; her bölüm tablo;
 * altta üretim zamanı. Tüm raporlar aynı görünümü paylaşır.</p>
 */
@Slf4j
@Component
public class PdfExporter {

    private static final Color BRAND = new Color(0x4c, 0x6e, 0xf5);
    private static final Color HEADER_BG = new Color(0x34, 0x3a, 0x40);
    private static final Color ZEBRA = new Color(0xf1, 0xf3, 0xf5);

    private static final Font H1 = new Font(Font.HELVETICA, 18, Font.BOLD, BRAND);
    private static final Font H2 = new Font(Font.HELVETICA, 12, Font.BOLD, Color.DARK_GRAY);
    private static final Font META = new Font(Font.HELVETICA, 9, Font.NORMAL, Color.GRAY);
    private static final Font TH = new Font(Font.HELVETICA, 9, Font.BOLD, Color.WHITE);
    private static final Font TD = new Font(Font.HELVETICA, 9, Font.NORMAL, Color.BLACK);
    private static final Font TD_BOLD = new Font(Font.HELVETICA, 9, Font.BOLD, Color.BLACK);

    public byte[] export(ReportTable table) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 36, 36, 48, 36);
        try {
            PdfWriter.getInstance(doc, out);
            doc.open();

            // ── Brand header ──
            Paragraph brand = new Paragraph("ÇATI", H1);
            doc.add(brand);
            doc.add(new Paragraph(table.title, H2));
            if (table.period != null && !table.period.isBlank()) {
                doc.add(new Paragraph(table.period, META));
            }
            doc.add(Chunk.NEWLINE);

            // ── Sections ──
            for (ReportTable.Section s : table.sections) {
                if (s.heading != null && !s.heading.isBlank()) {
                    Paragraph h = new Paragraph(s.heading, H2);
                    h.setSpacingBefore(8f);
                    h.setSpacingAfter(4f);
                    doc.add(h);
                }
                doc.add(buildTable(s));
                doc.add(Chunk.NEWLINE);
            }

            // ── Footer ──
            String when = LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"));
            Paragraph footer = new Paragraph("Oluşturulma: " + when + " · ÇATI Raporlama", META);
            footer.setSpacingBefore(12f);
            doc.add(footer);

            doc.close();
            return out.toByteArray();
        } catch (Exception e) {
            log.error("[report-pdf] export hatası: {}", e.getMessage(), e);
            throw new IllegalStateException("PDF oluşturulamadı", e);
        }
    }

    private PdfPTable buildTable(ReportTable.Section s) throws DocumentException {
        PdfPTable t = new PdfPTable(s.columns.size());
        t.setWidthPercentage(100f);
        t.setHeaderRows(1);

        for (String col : s.columns) {
            PdfPCell c = new PdfPCell(new Phrase(col, TH));
            c.setBackgroundColor(HEADER_BG);
            c.setPadding(5f);
            c.setBorderColor(Color.LIGHT_GRAY);
            t.addCell(c);
        }

        for (int i = 0; i < s.rows.size(); i++) {
            List<String> row = s.rows.get(i);
            boolean bold = s.boldRowIndexes.contains(i);
            boolean zebra = (i % 2 == 1) && !bold;
            for (int col = 0; col < row.size(); col++) {
                PdfPCell c = new PdfPCell(new Phrase(row.get(col), bold ? TD_BOLD : TD));
                c.setPadding(4f);
                c.setBorderColor(Color.LIGHT_GRAY);
                if (bold) c.setBackgroundColor(ZEBRA);
                else if (zebra) c.setBackgroundColor(new Color(0xfa, 0xfb, 0xfc));
                // Sayısal sütunları (ilk sütun hariç) sağa hizala.
                if (col > 0) c.setHorizontalAlignment(Element.ALIGN_RIGHT);
                t.addCell(c);
            }
        }
        return t;
    }
}
