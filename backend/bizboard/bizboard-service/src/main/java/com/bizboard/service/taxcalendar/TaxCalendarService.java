package com.bizboard.service.taxcalendar;

import com.bizboard.common.dto.TaxDeadlineDto;
import com.bizboard.common.entity.TaxDeadlineRule;
import com.bizboard.common.enums.TaxObligationType;
import com.bizboard.repository.TaxDeadlineRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Vergi Takvimi Modülü — tekrarlayan kurallardan somut son tarihleri üretir.
 *
 * <p>GİB vergi takvimi yıl bazlı tekrar eder. Bu servis {@link TaxDeadlineRule}
 * kurallarını alır ve verilen {@code [from, to]} aralığına düşen tüm son tarihleri
 * ({@link TaxDeadlineDto}) hesaplar. Hiçbir yıllık seed gerekmez — kurallar her
 * yıla uygulanır.</p>
 *
 * <p>Kural anlamları için bkz. {@link TaxDeadlineRule}. Gün taşması (ör. 31'inci
 * gün Şubat'ta) ilgili ayın son gününe sıkıştırılır.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaxCalendarService {

    private final TaxDeadlineRuleRepository ruleRepository;

    /** Çeyrek bit değerleri (Q1=1, Q2=2, Q3=4, Q4=8). */
    private static final int[] QUARTER_END_MONTH = {3, 6, 9, 12};

    /**
     * {@code [from, to]} (her iki uç dahil) aralığındaki tüm vergi son tarihleri,
     * tarih sırasıyla.
     */
    @Transactional(readOnly = true)
    public List<TaxDeadlineDto> deadlinesBetween(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            return List.of();
        }
        LocalDate today = LocalDate.now();
        List<TaxDeadlineDto> out = new ArrayList<>();
        for (TaxDeadlineRule rule : ruleRepository.findByActiveTrue()) {
            for (Occurrence occ : occurrencesForRule(rule, from, to)) {
                out.add(TaxDeadlineDto.builder()
                        .obligationType(rule.getObligationType().name())
                        .label(rule.getObligationType().getLabel())
                        .description(buildDescription(rule, occ))
                        .dueDate(occ.dueDate())
                        .period(occ.period())
                        .daysUntil(ChronoUnit.DAYS.between(today, occ.dueDate()))
                        .build());
            }
        }
        out.sort(Comparator.comparing(TaxDeadlineDto::getDueDate)
                .thenComparing(TaxDeadlineDto::getObligationType));
        return out;
    }

    /** Tek bir somut son tarih + kapsadığı dönem etiketi. */
    private record Occurrence(LocalDate dueDate, String period) {}

    /**
     * Bir kuralın {@code [from, to]} aralığına düşen tüm occurrence'larını üretir.
     * Aralık dışına taşan ayları/çeyrekleri kapsayan tarihleri de doğru hesaplamak
     * için tarama aralığı bir miktar genişletilir.
     */
    private List<Occurrence> occurrencesForRule(TaxDeadlineRule rule, LocalDate from, LocalDate to) {
        return switch (rule.getFrequency()) {
            case MONTHLY -> monthlyOccurrences(rule, from, to);
            case QUARTERLY -> quarterlyOccurrences(rule, from, to);
            case YEARLY -> yearlyOccurrences(rule, from, to);
        };
    }

    private List<Occurrence> monthlyOccurrences(TaxDeadlineRule rule, LocalDate from, LocalDate to) {
        List<Occurrence> result = new ArrayList<>();
        int offset = Math.max(0, rule.getMonthOffset());
        // İlgili dönem (period) ayı, son tarih ayından offset kadar geride.
        YearMonth cursor = YearMonth.from(from).minusMonths(offset);
        YearMonth lastPeriod = YearMonth.from(to).minusMonths(offset).plusMonths(1);
        while (!cursor.isAfter(lastPeriod)) {
            YearMonth dueMonth = cursor.plusMonths(offset);
            LocalDate dueDate = dayInMonth(dueMonth, rule.getDayOfMonth());
            if (!dueDate.isBefore(from) && !dueDate.isAfter(to)) {
                result.add(new Occurrence(dueDate, periodMonth(cursor)));
            }
            cursor = cursor.plusMonths(1);
        }
        return result;
    }

    private List<Occurrence> quarterlyOccurrences(TaxDeadlineRule rule, LocalDate from, LocalDate to) {
        List<Occurrence> result = new ArrayList<>();
        int offset = Math.max(0, rule.getMonthOffset());
        int mask = rule.getQuarterMask() != null ? rule.getQuarterMask() : 0b1111;
        // Çeyreklik taramada güvenli üst/alt sınır: from/to yıllarını kapsa.
        int startYear = from.minusMonths(offset + 3).getYear();
        int endYear = to.getYear() + 1;
        for (int year = startYear; year <= endYear; year++) {
            for (int q = 0; q < 4; q++) {
                if ((mask & (1 << q)) == 0) continue;
                YearMonth quarterEnd = YearMonth.of(year, QUARTER_END_MONTH[q]);
                YearMonth dueMonth = quarterEnd.plusMonths(offset);
                LocalDate dueDate = dayInMonth(dueMonth, rule.getDayOfMonth());
                if (!dueDate.isBefore(from) && !dueDate.isAfter(to)) {
                    result.add(new Occurrence(dueDate, year + "-Q" + (q + 1)));
                }
            }
        }
        return result;
    }

    private List<Occurrence> yearlyOccurrences(TaxDeadlineRule rule, LocalDate from, LocalDate to) {
        List<Occurrence> result = new ArrayList<>();
        int month = rule.getFixedMonth() != null ? rule.getFixedMonth() : 1;
        for (int year = from.getYear(); year <= to.getYear(); year++) {
            YearMonth dueMonth = YearMonth.of(year, month);
            LocalDate dueDate = dayInMonth(dueMonth, rule.getDayOfMonth());
            if (!dueDate.isBefore(from) && !dueDate.isAfter(to)) {
                // Yıllık beyan bir önceki yılın gelirini kapsar.
                result.add(new Occurrence(dueDate, String.valueOf(year - 1)));
            }
        }
        return result;
    }

    /**
     * Belirtilen ayda gün döndürür. {@code day == 0} veya ayın gün sayısından
     * büyük gün → ayın son günü (taşma koruması, ör. 31 → Şubat'ta 28/29).
     */
    private LocalDate dayInMonth(YearMonth month, int day) {
        int last = month.lengthOfMonth();
        int safeDay = (day <= 0 || day > last) ? last : day;
        return month.atDay(safeDay);
    }

    private String periodMonth(YearMonth ym) {
        return String.format("%04d-%02d", ym.getYear(), ym.getMonthValue());
    }

    /** TR açıklama: kural açıklaması + dönem etiketi. */
    private String buildDescription(TaxDeadlineRule rule, Occurrence occ) {
        return rule.getDescription() + " (" + occ.period() + " dönemi)";
    }

    /** Bildirim/ön-hazırlık için: belirli türlerin ön-hazırlık etiketi gerekiyor mu? */
    public boolean isVatType(String obligationType) {
        return TaxObligationType.KDV.name().equals(obligationType);
    }
}
