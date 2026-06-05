package com.bizboard.api.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Deploy doğrulama endpoint'i. Sevalla deploy sonrası backend gerçekten
 * yeni JAR'ı çalıştırıyor mu kontrolü için.
 *
 * <p>{@code GET /version} — public, auth yok. Build timestamp + buildtime
 * commit marker döner. Frontend cache/SW konusu değil — direkt backend.</p>
 */
@RestController
public class VersionController {

    /** Her commit'te değiştir veya CI inject etsin. */
    private static final String VERSION_MARKER = "v1.1-hotfix-2026-06-03-closure-pos-income-expense-split";
    private static final String BUILD_TIMESTAMP = "2026-06-03T02:00:00Z";

    @GetMapping("/version")
    public Map<String, String> version() {
        return Map.of(
                "version", VERSION_MARKER,
                "built_at", BUILD_TIMESTAMP);
    }
}
