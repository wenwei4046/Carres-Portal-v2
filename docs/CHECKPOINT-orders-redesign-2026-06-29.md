# Checkpoint — Operation Orders full redesign (2026-06-29)

**Branch:** `feat/orders-drawer-redesign` · **Worktree:** `C:\Users\User\carres-worktrees\orders-drawer`
**Preview:** `web5180` config (port 5180) in the main repo's `.claude/launch.json`. The
operation session is already logged in (operation@carres.com) at `/operation/orders`.
**Status:** local commits only — NOT pushed, NOT deployed. Await `上线`.
**⚠️ The in-app `preview_screenshot` tool was glitching this session (CPU contention);
verify via `preview_eval` bounding-boxes + tests, or have Jess look live.**

This session = Jess drove a **full redesign of the Operation Orders list + the order
detail drawer + the payment/balance panel**. Everything below is AGREED with him.

---

## Phase plan
1. **List + filter** — mostly DONE (see commits). Remaining: **A8 per-row ⋮ export**.
2. **Drawer structure + follow-up unify** — NOT started.
3. **Payment panel = the balance-job MEDIUM redesign** — NOT started (see spec below).
4. **Logo (E21) + "Logistic" wording sweep (A2)** — E21 inherits from main on rebase.
5. **Consolidation / ship** — retire `feat/orders-filter-readability`, renumber
   migrations 0180–0185 → 0189–0194, rebase onto latest `origin/main` (brings the
   real heart logo + collapsible sidebar — expect an `OperationSidebar.tsx` conflict),
   full verify, then `上线`.

---

## Agreed decisions (Jess, 2026-06-29)

### List / table
- **A1** ✅ DONE — removed the "Carres" remark from the list cell.
- **A2** ✅ DONE — wording aligned to **"Logistic"**: Carrier column → Logistic;
  remark "Action" → Logistic.
- **A3** ✅ DONE — Follow-up column = **icon-only flag** (faint none / amber open /
  red overdue), header is a flag icon, col 78px → 40px. Kept on the LEFT.
- **A4** ✅ DONE — **dark list header** (bg base-800 + white text).
- **A8** ⏳ TODO — per-row ⋮ menu → Export this order as **Excel · CSV · PDF**
  (Google-Sheets style). Reuse `buildOrdersCsv([o])` / `buildOrdersPrintHtml([o])`.
  **DECIDE first:** Excel = lib-free `.xls` (HTML-table, no dep — recommended) vs real
  `.xlsx` (adds a lib, bundle grows). Adds a 14th column (colgroup +1, header +1,
  colSpan 13→14, the header test array +1).
- **A11** ✅ list dates already "6 Jun 26" (drawer date inputs still need it — Phase 2).
- **#2/#4 review** ✅ DONE — dark header + remark labels now small colour pills
  (Logistic=blue / WH=amber / Cust=green).
- **Open tab** ✅ REMOVED (Jess: "I never want Open"). Default = **All**; completed
  orders **sort to the bottom** (`compareByDeadline`), so live work shows first.
  Legend: Placed=new · Proceed=confirmed/arranging · Pending=PO raised, awaiting stock ·
  Scheduled=stock secured, carrier assigned · Completed=delivered/closed · All=everything.

### Filter panel
- **B5/A4** ✅ DONE — darker labels (base-600) + dark table header.
- **B20** ✅ DONE — filter groups `grow` to fill the band (no right gap).
- Filter is the compact 7-box band: one row, ~72px, ghost pill chips, fixed 2-row
  column-flow per box, zero-count alert chips quieted. (Commits earlier this session.)

### Drawer (Phase 2 — NOT started)
- **C9** — "Items & stock" header summary → `Qty X · Ready Y/X`.
- **C10** — "Delivery & control" header shows the Region; drop the standalone Region row.
- **C12** — "Payment" header shows `Paid RM X · Owe RM Y · <status>`.
- **C14** — move the bottom "Order placed by dealer…" status line to a **prominent top
  banner** (adapts: waiting=blue / action=amber / ok=green).
- **A11** — make the drawer date INPUTS show `6 Jun 26` consistently.
- **Core decision — UNIFY the follow-up system** (kills the Star/Flag/Note/Tasks
  overlap): ONE flag = "this order needs follow-up" (list icon col + drawer header);
  the **note timeline = the follow-up/handoff record** (DROP the "general note"
  dropdown, keep an "Escalate to Jess" checkbox); **right-rail "Tasks" → "Follow-ups"
  with a flag icon** (same `ops_tasks` data) — **#3**; **DELETE the ⭐ Star** (redundant
  with the flag).

### Payment / balance — Phase 3 = the BALANCE-JOB MEDIUM redesign (D13)
**This supersedes the earlier "deluxe" balance build (gate + principal waiver), which
Jess REJECTED.** Target = MEDIUM tier:
- **KEEP:** multi-entry payment **ledger** (each entry: amount · date · method · receipt),
  Bill / Paid / **Outstanding**, balance **Due date** (overdue flag), **receipts** PDF,
  storage auto-compute (MS/BF RM150/mo · Sofa RM200/2wk from ETA).
- **Partial payment** records how much paid + the date; balance follow-up; storage shows
  as one line only **if incurred**, with a "Collect" button (records a storage payment).
- **REMOVE the hard delivery GATE** (no 422 block at dispatch) and **REMOVE the principal
  WAIVER** flow entirely. Instead: **soft reminder** at dispatch ("RM X storage
  uncollected — dispatch anyway?") that **never blocks**, + the server **auto-logs**
  that dispatch happened unpaid (audit trail), no approval.
- Mock approved 2026-06-29 (the `redesigned_order_drawer` widget — Payment section).

**Files the medium redesign must touch (the heavy version is already built on this
branch — TRIM it):**
- `supabase/migrations/0184_order_payments_ledger.sql` — keep `order_payments` +
  `balance_due_date` + `storage_collected_at`; **DROP** the 5 `storage_waiver_*`
  columns; ADD a soft-audit field (e.g. `storage_unpaid_dispatch_at` + `_note`). NOT yet
  applied to prod → safe to edit. (Will renumber to 0189 at ship.)
- `apps/api/src/lib/storage-gate.ts` — repurpose `storageBlock` → `storageOwedUncollected`
  (no waiver check, returns amount|null; no message).
- `apps/api/src/routes/operation/orders.ts` (~L433) — **remove the 422** `storage_uncollected`
  block; instead, after assign, if owed+uncollected, stamp the audit field.
- `apps/api/src/routes/operation/order-payments.ts` — **delete** the
  `storage/waiver/request` + `storage/waiver/decide` routes; keep payments CRUD +
  `storage/collect`; trim `CONTROL_GATE_COLS`.
- `apps/api/src/routes/operation/order-control.ts` (L51, L112) + `payments.ts` (L36) —
  drop waiver cols from the select strings.
- `packages/shared/src/schemas/ops-order-control.ts` + `order-payments.ts` — drop
  `requestStorageWaiverInput`/`decideStorageWaiverInput` + waiver cols; add the audit field.
- `apps/web`: `queries.ts` (drop `useRequestStorageWaiver`/`useDecideStorageWaiver`),
  `OrderControlPanel.tsx` (drop waiver UI; keep ledger + Collect; build the D13 layout),
  `OperationPayments.tsx` (drop waiver status).

---

## Commits this session (newest last, on `feat/orders-drawer-redesign`, NOT pushed)
- compact filter band · ghost chips · quiet zero-count chips + darker labels
- (Open tab added then) **REMOVED** — default All + completed-last sort (`f49e44f`)
- list pass 1a — header/wording/flag/fill (`21e3779`)
- dark header + remark pills (`023a3d7`)
- Open removal (`f49e44f`)

## Next steps
1. Decide A8 Excel format → build A8 (per-row ⋮ export).
2. Phase 2 drawer (C9/C10/C12/C14 + the follow-up UNIFY + delete Star + drop note dropdown
   + rename right-rail Tasks→Follow-ups).
3. Phase 3 — trim the balance build to MEDIUM (above).
4. Consolidate + renumber migrations + rebase main + verify + `上线`.

Plans/mocks: the 2 approved mocks were shown in chat (`redesigned_order_drawer`,
`redesigned_orders_list`). Old balance plan (the rejected deluxe):
`docs/superpowers/plans/2026-06-26-balance-job.md`.
