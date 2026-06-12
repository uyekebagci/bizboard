package com.bizboard.service.efatura;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Aktif e-Fatura entegratörünü seçen registry.
 *
 * <p>Spring tüm {@link EInvoiceIntegrator} bean'lerini enjekte eder. Aktif
 * entegratör {@code app.efatura.integrator} env'i ile seçilir (default "noop").
 * Eşleşen bean yoksa no-op'a düşer — sistem her zaman çalışır durumda kalır.</p>
 *
 * <p>Yeni entegratör eklemek = yeni bir {@link EInvoiceIntegrator}
 * {@code @Component} yazmak + env'i o entegratörün {@code key()}'ine set etmek.
 * Servis/kontrolör katmanında değişiklik gerekmez (Open/Closed).</p>
 */
@Slf4j
@Component
public class EInvoiceIntegratorRegistry {

    private final List<EInvoiceIntegrator> integrators;
    private final String selectedKey;

    public EInvoiceIntegratorRegistry(
            List<EInvoiceIntegrator> integrators,
            @Value("${app.efatura.integrator:noop}") String selectedKey) {
        this.integrators = integrators;
        this.selectedKey = selectedKey == null || selectedKey.isBlank()
                ? NoOpEInvoiceIntegrator.KEY
                : selectedKey.trim().toLowerCase(java.util.Locale.ENGLISH);
    }

    /**
     * Aktif entegratörü döner. Seçilen key'e karşılık bean yoksa no-op
     * fallback'e düşer (asla null dönmez).
     */
    public EInvoiceIntegrator active() {
        return integrators.stream()
                .filter(i -> selectedKey.equals(i.key()))
                .findFirst()
                .orElseGet(this::noOp);
    }

    private EInvoiceIntegrator noOp() {
        return integrators.stream()
                .filter(i -> NoOpEInvoiceIntegrator.KEY.equals(i.key()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "No-op e-Fatura entegratörü bulunamadı — uygulama yapılandırması bozuk"));
    }
}
