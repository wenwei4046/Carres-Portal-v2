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
├─ Ready stock  how much to keep       (tab appears when K2 ships; hidden until then)
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

## K2 · Ready stock plan (propose → consolidate → approve → PO)

**Goal:** the monthly lane. Salesperson submits wanted qty per SKU; Sales Manager sees all
proposals + system columns (30/90-day sales · weekend share · current · incoming ·
suggestion) and consolidates; COO approves / edits / rejects with remarks; approval
hands Operations a ready-to-create PO list. Over-suggestion warning
(`⚠ well above 3-month average`) warns, never blocks.
**Done when:** the whole chain is auditable — who asked, who cut, who approved, what was
ordered.

## K3 · Emergency request lane

**Goal:** same flow, any time, flagged `EMERGENCY` with reason
(`Promotion · Unexpected demand · Weekend stock low · OOS risk · New launch · Other`);
skips consolidation (straight to COO), never mixes into the monthly plan's numbers.
**Done when:** a viral-product weekend can be restocked without waiting for month-end.

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
| K2 | ⬜ | — |
| K3 | ⬜ | — |
| K4 | ⬜ | — |
| K5 | ⬜ | — |
