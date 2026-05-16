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

## [1.5.2] — 2026-05-16

**Firmalar WP dilim 3a — frontend ilk dilim + mobile 404 fix.** İki frontend sayfa: `/dashboard/businesses` (mobile bottom-nav 404 düzeltmesi) ve `/admin/my-companies` (admin tüzel kişi yönetimi). Counterpart UI + cari ekstre PDF v1.5.3'te (dilim 3b) gelecek.

### Added

#### Frontend
- **`/dashboard/businesses` sayfası** — mobile bottom-nav'daki "Isletmeler" item'ı önceden 404 atıyordu (sayfa yoktu). Şimdi `useBusinesses` hook'unu çağırıp mevcut `BusinessGrid` komponentini render eden basit bir liste sayfası. Kullanıcının `accessibleBusinesses` filtresinden geçtiği işletmeleri görür; admin tümünü, viewer erişebildiklerini. Desktop'ta da çalışır (responsive).
- **`/admin/my-companies` admin sayfası** — v1.5.0'da eklenen `MyCompany` (tüzel kişi) entity'sinin tam CRUD UI'ı. Liste + create modal + edit modal + delete onayı. "Varsayılan firma" rozeti + silme butonu disabled. Form alanları: legal_name, company_type (AS/LTD/SAHIS/KOOP/DERNEK/OTHER), VKN/TCKN, vergi dairesi, ticaret sicil no, MERSIS, NACE faaliyet kodu, kuruluş tarihi, adres, iletişim. 409 Conflict (varsayılan firma silinemez) backend mesajı kullanıcıya doğrudan yansıtılır. Admin paneli ana sayfasından "Firmalarim" buton ile erişilir.
- **`lib/taxId.ts`** — frontend VKN (10 hane) + TCKN (11 hane) format + checksum validation. Backend `TaxIdValidator`'ın TS ayna implementasyonu; sadece UX için (backend son söz). Geçersiz girişte form input kırmızı border + altında hata mesajı; submit engellenir.
- **TS types** — `MyCompany`, `CompanyType`, `Counterpart`, `CounterpartRole`, `CounterpartStatement`, `CounterpartStatementEntry`. v1.5.3'te Counterpart UI'ı bunları kullanacak.

### Changed

#### Frontend
- Admin paneli ana sayfasında üst sağ köyede "Firmalarim" linki eklendi (audit log linkinin solunda).
- Frontend `package.json` 1.5.2 (backend ile senkron).

### Notes

- Yeni Counterpart types + `lib/taxId.ts` v1.5.3 frontend'inde kullanılacak; v1.5.2'de sadece tanımlandı, henüz UI yok.
- Mobile bottom-nav'daki "Raporlar" ve "Profil" item'ları hâlâ 404 atar — kapsam dışı, ayrı bir patch'te (v1.5.x veya v1.6.x) ele alınacak.
- Cari hesap ekstresi PDF export v1.5.3 frontend'inde gelecek (jsPDF veya backend endpoint kararı orada verilir).
- Backend schema değişikliği yok bu sürümde, cold start riski sıfır.

---

## [1.5.1] — 2026-05-16

**Firmalar WP dilim 2 — cari hesap motoru.** Karşı firma bazlı bakiye hesabı + ekstre + Debt akışı entegrasyonu. Bu sürümden sonra yeni borçlar bir `Counterpart`'a bağlanabiliyor, bakiyeleri otomatik güncelleniyor, period bazlı ekstre alınabiliyor. Eski string-only borçlar v1.5.3 migration utility'ye kadar yine paralel çalışmaya devam ediyor.

### Added

#### Backend
- **`CounterpartLedgerService`** — cari hesap motoru.
  - `recompute(counterpartId)`: tüm aktif (settled=false) borçların net'i = RECEIVABLE − PAYABLE. `Counterpart.currentBalance` cached kolonu güncellenir.
  - `getStatement(counterpartId, from, to)`: kronolojik hareket listesi + opening/closing bakiye + period içi toplam alacak/borç. Her satır running balance ile.
- **`GET /counterparts/{id}/statement?from=&to=`** — authenticated kullanıcılar için cari ekstre JSON. PDF v1.5.2'de (frontend ile birlikte). Period parametreleri opsiyonel.
- **`POST /admin/counterparts/{id}/recompute`** — admin-only manuel cari bakiye yeniden hesaplama. Event-driven update herhangi bir nedenle (manuel SQL, restore, race) drift ettiğinde devreye girer.
- **`CreateDebtRequest.counterpart_id`** — opsiyonel UUID. Verilirse Counterpart entity'sine bağlanır + `counterparty` string'i counterpart name ile auto-fill edilir.
- **`DebtDto.counterpart_id` + `counterpart_name`** — frontend cari listelerinde kullanmak için.

### Changed

#### Backend
- **`DebtService.createDebt/settleDebt/deleteDebt`** event-driven: counterpart_id bağlıysa her mutation sonrası `CounterpartLedgerService.recomputeIfPresent` çağrılır. Bakiye DB'de cached olarak güncel kalır; statement endpoint cached değeri closing balance olarak kullanır.
- **`CounterpartService.delete`** artık temiz 409 Conflict dönüyor: "Bu firmaya bağlı N borç kaydı var; önce onları kaldırın veya başka firmaya taşıyın." Önceden FK constraint'i Postgres seviyesinde 500'e dönüşüyordu.
- **`GlobalExceptionHandler`** `IllegalStateException → 409 Conflict` ekledi. v1.5.0'da gelen "Varsayılan firma silinemez" + bu sürümün "bağlı borç var" mesajları + eski `FixedCostService`'in "otomatik hesaplanan sabit gider manuel güncellenemez" durumu hepsi tek mekanizmadan 409 + Türkçe mesaj döner.
- **`DebtRepository`** iki yeni metod: `findByCounterpartRefIdOrderByCreatedAtAsc`, `countByCounterpartRefId`.

### Notes

- **Bakiye anlamı:** sadece **aktif** (settled=false) borçlar bakiyeye girer. Settle edilen borç cari'yi kapatır — geçmiş hareket olarak ekstrede görünür ama balance'a katkı yapmaz. Bu UX'ten "bana hâlâ ne kadar borçlu / ben hâlâ ne kadar borçluyum" sorusunun net cevabını verir.
- Bir counterpart'a birden fazla işletmenin borcu olabilir (counterpart cross-business). Ekstre endpoint tüm bağlı borçları döner; per-business filter v1.6+'da değerlendirilebilir.
- Schema değişikliği yok — bu sürümün hiçbir DB ALTER'i yok, sadece kod ekleme. Cold start riski sıfıra yakın.
- `Counterpart.currentBalance` event-driven güncellenir; recompute drift ihtimaline karşı admin endpoint elden. v1.5.x boyunca scheduled drift recompute eklenebilir (`@Scheduled` her gece tüm counterpart'ları recompute → drift sıfırlanır).

---

## [1.5.0] — 2026-05-16

**Firmalar & Cari Hesap iş paketinin ilk dilimi — backend domain.** İki yeni varlık tanıtılıyor: **MyCompany** (tüzel kişi — "Benim Firmalarım") ve **Counterpart** (karşı firma — "Karşı Firmalar"). v1.5.0 yalnız backend CRUD'u + entity şemasını + bootstrap'i içerir; cari hesap motoru v1.5.1, frontend UI v1.5.2, mevcut borç string'lerini counterpart'a migrate etmek v1.5.3, recurring tx engine v1.6.0 ile gelecek.

### Added

#### Backend
- **`MyCompany` entity** (`my_companies` tablosu) — `legal_name`, `tax_id` (VKN/TCKN), `tax_office`, `trade_registry_no`, `company_type` (AS/LTD/SAHIS/KOOP/DERNEK/OTHER enum), `activity_code` (NACE), `incorporated_at`, `mersis_no`, `address`, `contact_{name,phone,email}`, `is_default`. Tüzel kişi paydaş yönetimi için.
- **`Counterpart` entity** (`counterparts` tablosu) — `name`, `tax_id` (opsiyonel), `tax_office`, `role` (CUSTOMER/SUPPLIER/BOTH/OTHER enum), `contact_*`, `address`, `current_balance` (cached, v1.5.1'de compute), `payment_terms_days`, `notes`. Müşteri/tedarikçi tabanlı cari hesap akışının çekirdek varlığı.
- **`TaxIdValidator` utility** — VKN (10 hane, modüler checksum) ve TCKN (11 hane, klasik T.C. algoritması) format + checksum kontrolü. Service katmanında `MyCompany` ve `Counterpart` create/update'lerinde zorunlu. Frontend'de aynı algoritma olacak ama backend son söz — UI bypass edilse de geçersiz tax id 400 ile reddedilir.
- **`Business.myCompany` FK** — `businesses.my_company_id` nullable, bir işletme tek bir tüzel kişiye bağlanır.
- **`Debt.counterpartRef` FK** — `debts.counterpart_id` nullable. Eski `counterparty` string kolonu geriye uyum için kalır (free-text yedek); yeni borçlar counterpart entity'sine bağlanır. Migration utility v1.5.3'te string → counterpart taşıyacak.
- **Endpoints:**
  - `GET/POST /admin/my-companies`, `GET/PUT/DELETE /admin/my-companies/{id}` — admin-only (SecurityConfig `/admin/**`).
  - `GET/POST /counterparts`, `GET/PUT/DELETE /counterparts/{id}`, `GET /counterparts?role=CUSTOMER|SUPPLIER|...` — tüm authenticated kullanıcılar erişir.
- **`DefaultMyCompanyBootstrap` startup runner** — `ApplicationRunner` idempotent: (1) hiç `MyCompany` yoksa "Default Firmam" oluşturur (`is_default=true`), (2) `businesses.my_company_id IS NULL` satırları default firmaya bağlar. Mevcut işletmeler kullanıcı yeniden atayana kadar default'a takılı kalır.
- **Audit hooks** — `MY_COMPANY_CREATE/UPDATE/DELETE`, `COUNTERPART_CREATE/UPDATE/DELETE`. Update'lerde alan diff'i `changes` metadata'sında (PII alanlar — tax_id, contact, address — diff'te değer tutmaz, sadece `"changed"` bayrağı).

### Changed

#### Backend
- `Debt` entity'sinde `counterparty` string kolonu zorunlu kalmaya devam ediyor; yeni borç akışında counterpart_id var ise onun `name`'i bu alana yansıtılacak. Geriye uyumluluk için iki alanı paralel tutuyoruz; v1.5.3 migration utility'sinden sonra string'i deprecate'leme planlanır.
- Hibernate `ddl-auto=update` ile prod'da iki yeni tablo + iki yeni kolon ALTER TABLE üretilir. Tüm yeni boolean/numeric kolonlarda `@ColumnDefault` set edildi — v1.4.0/v1.4.2'de yaşanan "multiple default values" tipi hataların tekrar etmemesi için tek `default` kaynağı kullanıldı.

### Notes

- Bu sürüm `Counterpart.currentBalance`'ı default 0 olarak okur — gerçek bakiye hesabı v1.5.1'de gelecek (cari motor: alacak - borç, tx history'den).
- `MyCompany` silmek — `is_default=true` kayıt silinemez; çağıran `409 Conflict` benzeri yerine 400 alır.
- `Counterpart` silmek — şu an FK constraint kontrolü Postgres tarafında: bağlı borç varsa silme reddedilir (500). v1.5.x'te UX iyileştirilebilir ("şu kadar borç bağlı, devam etmek için onları kaldır").
- Hassas alanlar (tax_id, contact_email/phone, mersis_no, trade_registry_no, address) audit log diff'inde değer olarak değil `"changed"` bayrağı olarak işlenir — KVKK perspektifi.
- Roadmap WP başlığı planlamada "v1.6.0 — Firmalar" idi; gerçek release sırası v1.5.x oldu (güvenlik patch serisi 1.3.x–1.4.x'i kapladı). Bankalar paketi sıraya yeniden alınacak.

---

## [1.4.2] — 2026-05-15

**Acil hotfix — v1.4.0 schema migration build hatası.** v1.4.0'da `User.mustChangePassword` field'ında `@Column(columnDefinition = "boolean default false")` + `@ColumnDefault("false")` birlikte tanımlanmıştı. Hibernate ikisini de SQL'e koyuyor (`add column must_change_password boolean default false default false not null`) → Postgres "multiple default values specified for column" diye reddediyor → kolon hiç eklenmedi → sonraki tüm SELECT'ler `column must_change_password does not exist` ile patladı, login akışı dahil.

Önceki teşhis (v1.4.1'de `is_active` NULL backfill) yanlıştı: backfill `no NULL rows` döndü, `is_active` zaten doluydu. Asıl hata schema migration'da.

### Fixed

- **`User.mustChangePassword`**: `@Column`'dan `columnDefinition = "boolean default false"` kaldırıldı. `@ColumnDefault("false")` + `nullable = false` yeterli — Hibernate temiz SQL üretir: `add column must_change_password boolean default false not null`.

### Notes

- v1.4.1'deki `UserActiveBackfill` ApplicationRunner kalıyor; idempotent, zarar vermez, gelecekteki NULL temizliklerinde yine işe yarayabilir.
- Bu sürüm deploy olduktan sonra Hibernate ddl-auto=update kolonu nihayet ekleyecek; mevcut satırlar için `must_change_password=false` default'u Postgres tarafından otomatik backfill. Sonraki login'ler tekrar 200 dönmeli.

---

## [1.4.1] — 2026-05-15

**Acil hotfix — login sonrası 403 regresyonu.** v1.3.4'te `UserPrincipal.isEnabled()` gerçek `user.isActive()` döndürmeye başladı (Y1 fix). Eski sürümlerden kalma `users.is_active = NULL` değerleri Java primitive `boolean` map'inde `false` olarak okunduğu için bu kullanıcılar v1.4.0 deploy'undan sonra giriş yapsa bile her authenticated request `403` aldı.

### Fixed

- **`UserActiveBackfill` startup runner.** `ApplicationRunner` ile her boot'ta idempotent çalışır: `UPDATE users SET is_active = TRUE WHERE is_active IS NULL`. NULL değerleri TRUE'ya çeker. Backend logs'a `[backfill] users.is_active NULL → TRUE: N rows updated` veya `no NULL rows` düşer; deploy sonrası doğrulama için bu satırlara bakılır.
- **`JwtAuthenticationFilter` artık reddedilen request için warn log atıyor.** Önceden sessizce SecurityContext set etmeden geçiyordu — neden 403 aldığını bulmak gözlemlenebilir değildi. Artık `[auth-filter] rejecting request: user 'X' is not enabled` görünür.

### Notes

- Bu fix Y1 davranışını (pasifleştirilmiş kullanıcı sistem dışı) DEĞİŞTİRMEZ — sadece NULL'ları doğru semantiğe (`active=true`) çeker. Açıkça `is_active=false` olan kullanıcılar hâlâ sistem dışı kalır.
- v2.0.0 Flyway iş paketinde `is_active` sütununa `NOT NULL DEFAULT TRUE` kalıcı constraint eklenecek ve `UserActiveBackfill` sınıfı silinecek. Şimdilik idempotent ve düşük maliyetli.

---

## [1.4.0] — 2026-05-15

**v1.3.x güvenlik patch serisinin kapanış sürümü.** Davranış değişikliği içeren son üç güvenlik konusu: login brute-force koruması (Y2), zorunlu ilk-giriş parola değişikliği (Y5), `accessibleBusinesses` strict validation (Y3). Minor bump çünkü auth response shape değişiyor (`forcePasswordChange` artık gerçek değer döner) + 429 yeni HTTP durumu + create-user davranışı genişledi.

### Added

#### Backend
- **`LoginRateLimiter` (Y2)** — username başına in-memory token bucket. Default politika: 5 dakikalık pencerede 5 başarısız → 15 dakika lockout. Env override: `APP_AUTH_LOGIN_MAX_FAILURES`, `APP_AUTH_LOGIN_WINDOW_SECONDS`, `APP_AUTH_LOGIN_LOCKOUT_SECONDS`. Başarılı login sayacı sıfırlar. Kilitliyken yapılan deneme `429 Too Many Requests` + `Retry-After` header döner; ayrıca `USER_LOGIN_FAILED` audit'e `reason=RateLimited` + `retryAfterSeconds` metadata'sıyla düşer. Tek-instance Sevalla'ya uygun; multi-instance veya Redis fan-out v2'de değerlendirilecek.
- **`User.mustChangePassword` kolonu (Y5)** — `boolean default false`, Hibernate `ddl-auto=update` ile mevcut tabloya `NOT NULL DEFAULT false` olarak eklenir (Postgres ALTER TABLE ADD COLUMN). Admin `POST /admin/users` ile oluşturduğu yeni kullanıcılarda otomatik `true` set edilir. Login response'ta `forcePasswordChange` bu kolonu yansıtır; frontend kullanıcıyı parola değiştirme ekranına yönlendirir. `UserService.changePassword` başarılı olduğunda flag false'a çekilir + tüm refresh token'lar revoke edilir (mevcut davranış).

### Security

- **Y2 — Brute-force koruması canlı.** Önceden `/auth/login` permitAll + sınırsız deneme. Şimdi 5 fail / 5 dk pencerede otomatik kilit. Audit retention 90 gün olduğundan kilitlenmiş hesaplar geriye dönük forensik için izlenebilir.
- **Y3 — `accessibleBusinesses` strict validation.** `AdminUserService.createUser`/`updateUser`:
  - `role=admin` ise her zaman `"all"` ezilir (request'te ne gelirse gelsin).
  - Non-admin için `"all"` literal'i artık reddedilir (privilege escalation vektörü kapanır; eski sürümlerde herhangi bir admin manuel olarak `accessibleBusinesses="all"` set edebiliyordu).
  - UUID listesi geçerli UUID olmak zorunda; ham string formatı sızması yok.
- **Y5 — Force password change.** Admin'in verdiği başlangıç parolası kullanıcı tarafından mutlaka değiştirilmek zorunda. Operasyonel risk: admin "Önce parolayı 123 yap, sonra söylerim değişti diye" diyemez; sistem dayatır.

### Changed

#### Backend
- `AuthResponse.forcePasswordChange` artık gerçek bir değer döner (önceden her zaman `false`'tu).
- `User` entity'sine yeni kolon eklendiği için cold start sırasında Hibernate ALTER TABLE çalışır — bu, Sevalla deploy'unun ilk request'inde 1-2 saniye gecikme yaratabilir, bilinen tradeoff.
- `AdminUserService` accessible businesses normalize/validate yardımcı metodu (`normalizeAccessibleBusinesses`) merkezi noktada. v2.0.0 Flyway iş paketinde bu sütun normalize tabloya migrate olduğunda tek nokta değişir.

### Notes

- **v1.3.x güvenlik serisi tamamlandı.** Bu commit'in ardından artık serinin patch sürümleri kalmadı; backend tarafındaki tüm tespit edilen K* ve Y* açıkları kapalı. Frontend tarafı için ek bir TODO: login response'da `forcePasswordChange=true` gelirse parola değiştirme sayfasına yönlendirme akışını test et — frontend zaten alanı okuyor (v1.0.1'den beri), ama mevcut sürüm her zaman false döndürüyordu, dolayısıyla yönlendirme hiç tetiklenmedi.
- Sevalla multi-instance'a geçilirse `LoginRateLimiter` Redis-backed bir implementasyona evrilmeli; aksi takdirde her instance bağımsız sayar ve effective limit instance sayısı kadar büyür. Çatı v2 iş paketi altında bu not düşülmeli.

---

## [1.3.8] — 2026-05-15

**Güvenlik hotfix — geri kalan iş-paketleri.** v1.3.x serisinin K4–K7 açıkları toplu kapatılıyor: Vehicle, FixedCost, Inventory (item + maintenance + fuel logs), BusinessNote. Hepsi aynı pattern: service'lere `BusinessAccessGuard` enjeksiyonu, mutation+read metodlarına actor `UUID` parametresi, controller'larda `@AuthenticationPrincipal` zorunlu.

### Security

- **`VehicleService`** — `getVehiclesForBusiness`, `getVehicleSummary`, `getVehicle`, `createVehicle`, `updateVehicle`, `toggleVehicleActive`, `deleteVehicle` hepsi guard kontrolünden geçer. Önceden hiçbir endpoint yetkilendirme yapmıyordu; herhangi bir authenticated kullanıcı UUID ile yabancı işletmenin araçlarını (plaka, şasi numarası, motor no, kira sözleşmesi) okuyabilir + güncelleyebilir + silebilirdi.
- **`FixedCostService`** — `getFixedCostsForBusiness`, `getFixedCostSummary`, `createFixedCost`, `updateFixedCost`, `deleteFixedCost`. Otomatik hesaplanan personel/araç sabit giderleri görünüyordu — artık erişim filtreli.
- **`InventoryService`** — tüm item endpoint'leri (`getItems`, `getItemsByCategory`, `getItem`, `createItem`, `updateItem`, `deleteItem`, `getSummary`) + sub-resource'lar `MaintenanceLog` ve `FuelLog` (read + write). Parent inventory item'ın business'ı guard'a doğrulatılır.
- **`BusinessNoteService`** — `getNotesForBusiness`, `createNote`, `updateNote`, `togglePin`, `deleteNote`. Mevcut `adminOnly` flag'i korunur; ek olarak işletmeye erişim artık zorunlu.

### Changed

#### Backend
- Yukarıdaki 4 service'in mutation+read metod imzaları actor `UUID` alacak şekilde genişledi. İlgili controller'lar (`VehicleController`, `FixedCostController`, `InventoryController`, `BusinessNoteController`) `@AuthenticationPrincipal UserPrincipal principal` parametresini her endpoint'e ekledi ve `principal.getId()` (gerekirse `principal.isAdmin()`) iletiyor.

### Notes

- **v1.3.x güvenlik serisi backend tarafında tamamlandı.** Geriye kalan iki açık (Y2 — login rate limit, Y5 — forcePasswordChange flow) feature-shaped davranış değişiklikleri içerdiği için v1.4.0'da ele alınacak.
- Y3 (`accessibleBusinesses` string kolonu kırılganlığı) v1.4.0'da strict validation ile kapatılacak; tam normalize tablo migration'ı v2.0.0 Flyway iş paketinde.
- Audit log retention 90 gün; serideki tüm fix'ler audit'e düşmüş "Access denied" 403'leri retrospektif olarak görünür kalır.

---

## [1.3.7] — 2026-05-15

**Güvenlik hotfix — File operations yetkilendirmesi.** v1.3.x serisinin K3 açığı. Önceden dosya download/info, delete ve link endpoint'leri ya hiç ya da yalnız `adminOnly` flag'i ile korunuyordu. Authenticated herhangi bir kullanıcı, UUID'sini bildiği başka kullanıcının dosyasını indirebiliyor, silebiliyor, başka bir entity'ye link'leyebiliyordu.

### Security

- **Dosya yetkilendirme matrisi (yeni):**
  - **Read** (download `GET /files/{id}`, info `GET /files/{id}/info`, list `/files/by-entity`, `/files/all`):
    `admin` OR `uploader` OR (`entityType=business` ve user'ın o işletmeye erişimi var). Eski `adminOnly` bayrağı non-admin'i her durumda kapatır.
  - **Mutate** (delete `DELETE /files/{id}`, link `PATCH /files/{id}/link`):
    `admin` OR `uploader`. Business access yetmez — başkasının dosyasını silmek/link'lemek için yükleyen veya admin olmak gerekir.
- **`POST /files` upload** artık business'a bağlı upload'larda hedef işletmeye erişim kontrolü yapıyor. Yabancı işletmeye dosya yapıştırılamaz.
- **`PATCH /files/{id}/link`** önceden controller'da `@AuthenticationPrincipal` BİLE almıyordu — kim olduğun bilinmiyordu. Artık zorunlu.
- **`/files/all` non-admin filtreleme:** önceden non-admin'e tüm non-adminOnly dosyaları döndürüyordu. Artık per-file `canRead` filtresinden geçirilir; user'ın yüklediği veya erişebildiği business'lara bağlı dosyalar görünür.

### Changed

#### Backend
- `FileStorageService` `canRead(userId, isAdmin, file)` + `canMutate(userId, isAdmin, file)` policy metodları eklendi. Controller doğrudan bunları çağırıyor.
- `FileStorageService.upload/getFilesByEntity/getAllFiles/linkToEntity/deleteFile` imzaları aktör + admin bayrağı alacak şekilde genişledi.
- `FileController` her endpoint'te `@AuthenticationPrincipal UserPrincipal` zorunlu.

### Notes

- **Bilinen sınırlama:** transaction/employee/debt gibi sub-entity'lere bağlı dosyalar (entityType ≠ "business") için yetkilendirme policy'si şu an _admin VE uploader_ ile sınırlı. Parent-business çözünürlüğü (örn. dosya bir transaction'a bağlıysa transaction'ın business'ı üzerinden access check) v1.4+ iş paketine bırakıldı. Pratikte BizBoard'da çoğu dosya "business" entity'sine bağlı; bu boşluk dar.
- Uploader'ın kullandığı user UUID kalıcı bir referans değil — kullanıcı silinirse o dosyaya artık sadece admin erişir. KVKK perspektifinden bu kabul edilebilir: silinen kullanıcının yüklemesi orphan olur, admin yönetir.

---

## [1.3.6] — 2026-05-15

**Güvenlik hotfix — Debt + Transaction list IDOR kapatma.** v1.3.x serisinin K2 ve K8 açıkları. Önceden bir kullanıcı erişimi olmayan işletmenin borç listesini görebiliyor, borç oluşturabiliyor, settle edebiliyor, silebiliyordu; aynı şekilde `GET /businesses/{id}/transactions` liste endpoint'i yetkilendirme kontrolü yapmıyordu.

### Security

- **`DebtService` tüm business-scoped + tek-borç metodları `BusinessAccessGuard` kontrolü yapıyor.** Etkilenen metodlar:
  - `getDebtsForBusiness(businessId, userId)` — listede erişim yoksa 403
  - `getBusinessDebtSummary(businessId, userId)` — özet 403
  - `createDebt(businessId, request, userId)` — yabancı işletmeye borç eklenemez
  - `settleDebt(debtId, userId)` — borcun ait olduğu işletmeye erişim yoksa 403, ayrıca `adminOnly` borçlar artık sadece admin tarafından settle edilebilir (önceden delete'te kontrol vardı, settle'da yoktu — boşluk kapandı)
  - `deleteDebt(debtId, userId)` — guard kontrolü eklendi (mevcut `adminOnly` kontrolü korundu)
- **`TransactionService.getTransactions(businessId, limit, actorUserId)` artık guard kontrolü yapıyor.** `BusinessController.getTransactions` `@AuthenticationPrincipal` alıp `principal.getId()`'yi service'e geçiyor. Bu, K8 olarak işaretlenen list path açığını kapatır.

### Changed

#### Backend
- `TransactionService.getTransactions` imzası `(UUID businessId, int limit) → (UUID businessId, int limit, UUID actorUserId)`. Tek caller `BusinessController` güncellendi; başka caller yok.
- `DebtService.settleDebt` `adminOnly` koruması artık fiilen var. Mevcut bir adminOnly borcu non-admin biri settle ettiyse (önceki sürümlerde mümkündü) audit log retrospektif olarak `DEBT_SETTLED` kayıtlarında görünür.

### Notes

- Kalan açıklar v1.3.7 (File) + v1.3.8 (Vehicle, FixedCost, Inventory, BusinessNote) + v1.4.0 (rate limit, force password change) ile kapanacak.

---

## [1.3.5] — 2026-05-15

**Güvenlik hotfix — Employee modülü IDOR kapatma.** v1.3.x serisinin K1 (kritik) açığı: önceki sürümlerde personel endpoint'leri yetkilendirme kontrolü yapmıyordu; bir kullanıcı erişimi olmayan işletmenin personel listesini (TC kimlik no, telefon, maaş, SGK) UUID üzerinden okuyabiliyor + update/delete edebiliyordu.

### Security

- **`EmployeeService` tüm metodları artık `BusinessAccessGuard` kontrolü yapıyor.** Etkilenen metodlar: `getEmployeesForBusiness`, `getEmployee`, `getEmployeeSummary`, `createEmployee`, `updateEmployee`, `toggleEmployeeActive`, `deleteEmployee`. Her biri ya path'teki `businessId`'yi ya da bulunan `employee.business.id`'sini guard'a doğrulatır; erişim yoksa `SecurityException("Access denied")` ile 403 döner.
- **`EmployeeController` tüm endpoint'lerinde `@AuthenticationPrincipal UserPrincipal` zorunlu.** `GET /businesses/{businessId}/employees`, `/summary`, `GET /employees/{id}` önceden principal almıyordu — artık alıyor + service'e iletiyor. Bu üç endpoint **public-shaped** görünüyordu çünkü Spring Security tarafında `authenticated()` zorlamasını geçince hiçbir resource-level check yoktu; service refactor + controller principal'i bu boşluğu kapattı.

### Changed

#### Backend
- `EmployeeService` mutation+read metodlarının imzaları actor `UUID actorUserId` alacak şekilde genişledi (zaten mutation tarafında v1.3.1'de eklenmişti; read tarafına da yayıldı).
- Davranışta dış etki yok: erişim hakkı olan kullanıcı için her şey aynı çalışır. Frontend'de değişiklik gerekmez (controller endpoint shape'i aynı; Authorization header zaten gönderiliyor).

### Notes

- Bu sürümde sadece `EmployeeService` ele alındı. Aynı tipte sorun **Debt, Vehicle, FixedCost, Inventory, BusinessNote** servislerinde de var; v1.3.6–v1.3.8'de tek tek kapatılacak. File operations için v1.3.7 ayrı planlandı çünkü ownership modeli farklı (uploader-based + business-link). Login rate limit ve force-password-change v1.4.0'a bırakıldı.
- KVKK perspektifinden: bu açık üretimde çalışırken aktif olduğu süre boyunca personel verileri (TC kimlik no dahil) ihlal kapsamına girer. Audit log retention 90 gün olduğundan tarihsel erişim denetimi 1.3.0+ için yapılabilir.

---

## [1.3.4] — 2026-05-15

**Güvenlik hotfix — foundation katmanı.** Auth + yetkilendirme denetiminde tespit edilen kritik IDOR açıklarını kapatmak için başlatılan **v1.3.x güvenlik patch serisinin ilk sürümü.** Bu sürüm tek başına bir IDOR'u kapatmaz; sonraki patch'lerin (v1.3.5+) kullanacağı ortak guard mekanizmasını + iki bağımsız security fix'i içerir.

### Security

- **`User.active=false` artık gerçekten kullanıcıyı sistemden çıkarıyor.** Önceden `UserPrincipal.isEnabled()` her zaman `true` dönüyordu — admin bir kullanıcıyı pasifleştirse bile elindeki JWT 30 dk geçerli kalıyor, refresh token akışı da çalışıyordu. Düzeltildi:
  - `UserPrincipal.isEnabled()` artık `user.isActive()` döner. Spring Security `DaoAuthenticationProvider` `DisabledException` atar → login akışı kapanır.
  - `JwtAuthenticationFilter` defense-in-depth: token geçerli olsa bile `userDetails.isEnabled()` false ise `SecurityContext` set etmeden geçer → her korumalı endpoint 401.
  - `AuthService.refresh` artık `user.isActive()` kontrolü yapıyor; pasif kullanıcının refresh token'ı varsa bile 401 + cookie clear.

### Added

#### Backend
- **`BusinessAccessGuard` component.** Tek noktadan "bu kullanıcı bu işletmeye erişebilir mi?" cevabını döndüren ortak helper. `canAccessBusiness(userId, businessId)` boolean, `assertCanAccessBusiness(userId, businessId)` SecurityException atar. Tüm domain servisleri (v1.3.5–v1.3.8'de eklenecek) bunu çağırarak yetkilendirme kontrolünü merkezileştirecek. `accessibleBusinesses` string kolonu v2'de normalize tabloya migrate olduğunda iç mantık tek yerden güncellenecek; çağıran servislerin imzası değişmeyecek.
- **`TransactionService` `BusinessAccessGuard`'a delege edildi.** Eski `hasAccessToBusiness(User, UUID)` private helper kaldırıldı; create/update/delete metodları artık `accessGuard.assertCanAccessBusiness(userId, businessId)` çağırıyor. Davranış aynı, kod tek noktada.

### Notes

- Bu serideki sonraki sürümler:
  - **v1.3.5** — Employee modülü (TC kimlik no, maaş PII sızıntısı)
  - **v1.3.6** — Debt + Transaction list path
  - **v1.3.7** — File operations
  - **v1.3.8** — Vehicle + FixedCost + Inventory + BusinessNote
  - **v1.4.0** — Login rate limit + forcePasswordChange flow + `accessibleBusinesses` strict validation
- Tek tek geliyor çünkü her patch sonrası smoke test penceresi bırakılıyor — büyük tek-commit refactor yerine kontrollü ilerleme tercih edildi.
- KVKK perspektifinden Y1 fix'i (pasif kullanıcı sistem dışı) tek başına bile değerli: "veri sorumlusu kullanıcı erişimini durdurmak için ne yapabilir?" sorusunun cevabı artık "1 satır SQL veya admin paneli toggle" değil; aksi şu ana kadar JWT TTL'i (30 dk) kadar açık kalıyordu.

---

## [1.3.3] — 2026-05-15

Audit Log iş paketinin son boşluğu: admin paneli kullanıcı CRUD aksiyonları artık audit'e düşer. Bu sürümle birlikte **"Audit Log expansion" work package'ı DONE**.

### Added

#### Backend
- **`USER_CREATE` / `USER_UPDATE` / `USER_DELETE` / `USER_ROLE_CHANGE` audit hook'ları.** `AdminUserService` mutasyon metodları artık actor `UUID` alıyor; her aksiyon audit'e satır yazar. Rol değişimi varsa `USER_ROLE_CHANGE` AYRI bir satır olarak da düşer (security-kritik aksiyon olduğu için tek başına sorgulanabilmesi gerekiyor). Update'te alan diff'i `changes: {field: {from, to}}` formatında metadata'ya işlenir.
- `AdminController` artık `@AuthenticationPrincipal UserPrincipal` ile aksiyonu yapan admin'in id'sini service'e geçiriyor.

### Security

- **Şifre değeri audit'e ASLA girmez.** `updateUser` request'inde password gelirse audit metadata'sında sadece `"password": "changed"` bayrağı işlenir; eski/yeni şifre hash'leri bile JSON'a yazılmaz.

### Notes

- Audit log work package TODO listesi tamamen kapandı; backend tarafında security-kritik aksiyonların tümü artık `audit_logs` tablosuna düşüyor: auth (login/logout/password/refresh-theft), user CRUD + rol, business create + module add/remove, transaction CRUD + delete-reason, employee CRUD, debt create/delete/settle, file upload/download/delete, notification sent. Retention 90 gün (v1.3.1).
- Bundan sonraki audit kapsam genişletmeleri (correlation IDs, log shipping, real-time stream, alerting, tamper-proof chain, OpenTelemetry, KVKK anonymization) Çatı v2 iş paketi altındaki ileri seviye logging TODO'larında listeli.

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

[Unreleased]: https://github.com/uyekebagci/bizboard/compare/v1.5.2...HEAD
[1.5.2]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.2
[1.5.1]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.1
[1.5.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.0
[1.4.2]: https://github.com/uyekebagci/bizboard/releases/tag/v1.4.2
[1.4.1]: https://github.com/uyekebagci/bizboard/releases/tag/v1.4.1
[1.4.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.4.0
[1.3.8]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.8
[1.3.7]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.7
[1.3.6]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.6
[1.3.5]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.5
[1.3.4]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.4
[1.3.3]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.3
[1.3.2]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.2
[1.3.1]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.1
[1.3.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.3.0
[1.2.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.2.0
[1.1.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.1.0
[1.0.3]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.3
[1.0.2]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.2
[1.0.1]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.1
[1.0.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.0.0
