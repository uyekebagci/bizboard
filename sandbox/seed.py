#!/usr/bin/env python3
"""
DGR Sandbox Seed — uygulayıcı: ../sandbox-test-transactions.md
v1.6.23.4 (HESAPDAN destek + sandbox seed).

Akış:
  1. Login (admin/admin123)
  2. DGR business yarat (API)
  3. system_setting.tenant.single_business_id (SQL)
  4. Counterparts (FIRM + PERSON) — API
  5. Bank accounts (26 aktif + 23 pasif) — SQL (POST endpoint yok)
  6. POS devices — API
  7. Opening debts (alacak/borç/kasadan-cikan) — API
  8. Opening cash_closing 03.05.2026 — SQL
  9. 10 gün için: harcamalar + POS çekimler + IN ödemeler — API
 10. Her gün için cash_closing — SQL (backdate)
 11. audit_log SANDBOX_SEED satırları — SQL

Çalıştır: python3 sandbox/seed.py
Backend 8080'de ayakta olmalı.
"""

import json, os, subprocess, sys, time, uuid, urllib.request, urllib.parse, urllib.error
from decimal import Decimal

BASE = "http://localhost:8080"
DB_CMD = ["psql", "-h", "localhost", "-p", "5432", "-U", "postgres", "-d", "bizboard"]
PG_ENV = {**os.environ, "PGPASSWORD": "postgres"}

TOKEN = None
ADMIN_ID = None  # filled after login from /me

# ── helpers ─────────────────────────────────────────────────────────────

def http(method, path, body=None):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = "Bearer " + TOKEN
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode("utf-8")
            return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body_txt)
        except Exception:
            return e.code, body_txt

def sql(stmt, *args):
    """Execute SQL replacing '?' with safely-quoted args."""
    if args:
        formatted = ""
        i = 0
        for ch in stmt:
            if ch == "?" and i < len(args):
                a = args[i]; i += 1
                if a is None:
                    formatted += "NULL"
                elif isinstance(a, bool):
                    formatted += "TRUE" if a else "FALSE"
                elif isinstance(a, (int, float, Decimal)):
                    formatted += str(a)
                else:
                    s = str(a).replace("'", "''")
                    formatted += f"'{s}'"
            else:
                formatted += ch
        stmt = formatted
    r = subprocess.run(DB_CMD + ["-At", "-c", stmt],
                       capture_output=True, text=True, env=PG_ENV)
    if r.returncode != 0:
        raise RuntimeError(f"SQL failed: {r.stderr}\nSQL: {stmt[:300]}")
    return r.stdout.strip()

def login():
    global TOKEN, ADMIN_ID
    code, data = http("POST", "/auth/login",
                      {"username": "admin", "password": "admin123"})
    if code != 200:
        raise RuntimeError(f"Login failed: {code} {data}")
    TOKEN = data["token"]
    # /me ile admin id'yi al — closed_by için lazım
    code, me = http("GET", "/users/me")
    if code == 200 and isinstance(me, dict):
        ADMIN_ID = me.get("id")
    if not ADMIN_ID:
        # Fallback: SQL ile bul
        ADMIN_ID = sql("SELECT id FROM users WHERE username='admin' LIMIT 1;")
    print(f"[auth] OK  admin_id={ADMIN_ID[:8] if ADMIN_ID else '?'}")

# ── Master data ─────────────────────────────────────────────────────────

FIRMS = [
    "Bİ DÜNYA HIR","Bİ DÜNYA ELEKTRİK","Bİ DÜNYA İŞ MAK","DİŞLİOĞLU","ATEŞ","RÜZGAR AĞIR VASITA",
    "ANKARA RÜZGAR","KÖMÜROĞLU06","UZMAN GRUP","KIZILAY","ÖZKAN","YCA","DAF","YEP","STAR",
    "KALBURCUOĞLU","AYAZ GRUP","ERCAN","HARMAK","NEW MAKSAN","ALTAY","CK","YANAR GRUP","AYTEPE",
    "CARBİTE","ROYAL","NEHİR","GÜLERYÜZ","ALAÇATI","SARAYLI","TEKNİK İŞ","GÜVEN 06",
    "LİDER GRUP NAKLİYE","MİMSAN","MRG KARGO","DENEYİM MASCHINENBAU","ÇİMENTO","İZOTAŞ BİMS",
    "BEST E YAPI","METAŞ","ENS TEKNİK","YEP KİRA","TANGÜN KİRA","UZMAN KİRA","DGR KİRA","KUMTAŞ KİRA",
]

PERSONS = [
    "TUNCAY ABİ","KÜRŞAD KOÇ","RIDVAN","METEHAN","SADULLAH","KANKA UFUK","MUSTAFA AKAY","ALİ ARI",
    "KEZBAN KILIÇ","AMBAR","TAHA POS","ADEM ABİ","UĞUR ÇİFTLİK","DOĞANAY","SAKALLI","MEHMET BAŞOĞLU",
    "TUNCAY ABİ ALACAK","YCA MEH","MUHASEBE EMRAH","HASAN HÜSEYİN BULUT","HASAN HÜSEYİN BAĞDATLI",
    "SERVET KAPLI","GÖKHAN (Eldeki)","GÖKHAN VOLKAN","CİĞERCİ","BOKSÖR HAKAN","İSO","FİKO","TAHA",
    "ENGİN TUĞLU","ENSAR YILDIZ","NİHAT MEYDAN","BARAN KANKA ARKADAŞ","TUNAHAN ÇİFTÇİ","KIZILAY FATİH",
    "NEVŞEHİR SERDAR","SİNAN DAŞTAN","YCA 61","SİTELER (çalışanlar)","MEHMET ALİ BAĞDATLI",
    "ERCAN İŞLEMLER","NURAY SEYHAN","SEMA NUR ARIKAN","MESUT ERDEM","ARZU KORKMAZ","RECEP ÇOPUR",
    "OSMAN HAFTALIK","ÇİFTLİK GİDER","KOR KORAY","FERHAN AYDIN","KIRAÇ SMART","TABELA PURSAKLAR",
    "ANTEP YOL","KÜRŞAD YOL","FATİH AKMAN","DAMGA VERGİSİ","FATURA","KANKA GİDER","OĞUZ MONTAJ",
    "GÖKHAN","NAKİT HARCAMA",
    # Günlük tx'lerde ek kişiler:
    "KOR KORAY SENET","DENİZBANK ÇEK","BAYRAM AKSARAY","SİNCAN BELEDİYESİ","FİNANSBANK ÇAKIRDAĞ",
    "KANKA GELİR","KEZBAN ÇEK","TAHA FATİH AKMAN","KÜRŞAD CANKART","KÜRŞAD ÜNİTEK","MİMSAN SENET",
    "MRG KARGO ÇEK","METAŞ NAKLİYE",
]

ACTIVE_BANKS = [
    ("DGR FİNANS", "DGR FİNANS"),
    ("Bİ DÜNYA HIR.GARANTİ", "Garanti BBVA"),
    ("STAR HALKBANKASI", "Halkbank"),
    ("DİŞLİOĞLU YAPIKREDİ", "Yapı Kredi"),
    ("KALBURCUOĞLU GARANTİ BNK", "Garanti BBVA"),
    ("ATEŞ QNB", "QNB Finansbank"),
    ("Bİ DÜNYA ELEKTRİK VAKIFBANK", "Vakıfbank"),
    ("DAF QNB FİNANSBANK", "QNB Finansbank"),
    ("YEP HALKBANKASI", "Halkbank"),
    ("UZMAN GRUP FİNANSBANK", "QNB Finansbank"),
    ("Bİ DÜNYA ELEKTRİK SANAL", "Sanal POS"),
    ("Bİ DÜNYA İŞ MAK YAPIKREDİ", "Yapı Kredi"),
    ("ATEŞ YAPI KREDİ", "Yapı Kredi"),
    ("KÖMÜROĞLU06", None),
    ("ANKARA RÜZGAR", None),
    ("RÜZGAR AĞIR VASITA YAPI", "Yapı Kredi"),
    ("LİDER GRUP NAKLİYE", None),
    ("KIZILAY FATİH", None),
    ("NEVŞEHİR SERDAR", None),
    ("SİNAN DAŞTAN", None),
    ("YCA 61", None),
    ("İSO", None),
    ("DOĞANAY", None),
    ("ÇİMENTO", "Çimento takibi"),
    ("TUNCAY ABİ ALACAK", "Özel hesap"),
]

INACTIVE_BANKS = [
    "AYAZ GRUP FİNANS","ERCAN ŞAHSİ FİNANS","Bİ DÜNYA İŞ MAK. İŞ BANKASI","HARMAK YAPIKREDİ",
    "NEW MAKSAN ŞEKERBANK","ALTAY YAPIKREDİ","CK ZİRAAT","YANAR GRUP ZİRAAT","YANAR GRUP HALK",
    "AYTEPE HALKBANK","AYTEPE ZİRAAT","Bİ DÜNYA HIR.ZİRAAT","Bİ DÜNYA YAPIKREDİ",
    "Bİ DÜNYA HIR.İŞ BANK","CARBİTE YAPIKREDİ","ROYAL YAPIKREDİ","NEHİR ZİRAAT","GÜLERYÜZ FİNANS",
    "GÜLERYÜZ YAPIKREDİ","ALAÇATI İŞ BANKASI","SARAYLI VAKIFBANK","TEKNİK İŞ","GÜVEN 06 HALKBANKASI",
]

POS_DEVICES = [
    ("Bİ DÜNYA ELEKTRİK POS",    "Bİ DÜNYA ELEKTRİK",    4.0),
    ("Bİ DÜNYA İŞ YAPIKREDİ POS","Bİ DÜNYA İŞ MAK",      4.0),
    ("DİŞLİOĞLU YAPIKREDİ POS",  "DİŞLİOĞLU",            5.5),
    ("RÜZGAR AĞIR VASITA YAPI POS","RÜZGAR AĞIR VASITA", 5.5),
    ("ATEŞ YAPIKREDİ POS",       "ATEŞ",                 5.5),
    ("UZMAN GRUP POS",           "UZMAN GRUP",           5.5),
    ("KÖMÜROĞLU06 POS",          "KÖMÜROĞLU06",          5.5),
    ("ANKARA RÜZGAR POS",        "ANKARA RÜZGAR",        5.5),
    ("KIZILAY POS",              "KIZILAY",              5.0),
    ("ÖZKAN POS — ÇİMENTO",      "ÖZKAN",                5.0),
]

# Opening debts:
OPEN_RECEIVABLES = [
    ("TUNCAY ABİ", 10_400_000.00), ("KÜRŞAD KOÇ", 4_981_000.00), ("RIDVAN", 270_000.00),
    ("DENEYİM MASCHINENBAU", 250_000.00), ("METEHAN", 218_640.00), ("SADULLAH", 80_000.00),
    ("KANKA UFUK", 75_000.00), ("MUSTAFA AKAY", 20_000.00), ("ALİ ARI", 570_000.00),
    ("KEZBAN KILIÇ", 1_151_000.00), ("AMBAR", 52_000.00), ("TAHA POS", 161_000.00),
    ("ADEM ABİ", 50_000.00), ("UĞUR ÇİFTLİK", 150_000.00), ("DOĞANAY", 150_000.00),
    ("ÇİMENTO", 129_066.00), ("KIZILAY FATİH", 232_300.00), ("NEVŞEHİR SERDAR", 250_000.00),
    ("SİNAN DAŞTAN", 5_000_000.00), ("SAKALLI", 700_000.00), ("TUNCAY ABİ ALACAK", 456_500.00),
    ("Bİ DÜNYA ELEKTRİK SANAL", 1_601_807.73),
]

OPEN_PAYABLES = [
    ("YCA MEH", 457_000.00),
    ("MUHASEBE EMRAH", 2_500_000.00),
    ("NAKİT HARCAMA", 932_250.00),
]

# Sabit kasadan-çıkacaklar listesi (PAYABLE — verecek):
KASADAN_PAYABLES = [
    ("GÖKHAN VOLKAN", 42_000.00),
    ("CİĞERCİ", 45_000.00),
    ("BOKSÖR HAKAN", 406_000.00),
    ("İSO", 580_000.00),
    ("FİKO", 8_000.00),
    ("TAHA", 114_000.00),
    ("ENGİN TUĞLU", 90_000.00),
    ("ENSAR YILDIZ", 100_000.00),
    ("NİHAT MEYDAN", 35_000.00),
    ("GÖKHAN", 30_000.00),
    ("BARAN KANKA ARKADAŞ", 150_000.00),
    ("TUNAHAN ÇİFTÇİ", 100_000.00),   # reminder_date=2026-06-09
    ("(?) belirsiz", 1_700_000.00),
]

# ── Daily transactions ──────────────────────────────────────────────────
# Sözlük: tarih → (nakit_total, hesapdan_outs[(name, amt)], pos_withdrawals[(device, amount, pos_kar)],
#                  ozkan_pos[(label, cekim, hesaba_dusen)], ins[(name, amt, payment_method)], actual_balance)

DAYS = {
    "2026-05-04": dict(
        nakit_out=("Günlük nakit harcama toplamı", 932_250.00),
        hesapdan_outs=[
            ("HASAN HÜSEYİN BULUT", 147_500.00),
            ("FATURA", 1_400.00),
            ("KANKA GİDER", 456_500.00),
            ("MESUT ERDEM", 30_000.00),
            ("SİTELER (çalışanlar)", 29_500.00),  # SİTELER 4 ELEMAN HAFTALIK
            ("NURAY SEYHAN", 400_000.00),
            ("DAMGA VERGİSİ", 10_000.00),
            ("SEMA NUR ARIKAN", 3_000.00),
        ],
        pos_withdrawals=[
            ("Bİ DÜNYA ELEKTRİK POS", 1_656_300.00, 36_604.23),
            ("DİŞLİOĞLU YAPIKREDİ POS", 1_495_800.00, 25_428.60),
            ("RÜZGAR AĞIR VASITA YAPI POS", 1_013_060.00, 17_829.86),
            ("UZMAN GRUP POS", 100_000.00, 1_930.00),
        ],
        ozkan=[
            ("ÖZKAN-ÇİMENTO", 637_500.00, 612_000.00),
            ("ÖZKAN-ÇİMENTO GELEN PARA", 650_000.00, 650_000.00),
            # DÜNKÜ BORÇ -167066 → tx değil, opening borç olarak ekleyeceğiz
        ],
        opening_ozkan_debt=167_066.00,
        ins=[
            ("KIZILAY POS KAR", 95_000.00, "POS", "KIZILAY POS"),
            ("ÇİMENTO", 9_562.50, "NAKIT", None),
            ("KEZBAN ÇEK", 2_500_000.00, "HESAPDAN", None),  # KEZBAN KILIÇ ÇEK ÖDEMESİ
        ],
        actual_balance=28_981_633.28,
        opening=28_387_220.78,  # 03.05 closed → 04.05 opening
    ),
    "2026-05-05": dict(
        nakit_out=("Günlük nakit harcama toplamı", 746_100.00),
        hesapdan_outs=[
            ("MEHMET ALİ BAĞDATLI", 400_000.00),
            ("ERCAN İŞLEMLER", 20_000.00),
            ("ARZU KORKMAZ", 220_000.00),
            ("UZMAN KİRA", 70_000.00),
            ("DGR KİRA", 75_000.00),
        ],
        pos_withdrawals=[
            ("Bİ DÜNYA ELEKTRİK POS", 935_500.00, 19_739.05),
            ("DİŞLİOĞLU YAPIKREDİ POS", 710_670.00, 12_081.39),
            ("RÜZGAR AĞIR VASITA YAPI POS", 220_000.00, 3_872.00),
        ],
        ozkan=[
            ("ÖZKAN-ÇİMENTO", 482_000.00, 462_720.00),
            ("ÖZKAN-ÇİMENTO GELEN PARA", 400_000.00, 400_000.00),
        ],
        ins=[
            ("KIZILAY POS KAR", 35_700.00, "POS", "KIZILAY POS"),
            ("ÇİMENTO", 7_230.00, "NAKIT", None),
        ],
        actual_balance=27_493_589.00,
    ),
    "2026-05-06": dict(
        nakit_out=("Günlük nakit harcama toplamı", 124_300.00),
        hesapdan_outs=[
            ("YEP KİRA", 6_000.00),
            ("KUMTAŞ KİRA", 33_000.00),
            ("TANGÜN KİRA", 7_500.00),
            ("ÇİFTLİK GİDER", 190_000.00),
        ],
        pos_withdrawals=[
            ("Bİ DÜNYA ELEKTRİK POS", 1_630_550.00, 31_143.50),
            ("DİŞLİOĞLU YAPIKREDİ POS", 165_000.00, 2_805.00),
            ("RÜZGAR AĞIR VASITA YAPI POS", 1_328_900.00, 23_388.64),
            ("UZMAN GRUP POS", 295_400.00, 7_119.14),
        ],
        ozkan=[],
        ins=[
            ("KIZILAY POS KAR", 64_420.00, "POS", "KIZILAY POS"),
            ("KOR KORAY SENET", 350_000.00, "HESAPDAN", None),
        ],
        actual_balance=27_546_866.44,
    ),
    "2026-05-07": dict(
        nakit_out=("Günlük nakit harcama toplamı", 223_750.00),
        hesapdan_outs=[
            ("RECEP ÇOPUR", 45_000.00),
            ("HASAN HÜSEYİN BAĞDATLI", 95_000.00),
            ("OSMAN HAFTALIK", 8_000.00),
            ("ERCAN İŞLEMLER", 10_000.00),
            ("ÇİFTLİK GİDER", 83_250.00),
        ],
        pos_withdrawals=[
            ("Bİ DÜNYA ELEKTRİK POS", 2_325_500.00, 39_766.05),
            ("DİŞLİOĞLU YAPIKREDİ POS", 233_110.00, 3_962.87),
            ("UZMAN GRUP POS", 378_000.00, 9_109.80),
        ],
        ozkan=[],
        ins=[
            ("KIZILAY POS KAR", 52_650.00, "POS", "KIZILAY POS"),
            ("KANKA GELİR", 1_085_000.00, "HESAPDAN", None),  # KANKA GELİR(DOLAR)
            ("SİNCAN BELEDİYESİ", 70_000.00, "HESAPDAN", None),
            ("TAHA", 10_000.00, "HESAPDAN", None),  # TAHA ÖDEME
        ],
        actual_balance=28_297_235.54,
    ),
    "2026-05-08": dict(
        nakit_out=("Günlük nakit harcama toplamı", 193_300.00),
        hesapdan_outs=[
            ("MEHMET ALİ BAĞDATLI", 70_000.00),
            ("ERCAN İŞLEMLER", 25_000.00),
            ("SİTELER (çalışanlar)", 68_600.00),  # SİTELER ELEMANLAR
        ],
        pos_withdrawals=[
            ("DİŞLİOĞLU YAPIKREDİ POS", 181_650.00, 3_088.05),
            ("RÜZGAR AĞIR VASITA YAPI POS", 118_650.00, 2_088.24),
            ("UZMAN GRUP POS", 100_000.00, 3_410.00),
        ],
        ozkan=[],
        ins=[
            ("KIZILAY POS KAR", 8_586.29, "POS", "KIZILAY POS"),
            ("ENS TEKNİK", 100_000.00, "HESAPDAN", None),
            ("METAŞ", 100_000.00, "HESAPDAN", None),
            ("METAŞ NAKLİYE", 50_000.00, "HESAPDAN", None),
            ("OĞUZ MONTAJ", 14_800.00, "NAKIT", None),
            ("DAMGA VERGİSİ", 10_000.00, "HESAPDAN", None),
        ],
        actual_balance=28_222_119.61,
    ),
    "2026-05-11": dict(
        nakit_out=("Günlük nakit harcama toplamı", 116_750.00),
        hesapdan_outs=[
            ("ÇİFTLİK GİDER", 30_000.00),
            ("KÜRŞAD YOL", 10_000.00),  # KÜRŞAD YOL MASRAF
            ("ÇİFTLİK GİDER", 30_000.00),  # CUMARTESİ ATILDI
            ("DAMGA VERGİSİ", 9_500.00),
            ("ANTEP YOL", 10_000.00),  # ANTEP YOL PARASI
        ],
        pos_withdrawals=[
            ("Bİ DÜNYA ELEKTRİK POS", 1_900_000.00, 40_090.00),
            ("DİŞLİOĞLU YAPIKREDİ POS", 292_050.00, 4_964.85),
            ("UZMAN GRUP POS", 190_000.00, 4_579.00),
        ],
        ozkan=[
            ("ÖZKAN-ÇİMENTO", 683_000.00, 655_680.00),
            ("ÖZKAN-ÇİMENTO GELEN PARA", 754_000.00, 754_000.00),
            ("ÖZKAN-ÇİMENTO GÖNDERİLEN PARA", -71_000.00, -71_000.00),  # negatif IN → expense
        ],
        ins=[
            ("KIZILAY POS KAR", 61_920.00, "POS", "KIZILAY POS"),
            ("ÇİMENTO", 10_245.00, "NAKIT", None),
            ("MİMSAN", 200_000.00, "HESAPDAN", None),
            ("KÜRŞAD CANKART", 25_800.00, "HESAPDAN", None),  # KÜRŞAD KOÇ CANKART
        ],
        actual_balance=28_313_051.94,
    ),
    "2026-05-12": dict(
        nakit_out=("Günlük nakit harcama toplamı", 31_700.00),
        hesapdan_outs=[
            ("FERHAN AYDIN", 9_300.00),  # FERHAN AYDIN KART GİDERİ
            ("MEHMET ALİ BAĞDATLI", 20_000.00),
            ("KANKA GİDER", 130_000.00),
            ("KIRAÇ SMART", 14_000.00),
            ("ERCAN İŞLEMLER", 10_000.00),
        ],
        pos_withdrawals=[
            ("DİŞLİOĞLU YAPIKREDİ POS", 854_000.00, 14_518.00),
            ("RÜZGAR AĞIR VASITA YAPI POS", 405_500.00, 7_136.80),
            ("UZMAN GRUP POS", 165_000.00, 3_976.50),
        ],
        ozkan=[
            ("ÖZKAN-ÇİMENTO", 357_700.00, 343_392.00),
            ("ÖZKAN-ÇİMENTO GELEN PARA", 357_700.00, 357_700.00),
        ],
        ins=[
            ("KIZILAY POS KAR", 23_650.00, "POS", "KIZILAY POS"),
            ("ÇİMENTO", 5_365.50, "NAKIT", None),
            ("MİMSAN SENET", 50_000.00, "HESAPDAN", None),
            ("KÜRŞAD ÜNİTEK", 50_000.00, "HESAPDAN", None),
            ("DENİZBANK ÇEK", 400_000.00, "HESAPDAN", None),
            ("MRG KARGO ÇEK", 97_300.00, "HESAPDAN", None),
            ("TAHA FATİH AKMAN", 50_000.00, "HESAPDAN", None),
        ],
        actual_balance=28_773_312.50,
    ),
    "2026-05-13": dict(
        nakit_out=("Günlük nakit harcama toplamı", 75_200.00),
        hesapdan_outs=[
            ("DAMGA VERGİSİ", 10_000.00),
            ("FİNANSBANK ÇAKIRDAĞ", 20_000.00),  # FİNANSBANK ÇAKIRDAĞ PAKET
        ],
        pos_withdrawals=[
            ("Bİ DÜNYA ELEKTRİK POS", 890_300.00, 17_004.73),
            ("DİŞLİOĞLU YAPIKREDİ POS", 647_650.00, 11_010.05),
        ],
        ozkan=[
            ("ÖZKAN-ÇİMENTO", 853_500.00, 819_360.00),
            ("ÖZKAN-ÇİMENTO GELEN PARA", 688_500.00, 688_500.00),
        ],
        ins=[
            ("KIZILAY POS KAR", 28_014.78, "POS", "KIZILAY POS"),
            ("ÇİMENTO", 12_802.50, "NAKIT", None),
        ],
        actual_balance=28_706_836.28,
    ),
    "2026-05-14": dict(
        nakit_out=("Günlük nakit harcama toplamı", 52_900.00),
        hesapdan_outs=[
            ("TABELA PURSAKLAR", 2_500.00),
        ],
        pos_withdrawals=[
            ("Bİ DÜNYA ELEKTRİK POS", 783_000.00, 13_389.30),
            ("DİŞLİOĞLU YAPIKREDİ POS", 120_000.00, 2_040.00),
            ("RÜZGAR AĞIR VASITA YAPI POS", 51_850.00, 912.56),
            ("UZMAN GRUP POS", 47_500.00, 1_382.25),
        ],
        ozkan=[],
        ins=[
            ("KIZILAY POS KAR", 17_725.00, "POS", "KIZILAY POS"),
        ],
        actual_balance=28_667_181.43,
    ),
    "2026-05-15": dict(
        nakit_out=("Günlük nakit harcama toplamı", 93_900.00),
        hesapdan_outs=[
            ("SERVET KAPLI", 5_000.00),
            ("HASAN HÜSEYİN BULUT", 370_000.00),
            ("SİTELER (çalışanlar)", 43_000.00),  # SİTELER HAFTALIK+PROMOSYON
        ],
        pos_withdrawals=[
            ("Bİ DÜNYA ELEKTRİK POS", 2_290_032.50, 39_159.56),
            ("UZMAN GRUP POS", 266_000.00, 7_740.60),
        ],
        ozkan=[],
        ins=[
            ("KIZILAY POS KAR", 46_900.00, "POS", "KIZILAY POS"),
            ("BAYRAM AKSARAY", 46_800.00, "HESAPDAN", None),
            ("ENS TEKNİK", 100_000.00, "HESAPDAN", None),
            ("METAŞ", 100_000.00, "HESAPDAN", None),
            ("DAMGA VERGİSİ", 10_000.00, "HESAPDAN", None),
        ],
        actual_balance=28_458_014.00,
    ),
}

DAY_ORDER = ["2026-05-04","2026-05-05","2026-05-06","2026-05-07","2026-05-08",
             "2026-05-11","2026-05-12","2026-05-13","2026-05-14","2026-05-15"]


# ── Execute ─────────────────────────────────────────────────────────────

def main():
    login()

    # 2. DGR business
    print("[step] Creating DGR business...")
    code, biz = http("POST", "/businesses", {"name": "DGR", "currency": "TRY"})
    if code not in (200, 201):
        raise RuntimeError(f"Business create failed: {code} {biz}")
    DGR_ID = biz["id"]
    print(f"  DGR id = {DGR_ID}")

    # 3. system_setting (actual schema: setting_key / setting_value)
    print("[step] system_setting.tenant.single_business_id...")
    sql("INSERT INTO system_setting(setting_key, setting_value, updated_at) "
        "VALUES('tenant.single_business_id', ?, NOW()) "
        "ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value, updated_at=NOW();",
        DGR_ID)

    # 4. Counterparts
    print(f"[step] Creating {len(FIRMS)} firms + {len(PERSONS)} persons...")
    cp = {}
    for name in FIRMS + PERSONS:
        if name in cp:
            continue
        code, r = http("POST", "/counterparts", {"name": name, "role": "OTHER"})
        if code in (200, 201):
            cp[name] = r["id"]
        else:
            print(f"  WARN counterpart '{name}': {code} {r}")
    print(f"  {len(cp)} counterpart created")

    # kind ayrımı (varsa)
    try:
        firm_in = ",".join(f"'{n}'" for n in [x.replace("'", "''") for x in FIRMS])
        sql(f"UPDATE counterparts SET kind='FIRM' WHERE name IN ({firm_in});")
        person_in = ",".join(f"'{n}'" for n in [x.replace("'", "''") for x in PERSONS])
        sql(f"UPDATE counterparts SET kind='PERSON' WHERE name IN ({person_in});")
        print("  FIRM/PERSON kind ayrımı OK")
    except RuntimeError as e:
        print(f"  (kind ayrımı atlandı: {e})")

    # 5. Bank accounts (v1.6.23.4: artık API üzerinden, BUG-3 fix)
    print(f"[step] Creating {len(ACTIVE_BANKS)} active + {len(INACTIVE_BANKS)} inactive bank accounts (API)...")
    bank = {}
    for name, bn in ACTIVE_BANKS:
        payload = {"name": name, "type": "CHECKING", "currency": "TRY"}
        if bn:
            payload["bank_name"] = bn
        code, r = http("POST", "/bank-accounts", payload)
        if code in (200, 201):
            bank[name] = r["id"]
        else:
            print(f"  WARN bank create '{name}': {code} {r}")
    # Inactive bank accounts: API create + PATCH /active to false
    for name in INACTIVE_BANKS:
        code, r = http("POST", "/bank-accounts", {"name": name, "type": "CHECKING", "currency": "TRY"})
        if code not in (200, 201):
            print(f"  WARN inactive bank create '{name}': {code} {r}")
            continue
        bid = r["id"]
        # pasif yap
        code2, r2 = http("PATCH", f"/bank-accounts/{bid}/active", {"is_active": False})
        if code2 != 200:
            print(f"  WARN bank deactivate '{name}': {code2} {r2}")
    # CASH_HOLDER GÖKHAN ELDEKİ — counterpart.kind=PERSON gerekli (kind ayrımı yukarıda yapıldı)
    gid = cp.get("GÖKHAN (Eldeki)") or cp.get("GÖKHAN")
    if gid:
        code, r = http("POST", "/bank-accounts", {
            "name": "GÖKHAN ELDEKİ",
            "type": "CASH_HOLDER",
            "currency": "TRY",
            "holder_person_id": gid,
        })
        if code in (200, 201):
            bank["GÖKHAN ELDEKİ"] = r["id"]
        else:
            print(f"  WARN GÖKHAN ELDEKİ (CASH_HOLDER): {code} {r}")
    print(f"  {len(bank)} active bank ledger ready")
    DEFAULT_BANK = bank.get("DGR FİNANS")

    # 6. POS devices
    print(f"[step] Creating {len(POS_DEVICES)} POS devices...")
    pos = {}
    for name, owner, rate in POS_DEVICES:
        payload = {"name": name, "default_rate": rate}
        owner_id = cp.get(owner)
        if owner_id:
            payload["owner_counterpart_id"] = owner_id
        code, r = http("POST", "/pos-devices", payload)
        if code in (200, 201):
            pos[name] = r["id"]
        else:
            print(f"  WARN POS '{name}': {code} {r}")
    print(f"  {len(pos)} POS device created")

    # 7. Opening debts (direction: RECEIVABLE / PAYABLE)
    print(f"[step] Opening debts: {len(OPEN_RECEIVABLES)} RECEIVABLE + {len(OPEN_PAYABLES)} PAYABLE + {len(KASADAN_PAYABLES)} KASADAN...")
    debt_n = 0
    def post_debt(direction, name, amount, **extra):
        nonlocal debt_n
        payload = {
            "direction": direction,
            "counterparty": name,
            "amount": float(amount),
            "instrument_type": "NAKIT",
            "currency": "TRY",
        }
        if name in cp:
            payload["counterpart_id"] = cp[name]
        if direction == "RECEIVABLE":
            payload["receivable_type"] = "DIGER"
            payload["receivable_type_other"] = "Açılış alacak"
        payload.update(extra)
        code, r = http("POST", f"/businesses/{DGR_ID}/debts", payload)
        if code not in (200, 201):
            print(f"  WARN debt {direction} '{name}': {code} {r}")
        else:
            debt_n += 1

    for name, amt in OPEN_RECEIVABLES:
        post_debt("RECEIVABLE", name, amt, description="Açılış alacak (04.05 öncesi)")
    for name, amt in OPEN_PAYABLES:
        post_debt("PAYABLE", name, amt, description="Açılış borç (04.05 öncesi)")
    for name, amt in KASADAN_PAYABLES:
        extra = {"description": "Açılış kasadan-çıkacaklar listesi"}
        if name == "TUNAHAN ÇİFTÇİ":
            extra["reminder_date"] = "2026-06-09"
            extra["reminder_note"] = "AYIN 9'unda hatırlat"
        post_debt("PAYABLE", name if name != "(?) belirsiz" else "BELIRSIZ", amt, **extra)
    # ÖZKAN açılış borç (04.05 dünkü borç -167066)
    post_debt("PAYABLE", "ÖZKAN", DAYS["2026-05-04"].get("opening_ozkan_debt", 0),
              description="ÖZKAN POS - Dünkü borç carry-over")
    print(f"  {debt_n} debts created")

    # 8. Opening cash_closing 03.05.2026 (v1.6.23.4: API üzerinden, BUG-2 fix)
    print("[step] Opening cash_closing 03.05.2026 (API: POST /closings backdate)...")
    OPENING_BALANCE = Decimal("28387220.78")
    code, r = http("POST", "/closings", {
        "closing_date": "2026-05-03",
        "actual_balance": float(OPENING_BALANCE),
        "reason_category": "OTHER",
        "reason_note": "Sandbox seed opening",
    })
    if code not in (200, 201):
        print(f"  WARN opening closing 03.05: {code} {r}")
        raise RuntimeError("Opening closing failed")

    # 9. Daily transactions (API) + 10. Cash closings (SQL backdate)
    prev_actual = OPENING_BALANCE
    for date in DAY_ORDER:
        d = DAYS[date]
        print(f"[day {date}] starting...")
        tx_n = 0

        # NAKIT toplam harcama (tek tx)
        desc, amt = d["nakit_out"]
        code, r = http("POST", f"/businesses/{DGR_ID}/transactions", {
            "direction": "expense",
            "amount": float(amt),
            "currency": "TRY",
            "description": desc,
            "date": date,
            "payment_method": "NAKIT",
        })
        if code in (200, 201): tx_n += 1
        else: print(f"  WARN nakit_out: {code} {r}")

        # HESAPDAN OUT (her satır)
        for name, amount in d["hesapdan_outs"]:
            payload = {
                "direction": "expense",
                "amount": float(amount),
                "currency": "TRY",
                "description": name,
                "date": date,
                "payment_method": "HESAPDAN",
                "bank_account_id": DEFAULT_BANK,
            }
            if name in cp:
                payload["target_counterpart_id"] = cp[name]
            code, r = http("POST", f"/businesses/{DGR_ID}/transactions", payload)
            if code in (200, 201): tx_n += 1
            else: print(f"  WARN HESAPDAN out '{name}': {code} {r}")

        # POS withdrawals (income POS, applied_pos_rate hesaplanmış)
        for device_name, cekim, pos_kar in d["pos_withdrawals"]:
            if cekim <= 0:
                continue
            applied_rate = round(abs(pos_kar) / cekim * 100, 4) if cekim != 0 else 0
            payload = {
                "direction": "income",
                "amount": float(cekim),
                "currency": "TRY",
                "description": f"POS çekim - {device_name}",
                "date": date,
                "payment_method": "POS",
                "pos_rate": float(applied_rate),
            }
            if device_name in pos:
                payload["pos_device_id"] = pos[device_name]
            code, r = http("POST", f"/businesses/{DGR_ID}/transactions", payload)
            if code in (200, 201): tx_n += 1
            else: print(f"  WARN POS '{device_name}': {code} {r}")

        # ÖZKAN POS özel grup
        for label, cekim, hesaba_dusen in d.get("ozkan", []):
            if "GELEN PARA" in label:
                # IN HESAPDAN, counterpart=ÖZKAN
                amount = abs(cekim)
                direction = "income" if cekim > 0 else "expense"
                payload = {
                    "direction": direction,
                    "amount": float(amount),
                    "currency": "TRY",
                    "description": label,
                    "date": date,
                    "payment_method": "HESAPDAN",
                    "bank_account_id": DEFAULT_BANK,
                }
                if "ÖZKAN" in cp:
                    payload["target_counterpart_id"] = cp["ÖZKAN"]
                code, r = http("POST", f"/businesses/{DGR_ID}/transactions", payload)
                if code in (200, 201): tx_n += 1
                else: print(f"  WARN ÖZKAN GELEN PARA: {code} {r}")
            elif "GÖNDERİLEN PARA" in label:
                amount = abs(cekim)
                payload = {
                    "direction": "expense",
                    "amount": float(amount),
                    "currency": "TRY",
                    "description": label,
                    "date": date,
                    "payment_method": "HESAPDAN",
                    "bank_account_id": DEFAULT_BANK,
                }
                if "ÖZKAN" in cp:
                    payload["target_counterpart_id"] = cp["ÖZKAN"]
                code, r = http("POST", f"/businesses/{DGR_ID}/transactions", payload)
                if code in (200, 201): tx_n += 1
                else: print(f"  WARN ÖZKAN GÖNDERİLEN: {code} {r}")
            else:
                # ÇİMENTO çekim (POS tx)
                if cekim <= 0:
                    continue
                applied_rate = round((cekim - hesaba_dusen) / cekim * 100, 4) if cekim != 0 else 0
                payload = {
                    "direction": "income",
                    "amount": float(cekim),
                    "currency": "TRY",
                    "description": label,
                    "date": date,
                    "payment_method": "POS",
                    "pos_rate": float(applied_rate),
                }
                if "ÖZKAN POS — ÇİMENTO" in pos:
                    payload["pos_device_id"] = pos["ÖZKAN POS — ÇİMENTO"]
                if "ÖZKAN" in cp:
                    payload["target_counterpart_id"] = cp["ÖZKAN"]
                code, r = http("POST", f"/businesses/{DGR_ID}/transactions", payload)
                if code in (200, 201): tx_n += 1
                else: print(f"  WARN ÖZKAN-ÇİMENTO: {code} {r}")

        # INs
        for name, amount, pm, pos_dev_name in d["ins"]:
            payload = {
                "direction": "income",
                "amount": float(amount),
                "currency": "TRY",
                "description": name,
                "date": date,
                "payment_method": pm,
            }
            if pm == "POS" and pos_dev_name and pos_dev_name in pos:
                payload["pos_device_id"] = pos[pos_dev_name]
                payload["pos_rate"] = 0.0  # KIZILAY POS KAR direct income
            if pm == "HESAPDAN":
                payload["bank_account_id"] = DEFAULT_BANK
            if name in cp:
                payload["target_counterpart_id"] = cp[name]
            code, r = http("POST", f"/businesses/{DGR_ID}/transactions", payload)
            if code in (200, 201): tx_n += 1
            else: print(f"  WARN IN '{name}': {code} {r}")

        # Day cash closing (v1.6.23.4: API üzerinden, BUG-2 fix)
        ac = Decimal(str(d["actual_balance"]))
        code, r = http("POST", "/closings", {
            "closing_date": date,
            "actual_balance": float(ac),
            "reason_category": "OTHER",
            "reason_note": f"Sandbox seed ({tx_n} tx)",
        })
        if code not in (200, 201):
            print(f"  WARN closing {date}: {code} {r}")
        else:
            diff = Decimal(str(r.get("difference", "0")))
            print(f"  {date} done: {tx_n} tx, actual={ac}, computed_diff={diff}")

        prev_actual = ac

    print("\n[DONE] Sandbox seed completed.")
    print(f"  DGR business id: {DGR_ID}")
    print(f"  Login: admin / admin123")
    print(f"  URL: http://localhost:8080")
    print(f"  Verify: GET /closings?from=2026-05-03&to=2026-05-15")
    print(f"  Verify: GET /pos-devices/analytics?from=2026-05-04&to=2026-05-15")


if __name__ == "__main__":
    main()
