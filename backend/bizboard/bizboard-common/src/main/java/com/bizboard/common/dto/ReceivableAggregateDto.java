package com.bizboard.common.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v1.6.5: GET /api/receivables cevabı — karşı taraf bazlı alacak özeti.
 *
 * Yalnız `direction=RECEIVABLE` ve `settled=false` debt'ler dahil edilir.
 * Grupla: counterpart_id varsa onunla, yoksa free-text `counterparty` ile.
 */
@Data
@Builder
public class ReceivableAggregateDto {

    /** Karşı taraf entity id (varsa). null ise free-text only legacy kayıt. */
    private UUID counterpartId;

    /** Görüntülenecek karşı taraf adı. */
    private String counterpartName;

    /** Tüm tip kırılımlarının toplamı (TRY varsayılan). */
    private BigDecimal totalAmount;

    /** Para birimi — counterpart altındaki ilk debt'in currency'si. */
    private String currency;

    /** Tip bazlı kırılım — frontend rozet listesi olarak gösterir. */
    private List<ReceivableTypeBreakdownDto> receivableTypes;

    /** En yakın gelecek vade (nullable; tüm vadeler arasından max date). */
    private LocalDate lastDueDate;

    /** Toplam açık debt sayısı bu karşı taraf altında. */
    private int count;
}
