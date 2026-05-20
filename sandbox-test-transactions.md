# DGR Sandbox Test — Gün-Bazlı İşlem Listesi (Excel'den çıkarıldı)
_System Architect tarafından MAYIS HESAP.xlsx'ten çıkarıldı · 2026-05-20_

## 🎯 Hedef ve Yöntem

Coder Excel'i okumayacak. Aşağıdaki listeye göre **normal API/UI üzerinden** master data + günlük işlemleri girer. Verification System Architect tarafından yapılacak. Başarı kriteri: 15.05.2026 sonu kasa pozisyonu Excel ile makul yakınlıkta + tüm 10 günün close-of-day kaydı oluşmuş.

**ÖNEMLİ — Excel typo:** Excel'de 6 Mayıs sayfasının adı yanlışlıkla `06.06.2026` yazılmış. **Gerçek tarih 06.05.2026** olarak kullanılacak.

**Eksik günler:** 09.05 ve 10.05 hafta sonu (sheet yok). Bu günlerde hareket olmamış kabul edilecek; sistem otomatik 0-tx closing yapar veya atlanır.

## 📊 Günlük Hedef Bakiyeler (Verification için)

| Tarih | ÖNCEKİ GÜN KASA (Excel) | SON KASA (Excel'in hesabı) | OLMASI GEREKEN (manuel sayım) | EKSİK OLAN (fark) |
|---|---:|---:|---:|---:|
| **04.05.2026** | 28,387,220.78 | 28,981,759.89 | 28,981,633.28 | -126.61 |
| **05.05.2026** | 28,981,759.00 | 27,493,446.44 | 27,493,589.00 | 142.56 |
| **06.05.2026** | 27,493,246.44 | 27,544,585.54 | 27,546,866.44 | 2,280.90 |
| **07.05.2026** | 27,544,585.54 | 28,295,633.32 | 28,297,235.54 | 1,602.22 |
| **08.05.2026** | 28,295,633.32 | 28,711,336.94 | 28,222,119.61 | -489,217.33 |
| **11.05.2026** | 28,221,336.94 | 29,894,997.10 | 28,313,051.94 | -1,581,945.16 |
| **12.05.2026** | 28,311,997.00 | 28,771,219.30 | 28,773,312.50 | 2,093.20 |
| **13.05.2026** | 28,771,219.00 | 28,704,856.43 | 28,706,836.28 | 1,979.85 |
| **14.05.2026** | 28,704,856.43 | 29,153,214.86 | 28,667,181.43 | -486,033.43 |
| **15.05.2026** | 28,666,214.00 | 28,457,630.68 | 28,458,014.00 | 383.32 |

## 📋 1. Master Data (önce bunlar girilecek)

### 1.1 DGR İşletmesi
- **POST /api/businesses**: `{name: 'DGR', isActive: true}` → tek satır
- **system_setting**: `tenant.single_business_id = <DGR.id>` (admin endpoint veya manuel SQL)

### 1.2 Firmalar (counterpart, role=FIRM) — sadece name field

Excel'de kullanılan firma adları (toplam ~25):

```
  Bİ DÜNYA HIR
  Bİ DÜNYA ELEKTRİK
  Bİ DÜNYA İŞ MAK
  DİŞLİOĞLU
  ATEŞ
  RÜZGAR AĞIR VASITA
  ANKARA RÜZGAR
  KÖMÜROĞLU06
  UZMAN GRUP
  KIZILAY
  ÖZKAN
  YCA
  DAF
  YEP
  STAR
  KALBURCUOĞLU
  AYAZ GRUP
  ERCAN
  HARMAK
  NEW MAKSAN
  ALTAY
  CK
  YANAR GRUP
  AYTEPE
  CARBİTE
  ROYAL
  NEHİR
  GÜLERYÜZ
  ALAÇATI
  SARAYLI
  TEKNİK İŞ
  GÜVEN 06
  LİDER GRUP NAKLİYE
  MİMSAN
  MRG KARGO
  DENEYİM MASCHINENBAU
  ÇİMENTO (özel takip)
  İZOTAŞ BİMS
  BEST E YAPI
  METAŞ
  ENS TEKNİK
  YEP KİRA
  TANGÜN KİRA
  UZMAN KİRA
  DGR KİRA
  KUMTAŞ KİRA
```

### 1.3 Kişiler (counterpart, role=PERSON) — sadece name field

```
  TUNCAY ABİ
  KÜRŞAD KOÇ
  RIDVAN
  METEHAN
  SADULLAH
  KANKA UFUK
  MUSTAFA AKAY
  ALİ ARI
  KEZBAN KILIÇ
  AMBAR
  TAHA POS
  ADEM ABİ
  UĞUR ÇİFTLİK
  DOĞANAY
  SAKALLI
  MEHMET BAŞOĞLU
  TUNCAY ABİ ALACAK
  YCA MEH
  MUHASEBE EMRAH
  HASAN HÜSEYİN BULUT
  HASAN HÜSEYİN BAĞDATLI
  SERVET KAPLI
  GÖKHAN (Eldeki)
  GÖKHAN VOLKAN
  CİĞERCİ
  BOKSÖR HAKAN
  İSO
  FİKO
  TAHA
  ENGİN TUĞLU
  ENSAR YILDIZ
  NİHAT MEYDAN
  BARAN KANKA ARKADAŞ
  TUNAHAN ÇİFTÇİ
  KIZILAY FATİH
  NEVŞEHİR SERDAR
  SİNAN DAŞTAN
  YCA 61
  SİTELER (çalışanlar)
  MEHMET ALİ BAĞDATLI
  ERCAN İŞLEMLER
  NURAY SEYHAN
  SEMA NUR ARIKAN
  MESUT ERDEM
  ARZU KORKMAZ
  RECEP ÇOPUR
  OSMAN HAFTALIK
  ÇİFTLİK GİDER (kişi/grup)
  KOR KORAY
  FERHAN AYDIN
  KIRAÇ SMART
  TABELA PURSAKLAR
  ANTEP YOL
  KÜRŞAD YOL
  FATİH AKMAN
  DAMGA VERGİSİ (devlet)
  FATURA (genel)
  KANKA GİDER (genel)
  OĞUZ MONTAJ
```

### 1.4 Banka Hesapları + Kasalar

**Aktif kullanılanlar (is_active=true):**

| Hesap adı | Type | Banka/Not |
|---|---|---|
| DGR FİNANS | CHECKING | DGR FİNANS |
| Bİ DÜNYA HIR.GARANTİ | CHECKING | Garanti BBVA |
| STAR HALKBANKASI | CHECKING | Halkbank |
| DİŞLİOĞLU YAPIKREDİ | CHECKING | Yapı Kredi |
| KALBURCUOĞLU GARANTİ BNK | CHECKING | Garanti BBVA |
| ATEŞ QNB | CHECKING | QNB Finansbank |
| Bİ DÜNYA ELEKTRİK VAKIFBANK | CHECKING | Vakıfbank |
| DAF QNB FİNANSBANK | CHECKING | QNB Finansbank |
| YEP HALKBANKASI | CHECKING | Halkbank |
| UZMAN GRUP FİNANSBANK | CHECKING | QNB Finansbank |
| Bİ DÜNYA ELEKTRİK SANAL | CHECKING | Sanal POS hesabı |
| Bİ DÜNYA İŞ MAK YAPIKREDİ | CHECKING | Yapı Kredi |
| ATEŞ YAPI KREDİ | CHECKING | Yapı Kredi |
| KÖMÜROĞLU06 | CHECKING |  |
| ANKARA RÜZGAR | CHECKING |  |
| RÜZGAR AĞIR VASITA YAPI | CHECKING | Yapı Kredi |
| LİDER GRUP NAKLİYE | CHECKING |  |
| KIZILAY FATİH | CHECKING |  |
| NEVŞEHİR SERDAR | CHECKING |  |
| SİNAN DAŞTAN | CHECKING |  |
| YCA 61 | CHECKING |  |
| İSO | CHECKING |  |
| DOĞANAY | CHECKING |  |
| ÇİMENTO | CHECKING | Çimento takibi |
| TUNCAY ABİ ALACAK | CHECKING | Özel hesap |
| GÖKHAN ELDEKİ | CASH_HOLDER | holder_person_id = GÖKHAN kişisi |

**Master havuz (is_active=false) — Excel rows 75-98:**

```
  AYAZ GRUP FİNANS (is_active=false)
  ERCAN ŞAHSİ FİNANS (is_active=false)
  Bİ DÜNYA İŞ MAK. İŞ BANKASI (is_active=false)
  HARMAK YAPIKREDİ (is_active=false)
  NEW MAKSAN ŞEKERBANK (is_active=false)
  ALTAY YAPIKREDİ (is_active=false)
  CK ZİRAAT (is_active=false)
  YANAR GRUP ZİRAAT (is_active=false)
  YANAR GRUP HALK (is_active=false)
  AYTEPE HALKBANK (is_active=false)
  AYTEPE ZİRAAT (is_active=false)
  Bİ DÜNYA HIR.ZİRAAT (is_active=false)
  Bİ DÜNYA YAPIKREDİ (is_active=false)
  Bİ DÜNYA HIR.İŞ BANK (is_active=false)
  CARBİTE YAPIKREDİ (is_active=false)
  ROYAL YAPIKREDİ (is_active=false)
  NEHİR ZİRAAT (is_active=false)
  GÜLERYÜZ FİNANS (is_active=false)
  GÜLERYÜZ YAPIKREDİ (is_active=false)
  ALAÇATI İŞ BANKASI (is_active=false)
  SARAYLI VAKIFBANK (is_active=false)
  TEKNİK İŞ (is_active=false)
  GÜVEN 06 HALKBANKASI (is_active=false)
```

### 1.5 POS Cihazları (POS device entity)

| Cihaz adı | Sahibi (firma) | Default rate (%) |
|---|---|---|
| Bİ DÜNYA ELEKTRİK POS | Bİ DÜNYA ELEKTRİK | 4.0 |
| Bİ DÜNYA İŞ YAPIKREDİ POS | Bİ DÜNYA İŞ MAK | 4.0 |
| DİŞLİOĞLU YAPIKREDİ POS | DİŞLİOĞLU | 5.5 |
| RÜZGAR AĞIR VASITA YAPI POS | RÜZGAR AĞIR VASITA | 5.5 |
| ATEŞ YAPIKREDİ POS | ATEŞ | 5.5 |
| UZMAN GRUP POS | UZMAN GRUP | 5.5 |
| KÖMÜROĞLU06 POS | KÖMÜROĞLU06 | 5.5 |
| ANKARA RÜZGAR POS | ANKARA RÜZGAR | 5.5 |
| KIZILAY POS | KIZILAY | 5.0 — POS Kar olarak gelir |
| ÖZKAN POS — ÇİMENTO | ÖZKAN | 5.0 — hesaba düşen %4 |

## 🏁 2. Açılış Pozisyonu (04.05.2026 öncesi)

### 2.1 Opening Kasa Bakiyesi
- **03.05.2026 cash_closing entry:** `computed=28.387.220,78`, `actual=28.387.220,78`, `difference=0`, `status=CLOSED`, `is_auto=false`
- Bu 04.05.2026'nın açılış kaynağı olur.

### 2.2 Açılış ALACAKLAR (bize borçlu olanlar — debt type=ALACAK)

04.05.2026 sheet'indeki başlangıç ALACAKLAR listesi (her satır bir debt entry):

| Kim | Tutar | Tip |
|---|---:|---|
| TUNCAY ABİ | 10,400,000.00 | DIGER |
| KÜRŞAD KOÇ | 4,981,000.00 | DIGER |
| RIDVAN | 270,000.00 | DIGER |
| DENEYİM MASCHINENBAU | 250,000.00 | DIGER |
| METEHAN | 218,640.00 | DIGER |
| SADULLAH | 80,000.00 | DIGER |
| KANKA UFUK | 75,000.00 | DIGER |
| MUSTAFA AKAY | 20,000.00 | DIGER |
| ALİ ARI | 570,000.00 | DIGER |
| KEZBAN KILIÇ | 1,151,000.00 | DIGER |
| AMBAR | 52,000.00 | DIGER |
| TAHA POS | 161,000.00 | DIGER |
| ADEM ABİ | 50,000.00 | DIGER |
| UĞUR ÇİFTLİK | 150,000.00 | DIGER |
| DOĞANAY | 150,000.00 | DIGER |
| ÇİMENTO | 129,066.00 | DIGER |
| KIZILAY FATİH | 232,300.00 | DIGER |
| NEVŞEHİR SERDAR | 250,000.00 | DIGER |
| SİNAN DAŞTAN | 5,000,000.00 | DIGER |
| SAKALLI | 700,000.00 | DIGER |
| TUNCAY ABİ ALACAK | 456,500.00 | DIGER |
| Bİ DÜNYA ELEKTRİK SANAL | 1,601,807.73 | DIGER |

### 2.3 Açılış BORÇLAR (bizim borçlu olduğumuz — debt type=BORC)

| Kim | Tutar | Tip |
|---|---:|---|
| YCA MEH | 457,000.00 | DIGER |
| MUHASEBE EMRAH | 2,500,000.00 | DIGER |
| NAKİT HARCAMA | 932,250.00 | DIGER |

### 2.4 Açılış KASADAN ÇIKARILACAK ALACAKLAR (sabit ödenecek liste — debt type=BORC)

Excel'de I-J kolonunda her gün aynı tutarlarla görünen 'KASADAN ÇIKARILAN ALACAKLAR' listesi — kişilere ödenmesi planlanan tutarlar (verecek):

| Kim | Tutar |
|---|---:|
| GÖKHAN VOLKAN | 42,000.00 |
| CİĞERCİ | 45,000.00 |
| BOKSÖR HAKAN | 406,000.00 |
| İSO | 580,000.00 |
| FİKO | 8,000.00 |
| TAHA | 114,000.00 |
| ENGİN TUĞLU | 90,000.00 |
| ENSAR YILDIZ | 100,000.00 |
| NİHAT MEYDAN | 35,000.00 |
| GÖKHAN | 30,000.00 |
| BARAN KANKA ARKADAŞ | 150,000.00 |
| TUNAHAN ÇİFTÇİ (AYIN 9'unda hatırlat — reminder_date=2026-06-09) | 100,000.00 |
| (?) belirsiz | 1,700,000.00 |

Not: Bu liste 10 gün boyunca **AYNI** kalıyor — yani 04.05-15.05 arasında hiçbiri ödenmemiş. Sadece açılış debt entry'leri olarak girilir.


## 📅 3. Günlük İşlemler

### 📅 04.05.2026

**Hedef değerler:** Açılış 28,387,220.78 → Excel hesabı 28,981,759.89 → Manuel sayım 28,981,633.28 → Fark -126.61

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 932,250.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-932250, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **HASAN HÜSEYİN BULUT:** 147,500.00 TL · payment_method=HESAPDAN · OUT
- **FATURA:** 1,400.00 TL · payment_method=HESAPDAN · OUT
- **KANKA GİDER:** 456,500.00 TL · payment_method=HESAPDAN · OUT
- **MESUT ERDEM:** 30,000.00 TL · payment_method=HESAPDAN · OUT
- **SİTELER 4 ELEMAN HAFTALIK:** 29,500.00 TL · payment_method=HESAPDAN · OUT
- **NURAY SEYHAN:** 400,000.00 TL · payment_method=HESAPDAN · OUT
- **DAMGA VETGİSİ:** 10,000.00 TL · payment_method=HESAPDAN · OUT
- **SEMA NUR ARIKAN:** 3,000.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **Bİ DÜNYA ELEKTRİK:** çekim 1,656,300.00 · POS Kar -36,604.23 · pos_settled=false
- **DİŞLİOĞLU YAPIKREDİ:** çekim 1,495,800.00 · POS Kar -25,428.60 · pos_settled=false
- **RÜZGAR AĞIR VASITA YAPI:** çekim 1,013,060.00 · POS Kar -17,829.86 · pos_settled=false
- **UZMAN GRUP:** çekim 100,000.00 · POS Kar -1,930.00 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-ÇİMENTO:** çekim 637500 · hesaba düşen 612000
- **ÖZKAN-ÇİMENTO GELEN PARA:** çekim 650000 · hesaba düşen 650000
- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -167066 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 95,000.00 TL · IN
- **ÇİMENTO:** 9,562.50 TL · IN
- **KEZBAN KILIÇ ÇEK ÖDEMESİ:** 2,500,000.00 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 28981633.28, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: -126.61

### 📅 05.05.2026

**Hedef değerler:** Açılış 28,981,759.00 → Excel hesabı 27,493,446.44 → Manuel sayım 27,493,589.00 → Fark 142.56

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 746,100.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-746100, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **MEHMET ALİ BAĞDATLI:** 400,000.00 TL · payment_method=HESAPDAN · OUT
- **ERCAN İŞLEMLER:** 20,000.00 TL · payment_method=HESAPDAN · OUT
- **ARZU KORKMAZ:** 220,000.00 TL · payment_method=HESAPDAN · OUT
- **UZMAN KİRA:** 70,000.00 TL · payment_method=HESAPDAN · OUT
- **DGR KİRA:** 75,000.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **Bİ DÜNYA ELEKTRİK:** çekim 935,500.00 · POS Kar -19,739.05 · pos_settled=false
- **DİŞLİOĞLU YAPIKREDİ:** çekim 710,670.00 · POS Kar -12,081.39 · pos_settled=false
- **RÜZGAR AĞIR VASITA YAPI:** çekim 220,000.00 · POS Kar -3,872.00 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-ÇİMENTO:** çekim 482000 · hesaba düşen 462720
- **ÖZKAN-ÇİMENTO GELEN PARA:** çekim 400000 · hesaba düşen 400000
- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -129066 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 35,700.00 TL · IN
- **ÇİMENTO:** 7,230.00 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 27493589, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: 142.56

### 📅 06.05.2026 (Excel'de typo, gerçek tarih 06.05)

**Hedef değerler:** Açılış 27,493,246.44 → Excel hesabı 27,544,585.54 → Manuel sayım 27,546,866.44 → Fark 2,280.90

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 124,300.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-124300, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **YEP KİRA FARKI:** 6,000.00 TL · payment_method=HESAPDAN · OUT
- **KUMTAŞ KİRA:** 33,000.00 TL · payment_method=HESAPDAN · OUT
- **TANGÜN KİRA:** 7,500.00 TL · payment_method=HESAPDAN · OUT
- **ÇİFTLİK GİDER:** 190,000.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **Bİ DÜNYA ELEKTRİK:** çekim 1,630,550.00 · POS Kar -31,143.50 · pos_settled=false
- **DİŞLİOĞLU YAPIKREDİ:** çekim 165,000.00 · POS Kar -2,805.00 · pos_settled=false
- **RÜZGAR AĞIR VASITA YAPI:** çekim 1,328,900.00 · POS Kar -23,388.64 · pos_settled=false
- **UZMAN GRUP:** çekim 295,400.00 · POS Kar -7,119.14 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -191786 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 64,420.00 TL · IN
- **KOR KORAY SENET ÖDEMESİ:** 350,000.00 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 27546866.44, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: 2,280.90

### 📅 07.05.2026

**Hedef değerler:** Açılış 27,544,585.54 → Excel hesabı 28,295,633.32 → Manuel sayım 28,297,235.54 → Fark 1,602.22

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 223,750.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-223750, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **RECEP ÇOPUR:** 45,000.00 TL · payment_method=HESAPDAN · OUT
- **HASAN HÜSEYİN BAĞDATLI:** 95,000.00 TL · payment_method=HESAPDAN · OUT
- **OSMAN HAFTALIK:** 8,000.00 TL · payment_method=HESAPDAN · OUT
- **ERCAN İŞLEMLER:** 10,000.00 TL · payment_method=HESAPDAN · OUT
- **ÇİFTLİK GİDER:** 83,250.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **Bİ DÜNYA ELEKTRİK:** çekim 2,325,500.00 · POS Kar -39,766.05 · pos_settled=false
- **DİŞLİOĞLU YAPIKREDİ:** çekim 233,110.00 · POS Kar -3,962.87 · pos_settled=false
- **UZMAN GRUP:** çekim 378,000.00 · POS Kar -9,109.80 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -191786 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 52,650.00 TL · IN
- **KANKA GELİR(DOLAR):** 1,085,000.00 TL · IN
- **SİNCAN BELEDİYESİ:** 70,000.00 TL · IN
- **TAHA ÖDEME:** 10,000.00 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 28297235.54, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: 1,602.22

### 📅 08.05.2026

**Hedef değerler:** Açılış 28,295,633.32 → Excel hesabı 28,711,336.94 → Manuel sayım 28,222,119.61 → Fark -489,217.33

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 193,300.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-193300, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **MEHMET ALİ BAĞDATLI:** 70,000.00 TL · payment_method=HESAPDAN · OUT
- **ERCAN İŞLEMLER:** 25,000.00 TL · payment_method=HESAPDAN · OUT
- **SİTELER ELEMANLAR:** 68,600.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **DİŞLİOĞLU YAPIKREDİ:** çekim 181,650.00 · POS Kar -3,088.05 · pos_settled=false
- **RÜZGAR AĞIR VASITA YAPI:** çekim 118,650.00 · POS Kar -2,088.24 · pos_settled=false
- **UZMAN GRUP:** çekim 100,000.00 · POS Kar -3,410.00 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -191786 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 8,586.29 TL · IN
- **ENS TEKNİK:** 100,000.00 TL · IN
- **METAŞ:** 100,000.00 TL · IN
- **METAŞ NAKLİYE:** 50,000.00 TL · IN
- **OĞUZ MONTAJ:** 14,800.00 TL · IN
- **DAMGA VERGİSİ:** 10,000.00 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 28222119.61, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: -489,217.33

### 📅 11.05.2026

**Hedef değerler:** Açılış 28,221,336.94 → Excel hesabı 29,894,997.10 → Manuel sayım 28,313,051.94 → Fark -1,581,945.16

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 116,750.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-116750, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **ÇİFTLİK GİDER:** 30,000.00 TL · payment_method=HESAPDAN · OUT
- **KÜRŞAD YOL MASRAF:** 10,000.00 TL · payment_method=HESAPDAN · OUT
- **ÇİFTLİK GİDER (CUMARTESİ ATILDI):** 30,000.00 TL · payment_method=HESAPDAN · OUT
- **DAMGA VERGİSİ:** 9,500.00 TL · payment_method=HESAPDAN · OUT
- **ANTEP YOL PARASI:** 10,000.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **Bİ DÜNYA ELEKTRİK:** çekim 1,900,000.00 · POS Kar -40,090.00 · pos_settled=false
- **DİŞLİOĞLU YAPIKREDİ:** çekim 292,050.00 · POS Kar -4,964.85 · pos_settled=false
- **UZMAN GRUP:** çekim 190,000.00 · POS Kar -4,579.00 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-ÇİMENTO:** çekim 683000 · hesaba düşen 655680
- **ÖZKAN-ÇİMENTO GELEN PARA:** çekim 754000 · hesaba düşen 754000
- **ÖZKAN-ÇİMENTO GÖNDERİLEN PARA:** çekim 71000 · hesaba düşen -71000
- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -191786 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 61,920.00 TL · IN
- **ÇİMENTO:** 10,245.00 TL · IN
- **MİMSAN:** 200,000.00 TL · IN
- **KÜRŞAD KOÇ CANKART:** 25,800.00 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 28313051.94, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: -1,581,945.16

### 📅 12.05.2026

**Hedef değerler:** Açılış 28,311,997.00 → Excel hesabı 28,771,219.30 → Manuel sayım 28,773,312.50 → Fark 2,093.20

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 31,700.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-31700, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **FERHAN AYDIN KART GİDERİ:** 9,300.00 TL · payment_method=HESAPDAN · OUT
- **MEHMET ALİ BAĞDATLI:** 20,000.00 TL · payment_method=HESAPDAN · OUT
- **KANKA GİDER:** 130,000.00 TL · payment_method=HESAPDAN · OUT
- **KIRAÇ SMART:** 14,000.00 TL · payment_method=HESAPDAN · OUT
- **ERCAN İŞLEMLER:** 10,000.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **DİŞLİOĞLU YAPIKREDİ:** çekim 854,000.00 · POS Kar -14,518.00 · pos_settled=false
- **RÜZGAR AĞIR VASITA YAPI:** çekim 405,500.00 · POS Kar -7,136.80 · pos_settled=false
- **UZMAN GRUP:** çekim 165,000.00 · POS Kar -3,976.50 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-ÇİMENTO:** çekim 357700 · hesaba düşen 343392
- **ÖZKAN-ÇİMENTO GELEN PARA:** çekim 357700 · hesaba düşen 357700
- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -164466 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 23,650.00 TL · IN
- **ÇİMENTO:** 5,365.50 TL · IN
- **MİMSAN SENET ÖDEMESİ:** 50,000.00 TL · IN
- **KÜRŞAD KOÇ ÜNİTEK ÖDEME:** 50,000.00 TL · IN
- **DENİZBANK ÇEK TAHSİL:** 400,000.00 TL · IN
- **MRG KARGO YAPIKREDİ ÇEK:** 97,300.00 TL · IN
- **TAHA FATİH AKMAN ÖDEME:** 50,000.00 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 28773312.5, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: 2,093.20

### 📅 13.05.2026

**Hedef değerler:** Açılış 28,771,219.00 → Excel hesabı 28,704,856.43 → Manuel sayım 28,706,836.28 → Fark 1,979.85

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 75,200.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-75200, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **DAMGA VERGİSİ:** 10,000.00 TL · payment_method=HESAPDAN · OUT
- **FİNANSBANK ÇAKIRDAĞ PAKET:** 20,000.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **Bİ DÜNYA ELEKTRİK:** çekim 890,300.00 · POS Kar -17,004.73 · pos_settled=false
- **DİŞLİOĞLU YAPIKREDİ:** çekim 647,650.00 · POS Kar -11,010.05 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-ÇİMENTO:** çekim 853500 · hesaba düşen 819360
- **ÖZKAN-ÇİMENTO GELEN PARA:** çekim 688500 · hesaba düşen 688500
- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -150158 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 28,014.78 TL · IN
- **ÇİMENTO:** 12,802.50 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 28706836.28, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: 1,979.85

### 📅 14.05.2026

**Hedef değerler:** Açılış 28,704,856.43 → Excel hesabı 29,153,214.86 → Manuel sayım 28,667,181.43 → Fark -486,033.43

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 52,900.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-52900, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **TABELA PURSAKLAR:** 2,500.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **Bİ DÜNYA ELEKTRİK:** çekim 783,000.00 · POS Kar -13,389.30 · pos_settled=false
- **DİŞLİOĞLU YAPIKREDİ:** çekim 120,000.00 · POS Kar -2,040.00 · pos_settled=false
- **RÜZGAR AĞIR VASITA YAPI:** çekim 51,850.00 · POS Kar -912.56 · pos_settled=false
- **UZMAN GRUP:** çekim 47,500.00 · POS Kar -1,382.25 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -281018 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 17,725.00 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 28667181.43, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: -486,033.43

### 📅 15.05.2026

**Hedef değerler:** Açılış 28,666,214.00 → Excel hesabı 28,457,630.68 → Manuel sayım 28,458,014.00 → Fark 383.32

**🔻 HARCAMALAR (OUT işlemler):**

- **Toplam Nakit Harcama:** 93,900.00 TL (kategorize edilmemiş tek kalem) → tx: amount=-93900, payment_method=NAKIT, description='Günlük nakit harcama toplamı'
- **SERVET KAPLI:** 5,000.00 TL · payment_method=HESAPDAN · OUT
- **HASAN HÜSEYİN BULUT:** 370,000.00 TL · payment_method=HESAPDAN · OUT
- **SİTELER HAFTALIK+PROMOSYON:** 43,000.00 TL · payment_method=HESAPDAN · OUT

**💳 POS Cihazları (POS çekimleri — payment_method=POS, pos_settled=false default):**

- **Bİ DÜNYA ELEKTRİK:** çekim 2,290,032.50 · POS Kar -39,159.56 · pos_settled=false
- **UZMAN GRUP:** çekim 266,000.00 · POS Kar -7,740.60 · pos_settled=false

**💳 ÖZKAN POS işlemleri (ayrı grup):**

- **ÖZKAN-DÜNKÜ BORÇ VEYA ALACAK:** çekim -281018 · hesaba düşen 0

**🔼 ALINAN ÖDEMELER (IN işlemler):**

- **KIZILAY POS KAR:** 46,900.00 TL · IN
- **BAYRAM AKSARAY:** 46,800.00 TL · IN
- **ENS TEKNİK:** 100,000.00 TL · IN
- **METAŞ:** 100,000.00 TL · IN
- **DAMGA VERGİSİ:** 10,000.00 TL · IN

**🔒 Günü kapat (manuel):**
- `POST /api/closings/today {actualBalance: 28458014, ... }` → sistem fark hesaplayacak
- Excel'deki beklenen fark: 383.32

## ✅ 4. Verification (System Architect tarafından yapılacak)

Coder tüm 10 günü kapattıktan sonra System Architect şu kontrolleri yapacak:

1. **API kontrolü:**
   - `GET /api/businesses/{DGR_id}/consolidated?date=2026-05-15` → ekran görüntüsü/JSON
   - `GET /api/closings?from=2026-05-03&to=2026-05-15` → 10+1 closing dönmeli
   - `GET /api/pos-devices/analytics?from=2026-05-04&to=2026-05-15` → POS Kar toplamları

2. **Excel karşılaştırma (her gün için tablo):**

| Tarih | Sistem computed | Excel SON KASA | Sapma % | Sistem fark | Excel EKSİK |
|---|---:|---:|---:|---:|---:|
| 04.05.2026 | ? (girince doldurulacak) | 28,981,759.89 | ? | ? | -126.61 |
| 05.05.2026 | ? (girince doldurulacak) | 27,493,446.44 | ? | ? | 142.56 |
| 06.05.2026 | ? (girince doldurulacak) | 27,544,585.54 | ? | ? | 2,280.90 |
| 07.05.2026 | ? (girince doldurulacak) | 28,295,633.32 | ? | ? | 1,602.22 |
| 08.05.2026 | ? (girince doldurulacak) | 28,711,336.94 | ? | ? | -489,217.33 |
| 11.05.2026 | ? (girince doldurulacak) | 29,894,997.10 | ? | ? | -1,581,945.16 |
| 12.05.2026 | ? (girince doldurulacak) | 28,771,219.30 | ? | ? | 2,093.20 |
| 13.05.2026 | ? (girince doldurulacak) | 28,704,856.43 | ? | ? | 1,979.85 |
| 14.05.2026 | ? (girince doldurulacak) | 29,153,214.86 | ? | ? | -486,033.43 |
| 15.05.2026 | ? (girince doldurulacak) | 28,457,630.68 | ? | ? | 383.32 |

3. **Başarı kriteri (gevşek):**
   - Tüm 10 closing kaydı oluşmuş
   - 15.05 actual_balance = 28.458.014,00
   - Sistemin günlük computed değerleri Excel ile ±%5 sapmada
   - POS Kar widget'ı meaningful değerler gösteriyor (0 değil)
   - Konsolide widget toplam nakit ~28 milyon TL aralığında
   - Critical bug/error sıfır

4. **Bug ve sürpriz tespiti:**
   - UI hataları (widget boş, sayı format, locale)
   - Form edge case'leri (counterpart autocomplete, POS device rate auto-fill)
   - Performance (400 tx'li günde dashboard yüklenme süresi)
   - Close-of-day modal davranışı

