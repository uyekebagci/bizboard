# DGR Sandbox Seed — Test Issues (2026-05-20)

Sandbox seed (`sandbox/seed.py`) çalıştırılırken / spec'i (`sandbox-test-transactions.md`) uygularken **3 bug tespit edildi**. v1.6 ACİL PROD kapsamında olması gereken ama atlanmış API yetenekleri.

> **🟢 STATUS (2026-05-20 14:00):** 3 bug'ın da fix'i **v1.6.23.4** sürümünde tamamlandı + verify edildi (10/10 edge case test geçti, sandbox baştan SQL fallback kullanmadan API'den seed edildi). Detay aşağıda her bug için yer alıyor.

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
