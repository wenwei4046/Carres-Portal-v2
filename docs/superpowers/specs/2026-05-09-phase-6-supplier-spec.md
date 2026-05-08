# Phase 6 · Supplier — V1 Spec

**Status**: Draft locked 2026-05-09 ~01:25 GMT+8 (4 questions answered).
**Owner**: Loo (Chairman) + Claude Code.
**Master plan reference**: `CARRES_PORTAL_V2_PLAN.md` §8 lines 682-705.
**Reference protos**: `reference/proto/supplier.jsx`, `supplier-pages.jsx`, `supplier-actions.jsx`, `supplier-mobile.jsx`, `principal-suppliers.jsx`.

---

## 1. Why Phase 6 now

Phase 5 Finance closed clean (HEAD `2c22d7b`, 988/988 green). Master plan §8 sequencing → Supplier next. Schema is 90% pre-staged: `app_supplier_id()`, RLS, JWT claim, `po_sup_status` enum, `suppliers.kind/cat_covered/lead_time/portal_enabled` all already exist. Phase 6 is mostly **API routes + web pages + a few small RPCs** — no big schema work.

## 2. Locked decisions

| # | Question | Answer |
|---|---|---|
| Q1 | Scope | **A. Full proto** — Dashboard + Incoming + POs + SKU (4 pages) |
| Q2 | DO upload | **A. Text-only do_number for V1** — no Storage upload yet (Phase 7 partner POD work covers real file upload) |
| Q3 | Test seed | **B. Both supplier portal users** — `supplier@carres.com` (HoOKkA, own_logistics) + new `supplier-nf@carres.com` (Nice Future, factory_pickup) |
| Q4 | Mobile | **A. Defer mobile** — desktop-first per V2 norm (matches Phase 4/5 precedent). `supplier-mobile.jsx` becomes Phase 8 carry-forward. |

## 3. State machine — `po_sup_status`

Enum (already in `0001`):
```
pending → acknowledged → in_production →
  ready_for_pickup → pickup_assigned → pickup_accepted →
  picked_up → delivered
                                      ↓
                              reassign_needed (if customer rejects)
                                      ↓
                              ready_for_pickup (after Procurement reassigns warehouse)
                                      ↓
                              shipped (own_logistics direct ship variant — proto's supShip)
```

**Two flows by `suppliers.kind`:**

- **`own_logistics` (HoOKkA)**: pending → ack → in_prod → ready_for_pickup → pickup_assigned → pickup_accepted → picked_up → delivered
- **`factory_pickup` (Nice Future)**: pending → in_prod (skip ack) → ready_for_pickup → picked_up → delivered (Procurement pre-assigns partner+warehouse at PO creation per Sprint A; partner sees pickup task immediately)

**Phase 6 supplier-callable transitions** (the ONLY ones supplier touches):
1. `pending → acknowledged` (own_logistics only)
2. `pending|acknowledged → in_production`
3. `in_production → ready_for_pickup` (reuse existing `logistics_supplier_ready_confirm` — already supports supplier self-press per `0034:274`)
4. `pickup_accepted|shipped → delivered` (DO upload — supplier_mark_delivered with do_number+do_note)

(Logistics + Partner + Procurement own the other transitions; out of Phase 6 scope.)

## 4. Migration plan

### `0066_supplier_phase6_rpcs.sql`

Three new SECURITY DEFINER RPCs, all caller-gated to `app_role() = 'supplier' AND po.supplier_id = app_supplier_id()`:

```sql
supplier_acknowledge(p_po_id text)
  -- guards: sup_status = 'pending' AND suppliers.kind = 'own_logistics'
  -- mutates: sup_status → 'acknowledged'
  -- audit + po_history insert

supplier_start_production(p_po_id text)
  -- guards: sup_status IN ('pending','acknowledged')
  --         (pending only valid for factory_pickup; acknowledged only for own_logistics)
  -- mutates: sup_status → 'in_production'

supplier_mark_delivered(p_po_id text, p_do_number text, p_do_note text default null)
  -- guards: sup_status IN ('pickup_accepted','shipped')
  --         do_number not null + not empty
  -- mutates: sup_status → 'delivered', do_number = p_do_number,
  --          delivered_at = now(), updated_at = now()
```

(`logistics_supplier_ready_confirm` already covers in_prod → ready_for_pickup — reuse, don't duplicate.)

## 5. API plan

```
apps/api/src/routes/supplier/
  pos.ts            ← list (RLS-scoped) + get-detail + 3 transition routes
  products.ts       ← list own SKUs + open demand aggregate
```

### `pos.ts` routes

| Method | Path | RPC | Auth |
|---|---|---|---|
| GET | `/api/supplier/pos` | direct table query (RLS) | supplier |
| GET | `/api/supplier/pos/:id` | direct table query (RLS) | supplier |
| POST | `/api/supplier/pos/:id/acknowledge` | `supplier_acknowledge` | supplier |
| POST | `/api/supplier/pos/:id/start-production` | `supplier_start_production` | supplier |
| POST | `/api/supplier/pos/:id/ready-for-pickup` | `logistics_supplier_ready_confirm` | supplier |
| POST | `/api/supplier/pos/:id/mark-delivered` | `supplier_mark_delivered` | supplier |

### `products.ts` routes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/supplier/products` | list own SKUs (RLS via `product_skus.supplier_id`) |
| GET | `/api/supplier/products/demand` | aggregate open-PO demand by SKU (RLS-scoped) |

**Auth gate**: `requireSupplier` middleware in `apps/api/src/lib/auth-guards.ts` (mirrors `requireLogistics` from CF #1 sweep `cdc50fc`).

## 6. Web plan

```
apps/web/src/pages/supplier/
  SupplierApp.tsx             ← shell, /supplier/* routing, nested Routes
  SupplierSidebar.tsx         ← 4 nav tabs (dashboard / incoming / pos / sku)
  SupplierDashboard.tsx       ← KPIs + pipeline + top SKUs + recent activity (per proto:47-198)
  SupplierIncoming.tsx        ← pending sales-orders forecast for covered cats (per proto:697-781)
  SupplierPOs.tsx             ← 3-stage tabs (PO/Ready/Delivered) + PODrawer (per proto:203-683)
  SupplierSKU.tsx             ← Carres ↔ Supplier SKU cross-reference table (per proto:786-960)
  components/
    StatusPill.tsx            ← reusable for sup_status (proto:433-442)
    POCard.tsx                ← list-row card (proto:444-516)
    PODrawer.tsx              ← detail drawer with DO upload form (proto:532-683)
```

### `App.tsx` wire-up

- Add `/supplier/*` route block (mirrors `/finance/*` pattern)
- Add `RequireRole roles={["supplier"]}` wrapping `SupplierApp`
- Add `if (role === "supplier") return <Navigate to="/supplier" replace />;` to `HomeRedirect`

### `queries.ts` extension

```ts
qk.supplier = {
  pos: (filters?) => ['supplier','pos', filters ?? {}],
  po: (id) => ['supplier','pos', id],
  products: () => ['supplier','products'],
  demand: () => ['supplier','products','demand'],
  incoming: () => ['supplier','incoming'],  // pending sales-orders forecast
};
```

Plus 6 hooks: `useSupplierPos`, `useSupplierPo`, `useSupplierProducts`, `useSupplierDemand`, plus mutations `useAckPo`, `useStartProduction`, `useReadyForPickup`, `useMarkDelivered`.

(SupplierIncoming reuses dealer/orders read with status='place' filter — no new endpoint needed; an existing `/api/orders` route filtered client-side by category coverage works.)

## 7. Seed plan

`supabase/seed.sql` additions (in a new migration `0066_supplier_phase6_seed.sql` if seed.sql is a carry-forward concern, OR direct edit if seed.sql is still maintained):

```sql
-- Supplier portal user for Nice Future (factory_pickup)
insert into auth.users (id, email, ...) values (
  '11111111-1111-1111-1111-000000000007', 'supplier-nf@carres.com', ...
);
insert into app_users (id, email, name, role, supplier_id, ...) values (
  '11111111-1111-1111-1111-000000000007',
  'supplier-nf@carres.com',
  'Lim · Nice Future',
  'supplier',
  '00000000-0000-0000-0000-0000000000e2',  -- Nice Future
  ...
);

-- Flip portal_enabled=true for both suppliers
update suppliers set portal_enabled = true, contact_email = 'supplier@carres.com'
  where id = '00000000-0000-0000-0000-0000000000e1';
update suppliers set portal_enabled = true, contact_email = 'supplier-nf@carres.com'
  where id = '00000000-0000-0000-0000-0000000000e2';
```

(NB: `seed-sql-stale` is an open carry-forward from Chunk 2. Phase 6 seed work may close part of that CF.)

## 8. Acceptance (master plan §8)

1. ✅ Supplier 账号能看到 logistics 创建的 PO — RLS-scoped GET /api/supplier/pos returns own POs only
2. ✅ Supplier 能 acknowledge PO，状态 pending → acknowledged — POST /api/supplier/pos/:id/acknowledge
3. ✅ Supplier 能更新 sup_status (in_production → shipped → delivered) — start-production + ready-for-pickup + mark-delivered routes

Plus 1 happy-path Playwright E2E spec (test.fixme until seed verified locally):
- `phase-6-supplier-happy.spec.ts`: login as supplier@carres.com → see PO list → ack → start production → ready for pickup → (factory_pickup short-circuit OR await pickup_accepted via codex) → upload DO → see in Delivered tab

## 9. Test budget

Estimated additions:
- API tests: ~15 (pos.test.ts ~10, products.test.ts ~5)
- Web tests: ~15 (Dashboard 3 + Incoming 3 + POs 5 + SKU 3 + components 1)
- E2E: 1 (test.fixme)

Total target: 988 → ~1018 (+30).

## 10. Chunked execution plan

| Chunk | Scope | Est commits |
|---|---|---|
| **A. Foundation** | Spec doc + migration 0066 + seed updates + zod schemas + API supplier router + tests | 5-6 |
| **B. Web — Dashboard + POs** | App.tsx wire-up + sidebar + Dashboard + POs page + PODrawer + tests | 5-6 |
| **C. Web — Incoming + SKU + E2E** | Incoming + SKU + 1 E2E spec + CLAUDE.md §17 sync + tag | 3-4 |

**Total estimate**: 13-16 commits (vs Phase 5's 32).

## 11. Carry-forward expected

- `phase-6-storage-do-upload` (low) — replace text-only do_number with real Storage upload (defer to Phase 7 partner POD work)
- `phase-6-supplier-mobile` (low) — supplier-mobile.jsx not built (V2 desktop-first norm)
- `phase-6-incoming-server-side` (low) — SupplierIncoming currently client-filters orders by `status='place'` + covered cats. If perf bites, add dedicated `/api/supplier/incoming` RPC.
- `phase-6-pdf-do-print` (low) — proto has Print DO button; defer to Phase 9 PDF batch work.

## 12. Out of scope (Phase 7+)

- Real DO file upload (Phase 7 storage)
- Customer-facing partner-rejection bounce-back UI (already wired server-side; no supplier-facing change needed)
- Supplier-side SKU CRUD (read-only in Phase 6; Phase 9 if Loo wants it)
- Supplier mobile

---

**Ready for sign-off** → Chunk A kickoff after Loo's go.
