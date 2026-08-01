# Purchase Order PDF Standard

**Status** — Law
**Owner** — Jess Lim
**This is the ONLY copy.** There is never a FINAL, a V2, a TEMPLATE or a draft variant
of this file. It is amended in place through the Change Policy below, and the Change Log
records every amendment.

**Purpose** — Defines the official Carres Purchase Order PDF layout, information
hierarchy, terminology, spacing and visual standards. This document is the single source
of truth. All implementations must follow this document unless Jess approves an
architectural change.

---

## Change Policy

The current specification is the approved baseline.

Implementation teams — human or AI — may propose improvements. However:

- Existing behaviour must not be changed silently.
- Any architectural change requires Jess's approval.
- Every proposal must explain: **Why change? · Benefits · Drawbacks · Impact on
  existing documents.**
- Do not overwrite this standard automatically.

## Architecture Rule

This document defines the current approved standard. Architects are encouraged to
challenge the design. However: **no architectural decision may be changed without
explicit approval from Jess.** Until approved, the existing specification remains the
source of truth.

The governance loop for every future chat:

```
Approved Baseline → Architects may challenge → Jess approves
→ Standard updated → Implementation
```

Never copy blindly. Never overthrow silently. Challenge → Explain → Approve → Update →
Build.

---

## 1 · Mission

A supplier must identify the document, the delivery date and the destination within
three seconds, then read the items without ever meeting a number that is not theirs.
The document must be 100% legible on a cheap B/W laser printer, a fax, and a WhatsApp
photo of a printout — **nobody prints colour**. Clarity beats minimalism whenever the
two fight.

## 2 · Information Hierarchy

Reading order, in priority: **PO Number → Supplier Delivery By → Deliver To → Items →
Layout drawing**. `Issued by` is audit information, not operational information — it is
present but whispered. Money is ABSENT: the supplier-facing PO prints no RM value of
any kind; the figure is absent from the payload (`purchasing_po_document`, migration
0307), not hidden by the template.

## 3 · Header

**Purpose** — identify the document within three seconds, at minimum height.

```
[CARRES logo]                              PURCHASE ORDER      10pt caps grey ls+1.5
                                           PO-2044             15.5pt / 700
Issued by Shasha · Sat, 1 Aug 26     Supplier Delivery By Wed, 12 Aug 26
────────────────────────────────────────────────────────────── 0.8pt ink rule
```

Rules:
- The Carres logo is the ORIGINAL wordmark image (`carres-wordmark` asset), height
  6.5mm. Never typeset, never a different logo.
- `PURCHASE ORDER` 10pt grey caps; `PO-2044` 15.5pt/700 below it — the number is the
  first eye-catch but must not overpower the page (18pt was rejected as too heavy).
- `Supplier Delivery By {Ddd, D Mmm YY}` — ONE line, 8.5pt, right side, date 600.
- `Issued by {name} · {Ddd, D Mmm YY}` — same row, left side, 7.5pt all grey
  (audit whisper). Why: the supplier doesn't act on it; demoting it keeps the
  operational facts loud.
- Dates print weekday + short date (`Wed, 12 Aug 26`); the weekday is computed from the
  date, never typed.
- **No page number in the header.** The footer owns it.

**Rejected** — `Required Delivery` (ambiguous: whose requirement?) → `Supplier Delivery
By`. Centered identity stacks, SAP-corner metadata, tall PO numbers: all rejected for
height or for burying the number.

## 4 · Supplier Block

Frameless card, label `SUPPLIER` 7.5pt caps grey, company name 9.5pt/600, PIC + phone
9pt. Blank lines vanish. Why frameless: boxes add ink, not information (Linear / Stripe
/ Muji all dropped card borders).

## 5 · Deliver To

Frameless card beside Supplier, wider (address needs the room): label `DELIVER TO`,
destination name 9.5pt/600, full address 9pt, delivery instruction 7.5pt grey beneath.
The card band is inset 4mm from both page edges (content this close to the margin reads
as clipped). Destination values come from the PO's saved destination; Nice Future prints
its fixed collection sentence. One PO = ONE destination — a line needing another address
is another PO.

## 6 · Item Table

Columns: `# · Sales Order · Item ID · Description · Qty`.

- **The paper's own number is never a column** — it is the header. Related documents'
  numbers (the SO) come in as columns so the papers chain.
- `Sales Order` is the one customer reference. CR/TCF are AutoCount/Master-Sheet testing
  refs and never appear.
- **Zero grid lines, zero fills.** The header row is two 0.5pt ink hairlines with 7.5pt
  caps grey labels between; items separate on a 0.3pt hairline rhythm. Why: backgrounds
  die on B/W laser and WhatsApp photos; typography and alignment carry the hierarchy.
  Zebra striping rejected — a furniture PO is 5–20 rows, not an Excel export.
- Description follows the **Item Grammar**: Primary (name, 9.5pt/600) → Secondary
  (variant identity, 9pt) → Supporting (label/value pairs — label 7.5pt grey at a fixed
  24mm column, value 9pt ink, wrapped lines return to the value X) → `REMARK` (7.5pt
  caps grey label, text 8.5pt beneath — formal, no colon). The column never knows what
  product it holds.
- `Qty` 10pt/700, right-aligned, inset 10mm from the table's right edge (the table
  rules still run full width). Why 10pt not 11: the supplier reads the Description
  first; Qty must not steal focus.
- **An item never splits across pages.** Whole item moves to the next page.
- A page that continues ends with a quiet right-aligned `Continues…` (7.5pt grey).
- **No TOTAL row on the sofa PO** — one set per page, every Qty is 1; a total confuses.
  (A summary row for high-line-count consolidated POs is decided when that document is
  designed — not silently added here.)
- **No database words on paper**, ever: `attrs`, `destination_id`, `product_type` and
  their kin never print.

**Rejected** — `— End of PO —` closing line (continuous-printing-era habit; `Page 2 of
2` already says it) · fixed Remarks column (unbounded text explodes fixed columns) ·
UOM column (furniture is always `pc`; meaningless).

## 7 · Sofa Layout

- A sofa PO covers **one customer order** (frozen consolidation law), max 2 sets,
  **one set per page**: the set's spec block and its drawing share the page.
- The drawing is a top-down plan view drawn with vector boxes: one bordered box per
  module (no outer union outline — an L must not read as one rectangle), back strip on
  the top edge, chaise modules drawn deeper toward the viewer, **module code + that
  module's fabric code under each box** (a two-fabric build is normal), and a TV marker
  underneath showing the facing direction. Caption: `Top view. Back at the top. TV in
  front.`
- Why a drawing: LHF/RHF words alone get sofas built mirror-reversed; the picture is
  the contract.

## 8 · Footer

Fixed 15mm, identical on every page, and FROZEN — nothing may be added:

```
Computer-generated document.
No signature required.
PO-2044                                                    Page 2 of 2
```

No signature boxes anywhere on the document — the portal's audit trail (issued-by,
timestamps) is the record. No company address repeat, no E.&O.E., no "Generated from"
line (IT language; PDF metadata already carries it).

## 9 · Typography

- **Font**: Noto Sans SC — chinese-simplified subset (ASCII + CJK in ONE file; two
  registered files split by script corrupts CJK glyphs). Weights 400 / 500 / 600 / 700
  all registered — CJK bold must be a real weight file, never faux-bold.
- **Sizes**: 15.5 (PO number) · 10 (title, Qty) · 9.5 (primary info) · 9 (content) ·
  8.5 (meta values, remark text) · 7.5 (labels, audit, footer).
- **Colours**: ink `#1A1714` · grey `#7A7268` · hairline `#CFC9C0`. Grey lives in TYPE,
  never in backgrounds. The logo image carries the only brand colour; everything else
  must survive pure greyscale.
- Symbols outside the font's glyph set (arrows ▼ etc.) are never typed — they render as
  wrong glyphs. Direction markers are drawn with vector shapes.

## 10 · Spacing

- A4 portrait, 12mm margins, content 186mm.
- All spacing in 3mm rhythm (zone gaps, row padding, card padding).
- **Alignment Law (Muji)**: same-kind elements sit on the same X — every `#`, every SO,
  every Item ID, every stacked label, every stacked value, every Qty. Quiet comes from
  alignment, not decoration.
- Header total ≈ 22mm; footer fixed 15mm; the body never stretches to fill a page.

## 11 · Future Extension

- **Versions**: an amended document number carries the `docNumber()` suffix
  (`PO-2044-B`) everywhere the number prints. The PO itself never revises by law
  (a sent PO is never edited; more items = a new PO) — the slot exists for document
  types that do.
- The PO currently prints its real database id (`PO-2044` style). Renumbering to the
  `PREFIX-DDMMYY-NNNN` scheme is a clean-start job, not a template change.
- Consolidated mattress/bedframe POs (many rows, many SOs) reuse this standard's table
  as-is; their open questions (summary row, per-line need-by dates) are decided when
  that document is put in front of Jess — never invented silently.
- Wiring this layout to the money-free `purchasing_po_document` RPC (0307, currently
  zero callers) replaces the legacy `po-template.tsx`, which still leaks retail prices
  to suppliers and pickup partners.

## 12 · Change Log

| Date | Change | Approved |
|---|---|---|
| 2026-08-01 | Initial baseline — full design session: header shape, Supplier Delivery By naming, frameless cards, no-grid-line table, Item Grammar, one-set-per-page sofa layout with drawing, quiet footer, no signature, no money, no End line, no sofa total row. | Loo |
