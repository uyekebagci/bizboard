package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * "Para İzi" — bir işlemin çift-yönlü fon-izi görünümü (tek payload).
 *
 * <p>İşlem detay modal'ı tek çağrıyla iki bölümü doldurur:</p>
 * <ul>
 *   <li><b>sources</b> ("Kaynak"): bu para nereden geldi — bu tx'in HEDEF
 *       olduğu bağlar (target-side).</li>
 *   <li><b>usages</b> ("Kullanım/Harcamalar"): bu para nereye gitti — bu tx'in
 *       KAYNAK olduğu bağlar (source-side).</li>
 * </ul>
 *
 * <p>Ayrıca bu tx bir kaynak olarak ele alındığında tahsis göstergesi:
 * {@code amount} (tx tutarı), {@code allocated} (Σ usage bağları),
 * {@code remaining = amount − allocated}. Kalan &gt; 0 ise yeni bağ eklenebilir.</p>
 */
@Data
@Builder
public class FundTrailDto {

    /** Bu işlemin tutarı (tahsis havuzu — kaynak olarak kullanıldığında). */
    private BigDecimal amount;

    /** Bu işleme (kaynak olarak) tahsis edilmiş toplam (Σ usages.amount). */
    private BigDecimal allocated;

    /** Kalan tahsis edilebilir tutar = amount − allocated (&ge; 0). */
    private BigDecimal remaining;

    /** "Bu para nereden geldi" — bu tx'in HEDEF olduğu bağlar. */
    private List<FundLinkDto> sources;

    /** "Bu para nereye gitti" — bu tx'in KAYNAK olduğu bağlar. */
    private List<FundLinkDto> usages;

    /** UI uyarısı için: bu tx kaynak olarak tamamen tahsis edildi mi. */
    @JsonProperty("fully_allocated")
    private boolean fullyAllocated;
}
