# Ready Stock execution queue — ONE CARD PER CHAT (locked with Jess 2026-07-27)

> **How to use (Jess):** new chat, paste:
> "Read `docs/ready-stock-execution-queue.md`. Do card K<n> ONLY. Do not touch any other
> card. Do not redesign anything marked ALREADY EXISTS."
>
> **Source:** Jess's design conversation. Locked business shape:
> - Ready stock is ONE shared pool (never split sales-stock vs emergency-stock) — every
>   use records a reason (`Sales urgent · Supplier delay · Warranty exchange · VIP · Other`).
> - Plan flow: **Salesperson proposes → Sales Manager consolidates → COO approves →
>   Operations creates the PO.** System SUGGESTS numbers (sales history, current, incoming);
>   humans decide. Emergency request = same flow, separate lane, any time.
> - Pillow / mattress protector: China import ~2 months — reorder point (<200) alerts,
>   not after-the-fact OOS. No expiry tracking; slow-moving alert instead.
> - Only the COO edits reorder points / reserve levels / approval rules.
>
> **Sidebar home: the ONE `Stock` door (K0 merges On Hand + Movements into it; Ready stock is its middle tab). No new menu item.**

## Ground truth (read before ANY card)

- Per-unit stock engine is LIVE: `ops_stock_items` (free/reserved/incoming/sold…) +
  `stock_balances` + Stock On Hand / Movements / Ready / Reserved pages. **Reservation
  already exists** — do NOT rebuild it; Available = free is already the working truth.
- Purchase MRP engine (packages/shared, `feat/purchase-mrp` line) already computes net
  requirements + forecast-tracks pillow/M.P reorder <200 — the K-series CONSUMES it,
  never re-implements demand math.
- `docs/inventory-module-proposal.md` exists — sibling spec; on conflict, THIS queue +
  Jess's locked shape above win.

## K0 · One Stock door (kills the word confusion) ✅ (PR #376)

**Problem (Jess, 2026-07-27):** On Hand / Movements / Inventory / Ready stock — four words
for ONE warehouse. **Fix:** merge the two sidebar items into ONE `Stock` entry with tabs:

```
Stock
├─ On hand      what's here now        (existing OperationStockOnHand, unchanged)
├─ Ready stock  how much to keep       (shipped at K2 — OperationStockPlan)
└─ In & out     when things moved      (existing Movements page — RENAMED; its own h1
                                        already says "Stock in & out history")
```

**Word law (add to COPY-STANDARD):** user-facing word is `Stock` only; `Inventory` and
`Movements` are banned from UI (same treatment as POD). Ready stock is a PLAN about the
same goods, never a second pool.
**Touch:** sidebar config + tab shell in `OperationApp.tsx`; both pages mount unchanged
inside. **No migration. Nav-only.** Keep old tab keys working (kept-mounted pages pattern
already exists there — follow it).
**Done when:** the sidebar has ONE stock entry; no visible "Movements"/"Inventory" string.

## K1 · Reorder alert for import accessories ✅ (PR #400)

**Goal:** pillow / mattress protector rows show `current · reorder point · incoming` and
raise `Reorder stock` into the ops worklist when current+incoming ≤ reorder point
(2-month China lead = the alert must fire early, math from the MRP engine).
Reorder points editable by COO only.
**Done when:** the <200 case can never be discovered by hitting zero.

**Shipped 2026-07-27** (PR #400, migration **0286**). The card was real: prod held
pillow 555 · protector-Q 319 · **protector-K 15**, and no screen said so.
`packages/shared/reorder-alert.ts` is the one engine (three states — `reorder` · `ok` ·
`unset`); `GET/PUT /api/ops/stock/reorder` decides server-side so the band and the
dashboard tile can never disagree. Notes the later cards need:
- **Current reads `ops_stock_items` summing `qty`, NOT `stock_balances`** — that rollup
  is `count(*)`-based (pre-0218), so the 555-unit pillow row reads as 1. K2-K5 must read
  the same register. 0018's table + RPC left untouched.
- **The point is keyed on the stock SKU STRING** — all 49 live stock SKUs join to ZERO
  `product_skus` rows (free-text Klg-sheet names). Do not add a catalog FK in K2.
- **`unset` is a first-class state** — "Set a number", never a reassuring "Enough". A
  quiet screen must mean "watched and fine", never "nobody has looked".
- **`stock_planner` duty** (seeded from live holders → the COO seat only, no legacy email
  fallback). **K4's reserve levels reuse this same key** — do not mint a second one.
- `ops_reorder_points` has **no write policy at all**; the audited DEFINER RPC is the only
  door. Same shape for anything K2-K5 adds.
- **Nothing seeded** — every accessory reads "Set a number" until the COO picks one.

## K2 · Ready stock plan (propose → consolidate → approve → PO) ✅ (PR #409)

**Goal:** the monthly lane. Salesperson submits wanted qty per SKU; Sales Manager sees all
proposals + system columns (30/90-day sales · weekend share · current · incoming ·
suggestion) and consolidates; COO approves / edits / rejects with remarks; approval
hands Operations a ready-to-create PO list. Over-suggestion warning
(`⚠ well above 3-month average`) warns, never blocks.
**Done when:** the whole chain is auditable — who asked, who cut, who approved, what was
ordered.

**Shipped 2026-07-27** (PR #409, migration **0287**). Ready stock is now the MIDDLE Stock
tab, exactly where K0 reserved it. Two live findings reshaped the card, and both are load-
bearing for K3-K5:

- **The sales history the card asks for would have LIED.** All 37 `source_system='autocount'`
  orders carry `placed_at = 2026-07-23` — the day they were IMPORTED — and every sales line
  matching a warehouse SKU comes from them. A plain 30-day column prints "36 pillows" and
  the 90-day column prints the same 36; that day being a **Thursday**, weekend share reads a
  confident **0%** for every SKU. Real native history = 19 orders over **six days**. So the
  engine excludes archive at the source (0265's law — no new flag) and **returns the excluded
  count** so the screen says so out loud. **K3-K5 must read demand the same way.**
- **Coverage gates the math, and it heals by itself.** No run rate / suggestion below
  `MIN_HISTORY_DAYS_FOR_SUGGESTION` (14 real days); the `⚠ well above 3-month average`
  warning cannot fire below `MIN_HISTORY_DAYS_FOR_BASELINE` (60). A warning that fires off a
  fabricated average trains people to ignore warnings. Nothing to switch on later.
- **The card's three job titles have ONE live actor.** All 5 active `salespersons` have
  `user_id = null` (PIN sign-in, no `app_users` row), so they cannot authenticate to the ops
  API at all — a salesperson-login lane would have had ZERO possible submitters. There is no
  Sales Manager seat; only Jess (COO) holds any duty. The four STAGES are kept and gated on
  duties that exist: propose = any operation login · consolidate = `ops_manager` · approve +
  final qty = `stock_planner`. **K3's emergency lane should reuse these same two gates** —
  hiring a Sales Manager splits the flow with no migration.
- **ZERO new duty keys**, asserted in 0287's own sanity block so a later card cannot quietly
  add one. K4's reserve levels still reuse `stock_planner` (0286's note stands).
- **The PO list reads `approvedQty` and never falls back** to the consolidated or proposed
  number — that is what makes "what was ordered" traceable. A line cut to 0 drops off.
- 3 tables with a READ policy and **NO write policy at all**; the 5 audited DEFINER RPCs are
  the only door (0286's shape). The first cut moves the cycle into review in the SAME act
  that closes proposals, so the two can never disagree. `rejected` is terminal.
- **Nothing seeded** — no cycle exists until someone opens a month.

## K3 · Emergency request lane ✅ (PR #421)

**Goal:** same flow, any time, flagged `EMERGENCY` with reason
(`Promotion · Unexpected demand · Weekend stock low · OOS risk · New launch · Other`);
skips consolidation (straight to COO), never mixes into the monthly plan's numbers.
**Done when:** a viral-product weekend can be restocked without waiting for month-end.

**Shipped 2026-07-27** (PR #421, migration **0290**). The urgent lane is a section on the
same Ready stock tab, below the monthly plan — one place to ask, two speeds. Notes K4-K5
need:

- **"Never mixes into the monthly plan's numbers" is a SEPARATE TABLE, not a flag.** An
  `is_emergency` column on `ops_stock_plan_proposals` was the cheaper build and would have
  made every future reader of that table responsible for remembering to filter it — the
  first one who forgets silently inflates a month's ask with a weekend panic. Instead
  `ops_stock_emergency_requests` has **no `plan_id` and no `period`**, K2's engine reads
  proposals, and 0290's sanity block **asserts the absence of those columns** so a later
  card cannot quietly reconnect the lanes.
- **NO suggested quantity here, deliberately.** An emergency is by definition demand the
  sales history does not contain, so scaling a run rate off it would be exactly the
  fabrication K2 refuses to print (0287's coverage rules). The row states FACTS — free now
  · spoken for · on the way — and warns `already has enough free` when the register covers
  the ask. **Warns, never blocks**: the register can be behind what the person on the floor
  knows.
- **A FOURTH state the card does not name: `ordered`.** K2's handover list is scoped by its
  month so it clears itself; this lane runs continuously, and without a way to say "I
  raised the PO" an approved ask would sit on the worklist forever. Not auto-PO (still the
  LATER section) — a human ticking a box, gated on **`po_duty_editor`**, the duty that
  already means "the person who raises purchase orders".
- **ZERO new duty keys**, asserted in 0290's sanity block exactly as 0287 did: raise = any
  operation login (**not** duty-gated — it is the person on the floor who sees the shelf
  empty, and gating it would mean only the two busiest people can report an emergency) ·
  decide = `stock_planner` · mark ordered = `po_duty_editor`. All resolve to Jess today.
- **Cutting and approving are ONE act.** The card says this lane skips consolidation, so a
  save-quantity-then-press-approve pair would rebuild the step it removes. One box, one
  click, `approved_qty` defaulting to what was asked when the COO says nothing.
- **`Other` cannot be filed without words** — enforced by the same shared function on the
  disabled button, in the route and by a DB CHECK. The whole point of a locked reason list
  is that K4/K5 can read WHY the pool drains; a wordless "Other" is a hole in that answer.
- Two plain-word relabels, the no-jargon law rather than a redesign: `OOS risk` →
  **About to run out** (OOS is warehouse jargon a low-English operator does not read). Keys
  keep the card's vocabulary.
- 1 table with a READ policy and **NO write policy at all**; the 3 audited DEFINER RPCs are
  the only door (0286/0287's shape). `rejected` and `ordered` are terminal.
- **Nothing seeded** — the lane is empty until somebody asks.

## K4 · Pool usage reasons + reserve level

**Goal:** taking a ready-stock unit records WHY (the locked reason list); each SKU carries
a COO-set `reserve level` — at/below it, further use warns (`近最低保留量`) but never
blocks (COO decides, system reminds). Usage split (Sales 60% / supplier-delay 25% / …)
readable per month.
**Done when:** "为什么一直缺货" is answerable from data.

## K5 · Stock health + proposal accuracy

**Goal:** the review layer. Stock health per SKU
(`🟢 healthy · 🟡 low · 🟠 over-stocked · 🔴 critical`) + slow-moving alert
(no sales 90/180 days) + per-month proposal accuracy (requested vs sold vs remaining)
so planning improves instead of repeating.
**Done when:** COO opens one tab and knows what needs attention today — without reading
SKU rows.

## LATER

- MOQ / container consolidation hints · multi-warehouse ready stock · auto-PO on approval
  (approval hands a LIST today; auto-create only after the flow proves itself live).

## Status

| Card | Status | PR |
|---|---|---|
| K0 | ✅ shipped 2026-07-27 | #376 |
| K1 | ✅ shipped 2026-07-27 | #400 |
| K2 | ✅ shipped 2026-07-27 | #409 |
| K3 | ✅ shipped 2026-07-27 | #421 |
| K4 | ⬜ | — |
| K5 | ⬜ | — |
