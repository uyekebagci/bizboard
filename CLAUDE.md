# BizBoard (Çatı) — Claude Code Configuration

> **Çatı** — multi-tenant finansal SaaS (işletme/kasa/POS/gelir-gider). Marka adı "Çatı", repo/kod adı "bizboard".
> **CANLI MÜŞTERİ verisi var (DGR — dikkatli).** Geri-dönülemez/riskli değişikliklerde Lead'e escalate et.

## Çekirdek Kurallar — TEK KAYNAK

Bu proje **YEKESOFT-CONVENTIONS.md** (çekirdek) kurallarına ZORUNLU uyar:
`../YEKESOFT-CONVENTIONS.md` (`/Users/umudovic/Desktop/YekeSoft/YEKESOFT-CONVENTIONS.md`)

Çekirdekte: versiyonlama (Conventional Commits + SemVer + CHANGELOG + tag), güvenlik/multi-tenant guard (read→assertCanReadBusiness/404, mutate→assertCanAccessBusiness/403, accessibleBusinessIds tek kaynak, secret env'de), hata (GlobalExceptionHandler tek kaynak, key `message`, 404/400/409, 500 sızdırma yok), finansal (gelir/gider tek helper, TRANSFER dışlanır, POS effectiveAmount), dosya <500 / 15+ useState→reducer / N+1 JOIN FETCH, çift tema, otomatik test YAZMA, kök dizine dosya atma yasağı.

**Kural çakışırsa çekirdek kazanır.** Aşağısı sadece Çatı'ya özel EK.

---

## Çatı'ya Özel (POLİTİKA: STRICT — katı katman)

Multi-tenant finansal SaaS + canlı müşteri. Çekirdek kurallar katı uygulanır; finansal doğruluk ve tenant izolasyonu pazarlık konusu değil.

### Stack — Spring Multi-Module
```
backend/bizboard/
├── bizboard-common/      # entity, enum, value object, paylaşılan tipler
├── bizboard-repository/  # JPA repository'ler, persistence
├── bizboard-security/    # auth, access guard (accessibleBusinessIds tek kaynak)
├── bizboard-service/     # iş mantığı (TransactionService, finansal helper'lar)
└── bizboard-api/         # controller, DTO, GlobalExceptionHandler
frontend/                 # Next.js (React) — SPA panel, çift tema, glass redesign CANLI
```
- Bağımlılık yönü: `api → service → repository → common`; `security` cross-cutting. İş mantığı **service**'te, controller ince.
- N+1 için `JOIN FETCH`/`@EntityGraph`; DTO ile expose (entity doğrudan dönme).
- DB değişikliği migration ile; manuel şema değişikliği yok.

### Multi-Tenant Guard (KRİTİK — canlı müşteri izolasyonu)
- Read (GET) → `accessGuard.assertCanReadBusiness(userId, businessId)` → erişim yoksa **404** (varlık sızdırma yok).
- Mutate (POST/PUT/PATCH/DELETE) → `accessGuard.assertCanAccessBusiness(userId, businessId)` → erişim yoksa **403**.
- `accessibleBusinessIds` TEK KAYNAK (`bizboard-security`); kopya/yeniden hesaplama YAZMA.

### Finansal (en kritik — canlı para)
- Gelir/gider tek paylaşımlı helper; **sign/magnitude** kuralları: tutarlar magnitude-pozitif, yön `direction` ile.
- **TRANSFER dışlanır** (gelir de gider de değil). İstisna → açık `// yorum` + Lead onayı.
- **POS:** `effectiveAmount` net-profit zinciri = `appliedOurCommissionRate − appliedPosRate`; oranlar tx **create** anında snapshot edilir (cihazdan), `validatePosCommissionRates(our >= bank)` create+update'te aynı helper'dan. Legacy NULL-rate tx'ler profit=0 korunur.
- **H-1 (LedgerService TRANSFER gelir/gider + dönem özeti) ERTELENDİ — Lead düzeltecek, ŞİMDİ DOKUNMA.**

### Versiyon & Hotfix Pratiği
- Tagged + beta sürümler: `Beta v1.1`, `v1.7.x` gibi; SemVer + CHANGELOG `[Unreleased]` her zaman güncel.
- **4-component hotfix pratiği:** acil düzeltmede tutarlılık için ilgili 4 katman birlikte gözden geçirilir (common entity ↔ service mantık ↔ api/DTO ↔ frontend) — birini güncelleyip diğerini unutma (POS rate snapshot tutarsızlığı bu yüzden çıkmıştı).
- CHANGELOG'da finansal/davranış değişikliklerinde **etki notu** zorunlu (örn. "yalnız yeni tx, mevcut kayıt değişmez").

### Hata
- `GlobalExceptionHandler` (`bizboard-api`) tek kaynak; response key `message`. IllegalArgument→400, NotFound→404, Conflict→409, Security→403.

---

## Review-Merge Gate (canlı müşteri = ekstra dikkat)
Coder main'e PUSH ETMEZ. Build-verify (backend `mvn package` + frontend `npm run build` TEMİZ) → Conventional Commit → Lead gatekeeper'a yönlendirir → gate review + push (Sevalla deploy tetiklenir). STRICT olduğu için review titiz: guard/finansal/secret/CHANGELOG/etki-notu eksiksiz. Riskli/geri-dönülemez (canlı veri, migration, finansal davranış) → Lead'e escalate.
