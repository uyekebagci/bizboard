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

[Unreleased]: https://github.com/uyekebagci/bizboard/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.1.0
[1.0.3]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.3
[1.0.2]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.2
[1.0.1]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.1
[1.0.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.0
