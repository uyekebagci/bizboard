# Architecture Rules — BizBoard

**Owner:** mimari kararlar; her PR'da bu checklist uygulanır.
**Status:** v1 (2026-05-21). Security WP 667d8a71 / TODO f192ed7e.

Bu dosya tek doğru kaynak — kod review, yeni feature, yeni endpoint
hepsi buradaki kurallara uymalı. Kural değişirse önce burası güncellenir,
sonra kod.

---

## 1. Multi-Tenant by Default

> **Hiçbir kullanıcı kendi tenant'ı dışındaki veriyi görmemeli, hiçbir
> mutate'i çağıramamalı.** "DGR tek tenant" varsayımı kabul edilemez —
> ileride 2. tenant geleceği için herşey en başından izole edilmiş olmalı.

### 1.1 Veri katmanı (Entity)

İş verisi tutan her tablo aşağıdaki üç sınıftan birinde olmalı:

| Sınıf | Tanım | Örnek | Kural |
|---|---|---|---|
| **A. Business-bound** | Tek bir tenant'a ait, başkasının görmemesi gereken veri | `transaction`, `bank_account`, `employee`, `vehicle`, `phone_device`, `pos_device`, `counterpart`, `inventory_item`, `fixed_cost`, `business_note`, `debt`, `file_upload`, `fuel_log`, `maintenance_log`, `category` (business-scoped olanı) | `business_id UUID NOT NULL FK` zorunlu. Index `(business_id, …)` üzerine. |
| **B. Master / shared** | Lookup tablosu, tüm tenant'lar aynı veriyi okur | `phone_brand`, `phone_model`, `system_setting`, `currency_rate` | `business_id` olmaz. Yazma admin-only. |
| **C. Operational** | Sistem iç verisi | `user`, `business`, `business_member`, `refresh_token`, `audit_log`, `notification` | `business_id` mantığı tabloya özel. (örn. `notification.business_id` event'in tenant'ı; `user.accessible_businesses` user'ın hangi tenant'lara erişebileceği) |

**Yeni tablo eklerken** önce yukarıdaki sınıflandırmayı yap. A sınıfı ise
migration'da business_id NOT NULL + FK + index zorunlu (nullable bırakıp
sonra "ekleriz" yapma — birikim tehlikeli).

### 1.2 Servis katmanı

Business-bound entity üzerinde **mutate yapan her servis metodu** ilk
satır olarak:

```java
accessGuard.assertCanAccessBusiness(actorUserId, entity.getBusiness().getId());
```

çağırmalı. Bu kural "controller yapıyor zaten" gerekçesiyle atlanamaz —
defense-in-depth: bir controller path scoping unutursa servis hâlâ
kapatır.

### 1.3 Controller / HTTP katmanı

Business-bound endpoint'in iki kabul edilebilir şekli var:

**A. Path-scoped (tercih edilen):**

```
/businesses/{businessId}/<resource>     # list / create
/businesses/{businessId}/<resource>/{id} # read / update / delete
```

Controller giriş satırında:

```java
accessGuard.assertCanAccessBusiness(principal.getId(), businessId);
```

**B. Resource-scoped (bank_account, pos_device gibi tenant-agnostic
URL'ler):**

```
/<resource>            # list
/<resource>/{id}       # read / update / delete
```

Controller:
- **List:** `accessGuard.accessibleBusinessIds(principal.getId())` ile
  filter. Boş liste → 200 + boş array.
- **`/{id}` ops:** entity'yi yükle → `assertCanAccessBusiness` çağır.
  Erişim yoksa `SecurityException` (404'e çevrilir; existence reveal
  açma).

### 1.4 Erişim kararı

`BusinessAccessGuard` tek noktadan karar verir. Kural:

| Kullanıcı | Erişim |
|---|---|
| `role=admin` | Tüm businesses |
| `accessible_businesses='all'` | Tüm businesses |
| `accessible_businesses='uuid1,uuid2,…'` | Listede olanlar |
| Hiçbiri (legacy) | owner + member fallback |

Bu mantık servislerde tekrar tekrar yazılmaz — daima guard'dan geçer.

### 1.5 Hata mesajları

Erişim yokken **404 dön** ("Hesap bulunamadi"), 403 değil — 403 "buna
erişimin yok ama VAR" sinyali verir (existence reveal). 403 sadece açıkça
kimlik doğrulanmış ama action'ı yapamayan durumlar için.

Anonim → 401.

---

## 2. PR Checklist — Multi-Tenant Kontrolleri

Yeni endpoint / yeni entity / yeni mutate ekleyen PR'da:

- [ ] **Veri sınıflandırması:** Bu tablo A / B / C hangisi? A ise
  `business_id NOT NULL FK` var mı? Index var mı?
- [ ] **Service guard:** Mutate yapan her metod ilk satırda
  `accessGuard.assertCanAccessBusiness` çağırıyor mu?
- [ ] **Controller path:** Path-scoped mu, resource-scoped mu? Hangisi
  olursa olsun list filter + `/{id}` access check var mı?
- [ ] **Anonim test:** Token'sız çağrı → 401 mi?
- [ ] **Cross-tenant GET test:** User A token'ı ile User B'nin id'si
  → 404 mü? (303 değil, 200 değil, 403 değil — 404.)
- [ ] **Cross-tenant mutate test:** User A token'ı ile User B'nin id'si
  PATCH/DELETE → 403 mü?
- [ ] **List filter test:** Admin → hepsi, User → kendi tenant(lar)ı
  → 0 cross-tenant kayıt.
- [ ] **Tx tablosuna FK var mı:** Bu yeni entity'ye transaction veya
  başka business-bound entity FK tutuyor mu? Cascade delete riski?

Bir madde ✗ ise PR merge etmem.

---

## 3. Pen-test Kuralı

Her güvenlik WP'sinde pen-test = sıfır cross-tenant veri. Pass kriterleri:

1. Admin görür → tüm tenant'ların toplamı
2. Multi-tenant User (A erişimi var) → sadece A
3. Direct `/{B-id}` GET → 404 + "bulunamadi" mesajı
4. Direct `/{B-id}` mutate → 403
5. Anonim → 401
6. Empty access (`accessible_businesses=NULL` ve member değil) → boş list

Pen-test geçmeden commit yok, beta açılış kapısı yok.

---

## 4. Beta Açılış Kapısı (gate)

Beta açılışı şu şartlar tamamlanmadan açılmaz:

- [ ] `bank_account` ✓ (v1.6.23.19)
- [ ] `phone_device` controller guard (v1.6.23.20)
- [ ] `pos_device` business_id + filter
- [ ] `counterpart` business_id + filter (veya açıkça shared olarak
  işaretle ve docs'a yaz)
- [ ] `file_upload` business_id + download/delete guard
- [ ] `fuel_log` / `maintenance_log` direct `/{id}` guard
- [ ] `category` business-scoped CRUD filter
- [ ] **Full sweep pen-test:** Section 3'teki tüm kriterler tüm A-sınıfı
  tablolarda geçmeli — her tablo için 6 case.

---

## 5. Tarihsel TODO Listesi (Security WP 667d8a71)

| TODO | Entity | Status | Notlar |
|---|---|---|---|
| 7432143f | bank_account.business_id | ✓ done v1.6.23.19 | 49/49 row backfill DGR |
| 809834ef | accessibleBusinessIds helper | ✓ done v1.6.23.19 | reusable |
| 43c808fd | Audit tüm entity | ✓ done v1.6.23.19 | bu dosya çıktısı |
| f192ed7e | Multi-tenant by Default kuralı | ✓ done v1.6.23.20 | bu dosya |
| 15b1dd12 | phone_device controller filter | pending | en kritik (bu PR) |
| (yeni) | pos_device business_id + filter | pending | bu PR |
| (yeni) | counterpart business_id veya shared model | pending | bu PR |
| (yeni) | file_upload business_id | pending | bu PR |
| (yeni) | fuel_log / maintenance_log direct /{id} guard | pending | bu PR |
| (yeni) | category business-scoped CRUD audit | pending | bu PR |

---

## 6. "Test yazma" kuralı

DGR ekibi şu an manual QA yapıyor; otomatik test suite'i yok. Bu yüzden:

- **Unit / integration test yazma** — istek olmadıkça.
- **Pen-test:** curl + DB seed ile, sadece WP commit'i için. Geçici test
  kullanıcısı + işletmesi yarat, doğrula, **temizleme adımı dahil** olsun
  veya kalıcı `pentest-user` olarak bırakıp docs'a yaz.
- **Doğrulamayı kullanıcı yapar.** Sen kodu yaz, leakage olmadığından
  emin ol; testi kullanıcı koşar.
