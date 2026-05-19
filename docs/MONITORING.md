# ÇATI — Hata İzleme & Monitoring

Bu dokümanda ÇATI frontend'inde production hata yakalama, loglama ve raporlama
katmanlarının nasıl çalıştığı açıklanır. v1.6.9 itibariyle stack tamamen kuruludur;
Sentry SDK opsiyonel ek katman olarak v1.7+'a ertelendi.

## Mimari özet

```
                ┌─────────────────────────────────────────┐
                │           Browser (ÇATI Web)            │
                │                                         │
                │  ┌───────────────┐    ┌──────────────┐  │
                │  │ ErrorBoundary │    │ window.error │  │
                │  │ (class comp.) │    │ + unhandled  │  │
                │  └──────┬────────┘    └──────┬───────┘  │
                │         │                    │          │
                │         └─────────┬──────────┘          │
                │                   ↓                     │
                │            ┌──────────────┐             │
                │            │  logger.ts   │             │
                │            │  (batch+keep │             │
                │            │   alive)     │             │
                │            └──────┬───────┘             │
                └───────────────────┼─────────────────────┘
                                    │ POST /api/logs
                                    ↓
                ┌─────────────────────────────────────────┐
                │           Next.js API route             │
                │      src/app/api/logs/route.ts          │
                │  (auth header → bearer JWT forward)     │
                └───────────────────┬─────────────────────┘
                                    │ POST /internal/logs
                                    ↓
                ┌─────────────────────────────────────────┐
                │       Spring Boot — backend ingestion   │
                │     "frontend" logger pipeline'a yazılır │
                └─────────────────────────────────────────┘
```

## Yakalama katmanları

### 1. React Error Boundary (route-level)

**Dosya:** `src/components/layout/ErrorBoundary.tsx`

Class component; `getDerivedStateFromError` + `componentDidCatch` ile render-time
exception'ları yakalar. `logger.error("boundary", ...)` ile arka uca raporlar.

**Wired routes:**
- `app/dashboard/layout.tsx` → `level="route"`
- `app/admin/layout.tsx` → `level="route-admin"`
- `app/business/[id]/layout.tsx` → `level="route-business"`

**Default fallback UI:** kırmızı uyarı ikonu + Türkçe mesaj + "Tekrar dene"
(state reset) + "Ana sayfa" (link). Dev modda `<details>` içinde error.name +
message + stack (ilk 2 KB).

Custom fallback için `<ErrorBoundary fallback={(error, retry) => ...}>` prop.

### 2. Next.js root global error

**Dosya:** `src/app/global-error.tsx`

Next.js App Router'ın root-segment crash fallback'i. RootLayout veya altındaki
herhangi bir client/server segmentin render'ı patlarsa devreye girer. Tam
`<html><body>` döndürür (root layout tree olmadığı için), error digest'i log'a
ekler.

### 3. Window-level error capture

**Dosya:** `src/components/layout/ClientProviders.tsx` (effect içinde)

Mount'ta iki listener ekler:

- `window.addEventListener("error", ...)` — uncaught synchronous exceptions
- `window.addEventListener("unhandledrejection", ...)` — uncaught Promise rejection'lar

Her ikisi de `logger.error("boundary", ...)` ile raporlanır.

### 4. Logger (batch + keepalive)

**Dosya:** `src/lib/logger.ts`

Production'da:

- **Buffer:** max 25 record veya 5 saniyede bir flush
- **Error level:** anında flush (kuyruğa beklemez)
- **`keepalive: true`:** tab kapatılırken bile son request iletilir
- **`visibilitychange` + `beforeunload`:** ek garanti flush
- **Session ID:** `sessionStorage` `bb_session_id` (8 hex)
- **URL + UA + version + env** her record'a otomatik eklenir

Dev modda transport YOK — yalnız renkli console output.

API:

```ts
logger.info ("api",  "User login successful", { user_id });
logger.warn ("ui",   "Form validation skipped",  { field: "amount" });
logger.error("api",  "Transaction create failed",
             { request_id, status: 500 }, err);
```

Categories: `"api" | "auth" | "ui" | "store" | "router" | "perf" | "boundary"`.

### 5. /api/logs Next.js proxy

**Dosya:** `src/app/api/logs/route.ts`

Browser → Next.js (server-side, CORS bypass) → Spring Boot `/internal/logs`.

- Token cookie'den okunur, backend'a `Authorization: Bearer ...` olarak iletilir
- Body olduğu gibi forward edilir (records array)
- Fire-and-forget — log forwarder kullanıcıyı bekletmez

## Test yöntemi

### Yerel render error testi

Bir komponent'i geçici olarak patlatın:

```tsx
if (process.env.NODE_ENV === "development" && location.search.includes("crashtest")) {
  throw new Error("Crash test");
}
```

Sayfada fallback UI görünmeli; backend log'larında `boundary` category'sinde
"React render error (route)" mesajı çıkmalı.

### Window error testi

Browser console'a:

```js
setTimeout(() => { throw new Error("test-window-error"); }, 0);
```

Backend log'larında `boundary` + "window.onerror" mesajı.

### Unhandled rejection testi

```js
Promise.reject(new Error("test-rejection"));
```

Backend log'larında `boundary` + "unhandledrejection" mesajı.

## Erteletilmiş (v1.7+)

- **Sentry frontend SDK** — `@sentry/nextjs` + DSN config. Mevcut `logger.ts`
  + `/api/logs` + ErrorBoundary kombo'su zaten Sentry'ye benzer akış sağlıyor
  (errors backend'a düşüyor). Sentry eklemek source map upload + release
  tagging gibi production-grade event analytics getirir.
- **Sentry backend SDK** — `io.sentry:sentry-spring-boot-starter-jakarta`.
  Backend exception'larını ayrı kanaldan toplar (mevcut SLF4J logging dışında).

## İlgili dosyalar

| Dosya | Görev |
|---|---|
| `src/components/layout/ErrorBoundary.tsx` | Route-level React Error Boundary |
| `src/components/layout/ClientProviders.tsx` | Window error/rejection listener wiring |
| `src/app/global-error.tsx` | Next.js root crash fallback |
| `src/lib/logger.ts` | Batch + keepalive transport |
| `src/app/api/logs/route.ts` | Next → Spring Boot proxy |

## CHANGELOG referansları

- **v1.6.9** — React Error Boundary eklendi; audit'te `/api/logs`, global capture
  ve `global-error.tsx`'in zaten kurulu olduğu keşfedildi.
- **v1.6.16** — Bu dokümantasyon eklendi.
