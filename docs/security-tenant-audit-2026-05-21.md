# Multi-tenant Isolation Audit — 2026-05-21

**Scope:** v1.6.23.19 Security WP 667d8a71 — bonus audit of all business-bound
entities after `bank_account.business_id` gap was discovered & closed.

**Method:** Static review of `bizboard-common/.../entity/` (entity layer) +
`bizboard-api/.../controller/` (HTTP layer) + service layer. For each entity:

1. Does the JPA entity bind to `Business` via FK?
2. Does the controller path scope (`/businesses/{id}/...`) or call
   `BusinessAccessGuard.assertCanAccessBusiness` / `accessibleBusinessIds`?
3. Are direct `/{id}` endpoints gated?

## Findings

| Entity         | business_id FK | AC Enforced | Notes |
|----------------|----------------|-------------|-------|
| BankAccount    | ✓ (new)        | ✓ (new)     | **FIXED** in this WP. List filtered, /{id} access-checked, mutate gated. |
| Debt           | ✓              | ✓           | Path-scoped + guard. |
| Transaction    | ✓              | ✓           | Path-scoped (`/businesses/{id}/transactions`), service gates direct ops. |
| FixedCost      | ✓              | ✓           | Path-scoped + guard. |
| Employee       | ✓              | ✓           | Path-scoped + guard on direct /{id}. |
| Vehicle        | ✓              | ✓           | Path-scoped + guard on direct /{id}. |
| InventoryItem  | ✓              | ✓           | Path-scoped + guard on direct /{id}. |
| BusinessNote   | ✓              | ✓           | Path-scoped + guard. |
| **Counterpart**| **✗**          | **✗**       | **CRITICAL** — shared "data lake"; all endpoints open to any authenticated user. Cross-tenant write possible. |
| **PosDevice**  | **✗**          | **✗**       | **HIGH** — bound to Counterpart only, no Business FK. CRUD endpoints unguarded. |
| **PhoneDevice**| ✓              | **✗**       | **HIGH** — has business_id but controller doesn't enforce. Cross-tenant read/write via direct id. |
| **Category**   | ✓              | **partial** | Master + business-scoped flavors; no dedicated CRUD controller; needs verification. |
| **FileUpload** | **✗**          | partial     | **HIGH** — generic entity_type/entity_id; no tenant boundary. Document/receipt URLs may leak across tenants. |
| **FuelLog**    | **✗**          | transitive  | **MEDIUM** — only FK to Vehicle (which has business_id). Transitive control depends on vehicle endpoints; direct /fuel-logs/{id} would bypass. |
| **MaintenanceLog** | **✗**      | transitive  | **MEDIUM** — same shape as FuelLog. |

## New TODOs added to Security WP 667d8a71

These follow the same migration → entity → service guard → controller filter →
pen-test pattern used for BankAccount.

1. **TODO security-counterpart-tenant** (CRITICAL) — Add `business_id` to
   `counterparts` (or model as `shared_across_business=true` flag + a join
   table for tenant-scoped overrides). Guard all CRUD endpoints. Pen-test:
   USER A cannot see/mutate counterparts created by USER B.

2. **TODO security-posdevice-tenant** (HIGH) — Add `business_id` to
   `pos_devices` (or backfill via owner_counterpart→business). Guard CRUD.
   List filter by `accessibleBusinessIds`.

3. **TODO security-phonedevice-controller-guard** (HIGH) — Entity already
   has `business_id`; controller missing guard on GET/POST/PATCH/DELETE
   `/{id}`. Inject `BusinessAccessGuard` + assert on direct ops + filter list.

4. **TODO security-fileupload-tenant** (HIGH) — Add `business_id` to
   `file_uploads` (or denormalize from owning entity). Guard download +
   delete. Receipt-leakage is the worst case here (financial PII).

5. **TODO security-category-controller-audit** (MEDIUM) — Locate Category
   CRUD endpoint (or confirm there isn't one); if exists, gate by
   `accessibleBusinessIds` for business-scoped categories.

6. **TODO security-fuel-log-direct-id** (MEDIUM) — Ensure no `/fuel-logs/{id}`
   direct endpoint exists, OR if it does, gate by loading `log.vehicle.business`
   then `assertCanAccessBusiness`.

7. **TODO security-maintenance-log-direct-id** (MEDIUM) — Same as fuel-log.

## What this WP shipped

- `bank_accounts.business_id` NOT NULL FK + DGR backfill (49/49 rows)
- `BankAccount.business` entity field
- `BusinessAccessGuard.accessibleBusinessIds(userId)` helper (reusable)
- `BankAccountController.list` filter by `accessibleBusinessIds`
- `BankAccountController.detail` (`GET /{id}`) — access-checked, returns
  account info + last 10 tx + pending POS (business level) + 30-day balance
  trend
- `BankAccountService.{create,update,toggleActive}` gated by
  `assertCanAccessBusiness`
- `CreateBankAccountRequest.business_id` required + validated
- `BankAccountDto.business_id` + `business_name` exposed (UI uses for badge)
- `BankAccountDetailModal` UI wired to row click (havuz page)
- Pen-test PASSED (admin sees 51, USER sees 2, cross-tenant GET → 404,
  cross-tenant PATCH → 403, anonymous → 401)

## Pen-test transcript (summary)

```
A) Admin GET /bank-accounts (include_inactive)        → 51 (DGR:49 + TestA:2)
B) USER  GET /bank-accounts                           → 2 (only TestA)
C) USER  GET /bank-accounts/{DGR-id}                  → 404 (info leak closed)
D) USER  GET /bank-accounts/{TestA-id}                → 200 (own tenant)
E) USER  PATCH /bank-accounts/{DGR-id}/active         → 403 Access denied
F) Anon  GET /bank-accounts                           → 401
G) USER  POST /bank-accounts (DGR target)             → 403 admin-only
```
