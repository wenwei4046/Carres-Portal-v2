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

## 3 · Header (final form approved by Loo, 2026-08-01 evening session)

**Purpose** — identify the document within three seconds, at minimum height. The header
has exactly three voices: whisper (labels) · print (dates) · hero (the PO number).

```
[CARRES logo]                                    PURCHASE ORDER   10pt caps grey ls+1.5
SUPPLIER DELIVERY BY   WED, 12 AUG 26                 PO-2044     18pt / 700 — the hero
PO ISSUED DATE         SAT, 1 AUG 26
───────────────────────────────────────────────────────────────── 0.8pt ink rule
```

Rules:
- The Carres logo is the ORIGINAL wordmark image (`carres-wordmark` asset), height 6mm.
  Never typeset, never a different logo, never enlarged — a stamp.
- Left, under the logo: a **35mm label-gutter** (Muji): labels `SUPPLIER DELIVERY BY` /
  `PO ISSUED DATE` at 6.5pt `#9A9288` caps, letter-spaced, one X; **dates in ALL CAPS at
  7pt/700 ink, letter-spaced, both identical, on one shared X.** The two dates are
  equally important; hierarchy against the labels is carried by TONE + WEIGHT only,
  never by size — one size class, two voices. The gutter is widened before a label is
  ever allowed to wrap (a wrapped label is a defect).
- Right: `PURCHASE ORDER` 10pt grey caps over `PO-2044` 18pt/700 — **the only
  bold-black element in the header.** The block is BOTTOM-aligned with the left stack
  so both columns breathe equally above the rule; the spare air sits top-right.
- The person who issued is NOT in the header — the header carries only `PO ISSUED
  DATE`; the name lives in the footer (§8).
- Dates print weekday + short date; the weekday is computed from the date, never typed.
- **No page number in the header.** The footer owns it.

**Rejected** — `Required Delivery` (ambiguous: whose requirement?) → `Supplier Delivery
By`, frozen. The 6-section flat header grid and the metadata-as-third-card layout were
both built, reviewed and rejected on 2026-08-01 ("getting worse") — the two Information
Cards below the rule are frozen and metadata never joins them. Centered identity
stacks, SAP-corner metadata: rejected. Dates at 8.5pt/600 rejected as noisy — two bold
lines under the logo fought the PO number.

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

Columns: `# · Sales Order · Item ID · Description · Qty` (sofa / per-order documents).

### 6.1 · Consolidated (bulk) PO listing — mattress / bedframe (Loo, 2026-08-01)

A bulk PO speaks the supplier's language: **model first, quantity summed.**

- **Group by model**: the same SKU (with identical configuration) is ONE row and its
  quantity is the SUM. The supplier never reads line-by-line by SO.
- **The `SO No.` column lists every owning SO** (`SO-1256 ×2`, stacked in the column) —
  it exists for Carres reference, not for the supplier.
- **`Item ID` is NOT the SKU.** It is the per-unit goods id the system auto-generates
  at the moment the PO is issued (one id per physical unit, scannable). The column is
  reserved; the system fills it on Issue.
- **Description = the SKU (bold) + the size (grey)** — `B1201F-K — King`. No category
  word (`Mattress`) — the whole PO is one category and the word is noise. Model name
  and SKU are two different things; where they differ (`Forte` / `FORTE-K`) the SKU is
  what prints.
- The **TOTAL QUANTITY summary row** closes a bulk table (the sofa PO has none — one
  set per page makes a total meaningless).

### 6.2 · Bedframe = one PO, one customer (Loo, 2026-08-02)

- A bedframe PO covers ONE customer order, like the sofa. Rendered and approved on the
  final template: SKU bold + size grey, colour on its own line, Gap/Leg as aligned
  pairs, Remark block, Item ID auto, no total row.
- **OPEN — deferred by Loo to the purchase-order build chat**: the exact bedframe
  Description format (what is Secondary vs pairs, wording of config lines) is to be
  discussed there, not invented here.
- **RECORDED CONFLICT, not resolved**: `PURCHASING-WORKING-FLOW.md` §3 still says every
  NON-sofa line consolidates per supplier (ten customers' bed frames = one PO), and the
  To Order engine groups that way today. Loo's one-PO-one-customer bedframe ruling
  contradicts it. The purchasing chat must put this to Loo/Jess and update the flow file
  and engine if the new rule stands — nobody resolves it silently from this document.

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

## 8 · Footer (FINAL — one row, three sections, 8mm; Loo, 2026-08-02)

Fixed 8mm — a single quiet row under a 0.5pt hairline, identical on every page:

```
Issued by Shasha      Computer-generated document · No signature required.      Page 1 of 2
```

- Left = audit (`Issued by {name}`) · centre = the legal sentence (the former two lines
  merged into one) · right = page number. All three at 7.5pt grey — the footer is one
  quiet horizon line with no hero.
- The PO number never appears here (the header owns it).
- No signature boxes anywhere on the document — the portal's audit trail is the record.
  No company address, no E.&O.E., no "Generated from" line.
- History: the baseline's 15mm four-line footer (and its repeated PO number) is
  retired; the saved 7mm goes back to the body.

## 9 · Typography

- **Font**: Noto Sans SC — chinese-simplified subset (ASCII + CJK in ONE file; two
  registered files split by script corrupts CJK glyphs). Weights 400 / 500 / 600 / 700
  all registered — CJK bold must be a real weight file, never faux-bold.
- **Sizes**: 18 (PO number — amended from the baseline's 15.5 after print review) ·
  10 (title, Qty) · 9.5 (primary info) · 9 (content) · 8.5 (remark text) · 7.5 (labels,
  audit, footer) · header micro-pair: 6.5 (labels) / 7 caps 700 (header dates).
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
| 2026-08-02 | §8 footer FINAL: one row, three sections (audit · legal · page), 15mm → 8mm, legal lines merged into one sentence. Sofa · bedframe · mattress renders approved as FINAL on this template. | Loo |
| 2026-08-02 | §6.2: bedframe = one PO one customer (approved render on the final template). Bedframe Description format left OPEN for the purchase-order build chat. Consolidation conflict with PURCHASING-WORKING-FLOW §3 recorded, not resolved. | Loo |
| 2026-08-01 (evening) | Header final: 35mm label-gutter under the logo; `SUPPLIER DELIVERY BY` + `PO ISSUED DATE` labels 6.5pt light-grey caps; both dates ALL CAPS 7pt/700 ink on one X, equal weight; PO number 18pt (supersedes 15.5); doc block bottom-aligned. Footer: `Issued by {name}` added, repeated PO number removed. §6.1 bulk-PO listing rules (group by model, SO refs in column, Item ID = per-unit auto id, SKU as description, TOTAL QUANTITY row). 6-section grid + metadata-card headers rejected on review. | Loo |
