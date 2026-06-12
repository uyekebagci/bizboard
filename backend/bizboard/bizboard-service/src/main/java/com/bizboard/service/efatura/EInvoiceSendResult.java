package com.bizboard.service.efatura;

/**
 * Entegratör gönderim/sorgu/iptal sonucu — entegratör-bağımsız değer nesnesi.
 *
 * <p>Her entegratör (no-op stub veya gerçek Foriba/Uyumsoft/QNB) bu ortak tipte
 * yanıt döner; servis katmanı entegratöre özgü detayları bilmez.</p>
 *
 * @param accepted    işlem entegratör tarafından kabul edildi mi
 * @param integratorRef entegratörün döndürdüğü dış referans (işlem no), yoksa null
 * @param statusText  entegratör tarafındaki ham durum metni (örn. "SENT", "ACCEPTED")
 * @param message     insan-okur açıklama (hata ya da bilgi)
 * @param configured  entegratör yapılandırılmış mı (false → gönderim atlanmıştır)
 */
public record EInvoiceSendResult(
        boolean accepted,
        String integratorRef,
        String statusText,
        String message,
        boolean configured
) {

    /** Entegratör yapılandırılmamış — graceful "yapılandırılmadı" sonucu. */
    public static EInvoiceSendResult notConfigured(String integratorKey) {
        return new EInvoiceSendResult(
                false,
                null,
                null,
                "e-Fatura entegratörü yapılandırılmadı (" + integratorKey
                        + "). XML üretilip indirilebilir; gönderim için entegratör seçin.",
                false);
    }

    public static EInvoiceSendResult ok(String integratorRef, String statusText, String message) {
        return new EInvoiceSendResult(true, integratorRef, statusText, message, true);
    }

    public static EInvoiceSendResult failed(String message) {
        return new EInvoiceSendResult(false, null, null, message, true);
    }
}
