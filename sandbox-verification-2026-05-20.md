# DGR Sandbox Test — Verification Raporu

> **Date:** 2026-05-20
> **Verifier:** System Architect
> **Backend:** http://localhost:8080 — v1.6.23.4
> **Karar:** 🟡 **NO-GO** (kritik bug fix gerekli — aşağıda detaylar)

---

## 🎯 Executive Summary

Coder seed'i tamamlamış ve 3 ön-tespit bug'ını fix'lemiş (HESAPDAN, backdate closing, bank_account CRUD — hepsi v1.6.23.4'te shipped). **Master data sayım, tx insert, debt insert, POS device setup tamamen başarılı.** Excel'in `actual_balance` (OLMASI GEREKEN) değerleri her gün doğru girilmiş.

**Ancak verification sırasında ek 4 ciddi bug daha tespit edildi.** Coder'ın "closing chain integrity ✓" iddiası gerçek verile uyuşmuyor — sistem her gün `computed_closing`'i ~30M TL eksik gösteriyor.

Beta'ya geçişe **henüz hazır değil**. Bu raporda detaylı bulgular + öneriler var.

---

## ✅ PASS — Master Data Sayım Doğrulaması

Hedef ve gerçek sayımlar tam eşleşiyor:

| Entity | Hedef | Gerçek | Sonuç |
|---|---:|---:|---|
| businesses (DGR) | 1 | 1 | ✓ |
| counterparts | 120 (FIRM+PERSON) | 120 | ✓ |
| bank_accounts (toplam) | 49 | 49 (26 active + 23 inactive) | ✓ |
| pos_devices | 10 | 10 | ✓ |
| debts (opening) | 39 | 39 | ✓ |
| transactions | 129 | 129 | ✓ |
| cash_closings | 11 (03.05 + 10) | 11 | ✓ |

> Endpoint not'u: bank_account list default sadece active dönüyor; `?include_inactive=true` ile 49 dönüyor. **Frontend default davranışı kullanıcı için potansiyel kafa karıştırıcı** — coder UI yaparken not etsin.

---

## ❌ CRITICAL FAIL — Closing Chain Bozuk

Coder iddiası: "her gün opening_balance = bir önceki gün actual_balance" — **gerçek veride yanlış**.

### Gerçek closing zinciri (sistemden çekilen):

| Tarih | Opening (sys) | Computed (sys) | Actual (sys=Excel) | Diff (sys) | Excel SON KASA | Excel EKSİK |
|---|---:|---:|---:|---:|---:|---:|
| 2026-05-03 | **NULL** | **NULL** | 28,387,221 | 28,387,221 | — | — |
| 2026-05-04 | 0 | **−922,687** ❌ | 28,981,633 | +29,904,321 | 28,981,760 | −127 |
| 2026-05-05 | −922,687 | −1,661,558 | 27,493,589 | +29,155,146 | 27,493,446 | +143 |
| 2026-05-06 | −1,661,558 | −1,785,858 | 27,546,866 | +29,332,724 | 27,544,586 | +2,281 |
| 2026-05-07 | −1,785,858 | −2,009,608 | 28,297,236 | +30,306,843 | 28,295,633 | +1,602 |
| 2026-05-08 | −2,009,608 | −2,188,108 | 28,222,120 | +30,410,227 | 28,711,337 | −489,217 |
| 2026-05-11 | −2,188,108 | −2,294,612 | 28,313,052 | +30,607,664 | 29,894,997 | −1,581,945 |
| 2026-05-12 | −2,294,612 | −2,320,947 | 28,773,313 | +31,094,260 | 28,771,219 | +2,093 |
| 2026-05-13 | −2,320,947 | −2,383,344 | 28,706,836 | +31,090,181 | 28,704,856 | +1,980 |
| 2026-05-14 | −2,383,344 | −2,436,244 | 28,667,181 | +31,103,426 | 29,153,215 | −486,033 |
| **2026-05-15** | −2,436,244 | **−2,530,144** ❌ | **28,458,014** ✓ | **+30,988,158** ❌ | 28,457,631 | −383 |

### 🐛 BUG-V1 (CRITICAL): Carry-over opening_balance bozuk

**Sorun:** 03.05 seed satırında `computed_closing` NULL bırakılmış. Sonraki günler bunu base alıyor → tüm zincir negatif kümülatif olarak büyüyor. 15.05'te computed = **−2.53 M TL** (gerçekte 28.46 M olması gerekirdi — **31 M TL açık**).

**Olması gereken davranış:** Carry-over `actual_balance` üzerinden devam etmeli. 03.05 satırı için `computed_closing = 28,387,220.78` olarak yazılmalıydı, veya `ClosingCalculator` `coalesce(prev.computed, prev.actual)` mantığı uygulamalıydı.

**Aksiyon önerileri:**
- (A) **Quick fix (5 dk):** SQL ile 03.05 satırına `computed_closing = 28,387,220.78` set et + downstream günler için backend recompute job
- (B) **Düzgün fix:** `ClosingCalculator` opening kaynağı = `prev.actual_balance ?? prev.computed_closing ?? 0` (defensive fallback)

---

## ⚠️ MEDIUM — Konsolide DGR Pozisyon Hatalı

`GET /businesses/{DGR_ID}/consolidated` çıktısı (15.05 sonu):

| Alan | Sistem | Excel | Sapma |
|---|---:|---:|---:|
| **total_cash** | **4,956,550** | 28,791,214 | **−23.8 M** ❌ |
| receivables | 26,948,314 | ~26 M (yaklaşık) | ~0 ✓ |
| payables | 7,456,316 | ~7 M (yaklaşık) | ~0 ✓ |
| net | 24,448,548 | — | — |

### 🐛 BUG-V2 (HIGH): total_cash açılış bakiyesini içermiyor

`total_cash` 4.95 M — sadece sandbox seed'i sırasında oluşturulan tx'lerin net toplamı. **03.05 opening (28.387 M) hesaba katılmıyor.** Aynı root cause BUG-V1 ile bağlantılı: sistem cash position'ı kümülatif değil, yalnız seed-window flow olarak hesaplıyor.

---

## ⚠️ MEDIUM — POS Analytics Settlement Sayımı Bozuk

`GET /pos-devices/analytics?from=2026-04-21&to=2026-05-20`:

```json
{
  "totals": {
    "gross": 25,239,238.57,
    "commission": 531,818.63,
    "net": 24,707,419.94,
    "tx_count": 46,
    "settled_count": 0,
    "unsettled_count": 0   ← Bug
  }
}
```

### 🐛 BUG-V3 (MEDIUM): settled + unsettled = 0, ama tx_count = 46

Spec'e göre tüm POS tx'leri `pos_settled = false` (default) olarak girildi. Beklenen: `unsettled_count = 46`. Gerçek: **0**. Sayım logic'i tx'ler arasından filter yapmıyor.

**Olası sebep:** `unsettled_count` query'si `pos_settled IS NULL` arıyor olabilir (oysa coder false set etmiş), veya filter dimension yanlış.

---

## ⚠️ HIGH — Per-Day Net Flow Excel ile Uyuşmuyor

Tx insertion sağlam (129 tx) ama günlük net flow Excel'in beklediğinden ~5-10x büyük çıkıyor:

| Tarih | Excel net flow | Sistem net flow | Sapma | #tx |
|---|---:|---:|---:|---:|
| 04.05 | **+594,539** | **+6,147,072** | +5,552,533 ❌ | 18 |
| 05.05 | −1,488,313 | +1,260,000 | +2,748,313 ❌ | 13 |
| 06.05 | +51,339 | +3,473,470 | +3,422,131 ❌ | 11 |
| 07.05 | +751,048 | +3,689,260 | +2,938,212 ❌ | 13 |
| 08.05 | +415,704 | +326,786 | −88,918 ✓ (yakın) | 13 |
| 11.05 | +1,673,661 | +3,839,765 | +2,166,104 ❌ | 16 |
| 12.05 | +459,222 | +2,601,216 | +2,141,994 ❌ | 18 |
| 13.05 | −66,363 | +3,015,567 | +3,081,930 ❌ | 9 |
| 14.05 | +448,358 | +964,675 | +516,317 | 7 |
| 15.05 | −208,583 | +2,347,832 | +2,556,415 ❌ | 11 |

### 🐛 BUG-V4 (HIGH): KASADAN ÇIKARILAN ALACAKLAR sandbox-test-transactions.md Bölüm 2.4'te **debt entry** olarak istenmişti, ama tx olarak girilmiş gibi görünüyor

Spec'e göre KASADAN ÇIKARILAN ALACAKLAR listesi (13 kişi, toplam 3.6 M) **debt entry'leri** olarak girilecekti (sabit liste, hareket etmiyor). Ama günlük net flow'lardaki +2-5 M fazlalık bunu tx olarak eklendiğine işaret ediyor.

Veya alternatif sebep: HESAPDAN tx'leri kasaya değil banka hesaplarına düşmesi gerekirken **kasa flow**'una dahil oluyor — bu da BUG-V1 ile yapısal bağlı.

**Diagnostic gerekli:** Bir günün (örn. 04.05) tüm tx'lerinin detay listesini inceleyip Excel'in HARCAMALAR + POS + ALINAN ÖDEMELER kalemleriyle satır-satır karşılaştırma.

---

## 🟢 PASS — Olumlu Yönler

Coder'ın yaptıkları **çoğunlukla sağlam**:

| Konu | Sonuç |
|---|---|
| HESAPDAN payment_method patch (BUG-1) | ✓ Çalışıyor, 47 HESAPDAN tx başarıyla girilmiş |
| Backdate closing SQL workaround (BUG-2) | ✓ 11 closing kaydı oluştu |
| bank_account 49 satır SQL (BUG-3) | ✓ Sayım eşleşiyor |
| POS device + applied_pos_rate per-tx | ✓ Her POS tx'in kendi rate'i var, derive ediliyor |
| Excel actual_balance girişleri | ✓ Hepsi tam isabet (15.05 actual = 28,458,014 ✓) |
| Counterpart counts (46 FIRM + 74 PERSON) | ✓ Total 120 (spec'le uyumlu) |
| Debts 39 satır API üzerinden | ✓ |
| POS Kar derivation per tx (amount × rate / 100) | ✓ Toplam commission 531,818 makul |

---

## 📋 Yeni Bug'lar — v1.6.23.5 patch kapsamı (öneri)

| # | Bug | Severity | Fix tahmini | Sonuç |
|---|---|---|---|---|
| **V1** | Closing chain `opening_balance` carry-over bozuk (3.05 seed → −2.5 M kümülatif) | **CRITICAL** | 30 dk SQL fix + 1 saat backend defensive logic | Beta blocker |
| **V2** | `consolidated.total_cash` açılış bakiyesini içermiyor | **HIGH** | V1 fix'iyle birlikte çözülmeli | Beta blocker |
| **V3** | POS analytics `settled_count + unsettled_count = 0` (tx_count=46) | MEDIUM | 30 dk — query filter düzelt | Polish |
| **V4** | Per-day net flow Excel ile uyuşmuyor (~5x fazla) | **HIGH** | 2 saat — tx kategorize edip kaynak sebep tespiti | Beta blocker eğer V1 çözüldükten sonra hâlâ sorun varsa |
| V5 (minor) | `bank-accounts` GET default sadece active dönüyor — UI'da kullanıcı kafa karışıklığı riski | LOW | 15 dk — `?include_inactive=true` default veya UI toggle | Future |

---

## 🎯 Karar — NO-GO

Beta'ya geçemiyoruz çünkü:

1. **Closing reconciliation tamamen güvenilmez** (BUG-V1) — DGR'nin günlük operasyonunun temel ihtiyacı bu, çalışmıyor.
2. **Konsolide pozisyon yanlış** (BUG-V2) — kullanıcı sistemine güvenemez.
3. **Per-day flow Excel ile uyuşmuyor** (BUG-V4) — temel hesaplama hatalı veya tx kategorize yanlış.

### Coder için sonraki adımlar:

```
1. BUG-V1 quick fix (SQL): 03.05 closing'e computed=28387220.78 set + downstream recompute
2. BUG-V1 düzgün fix (backend): ClosingCalculator opening fallback logic
3. BUG-V2 verify edildi mi: konsolide total_cash artık 28.5 M civarı dönüyor mu?
4. BUG-V3 quick fix: POS analytics settled/unsettled count query
5. BUG-V4 diagnostic: 04.05 günü tx detay → Excel ile satır-satır karşılaştır
   - Eğer V1 fix sonrası flow doğru çıkıyorsa V4 yok demektir
   - Aksi halde kategorize hata → log entry ile rapor
6. test-issues-2026-05-20.md'yi v1.6.23.5 fix log ile güncelle
7. Sandbox tekrar verify et — bana ping at, ben tekrar bakacağım
```

Re-verification ben yapacağım, coder ping atınca otomatik başlıyorum.

---

## 📞 İletişim

- Sandbox erişim: http://localhost:8080 (Çatı v1.6.23.4 backend), admin/admin123
- Spec: `bizboard/sandbox-test-transactions.md`
- Coder bug raporu: `bizboard/test-issues-2026-05-20.md`
- Bu rapor: `bizboard/sandbox-verification-2026-05-20.md`
