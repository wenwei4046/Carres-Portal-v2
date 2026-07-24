# Purchase / Procurement — Plan & Locked Decisions

> Started 2026-07-20. Branch `feat/purchase-mrp` (now merged into main).
> Owner: Jess (COO). This doc is the single reference for the Carres Operation
> **Purchase page** (a net-requirements procurement cockpit).
> Paste the "Cross-team" section into other chats (esp. stock / on-hand) so
> they align. Business locks live in
> `docs/carres-portal-system-architecture.md §3` — this doc mirrors them.

---

## Big direction

1. **Purchase page = a procurement cockpit** — top At-Risk radar
   (must-order-now · PO-late-to-chase · due-soon · to-receive) + three zones
   **Buy · Expedite · Receive**. NOT an Orders-list clone.
   The word **"MRP" is banned in the UI** (owner call) — use "To Order /
   Purchase / Buy". "Net-requirements engine" is fine in code + docs.
2. Logic copied from the **2990s ERP** (= the Hookka / Ohana sister company,
   same management). Rebuilt in Carres's own Tailwind + UI-KIT v4 (copy the
   logic, not the CSS-module styling).
3. Scope v1 = **sofa + bedframe + mattress (Nice Future)** — all order-driven.
   Nice Future stops **2026-08-31**; **from 2026-09-01 the subscription-mattress
   supplier replaces it as a SEPARATE future track** (do NOT couple subscription
   logic into the current engine — see architecture §3.1).

## Two buying modes

- **Order-driven (make-to-order)** — sofa / bedframe / mattress (Nice Future,
  until 2026-08-31): a customer order creates demand → raise a PO.
- **Forecast / reorder-point** — **pillow + M.P**: imported from China (~2-month
  lead), pre-bought to stock. Reorder when FREE stock hits **200 per SKU**
  (formula: `reorder_point = monthly_velocity × lead_months × safety` — 200
  = starter default, revisit once pillow velocity data lands).

## Net requirements (the engine)

`to order = customer demand − FREE (unreserved) stock − qty on open PO`
Nets off stock + open POs so it never double-orders or misses.
**Allocation rule: greedy earliest-deadline-first** (architecture §3.15) —
payment status does NOT influence which SO gets free stock (PayHold at
delivery already covers the money side).

## Lead times (working days · editable per supplier eventually)

Numbers below MIRROR architecture §3.2 — that is the authority.

- **Sofa:** 14 working days
- **Bedframe:** 8 working days
- **Mattress (Nice Future):** 10 working days (**stops 2026-08-31**)
- **Peak season = OFF.** Engine **NEVER auto-pads** for peak (Nov → CNY).
  Human overrides only. This is a deliberate reversal of the 2990s "fixed
  30-day sofa promise" mistake — report the shortest credible date.
- **Extra safety buffer default 0.**
- **Raise-by = customer deadline − lead (working days).** ETA = order date + lead.
- Working days = Mon–Sat (Sunday off) + skip **Selangor + national MY holidays**
  (14 working days ≈ 20 calendar days). Holiday calendar in
  `packages/shared/src/my-holidays.ts`. Lunar / Islamic dates are starter data —
  verify against the official Selangor gazette before go-live.
- A per-supplier lead-time settings table = migration **0243** (deferred;
  draft-first per architecture §7 guardrail #8).

## Short-delivery strategy (the business pain)

Longest promised date = lost sales. Fight staff's habit of padding "to be safe":

1. **Ready-stock-first** = instant ~3-day promise (why stocking popular items
   matters).
2. Price the promise off **real supplier performance** (scorecard: actual avg
   lead / on-time %), not padded guesses.
3. **Customer promise (short) separate from internal buffer (order early).**
4. **Peak = human override only, not a separate lead profile.** If Q4 clogs
   Ohana, a human raises the promise date on the affected SOs — engine does
   not lie to the operator by year-round padding.

## SKU / catalog

- **One SKU → one supplier → one cost.** Cost = the Operation Catalog
  `product_skus.cost` (migration 0226, built 2026-07-16).
  **No dual-code, no supplier price-matrix** (simpler than 2990s — Carres
  suppliers understand our own code).
- The **1159-SKU catalog is already live** (Operation Catalog + POS order
  from it) → **no SKU import needed**.

## Start clean / after-sales

- New orders placed in **this Carres portal**, using the new portal SKU.
- **AutoCount + Master.xlsx import retired at go-live** (architecture §3.3).
  Old orders finish in AutoCount and are kept as read-only history.
- **2nd service / warranty on old products = a Service Case** (customer + old
  order ref + physical item). **No old↔new SKU mapping needed**; stopping
  AutoCount does NOT break after-sales.

## Order → PO → Receive flow (copied from 2990s, simplified)

1. Customer order (in the portal) creates demand.
2. Engine shows the shortage (netted vs stock + open PO), grouped:
   - **Sofa** = one PO per SO (fabric dye-lot must be consistent).
   - **Bedframe + Mattress** = batch multiple SOs into one PO per supplier
     per review window (Mon / Wed / Fri).
3. Raise PO → auto-cost from the Operation Catalog cost → PO PDF (prints our
   code; suppliers understand it).
4. Send to supplier (v1 manual PDF; improvement: one-tap WhatsApp + record sent).
5. **GRN receive** — partial OK, dye-lot = PO number, capture supplier DO →
   stock IN → auto-reserve to the source order.
   - **Over-receive** (e.g. 6 delivered / 5 demanded): the extra unit lands in
     free stock (Own · Carres Klang).
   - **Defective on arrival** (e.g. 4 good + 1 damaged of 5): 4 reserved,
     1 opens a Service Case for return to supplier — the SO's demand is still
     1 short and re-enters the At-Risk radar.
   - **Under-receive** (e.g. 3 / 5): 3 auto-reserved to the earliest-deadline
     eligible SO; remaining 2 stay as open PO shortage.

## Line changes AFTER a PO is sent (LOCKED 2026-07-24)

- A customer add-line (via `add_order_lines` P1 / P3) **always raises a 2nd PO**.
  Engine does NOT auto-append to the existing PO. See architecture §3.13.

## SO cancellation (LOCKED 2026-07-24)

- SO cancellation is NOT allowed by default (architecture §3.14).
- When Jess approves one and a PO is already sent: let the PO finish → GRN
  into stockpile → engine auto-suggests the next pending SO whose demand
  matches. There is no "cancel PO + WhatsApp supplier stop" path.

---

## Cross-team (paste into the stock / on-hand chat)

The Purchase page depends on the stock model. Please align:

- **Net requirements uses FREE (unreserved) stock per SKU** — on-hand must expose
  a per-SKU FREE / available quantity.
- **GRN receive posts stock IN and auto-reserves to the source order.**
- **Ready-stock-first is the short-delivery lever** (free stock → ~3-day promise).
- **Pillow / M.P reorder point = 200 free stock per SKU** (starter default).
- **Klg = the only real stock quantity; PJ Showroom = a filtered view of Klg**
  (Klg = Carres warehouse in Klang; PJ = Carres HQ showroom in Petaling Jaya).

---

## Shipped so far (as of 2026-07-24)

Worktree `feat/purchase-mrp` merged into main.

- ✅ **Working-day date engine** — `packages/shared/src/working-days.ts`
  + `my-holidays.ts` (Selangor + national 2026 starter, lunar dates
  flagged to verify). Commits `2929f325`, `8b5f9514`, `daf06588`
  (5-day-week default: Sat + Sun off for supplier date math).
- ✅ **Net-requirements "today" endpoint** — `e893759e`. Reads open POs +
  demand + free stock, returns the netted shortage list.
- ✅ **Cockpit page wired** — `d50d5ef8` (initial), `33c8b3c2`
  (scale-aware supplier-grouped master-detail rebuild), `c7401e52`
  (3-pane design locked), `5c87d8ed` (round-2/3 refinements),
  `1020c600` (weekend / PH greyed + L/R chevron nav),
  `284a7eef` (tighter To Order header, StageTabs killed).
- ✅ **AutoCount orders included** in procurement plan — `ca0baa34`.
- ✅ **Chase (② Expedite) + Receive (③) wired to open POs** — `ace955ba`.
- ✅ **Send PO button → CreatePOModal** — `525e4317`.
- ✅ **Check-in button → ReceivePOModal** — `6d97d6fd`.
- ✅ **Chase events recorded to `audit_log`** — `f5564845`.
- ✅ **Smart tabbed month calendar in right rail** — `22ff74b3`.
- ✅ **Jump to Purchase Orders tab after Send PO succeeds** — `9a9875d1`.
- ✅ **Nav merge** — three procurement rails collapsed into one Purchasing
  module (`32648859`); guided cockpit renamed "Purchase" → "To Order"
  (`6c7b5498`).

## Next up

- Item E · **Facet stage auto-expand + supplier · date sub-list**
  (per `CHECKPOINT-purchase-cockpit-2026-07-23.md`) — Today's-work rows
  (Send POs / Chase / Receive) expand to show each PO with supplier + date;
  active stage auto-expands, others collapse; clicking a supplier row syncs
  the middle list + right detail.

## Open / to confirm

- **Per-supplier lead-time settings table** — migration 0243 (deferred).
- **Selangor 2026 holiday calendar** — verify lunar / Islamic dates against
  the official gazette before go-live (silent-wrong risk on first CNY /
  Deepavali).
- **Pillow / M.P monthly velocity data** — needed to justify the 200 reorder
  point vs a computed formula.
- **Nice Future → subscription mattress cutover on 2026-09-01** — engine
  must stop raising Nice Future POs from that date and route mattress
  demand to the subscription track (separate module, not part of this
  cockpit).
