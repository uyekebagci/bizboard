# Çatı / BizBoard Konvansiyonlar

> **Hedef kitle:** Coder agent, yeni geliştirici, code review.
> **Doğal kanun:** Çatı'da finansal her şey **DGR perspektifinden** yazılır.

---

## 1. Debt direction — ALACAK / VERECEK işaret konvansiyonu

DGR (operating business) perspektifi:

| Tip | İşaret | Anlam | Backend enum |
|---|:-:|---|---|
| **ALACAK** | **+** | DGR'ye gelecek para (someone owes us) | `RECEIVABLE` |
| **VERECEK** / **BORÇ** | **−** | DGR'den gidecek para (we owe someone) | `PAYABLE` |

### Sık yapılan hata

Excel/eski sistem kullanıcıları "alacak/verecek" kavramlarını karşı tarafın perspektifinden kullanma alışkanlığındadır:

> ❌ "Tuncay ablamızdan 10.000 TL **borç** aldık" — bu DGR'nin **alacağıdır** (RECEIVABLE)
>
> ✅ "Tuncay abi DGR'ye 10.000 TL **borçludur**" — bu DGR'nin alacağıdır (RECEIVABLE)

UI'da hata önlemek için debt form'da hover tooltip var (`DebtModule.tsx#DebtFormModal`).

### Net pozisyon formülü

```
net_position = total_cash + total_bank_balance + receivables − payables
```

`receivables` ve `payables` her zaman **pozitif magnitude** olarak (mutlak değer) hesaplanır. Sign convention frontend display layer'ında uygulanır.

---

## 2. API response convention

**Tüm finansal magnitude'lar API'de POZİTİF döner.** Sign kararı frontend'in işi.

Etkilenen endpoint'ler:

- `GET /businesses/{id}/consolidated`
  - `consolidated.receivables` → pozitif magnitude
  - `consolidated.payables` → pozitif magnitude (DİSPLAY: negatif göster)
  - `consolidated.total_cash` → pozitif (kasa + CASH_HOLDER)
  - `consolidated.total_bank_balance` → pozitif (CHECKING+SAVINGS)
  - `consolidated.net` → işaretli (toplam pozisyon, negatif olabilir)
  - `net_position.receivables/payables` → magnitude

- `GET /debts`, `GET /receivables`
  - `amount` her zaman pozitif (DB seviyesinde de)
  - `direction` enum field sign'ı belirler

- `GET /businesses/{id}/summary`
  - `total_receivable`, `total_payable` → magnitude
  - `net_balance` → işaretli (RECEIVABLE − PAYABLE)

### Swagger / dokümantasyon notu

Yeni endpoint eklerken response field açıklamasında:

> "Magnitude only — always positive. Sign comes from `direction` enum."

---

## 3. Payment method convention

Transaction `payment_method` enum: `NAKIT` / `POS` / `HESAPDAN`.

| Method | Etki | Closing kasa hesabına dahil mi? |
|---|---|:-:|
| **NAKIT** | Fiziksel kasaya/kasadan | ✓ |
| **POS** | Kart çekimi — gün içi tahsilat kasaya yansır (sonradan banka settle) | ✓ (Beta v1.1'den itibaren) |
| **HESAPDAN** | Banka havalesi/EFT — seçili `bank_account` güncellenir | ✗ |

`ClosingCalculator.sumCashFlowForDate` NAKIT + POS tx'lerini kasaya yansıtır; **HESAPDAN ve TRANSFER hariç**. POS ayrıca POS analytics ve bank account balance widget'larında da görünür.

> **Not (Beta v1.1, 2026-06-08):** POS önceden kasaya dahil DEĞİLDİ (yalnız NAKIT). Beta v1.1'de bilinçli olarak kasaya dahil edildi (commit `905bfd9` "HESAPLANAN formülü POS dahil", `7ebd466` "Bugünün Kasa GELEN POS dahil"). Bu doküman koda göre güncellendi (FINDINGS M-1 kararı).

---

## 4. Frontend display convention

### Sign visualization

- **Alacaklar widget:** `+X TL` yeşil/amber renk (DGR'ye gelecek)
- **Verecekler widget:** `−X TL` kırmızı renk (DGR'den gidecek)
- **Net widget:** işaretli; pozitifse "Net Alacaklı" yeşil, negatifse "Net Borçlu" kırmızı
- **Cash outflow tx'ler:** `−X TL` kırmızı

### Code pattern

```typescript
// Component'ler genelde:
<Stat label="Verecekler" value={-d.payables} tone="negative" />
// Backend +X dönüyor, frontend negate edip negative tone'la gösteriyor.

// Inline display'lerde:
<p>−{formatCurrency(p.amount, "TRY")}</p>
// veya formatCurrency(-amount, ...) işaret otomatik gelir.
```

`formatCurrency` `toLocaleString("tr-TR", { style: "currency" })` kullanır — negatif değer için tireli format döner.

---

## 5. Currency convention

- Default `TRY`. Tüm DTO'larda nullable; null → "TRY" fallback.
- Multi-currency desteği v1.8.0-beta scope; şu an tek-tenant DGR senaryosu TRY.

---

## 6. Versioning (referans — yeniden burada)

- `MAJOR.MINOR.PATCH` — Semantic Versioning
- Hotfix'ler 4-component: `1.6.23.X` (Maven), `1.6.23-X` (npm pre-release)
- Beta versiyonları: `v1.7.0-beta`, `v1.8.0-beta` (suffix ile)

---

## 7. Cash closing convention

- `cash_closings.opening_balance` = bir önceki günün `actual_balance`'ı (v1.6.23.5'ten itibaren). Önceden `computed_closing` kullanılıyordu — drift opening'e taşınıyordu.
- `computed_closing` = opening + (NAKIT + POS) net flow (HESAPDAN/TRANSFER hariç) — Beta v1.1'den itibaren POS dahil
- `actual_balance` = kullanıcı physical sayım
- `difference` = actual − computed (pozitif: fazla; negatif: eksik)

Backdate: `POST /closings` (`closing_date` body'de). Admin-only.

---

## Sürüm

- v1.6.23.8 (2026-05-20): bu dokümanın ilk hali — DGR perspective hotfix WP `3cdf2a4f`.
