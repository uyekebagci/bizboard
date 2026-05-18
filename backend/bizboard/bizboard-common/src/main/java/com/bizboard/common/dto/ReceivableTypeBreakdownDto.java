package com.bizboard.common.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

/**
 * v1.6.5: Bir karşı taraf için alacak tip kırılımı.
 *
 * Örnek: bir kişiden hem 5.000 TL SENET hem 3.000 TL ÇEK alacak varsa
 * iki adet ReceivableTypeBreakdownDto döner.
 *
 * receivable_type=DIGER kayıtlar `type="DIGER"` + `label=receivable_type_other`
 * şeklinde gelir (frontend rozette label'i göstermek için kullanabilir).
 *
 * receivable_type null olan eski kayıtlar (legacy) `type="UNSPECIFIED"` ile döner.
 */
@Data
@Builder
public class ReceivableTypeBreakdownDto {

    /** SENET, CEK, ALTIN, NAKIT, DIGER, UNSPECIFIED. */
    private String type;

    /** type=DIGER iken serbest metin label, aksi takdirde null. */
    private String label;

    /** Bu tip altındaki toplam tutar. */
    private BigDecimal amount;

    /** Bu tip altındaki kayıt sayısı. */
    private int count;
}
