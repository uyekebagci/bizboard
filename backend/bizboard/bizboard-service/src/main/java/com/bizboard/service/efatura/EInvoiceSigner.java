package com.bizboard.service.efatura;

/**
 * Mali mühür imzalama arayüzü (placeholder).
 *
 * <p>Türkiye e-Fatura'da UBL-TR XML'i <b>mali mühür</b> (tüzel kişi) veya
 * <b>e-imza</b> (şahıs) ile XAdES imzalanır. Sertifika ve özel anahtar
 * kullanıcının operasyonel/hukuki adımıdır — repo'da literal secret/sertifika
 * TUTULMAZ. Sertifika yolu/parola env'den okunur.</p>
 *
 * <p>v1.1'de varsayılan {@link NoOpEInvoiceSigner} imzalama YAPMAZ; XML
 * imzasız üretilir (önizleme/indirme için yeterli). Gerçek imzalama, entegratör
 * seçilince ya entegratör tarafında ya da bu arayüzün gerçek implementasyonunda
 * (XAdES + PKCS#11/PKCS#12) yapılır.</p>
 */
public interface EInvoiceSigner {

    /** İmzalama yapılandırılmış mı (sertifika env'de set edilmiş mi)? */
    boolean isConfigured();

    /**
     * UBL-TR XML'i mali mühür/e-imza ile imzalar.
     *
     * @param unsignedXml imzasız UBL-TR XML
     * @return imzalı XML; yapılandırılmamışsa {@code unsignedXml} aynen döner
     */
    String sign(String unsignedXml);
}
