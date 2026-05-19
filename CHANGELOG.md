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

## [1.6.20] — 2026-05-20

**v1.6 acil prod devam · WP-3 — İşletme Detay Sayfa Revize + Widget'lar.** DGR işletme detay sayfası tüm operasyonun kalbi: tek-shot consolidated endpoint + 10 widget + kişi yönetim mini-sayfası + tx form'da counterpart entegrasyonu + sub-firma drill-down.

### Added

#### Backend
- **`GET /businesses/{id}/consolidated`** — tek-shot endpoint, tüm widget verisi tek round-trip'te. Bölümler: `consolidated`, `today_closing`, `pos_devices` (bugün), `bank_accounts`, `payables`, `receivables` (özet), `cash_outflows_today`, `upcoming_cheques` (30 gün), `upcoming_reminders` (7 gün), `net_position`.
- **`ConsolidatedDashboardService`** — agregator + IDOR access guard. Tek-tenant model: bank/POS/debt verileri system-wide.
- **`ConsolidatedDashboardDto`** (nested DTO'lar) — snake_case JsonProperty.
- **`GET /bank-accounts`** + `?include_inactive=true` — banka/kasa listesi (`BankAccountController`).
- **`GET /pos-devices`** + `?include_inactive` — POS cihazı listesi (`PosDeviceController`).
- **`GET /counterparts/{id}/children`** — alt firmalar (parent_id == id).
- **`GET /counterparts?role=&kind=`** — role + kind kombinasyon filtresi.
- **Repository extensions:**
  - `CounterpartRepository.findByParentIdOrderByNameAsc`, `findByKindOrderByNameAsc`, `countByParentId`.
  - `DebtRepository.findByDirectionAndSettledFalseOrderByDueDateAsc`, `findUpcomingCheques(from, to)`, `findUpcomingReminders(from, to)`.
  - `TransactionRepository.findByDateAndPaymentMethodAndDirection`, `findByPosDeviceIdAndDate`.
- **`CreateTransactionRequest`** yeni alanlar: `target_counterpart_id`, `pos_device_id`.
- **`TransactionService.createTransaction`** karşı taraf + POS cihazı wire'lama:
  - `targetCounterpart` set edilir (varsa).
  - POS modunda `appliedPosRate` = request.posRate ?? device.defaultRate ?? device.lastUsedRate snapshot edilir (cihaz oranı sonra değişse bile tx sabit kalır).
  - Cihazın `lastUsedRate` field'ı güncellenir.

#### Frontend
- **Types:** `ConsolidatedDashboard`, `BankAccountListItem`, `PosDeviceListItem`, `CounterpartKind`, `Counterpart.kind` + `parent_id`.
- **`useConsolidatedDashboard(businessId)`** hook — tek-shot fetch + refresh.
- **`components/business/dashboard/ConsolidatedWidgets.tsx`** — 10 widget tek dosyada:
  1. Konsolide Pozisyon (gradient kart) — total_cash − cc − loan + receivables − payables.
  2. Bugünün Kasa Durumu — Açılış/Gelen/Giden/Hesaplanan/Sayım/Fark + "Günü Kapat".
  3. POS Cihazları (Bugün) — per device gross/komisyon/net + unsettled rozet.
  4. Para Bulunan Hesaplar — type badge + bakiye + grand total.
  5. Verecekler — 7-gün-yaklaşan sarı vurgu.
  6. Alacaklar özeti — type breakdown chip'leri + overdue count; tıklayınca /alacaklar.
  7. Net Pozisyon — pozitif yeşil / negatif kırmızı.
  8. Hesaptan Harcama (bugün NAKIT EXPENSE).
  9. Yaklaşan Çekler (30 gün) — vade + tahsil bankası.
  10. Yaklaşan Hatırlatmalar (7 gün).
  Footer pattern her widget'ta: "Toplam: X kalem | Y TL".
- **`/business/[id]/page.tsx`** revize — `<CarryOverBanner />` + `<ConsolidatedWidgets />` üstte; mevcut FinanceSummary/FixedCosts/ModuleTabs/TransactionList altta korunur.
- **`/dashboard/kisiler`** mini-sayfa — counterparts (kind=PERSON) listesi.
- **Sidebar** — yeni link "Kisiler".
- **`/dashboard/counterparts/[id]`** — `Alt Firmalar` widget'ı (children > 0 ise) statement öncesi.
- **`/dashboard/add-transaction`** — "Karsi Taraf" FIRM/PERSON gruplu optgroup; tx body'sine `target_counterpart_id` eklenir.

### Notes

- ConsolidatedDashboardService tek tek küçük query'lerden oluşur — DGR ölçeğinde N+1 sorun değil.
- Sub-firma drill-down counterpart detay sayfasında listelenir; daha derin tree (depth ≥ 3) UI'da gösterilmez (uygulama kuralı max 2).
- Tx form'da `pos_device_id` alanı backend'de kabul ediliyor ama frontend dropdown'u WP-4'te gelecek.
- Tüm widget'lar TRY formatlı; çoklu currency v1.7+'a.
- Backend `mvn compile` BUILD SUCCESS, frontend `next build` TS pass temiz.
- 15 WP-3 TODO tamamlandı.

---

## [1.6.19] — 2026-05-20

**v1.6 acil prod devam · WP-2 — Close-of-Day Workflow.** Günlük kasa kapanışı: manuel kapama + cron 20:00 otomatik. Physical sayım, fark hesabı, reason kategori, açıklama. Önceki günün hesaplanan kapanışı bugünün açılışı (carry-over kuralı). Backdated tx + correction tx audit highlight'ları. WP-1 cash_closing migration üstüne inşa edildi.

### Added

#### Backend
- **`ClosingCalculator` service** — `getOpeningBalance(date)` (önceki günün computed_closing'i veya 0), `sumCashFlowForDate(date)` (yalnız `paymentMethod=NAKIT` tx'ler), `computeClosing(date)`. Tek-kasa modeli — POS işlemleri cash_closing'i etkilemez.
- **`CashClosingService`:**
  - `closeToday(actualBalance, reasonCategory?, reasonNote?)` — manuel kapama; fark hesaplanır; idempotency (zaten CLOSED ise IllegalStateException → 409); reason `LOSS/MIS_ENTRY/ROUNDING/OTHER` normalize.
  - `autoCloseToday()` — cron için; actualBalance=null, is_auto=true; bildirim ile birlikte tetiklenir.
  - `reopen(closingId, reasonNote)` — admin-only; `SecurityException` aksi takdirde; reason_note ek olarak append; audit highlight=CLOSING_REOPEN.
  - `getTodayPreview()` — real-time computed (kapatılmamışken UI için).
  - `getYesterday()` — Dünden Kalan Eksik widget'ı için.
- **`CashClosingController`** (`/closings`):
  - `GET /` paginated (PagedResponseDto envelope).
  - `GET /today`, `GET /yesterday`, `GET /preview`.
  - `POST /today` (409 zaten kapalı ise).
  - `POST /{closingId}/reopen` (admin).
- **`CashClosingScheduler`** (`@EnableScheduling` zaten aktif):
  - `0 30 19 * * *` Europe/Istanbul — 19:30 reminder: bugün CLOSED değilse tüm admin'lere `NotificationType.WARNING` push.
  - `0 0 20 * * *` Europe/Istanbul — 20:00 auto-close + tüm admin'lere `NotificationType.INFO` push.
- **`UserRepository.findByRoleIgnoreCase`** — admin bildirim hedefi seçimi için.
- **`TransactionRepository.findByDate`** — ClosingCalculator için (tek-tenant, business filtresi yok).
- **`AuditLogService.recordEntityAction` overload** — `highlightType` parametresi opsiyonel.
- **`AuditAction` yeni sabitler:** `CASH_CLOSING_CLOSED`, `CASH_CLOSING_AUTO_CLOSED`, `CASH_CLOSING_REOPENED`, `HIGHLIGHT_BACKDATED`, `HIGHLIGHT_CORRECTION`, `HIGHLIGHT_CLOSING_REOPEN`, `HIGHLIGHT_POS_RATE_OVERRIDE`.
- **DTOs:** `CashClosingDto`, `CloseTodayRequest`, `ReopenClosingRequest` (snake_case JsonProperty).

#### Frontend
- **`types/index.ts`** — `CashClosingStatus`, `CashClosingReason`, `CashClosing`, `CashClosingPreview` tipleri.
- **`hooks/useCashClosing`** — preview + today/yesterday + paginated list + closeToday + reopen mutations.
- **`components/closing/CloseTodayModal`** — hesaplanan readonly büyük yazı + physical sayım input + canlı fark (kırmızı/yeşil/nötr) + reason chip grid (fark != 0 ise zorunlu) + açıklama (fark varsa zorunlu) + 409 handling.
- **`components/closing/CarryOverBanner`** — dünün farkı != 0 ise dashboard'da üstte gösterilir. Link `/dashboard/kapanislar`.
- **`/dashboard/kapanislar`** sayfası — bugünün preview kartı (kapatılmamışsa "Günü Kapat" butonu) + paginated arşiv liste + status badge'leri (KAPALI/OTO KAPALI/YENİDEN AÇILDI) + difference rozeti + reason özetleri.
- **Sidebar** — yeni link "Kapanislar" (`CalendarCheck` ikon).
- **Dashboard ana sayfa** — `<CarryOverBanner />` `<PortfolioCard>` üstüne eklendi.

### Changed

#### Backend
- **`TransactionService.createTransaction`** — `request.getDate() < LocalDate.now()` ise `Transaction.backdated=true` set + audit `highlight=BACKDATED`. Detail mesajına `[BACKDATED <date>]` eki.
- **`TransactionService.updateTransaction`** — gerçek değişiklik varsa (`changes.size() > 0`) `Transaction.corrected=true` + audit `highlight=CORRECTION`.

### Notes

- Cron Europe/Istanbul timezone'unda; tek-instance varsayıldı. Multi-instance deploy için cron lock (ShedLock) ileride gerekir.
- Backend compile: BUILD SUCCESS. Frontend `next build` TypeScript pass temiz.
- WP-2 12 TODO tamamlandı.

---

## [1.6.18] — 2026-05-20

**v1.6 acil prod devam · WP-1 — DGR Veri Modeli & Migration.** DGR (tek-tenant + Excel→sistem geçişi) için tüm veri modeli foundation'ı. 15 migration; WP-2/3/4/5 buna bağımlı. Saf entity / enum / repository ekleme — service/controller değişikliği yok. Hibernate `ddl-auto=update` mevcut tablolara yeni kolon/yeni tablo ekler.

### Added — Yeni Entity'ler

#### Backend
- **`SystemSetting`** (`system_setting`) — anahtar-değer ayar tablosu. PK: `setting_key` (VARCHAR 128). Sabit `KEY_TENANT_BUSINESS_ID = "tenant.single_business_id"`. `SystemSettingBootGuard` ApplicationRunner boot'ta NULL/blank ise WARNING log.
- **`BankAccount`** (`bank_accounts`) — banka hesabı / kasa. Alanlar: name, type (BankAccountType enum), bank_name, iban, currency (default TRY), holder_person FK (Counterpart, CASH_HOLDER tipi için), current_balance, is_active (default true), notes, created_at, updated_at.
- **`PosDevice`** (`pos_devices`) — POS cihazı. Alanlar: name, owner_counterpart FK, bank_name, default_rate (NUMERIC 5,2), last_used_rate, is_active (default true), notes, created_at, updated_at.
- **`CashClosing`** (`cash_closings`) — günlük kapanış. UNIQUE constraint closing_date'te. Alanlar: closing_date, opening_balance, computed_closing, actual_balance (PENDING'de null), difference, status (CashClosingStatus enum), is_auto, closed_at, closed_by, reason_category (LOSS/MIS_ENTRY/ROUNDING/OTHER sabitler), reason_note.

### Added — Yeni Enum'lar

- **`CounterpartKind`** — `PERSON` / `FIRM`. Varlık tipi (`CounterpartRole` ile karıştırılmamalı; role = iş ilişkisi).
- **`BankAccountType`** — `CHECKING` / `SAVINGS` / `CASH` / `CASH_HOLDER`.
- **`CashClosingStatus`** — `PENDING` / `CLOSED` / `REOPENED`.

### Added — Yeni Repository'ler

- **`SystemSettingRepository`**
- **`BankAccountRepository`** — `findByActiveTrueOrderByNameAsc`, `findByActiveTrueAndTypeOrderByNameAsc`, `findAllByOrderByActiveDescNameAsc`, `countByHolderPersonId`.
- **`PosDeviceRepository`** — `findByActiveTrueOrderByNameAsc`, `findAllByOrderByActiveDescNameAsc`, `countByOwnerCounterpartId`.
- **`CashClosingRepository`** — `findByClosingDate` (UNIQUE lookup), `findByStatusOrderByClosingDateDesc`, `findByClosingDateBetweenOrderByClosingDateAsc`, `findFirstByOrderByClosingDateDesc`.

### Changed — Mevcut Entity'lere Yeni Alanlar

#### `Counterpart`
- `kind` (CounterpartKind, NOT NULL, default FIRM) — mevcut kayıtlar otomatik FIRM olur.
- `parent` (Counterpart self FK, nullable) — alt-firma hiyerarşisi. Tree depth maks 2; uygulama katmanı kuralı.

#### `Transaction`
- `targetCounterpart` (Counterpart FK, nullable) — işlemin karşı tarafı. Tek-tenant'ta business sabit, kullanıcı counterpart seçer.
- `backdated` (boolean, default false) — geriye dönük girildi mi.
- `corrected` (boolean, default false) — başka bir tx'in düzeltmesi sonucu oluştu mu.
- `correctionOfTxId` (UUID, nullable) — düzeltilen orijinal tx id.
- `appliedPosRate` (NUMERIC 5,2, nullable) — tx anındaki POS oranı snapshot. Cihazın oranı sonra değişse bile bu sabit kalır.
- `posDevice` (PosDevice FK, nullable) — payment_method=POS olan tx'ler bu alanı doldurur.
- `posSettled` (Boolean, nullable) — null=nakit/non-POS, false=henüz hesaba düşmedi, true=düştü. Excel'deki "POS ÇEKİM HESABA GELECEK OLAN" mantığı.

#### `Debt`
- `chequeDueDate` (LocalDate, nullable) — çek vadesi (`receivable_type=CEK` için).
- `chequeCollectorBank` (VARCHAR 120, nullable) — çeki tahsile veren banka.
- `chequeNo` (VARCHAR 64, nullable) — çek seri numarası.
- `reminderDate` (LocalDate, nullable) — hatırlatma tarihi. Cron 09:00'da bu güne eşit olanlar için bildirim.
- `reminderNote` (TEXT, nullable) — hatırlatma serbest metni.

#### `AuditLog`
- `highlightType` (VARCHAR 32, nullable) — UI rozet/renk vurgusu. Değerler: BACKDATED / CORRECTION / CLOSING_REOPEN / POS_RATE_OVERRIDE / null.

### Notes

- Hibernate `ddl-auto=update` mevcut tablolara yeni kolon ekler; yeni tablolar (`system_setting`, `bank_accounts`, `pos_devices`, `cash_closings`) otomatik oluşur. Production'da `ddl-auto=validate` ile ilerlenirse Flyway/manuel migration gerekir.
- `@ColumnDefault` annotation'ları mevcut satırların NOT NULL bool alanlarda otomatik doğru default'a düşmesini sağlar (`Counterpart.kind='FIRM'`, `Transaction.backdated=false`, `BankAccount.active=true`, vs.).
- WP-1 saf data model — service/controller değişikliği yok. WP-2 (Close-of-Day Workflow), WP-3 (İşletme Detay Revize), WP-4 (POS Cihazı Yönetimi v2), WP-5 (Çek + Hatırlatma + Master Havuz) bu foundation üstünde inşa edilir.
- Backend `mvn -DskipTests compile` BUILD SUCCESS. Frontend etkilenmedi.

---

## [1.6.17] — 2026-05-20

**UI polish — sidebar sabit + tek logo + herkese version badge.**

### Changed

#### Frontend
- **`Sidebar`** — desktop'ta artık her zaman sabit (collapse butonu kaldırıldı). Önceki `desktopOpen` state + localStorage `bizboard.preferences.sidebarOpen` + `ChevronLeft`/`Menu` toggle butonları + footer Cmd/Ctrl+B hint'i tamamen kaldırıldı. Mobile/tablet'te hamburger overlay davranışı korunur.
- **`Sidebar` header** — version badge eklendi (`v1.6.17` gibi). Önceden TopBar'da yalnız admin'e gösteriliyordu; artık **tüm kullanıcılar** sidebar'da görür.
- **`TopBar`** — logo + marka adı + version satırı kaldırıldı (sidebar'da tek bir yerde tutulur). Yalnız mobile hamburger (≡) ile search/notif/profile menüsü kalır. Logosuz TopBar daha kompakt.
- **`Sidebar` Cmd/Ctrl+B keyboard shortcut** — sadece `<lg` ekranlarda anlamlı (mobile overlay aç/kapat). Desktop'ta no-op (sidebar zaten sabit).

### Removed

- **`Sidebar` desktop toggle** (collapse + kenar bandı "aç" tab'ı + `bizboard.preferences.sidebarOpen` localStorage key'i).

---

## [1.6.16.1] — 2026-05-20 (hotfix)

**Hotfix — Audit Log paneli boş görünüyordu.** Kullanıcı admin olarak user/business CRUD yapsa bile audit log panelinde hiçbir kayıt görünmüyordu. Audit kayıtları DB'ye doğru yazılıyordu — sorun response envelope shape uyumsuzluğuydu.

### Fixed

#### Backend
- **`AdminAuditController.search`** artık `PagedResponseDto<AuditLogDto>` döner (eskiden Spring native `Page<T>` ile `{content, totalElements, totalPages, last}` JSON üretiyordu). Frontend `types/index.ts#PagedResponse` ile birebir eşleşme: `{items, total_elements, total_pages, has_next, page, size}`.
- **`PagedResponseDto<T>`** (yeni, common/dto) — generic envelope wrapper; `PagedResponseDto.of(Page<T>)` static helper Spring Data Page → snake_case JSON.

### Notes

- Etki: v1.3.x'te audit log endpoint'i eklendiğinden beri paneli boş gösteriyordu. Backend `auditLogService.recordEntityAction` çağrıları doğru çalışıyor (USER_CREATE, BUSINESS_CREATE, BUSINESS_DELETE, vs. hepsi audit_logs tablosuna yazıyor); sadece admin viewer'ı render edemiyordu.
- Versiyon: 4-component hotfix (Maven `1.6.16.1`, npm `1.6.16-1`).
- Bug dashboard'a v1.6.x bug-fix log WP'sinde TODO olarak kayıt edildi.

---

## [1.6.16] — 2026-05-20

**v1.6 ACİL PROD WP — Final cleanup + monitoring documentation.** v1.6.0 ACİL PROD work-package'i bu sürümle Sentry-dışı TÜM TODO'lar kapanmış olarak teslim edildi. Kod/yorum BizBoard referansları temizlendi + monitoring mimarisi `docs/MONITORING.md` altında dokümante edildi.

### Added

- **`docs/MONITORING.md`** — yeni dokümantasyon:
  - Mimari diyagram: Browser → Next.js `/api/logs` → Spring Boot `/internal/logs`
  - 5 yakalama katmanı (React Error Boundary, Next root global-error, window.onerror, unhandledrejection, logger batch/keepalive) ayrıntılı açıklama
  - Test reçeteleri (render crash, window error, unhandled rejection)
  - Sentry SDK'nın neden v1.7+'a ertelendiği — `logger.ts` + `/api/logs` + ErrorBoundary kombo'su zaten Sentry-benzeri akış sağlıyor

### Changed

#### Backend
- **`MyCompany.java`** — javadoc içinde "BizBoard'daki işletme" → "ÇATI'daki işletme".
- **`BizBoardApplication.java`** — class-level javadoc eklendi: marka adı ÇATI; class adı + Java package path'leri `com.bizboard.*` internal stabilite için bilinçli olarak korundu.
- **`application-prod.yml`** — header yorumu "BizBoard backend on Sevalla" → "ÇATI backend on Sevalla".

#### Frontend
- **`types/index.ts`** — başlık yorumu `// BizBoard - Type Definitions` → `// ÇATI - Type Definitions`.
- **`lib/logger.ts`** — modul başlığı `BizBoard Frontend Logger` → `ÇATI Frontend Logger`; `SVC_NAME = "bizboard-web"` üzerinde açıklayıcı yorum (log ingestion uyumluluğu için sabit tutuldu).
- **`lib/version.ts`** — versiyonlama kuralı javadoc'unda `BizBoard` → `ÇATI`.

### Notes — Bilinçli olarak korunan internal referanslar

Aşağıdaki BizBoard izleri kasıtlı olarak korundu — değiştirilmesi user-state veya prod stabilitesi için yüksek risk:

1. **Java package path'leri `com.bizboard.*`** — Spring Boot component scan + tüm import path'leri; refactor edilirse 100+ dosya değişir. Etkisi yok (kullanıcı görmez); ileride büyük cleanup sürümünde ele alınabilir.
2. **`BizBoardApplication` sınıf adı** — Spring main entry; değiştirilebilir ama Maven artifact path'leri etkilenir. Internal stability için sabit.
3. **`bizboard.preferences.*` / `bizboard_draft_business` / `bb_session_id` / `bb_logout_signal` localStorage anahtarları** — değiştirme kullanıcı state'ini sıfırlar (period preference, draft, session). Migration kodu eklenmesi ayrı bir scope.
4. **`SVC_NAME = "bizboard-web"`** — backend log ingestion search history bu adla yazılmış. Migration için backend tarafında hem eski hem yeni isimle filter desteği gerek; ayrı release.
5. **Maven `groupId: com.bizboard`** — Maven artifact identifier; deploy pipeline'larını etkiler.

Hepsi `BizBoardApplication.java` javadoc'unda + bu CHANGELOG'ta dokümante edildi.

### Bu sürümle kapanan TODO'lar

- **`e83947e1`** Rebrand: kod/yorumlardaki BizBoard referansları → temizlendi (yukarıdaki listede dokümante edilen "internal stability" sınırı ile).
- **`62b3f0a2`** Error boundary + monitoring: dokümantasyon → `docs/MONITORING.md`.

### v1.6.0 — ACİL PROD WP final özet

Sentry frontend (`9a951a00`) ve Sentry backend (`698e6d9e`) dışında **51/53 TODO COMPLETED** (~%96). Sentry SDK'ları DSN + harici hesap gerektirdiği için kullanıcı tercihen v1.7+'da ele alınacak — mevcut `logger.ts` + `/api/logs` + `ErrorBoundary` stack'i Sentry'ye benzer rapor akışı zaten sağlıyor.

---

## [1.6.15] — 2026-05-20

**v1.6 ACİL PROD WP — Finance Center daily bucket + 'Bugun' preset.** `/finance` artık varsayılan olarak günlük modda; trend grafiği son 30 günün gün-gün bar chart'i; periyot selector'a "Bugun" eklendi.

> v1.6.14 numarası atlandı — QuickActions widget kaldırma TODO'su v1.6.13'e dahil edilmişti.

### Added

#### Backend
- **`GET /finance/overview`** yeni opsiyonel `?days=N` query param:
  - Set ise `current_period` = today-(N-1)..today; `previous_period` = aynı uzunlukta öncesi
  - Set ise `monthly_trend` boş döner — frontend `daily_cash_flow` üzerinden günlük chart render eder
  - Set ise `daily_cash_flow` window'u max(N, 30) güne genişler
  - `?months=N` kullanan eski istemciler etkilenmez (backward compatible)

#### Frontend
- **`/dashboard/finance` period selector** — 6 buton: **Bugun** / 1 Ay / 3 Ay / 6 Ay / 1 Yil / Tumu. Default: "Bugun".
- **`DailyTrendChart` (yeni)** — `data.daily_cash_flow`'dan son 30 günü gelir/gider bar chart olarak render eder; hover tooltip (tarih, gelir, gider, net); x-ekseni başlangıç+bitiş tarihleri.
- **`OverviewTab.dailyMode` prop** — `dailyMode === true` ise `DailyTrendChart`, değilse mevcut `MonthlyTrendChart`.

### Changed

#### Frontend
- **localStorage key migration**: eski `bizboard.preferences.financeMonths` ("1"/"3"/"6"/"12"/"0") → yeni `bizboard.preferences.financePeriod` ("daily"/"1m"/"3m"/"6m"/"1y"/"all"). İlk açılışta otomatik migrate edilir.

### Notes

- Backend + frontend build temiz.
- TODO `c7437327` kapatıldı — finance center daily bucket + "Bugun" default.
- Donut / category breakdown ve karşılaştırma tabloları `current_period`'a göre veri çekiyor; "Bugun" seçili iken bunlar zaten "bugünün kırılımı" haline gelir (backend periyot kontrolü ile).

---

## [1.6.13] — 2026-05-20

**v1.6 ACİL PROD WP — Hamburger Sidebar + QuickActions widget kaldırıldı.** Tüm kısayollar artık tek alfabetik (TR locale) panelde; Cmd/Ctrl+B aç/kapat; 10+ item olduğunda arama input'u aktif; desktop'ta persistent 240px, mobile + tablet'te off-canvas overlay.

### Added

#### Frontend
- **`components/layout/Sidebar.tsx`** — yeni hamburger sidebar:
  - 20 link (admin role'a göre 15 + 5): Ana Sayfa, Alacaklar, Belgeler, Cari Hesap, Envanter, Finans, Isletmeler, Isletme Ekle, Islem Ekle, Islemler, Nakit, POS, Profil, Raporlar, Sifre Degistir + Admin: Audit Log / Borc Migrate / Recurring / Sirketlerim / Admin Paneli
  - Alfabetik sıralama `Intl.Collator("tr")` ile — TR locale doğru "ç" ve "ı" handling
  - Arama input'u 10+ item'da görünür (`Intl.Collator` sensitivity:"base" filter)
  - `SidebarItem` component: icon + label + active state (sol kenar 3px brand-500 indicator) + optional count badge
  - Klavye: `Cmd/Ctrl+B` aç/kapat (desktop = collapse; mobile = overlay)
  - Desktop tercihi `bizboard.preferences.sidebarOpen` localStorage'da persist
- **`components/layout/DashboardShell.tsx`** — Sidebar + TopBar + BottomNav + ErrorBoundary entegrasyon shell'i. Server component `DashboardLayout` bunu çağırır; mobile open/close state client-side.
- **`TopBar.onMenuClick` prop** — hamburger butonu `<lg` ekranlarda görünür, mobile sidebar overlay'i açar.

### Changed

#### Frontend
- **`app/dashboard/layout.tsx`** — `DashboardShell` ile sarmalandı.
- **`app/business/[id]/layout.tsx`** — aynı `DashboardShell` kullanır (sidebar business detay sayfasında da var).
- **`app/dashboard/page.tsx`** — `QuickActions` widget çağrısı kaldırıldı (v1.6.14 TODO `636cd83b`). Kısayollar artık sidebar'da.

### UX behavior

- **Desktop ≥1024px**: sidebar persistent 240px sol panel; `<ChevronLeft>` ile daraltılınca ekran kenarında küçük "aç" tab'ı kalır.
- **Mobile + tablet <1024px**: TopBar hamburger ≡ tetikler; backdrop blur + click-outside kapatma; item click anında da kapanır.
- **Active item**: brand-700/30 background + sol kenar 3px brand-500 indicator + brand-300 icon.
- **Cmd/Ctrl+B**: hem mobile hem desktop'ta toggle; arama input'u açıkken bile çalışır.

### Removed

- **`app/dashboard/page.tsx`** içinden `<QuickActions />` render. Component dosyası şimdilik tutuldu (artık kullanılmıyor; v1.7+'da silinebilir).

### Notes

- Frontend `next build` TypeScript compile + lint temiz.
- 6 Sidebar TODO + 1 QuickActions removal TODO kapatıldı (toplam 7).

---

## [1.6.12] — 2026-05-20

**v1.6 ACİL PROD WP — Gruplama frontend.** Dashboard'da işletmeler artık öncelik seviyeli gruplar halinde — dnd-kit ile sürükle-bırak, "Yeni grup" modal'ı, edit ⋮ menüsü (rename / color / priority / delete), collapsible group cards, 8-renk palette, PINNED/HIGH/NORMAL görsel ayrımı.

### Added

#### Frontend
- **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`** dependencies.
- **`lib/business-groups.ts`** — `Period`/priority sabitleri (`PRIORITY_PINNED=0`, `HIGH=1`, `NORMAL=2`), 8-renk palette + Tailwind sınıf haritası, `priorityIcon`/`priorityLabel`, `sortGroups` helper.
- **`types/index.ts`** — `BusinessGroup`, `BusinessGroupMemberItem`, `GroupColor`, `GroupPriority` tipleri.
- **`hooks/useBusinessGroups.ts`** — fetch + create/update/delete + add/remove member + reorder mutations; backend `/me/business-groups` ile konuşur.
- **`components/dashboard/groups/CreateGroupModal.tsx`** — isim input (max 80) + 8-color palette + 3 priority chip.
- **`components/dashboard/groups/EditGroupMenu.tsx`** — ⋮ dropdown: Rename (inline input) / Color (grid) / Priority (submenu) / Delete (confirm).
- **`components/dashboard/groups/BusinessCardDraggable.tsx`** — `useDraggable` ile sürüklenebilir; gelir/gider/net kâr kart kalıbı korunur; grip handle + gruptan çıkar (X) butonu.
- **`components/dashboard/groups/BusinessGroupCard.tsx`** — accent bar (sol kenar 3px) + header (priority ikonu + ad + üye sayısı + ⋮ + collapse) + droppable members area + SortableContext within-group reorder.
- **`components/dashboard/groups/GroupedBusinessGrid.tsx`** — top-level orchestrator: DndContext + sortGroups (PINNED → HIGH → NORMAL) + "Grupsuz" virtual section + "Yeni Grup" butonu.
- **PINNED visual:** 📌 ikon + accent bar + "PINNED" rozeti + `sticky top-0` (scroll'da en üstte kalır).
- **HIGH visual:** ⭐ ikon + subtle ring.
- **NORMAL visual:** nötr (sadece accent bar rengi).

### Changed

#### Frontend
- **`app/dashboard/page.tsx`** — `BusinessGrid` → `GroupedBusinessGrid`. Eski flat grid mobile `/dashboard/businesses` sayfasında korunur.

### UX behavior

- **Drag from Grupsuz → Group**: target group'a üye eklenir; kaynak Grupsuz'da otomatik kaybolur (artık üye, listeden düşer).
- **Drag from Group A → Group B**: B'ye eklenir + A'dan çıkarılır (move semantiği).
- **Within-group reorder**: SortableContext + dnd-kit `rectSortingStrategy`.
- **Cross-priority drag** UI'da izin verilmez (her grup kendi droppable'ı; priority değişimi yalnız ⋮ menüsünden).
- **Pointer activation threshold 5px** — yanlışlıkla drag start önlenir (kart klik'leri /business/[id] route'una gider).

### Notes

- Frontend `next build` TypeScript compile + lint temiz; static export `NEXT_PUBLIC_API_URL` prerender hatası pre-existing.
- 5 frontend Gruplama TODO'su kapatıldı (dnd, create UI, collapsible, edit menü, priority visual).

---

## [1.6.11.1] — 2026-05-19 (hotfix)

**Hotfix — controller path mismatch.** PosController, CashController, ReceivableController ve yeni BusinessGroupController `/api/...` prefix'i ile mapped'iyken projedeki diğer tüm controller'lar (BusinessController `/businesses`, PortfolioController `/portfolio`, UserController `/me`, vs.) prefix'siz. Frontend pattern'i de prefix'siz (`/pos/businesses`, `/cash/businesses`, `/receivables`). Bu nedenle POS/Nakit/Alacaklar sayfaları sessizce 404'lüyor ve `.catch(() => [])` ile boş state gösteriyordu — kullanıcı bu yüzden bu özellikleri henüz test edememişti.

### Fixed

#### Backend
- **`PosController`** — `@RequestMapping("/api/pos")` → `/pos`
- **`CashController`** — `@RequestMapping("/api/cash")` → `/cash`
- **`ReceivableController`** — `@RequestMapping("/api/receivables")` → `/receivables`
- **`BusinessGroupController`** — `@RequestMapping("/api/me/business-groups")` → `/me/business-groups`

#### Frontend
- **`useBusinessGroups` hook** — tüm `/api/me/business-groups...` çağrıları `/me/business-groups...` olarak güncellendi.

### Notes

- Etki: v1.6.3'ten beri (POS), v1.6.5'ten beri (Alacaklar) ve v1.6.11'den beri (Gruplama — UI henüz yok) sessizce 404'lüyordu.
- Diğer controller'lar ile uyumlu pattern: Spring `server.servlet.context-path` set değil, controller'lar root path'ten mount ediliyor.
- Versiyon: 4-component hotfix (Maven `1.6.11.1`, npm `1.6.11-1`).

---

## [1.6.11] — 2026-05-19

**v1.6 ACİL PROD WP — Gruplama backend.** Kullanıcının dashboard'undaki işletmeleri öncelik seviyeli gruplara ayırma. `business_groups` + `business_group_members` tabloları + CRUD + reorder + üye yönetimi + sıkı user-isolation.

### Added

#### Backend
- **`BusinessGroup` entity** — `id UUID PK`, `user_id FK CASCADE`, `name VARCHAR(80) NOT NULL`, `color VARCHAR(16)`, `order_index INT`, `priority INT DEFAULT 2` (sabit: 0=PINNED / 1=HIGH / 2=NORMAL), `created_at`, `updated_at`. KULLANICIYA ÖZEL.
- **`BusinessGroupMember` entity** — `id UUID PK`, `group_id FK CASCADE`, `business_id FK CASCADE`, `order_in_group INT`, `added_at`. Unique constraint `(group_id, business_id)`.
- **Repos:** `BusinessGroupRepository` (`findByUserIdOrderBy...`, `findByIdAndUserId` isolation guard); `BusinessGroupMemberRepository` (`findAllForUser` tek query'de tüm üyeler — N+1 önleyici).
- **DTOs (snake_case `@JsonProperty`):** `BusinessGroupDto`, `BusinessGroupMemberDto`, `CreateBusinessGroupRequest`, `UpdateBusinessGroupRequest`, `AddGroupMemberRequest`, `ReorderRequest`.
- **`BusinessGroupService`:**
  - `listMyGroups(userId)` — priority ASC, orderIndex ASC, createdAt ASC; tüm üyeler tek query (N+1 önleme).
  - `createGroup` — renk paleti (`zinc/blue/green/orange/red/purple/pink/teal`) + priority validation (0/1/2); aynı priority içinde son orderIndex+1 ile sıralanır.
  - `updateGroup` — partial update (name/color/priority); priority değişimi yeni seviyenin sonuna iter.
  - `deleteGroup` — cascade üyeler temizlenir + audit log.
  - `addMember` — `BusinessAccessGuard.assertCanAccessBusiness` IDOR koruması + idempotent duplicate handling (frontend dnd retry'ları için).
  - `removeMember` — bulk delete by composite key.
  - `reorderGroups` — `WHERE user_id = currentUser` izolasyon + aynı priority kısıtı (spec'e göre cross-priority drag yasak).
  - `reorderMembers` — order 0,1,2,...; listede olmayan üyeler sona iter (partial reorder safe).
- **`BusinessGroupController` (`/api/me/business-groups`):**
  - `GET /` list
  - `POST /` create
  - `PATCH /{groupId}` update (rename / color / priority)
  - `DELETE /{groupId}` delete
  - `POST /reorder` `{ ids: [...] }`
  - `POST /{groupId}/members` add member
  - `DELETE /{groupId}/members/{businessId}` remove member
  - `POST /{groupId}/members/reorder` reorder

### Security

- Kullanıcı izolasyonu: tüm `findByIdAndUserId` lookup'ları başka kullanıcının grubuna erişimi `SecurityException` ile reddeder.
- IDOR koruması: üye eklerken business erişimi `BusinessAccessGuard` üzerinden — kullanıcı görmediği işletmeyi grubuna ekleyemez.
- Reorder izolasyonu: aynı priority kısıtı + sahip kontrolü hem grup hem üye reorder'da.

### Notes

- Backend compile temiz (`mvn -DskipTests compile` → BUILD SUCCESS).
- Frontend (`v1.6.12`'de) — dnd-kit ile sürükle-bırak, "Yeni grup" modal'ı, collapsible + drag-to-reorder, edit menüsü, öncelik görsel ayrımı.

---

## [1.6.10.1] — 2026-05-19 (hotfix)

**Hotfix — zorunlu şifre değişimi 400 Bad Request veriyordu.** Non-admin kullanıcı oluşturup `mustChangePassword=true` ile geldiğinde `POST /me/password` endpoint'i `"currentPassword: boş değer olamaz, newPassword: boş değer olamaz"` döndürüyordu — kullanıcı şifresini değiştiremediği için tamamen kilitleniyordu.

### Fixed

#### Backend
- **`ChangePasswordRequest`** — `@JsonProperty("current_password")` ve `@JsonProperty("new_password")` annotation'ları eksikti. Projede global `spring.jackson.property-naming-strategy=SNAKE_CASE` config'i yok; her DTO kendi mapping'ini taşıyor (CreateTransactionRequest, CreateDebtRequest, UpdateUserRequest, vs.). Bu DTO atlanmış olduğu için Jackson frontend'in gönderdiği `current_password`/`new_password` alanlarını eşleştiremiyor, alanlar `null` kalıp `@NotBlank` validation'ı tetikleniyordu.

### Notes

- Frontend zaten doğru body'yi yolluyordu (`{ current_password, new_password }` — bkz. `src/app/dashboard/change-password/page.tsx:39`). Düzeltme tamamen backend tarafında.
- Versiyon 4-component (`v1.6.10.1` Maven / `v1.6.10-1` npm) — deployed `v1.6.10` üzerine hotfix kuralı gereği.

---

## [1.6.10] — 2026-05-18

**v1.6 ACİL PROD WP — `/counterparts` Geri dön butonu.** Küçük UX düzeltmesi.

### Added

#### Frontend
- **`/dashboard/counterparts`** — başlığın yanına "Geri dön" ok butonu (uses `router.back()`). Mobile bottom-nav'dan veya doğrudan link ile gelinmiş kullanıcılar için.

---

## [1.6.9] — 2026-05-18

**v1.6 ACİL PROD WP — Error Boundary + Monitoring.** React class-based ErrorBoundary eklendi ve dashboard, admin, business detail route'larına wire edildi. Diğer monitoring TODOları zaten implementing edilmiş (audit sırasında ortaya çıktı) — bunlar da kapatılıyor.

### Added

#### Frontend
- **`src/components/layout/ErrorBoundary.tsx`** — class component:
  - `getDerivedStateFromError` ile render-time exception'ları yakalar
  - `componentDidCatch` → `logger.error("boundary", ..., { component_stack, level })`
  - Default fallback UI: kırmızı uyarı ikonu + başlık + Türkçe mesaj + "Tekrar dene" / "Ana sayfa" butonları
  - Dev mode'da `<details>` içinde error.name + message + stack (ilk 2 KB)
  - `level` prop'u telemetri için (route / route-admin / route-business / global / vs.)
  - Custom `fallback(error, retry)` prop'u opsiyonel — özel ekranlar için
- **Wiring:**
  - `src/app/dashboard/layout.tsx` — `<ErrorBoundary level="route">` `<main>`'i sarar
  - `src/app/admin/layout.tsx` — `<ErrorBoundary level="route-admin">` admin gövdeyi sarar
  - `src/app/business/[id]/layout.tsx` — `<ErrorBoundary level="route-business">` business `<main>`'i sarar

### Notes — Audit'te keşfedilenler (zaten implementing edilmiş ama TODO'da açık)

Bu sürümde yeni eklediğim ErrorBoundary dışında, monitoring chain'inin diğer parçaları zaten önceki versiyonlarda implement edilmişti:

- **`a535d85a` (/api/logs endpoint)** — `src/app/api/logs/route.ts` zaten var (Next.js → backend `/internal/logs` proxy, keepalive batch ingestion).
- **`a0d236d9` (Global error capture wiring)** — `src/components/layout/ClientProviders.tsx` zaten `window.addEventListener("error")` ve `window.addEventListener("unhandledrejection")` → `logger.error("boundary", ...)` yapıyor.
- **`src/app/global-error.tsx`** — Next.js App Router root-segment crash fallback'i de zaten var (digest + logger.error + Türkçe friendly UI).
- **`src/lib/logger.ts`** — production batch buffer (25 record / 5s), keepalive, visibilitychange + beforeunload flush, dev console formatter ile kurulu.

### Deferred (PENDING TODO'lar)

- **`9a951a00` Sentry frontend SDK** — kurulumu DSN ve Sentry hesabı gerektirir; kullanıcının sentry.io kontrol panelinde proje oluşturması gerek. Mevcut `logger.ts` + `/api/logs` + ErrorBoundary kombo'su Sentry'ye benzer akış sağlıyor (errors backend'a düşüyor). Sentry eklenmesi opsiyonel UX upgrade — v1.7+ için.
- **`698e6d9e` Sentry backend SDK** — aynı şekilde DSN gerekli, opsiyonel.
- **`62b3f0a2` Documentation** — ayrı bir dokümantasyon TODO'su; içerik buraya CHANGELOG'a girdi, ayrıca docs/ dizini eklemek bu sürümün scope'u değil.

### Notes

- Frontend `next build` TypeScript compile + lint temiz.
- Backend değişiklik yok.

---

## [1.6.8] — 2026-05-18

**v1.6 ACİL PROD WP — Rebrand: BizBoard → ÇATI (user-facing strings).** Kullanıcının gördüğü her şey artık ÇATI markası taşıyor: tab title, manifest, top bar logo + wordmark, login ekranı, profil footer, ilk-giriş hoşgeldin bildirimi. İç (paket adı, application class, log SVC_NAME, localStorage key prefix'leri) eski kalır — onlar `e83947e1` TODO'sunun kapsamı (ayrı, büyük mekanik geçiş, v1.7+).

### Changed

#### Frontend
- **`src/app/layout.tsx`** — `metadata.title` → `"CATI - Tum Isletmeleriniz, Tek Ekran"`, `appleWebApp.title` → `"CATI"`.
- **`public/manifest.json`** — `name` → `"ÇATI - Çoklu İşletme Yönetim Paneli"`, `short_name` → `"ÇATI"`, `description` Türkçe + ÇATI marka, `background_color` `#f8f9fa` → `#212529` (gerçek koyu temayla uyumlu).
- **`src/components/layout/TopBar.tsx`** — logo rozeti `"BB"` → `"C"`, wordmark `"BizBoard"` → `"CATI"`, link'e `aria-label="CATI ana sayfa"`.
- **`src/app/auth/login/page.tsx`** — büyük logo `"BB"` → `"C"`, alt yazı `"BizBoard hesabiniza giris yapin"` → `"CATI hesabiniza giris yapin"`.
- **`src/app/dashboard/profile/page.tsx`** — footer `"BizBoard v..."` → `"CATI v..."`.

#### Backend
- **`AuthService.tryCreateFirstLoginNotification`** — başlık `"BizBoard'a hos geldin!"` → `"CATI'ya hos geldin!"`. Body değişmedi.

### Notes

- Backend compile + frontend `next build` TypeScript pass temiz.
- **OpenAPI / Swagger rebrand (`1762ea93`)** — proje şu an springdoc/swagger dependency içermiyor (ne `pom.xml`'de ne resources'da OpenAPI config var). Rebrand edilecek yüzey yok; TODO closed olarak işaretlenir, yeni OpenAPI/Swagger eklendiğinde marka adı ÇATI olmalı.
- **Email/bildirim template rebrand (`b79e2136`)** — sistemde harici email template yok (HTML, FreeMarker, Thymeleaf hiçbiri yok). Yalnız `Notification` entity'sinden gelen mesajlar var; bunlar `NotificationService.create(title, body, ...)` çağrılarında inline. Tek user-facing brand string'i (welcome notification) bu sürümde güncellendi.
- **Code/comment cleanup (`e83947e1`)** — `com.bizboard.*` Java package path'i, `BizBoardApplication` class adı, `bizboard-web` logger SVC name, `bizboard_draft_business` / `bizboard.preferences.*` localStorage anahtarları **değişmedi**. Bunların değişmesi:
  - Java refactor (package rename) — derin bir yapı değişikliği, tüm import path'leri etkiler.
  - localStorage key migration — kullanıcı state'i kaybolur veya migration kodu eklenmesi gerekir.
  - Bu kapsam v1.7.x+'a (rebrand cleanup release) ertelenir; mevcut TODO açık bırakılır.

---

## [1.6.7] — 2026-05-18

**v1.6 ACİL PROD WP — Periyot Aylık → Günlük (default switch).** Sistem geneli varsayılan periyot artık `daily` ("Bugün"). Backend `?period=` query param backwards-compatible kalıyor; kullanıcı dashboard'dan periyot seçince localStorage'a yazılıp tüm ziyaretlerde aktif oluyor.

### Added

#### Frontend
- **`lib/preferences.ts`** — yeni utility:
  - `Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly"` + `PERIODS` listesi
  - `SYSTEM_DEFAULT_PERIOD = "daily"` (sabit, backend ile uyumlu)
  - `getDefaultPeriod()` / `setDefaultPeriod()` — localStorage key `bizboard.preferences.defaultPeriod`; SSR-safe (window kontrolü)
  - `periodLabel(p)` / `periodShortLabel(p)` — Türkçe etiketleyici (Bugun / Bu hafta / Bu ay / ...)
- **Dashboard period selector** (`/dashboard`) — sağ üstte 5'li chip grubu (Bugun / Bu hafta / Bu ay / Bu ceyrek / Bu yil). Seçim anında `usePortfolio` yeniden fetch eder + localStorage'a yazılır.
- **`PortfolioCard.period` prop** — TrendingUp rozeti yanındaki etiket dinamik (`periodLabel(period)`).

### Changed

#### Backend
- **`SummaryService.resolveDateRange`** — `DEFAULT_PERIOD` sabiti `"monthly"` → `"daily"`. `period` null/blank gelirse bugünün date range'i (today, today) dönülür. Bilinmeyen periyot (typo) için fallback da artık daily. Açık `?period=monthly|weekly|...` kullanan istemciler etkilenmez (backward compatible).

#### Frontend
- **`usePortfolio(period?)`** — artık `?period=` kullanıyor (eskiden `?year=&month=`). Argüman verilmezse `getDefaultPeriod()` üzerinden okuyor. Tek return shape: `{portfolio, isLoading, error, period}`.
- **`/dashboard/finance` default `months`** — 6 → 1 (en kısa periyot). Kullanıcı seçimi `bizboard.preferences.financeMonths` key'i altında ayrıca persist edilir.

### Notes

- Backend compile: `mvn -DskipTests compile` → BUILD SUCCESS.
- Frontend `next build`: TypeScript compile + lint temiz.
- TODO `c7437327` (finance center daily bar chart, 30 günlük günlük bucket) **partial** — default period değişti ama trend grafiği için backend `/finance/overview?period=daily` desteği henüz yok; günlük bucket aggregation v1.7+ için açık. Mevcut "1 Ay" hala aylık tek bar gösteriyor.
- TODO `b262ef8a` (localStorage persistence) — hem dashboard period (`bizboard.preferences.defaultPeriod`) hem finance months (`bizboard.preferences.financeMonths`) için ayrı ayrı persist.

---

## [1.6.6] — 2026-05-18

**v1.6 ACİL PROD WP — Alacaklar frontend (v1.6.5 backend üstüne).** Borç formu artık RECEIVABLE seçilince "Alacak Tipi" select gösteriyor (SENET / Cek / Altin / Nakit / Diger). Dashboard'a `/alacaklar` aggregate sayfası ve kısayolu geldi.

### Added

#### Frontend
- **`ReceivableType`** tipi (`types/index.ts`) — `"SENET" | "CEK" | "ALTIN" | "NAKIT" | "DIGER"`.
- **`Debt.receivable_type` + `receivable_type_other`** alanları (opsiyonel) Debt arayüzünde.
- **`ReceivableTypeBreakdown` + `ReceivableAggregate`** tipleri — GET /api/receivables cevabı için.
- **`DebtModule.CreateDebtModal`** — `direction === "RECEIVABLE"` iken yeni "Alacak Tipi" buton grubu (5 seçenek + `DIGER` → 120 karakter sınırlı text input). Submit anında:
  - `receivable_type` (kanonik enum)
  - `receivable_type_other` (yalnız `DIGER` için)
  - `instrument_type` (legacy contract için seçilen değer / `DIGER` ise serbest metin) ile birlikte gönderilir.
- **`/dashboard/alacaklar`** (yeni sayfa):
  - Toplam alacak + açık kayıt sayısı kartları
  - Sıralama chip'leri: Tutar (cok→az) / Vade (yakin→uzak) / İsim (A-Z TR locale)
  - Karşı taraf bazlı kart listesi; her satırda tip rozetleri (SENET / Cek / Altin / Nakit / Diger label / Belirtilmemis) + son vade tarihi
  - `counterpart_id` varsa karşı taraf detay sayfasına link.
- **`QuickActions`** — "Alacaklar" kısayolu (amber `HandCoins`).

### Changed

#### Frontend
- **`DebtModule.handleSubmit`** — `DIGER` seçili ama `receivable_type_other` boşsa client-side `setError` ile uyarı (backend'den geri dönmek yerine erken kontrol).

### Notes

- Build (`next build`): TypeScript compile ve type-check temiz; static export sırasında `NEXT_PUBLIC_API_URL` prerender hatası (pre-existing) sürüyor — prod build'te env set'leniyor.
- Backend tarafında değişiklik yok — v1.6.5 endpoint'leri doğrudan kullanılıyor.
- "Sidebar Alacaklar kısayolu" TODO'su mevcut `QuickActions` widget'ına yerleştirildi (hamburger sidebar ayrı bir TODO chain'i).

---

## [1.6.5] — 2026-05-18

**v1.6 ACİL PROD WP — Alacaklar backend.** Debt entity artık `receivable_type` + `receivable_type_other` taşıyor, yeni `GET /api/receivables` aggregate endpoint'i counterpart bazlı alacak özetini dönüyor. Frontend (debt form tip select, `/alacaklar` sayfası) v1.6.6'da.

### Added

#### Backend
- **`Debt.receivableType`** (VARCHAR(32) nullable) — RECEIVABLE direction'lı debt'ler için tip seçimi. İzin verilen değerler (uygulama-level enum): `SENET`, `CEK`, `ALTIN`, `NAKIT`, `DIGER`. PAYABLE debt'ler için null kalır. Hibernate `ddl-auto=update` mevcut tabloya kolonu nullable ekler — eski kayıtlar otomatik null (UNSPECIFIED) olur.
- **`Debt.receivableTypeOther`** (VARCHAR(120) nullable) — `receivable_type = DIGER` iken serbest metin tip adı.
- **`CreateDebtRequest.receivable_type` + `receivable_type_other`** alanları (opsiyonel, JsonProperty snake_case).
- **`DebtDto.receivable_type` + `receivable_type_other`** — read API'larda görünür.
- **`ReceivableTypeBreakdownDto`** — counterpart altındaki tek bir tip için `{type, label, amount, count}`. `type=DIGER` ise `label` = `receivable_type_other`.
- **`ReceivableAggregateDto`** — counterpart bazlı özet: `{counterpart_id?, counterpart_name, total_amount, currency, receivable_types[], last_due_date?, count}`.
- **`ReceivableService.getReceivables(userId)`:**
  - Admin → tüm RECEIVABLE+settled=false debt'ler.
  - Viewer → `accessibleBusinesses` üzerinden filtrelenmiş + admin_only=false.
  - Group by counterpart_id (varsa) yoksa lowercased `counterparty` string.
  - Tip kırılımı: SENET / CEK / ALTIN / NAKIT / DIGER (label ile birleştirilir) / UNSPECIFIED (null tipler).
  - `lastDueDate` = grup içindeki `due_date`'lerin max'i (null-safe).
  - Sonuç `total_amount DESC` sıralı döner.
- **`GET /api/receivables`** — yeni controller. `@AuthenticationPrincipal` ile user-scope.

### Changed

#### Backend
- **`DebtService.createDebt`** — yalnız direction=RECEIVABLE ve receivable_type non-blank ise normalize edilir. Türkçe karakter normalize (`Ç→C`, `Ğ→G`, `İ→I`, `Ö→O`, `Ş→S`, `Ü→U`) sonrası izin verilen 5 değerden biri değilse `IllegalArgumentException`. `DIGER` ise `receivable_type_other` zorunlu (boş → `IllegalArgumentException`); 120 karaktere truncate edilir.
- **`DebtService.toDto`** — `receivable_type` + `receivable_type_other` exposed.

### Notes

- Backend compile temiz: `mvn -DskipTests compile` → BUILD SUCCESS.
- v1.6.6'da frontend gelene kadar `instrument_type` (legacy alan) ile `receivable_type` (yeni alan) bir arada yaşar. Frontend RECEIVABLE oluştururken her ikisini de gönderebilir; backend instrumentType'ı zorunlu tutmaya devam eder (legacy contract).

---

## [1.6.4] — 2026-05-18

**v1.6 ACİL PROD WP — POS/NAKIT frontend (v1.6.3 backend üstüne).** İşlem formu artık ödeme yöntemini soruyor, dashboard'a `/pos-cihazlari` ve `/nakit` aggregate sayfaları geldi. Mevcut işlemler default NAKIT olarak işaretli (`payment_method` kolonu `@ColumnDefault "'NAKIT'"`).

### Added

#### Frontend
- **Transaction tipi** — `payment_method?: "POS" | "NAKIT"` ve `pos_rate?: number | null` opsiyonel alanları + `PaymentMethod` tipi (`types/index.ts`).
- **Aggregate DTO tipleri** — `PosBusinessSummary`, `PosTransactionRow`, `CashBusinessBalance` (`types/index.ts`).
- **`/dashboard/add-transaction` formu** — "Odeme Yontemi" 2'li toggle (Nakit / POS). POS seçilirse `pos_rate` (%) input açılır; gönderim sırasında `payment_method` + `pos_rate` POST body'sine eklenir. Query string'inde `?payment_method=POS|NAKIT` desteklenir (preselect).
- **`TransactionList` satır rozeti** — her tx satırında küçük POS/Nakit rozeti (POS rozeti `pos_rate` da gösterir).
- **`TransactionList` detay modalı** — view mode'da "Odeme" satırı (POS için komisyon + net hesabı görünür). Edit mode'da payment_method toggle + pos_rate input.
- **`TransactionList.paymentFilter` prop** — `"ALL" | "POS" | "NAKIT"`; bilinmeyen tx'ler NAKIT varsayılır.
- **`/dashboard/pos-cihazlari`** (yeni sayfa) — Toplam ciro / komisyon / net 3'lü kart, işletme filter chip'leri, işletme bazlı kart listesi (ortalama oran + tx sayısı), son 30 günün gün-gün POS işlem detayı (komisyon ve net dahil).
- **`/dashboard/nakit`** (yeni sayfa) — Toplam nakit kartı + işletme bazlı bakiye listesi (yalnız bakiyesi > 0 olanlar).
- **Dashboard `QuickActions`** — "POS" ve "Nakit" kısayolları (yeni sidebar gelene kadar buraya konuldu).
- **`/business/[id]`** — "Son Islemler" başlığının yanına `POS Islem` shortcut (preset `payment_method=POS`), başlık altına `Tumu / POS / Nakit` filter chip'leri.

### Changed

#### Frontend
- **`TransactionList`** `paymentFilter` prop ile filtrelenebilir; eksik `payment_method` → "NAKIT" varsayılır (geriye dönük uyumluluk: v1.6.3 öncesi tx'ler).

### Notes

- Backend tarafında değişiklik yok — v1.6.3'teki entity / endpoint / service'ler doğrudan kullanılıyor.
- "Sidebar POS/Nakit kısayolu" TODO'su mevcut `QuickActions` widget'ına konularak tamamlandı; hamburger sidebar ayrı bir TODO chain'i (v1.6.x ilerisi).
- TypeScript build (`next build`) temiz: type check ve linting geçiyor; static export sırasında `NEXT_PUBLIC_API_URL` prerender hatası verir — bu pre-existing, prod build'te env set'leniyor.

---

## [1.6.3] — 2026-05-18

**v1.6 ACİL PROD WP — POS/NAKIT backend foundation.** Tek CRITICAL TODO (`payment_method` enum migration) ve onun açtığı 5 HIGH bağımlılığı kapatıldı. Frontend (transaction form radio, /pos-cihazlari, /nakit sayfaları) v1.6.4'te.

### Added

#### Backend
- **`Transaction.paymentMethod`** (VARCHAR(16), `@ColumnDefault "'NAKIT'"`) — yalnız "POS" veya "NAKIT". Hibernate `ddl-auto=update` mevcut tabloya `payment_method` kolonunu default `'NAKIT'` ile ekler; eski tx'ler otomatik NAKIT olarak işaretlenir.
- **`Transaction.posRate`** (`NUMERIC(5,2)` nullable) — POS işlemleri için banka komisyon oranı. NAKIT için null.
- **`CreateTransactionRequest.payment_method` + `pos_rate`** alanları (opsiyonel).
- **`UpdateTransactionRequest.payment_method` + `pos_rate`** alanları — update akışında değişim diff'ine girer, audit metadata'da görünür.
- **`TransactionDto.payment_method` + `pos_rate`** — read API'larda görünür.
- **`PosService` + `PosController`:**
  - `GET /api/pos/businesses` — `accessible_businesses` filtreli işletme bazında POS özet: `total_pos_count`, `total_pos_amount`, ağırlıklı ortalama `avg_pos_rate` (SUM(amount × rate) / SUM(amount)), `last_tx_at`. Bakiye DESC sıralı.
  - `GET /api/pos/transactions/daily?date=YYYY-MM-DD&businessId=opsiyonel` — günlük POS işlem tablosu: tx_id, business, amount, pos_rate, **pos_commission** (amount × rate / 100), **net_amount** (amount − commission), description, time.
- **`CashService` + `CashController`:**
  - `GET /api/cash/businesses` — payment_method=NAKIT olan işlemlerden işletme bazlı net bakiye (INCOME − EXPENSE). Yalnız > 0 olanlar dönülür, bakiye DESC.
- **`TransactionRepository`** iki yeni query: `findByBusinessIdInAndPaymentMethod` + `findByBusinessIdInAndPaymentMethodAndDate`.

### Changed

#### Backend
- **`TransactionService.createTransaction`** — payment_method normalize (POS/NAKIT, diğer → fallback NAKIT) + posRate kaydedilir (yalnız POS için).
- **`TransactionService.updateTransaction`** — payment_method + pos_rate update + audit diff. NAKIT'e çevirilirse posRate otomatik null. POS'a çevirilirse caller'in posRate vermesi beklenir.
- **`DtoMapper.toTransactionDto`** — yeni alanları taşır.

### Notes

- **Schema değişikliği:** Hibernate cold start'ta `ALTER TABLE transactions ADD COLUMN payment_method VARCHAR(16) NOT NULL DEFAULT 'NAKIT'` ve `ADD COLUMN pos_rate NUMERIC(5,2)`. Mevcut tüm tx'ler NAKIT olarak işaretlenir, etki yok.
- **WP TODO durumu** (6 PENDING → COMPLETED'a çekilecek dashboard sync ile): payment_method migration, pos_rate migration, transaction DTO + validation, POS businesses endpoint, POS daily endpoint, Cash businesses endpoint.
- **v1.6.4 planı:** frontend transaction form (Ödeme yöntemi radio), `/pos-cihazlari` sayfası (kart + günlük tablo), `/nakit` sayfası (tablo), 3 yeni kısayol, işletme detayında POS/Nakit filter chip'leri.

---

## [1.6.2.2] — 2026-05-18

**Hotfix on v1.6.2 — versiyon UI display formatlayıcı.** v1.6.2.1'i yayınladığımda TopBar admin'lere `v1.6.2-1` (npm pre-release formatı) gösteriyordu. Kullanıcı talep etti: hotfix yoksa 3-component, varsa 4-component görünmeli — `1.6.2.1` formatı.

### Added

#### Frontend
- **`lib/version.ts` → `formatVersion(raw)` helper.** Display normalize eder:
  - `"1.6.3"` → `"1.6.3"` (hotfix yok, 3-component)
  - `"1.6.3-1"` (npm SemVer pre-release) → `"1.6.3.1"` (4-component display)
  - `"1.6.3-0"` defansif edge-case → `"1.6.3"` (hotfix=0 = baseline)
  - Bilinmeyen format → olduğu gibi (örn. `"1.7.0-rc.1"` korunur)
- TopBar admin sürüm rozeti ve `/dashboard/profile` footer'ı artık `formatVersion()` üzerinden okuyor.
- Logger (`lib/logger.ts`) raw `NEXT_PUBLIC_APP_VERSION` kullanmaya devam ediyor — server'a / audit'e giden log entry'lerinde npm SemVer formatı doğru (sort + cross-tool ayrıştırma).

### Notes

- Versiyon iki yerden okunur:
  - `package.json.version` (npm) — npm SemVer strict: `1.6.2-2` formatı
  - `pom.xml` (Maven) — 4-component native: `1.6.2.2`
  - Git tag: `v1.6.2.2` (string-based, tutarlı)
- `next.config.js` `package.json.version`'u `NEXT_PUBLIC_APP_VERSION` env'ine inject ediyor (v1.0.2 mekaniği). UI'da `formatVersion()` ile gösteriyoruz.
- Memory note güncellendi: hotfix versiyonlama + UI display kuralları tek dosyada.

---

## [1.6.2.1] — 2026-05-18

**Hotfix on v1.6.2 — wizard'da "Tip Seçimi" adımı (Step 1) tamamen kaldırıldı.** v1.6.2'de master `BusinessType` tablosunu sildim ama wizard'da Step 1 olarak Tip Adı zorunlu giriş alanı kaldı. Kullanıcı haklı olarak: "tip seçimi yoksa adım da olmasın" dedi.

Bu sürüm BizBoard'da **ilk 4-component versiyonlu hotfix** — yeni kural: hotfix'ler `v1.X.Y.Z` (Maven), `v1.X.Y-Z` (npm SemVer pre-release).

### Removed

#### Frontend
- **Wizard `StepBusinessType` adımı tamamen kaldırıldı.** `STEPS` artık 6 yerine 5 adım: Temel Bilgiler → Modüller → Kuruluş → Aylık Gider → Önizleme. Tüm step indeksleri 1 geriye kaydı (`canNext`, render, navigation).
- `typeNameSuggestions` state + `/business-types/names` fetch (endpoint zaten v1.6.2'de silinmişti, frontend çağrısı 404 dönüyordu).

#### Backend
- **`CreateBusinessRequest.businessTypeName` `@NotBlank` kaldırıldı.** Alan opsiyonel — null/empty kabul edilir.
- `BusinessService.createBusiness` artık tip adı boşsa hata atmıyor; sadece null olarak kaydeder.

### Notes

- **Yeni versiyonlama kuralı:** hotfix'ler ana sürüm hattını "kirletmeyecek" şekilde 4-component'le ifade edilir. Maven `1.6.2.1` native destekler; npm SemVer strict olduğu için `1.6.2-1` pre-release tag'i kullanılır (sort olarak `1.6.2`'den sonra gelir). Git tag `v1.6.2.1`. Bir sonraki planlı sürüm yine 3-component `v1.6.3` olarak gelecek; o sürüme hotfix gerekirse `v1.6.3.1` olur.
- Mevcut işletmeler etkilenmez — `business_type_name` zaten nullable kolon, eski kayıtlarda null veya geçmiş değerler korunur.
- Yeni wizard akışı: tip seçimi yok → kullanıcı doğrudan işletme adı + açıklama girer, modülleri seçer, kuruluş+aylık masrafları ekler, önizleme onaylar.

---

## [1.6.2] — 2026-05-18

**Breaking cleanup — `BusinessType` master tablosu tamamen kaldırıldı + admin "İşletme Sil" UI.** v1.5.6'da eklenen master-data yaklaşımı CANCELLED edilmişti; v1.6.1'de geçici find-or-create stub kullandık. Bu sürümde tamamen temizleniyor: 8 backend dosyası + ilgili tablolar/kolonlar drop ediliyor.

### Removed

#### Backend (8 dosya silindi)
- `BusinessType` entity, `BusinessTypeRepository`
- `BusinessTypeDefaultCost` entity, `BusinessTypeDefaultCostRepository`, `BusinessTypeDefaultCostService`
- `BusinessTypeController`, `AdminBusinessTypeController`
- `BusinessTypeDto`, `BusinessTypeDefaultCostDto`, `UpsertDefaultCostRequest` DTO'ları
- `Business.businessType` FK alanı (entity'den)
- `CreateBusinessRequest.businessTypeId`, `includeSetupCosts`, `setupCosts`/`monthlyFixedCosts` alanları korundu

#### Backend (endpoint kaldırıldı)
- `GET /business-types` (master listele)
- `GET /business-types/{id}/default-costs`
- `GET /business-types/names` (autocomplete — yerini sadece distinct user-entered listesi aldı, aşağıda)
- `POST/PUT/DELETE /admin/business-types/...` (default cost CRUD)

#### Frontend
- `BusinessTypeDefaultCost` TS interface
- `BusinessType` interface küçük stub'a indirgendi (eski kod uyumluluğu için minimum alanlar)
- Wizard'da: master tip listesi fetch + `defaultCosts` state + `selectedType.default_categories` preview kartı + `includeSetupCosts` checkbox + `businessTypeId` form alanı tamamen silindi
- `Business.business_type_id` ve `Business.business_type` (joined) tipte kaldırıldı; `Business.business_type_name` eklendi
- `BusinessHeader`, `BusinessGrid`, `InventoryPage` artık `business.business_type_name` veya default ikon/renk kullanır

### Added

#### Backend
- **`DELETE /businesses/{id}`** — admin-only. `BusinessService.deleteBusiness`: rol kontrolü + cascade silme + 409 Conflict (bağlı FK constraint reddi) + `BUSINESS_DELETE` audit log.
- **`BusinessTypeTablesCleanup` ApplicationRunner** — startup'ta idempotent SQL:
  ```sql
  ALTER TABLE businesses DROP COLUMN IF EXISTS business_type_id CASCADE;
  DROP TABLE IF EXISTS business_type_default_costs CASCADE;
  DROP TABLE IF EXISTS business_types CASCADE;
  ```
  v2.0 Flyway baseline'da silinecek (artık gerek kalmayacak).
- **`BusinessRepository.findDistinctBusinessTypeNames`** zaten v1.5.7'de eklenmişti — autocomplete kaynağı olarak korunur. `BusinessService.getBusinessTypeNameSuggestions` artık yalnız bunu döner (master tip labellar gitti).

#### Frontend
- **Business detayında admin için "Sil" butonu** (üst sağ, Trash2 ikon) → confirm modal + 409 hata mesajı (bağlı kayıtlar varsa). Silme başarılı olunca dashboard'a redirect + `triggerRefresh()`.

### Changed

#### Backend
- **`BusinessService.createBusiness`** sadeleşti:
  - `business_type_name` zorunlu (404 yerine 400)
  - Default modules/categories master tip'ten gelmiyor — kullanıcı wizard'da seçer; fallback `["finance"]`
  - `resolveOrCreateBusinessType` helper kaldırıldı
- **`BusinessDto`** sadeleşti — `businessTypeId`, `businessType` kaldırıldı; `businessTypeName` eklendi.
- **`DtoMapper.toBusinessDto`** + `toBusinessTypeDto` (silindi).
- **`CreateBusinessRequest`** sadeleşti — `business_type_id` + `include_setup_costs` kaldırıldı; `business_type_name` `@NotBlank` oldu.

### Notes

- **Cold start davranışı:** Hibernate `ddl-auto=update` artık `business_types` tablosunu yönetmiyor. `BusinessTypeTablesCleanup` ApplicationRunner Spring boot tamamlandıktan sonra çalışır ve tabloları/kolonu drop eder. Loglarda `[business-type-cleanup] master tablolar ve business_type_id kolonu temizlendi` görünmeli. Bu işlem **idempotent** — sonraki deploy'larda etki yok.
- **Mevcut işletmeler korunur:** silme sadece kolonu/tabloyu hedefler. `businesses.business_type_id` kolonu CASCADE ile düşer, FK constraint kalkar. Her Business kaydında `business_type_name` zaten doluydu (v1.5.7'den beri), boşsa null kalır.
- v1.6.0 hotfix'i (localStorage draft merge) + v1.6.1 (find-or-create stub) artık geçmiş — temizlik tamamlandı.

---

## [1.6.1] — 2026-05-18

**Gerçek root cause hotfix — wizard Step 1 tip kartları kaldırıldı.** v1.6.0 hotfix bir semptomu (`undefined.trim()` crash) düzeltti ama esas problem farklıydı: master-data tip seçim akışı tamamen kaldırılmıştı ama wizard'da kartlar hâlâ rendering ediliyordu. Prod DB'de `business_types` boş veya yeterince doluyken bile kullanıcı kartlardan birini seçmek zorunda kalıyordu (yoksa `business_type_id` eksik → backend 400). Bu sürüm hem frontend tip kartlarını siler hem backend `business_type_id`'yi opsiyonel yapar.

### Changed

#### Frontend (`/dashboard/add` Step 1)
- **Tip kartları grid'i tamamen kaldırıldı.** Master-data seçim akışı yoktu artık — kullanıcı doğrudan tip adını yazıyor (autocomplete'ten önceki adlar veya master labellar gelir).
- `StepBusinessType` props'u sadeleşti: `types`, `selectedId`, `onSelect` kaldırıldı; yalnız `businessTypeName`, `onBusinessTypeNameChange`, `nameSuggestions`.
- Input `autoFocus` aldı — sayfa açılınca cursor doğrudan tip adı alanında.
- Label "Tip Adi *" — zorunlu olduğu net.
- `canNext` step 1: artık sadece `businessTypeName.trim().length >= 2` kontrol eder. `businessTypeId` zorunluluğu kalktı.
- `handleSubmit` payload: `business_type_id` boş string yerine `null` gönderir (UUID parse hatası önler).

#### Backend
- **`CreateBusinessRequest.businessTypeId` artık opsiyonel** (`@NotNull` kaldırıldı). Eski API client'lar `business_type_id` göndermeye devam edebilir; yeni client'lar `business_type_name` ile gelir.
- **`BusinessService.resolveOrCreateBusinessType(request)`** yeni helper:
  1. `business_type_id` verilmişse → o tipi getir (eski API uyumluluğu)
  2. `business_type_name` verilmişse → case-insensitive label ile master tablodan bul (`BusinessTypeRepository.findFirstByLabelIgnoreCase`); örn. "Restoran" yazılırsa mevcut RESTAURANT category'sine bağlanır
  3. Eşleşme yoksa → paylaşılan `OTHER` kategori tipini bul veya oluştur ("Diğer" label). Tüm serbest-metin tipleri tek OTHER FK'sine işaret eder; her `Business.businessTypeName` orijinal ismi korur.
  4. Hiçbiri yoksa → `IllegalArgumentException("Isletme tip adi zorunlu")`
- **`BusinessTypeRepository.findFirstByLabelIgnoreCase`** yeni method.

### Notes

- **Migrate edilen kullanıcılar için zarar yok:** mevcut Business kayıtlarının `businessType` FK'si aynı kalır. Yeni create'ler ya tam-eşleşme tipini ya da paylaşılan OTHER tipini kullanır.
- `BusinessType.category` UNIQUE constraint korundu — bu sayede OTHER tipi en fazla 1 satır. Birden fazla "özel" tip için ileride şema migration gerekebilir (v2.0 Flyway baseline'ında); şimdilik tüm custom-name'ler tek OTHER FK + her Business kendi `businessTypeName`'iyle ayrıştırılır.
- Frontend `selectedType` referansları (StepBasicInfo, StepModules, StepPreview) zaten `?.` ile defansifti — artık her zaman undefined olabilir, tüm kullanıcılar zarar görmez.
- Sevalla deploy ~1-2 dakikada bitince yeniden dene → tip adı yaz → "Devam" tıkla → 6 adımı bitir.

---

## [1.6.0] — 2026-05-18

**HOTFIX (prod-blocker) — yeni işletme oluşturulamıyordu.** Yarın kullanıcıya açılacak prod'da `/dashboard/add` wizard'ında "İşletme tipi adını girdikten sonra Devam butonu disabled kalıyor" şikayeti. Root cause: v1.5.8'de FormData'ya eklenen yeni alanlar (`businessTypeName`, `setupCostItems`, `monthlyFixedCostItems`) eski tarayıcıdaki `localStorage` draft'ında yoktu; `setForm(parsed)` partial nesneyle state'i ezerek bu alanları `undefined` yapıyordu. `canNext` step 1'de `form.businessTypeName.trim()` sessiz TypeError atıp button'u disabled tutuyordu.

v1.6.0 "ACİL PROD" iş paketinin **CRITICAL hotfix** TODO'su.

### Fixed

#### Frontend
- **Draft load merge** (`/dashboard/add`): `setForm(parsed)` → `setForm((prev) => mergeDraft(prev, parsed))`. Yeni `mergeDraft` helper defaults'u korur, partial JSON üzerine bindirir. Array alanları (`modules`, `setupCostItems`, `monthlyFixedCostItems`) için tip doğrulaması: array değilse default array. String/boolean/number alanları için de aynı şekilde defensive normalization.
- **canNext + handleSubmit + useEffect'ler defensive okur:** `(form.businessTypeName ?? "").trim()`, `(form.setupCostItems ?? []).every(...)`, `(prev.monthlyFixedCostItems ?? []).length`, vb. Eski / bozuk draft'tan gelen `undefined` alanlar artık crash etmez.
- **Bozuk JSON kurtarması:** `JSON.parse` patlarsa draft localStorage'dan silinir (loop önler).

### Documentation

- `docs/test-plans/wizard-atomic.md` → "S8 — Eski draft regression" senaryosu eklendi. Manuel reprodüksiyon adımları, doğrulama checklist, bug analizi + fix açıklaması QA için.

### Notes

- **Mevcut kullanıcılar için etki yok:** browser'ında draft olmayan kullanıcı zaten etkilenmiyordu (yeni form default'ları temizdi). Etkilenen sadece v1.5.7 öncesinden draft taşıyan kullanıcılar.
- Schema değişikliği yok, backend dokunulmadı. Frontend-only hotfix, cold start riski sıfır.
- v1.6.0 "ACİL PROD" WP'sinin diğer 44 TODO'su (POS/Nakit/Alacaklar/Gruplama/Rebrand/Error Boundary/Monitoring) sırayla v1.6.x patch'lerinde ele alınacak.

---

## [1.5.10] — 2026-05-17

**v1.4 İşletme Tipleri WP'sinin son 3 PENDING'i kapandı.** Bu sürümle birlikte hem **v1.4 WP** (İşletme Tipleri & Kurulum Maliyetleri) hem **v1.5 WP** (Firmalar & Cari & Otomasyon) **tamamen DONE**. 1.5.x serisinde açık TODO kalmadı.

### Added

#### Backend
- **`Transaction.isSetupCost` API'de görünür:** `TransactionDto.setupCost` + `DtoMapper.toTransactionDto` mapping eklendi. v1.5.6'da entity'ye eklenmişti ama DTO'da yoktu — şimdi frontend okuyabiliyor.
- **`ModuleType.FIXED_COSTS` enum sabiti** — yeni dedicated "Sabit Masraflar" sekmesi için backend enum'da yer rezerve. Mevcut işletmelerde modül olarak aktif olmasa bile frontend'de her zaman görünür.

#### Frontend
- **Mobile bottom-nav "Raporlar" sayfasına yeni widget — "Kurulum Maliyetleri":**
  - Tüm portfolyo'daki `is_setup_cost=true` transaction'lar toplanır
  - Toplam tutar + tx sayısı üst panelde
  - İşletme kırılımı listesi altında (her satır: işletme adı + tx sayısı + toplam)
  - Hiç kurulum tx'i yoksa açıklayıcı boş durum
  - Tipler WP'sinin "Raporda kurulum maliyetlerinin ayrı gösterimi" TODO'sunu kapatır.
- **Business detayında "Sabit Masraflar" sekmesi** — `ModuleTabs` içine `fixed_costs` tipi eklendi; tıklayınca mevcut `FixedCostsWidget` render edilir. Her business için her zaman görünür (modül aktif/değil farketmez).
- **TS type `Transaction.is_setup_cost`** — backend'den artık gelir, frontend filtre/raporda kullanılır.

### Documentation

- **`docs/test-plans/wizard-atomic.md`** — yeni işletme wizard'ı atomic akışı için 7 test senaryosu (happy path, validation, "Geçerli değil" toggle, atomic rollback, autocomplete, categories endpoint, frontend manuel). curl + postman ile manuel doğrulanabilir; QA regression suite'e dahil edilebilir. Spring Boot integration test infrastructure'ı v2.0 backlog'unda.
- Tipler WP'sinin "Test: zorunlu alan + 'Geçerli değil' + atomic create senaryoları" TODO'sunu kapatır.

### Notes

- **v1.4 İşletme Tipleri WP fully closed:** 20 TODO toplam, 11 COMPLETED + 6 CANCELLED + 3 yeni COMPLETED (bu sürüm) = 20/20 final.
- **v1.5 Firmalar WP fully closed:** 12 TODO toplam, 12/12 COMPLETED (v1.5.9'da kapandı).
- Schema değişikliği yok bu sürümde. Cold start riski sıfır.

---

## [1.5.9] — 2026-05-17

**Firmalar WP'nin kalan parçası — Recurring tx jeneratörü.** Her ayın 1'inde aktif "Aylık tx" bayraklı sabit giderler için otomatik transaction üretir. Scheduled task + manuel admin endpoint + frontend toggle + son üretim göstergesi + audit log.

### Added

#### Backend
- **`FixedCost.autoGenerate` (`auto_generate` boolean) + `FixedCost.lastAutoRun` (`last_auto_run` timestamp)** alanları. `autoGenerate=true` olan + active=true FixedCost'lar recurring engine'ın kaynağıdır. `lastAutoRun` idempotency için kullanılır (aynı YYYY-MM'de ikinci tetiklenme atlanır). Hibernate `ddl-auto=update` iki kolonu ALTER ile ekler; mevcut kayıtlar default false / null alır.
- **`FixedCostRepository.findByAutoGenerateTrueAndActiveTrue()`** — engine kaynak query'si.
- **`RecurringTxGeneratorService.run(now, actorUserId, actorUsername)`** — tüm autoGenerate=true + active=true FixedCost'lar için bu ay'a Transaction üretir:
  - Transaction `direction=EXPENSE`, `amount=fc.amount`, `date=ayin-ilk-gunu`
  - `metadata.source = "RECURRING"`, `metadata.recurring_for = "YYYY-MM"`, `metadata.fixed_cost_id`, `metadata.fixed_cost_type`
  - Frequency desteği: MONTHLY her ay, QUARTERLY Ocak/Nisan/Temmuz/Ekim, YEARLY sadece Ocak
  - Idempotency: `lastAutoRun`'un YearMonth'ü mevcut YearMonth'e eşitse o FixedCost atlanır
  - Audit log'a `TRANSACTION_CREATE` action ile `source=RECURRING` + tüm metadata düşer; "system" username scheduled run için, gerçek admin manuel run için
- **`RecurringTxGeneratorTask` `@Scheduled(cron = "0 30 2 1 * *", zone = "Europe/Istanbul")`** — her ayın 1'i 02:30 Istanbul. Cron env override: `APP_RECURRING_TX_CRON`.
- **`POST /admin/recurring/run`** — admin manuel tetikleyici (test / acil senaryolar). Sonuç: `{processed, created, skipped}`.

#### Frontend
- **FixedCostsWidget formu**: yeni "Her ay otomatik tx oluştur" checkbox + (edit mode'da) son otomatik üretim zamanı küçük emerald yazı.
- **FixedCostsWidget listesi**: `auto_generate=true` kayıtlarda yeşil "Aylık tx" rozeti, altta "Son üretim: ..." metni (varsa).
- **`/admin/recurring` admin sayfası**: "Şimdi Çalıştır" buton + sonuç paneli (processed/created/skipped).
- Admin paneli üst sağ köşede "Recurring" linki eklendi.

### Changed

#### Backend
- `CreateFixedCostRequest.autoGenerate` opsiyonel alan eklendi; create + update akışlarında set edilir.
- `FixedCostDto.autoGenerate` + `lastAutoRun` alanları frontend için API'de görünür.

### Notes

- **Idempotency garanti:** scheduled task gece çalışıp lastAutoRun set ettikten sonra admin manuel "Şimdi Çalıştır" basarsa, aynı FixedCost atlanır (`skipped`). Test için lastAutoRun'u sıfırlamak isterse admin DB'den manuel müdahale edebilir.
- **Schema değişikliği:** Hibernate cold start'ta `fixed_costs.auto_generate boolean default false not null` ve `fixed_costs.last_auto_run timestamp` ALTER çalıştırır. Mevcut kayıtlar etkilenmez (default false → engine onları atlar).
- **Çıkış:** Firmalar WP'sinde kalan 3 PENDING (recurring engine + admin UI + audit) bu sürümle COMPLETED'a çekildi.

---

## [1.5.8] — 2026-05-17

**v1.4 WP'sinin frontend tarafı tamamlandı — yeni 6-step wizard.** `/dashboard/add` wizard'ı manuel kuruluş maliyetleri + aylık sabit masraf adımlarıyla genişletildi. Eskiden 4 adım, şimdi 6: Tip + Temel + Modüller + Kuruluş + Aylık Gider + Önizleme. Backend (v1.5.7) atomic POST akışı buradan tetiklenir.

### Added

#### Frontend
- **Yeni Step 4: "Kuruluş Maliyetleri"** — manuel serbest liste. "Yeni kalem" buton → name + tutar inline; X ile sil; toplam canlı hesaplanır. Boş bırakılabilir (opsiyonel adım). Backend tarafında her kalem ayrı bir `Transaction` (`is_setup_cost=true`, direction=EXPENSE) olur.
- **Yeni Step 5: "Aylık Sabit Masraf"** — 12 standart kategori (RENT, PERSONNEL, UTILITY, VEHICLE, SUPPLIES, MARKETING, INSURANCE, MAINTENANCE, SOFTWARE, LEGAL, TAX, OTHER). Her kategori için tutar input + "Geçerli değil" toggle. Toggle açıkken kategori soluk gri, input devre dışı — submit'te `applicable=false` olarak işaretlenir, backend o kategoriyi atlar. OTHER için ek serbest isim input. Aylık toplam altta canlı hesaplanır.
- **Step 1 (Tip Seçimi) — `business_type_name` autocomplete**: tip seçildiğinde label otomatik dolar, kullanıcı serbest düzenleyebilir. Suggestion listesi `GET /business-types/names` (master labels + distinct user-entered). Focus / typing'de dropdown açılır, 10'a kadar filtre sonucu.
- **Step 6 (Önizleme) — yeni "Atomic Olusturulacak Kalemler" kartı**: setup tx'ler + aylık fc'ler ayrı bölümlerde, toplamlarla. "Bu kalemler atomic — biri patlarsa hiçbir kayıt olusturulmaz" notu.

### Changed

#### Frontend
- `FormData` 4 yeni alan: `businessTypeName`, `setupCostItems[]`, `monthlyFixedCostItems[]` (12 kategori önceden init edilir), `setupCostItems` opsiyonel.
- `canNext` validation 6 step için: Step 1 tip + name zorunlu, Step 5 applicable kalemlerde amount > 0 + OTHER için customName zorunlu.
- `handleSubmit` payload artık `business_type_name`, `setup_costs[]`, `monthly_fixed_costs[]` gönderir (v1.5.7 backend bekleyen format). Eski `include_setup_costs` master-data path'i hâlâ destekli ama yeni manuel akış asıl yol.
- Step indicator artık 6 bölüm.
- Local lucide-react import'lara `Plus`, `X` eklendi.

### Notes

- **6 adım mobile-da sıkışık görünmesin diye**: step content scrollable; her adım odaklı (Step 4 sadece kuruluş, Step 5 sadece aylık). Step indicator üstte ince çubuk.
- **Zaten girilen veriler korunur**: localStorage draft akışı yeni `FormData` shape'ine adapte; eski draft'lar yüklendiğinde yeni alanlar default değerleriyle init olur, kullanıcı kaldığı yerden devam edebilir.
- **Backend uyumluluğu**: v1.5.7 endpoint'leri (`/business-types/names`, `/fixed-cost-categories`, atomic `POST /businesses`) prod'da olmalı. Wizard mount'ta bunları çeker.
- "Sabit Masraflar düzenleme sekmesi" (sonradan editing) TODO'su bu sürüm kapsamında değil — `FixedCostsWidget.tsx` zaten business detayında mevcut, gerekirse v1.5.9'da ek sekme yapılır.
- Schema değişikliği yok (frontend-only sürüm); cold start etkisi yok.

---

## [1.5.7] — 2026-05-17

**v1.4 WP'sinin gerçek tasarımı — backend.** Dashboard'daki güncel TODO listesini okuyunca anlaşıldı: orijinal master-data yaklaşımı (v1.5.6'da yapılan) **CANCELLED** edilmiş; yeni tasarım wizard'da **manuel serbest liste** + **atomic create**. Bu sürüm yeni tasarımın backend tarafını shipler; frontend wizard rewrite v1.5.8'de.

### Added

#### Backend
- **`Business.businessTypeName`** kolonu (`business_type_name` VARCHAR(120)). BusinessType FK'sine ek serbest metin alan — yeni wizard'da kullanıcının yazdığı tipi tutar (autocomplete kaynağı). Eski kayıtlarda null kalır.
- **`FixedCostCategory` enum (12 sabit kategori):** `RENT`, `PERSONNEL`, `UTILITY`, `VEHICLE`, `SUPPLIES`, `MARKETING`, `INSURANCE`, `MAINTENANCE`, `SOFTWARE`, `LEGAL`, `TAX`, `OTHER`. İlk 11'i wizard'da zorunlu, `OTHER` serbest giriş. TR label'lar enum'da. `FixedCost.type` String alanı serbest kalmaya devam eder (geriye uyumluluk); yeni create akışı bu enum isimlerini kullanır.
- **`CreateBusinessRequest`'e iki yeni liste:**
  - `setup_costs: [{ name, amount }]` — wizard adım 1, kuruluş maliyetleri
  - `monthly_fixed_costs: [{ category, name?, amount, applicable }]` — wizard adım 2, aylık sabit masraflar
  - Plus `business_type_name` (serbest metin tipi)
- **`BusinessService.createBusiness` atomic akış:**
  - Tek `@Transactional` içinde business + tüm setup tx[] + tüm fixed_cost[] üretilir
  - Biri patlarsa hepsi rollback olur — yarım kalmış business kaydı kalmaz
  - Setup tx'ler `is_setup_cost=true` flag'ı ile (v1.5.6'da eklenen) işaretlenir
  - Monthly fc'ler `frequency=MONTHLY`, `auto=false`
  - Master-data path (v1.5.6'nın `includeSetupCosts`'u) hâlâ çalışır — iki yaklaşım yan yana açık
- **`GET /business-types/names`** (authenticated) — autocomplete kaynağı: BusinessType.label master listesi + distinct `Business.businessTypeName` birleşik liste. Frontend tek istekle alıp lokalde filtreler.
- **`GET /fixed-cost-categories`** (authenticated) — 12 kategori `[{ key, label, required }]` formatında, wizard adım 2 için.
- **`BusinessRepository.findDistinctBusinessTypeNames()`** — autocomplete query'si.
- **Audit log enrichment:** `BUSINESS_CREATE` metadata'sında `businessTypeName`, `wizardSetupTransactions`, `wizardMonthlyFixedCosts` sayımları (gerçek üretimde). Detail string'de de wizard sayımları görünür.

### Changed

#### Backend
- `CreateBusinessRequest` 4 alan büyüdü; eski clients hâlâ çalışır (yeni alanlar opsiyonel).
- `Business.builder()` artık `businessTypeName` set ediyor.

### Notes

- Bu sürümün **hiçbir frontend değişikliği yok** — wizard rewrite v1.5.8'e bırakıldı. Backend test/curl ile şu an üretim akışı:
  ```json
  POST /businesses
  {
    "name": "Yeni Şube",
    "business_type_id": "...",
    "business_type_name": "Kafe",
    "setup_costs": [{"name": "Depozit", "amount": 50000}],
    "monthly_fixed_costs": [
      {"category": "RENT", "amount": 15000, "applicable": true},
      {"category": "PERSONNEL", "amount": 30000, "applicable": true},
      {"category": "VEHICLE", "applicable": false}
    ]
  }
  ```
- **Schema değişikliği:** Hibernate cold start'ta `businesses.business_type_name` kolonu ekler (nullable VARCHAR 120) — mevcut satırlar null alır, ALTER atomik. İlk request 1-2 saniye yavaş olabilir.
- v1.5.6'nın master-data yaklaşımı dashboard'da CANCELLED; teknik borç olarak kalır ama backend kod yine kullanılabilir (admin endpoint'leri açık). Önümüzdeki bir patch'te silinmesi değerlendirilir.
- v1.5.8 scope: NewBusinessWizard rewrite (multi-step manuel form), "Sabit Masraflar" düzenleme sekmesi, autocomplete UI.

---

## [1.5.6] — 2026-05-17

**v1.4 roadmap WP'sinin geri-doldurulması — "İşletme Tipleri & Kurulum Maliyetleri".** Daha önce v1.4 sürüm slot'u güvenlik patch serisinde kullanıldığı için bu WP atlanmıştı; v1.5.6 olarak shipleniyor. Yeni master data: her işletme tipi için kategorize kurulum + sabit gider şablonları, yeni işletme wizard'ında "Kurulum maliyetlerini ekle" checkbox'ı, kategorize listede her kalem ayrı transaction (raporlamada detaylı görünür).

### Added

#### Backend
- **`BusinessTypeDefaultCost` entity** + repository. Alanlar: `business_type_id`, `name`, `category` (RENT/PERSONNEL/UTILITY/SUPPLIES/MARKETING/LEGAL/OTHER), `amount`, `currency`, `is_setup` (tek seferlik mi tekrarlayan mı), `frequency` (recurring için MONTHLY/YEARLY/QUARTERLY), `sort_order`, `notes`. Hibernate `ddl-auto=update` ile `business_type_default_costs` tablosu otomatik oluşur; tüm kolonlarda `@ColumnDefault` net — mevcut işletmeleri etkilemez.
- **`Transaction.isSetupCost` boolean kolon** (`is_setup_cost`, default false). Yeni işletme wizard'ında "kurulum maliyetlerini ekle" seçilirse otomatik üretilen kurulum transaction'ları bu flag ile işaretlenir; raporlama tarafı setup'ı rutin operasyonel giderden ayırabilir. Mevcut Transaction kayıtları DDL backfill ile false alır.
- **`CreateBusinessRequest.includeSetupCosts` (`include_setup_costs`) flag**. Default false. True ise `BusinessService.createBusiness` akışında master data üzerinden otomatik akış:
  - `is_setup=true` kalemler → tek seferlik `Transaction` (yön=EXPENSE, `isSetupCost=true`, tarih=bugün)
  - `is_setup=false` kalemler → `FixedCost` (recurring; `auto=false` — kullanıcı manuel yönetir)
- **`AdminBusinessTypeController`** — admin-only default cost CRUD:
  - `GET /admin/business-types/{id}/default-costs`
  - `POST /admin/business-types/{id}/default-costs` (Upsert request)
  - `PUT /admin/business-types/default-costs/{id}`
  - `DELETE /admin/business-types/default-costs/{id}`
- **`GET /business-types/{id}/default-costs`** — public read-only endpoint (authenticated). Wizard'da non-admin kullanıcıların da önizlemeyi görebilmesi için.
- **Audit log enrichment:** `BUSINESS_CREATE` action metadata'sında artık `includeSetupCosts`, `createdSetupTransactions`, `createdFixedCosts` sayımları yer alıyor (gerçek üretim için).

#### Frontend
- **Yeni işletme wizard'ı (`/dashboard/add`) — Step 4 "Önizleme" altında yeni bir kart:**
  - "Kurulum maliyetlerini ekle" checkbox
  - Setup ve recurring kalem listeleri ayrı bölümlerde, toplamlarla
  - Checkbox işaretliyken renkli/odaklı, kapalıyken soluk önizleme
  - Tip için tanımlı şablon yoksa: "Admin paneli üzerinden eklenebilir" notu
- **TS type:** `BusinessTypeDefaultCost`

### Changed

#### Backend
- `BusinessService.createBusiness` artık `BusinessTypeDefaultCostRepository`, `FixedCostRepository`, `TransactionRepository` bağımlılıkları taşıyor.
- Audit detail string'i: `"Isletme olusturuldu: X (Tip) + N kurulum tx, M sabit gider"` (eğer kurulum maliyetleri eklendiyse).

### Removed

- `v2.2-search-spec.md` (583 satır) main branch'ten kaldırıldı — repo köküne çalışma dosyası olarak konmuştu, yanlışlıkla commit'e dahil olmuştu. `.gitignore`'a `v2*-spec.md` pattern'ı eklendi; bu tip draft spec'ler artık otomatik track-out kalır. Dosyanın local kopyası korundu (git rm --cached).

### Notes

- **Master data başlangıçta boş.** Admin paneli "Borc Migration" yanına bir "İşletme Tipi Şablonları" linki eklenmedi bu sürümde (yer kısıtı). Admin endpoint'leri curl/postman ile veya v1.5.7 frontend admin UI'ı ile yönetilebilir.
- Bu özellik **opt-in** — checkbox işaretlenmediği sürece davranış değişmez; eski wizard akışı aynı.
- v1.6 recurring engine devreye girince `FixedCost.auto=true` opsiyonu burada kullanılabilir; v1.5.6'da otomatik üretilen FixedCost'lar `auto=false` (manual ayarlanır).
- Sevalla cold start'ta Hibernate ALTER TABLE iki yeni kolon/tablo ekleyecek:
  - `transactions.is_setup_cost boolean default false not null`
  - `business_type_default_costs` tablosu (yeni)
  İlk request ~1-2 saniye yavaş olabilir; sonraki request'ler normal.

---

## [1.5.5] — 2026-05-17

**Firmalar WP dilim 3d — mobile 404'ler tamamen kapandı + debt migration utility.** Mobile bottom-nav'da kalan iki 404 sayfa (Raporlar, Profil) eklendi; eski free-text borç kayıtları için admin tarafında bir migration utility yapıldı.

### Added

#### Backend
- **`DebtMigrationService` + `POST /admin/counterparts/migrate-debts`** — `counterpart_id IS NULL` olan tüm borçları toplar, counterparty string'ini case-insensitive olarak mevcut counterpart'larda arar.
  - Bulunursa → bağlar
  - Bulunamazsa ve `auto_create=true` ise yeni counterpart (role=OTHER) yaratır
  - `dry_run=true` (default) sadece sayım döndürür, mutation yapmaz
  - Etkilenen counterpart'lar için `CounterpartLedgerService.recomputeIfPresent` tetiklenir
  - Idempotent — sonraki çalıştırmalarda orphan kalmazsa sıfır etki döner
  - Gerçek run audit'e `DEBT_MIGRATION` aksiyonu ile düşer (counts metadata)
- **`AuditAction.DEBT_MIGRATION`** sabiti
- **`DebtRepository.findByCounterpartRefIsNull()`** — migration kaynak query'si

#### Frontend
- **`/dashboard/reports` sayfası** — mobile bottom-nav "Raporlar" linkinin 404'ünü kapatır. İki kart: Finans Özeti (mevcut `/dashboard/finance`'a yönlendirir) + Cari Hesap Ekstreleri (`/dashboard/counterparts`'a yönlendirir). Altta v1.7.0 rapor merkezi yol haritası notu.
- **`/dashboard/profile` sayfası** — mobile bottom-nav "Profil" linkinin 404'ünü kapatır. Avatar (initials), kullanıcı bilgileri (e-posta, telefon, para birimi, dil), Parola Değiştir / Admin Paneli / İşletmelerim aksiyonları + Çıkış Yap. Admin için "Admin Paneli" satırı koşullu görünür.
- **`/admin/debt-migration` admin sayfası** — DebtMigrationService UI'ı: dry-run + auto-create toggle + apply + sonuç paneli (orphan/matched/created/skipped/recomputed sayımları). Apply için onay modali. Admin paneli ana sayfasından "Borc Migration" linki ile erişilir.

### Notes

- **Mobile bottom-nav 404'leri tamamen kapandı:** Ana Sayfa ✓, İşletmeler ✓ (v1.5.2), Ekle ✓, Raporlar ✓ (bu sürüm), Profil ✓ (bu sürüm).
- Migration utility'i çalıştırmadan önce **dry-run ile kontrol** önerilir — kaç orphan borç var, kaçı eşleşiyor, kaçı yeni firma gerektirir görülür. Apply geri alınmaz ama idempotent yapısı ile birden fazla deneme güvenli.
- `auto_create` kapalıyken eşleşmeyen kayıtlar `skipped` olarak işaretlenir; sonra elle düzeltilip tekrar koşulabilir.
- Backend schema değişikliği yok bu sürümde — cold start riski sıfır.

---

## [1.5.4] — 2026-05-16

**Firmalar WP dilim 3c — Borç akışına counterpart bağlama.** Yeni borç oluşturma formunda "Kimden Alınacak / Kime Verilecek" alanı artık karşı firma seçici (combobox). Mevcut firmadan seçilirse `counterpart_id` ile normalize edilir; tıklayınca yeni firma inline modal üzerinden anında oluşturulur ve seçilir. Free-text fallback hâlâ çalışır (eski client/UX akışları bozulmaz).

### Added

#### Frontend
- **`CounterpartCombobox` shared component** (`components/shared/CounterpartCombobox.tsx`):
  - Mount'ta tek seferlik `GET /counterparts` ile listeyi çeker, frontend filter
  - Kullanıcı yazdıkça eşleşen firmalar dropdown'da görünür (max 20)
  - Tıklayınca `value` set (counterpart_id), free-text counterpart.name'e güncellenir
  - Tam eşleşme yoksa "{searchText}'i karşı firma olarak oluştur" CTA'sı; tıklayınca inline modal (name + role minimum) — POST sonrası otomatik seçilir
  - X butonu ile seçim temizlenir, free-text mode'a döner
- **`DebtModule` "Yeni Borç" akışı combobox ile entegre**:
  - Eski `<input>` counterparty alanı kaldırıldı
  - `direction === RECEIVABLE` ise default rol `CUSTOMER` (alacak → müşteri), `PAYABLE` ise `SUPPLIER` (verecek → tedarikçi) — inline create modal bu rolü ön seçer
  - Submit'te `counterpart_id` (varsa) backend'e gider; `counterparty` string yine yedek olarak gönderilir

### Changed

#### Frontend
- Borç oluşturma akışında "var olan firmadan seç" + "yeni oluştur" alternatifleri tek bileşende birleştirildi — eskiden ayrı sayfalardan firma yaratıp sonra borç ekran döngüsü yoktu, şimdi inline.

### Notes

- Backend halihazırda (v1.5.1) `counterpart_id` kabul ediyor + counterparty string'i auto-fill ediyordu — bu sürüm sadece frontend tarafını bağlıyor.
- Borç güncelleme/silme akışları bu sürümde değişmedi; backend mevcut counterpart_id'yi koruyor, cari bakiye event-driven recompute oluyor (v1.5.1).
- **Bilinen sınırlama:** mevcut (v1.5.0 öncesi) free-text borçlar bu combobox üzerinden retro-bağlanmaz; toplu migration utility v1.5.5'te gelecek.
- v1.5.5'te ayrıca mobile bottom-nav'ın "Raporlar" + "Profil" 404 sayfaları + migration utility birlikte ele alınır.

---

## [1.5.3] — 2026-05-16

**Firmalar WP dilim 3b — Counterpart UI (cari hesap front-end).** Karşı firma listesi + detay + cari ekstre arayüzü. Kullanıcılar artık müşteri/tedarikçi/diğer firmaları görüp yönetebiliyor, period bazlı cari ekstre çıkartıp browser üzerinden yazdırabiliyor.

### Added

#### Frontend
- **`/dashboard/counterparts` liste sayfası** — kart bazlı liste. Her kartta isim + rol rozeti + vergi no + cari bakiye (renk kodlu: yeşil pozitif/alacak, kırmızı negatif/borç). Arama (isim veya vergi no), rol filtresi (Tümü/Müşteri/Tedarikçi/Her ikisi/Diğer). "Yeni" buton + modal CRUD. Backend `/counterparts?role=...` query'sine bağlı.
- **`/dashboard/counterparts/[id]` detay sayfası**:
  - Üst panel: isim + rol rozeti + vergi no + ödeme vadesi
  - Sol kart: güncel bakiye (büyük, renk kodlu) + admin için "Yeniden Hesapla" buton (`POST /admin/counterparts/{id}/recompute`)
  - Sağ kart: iletişim, vergi dairesi, adres, notlar
  - Alt panel: **Cari Hesap Ekstresi** — period filter (son 1 ay default), 4'lü summary (açılış / toplam alacak / toplam borç / kapanış), kronolojik tablo (tarih, açıklama, işletme, tutar, running balance). Kapalı (settle) hareketler opaklığı düşük + "KAPALI" rozet ile gösterilir.
  - **Yazdır butonu** — `window.print()`. `print:hidden` ile filter satırı baskıdan çıkar, sadece özet + tablo görünür. PDF için bu sürümde browser native "PDF olarak kaydet" yeterli; jsPDF/server-side PDF ileride bir patch'te ele alınır.
- **Dashboard QuickActions**'a "Cari Hesap" kısa yolu eklendi (`Users` ikonu, cyan renk) — `/dashboard/counterparts`'a gider.

### Changed

#### Frontend
- TS type'ları (`Counterpart`, `CounterpartStatement`, vb.) v1.5.2'de eklenmişti; bu sürümde fiilen kullanılıyor.
- Bakiye semantiği UI'da net: pozitif = "Firma bize borçlu (alacak)", negatif = "Biz firmaya borçluyuz (verecek)", sıfır = "Cari kapalı".

### Notes

- **Counterpart create/edit/delete tüm authenticated kullanıcılara açık** (backend SecurityConfig). Bu, paylaşımlı bir veri olduğu kabulüyle — küçük ekip için pragmatik, çok-tenant gerektiren durumlarda v1.6+'da admin-only veya role-based daha sıkı yapılabilir.
- **Bilinen sınırlama:** detay sayfasındaki ekstre sadece counterpart_id ile bağlanmış borçları gösterir. v1.5.0'dan önce free-text "counterparty" string ile oluşturulan eski borçlar ekstrede görünmez. v1.5.4 migration utility eski string borçları counterpart kayıtlarına bağlayacak — sonrasında ekstre tam geçmişi yansıtır.
- **Borç oluşturma akışında counterpart seçimi UI** v1.5.4'e ertelendi (autocomplete dropdown + "+ yeni karşı firma" inline). Şu an `POST /businesses/{id}/debts` backend'i counterpart_id kabul ediyor; frontend tarafı v1.5.4'te entegre olacak.
- Mobile bottom-nav'ın diğer 404 sayfaları (Raporlar, Profil) bu dilim kapsamında değil; ayrı patch'te.
- Backend schema değişikliği yok bu sürümde.

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

[Unreleased]: https://github.com/uyekebagci/bizboard/compare/v1.6.2.2...HEAD
[1.6.2.2]: https://github.com/uyekebagci/bizboard/releases/tag/v1.6.2.2
[1.6.2.1]: https://github.com/uyekebagci/bizboard/releases/tag/v1.6.2.1
[1.6.2]: https://github.com/uyekebagci/bizboard/releases/tag/v1.6.2
[1.6.1]: https://github.com/uyekebagci/bizboard/releases/tag/v1.6.1
[1.6.0]: https://github.com/uyekebagci/bizboard/releases/tag/v1.6.0
[1.5.10]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.10
[1.5.9]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.9
[1.5.8]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.8
[1.5.7]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.7
[1.5.6]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.6
[1.5.5]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.5
[1.5.4]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.4
[1.5.3]: https://github.com/uyekebagci/bizboard/releases/tag/v1.5.3
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
