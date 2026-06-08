package com.bizboard.service.report;

import java.util.ArrayList;
import java.util.List;

/**
 * WP 4c75e95c: Export-agnostik rapor tablosu modeli.
 *
 * <p>Her rapor verisini başlık + opsiyonel alt başlık + sütun başlıkları +
 * satırlar olarak normalize eder; {@link PdfExporter}/{@link ExcelExporter}
 * bunu kendi formatına dökerek ortak header/footer/brand uygular. Birden çok
 * bölüm (ör. Aging: Alacaklar + Verecekler) için {@link #addSection} kullanılır.</p>
 */
public class ReportTable {

    public final String title;       // rapor adı (ör. "Gelir-Gider Raporu")
    public final String period;      // dönem etiketi (ör. "01.01.2026 – 31.01.2026")
    public final List<Section> sections = new ArrayList<>();

    public ReportTable(String title, String period) {
        this.title = title;
        this.period = period;
    }

    public Section addSection(String heading, List<String> columns) {
        Section s = new Section(heading, columns);
        sections.add(s);
        return s;
    }

    public static class Section {
        public final String heading;           // bölüm başlığı (opsiyonel, null olabilir)
        public final List<String> columns;     // sütun başlıkları
        public final List<List<String>> rows = new ArrayList<>();
        /** Son satır toplam/özet satırı mı (kalın gösterim). Index listesi. */
        public final List<Integer> boldRowIndexes = new ArrayList<>();

        Section(String heading, List<String> columns) {
            this.heading = heading;
            this.columns = columns;
        }

        public void addRow(String... cells) {
            rows.add(List.of(cells));
        }

        public void addBoldRow(String... cells) {
            boldRowIndexes.add(rows.size());
            rows.add(List.of(cells));
        }
    }
}
