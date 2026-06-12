package com.bizboard.service.efatura;

import com.bizboard.common.entity.Invoice;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Varsayılan no-op entegratör — hiçbir gerçek gönderim yapmaz.
 *
 * <p>Kullanıcı gerçek bir entegratör (Foriba/Uyumsoft/QNB vb.) yapılandırana
 * kadar aktif olan stub. Her zaman {@link EInvoiceSendResult#notConfigured}
 * döner; böylece:</p>
 * <ul>
 *   <li>XML üretimi + önizleme + indirme tam çalışır,</li>
 *   <li>"Gönder" denince sistem patlamaz; "entegratör yapılandırılmadı" der.</li>
 * </ul>
 *
 * <p>Gerçek entegratör bean'i eklendiğinde {@code app.efatura.integrator} env'i
 * ("foriba" gibi) ile seçilir; {@code EInvoiceIntegratorRegistry} doğru bean'i
 * resolve eder. Bu sınıf {@code @Primary} DEĞİL — yalnız fallback'tir.</p>
 */
@Slf4j
@Component
public class NoOpEInvoiceIntegrator implements EInvoiceIntegrator {

    public static final String KEY = "noop";

    /**
     * Placeholder env değişkenleri — gerçek entegratör eklenince bunlar
     * doldurulur. Burada yalnız "configured mı" sinyali için okunur; literal
     * secret YOKTUR. No-op her halükârda configured=false döner.
     */
    private final boolean integrationEnabled;

    public NoOpEInvoiceIntegrator(
            @Value("${app.efatura.integrator:noop}") String selected) {
        // No-op sadece seçili entegratör "noop" iken (veya hiç) anlamlıdır.
        this.integrationEnabled = false;
        log.info("[efatura] aktif entegratör seçimi: '{}' (no-op fallback hazır)", selected);
    }

    @Override
    public String key() {
        return KEY;
    }

    @Override
    public boolean isConfigured() {
        // No-op asla "yapılandırılmış" sayılmaz.
        return integrationEnabled;
    }

    @Override
    public EInvoiceSendResult send(Invoice invoice) {
        log.info("[efatura:noop] send atlandı — entegratör yapılandırılmadı (ettn={})",
                invoice != null ? invoice.getEttn() : null);
        return EInvoiceSendResult.notConfigured(KEY);
    }

    @Override
    public EInvoiceSendResult queryStatus(Invoice invoice) {
        return EInvoiceSendResult.notConfigured(KEY);
    }

    @Override
    public EInvoiceSendResult cancel(Invoice invoice, String reason) {
        return EInvoiceSendResult.notConfigured(KEY);
    }
}
