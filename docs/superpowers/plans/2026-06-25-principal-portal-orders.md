# Principal Portal — create order (POS) + view/trace orders

> Decision (Loo, 2026-06-25): give the principal portal the dealer/showroom POS
> "create order" flow + the "view order detail / trace" flow, by REUSE.
> **Attribution = Option A**: a principal-created order is placed ON BEHALF OF a
> dealer the principal PICKS (dealer → outlet → salesperson). The order belongs to
> that dealer. The DB layer (`create_order` RPC + `orders` RLS) already admits a
> principal inserting for any `dealer_id` — the only hard requirement is a non-null
> `dealer_id` in the payload, which the picker supplies.

Investigation: the order-create + permission map (2026-06-25 agent sweep) confirmed
the RPC/RLS are already principal-ready; the walls are (1) the Hono gate that needs
a `dealerId`, (2) the Storage upload policy keyed to `app_dealer_id()` (NULL for
principal), (3) no orders UI mounted in PrincipalApp.

## Scope — two parts

### Part 1 — View / trace orders (cheap, web-only, NO backend/DB change)
Principal already has full order read (RLS `orders_scoped_read` admits `is_internal()`;
`GET /api/orders` + `/:id` already principal-permitted) — there's just no UI.
- Add an **"Orders" tab** to `PrincipalApp` (tab-state SPA) + `PrincipalSidebar`.
- Mount a thin principal-flavored list reusing `useOrders` + the `DealerOrders`
  bucketing/KPI (or a lighter table) + `DealerOrderDetail` for the drawer/detail.
  Drop the dealer-only Edit/Cancel mutations (read/trace only for v1).
- No API, no RPC, no migration.

### Part 2 — Create order (Option A: pick-a-dealer)
Reuse the entire POS (`pos/*` + `new-order/*` + `sofa-build/*` + `draft.ts` + `cart.ts`
+ configurators — all role-agnostic). The only dealer-coupling to break is the
**`dealerId` source** (currently `useAuth().dealerId`; for principal it's a SELECTED id).

**Web:**
- New principal POS route/tab. Reuse `DealerPos` via a small **`dealerId` override**:
  `DealerPos` takes an optional `actingDealerId` (+ `needsDealerPicker`) prop;
  default (undefined) → today's dealer behavior BYTE-IDENTICAL (reads `useAuth`).
- A **dealer picker** at the front of the CUSTOMER step (a dealer must be chosen
  before its outlets/salespersons load — `useOutlets`/`useSalespersons` are RLS-read-all
  for principal, filter client-side by the chosen dealer). Selected `dealerId` flows
  into: the storage upload folder + the `CreateOrderInput` (new optional `dealerId`).
- `useDealerSelf()` (`GET /api/dealers/me`, 403 for principal) — degrade gracefully:
  show the SELECTED dealer's name instead of crashing the context label.

**API:**
- `orders.ts` `POST /`: replace the `if (!auth.dealerId) → 403` with: derive
  `effectiveDealerId = auth.dealerId ?? (isInternal(role) ? body.dealerId : null)`;
  403 only when still null. Pass `effectiveDealerId` to `orderInputToRpcPayload`.
- The storage-path prefix guard (`orders.ts:231`) uses `effectiveDealerId` for the
  expected `orders-attachments/{effectiveDealerId}/` prefix (so principal's selected
  dealer folder validates).
- Add optional `dealerId: z.string().uuid().optional()` to `createOrderInputSchema`
  (shared). A non-internal caller supplying it is ignored (JWT wins); only internal
  roles' `dealerId` is honored when their JWT has none.
- (No `create_order` RPC change — it already requires only a non-null `dealer_id`
  and exempts principal from the cross-dealer check.)

**DB (§7 gate — the ONE migration):**
- `0180_storage_orders_attachments_internal_write.sql`: add an INSERT/UPDATE Storage
  policy on bucket `orders-attachments` admitting `(select public.is_internal())`
  (alongside the existing dealer-own-folder policy), so a principal can upload the
  signature/payment-slip under the SELECTED dealer's folder. Internal roles are
  trusted (already read-all) — accepting an internal write to any orders-attachments
  folder matches that trust model. Additive; the dealer-own-folder path is untouched.

## Files
- **web**: `apps/web/src/pages/principal/PrincipalApp.tsx` + `PrincipalSidebar.tsx`
  (+Orders tab, +POS tab/route); a `PrincipalOrders` list wrapper; reuse
  `DealerOrderDetail`; `DealerPos.tsx` (+ `actingDealerId`/picker prop, default-safe);
  a `DealerPicker` for the customer step; `storage.ts`/submit wiring to the selected id.
- **api**: `apps/api/src/routes/orders.ts` (gate + prefix guard); `packages/shared`
  `schemas/orders.ts` (+`dealerId` optional) + the internal-role helper.
- **db**: `supabase/migrations/0180_storage_orders_attachments_internal_write.sql`.

## §7 gate
ONE migration (`0180`, additive Storage policy) — STOP for Loo before apply. No table
change, no `create_order`/`orders` RLS change. Risk class: low (additive policy on a
bucket internal roles already read).

## Risks
- **Don't break the dealer/showroom POS**: the `actingDealerId` override defaults to
  undefined → `DealerPos` behaves byte-identical for dealers. Guard with a test.
- **Storage policy breadth**: `is_internal()` lets any internal role write to any
  orders-attachments folder. Acceptable (internal = trusted, already read-all); note
  as a signed-off trade-off. Tighter per-acting-dealer scoping isn't expressible in
  Storage RLS without a claim principal doesn't carry.
- **Attribution semantics**: the order shows the picked dealer as owner + the picked
  outlet/salesperson; `audit_log`/`order_history` record the principal's `auth.uid()`
  as actor, so "principal placed on behalf of dealer X" is traceable.
- Contract: `create_order`/`order_lines`/`DraftLine` UNCHANGED; the sofa explode +
  0089 mutex still apply to a principal-placed order exactly as a dealer's.

## Acceptance
- Principal portal has an **Orders** tab (list + detail/trace, read-all) and a **POS**
  that, after picking a dealer→outlet→salesperson, runs the full catalog→customer→
  confirm flow (incl. sofa builder + combos) and submits a real order attributed to the
  picked dealer (signature/slip upload succeeds).
- A dealer's own POS + submit is byte-identical to today (no `actingDealerId` →
  unchanged).
- shared+api+web green at §17.3 baselines; `/review` (backend safety, esp. the gate +
  storage policy) + `/design-review` (the principal POS + orders UI) before merge.

## Execution (SDD, after Loo approves + the §7 gate)
1. **T1 api** — gate relax (`effectiveDealerId`) + prefix guard + schema `dealerId` +
   tests (dealer unchanged; principal+dealerId accepted; principal w/o dealerId → 403).
2. **T2 db** — `0180` storage policy (STOP-for-Loo apply).
3. **T3 web create** — `DealerPos` `actingDealerId` + `DealerPicker` in customer step +
   storage/submit wiring + the principal POS route/tab.
4. **T4 web view** — principal Orders tab (list + `DealerOrderDetail`).
5. **T5 cutover** — green gate, SERVICE_ROLE scan, deploy, Loo live-smoke, docs/memory.
