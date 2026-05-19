# Supplier Per-Thread Readiness + Multi-DO Partial Pickup — Design Spec

**Date:** 2026-05-15
**Author:** Claude Opus 4.7 (with Loo)
**Status:** Approved (in-conversation, pending implementation plan)
**Scope:** Phase 9+ feature, post-Go-Live evolution of supplier role + logistics pickup flow

---

## 1. Motivation

The current supplier flow treats each Purchase Order as an atomic unit:
- Supplier presses one "Mark Ready for Pickup" button when the **entire** PO is done
- Logistics partner / logistics role picks up the **whole** PO in one shipment
- One PO → one DO (`purchase_orders.do_number`, single-value column)

In reality:
1. A single PO often bundles 10+ sales orders' SKUs. Production happens piecewise — some sales orders' portions finish before others.
2. Customer ETAs differ. The mattress King for DL-1001 might be needed in 3 days; DL-1005's Queen can wait 3 weeks. Forcing the supplier to hold ready goods until the whole PO is done blocks early customers.
3. Logistics partner / logistics role want visibility into *which* portion is ready so they can plan trips (one trip might cover DL-1001 + DL-1002 if those are ready, leaving the rest for a later trip).
4. Each physical pickup leaves the factory with its own DO paper (separate number). One PO with two pickup trips = two DOs.

Today's system cannot model any of this. This spec adds:
- Per-thread (= per-sales-order-portion-within-PO) readiness ticking
- Multiple pickup events per PO, each with its own DO number + file + signers
- Urgency rating + auto-sort on PO list driven by customer delivery date
- Behind-schedule warning when PO ETA ≥ customer ETA (zero buffer for downstream WH→customer leg)

---

## 2. Locked Decisions (from brainstorming Q&A 2026-05-15)

| # | Question | Decision | Reason |
|---|---|---|---|
| Q1 | Bundle or split into 2 phases? | **One ship** | Loo wants all features together |
| Q2 | Per-line ready granularity | **Per-thread** (= per sales order portion within PO) | Customer-aligned natural unit |
| Q3 | Within thread: per-SKU sub-tick? | **A) One tick covers all SKUs in thread** | Customer wants set together; avoids partner double-trip |
| Q4 | Partner / logistics "ack" semantics | **A) Physical pickup/receipt → state advances** | Mirrors existing PO state machine |
| Q5 | Urgency formula | **C) Customer ETA primary, PO ETA shown, behind-schedule warning** | Customer ETA is the unmovable downstream deadline |
| Q6 | DO numbering for multi-trip pickups | **(b) Different DO numbers, linked by PO** | Each physical DO paper has its own unique ID |
| Q7 | PO sup_status during partial pickup | **New `partially_shipped` state**, eventually advances to fully shipped | Clear distinction in UI |
| Q8 | Supplier unmark ready before ack? | **Yes, allowed before ack** | Supplier prep mistake recovery |
| Q9 | Historical DO reprint permission | **All 3 roles** (supplier / partner / logistics) | Operational flexibility; reprint = re-render existing facts, no integrity risk |

Plus implicit defaults:
- Stockpile PO (no thread link): single "Mark PO ready" button covers whole PO at once
- Multi-thread PO urgency badge: `min(customer.delivery_date)` across threads (earliest customer wins)
- Sort: default urgency-first, user can switch dropdown to PO id / PO ETA / created date
- Urgency thresholds: < 7 days red, 7–14 days orange, > 14 days green

---

## 3. Schema Changes (Migration 0107)

### 3.1 New table: `po_pickup_events`

```sql
CREATE TABLE po_pickup_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         text NOT NULL REFERENCES purchase_orders(id),
  do_number     text NOT NULL,                        -- physical DO paper number
  do_file_path  text,                                 -- storage path of DO photo
  do_note       text,                                 -- free-form remarks
  picked_up_at  timestamptz NOT NULL DEFAULT now(),
  picked_up_by  uuid REFERENCES app_users(id),
  ack_role      app_role NOT NULL CHECK (ack_role IN ('partner', 'logistics')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (po_id, do_number)                           -- no DO# collision within same PO
);
CREATE INDEX po_pickup_events_po_idx ON po_pickup_events(po_id);
```

### 3.2 Extend `order_supplier_threads`

```sql
ALTER TABLE order_supplier_threads
  ADD COLUMN supplier_ready_at  timestamptz,
  ADD COLUMN supplier_ready_by  uuid REFERENCES app_users(id),
  ADD COLUMN pickup_event_id    uuid REFERENCES po_pickup_events(id);
```

- `supplier_ready_at IS NULL` → thread not yet ticked ready
- `supplier_ready_at IS NOT NULL AND pickup_event_id IS NULL` → ready, awaiting pickup
- `pickup_event_id IS NOT NULL` → picked up, part of that DO event
- Thread's existing `logistics_stage` continues to drive downstream (delivery) state machine

### 3.3 Extend `po_sup_status` enum

Add `partially_shipped` as a new enum value (alongside existing `shipped`). Logical ordering of the state machine post-change:

```
pending → acknowledged → in_production
         ↓ (≥ 1 thread supplier_ready_at set)
         ready_for_pickup           (no threads picked yet, but some are ready)
         ↓ (first thread picked into a pickup_event)
         partially_shipped          (some threads picked, others still in_production / ready)
         ↓ (all threads have pickup_event_id)
         shipped / picked_up        (kind-dependent terminal pickup state)
         ↓
         delivered                  (existing behavior, unchanged — POD upload)
```

**State machine notes for linked POs (has threads):**
- `ready_for_pickup` triggers when **any** thread first transitions to `supplier_ready_at IS NOT NULL` (advance from `in_production`)
- `partially_shipped` triggers when the first `po_pickup_events` row is inserted with a subset of threads
- `shipped` / `picked_up` triggers when **all** threads have `pickup_event_id IS NOT NULL`
- Reversion: if supplier unmarks the last ready thread (Q8 = yes), state reverts to `in_production`
- Reversion does NOT happen after any pickup_event exists (irreversible operationally)

**Stockpile POs (no threads):** existing PO-level `sup_status` lifecycle is preserved unchanged. `supplier_mark_delivered` (migration 0094) continues to be the path for stockpile POs. `partially_shipped` is never reached for stockpile POs (no thread granularity).

**`pickup_assigned` / `pickup_accepted`:** these existing states remain available for the partner-assignment ceremony (logistics-side flow when assigning a partner before pickup happens), independent of per-thread state. They sit between `ready_for_pickup` and `partially_shipped` when used.

### 3.4 Mark existing PO-level DO columns deprecated (not dropped)

`purchase_orders.do_number / do_file_path / do_note / do_uploaded_at / do_uploaded_by` stay in place for backward compat. New logic reads from `po_pickup_events` (with a fallback view for legacy POs that have the old fields populated but no pickup_event rows).

**Optional backfill** for staging: for any `purchase_orders` row where `do_number IS NOT NULL` and no `po_pickup_events` exist, create one synthetic event with the old fields. Only relevant for PO-2031 + PO-2032 currently.

### 3.5 RLS

```sql
-- Supplier reads pickup events for their own POs
CREATE POLICY pickup_events_supplier_read ON po_pickup_events
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) = 'supplier'
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
       WHERE po.id = po_pickup_events.po_id
         AND po.supplier_id = (SELECT public.app_supplier_id())
    )
  );

-- Partner reads pickup events for POs assigned to them
CREATE POLICY pickup_events_partner_read ON po_pickup_events
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) = 'partner'
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
       WHERE po.id = po_pickup_events.po_id
         AND po.delivery_partner_id = (SELECT public.app_partner_id())
    )
  );

-- Logistics + principal: full read
CREATE POLICY pickup_events_internal_read ON po_pickup_events
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) IN ('logistics', 'principal')
  );

-- Writes: SECURITY DEFINER RPCs only. No direct INSERT/UPDATE policies.
```

LP whitelist trigger needs to admit new columns on `order_supplier_threads` (supplier_ready_at, supplier_ready_by, pickup_event_id) for the RPCs to update under partner / logistics caller JWT.

---

## 4. RPCs

All `SECURITY DEFINER`, `SET search_path = public, pg_temp`.

### 4.1 `supplier_mark_thread_ready(p_thread_id uuid) RETURNS jsonb`

- Role gate: `supplier`
- Cross-tenant guard: thread's PO `supplier_id = app_supplier_id()`
- State guard: PO `sup_status` IN (`acknowledged`, `in_production`, `ready_for_pickup`, `partially_shipped`). Reject if PO is `cancelled` / `shipped` / `picked_up` / `delivered`.
- State guard: thread.supplier_ready_at IS NULL (idempotent — re-ready returns existing row, no-op)
- State guard: thread.pickup_event_id IS NULL (can't re-ready a picked thread)
- Effect:
  - SET thread.`supplier_ready_at = now()`, `supplier_ready_by = auth.uid()`
  - INSERT into `po_history` (text: `Thread <thread_id> (DL-XXXX portion) marked ready by supplier`)
  - If PO `sup_status` was `acknowledged` or `in_production` → advance to `ready_for_pickup`
- Returns: `{ thread_id, supplier_ready_at, po_sup_status }`

### 4.2 `supplier_unmark_thread_ready(p_thread_id uuid) RETURNS jsonb`

- Same role + cross-tenant guards
- State guard: thread.pickup_event_id IS NULL (cannot unmark after partner already picked up)
- State guard: thread.supplier_ready_at IS NOT NULL
- Effect:
  - SET `supplier_ready_at = NULL`, `supplier_ready_by = NULL`
  - INSERT into `po_history` ("Thread X (DL-XXXX portion) ready unmarked by supplier")
  - If this was the last ready thread → revert PO `sup_status` back to `in_production`

### 4.3 `partner_pickup_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text) RETURNS jsonb`

- Role gate: `partner`
- Cross-tenant guard: PO.delivery_partner_id = `app_partner_id()`
- State guard for each thread in array:
  - thread belongs to p_po_id
  - thread.supplier_ready_at IS NOT NULL
  - thread.pickup_event_id IS NULL
- Effect (atomic):
  - INSERT `po_pickup_events` row (do_number, file, note, picked_up_at, picked_up_by = auth.uid(), ack_role = 'partner')
  - UPDATE all threads in array: SET `pickup_event_id = <new event.id>`, `logistics_stage = 'dispatched'` (or whatever the per-supplier-kind next stage is)
  - Recompute PO `sup_status`:
    - All threads pickup_event_id NOT NULL → `shipped`
    - Some but not all → `partially_shipped`
  - INSERT `po_history` entry with thread list + DO#

### 4.4 `logistics_receive_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text) RETURNS jsonb`

- Role gate: `logistics`
- For `own_logistics` supplier kind (where logistics receives at Carres WH, no partner involved)
- Same guards + effect as 4.3 but `ack_role = 'logistics'` and downstream state may differ (received vs in-transit)

### 4.5 `pickup_event_render_payload(p_event_id uuid) RETURNS jsonb`

Returns the data needed to render the DO PDF for any event:
- PO header info
- Thread list with sales order references + SKU breakdown
- Pickup metadata (DO#, date, signer, role)
- Used by Print DO endpoint (any role with RLS access to the event)

---

## 5. API Routes (Hono)

### New
- `POST /api/supplier/threads/:id/ready` — calls 4.1
- `DELETE /api/supplier/threads/:id/ready` — calls 4.2
- `POST /api/partner/pickups/batch` — calls 4.3 (body: po_id, thread_ids[], do_number, do_note, signed)
- `POST /api/logistics/pos/:po_id/receive-threads` — calls 4.4
- `GET /api/pickup-events/:id/print` — returns DO PDF (uses 4.5 + existing PDF render)
- `GET /api/supplier/pos/:po_id/threads` — list threads in PO with per-thread state + customer ETA (for drawer)

### Modified
- `GET /api/supplier/pos` — response shape adds:
  - `customer_eta_min: date | null` (min of orders.delivery_date across linked threads)
  - `urgency: 'critical' | 'urgent' | 'normal' | null` (computed; null for stockpile PO)
  - `behind_schedule: boolean` (PO ETA ≥ customer ETA)
  - `sku_summary: Array<{sku, qty, attrs}>` (line breakdown)
  - `pickup_events_count: int`
- `GET /api/partner/pickups` — same urgency surface added
- `GET /api/logistics/pos` — same urgency surface added
- `POST /api/storage/dos/sign-upload` — new branch: validate event_id input, signs path scoped to `<po_id>/<event_id>/<uuid>.<ext>`

### Storage bucket
Use existing `delivery-orders` bucket. New path scheme:
```
<po_id>/<event_id>/<uuid>-do.<ext>
```
Old PO-level paths (`<po_id>/<uuid>-do.<ext>`) stay accessible.

---

## 6. UI Changes

### 6.1 Supplier `SupplierPOs.tsx` (list)

- Each card adds:
  - Urgency badge (top-right): 🔴 critical / 🟠 urgent / 🟢 normal / — (stockpile)
  - "Earliest customer: 2026-05-22" caption (omitted for stockpile)
  - "Behind schedule" warning chip if applicable
  - SKU summary line: "mattress:King × 5 · mattress:Queen × 2 · 7 units total"
  - Pickup history dots: ● ● ○ ○ (filled = pickup_event done, empty = remaining threads)
- Sort dropdown: default Urgency → switchable to PO ID / PO ETA / Created

### 6.2 Supplier `PODrawer` (open PO detail)

Two layouts:

**Linked PO (has threads):**
- Section: "Production checklist"
- For each thread (grouped by sales order):
  - Sales order DL-XXXX + customer name + customer delivery date
  - SKU breakdown for this thread (derived from order_lines for that order × supplier category match)
  - Checkbox "Mark ready" / "Unmark" (disabled if `pickup_event_id IS NOT NULL`)
  - State pill: 🛠 producing → ✅ ready → 🚚 picked (event #N, DO-XYZ)
- Convenience: "Mark all remaining ready" button at top — bulk-applies `supplier_mark_thread_ready` to every thread still in `producing`. (Same end result as ticking each, just fewer clicks for the "everything done at once" case.)
- Section: "Pickup history" — list of past pickup_events with DO# + date + signer + threads covered + reprint button

**Stockpile PO (no threads):**
- Single "Mark PO ready" button at PO level (current PO-level flow preserved, calls existing `supplier_mark_delivered`)
- DO submit form like today (mirrors migration 0094 behavior; per-thread granularity not applicable)

### 6.3 Partner `PartnerPickupsPage`

- Per PO card: show ready threads only (collapsed if 0 ready)
- Multi-select checkboxes on ready threads
- "Pickup selected" button → opens dialog:
  - DO number (required, supplier provides physical paper, partner types in)
  - DO photo upload (DOFileUploadField — reuse component)
  - Optional note (lobby, damage, etc.)
  - Signed checkbox
- After confirm → pickup_event created, threads removed from "ready" list, surface in "Picked up" history with reprint button

### 6.4 Logistics `ReceivePOModal` (existing)

- For `own_logistics` supplier POs:
  - List ready threads, same multi-select + DO upload pattern as 6.3
  - Hidden behind a tab "Ready threads (N)" alongside the existing PO-level "Receive whole PO" tab (the legacy single-shot path stays for now)

### 6.5 `DODrawer` / Print DO

- New route `/print-do?event=<event_id>` (works for all 3 roles, RLS gates access)
- PDF includes:
  - PO header
  - Pickup event metadata (DO#, date, signer name + role)
  - Thread list with sales order references + SKU + qty
  - Supplier signature box + Partner/Logistics signature box (pre-printed if already signed)

---

## 7. Migration Plan

1. Apply migration 0107 to staging (apply_migration via MCP)
2. Backfill: for the 2 existing fully-delivered POs (PO-2031, PO-2032), synthesize a single `po_pickup_events` row each (using their existing `do_number / do_file_path / do_uploaded_at / by`) and point all their threads' `pickup_event_id` at it. So no orphan legacy state.
3. New columns on `order_supplier_threads` default NULL → existing POs' threads appear "pre-picked" (since pickup_event_id is non-NULL after backfill).
4. After UI ship, monitor for any case where `purchase_orders.do_number` is read directly instead of via pickup_events — there shouldn't be any except in legacy code paths flagged for deletion.

---

## 8. Tests

### API
- `pos.test.ts`: extend with thread+urgency+sku_summary fields in responses
- `threads-ready.test.ts` (new): supplier mark/unmark guards, role-based 403s, cross-tenant 403s
- `partner-pickups-batch.test.ts` (new): multi-thread pickup, DO uniqueness, state transitions
- `logistics-receive-threads.test.ts` (new): own_logistics path
- `pickup-events-print.test.ts` (new): RLS read for each role, PDF render shape

### Web
- `SupplierPOs.test.tsx`: urgency badge rendering for each tier, sort dropdown, sku summary
- `PODrawer.test.tsx` (new): per-thread checkbox toggling, pickup history rendering, stockpile PO single-button mode
- `PartnerPickupsPage.test.tsx`: multi-select + pickup batch dialog
- E2E spec `e2e/phase-10-partial-pickup-happy.spec.ts`: seed PO with 3 threads → supplier ticks 2 → partner picks them → supplier ticks last → partner picks last → assert 2 pickup_events, PO sup_status = shipped

### Manual
- Loo plays through dealer order → logistics PO bundle (3+ dealers) → supplier per-thread tick → partner 2x pickup → DO reprint

---

## 9. Out of Scope (Future Work)

- Mobile-optimized supplier UI for thread ticking (touch-friendly checkbox grid) — Phase 10+
- Auto-suggestion: "These 4 threads share same customer ETA + same warehouse — recommend grouping into one pickup" — Phase 10+
- Partial qty per thread (e.g., DL-1001 needs 3 King but only 2 ready) — explicitly rejected (Q3 = A: thread is atomic)
- Cross-PO pickup events (one truck picks from PO-A + PO-B at same factory) — out of scope; one pickup event = one PO
- Pickup event editing / deletion after creation — pickup_events are immutable; mistakes = create reversal event

---

## 10. Acceptance Criteria

- Migration 0107 applied, RLS verified, LP whitelist updated
- 3 supplier RPCs + 2 cross-role RPCs in place with full test coverage
- API responses include urgency / customer_eta / sku_summary fields
- Supplier UI: per-thread checklist works for linked PO; stockpile PO unchanged
- Partner UI: multi-select pickup with DO upload works end-to-end
- Logistics UI: own_logistics receive flow shows ready threads
- PO list sorts by urgency by default; user can override
- Behind-schedule warning surfaces when PO ETA ≥ customer ETA
- Reprint DO works for any historical pickup_event from any role with RLS access
- E2E spec `phase-10-partial-pickup-happy` green
- Loo manual smoke: 1 PO with 5 threads, 2 pickups, 2 DOs, all printable

---

## 11. Estimated Effort

- Migration 0107 + RLS + LP whitelist: 1 hr
- 5 RPCs + tests: 4–5 hr
- 6 API routes + tests: 3 hr
- UI changes (4 pages + 1 new dialog + new print): 6–8 hr
- E2E spec + manual smoke: 2 hr
- **Total: ~16–19 hr ≈ 2 working days**

---

## 12. Risks

1. **State machine complexity** — `partially_shipped` adds a new node to the existing po_sup_status enum. All filters that today say "open" need re-checking (does `OPEN_SUP_STATUSES` in `apps/api/src/routes/supplier/products.ts:24` need to include `partially_shipped`?). Mitigation: explicit audit of all filter sites in PR.

2. **Existing PO-level DO flow conflict** — `supplier_mark_delivered` (migration 0094) currently writes to `purchase_orders.do_number` directly. We must NOT break this path for stockpile POs. Mitigation: gate the new RPCs only for linked POs; stockpile POs keep using existing supplier_mark_delivered.

3. **LP whitelist trigger** — adding 3 new columns on `order_supplier_threads` means partner/logistics writes need the whitelist updated (mirrors migrations 0085 / 0086 pattern). Mitigation: ship in same migration.

4. **Print DO permission surface** — all 3 roles being able to print historical DO is a soft privacy concern (partner sees supplier's customer-facing pricing? Or vice versa?). Mitigation: DO PDF schema does NOT include pricing — only SKU, qty, signatures, DO#.

5. **Backfill on 2 existing POs** — PO-2031 + PO-2032 have full delivered state. The synthetic pickup_event backfill must not violate any FK or unique constraint. Mitigation: backfill SQL is in migration 0107 itself, tested on staging-like clone before remote apply.

---

## 13. Implementation Plan Reference

After this spec is approved, the implementation plan will be drafted via the `superpowers:writing-plans` skill and saved to `docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md`.

---

> **Loo sign-off** (in-conversation 2026-05-15): all 9 decisions locked, design approved at section-level during Q&A, full spec to be reviewed below before implementation begins.
