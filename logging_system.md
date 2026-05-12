# BizBoard — Loglama Sistemi Tasarımı

> **Hedef:** Backend (Spring Boot 3.4.3 + Java 21) ve Frontend (Next.js 14 + TypeScript) için **production-grade**, **insan-okunabilir**, **makine-aranabilir** birleşik loglama sistemi.
> **Tasarımcı Rolü:** Senior Software Architect
> **Versiyon:** 1.0
> **Bu döküman aksiyon alınabilir tasarımdır** — kopyala-yapıştır kod örnekleri ile birlikte gelir.

---

## İçindekiler

1. [Felsefe ve Tasarım Prensipleri](#1-felsefe-ve-tasarım-prensipleri)
2. [Mimari Genel Bakış](#2-mimari-genel-bakış)
3. [Standart Log Şeması (Birleşik)](#3-standart-log-şeması-birleşik)
4. [Log Seviyeleri — Ne Zaman Hangisi?](#4-log-seviyeleri--ne-zaman-hangisi)
5. [Korelasyon — Request ID Akışı](#5-korelasyon--request-id-akışı)
6. [Backend Tasarımı (Spring Boot)](#6-backend-tasarımı-spring-boot)
   - 6.1 Bağımlılıklar
   - 6.2 `logback-spring.xml`
   - 6.3 MDC Doldurma Filtresi
   - 6.4 Request/Response Logging Filtresi
   - 6.5 `@Logged` AOP Annotation
   - 6.6 PII Maskeleme Pattern Layout
   - 6.7 Özel Logger Sınıfları (Audit / Security / Performance)
   - 6.8 GlobalExceptionHandler Enhancement
   - 6.9 Hibernate Slow Query Logging
   - 6.10 Spring Profile'ları (dev / staging / prod)
7. [Frontend Tasarımı (Next.js + TypeScript)](#7-frontend-tasarımı-nextjs--typescript)
   - 7.1 Logger Sınıfı (`src/lib/logger.ts`)
   - 7.2 Console Formatter — Renkli, Emoji'li, Hizalı
   - 7.3 API Client Interceptor Logging
   - 7.4 Error Boundary + Global Error Handler
   - 7.5 Web Vitals & Performance
   - 7.6 Production Transport — `/api/logs` Batch Endpoint
   - 7.7 Sentry Entegrasyonu
   - 7.8 Session & Correlation ID Üretimi
8. [Audit Trail — KVKK / Compliance](#8-audit-trail--kvkk--compliance)
9. [Security Logging — Saldırı Tespiti](#9-security-logging--saldırı-tespiti)
10. [Performance Logging — Yavaş Sorgu/Endpoint](#10-performance-logging--yavaş-sorguendpoint)
11. [PII & Hassas Veri Yönetimi](#11-pii--hassas-veri-yönetimi)
12. [Merkezi Loglama (Centralized) — Loki + Grafana](#12-merkezi-loglama-centralized--loki--grafana)
13. [Retention (Saklama) Politikası](#13-retention-saklama-politikası)
14. [Alerting (Uyarı) — Kim Ne Zaman Çağrılır?](#14-alerting-uyarı--kim-ne-zaman-çağrılır)
15. [Dashboard'lar (Grafana)](#15-dashboardlar-grafana)
16. [Maliyet ve Kapasite Planlaması](#16-maliyet-ve-kapasite-planlaması)
17. [Geliştirici Deneyimi (DX)](#17-geliştirici-deneyimi-dx)
18. [Migrasyon Planı (4 Hafta)](#18-migrasyon-planı-4-hafta)
19. [Anti-Pattern'ler — Yapılmaması Gerekenler](#19-anti-patternler--yapılmaması-gerekenler)
20. [Hızlı Referans Kartları](#20-hızlı-referans-kartları)

---

## 1. Felsefe ve Tasarım Prensipleri

### 1.1 Neden Log Yazıyoruz? (5 İş Gerekçesi)

| # | Amaç | Tipik Soru |
|---|------|-----------|
| 1 | **Debugging** | "Dün 14:32'de niye 500 attı?" |
| 2 | **Audit Trail** | "Hangi admin bu kullanıcının rolünü değiştirdi?" (KVKK / yasal) |
| 3 | **Security Forensics** | "Kim brute force denedi? IDOR denemesi oldu mu?" |
| 4 | **Performance** | "P95 latency neden 2 saniye?" |
| 5 | **Business Insight** | "Bu hafta kaç kez 'transaction-create' yapıldı?" |

> Bir log satırı bu sorulardan **en az birine** cevap vermiyorsa muhtemelen log yazmayalım.

### 1.2 10 Tasarım Prensibi

1. **Structured > Unstructured.** Production'da JSON. Geliştirmede insan okur, üretimde makine.
2. **Context > Data.** Her log satırı sahibi olduğu istek/kullanıcı/işletme bağlamını taşır.
3. **Loglar ucuz, debug pahalı.** Az yazıp çok düşünmek > çok yazıp gürültüde boğulmak.
4. **PII = düşman.** Ad, telefon, e-posta, IBAN, kart — asla raw yazma.
5. **Log seviyesi = okuyucu kitlesi.** `DEBUG` developer'a, `INFO` ops'a, `WARN` SRE'ye, `ERROR` PagerDuty'ye.
6. **Korelasyon her şeydir.** Frontend → Backend → DB tüm satırlar aynı `request_id` taşır.
7. **stdout'a yaz, başka yerde dert etme.** 12-factor app: uygulama log shipper'a değil, stdout'a yazar.
8. **Senkron logla, async transport et.** App thread'i bloklanmamalı (Logback async appender).
9. **Hata loglamak ≠ hatayı yutmak.** `catch` + `log.error` + sessizlik = bug magnet. Ya yeniden fırlat ya da fallback davranışı net belgele.
10. **Loglar koddur.** Format, alan adı, seviye değişikliği → migration ve PR review konusu.

### 1.3 Maksimum Okunabilirlik İçin 7 Kural

| Kural | Örnek |
|-------|-------|
| Tutarlı alan adlandırma (`snake_case`) | `user_id`, `business_id`, `request_id` |
| Mesaj sabit, parametreler ayrı | `"User login successful"` + `{user_id: "..."}` (mesaj asla concat etmez) |
| Geliştirmede renk + emoji + hizalı kolon | `14:23:45 ✅ INFO  [auth] ...` |
| Üretimde tek satır JSON | `{"timestamp":"...","level":"INFO",...}` |
| Mesajlar imperative ve action-oriented | `"User logged in"` değil, `"User login successful"` |
| Stack trace ayrı `error.stack` alanı | JSON içinde `\n` ile sıkışmaz, Grafana'da expand olur |
| Numerik değerler ayrı alan | `"Query took 234ms"` yerine `{message: "Slow query", duration_ms: 234}` |

---

## 2. Mimari Genel Bakış

```
┌────────────────────────────────────────────────────────────────────────┐
│                     KULLANICI (Browser / PWA)                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Frontend Logger (TypeScript)                                     │  │
│  │  • console (dev: renkli + emoji)                                 │  │
│  │  • Sentry SDK → exceptions                                       │  │
│  │  • Batch buffer → POST /api/logs (prod)                          │  │
│  │  • Web Vitals → POST /api/logs                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────┬───────────────────────────────────────────────────┘
                     │ X-Request-ID: req-abc123  (header propagation)
                     │ Authorization: Bearer ...
                     │
┌────────────────────▼───────────────────────────────────────────────────┐
│              SPRING BOOT API (com.bizboard)                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ MdcCorrelationFilter   → request_id, user_id, business_id        │  │
│  │ RequestLoggingFilter   → method, path, status, duration_ms       │  │
│  │ @Logged AOP            → service method enter/exit               │  │
│  │ GlobalExceptionHandler → tek noktadan error log                  │  │
│  │ Loggers:                                                         │  │
│  │   com.bizboard.audit    → audit-{date}.json                      │  │
│  │   com.bizboard.security → security-{date}.json                   │  │
│  │   com.bizboard.perf     → perf-{date}.json                       │  │
│  │   ROOT                  → app-{date}.json                        │  │
│  │ Encoder: LogstashEncoder (JSON, prod) / PatternLayout (dev)      │  │
│  │ Async appender (queueSize=8192, discardingThreshold=0)           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────┬───────────────────────────────────────────────────┘
                     │ stdout (12-factor)
                     │
┌────────────────────▼───────────────────────────────────────────────────┐
│         LOG SHIPPER (Promtail / Fluent Bit) — DaemonSet                │
│  • Parse JSON, attach pod/host labels                                  │
│  • Drop noisy paths (/actuator/health)                                 │
└────────────────────┬───────────────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────────────────┐
│                       LOKI (log storage)                               │
│  • Labels: app, env, level, logger, request_id, business_id            │
│  • Retention: hot 30d (object storage), audit 7yr (S3 Glacier)         │
└──┬─────────────────────────────────────────────────────┬───────────────┘
   │                                                     │
┌──▼──────────────┐                                ┌─────▼─────────────┐
│   GRAFANA       │                                │   ALERTMANAGER    │
│  • Dashboards   │                                │   → Slack         │
│  • LogQL ad-hoc │                                │   → PagerDuty     │
│  • Explore      │                                │   → E-mail        │
└─────────────────┘                                └───────────────────┘

           ┌─────────────────────────────┐
           │   SENTRY (errors, traces)   │ ← Frontend SDK + Backend SDK
           └─────────────────────────────┘
```

### 2.1 Stack Seçimi ve Gerekçe

| Seçim | Alternatif | Neden Bu? |
|-------|-----------|-----------|
| **Logback + LogstashEncoder** | log4j2, java.util.logging | Spring Boot default + JSON desteği battle-tested |
| **Loki + Grafana** | Elastic + Kibana, Datadog | %10 maliyet, label-based, OSS |
| **Promtail** | Fluent Bit, Vector | Loki ile birinci sınıf entegrasyon |
| **Sentry** | Bugsnag, Rollbar | OSS self-hosted seçeneği var, FE+BE SDK olgun |
| **Pino (FE üzerinde)** | winston, bunyan | Browser+Node, küçük, hızlı |
| **MDC (SLF4J)** | ThreadLocal, Reactor Context | Spring Boot ile native, neredeyse ücretsiz |

---

## 3. Standart Log Şeması (Birleşik)

> Backend ve Frontend **AYNI** JSON alanlarını kullanır. Loki sorgu zamanı tutarlı olur.

### 3.1 Zorunlu Alanlar

| Alan | Tip | Örnek | Açıklama |
|------|-----|-------|---------|
| `timestamp` | ISO 8601 | `2026-05-11T14:23:45.123Z` | UTC, milisaniye |
| `level` | enum | `INFO` | TRACE\|DEBUG\|INFO\|WARN\|ERROR\|FATAL |
| `logger` | string | `com.bizboard.service.AuthService` | Java FQN veya FE kategori (`api`, `auth`, `ui`) |
| `message` | string (sabit) | `"User login successful"` | Parametre içermez, sabit template |
| `service` | string | `bizboard-api` veya `bizboard-web` | Uygulama adı |
| `env` | string | `prod` | `dev` / `staging` / `prod` |
| `version` | string | `1.4.2` | App versiyonu (build time) |

### 3.2 Bağlamsal Alanlar (Mümkün Olduğunda)

| Alan | Tip | Açıklama |
|------|-----|----------|
| `request_id` | string | İstek bazlı korelasyon ID (UUID veya `req-<short>`) |
| `trace_id` | string | OpenTelemetry trace ID (varsa) |
| `span_id` | string | Span ID (varsa) |
| `session_id` | string | Frontend session ID |
| `user_id` | string | Anonymize edilmiş user ID (UUID) — **kullanıcı adı ASLA** |
| `business_id` | string | Multi-tenant izolasyon için |
| `client_ip` | string | İstek IP (hash veya CIDR-/24 ile maskeleyebilirsin) |
| `user_agent` | string | Browser bilgisi |

### 3.3 Olay-Spesifik Alanlar (Ek)

```jsonc
// HTTP request log
{
  "method": "POST",
  "path": "/businesses/{id}/transactions",
  "status": 201,
  "duration_ms": 87,
  "request_size_bytes": 412,
  "response_size_bytes": 1203
}

// DB / slow query
{
  "query_type": "select",
  "table": "transactions",
  "duration_ms": 1432,
  "rows_affected": 0
}

// Audit
{
  "audit_action": "user.role.changed",
  "actor_id": "uuid-of-admin",
  "target_id": "uuid-of-affected-user",
  "before": { "role": "viewer" },
  "after":  { "role": "manager" }
}

// Error
{
  "error": {
    "type": "com.bizboard.exception.BusinessNotFoundException",
    "message": "Business not found: ...",
    "stack": "...",
    "code": "BIZ-404"
  }
}
```

### 3.4 Örnek Tam Satır (Production JSON)

```json
{
  "timestamp": "2026-05-11T14:23:45.123Z",
  "level": "WARN",
  "logger": "com.bizboard.service.AuthService",
  "thread": "http-nio-8080-exec-3",
  "service": "bizboard-api",
  "env": "prod",
  "version": "1.4.2",
  "request_id": "req-7f3a9c",
  "user_id": "0e8a2c14-1f6f-4f30-...",
  "business_id": null,
  "client_ip": "203.0.113.0/24",
  "method": "POST",
  "path": "/auth/login",
  "status": 401,
  "duration_ms": 23,
  "message": "Login failed: bad credentials",
  "context": {
    "attempt_number": 4,
    "lockout_remaining": 1
  }
}
```

---

## 4. Log Seviyeleri — Ne Zaman Hangisi?

| Seviye | Hedef Kitle | Ne Zaman | Örnek |
|--------|-------------|----------|-------|
| `TRACE` | Geliştirici (yerel) | Detaylı akış (loop iterasyonu, parametre dump) | `"Iterating tx [3/120]: id=..."` |
| `DEBUG` | Geliştirici (dev/staging) | Karar yolu, dış servis çağrı detayı | `"Fetching businesses for user; count=12"` |
| `INFO` | Ops / SRE | İş olayı, normal akış | `"User login successful"`, `"Transaction created"` |
| `WARN` | SRE | Geri kazanılabilir sorun, dikkat gerek | `"Cache miss for category list; falling back to DB"` |
| `ERROR` | On-call + Slack | İşlem başarısız, kullanıcı etkilendi | `"Transaction create failed: db connection lost"` |
| `FATAL` | PagerDuty (sayfa çağırır) | App çalışamaz, restart gerek | `"DataSource init failed; aborting startup"` |

**Üretimde varsayılan seviye:**
- `ROOT` → `INFO`
- `com.bizboard` → `INFO`
- `com.bizboard.service.FinanceService` → `INFO` (cron job'lar verbose olmasın)
- `org.springframework.security` → `WARN`
- `org.hibernate.SQL` → `OFF` (slow query ayrı logger ile)
- `com.bizboard.audit` → `INFO` (her zaman yazılır)
- `com.bizboard.security` → `INFO`

> **Pratik kural:** Seviyeyi `WARN`'a alıp Slack'e bağlamadan önce, "Gece 3'te uyandırılmaya değer mi?" diye sor. Cevap "hayır"sa `INFO` kalsın.

---

## 5. Korelasyon — Request ID Akışı

```
[Browser]                       [Spring Boot]
   │                                 │
   │ generate or reuse               │
   │ X-Request-ID = "req-abc123"     │
   │                                 │
   ├──── HTTP request ──────────────►│
   │     X-Request-ID: req-abc123    │
   │                                 │ MdcCorrelationFilter
   │                                 │   → MDC.put("request_id", ...)
   │                                 │   → SLF4J satırlarına otomatik enjeksiyon
   │                                 │
   │                                 │ ┌─ Service layer logs
   │                                 │ ├─ Repo layer logs
   │                                 │ ├─ Audit log
   │                                 │ └─ Error log (eğer varsa)
   │                                 │
   │◄──── HTTP response ─────────────┤
   │     X-Request-ID: req-abc123    │
   │     (server echo)               │
   │                                 │ MDC.clear()
   │ Frontend logger aynı            │
   │ request_id ile log basar        │
```

**Pratik fayda:** Grafana'da bir kullanıcının "Transaction yaratamadım" şikâyeti için tek query:

```logql
{app="bizboard"} | json | request_id="req-abc123"
```

→ Frontend click'inden başlayıp DB query'sine kadar **tüm satırlar tek view'da**.

---

## 6. Backend Tasarımı (Spring Boot)

### 6.1 Bağımlılıklar (`bizboard-api/pom.xml`)

```xml
<dependencies>
  <!-- JSON encoder for Logback (Logstash format) -->
  <dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
  </dependency>

  <!-- Distributed tracing (opsiyonel, önerilir) -->
  <dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-otel</artifactId>
  </dependency>
  <dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-exporter-otlp</artifactId>
  </dependency>

  <!-- AOP for @Logged annotation -->
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-aop</artifactId>
  </dependency>

  <!-- Sentry (opsiyonel) -->
  <dependency>
    <groupId>io.sentry</groupId>
    <artifactId>sentry-spring-boot-starter-jakarta</artifactId>
    <version>7.x</version>
  </dependency>
</dependencies>
```

### 6.2 `logback-spring.xml` — Tam Konfigürasyon

`bizboard-api/src/main/resources/logback-spring.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration scan="true" scanPeriod="30 seconds">

  <!-- ============================================================
       SPRING PROPERTIES — application.yml'den okunur
       ============================================================ -->
  <springProperty name="APP_NAME"    source="spring.application.name" defaultValue="bizboard-api"/>
  <springProperty name="APP_VERSION" source="info.app.version"        defaultValue="dev"/>
  <springProperty name="APP_ENV"     source="app.env"                 defaultValue="dev"/>
  <springProperty name="LOG_DIR"     source="app.log.dir"             defaultValue="./logs"/>

  <!-- ============================================================
       DEV PROFILE — Human-readable, colored console
       ============================================================ -->
  <springProfile name="dev | default">

    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
      <encoder>
        <!-- Renkli, hizalı, kolay okunur format -->
        <pattern>
%d{HH:mm:ss.SSS} %highlight(%-5level) %cyan([%X{request_id:-no-req}]) %magenta([%X{user_id:-anon}]) %yellow(%-40.40logger{0}) - %msg%n%xThrowableProxy
        </pattern>
      </encoder>
    </appender>

    <root level="INFO">
      <appender-ref ref="CONSOLE"/>
    </root>

    <logger name="com.bizboard"            level="DEBUG"/>
    <logger name="org.springframework.web" level="INFO"/>
    <logger name="org.hibernate.SQL"       level="DEBUG"/>
    <logger name="org.hibernate.type.descriptor.sql" level="TRACE"/>
  </springProfile>

  <!-- ============================================================
       PROD / STAGING — JSON to stdout (12-factor) + dosya yedeği
       ============================================================ -->
  <springProfile name="prod | staging">

    <!-- ===== Ana JSON appender (stdout) ===== -->
    <appender name="STDOUT_JSON" class="ch.qos.logback.core.ConsoleAppender">
      <encoder class="net.logstash.logback.encoder.LoggingEventCompositeJsonEncoder">
        <providers>
          <timestamp><timeZone>UTC</timeZone><pattern>yyyy-MM-dd'T'HH:mm:ss.SSS'Z'</pattern></timestamp>
          <pattern>
            <pattern>
              {
                "level":        "%level",
                "logger":       "%logger",
                "thread":       "%thread",
                "service":      "${APP_NAME}",
                "env":          "${APP_ENV}",
                "version":      "${APP_VERSION}"
              }
            </pattern>
          </pattern>
          <mdc/>                          <!-- request_id, user_id, business_id -->
          <message/>
          <arguments><includeNonStructuredArguments>false</includeNonStructuredArguments></arguments>
          <stackTrace>
            <throwableConverter class="net.logstash.logback.stacktrace.ShortenedThrowableConverter">
              <maxDepthPerThrowable>40</maxDepthPerThrowable>
              <maxLength>4096</maxLength>
              <rootCauseFirst>true</rootCauseFirst>
              <exclude>^sun\.reflect\..*</exclude>
              <exclude>^java\.lang\.reflect\..*</exclude>
            </throwableConverter>
          </stackTrace>
        </providers>
      </encoder>
    </appender>

    <!-- ===== Async wrapper (uygulama thread'ini bloklamaz) ===== -->
    <appender name="ASYNC_STDOUT" class="ch.qos.logback.classic.AsyncAppender">
      <appender-ref ref="STDOUT_JSON"/>
      <queueSize>8192</queueSize>
      <discardingThreshold>0</discardingThreshold>      <!-- WARN+'ları asla drop etme -->
      <neverBlock>false</neverBlock>                     <!-- kuyruk dolarsa blokla, log kaybetme -->
      <includeCallerData>false</includeCallerData>
    </appender>

    <!-- ===== Audit logger — ayrı dosya, asla rotate edilip silinmez (compliance) ===== -->
    <appender name="AUDIT_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
      <file>${LOG_DIR}/audit.json</file>
      <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
        <fileNamePattern>${LOG_DIR}/audit/audit-%d{yyyy-MM-dd}.%i.json.gz</fileNamePattern>
        <maxFileSize>100MB</maxFileSize>
        <maxHistory>2555</maxHistory>                    <!-- 7 yıl (KVKK) -->
        <totalSizeCap>200GB</totalSizeCap>
      </rollingPolicy>
      <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <customFields>{"log_kind":"audit"}</customFields>
      </encoder>
    </appender>

    <!-- ===== Security logger ===== -->
    <appender name="SECURITY_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
      <file>${LOG_DIR}/security.json</file>
      <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
        <fileNamePattern>${LOG_DIR}/security/security-%d{yyyy-MM-dd}.%i.json.gz</fileNamePattern>
        <maxFileSize>100MB</maxFileSize>
        <maxHistory>365</maxHistory>
      </rollingPolicy>
      <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <customFields>{"log_kind":"security"}</customFields>
      </encoder>
    </appender>

    <!-- ============================================================
         LOGGER YÖNLENDİRMELERİ
         ============================================================ -->
    <logger name="com.bizboard.audit" level="INFO" additivity="false">
      <appender-ref ref="AUDIT_FILE"/>
      <appender-ref ref="ASYNC_STDOUT"/>                <!-- merkezi log'a da git -->
    </logger>

    <logger name="com.bizboard.security" level="INFO" additivity="false">
      <appender-ref ref="SECURITY_FILE"/>
      <appender-ref ref="ASYNC_STDOUT"/>
    </logger>

    <logger name="com.bizboard"              level="INFO"/>
    <logger name="org.hibernate.SQL"          level="OFF"/>
    <logger name="org.springframework"        level="WARN"/>
    <logger name="org.apache.tomcat"          level="WARN"/>

    <root level="INFO">
      <appender-ref ref="ASYNC_STDOUT"/>
    </root>
  </springProfile>
</configuration>
```

### 6.3 MDC Doldurma Filtresi

`bizboard-api/src/main/java/com/bizboard/api/logging/MdcCorrelationFilter.java`:

```java
package com.bizboard.api.logging;

import com.bizboard.security.UserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * İstek başlangıcında MDC'yi doldurur, sonunda temizler.
 * Tüm log satırları otomatik olarak request_id/user_id/business_id taşır.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)        // her şeyden önce çalışsın
public class MdcCorrelationFilter extends OncePerRequestFilter {

    public  static final String HDR_REQUEST_ID   = "X-Request-ID";
    private static final String MDC_REQUEST_ID   = "request_id";
    private static final String MDC_USER_ID      = "user_id";
    private static final String MDC_BUSINESS_ID  = "business_id";
    private static final String MDC_CLIENT_IP    = "client_ip";

    @Override
    protected void doFilterInternal(HttpServletRequest req,
                                    HttpServletResponse res,
                                    FilterChain chain)
            throws ServletException, IOException {

        // 1) Request-ID — header'dan al ya da yeni üret
        String requestId = req.getHeader(HDR_REQUEST_ID);
        if (requestId == null || requestId.isBlank()) {
            requestId = "req-" + UUID.randomUUID().toString().substring(0, 8);
        }
        MDC.put(MDC_REQUEST_ID, requestId);

        // 2) Client IP (CIDR/24 ile maskele — KVKK)
        MDC.put(MDC_CLIENT_IP, maskIp(req.getRemoteAddr()));

        // 3) User-ID — Spring Security context'inden çek (auth varsa)
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof UserPrincipal up) {
            MDC.put(MDC_USER_ID, up.getId().toString());
        }

        // 4) Business-ID — path variable'dan parse et (en sık /businesses/{id}/...)
        String businessId = extractBusinessIdFromPath(req.getRequestURI());
        if (businessId != null) MDC.put(MDC_BUSINESS_ID, businessId);

        // 5) Echo header back to client (FE aynı request_id ile log basabilsin)
        res.setHeader(HDR_REQUEST_ID, requestId);

        try {
            chain.doFilter(req, res);
        } finally {
            MDC.clear();
        }
    }

    private static String maskIp(String ip) {
        if (ip == null) return "unknown";
        if (ip.contains(".")) {                 // IPv4
            String[] p = ip.split("\\.");
            return p.length == 4 ? p[0]+"."+p[1]+"."+p[2]+".0/24" : ip;
        }
        return ip;                              // IPv6: ayrıca maskeleme yapılabilir
    }

    private static String extractBusinessIdFromPath(String uri) {
        // /businesses/{uuid}/... pattern
        int idx = uri.indexOf("/businesses/");
        if (idx < 0) return null;
        int start = idx + "/businesses/".length();
        int end   = uri.indexOf('/', start);
        String candidate = end < 0 ? uri.substring(start) : uri.substring(start, end);
        // UUID format kontrolü
        return candidate.matches("[0-9a-f-]{36}") ? candidate : null;
    }
}
```

### 6.4 Request/Response Logging Filtresi

`bizboard-api/src/main/java/com/bizboard/api/logging/RequestLoggingFilter.java`:

```java
package com.bizboard.api.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import net.logstash.logback.argument.StructuredArguments;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)     // MDC filter'dan SONRA
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger("http.access");

    // Gürültüyü azaltmak için bazı yolları logla ama DEBUG seviyesinde
    private static final Set<String> QUIET_PATHS = Set.of(
        "/actuator/health", "/favicon.ico"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest req,
                                    HttpServletResponse res,
                                    FilterChain chain)
            throws ServletException, IOException {

        long t0 = System.nanoTime();
        try {
            chain.doFilter(req, res);
        } finally {
            long durationMs = (System.nanoTime() - t0) / 1_000_000;
            int status = res.getStatus();

            // Yapısal alanlar (JSON'da ayrı kolon olarak çıkar)
            var args = new Object[] {
                StructuredArguments.kv("method",      req.getMethod()),
                StructuredArguments.kv("path",        req.getRequestURI()),
                StructuredArguments.kv("status",      status),
                StructuredArguments.kv("duration_ms", durationMs),
                StructuredArguments.kv("user_agent",  req.getHeader("User-Agent"))
            };

            String msg = "HTTP " + req.getMethod() + " " + req.getRequestURI();

            if (QUIET_PATHS.contains(req.getRequestURI())) {
                log.debug(msg, args);
            } else if (status >= 500) {
                log.error(msg, args);
            } else if (status >= 400) {
                log.warn(msg, args);
            } else if (durationMs > 1000) {
                log.warn(msg + " (slow)", args);
            } else {
                log.info(msg, args);
            }
        }
    }
}
```

### 6.5 `@Logged` AOP Annotation

`bizboard-api/src/main/java/com/bizboard/api/logging/Logged.java`:

```java
package com.bizboard.api.logging;

import java.lang.annotation.*;

/** Servis metodu giriş/çıkış/exception otomatik loglanır. */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface Logged {
    /** TRACE | DEBUG | INFO */
    String level() default "DEBUG";
    /** Parametreleri logla (PII riski varsa kapat) */
    boolean params() default false;
    /** Dönüş değerini logla (büyük olabilir, dikkatli) */
    boolean result() default false;
}
```

`LoggedAspect.java`:

```java
@Aspect @Component
public class LoggedAspect {
    @Around("@within(com.bizboard.api.logging.Logged) || @annotation(com.bizboard.api.logging.Logged)")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        var sig = (MethodSignature) pjp.getSignature();
        var ann = Optional.ofNullable(sig.getMethod().getAnnotation(Logged.class))
                          .orElse(sig.getMethod().getDeclaringClass().getAnnotation(Logged.class));
        Logger log = LoggerFactory.getLogger(sig.getDeclaringType());
        String method = sig.getName();

        long t0 = System.nanoTime();
        logEnter(log, ann, method, pjp.getArgs());
        try {
            Object out = pjp.proceed();
            long ms = (System.nanoTime() - t0) / 1_000_000;
            logExit(log, ann, method, out, ms);
            return out;
        } catch (Throwable t) {
            long ms = (System.nanoTime() - t0) / 1_000_000;
            log.warn("← {} threw {} after {}ms", method, t.getClass().getSimpleName(), ms);
            throw t;
        }
    }
    // helper'lar level'a göre log.trace/debug/info dispatch eder
}
```

**Kullanım:**

```java
@Service @Logged          // tüm public method'lar enter/exit log basar
public class TransactionService { ... }

@Logged(level = "INFO", params = false)
public TransactionDto createTransaction(...) { ... }
```

### 6.6 PII Maskeleme Pattern

İki yöntem önerilir:

**A) Mesaj yazılırken developer maskeler (önerilen):**

```java
import com.bizboard.api.logging.LogSafe;

log.info("Personnel created", kv("employee_id", e.getId()),
                              kv("business_id", e.getBusinessId()));
// employee.getFullName() ASLA log'a yazılmaz.
```

**B) Logback `replace` converter ile otomatik scrub** (defense-in-depth):

```xml
<conversionRule conversionWord="masked"
                converterClass="com.bizboard.api.logging.MaskingConverter"/>
<pattern>%masked(%msg)</pattern>
```

`MaskingConverter.java`:

```java
public class MaskingConverter extends MessageConverter {
    private static final Pattern EMAIL = Pattern.compile("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", Pattern.CASE_INSENSITIVE);
    private static final Pattern PHONE = Pattern.compile("(\\+?\\d[\\d \\-]{8,}\\d)");
    private static final Pattern IBAN  = Pattern.compile("TR\\d{2}\\d{16,20}");
    private static final Pattern TC    = Pattern.compile("\\b[1-9]\\d{10}\\b");
    private static final Pattern CARD  = Pattern.compile("\\b\\d{13,19}\\b");
    private static final Pattern JWT   = Pattern.compile("eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+");
    private static final Pattern BEARER= Pattern.compile("Bearer\\s+\\S+");

    @Override public String convert(ILoggingEvent e) {
        String s = super.convert(e);
        s = EMAIL.matcher(s).replaceAll("***@***");
        s = PHONE.matcher(s).replaceAll("***-***-****");
        s = IBAN.matcher(s).replaceAll("TR**MASKED**");
        s = TC.matcher(s).replaceAll("***TC***");
        s = CARD.matcher(s).replaceAll("****-****-****-****");
        s = JWT.matcher(s).replaceAll("**JWT**");
        s = BEARER.matcher(s).replaceAll("Bearer **MASKED**");
        return s;
    }
}
```

### 6.7 Özel Logger Sınıfları

`com.bizboard.audit.AuditLog.java`:

```java
package com.bizboard.audit;

import net.logstash.logback.argument.StructuredArguments;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Map;

public final class AuditLog {
    private static final Logger LOG = LoggerFactory.getLogger("com.bizboard.audit");

    public static void record(String action, String targetType, String targetId,
                              Map<String, Object> before, Map<String, Object> after) {
        LOG.info(action,
            StructuredArguments.kv("audit_action", action),
            StructuredArguments.kv("target_type",  targetType),
            StructuredArguments.kv("target_id",    targetId),
            StructuredArguments.kv("before",       before),
            StructuredArguments.kv("after",        after));
    }

    public static void record(String action, String targetType, String targetId) {
        LOG.info(action,
            StructuredArguments.kv("audit_action", action),
            StructuredArguments.kv("target_type",  targetType),
            StructuredArguments.kv("target_id",    targetId));
    }

    private AuditLog() {}
}
```

**Kullanım:**

```java
AuditLog.record(
    "user.role.changed",
    "user", targetUserId.toString(),
    Map.of("role", "viewer"),
    Map.of("role", "manager")
);
```

Aynı pattern `com.bizboard.security.SecurityLog` ve `com.bizboard.perf.PerfLog` için tekrarlanır.

### 6.8 GlobalExceptionHandler Enhancement

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessNotFoundException.class)
    public ResponseEntity<Map<String,Object>> handleBizNotFound(BusinessNotFoundException ex) {
        log.warn("Business not found: id={}", ex.getBusinessId());
        return error(404, "BIZ-404", "İşletme bulunamadı");
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String,Object>> handleAccessDenied(AccessDeniedException ex) {
        SecurityLog.recordIdorAttempt(/* ... */);
        return error(403, "AUTH-403", "Yetkisiz erişim");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String,Object>> handleValidation(MethodArgumentNotValidException ex) {
        log.warn("Validation failed", kv("violations", ex.getBindingResult().getAllErrors().size()));
        return error(400, "VAL-400", "Geçersiz istek");          // Detayları client'a vermeyiz
    }

    @ExceptionHandler(Throwable.class)
    public ResponseEntity<Map<String,Object>> handleAll(Throwable ex) {
        String code = "ERR-" + UUID.randomUUID().toString().substring(0,8);
        log.error("Unhandled exception [{}]", code, ex);          // FULL stack burada
        return error(500, code, "Beklenmeyen bir hata oluştu");   // Client'a sadece kod, stack YOK
    }

    private ResponseEntity<Map<String,Object>> error(int status, String code, String message) {
        return ResponseEntity.status(status).body(Map.of(
            "code",       code,
            "message",    message,
            "request_id", MDC.get("request_id")
        ));
    }
}
```

> **Önemli:** Client'a sadece anlamlı, lokalize, tehlikesiz mesaj döner; **stack trace asla**. Ama log'da tam stack ve `request_id` ile bulunabilir.

### 6.9 Hibernate Slow Query Logging

`application.yml`:

```yaml
spring:
  jpa:
    properties:
      hibernate:
        session.events.log.LOG_QUERIES_SLOWER_THAN_MS: 200   # 200ms'den uzun query'leri logla
```

```yaml
logging:
  level:
    org.hibernate.SQL_SLOW: INFO
```

→ "Slow query detected (350ms): SELECT ..." otomatik log basar.

### 6.10 Spring Profile Bazlı `application.yml`

```yaml
# application.yml (base)
spring:
  application:
    name: bizboard-api
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:dev}

app:
  env: ${APP_ENV:dev}
  log:
    dir: ${LOG_DIR:./logs}

info:
  app:
    version: @project.version@      # Maven filter
```

`application-dev.yml`:
```yaml
logging:
  level:
    com.bizboard: DEBUG
    org.hibernate.SQL: DEBUG
```

`application-prod.yml`:
```yaml
logging:
  level:
    root: WARN
    com.bizboard: INFO
    org.hibernate.SQL: OFF
```

---

## 7. Frontend Tasarımı (Next.js + TypeScript)

### 7.1 Logger Sınıfı

`frontend/bizboard/src/lib/logger.ts`:

```typescript
/**
 * BizBoard Frontend Logger
 * --------------------------------------------------------------
 * Geliştirmede : renkli + emoji + hizalı console.log
 * Üretimde     : batch buffer → POST /api/logs + Sentry (errors)
 *
 * Kullanım:
 *   logger.info("auth", "User logged in", { user_id: "..." });
 *   logger.error("api", "Failed to fetch transactions", { error });
 */
type Level = "debug" | "info" | "warn" | "error";
type Category = "api" | "auth" | "ui" | "store" | "router" | "perf" | "boundary";

const IS_DEV    = process.env.NODE_ENV !== "production";
const APP_VER   = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const SVC_NAME  = "bizboard-web";
const BATCH_MAX = 25;
const BATCH_MS  = 5_000;

const LEVEL_RANK: Record<Level, number> = { debug:0, info:1, warn:2, error:3 };
const MIN_LEVEL: Level = (process.env.NEXT_PUBLIC_LOG_LEVEL as Level) ?? (IS_DEV ? "debug" : "info");

const PALETTE: Record<Level, string> = {
  debug: "color:#9ca3af",
  info : "color:#10b981; font-weight:600",
  warn : "color:#f59e0b; font-weight:600",
  error: "color:#ef4444; font-weight:700",
};
const EMOJI: Record<Level, string> = { debug:"🔍", info:"✅", warn:"⚠️ ", error:"🔴" };

// ---------- Session / Request ID ----------
function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = sessionStorage.getItem("bb_session_id");
  if (!id) {
    id = "sess-" + crypto.randomUUID().slice(0, 8);
    sessionStorage.setItem("bb_session_id", id);
  }
  return id;
}
export function newRequestId(): string {
  return "req-" + (crypto.randomUUID?.() ?? Math.random().toString(36)).slice(0, 8);
}

// ---------- Buffer & Transport ----------
type LogRecord = {
  timestamp: string; level: Level; logger: Category; message: string;
  service: string;   env: string;  version: string;
  session_id: string; request_id?: string; user_id?: string;
  url: string;       user_agent: string;
  context?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
};

let buffer: LogRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, BATCH_MS);
}
async function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await fetch("/api/logs", {
      method: "POST",
      keepalive: true,                                     // tab close edilirken bile gönderir
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: batch }),
    });
  } catch {
    // Sessizce drop — log loglama hatası yapmasın
  }
}

if (typeof window !== "undefined") {
  // tab kapanırken son batch'i göndermeye çalış
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("beforeunload", () => { flush(); });
}

// ---------- Formatter (dev console) ----------
function formatConsole(r: LogRecord): void {
  const t = r.timestamp.slice(11, 23);                     // HH:mm:ss.SSS
  const lvl = r.level.toUpperCase().padEnd(5);
  const cat = `[${r.logger}]`.padEnd(10);
  const head = `%c${t} ${EMOJI[r.level]} ${lvl} ${cat}`;
  const msg  = `%c${r.message}`;
  // eslint-disable-next-line no-console
  (console[r.level] ?? console.log)(
    head + " " + msg,
    PALETTE[r.level],
    "color:inherit",
    r.context ?? "",
    r.error ?? ""
  );
}

// ---------- Public API ----------
function emit(level: Level, logger: Category, message: string,
              context?: Record<string, unknown>, err?: unknown): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;

  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level, logger, message,
    service: SVC_NAME, env: IS_DEV ? "dev" : "prod", version: APP_VER,
    session_id: getOrCreateSessionId(),
    request_id: (context?.request_id as string | undefined),
    user_id:    (context?.user_id    as string | undefined),
    url:        typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "node",
    context,
  };
  if (err instanceof Error) {
    record.error = { name: err.name, message: err.message, stack: err.stack };
  }

  if (IS_DEV) {
    formatConsole(record);
    return;                                                // dev'de transport YOK
  }

  // Production: buffer'a koy
  buffer.push(record);
  if (level === "error" || buffer.length >= BATCH_MAX) flush();
  else scheduleFlush();
}

export const logger = {
  debug: (c: Category, m: string, ctx?: Record<string, unknown>)            => emit("debug", c, m, ctx),
  info : (c: Category, m: string, ctx?: Record<string, unknown>)            => emit("info",  c, m, ctx),
  warn : (c: Category, m: string, ctx?: Record<string, unknown>)            => emit("warn",  c, m, ctx),
  error: (c: Category, m: string, ctx?: Record<string, unknown>, e?: unknown) => emit("error", c, m, ctx, e),
};
```

### 7.2 Console Formatter — Dev Çıktısı

Geliştirme konsolunda örnek görüntü:

```
14:23:45.123 ✅ INFO  [auth]    User login successful   { user_id: "0e8a..." }
14:23:45.567 🔍 DEBUG [api]     GET /portfolio          { duration_ms: 87 }
14:23:46.001 ⚠️  WARN  [ui]      Form validation        { field: "phone" }
14:23:46.234 🔴 ERROR [api]     POST /transactions failed
                                                       Error: NetworkError ...
```

Tüm satırlar:
- Aynı kolon hizasında (`padEnd`)
- Seviyeye göre renk (yeşil/sarı/kırmızı)
- Emoji ile göz tarama kolay
- Context object expand edilebilir (Chrome devtools)

### 7.3 API Client Interceptor Logging

`frontend/bizboard/src/lib/api/client.ts` güncellemesi:

```typescript
import { logger, newRequestId } from "@/lib/logger";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL not configured");

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const reqId = newRequestId();
  const token = getToken();
  const t0 = performance.now();

  logger.debug("api", `→ ${options.method ?? "GET"} ${path}`, { request_id: reqId });

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": reqId,                              // backend'e taşı
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const dur = Math.round(performance.now() - t0);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      logger.warn("api", `← ${options.method ?? "GET"} ${path} failed`, {
        request_id: reqId, status: res.status, duration_ms: dur, code: body.code,
      });
      throw new ApiError(res.status, body.code ?? "UNKNOWN", body.message ?? res.statusText, reqId);
    }
    logger.debug("api", `← ${options.method ?? "GET"} ${path}`, {
      request_id: reqId, status: res.status, duration_ms: dur,
    });
    return res.json();
  } catch (err) {
    const dur = Math.round(performance.now() - t0);
    logger.error("api", `✗ ${options.method ?? "GET"} ${path}`,
      { request_id: reqId, duration_ms: dur }, err);
    throw err;
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId: string) {
    super(message);
    this.name = "ApiError";
  }
}
```

### 7.4 Error Boundary + Global Error Handler

`frontend/bizboard/src/app/global-error.tsx`:

```typescript
"use client";
import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("boundary", "Unhandled React error", { digest: error.digest }, error);
  }, [error]);

  return (
    <html>
      <body className="bg-surface-900 text-white flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md p-8">
          <h1 className="text-2xl font-bold mb-2">Bir şeyler ters gitti</h1>
          <p className="text-surface-400 mb-6">Hata kayıt edildi. Ekibimiz inceleyecek.</p>
          <button onClick={reset} className="btn-primary">Tekrar dene</button>
        </div>
      </body>
    </html>
  );
}
```

`frontend/bizboard/src/app/providers.tsx` içinde global handlers:

```typescript
useEffect(() => {
  const onError = (e: ErrorEvent) =>
    logger.error("boundary", "window.onerror", { url: e.filename, line: e.lineno }, e.error);
  const onRejection = (e: PromiseRejectionEvent) =>
    logger.error("boundary", "unhandledrejection", {}, e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}, []);
```

### 7.5 Web Vitals & Performance

`frontend/bizboard/src/app/layout.tsx` veya `instrumentation-client.ts`:

```typescript
import { onCLS, onINP, onLCP, onFCP, onTTFB } from "web-vitals";
import { logger } from "@/lib/logger";

function reportVital(name: string, value: number, rating: string) {
  logger.info("perf", `web-vital:${name}`, { value: Math.round(value), rating });
}

onCLS  (m => reportVital("CLS",  m.value, m.rating));
onINP  (m => reportVital("INP",  m.value, m.rating));
onLCP  (m => reportVital("LCP",  m.value, m.rating));
onFCP  (m => reportVital("FCP",  m.value, m.rating));
onTTFB (m => reportVital("TTFB", m.value, m.rating));
```

### 7.6 Production Transport — `/api/logs` Endpoint

**Frontend → Next.js API route → Backend** (CORS bypass, batch).

`frontend/bizboard/src/app/api/logs/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Forward to backend (server-side, no CORS)
  await fetch(`${process.env.BACKEND_URL}/internal/logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Source": "web-client",
    },
    body: JSON.stringify(body),
  }).catch(() => {});                       // sessizce yut
  return NextResponse.json({ ok: true });
}
```

Backend tarafında `LogIngestController`:

```java
@RestController @RequestMapping("/internal/logs")
public class LogIngestController {
    private static final Logger log = LoggerFactory.getLogger("frontend");

    @PostMapping
    public ResponseEntity<Void> ingest(@RequestBody LogBatch batch) {
        for (var r : batch.records()) {
            String level = r.level().toUpperCase();
            // Frontend log'larını backend logger'ına dök → aynı stdout pipeline'ı
            log.atLevel(Level.valueOf(level)).log(r.message(),
                kv("frontend_logger", r.logger()),
                kv("frontend_session", r.session_id()),
                kv("request_id",       r.request_id()),
                kv("url",              r.url()),
                kv("context",          r.context()));
        }
        return ResponseEntity.accepted().build();
    }
}
```

> Bu sayede **tüm sistem logları tek pipeline'da** (stdout → Promtail → Loki).

### 7.7 Sentry Entegrasyonu (Opsiyonel ama Tavsiye Edilir)

`sentry.client.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENV,
  release: process.env.NEXT_PUBLIC_APP_VERSION,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,
  beforeSend(event) {
    // PII scrub
    if (event.user) { event.user.email = undefined; event.user.username = undefined; }
    return event;
  },
});
```

> Sentry sadece **error** seviyesi için. INFO/DEBUG Loki'ye gider. Çift maliyet ödememek için bu ayrım kritik.

### 7.8 Session & Correlation ID

- `session_id`: `sessionStorage`'da tutulur. Tab kapanınca biter (kullanıcı login → logout aralığı için yeterli).
- `request_id`: Her API çağrısında yeni üretilir, FE'de log'da geçer, header olarak BE'ye gider, BE de aynı ID ile log basar.

---

## 8. Audit Trail — KVKK / Compliance

### 8.1 Audit Edilecek 12 Olay

| # | Olay | Action Adı |
|---|------|-----------|
| 1 | Kullanıcı oluşturma | `user.created` |
| 2 | Kullanıcı silme | `user.deleted` |
| 3 | Rol değiştirme | `user.role.changed` |
| 4 | Şifre değişikliği | `user.password.changed` |
| 5 | İşletme oluşturma | `business.created` |
| 6 | İşletme silme | `business.deleted` |
| 7 | Member ekleme/çıkarma | `business.member.added` / `.removed` |
| 8 | Transaction silme | `transaction.deleted` (hard delete sonrası archive log) |
| 9 | Dosya yükleme | `file.uploaded` |
| 10 | Dosya silme | `file.deleted` |
| 11 | Admin login | `admin.login` |
| 12 | Kapalı dönem değişikliği | `period.reopened` / `period.recalculated` |

### 8.2 Audit Log Örneği

```json
{
  "timestamp": "2026-05-11T14:23:45.123Z",
  "level": "INFO",
  "logger": "com.bizboard.audit",
  "log_kind": "audit",
  "request_id": "req-7f3a9c",
  "audit_action": "user.role.changed",
  "actor_id": "uuid-of-admin",
  "actor_role": "admin",
  "target_type": "user",
  "target_id": "uuid-of-affected-user",
  "before": { "role": "viewer" },
  "after":  { "role": "manager" },
  "client_ip": "203.0.113.0/24"
}
```

### 8.3 Saklama

- Dosya: 7 yıl rotate edilmeden (`maxHistory=2555`)
- Loki label: `log_kind="audit"` → ayrı stream, retention farklı
- Backup: günlük S3 Glacier sync

---

## 9. Security Logging — Saldırı Tespiti

### 9.1 Logged Events

| Olay | Severity | Örnek |
|------|----------|-------|
| Başarısız login | INFO | `auth.login.failed` |
| 5 başarısız → lockout | WARN | `auth.lockout.triggered` |
| Yetkisiz erişim denemesi (IDOR) | WARN | `auth.access.denied` |
| Path traversal denemesi | WARN | `file.upload.path_traversal_attempt` |
| JWT validation failure | INFO | `auth.token.invalid` |
| Rate limit hit | INFO | `ratelimit.hit` |
| Admin action | INFO | `admin.action` |

### 9.2 Örnek

```java
SecurityLog.recordFailedLogin(username, ipMasked);
SecurityLog.recordAccessDenied(userId, "business", businessId, "not_member");
SecurityLog.recordPathTraversalAttempt(rawCategory);
```

### 9.3 Slack/PagerDuty Tetikleyici

```
Eğer 5 dakika içinde aynı IP'den auth.login.failed > 10 ise → Slack #security alert.
Eğer file.upload.path_traversal_attempt görüldüyse → PagerDuty Critical.
```

---

## 10. Performance Logging — Yavaş Sorgu / Endpoint

### 10.1 Otomatik Yakalama

| Kaynak | Eşik | Logger |
|--------|------|--------|
| HTTP endpoint | `duration_ms > 1000` | `http.access` (WARN) |
| JPA query | `> 200ms` | `org.hibernate.SQL_SLOW` |
| Service method (`@Logged`) | `> 500ms` | `com.bizboard.perf` |
| FE Web Vital | `LCP > 2500ms` veya rating `poor` | `com.bizboard.frontend` |

### 10.2 Örnek Çıktı

```json
{
  "level": "WARN",
  "logger": "http.access",
  "message": "HTTP GET /finance/overview (slow)",
  "method": "GET",
  "path": "/finance/overview",
  "status": 200,
  "duration_ms": 2837,
  "request_id": "req-...",
  "business_id": "..."
}
```

---

## 11. PII & Hassas Veri Yönetimi

### 11.1 ASLA Log'a Yazılmayacak Alanlar

| Kategori | Örnek |
|----------|-------|
| **Kimlik** | Tam ad, TC kimlik, pasaport, doğum tarihi |
| **İletişim** | E-posta (raw), telefon (raw), adres |
| **Finansal** | Kart no, CVV, IBAN, hesap no |
| **Kimlik Doğrulama** | Şifre, JWT token (full), API key, refresh token |
| **Tıbbi** | Sağlık verisi (yoksa proje şu an) |
| **Lokasyon** | Tam GPS, ev/iş adresi |

### 11.2 Yerine Ne Yazılır?

| İstenen | Log'a Giden |
|---------|-------------|
| Tam ad | `user_id: "uuid"` |
| E-posta | `user_id: "uuid"` veya hash (`sha256(email)[:8]`) |
| Telefon | Maskelenmiş: `5XX-***-XX12` |
| Kart no | Son 4 hane: `****-****-****-1234` |
| JWT | `jwt_id` (jti claim) |
| Tam IP | CIDR/24: `203.0.113.0/24` |

### 11.3 Defense-in-Depth

1. **Geliştirici disiplini:** Kod review'da PII log kontrolü.
2. **MaskingConverter** (Section 6.6): Yanlışlıkla yazılırsa son savunma.
3. **Loki ingestion filter:** Promtail config'inde regex drop (örn: TC kimlik pattern).
4. **CI lint:** `log\..*(getFullName|getEmail|getPhone)` regex → PR fail.

---

## 12. Merkezi Loglama (Centralized) — Loki + Grafana

### 12.1 Topoloji

```
Pod stdout → Promtail (DaemonSet) → Loki → Grafana / Alertmanager
```

### 12.2 Promtail Pipeline Örneği

```yaml
scrape_configs:
  - job_name: bizboard
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: bizboard-(api|web)
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: app
      - source_labels: [__meta_kubernetes_namespace]
        target_label: env
    pipeline_stages:
      - json:
          expressions:
            level:        level
            logger:       logger
            request_id:   request_id
            business_id:  business_id
            log_kind:     log_kind
      - labels:
          level:
          log_kind:
      - drop:
          source: logger
          expression: "org\\.springframework\\.web\\.servlet\\.DispatcherServlet"
      - drop:
          expression: ".*GET /actuator/health.*"
```

### 12.3 Sık Kullanılan LogQL Sorguları

```logql
# Belirli request tüm hayatı
{app="bizboard-api"} | json | request_id="req-abc123"

# Belirli işletmenin son 1 saatteki hataları
{app="bizboard-api", level="ERROR"} | json | business_id="..." [1h]

# Yavaş endpoint'ler
{app="bizboard-api", logger="http.access"} | json | duration_ms > 1000

# IDOR denemeleri
{app="bizboard-api", log_kind="security"} | json | audit_action="auth.access.denied"

# Belirli kullanıcının son aktiviteleri
{app=~"bizboard-.+"} | json | user_id="..." | line_format "{{.timestamp}} {{.level}} [{{.logger}}] {{.message}}"
```

---

## 13. Retention (Saklama) Politikası

| Kategori | Hot (hızlı sorgu) | Warm | Cold (arşiv) | Compliance |
|----------|------------------|------|--------------|-----------|
| Uygulama logu (ROOT) | 30 gün | 60 gün | — | — |
| HTTP access | 30 gün | — | — | — |
| Performance | 90 gün | — | — | — |
| Security | 365 gün | — | 2 yıl S3 | KVKK 2 yıl |
| **Audit** | **365 gün** | **3 yıl** | **7 yıl S3 Glacier** | **KVKK / Vergi 5 yıl + 2** |
| Frontend (web) | 14 gün | — | — | DX odaklı |

> Loki retention: `compactor.retention_enabled: true` + per-stream retention.

---

## 14. Alerting (Uyarı) — Kim Ne Zaman Çağrılır?

### 14.1 Severity Matrix

| Sinyal | Kanal | Süre | Aksiyon |
|--------|-------|------|---------|
| 5xx rate > 1% (5dk) | Slack `#bizboard-alerts` | İş saati | İnceleme |
| 5xx rate > 5% (5dk) | PagerDuty Critical | 7×24 | On-call uyandır |
| P95 latency > 2s (10dk) | Slack | İş saati | Inceleme |
| Audit `period.reopened` | Slack `#compliance` | Anında | Bilgilendirme |
| Security `path_traversal` | PagerDuty Critical | 7×24 | Saldırı incelemesi |
| Login fail spike (>50/dk same IP) | Slack `#security` + auto-block | Anında | WAF rule add |
| Disk usage > 85% | PagerDuty Warning | İş saati | Cleanup / scale |
| App restart (>3/saat) | Slack | İş saati | Stability incelemesi |

### 14.2 Alertmanager Rule Örneği

```yaml
groups:
  - name: bizboard-api
    rules:
      - alert: BizboardApi5xxHigh
        expr: |
          sum(rate({app="bizboard-api", level="ERROR"} | json | status >= 500 [5m]))
          /
          sum(rate({app="bizboard-api"} | json [5m]))
          > 0.05
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "BizBoard API 5xx rate > 5%"
          runbook: "https://wiki.internal/runbooks/bizboard-api-5xx"
```

---

## 15. Dashboard'lar (Grafana)

### 15.1 Operasyonel Dashboard (`Bizboard / Ops`)

- **Top row:** RPS, P50/P95/P99 latency, error rate, throughput
- **Middle:** 4xx/5xx breakdown by endpoint
- **Bottom:** Top 10 slow endpoints, top 10 error messages
- **Sidebar:** request_id arama kutusu (Loki Explore link)

### 15.2 Business Dashboard

- Günlük unique user
- Transaction create/delete count
- Per-business activity heatmap
- New signups

### 15.3 Security Dashboard

- Failed login by hour
- IDOR denemeleri map (CIDR)
- Lockout events
- Path traversal attempts

### 15.4 Frontend Performance

- LCP / INP / CLS dağılımı
- API call latency (FE perspective)
- Error rate by route

---

## 16. Maliyet ve Kapasite Planlaması

### 16.1 Tahmini Log Hacmi

| Kaynak | Olay/dk | Ort. boyut | GB/gün |
|--------|---------|-----------|--------|
| BE INFO (1000 user) | ~5,000 | 500 B | ~3.6 GB |
| BE WARN/ERROR | ~50 | 2 KB | ~0.15 GB |
| Audit | ~100 | 1 KB | ~0.15 GB |
| Security | ~30 | 1 KB | ~0.04 GB |
| HTTP access | ~10,000 | 600 B | ~8.6 GB |
| FE telemetry | ~500 | 500 B | ~0.36 GB |
| **Toplam** | | | **~13 GB/gün** |

### 16.2 Loki Maliyet (S3 backend, self-hosted)

- 13 GB/gün × 30 gün = ~390 GB hot storage
- S3 Glacier (7 yıl audit) — TL bazında ~10-30 TL/ay
- Compute (Loki + Promtail) — küçük cluster ~200-400 TL/ay
- **Toplam ~500-800 TL/ay** (managed alternatif Datadog için 10-50× daha pahalı)

### 16.3 Sampling Stratejisi (Trafik Artarsa)

- HTTP access `2xx` için %10 sample, `4xx`/`5xx` için %100
- DEBUG/TRACE üretimde kapalı
- Health check log kapalı (Promtail'de drop)
- FE telemetry: bot trafiği filter

---

## 17. Geliştirici Deneyimi (DX)

### 17.1 Yerel Geliştirme Akışı

```bash
# Backend
SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run -pl bizboard-api
# Renkli, hizalı, emoji'li çıktı:
# 14:23:45.123 ✅ INFO  [req-...]  [user-...]  TransactionService - Transaction created

# Frontend
NEXT_PUBLIC_LOG_LEVEL=debug npm run dev
# Browser console'da renkli log'lar
```

### 17.2 Bir Hata Nasıl Debug Edilir?

1. Kullanıcı şikayet eder: "14:30'da işlem ekleyemedim"
2. Network tab'da response header'da `X-Request-ID: req-7f3a9c` bul
3. Grafana → `{request_id="req-7f3a9c"}`
4. Frontend click → API call → BE filter → service → repository → DB query → exception **tek view'da**
5. Tek satırda fix önerisi: error_code → runbook link

### 17.3 Yeni Geliştirici Onboarding

- `docs/logging-cheatsheet.md` (bu dosyanın özet versiyonu)
- VS Code snippet: `bblog` → `logger.info("...", "...", { ... })` template
- IntelliJ Live Template: `logi`, `loge`, `logw`

---

## 18. Migrasyon Planı (4 Hafta)

### Hafta 1 — Backend Temel
- [ ] `logstash-logback-encoder` dependency
- [ ] `logback-spring.xml` (dev + prod profile)
- [ ] `MdcCorrelationFilter`
- [ ] `RequestLoggingFilter`
- [ ] `GlobalExceptionHandler` enhancement
- [ ] PII maskeleme regex'leri
- [ ] **Acceptance:** Yerel run'da renkli log, prod profile'da JSON çıktı

### Hafta 2 — Audit + Security + Performance
- [ ] `AuditLog`, `SecurityLog`, `PerfLog` helper class'ları
- [ ] 12 audit olayı için kod ekle (user/business/file CRUD)
- [ ] Hibernate slow query log
- [ ] `@Logged` AOP annotation
- [ ] **Acceptance:** Audit dosyası ayrı yazılıyor, security event'ler Loki label ile filtrelenebilir

### Hafta 3 — Frontend Logger
- [ ] `src/lib/logger.ts`
- [ ] API client interceptor güncellemesi (request_id taşıma)
- [ ] `global-error.tsx` ve global error handler
- [ ] Web Vitals reporter
- [ ] `/api/logs` route + backend `LogIngestController`
- [ ] **Acceptance:** Bir click'in tüm log zinciri Grafana'da tek query ile görülür

### Hafta 4 — Centralized + Alerting
- [ ] Loki + Promtail kurulumu (Helm)
- [ ] Grafana dashboard'lar
- [ ] Alertmanager kuralları
- [ ] Sentry projesi (FE+BE)
- [ ] Runbook docs
- [ ] **Acceptance:** Test ortamında 5xx tetiklenmesi → Slack mesajı geliyor

---

## 19. Anti-Pattern'ler — Yapılmaması Gerekenler

| ❌ Yapma | Neden | ✅ Yap |
|---------|------|--------|
| `log.info("User " + user.getName() + " logged in")` | String concat + PII | `log.info("User login", kv("user_id", id))` |
| `try { ... } catch (Exception e) { log.error(e); return null; }` | Hatayı yutar | Re-throw veya tipli sonuç döndür |
| `log.debug("Big object: " + obj)` | DEBUG kapalı bile olsa toString çalışır | `log.debug("Big object: {}", obj)` |
| `System.out.println` / `console.log` | Pipeline'ı atlar, formatsız | Logger kullan |
| Stack trace'i client'a göndermek | Information disclosure | Sadece error code + request_id |
| Sıkı loop içinde log | Performance yer | Loop dışına özet log |
| Aynı hatayı her seviyede log | Gürültü, alert fatigue | Tek noktada (GlobalExceptionHandler) |
| Token / şifre log | Güvenlik ihlali | `**MASKED**` |
| `log.error` for expected 404 | False alert | `log.info` veya `log.debug` |
| Inline format string `"%s ms"` | Yapısal arama yapamazsın | `kv("duration_ms", n)` |
| Logger field name değişikliği rastgele | Dashboard kırılır | Schema değişikliği → migration ve PR review |

---

## 20. Hızlı Referans Kartları

### 20.1 Backend Cheat Sheet

```java
// Normal info
log.info("User created", kv("user_id", user.getId()));

// Warning with context
log.warn("Cache miss; falling back to DB",
         kv("cache_key", key), kv("ttl_ms", 5000));

// Error with exception
log.error("Failed to send invoice email",
          kv("invoice_id", inv.getId()), ex);

// Audit
AuditLog.record("user.role.changed", "user", userId,
                Map.of("role", "viewer"), Map.of("role", "manager"));

// Security
SecurityLog.recordFailedLogin(usernameHash, ipMasked);

// Performance (manuel, eşik altı önemliyse)
long t0 = System.nanoTime();
// ... iş ...
PerfLog.recordIfSlow("FinanceService.getOverview",
                    (System.nanoTime()-t0)/1_000_000, 500);
```

### 20.2 Frontend Cheat Sheet

```typescript
import { logger } from "@/lib/logger";

logger.info("auth",  "User logged in", { user_id });
logger.warn("ui",    "Form validation", { field: "phone" });
logger.error("api",  "Transaction create failed",
             { request_id, status: 500 }, err);

// User action telemetry
logger.info("ui", "click:dashboard.add-transaction", { business_id });
```

### 20.3 Loki Sorgu Cheat Sheet

```logql
# Hata akışı (son 15 dakika)
{app="bizboard-api", level="ERROR"} | json | line_format "{{.timestamp}} {{.message}}"

# Yavaş endpointler
{app="bizboard-api", logger="http.access"} | json | duration_ms > 1000

# Belirli kullanıcının history'si
{app=~"bizboard-.+"} | json | user_id="0e8a..." | sort by timestamp

# Audit event timeline (compliance)
{log_kind="audit"} | json | actor_id="..." [7d]
```

### 20.4 Field Naming Sözlüğü

| Alan | Tip | Örnek |
|------|-----|-------|
| `request_id` | string | `req-7f3a9c` |
| `trace_id` | string | OpenTelemetry trace |
| `session_id` | string | FE session |
| `user_id` | UUID | `0e8a2c14-...` |
| `business_id` | UUID | `b1b1...` |
| `actor_id` | UUID | Audit log'da işlem yapan |
| `target_type` / `target_id` | string | Audit hedef |
| `audit_action` | string | `user.role.changed` |
| `method` / `path` / `status` | HTTP | `POST` / `/businesses` / `201` |
| `duration_ms` | int | `87` |
| `error.type` / `error.message` / `error.stack` | string | Exception detay |
| `code` | string | İş kuralı kodu: `BIZ-404`, `AUTH-403` |

---

## Ek A — Önerilen Dosya Yapısı

```
backend/bizboard/
├── bizboard-api/
│   └── src/main/
│       ├── java/com/bizboard/api/
│       │   ├── logging/
│       │   │   ├── MdcCorrelationFilter.java
│       │   │   ├── RequestLoggingFilter.java
│       │   │   ├── Logged.java
│       │   │   ├── LoggedAspect.java
│       │   │   ├── MaskingConverter.java
│       │   │   └── LogIngestController.java
│       │   └── exception/
│       │       └── GlobalExceptionHandler.java
│       └── resources/
│           ├── logback-spring.xml
│           ├── application.yml
│           ├── application-dev.yml
│           └── application-prod.yml
│
└── bizboard-common/
    └── src/main/java/com/bizboard/
        ├── audit/AuditLog.java
        ├── security/SecurityLog.java
        └── perf/PerfLog.java

frontend/bizboard/
└── src/
    ├── lib/
    │   └── logger.ts
    └── app/
        ├── api/logs/route.ts
        ├── global-error.tsx
        └── providers.tsx   (global error handlers)
```

---

## Ek B — Sık Sorulanlar

**S: Geliştirmede neden Loki'ye log atmıyoruz?**
C: Yerel iterasyon hızı için. Konsol > 30ms, ağ > 100ms. Üretim format'ını dev'de zorunlu kılmak DX'i yavaşlatır.

**S: Production'da `console.log` ne olur?**
C: `logger`'ı bypass eder, hiç gönderilmez. ESLint kuralıyla yasaklanmalı:
```json
"no-console": ["error", { "allow": ["warn", "error"] }]
```

**S: Multi-instance'da MDC nasıl çalışır?**
C: MDC ThreadLocal'dir, her request kendi MDC'sini taşır. Async iş (CompletableFuture, @Async) yaparsanız MDC kopyalamanız gerekir:
```java
Map<String,String> ctx = MDC.getCopyOfContextMap();
CompletableFuture.runAsync(() -> { MDC.setContextMap(ctx); /* iş */ });
```

**S: Loki yerine Elastic kullansak?**
C: Daha güçlü full-text arama ama 5-10× daha pahalı ve operasyonel yük yüksek. 100 GB/gün altı için Loki yeterli.

**S: Sentry zorunlu mu?**
C: Hayır, ama frontend için **şiddetle tavsiye edilir** — source map upload + release tracking + session replay (on-error) ile bug üretim sürecini hızlandırır.

**S: KVKK için ne yeterli?**
C: Audit log 5+2 = 7 yıl tutulmalı (vergi mevzuatı), erişim kayıtlı olmalı, silme talebi (right to be forgotten) için audit kayıtlarında user_id → anonymized hash mapping ayrı tutulmalı.

---

**Döküman sonu.** Bu tasarım uygulandığında BizBoard:
- Hata teşhis süresini saatlerden **dakikalara** indirir.
- KVKK/audit gereksinimlerini karşılar.
- Saldırıları **gerçek zamanlı** tespit eder.
- Yeni geliştiriciye onboarding'i **standartlaştırır**.
- Üretim maliyetini **kontrol altında** tutar.

İlerleyen sürümlerde eklenmesi düşünülenler:
- OpenTelemetry distributed tracing (Jaeger/Tempo)
- Real User Monitoring (RUM)
- Anomaly detection (Loki ML, Prometheus anomaly)
- Auto-remediation runbook'ları (Slack bot ile)
