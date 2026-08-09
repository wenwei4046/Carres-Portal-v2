# Sales Order PDF Standard

**Status** — Law
**Owner** — Loo (approved 2026-08-09, 17 review rounds on real renders)
**This is the ONLY copy.** Never a FINAL, a V2 or a draft variant. Amend in place;
the Change Log records every amendment. Implementation:
`apps/web/src/lib/pdf/sales-order-template.tsx` — change the Law first, the template second.

The base skeleton was COPIED from 2990's Sales Order (`2990s/apps/backend/src/lib/
sales-order-pdf.ts` + `pdf-common.ts`), then amended block by block by the owner.
Every deviation from 2990 below is an OWNER RULING, not taste.

## 1 · Mission

A customer must identify the document, what they bought, what they paid and what
they still owe — on one page, on a B/W laser print, on a WhatsApp photo. The items
table is the only zone that grows; everything else sits at a FIXED position so a
stack of printed orders reads like a pre-printed form.

## 2 · Fixed zones (A4 portrait, 12mm margins, content 186mm)

```
HEADER   fixed ~20mm — company identity · hero number  (fixed, repeats)
PARTIES  min 36mm    — BILL TO | ORDER DETAILS
ITEMS    flexible    — the ONLY zone that grows; whitespace collects under it
MONEY    bottom-anchored as ONE non-splitting unit:
         payments table · amount-in-words + customer signature | totals
TERMS    inside the bottom unit, above the footer
FOOTER   8mm         — doc no · legal sentence · Page n of m  (fixed, repeats)
```

The bottom unit pins to the page bottom (`marginTop: auto`): BALANCE DUE and the
signature sit at the same spot on every printed order.

## 3 · Header

- Line 1: `CARRES SDN. BHD.` **14/700** + `SSM {reg}` **8pt grey inline**, bottom-aligned.
- Lines 2–3: registered address, TWO lines at 8.5pt. Never one full-width line —
  it collided with the number's ground (round 11) — and never removed (round 12).
- Right block, own ground (10mm gap, left column width-bounded): **`SO-1256` 18/700
  first**, `SALES ORDER` 9pt grey caps letterspaced beneath (round 17). No `Doc No:`
  label, **no Date** — ORDER DETAILS' `Ordered` prints it once (round 16).
- 0.5pt grey rule, then 3.5mm air before BILL TO (round 15 fixed the cut-word bug:
  the fixed header's reserve must exceed its real content height).
- Continuation pages: ONE-line letterhead (name · SSM | `SALES ORDER · SO-…`).
- No logo image on the SO (round 13). The wordmark stays on the PO, whose law is its own.

## 4 · Parties — 2990's `drawInfoColumns` voice, copied exactly

ONE size 8.5pt, even ~4mm rhythm, mixed-case grey labels, values ink. No bold
names, no caps labels, no size bouncing (round 8: "not like you up and down").

- BILL TO: 20mm label gutter — `Name / Address / Tel / Email / Emergency`.
  Wrapped values return to the value X. Empty rows vanish.
- ORDER DETAILS: colon-aligned — `Doc No · Showroom · Ordered · Delivery date ·
  Proceed date · Salesperson · Access`. Body dates are mixed-case `Sun, 9 Aug 26`.
- **Access** = `Floor 3 · No lift` (three-state; see §8). Floor/lift live HERE,
  not in a DELIVER TO block (owner, fixed-zone round).
- DELIVER TO prints ONLY when the delivery address differs from billing —
  "Same as billing address" was a wasted line.
- No Venue. No Status — a printed status is stale the day after (2026-05-22,
  re-affirmed); the dates tell the story.

## 5 · Items table

- Ink header bar `#221F20`-class (INK), **white 8/700 caps, ONE line**:
  `# · ITEM CODE · DESCRIPTION · QTY · UNIT (RM) · DISCOUNT (RM) · AMOUNT (RM)`.
  Every money column carries `(RM)` — made to fit by SHORTENING words
  (`UNIT`, not `UNIT PRICE`) and widening columns, never by wrapping (round 16).
- Cells print **digits only** — no repeated `RM` (round 7).
- Column widths: # 7 · code 27 · desc flex · qty 10 · unit 25 · disc 24 · amount 25 (mm).
- Body 8pt; numeric cells 7.5pt right-aligned; Amount 7.5/700 (the row anchor).
- Cell padding 2mm vertical (2990's rhythm). Hairline row separators.
  **NO zebra stripes** — copied from 2990 in round 14, killed in round 15
  ("grey become i dont know read what").
- Category bands: neutral grey `#EDEDED` fill (beige rejected), 8/700 ink,
  with counts — `SOFA · 2 items`.
- Sub-lines (config / PWP / remark) 7.5pt grey, indented 2mm, tight to their line.
- `Qty > 1` prints **bold**.
- Discount is data-driven: no schema field carries it today (verified 2026-08-09);
  cells print `—` until the portal sends figures. The column STAYS (owner ruling).
- An item never splits across pages. DEFERRED: header-bar repeat on overflow
  pages — do it with the 50-line stress pass, not blind.

## 6 · Payments

- No standalone title: the ink bar's method column reads **`PAYMENT RECEIVED`**
  (round 10). Columns: `DATE · PAYMENT RECEIVED · APPROVAL CODE · COLLECTED BY ·
  AMOUNT (RM)`. Body 8.5pt, dates `9 Aug 26`, digits-only amounts.

## 7 · Money zone · signature · terms

- Left: one quiet inline line, 2990's exact form (round 18) —
  `Amount in words: RINGGIT MALAYSIA … ONLY` at 8pt grey. No caps block label,
  no `(ITEMS TOTAL)` clarifier — the international form is the inline sentence.
  `Expected deposit`
  prints ONLY while `paid < expected` (round 5: otherwise it reads "give another
  3,240") — and no schema field carries it today.
- Under the words: dashed signature box (POS eSign image when signed) ·
  `CUSTOMER SIGNATURE` · the printed **name only** — no phone, BILL TO has it
  (round 15; international form: signature over printed name).
- Right: `ITEMS TOTAL · PAID TO DATE` and the hairline-boxed **BALANCE DUE**
  (~12/700). **The SO does not talk tax** — no Tax row, no "incl. SST" claim;
  the invoice owns SST arithmetic (the old label contradicted the invoice).
- Company signs nothing — the footer sentence says so.
- Terms 8pt grey, numbered from an array so gated clauses renumber themselves.

## 8 · The lift gate (charge basis law)

`LIFT_THREE_STATE_READY = false` in the template gates BOTH the stair-carry
sentence and its T&C clause. The DB's `delivery_has_lift` is NOT NULL today, so
an unasked order prints `No lift` — **a signed charge basis may not rest on a
default.** Flip the flag ONLY in the nullable-columns migration PR (+ POS form).
Until then the Access row prints facts, never a charge.

## 9 · Typography & footer

- **Noto Sans SC** (weights 400/500/600/700) — deliberately NOT 2990's Helvetica,
  which cannot print Chinese customer names.
- Footer, fixed every page: `{SO no}` · `Computer-generated document · No company
  signature required.` · `Page n of m`. 7.5pt grey. No address in the footer.
- Colours: ink `#1A1714` · grey `#7A7268` · hairline `#CFC9C0` · band `#EDEDED` ·
  bar = ink with white text. These fills are SO-legal (2990 prints them daily on
  B/W lasers); the PO's zero-fill law remains the PO's.

## 10 · Data contract gaps (API card, no migration)

Optional payload fields the template already renders when sent: `customer.email`,
`customer.emergency`, `proceed_date`, `lines[].category`, `lines[].discount`,
`addons[].sku`, `payments[].date/approval_code/collected_by`, `expected_deposit`,
`delivery.address`. Nullable floor/lift need the §8 migration.

## Change Log

| Date | Change | Approved |
|---|---|---|
| 2026-08-09 | Initial law — codifies 17 owner review rounds on rendered PDFs (v1–v15): 2990 skeleton adopted verbatim then amended; fixed zones; bottom-anchored money; three-state lift gate; no-tax ruling; every rule above. | Loo |
| 2026-08-09 | §7 round 18: amount-in-words becomes 2990's inline one-liner (`Amount in words: …` 8pt grey) — caps block label and `(ITEMS TOTAL)` clarifier removed. | Loo |
