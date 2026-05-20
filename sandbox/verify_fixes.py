#!/usr/bin/env python3
"""
v1.6.23.4 fix verification — edge case + happy path tests.
3 bug için validation'ları test eder.
"""
import json, urllib.request, urllib.error, subprocess

BASE = "http://localhost:8080"

TOKEN = json.loads(subprocess.check_output([
    "curl","-s","-X","POST",f"{BASE}/auth/login",
    "-H","Content-Type: application/json",
    "-d",'{"username":"admin","password":"admin123"}'], text=True))["token"]

def http(method, path, body=None):
    req = urllib.request.Request(f"{BASE}{path}",
        data=json.dumps(body).encode() if body else None, method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode("utf-8"), strict=False) if r.read else None
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode("utf-8")
        try: return e.code, json.loads(body_txt, strict=False)
        except: return e.code, body_txt[:200]
    except Exception as e:
        return 0, str(e)

# Fetch a DGR business id (created by seed) + a counterpart
biz_list = http("GET", "/businesses")[1]
DGR = next(b["id"] for b in biz_list if b["name"] == "DGR")
# CounterpartDto kind field'ını expose etmediği için DB'den alıyoruz (test-only).
import os
PG_ENV = {**os.environ, "PGPASSWORD": "postgres"}
def db(q):
    return subprocess.check_output(
        ["psql","-h","localhost","-p","5432","-U","postgres","-d","bizboard","-At","-c", q],
        text=True, env=PG_ENV).strip()
firm_id = db("SELECT id FROM counterparts WHERE kind='FIRM' LIMIT 1;")
person_id = db("SELECT id FROM counterparts WHERE kind='PERSON' LIMIT 1;")
firm_cp = {"id": firm_id}
person_cp = {"id": person_id}

print("=" * 70)
print("v1.6.23.4 FIX VERIFICATION")
print("=" * 70)
results = []

def test(name, expected_status, *call):
    code, body = http(*call)
    ok = (isinstance(expected_status, (list, tuple)) and code in expected_status) or code == expected_status
    sym = "✓" if ok else "✗"
    msg = body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)[:80]
    print(f"  {sym} [{code}] {name}")
    if not ok:
        print(f"      expected {expected_status}, got {code}: {msg}")
    results.append(ok)

# ── BUG-1 (HESAPDAN): create tx HESAPDAN olmadan bank_account_id → 400 ──
print("\n--- BUG-1 (HESAPDAN validation) ---")
test("HESAPDAN tx WITHOUT bank_account_id → 400",
     400,
     "POST", f"/businesses/{DGR}/transactions",
     {"direction": "expense", "amount": 100, "date": "2026-05-15",
      "payment_method": "HESAPDAN"})

# happy path: with valid bank_account_id → 201
bank_list = http("GET", "/bank-accounts")[1]
default_bank = next(b for b in bank_list if b["name"] == "DGR FİNANS")
test("HESAPDAN tx WITH bank_account_id → 201",
     [200, 201],
     "POST", f"/businesses/{DGR}/transactions",
     {"direction": "expense", "amount": 100, "date": "2026-05-15",
      "payment_method": "HESAPDAN", "bank_account_id": default_bank["id"],
      "description": "verify_fixes.py test tx"})

# ── BUG-2 (Backdate closing): future date → 400 ──
print("\n--- BUG-2 (Backdate closing validation) ---")
test("POST /closings with FUTURE date → 400",
     400,
     "POST", "/closings",
     {"closing_date": "2099-01-01", "actual_balance": 100})

# Same-date duplicate without override → 409 (15.05 already CLOSED)
test("POST /closings duplicate date WITHOUT override → 409",
     409,
     "POST", "/closings",
     {"closing_date": "2026-05-15", "actual_balance": 999})

# Same-date with override=true → 200/201
test("POST /closings duplicate date WITH override=true → 201",
     [200, 201],
     "POST", "/closings",
     {"closing_date": "2026-05-15", "actual_balance": 28458014.00,
      "override": True, "reason_note": "verify_fixes.py override test"})

# ── BUG-3 (Bank CRUD): create CASH_HOLDER without holder → 400 ──
print("\n--- BUG-3 (Bank CRUD validation) ---")
test("POST /bank-accounts CASH_HOLDER without holder_person_id → 400",
     400,
     "POST", "/bank-accounts",
     {"name": "TEST_CASH_HOLDER_NO_HOLDER", "type": "CASH_HOLDER"})

# CASH_HOLDER with FIRM (not PERSON) — should reject if kind kontrolü çalışıyor
test("POST /bank-accounts CASH_HOLDER with FIRM holder → 400",
     400,
     "POST", "/bank-accounts",
     {"name": "TEST_CASH_HOLDER_FIRM", "type": "CASH_HOLDER",
      "holder_person_id": firm_cp["id"]})

# CASH_HOLDER with valid PERSON → 201
test("POST /bank-accounts CASH_HOLDER with PERSON holder → 201",
     [200, 201],
     "POST", "/bank-accounts",
     {"name": "TEST_CASH_HOLDER_PERSON", "type": "CASH_HOLDER",
      "holder_person_id": person_cp["id"]})

# PATCH update name → 200
test("PATCH /bank-accounts/{id} update name → 200",
     200,
     "PATCH", f"/bank-accounts/{default_bank['id']}",
     {"notes": "Updated by verify_fixes.py — sandbox test"})

# Invalid type → 400
test("POST /bank-accounts INVALID type → 400",
     400,
     "POST", "/bank-accounts",
     {"name": "BAD_TYPE", "type": "MERS_ACCOUNT"})

print()
ok = sum(results)
total = len(results)
print(f"=" * 70)
print(f"Result: {ok}/{total} test passed")
print(f"=" * 70)
exit(0 if ok == total else 1)
