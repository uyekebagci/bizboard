package com.bizboard.service.report;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * WP 4c75e95c: {@link ReportTable} → Excel (.xlsx, Apache POI).
 *
 * <p>Tek çalışma sayfası: brand başlık + dönem + her bölüm (başlık, sütun
 * başlıkları, satırlar) + footer. PDF ile aynı veri/sıra.</p>
 */
@Slf4j
@Component
public class ExcelExporter {

    public byte[] export(ReportTable table) {
        try (XSSFWorkbook wb = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            Sheet sheet = wb.createSheet("Rapor");
            Styles st = new Styles(wb);
            int r = 0;

            // ── Brand + başlık ──
            r = writeLine(sheet, r, "ÇATI", st.brand);
            r = writeLine(sheet, r, table.title, st.h2);
            if (table.period != null && !table.period.isBlank()) {
                r = writeLine(sheet, r, table.period, st.meta);
            }
            r++; // boş satır

            int maxCols = 1;
            for (ReportTable.Section s : table.sections) {
                if (s.heading != null && !s.heading.isBlank()) {
                    r = writeLine(sheet, r, s.heading, st.h2);
                }
                // sütun başlıkları
                Row head = sheet.createRow(r++);
                for (int c = 0; c < s.columns.size(); c++) {
                    Cell cell = head.createCell(c);
                    cell.setCellValue(s.columns.get(c));
                    cell.setCellStyle(st.th);
                }
                maxCols = Math.max(maxCols, s.columns.size());
                // satırlar
                for (int i = 0; i < s.rows.size(); i++) {
                    List<String> row = s.rows.get(i);
                    boolean bold = s.boldRowIndexes.contains(i);
                    Row xr = sheet.createRow(r++);
                    for (int c = 0; c < row.size(); c++) {
                        Cell cell = xr.createCell(c);
                        cell.setCellValue(row.get(c));
                        cell.setCellStyle(bold ? st.tdBold : st.td);
                    }
                }
                r++; // bölümler arası boşluk
            }

            // ── Footer ──
            String when = LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"));
            writeLine(sheet, r, "Oluşturulma: " + when + " · ÇATI Raporlama", st.meta);

            for (int c = 0; c < maxCols; c++) sheet.autoSizeColumn(c);

            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            log.error("[report-xlsx] export hatası: {}", e.getMessage(), e);
            throw new IllegalStateException("Excel oluşturulamadı", e);
        }
    }

    private int writeLine(Sheet sheet, int rowIdx, String text, CellStyle style) {
        Row row = sheet.createRow(rowIdx);
        Cell cell = row.createCell(0);
        cell.setCellValue(text);
        cell.setCellStyle(style);
        sheet.addMergedRegion(new CellRangeAddress(rowIdx, rowIdx, 0, 4));
        return rowIdx + 1;
    }

    /** Ortak hücre stilleri. */
    private static class Styles {
        final CellStyle brand, h2, meta, th, td, tdBold;

        Styles(Workbook wb) {
            Font fBrand = wb.createFont();
            fBrand.setBold(true); fBrand.setFontHeightInPoints((short) 16);
            fBrand.setColor(IndexedColors.BLUE.getIndex());
            brand = wb.createCellStyle(); brand.setFont(fBrand);

            Font fH2 = wb.createFont(); fH2.setBold(true); fH2.setFontHeightInPoints((short) 11);
            h2 = wb.createCellStyle(); h2.setFont(fH2);

            Font fMeta = wb.createFont(); fMeta.setFontHeightInPoints((short) 9);
            fMeta.setColor(IndexedColors.GREY_50_PERCENT.getIndex());
            meta = wb.createCellStyle(); meta.setFont(fMeta);

            Font fTh = wb.createFont(); fTh.setBold(true); fTh.setColor(IndexedColors.WHITE.getIndex());
            th = wb.createCellStyle(); th.setFont(fTh);
            th.setFillForegroundColor(IndexedColors.GREY_50_PERCENT.getIndex());
            th.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            border(th);

            td = wb.createCellStyle(); border(td);

            Font fBold = wb.createFont(); fBold.setBold(true);
            tdBold = wb.createCellStyle(); tdBold.setFont(fBold); border(tdBold);
        }

        private static void border(CellStyle s) {
            s.setBorderBottom(BorderStyle.THIN);
            s.setBorderTop(BorderStyle.THIN);
            s.setBorderLeft(BorderStyle.THIN);
            s.setBorderRight(BorderStyle.THIN);
        }
    }
}
