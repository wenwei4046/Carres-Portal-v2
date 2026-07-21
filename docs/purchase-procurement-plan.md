# Purchase / Procurement — Plan & Locked Decisions

> Started 2026-07-20. Branch `feat/purchase-mrp`. Owner: Jess (COO).
> This doc is the single reference for the Carres Operation **Purchase page**
> (a procurement cockpit / MRP). Paste the "Cross-team" section into other chats
> (esp. the stock / on-hand chat) so they align.

---

## Big direction

1. **Purchase page = a procurement cockpit / MRP** — top At-Risk radar
   (must-order-now · PO-late-to-chase · due-soon · to-receive) + three zones
   **Buy · Expedite · Receive**. NOT an Orders-list clone.
2. Logic copied from the **2990s ERP** (= the Hookka/Ohana sister company, same
   management). Rebuilt in Carres's own Tailwind + UI-KIT v4 (copy the logic,
   not the CSS-module styling).
3. Scope v1 = **sofa + bedframe + mattress (Nice Future)** — all order-driven.
   (Mattress uses **Nice Future via the portal NOW**, during the transition; only
   the FUTURE subscription-mattress supplier is a separate future track.)

## Two buying modes

- **Order-driven (make-to-order)** — sofa / bedframe / mattress(Nice Future):
  a customer order creates demand → raise a PO.
- **Forecast / reorder-point** — **pillow + M.P**: imported from China (~2-month
  lead), pre-bought to stock. Reorder when FREE stock hits **200 per SKU**.

## Net requirements (the engine)

`to order = customer demand − FREE (unreserved) stock − qty on open PO`
Nets off stock + open POs so it never double-orders or misses. Rennes-type
"stock covers it → don't order". Greedy earliest-deadline-first allocation.

## Lead times (all editable defaults)

- Counted in **WORKING DAYS**: Mon–Sat (Sunday off) and skip **Selangor +
  national MY holidays**. (14 working days ≈ 20 calendar days.)
- Defaults: **Sofa 14 / peak 21 · Bedframe 7–10 · Mattress (Nice Future) TBD**.
- **Peak season = Nov → Chinese New Year.**
- **Extra safety buffer default 0** (report the shortest credible date; don't
  lazy-pad — that's the 2990s mistake, its customer sofa promise is a fixed 30d).
- **Raise-by = customer deadline − lead (working days).** ETA = order date + lead.

## Short-delivery strategy (the business pain)

Longest promised date = lost sales. Fight staff's habit of padding "to be safe":
1. **Ready-stock-first** = instant ~3-day promise (why stocking popular items
   matters).
2. Price the promise off **real supplier performance** (scorecard: actual avg
   lead / on-time %), not padded guesses.
3. **Customer promise (short) separate from internal buffer (order early).**
4. **Peak season = a separate lead profile**, not padded year-round.

## SKU / catalog

- **One SKU → one supplier → one cost** (simple). Cost = the Operation Catalog
  `product_skus.cost` (migration 0226, built 7/16). **No dual-code, no supplier
  price-matrix** (simpler than 2990s — Carres suppliers understand our own code).
- The **1159-SKU catalog is already live in the system** (Operation Catalog +
  POS order from it) → **no SKU import needed**.

## Start clean / after-sales

- New orders placed in **this Carres portal**, using the new portal SKU.
- Stop AutoCount + Google Sheet import — **timing: not yet**. Old orders finish
  in AutoCount, kept read-only history in the portal.
- **2nd service / warranty on old products = a Service Case** (customer + old
  order ref + physical item). **No old↔new SKU mapping needed**; stopping
  AutoCount does NOT break after-sales.

## Order → PO → Receive flow (copied from 2990s, simplified)

1. Customer order (in the portal) creates demand.
2. MRP shows the shortage (netted vs stock + open PO), grouped **one PO per
   supplier** (sofa = one PO per order / one dye lot; mattress+bedframe merge).
3. Raise PO → auto-cost from the Operation Catalog cost → PO PDF (prints our
   code; suppliers understand it).
4. Send to supplier (v1 manual PDF; improvement: one-tap WhatsApp + record sent).
5. **GRN receive** (partial OK, dye-lot = PO number, capture supplier DO) →
   stock IN → auto-reserve to the source order.

---

## Cross-team (paste into the stock / on-hand chat)

The Purchase page depends on the stock model. Please align:

- **Net requirements uses FREE (unreserved) stock per SKU** — on-hand must expose
  a per-SKU FREE/available quantity.
- **GRN receive posts stock IN and auto-reserves to the source order.**
- **Ready-stock-first is the short-delivery lever** (free stock → ~3-day promise).
- **Pillow / M.P reorder point = 200 free stock per SKU.**
- **Klg = the only real stock quantity; PJ Showroom = a filtered view of Klg**
  (Klg = Carres warehouse in Klang; PJ = Carres HQ showroom in Petaling Jaya).

---

## Build progress

- Worktree `feat/purchase-mrp` (from main `507f3509`).
- ✅ **Working-day date engine** — `packages/shared/src/working-days.ts` +
  `my-holidays.ts` (Selangor+national 2026 starter, lunar dates flagged to
  verify). 13 tests green. Commits `2929f325`, `8b5f9514`. Unpushed.
- ✅ Lead-time settings — design approved ("good direction, all editable"); real
  table + screen not built yet.
- ⏭ Next: lead-time settings (real) → MRP net-requirements engine → cockpit UI.

## Open / to confirm

- Mattress (Nice Future) lead time — a number for the table (editable).
- Holiday calendar — verify the lunar/Islamic dates vs the official Selangor
  gazette.
- Peak-season exact start (Nov which day) + end (CNY day or the week before).
