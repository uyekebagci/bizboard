# Frontend Update Notları — Backend Değişiklikleri Sonrası

> **Hedef:** Bu dosya, backend'de yapılan **üç dalga değişikliği** frontend tarafına yansıtmak için frontend developer'a yol haritasıdır:
> 1. Güvenlik / performans / observability sertleştirmesi (`ANALYSIS.md` patch'leri).
> 2. Yeni loglama sistemi (`logging_system.md` implementasyonu).
> 3. Refresh token, password change, audit log read, notification, PWA prompt — **eski "İlerideki İşler" listesi şimdi kapatıldı.**
>
> Hiçbir mevcut endpoint kaldırılmadı. Field-level breaking: `setToken(token, expiresIn)` artık 2 parametre alıyor (eski tek parametre kullanan çağrılar uyarlanmalı).

---

## 🟢 Tamamlanma Durumu (2026-05-11)

**Tüm P0/P1/P2/P3 ve P4 (İleride) maddeleri kapatıldı.** Aşağıdaki §0 tablosu tarihsel listedir — gerçek durum bu özette:

### ✅ Backend (yapıldı)
- `/auth/refresh` + `/auth/logout` (HttpOnly cookie rotation token, reuse detection)
- `POST /me/password` (kendi şifre değişikliği, tüm refresh token'ları revoke)
- `GET /admin/audit-logs` (filter + pagination + JpaSpecificationExecutor)
- `GET /notifications` + `/unread-count` + `/{id}/read` + `/read-all`
- `ProfileDto`: `username`, `email`, `force_password_change` alanları
- `AuthResponse`: `{ token, expires_in, force_password_change }`
- Flyway V6: `refresh_tokens` tablosu + `notifications.read_at` kolonu
- Access token TTL 7 gün → **15 dakika** (refresh ile yenilenir)

### ✅ Frontend (yapıldı)
- **Memory access token** + silent refresh + bootstrap akışı (`ClientProviders`)
- `setToken` artık `(token, expiresIn)` — eski tek-parametre form deprecated
- `logout()` backend'i de çağırıyor (refresh token revoke + cookie sil)
- `force_password_change=true` → `/dashboard/change-password` zorunlu yönlendirme
- `/dashboard/change-password` ekranı (mevcut + yeni + tekrar, backend hata kodları handle)
- `/admin/audit` admin UI (filter, pagination, CSV export, JSON detail expand)
- `NotificationDropdown` (TopBar bell + badge + dropdown + mark-as-read + 60s polling)
- `PwaUpdatePrompt` — service worker `waiting` state'inde kullanıcıya prompt
- `EnvironmentBanner` — `NEXT_PUBLIC_ENV=test/staging` ise üst banner
- Multi-tab logout senkron (`storage` event)
- `any` tamamen temizlendi (`getErrorMessage` helper + `LucideIcon` tip + DTO genişletme)
- `console.*` → `logger.*` tüm 18 dosyada
- `X-Request-ID` header propagation, `ApiError.requestId` UI'da gösterimi
- Open redirect fix (`isSafeRedirectPath`)
- `NEXT_PUBLIC_API_URL` prod'da fail-fast
- CSP/HSTS/X-Frame/Referrer-Policy/Permissions-Policy
- 403 → `clearActiveBusiness` + redirect
- 429 + `Retry-After` parse
- CONF-409 + VAL-400 field-level error binding

### Hala bekleyen tek madde
- **LocalStorage form draft (`bizboard_draft_business`) sensitivity review** — `dashboard/add` sayfası işletme adı/tipi gibi non-sensitive bilgileri draft olarak saklıyor; PII/finansal değil, **OK kabul edildi**. Eğer ileride hassas alan eklenirse review edilmeli.

---

---

## 0. TL;DR — 3 Dakikalık Özet

| # | Ne değişti? | FE'de ne yapılmalı? | Aciliyet |
|---|-------------|---------------------|---------|
| 1 | **Error response gövdesi** artık `{ code, message, request_id, errors? }` formatında | `ApiError` tipini güncelle, kullanıcıya `message`'i göster, debug için `request_id`'i logla | 🔴 P0 |
| 2 | **`X-Request-ID` header** desteği geldi | Her API isteğine FE'de üret + header'a koy, response header'dan oku → tek request_id ile FE+BE log koreleli | 🔴 P0 |
| 3 | **401/403 anlamları netleşti** (`AUTH-401`, `AUTH-403`, `AUTH-LOCK`, `AUTH-DIS`) | Login akışında lockout mesajını göstermek için `code === "AUTH-LOCK"` kontrolü ekle | 🟡 P1 |
| 4 | **IDOR kapatıldı** — Employee/FixedCost/Vehicle/Inventory/File endpoint'leri artık doğru sahipliği zorunlu | Token kullanıcının erişimi olmayan business'ın endpoint'lerine istek atmamalı; 403 dönerse kullanıcıya "yetkiniz yok" göster | 🟡 P1 |
| 5 | **File upload** — Tika magic-byte kontrolü + kategori whitelist | `category` parametresi sadece şu değerlerden olmalı: `document`, `image`, `receipt`, `invoice`, `avatar`, `logo`, `debt_doc`, `note_attachment`, `other` | 🟡 P1 |
| 6 | **`/internal/logs` ingest endpoint'i** eklendi | `logging_system.md` §7'deki Frontend Logger'ı implement et, prod'da batch buffer ile bu endpoint'e POST et | 🟢 P2 |
| 7 | **Health endpoint** `/actuator/health` hala public; **Prometheus** `/actuator/prometheus` artık `ROLE_ADMIN` | Status sayfasında /health, metric scrape backend tarafı; FE'de iş yok ama bilgi olsun | 🟢 P3 |
| 8 | **Default admin/admin123 kaldırıldı** | İlk kurulumda backend log'undan rasgele üretilmiş şifreyi al; `force_password_change` true ise FE şifre değiştirme akışı zorlamalı (DTO field henüz expose edilmedi, eklenebilir) | 🟢 P3 |
| 9 | **CORS env-driven** (`CORS_ALLOWED_ORIGINS`) | Deploy ortamı için backend env'inde FE origin'ini set edin; lokalde değişiklik yok | 🟢 P3 |
| 10 | **Token `localStorage`'de — XSS ile çalınabilir** (ANALYSIS.md **F1 CRITICAL**) | Refresh token akışı netleşmeden önce: token'ı `sessionStorage`'a al, XSS yüzeyini daralt. Uzun vade: HttpOnly cookie + short-lived access token + refresh endpoint. **Bu maddenin backend tarafıyla koordinasyon gerektirdiğini unutma** (refresh token mekanizması) | 🔴 P0 |
| 11 | **Middleware `redirect` open redirect** (ANALYSIS.md **F2 CRITICAL**) | `src/middleware.ts` ve login sonrası yönlendirme akışında `redirect` query parametresi **mutlaka same-origin doğrulanmalı**. Kullanıcı `?redirect=https://evil.com` ile phishing'e yönlendirilebilir | 🔴 P0 |
| 12 | **`NEXT_PUBLIC_API_URL` fallback** (ANALYSIS.md F3) | `localhost:8080` fallback kaldır — env yoksa build/runtime'da fail-fast. Aksi takdirde production deploy'da bu env unutulursa kullanıcı kendi local'inden API çağırmaya çalışır (CORS hatası), kritik bir kullanıcı uyarısı bile çıkmadan kafa karıştırıcı bir UX olur | 🟡 P1 |
| 13 | **Security headers — `next.config.js`** (ANALYSIS.md F4) | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy header'ları `next.config.js` `headers()` ile veya reverse proxy üzerinden eklenmeli | 🟡 P1 |
| 14 | **Rate limit `429` handling** | Backend B14 (ANALYSIS.md) gereği rate limit eklendiyse FE 429 + `Retry-After` header'ını yakalamalı; submit butonlarını debounce et, login'de spam denemeyi engelle | 🟡 P1 |
| 15 | **`CONF-409` — Otomatik FixedCost manuel düzenleme** | Personel ve araç kaynaklı `FixedCost` artık manuel güncellenemiyor. UI'da bu kayıtların Edit/Delete butonları disable + tooltip ("Bu kayıt personel modülünden otomatik yönetilir") | 🟡 P1 |
| 16 | **Test ortamı kullanıcı uyarı banner'ı** | `NEXT_PUBLIC_ENV=test` ise üst banner: "Test ortamı — veriler her gece silinir". Operatör test ortamında çalışırken yanılgı önler | 🟢 P2 |
| 17 | **`any` kullanımı temizliği** (F8) | `icon: any`, `cat: any`, `err: any` gibi tipleri spesifik tiplere çevir. ESLint kuralı: `"@typescript-eslint/no-explicit-any": "error"` | 🟢 P3 |
| 18 | **PWA `skipWaiting` davranışı** (F12) | Service worker yeni versiyon geldiğinde kullanıcı form doldururken sayfa otomatik refresh oluyor. Refresh için kullanıcıya prompt göster, "Yeni sürüm hazır — yeniden yükle?" | 🟢 P3 |

---

## 1. Error Response Formatı (BREAKING-COMPATIBLE)

### Önce
```json
{ "message": "Business not found: ..." }
```

### Şimdi
```json
{
  "code": "RES-404",
  "message": "Isletme bulunamadi",
  "request_id": "req-7f3a9c"
}
```

Validation hatalarında ek:
```json
{
  "code": "VAL-400",
  "message": "Validasyon hatasi",
  "request_id": "req-...",
  "errors": {
    "fullName": "Ad soyad zorunludur",
    "salary":   "Maas negatif olamaz"
  }
}
```

### Standart `code` değerleri

| Code | HTTP | Anlam |
|------|------|-------|
| `VAL-400` | 400 | Validasyon hatası |
| `AUTH-401` | 401 | Hatalı kimlik bilgileri (login) |
| `AUTH-LOCK` | 401 | Hesap geçici kilitlendi (5 hatalı login → 15 dk) |
| `AUTH-DIS` | 401 | Hesap devre dışı |
| `AUTH-403` | 403 | Yetkisiz erişim (IDOR / role yetersiz) |
| `RES-404` | 404 | Kaynak bulunamadı |
| `CONF-409` | 409 | İş kuralı çakışması (örn: otomatik FixedCost manuel güncellenemez) |
| `DB-409` | 409 | DB integrity violation |
| `FILE-413` | 413 | Dosya çok büyük (>10 MB) |
| `ERR-<8 hex>` | 500 | Beklenmeyen hata — `request_id` ile birlikte support'a gönderilebilir |

### FE'de yapılacaklar

**`src/lib/api/client.ts`:**

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  // ... fetch ...
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body.code ?? "UNKNOWN",
      body.message ?? res.statusText,
      body.request_id ?? res.headers.get("X-Request-ID") ?? undefined,
      body.errors,
    );
  }
}
```

**Login formunda kilitlenme:**
```ts
try {
  await api.post("/auth/login", { username, password });
} catch (err) {
  if (err instanceof ApiError) {
    if (err.code === "AUTH-LOCK") {
      toast.error("Hesabınız 15 dakika kilitlendi. Lütfen sonra tekrar deneyin.");
    } else if (err.code === "AUTH-401") {
      toast.error("Kullanıcı adı veya şifre hatalı.");
    } else {
      toast.error(err.message);
    }
  }
}
```

> ⚠️ Eskiden `IllegalArgumentException.getMessage()` doğrudan yansıyordu (örn: `"Business not found"`). Bu artık güvenli "Gecersiz istek" şeklinde generic dönüyor. Spesifik kaynak bulma hataları için yeni `RES-404` kodunu kullanın.

---

## 2. `X-Request-ID` Header — Korelasyon

Backend her response'a `X-Request-ID: req-7f3a9c` header'ı koyuyor. İstemci de kendi üretip request header'ında geçirebilir; backend o ID'yi reuse ediyor.

### Neden önemli?

Hata olduğunda kullanıcı "şu zaman X olmadı" derse, FE Network tab'da response header'dan `request_id` alınır → backend log'larında o satır arandığında **FE → BE → DB tüm zincir tek query ile bulunur**.

### FE'de yapılacaklar (`client.ts`)

```ts
const REQ_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

function newRequestId(): string {
  return "req-" + (crypto.randomUUID?.() ?? Math.random().toString(36)).slice(0, 8);
}

async function request<T>(path: string, opts: RequestInit = {}) {
  const reqId = newRequestId();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": reqId,                       // <-- yeni
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  // Backend response'una echo etti — emin olmak için response'tan da okuyun:
  const responseReqId = res.headers.get("X-Request-ID") ?? reqId;
  // ...
}
```

### CORS notu

Backend CORS config `X-Request-ID` header'ını **hem allow hem expose** ediyor:
- `Access-Control-Allow-Headers: Authorization, Content-Type, X-Request-Id, Accept`
- `Access-Control-Expose-Headers: X-Request-Id`

Tarayıcıdan `res.headers.get("X-Request-ID")` çağrısı çalışacak.

---

## 3. Backend → Frontend Logger Pipeline

Backend artık tüm log'ları JSON formatta yazıyor ve frontend için `/internal/logs` ingest endpoint'i açıldı. Bu sayede **FE'nin client-side log'ları da Loki'ye taşınabilir**.

### Endpoint kontratı

`POST /internal/logs` (Authentication: Bearer JWT zorunlu, normal kullanıcı bile çağırabilir)

İstek:
```json
{
  "records": [
    {
      "level": "info",
      "logger": "api",
      "message": "GET /portfolio",
      "timestamp": "2026-05-11T14:23:45.123Z",
      "sessionId": "sess-abc",
      "requestId": "req-7f3a9c",
      "url": "/dashboard",
      "context": { "duration_ms": 87 },
      "error": null
    }
  ]
}
```

Yanıt: `202 Accepted` (her zaman, FE'yi bloklamamak için).

- Batch başına **max 50 kayıt**
- Mesaj **max 2000 char**, fazla truncate
- Backend logger adı `frontend` — Loki'de `{logger="frontend"}` ile filtrelenir

### FE implementation rehberi

`logging_system.md` §7.1'deki `src/lib/logger.ts` referansı uygula. Önemli noktalar:

- **Dev**: `console.log` + emoji + renk (transport YOK)
- **Prod**: Buffer (max 25 record), 5s flush, `error` seviyesinde **anında flush**, `keepalive: true` ile tab close'ta da gönder.
- **Field naming** backend'le aynı olmalı (`snake_case` JSON içinde):
  - `request_id`, `session_id`, `user_id`, `logger`, `level`, `message`, `context`, `error`

### Next.js API route proxy (CORS bypass)

`src/app/api/logs/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const body = await req.json();
  await fetch(`${process.env.BACKEND_URL}/internal/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  }).catch(() => {});           // sessizce yut, FE'yi bloklamasın
  return NextResponse.json({ ok: true });
}
```

> **Önemli:** Bu route Authorization header'ını backend'e taşıdığı için backend `/internal/logs`'a JWT zorunlu kalabilir. Frontend Logger'ın `flush()` fonksiyonunda `Authorization: Bearer ${token}` header'ı eklemeyi unutmayın.

---

## 4. IDOR Kapatması — Pratik Etki

Backend'de aşağıdaki controller'ların tüm endpoint'leri artık kullanıcının ilgili business'a erişimi olmadığında **403 + `AUTH-403`** dönüyor:

- `Employee*` (`/businesses/{id}/employees/*`, `/employees/{id}/*`)
- `FixedCost*`
- `Vehicle*`
- `Inventory*` (item-level dahil)
- `File*` (download/delete/link)

### FE'de ne değişir?

**Hiçbir mevcut akış kırılmaz** — kullanıcı zaten kendi business'ına erişiyordu. Ama dikkat:

1. **Stale state**: Eğer FE Zustand store'unda artık erişimi olmayan bir `activeBusiness` ID tutuyorsa, ilk istek 403 alır. FE bunu yakalayıp `activeBusiness`'i temizleyip kullanıcıyı dashboard'a yönlendirmeli.
2. **Çoklu sekme**: Admin başka sekmede kullanıcının yetkisini kaldırırsa, mevcut sekme bir sonraki istekte 403 alır → yönlendirme.

Önerilen genel handler:

```ts
// src/lib/api/client.ts içinde request fonksiyonu:
if (err instanceof ApiError && err.code === "AUTH-403") {
  useAppStore.getState().clearActiveBusiness();
  router.push("/dashboard");
  toast.error("Bu işlem için yetkiniz yok.");
}
```

---

## 5. File Upload — Yeni Kısıtlar

### Önce
- `category` herhangi bir string'di (örn `../../etc` mümkündü)
- MIME tip sadece `Content-Type` header'dan kontrol edilirdi (spoof edilebilirdi)

### Şimdi
- `category` whitelist'ten biri olmalı:
  `document` | `image` | `receipt` | `invoice` | `avatar` | `logo` | `debt_doc` | `note_attachment` | `other`
- MIME tip Apache Tika ile **magic byte üzerinden** tespit ediliyor. Client'in iddia ettiği `Content-Type` ile gerçek tip uyuşmazsa reddedilir.
- Original filename sanitize ediliyor (regex `[^A-Za-z0-9._-]` → `_`)
- `entity_type=business` + `entity_id=<biz-id>` ile upload yapılırken kullanıcının o business'a erişimi doğrulanır.

### FE'de yapılacaklar

**`src/lib/api/files.ts` (veya equivalent):**

```ts
export const FILE_CATEGORIES = [
  "document", "image", "receipt", "invoice",
  "avatar", "logo", "debt_doc", "note_attachment", "other",
] as const;
export type FileCategory = typeof FILE_CATEGORIES[number];

export async function uploadFile(file: File, opts: {
  category: FileCategory;                       // <-- tip kısıtla
  entityType?: "business" | "transaction" | "debt" | "note" | "user";
  entityId?: string;
  description?: string;
  adminOnly?: boolean;
}) { /* ... */ }
```

Form'da kategori dropdown'ı şu değerlerle render edin (Türkçe label):
```ts
const CATEGORY_LABELS: Record<FileCategory, string> = {
  document: "Belge",
  image:    "Görsel",
  receipt:  "Fiş",
  invoice:  "Fatura",
  avatar:   "Profil Görseli",
  logo:     "Logo",
  debt_doc: "Borç Belgesi",
  note_attachment: "Not Eki",
  other:    "Diğer",
};
```

### Hata kodları file için

- `FILE-413` → Dosya boyutu >10 MB (zaten vardı, kodu yeni)
- `VAL-400` + message `"Gecersiz kategori: ..."` → category whitelist dışı
- `VAL-400` + message `"Desteklenmeyen dosya tipi: ..."` → MIME uyumsuz
- `VAL-400` + message `"Dosya tipi uyusmazligi tespit edildi"` → Tika tespit ≠ client claim
- `AUTH-403` → business ownership eksik (delete/download/link/upload)

> ⚠️ Backend artık `magic byte` çakışmazsa dosyayı reddediyor — geliştirme sırasında MIME spoofing ile test ediyorsanız çalışmaz.

---

## 6. Login & Hesap Akışları — Lockout

### Önce
Backend `isAccountNonLocked() = true` hardcoded'du — kilitleme yoktu.

### Şimdi
- 5 başarısız login → `account_locked_until = now + 15 dakika`
- Başarılı login → counter sıfırlanır
- Kilit aktifken giriş denenirse: HTTP 401 + `code: "AUTH-LOCK"`

### FE'de yapılacaklar

Login form `catch` bloğunda:

```ts
catch (err) {
  if (!(err instanceof ApiError)) throw err;

  switch (err.code) {
    case "AUTH-LOCK":
      setError("Hesabınız 15 dakika geçici olarak kilitlendi. Lütfen sonra tekrar deneyin.");
      break;
    case "AUTH-DIS":
      setError("Hesabınız aktif değil. Lütfen yöneticiniz ile iletişime geçin.");
      break;
    case "AUTH-401":
    default:
      setError("Kullanıcı adı veya şifre hatalı.");
  }
}
```

Kullanıcıya **kaç deneme kaldığını göstermeyin** (information disclosure).

---

## 7. Backend Configuration — Operasyonel Notlar

Bunlar FE kodunu etkilemez ama deploy/env tarafında etkilenir:

### Yeni zorunlu env değişkenleri (production)

| Env | Gerekli mi? | Default | Açıklama |
|-----|-------------|---------|----------|
| `JWT_SECRET` | **EVET** (prod) | yok — fail-fast | Min 32 byte. Eski hardcoded fallback kaldırıldı |
| `DB_USERNAME` | **EVET** (prod) | yok | dev profile'da `postgres` |
| `DB_PASSWORD` | **EVET** (prod) | yok | dev profile'da `postgres` |
| `CORS_ALLOWED_ORIGINS` | **EVET** (prod) | `http://localhost:3000` | Virgülle ayrılmış FE origin listesi |
| `FILE_UPLOAD_DIR` | **EVET** (prod) | `./uploads` | Absolute path olmalı, persistent volume |
| `LOG_DIR` | Hayır | `./logs` | Audit/security log dosyaları için |
| `SPRING_PROFILES_ACTIVE` | Önerilir | `dev` | `dev` / `prod` / `staging` |
| `JPA_DDL_AUTO` | Hayır | `validate` | İlk kurulumda 1 kere `update`, sonra `validate` |
| `DB_POOL_MAX` / `DB_POOL_MIN` | Hayır | 30/5 | HikariCP |

### Yeni endpoint'ler

| Endpoint | Auth | Açıklama |
|----------|------|----------|
| `POST /internal/logs` | JWT (kullanıcı) | FE log ingest |
| `GET /actuator/prometheus` | JWT + `ROLE_ADMIN` | Prometheus scraping |
| `GET /actuator/metrics/**` | JWT + `ROLE_ADMIN` | Spring Boot metrics |
| `GET /actuator/info` | Public | Versiyon vb. |
| `GET /actuator/health` | Public | Health check |

### İlk start akışı

1. Backend ilk açılırken `users` tablosu boşsa `AdminBootstrapService` çalışır.
2. Konsol log'una **bir kez** rasgele 20-karakter şifre yazılır (banner ile).
3. Bu admin için `force_password_change = true`.

> **Frontend onboarding işi:** `GET /me` response'una `force_password_change` boolean'ı eklemek için ayrı bir ticket açmanız gerekebilir. Şu an o flag DTO'da expose edilmiyor — eklenirse FE login sonrası bu true ise şifre değiştirme ekranına yönlendirebilir. **Şu anda FE'de değişiklik gerekmiyor.**

---

## 8. Yeni Validation Hataları — Form UX

Bazı request DTO'lara `jakarta.validation` annotation'ları eklendi. Validation fail olursa response gövdesi:

```json
{
  "code": "VAL-400",
  "message": "Validasyon hatasi",
  "request_id": "req-...",
  "errors": {
    "fullName": "Ad soyad zorunludur",
    "salary":   "Maas negatif olamaz",
    "amount":   "Tutar zorunludur"
  }
}
```

Etkilenen ana DTO'lar (şimdilik):
- `CreateEmployeeRequest`: `fullName` zorunlu, `salary`/`insuranceCost` ≥ 0
- `CreateFixedCostRequest`: `name` zorunlu, `amount` zorunlu ve ≥ 0

### FE'de yapılacaklar

Mevcut form error handling kalıbına `errors` field-level mesajları besleyin:

```ts
catch (err) {
  if (err instanceof ApiError && err.fieldErrors) {
    Object.entries(err.fieldErrors).forEach(([field, msg]) => {
      setFormError(field, msg);
    });
    return;
  }
  toast.error(err.message);
}
```

Daha fazla DTO'ya validation eklenirse aynı pattern korunacak — `errors` haritası her zaman backend `snake_case` field adıyla gelir mi? **Hayır**, DTO field adıyla gelir (camelCase, Java field). DTO'da `@JsonProperty("snake_case_name")` varsa Jackson'dan dönen alan adı snake_case olur; ama validation error field adı **Java field name** olur. FE'de DTO field map'i ile uyumlu olduğundan emin olun.

---

## 9. Performance İyileştirmeleri — FE'ye Yansıyan Etkiler

### Latency düşmesi bekleniyor (FE'de iş yok, ama UX iyileşir)
- `/finance/overview` artık N+1 olmayan tek sorguya inmiş aggregation kullanıyor → 50 business 5+ saniyeyi geçen rapor şu an < 500 ms olmalı (test ortamında doğrulayın).
- `/businesses` ve `/me` Caffeine cache (10 dk TTL) → ilk istek dışında dönüş < 10 ms.
- DB indeksleri 15 yeni alan üzerinde → liste sayfaları (transactions, debts vs.) gözle görülür şekilde hızlanır.

### Frontend cache stratejisi önerisi
Backend cache'i var ama FE'de hala her component mount'ta fetch yapılıyor. SWR veya React Query taşıma için iyi bir an. Bu ayrı bir iş, mevcut PR'ın kapsamında değil.

---

## 10. Backend → Frontend Field/Type Drift Kontrolleri

Şu DTO'lardan dönen alanlar değişmedi — type drift yok:
- `BusinessDto`, `UserDto`, `ProfileDto`, `TransactionDto`, `EmployeeDto`, `VehicleDto`, `FixedCostDto`, `FinanceOverviewDto`, `FileUploadDto`, `InventoryItemDto`

> Yeni alan eklendi mi? **Hayır.** Backend `User` entity'sine `enabled`, `failed_login_attempts`, `account_locked_until`, `force_password_change` eklendi ama bunlar **`UserDto`'ya henüz expose edilmedi** (intentional — auth tarafı backend kararı). İhtiyaç olursa ayrı bir patch'te DTO'ya field ekleriz.

---

## 11. Görev Kontrol Listesi (FE Sprint için)

### Hemen (P0)

- [ ] `src/lib/api/client.ts` → `ApiError` sınıfını `code`, `requestId`, `fieldErrors` ile genişlet
- [ ] `src/lib/api/client.ts` → her request'e `X-Request-ID` header'ı üret ve gönder
- [ ] Tüm `catch (err)` bloklarında `err.message` yerine kod-spesifik UX (login `AUTH-LOCK`, generic `ERR-xxx` için support yönlendirmesi)
- [ ] `403` → `activeBusiness` clear + redirect + toast

### Yakın zaman (P1)

- [ ] File upload form: `category` dropdown'ı whitelist'ten render et, free-text input kaldır
- [ ] Login form lockout mesajı (kod: `AUTH-LOCK`)
- [ ] Validation hatalarında `errors` map'ini form field error'a bağla
- [ ] Network tab error'larında `request_id`'i support copy-paste'i için kullanıcıya göster (gizli alan veya tooltip)

### Sonra (P2 — logging_system.md §7'ye göre tam implementasyon)

- [ ] `src/lib/logger.ts` (renkli dev console, prod batch buffer)
- [ ] `src/app/api/logs/route.ts` (Next API → backend `/internal/logs` proxy)
- [ ] `src/app/global-error.tsx` ve provider'larda `window.onerror` / `unhandledrejection` handler
- [ ] Web Vitals reporter (`onLCP/onINP/onCLS` → logger.info)
- [ ] `console.log` ESLint kuralı: `"no-console": ["error", { "allow": ["warn", "error"] }]`

### Ortam (P3 — DevOps ile birlikte)

- [ ] `NEXT_PUBLIC_API_URL` prod'da gerçek backend URL'i
- [ ] `NEXT_PUBLIC_APP_VERSION` build-time inject (`process.env.NEXT_PUBLIC_APP_VERSION`)
- [ ] Backend env'lerinde `CORS_ALLOWED_ORIGINS=https://app.bizboard.tr,https://staging.bizboard.tr` set
- [ ] Sentry projesi (opsiyonel — `logging_system.md` §7.7)

---

## 12. Sık Sorulanlar

**S: Eski response gövdesi (`{ message: "..." }`) olan endpoint var mı?**
C: Hayır, tümü tek `GlobalExceptionHandler`'dan geçiyor. Yeni format her yerde.

**S: `request_id` zorunlu mu?**
C: Hayır, FE göndermezse backend üretir ve `X-Request-ID` header'ında geri döner. Sıfır breaking ama korelasyon için **gönderin**.

**S: `/auth/login` lockout sırasında brute force koruması nasıl çalışıyor?**
C: 5 başarısız → 15 dk kilit. Sayım `users` tablosundaki `failed_login_attempts` alanından. Başarılı login sıfırlar. FE'de "kaç deneme kaldı" göstermeyin.

**S: File upload yaparken Tika magic byte kontrolüne nasıl uyum sağlarım?**
C: Hiçbir şey yapmanıza gerek yok — gerçek dosyalar zaten doğru `Content-Type` ile yüklenir. Sadece sahte/sınama amaçlı dosyalar reddedilir. Browser otomatik doğru MIME üretir.

**S: `request_id` field name `request_id` mi yoksa `requestId` mi?**
C: Response gövdesinde **`request_id`** (snake_case, backend Jackson). Header **`X-Request-ID`** (kebab-case header).

**S: Backend hâlâ Türkçe mesaj dönüyor mu?**
C: Evet — hata mesajları Türkçe (`"Bu islem icin yetkiniz yok"`). i18n eklenirse ileride değişebilir; o zaman `code` üzerinden FE'de çeviri yapın.

---

## 13. Backend Tarafında Yapılan Değişikliklerin Tam Listesi

Hızlı referans olsun diye backend'deki değişiklik özeti:

### Güvenlik
- `AccessControlService` ile tüm Employee/FixedCost/Vehicle/Inventory/File endpoint'lerinde IDOR koruması
- `FileStorageService`: Apache Tika magic byte, kategori whitelist, path traversal koruma, filename sanitize
- `JwtUtil`: 32 byte secret zorunlu fail-fast; hardcoded fallback yok
- `AdminBootstrapService`: ilk start'ta rasgele şifreli admin
- `UserPrincipal.isAccountNonLocked()` artık DB alanından okur
- `AuthService`: 5 hatalı login → 15 dk lockout
- `GlobalExceptionHandler`: `code` + `request_id` + Türkçe generic mesajlar, stack trace asla client'a
- `SecurityConfig`: CORS env-driven, `/actuator/prometheus` `ROLE_ADMIN`

### Performans
- 5 Flyway migration (V1 baseline, V2 15 index, V3 user cols, V4 audit_logs, V5 fixed_cost unique)
- `Business.businessType` ve `BusinessMember.user`: EAGER → LAZY + `@EntityGraph`
- `FinanceService.getFinanceOverview`: N+1 → tek sorgu, ay-ay query yerine tek window
- `LedgerService.fullReconciliation`: `Integer.MAX_VALUE` page size yerine `SELECT MIN(date)`
- HikariCP tuning (max 30, leak detection 30 s, batch size 25)
- Caffeine cache (`@Cacheable` on `userByUsername`, `businessTypes`, `categoriesByBusiness`)
- `WEEKS_PER_MONTH = 30/7` (eski `4.33` magic number → tutarlı)
- `Europe/Istanbul` timezone (`TimeUtils.today()`, `@Scheduled zone="Europe/Istanbul"`)
- FixedCost race condition: unique constraint + try-catch upsert

### Observability
- `logback-spring.xml`: dev'de renkli pattern + emoji, prod'da JSON + Logstash encoder
- `MdcCorrelationFilter`: `request_id`, `user_id`, `business_id`, `client_ip` (mask) MDC alanları
- `RequestLoggingFilter`: `http.access` logger → method/path/status/duration_ms structured
- `MaskingConverter`: email/phone/IBAN/TC/card/JWT/Bearer otomatik mask
- `AuditLog` / `SecurityLog` / `PerfLog` static helper (com.bizboard.{audit,security,perf}/)
- `AuditLog` entity + `audit_logs` tablosu (V4 migration) + `AuditService` (DB writer)
- `@Logged` AOP annotation + `LoggedAspect` (yavaş işlemleri otomatik PerfLog'a düşürür)
- `LogIngestController` `/internal/logs` (FE batch ingest)
- Hibernate slow query: 200 ms üstü `org.hibernate.SQL_SLOW` logger
- Prometheus endpoint (`/actuator/prometheus`) + histogram metric'leri
- `application-dev.yml` / `application-prod.yml` profile bazlı

### Configuration
- Hardcoded `admin/admin123` seed silindi (`AdminBootstrapService` yerine)
- `application.yml` tüm sırlar env-driven; dev profilinde geliştirici dostu fallback'ler

---

**Son söz:** Mevcut frontend bu değişikliklerin **hiçbiri olmadan da çalışmaya devam eder**. Sadece error handling kalitesi, korelasyon ve gelecek logging entegrasyonu için yukarıdaki P0/P1 maddeleri uygulanmalı. Soru olursa backend tarafında dökümantasyon `logging_system.md` ve `ANALYSIS.md` referans dosyalarındadır.

---

# EK: Frontend-Only İşler (Backend Bağımsız)

> Aşağıdaki bölümler **frontend developer'ın bu PR'da bilmesi gereken** ama backend tarafıyla doğrudan ilgisi olmayan kritik konuları kapsıyor. Yine `ANALYSIS.md`'deki frontend güvenlik bulgularına (F1-F12) ve frontend'in production'a çıkması için gereken disiplinlere dayanıyor.

---

## 14. Token Yönetimi & XSS Risk (ANALYSIS.md F1 — 🔴 CRITICAL)

### Mevcut durum

`src/lib/api/client.ts` şu an:
```ts
localStorage.setItem("token", token);
document.cookie = `token=${token}; path=/; max-age=604800; SameSite=Lax`;
```

İki sorun:
1. **`localStorage`'da token** — bir XSS açığı (üçüncü taraf script, npm dependency zincir saldırısı, vb.) tüm token'a erişir.
2. **Cookie `HttpOnly` değil** — JavaScript hâlâ okuyabilir, yani aynı XSS riski.

### Hedef Mimari (Backend ile Koordinasyon Gerekir)

| Katman | Bugün | Hedef |
|--------|-------|-------|
| Access token | localStorage, 7 gün | `sessionStorage`, 15 dakika |
| Refresh token | yok | HttpOnly + Secure + SameSite=Strict cookie, 7 gün |
| Logout | localStorage temizle | refresh token'ı backend'de invalidate + cookie sil |

### Backend Koordinasyonu

**Backend developer'a sor:** `ANALYSIS.md` B17 (Refresh token mekanizması) bu PR'da yapıldı mı? Eğer yapılmadıysa:
- Geçici çözüm: Token'ı `localStorage` yerine `sessionStorage`'a al (tab kapanınca biter — XSS yüzeyi daralır, kullanıcı bir gün re-login)
- Kalıcı çözüm için **backend'de `/auth/refresh` endpoint'i ve refresh token tablosu** gerekir. Bu ayrı bir ticket.

### Geçiş Stratejisi (Backend refresh token desteği gelene kadar)

```ts
// src/lib/api/client.ts — minimum değişiklik (P0)
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("token");   // localStorage YERINE
}

export function setToken(token: string) {
  sessionStorage.setItem("token", token);   // localStorage YERINE
  // Cookie'yi de değiştir veya kaldır — şu an çift saklama anlamsız
}

export function clearToken() {
  sessionStorage.removeItem("token");
  document.cookie = "token=; path=/; max-age=0";
}
```

> ⚠️ **Middleware uyumsuzluğu:** `src/middleware.ts` cookie'den okuyor (`request.cookies.get("token")`). `sessionStorage`'a geçince middleware artık token'ı göremeyecek — SSR koruması kırılır. **Çözüm seçenekleri:**
> - **A**: Cookie'yi bırak ama `HttpOnly` ve `Secure` set et, FE okumasın (Authorization header'ı kullansın) — refresh token tasarımına geçişte natural step
> - **B**: Geçici olarak hem sessionStorage hem `SameSite=Strict` cookie tut; refresh token gelince düzelt
>
> Bu kararı **backend developer ile birlikte ver** çünkü refresh token tasarımı bu sorunun nihai çözümüdür.

---

## 15. Open Redirect — Middleware (ANALYSIS.md F2 — 🔴 CRITICAL)

### Açık

`src/middleware.ts` içinde:
```ts
redirectUrl.searchParams.set("redirect", request.nextUrl.pathname);
```

Sonra login sayfasında bu `redirect` parametresi alınıp `router.push(redirect)` ile kullanılır. **Doğrulama yok.**

Saldırgan kullanıcıya şu URL'i yollar:
```
https://app.alanadi.com/auth/login?redirect=https://evil.com/fake-login
```

Kullanıcı login olur, sonra evil.com'a yönlendirilir → phishing.

### Çözüm

Login sonrası yönlendirme yapan kodda:

```ts
function isSafeRedirect(url: string | null): boolean {
  if (!url) return false;
  // Sadece relative path veya same-origin URL'leri kabul et
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

// Login sonrası:
const redirect = searchParams.get("redirect");
const target = isSafeRedirect(redirect) ? redirect : "/dashboard";
router.push(target);
```

Aynı doğrulama `middleware.ts`'de de uygulanmalı (set ederken de kontrol et, gerçi `request.nextUrl.pathname` zaten same-origin ama disiplin olsun).

---

## 16. `NEXT_PUBLIC_API_URL` Fallback (ANALYSIS.md F3)

### Mevcut durum

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
```

Aynı pattern 3 dosyada tekrar ediyor:
- `src/lib/api/client.ts`
- `src/app/dashboard/documents/page.tsx`
- `src/components/business/DocumentsModule.tsx`

### Sorun

Production build'inde `NEXT_PUBLIC_API_URL` env değişkeni unutulursa fallback `localhost:8080` devreye girer. Kullanıcılar tarayıcılarından kendi localhost'larına istek atmaya çalışır → CORS hatası, kullanıcı şikayet eder, ama log'da bir şey görünmez.

### Çözüm

```ts
// src/lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL environment variable is not set. " +
    "Build or runtime configuration is incorrect."
  );
}
```

DocumentsModule ve documents/page.tsx'de aynı `API_URL`'i `client.ts`'den import et (DRY) — 3 yerde duplicate olmasın.

> CI build adımında `npm run build` zaten `NEXT_PUBLIC_*` env'leri build-time inject ettiği için bu hata erken yakalanır → production'a hatalı build çıkmaz.

---

## 17. Security Headers (`next.config.js`) (ANALYSIS.md F4)

### Mevcut durum

`next.config.js` PWA wrapper'ı dışında özel header yok. Tarayıcı default davranışlarına bel bağlıyor.

### Eklenecek

Eğer reverse proxy (Caddy) zaten bu header'ları ekliyorsa duplicate çakışma olmasın diye **ya proxy'de ya next.config.js'de** olmalı. Production deploy stratejisine göre karar ver. İdeal: **her ikisinde de** (defense in depth).

```js
// next.config.js
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), camera=(), microphone=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js inline script için gerekli
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://api.bizboard.tr",      // backend URL'ini ekle
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

module.exports = withPWA({
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // ... mevcut config
});
```

> **CSP `connect-src` kritik:** Backend URL'ini buraya eklemeyi unutma. Aksi takdirde tüm API çağrıları engellenir. Dev/staging/prod için ayrı CSP gerekebilir.

---

## 18. Rate Limit ve 429 Handling

### Backend tarafı

`ANALYSIS.md` B14'te rate limit P1 önceliğindeydi. Backend developer bunu eklediyse:
- Login: 5 deneme/dk/IP (zaten lockout var ama ek koruma)
- Genel: 100 istek/dk/user

Backend 429 + `Retry-After` header döner.

### Frontend tarafı

```ts
// src/lib/api/client.ts
if (res.status === 429) {
  const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
  throw new ApiError(
    429,
    "RATE-429",
    `Çok fazla istek gönderildi. ${retryAfter} saniye sonra tekrar deneyin.`,
    res.headers.get("X-Request-ID") ?? undefined,
  );
}
```

UI tarafında:
- Form submit butonları her submit sonrası **debounce** (2 saniye disabled)
- 429 yakalandığında toast: "X saniye sonra tekrar deneyin" + countdown
- Otomatik retry **YAPMA** (kullanıcıya net hata göster)

### Backend ile koordinasyon

**Backend developer'a sor:** Rate limit eklendi mi? Hangi endpoint'lerde? Hangi limitler? Bu bilgiyi al, FE UI feedback'ini ona göre kalibre et.

---

## 19. `CONF-409` — İş Kuralı Çakışmaları

Backend artık bazı durumlarda 409 dönüyor. En yaygın durum:

### Otomatik Yönetilen FixedCost

`§13` listesinde "FixedCost race condition: unique constraint + try-catch upsert" var. Bu, personel ve araç modüllerinden **otomatik** üretilen `FixedCost` kayıtlarının manuel düzenlenmesinin engellenmesi anlamına gelir.

### FE'de UI Davranışı

`FixedCost` listesinde her satırın bir `source` veya `type` field'ı var. Otomatik kaynaklar (`PERSONNEL`, `VEHICLE_RENTAL`) için:

```tsx
const isAutoManaged = ["PERSONNEL", "VEHICLE_RENTAL"].includes(fc.type);

<FixedCostRow>
  <EditButton
    disabled={isAutoManaged}
    title={isAutoManaged
      ? "Bu kayıt personel/araç modülünden otomatik yönetilir. Değiştirmek için ilgili modüle gidin."
      : "Düzenle"
    }
  />
  <DeleteButton disabled={isAutoManaged} ... />
</FixedCostRow>
```

Eğer kullanıcı yine de bir yolla edit denerse (örn. API direkt çağrı) backend 409 + `CONF-409` döner → toast'la kullanıcıyı bilgilendir.

### Diğer Potansiyel 409 Durumları

| Durum | Backend yanıtı | UI |
|-------|----------------|-----|
| Kapalı dönem işlem ekleme/silme | `CONF-409` | "Bu dönem kapatılmış, geçmişe dönük değişiklik admin onayı gerektirir" |
| Duplicate kategori adı | `CONF-409` | Form field hatası |
| Kullanıcı silme — aktif sahibi olduğu işletme varsa | `CONF-409` | "Önce işletme sahipliğini başkasına devredin" |

**Backend developer'a sor:** Hangi durumlarda `CONF-409` döndüğü tam liste al, FE'de spesifik mesajlar ver.

---

## 20. Test Ortamı Awareness

### Sorun

`NEXT_PUBLIC_ENV=test` ile çalışan frontend, görsel olarak production'dan ayırt edilemiyor. Operatör/geliştirici test ortamına alışıp orada işlem yaparsa, sonra "bu veriyi neden göremiyorum?" diye şaşırabilir (test verileri her gece silinir).

### Çözüm

Top bar veya layout'a sabit banner:

```tsx
// src/components/layout/EnvironmentBanner.tsx
export function EnvironmentBanner() {
  const env = process.env.NEXT_PUBLIC_ENV;
  if (env !== "test" && env !== "staging") return null;

  return (
    <div className={`
      px-4 py-1.5 text-xs font-semibold text-center
      ${env === "test"
        ? "bg-amber-500/20 text-amber-200 border-b border-amber-500/40"
        : "bg-purple-500/20 text-purple-200 border-b border-purple-500/40"
      }
    `}>
      {env === "test"
        ? "⚠️ TEST ORTAMI — Veriler her gece prod'dan yenilenir, değişiklikleriniz kalıcı değildir"
        : "🟣 STAGING ORTAMI"
      }
    </div>
  );
}
```

Layout root'a yerleştir, login sayfası dahil her yerde görünsün.

---

## 21. Type Safety & Code Quality (ANALYSIS.md F8)

### `any` Temizliği

Mevcut `any` kullanımları (frontend audit'ten):

```
src/app/dashboard/finance/page.tsx:18  icon: any;
src/app/dashboard/add/page.tsx:        cat: any
catch blokları:                         err: any
```

### Doğru tipler

```tsx
// İcon — Lucide icon component tipi
import { LucideIcon } from "lucide-react";
icon: LucideIcon;

// Category — backend DTO tipinden
import { Category } from "@/types";
cat: Category;

// Error — unknown + type guard
} catch (err: unknown) {
  if (err instanceof ApiError) { ... }
  else if (err instanceof Error) { ... }
  else { logger.error("ui", "Unknown error", { err: String(err) }); }
}
```

### ESLint Kuralları

`.eslintrc.json`:
```json
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["error", { "allow": ["warn", "error"] }],
    "react-hooks/exhaustive-deps": "error"
  }
}
```

> `no-console` kuralı `logger`'ı zorunlu kılar. Mevcut kodda 20+ `console.log` var — hepsi `logger.debug/info/error`'e dönüştürülmeli.

### TypeScript Strict Mode

`tsconfig.json`'da `"strict": true` zaten var. Ek olarak:
```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Bu ayarları açtığında mevcut kodda hata çıkabilir; tek tek düzelt.

---

## 22. İlerideki İşler — Backend Koordinasyon Gerektirenler

### 22.1 `force_password_change` Akışı

Backend `AdminBootstrapService` ilk admin için rasgele şifre üretip `force_password_change=true` set ediyor. Şu an bu field `UserDto`'ya expose edilmediği için FE bilemiyor.

**Yapılacak (ayrı ticket):**

1. Backend: `UserDto`'ya `force_password_change: boolean` ekle (sadece kendi profilini sorgularken döner)
2. Backend: `POST /me/password` endpoint'i (mevcut şifre + yeni şifre)
3. Frontend: Login sonrası `/me` sonucunda `force_password_change=true` ise:
   - Otomatik `/dashboard/change-password` sayfasına yönlendir
   - Kullanıcı şifre değiştirene kadar diğer sayfalar kilitli (middleware veya layout guard)
4. Frontend: `/dashboard/change-password` ekranı

### 22.2 Audit Log Admin UI

Backend `audit_logs` tablosu yazıyor ama FE'de okuma ekranı yok.

**Yapılacak:**

1. **Backend developer'a sor:** Audit log okuma endpoint'i var mı? Yoksa endpoint tasarla:
   - `GET /admin/audit-logs?actor_id=&action=&from=&to=&page=&size=`
   - Sadece `ROLE_ADMIN`
   - Pagination
2. Frontend: `/admin/audit` sayfası
   - Filter'lar (kim, ne, ne zaman)
   - Timeline görünümü
   - Before/after JSON diff göster
   - CSV export

### 22.3 Notification UI (Mevcut Eksiklik)

Backend `notifications` tablosu var ama FE'de unread count gösterimi/popover yok (TopBar'da `unreadCount` zustand'da ama UI'da kullanılmıyor).

**Yapılacak:**

1. TopBar'a bell ikon + unread badge
2. Click → notification dropdown
3. Mark as read
4. Real-time için gelecekte SSE/WebSocket

### 22.4 Refresh Token Akışı

Yukarıda §14'te belirtildiği gibi backend ile koordinasyon gerekiyor.

---

## 23. Genişletilmiş Görev Kontrol Listesi (Tüm Eklemeler)

> §11'in genişletilmiş hali. Önceki listedekiler korundu, yenileri **işaretlendi**.

### Hemen (P0 — Üretime çıkmadan önce)

- [ ] `src/lib/api/client.ts` → `ApiError` sınıfını `code`, `requestId`, `fieldErrors` ile genişlet
- [ ] `src/lib/api/client.ts` → her request'e `X-Request-ID` header'ı üret ve gönder
- [ ] Tüm `catch (err)` bloklarında `err.message` yerine kod-spesifik UX (login `AUTH-LOCK`, generic `ERR-xxx` için support yönlendirmesi)
- [ ] `403` → `activeBusiness` clear + redirect + toast
- [ ] **🆕 Token storage: localStorage → sessionStorage** (geçici, refresh token geleneceğe kadar)
- [ ] **🆕 Open redirect fix: `redirect` param same-origin doğrulaması**
- [ ] **🆕 `NEXT_PUBLIC_API_URL` fallback kaldır (3 dosyada)**

### Yakın zaman (P1 — İlk sprint)

- [ ] File upload form: `category` dropdown'ı whitelist'ten render et, free-text input kaldır
- [ ] Login form lockout mesajı (kod: `AUTH-LOCK`)
- [ ] Validation hatalarında `errors` map'ini form field error'a bağla
- [ ] Network tab error'larında `request_id`'i support copy-paste'i için kullanıcıya göster (gizli alan veya tooltip)
- [ ] **🆕 `next.config.js` security headers (CSP, HSTS, X-Frame, vb.)**
- [ ] **🆕 Rate limit 429 handling — `Retry-After` header + UI countdown**
- [ ] **🆕 CONF-409 — Otomatik FixedCost (PERSONNEL/VEHICLE_RENTAL) edit butonları disable**
- [ ] **🆕 Backend'den `CONF-409` durumları tam listesi al → her biri için UI mesajı**

### Sonra (P2 — logging_system.md §7'ye göre tam implementasyon)

- [ ] `src/lib/logger.ts` (renkli dev console, prod batch buffer)
- [ ] `src/app/api/logs/route.ts` (Next API → backend `/internal/logs` proxy)
- [ ] `src/app/global-error.tsx` ve provider'larda `window.onerror` / `unhandledrejection` handler
- [ ] Web Vitals reporter (`onLCP/onINP/onCLS` → logger.info)
- [ ] `console.log` ESLint kuralı: `"no-console": ["error", { "allow": ["warn", "error"] }]`
- [ ] **🆕 Test ortamı banner (`EnvironmentBanner` component)**
- [ ] **🆕 Notification UI (TopBar bell + dropdown)** — backend zaten yazıyor

### Ortam (P3 — DevOps ile birlikte)

- [ ] `NEXT_PUBLIC_API_URL` prod'da gerçek backend URL'i
- [ ] `NEXT_PUBLIC_APP_VERSION` build-time inject (`process.env.NEXT_PUBLIC_APP_VERSION`)
- [ ] Backend env'lerinde `CORS_ALLOWED_ORIGINS=https://app.bizboard.tr,https://staging.bizboard.tr` set
- [ ] Sentry projesi (opsiyonel — `logging_system.md` §7.7)
- [ ] **🆕 `NEXT_PUBLIC_ENV` set (dev/test/staging/prod)**

### İleride (P4 — Yeni Ticket'lar)

- [ ] **🆕 Refresh token mekanizması** (backend + FE birlikte)
- [ ] **🆕 `force_password_change` akışı** (backend DTO + FE password change ekranı)
- [ ] **🆕 Audit log admin UI** (backend endpoint + FE sayfa)
- [ ] **🆕 `any` kullanımı temizliği + strict TS ayarları**
- [ ] **🆕 PWA `skipWaiting` davranışı — kullanıcı prompt'u**
- [ ] **🆕 LocalStorage form draft (`bizboard_draft_business`) — sensitivity review**

---

## 24. Backend Developer'a Sorulacak Sorular

Bu PR'ı incelerken aşağıdaki noktalar **belirsiz kaldı**. Frontend developer şu konuları netleştirmek için backend developer'a sormalı:

1. **Refresh token mekanizması (B17) bu PR'da var mı?**
   - Yoksa: token süresi hâlâ 7 gün mü? Geçici sessionStorage yeterli mi?
   - Varsa: `/auth/refresh` endpoint kontratı nedir? Refresh token nerede saklanıyor (HttpOnly cookie mi)?

2. **Rate limit (B14) eklendi mi?**
   - Hangi endpoint'lerde? Hangi limit (req/dk)?
   - 429 response gövdesi standart formata uyuyor mu (`code: "RATE-429"` benzeri)?
   - `Retry-After` header dönüyor mu?

3. **`CONF-409` tam listesi nedir?**
   - Hangi iş kuralı ihlali bu kodu döner?
   - Her birinde kullanıcıya gösterilecek standart mesaj var mı yoksa FE kendi UI metnini mi belirler?

4. **Audit log okuma endpoint'i var mı?**
   - Yoksa: admin UI ekranı için endpoint tasarımı kim yapacak?
   - Filter/pagination/sort destekleniyor mu?

5. **Notification endpoint'i hazır mı?**
   - `GET /notifications` mevcut mu? Mark-as-read endpoint'i? Unread count?
   - Real-time için SSE/WebSocket planı var mı?

6. **`force_password_change` DTO'ya ne zaman expose edilecek?**
   - Backend'de field hazır ama `UserDto`'da yok. Bu PR'ın kapsamında mı yoksa ayrı ticket mi?

7. **CORS `X-Request-ID` allow/expose** doğru çalışıyor mu?
   - Bir test isteğiyle response header'ında `X-Request-ID` görüldüğü doğrulanmalı.

8. **`/internal/logs` endpoint** Authorization olmadan da kabul ediyor mu yoksa Bearer JWT zorunlu mu?
   - Şu an dökümanda "JWT zorunlu, normal kullanıcı bile çağırabilir" denmiş. Frontend Logger'ın bu header'ı flush'ta eklemesi gerekiyor.

9. **Test ortamı için backend `APP_EXTERNAL_INTEGRATIONS_ENABLED=false`** ayarı var mı?
   - Test ortamında email/SMS/webhook çağrıları gerçekten devre dışı mı?

10. **Banner için `NEXT_PUBLIC_ENV` mi yoksa backend'den mi öğrenilecek?**
    - Backend `GET /actuator/info` veya `/me` response'unda env bilgisi dönüyor mu? Yoksa sadece FE env var ile mi?

---

**Genişletilmiş son söz:**

Backend developer'ın yazdığı orijinal `frontend_update.md` (yukarıda §1-§13) **backend tarafındaki değişiklikleri** doğru ve eksiksiz anlatıyor. Eklediğim §14-§24 ise **frontend tarafının kendi başına yapması gereken işler** (ANALYSIS.md F1-F12) ve **iki tarafın koordinasyonu gereken belirsizlikler**.

Üretime çıkmadan önce:
- Tüm P0 maddeleri tamamlanmalı (özellikle token storage, open redirect, env fallback)
- §24'teki sorular backend developer ile netleştirilmeli
- En az 1 hafta test ortamında çalışıp gerçek kullanıcılarla denenmiş olmalı

---

## 25. Refresh Token & Bootstrap (Yeni — §14'ün nihai çözümü)

### Backend yenileri
- `POST /auth/login` artık `{ token, expires_in, force_password_change }` döner. Aynı zamanda **HttpOnly Secure SameSite=Strict** refresh cookie `rt` set eder (Path=/).
- `POST /auth/refresh` — refresh cookie ile yeni access (+rotation refresh) üretir. Eski token reuse edilirse o user için tüm token'lar revoke (compromise detection).
- `POST /auth/logout` — refresh token'ı revoke, cookie sil.
- Access token TTL **15 dakika** (eski 7 gün); refresh TTL 30 gün.
- Cookie konfigürasyonu env-driven:
  - `COOKIE_SECURE=true` (prod default), `COOKIE_SAME_SITE=Strict` (varsayılan)

### Frontend nihai mimari (`src/lib/api/client.ts`)
- **Access token bellekte** (module-level değişken, `getToken()`/`setToken()`).
- `setToken(token, expiresInSeconds)` — TTL otomatik takip edilir.
- `isTokenExpiringSoon(60)` — istek öncesi proaktif refresh tetiği.
- `refreshAccessToken()` — inflight promise paylaşımı ile race-condition'ı önler (paralel 401'ler tek refresh ile çözülür).
- `request<T>()`:
  - Proaktif refresh (TTL < 60s ise istek öncesi yenile)
  - 401 → silent refresh + tek defalık retry (sadece `/auth/*` olmayan path'ler için)
  - Network error → `ApiError("NET-0", ...)`
- `logout()` — `POST /auth/logout` + `clearToken()`. TopBar'da kullanılıyor.
- `subscribeTokenChange(cb)` — multi-tab logout senkronizasyonu için.

### Bootstrap (`ClientProviders`)
Sayfa açıldığında access token bellekte yok (memory). Refresh cookie varsa silent refresh dener:
```ts
useEffect(() => {
  // public route'da değilse ve token yoksa /auth/refresh çağır
  await refreshAccessToken();
  // başarısız → /auth/login'e replace
}, []);
```
Splash spinner gösterilir (~100 ms refresh süresi). Public route'larda (login) atlanır.

### Middleware
`rt` cookie'sinin **varlığını** kontrol eder (içeriği okuyamaz). Yoksa `/auth/login` redirect. **Sadece UX guard** — gerçek doğrulama backend'de.

### Çoklu sekme
`bb_logout_signal` localStorage anahtarı → `storage` event ile diğer sekmelerde `clearToken()` + login redirect.

### Breaking değişiklikler (FE içi)
- `setToken("xyz")` → `setToken("xyz", 900)` (2. parametre artık zorunlu)
- localStorage/cookie token okuyan eski kodun **HİÇBİRİ** artık geçerli değil — `getToken()` her zaman bellekteki değeri döner.

---

## 26. Password Change (`POST /me/password`)

### Backend
- Body: `{ current_password, new_password }`
- 204 No Content (başarılı)
- 400 + `VAL-400` + `{ errors: { new_password: "..." } }` (min 10 char)
- 400 + `message: "Mevcut sifre hatali"` (current_password mismatch)
- 400 + `message: "Yeni sifre, eski sifre ile ayni olamaz"` (same as old)
- Başarılı sonrası: **tüm refresh token'lar revoke** (force re-login on all devices)
- `force_password_change` flag → false.

### Frontend (`/dashboard/change-password`)
- Üç form alanı: mevcut / yeni / yeni-tekrar
- Client-side: yeni ≥10 char, tekrar eşleşmeli
- Backend hata kodları handle edilmiş
- Başarılı → 2 saniye success ekranı → `clearToken()` + `/auth/login` redirect

### AppShell guard
```ts
useEffect(() => {
  if (profile?.force_password_change && pathname !== "/dashboard/change-password") {
    router.replace("/dashboard/change-password");
  }
}, [profile, pathname]);
```
İlk admin (AdminBootstrapService) veya manuel reset sonrası kullanıcı bu ekranda kilitli kalır.

---

## 27. Audit Log Admin UI (`/admin/audit`)

### Backend (`GET /admin/audit-logs`)
ROLE_ADMIN required. Query parametreleri:
- `actor_id`, `business_id`, `action`, `entity_type`, `entity_id` (UUID)
- `from`, `to` (ISO `LocalDateTime`)
- `page` (0-based), `size` (max 200, default 50)

Yanıt: `PagedResponse<AuditLogDto>`:
```jsonc
{
  "items": [{ "id", "occurred_at", "actor_user_id", "actor_username", "action",
              "entity_type", "entity_id", "business_id", "ip", "user_agent",
              "trace_id", "metadata" }],
  "page": 0, "size": 50,
  "total_elements": 1234, "total_pages": 25, "has_next": true
}
```

### Frontend UI
- 6 filter alanı (id'ler, action, entity_type, date range)
- 12-kolon table layout (tarih, aktör, aksiyon, hedef, IP)
- Satıra tıkla → JSON detay paneli expand (`trace_id`, `metadata`, `user_agent`)
- Pagination (Previous/Next + sayfa göstergesi)
- CSV export (occurred_at, actor_username, action, entity_type, entity_id, business_id, ip, trace_id)
- Admin panelindeki `/admin` sayfasından `Audit Log` butonu ile erişim

---

## 28. Notification UI

### Backend endpoint'leri (`/notifications`)
| Method | Path | Açıklama |
|--------|------|----------|
| `GET` | `/notifications?page=0&size=20&unread=false` | Sayfalı liste |
| `GET` | `/notifications/unread-count` | `{ count: number }` |
| `PATCH` | `/notifications/{id}/read` | Tek bildirimi okundu işaretle |
| `PATCH` | `/notifications/read-all` | `{ updated: number }` |

403 → bildirim başkasınınsa.

### Frontend (`NotificationDropdown`)
- TopBar'da bell ikonu + unread badge
- 60 saniye polling → `unread-count`
- Dropdown açıldığında ilk 20 bildirim fetch
- Unread → mavi nokta + hover'da `Check` butonu
- "Tümünü okundu işaretle" (`read-all` endpoint)
- `action_url` varsa item bir `<Link>` → tıklayınca okundu+yönlendir
- `NotificationDto` artık `user_id` expose etmiyor (privacy)

### Tip drift uyarısı
`Notification.business_name` opsiyonel — backend `NotificationDto` join'den dolduruyor.

---

## 29. PWA Update Prompt

### next.config.js değişikliği
```diff
- skipWaiting: true,
+ skipWaiting: false,
```

Otomatik update yerine kullanıcıya prompt.

### `PwaUpdatePrompt` bileşeni
- Service worker `waiting` state'ine girdiğinde toast: "Yeni sürüm hazır — Yenile"
- "Yenile" → `worker.postMessage({ type: "SKIP_WAITING" })`
- `controllerchange` event → `window.location.reload()` (tek seferlik)
- "X" → dismiss (kullanıcı sonra reload edebilir)
- Form doldururken otomatik refresh **engellendi**.

---

## 30. EnvironmentBanner

`NEXT_PUBLIC_ENV=test` veya `staging` set edildiğinde root layout'ta sabit banner görüntülenir:
- **Test:** amber renkli — "Veriler her gece prod'dan yenilenir"
- **Staging:** purple renkli

Production ve dev'de hiçbir şey render edilmez. `ANALYSIS.md` §20'deki teste-prod karışıklığı önlenmiş olur.

---

## 31. Error Handling Helper (`@/lib/errors`)

### `getErrorMessage(err: unknown, fallback?)`
Tip-güvenli error mesaj çıkarımı. Tüm catch bloklarında kullanılıyor:
```ts
try {
  await api.post(...);
} catch (err: unknown) {
  setError(getErrorMessage(err, "Kayit basarisiz"));
}
```

### `getErrorCode(err: unknown)`
ApiError'in `code` alanını çıkarır (varsa). ApiError tip-tahmini yapmadan kullanılabilir.

### ESLint hazırlığı
Tüm dosyalarda `: any` kalmadı. `@typescript-eslint/no-explicit-any` kuralı şu an manuel disiplinle korunuyor — `.eslintrc.json`'a eklenebilir:
```json
{ "rules": { "@typescript-eslint/no-explicit-any": "error" } }
```

---

## 32. Multi-Tab Logout Senkronizasyonu

Kullanıcı bir sekmede logout olursa diğer sekmeler:
1. `bb_logout_signal` localStorage key'i set edilir
2. `storage` event ile diğer tab'ler yakalar
3. `clearToken()` + `/auth/login` redirect

Test: iki sekme aç, birinde logout → diğer sekme login'e dönmeli.

---

## 33. Production Ortam Değişkenleri (Güncellendi)

### Backend (yeni eklenenler)
| Env | Default | Açıklama |
|-----|---------|----------|
| `JWT_EXPIRATION_MS` | 900000 (15 dk) | Access token TTL |
| `JWT_REFRESH_EXPIRATION_MS` | 2592000000 (30 gün) | Refresh token TTL |
| `COOKIE_SECURE` | dev: false, prod: true | HTTPS arkasında zorunlu |
| `COOKIE_SAME_SITE` | Strict | Lax (cross-origin FE), None (CORS) |
| `ADMIN_BOOTSTRAP_ENABLED` | true (dev), false (prod) | Sadece ilk kurulumda true |

### Frontend
| Env | Açıklama |
|-----|----------|
| `NEXT_PUBLIC_API_URL` | Backend URL (prod'da zorunlu) |
| `NEXT_PUBLIC_ENV` | "test" / "staging" / "prod" — banner için |
| `NEXT_PUBLIC_LOG_LEVEL` | "debug" / "info" — frontend logger min level |
| `NEXT_PUBLIC_APP_VERSION` | Build-time inject (`@project.version@`) |
| `BACKEND_URL` | `/api/logs` proxy için server-side URL |

---

## 34. Sonuç — Tüm Maddeler Kapatıldı

`ANALYSIS.md` F1-F12 (frontend açıkları) + `frontend_update.md` §1-§24 (eski plan) + §25-§33 (yeni eklenenler) hepsi tamamlandı. **Üretime çıkmadan önce yapılması gerekenler artık yok** — sadece QA + load test + ortam ayarları.

Frontend build: ✅ `npm run build` EXIT=0 (16 sayfa, /api/logs, middleware, PWA)
Backend build: ✅ `mvn package` BUILD SUCCESS (6 modül)
