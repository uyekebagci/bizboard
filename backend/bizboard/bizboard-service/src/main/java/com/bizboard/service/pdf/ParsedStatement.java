package com.bizboard.service.pdf;

import lombok.Builder;
import lombok.Getter;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Banka ekstresi PDF parse sonucu (Ledger v2 — banka import).
 *
 * <p>Açılış bakiyesi ("DEVREDEN BAKİYE") ayrı tutulur; hareket değildir.
 * Her hareket {@link ParsedMovement} olarak çıkar. {@code chainConsistent}
 * yürüyen-bakiye zincirinin (önceki_bakiye + tutar ≈ yeni_bakiye) tutup
 * tutmadığını söyler — uymuyorsa satır-gruplama şüpheli demektir.</p>
 */
@Getter
@Builder
@ToString
public class ParsedStatement {

    /** "DEVREDEN BAKİYE" — açılış bakiyesi (null olabilir; bulunamazsa). */
    private final BigDecimal openingBalance;

    /** Parse edilen hareketler (PDF sırasıyla). */
    private final List<ParsedMovement> movements;

    /** Yürüyen-bakiye zinciri açılıştan başlayıp baştan sona tutarlı mı? */
    private final boolean chainConsistent;

    /** Tutarsız (chain'i bozan) hareket sayısı — flag/teşhis için. */
    private final int inconsistentCount;

    public int getMovementCount() {
        return movements == null ? 0 : movements.size();
    }

    /**
     * Tek banka hareketi.
     *
     * <p>{@code amount} işaretlidir: − = hesaptan çıkış (gider), + = hesaba
     * giriş (gelir). {@code direction} bundan türetilir. {@code balance}
     * hareketten sonraki yürüyen bakiye. {@code chainOk} bu satırın bakiye
     * zincirini tutturup tutturmadığı.</p>
     */
    @Getter
    @Builder
    @ToString
    public static class ParsedMovement {
        /** İşlem tarihi (DD/MM/YYYY → LocalDate). */
        private final LocalDate date;

        /** Kanal: ŞB / MB / İNT / ÇM / GO (null olabilir). */
        private final String channel;

        /** Tam açıklama (çok-satırlı PDF satırları birleştirilmiş). */
        private final String rawDescription;

        /** "Alıcı :" / "Gönderen:" kalıbından çıkarılan karşı-taraf adı. */
        private final String counterpartyName;

        /** İşaretli tutar (− çıkış / + giriş). */
        private final BigDecimal amount;

        /** INCOME (+) / EXPENSE (−). */
        private final Direction direction;

        /** Hareketten sonraki yürüyen bakiye. */
        private final BigDecimal balance;

        /** Bu satır bakiye zincirini tutturuyor mu (kuruş toleransı). */
        private final boolean chainOk;
    }

    public enum Direction {
        /** Hesaba giriş (+). */
        INCOME,
        /** Hesaptan çıkış (−). */
        EXPENSE
    }
}
