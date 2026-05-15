# Changelog

Bu dosya kayda değer tüm BizBoard sürüm değişikliklerini izler.

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) standardına dayanır,
sürümleme [Semantic Versioning](https://semver.org/lang/tr/) (SemVer) ile yapılır.

## Sürüm formatı

```
MAJOR.MINOR.PATCH
  │     │     └── geriye uyumlu bug fix
  │     └──────── geriye uyumlu yeni özellik
  └────────────── geriye uyumsuz (breaking) değişiklik
```

Yayınlanmamış değişiklikler en üstteki `[Unreleased]` bölümüne yazılır,
sürüm kesilince başlık güncellenip yeni `[Unreleased]` bölümü açılır.

## Değişiklik kategorileri

- **Added** — Yeni özellik
- **Changed** — Mevcut bir özelliğin değişimi
- **Deprecated** — Yakında kaldırılacak
- **Removed** — Kaldırılan özellik
- **Fixed** — Bug fix
- **Security** — Güvenlik etkisi olan değişiklik

---

## [Unreleased]

_Henüz yayınlanmamış değişiklikler buraya gelir._

---

## [1.3.2] — 2026-05-15

Bildirim kanalı için audit kapsaması: artık sistem her bildirim ürettiğinde audit'e düşer.

### Added

#### Backend
- **`NOTIFICATION_SENT` audit aksiyonu.** `NotificationService.create(...)` her başarılı bildirim üretiminden sonra audit'e satır yazar; metadata'da `recipientUserId`, `notificationId`, `type`, `trigger`, `businessId`, `actionUrl` bulunur. Audit, mevcut `recordEntityAction` pipeline'ı üzerinden best-effort yazılır (REQUIRES_NEW); bir başarısızlık bildirim oluşumunu rollback etmez.
- **`create(...)` overload — `trigger` parametresi.** Bildirim üreten kaynak kodun adı (örn. `"first-login"`, ileride `"debt-due-soon"`, `"low-stock"`) audit metadata'sına işlenir. Forensic değerini artırır — "kim/ne neden gönderdi" sorgusu tek satır JSON'dan cevaplanır. Geriye uyumluluk için `trigger` parametresi olmayan eski imza overload olarak korundu.
- **`AuthService.tryCreateFirstLoginNotification`** artık `trigger="first-login"` parametresini geçiriyor; audit log'ta canary'nin niye attığı görünür.

### Notes

- Notification audit log'u kullanıcı seviyesinde değil sistem seviyesinde tutulur — `userId` alanı _alıcı_ kullanıcıyı işaret eder, çünkü bildirimi sistem otomatik üretir (aksiyon yapan başka bir kullanıcı yoktur). Bu, dosya audit'iyle uyumlu konvansiyondur.
- Audit retention v1.3.1'de eklendiği için bu yeni `NOTIFICATION_SENT` satırları da 90 günden sonra otomatik silinir.

---

## [1.3.1] — 2026-05-15

v1.3.0'ın bıraktığı audit kuyruğunun tamamı: UPDATE aksiyonları, Employee servisi için tam audit kapsaması ve audit tablosu retention temizliği.

### Added

#### Backend
- **`EMPLOYEE_CREATE / UPDATE / DELETE` audit hook'ları.** `EmployeeService` artık `AuditLogService`'i kullanıyor; controller `@AuthenticationPrincipal UserPrincipal` üzerinden actor userId'sini her mutasyon metoduna geçiriyor. `toggleEmployeeActive` da `EMPLOYEE_UPDATE` olarak audit'e düşer (`active: from/to` metadata'sıyla). TC kimlik no ve telefon gibi PII alanlar diff'te "changed" bayrağı olarak görünür — değer JSON'a koymuyoruz.
- **`BUSINESS_MODULE_ADD / REMOVE` audit hook'ları.** `BusinessService.addModule/removeModule` modül durumu gerçekten değiştiğinde audit'e düşer (zaten enable olan modülü tekrar enable etmek audit üretmez). Controller principal'ı thread eder.
- **`AuditLogCleanupTask`** — `@Scheduled` retention görevi. Her gün UTC 03:45 (Europe/Istanbul) çalışır, `app.audit.retention-days` (default 90) günden eski `audit_log` satırlarını toplu siler. `0` verilirse görev iptal olur. Cron pattern env üzerinden override edilebilir (`APP_AUDIT_CLEANUP_CRON`).
- **`AuditLogRepository.deleteCreatedBefore(cutoff)`** — `@Modifying` JPQL bulk delete; cleanup task'in çağırdığı tek hat.

### Changed

#### Backend
- **`TransactionService.updateTransaction` audit metadata'sı şimdi alan bazlı diff içeriyor.** Önceki sürümde sadece son hali yazılıyordu (`amount`, `direction`). Şimdi her değişen alan için `{from, to}` çifti `changes` altında JSON'a düşer, `fieldsChanged` sayacı eklendi. Aynı değerle update isteği gelirse o alan diff'e girmez. `metadata` alanı JSONB serbest yapı olduğu için diff yerine "güncellendi" bayrağıyla işaretlenir.
- **`EmployeeService` mutasyon metodlarının imzası genişledi:** `createEmployee/updateEmployee/toggleEmployeeActive/deleteEmployee` artık actor `UUID` alıyor. Bu, audit hook'larının username'i denormalize edebilmesi için zorunluydu.
- **`BusinessService.addModule/removeModule` imzası genişledi:** İkisi de actor `UUID` alıyor.

### Notes

- Audit log retention default'u 90 gün; agresif silinme istenmiyorsa env'de değiştirilebilir. KVKK perspektifinden 90 gün uygun bir baseline — daha kısa tutmak isteyen kurumlar `APP_AUDIT_RETENTION_DAYS=30` set edebilir.
- `DEBT_UPDATE` audit aksiyonu **eklenmedi** çünkü `DebtService`'in update metodu yok ve `DebtController`'da PUT endpoint'i bulunmuyor; sadece settle (DEBT_SETTLED) + delete (DEBT_DELETE) akışları var. Borç düzenleme UI'a girince ayrı bir patch'te eklenir.
- Audit tablosu büyüme metriği prod'da takip edilmeli; ilk birkaç ay 90 günlük retention'ın ne kadar satır tutacağı görüldükten sonra ayar yapılır.

---

## [1.3.0] — 2026-05-15

Audit log genişletmesi: artık tüm güvenlik-kritik aksiyonlar `audit_logs` tablosuna düşer ve admin paneli üzerinden filtreli olarak okunur.

### Added

#### Backend
- **Genel `AuditLogService.recordEntityAction(...)` API'si.** Servisler bir aksiyon kaydetmek için artık bu tek metodu çağırır; request-scoped `HttpServletRequest` proxy'si üzerinden IP/User-Agent otomatik yakalanır, controller'ların request'i thread etmesi gerekmez. `recordAuthEvent` ayrıca login/logout için.
- **`AuditAction` sabitleri** kapsamlı listeyle: `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILED`, `USER_LOGOUT`, `USER_CREATE/UPDATE/DELETE/ROLE_CHANGE`, `BUSINESS_CREATE/UPDATE/DELETE/MODULE_*`, `TRANSACTION_CREATE/UPDATE/DELETE`, `EMPLOYEE_*`, `DEBT_CREATE/DELETE/SETTLED`.
- **Audit hook'ları** entegre edilen servisler:
  - `AuthService` → `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILED` (bad credentials için username + reason), `USER_LOGOUT`
  - `TransactionService` → `CREATE`, `UPDATE`, `DELETE` (delete'te silme sebebi metadata'da)
  - `BusinessService` → `BUSINESS_CREATE`
  - `DebtService` → `DEBT_CREATE`, `DEBT_DELETE`, `DEBT_SETTLED`
- **`AuditLogRepository.search(...)`** — filtreli pagination query: user / action / resource_type / from / to opsiyonel.
- **`AuditLogQueryService`** — read-only DTO mapping katmanı; metadata'daki `businessId` çıkartılıp DTO seviyesinde sunulur (frontend filter için).
- **`GET /admin/audit-logs`** — admin viewer endpoint. Parametreler frontend `admin/audit/page.tsx`'in beklediği snake_case formatta: `actor_id`, `action`, `entity_type`, `from`, `to`, `page` (default 0), `size` (default 50, max 200). `SecurityConfig`'deki `/admin/**` kuralı yalnız ADMIN'e izin verir.

### Notes

- Bu sürümde audit hook'ları sadece **CREATE / DELETE / SETTLE** aksiyonlarına eklendi; UPDATE'ler ve EMPLOYEE delete'i (servis imzasında userId yok) sonraki patch sürümünde tamamlanacak.
- Audit kayıtları best-effort yazılır; herhangi bir hata business operation'u rollback ETMEZ (`REQUIRES_NEW` propagation). Bu uyumluluk modeli `AuditLogService` doc'unda yazılı.
- İleri seviye logging için (correlation IDs, log shipping, real-time stream, alerting, tamper-proof zincir, OpenTelemetry, KVKK anonymization) Çatı projesi v2 iş paketinde 10 yeni TODO planlandı.

---

## [1.2.0] — 2026-05-15

Auth tamamlama paketi: refresh token yaşam döngüsü tamamlandı, kullanıcı yönetimi sıkılaştı, in-app notification akışı backend tarafıyla canlı.

### Added

#### Backend
- **`RefreshTokenCleanupTask`** — `@Scheduled` ile her gece 03:30 Europe/Istanbul'da expired refresh token kayıtlarını siler. Cron pattern env üzerinden override edilebilir (`APP_REFRESH_CLEANUP_CRON`).
- **Theft detection auto-revoke** — `RefreshTokenService.validate` revoke edilmiş bir token'ın tekrar sunulduğunu fark ederse o kullanıcının TÜM aktif refresh token'larını revoke eder + `REFRESH_TOKEN_THEFT_DETECTED` audit log düşer. Önceki sürümde sadece log warning vardı.
- **`POST /me/password`** — şifre değiştirme. Mevcut şifreyi doğrular, yeni şifreyi `bcrypt` ile hash'ler, **tüm aktif refresh token'ları revoke eder** (tüm cihazlardan otomatik logout), bu tarayıcının cookie'sini de temizler, `PASSWORD_CHANGED` audit log düşer.
- **`POST /notifications`, `GET /notifications/unread-count`, `PATCH /{id}/read`, `PATCH /read-all`** — in-app notification CRUD. Mevcut entity + repository üzerine `NotificationService` ve `NotificationController` eklendi. Owner-only access kontrolü.
- **`NotificationService.create(...)` API** — diğer servisler bunu çağırarak bildirim üretir. İlk trigger: **AuthService.login** ilk-giriş kullanıcılarına hoş geldin bildirimi oluşturur.
- Yeni audit action sabitleri: `PASSWORD_CHANGED`, `REFRESH_TOKEN_THEFT_DETECTED`.

#### Frontend
- **`NotificationDropdown` TopBar'da geri açıldı.** Bell ikonu + unread badge görünür; tıklayınca son 20 bildirim listelenir, tek tek veya hepsini okundu işaretle.

### Changed

#### Backend
- `RefreshTokenService.validate` `@Transactional(readOnly = true)` → `@Transactional` (theft detection yazma operasyonu yapıyor).
- `NotificationDto` Jackson sözleşmesi — frontend type'ıyla uyum için `@JsonProperty` ile snake_case alanlar (`is_read`, `action_url`, `business_id`, `business_name`, `created_at`). Diğer DTO'lar camelCase; bildirim tarihi snake_case kalıyor — v2.0.0 contract sıkılaştırmasında ele alınacak.

### Security

- **Tüm cihazlardan logout** şifre değiştirince otomatik gerçekleşir — çalınmış oturumların yaşam süresi maksimum tek bir parola döngüsü.
- **Theft detection** artık aktif: hırsızın elindeki revoke edilmiş token'la her tetikleme, gerçek kullanıcının oturumunu da bitirir + audit'e düşer. Saldırgan elinde geçerli bir oturum bırakamaz.

### Notes

- İlk-giriş bildirimi: yeni kullanıcılar dashboard'a girince TR dilinde tek bir hoş geldin bildirimi alır. Tetik mantığı `AuthService.tryCreateFirstLoginNotification` içinde — pipeline çalışırken hata fırlatmaz, login'i etkilemez.
- Diğer notification trigger'ları (yeni dosya yüklendi, borç vadesi yaklaştı, stok düşük, vb.) v1.3.0+'da eklenecek; bunlar için Çatı/Audit Log iş paketinde TODO açık.

---

## [1.1.0] — 2026-05-15

İlk büyük güvenlik sıkılaştırması: gerçek refresh token akışı + kısa access TTL.

### Added

#### Backend
- **`RefreshToken` entity** — uzun ömürlü token, sadece SHA-256 hash DB'de saklanıyor (DB sızıntısı ≠ token sızıntısı).
- **`RefreshTokenRepository`** — lookup, expired cleanup, kullanıcı bazlı toplu revoke.
- **`RefreshTokenService`** — 256-bit secure random + SHA-256 hash, rotation chain, IP/UA audit, theft detection sinyali (revoke edilmiş token tekrar kullanılırsa log warning — v1.x patch'inde tüm zincir revoke).
- **`/auth/refresh` endpoint** — cookie'deki refresh token'ı doğrular, **rotate** eder (eski revoke, yeni issue), yeni access token döner. Geçersiz/expired/revoked token → 401 + cookie temizle.
- **`/auth/logout` endpoint** — refresh token'ı DB'de revoke + cookie'yi `Max-Age=0` ile sil.
- Refresh token cookie: `HttpOnly; Secure; SameSite=None; Path=/auth` — JS okuyamaz, cross-site AJAX'ta gönderilir, sadece /auth/* yollar görür.
- Yeni env değişkenleri: `APP_REFRESH_DURATION_DAYS`, `APP_REFRESH_COOKIE_{NAME,SECURE,SAME_SITE,PATH,DOMAIN}`.

#### Frontend
- `ClientProviders` bootstrap akışı artık gerçek bir backend endpoint'ine konuşuyor (önceki sürümlerde endpoint yoktu, ölü kod).
- 401 refresh fail durumunda `bb_session` flag cookie'si de temizleniyor → login redirect loop'u engellendi.

### Changed

#### Backend
- **Access token TTL: 7 gün → 30 dakika.** Çalınmış token'ın işe yaradığı pencere 336× kısaldı. Aktif kullanıcı silent refresh ile şeffaf yenilenir; idle kullanıcı 30 dk sonra refresh akışına düşer.
- `AuthService.login()` artık `LoginResult { body, refreshIssued }` döndürüyor. Controller refreshIssued ile Set-Cookie kurar.

#### Frontend
- **`rt` cookie hack kaldırıldı.** Önceki sürümlerde frontend access token'ın kendisini non-HttpOnly cookie olarak set ediyordu (XSS sızıntı yüzeyi). Artık sadece `bb_session=1` BAYRAK cookie'si var — içinde token yok, middleware'in "yakın zamanda login olundu" sorusunu yanıtlamak için.
- `middleware.ts` `rt` yerine `bb_session` flag'ini kontrol ediyor.
- `LoginPage.setLoginCookie` → `setSessionFlag` olarak yeniden adlandırıldı + içeriği temizlendi.
- `api/client.ts` logout artık `bb_session` flag'ini temizliyor (backend Set-Cookie ile gerçek refresh cookie'sini zaten temizliyor).

### Security

Yeni saldırı yüzeyi durumu (önce vs sonra):

| Vektör | Önce | Sonra |
|---|---|---|
| XSS access token oku | ❌ Memory'de (sayfa kapanınca gider) — aynı | ✅ aynı |
| XSS refresh token oku | ⚠️ JS-readable cookie'de baked | ✅ HttpOnly cookie, JS göremez |
| Token sızıntısı (URL, log) | ✅ yok | ✅ yok |
| Çalınmış token kullanım penceresi | 7 gün | **30 dk** |
| Logout server-side revoke | ❌ yok | ✅ DB'de revoke |
| Theft detection sinyali | ❌ yok | ⚠️ log warning (otomatik zincir-revoke v1.x patch'de) |
| Multi-tab logout senkron | ✅ vardı | ✅ aynı |

### Known follow-ups

- Refresh token cleanup cron (v1.2.0): expired kayıtları periyodik sil
- Theft detection auto-response (v1.2.0): revoked token reuse → tüm zinciri otomatik revoke
- Parola değiştirme akışında tüm refresh token'ları revoke et (v1.2.0)
- Login attempt rate limiting (v1.3.0)

---

## [1.0.3] — 2026-05-15

### Changed

- **PWA service worker artık deploy sonrası otomatik güncelleniyor.** `next-pwa` ayarları `skipWaiting: true` + `clientsClaim: true` olarak değiştirildi. Yeni SW yüklendiği an aktive olur, mevcut sayfaların kontrolünü ele alır, `PwaUpdatePrompt`'taki `controllerchange` listener `window.location.reload()` çağırır. Kullanıcı hiçbir butona basmadan fresh sürümü görür.
- **Trade-off:** Uzun form doldururken deploy gerçekleşirse sayfa yenilenebilir. Mevcut kullanıcı sayısı (10-50) ve form süreleri için kabul edilebilir; ileride autosave gelirse veya form süreleri uzarsa `skipWaiting: false` + manuel prompt akışına dönülebilir (PwaUpdatePrompt component'i o akışı da destekliyor).

### Notes

`PwaUpdatePrompt` componentinin UI'i pratik olarak artık çıkmaz (waiting state yaşanmıyor). Component yine de tree'de duruyor — `controllerchange` listener'ı aktif ve reload akışını yönetiyor.

---

## [1.0.2] — 2026-05-15

### Added
- **Admin için sürüm göstergesi:** TopBar'da "BizBoard" başlığının altında, sadece `role=admin` kullanıcılara çok küçük fontla (`v1.0.2`) yansır.
- `next.config.js` artık `package.json.version`'u `NEXT_PUBLIC_APP_VERSION` olarak bundle'a otomatik enjekte ediyor. Her release'de sadece `npm version X.Y.Z` ile bump yapmak yeterli — UI sürümü otomatik güncellenir, Dockerfile'a dokunmaya gerek yok.

### Changed
- **NotificationDropdown geçici olarak devre dışı.** Backend'de notification endpoint'leri (`GET /notifications`, `/unread-count`, `/{id}/read`, `/read-all`) henüz implement edilmediği için dropdown 403 spam'ine sebep oluyordu. Entity ve frontend kullanıcı arayüzü kalıyor; backend hazır olduğunda TopBar'daki tek satır yorum kaldırılacak.

---

## [1.0.1] — 2026-05-15

### Changed

#### Backend
- `AuthResponse` artık `token` yanında `expiresInSeconds` ve `forcePasswordChange` alanlarını da döndürür (Spring Jackson default camelCase).
- `JwtUtil.getExpirationSeconds()` getter'ı eklendi; AuthService bunu kullanarak gerçek token TTL'sini cliente bildirir.

#### Frontend
- `LoginResponse` ve `RefreshResponse` interface'leri snake_case'den camelCase'e geçirildi (`expires_in` → `expiresInSeconds`, `force_password_change` → `forcePasswordChange`). Backend ile sözleşme artık simetrik.
- Geçici "missing field ise default kullan" mantığı kaldırıldı — backend kontratı net olduğu için artık gerekli değil.
- `ApiError.requestId` okuması da camelCase'e geçti (`body.request_id` → `body.requestId`).

### Removed
- Login akışındaki geçici default sabit `DEFAULT_EXPIRES_IN_SECONDS`.

---

## [1.0.0] — 2026-05-15

İlk production sürümü. BizBoard tek-bedenli kurumsal yönetim paneli olarak
yayında: çoklu işletme, finans, personel, envanter, borç-alacak, dosya yükleme,
audit log ile birlikte.

### Added

#### Backend (Spring Boot 3.3, Java 21)
- Multi-module Maven yapısı: `bizboard-common` / `-repository` / `-security` / `-service` / `-api`
- JWT tabanlı kimlik doğrulama (`/auth/login`)
- Çoklu işletme veri modeli: businesses, business types, modules
- Finans modülü: transactions, categories, fixed costs, period summaries
- Personel modülü: employees + maaş/SGK takibi
- Borç/alacak modülü: debts + ödeme takibi
- Envanter ve araç modülü: inventory items, vehicles, fuel logs, maintenance logs
- Dosya yükleme: `FileStorage` interface + `S3FileStorageAdapter` (Cloudflare R2 ile uyumlu)
- Audit log: tüm dosya yükleme/indirme/silme işlemleri için
- Spring profiles: `local` (varsayılan) ve `prod`
- Aktüatör endpoint'leri: `/actuator/health/liveness`, `/readiness`, `/info`, `/prometheus`
- CORS env-driven: `APP_CORS_ALLOWED_ORIGINS`
- Container imajı: multi-stage Dockerfile, non-root user, G1GC

#### Frontend (Next.js 14, TypeScript, Tailwind)
- App Router yapısı
- Login + dashboard + işletme detayı + finans + envanter + admin sayfaları
- Audit log görüntüleyici (admin only)
- Şifre değiştirme akışı
- Loading skeletons her route için
- Global error boundary
- PWA desteği (next-pwa)
- Server-side log toplama (`/api/logs`)
- Çoklu kullanıcı oturum yönetimi
- Karanlık tema

#### DevOps
- Sevalla PaaS üzerinde 4 uygulama deploy: prod web + prod api (test app'leri yol haritasında)
- Sevalla Managed PostgreSQL 17 (`bizboard_prod`, `bizboard_test` logical DB'leri)
- Cloudflare R2 object storage (`bizboard-prod-uploads`, `bizboard-test-uploads`)
- GitHub Actions workflow: `refresh-test.yml` (günlük test ortamı sync — script hazır)
- `docs/devops_setup.md` (Sevalla'ya özel deployment rehberi)
- `docs/archive/devops_setup-self-hosted.md` (eski 2-VM planı, referans)
- `backend/env.sevalla.prod`, `frontend/env.sevalla.prod` (gitignored, sevalla import şablonları)

### Notes

İlk sürümde bilerek atılan kısayollar (sonraki sürümlerde düzeltilecek):
- Auth response sadece `{ token }` döndürüyor — `expiresIn` / `forcePasswordChange` frontend tarafında default'lanıyor (v1.0.2 planlı)
- Refresh token akışı henüz yok — JWT 7 gün geçerli (v1.3.0 planlı)
- Frontend login cookie'yi kendi domain'inde set ediyor (Sevalla cross-subdomain cookie kısıtı yüzünden) — custom domain'e geçince HttpOnly backend cookie'sine geçeceğiz (v1.1.0 planlı)
- `JPA_DDL_AUTO=update` aktif — Flyway migration'lara geçince `validate` yapılacak (v2.0.0 planlı)
- Test ortamı kurulumu yapılmadı (v1.2.0 planlı)

---

[Unreleased]: https://github.com/uyekebagci/bizboard/compare/v1.3.2...HEAD
[1.3.2]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.2
[1.3.1]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.1
[1.3.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.0
[1.2.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.2.0
[1.1.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.1.0
[1.0.3]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.3
[1.0.2]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.2
[1.0.1]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.1
[1.0.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.0
