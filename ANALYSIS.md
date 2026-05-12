# BizBoard — Ultra Detaylı Mimari, Güvenlik ve Üretim Hazırlığı Analizi

> **Hedef Okuyucu:** Proje sahipleri, mimarlar, lead developerlar, güvenlik mühendisleri ve DevOps ekipleri.
> **Versiyon:** 1.0
> **Tarih:** 2026-05-08
> **Kapsam:** `backend/bizboard` (Spring Boot 3.4.3 multi-module Maven, Java 21, PostgreSQL) ve `frontend/bizboard` (Next.js 14.2 App Router, React 18, TypeScript 5, Tailwind, Zustand).
> **Yöntem:** Tüm modüller dosya bazında okunmuş; entity/repository/service/controller katmanları, security stack, frontend route/component/hook/store/API client kompozisyonu incelenmiştir.

---

## İçindekiler

1. [Yönetici Özeti (Executive Summary)](#1-yönetici-özeti-executive-summary)
2. [Genel Mimari Bakış](#2-genel-mimari-bakış)
3. [Backend Detaylı Analizi](#3-backend-detaylı-analizi)
   - 3.1 Modül Yapısı
   - 3.2 Konfigürasyon (`application.yml`)
   - 3.3 Veri Modeli & Entity Katmanı
   - 3.4 Repository Katmanı
   - 3.5 Service Katmanı (İş Mantığı)
   - 3.6 Controller Katmanı (REST API)
   - 3.7 Güvenlik Mimarisi (Spring Security + JWT)
   - 3.8 Dosya Yükleme Modülü
   - 3.9 Hata Yönetimi & Logging
   - 3.10 Zamanlanmış İşler (Scheduled Jobs)
4. [Frontend Detaylı Analizi](#4-frontend-detaylı-analizi)
   - 4.1 Stack ve Yapılandırma
   - 4.2 Authentication & Route Koruması
   - 4.3 State Management (Zustand)
   - 4.4 API Client & Tip Senkronizasyonu
   - 4.5 Sayfa & Bileşen Mimarisi
   - 4.6 Performance
   - 4.7 PWA
   - 4.8 UX/UI Eksiklikleri
5. [Frontend ↔ Backend Uyumu (Contract Compliance)](#5-frontend--backend-uyumu-contract-compliance)
6. [Güvenlik Açıkları — Tam Liste](#6-güvenlik-açıkları--tam-liste)
   - 6.1 Backend Açıkları
   - 6.2 Frontend Açıkları
   - 6.3 Açık Bazlı Patch Yol Haritası
7. [Performance & Ölçeklenebilirlik (Büyük Veri Senaryoları)](#7-performance--ölçeklenebilirlik-büyük-veri-senaryoları)
8. [Üretim (Production) Hazırlığı Checklist](#8-üretim-production-hazırlığı-checklist)
9. [Önerilen Yeni Özellikler ve Roadmap](#9-önerilen-yeni-özellikler-ve-roadmap)
10. [Mimari İyileştirme Önerileri](#10-mimari-iyileştirme-önerileri)
11. [Sonuç ve Öncelik Sıralaması](#11-sonuç-ve-öncelik-sıralaması)

---

## 1. Yönetici Özeti (Executive Summary)

**Proje:** BizBoard, birden fazla işletmenin (`Business`) mali (gelir/gider, sabit gider, borç/alacak), operasyonel (envanter, araç, yakıt, bakım), insan kaynağı (personel) ve evrak yönetimini tek panelden sağlayan Türkçe bir SaaS yönetim panelidir.

**Genel Olgunluk Skoru (1–10):**

| Alan | Skor | Açıklama |
|------|------|---------|
| Mimari & Modülerlik | 7/10 | Multi-module Maven, katmanlı backend; iyi temel ama servisler şişkin |
| Tip Güvenliği | 7/10 | Backend tip güvenli, frontend çoğunlukla; manuel tip drift riski |
| Veri Modeli | 6/10 | UUID + audit field iyi, fakat `@Index`, `@Version`, soft delete eksik |
| Performance | 5/10 | Index yok, pagination eksik, N+1 sorun, full table scan |
| Güvenlik | **3.5/10** | **Birden fazla CRITICAL/HIGH açık (IDOR, path traversal, XSS, open redirect, default secret)** |
| UX/UI | 8/10 | Mobile-first, dark theme, iyi skeleton'lar; optimistic update yok |
| Test Kapsama | **0/10** | **Sıfır test (backend ve frontend)** |
| Observability | 2/10 | `SLF4J` log var fakat audit/metric/trace yok |
| DevOps Hazırlığı | 2/10 | Dockerfile yok, migration tool yok (Flyway/Liquibase), CI/CD yok |

**En Kritik 5 Bulgu (Production Çıkmadan Önce Düzeltilmesi Şart):**

1. **🔴 IDOR — Çoklu kontrolcüde authorization eksikliği:** `EmployeeController`, `FixedCostController`, `VehicleController`, `InventoryController`, `FileController.delete` kullanıcının business sahipliğini doğrulamadan işlem yapıyor. Bir kullanıcı diğer firmanın personelini, dosyasını silebilir.
2. **🔴 Path Traversal & Unsafe File Upload:** `FileStorageService` `category` parametresini doğrulamıyor; `category=../../etc` mümkün. MIME sadece client header'ından, magic byte kontrolü yok.
3. **🔴 JWT Token localStorage'de + Open Redirect:** Frontend token'ı `localStorage`'a yazıyor (XSS ile çalınabilir). Middleware'de `redirect` query parametresi doğrulanmadan yönlendiriliyor.
4. **🔴 Hardcoded Secrets & Default Credentials:** `application.yml` JWT secret fallback hardcoded, default `admin/admin123` user (`seed-data.sql`), `ddl-auto: update` üretim modunda.
5. **🔴 Race Condition (Personel/Araç Sabit Gider Otomatik Sync):** `EmployeeService.updatePersonnelFixedCost` ve `VehicleService.updateVehicleRentalFixedCost` "find then create" pattern → eşzamanlı çağrılarda duplicate `FixedCost` oluşur.

---

## 2. Genel Mimari Bakış

### 2.1 Yüksek Seviye Diyagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          KULLANICI (Browser / PWA)                    │
└──────────────────┬───────────────────────────────────────────────────┘
                   │ HTTPS (planlanmalı)
                   │
┌──────────────────▼─────────────────────────────────────────────────┐
│   Next.js 14 App Router (frontend/bizboard, port 3000)            │
│   ┌──────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│   │ App      │  │ Components │  │ Zustand    │  │ middleware.ts│  │
│   │ Router   │  │ (server +  │  │ store      │  │ (auth gate)  │  │
│   │ pages    │  │  client)   │  │            │  │              │  │
│   └──────────┘  └────────────┘  └────────────┘  └──────────────┘  │
│                                                                    │
│   Token: localStorage + cookie (Lax SameSite)                     │
└──────────────────┬─────────────────────────────────────────────────┘
                   │ fetch + Authorization: Bearer <jwt>
                   │ CORS: localhost:3000 allowed
                   │
┌──────────────────▼─────────────────────────────────────────────────┐
│   Spring Boot 3.4.3 (backend/bizboard-api, port 8080)             │
│   ┌──────────────────────────────────────────────────────────────┐│
│   │ JwtAuthenticationFilter → SecurityFilterChain                ││
│   │ /auth/** permitAll, /admin/** ROLE_ADMIN, geri kalanı auth   ││
│   └──────────────────────────────────────────────────────────────┘│
│   ┌──────────────────────────────────────────────────────────────┐│
│   │ Controllers (REST) → Services (Business Logic) → Repos (JPA) ││
│   │ DtoMapper (manual)                                           ││
│   │ FileStorageService (local disk: ./uploads/<category>)        ││
│   │ Scheduled jobs: SummaryService.closeMonth, LedgerService     ││
│   └──────────────────────────────────────────────────────────────┘│
└──────────────────┬─────────────────────────────────────────────────┘
                   │ JDBC
                   │
┌──────────────────▼─────────────────────────────────────────────────┐
│   PostgreSQL 15+ (DB: bizboard)                                   │
│   Hibernate ddl-auto: update (⚠️ production riski)                │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 Mimari Kararlar — Doğrular

- ✅ **Stateless JWT auth** — yatay ölçeklenebilir.
- ✅ **Multi-module Maven** — `common`, `repository`, `security`, `service`, `api` ayrımı temiz katmanlama.
- ✅ **UUID primary key** — distributed ID üretimi, predictable ID exposure önlenmiş.
- ✅ **`@CreationTimestamp` / `@UpdateTimestamp`** — entity'lerde tutarlı audit alanları.
- ✅ **`EnumType.STRING`** — enum reorder güvenliği.
- ✅ **BCrypt** — endüstri standardı password hashing.
- ✅ **App Router + middleware** — modern Next.js, edge-level auth gate.
- ✅ **TypeScript `strict: true`** — frontend tip güvenliği temeli.
- ✅ **Dark-mode-first Tailwind config** — markaya uygun tutarlı tema.
- ✅ **PWA support** — mobil-benzeri kurulum.
- ✅ **Mobile-first responsive (44×44 touch target)** — erişilebilirlik için doğru başlangıç.

### 2.3 Mimari Kararlar — Eksikler / Yanlışlar

| # | Karar | Sorun | Sonuç |
|---|-------|-------|-------|
| 1 | `ddl-auto: update` | Migration aracı yok | Schema drift, prod'da veri kaybı riski |
| 2 | Tek instance, tek DB | Read replica yok | Yoğun finansal raporlar primary'yi yavaşlatır |
| 3 | Local disk file storage | `./uploads`, container restart'ta kaybolur | Üretimde S3/MinIO şart |
| 4 | `application.yml` profil yok | `dev`/`prod` ayrımı yok | Üretim config karması |
| 5 | API versioning yok | `/businesses` (versionless) | Breaking change zorlaşır |
| 6 | OpenAPI/Swagger yok | Frontend manuel tip yazıyor | Drift kaçınılmaz |
| 7 | Single-tenant izolasyonu sadece app katmanında | DB row-level security yok | Service'de unutulan kontrol = veri sızıntısı |
| 8 | Cache yok (Redis vb.) | Her istek DB'ye gider | Düşük throughput |
| 9 | Async/event bus yok (Kafka/RabbitMQ) | Email/notification senkron | Slow request, retry yok |
| 10 | Test yok | 0% coverage | Refactor riski yüksek |

---

## 3. Backend Detaylı Analizi

### 3.1 Modül Yapısı

```
backend/bizboard/
├── pom.xml (parent — Spring Boot 3.4.3, Java 21, JJWT 0.12.6)
├── bizboard-common      → Entity (~25 sınıf), DTO (~50 sınıf), Enum
├── bizboard-repository  → JPA repository (~20 interface)
├── bizboard-security    → JwtUtil, JwtAuthenticationFilter, SecurityConfig,
│                          UserPrincipal, CustomUserDetailsService
├── bizboard-service     → 14 servis sınıfı (~155 KB toplam)
└── bizboard-api         → 16 REST controller, BizBoardApplication, application.yml
```

**Bağımlılık yönü:** `api → service → repository → common`. `security` modülü `repository` ve `common`'a bağlı. **Cyclic bağımlılık tespit edilmedi (✅).**

**Eksiklikler:**
- ❌ `bizboard-test` modülü yok.
- ❌ `bizboard-integration-test` yok.
- ❌ `bizboard-migration` (Flyway/Liquibase) yok.

### 3.2 Konfigürasyon (`application.yml`)

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/bizboard
    username: ${DB_USERNAME:postgres}      # ⚠️ default postgres
    password: ${DB_PASSWORD:postgres}      # ⚠️ default postgres
  jpa:
    hibernate:
      ddl-auto: update                     # 🔴 production riski
app:
  jwt:
    secret: ${JWT_SECRET:bizboard-super-secret-key-...}  # 🔴 hardcoded fallback
    expiration-ms: 604800000               # ⚠️ 7 gün, refresh token yok
spring.servlet.multipart:
  max-file-size: 10MB
  max-request-size: 15MB
app.file:
  upload-dir: ./uploads                    # ⚠️ relative path, container'da kaybolur
management.endpoints.web.exposure.include: health  # ✅
```

**Kritik Sorunlar:**

| # | Ayar | Sorun | Çözüm |
|---|------|-------|-------|
| 1 | `ddl-auto: update` | Üretimde schema drift, partial rollback yok | `validate` + Flyway/Liquibase migration |
| 2 | Default JWT secret | Env var miss → herkes secret'ı bilir | Fallback'i kaldır, app start'ta fail-fast |
| 3 | Default DB password | Brute force ile kolay erişim | Default'u kaldır, mandatory env var |
| 4 | Profile yok | dev/staging/prod ayrımı yok | `application-{profile}.yml` |
| 5 | Token süresi 7 gün | Çalınan token uzun süre geçerli | 15dk access + 7g refresh |
| 6 | `./uploads` relative | Container/pod restart'ta kaybolur | Absolute path veya S3 |
| 7 | Logging config yok | Default INFO, structured log yok | logback-spring.xml + JSON appender |

### 3.3 Veri Modeli & Entity Katmanı

**Toplam Entity (20 adet):**
`User`, `Business`, `BusinessMember`, `BusinessType`, `BusinessModule`, `Category`, `Transaction`, `Debt`, `Employee`, `Vehicle`, `FixedCost`, `InventoryItem`, `FuelLog`, `MaintenanceLog`, `BusinessNote`, `FileUpload`, `Notification`, `ClosedPeriodSummary`, `DeletedTransactionLog`, `LedgerWaitListEntry`.

#### 3.3.1 İlişki Şeması (Metinsel ER)

```
User
 ├─ 1:N → Business (owner_id) [LAZY]
 ├─ 1:N → BusinessMember (user_id) [⚠️ EAGER]
 ├─ 1:N → Transaction (created_by) [LAZY]
 ├─ 1:N → Debt (created_by)
 ├─ 1:N → BusinessNote (created_by)
 └─ 1:N → Notification

Business
 ├─ N:1 → BusinessType [⚠️ EAGER]
 ├─ 1:N → BusinessMember [CascadeType.ALL, orphanRemoval=true]
 ├─ 1:N → BusinessModule [CascadeType.ALL, orphanRemoval=true]
 ├─ 1:N → Category, Transaction, Debt, Employee, Vehicle,
 │        FixedCost, InventoryItem, BusinessNote, ClosedPeriodSummary

InventoryItem
 ├─ 1:N → FuelLog
 └─ 1:N → MaintenanceLog
```

#### 3.3.2 Tasarım Kalitesi

**Güçlü:**
- ✅ UUID primary key (tüm entity'lerde)
- ✅ `@CreationTimestamp` + `@UpdateTimestamp` audit alanları
- ✅ `BigDecimal(15,2)` finansal alanlarda
- ✅ `EnumType.STRING` tutarlı kullanım
- ✅ `User.username` ve `User.email` `unique=true`
- ✅ `ClosedPeriodSummary` composite unique `(business_id, year, month)`

**Sorunlar:**

| # | Sorun | Etki | Öncelik |
|---|-------|------|---------|
| 1 | Hiçbir entity'de `@Index` yok | Büyük tablolarda full scan | 🔴 HIGH |
| 2 | `Business.businessType` EAGER | N+1 + her business yüklenmesinde tip de yükleniyor | 🟡 MEDIUM |
| 3 | `BusinessMember.user` EAGER | İşletme listesi N×M sorguya patlar | 🔴 HIGH |
| 4 | `@Version` (optimistic lock) yok | Concurrent update last-write-wins | 🟡 MEDIUM |
| 5 | Soft delete tutarsız | Transaction hard, Employee soft, Note hard | 🟡 MEDIUM |
| 6 | `User.accessibleBusinesses` denormalize string `"uuid1,uuid2"` | Parse hatası, FK yok, ManyToMany olmalı | 🔴 HIGH |
| 7 | `BusinessMember.permissions` `Map<String,Boolean>` JSONB | Type-unsafe, IDE autocompleti yok | 🟡 MEDIUM |
| 8 | `FileUpload.entityType/entityId` denormalize string + UUID | Orphan satırlar oluşur | 🟡 MEDIUM |
| 9 | `LedgerWaitListEntry.transactionId` FK yok | Orphan, JOIN imkansız | 🟡 MEDIUM |
| 10 | `Vehicle.avgFuelConsumption(5,2)` | Max 999.99 (yeterli ama tutarsız) | 🟢 LOW |
| 11 | `BusinessNote` hard delete, audit log yok | Silindi mi belli değil | 🟢 LOW |

**Önerilen Index Listesi (Migration'da Eklenmeli):**

```sql
CREATE INDEX idx_tx_business_date     ON transactions (business_id, date DESC);
CREATE INDEX idx_tx_business_dir      ON transactions (business_id, direction);
CREATE INDEX idx_tx_category          ON transactions (category_id);
CREATE INDEX idx_tx_created_by        ON transactions (created_by);
CREATE INDEX idx_business_owner       ON businesses (owner_id);
CREATE INDEX idx_business_active      ON businesses (is_active);
CREATE INDEX idx_debt_business_settled ON debts (business_id, is_settled);
CREATE INDEX idx_debt_due_date        ON debts (due_date);
CREATE INDEX idx_employee_biz_active  ON employees (business_id, is_active);
CREATE INDEX idx_vehicle_biz_active   ON vehicles (business_id, is_active);
CREATE INDEX idx_fc_biz_active        ON fixed_costs (business_id, is_active);
CREATE INDEX idx_inv_biz_active       ON inventory_items (business_id, is_active);
CREATE INDEX idx_notif_user_read      ON notifications (user_id, is_read);
CREATE INDEX idx_file_entity          ON file_uploads (entity_type, entity_id);
-- partial / functional
CREATE INDEX idx_tx_year_month        ON transactions (business_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date));
```

### 3.4 Repository Katmanı

**Toplam:** 20 repository interface'i, hiçbiri `JpaSpecificationExecutor` implement etmiyor.

**Custom `@Query` örnekleri:**

- `BusinessRepository.findAllAccessibleByUser` — `DISTINCT b LEFT JOIN b.members m WHERE b.owner.id = :userId OR m.user.id = :userId` → ❗ kartezyen patlama riski + `EAGER businessType` ile birleşince N+1.
- `TransactionRepository.findByBusinessIdAndMonth` — `YEAR()/MONTH()` PostgreSQL specific.
- `LedgerWaitListRepository.findDistinctUnprocessedPeriods` — `Object[]` döner, type-safe değil.

**Pagination Durumu:**

| Repository | Pageable | Risk |
|------------|----------|------|
| `TransactionRepository` | ✅ | OK |
| `DeletedTransactionLogRepository` | ✅ | OK |
| Diğer 18 repository | ❌ | **List<...> tüm satırları memory'ye yükler.** |

> 1 milyon `transactions` row'u olan bir işletmede `findByBusinessIdOrderByDateDesc(id, Pageable.unpaged())` çağrısı OOM (out-of-memory) yapabilir.

**Aggregation/Reporting Sorgu Yokluğu:**
- `SUM`, `AVG`, `GROUP BY` repository'de yok.
- Tüm finansal toplamlar **uygulama katmanında stream + reduce** ile hesaplanıyor.
- Sonuç: 100k tx için 100k satır network'te taşınıyor → 100MB+ payload mümkün.

**Çözüm Şablonu:**

```java
@Query("SELECT t.category.id AS categoryId, SUM(t.amount) AS total " +
       "FROM Transaction t " +
       "WHERE t.business.id = :businessId AND t.direction = :direction " +
       "AND t.date BETWEEN :start AND :end " +
       "GROUP BY t.category.id")
List<CategoryAggregateProjection> aggregateByCategory(
    @Param("businessId") UUID businessId,
    @Param("direction") TransactionDirection direction,
    @Param("start") LocalDate start,
    @Param("end") LocalDate end);
```

### 3.5 Service Katmanı (İş Mantığı)

**14 servis sınıfı, en büyük 5:**

| Servis | Boyut | Kompleksite |
|--------|-------|-------------|
| `FinanceService` | 22 KB / ~480 LOC | Çok yüksek — `getFinanceOverview()` 200+ satır |
| `SummaryService` | 18 KB | Yüksek — kapanış (cron) + breakdown |
| `InventoryService` | 17 KB | Yüksek |
| `VehicleService` | 14 KB | Orta — sabit gider sync |
| `LedgerService` | 13 KB | Yüksek — geriye dönük reconciliation |

#### 3.5.1 Tespit Edilen Spesifik Sorunlar

**1. Authorization Eksikliği (🔴 CRITICAL):**

| Servis | Method | Eksik Kontrol |
|--------|--------|---------------|
| `EmployeeService.*` | Tümü | `businessId` ownership'i hiç sorulmuyor |
| `FixedCostService.*` | Tümü | Aynı |
| `VehicleService.*` | Tümü | Aynı |
| `InventoryService.delete*` | Bazı method'lar | İlk kontrol sonra geçiş, exit yok |
| `FileStorageService.deleteFile` | DELETE | Authentication var, owner check yok |
| `FileStorageService.getFilesByEntity` | LIST | Sadece `isAdmin` flag, entity owner kontrolü yok → IDOR |

**Örnek Saldırı:**
```http
DELETE /businesses/<RAKİP-FİRMA-UUID>/employees/<personel-uuid>
Authorization: Bearer <my-token>
```
Controller ve service kontrol etmiyor → silinir.

**2. Race Condition (🔴 HIGH):**

```java
// EmployeeService.updatePersonnelFixedCost - özet
List<FixedCost> existing = repo.findByBusinessIdAndType(businessId, "PERSONNEL");
if (existing.isEmpty()) {
    repo.save(new FixedCost(...));   // ← iki thread aynı anda buradan geçer
} else {
    existing.get(0).setAmount(total);
    repo.save(existing.get(0));
}
```
İki paralel işçi ekleme isteği → iki adet `FixedCost` satırı.

**Çözüm:** `unique constraint(business_id, type, source_kind)` + `INSERT ... ON CONFLICT ... DO UPDATE` (PostgreSQL upsert) ya da `@Lock(PESSIMISTIC_WRITE)`.

**3. N+1 ve Tam Tablo Tarama (🔴 HIGH):**

```java
// FinanceService.getFinanceOverview
for (UUID bizId : businessIds) {
    allFixedCosts.addAll(
        fixedCostRepository.findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(bizId)
    );
}
```
50 işletme = 50 sorgu. Çözüm: `findByBusinessIdInAndActiveTrue(List<UUID>)`.

```java
// LedgerService.fullReconciliation
List<Transaction> allTx = transactionRepository
    .findByBusinessIdOrderByDateDesc(business.getId(),
        PageRequest.of(0, Integer.MAX_VALUE));   // ❗ tüm geçmişi RAM'e
```
`Integer.MAX_VALUE` ile pagination amacı dışına çıkmış. Çözüm: `Stream<Transaction>` + `@QueryHint(HINT_FETCH_SIZE)` veya batch loop.

**4. Timezone Bug (🟡 MEDIUM):**

```java
LocalDate.now()                 // server timezone'a göre
@Scheduled(cron = "0 5 0 1 * *") // sunucu saati, zone tanımsız
```
Dağıtım Frankfurt'ta (UTC) ise Türkiye için 03:05 yerine 00:05 çalışır → **31 Mart yerine 1 Nisan başlangıcı raporlanır.**

**Çözüm:**
```java
@Scheduled(cron = "0 5 0 1 * *", zone = "Europe/Istanbul")
ZoneId TZ = ZoneId.of("Europe/Istanbul");
LocalDate today = LocalDate.now(TZ);
```

**5. BigDecimal Hatası (🟡 MEDIUM):**

```java
case "WEEKLY" -> fc.getAmount().multiply(BigDecimal.valueOf(4.33))  // ❗ yanlış
```
30/7 ≈ 4.2857… → 1000 TL haftalık gider 4330 yerine 4286 olmalı (~%1 fark).

**Çözüm:**
```java
private static final BigDecimal WEEKS_PER_MONTH =
    new BigDecimal("30").divide(new BigDecimal("7"), 6, RoundingMode.HALF_UP);
```

**6. Logging — PII / Hassas Bilgi (🟡 MEDIUM):**

```java
log.info("Personel olusturuldu: {} - isletme={}",
         employee.getFullName(), business.getName());
log.info("Geriye donuk islem tespit edildi: {} {}/{} -> wait list'e eklendi",
         business.getName(), year, month);
```
GDPR/KVKK altında **tam ad ve işletme adı** hassas. Log'lara entity ID'leri ekle, PII'yi ayrı bir audit kanalına gönder.

**7. Eventual Consistency Sorunu:**

`ClosedPeriodSummary` sadece **gece 03:30 cron**'unda güncelleniyor. Geriye dönük transaction eklenirse rapor sabaha kadar tutarsız. Real-time rapor için ya cron'u çağrı bazlı tetikle, ya da `WaitList` boş değilse sorgu sırasında tetikle.

**8. `@Transactional` Kullanımı:**
- Çoğu servis `@Transactional` veya `@Transactional(readOnly = true)` kullanıyor (✅).
- Isolation seviyesi belirtilmemiş (default `READ_COMMITTED`) — finans için yeterli ama `recalculateAndUpdatePeriod` gibi metodlar `SERIALIZABLE` veya advisory lock ister.
- Propagation belirtilmemiş — nested transaction senaryolarında `REQUIRED` defaultuna bel bağlanıyor.

#### 3.5.2 DtoMapper

- Manuel mapping (`DtoMapper.java`).
- ✅ Bağımlılık yok.
- ❌ Test edilmemiş, field eklenince güncellenmesi unutulur.
- **Öneri:** MapStruct → compile-time generated, type-safe, performans olarak %15-20 daha hızlı.

### 3.6 Controller Katmanı (REST API)

**16 controller**, hepsi `@RestController`.

**Endpoint Sayıları (yaklaşık):**

| Controller | Endpoint Sayısı |
|------------|----------------|
| `BusinessController` | ~12 |
| `DebtController` | ~8 |
| `EmployeeController` | ~7 |
| `FixedCostController` | ~5 |
| `VehicleController` | ~9 |
| `InventoryController` | ~8 |
| `FileController` | ~7 |
| `AdminController` | ~4 |
| Diğer | ~25 |
| **Toplam** | **~85 endpoint** |

#### 3.6.1 Sorunlar

| # | Sorun | Detay | Öncelik |
|---|-------|-------|---------|
| 1 | `@PreAuthorize` / `@Secured` **yok** | Tüm authorization manuel inline | 🔴 HIGH |
| 2 | Bazı controller'lar `@AuthenticationPrincipal UserPrincipal` parametresini bile almıyor (Employee/FixedCost/Vehicle/Inventory) | Service'e businessId kör güveniyor | 🔴 CRITICAL |
| 3 | Pagination yok (sadece `limit` int param) | `Pageable` kullanılmıyor | 🟡 MEDIUM |
| 4 | API versioning yok (`/v1` prefix yok) | Breaking change zorlaşır | 🟡 MEDIUM |
| 5 | OpenAPI/Swagger yok | Frontend manuel tip yazıyor | 🟡 MEDIUM |
| 6 | Idempotency-Key başlığı yok | POST tekrarında duplicate transaction | 🟡 MEDIUM |
| 7 | `@Min/@Max` query param validation yok | `?months=-50` veya `?limit=999999` | 🟡 MEDIUM |
| 8 | UUID `@PathVariable` validation yok | Yanlış formatta `IllegalArgumentException` (handler 400 dönüyor — yine de kötü UX) | 🟢 LOW |
| 9 | Response code'lar tutarsız (bazen `ResponseEntity.ok()`, bazen `ResponseEntity<X>` direct) | Standardizasyon eksik | 🟢 LOW |
| 10 | `EmployeeController`/`FixedCostController` `@Valid` kullanmıyor | Backend tarafında payload validation yok | 🟡 MEDIUM |

### 3.7 Güvenlik Mimarisi (Spring Security + JWT)

#### 3.7.1 SecurityConfig

```java
http
  .cors(c -> c.configurationSource(corsConfig()))
  .csrf(csrf -> csrf.disable())                           // ⚠️ stateless için kabul edilebilir
  .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
  .authorizeHttpRequests(req -> req
      .requestMatchers("/auth/**").permitAll()
      .requestMatchers("/actuator/health").permitAll()
      .requestMatchers("/admin/**").hasRole("ADMIN")
      .anyRequest().authenticated())
  .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
```

CORS:
```java
allowedOrigins = List.of("http://localhost:3000")  // ⚠️ env-driven olmalı
allowedHeaders = List.of("*")
allowCredentials = true
```

#### 3.7.2 JwtUtil & Filter

- HS256 algoritması, secret env'den okunuyor (default fallback hardcoded ⚠️).
- Token süresi 7 gün, **refresh token yok**.
- `validateToken` sessizce `false` döner (`catch (Exception e)`), exception detayı log'lanmaz → debug zor.
- Filter `OncePerRequestFilter` — doğru.

#### 3.7.3 UserPrincipal

```java
@Override public boolean isAccountNonLocked() { return true; }   // hardcoded
@Override public boolean isAccountNonExpired() { return true; }
@Override public boolean isCredentialsNonExpired() { return true; }
@Override public boolean isEnabled() { return true; }
```
**Account lockout, brute force koruması yok.**

#### 3.7.4 Admin Default Credentials

`seed-data.sql` içinde:
```sql
v_admin_id UUID := '8e65c1da-020b-4153-8d1f-d461ad2bd888';
-- admin/admin123 olarak BCrypt hash'i ekleniyor
```
README'de **kullanıcı adı: `admin`, şifre: `admin123`** olarak yazılı. Üretime geçişte mutlaka silinmeli.

### 3.8 Dosya Yükleme Modülü

`FileStorageService` ve `FileController` üzerinden yönetilir.

**Pozitifler:**
- ✅ MIME whitelist (`image/*`, PDF, Office, txt, csv).
- ✅ Max 10 MB (servis seviyesinde de kontrol).
- ✅ Saklanan dosya adı UUID + uzantı.
- ✅ Image inline, diğerleri attachment (XSS azaltıcı).
- ✅ `admin_only` flag privilege escalation testi yapılıyor.

**Açıklar:**

| # | Açık | Detay | Öncelik |
|---|------|-------|---------|
| 1 | **MIME magic byte kontrolü yok** | Saldırgan `Content-Type: application/pdf` ile `.exe` yükleyebilir | 🔴 CRITICAL |
| 2 | **`category` parametresi validate edilmiyor** | `category=../../etc` → `rootLocation.resolve("../../etc")` | 🔴 CRITICAL |
| 3 | **`getFilesByEntity` IDOR** | Entity sahipliği kontrol yok, `entity_id` bilen herkes listeler | 🔴 CRITICAL |
| 4 | **`deleteFile` authorization yok** | Authenticated her kullanıcı her dosyayı silebilir | 🔴 CRITICAL |
| 5 | Original filename sanitization yok | Disk'e yazılmıyor ama metadata'da raw saklanıyor | 🟡 MEDIUM |
| 6 | Antivirus tarama yok | Yüklenen dosyalar sunucuya virüs taşıyabilir | 🟡 MEDIUM |
| 7 | Disk yer dolma koruması yok | DoS — sürekli yükleme ile disk doldurma | 🟡 MEDIUM |
| 8 | Dosya yer değiştirme/dış paylaşım URL yok | Pre-signed URL pattern yok | 🟢 LOW |

### 3.9 Hata Yönetimi & Logging

**`GlobalExceptionHandler`:**
- `IllegalArgumentException` → 400 (mesaj client'a gider)
- `SecurityException` → 403
- `BadCredentialsException` → 401 ("Kullanici adi veya sifre hatali")
- `MethodArgumentNotValidException` → 400 (**field name + mesaj client'a gider** ⚠️ info disclosure)
- Diğer `RuntimeException`/`Exception` için generic handler **yok** → 500 stack trace dönebilir.

**Logging:**
- `SLF4J + Logback` (Spring Boot default).
- `logback-spring.xml` özel konfigürasyon yok → INFO seviye, plain text.
- **Sorunlar:**
  - PII log'u (yukarıda bahsedildi).
  - Korelasyon ID (request ID) yok.
  - JSON formatlı yapısal log yok (ELK/Loki entegrasyonu zor).
  - Audit log (kim ne yaptı) yok.

### 3.10 Zamanlanmış İşler

| Job | Cron | Risk |
|-----|------|------|
| `SummaryService.closeMonth` | `0 5 0 1 * *` (her ayın 1'i 00:05) | Timezone tanımsız, retry yok, dağıtık çalışmada birden fazla instance aynı anda çalışır |
| `LedgerService.processWaitList` | `0 30 3 * * *` (her gün 03:30) | Aynı problemler |

**Çözüm:**
- `zone = "Europe/Istanbul"` ekle.
- Distributed lock (ShedLock + Postgres advisory lock) → birden fazla instance'da aynı job tek seferde çalışır.
- Hata durumunda retry/alert.

---

## 4. Frontend Detaylı Analizi

### 4.1 Stack ve Yapılandırma

| Bileşen | Versiyon | Notlar |
|---------|----------|-------|
| Next.js | 14.2.10 | App Router (✅) |
| React | 18.3.1 | StrictMode aktif |
| TypeScript | 5.x | `strict: true`, path alias `@/*` |
| Tailwind | 3.4.x | Custom `brand`/`surface`/`status` paletleri, dark-first |
| Zustand | latest | Persist/devtools yok |
| chart.js | latest | 152 KB gzipped, sadece dashboard'da |
| next-pwa | latest | Service worker auto-register |
| ESLint | next/core-web-vitals | Prettier yok, Husky yok |

**`next.config.js`:**
- ✅ PWA aktif (`disable: NODE_ENV === "development"`).
- ❌ `headers()` — CSP, HSTS, X-Frame-Options, Permissions-Policy yok.
- ❌ `images.domains` tanımsız (yine de `next/image` kullanılmıyor).
- ❌ `i18n` config yok (Türkçe hardcoded).

**`tsconfig.json`:**
- ✅ `strict: true`
- ⚠️ `noUnusedLocals` / `noUnusedParameters` yok.

### 4.2 Authentication & Route Koruması

**Token Saklama:**
```ts
// src/lib/api/client.ts
localStorage.setItem("token", token);                                          // ⚠️ XSS
document.cookie = `token=${token}; path=/; max-age=604800; SameSite=Lax`;     // ⚠️ Lax + JS okunabilir
```

**Sorunlar:**
1. **🔴 XSS:** `localStorage` hedef saldırgan tarafından okunabilir (npm dep zincir saldırısı, third-party script vs.).
2. **🔴 Open Redirect:** `middleware.ts` içinde `?redirect=...` doğrulanmadan kullanılıyor. `?redirect=https://evil.com/login` → kullanıcı login sonrası phishing sitesine gider.
3. **🟡 CSRF:** `SameSite=Lax` → POST cross-site engellenir (✅) ama GET ile sensitive action varsa risk.
4. **🟡 Çift Saklama:** Hem `localStorage` hem cookie tutarsız (logout senaryosunda biri silinmezse hayalet token).
5. ❌ Refresh token mekanizması yok → 7 gün sonra ani logout.

**Middleware:**
```ts
const token = request.cookies.get("token")?.value;
if (!token && !isPublic) redirect("/auth/login?redirect=" + currentPath);
```
✅ Edge-level koruma, sayfanın HTML render edilmesini engelliyor.
❌ Token expiry kontrolü yapmıyor (sadece varlık).

### 4.3 State Management (Zustand)

**Global state:**
```ts
profile, businesses, activeBusiness, portfolio, businessCards,
notifications, unreadCount, isLoading, sidebarOpen, refreshKey
```

**Sorunlar:**
- ❌ Persist middleware yok → reload'da `profile` kayboluyor, yeniden `/me` çağrılıyor.
- ❌ Selective subscription yok — `useAppStore()` tüm state'e abone, gereksiz re-render.
- ❌ DevTools middleware yok — debugging zor.
- ✅ `refreshKey + triggerRefresh()` pattern data invalidation için basit ve işlevsel.

**Öneri:**
```ts
// Selector + shallow
const profile = useAppStore(s => s.profile);
const isAdmin = useAppStore(s => s.profile?.role === "admin");
```

### 4.4 API Client & Tip Senkronizasyonu

**`src/lib/api/client.ts`:**
- Native `fetch`, axios kullanılmıyor (✅ küçük bundle).
- `Bearer` token otomatik ekleniyor.
- ❌ Retry/timeout/AbortController yok.
- ❌ 401 yakalanıp otomatik logout yok.
- ❌ Request ID korelasyonu yok.
- ❌ Cache (SWR/React Query) yok → her component mount'ta fetch.

**Tip Drift:**
- `src/types/index.ts` (~552 satır) elle yazılmış.
- Backend DTO değişirse frontend bilmez (compile error olmaz, runtime'da `undefined`).
- Bazı yerlerde `any` (özellikle `icon: any`, `cat: any`).

**Çözüm:** Backend'e `springdoc-openapi-starter-webmvc-ui` ekle, frontend'de `openapi-typescript` ile `types.gen.ts` üret.

### 4.5 Sayfa & Bileşen Mimarisi

**App Router Yapısı:**
```
src/app/
├── layout.tsx               (Server Component, font + PWA metadata)
├── page.tsx                 (redirect → /dashboard)
├── auth/login/page.tsx
├── dashboard/
│   ├── layout.tsx (AppShell + TopBar + BottomNav)
│   ├── page.tsx
│   ├── add/page.tsx
│   ├── businesses/page.tsx
│   ├── finance/page.tsx
│   ├── inventory/page.tsx
│   ├── transactions/page.tsx
│   ├── documents/page.tsx
│   └── profile/page.tsx
├── business/[id]/
│   ├── layout.tsx
│   └── page.tsx
└── admin/page.tsx
```

**Eksiklikler:**
- ❌ `loading.tsx` ve `error.tsx` yok (manuel skeleton var).
- ❌ Suspense boundary yok.
- ❌ `React.lazy()` / dynamic import yok.
- ❌ Dynamic `[id]` UUID format validation yok.

**En Büyük 5 Bileşen:**

| Component | LOC | Risk |
|-----------|-----|------|
| `VehicleModule.tsx` | 825 | 8 ayrı `useState`, refactor edilmeli |
| `PersonnelModule.tsx` | 726 | Aynı pattern, kopyala-yapıştır kod |
| `DebtModule.tsx` | 687 | DRY ihlali |
| `TransactionList.tsx` | 651 | Memoization yok |
| `FixedCostsWidget.tsx` | 477 | OK ama bölünebilir |

**Form Yönetimi:**
- ❌ React Hook Form yok.
- ❌ Zod/Yup yok.
- Manuel `useState` + ad-hoc validation.
- `dashboard/add/page.tsx` → form draft'ı `localStorage`'a yazıyor (XSS'le çalınabilir, sensitive değilse OK).

**Accessibility:**
- ✅ `htmlFor` + `id`, `autoComplete`, `required` doğru.
- ❌ ARIA label/role yok.
- ❌ Modal: ESC kapatma yok, focus trap yok, backdrop click yok.
- ❌ Toast/notification kütüphanesi yok (sadece inline alert).

**Mobile:**
- ✅ Bottom nav + safe area padding mükemmel.
- ✅ 44×44 min touch target CSS'te enforced.

### 4.6 Performance

**Sorunlar:**
- ❌ `useMemo`/`useCallback`/`React.memo` neredeyse hiç yok → her parent re-render = tüm child re-render.
- ❌ Code splitting yok (route-level Next.js otomatik var, component-level yok).
- ❌ `next/image` kullanılmıyor (PWA icon dışında zaten image yok).
- ❌ Chart.js 152 KB, basit bar chart için aşırı.
- ❌ `useAppStore()` shallow/selector kullanılmadığı için her store update tüm tüketicileri re-render.
- ❌ Aynı endpoint birden fazla component'te aynı anda çağrılıyor (cache yok).

**Bundle:** `next build` çıktısı ölçülmedi, ama tahminen ilk yüklenen dashboard 300-400 KB JS gzipped.

### 4.7 PWA

**`next-pwa` config:**
- ✅ Aktif, `register: true`, `skipWaiting: true`.
- ❌ Custom offline page yok.
- ❌ API caching strategy (network-first / stale-while-revalidate) yok.
- ❌ Push notification yok.
- ❌ Background sync yok.
- ❌ Manifest'te `maskable` icon yok.

**Risk:** Service worker `skipWaiting` ile agresif update → kullanıcı form doldururken sayfa yenilenebilir.

### 4.8 UX/UI Eksiklikleri

| Alan | Durum |
|------|-------|
| Loading | ✅ Skeletons (DashboardSkeleton vs.) |
| Error | ⚠️ Inline alert, retry button yok |
| Empty | ✅ Boş state mesajları var |
| Optimistic update | ❌ Yok |
| Toast | ❌ Yok |
| Keyboard shortcut | ❌ Yok |
| Search/filter | ⚠️ Bazı modüllerde kısmi |
| Bulk action | ❌ Yok |
| Export (CSV/Excel/PDF) | ❌ Yok |
| Dark/Light mode toggle | ⚠️ Sadece dark |

---

## 5. Frontend ↔ Backend Uyumu (Contract Compliance)

### 5.1 Sözleşme Sürdürülebilirliği

**Mevcut Durum:**
- Backend Java DTO sınıfları (`bizboard-common/dto/*`).
- Frontend TypeScript tipleri (`src/types/index.ts`).
- **İki taraf manuel senkronize ediliyor.** OpenAPI spec yok.

**Tip Drift Riski (örnekler):**

| Vaka | Sonuç |
|------|-------|
| Backend `TransactionDto.amount`'u `Double`'dan `BigDecimal`'a çevirir | Frontend `number` bekler, `string` gelir → `+` operator string concat'e döner |
| Backend yeni zorunlu field ekler (`Business.taxNumber`) | Frontend bilmez, undefined gönderir → 400 |
| Backend enum genişler (`MemberRole.AUDITOR`) | Frontend switch/case `default` → exhaustive check fail |
| Backend `null`'ı `Optional` ile sarar (`@JsonInclude(NON_NULL)`) | Frontend zaten `non_null` configured, OK |

**Çözüm:**
1. Backend'e `springdoc-openapi-starter-webmvc-ui` 2.x ekle → `/v3/api-docs`.
2. Frontend `package.json`'a script ekle:
   ```json
   "gen:types": "openapi-typescript http://localhost:8080/v3/api-docs --output ./src/types/api.gen.ts"
   ```
3. CI'da bu komut çalıştırılıp dirty diff varsa fail et.

### 5.2 Endpoint Bazlı Uyum Kontrolleri

| Frontend Çağrısı | Backend Endpoint | Sorun |
|------------------|-----------------|-------|
| `api.get<Profile>("/me")` | `UserController#me` | ✅ |
| `api.get<Business[]>("/businesses")` | `BusinessController#list` | ✅ |
| `api.get<PortfolioSummary>("/portfolio?...")` | `PortfolioController#summary` | ✅ |
| `api.get<FinanceOverview>("/finance/overview?months=6")` | `FinanceController#overview` | ⚠️ Backend `months` validation yok |
| `api.post("/businesses/<id>/transactions", body)` | `BusinessController#createTransaction` | ⚠️ Idempotency yok — double-tap = duplicate tx |
| File upload (`/files`) | `FileController#upload` | 🔴 Backend security açıkları (yukarıda) |

### 5.3 CORS

Backend: `localhost:3000` whitelisted. Üretimde `https://app.bizboard.com` vs. olarak değişmesi şart, env-driven olmalı.

### 5.4 Hata Mesajı Uyumu

Backend `{"message": "Kullanici adi veya sifre hatali"}` döner.
Frontend `err.message || "Request failed"` ile yakalar → ✅ Türkçe gösterim çalışır.

**Uyarı:** Backend bazen `MethodArgumentNotValidException`'da `"username: must not be blank, password: size must be between 4 and 100"` gibi raw mesaj döner — kullanıcıya gösterilebilir hâlde değil. Frontend bu durumda tek satır halinde basıyor.

---

## 6. Güvenlik Açıkları — Tam Liste

### 6.1 Backend Açıkları

| # | Başlık | Severity | Dosya/Konum | Etki | Çözüm |
|---|--------|----------|-------------|------|-------|
| B1 | **IDOR – File listing** | 🔴 CRITICAL | `FileStorageService.getFilesByEntity` | Başka firmanın dosyaları listelenir | Caller'ın `business_member` üyeliğini kontrol et |
| B2 | **Unauthorized file delete** | 🔴 CRITICAL | `FileController#delete` | Authenticated her kullanıcı her dosyayı siler | Owner/admin kontrolü ekle |
| B3 | **Path traversal – `category` param** | 🔴 CRITICAL | `FileStorageService.uploadFile` | Disk'te keyfi dizine yazma | Whitelist (`document`/`image`/`receipt`...) |
| B4 | **MIME magic byte yok** | 🔴 HIGH | `FileStorageService` | Executable upload | Apache Tika veya magic bytes check |
| B5 | **EmployeeService authorization yok** | 🔴 CRITICAL | `EmployeeService.*` | Başka firmanın personeli yönetilir | `businessId` ownership check |
| B6 | **FixedCostService authorization yok** | 🔴 CRITICAL | `FixedCostService.*` | Aynı | Aynı |
| B7 | **VehicleService authorization yok** | 🔴 CRITICAL | `VehicleService.*` | Aynı | Aynı |
| B8 | **InventoryService kısmî authorization** | 🔴 HIGH | `InventoryService.delete*` | Bazı method'lar atlanmış | Tüm method'lara ekle |
| B9 | **Default `admin/admin123`** | 🔴 HIGH | `seed-data.sql`, README | Üretimde herkes giriş yapar | İlk start'ta force password change |
| B10 | **JWT secret hardcoded fallback** | 🔴 HIGH | `application.yml` | Env yoksa herkes geçerli token üretebilir | Fallback'i kaldır, fail-fast |
| B11 | **Default DB password (`postgres`)** | 🔴 HIGH | `application.yml` | Brute force | Fallback'i kaldır |
| B12 | **`ddl-auto: update` üretimde** | 🔴 HIGH | `application.yml` | Schema drift | Flyway/Liquibase + `validate` |
| B13 | **Account lockout yok** | 🔴 HIGH | `UserPrincipal` | Brute force | 5 başarısız → 15dk lock |
| B14 | **Rate limiting yok** | 🔴 HIGH | Tüm endpoint'ler | DoS, brute force | Bucket4j/Resilience4j |
| B15 | **Validation error info leak** | 🟡 MEDIUM | `GlobalExceptionHandler` | Field schema sızıntısı | Generic message + log detay |
| B16 | **PII log'a yazılıyor** | 🟡 MEDIUM | Birçok servis | KVKK/GDPR ihlali | ID kullan, audit ayrı |
| B17 | **Refresh token yok** | 🟡 MEDIUM | `JwtUtil` | 7 gün geçerli token çalınırsa | Access 15dk + refresh 7g |
| B18 | **Audit log yok** | 🟡 MEDIUM | Tüm sistem | Forensic imkansız | `audit_logs` tablosu |
| B19 | **CORS env-driven değil** | 🟡 MEDIUM | `SecurityConfig` | Üretim deploy hatası | env var |
| B20 | **`Exception.class` 500 handler yok** | 🟡 MEDIUM | `GlobalExceptionHandler` | Stack trace sızıntısı | Generic 500 + log |
| B21 | **Race condition – FixedCost upsert** | 🔴 HIGH | `EmployeeService`, `VehicleService` | Duplicate satırlar | Upsert + unique constraint |
| B22 | **`Integer.MAX_VALUE` page size** | 🔴 HIGH | `LedgerService.fullReconciliation` | OOM | Stream/batch loop |
| B23 | **N+1 in finance loop** | 🟡 MEDIUM | `FinanceService.getFinanceOverview` | Yavaşlık | `findByBusinessIdIn` |
| B24 | **Timezone tanımsız** | 🟡 MEDIUM | `@Scheduled`, `LocalDate.now()` | Yanlış raporlar | `Europe/Istanbul` |
| B25 | **BigDecimal 4.33 hatası** | 🟡 MEDIUM | `FinanceService` | %1 hata | `30.divide(7,…)` |
| B26 | **Antivirus/disk-quota yok** | 🟡 MEDIUM | File upload | Malware/DoS | ClamAV + quota |
| B27 | **HTTP (no HTTPS) varsayılan** | 🔴 HIGH | Genel | MITM | Reverse proxy + HSTS |
| B28 | **Spring Boot Actuator tek endpoint expose ✅ ama trace/info expose riski** | 🟢 LOW | `application.yml` | OK ama prod'da güvenli olduğunu doğrula | Mevcut config tut |
| B29 | **Distributed lock yok (cron)** | 🟡 MEDIUM | Scheduled | Multi-instance'da çift çalışma | ShedLock |
| B30 | **`User.accessibleBusinesses` denormalize string** | 🔴 HIGH | `User` entity | Parse hatası, drift | ManyToMany tablo |

### 6.2 Frontend Açıkları

| # | Başlık | Severity | Dosya | Çözüm |
|---|--------|----------|-------|-------|
| F1 | **Token `localStorage`'de** | 🔴 CRITICAL | `lib/api/client.ts` | HttpOnly cookie + refresh token akışı |
| F2 | **Open redirect** | 🔴 CRITICAL | `middleware.ts` | `redirect` URL aynı origin doğrula |
| F3 | **Hardcoded API URL fallback (`http://localhost:8080`)** | 🟡 MEDIUM | `client.ts`, `documents/page.tsx`, `DocumentsModule.tsx` | Build-time env zorunlu |
| F4 | **CSP/HSTS/X-Frame-Options yok** | 🟡 MEDIUM | `next.config.js` | `headers()` ekle |
| F5 | **Backend error mesajını ham gösterme** | 🟡 MEDIUM | `client.ts` | Üretimde generic |
| F6 | **`console.error` dağıtık** | 🟢 LOW | Birçok component | Sentry / structured logger |
| F7 | **localStorage draft (form data)** | 🟢 LOW | `dashboard/add/page.tsx` | Sensitive değilse OK |
| F8 | **`any` kullanımı** | 🟢 LOW | `finance/page.tsx`, vd. | Strict tip |
| F9 | **CSRF (Lax)** | 🟢 LOW (JWT'de) | `client.ts` | Cookie kullanımı kalkarsa irrelevant |
| F10 | **No rate limiting / debounce** | 🟢 LOW | Form submit'ler | Submit disable + debounce |
| F11 | **Dependency audit** | ⚠️ | `package-lock.json` | `npm audit` + Dependabot |
| F12 | **PWA agresif update (`skipWaiting: true`)** | 🟢 LOW | `next.config.js` | Kullanıcıya prompt göster |

### 6.3 Açık Bazlı Patch Yol Haritası

#### P0 — Üretim Çıkmadan ÖNCE (1-2 hafta)
- B1, B2, B3, B4, B5, B6, B7, B8 — File security + IDOR fix
- B9, B10, B11 — Default credentials
- B12 — Migration tool + ddl-auto: validate
- F1, F2 — Token storage + open redirect
- B27 — HTTPS + reverse proxy

#### P1 — Üretim Sonrası İlk Sprint (3-4 hafta)
- B13, B14 — Rate limit + lockout
- B15, B16, B18, B20 — Logging + error handling
- B17 — Refresh token
- B19 — Env-driven CORS
- B21, B22 — Race condition + OOM
- B24, B25 — Timezone + BigDecimal
- B29 — Distributed lock
- F3, F4, F5 — Frontend hardening

#### P2 — 2-3 Ay İçinde
- B23 — Performance optimization
- B26 — Antivirus
- B30 — User access model refactor
- F6-F12 — Frontend polish

---

## 7. Performance & Ölçeklenebilirlik (Büyük Veri Senaryoları)

### 7.1 Şu Anki Kapasite Tahmini (Single Instance)

| Kullanıcı / İşletme | Davranış |
|----------------------|----------|
| 1 user, 5 business, 1k tx | ✅ Smooth (<100ms response) |
| 10 user, 50 business, 50k tx | ⚠️ FinanceService 2-3 saniye |
| 100 user, 500 business, 1M tx | 🔴 Tam tablo tarama, 30s+ rapor, OOM riski |
| 1000 concurrent user | 🔴 Tomcat default 200 thread, Jdbc pool 10 — bottleneck |

### 7.2 Sorun Bölgeleri ve Çözümler

#### A) `transactions` tablosu büyürken
- **Sorun:** `findByBusinessIdOrderByDateDesc` index'siz, ay raporu `YEAR(date) AND MONTH(date)` function-based.
- **Çözüm:**
  - Composite index `(business_id, date DESC)`.
  - Yıl/ay sorguları için `date BETWEEN`'e dönüştür.
  - Aylık özet için **materialized view** veya partition (postgres 11+ declarative partitioning by date range).

#### B) `FinanceService.getFinanceOverview`
- **Sorun:** 200+ satır, 30+ ayrı sorgu, business loop.
- **Çözüm:**
  - Single SQL aggregate (`GROUP BY business_id, EXTRACT(MONTH FROM date)`).
  - Sonuç DTO projection.
  - Redis cache (TTL 5 dk).

#### C) `LedgerService.fullReconciliation`
- **Sorun:** `Integer.MAX_VALUE` page size.
- **Çözüm:**
  - `Slice<Transaction>` ile 1000'er batch.
  - `EntityManager.clear()` her batch sonrası.
  - Ya da SQL `INSERT INTO closed_period_summaries ... SELECT ... GROUP BY` (one-shot).

#### D) Multi-tenant İzolasyon
- **Sorun:** Her servis manuel `hasAccessToBusiness` çağırıyor (bazıları unutuyor).
- **Çözüm:**
  - **PostgreSQL Row-Level Security (RLS):**
    ```sql
    ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tx_isolation ON transactions
      USING (business_id = ANY (current_setting('app.business_ids')::uuid[]));
    ```
  - Hibernate `Filter` veya custom `Specification`.

#### E) File Storage
- **Sorun:** Local disk, container restart'ta veri kaybolur, replica'lar arası senkron yok.
- **Çözüm:**
  - **S3/MinIO:** `aws-java-sdk-s3` veya `minio-java`.
  - Pre-signed URL ile direct upload (backend bandwidth tasarrufu).
  - CDN (CloudFront/Cloudflare) ile read'leri offload et.

#### F) Cache
- **Sorun:** Hiç cache yok. `getCategories`, `getBusinessTypes`, `getProfile` her request'te DB hit.
- **Çözüm:** Spring Cache + Redis:
  ```java
  @Cacheable(value = "businessTypes", key = "'all'")
  public List<BusinessTypeDto> getAll() { ... }
  ```

#### G) Connection Pool
- HikariCP default `maximumPoolSize: 10` — production için tipik **20-50**.
- PostgreSQL'in `max_connections` (default 100) ile dengeli olmalı.

#### H) Read Replica
- 100k+ request/dk noktasında PostgreSQL replica + `@Transactional(readOnly=true)` query'leri yönlendir.

#### I) Async / Event-Driven
- Email, push notification, big report generation senkron — request'i bekletmez. Sorun: bu projede zaten yok ama eklenince **Kafka/RabbitMQ** şart.

#### J) Frontend Bundle
- Code splitting (Next.js otomatik route-level + manual `dynamic()`).
- Chart.js → tek-amaçlı SVG renderer'a düşür.
- React Query/SWR cache → çift fetch önlenir.

### 7.3 Önerilen Üretim Topolojisi

```
                     ┌─────────────┐
                     │   CDN       │ (Cloudflare/CloudFront)
                     └──────┬──────┘
                            │
                     ┌──────▼──────────────┐
                     │  Reverse Proxy /    │
                     │  Load Balancer      │ (nginx/Traefik) — TLS termination
                     └──────┬──────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼─────┐       ┌────▼─────┐       ┌────▼─────┐
   │ Next.js  │       │ Next.js  │       │ Next.js  │   (3+ pod)
   │ (PWA)    │       │          │       │          │
   └──────────┘       └──────────┘       └──────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼─────┐       ┌────▼─────┐       ┌────▼─────┐
   │ Spring   │       │ Spring   │       │ Spring   │   (3+ pod, stateless)
   │ Boot API │       │ Boot API │       │ Boot API │
   └────┬─────┘       └────┬─────┘       └────┬─────┘
        │                  │                  │
        ├──────────────────┼──────────────────┤
        │                  │                  │
   ┌────▼──────┐      ┌────▼─────┐       ┌────▼─────┐
   │ Redis     │      │ S3/MinIO │       │ Postgres │
   │ (cache,   │      │ (files)  │       │ Primary  │
   │  session, │      └──────────┘       │ + Replica│
   │  rate     │                          └──────────┘
   │  limit)   │
   └───────────┘
```

---

## 8. Üretim (Production) Hazırlığı Checklist

### 8.1 Konfigürasyon
- [ ] `application-prod.yml` ayrı profile
- [ ] `JWT_SECRET` env zorunlu (fallback yok), min 256 bit
- [ ] `DB_USERNAME`/`DB_PASSWORD` env zorunlu
- [ ] `CORS_ALLOWED_ORIGINS` env-driven
- [ ] `FILE_UPLOAD_DIR` absolute path veya S3 bucket
- [ ] `spring.jpa.hibernate.ddl-auto: validate`
- [ ] `spring.jpa.show-sql: false`, `format_sql: false`
- [ ] `logging.level.root: WARN`, `com.bizboard: INFO`
- [ ] Logback JSON appender (Loki/ELK uyumlu)
- [ ] `management.endpoints` sadece `health, info, prometheus`
- [ ] `server.error.include-stacktrace: never`

### 8.2 Güvenlik
- [ ] HTTPS (Let's Encrypt veya ALB cert)
- [ ] HSTS header + CSP + X-Frame-Options + X-Content-Type-Options
- [ ] Rate limit (login: 5/dk/IP, genel: 100/dk/user)
- [ ] Account lockout (5 fail → 15 dk)
- [ ] WAF (Cloudflare/AWS WAF)
- [ ] Default `admin/admin123` user silindi
- [ ] Tüm IDOR/path-traversal patch'leri uygulandı
- [ ] File upload magic byte + antivirus
- [ ] Audit log tablosu + her sensitive action log
- [ ] Refresh token akışı
- [ ] `localStorage` token → HttpOnly cookie

### 8.3 Veritabanı
- [ ] Flyway/Liquibase migration aracı kuruldu
- [ ] Index'ler eklendi (Section 3.3.2)
- [ ] PITR backup (point-in-time-recovery)
- [ ] Read replica
- [ ] Connection pool (Hikari `maximumPoolSize: 30`)
- [ ] PostgreSQL `max_connections` ve `shared_buffers` tune
- [ ] Slow query log aktif (>1s)
- [ ] PgBouncer (connection pooling)

### 8.4 Observability
- [ ] Prometheus + Grafana (Micrometer)
- [ ] OpenTelemetry tracing (Jaeger/Tempo)
- [ ] Centralized logging (Loki/ELK)
- [ ] Alerting (PagerDuty/Opsgenie)
- [ ] Sentry frontend error tracking
- [ ] Uptime monitoring (Uptime Kuma/Pingdom)

### 8.5 DevOps & CI/CD
- [ ] Dockerfile (multi-stage, distroless veya alpine JRE)
- [ ] Docker Compose dev environment
- [ ] Kubernetes Helm chart (production)
- [ ] GitHub Actions / GitLab CI pipeline
  - [ ] `mvn verify` (test + lint)
  - [ ] `npm run build && npm run lint && npm run typecheck`
  - [ ] Trivy / Snyk security scan
  - [ ] Image push to registry
  - [ ] Deploy to staging → smoke test → prod
- [ ] Database migration step (Flyway)
- [ ] Rollback playbook
- [ ] Blue-green / canary deployment

### 8.6 Performance
- [ ] Redis cache (categories, business types, profile)
- [ ] CDN frontend static assets
- [ ] HTTP/2 + Brotli compression
- [ ] React Query / SWR ile FE caching
- [ ] Code splitting (`dynamic()`)
- [ ] N+1 fix (Section 3.5.1)
- [ ] DB index migration
- [ ] Pagination tüm liste endpoint'lerinde
- [ ] `@EntityGraph` veya FETCH JOIN

### 8.7 Test
- [ ] Backend: JUnit 5 + Mockito (unit), Testcontainers (integration)
- [ ] Backend: Coverage hedef %70+
- [ ] Frontend: Vitest + React Testing Library
- [ ] E2E: Playwright (login → dashboard → CRUD smoke)
- [ ] Load test: k6 / Gatling (1000 concurrent user senaryosu)

### 8.8 Yasal/Compliance
- [ ] KVKK uyumluluk dokümanı
- [ ] Kullanım sözleşmesi & gizlilik politikası UI'da
- [ ] Veri silme (right to be forgotten) endpoint
- [ ] Cookie consent banner
- [ ] Vergi mevzuatı uyumu (e-fatura entegrasyonu vs.)

---

## 9. Önerilen Yeni Özellikler ve Roadmap

### 9.1 Faz 1 — Temel Eksikler (1-2 ay)

| Özellik | Açıklama | Değer |
|---------|----------|------|
| **CSV/Excel/PDF Export** | Tüm liste sayfalarında export butonu (Apache POI / OpenCSV) | Muhasebeci işine yarar |
| **Toast Notification** | `sonner` veya `react-hot-toast` | UX |
| **Optimistic Updates** | Mutation'larda anında UI feedback | UX |
| **Search & Filter** | Tüm liste sayfalarında arama, kategori/tarih filtre | UX |
| **Bulk Actions** | Çoklu seçim ile sil/aktarım | UX |
| **2FA (TOTP)** | Google Authenticator / Authy | Güvenlik |
| **Password Reset** | Email link ile şifre sıfırlama | Eksik temel feature |
| **Email Notification** | Borç vade, stok düşüş, fatura zamanı | Engagement |
| **Audit Log UI** | Admin panelinde "kim ne yaptı" listesi | Compliance |
| **Dashboard Widget Customization** | Drag-drop ile widget düzeni | UX |

### 9.2 Faz 2 — İş Değeri (3-4 ay)

| Özellik | Açıklama | Değer |
|---------|----------|------|
| **e-Fatura / e-Arşiv Entegrasyonu** | GİB API + Logo / Mikro / Paraşüt entegrasyonu | Türkiye için kritik |
| **Banka Entegrasyonu (Open Banking)** | Otomatik tx import (Hesabım/Mobildev/Garanti API) | Manuel veri girişini bitirir |
| **Mobile Native App** | React Native / Expo (PWA'dan dönüştürme) | Push notification, offline |
| **Multi-currency Support** | TRY/USD/EUR otomatik kur (TCMB API) | İhracat firmaları |
| **Tax Calculation** | KDV, stopaj, ÖTV otomatik hesap | Muhasebe yardımı |
| **Invoice Generation** | Fatura oluştur + PDF + email | İş akışı kapanır |
| **Project / Job Management** | İnşaat/ajans için iş takibi | Sektör genişleme |
| **Time Tracking & Payroll** | Personel mesai + bordro çıktısı | İK modülü |
| **CRM Modülü** | Müşteri/tedarikçi 360° görünüm | Cross-sell |
| **API Token (Public API)** | 3rd party entegrasyonlar | Platform |

### 9.3 Faz 3 — Diferansiyel (6 ay+)

| Özellik | Açıklama |
|---------|----------|
| **AI Insight** | "Bu ay kira giderin %30 arttı" gibi anomali tespit (Claude/GPT) |
| **Forecasting** | Gelir/gider tahmini (Prophet/ARIMA) |
| **Multi-tenant SaaS** | Subdomain bazlı tenant ayrımı, billing, plan'lar |
| **Marketplace** | Sektörel modül store (restoran POS, kuaför randevu) |
| **WhatsApp Business** | Müşteri bildirim/sipariş |
| **OCR Receipt Scan** | Fiş fotoğrafından otomatik tx oluştur |
| **Workflow Automation (Zapier-like)** | "Borç vadesi geldi → SMS gönder + fatura oluştur" |

---

## 10. Mimari İyileştirme Önerileri

### 10.1 Kısa Vadede (Refactor)

1. **Migration:** Flyway entegre, `V1__initial_schema.sql` oluştur, mevcut entity'lerden generate et.
2. **OpenAPI:** `springdoc-openapi-starter-webmvc-ui` ekle, `/swagger-ui.html` aktif.
3. **MapStruct:** `DtoMapper.java` → MapStruct compile-time mapper.
4. **Test infrastructure:** JUnit + Testcontainers PostgreSQL.
5. **Validation Layer:** `jakarta.validation` annotations'ı tüm request DTO'lara ekle (`@NotNull`, `@Size`, `@Pattern`).
6. **Custom Exceptions:** `BusinessNotFoundException`, `AccessDeniedException`, `ResourceConflictException` vb.
7. **Service Refactor:** `FinanceService`'i `FinanceQueryService`, `FinanceAggregateService`, `PeriodService` olarak böl.
8. **Frontend Component Refactor:** `VehicleModule.tsx` → `VehicleList`, `VehicleForm`, `VehicleDetailModal`, `useVehicles` hook.

### 10.2 Orta Vadede (Architectural)

1. **CQRS-lite:** Read-only query'leri ayrı service + read model. Finansal raporlar için materialized view.
2. **Event-Driven Updates:** Transaction CRUD → domain event → ledger/cache invalidation listener.
3. **Hexagonal Architecture:** Domain pure (Spring/JPA bağımsız), adapters (REST, JPA, S3).
4. **Modular Monolith → Microservice path:** Fayda olunca `bizboard-finance`, `bizboard-inventory`, `bizboard-auth` ayrı deploy.
5. **Frontend Domain-Driven Folder Structure:** `src/features/transactions/{components,hooks,api,types}` (mevcut katman bazlı yapıdan daha modüler).

### 10.3 Uzun Vadede (Platform)

1. **Multi-tenant SaaS:** Tenant per schema (PostgreSQL schema isolation) veya tenant per row + RLS.
2. **Plugin/Modül Sistemi:** İşletme tipine göre modül yüklenmesi runtime/dynamic.
3. **API Gateway:** Kong/Traefik + JWT validation edge'de.
4. **Service Mesh:** İstio/Linkerd (microservice'e geçince).
5. **Data Lake:** Tarihsel veri → ClickHouse/BigQuery → BI dashboard (Metabase/Superset).

---

## 11. Sonuç ve Öncelik Sıralaması

### 11.1 Genel Değerlendirme

BizBoard, mimari açıdan **doğru temellerle başlamış** bir Spring Boot + Next.js projesi. Multi-module Maven yapısı, JWT auth, App Router seçimleri modern ve sağlıklı. **Kapsam olarak ciddi** — finans, envanter, personel, araç, borç, evrak modülleri tek panelde.

Ancak proje **hâlâ MVP / prototype kalitesinde**:
- Test yok.
- Migration aracı yok.
- Birden fazla CRITICAL güvenlik açığı var.
- Performance optimizasyonu (index, cache, pagination) yapılmamış.
- Production deployment için gerekli altyapı (monitoring, logging, CI/CD) yok.

**Şu hâliyle internete açık üretime çıkmak güvensiz olur.** Aşağıdaki sıralı checklist'i takip ederek 6-8 hafta içinde production-ready hâle gelebilir.

### 11.2 Öncelik Sıralaması (1-2 hafta planı)

#### Hafta 1
- [ ] **Gün 1-2:** B5/B6/B7/B8 — Service authorization (ownership check) tüm modüllere ekle.
- [ ] **Gün 3:** B1/B2/B3/B4 — File security patches.
- [ ] **Gün 4:** B9/B10/B11 — Default credentials kaldırma + mandatory env vars.
- [ ] **Gün 5:** F1/F2 — Token storage + open redirect.

#### Hafta 2
- [ ] **Gün 1-2:** Flyway entegrasyon + B12 ddl-auto: validate.
- [ ] **Gün 3:** Index migration (Section 3.3.2).
- [ ] **Gün 4:** B13/B14 — Rate limit + account lockout.
- [ ] **Gün 5:** B27 + F4 — HTTPS reverse proxy + security headers.

#### Hafta 3-4
- [ ] B15-B25 — Logging, validation, race condition, OOM, timezone, BigDecimal.
- [ ] OpenAPI + frontend type generation.
- [ ] Test infrastructure (en kritik 10 endpoint için integration test).

#### Hafta 5-6
- [ ] CI/CD pipeline.
- [ ] Docker + Kubernetes manifest.
- [ ] Monitoring + alerting kurulumu.
- [ ] Load test.

#### Hafta 7-8
- [ ] UX iyileştirmeleri (toast, optimistic update, search/filter).
- [ ] Refresh token akışı.
- [ ] Compliance (KVKK metni, audit log UI).

### 11.3 "Dikkat Edilmesi Gereken" Anti-Pattern Özeti

> Bu liste yeni feature eklerken referans olarak tutulmalı.

1. **Yeni controller eklerken** `@AuthenticationPrincipal UserPrincipal` parametresi ekle ve service'e geç.
2. **Yeni service method'unda** ownership check (`hasAccessToBusiness`) yap, başka türlü test'i geçmesin.
3. **Yeni entity ekleyince** `@Index` tanımla (en sık sorgulanan kolonlar için).
4. **Yeni endpoint'te** `@Valid` + `@Min/@Max` query param validation kullan.
5. **Repository'de** `Pageable` veya `@Query` ile aggregate yaz, asla full list dönme.
6. **Cron job'da** `zone = "Europe/Istanbul"` ekle ve ShedLock kullan.
7. **Para hesabında** `BigDecimal.valueOf(double)` yerine `new BigDecimal(string)` kullan, `RoundingMode` belirt.
8. **Log'da** PII (ad, telefon, e-posta) yazma, sadece UUID.
9. **Frontend'de** `useState` patladığında custom hook çıkar, component 300 satırdan büyükse böl.
10. **Frontend'de** `useAppStore(s => s.field)` selector pattern kullan, full destructure'ı kaçın.

---

## Ek A — Bulgu Hızlı Referans Tablosu

| ID | Severity | Alan | Özet |
|----|----------|------|------|
| B1 | CRITICAL | Backend/File | IDOR – getFilesByEntity |
| B2 | CRITICAL | Backend/File | Unauthorized delete |
| B3 | CRITICAL | Backend/File | Path traversal `category` |
| B4 | HIGH | Backend/File | MIME magic byte yok |
| B5-B8 | CRITICAL | Backend/Service | Authorization eksik |
| B9 | HIGH | Backend/Auth | Default `admin/admin123` |
| B10 | HIGH | Backend/Config | JWT secret fallback |
| B11 | HIGH | Backend/Config | DB password default |
| B12 | HIGH | Backend/DB | ddl-auto: update |
| B13 | HIGH | Backend/Auth | Account lockout yok |
| B14 | HIGH | Backend | Rate limit yok |
| B15 | MEDIUM | Backend | Validation error info leak |
| B16 | MEDIUM | Backend | PII log |
| B17 | MEDIUM | Backend/Auth | Refresh token yok |
| B18 | MEDIUM | Backend | Audit log yok |
| B19 | MEDIUM | Backend | CORS env yok |
| B20 | MEDIUM | Backend | Generic 500 handler yok |
| B21 | HIGH | Backend/Service | Race condition – FixedCost upsert |
| B22 | HIGH | Backend/Service | OOM – fullReconciliation |
| B23 | MEDIUM | Backend/Service | N+1 finance loop |
| B24 | MEDIUM | Backend | Timezone tanımsız |
| B25 | MEDIUM | Backend | BigDecimal 4.33 |
| B26 | MEDIUM | Backend/File | Antivirus + quota yok |
| B27 | HIGH | Backend | HTTPS yok |
| B28 | LOW | Backend | Actuator (mevcut OK, doğrula) |
| B29 | MEDIUM | Backend | Distributed lock yok |
| B30 | HIGH | Backend/DB | accessibleBusinesses denormalize |
| F1 | CRITICAL | Frontend/Auth | localStorage token |
| F2 | CRITICAL | Frontend/Routing | Open redirect |
| F3 | MEDIUM | Frontend | Hardcoded API URL fallback |
| F4 | MEDIUM | Frontend | CSP/HSTS yok |
| F5 | MEDIUM | Frontend | Raw error mesajı |
| F6-F12 | LOW | Frontend | Polish gerekli |

---

## Ek B — Dosya Hızlı Referans

| Sorun | Dosya |
|-------|-------|
| JWT secret hardcoded | [application.yml](backend/bizboard/bizboard-api/src/main/resources/application.yml) |
| Service authorization eksik | [EmployeeService.java](backend/bizboard/bizboard-service/src/main/java/com/bizboard/service/EmployeeService.java), [FixedCostService.java](backend/bizboard/bizboard-service/src/main/java/com/bizboard/service/FixedCostService.java), [VehicleService.java](backend/bizboard/bizboard-service/src/main/java/com/bizboard/service/VehicleService.java) |
| File security açıkları | [FileStorageService.java](backend/bizboard/bizboard-service/src/main/java/com/bizboard/service/FileStorageService.java), [FileController.java](backend/bizboard/bizboard-api/src/main/java/com/bizboard/api/controller/FileController.java) |
| Default admin | [seed-data.sql](backend/seed-data.sql) |
| Race condition | [EmployeeService.java](backend/bizboard/bizboard-service/src/main/java/com/bizboard/service/EmployeeService.java), [VehicleService.java](backend/bizboard/bizboard-service/src/main/java/com/bizboard/service/VehicleService.java) |
| OOM fullReconciliation | [LedgerService.java](backend/bizboard/bizboard-service/src/main/java/com/bizboard/service/LedgerService.java) |
| Finance N+1 | [FinanceService.java](backend/bizboard/bizboard-service/src/main/java/com/bizboard/service/FinanceService.java) |
| BigDecimal 4.33 | [FinanceService.java](backend/bizboard/bizboard-service/src/main/java/com/bizboard/service/FinanceService.java) |
| Frontend token storage | [client.ts](frontend/bizboard/src/lib/api/client.ts) |
| Open redirect | [middleware.ts](frontend/bizboard/src/middleware.ts) |
| Hardcoded API URL | [client.ts](frontend/bizboard/src/lib/api/client.ts), [DocumentsModule.tsx](frontend/bizboard/src/components/business/DocumentsModule.tsx), [documents/page.tsx](frontend/bizboard/src/app/dashboard/documents/page.tsx) |
| Big component | [VehicleModule.tsx](frontend/bizboard/src/components/business/VehicleModule.tsx), [PersonnelModule.tsx](frontend/bizboard/src/components/business/PersonnelModule.tsx), [DebtModule.tsx](frontend/bizboard/src/components/business/DebtModule.tsx), [TransactionList.tsx](frontend/bizboard/src/components/business/TransactionList.tsx) |

---

**Rapor Sonu** — Bu döküman canlı bir belge olarak güncellenmeli; her sprint sonunda checklist'ler işaretlenmeli ve yeni bulgular eklenmelidir.
