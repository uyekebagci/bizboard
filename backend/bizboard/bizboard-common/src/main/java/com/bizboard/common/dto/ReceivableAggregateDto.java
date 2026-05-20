package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v1.6.5: GET /api/receivables cevabı — karşı taraf bazlı alacak özeti.
 *
 * <p>Yalnız `direction=RECEIVABLE` ve `settled=false` debt'ler dahil edilir.
 * Grupla: counterpart_id varsa onunla, yoksa free-text `counterparty` ile.</p>
 *
 * <p><b>v1.6.23.6 (hotfix):</b> Field'lar @JsonProperty ile snake_case'e
 * normalize edildi. Önceki sürümde Jackson default camelCase JSON
 * (counterpartName, totalAmount, lastDueDate) üretiyordu; frontend ise
 * snake_case (counterpart_name, total_amount, last_due_date) bekliyordu →
 * tüm field'lar undefined geliyor, sayfa boş veya null-pointer hataları ile
 * patlıyordu (v1.6.16.1 ile aynı pattern).</p>
 */
@Data
@Builder
public class ReceivableAggregateDto {

    /** Karşı taraf entity id (varsa). null ise free-text only legacy kayıt. */
    @JsonProperty("counterpart_id")
    private UUID counterpartId;

    /** Görüntülenecek karşı taraf adı. */
    @JsonProperty("counterpart_name")
    private String counterpartName;

    /** Tüm tip kırılımlarının toplamı (TRY varsayılan). */
    @JsonProperty("total_amount")
    private BigDecimal totalAmount;

    /** Para birimi — counterpart altındaki ilk debt'in currency'si. */
    private String currency;

    /** Tip bazlı kırılım — frontend rozet listesi olarak gösterir. */
    @JsonProperty("receivable_types")
    private List<ReceivableTypeBreakdownDto> receivableTypes;

    /** En yakın gelecek vade (nullable; tüm vadeler arasından max date). */
    @JsonProperty("last_due_date")
    private LocalDate lastDueDate;

    /** Toplam açık debt sayısı bu karşı taraf altında. */
    private int count;
}
