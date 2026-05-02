# Phase 2B — Dealer: New Order Wizard

> **Slice 2 of 5 within Phase 2.** This is the BIGGEST single feature in Phase 2.
> Honest re-estimate after eng-review locked decisions: **18-25h focused work**
> (was 15-20h pre-review). Sub-sliced into 2B.1 / 2B.2 / 2B.3.
>
> **Status**: ENG REVIEW CLEARED — 2026-05-02 — all 5 open questions resolved.
> See `## Locked decisions (eng review)` below.

---

## Why the scope is bigger than the original master plan

Reading the 6 prototype files for this slice:

| File | LOC | Scope |
|---|---|---|
| `proto/new-order.jsx` | 190 | Wizard shell + step machine + ThankYou |
| `proto/new-order-step1.jsx` | 262 | Customer + delivery + outlet/SP picker + emergency contact compose |
| `proto/new-order-step2.jsx` | 492 | Product picker (cat→model→variant) + 3 category configurators (Mattress, Bedframe, Sofa-preset/custom + fabric surcharge) + Add-ons + Floor surcharge UI |
| `proto/new-order-step3.jsx` | 405 | Overview + canvas signature pad + payment slip picker + 3 payment methods (online / credit / installment) + min-deposit gate |
| `proto/dealer-products.jsx` | 227 | Catalog browse (separate from wizard picker but reads same data) |
| `proto/dealer-action-modals.jsx` | 542 | Reused customer modals (only ~100 lines relevant to 2B) |
| **Total relevant** | **~1700** | |

Production reference (`reference/production/src/pages/dealer/DealerNewOrder.tsx`) ports
this to 911 lines of TS+React. We'll hit similar density.

---

## Locked decisions (eng review 2026-05-02)

All 5 open questions resolved by Loo via `/plan-eng-review`. Implementation must
follow these:

| # | Question | Decision | Why |
|---|----------|----------|-----|
| D1 | Signature + payment slip storage | **Supabase Storage bucket day-1** | Avoids list-payload bloat (50 orders × 50KB base64 = 2.5MB/query) and future migration debt. Phase 4 needs Storage anyway. |
| D2 | Sofa configurator complexity | **Full: preset + custom + fabric** | Schema already supports it. Custom sofa is the differentiated SKU — MVP without it isn't MVP. |
| D3 | POST /api/orders atomicity | **Postgres RPC `create_order(payload jsonb)`** | PostgREST can't span tables in one TX. Without RPC, network glitches leave orphan rows. Real risk on Malaysia 4G. |
| D4 | Wizard URL state | **Modal + sessionStorage draft persistence** | Modal pattern matches Phase 2A. sessionStorage prevents 5-min-of-typing loss on refresh. |
| D5 | Catalog cache | **TanStack staleTime 5 min + explicit refetch on Step 2 mount** | Belt-and-suspenders: idle browse OK with stale 5min, but pricing window at submit ≈ 0. Avoids "principal raised price during dealer's wizard session". |

---

## Schema additions required

Two new migrations (CLAUDE.md §7 schema-discipline applies — these resolve real
frontend-vs-schema gaps surfaced by eng review):

### `0005_orders_payment_slip.sql`
```sql
alter table orders
  add column payment_slip_url text;

-- signature_url already exists (text, nullable). After D1 (Storage), both columns
-- store storage paths like "orders-attachments/{order_id}/signature.png", NOT
-- base64 data URLs. List endpoint (`/api/orders`) selects neither column to keep
-- responses lean.
```

### `0006_create_order_rpc.sql`
```sql
-- Atomic order creation. Inserts orders + order_lines + order_addons + order_history
-- + audit_log in one transaction. Returns the created order id + dl + placedAt.
-- SECURITY DEFINER + manual RLS check (caller must be the dealer or principal).
create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
  v_role app_role;
  v_order_id uuid;
  v_dl int;
  v_placed_at timestamptz;
begin
  v_dealer_id := (payload->>'dealer_id')::uuid;
  v_role := public.app_role();

  -- Manual RLS gate: only the dealer themselves, or internal roles, can insert.
  if v_role not in ('principal','logistics','finance','bd')
     and v_dealer_id <> public.app_dealer_id() then
    raise exception 'forbidden: cross-dealer insert' using errcode = '42501';
  end if;

  -- 1. Insert orders row
  insert into orders ( ... payload fields ... )
  returning id, dl, placed_at into v_order_id, v_dl, v_placed_at;

  -- 2. Insert order_lines
  insert into order_lines (order_id, sku, qty, attrs, unit_price)
  select v_order_id, line->>'sku', (line->>'qty')::int,
         line->'attrs', (line->>'unit_price')::numeric
  from jsonb_array_elements(payload->'lines') as line;

  -- 3. Insert order_addons
  insert into order_addons (order_id, addon_key, qty, unit_price)
  select v_order_id, ad->>'addon_key', (ad->>'qty')::int,
         (ad->>'unit_price')::numeric
  from jsonb_array_elements(payload->'addons') as ad;

  -- 4. Insert initial order_history
  insert into order_history (order_id, text, by_role)
  values (v_order_id,
          format('Order created · %s%% deposit',
                 (payload->>'deposit_pct')::int),
          v_role);

  -- 5. Insert audit_log
  insert into audit_log (role, action, dealer_id, ref)
  values (v_role,
          format('order.created'),
          v_dealer_id,
          'DL-' || v_dl::text);

  return jsonb_build_object('id', v_order_id, 'dl', v_dl,
                            'placed_at', v_placed_at);
end;
$$;

revoke all on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to authenticated;
```

### Storage bucket (Phase 2B.3 setup)
- Bucket: `orders-attachments`, private
- Path convention: `{dealer_id}/{order_id}/signature.png` and `{dealer_id}/{order_id}/payment-slip.{ext}`
- RLS policy:
  - INSERT: caller's `app_dealer_id() = path's dealer_id segment` OR caller is internal
  - SELECT: same as INSERT (dealer can only read own dealer's attachments)
- Hono server signs URLs (1h expiry) on `GET /api/orders/:id` — list endpoint never returns URLs

---

## Recommended sub-slicing (3 slices)

### Slice 2B.1 — Read-only catalog + outlet/SP read APIs · ~2-3h

**Ships:**
- API: `GET /api/catalog` (returns `{ models, skus, sofa_fabrics, addons, floor_config }` bundle, RLS-public-read for authenticated). Filter `discontinued_at is null`.
- API: `GET /api/outlets` + `GET /api/salespersons` (RLS-scoped to dealer, `is_internal()` allows cross-dealer)
- Web: `DealerProducts.tsx` — catalog grid (mattress / bedframe / sofa cards)
- Web: enable Products + Settings sidebar items (drop "soon" tooltip; Settings is just a stub for now)
- Updates `lib/queries.ts` with `useCatalog`, `useOutlets`, `useSalespersons`
- **Un-stub `apps/web/src/lib/order-totals.ts`** — replace floor surcharge stub with real `floor_config` data
- Tests: 5 vitest (catalog happy / outlets RLS-scoped / salespersons RLS-scoped / discontinued filtered / order-totals real-data) + 1 E2E (dealer browses /dealer/products)

**Why first:** Wizard Step 1 picks outlet/salesperson; Step 2 picks from catalog. Both have to exist before the wizard works. `order-totals.ts` floor calc also un-stubs here since `floor_config` becomes available.

### Slice 2B.2 — Wizard shell + Step 1 (customer + delivery) · ~3.5-4.5h

**Ships:**
- Web: `DealerNewOrder.tsx` — modal shell (D4: stays modal) + 3-step stepper
- Web: **sessionStorage draft persistence** (D4 tail) — auto-save every input change to `sessionStorage['order-draft']`, restore on remount, clear on submit/cancel
- Web: `pages/dealer/new-order/Step1Customer.tsx` — customer fields, structured address, emergency contact composer, billing-same toggle, delivery date + TBD
- "+ New order" CTA on Dashboard + Orders page (opens modal with `?new=true` query trigger)
- Cancel button (clears draft) + Continue gate (validates Step 1)
- Tests: 3 vitest (Continue gate logic / sessionStorage save+restore / Cancel clears) + 2 E2E (CTA → fill → Continue ; reopen → draft restored)

**No backend yet** — wizard is frontend-only for Steps 1-2. orders.create lands in 2B.3.

### Slice 2B.3 — Step 2 + Step 3 + RPC create + Storage + ThankYou · ~8-12h

**Ships:**
- Migrations: `0005_orders_payment_slip.sql`, `0006_create_order_rpc.sql`
- Storage: `orders-attachments` bucket + RLS policy
- API: `POST /api/orders` — calls `supabase.rpc('create_order', payload)`. Zod validates full payload. Returns full order (same shape as `GET /api/orders/:id`) so client doesn't need follow-up fetch.
- API: `GET /api/orders/:id` returns `signatureSignedUrl` + `paymentSlipSignedUrl` (1h expiry) computed from storage paths server-side. List endpoint excludes both columns.
- Adapter: `orderToInsertRow(...)` converts wizard draft → RPC payload jsonb.
- Web: `Step2Products.tsx` — `ProductPicker` with category tabs + **3 full configurators** (Mattress: size; Bedframe: size+color+gap; **Sofa: preset/custom + fabric surcharge from `sofa_fabrics` table**, per D2). Add-ons checklist. Floor surcharge auto-computed via un-stubbed `order-totals.ts`. Line list with remove.
- Web: `Step3Confirm.tsx` — overview + signature pad (HTML canvas → upload to Storage on capture) + payment slip uploader (FileReader → upload to Storage) + 3 payment methods (online / credit / installment with months). **Min-deposit gate (50% of total)**. T&C checkbox. Submit → POST /api/orders.
- Web: `ThankYou.tsx` — success modal with #DL + 3-step "what's next".
- Tests: **9 vitest** (orderToInsertRow adapter / POST happy / POST 400 invalid / **POST 403 cross-dealer order** / **POST 403 cross-dealer line** / RPC atomic rollback / audit_log written / Storage upload happy / Storage RLS reject) + **3 E2E** (full mattress wizard end-to-end / sofa custom+fabric total reflects surcharge / min-deposit gate at 49%)

---

## Cross-cutting concerns (apply to all 3 slices)

- **Storage strategy = D1**: signature + payment slip → Supabase Storage bucket. DB columns store storage paths (~100 bytes), NOT base64 data URLs. Signed URLs (1h expiry) computed server-side on detail GET only.
- **Atomic create = D3**: `POST /api/orders` calls `supabase.rpc('create_order', payload)` — single Postgres TX writes orders + order_lines + order_addons + order_history + audit_log. No multi-call sequential inserts.
- **Locked unit_price snapshot**: When inserting `order_lines`, RPC copies the SKU's current price into `unit_price` so future price changes don't re-cost old orders. Catalog cache (D5) keeps the dealer's view fresh.
- **Order DL number** auto-generated by Postgres `orders_dl_seq` (already in schema).
- **`audit_log` semantics**: dual-write inside `create_order` RPC. `order_history` row is dealer-visible timeline; `audit_log` row is internal audit trail. Both written in same TX.
- **List endpoint hygiene**: `GET /api/orders` explicitly selects columns excluding `signature_url` + `payment_slip_url`. Detail endpoint returns signed URLs. Phase 2A's `select *` should be tightened to a column list in 2B.3.

---

## Out of scope for ALL of 2B (deferred to later phases)

- Mutations on existing orders (proceed, cancel, recordPayment, fixDate, editCustomer) → Phase 2C
- Top-up deposit modal (TopUpDepositModal) → Phase 2D
- Settings page (outlets CRUD + salespersons CRUD + deposit display) → Phase 2D
- **Showroom shared-account flow** (`currentSalespersonId` state, topbar SP switcher) → Phase 2E (Q3 deferred). 2B treats dealer as single entity; outlet+SP picked fresh each order.
- Salesperson role outlet-scoping → Phase 2E
- Mobile bottom-tab nav + mobile-optimized wizard → Phase 2E
- DB-backed draft persistence (cross-device sync) → not planned; sessionStorage is enough

---

## Acceptance Checklist (final, applies after all 3 slices ship)

- [ ] Dealer can place a complete new order from Dashboard CTA
- [ ] Order appears in /dealer/orders Place tab immediately after submit
- [ ] Order detail (from Phase 2A) shows the new order's customer, items, total, history
- [ ] Order detail returns signed URLs for signature + payment slip (1h expiry)
- [ ] Audit log row appears for the create event
- [ ] sessionStorage draft restored on accidental wizard close + reopen
- [ ] Step 2 entry triggers explicit catalog refetch (D5 verify in DevTools)
- [ ] All vitest cases pass (estimate: **~17 new cases** across 2B.1+2B.2+2B.3 — was 12-15)
- [ ] All E2E specs pass (estimate: **6 new specs** — was 6-8)
- [ ] Typecheck clean across 3 packages
- [ ] `service_role` audit gate passes (no Storage admin keys leak to web bundle)
- [ ] `/design-review` rates wizard ≥ 8/10 (run after 2B.3)
- [ ] Tag `phase-2b-complete`

---

## Recommendation for THIS session

Plan locked via eng review. Next step: start **Slice 2B.1** (catalog + outlets/SP
read APIs + DealerProducts page + un-stub `order-totals.ts` floor). Self-contained,
ships value (catalog browse), ~2-3h.

After 2B.1 ships → 2B.2 (wizard shell + Step 1 + sessionStorage) ~3.5-4.5h.
After 2B.2 ships → 2B.3 (Step 2 + Step 3 + RPC + Storage + ThankYou) ~8-12h.
After all 3 ship → tag `phase-2b-complete` → Phase 2C (mutations on existing orders).

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (engineering-detail review only) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | declined per D6 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 5 open Qs locked + 4 issues surfaced and folded into plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | scheduled after 2B.3 ships |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a (internal tool) |

- **UNRESOLVED:** 0 unresolved decisions
- **VERDICT:** ENG CLEARED — ready to implement 2B.1
