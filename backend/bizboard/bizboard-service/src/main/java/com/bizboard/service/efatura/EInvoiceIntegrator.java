package com.bizboard.service.efatura;

import com.bizboard.common.entity.Invoice;

/**
 * e-Fatura entegratör arayüzü (pluggable).
 *
 * <p>Çatı e-Fatura modülü <b>entegratör-bağımsız</b> tasarlanmıştır: UBL-TR XML
 * üretimi ve önizleme/indirme yerelde çalışır. GİB'e fiili gönderim, durum
 * sorgusu ve iptal bir <b>entegratör</b> (Foriba, Uyumsoft, QNB e-Fatura vb.)
 * üzerinden yapılır. Bu arayüzün gerçek implementasyonu, kullanıcı entegratör
 * seçtiğinde eklenir; credentials env'den okunur (repo'da literal secret yok).</p>
 *
 * <p>Varsayılan {@link NoOpEInvoiceIntegrator} hiçbir şey göndermez ve
 * "yapılandırılmadı" sonucu döner — sistem entegratör olmadan da çalışır
 * (graceful degradation).</p>
 *
 * <p><b>Mali mühür:</b> imzalama da entegratöre/yereldeki imza modülüne aittir;
 * sertifika kullanıcının operasyonel/hukuki adımıdır ve kod tarafında yalnız
 * placeholder vardır.</p>
 */
public interface EInvoiceIntegrator {

    /**
     * Entegratörü tanımlayan benzersiz anahtar (örn. "noop", "foriba",
     * "uyumsoft", "qnb"). Birden fazla entegratör tanımlıysa seçimde kullanılır.
     */
    String key();

    /**
     * Entegratör gönderime hazır mı? Credentials env'de set değilse {@code false}.
     * {@code false} dönen entegratör {@link #send} çağrısında
     * {@link EInvoiceSendResult#notConfigured} döner.
     */
    boolean isConfigured();

    /**
     * Faturayı entegratöre/GİB'e gönderir. Çağrıdan önce faturanın UBL-TR XML'i
     * üretilmiş ({@code invoice.getUblXml() != null}) olmalıdır.
     *
     * @param invoice gönderilecek fatura (XML dahil)
     * @return entegratör-bağımsız sonuç (kabul/red/ref/durum)
     */
    EInvoiceSendResult send(Invoice invoice);

    /**
     * Daha önce gönderilmiş faturanın güncel durumunu sorgular.
     *
     * @param invoice durum sorgulanacak fatura ({@code integratorRef} dolu olmalı)
     */
    EInvoiceSendResult queryStatus(Invoice invoice);

    /**
     * Gönderilmiş faturayı iptal eder (entegratör/GİB kuralları dahilinde).
     *
     * @param invoice iptal edilecek fatura
     * @param reason  iptal gerekçesi (audit/entegratör için)
     */
    EInvoiceSendResult cancel(Invoice invoice, String reason);
}
