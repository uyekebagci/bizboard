package com.bizboard.common.enums;

/**
 * e-Fatura yaşam döngüsü durumu.
 *
 * <p>Entegratör bağımsız iç durum makinesi. Gerçek entegratör (Foriba/Uyumsoft/
 * QNB vb.) bağlandığında {@code integratorStatus} alanı GİB tarafındaki durumu
 * (kabul/ret/iptal) ayrıca tutar; bu enum bizim iç akışımızı izler.</p>
 *
 * <pre>
 *   DRAFT ──(XML üret + imzala)──► SIGNED ──(gönder)──► SENT ──► ACCEPTED / REJECTED
 *     │                                                  │
 *     └──────────────────── CANCELLED ◄─────────────────┘
 * </pre>
 */
public enum InvoiceStatus {

    /** Taslak — düzenlenebilir, henüz XML üretilip imzalanmadı. */
    DRAFT,

    /** UBL-TR XML üretildi (ve/veya mali mühürle imzalandı), göndermeye hazır. */
    SIGNED,

    /** Entegratöre gönderildi, GİB yanıtı bekleniyor. */
    SENT,

    /** GİB/alıcı tarafından kabul edildi. */
    ACCEPTED,

    /** GİB/alıcı tarafından reddedildi (TICARI senaryo). */
    REJECTED,

    /** İptal edildi. */
    CANCELLED,

    /** Gönderim/işlem hatası (entegratör hata döndürdü). */
    ERROR
}
