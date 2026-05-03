# Phase 4 — Logistics (HQ Internal Team) Design

> **Status**: Approved by Loo · 2026-05-03 (brainstorm session)
> **Scope**: Full Phase 4 per master plan §620 — 8 pages + 4 modals + 14 routes + ~7 RPCs + 3 migrations
> **Estimate**: ~3-4 days implementation across 2-3 sessions
> **Architecture**: RPC pattern (locked Phase 3 session), zero RLS changes
> **Prerequisite**: Phase 3 complete (tag `phase-3-complete`)

---

## 1. Goal

Let HQ internal logistics team receive `proceed_order` orders from dealers → manage stock + create POs to suppliers + dispatch + mark delivered. Closes the dealer→HQ→customer order lifecycle. Dealer side sees their order flip to `delivered` status when logistics completes the physical delivery.

## 2. Business model context (carry-forward from Phase 3)

- **Dealer just sells. Customer pays HQ direct.** Dealer doesn't owe HQ. Outstanding column = customer-owe-HQ.
- **Phase 4 is HQ INTERNAL roles**, not dealer-side. Dealer never sees logistics UI. Dealer just sees their order's `status` flip from `proceed_order` to `delivered` when logistics finishes.
- **Showroom orders ARE in scope.** Proto's logistics-orders.jsx separates dealer vs showroom for filtering, but processes both the same way through the pipeline.

## 3. State machine

### `orders.status` (existing enum from Phase 1)

```
place → (dealer Proceed RPC) → proceed_order → (logistics_mark_delivered RPC) → delivered
```

`status` only flips to `delivered` when `logistics_stage` reaches `delivered`.

### `orders.logistics_stage` (existing enum from Phase 1, only meaningful when status=proceed_order)

```
null → (proceed_order RPC auto-sets) → awaiting_stock OR ready_to_dispatch
awaiting_stock → (all PO lines received) → ready_to_dispatch
ready_to_dispatch → (logistics_mark_dispatched RPC) → dispatched
dispatched → (logistics_mark_delivered RPC) → delivered
                                          ↑
                                          this also flips orders.status to delivered
```

**Auto-promotion rule**: when `logistics_receive_po_line` records a line as fully received and that line was the LAST shortage for an order, the RPC auto-promotes the order to `ready_to_dispatch` + reserves stock in same tx.

## 4. Auto-PO logic (per Loo 2026-05-03 brainstorm)

Triggered when:
- **Server-side automatic** (proto's `ingestProceededOrder`): on dealer Proceed, the `proceed_order` RPC additionally runs:
  1. Pick best warehouse (`pickWarehouseFor`) — first warehouse with full stock for all lines, else first warehouse
  2. Calculate shortages (`stockShortageFor` based on warehouse balances)
  3. If no shortages → set `logistics_stage='ready_to_dispatch'` + reserve stock + write order_history line
  4. If shortages → set `logistics_stage='awaiting_stock'` + write order_history "Awaiting stock for N SKUs"
- **PO creation is MANUAL** (logistics user clicks "Auto-issue POs" button) — `logistics_issue_pos_for_order` RPC

### PO grouping rules (Loo's biz rule)

```
Group all shortages by supplier (each SKU's category determines supplier via suppliers.cat_covered)

For each supplier's group:
  if any line is category='sofa':
    Each sofa line: split into individual POs (1 PO per qty=1)
    Reason: sofas are highly customized (fabric, color, dimensions); individual tracking
  else (category='mattress' or 'bedframe'):
    Combine into one multi-line PO (one row per SKU within po_lines)
    Reason: standard SKUs, suppliers handle multi-line orders fine

Result: one order's auto-issue can produce 1-N POs depending on category mix
```

### Reservation logic

```
ready_to_dispatch transition (auto-promotion OR manual):
  for each (sku, qty) in order_lines:
    UPDATE stock_balances SET reserved = reserved + qty WHERE sku=X AND warehouse_id=Y

dispatched: no stock change

delivered:
  for each (sku, qty) in order_lines:
    UPDATE stock_balances SET reserved = reserved - qty, qty = qty - qty WHERE sku=X AND warehouse_id=Y
    INSERT INTO stock_movements (sku, warehouse_id, qty=-N, kind='out', ref='DL-XXX')

cancel of order at logistics stage: TBD — not in Phase 4 MVP scope (defer to Phase 4 polish)
```

## 5. Schema changes (3 new migrations)

### `0017_purchase_order_lines.sql`

```sql
-- Convert purchase_orders from single-sku to multi-line:
-- 1. Add purchase_order_lines child table
-- 2. Drop purchase_orders.sku and purchase_orders.qty columns
--    (verify remote table is empty before; current data: 0 rows expected)

create table purchase_order_lines (
  po_id text not null references purchase_orders(id) on delete cascade,
  sku text not null,
  qty int not null check (qty > 0),
  received_qty int not null default 0 check (received_qty >= 0),
  primary key (po_id, sku),
  check (received_qty <= qty)
);
create index po_lines_po_idx on purchase_order_lines(po_id);

-- After data migration (none needed if table empty):
alter table purchase_orders drop column sku;
alter table purchase_orders drop column qty;
```

### `0018_stock_balances_reserved.sql`

```sql
alter table stock_balances add column reserved int not null default 0;
alter table stock_balances add constraint stock_balances_reserved_nonneg check (reserved >= 0);
alter table stock_balances add constraint stock_balances_qty_ge_reserved check (qty >= reserved);
```

`available = qty - reserved` derived in queries (no column).

### `0019_logistics_rpcs.sql`

7 new RPCs (all `security definer` + `is_logistics()` guard) + extend `proceed_order` with auto-stage logic. Detailed signatures in §6 below. Migration is ~400 LOC.

## 6. RPCs (7 new + 1 extension)

### `proceed_order(order_id uuid)` — EXTEND existing (Phase 2C)

After existing logic (status update, etc.), append:
```
1. v_warehouse := public.logistics_pick_warehouse(order_id)
2. v_shortages := public.logistics_calc_shortages(order_id, v_warehouse)
3. IF v_shortages = empty THEN
     UPDATE orders SET logistics_stage = 'ready_to_dispatch', warehouse_id = v_warehouse
     UPDATE stock_balances SET reserved += line.qty FOR each line IN order_lines
     INSERT order_history "Stock confirmed at {warehouse} · ready to dispatch"
   ELSE
     UPDATE orders SET logistics_stage = 'awaiting_stock', warehouse_id = v_warehouse
     INSERT order_history "Awaiting stock for {N} SKUs at {warehouse}"
   END IF
```

Two helper functions (`logistics_pick_warehouse`, `logistics_calc_shortages`) extracted because they're used in both proceed_order extension AND `logistics_issue_pos_for_order`.

### `logistics_issue_pos_for_order(order_id uuid)` — NEW

```
1. Verify order.status = proceed_order AND logistics_stage = awaiting_stock
2. Calc shortages via logistics_calc_shortages
3. Group shortages by supplier (via sku_category → suppliers.cat_covered match)
4. For each supplier:
     IF any shortage line is sofa:
       For each sofa line: create 1 PO with single po_line qty=1, repeat for qty
     For non-sofa lines: create 1 PO with multi-line entries
5. Insert audit_log entry per PO created
6. Return jsonb { pos_created: [{id, supplier_id, line_count}, ...] }
```

### `logistics_receive_po_line(po_id text, sku text, received_qty int)` — NEW

```
1. Verify po exists AND is_logistics()
2. UPDATE po_lines SET received_qty = received_qty WHERE po_id AND sku
3. IF all lines fully received: UPDATE purchase_orders SET status = 'received'
4. UPDATE stock_balances SET qty += delta WHERE sku AND warehouse_id (the qty diff)
5. INSERT stock_movements (sku, warehouse_id, qty=delta, kind='in', ref=po_id)
6. Check if any orders in awaiting_stock with this sku now have all shortages cleared
   → for each such order: auto-promote to ready_to_dispatch (reserve stock, write history)
7. Audit log
8. Return jsonb { po_status, orders_promoted: [...] }
```

### `logistics_mark_dispatched(order_id, partner_id, do_ref text, photo_paths jsonb)` — NEW

```
1. Verify is_logistics() AND order.logistics_stage = ready_to_dispatch
2. UPDATE orders SET logistics_stage = 'dispatched',
                      delivery_partner_id = partner_id,
                      delivery_do_ref = do_ref,
                      dispatched_at = now()
3. INSERT order_history "Dispatched via {partner} · DO {do_ref}"
4. INSERT audit_log
5. (No stock change — dispatched stock is already reserved)
6. Return jsonb { id, dispatched_at }
```

(Note: `orders.delivery_do_ref` and `orders.dispatched_at` columns may need to be added if not already in schema. Check during implementation; if missing, add via the same migration.)

### `logistics_mark_delivered(order_id)` — NEW

```
1. Verify is_logistics() AND order.logistics_stage = dispatched
2. UPDATE orders SET status = 'delivered',
                      logistics_stage = 'delivered',
                      delivered_at = now()
3. For each line in order_lines:
     UPDATE stock_balances SET qty -= line.qty,
                                 reserved -= line.qty
     WHERE sku = line.sku AND warehouse_id = order.warehouse_id
     INSERT stock_movements (sku, warehouse_id, qty = -line.qty, kind = 'out',
                              ref = 'DL-' || order.dl)
4. INSERT order_history "Delivered to {customer.name}"
5. INSERT audit_log
6. Return jsonb { id, delivered_at }
```

### `logistics_adjust_stock(sku, warehouse_id, delta int, reason text)` — NEW

```
1. Verify is_logistics()
2. UPDATE stock_balances SET qty += delta WHERE sku AND warehouse_id
   (CHECK constraint qty >= 0 may fail; if so, return 422 with code='negative_stock')
3. INSERT stock_movements (sku, warehouse_id, qty = delta, kind = 'adjust', note = reason)
4. INSERT audit_log
5. Return jsonb { sku, warehouse_id, qty_after }
```

### `logistics_warehouse_pick(order_id uuid, warehouse_id uuid)` — NEW

Manual override of auto-picked warehouse. Only allowed when `logistics_stage = awaiting_stock` (before any PO is issued).

```
1. Verify is_logistics() AND order.logistics_stage = awaiting_stock AND no open POs
2. UPDATE orders SET warehouse_id = new_warehouse_id
3. Recalc shortages — if zero now: auto-promote to ready_to_dispatch + reserve
4. INSERT order_history + audit_log
```

### `logistics_create_po(supplier_id, warehouse_id, lines jsonb, dl int?)` — NEW

For manual PO creation (not tied to specific order, e.g. stock replenishment).

```
1. Verify is_logistics()
2. Validate supplier_id exists, warehouse_id exists, lines array non-empty
3. Generate next PO id (PO-NNNN sequential)
4. INSERT purchase_orders (id, supplier_id, warehouse_id, dl, status='open', sup_status='pending')
5. INSERT each po_line
6. INSERT audit_log
7. Return the new PO with lines
```

## 7. API routes (new in `apps/api/src/routes/logistics/`)

```
GET  /api/logistics/dashboard              → summary RPC OR composed query
GET  /api/logistics/orders                 → list with filters (stage, dealer, search)
GET  /api/logistics/orders/:id             → detail with PO status array
POST /api/logistics/orders/:id/issue-pos   → logistics_issue_pos_for_order RPC
POST /api/logistics/orders/:id/dispatch    → logistics_mark_dispatched RPC (multipart for photos)
POST /api/logistics/orders/:id/deliver     → logistics_mark_delivered RPC
POST /api/logistics/orders/:id/warehouse   → logistics_warehouse_pick RPC

GET  /api/logistics/pos                    → list (filter status, supplier)
POST /api/logistics/pos                    → logistics_create_po RPC
POST /api/logistics/pos/:id/receive        → logistics_receive_po_line RPC (per-line receive)
POST /api/logistics/pos/:id/cancel         → cancel PO (status=open only)

GET  /api/logistics/warehouse              → stock_balances grouped by warehouse + low_stock flags
POST /api/logistics/warehouse/adjust       → logistics_adjust_stock RPC

GET  /api/logistics/movements              → stock_movements log with filters
```

All routes: `requireRole(['logistics'])`. Mount under existing `/api` sub-app for auth inheritance (Phase 3 pattern).

## 8. Frontend pages (`apps/web/src/pages/logistics/`)

```
LogisticsApp.tsx              — shell + sidebar + tab routing
LogisticsSidebar.tsx          — 4-5 nav items: Dashboard / Orders / Procurement / Warehouse / Movements
LogisticsDashboard.tsx        — hero + 4 KPI + 3 active pipeline cols + Open POs / Low stock side cards
LogisticsOrders.tsx           — 4-col kanban + filters + multi-select PO bundle
LogisticsOrderDetail.tsx      — drawer with full order info + action buttons
LogisticsProcurement.tsx      — PO list + create PO form + receive action
LogisticsDispatch.tsx         — ready_to_dispatch list + DispatchModal
LogisticsWarehouse.tsx        — stock_balances table per warehouse + adjust action
LogisticsMovements.tsx        — stock_movements log with filters
components/
  StageChip.tsx               — visual indicator of logistics_stage (4 colors)
  KpiTile.tsx                 — reuse Phase 3 KpiStrip pattern
  POCard.tsx                  — single PO display in dashboard side card
  DispatchModal.tsx           — pick partner + DO# + photo upload (use Phase 2C uploadAttachment helper)
  AttachDOModal.tsx           — separate from Dispatch? (proto has it but might overlap)
  AdjustStockModal.tsx        — sku + warehouse + delta + reason
  ReceivePOModal.tsx          — per-line received qty inputs
  IssuePOsModal.tsx           — auto-issue preview before commit
```

## 9. Routing

Add to `App.tsx`:
```tsx
<Route path="/logistics/*" element={<RequireAuth roles={['logistics']}><LogisticsApp /></RequireAuth>} />
```

Login redirect: `role === 'logistics' → /logistics`.

## 10. Tests

| Layer | Coverage | Estimated count |
|---|---|---|
| `packages/shared` | New zod schemas (issue_pos / dispatch / deliver / receive_po / adjust_stock / create_po / warehouse_pick) | ~7 |
| `apps/api` | All 14 routes — happy + role guard + 422 + cross-effects | ~30 |
| `apps/web` | Component logic (kanban filter, multi-select PO bundle, dispatch form validation, receive form) | ~12 |
| RLS deny | Non-logistics roles → 403 on /api/logistics/* | ~5 |
| Playwright E2E | dealer Proceed → logistics issue PO → receive → dispatch → deliver, end-to-end | 1 |

**Total: ~55 new tests. Repo target: 215 + 55 = ~270.**

## 11. Migrations summary

```
supabase/migrations/0017_purchase_order_lines.sql       — convert PO to multi-line
supabase/migrations/0018_stock_balances_reserved.sql    — add reserved column
supabase/migrations/0019_logistics_rpcs.sql             — 7 new RPCs + extend proceed_order
```

All additive except `0017` which drops 2 columns from `purchase_orders` (verify table is empty in remote first — Phase 1 schema, no production data).

## 12. NOT in MVP

- ❌ Order cancellation at logistics stage (after reserve / after dispatch) — defer to Phase 4 polish or Phase 5 Finance
- ❌ Reservation expiry (e.g. auto-release after 7 days idle) — defer
- ❌ Multi-warehouse split (one order draws from 2+ warehouses) — defer
- ❌ Stock transfers between warehouses — defer
- ❌ Returned/RMA stock workflow (negative movements) — defer to Finance Phase 5
- ❌ Partner role assignment + partner UI — Phase 7
- ❌ Supplier acknowledgment UI — Phase 6 (logistics just creates POs; suppliers ack/ship on their own UI later)

## 13. Acceptance criteria

- [ ] Login as logistics user → lands on `/logistics` Dashboard
- [ ] Dashboard shows KPIs (Today / Open POs / Overdue) + 3 pipeline buckets + Open POs side card + Low stock side card
- [ ] Click Orders tab → see 4-column kanban (awaiting_stock / ready_to_dispatch / dispatched / delivered)
- [ ] Click an awaiting_stock order → drawer shows shortages + "Auto-issue POs" button
- [ ] Click Auto-issue → POs created per supplier (sofa = split, mattress/bedframe = combined) → toast
- [ ] Receive a PO line → if all shortages cleared, order auto-promotes to ready_to_dispatch + stock reserved
- [ ] Dispatch order → input partner + DO# + photo → status=dispatched
- [ ] Mark delivered → status=delivered (dealer side sees this) + stock_balances qty -= N + reserved -= N + stock_movements log entry
- [ ] Warehouse page shows stock_balances per warehouse with low-stock highlights
- [ ] Movements page shows audit trail of all stock changes
- [ ] Procurement page can manually create a PO (not tied to an order)
- [ ] Tests: ~270 total green
- [ ] No new RLS policies (verify via grep)
- [ ] `phase-4-reflection.md` written
- [ ] Tag `phase-4-complete` and push

## 14. Carry-forward from Phase 3

- RPC pattern (security definer + manual is_logistics() guard) — locked architecture
- Closure-captured ID + `await invalidateQueries({ exact: true })` in mutation hooks
- Toast constants in `apps/web/src/lib/toast-copy.ts` (extend with logistics-specific copy)
- Sidebar disabled-nav pattern for not-yet-built items (Phase 5/6/7)
- SQLSTATE error contract: 42501 forbidden / 42P01 not_found / 22023 invalid_param
- Defense in depth: route requireRole + RPC is_logistics() guard

## 15. Risks & open questions

1. **`orders.delivery_do_ref` and `dispatched_at` / `delivered_at` columns** may not exist in schema — verify during implementation. If missing, add to migration 0019.
2. **`stock_movement_kind` enum** — confirm values exist for `'in'`, `'out'`, `'adjust'`. If missing, add via migration.
3. **`suppliers.cat_covered`** — confirm field exists for category-based supplier routing. If missing, may need to add OR derive from supplier-product mapping.
4. **Photo upload for DO** — reuse Phase 2C `uploadAttachment` helper + Storage bucket pattern. Storage path: `orders-attachments/{dealer_id}/dispatch-do/{order_id}-{timestamp}.jpg`.
5. **Auto-promote race**: if 2 PO lines for same order get received simultaneously, only one tx should auto-promote. Use SELECT FOR UPDATE on the order row inside `logistics_receive_po_line`.
6. **Dashboard summary** — single RPC vs composed queries? Defer to implementation; same trade-off as Phase 3 dashboard.
7. **Partial PO receipt** — UI for receiving "3 of 5 SKUs" — design TBD during implementation (likely modal with per-line input).

## 16. Implementation milestones (rough)

```
M1 — Foundation: 3 migrations + zod schemas + sidebar shell             (~3 hr / 1 subagent)
M2 — Backend orders: dashboard + orders list/detail + dispatch + deliver routes (~5 hr / 2 subagents)
M3 — Backend procurement: PO list + receive + create + auto-issue logic (~4 hr / 1-2 subagents)
M4 — Backend warehouse: balances + movements + adjust routes (~2 hr / 1 subagent)
M5 — Frontend: 8 pages + 4 modals + queries hooks (~6 hr / 3 subagents)
M6 — Polish: smoke + /review + /design-review + reflection + tag (~3 hr)

Total: ~23 hr active = 3-4 days. Achievable across 2-3 sessions.
```

---

## 17. Review-driven updates (2026-05-03 plan-eng-review)

> This section supersedes overlapping content in §1-§16 above. Implementer reads §17 for the **decided execution plan**; §1-§16 captures the original brainstorm. 16 decisions confirmed by Loo on 2026-05-03.

### 17.1 Schema accuracy fixes (Step 0 P1 findings)

Three pre-existing discrepancies between spec §6 and `0001_init.sql`:

1. **`is_logistics()` helper missing.** Spec referenced it 7× but `0002_rls.sql` only has `is_principal()` + `is_internal()`. Migration `0019` MUST add at top:
   ```sql
   create or replace function public.is_logistics()
   returns boolean
   language sql stable security definer as $$
     select coalesce((select role from public.app_users where id = auth.uid()) = 'logistics', false)
   $$;
   ```

2. **Column name `delivery_do_ref` is wrong.** Actual column on `orders` is `do_number` (line 274 of `0001_init.sql`). All RPC bodies in §6 that wrote `delivery_do_ref` MUST use `do_number`. `do_note` already exists too. No new column needed.

3. **`dispatched_at` and `delivered_at` columns missing.** Migration `0019` MUST add 2 columns:
   ```sql
   alter table orders
     add column dispatched_at timestamptz,
     add column delivered_at  timestamptz;
   ```

### 17.2 Proto-vs-spec deviations (D1)

After reading `reference/proto/logistics-*.jsx`, 4 deviations identified. Loo's decisions:

| Deviation | Proto behavior | Spec behavior | Decision |
|---|---|---|---|
| D1.dispatch | 2-step modal (assign partner, then attach DO + deliver) | 1-step combined | **Follow proto.** Split into 2 RPCs: `logistics_assign_partner` + `logistics_attach_do_and_deliver`. 2 separate modals. Preserves "in-transit" visibility. |
| D1.auto-PO | Auto-issued on Proceed (server-side) | Manual button | **Follow spec.** logistics clicks "Auto-issue POs" button. `proceed_order` extension only sets `awaiting_stock` / `ready_to_dispatch`, does NOT create POs. |
| D1.sofa-split | All combined per supplier | Sofa lines split (1 PO per qty=1), others combined | **Follow spec.** Sofa per-piece tracking required for fabric/color/size customization. |
| D1.reserved | No reservation; deduct at delivered | Add `stock_balances.reserved` + reservation logic | **Follow spec.** Concurrency-safe across multi-order dispatch window. |

### 17.3 Proto add-ons (E1, E2, E3)

Proto features missing from original spec, now added:

- **E1. Re-check stock button** (proto `LogisticsOrders.jsx:408`). Awaiting_stock drawer "↻ Re-check stock" re-runs `pickWarehouseFor` + `stockShortageFor` in case stock landed via transfer between visits. New route: `POST /api/logistics/orders/:id/recheck-stock`.

- **E2. Print DO button** (proto `LogisticsOrders.jsx:287`). Order drawer + delivered orders show "Print DO". **Server-side PDF endpoint** (Loo's choice over client-side `window.print()`). New route: `GET /api/logistics/orders/:id/print-do` → `application/pdf`. PDF library TBD during M2 (candidates: `@react-pdf/renderer` for Workers, Cloudflare Browser Rendering API).

- **E3. Cross-order PO bundle** (proto `LogisticsOrders.jsx:78-126`). Awaiting_stock kanban column has multi-select checkboxes. Selected orders aggregate by category:
  - Sofa: 1 PO per sofa unit, `dl` = source order's dl
  - Mattress + Bedframe: aggregate SKUs across selected orders, group by supplier, multi-line PO with `dl_refs int[]` (array of all source DLs)
  - Combined PO routing rule: same `category → suppliers.cat_covered` matching as auto-issue
  - Schema: `purchase_orders.dl_refs int[]` column (17.4 below)

### 17.4 Architecture decisions (A5-A8)

| # | Decision | Implementation |
|---|---|---|
| A5 | Auto-promote concurrency: `SELECT FOR UPDATE` on order row + relevant `stock_balances` rows | `logistics_receive_po_line` opens with `select * from orders where id = ... for update;` then iterates stock_balances for affected SKUs with FOR UPDATE. ~50ms lock window. |
| A6 | Post-Proceed cancel: add `logistics_abandon_order` RPC | Logistics drawer has "Abandon order" button when `status='proceed_order'`. Sets `status='cancelled'`, `logistics_stage='cancelled'`, releases `reserved` stock. Does NOT issue refund (Phase 5 Finance). |
| A7 | Cross-order PO multi-DL: `purchase_orders.dl_refs int[]` array column | Sofa POs use `dl` (single int). Combined POs use `dl_refs` (array). drawer query: `where p.dl = $1 OR $1 = ANY(p.dl_refs)`. GIN index in `0017`. |
| A8 | Print DO: server-side PDF gen | Library decision deferred to M2 (see TODOs). Phase 4 implementation may add 1-2 days for PDF gen exploration. |

### 17.5 Code quality decisions (CQ1-CQ3)

- **CQ1.** `0017` is destructive (drops `purchase_orders.sku, qty`). Safety guard at top:
  ```sql
  do $$
  begin
    if (select count(*) from purchase_orders) > 0 then
      raise exception 'purchase_orders is not empty (% rows). Drop columns aborted.',
        (select count(*) from purchase_orders);
    end if;
  end $$;
  ```
  Fails loudly if remote has unexpected data instead of silently dropping.

- **CQ2.** Error contracts for new RPCs:
  ```
  is_logistics():           returns boolean (no errors)
  proceed_order EXTEND:     existing 42501/42P01/22023 + P0001 codes preserved
  logistics_assign_partner: 42501 forbidden / 42P01 order_not_found / 22023 wrong_stage / P0001 partner_not_found
  logistics_attach_do_and_deliver: 42501 / 42P01 / 22023 / P0001 do_required
  logistics_receive_po_line: 42501 / 42P01 po_not_found / 22023 wrong_status / P0001 over_received
  logistics_adjust_stock:   42501 / P0001 negative_stock / P0001 below_reserved / P0001 reason_required
  logistics_abandon_order:  42501 / 42P01 order_not_found / 22023 wrong_status / P0001 reason_required
  logistics_warehouse_pick: 42501 / 42P01 / 22023 wrong_stage / P0001 has_open_pos
  logistics_create_po:      42501 / P0001 supplier_not_found / P0001 warehouse_not_found / P0001 lines_empty / P0001 invalid_qty
  logistics_issue_pos_for_order: 42501 / 42P01 / 22023 wrong_stage / P0001 already_issued (soft idempotency)
  logistics_dashboard_summary: 42501 (read RPC, returns jsonb)
  ```

- **CQ3.** Zod schema names in `packages/shared/src/zod-schemas/logistics.ts`:
  ```ts
  assignPartnerInput        // { partnerId: uuid }
  attachDoInput             // { doNumber: string, doNote?: string, signed: boolean }
  receivePoLineInput        // { sku: string, receivedQty: number }  (poId is path param)
  adjustStockInput          // { sku: string, warehouseId: uuid, delta: number, reason: string }
  abandonOrderInput         // { reason: string }
  createPoInput             // { supplierId: uuid, warehouseId: uuid, lines: { sku, qty }[], dlRefs?: number[] }
  warehousePickInput        // { warehouseId: uuid }
  issuePosForOrderInput     // (no body, action route)
  recheckStockInput         // (no body, action route)
  ```
  9 schemas total.

### 17.6 Test coverage (TS1)

**Target: 100% coverage, ~140 tests.** Boil-the-Lake: cost difference between 55-test smoke and 140-test full coverage with CC is ~3 extra hours, but Phase 5 regression risk drops to near-zero.

Breakdown:
- Shared zod: 9 schemas × ~2 tests = ~18
- Backend RPC tests: ~50
- API route tests: 16 routes × ~4 = ~64
- Frontend: ~30 (5 pages + 7 modals incl. cross-order multi-select UX critical test)
- E2E Playwright: 2 (full happy path; cross-order combined PO bundle)

Repo target: 215 + 140 = ~355 after Phase 4.

**Critical gap tests (mandatory, no AskUserQuestion per skill REGRESSION RULE):**
1. Concurrent `logistics_receive_po_line` race under FOR UPDATE locks (verify A5 actually serializes)
2. `logistics_attach_do_and_deliver` stock deduction (qty -= line.qty AND reserved -= line.qty in same tx)
3. `logistics_adjust_stock` rejects when delta would put qty below reserved (new CHECK constraint)
4. Cross-order multi-select UX: aggregates SKU correctly across N selected orders, opens Procurement with prefilled lines

### 17.7 Performance decisions (P1-P4)

- **P1.** Dashboard implemented as single RPC `logistics_dashboard_summary()` returning jsonb. Mirrors Phase 3 pattern. 1 round-trip per render.
- **P2.** Auto-promote loop is O(N×M) where N = awaiting orders, M = lines/order. Acceptable at MVP scale (< 100 awaiting). Optimization deferred to TODOs.
- **P3.** GIN index on `purchase_orders.dl_refs` added in `0017`:
  ```sql
  create index po_dl_refs_idx on purchase_orders using gin(dl_refs);
  ```
- **P4.** Composite index `(warehouse_id, occurred_at desc)` on `stock_movements` deferred to TODOs.

### 17.8 Updated scope summary

```
Pages:          5  (Dashboard, Orders, Procurement, Warehouse, Movements)
                   was 8 — drop separate Dispatch page (modal in Orders drawer)

Modals:         7  (DispatchModal, DOAttachModal, ReceivePOModal, IssuePOsModal,
                    AdjustStockModal, CreatePOModal, AbandonOrderModal)
                   was 4

Routes:         16 (added: abandon, recheck-stock, print-do)
                   was 14

RPCs:           11 total (1 helper + 1 extension + 9 new)
                   is_logistics()                    [helper, new]
                   proceed_order                     [extend, no new RPC]
                   logistics_dashboard_summary       [new]
                   logistics_issue_pos_for_order     [new]
                   logistics_receive_po_line         [new]
                   logistics_assign_partner          [new — split from mark_dispatched]
                   logistics_attach_do_and_deliver   [new — split]
                   logistics_adjust_stock            [new]
                   logistics_warehouse_pick          [new]
                   logistics_create_po               [new — accepts dl_refs]
                   logistics_abandon_order           [new — A6]

Migrations:     3  (0017 + 0018 + 0019)
                   0017 — purchase_order_lines + dl_refs[] + GIN index + assertion guard + drop sku/qty
                   0018 — stock_balances.reserved + check constraints
                   0019 — is_logistics() + dispatched_at/delivered_at + 9 new RPCs + extend proceed_order

Tests:          ~140 (was 55)

Estimate:       4-6 day human / ~1-1.5 day CC
                was 3-4 day human (added: PDF gen + 1 RPC + 2 routes + scope clarifications)
```

### 17.9 Risks resolved by review

- §15 risk #1 (`delivery_do_ref` / `dispatched_at` / `delivered_at`): RESOLVED via 17.1.
- §15 risk #5 (auto-promote race): RESOLVED via A5 FOR UPDATE strategy (17.4).
- §15 risks #2, #3, #4, #6, #7: unchanged, addressed during M1-M3 implementation.

---

## 18. Proto fidelity reference (2026-05-03 plan-design-review)

> Per CLAUDE.md §3 "Frontend wins": `reference/proto/logistics-*.jsx` is the source of truth for behavior. This section maps each Phase 4 page to its proto file + required UX elements. Implementer reads proto + this section together. Initial proto fidelity rating 6/10 → 9/10 after fixes.

### 18.1 Proto file paths (read these locally)

```
reference/proto/logistics-actions.jsx   (234 LOC: pickWarehouseFor, autoIssuePOsForOrder,
                                         ingestProceededOrder, receivePO, dispatchOrder,
                                         attachDOAndDeliver — all action functions)
reference/proto/logistics-dashboard.jsx (262 LOC: LogisticsDashboard with stacked + split
                                         layout variants, KPI tiles, side cards)
reference/proto/logistics-orders.jsx    (558 LOC: LogisticsOrders kanban + OrderDetailDrawer
                                         + DispatchDialog + DOAttachDialog)
reference/proto/logistics-screens.jsx   (1155 LOC: LogisticsWarehouse + LogisticsMovements
                                         + LogisticsProcurement + 5 modals: NewPO + POReceive
                                         + AssignPickup + ReassignWarehouse + supplier
                                         sub-status logic)
```

### 18.2 LogisticsDashboard

Required UX elements (per `logistics-dashboard.jsx`):

- Hero section: "{N} deliveries today" + "{X} waiting on stock, {Y} ready to ship" + active orders count + total active GMV (RM)
- 3 KPI tiles (clickable, jump to relevant page):
  - Today: deliveries scheduled count, accent green if > 0 else gray
  - Open POs: PO count, accent yellow if > 0 else green
  - Overdue: past delivery date count, accent red if > 0 else green
- 3 active pipeline columns (DashColumn): awaiting_stock, ready_to_dispatch, dispatched (count + 4 items per column)
- 2 side cards: Open purchase orders (top 4) + Low stock SKUs (top 5, ≤1 unit)
- Layout variants in proto: `stacked` (default) and `split` (today's route + side cards on top, pipeline below)
- **MVP F2 decision: stacked layout only**. Split variant deferred to Phase 4 polish.

### 18.3 LogisticsOrders

Required UX elements (per `logistics-orders.jsx`):

Header:
- Page title "Pipeline" with "{N} of {M} orders shown" subtitle
- Search input ("Search #DL or customer…")
- Sales channel selector with optgroup (Dealers / Showrooms split: "All sales channels" / "All dealers" / "All showrooms" / per-name)

Stage filter chips (5):
- All · {N} (default)
- Awaiting stock · {N}
- Ready to dispatch · {N}
- Dispatched · {N}
- Delivered · {N}

Bulk-select action bar (only shows when N awaiting_stock orders selected, E3):
- "{N} orders selected · {S} unique SKUs · {U} units to procure"
- ⚠ warning if cross-warehouse (warehouseSet.size > 1)
- "+ Create combined PO →" button → jumps to Procurement with `window.__poCreateRequest`

4-column kanban:
- Column header: stage label (uppercase, colored) + count + hint
- "Select all to combine PO" checkbox in awaiting_stock column header
- Order card: #DL + placed time + customer name (CJK font detection) + showroom badge + dealer name + delivery date + partner name + total RM
- Awaiting_stock cards have multi-select checkbox

Order detail drawer:
- Header: #DL + StageChip + customer name (CJK font detect) + dealer + Print DO button (when DO attached, E2) + close
- Action bar (depends on stage):
  - awaiting_stock: ⚠ warning text + "↻ Re-check stock" (E1) + "+ Create PO for shortages" + linked PO count
  - ready_to_dispatch: ✓ stock confirmed text + "📦 Assign delivery partner" → DispatchModal
  - dispatched: 🚚 in-transit text + partner name + "📎 Attach DO & mark delivered" → DOAttachModal
  - delivered: ✓ delivered text + DO number on file
- Stock & warehouse section: source warehouse + total items + per-line table (SKU name + on-hand count + green/yellow indicator)
- Linked POs section: per-PO (PO# + lines with received/qty + supplier + ETA + Σ + status badge)
- Delivery section: phone, date (TBD warning), address, floor (with lift/stairs indicator), emergency, partner, DO#
- History section: timeline of order_history entries with timestamp + actor
- Order total at bottom

DispatchModal (D1.dispatch step 1):
- Title: "Assign delivery partner · #{DL}"
- Body: "Stock has been allocated. Pick a delivery partner — they'll be notified to collect from {warehouse}."
- Partner selector dropdown ("name · zones")
- Selected partner detail card: name + contact (mono) + zones
- Buttons: Cancel + "Dispatch"

DOAttachModal (D1.dispatch step 2):
- Title: "Attach Delivery Order · #{DL}"
- Body: "Once attached, the order moves to **Delivered** and {N} items will be deducted from {warehouse}."
- DO number input (auto-suggest `DO-{9800-9999}`)
- Note textarea (optional, e.g. "Delivered at lobby · customer signed")
- "Customer signed the DO on receipt" checkbox (REQUIRED to enable submit)
- Buttons: Cancel + "Mark delivered"

### 18.4 LogisticsProcurement

Required UX elements (per `logistics-screens.jsx:410-594`):

Header:
- Page title "Purchase orders"
- Subtitle: "POs auto-issue on order shortage. Own-logistics suppliers ship & you attach DO. Factory-pickup suppliers notify ready → you assign a delivery partner → partner collects & delivers → you receive."
- "+ New PO" button → NewPODialog with empty prefill

Filter chips (4):
- All · {N}
- Open / partial · {N}
- Pickup action · {N} (POs needing logistics action: ready_for_pickup, delivered, reassign_needed)
- Received · {N}

7-column PO row table:
- PO # (mono, e.g. PO-2031)
- Items (multi-line: status dot color-coded + SKU name + received/qty count; "for order #{dl}" if dl set; "Σ {got}/{total} units" if multi-line)
- Supplier name
- Warehouse name
- ETA date (mono)
- Status badge (open/partial/received with color)
- Action column (varies by sup_status, see below) + Print PO link below (F6)

Action column logic (per po.sup_status when status != received):
- pending / acknowledged / in_production: status text only ("in production")
- ready_for_pickup: "Assign partner" button → AssignPickupDialog (F1.A)
- pickup_assigned: partner name + "awaiting accept" (text only; partner accept = Phase 7)
- pickup_accepted: partner name + "pickup {date}"
- picked_up: "In transit · en route to WH"
- delivered: "Receive →" button → POReceiveDialog
- reassign_needed: "Reassign warehouse" button → ReassignWarehouseDialog (F1.A)
- (status = received): show DO number

NewPODialog:
- Prefill detection: reads `window.__poCreateRequest` if set (from drawer "+ Create PO" or kanban "+ Create combined PO")
- Form: warehouse selector + ETA date + supplier + per-line SKU + qty
- For combined POs: dl_refs[] array tracks all source DLs (per A7)
- Submit creates PO with sup_status='pending'

POReceiveDialog (per F5):
- Header: "Receive {PO#} · attach Supplier DO"
- Subtitle: "Booking goods from {supplier} into {warehouse}. Tick or set the quantity for each SKU on this delivery — anything unreceived stays open on the PO."
- Per-line grid: checkbox + SKU name + ordered/already-received + Pending qty + Receive-now qty input
- Quick actions: "Receive all pending" + "Clear" buttons
- Total counter: "Σ {N} units this DO"
- DO number input (auto-suggest `DO-{5200-6000}`)
- Receiving note textarea (optional, e.g. "2 cartons short · damage to packaging on unit 4")
- DO PDF attach placeholder (simulated in MVP, real attachment Phase 7+)
- "Goods inspected and DO signed by warehouse" checkbox (REQUIRED to enable submit)
- Submit text changes: "Mark received" (if all pending qty selected) vs "Receive partial"

AssignPickupDialog (F1.A — factory_pickup flow):
- Title: "Assign pickup partner · {PO#}"
- Body: "{supplier} has {N} units ready for collection. Choose a partner to dispatch to their factory."
- Previous-rejection warning if pickupRejection (rare, requires Phase 7 partner-decline state)
- Pickup details card: from supplier, to warehouse, lines summary
- Partner selector dropdown ("name · zones")
- Submit: assigns partner, sup_status → pickup_assigned
- RPC: `logistics_assign_pickup_partner(po_id, partner_id)` (NEW per F1)

ReassignWarehouseDialog (F1.A — customer rejection):
- Title: "Reassign warehouse · {PO#}"
- ⚠ Customer rejection card: "Customer cannot receive: {reason}"
- Goods staged card: at supplier, lines summary, originally bound for {wh}
- New destination warehouse selector (excludes current)
- New WH detail card with name + address
- Note: "Supplier will be notified · status returns to Ready · partner reassignment follows."
- Submit: sup_status returns to ready_for_pickup, warehouse_id changes
- RPC: `logistics_reassign_po_warehouse(po_id, new_warehouse_id)` (NEW per F1)
- **Note**: in Phase 4 MVP no PO can reach `reassign_needed` state because it requires partner reporting (Phase 7). UI exists but unreachable until then. Document in M5 frontend.

### 18.5 LogisticsWarehouse

Required UX elements (per `logistics-screens.jsx:1-107`, F4):

Header:
- Page title "Stock balance"
- Subtitle: "Auto-deducted on delivery, auto-incremented when supplier DO is received."
- Search SKU input
- "⇅ Movement log →" button → jumps to Movements with whId prefilled

Warehouse selector tiles (1 per warehouse):
- Card layout: name + address + units count (large mono) + SKU count
- Click tile → filter table to that warehouse
- Active tile: primary border + signature-50 background

Category tabs (3: mattress / bedframe / sofa):
- Tab uses `catalog[k].icon` + `catalog[k].label`
- Active tab: black bg + white text

4-column stock table:
- Product name + "view log →" hint (small)
- This warehouse qty (mono, right-aligned, bold)
- All warehouses qty (mono, right-aligned, gray)
- Status badge: OK (green) / Low (yellow, total ≤1) / Out (red, total = 0)
- Click row → drill to Movements with sku + whId prefilled

Adjust stock action (proto uses Tweaks panel; MVP needs UI):
- Add small "Adjust" button per row → AdjustStockModal (already in spec)
- Modal: SKU + warehouse pre-filled, delta input (signed), reason input
- RPC: logistics_adjust_stock (already in spec)

### 18.6 LogisticsMovements

Required UX elements (per `logistics-screens.jsx:109-407`, F3):

Header:
- Breadcrumb: "← Warehouse / Movement log"
- Page title "Stock in & out history"
- Subtitle: "Showing {N} movements · {period} · {sku} · {warehouse}"
- "↓ Export CSV" button (client-side blob download)
- "Clear filters" button

4 KPI tiles:
- Movements: total filtered count
- Stock in: +{N} (green, "↑")
- Stock out: −{N} (orange, "↓")
- Net change: ±{N} (green if positive, red if negative)

Period chips (5):
- Last 7 days / 30 days (default) / 90 days / All time / Custom
- Custom mode: From + To date inputs (HTML date inputs)

View toggle (2):
- Flat list (default) — chronological rows
- By month — grouped with per-month header (in/out/net stats)

Filter row (5 selects):
- Warehouse (all / per-warehouse)
- Category (all / per-category — resets SKU)
- SKU (all / filtered by category if set)
- Kind (in + out / in only / out only)
- Search (ref / note text)

7-column movement row:
- When (date "12 May" + time "14:23")
- Kind: "↑ IN" or "↓ OUT" badge with colored bg
- SKU name
- Warehouse name
- Qty: +N (green) or −N (orange, mono right)
- Ref + note (e.g. "PO-2031" + "DO from supplier")
- By (role: procurement / logistics)

Month grouping (when view='month'):
- Per-month card with header: month label + N movements + ↑in + ↓out + net stats
- Inline movement table below

### 18.7 Sidebar (Phase 3 sidebar pattern)

5 nav items:
- Dashboard
- Orders
- Procurement
- Warehouse
- Movements

No disabled items (all 5 in Phase 4 MVP).

### 18.8 F1-F7 design fidelity decisions

| # | Finding | Decision |
|---|---|---|
| F1 | factory_pickup supplier flow missing | A) Add per proto: 2 RPCs (assign_pickup_partner, reassign_po_warehouse), 2 modals (AssignPickupDialog, ReassignWarehouseDialog), 5 sup_status transitions tested. +1 day. ReassignWarehouseDialog UI built but unreachable until Phase 7. |
| F2 | Dashboard 2 layout variants | MVP: stacked only. Split layout deferred to Phase 4 polish. |
| F3 | Movements page elaborate | Build per proto: 4 KPI tiles + period chips + view toggle + month grouping + CSV export + 5 filters. |
| F4 | Warehouse page tiles + tabs + drill | Build per proto: warehouse tiles + category tabs + status badges + click row to drill Movements. Add Adjust button per row (proto uses Tweaks; MVP UX). |
| F5 | ReceivePOModal rich | Build per proto: per-line checkbox + qty input, "Receive all" / "Clear" quick actions, signed-DO checkbox required, total counter, button text changes. |
| F6 | Print PO button per row | Add server-side endpoint `GET /api/logistics/pos/:id/print` (matching A8 server-side PDF decision). |
| F7 | ReassignWarehouseDialog | Built per F1.A. UI exists, unreachable in Phase 4 MVP. |

### 18.9 CJK font detection

Proto uses `/[一-鿿]/.test(name) ? "font-cjk" : "font-body"` for customer name display. Implementer must replicate this in:
- LogisticsDashboard `DashColumn` order cards
- LogisticsOrders kanban order cards
- OrderDetailDrawer header

Common in Loo's biz (Malaysian Chinese customer names).

### 18.10 Updated scope after design review

```
Pages:          5  (unchanged from §17)
Modals:         9  (was 7) — added: AssignPickupDialog, ReassignWarehouseDialog
                   1. DispatchModal
                   2. DOAttachModal
                   3. ReceivePOModal (per F5 detail)
                   4. IssuePOsModal
                   5. AdjustStockModal
                   6. CreatePOModal (NewPODialog with prefill)
                   7. AbandonOrderModal
                   8. AssignPickupDialog (F1.A NEW)
                   9. ReassignWarehouseDialog (F1.A NEW)

Routes:         18 (was 16) — added:
                   POST /api/logistics/pos/:id/assign-pickup-partner (F1.A)
                   POST /api/logistics/pos/:id/reassign-warehouse (F1.A)
                   GET  /api/logistics/pos/:id/print (F6 server PDF)

RPCs:           14 total (was 11) — added:
                   logistics_assign_pickup_partner [F1.A]
                   logistics_reassign_po_warehouse [F1.A]
                   (+1 print PO endpoint, no RPC just SQL+PDF gen)

Tests:          ~165 (was ~140) — added:
                   12 sup_status transition tests (F1)
                   8 Procurement modal interaction tests (F4-F7)
                   5 Movements UX tests (F3 KPI tiles, period, view toggle, CSV)

Estimate:       5-7 day human / ~1.5 day CC
                was 4-6 day human (added: F1 factory_pickup +1 day + F3-F6 UX detail)
```

### 18.11 Risks added by design review

- ReassignWarehouseDialog unreachable in Phase 4 MVP (requires Phase 7 partner customer-rejection state). UI exists, dead path until Phase 7. Document in M5 + add a TODO.
- Proto's customer-name CJK detection (`font-cjk` class) must be wired up in 4+ component files. Easy to forget; mark in M3/M5 implementation checklist.
- Adjust button on Warehouse page is a deviation from proto (proto uses Tweaks panel). MVP UX choice; flag in design QA after implementation.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 16 issues / 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score 6/10 → 9/10, 7 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**UNRESOLVED:** 0
**VERDICT:** ENG + DESIGN CLEARED — ready to implement Phase 4 M1 (foundation). All 23 review decisions confirmed on 2026-05-03 (16 eng + 7 design fidelity).
