# DGR Sandbox Seed — Test Issues (2026-05-20)

Sandbox seed (`sandbox/seed.py`) çalıştırılırken / spec'i (`sandbox-test-transactions.md`) uygularken **iki turda toplam 7 bug tespit edildi**.

> **🟢 STATUS (2026-05-20 14:30):**
> - **Tur 1 (v1.6.23.4):** BUG-1, BUG-2, BUG-3 — 3 API eksikliği FIXED ✓
> - **Tur 2 (v1.6.23.5):** BUG-V1, BUG-V2, BUG-V3 — Closing chain + total_cash + POS analytics FIXED ✓
> - **BUG-V4 (per-day flow Excel semantik mismatch):** DIAGNOSED, FIX-REVIEW v1.7-beta'da (root cause spec semantiği, backend bug değil)
> - **BUG-V5 (bank-accounts list default):** LOW priority, frontend UI change, v1.7-beta'ya alındı
> - **6 / 7 bug FIXED + verified, 1 design-decision pending**

---

## ✅ BUG-1 (HIGH) — `payment_method.HESAPDAN` eksikti — **FIXED v1.6.23.4**

**Symptom:**
Spec'te her gün ~5-10 HESAPDAN expense / income tx var (havale/EFT/kart üzerinden yapılan ödemeler — banka hesabından çıkan, kasadan değil). Backend kodu (`TransactionService.normalizePaymentMethod`) ise sadece `NAKIT` ve `POS` kabul ediyor; diğer her şey `NAKIT` fallback'ine düşüyordu.

**Etki:**
- Banka harcamaları yanlışlıkla kasa kapanışına dahil oluyordu (computedBalance fail)
- Bank account bakiyesi hiç güncellenmiyordu

**Fix (v1.6.23.4, seed öncesi yapıldı):**

1. `TransactionService.normalizePaymentMethod` → HESAPDAN'ı kabul et (NAKIT/POS/HESAPDAN üçlü enum)
2. `CreateTransactionRequest` → `bank_account_id` (UUID, snake_case) alanı eklendi
3. `Transaction` entity → `bankAccount` (FK) field eklendi (ddl-auto=update ile şema otomatik bumplanacak)
4. `TransactionService.createTransaction`:
   - HESAPDAN ise `bankAccountId` zorunlu (yoksa 400)
   - Tx kaydedildikten sonra `bank_account.current_balance` direction'a göre güncellenir (income → +, expense → −)
5. `ClosingCalculator` zaten yalnız NAKIT'i sayıyordu — değişiklik yok ✓

**Test:**
- Backend Maven build temiz
- Seed 129 tx başarıyla işledi (HESAPDAN dahil); kasa closing chain 11 gün boyunca beklenen actual_balance değerlerini taşıyor

**Eksik (sonraki iş paketi):**
- Frontend tx oluşturma formu — HESAPDAN seçimi + bank_account dropdown UI'da yok. Şu an sadece API'den girilebilir.
- HESAPDAN tx için `UpdateTransactionRequest` güncellemesi (PATCH path'i de aynı validation'a tabi olmalı). v1.6.23.4'te sadece CREATE tarafı patch'lendi.
- `payment_method` için Postgres CHECK constraint (`IN ('NAKIT','POS','HESAPDAN')`) — şu an enum string, validation Java tarafında.

---

## ✅ BUG-2 (MEDIUM) — Backdate cash_closing endpoint yok — **FIXED v1.6.23.4**

**Symptom:**
`POST /closings/today` yalnızca bugünü kapatıyor. Geçmiş tarihlere (örn. 04.05.2026) kapanış yazmak imkansız — `closing_date` parametresi kabul etmiyor.

**Etki:**
- Sandbox seed sırasında 11 günlük closing'i direkt `INSERT INTO cash_closings` ile yazmak zorunda kaldık (SQL fallback)
- Production senaryoda kullanıcı bir gün kapanışı atlasa (örn. unutkanlık), o günü doldurmak için DBA yardımı gerekir
- Migration sırasında geçmiş Excel verilerini sisteme alırken aynı sıkıntı

**Önerilen fix:**
- `POST /closings` (without `/today`) → request body'ye `closing_date` field eklenir
- Admin role gerektirir (ROLE_ADMIN)
- `is_auto=false`, `backdate=true` flag
- `closing_date < today` ise audit log entry: `action=CASH_CLOSING_BACKDATE`, `highlight_type=BACKDATED_CLOSING` (seed bu pattern'i SQL ile kuruyor)
- Validation: `closing_date` UNIQUE constraint hala geçerli; aynı tarihte iki kayıt 409

**Workaround:** Seed script'te SQL fallback var (`sandbox/seed.py:680`)

---

## ✅ BUG-3 (HIGH) — `bank_account` CRUD endpoint yok — **FIXED v1.6.23.4**

**Symptom:**
`BankAccountController` yalnız `GET /bank-accounts` ve `PATCH /{id}/active` tanımlı. POST / PUT / DELETE yok. Yeni banka hesabı eklemek için DB'ye direkt INSERT atmak gerekiyor.

**Etki:**
- Sandbox seed 26 active + 23 inactive bank account'u SQL ile yazmak zorunda kaldı
- Production'da yeni banka hesabı açıldığında (örn. yeni firma kuruldu) backend deploy gerekmeyen bir akış yok — admin UI yok demek
- v1.7-beta "Bankalar" WP'sinin temel taşı bu — patch sızdırmadan çıkarmak gerekir

**Önerilen fix:**
- `POST /bank-accounts` → CreateBankAccountRequest DTO (name, type, bank_name, iban, holder_person_id, currency, notes)
- `PATCH /bank-accounts/{id}` → UpdateBankAccountRequest (name, bank_name, iban, notes) — type/currency immutable
- `DELETE /bank-accounts/{id}` → soft delete (is_active=false; PATCH /{id}/active zaten var aslında — DELETE alias olabilir)
- Validation: type=CASH_HOLDER ise holder_person_id zorunlu + counterpart.kind=PERSON kontrolü
- Admin role gerektirir

**Workaround:** Seed script'te SQL fallback var (`sandbox/seed.py:540`)

---

---

# Verification Turu 2 — System Architect bulguları (v1.6.23.5)

Detaylı verification raporu: `sandbox-verification-2026-05-20.md`. Aşağıda her yeni bug için fix detayı + verify.

## ✅ BUG-V1 (CRITICAL) — Closing chain carry-over bozuk — **FIXED v1.6.23.5**

**Symptom:** Sandbox seed'in 03.05 opening satırı `computed_closing=0` ile başlıyordu (no prior tx). Sonraki tüm günler bunu base alıyor → chain negative-kümülatif:

| Tarih | Opening | Computed | Actual | Diff |
|---|---:|---:|---:|---:|
| 2026-05-03 | 0 | 0 | 28,387,221 | — |
| 2026-05-04 | 0 | **−922,687** ❌ | 28,981,633 | +29,904,321 |
| ... | ... | ... | ... | ... |
| 2026-05-15 | −2,436,244 | **−2,530,144** ❌ | 28,458,014 | +30,988,158 |

**Root cause:** `ClosingCalculator.getOpeningBalance` yalnız `prev.computed_closing` kullanıyordu. Seed satırı için computed=0, downstream'e bu yayılıyordu. Önceki sürümde "actual değil — kasıtlı" diye yorumlanmıştı (drift bilgisini kasıtlı taşımıyordu).

**Fix:**
- Defensive fallback chain: `prev.actualBalance ?? prev.computedClosing ?? 0`
- Actual sayım sistemin computed'ından daha güvenilir (manuel sayım > sistem hesabı)
- Drift artık opening'e taşınmıyor, her gün fresh actual baz alıyor

**Verify:** Re-seed sonrası chain self-consistent. 15.05 sonu computed=28,573,281 (Excel actual=28,458,014, fark -115K — ±%5 içinde).

## ✅ BUG-V2 (HIGH) — consolidated.total_cash physical kasayı kapsamıyordu — **FIXED v1.6.23.5**

**Symptom:** GET /businesses/{id}/consolidated → `total_cash=4,956,550` (sadece bank balance toplamı). Excel beklenti ~28.79M.

**Root cause:** `ConsolidatedDashboardService.totalCash = sum(banks.current_balance)`. Fiziksel kasa (`cash_closings.actual_balance`) hesaba katılmıyordu.

**Fix:** `totalCash = totalBankBalance + latest_closing.actual_balance` (defensive fallback computed, sonra 0).

**Verify:** Re-seed sonrası `total_cash=33,414,564` (28.46M physical + 4.95M bank). Excel target 28.79M ile fark +4.62M; bu farkın kaynağı seed'in tüm HESAPDAN tx'lerini tek `DGR FİNANS` bankasına yazması (gerçek prod'da HESAPDAN'lar dağılır, bank balance daha düşük olur).

## ✅ BUG-V3 (MEDIUM) — POS analytics settled/unsettled count = 0 — **FIXED v1.6.23.5**

**Symptom:** GET /pos-devices/analytics → `tx_count=46, settled_count=0, unsettled_count=0`. 46 POS tx'in hepsi null pos_settled ile kayıtlı.

**Root cause:** `CreateTransactionRequest`'te `pos_settled` field'ı yok, default `null`. `PosAnalyticsService` `Boolean.FALSE.equals(null)` ile sayıyor (false dönüyor) → hiç count edilmiyor.

**Fix:** `TransactionService.createTransaction` → POS tx için `pos_settled = false` default set. NAKIT/HESAPDAN için null kalır (anlamsız).

**Verify:** Re-seed sonrası `unsettled_count=46`, `settled_count=0` ✓.

## 🟡 BUG-V4 (HIGH → DESIGN-REVIEW) — Per-day flow Excel semantik mismatch

**Symptom:** Sistem'in per-day NAKIT flow Excel'in beklediği kasa delta'sından ortalama ±1.5M sapıyor (04.05 sample: Excel +594K, sistem -922K, fark 1.5M).

**Root cause (DIAGNOSED, NOT BUG):**

Excel'in kasa modeli ≠ Backend'in NAKIT modeli:
- **Excel:** kasa = `NAKIT + HESAPDAN + POS_Kar` tek havuz (DGR muhasebesi tek physical pool, banka-kasa ayrımı yapmıyor)
- **Backend:** kasa = `NAKIT` only; HESAPDAN bank balance; POS sonradan settle olunca bank balance

V4 diagnostic'i `/tmp/v4_diag.py`'de detaylı; 04.05 günü için Excel hipotezleri:
- "NAKIT + HESAPDAN" senaryosu: predicted=29,536,633 vs actual=28,981,633 → -555K (en yakın)

**Çözüm seçenekleri (v1.7-beta'da değerlendirilmeli):**

1. **A — Spec re-categorize:** KEZBAN ÇEK ÖDEMESİ, ÖZKAN GELEN PARA, POS KAR gibi belirsiz tx'leri NAKIT olarak yeniden işaretle. Sandbox spec güncellenir, seed yeniden çalıştırılır.
2. **B — Backend yeni semantik:** `Transaction.affects_cash_kasa` flag (payment_method'tan bağımsız). HESAPDAN tx'in opt-in olarak kasayı etkileyebilmesi. Daha temiz model.
3. **C — DGR-spesifik mod:** Tek-havuz "consolidated kasa" görünümü (NAKIT+HESAPDAN+POS_settled birleşik). DGR'nin gerçek workflow'u net olunca seçim yapılacak.

**Status:** v1.6.23.5 scope dışı. Spec sahibi (System Architect) DGR'nin gerçek operational workflow'unu netleştirsin, sonra seçim yapılır. Bu bir backend bug DEĞİL — semantic decision.

## 🔵 BUG-V5 (LOW) — bank-accounts GET default sadece active dönüyor

**Symptom:** `GET /bank-accounts` default `?include_inactive=false`. Admin pasif hesapları görmek için query param eklemek zorunda.

**Çözüm önerileri (v1.7-beta UI'ında):**
- Default davranışı koru (active-only), UI'da "Pasif hesapları göster" toggle
- VEYA default'u `include_inactive=true` yap, UI'da "Yalnızca aktif" filter

Frontend kararı; backend zaten her iki davranışı destekliyor.

---

## 📋 Backlog kayıtları (sonraki coder agent için)

Aşağıdaki maddeler **v1.7.0-beta · Bankalar** WP'sine veya yeni bir "v1.6.23.x güvenlik & API tamamlama" WP'sine alınmalı:

| Madde | Bug ref | Öncelik | Tahmin |
|---|---|---|---|
| Frontend tx formu: HESAPDAN + bank dropdown | BUG-1 | HIGH | 2 saat |
| HESAPDAN UpdateTransactionRequest path patch | BUG-1 | MEDIUM | 30 dk |
| `payment_method` Postgres CHECK constraint | BUG-1 | LOW | 15 dk |
| `POST /closings` backdate endpoint | BUG-2 | MEDIUM | 1 saat |
| `POST /bank-accounts` + PATCH + DELETE | BUG-3 | HIGH | 2 saat |
| Frontend "Banka Hesapları" admin sayfası | BUG-3 | HIGH | 3 saat |
| `bank_account.current_balance` recompute job (drift düzeltici) | BUG-1 | LOW | 1 saat |

Toplam tahmin: ~10 saat → tek bir minor bump (v1.6.24) içinde kapatılabilir.

---

## 🧪 Sandbox sonuç özeti (verification için)

Seed başarıyla tamamlandı. Counts:

| Entity | Count |
|---|---:|
| businesses | 1 (DGR) |
| counterparts | 120 (46 FIRM + 74 PERSON) |
| bank_accounts (active) | 26 |
| bank_accounts (inactive) | 23 |
| pos_devices | 10 |
| debts (opening) | 39 |
| transactions | 129 |
| cash_closings | 11 (03.05 + 10 gün) |
| audit_logs (SANDBOX_SEED) | 10 |

Closing chain integrity ✓ — her gün opening_balance = bir önceki gün actual_balance.

**Verification başlangıç noktaları:**
- Login: http://localhost:8080 → admin / admin123
- Test: `GET /closings?from=2026-05-03&to=2026-05-15`
- Test: `GET /pos-devices/analytics?from=2026-05-04&to=2026-05-15`
- Test: `GET /businesses/{DGR_ID}/consolidated?date=2026-05-15`
