# CARRES DOCUMENT FRAMEWORK

> **LIVING DOCUMENT — overwritten in place, kept updating.** There is never a v2, never a
> "superseded" note. What this file says right now is the current design; yesterday's
> version is gone on purpose.

---

## §0 · THE OWNER RULE — read this before anything else (FIRST PRIORITY, Loo, 2026-08-01)

**The rules are Loo, not the files.**

- **Every chat takes this file as its FIRST reference for any printed-document work** —
  read it, then **advise Loo with a solution and the WHY. Advising is the job;
  restricting is the failure.** Never answer "the doc says no"; answer "here is a better
  way, and here is why".
- Loo is still developing this business. **There are no frozen rules in this domain** —
  every rule in this file, and every older rule anywhere else, is open to challenge.
- An assistant's job is to **advise, improve, and challenge Loo's old rules** — never to
  use an old document to restrict a new idea. Quoting a frozen doc as a reason to refuse
  a design is exactly the failure this section forbids.
- The assistant keeps **one** duty: when a choice will cause a real accident (two numbers
  for one document, money leaking to a supplier, a page that cannot print), raise a hand
  ONCE with the evidence. **The ruling is always Loo's.**
- Printed documents are a NEW concern. **The old screen laws (COPY-STANDARD, UI-KIT) do
  not govern paper.** Documents carry their own dictionary (§7) and Loo changes it at
  will. Where a screen and a paper share a word, sharing is nice, not law.
- This file is Loo's own notebook: **overwrite it, keep updating it.** Do not annotate
  "superseded", do not keep two versions side by side.

**Testing-period note (Loo, 2026-08-01):** every `CR-` / `TCF-` reference in the live
database is old AutoCount / Master Sheet import — **testing data**. At go-live the
database may start clean and `SO No.` becomes the one customer reference. No document
design may depend on CR/TCF existing; where a reference column is shown today it carries
whatever the order actually has, and after the clean start that is the SO number.

---

## §1 · What this is

**One framework, every document.** Not a Purchase Order design — a master template
(SAP-style: fixed header window + fixed footer window + one variable body) that every
Carres paper is born from:

Purchase Order · Delivery Order · GRN · Service Report · Service Note · Claim Report ·
Return Note · Credit Note (later) · anything after that.

Adding a new document = register it in §8 and write its body content. Header, footer,
type, spacing, colour are never redesigned per document.

International anchors this copies (studied 2026-08-01): **SAP** master form + MAIN
window · **DIN 5008** fixed zones · **Peppol/UBL** one-name-per-field dictionary ·
**Stripe** type restraint (document number biggest, 4 sizes) · **IKEA** — whose corporate
font is literally Noto Sans, the font these PDFs already embed.

---

## §2 · The three zones

```
A4 portrait · 12mm margins
┌────────────────────────────┐
│ ZONE 1 · HEADER   fixed 45mm │  Document Identity + Information Cards
├────────────────────────────┤
│ ZONE 2 · BODY     variable   │  THE TABLE (§4) + Notes
├────────────────────────────┤
│ ZONE 3 · FOOTER   fixed 15mm │  same five lines on every document
└────────────────────────────┘
```

Header and footer are the SAME HEIGHT on every document, always. Only the body changes.

---

## §3 · Zone 1 — Header

### 3.1 Document Identity (18mm)

```
[CARRES logo/wordmark]                     PURCHASE ORDER      ← 16pt caps, biggest
                                           PO-2031             ← 11pt bold
Issued 01 Aug 2026 · Required Delivery 15 Aug 2026   Page 1/2  ← 8.5pt meta line
─────────────────────────────────────────────────────────────  ← 0.8pt terracotta rule
```

- The DOCUMENT and its NUMBER are the hero — not the logo, not the address. On the phone
  everybody says "regarding PO-2031"; nobody says "regarding Carres Sdn Bhd".
- The meta line carries at most two dates + page, registered per document (§8).
- Company legal details do NOT live here. One small line in the footer (§5) is enough.
- The terracotta rule under the identity strip is the **signature element** — same
  position, every document, forever. Photocopied in B/W it is still there.
- **Page 2+** repeats the Identity strip only (title · number · page). Cards print on
  page 1 only. The table header row reprints on every page.

### 3.2 Information Cards (24mm fixed height)

- 2–4 cards on a **6-unit grid with weighted widths** — an address card takes 2 units, a
  people/meta card takes 1. Height never changes with card count: DO's three cards and
  PO's two cards give the identical header height.
- Card anatomy: label 7.5pt caps grey · first line 9.5pt bold (the name) · up to 4 more
  lines 8.5pt. Empty lines vanish; the card frame height does not.
- Card labels come from the Document Dictionary (§7) — one name per role, all documents.

---

## §4 · Zone 2 — THE TABLE

**One table skeleton for every document. It reads like a clean Excel listing — columns,
not paragraphs — because a mattress PO can run 30 rows and must stay scannable.**

### 4.1 No grid lines (Loo, 2026-08-01)

- **Zero vertical lines. Zero cell boxes.** Grid lines are ugly and Excel doesn't need
  them either — alignment does the work.
- The only rules drawn: one hairline under the column header row, and one above the
  End line. Rows separate by whitespace.
- The column header row sits on the linen wash (`#F5EFE6`) — the single wash on the page.

### 4.2 Columns — IDs are columns, prose is a stack

- **Things you SCAN get a column**: `#`, `SO No.`, `PO No.`, `Item ID`, and the numeric
  columns on the right. Fixed width, one straight line down the page — the same language
  the To Order grid speaks on screen.
- **Things you READ stack inside Description**: model name bold first, then
  configuration, then `Remark:` — auto-height, printed only when present. There is never
  a fixed Remarks column (unbounded text explodes fixed columns).
- **The paper's own number never becomes a column** — it is the header. Other documents'
  numbers come in as columns so the papers chain (DO→SO/PO, GRN→PO).
- Numeric columns hug the right edge, right-aligned, 11pt bold.

```
#   SO No.    Item ID     Description                              Qty
────────────────────────────────────────────────────────────────────────
1   SO-1256   M1401F-K    King Mattress Premium — Queen · Firm      2
                          Remark: split delivery, call first
2   SO-1257   BF220-Q     Queen Bedframe — Walnut · gap 14          1
3   SO-1257   XAMMAR      L-shape Sofa                              1
                          Modules 1B(LHF) + CNR + 2A(RHF)
                          Fabric CG-011 Peach · Seat 24" · Leg 4"
                          Orientation: chaise LEFT (facing sofa)
```

- A sofa needs **no special layout** — it is the same row with more stacked lines. A
  drawn plan-view schematic (2990s' best idea) is a later attachment, never inline.
- Last page prints `— End of {DOC} · {n} lines —` (guards against a lost page 2 on a
  WhatsApp forward). Financial documents (Invoice, Credit Note) close with a Totals card
  instead — the only two registered closers.
- `NOTES` block prints after the table only when there is a note.

---

## §5 · Zone 3 — Footer (15mm, identical everywhere)

```
Computer-generated document. No signature required.
Generated from Carres Portal · 01 Aug 2026, 11:25
CARRES SDN. BHD. · E-28-02 & 03, Menara SUEZCAP 2, KL Gateway, 59200 KL   (7.5pt)
                                                        PO-2031 · Page 1/2
```

- **No signature boxes anywhere.** The portal's audit trail (Issued By · timestamp) is
  the record, and it beats a scribble. `Issued By` prints as metadata, not as a line to
  sign.
- No E.&O.E., no Terms block. If something must be said, it is a `NOTES` line.

---

## §6 · Feel tokens

| Token | Value | Rule |
|---|---|---|
| Font | Noto Sans (SC subset — ASCII + CJK in one file) | One family, two voices: 700 caps + letter-spacing for identity/labels, 400/500 for content. No second typeface. |
| Sizes | **16 · 11 · 9 · 7.5** pt | Four sizes total. A template cannot ask for a fifth — the components don't take a size prop. |
| Spacing | multiples of **3mm** | margins 12 · zone gaps 6 · card padding 3 |
| Ink | `#1A1714` warm black | body text |
| Muted | `#7A7268` warm grey | labels, Item ID, footer |
| Wash | `#F5EFE6` linen | table header row ONLY |
| Accent | `#D64F20` terracotta | **max two appearances per page**: document number + the identity rule |
| Contrast law | — | hierarchy must survive B/W laser + a WhatsApp photo: weight and size carry it, colour only decorates |

---

## §7 · Document Dictionary

One name per field, all documents. Loo edits at will; this table is the only home.

| Word | Meaning |
|---|---|
| `Issued` | the date the document was produced |
| `Required Delivery` | the date the goods must arrive (PO) |
| `Supplier` / `Customer` | the counterparty card label |
| `Deliver To` | the address card — where the goods go |
| `Delivery` | the DO's logistics card (driver · vehicle · slot) |
| `Warehouse` | GRN's receiving location card |
| `Claim Against` | the claim's counterparty card |
| `SO No.` / `PO No.` | reference columns — same words as the To Order grid |
| `Item ID` | the SKU code column |
| `Qty` | quantity |
| `Remark:` | per-line free text inside the Description stack |
| `NOTES` | document-level free text block |
| `Issued By` / `PIC` | metadata, never a signature line |

---

## §8 · Document Register

| Document | Prefix | Meta dates | Cards (weight) | ID columns | Right columns | Closer |
|---|---|---|---|---|---|---|
| Purchase Order | PO | Issued · Required Delivery | Supplier(1) · Deliver To(2) | SO No. · Item ID | Qty | End line |
| Delivery Order | DO | Issued · Delivery date | Customer(1) · Deliver To(2) · Delivery(1) | SO No. · PO No. · Item ID | Qty | End line |
| GRN | GRN | Received | Supplier(1) · Warehouse(2) | PO No. · Item ID | Ord · Recv · Rej | End line |
| Claim Report | CLM | Issued | Supplier(1) · Claim Against(1) | PO No. · Item ID | Qty | End line |
| Return Note | RTN | Issued | Supplier(1) · Pickup From(2) | PO No. · Item ID | Qty | End line |
| Service Note | SVN | Issued | Customer(1) · Service(1) | SO No. · Item ID | ✓ | End line |
| Invoice (later) | INV | Issued | Bill To(2) · Sold By(1) | SO No. · Item ID | Qty · Amount | Totals card |

The supplier-facing PO prints **no RM value of any kind** — the money is absent from the
payload (`purchasing_po_document`, migration 0307), not hidden by the template.

---

## §9 · Numbering

- New documents use `docNumber()` (`packages/shared`): `PREFIX-DDMMYY-NNNN`, tail hashed
  from the order id — volume stays private, a reprint matches the original.
- **The PO prints its real id (`PO-2031`) for now.** The id is the database primary key;
  printing a prettier number the system cannot find is a self-made accident. Renumbering
  the PO scheme is a clean-start job, recorded here so it is not forgotten.

---

## §10 · How this is enforced, and what is still open

- **Code skeleton**: `apps/web/src/lib/pdf/doc-framework.tsx` — exports `DocPage`,
  `InfoCard`, `BodyTable`, `DocFooter`. Templates only assemble; they cannot pass a font,
  a size, a colour or a mm. The tokens live in one constants file.
- **Existing shipped documents (SO · Invoice · Receipt · DO · Loan Note) are untouched**
  until each is migrated deliberately, one at a time. First-born on the framework: the
  Purchase Order (wired to the money-free 0307 payload, replacing the old template that
  still leaks retail prices).
- Open technical checks before the first build: Noto Sans 700 weight file must be
  registered (CJK bold), and a vector logo is needed — until one exists the wordmark is
  set in type.
