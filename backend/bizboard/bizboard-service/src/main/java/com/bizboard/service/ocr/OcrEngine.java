package com.bizboard.service.ocr;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * OCR Modülü (WP 1bdb8116) — sağlayıcı orkestratörü.
 *
 * <p>Konfigüre edilmiş birincil sağlayıcıyı ({@code app.ocr.provider}, default
 * "mindee") dener; kullanılamaz/başarısızsa ({@code fallback-enabled} açıkken)
 * diğer sağlayıcıya (Tesseract) düşer. İki sağlayıcı da başarısızsa
 * {@link OcrRawResult#failure} döner — çağıran (OcrService) bunu graceful
 * şekilde "düşük güven / manuel giriş gerek" durumuna çevirir.</p>
 */
@Slf4j
@Component
public class OcrEngine {

    private final OcrProperties props;
    private final Map<String, OcrProvider> providers = new LinkedHashMap<>();

    public OcrEngine(OcrProperties props, List<OcrProvider> providerBeans) {
        this.props = props;
        for (OcrProvider p : providerBeans) {
            providers.put(p.name().toLowerCase(), p);
        }
    }

    @PostConstruct
    void logStatus() {
        StringBuilder sb = new StringBuilder();
        providers.values().forEach(p ->
                sb.append(p.name()).append("=").append(p.isAvailable() ? "READY" : "off").append(" "));
        log.info("[ocr] primary={} fallback={} providers: {}",
                props.getProvider(), props.isFallbackEnabled(), sb.toString().trim());
    }

    /**
     * Bir belgeyi tara; birincil → fallback zinciri uygular.
     *
     * @return ilk başarılı ham sonuç; hiçbiri başaramazsa son başarısızlık.
     */
    public OcrRawResult scan(byte[] fileBytes, String contentType, OcrDocumentType docType) {
        List<OcrProvider> chain = resolveChain();
        OcrRawResult last = OcrRawResult.failure("none", "Hiç OCR sağlayıcısı yapılandırılmadı");

        for (OcrProvider p : chain) {
            if (!p.isAvailable()) {
                log.debug("[ocr] sağlayıcı atlandı (kullanılamaz): {}", p.name());
                continue;
            }
            OcrRawResult res = p.scan(fileBytes, contentType, docType);
            if (res.succeeded()) {
                log.info("[ocr] başarılı sağlayıcı={} docType={} score={}",
                        p.name(), docType, res.overallScore());
                return res;
            }
            log.warn("[ocr] sağlayıcı başarısız={} neden={}", p.name(), res.errorMessage());
            last = res;
            if (!props.isFallbackEnabled()) break;
        }
        return last;
    }

    /** Birincil sağlayıcı önce, sonra geri kalanlar (fallback sırası). */
    private List<OcrProvider> resolveChain() {
        var chain = new java.util.ArrayList<OcrProvider>();
        OcrProvider primary = providers.get(
                props.getProvider() != null ? props.getProvider().toLowerCase() : "mindee");
        if (primary != null) chain.add(primary);
        for (OcrProvider p : providers.values()) {
            if (!chain.contains(p)) chain.add(p);
        }
        return chain;
    }

    /** En az bir sağlayıcı çalışabilir durumda mı (health/diagnostic). */
    public boolean anyAvailable() {
        return providers.values().stream().anyMatch(OcrProvider::isAvailable);
    }
}
