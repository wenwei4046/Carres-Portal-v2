# CHECKPOINT — Purchasing · To Order

> **Last written 2026-07-31.** Overwritten in place; there is never a second
> version of this file.
>
> **The page is being REBUILT section by section from the Design System.** The
> previous checkpoint described the architecture this replaces; that text is
> gone rather than annotated.
>
> Read this, then `docs/03-page-patterns.md` → Review → Carres Examples.

---

## 🔴 FIRST JOB: look at Items and say what is wrong with it

One section of the new page is live. Nobody has looked at it.

```
https://erp.carresofficial.com  →  Purchasing  →  To Order
→ pick a supplier → open a purchase order block
```

What you should see:

```
ITEMS                                          13 lines · 14 units
────────┬──────────────────────┬────────┬──────┬──────
Ref     │ Item                 │ Size   │  Qty │
────────┼──────────────────────┼────────┼──────┼──────
SO-1203 │ L1201S               │ King   │    1 │  ⋯
SO-1205 │ N1001S               │ Queen  │    2 │  ⋯
SO-1207 │ Sofa 2 — Booqit      │ —      │    1 │  ⋯
```

`⋯` → `Create Another Purchase Order` · `Remove` · ─── · `Open Customer Order`.
Sofa has neither of the first two. `Move to Purchase Order N` appears only after
a split has made somewhere to move to.

**It is still nested inside the old accordion.** Taking it out is a LAYOUT
change and layout is deliberately not started.

---

## The page, frozen 2026-07-31

Order is deliberate: **who am I sending to → can I reach them → what am I sending.**

```
Header                    supplier · destination · dates       collapsed by default
Supplier Communication    channels · WhatsApp + Email drafts    collapsed by default
Items                     the review itself                     the largest region
Notes to Supplier
Issue Purchase Order      the one primary action
```

| Section | State | Blocked on |
|---|---|---|
| Items | ✅ built | — |
| Header | not started | `suppliers` has no address · tel · attn |
| Supplier Communication | not started | no `po_sends` table · unruled words |
| Notes to Supplier | not started | no ruled word (`delivery_instructions` exists, unwritten) |
| Issue | already live | — |

**~80% of an operator's time on this page is READING.** It is a `Review`
pattern, not a form.

---

## Business rules frozen in this design (do not re-open)

**Every Purchase Order has exactly one fulfilment destination.** Follows from
arithmetic, not policy — one document, one drop-off point.
- single-customer PO → warehouse · partner · **Customer Address**
- multi-customer PO → warehouse · partner only
- want one customer direct off a merged PO? **Split first.** Split is the door
  to direct delivery, not just a rearrangement.
- `Set all destinations` is a BULK DEFAULT; each PO may override its own.
- ⚠ Needs one column that does not exist: a way to say *this PO's destination
  is its own customer*. `destination_id` is an FK to `purchasing_destinations`
  and the customer is not a row in it.

**Communication is an EVENT, never a Status.**
```
Business status:   Draft → Issued → Supplier Acknowledged
Communication:     WhatsApp opened · Email opened      (events, outside status)
```
Adding SMS / LINE / a supplier portal later adds events and changes no status.

**There is no `Sent` state, and there never will be.** The portal cannot observe
WhatsApp. The button is `Open WhatsApp group` (COPY-STANDARD's own word), it
does three things in one click — copy the message, download the PDF, open the
group — and it records `Opened WhatsApp group`, never "sent".
- `Send via WhatsApp` was proposed and **rejected**: a button claiming more than
  the system knows is how `ops_order_control.balance` happened.
- The hole this leaves — opened, never sent, nobody notices — is closed by a
  DUE ACTION, not a button: *no supplier acknowledgement after N working days →
  `Call {supplier} — confirm they received the purchase order`.*
- `Supplier acknowledged` already has a home: `sup_status='acknowledged'`, and
  `POST /api/supplier/pos/:id/acknowledge` is LIVE. Nice Future and Ohana both
  have `portal_enabled=true` — the two suppliers we order from can acknowledge
  themselves.

**Two independent communication drafts, not one template.** WhatsApp short,
Email formal with Subject. Both visible at once, side by side; one channel →
that panel takes the full row; no channel → `Download PDF` + `Add a channel`,
and **Issue is never blocked** by a missing phone number.

**Version is `Rev 1 / Rev 2` only.** Draft and Issued are STATUS, not versions.
A revision keeps the same PO number and must be refused once `received_qty > 0`.

**The PO document.** No money — the `Total` on Carres's real POs is blank and
purchasing does not need the figure. Line by line with a `Ref` column, so four
identical `H1401S Queen` rows read as four jobs rather than a mistake. No
signature block: `Prepared by {name} · {phone}` for the factory to call, plus
`This purchase order is computer generated and is valid without a signature`.
The sofa PO carries the plan-view drawing; the mattress PO carries no customer
information at all.

**Two rulings that OVERRIDE existing written law, on record:**
1. `Open Customer Order` contradicts COPY-STANDARD:826, which rules `Open order`.
   Loo re-ruled it — this page shows Purchase, Sales and Delivery Orders.
2. Items is the FIRST business page to render kit components. CLAUDE.md records
   D0.5c as components-only with adoption assigned to D6: *"that is a RULING,
   not a gap."* Loo reversed it.

---

## The Design System is the law now

```
docs/01-design-tokens.md     visual rules
docs/02-components.md        components — documented only when a real page proves one
docs/03-page-patterns.md     page shapes + Carres Examples (this page lives there)
```

**No module ever gets its own standards document.** A page's shape is a Carres
Example under the pattern it uses — that is what stops `Receiving Page Standard`
from existing.

**`docs/UI-KIT.md` is ⛔ SUPERSEDED and kept as a migration bridge**, with a
ledger at its head. 2,020 lines, ten live pages, 8,504 lint findings keyed to
its § numbers. It migrates one section at a time and is deleted when the ledger
empties. Nothing new goes into it. Do not delete it early.

**Values carried across, not re-decided** (Loo: *the new Design System is the
law; the existing implementation is the DEFAULT*): 8-step spacing · weights
400/500/600 with no 700 · radius 4/6/10 · Lucide stroke 2 · 40 icon meanings.
Three of those are Jess's frozen answers from 2026-07-28.

---

## Words owed to COPY-STANDARD

Ruled by Loo 2026-07-31, live on screen, **not yet in Jess's dictionary**:

`Items` · `Ref` · `Item` · `Size` · `Qty` · `More` ·
`Create Another Purchase Order` · `Remove` · `Open Customer Order` ·
`Move to Purchase Order {N}` · `Nothing on this purchase order.` ·
`N lines · N units`

Designed, not yet built: `Live Purchase Order` · `Review message` ·
`Supplier acknowledged` · `Re-open WhatsApp group` · `Send revision` ·
`Edit header` · `Add note` · `I have sent it` (**rejected** — kept here so
nobody rebuilds it).

---

## Columns and tables that do not exist yet

```
po_sends                       v1/v2 · channel · opened_at · opened_by
purchase_orders.approved_by    nothing records who issued a PO
purchase_orders — revision     Rev N + a lock once received_qty > 0
suppliers                      address · tel · attn · terms   (all four missing)
suppliers.contact              10/10 NULL
purchasing_destinations.address 3/3 NULL — column exists, data missing
purchase_orders.expected_ready_date   column exists, nobody writes it
a destination that means "this PO's customer"
```

`operation_create_pos_batch` writes **no audit row** — measured, `prosrc` does
not mention `audit_log`.

---

## Live data facts (measured 2026-07-31)

```
sofa geometry        21/21 lines carry module_code · x · y · rot · sofa_height
                     → the plan-view drawing is FREE, no migration
sofa fabric          4/21 lines   ← a factory cannot start without colour
sofa leg height      16/21 lines
mattress demand      14 lines = 16 units   ← the count that used to say 14
suppliers            2 of 10 have email · 5 have WhatsApp · 4 have neither
```

Fabric must become mandatory at the POS, with Issue refusing as a backstop —
`order_lines` has four write doors and a guard on one is a guard three walk
around. That is a POS card, not a To Order card.

---

## Rules that survive from the last rebuild

**A SKU may never go into a PostgREST `.in()` list.** `order_lines.sku` is free
text and 16 live lines contain a double quote. The catalog is read whole. A
source test enforces it. ⚠ `apps/api/src/routes/operation/purchase.ts` (`/today`)
still uses `.in("sku", …)` and has the same bug.

**A number that surprises you is a measurement to check, not a fact to explain.**

**A fix aimed at a cause you have not proved is a fix that hides the cause.**

**A negative control that does not fail is a test measuring nothing.** Two
caught in this session: a size-gate test that passed with the gate deleted, and
a `stopPropagation` test one card earlier.

---

## Test baselines

| | |
|---|---|
| shared | 2017 / 2017 |
| api | 3 pre-existing (`partner/pickups` ×1 · `supplier/pos` ×2) |
| web | **16** pre-existing — `OperationOrders` ×7 · `OhanaSofaTab` ×4 · `OrderCustomerCard` ×4 · `NiceFutureMattressTab` ×1 |
| tsc | web clean · api 4 (`rental-sell.test.ts`) |
| design-standard | **8504** findings — the ratchet may never rise |

**The 17th failure under full-suite load is `OperationPurchase > names the real
purchase orders…`** — proved pre-existing by stashing every change and getting
the identical failure. The old checkpoint blamed `OperationOrders`; it is this.
