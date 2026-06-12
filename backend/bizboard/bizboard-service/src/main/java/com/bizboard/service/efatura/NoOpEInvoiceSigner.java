package com.bizboard.service.efatura;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Varsayılan no-op mali mühür imzalayıcı — imzalama yapmaz.
 *
 * <p>Sertifika env'leri (placeholder, repo'da literal secret yok):</p>
 * <ul>
 *   <li>{@code APP_EFATURA_SIGN_CERT_PATH} — sertifika (PKCS#12) dosya yolu</li>
 *   <li>{@code APP_EFATURA_SIGN_CERT_PASSWORD} — sertifika parolası</li>
 * </ul>
 *
 * <p>Cert path boşsa imzalama devre dışıdır; {@link #sign} XML'i aynen döner.
 * Gerçek imzalama implementasyonu (XAdES) sertifika sağlandığında eklenir.</p>
 */
@Slf4j
@Component
public class NoOpEInvoiceSigner implements EInvoiceSigner {

    private final String certPath;

    public NoOpEInvoiceSigner(
            @Value("${app.efatura.sign.cert-path:}") String certPath) {
        this.certPath = certPath;
    }

    @Override
    public boolean isConfigured() {
        // Cert path env'i set edilse bile gerçek imza implementasyonu henüz yok;
        // bu no-op her zaman imzalanmamış XML döner (yanıltıcı "imzalı" demez).
        return false;
    }

    @Override
    public String sign(String unsignedXml) {
        if (certPath != null && !certPath.isBlank()) {
            log.warn("[efatura:signer] cert-path verilmiş ama imza implementasyonu yok — XML imzasız döndü");
        }
        return unsignedXml;
    }
}
