# Wizard Atomic Create — Test Senaryoları

> **Kapsam:** v1.5.7 `POST /businesses` atomic akışı + v1.5.8 wizard frontend.
> Her senaryo curl/postman ile manuel doğrulanabilir veya QA tarafından
> regression suite'e dahil edilebilir. Spring Boot integration test
> infrastructure'ı (spring-boot-starter-test + H2) v2.0 backlog'unda.

## Önkoşul

```bash
TOKEN="<admin-bearer-token>"
BIZBOARD="http://localhost:8080"
BTYPE_ID="<bir-business-type-uuid>"   # GET /business-types ile al
```

---

## S1 — Mutluluk yolu (happy path)

**Beklenti:** business + setup tx[] + monthly fc[] atomic olarak oluşur.

```bash
curl -X POST "$BIZBOARD/businesses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Kafe v1.5.x",
    "business_type_id": "'"$BTYPE_ID"'",
    "business_type_name": "Kafe",
    "modules": ["finance"],
    "setup_costs": [
      { "name": "Depozit", "amount": 50000 },
      { "name": "Tabela", "amount": 8000 }
    ],
    "monthly_fixed_costs": [
      { "category": "RENT",      "amount": 15000, "applicable": true },
      { "category": "PERSONNEL", "amount": 30000, "applicable": true },
      { "category": "VEHICLE",                   "applicable": false }
    ]
  }'
```

**Doğrulama:**

- HTTP 201, response.id mevcut
- `GET /businesses/{id}/transactions?limit=50` → 2 tx, hepsi `is_setup_cost=true`
- `GET /businesses/{id}/fixed-costs` → 2 fc (RENT + PERSONNEL), VEHICLE yok
- `GET /admin/audit-logs?action=BUSINESS_CREATE` → 1 satır, metadata'da:
  - `businessTypeName=Kafe`
  - `wizardSetupTransactions=2`
  - `wizardMonthlyFixedCosts=2`

---

## S2 — Zorunlu alan eksik (validation)

**Beklenti:** 400 Bad Request, hiçbir kayıt oluşmaz.

```bash
# name boş
curl -X POST "$BIZBOARD/businesses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "business_type_id": "'"$BTYPE_ID"'", "setup_costs": [] }'
```

**Doğrulama:**

- HTTP 400
- response body `message` field'ı validation hatasını içerir
- `GET /admin/audit-logs?action=BUSINESS_CREATE&from=<son-1-dk>` → boş

```bash
# business_type_id eksik
curl -X POST "$BIZBOARD/businesses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "X" }'
```

**Beklenti:** 400.

```bash
# setup_costs[].name boş, amount > 0
curl -X POST "$BIZBOARD/businesses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "X", "business_type_id": "'"$BTYPE_ID"'",
        "setup_costs": [{ "name": "", "amount": 100 }] }'
```

**Beklenti:** 400 `WizardSetupCostItem.name` @NotBlank validation.

---

## S3 — "Geçerli değil" toggle davranışı

**Beklenti:** `applicable=false` olan kategoriler hiç oluşmaz, applicable=true olanlar oluşur.

```bash
curl -X POST "$BIZBOARD/businesses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "S3 Mobile Bar",
    "business_type_id": "'"$BTYPE_ID"'",
    "monthly_fixed_costs": [
      { "category": "RENT",        "amount": 12000, "applicable": true  },
      { "category": "VEHICLE",                       "applicable": false },
      { "category": "INSURANCE",   "amount": 2500,  "applicable": true  },
      { "category": "MAINTENANCE", "amount": 0,     "applicable": true  },
      { "category": "TAX",         "amount": 1500,  "applicable": true  }
    ]
  }'
```

**Doğrulama:**

- HTTP 201
- `GET /businesses/{id}/fixed-costs` → **3** kayıt (RENT, INSURANCE, TAX)
  - VEHICLE applicable=false → atlandı
  - MAINTENANCE amount=0 → atlandı (BusinessService: `amount.signum() <= 0` skip)
- audit `wizardMonthlyFixedCosts=3`

---

## S4 — Atomic rollback senaryosu

**Beklenti:** bir kalem oluşmazsa hiçbir kalem oluşmaz (Spring `@Transactional`).

> Mock için: `monthly_fixed_costs` içinde geçersiz category ile zorla. Şu an
> `FixedCostCategory.parse(...)` bilinmeyen değeri `OTHER`'a fallback ediyor —
> rollback tetiklenmiyor. Atomic rollback'i gerçekten tetiklemek için kötü
> niyetli payload gerekir (örn. amount = -1, @PositiveOrZero kırar; veya
> business_type_id geçersiz UUID).

```bash
# business_type_id var ama bulunamayacak (random UUID)
curl -X POST "$BIZBOARD/businesses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "S4 Rollback",
    "business_type_id": "00000000-0000-0000-0000-000000000000",
    "setup_costs": [{ "name": "Birsey", "amount": 100 }]
  }'
```

**Doğrulama:**

- HTTP 400 `Business type not found`
- `SELECT * FROM transactions WHERE description LIKE '%Birsey%'` → boş
- `SELECT * FROM businesses WHERE name='S4 Rollback'` → boş
- Audit log → BUSINESS_CREATE satırı yok

---

## S5 — `business_type_name` autocomplete senaryosu

**Beklenti:** kullanıcıların önceden girdiği distinct adlar + master tip etiketleri.

```bash
# Önce S1 ile "Kafe" adıyla bir işletme oluşturduğunu varsay (S1 senaryosu)

curl "$BIZBOARD/business-types/names" -H "Authorization: Bearer $TOKEN"
# Beklenen response: ["Anonim Sirket", "Restoran", ..., "Kafe", ...]
# Yani master label'lar + "Kafe" gibi user-entered'lar birlikte
```

---

## S6 — 12 kategori endpoint'i

```bash
curl "$BIZBOARD/fixed-cost-categories" -H "Authorization: Bearer $TOKEN"
```

**Beklenti:**

```json
[
  { "key": "RENT",        "label": "Kira / Yer Maliyeti",            "required": true  },
  { "key": "PERSONNEL",   "label": "Personel Maaşı + SGK",           "required": true  },
  { "key": "UTILITY",     "label": "Elektrik / Su / Doğalgaz / İnternet", "required": true },
  { "key": "VEHICLE",     "label": "Araç (Kira / Yakıt / Bakım)",   "required": true  },
  { "key": "SUPPLIES",    "label": "Ofis / İşletme Sarf Malzemesi", "required": true  },
  { "key": "MARKETING",   "label": "Pazarlama / Reklam",            "required": true  },
  { "key": "INSURANCE",   "label": "Sigorta",                       "required": true  },
  { "key": "MAINTENANCE", "label": "Bakım / Onarım",                "required": true  },
  { "key": "SOFTWARE",    "label": "Yazılım / Abonelikler",         "required": true  },
  { "key": "LEGAL",       "label": "Hukuk / Muhasebe / Müşavir",    "required": true  },
  { "key": "TAX",         "label": "Vergi / Stopaj / Harç",         "required": true  },
  { "key": "OTHER",       "label": "Diğer",                          "required": false }
]
```

---

## S7 — Frontend wizard happy path (manuel)

1. `/dashboard/add` → 6 adım step indicator
2. Adım 1: tip seç → `business_type_name` otomatik label ile dolar; serbest düzenlenebilir; autocomplete açılır
3. Adım 2: temel bilgiler; isim < 2 karakter → "Devam" disabled
4. Adım 3: modüller seç; 0 modülde "Devam" disabled
5. Adım 4: "+ Kalem" buton → name/tutar inline; sil; toplam canlı
6. Adım 5: 12 kategori listesi; "Geçerli değil" toggle ile kategori soluk; applicable + amount=0 + zorunlu → "Devam" disabled
7. Adım 6: önizleme; "Atomic Olusturulacak Kalemler" kartı setup + monthly kalemleri ayrı listeler; toplamlarla
8. Submit → backend S1 ile aynı response

---

## S8 — Eski draft regression (v1.6.0 hotfix)

**Beklenti:** v1.5.7 öncesi `localStorage` draft'ı varsa wizard yine de açılır, "Devam" butonu çalışır.

**Reprodüksiyon:**

1. DevTools → Application → Local Storage
2. `bizboard_draft_business` key'ine eski versiyon partial draft yapıştır:
   ```json
   { "name": "Eski Draft", "businessTypeId": "<bir-tip-uuid>", "color": "#4c6ef5" }
   ```
   _(Bu draft `businessTypeName`, `setupCostItems`, `monthlyFixedCostItems` içermez — v1.5.7 öncesi state shape'i)_
3. `/dashboard/add` sayfasını aç (refresh).

**Doğrulama:**

- Step 1 açılır, tip otomatik seçili gelir (draft'tan)
- "Tip Adı" alanı tip etiketiyle dolar (auto-fill useEffect)
- "Devam" butonu **enabled** (bug öncesi disabled kalıyordu — TypeError silently)
- 6 adımı sorunsuz tamamla → atomic create başarılı
- Browser console → hiç `TypeError: Cannot read property 'trim' of undefined` görünmez

**Bug analizi:** v1.5.8 ile FormData'ya yeni alanlar (`businessTypeName`, `setupCostItems`, `monthlyFixedCostItems`) eklendi ama draft load akışı `setForm(parsed)` ile state'i full ezdiği için bu alanlar undefined kalıyordu. `canNext` step 1'de `form.businessTypeName.trim()` sessiz crash → button disabled.

**Fix:** `setForm((prev) => mergeDraft(prev, parsed))` — defaults korunarak partial parsed üzerine bindirilir. Array + string + boolean alanları için tip doğrulaması. Defensive read: `(form.businessTypeName ?? "").trim()` her yerde.

---

## Notlar

- **Test infrastructure:** Bu senaryolar manuel/QA. JUnit + Spring Boot Test entegrasyonu
  v2.0 Flyway baseline'ında daha doğru zaman olur (test profile + Testcontainers).
- **Smoke test'i prod'da yapmadan önce:** test ortamında (Sevalla test app, askıda)
  ya da local docker-compose'da koş.
- **Audit log verifikasyon:** her test senaryosu öncesi ve sonrası
  `GET /admin/audit-logs?from=<önce>` ile diff alınır.
