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
MONEY    FLOWS after the items as ONE non-splitting unit:
         payments table · customer signature | totals
TERMS    inside that unit, under the money
FOOTER   8mm         — doc no · Issued by · legal sentence · Page n of m
```

**The money zone FLOWS; it is not pinned** (owner, 2026-09-21: "we follow Houzs
way"). It used to pin to the page bottom with `marginTop: auto` so BALANCE DUE
landed on the same spot on every order — pre-printed-form geometry. The price
was a half-page hole on a short order, and **short orders are most orders**.
The payments block's frozen four-row height went with it, for the same reason.
Predictable geometry is worth less than the page the customer actually holds.

### 2.1 · THE MEASUREMENT SHEET (final, owner-approved round 24)

```
zone      element                        size/weight   pitch/height
HEADER    company name                   14 / 700
          SSM inline                     8 grey
          address ×2                     8             4.0mm rows (lh 1.42)
          SO number                      18 / 700
          SALES ORDER whisper            9 grey caps
          rule → BILL TO air             —             3.5mm
PARTIES   titles                         8.5 / 700     4.6mm to first row
          labels + values                8             4.0mm rows incl. wraps
ITEMS     ink bar labels (white)         7.5 / 700     one line, always
          body / code / description      7.5           6.8mm single-line rows
          money + qty cells              7             (2mm pad top+bottom)
          category bands                 7.5 / 700     grey #EDEDED
          sub-lines                      7 grey        indent 2mm
          TOTAL row                      700           between two ink rules
PAYMENTS  bar labels                     7.5 / 700
          body                           8             dates `9 Aug 26`
MONEY     amount-in-words                7 grey        68mm column, top=Subtotal
          Subtotal / Paid to date        8.5           4.0mm rows
          BALANCE DUE                    10.5 / 700    one rule above
          signature box                  22mm          caption 6.5 inside
TERMS     title                          7.5 / 700     mixed case
          body                           7 grey        3.2mm lines
FOOTER    all three cells                7.5 grey      8mm zone
```

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
- **Square mark, 13mm, LEFT of the legal name** (owner, 2026-09-21 — OVERRIDES
  round 13's "no logo image on the SO", after the Houzs Century compare).
  `carres-logo.png` (256×256), `objectFit: contain`, 4mm to the name. It costs
  ZERO height: the name+SSM line and the two address lines already stand 15.7mm
  tall, so a 13mm mark sits inside the existing block. The WORDMARK (4.22:1)
  is refused — it needs ~40mm of width and pushes the address into a third line.
  Left-column `paddingRight` drops 10mm → 4mm to pay for the mark's width.
  Page 1 only; continuation pages keep the one-line letterhead.

## 4 · Parties — 2990's `drawInfoColumns` voice, copied exactly

ONE size 8.5pt, even ~4mm rhythm, mixed-case grey labels, values ink. No bold
names, no caps labels, no size bouncing (round 8: "not like you up and down").

- BILL TO: 20mm label gutter — `Name / Address / Tel / Email / Emergency`.
  Wrapped values return to the value X. Empty rows vanish.
- **SALES ORDER INFO** (renamed from ORDER DETAILS, owner 2026-09-21):
  colon-aligned, 46mm label gutter, in THIS order —
  `SO No · SO Doc Date · Proceed Date · Customer Requested Delivery Date ·
  Sales Location · Salesperson`. Body dates are mixed-case `Mon, 21 Sep 26`.
  `Customer Requested Delivery Date` prints on **TWO deliberate lines**
  (owner, 2026-09-21) with an explicit newline, on a 32mm gutter:

  ```
  Customer Requested
  Delivery Date        : Tue, 20 Oct 26
  ```

  The colon and value sit on the label's LAST line — SALES ORDER INFO rows are
  `alignItems: "flex-end"` for exactly this. **BILL TO must stay top-aligned**:
  bottom-aligning it floated a wrapped ADDRESS above its own label (measured).
  `Sales Location` is ONE row that is always filled: the outlet when the order
  sold from a showroom, else the dealer (0144 fallback). The old second `Sold
  by` row is retired.
- **Access (floor · lift) is REMOVED from the Sales Order** — owner, 2026-09-21:
  "Access remove due to DO only show". Floor, lift, the stair-carry sentence and
  its T&C clause live ONLY on the Delivery Order, the document the crew carries.
  See §8.
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
- Category bands: **NO fill** (owner, 2026-09-21 — the grey `#EDEDED` band is
  retired with the arrival of the box table). 8/700 ink, with counts —
  `SOFA · 2 items` — sitting on air above its group, separated by 2.6mm of
  space. Once every row is boxed, a filled band is one texture too many.
- Sub-lines (config / PWP / remark) 7.5pt grey, indented 2mm, tight to their line.
- **THE GRID — Houzs' structure in Carres hairline** (owner, 2026-09-21:
  "table listing houzs is clean and neat and easy than us"). Every item row is
  boxed: 0.3pt `HAIR` left/right/top/bottom, plus SIX full-height column rules.
  Houzs' heavy black grid is NOT copied — only its structure; the weight stays
  Carres hairline. The **category bands and the PAYMENTS table stay unboxed**
  (Houzs leaves them open too): the box means "these are the goods".
- **How the rules are DRAWN — read this before moving a column.** They are
  ABSOLUTE lines (`position: absolute · top: 0 · bottom: 0`) at `RULE_X`, not
  cell borders. Two facts forced it, both measured, not argued:
  1. a border on a cell stops at the cell's CONTENT height and renders as a
     ragged stub on a two-line description — `alignSelf: "stretch"` does NOT
     fix it in react-pdf;
  2. absolute children measure from the row's PADDING edge, so the row carries
     no horizontal padding at all — the 2mm lives inside the first and last
     cells (`bNo` paddingLeft, `bAmount` paddingRight). `RULE_X` and the column
     widths are therefore the SAME coordinates. **Change a width, change
     `RULE_X` in the same commit or the grid silently skews.**
- A numeric cell's `Text` carries NO width — the wrapper `View` owns it. A Text
  with its own width overflowed the padded box and killed `textAlign: right`.
- Header labels never wrap (round 16): `DISC (RM)`, not `DISCOUNT (RM)`.
- `Qty > 1` prints **bold**.
- Discount is data-driven: no schema field carries it today (verified 2026-08-09);
  cells print `—` until the portal sends figures. The column STAYS (owner ruling).
- The table CLOSES with a `TOTAL` row between two ink rules (round 24):
  qty sum (700) · discount sum (`—` when none) · amount sum (700), summed
  from the rows the table itself printed.
- An item never splits across pages.
- **EVERY page that carries goods carries the column bar** (owner, 2026-09-21;
  closes the round-7 DEFERRED item, done with the stress pass as promised).
  `fixed` cannot do this — it repeats on every page of the Page, so a long
  order whose money zone lands on a page of its own prints an items header
  over nothing (proved: 40 lines → 3 pages, the last one money-only). The rows
  are therefore chunked IN THE TEMPLATE against an estimated height
  (`EST_ROW` 9mm + `EST_SUB` 3.6mm per sub-line + `EST_BAND` 9mm) and each
  chunk opens with its own bar and a grey `Continued from page n`.
- **The caps are deliberately conservative** (`CAP_FIRST` 170mm ·
  `CAP_REST` 225mm of a 239mm body). A page that breaks one row early is
  invisible; a chunk that OVERFLOWS is broken mid-chunk by react-pdf and its
  continuation loses the bar — the one failure this mechanism exists to
  prevent. Raise a cap only against a fresh stress render.

## 6 · Payments

- No standalone title: the ink bar's method column reads **`PAYMENT RECEIVED`**
  (round 10). Columns: `DATE · PAYMENT RECEIVED · APPROVAL CODE · COLLECTED BY ·
  AMOUNT (RM)`. Body 8.5pt, dates `9 Aug 26`, digits-only amounts.
- **The zone ALWAYS prints, even with no payments** (owner, 2026-09-21, from the
  Houzs compare): a block that silently vanishes reads as a printing fault.
  COPY-STANDARD's absence law — absence is a sentence.
- **With ZERO payments there is NO column bar.** The zone prints the title
  `PAYMENTS RECEIVED` (8.5/700 ink caps) and the sentence **`No payments
  recorded.`** (8pt grey), nothing else. A bar reading DATE · APPROVAL CODE ·
  COLLECTED BY above no rows asks a question the paper cannot answer, and with
  the money zone unpinned it no longer buys any geometry.

## 7 · Money zone · signature · terms — FINAL (rounds 26–30)

```
Amount in words: RINGGIT MALAYSIA …            ← one full-width 7pt grey line
┌ ─ ─ ─ 80mm ─ ─ ─ ┐   ┌──────── 70mm ────────┐
│   (POS eSign)     │   │ Subtotal   RM 8,920.00│  rows 8.5, 1.1mm pad,
│ Customer          │   │ Paid to date 3,740.00 │  hairline separators
│ Signature · name  │   │▓BALANCE DUE 5,180.00▓ │  ← grey band, 8.5/700 —
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   └───────────────────────┘    same size, band+bold
        ↑ dashed box STRETCHES to the card's exact height (same top/bottom)
```

- The items table's closing row is **TOTAL PAYABLE** — the same figure the card
  calls `Total payable`; one figure, one name (owner, 2026-09-21: Carres is
  SST-registered, so `Goods total` is retired). Summary-row money carries **RM**
  (`RM 100.00 · RM 8,920.00`); detail cells stay digits-only.
- **The payments table closes with its own `TOTAL RECEIVED` row**, summed from
  the rows it printed — the same law as the goods SUBTOTAL (owner, 2026-09-21:
  "it seem i still need to calculate myself 3240 + 500?"). A customer is never
  asked to add up a document's own figures. It must read the same as
  `Paid to date` in the totals card; if a payload ever disagrees, the paper
  shows the rows' arithmetic, because that is the one the reader can check.
- BALANCE DUE is never bigger — the grey band and bold carry the emphasis.

### 7.1 · Legacy notes

- **Amount-in-words: REMOVED** (owner, 2026-08-09) — a computer-generated
  document needs no anti-tamper words; that was the handwritten-cheque era.
  `Expected deposit`
  prints ONLY while `paid < expected` (round 5: otherwise it reads "give another
  3,240") — and no schema field carries it today.
- **Signature: 72 × 20mm, bottom of its column, caption UNDER the box.** It was
  110 × 40mm — a room, not a signature (owner, 2026-09-21). A person signs a
  line about 70mm wide; a bigger box only prints emptiness. The COLUMN stays
  110mm so the left rail holds with the tables, and the box sits at its bottom
  so it finishes level with the totals card. Printed **name only** — no phone,
  BILL TO has it (round 15; international form: signature over printed name).
- **Totals card — OWNER RULING (Jess, 2026-09-21) · APPROVED / NOT BUILT.** Carres is SST-registered and its
  prices are SST-inclusive, so the tax is real and is shown, in the SAME three-row shape the Sales Invoice uses:
  `Total excluding SST · SST 8% · Total payable · Paid to date · BALANCE DUE`.
  Example: `RM 5,583.33 · RM 446.67 · RM 6,030.00 · RM 3,740.00 · RM 2,290.00`. The SST figure is **computed
  once and stored** (`invoices.tax_amount`, by the auto-issue RPCs) and every document READS it — the SO never
  re-computes it. Order of work: ① the invoice RPCs (`0098`/`0229` descendants, which today write
  `tax_amount = 0`) store the inclusive SST; ② the Sales Invoice prints that stored figure; ③ this card follows.
  Until ① lands the card keeps its current rows. The 8% rate is the code's (`tax_amount = total × 0.08 ÷ 1.08`);
  the rate itself and any correction of documents already issued with SST RM 0.00 are the tax agent's decision.
- Company signs nothing — the footer sentence says so.
- Terms 8pt grey, numbered from an array so gated clauses renumber themselves.

### 7.1 · T&C WORDING — LAW (owner, 2026-08-09; restored 2026-08-10)

**The sentences are law, not template copy.** T&C #1 regressed once already —
the family template shipped the REJECTED "binding tax invoice" sentence because
this standard held the layout but never the words. It contradicts both this
file's own no-tax ruling (§7) and the separate Sales Invoice of #706. Never
again: any change to a sentence below is an OWNER decision, recorded here first.

```
1. This sales order records your purchase agreement with Carres. The sales
   invoice is a separate document issued upon delivery.
2. Balance due is payable in full on or before delivery. Cash, bank transfer,
   DuitNow QR, and cheque accepted.
3. Delivery date is best-effort and may shift ±3 working days subject to
   operation confirmation.
4. Stair-carry surcharges (if any) are billed on this sales order and are not
   invoiced separately on the DO.
5. Once the delivery date has been confirmed, any subsequent request to change
   or extend the date will incur a rescheduling surcharge.
```

**THE SENTENCES LIVE IN ONE FILE: `apps/web/src/lib/order-terms.ts`.** The POS
screen and the PDF both read that array; neither holds a copy. This file still
owns the WORDING as law — the array owns the DELIVERY of it.

Why the array exists (owner, 2026-09-21, "sales portal had one and we follow"):
the screen and the PDF drifted TWICE in opposite directions. In 2026-08-09 the
PDF got the corrected clause 1 and the screen kept the rejected one, so
customers SIGNED "becomes a binding tax invoice" and RECEIVED "the sales invoice
is a separate document". In 2026-09-21 the PDF dropped clause 4 with the Access
row while the screen kept it — a five-clause signed agreement printing as four.
A code comment had asked editors to "touch both files together" and claimed a
`sales-order-terms.test.tsx` enforced it; **that test has never existed.**

**Clause 4 stays on the SO even though Access moved to the DO.** It survives
because its wording names no printed fact — it does not say "the access
recorded above". The earlier Carres rewrite that DID say that was the version
that could not survive, and it is retired.

**Why #1 reads this way (owner, 2026-08-09 — the Golden's ONE outstanding copy
correction):** a Sales Order never claims to become a tax invoice. Sales Order
(customer agreement) · Delivery Order (delivery document) · Sales Invoice
(finance document) are SEPARATE lifecycle documents.

## 8 · The lift gate — MOVED (owner, 2026-09-21)

The Sales Order no longer prints floor, lift, the stair-carry sentence or its
T&C clause, so `LIFT_THREE_STATE_READY` is deleted from this template. The law
itself is unchanged and now belongs to `DO-PDF-STANDARD.md`:

> The DB's `delivery_has_lift` is NOT NULL today, so an unasked order reads
> `No lift` — **a signed charge basis may not rest on a default.** The
> three-state gate opens ONLY in the nullable-columns migration PR (+ POS form).

Moving the row did not fix the data; it removed the SALES ORDER's exposure to
it. The DO still needs the migration before it may charge for stairs.

## 8.5 · The conversion law (owner, round 21)

2990's numbers are the reference, but Noto's x-height exceeds Helvetica's:
**every 2990 nominal size prints HALF A POINT smaller here; every row pitch
copies 2990's absolute millimetres and is LOCKED with an explicit lineHeight**
(react-pdf's default line height is what made rows drift).

```
2990 (Helvetica)   Carres (Noto)     row pitch (absolute)
9 / 700            8.5 / 700         section titles
9                  8.5               totals rows        4.0mm
8.5                8                 parties · payments 4.0mm
8                  7.5               items body · bar · words · sig line
7.5                7                 money cells · terms      (items row 6.8mm)
11 / 700           10.5 / 700        BALANCE DUE        (terms pitch 3.2mm)
```

Totals labels are 2990's WORDS in ink mixed-case — `Subtotal` (never an
invented "Items total") · `Paid to date` · one rule · `BALANCE DUE`.
Owner ruling (round 22): the totals stay THREE rows — 2990's `Tax —` and
`Total` rows are information-free duplicates that would contradict the
invoice's SST split; they never return.
The signature box (dashed, 22mm) sits in the totals column DIRECTLY UNDER
BALANCE DUE; the caption `Customer Signature · {name}` prints INSIDE the
box at its foot (6.5pt grey). The amount-in-words line is a NARROW 68mm ·
7pt grey column, top-aligned with `Subtotal` — its adjacency is what says
which figure it spells (always the Subtotal; a receipt's words spell the
payment — not this document's job).

## 9 · Typography & footer

- **Noto Sans SC** (weights 400/500/600/700) — deliberately NOT 2990's Helvetica,
  which cannot print Chinese customer names.
- Footer, fixed every page: `{SO no} · Issued by {name}` · `Computer-generated
  document · No company signature required.` · `Page n of m`. 7.5pt grey. No
  address in the footer.
- **`Issued by` is the `audit_log` actor for the CREATION** — the PO's audit cell
  (0383), reused verbatim: one business, one dictionary. It is **NOT**
  `salespersons.name`. The two answer different questions — `Salesperson` in
  SALES ORDER INFO says who the customer calls; `Issued by` says who made the
  document. **They may never read the same field.** An unknown actor prints
  `Issued by Not recorded`: the PO shipped this cell hard-coded `null` and named
  nobody on every purchase order Carres ever sent, so the gap must be visible.
- Colours: ink `#1A1714` · grey `#7A7268` · hairline `#CFC9C0` · band `#EDEDED` ·
  bar = ink with white text. These fills are SO-legal (2990 prints them daily on
  B/W lasers); the PO's zero-fill law remains the PO's.

## 10 · Data contract gaps (API card, no migration)

Optional payload fields the template already renders when sent: `customer.email`,
`customer.emergency`, `proceed_date`, `lines[].category`, `lines[].discount`,
`addons[].sku`, `payments[].date/approval_code/collected_by`, `expected_deposit`,
`delivery.address`, **`issued_by`** (audit_log actor — §9). Nullable floor/lift
are no longer an SO concern; they move to the DO with the §8 gate.

## Change Log

| Date | Change | Approved |
|---|---|---|
| 2026-08-09 | Initial law — codifies 17 owner review rounds on rendered PDFs (v1–v15): 2990 skeleton adopted verbatim then amended; fixed zones; bottom-anchored money; three-state lift gate; no-tax ruling; every rule above. | Loo |
| 2026-08-09 | §7 round 18: amount-in-words becomes 2990's inline one-liner (`Amount in words: …` 8pt grey) — caps block label and `(ITEMS TOTAL)` clarifier removed. | Loo |
| 2026-08-09 | Rounds 19–21: §8.5 conversion law added — 2990 sizes −0.5pt, row pitches locked to 2990's mm; totals renamed to 2990's `Subtotal`; signature moved after BALANCE DUE with one-line caption. | Loo |
| 2026-08-09 | Round 31: the amount-in-words line is REMOVED family-wide — computer documents need no anti-tamper words. | Loo |
| 2026-08-09 | Round 22: totals stay THREE rows (owner: 维持 3 行); signature box under BALANCE DUE with the caption inside; words column narrowed to 68mm/7pt top-aligned with Subtotal. | Loo |
| 2026-08-09 | Rounds 23–24 (FINAL, owner: perfect): ORDER DETAILS order/words fixed (`Sales Location`); items TOTAL row; §2.1 measurement sheet added — the numbers every Carres customer document reuses. | Loo |
| 2026-08-09 | Rounds 25–30, SO 定稿: number labels say WHICH number (SO No); words line full-width above the money pair; totals in a hairline card, BALANCE DUE grey-banded at the SAME 8.5 size; signature box 80mm, stretched to the card's height, caption inside; items closing row renamed SUBTOTAL with RM on its sums; payments zone frozen at 4 rows. | Loo |
| 2026-08-10 | §7.1 added — the T&C SENTENCES become law here (they regressed once: the rejected "binding tax invoice" #1 shipped because the standard held layout, not words). #1 = the owner's 2026-08-09 correction: SO · DO · Sales Invoice are separate lifecycle documents. | 3.0-FIX (architect) |
| 2026-09-21 | Houzs Century compare (HC-SO-2609-123) + owner rulings: square logo 13mm LEFT of the name (overrides round 13, zero added height — measured); `ORDER DETAILS` → **`SALES ORDER INFO`** with `SO No · SO Doc Date · Proceed Date · Customer Requested Delivery Date · Sales Location · Salesperson` on a 46mm gutter; **Access removed** (DO only) and the §8 lift gate moved with it; totals go to FIVE rows with a truthful **`Tax —`** (overturns the 2026-08-09 no-tax-row ruling — the portal verifiably charges no SST; the INVOICE is the document that lies); stair-carry T&C clause retired; payments zone prints **`No payments recorded.`** instead of vanishing; one full-height hairline on the DESCRIPTION seam (Houzs' full grid refused); footer gains **`Issued by {audit_log actor}`**, never the salesperson. T&C #1 stays the owner's 2026-08-09 wording (owner answered **A**). | Loo |
| 2026-09-21 | `so-preview.render.test.tsx` added — an inert vitest harness (`SO_PREVIEW=1`) that renders a real A4 PDF, so a layout claim is MEASURED. It caught two defects before shipping: the 40mm gutter wrapped the long delivery-date label, and per-cell Text borders drew ragged rules on two-line rows. | architect |
| 2026-09-21 | Houzs table adopted: every item row boxed in Carres hairline with six full-height column rules (absolute lines, not cell borders — §5 says why, and why `RULE_X` moves with the widths); bands and payments stay unboxed; `DISCOUNT (RM)` → `DISC (RM)` so the bar never wraps; `Customer Requested Delivery Date` becomes a deliberate two-line label with the value on its last line, BILL TO stays top-aligned. Still ONE page. | Loo |
| 2026-09-21 | T&C become ONE array (`apps/web/src/lib/order-terms.ts`) read by both the POS screen and the PDF — the screen was the surviving source and the PDF follows it (owner). Clause 4 (stair-carry) RESTORED in the portal's wording, which names no printed fact and so outlives the Access row's move to the DO. Two historical drifts and a guard test that never existed are recorded in §7.1 as the reason. | Loo |
| 2026-09-21 | Money zone UNPINNED — content flows top-to-bottom like Houzs; the bottom-anchored unit and the frozen four-row payments block are deleted (they bought identical BALANCE DUE placement at the cost of a half-page hole on short orders). Legal entity settled: **CARRES SDN. BHD.**; the POS terms heading said `Carres Group Sdn Bhd` — a second company name the customer was signing under — and is now just `Terms & Conditions`, the entity living on the letterhead where a legal name belongs. | Loo |
| 2026-09-21 | Stress pass DONE (40 lines → 3 pages) and the answer to §5's DEFERRED question is recorded: continuation pages print item rows with **no column bar** — a reader on page 2 cannot tell Unit from Discount from Amount — and the last page can be money-only, so a blanket `fixed` bar would stamp an items header over nothing. Needs real chunking; opened as its own card, not hacked. Also: PAYMENTS gets the SAME box as the goods table (one table style per document) with every row closed including the last; all rows carry a 9mm minimum so heights read even; the signature/totals row loses its 4mm inset — 110 + 6 + 70 = 186mm, so both outer edges land on the table rails and the two boxes are exactly the same height; category bands lose their grey fill. | Loo |
| 2026-09-21 | `Subtotal` RETIRED from this document (owner: "subtotal is confused me"). "Sub-" promises that something is still to be added, and on a Carres SO nothing is: delivery rides as a line, there is no order-level discount, tax is nil — so Subtotal always equalled Total and the word described a step that never happens. The money card now reads **`Goods total · Tax · Total payable · Paid to date · BALANCE DUE`** and the items table closes on **`GOODS TOTAL`** — one figure, one name, in words a furniture customer reads without accounting training. (The tax-invoice register — `Total excluding tax / Total including tax` — was the alternative and belongs to the INVOICE, not to a customer's order.) The Sales Invoice still says `Subtotal (excl. SST)` and must be brought into line on its own card. | Loo |
