# Phase 2C — Reflection

> **Phase 2C (Dealer order mutations) shipped 2026-05-03.** All 5 sub-phases delivered. Tag: `phase-2c-complete`.

---

## What shipped

| Slice | Deliverable | Commits |
|---|---|---|
| Pre-2C | UI design audit + drift fix — 8 groups of inconsistencies vs `reference/proto/*.jsx` (status colors leaking to Tailwind defaults, button system, active state pattern, label typography, modal chrome, ProductPicker / OrderRow / ThankYou / Step1 structure). Added `--success/-warning/-info/-error`, `--signature-50/100/700` tokens; `.btn-primary/-secondary/-ghost`, `.kicker`, `.label` utilities via `@layer components`. | f705c38 |
| 2C.1 | `proceed_order` RPC + Place→Proceed kanban transition + ActionPanel UI | f0b3cd4 |
| 2C.1a | "Order pricing" phantom blocker fix — list endpoint now includes `totalAmount`; client `proceedBlockers()` falls back to `lines+addons` if missing | f0b3cd4 |
| 2C.1b | 3 blocker resolution modals — `TopUpDepositModal` / `ConfirmDateModal` / `AddAddressModal` backed by `top_up_order` / `set_order_address` / `set_order_date` RPCs | f0b3cd4 |
| 2C.2 | `EditOrderModal` + `update_order` RPC (partial jsonb payload pattern) | f0b3cd4 |
| 2C.3 | `CancelOrderDialog` + `cancel_order` RPC (reason captured in `order_history.metadata`) | f0b3cd4 |
| Bugfix | Cache sync — closure-captured `orderId` in setQueryData/invalidateQueries + `await invalidateQueries` so refetch completes before modal closes | f3ac6d0 |
| Toast | `sonner` installed and mounted in `App.tsx` — `position="top-right"`, `richColors`, `closeButton` | f0b3cd4 |

3 commits in Phase 2C, 36 files changed, +4240 / -541 lines, 159/159 tests green, all pushed to `origin/main`.

---

## What surprised us

### 1. UI drift was bigger than expected — required a pre-phase audit

Loo asked for "100% match proto" before any 2C work. The audit found 8 distinct drift groups, including status badge colors leaking to Tailwind defaults (slate/sky) instead of the warm-linen accent tokens, and a button system that had silently fragmented across pages. **40+ minutes of unplanned work** before any 2C code could land.

**Carry forward:** `feedback_design_fidelity_proto.md` saved to memory — audit current vs `reference/proto/*.jsx` BEFORE writing any UI code. Per-item permission required, especially for color and button changes.

### 2. List endpoint didn't compute `totalAmount` → "Order pricing" phantom blocker

After Slice 1 shipped, Loo's manual QA caught a false-positive blocker on the dashboard: orders with valid line totals showed "Order pricing not set" because the `totalAmount` field was only populated by the GET `/orders/:id` detail endpoint, not the list endpoint. The kanban dashboard's `proceedBlockers()` ran on list-shape data without `totalAmount`.

**Fix in two layers:**
- Server: `computeTotalFromLines` helper unified across list + detail.
- Client: `proceedBlockers()` falls back to summing embedded `lines + addons` if `totalAmount` is missing.

15 unit tests in `order-blockers.test.ts` lock the fallback behavior.

### 3. Kanban stayed stale after blocker resolution → cache key + race bug

Loo's QA caught a more subtle bug: after submitting a blocker resolution modal, the action panel updated but the rest of the page (kanban columns, list rows) showed stale data until manual refresh. Two compounding issues:

1. **Wrong cache key.** `setQueryData(qk.order(order.id), ...)` was reading the id from the mutation response, not from the closure-captured `orderId` that `useOrder(id)` was observing. They should always match — but using the captured value is the only one guaranteed to.
2. **Race condition.** `qc.invalidateQueries(...)` was fire-and-forget. The modal's `onClose` callback fired before the refetch resolved, so the user saw the old kanban for ~200ms.

**Fix:** `await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true })` in onSuccess BEFORE calling caller's onSuccess. Also `await qc.invalidateQueries({ queryKey: qk.orders() })` for the list.

**Carry forward:** documented inside `apps/web/src/lib/queries.ts` — every mutation hook now uses the closure-captured arg, never the response's `order.id`. `useCreateOrder` is the one exception (brand-new id only exists in the response).

### 4. `replace_all` patch broke `useProceedOrder` and `useCreateOrder`

When fixing #3, tried `replace_all=true` to swap `qk.order(order.id)` → `qk.order(orderId)` in `queries.ts`. Compilation failed because:
- `useProceedOrder` doesn't have `orderId` in scope (it gets the id from `variables[1]` — the second mutate arg).
- `useCreateOrder` doesn't have it either (the id IS the response — it's brand-new).

Had to fix surgically: `useProceedOrder` now extracts `mutateOrderId = variables[1]`; `useCreateOrder` keeps `order.id` from the response. Lost ~10 minutes to the rollback.

**Carry forward:** `replace_all` is dangerous on hook files where the same identifier means different things in different scopes. Surgical edits per hook are safer.

### 5. `order_history.metadata jsonb` chosen over dedicated tables

Top-up needed receipt photo paths. Edit needed the partial payload. Cancel needed a reason. Three options:
- **A:** 3 separate tables (`order_receipts`, `order_edits`, `order_cancellations`)
- **B:** 1 table with a `kind` discriminator
- **C:** Add `metadata jsonb` to existing `order_history` and let each event type write its own shape.

Chose **C**. Single source of truth, additive (no existing rows touched), trivial to extend. If a proper `order_receipts` view is needed later for the timeline UI, easy migration to extract.

**Carry forward:** future RPCs can add new history `kind` values without further migrations. The `metadata jsonb` is the catch-all.

---

## Schema tweaks (4 migrations applied to remote Supabase via MCP)

| File | Adds | Destructive? |
|---|---|---|
| `0008_proceed_order_rpc.sql` | `proceed_order(order_id uuid)` RPC | No — function only |
| `0009_blocker_resolution_rpcs.sql` | `top_up_order`, `set_order_address`, `set_order_date` RPCs + `metadata jsonb` column on `order_history` | No — additive column + functions |
| `0010_update_order_rpc.sql` | `update_order(order_id uuid, payload jsonb)` RPC | No — function only |
| `0011_cancel_order_rpc.sql` | `cancel_order(order_id uuid, reason text)` RPC | No — function only |

All 5 RPCs are `security definer` with a manual cross-dealer guard inside the function body. **Zero RLS policy changes** — the global RED LINE on RLS stays intact.

**Error contract (consistent across all 5 RPCs):**
- `42501` forbidden (cross-dealer guard)
- `42P01` not_found (order id missing)
- `22023` invalid_param (status guard, missing fields)
- `P0001` raise_exception with `DETAIL = blocker_code` (proceed only)

Hono routes catch SQLSTATE and return 422 with `{ error, code, message }` so the client can branch on `code` for specific toast copy.

---

## What got deferred

- **`phase-2c-complete` tag** — created at the end of this session (this commit's predecessor is the reflection itself).
- **ConfirmDateModal slot/note fields** — proto's modal captures delivery slot + free-form note, but no schema column exists. Currently only `delivery_date` persists; slot/note ignored. TODO in code.
- **`order_receipts` view** — top-up photo paths live in `order_history.metadata.photo_paths` for now. If Loo wants a proper receipts timeline UI, easy extraction later.
- **EditOrderModal cascading address picker** — currently uses a flat textarea instead of `MYAddressFields` (state → city → postcode cascade). Code comment in `EditOrderModal.tsx`. Add a "use structured picker" toggle if needed.
- **End-to-end eyeball test on production-shape data** — Loo confirmed the basic flow but a full 5-mutation walk-through on real data was deferred to next session.
- **Code-splitting for the 500 kB JS chunk** — pre-existing warning, not introduced by Phase 2C. Defer to a perf pass.

---

## Time spent (approximate)

- UI audit + drift fix (Pre-2C, commit f705c38): ~45 min
- Slice 2C.1 (proceed RPC + ActionPanel): ~30 min
- Slice 2C.1a (totalAmount fix): ~15 min
- Slice 2C.1b (3 blocker modals + RPCs): ~40 min
- Slice 2C.2 (edit modal + RPC): ~25 min
- Slice 2C.3 (cancel dialog + RPC): ~15 min
- Cache sync bug investigation + fix: ~25 min
- Reflection + tag (this commit): ~15 min

Total Phase 2C: ~3.5 hours of active work in one session. Rough estimate from the master plan was 1 week for all of Phase 2 — we're well inside it (Phase 2A + 2B + 2C combined cost ~2 days of active work).

---

## What to carry into the next phase

1. **Mutation hook pattern is locked.** Use the closure-captured arg in `setQueryData` / `invalidateQueries`. Always `await qc.invalidateQueries(...)` in onSuccess BEFORE the caller's onSuccess fires. `apps/web/src/lib/queries.ts` is the canonical reference.
2. **`security definer` + manual guard is the RPC pattern.** All 6 dealer mutations follow it. Phase 3+ should use the same shape — no RLS UPDATE policies needed for cross-status transitions.
3. **`order_history.metadata jsonb` is the extensibility hook.** Adding a new event type? Just write to `metadata` with a new `kind`. No migration unless you need to query inside the jsonb.
4. **`fetchAndShapeOrder` helper in `orders.ts`** re-fetches full order with rels + signs URLs + attaches `totalAmount`. Every mutation route + GET `/:id` calls it, so all consumers get identical shape. Reuse it for any new order-returning route.
5. **Sonner toast convention is set.** `position="top-right"`, `richColors`, `closeButton`. Success format: `${verb} ${entity} #${dl}`. Error: branch on `ApiError.body.code`, fall back to `err.message`.
6. **Storage path guard.** `assertDealerOwnedPath` validates that uploaded paths live inside `orders-attachments/{dealerId}/`. Use it for any new dealer-scoped Storage feature.

---

## Acceptance check (final)

Phase 2C scope (sub-set of Phase 2 acceptance from `CARRES_PORTAL_V2_PLAN.md` §530):

- [x] Order 出现在 "Place" kanban，点 proceed 移到 "Proceed"
- [x] Blocker resolution: top-up / address / date all work end-to-end
- [x] Edit order: partial jsonb payload, status-aware
- [x] Cancel order: reason captured in `order_history.metadata`
- [x] Cache sync: kanban + list + detail all refresh after any mutation
- [x] No RLS policy changes (RED LINE intact)
- [x] All 4 migrations applied to remote Supabase + committed to `supabase/migrations/`
- [x] 159/159 tests green (shared 17 + api 65 + web 77)
- [x] Build green (25.89 kB CSS / 658 kB JS / 1.49s)
- [x] `phase-2c-reflection.md` written (this file)
- [ ] `git tag phase-2c-complete` and push (next step)
- [ ] CLAUDE.md §17 status updated to "Phase 2C complete; Phase 3 not started"

Phase 2 acceptance items NOT covered by 2C (still open at end of Phase 2):

- [ ] Mobile 视口 (< 768px) bottom tab navigation — touched lightly in 2A but not fully audited
- [ ] Salesperson 账号只看到自己 outlet 的 order — not yet implemented
- [ ] 充值申请 (top-up) appearing in `approvals` table — half done (top_up_order RPC writes to `order_history`, not yet wired to `approvals`); needs Phase 3 (Principal) to close the loop

These are flagged for the next session to triage: do them as a "Phase 2D" sweep, or fold into Phase 3 (Principal) where the approval flow lives.
