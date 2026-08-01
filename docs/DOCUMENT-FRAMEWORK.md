# CARRES DOCUMENT SYSTEM — v1 (Loo, frozen 2026-08-01)

> **Owner rule first**: the ⭐⭐⭐⭐ OWNER RULE at the top of `CLAUDE.md` governs this
> file — the rules are Loo, not the files; a chat reads this as reference FIRST, then
> advises with a solution and the why, never restricts. This file is Loo's notebook:
> **overwritten in place, kept updating.**
>
> **Status**: Framework · Header · Footer · Information Cards · Table Grammar ·
> Typography = **FROZEN v1**. Bodies are in validation (§9): Mattress ✅ · Bedframe →
> Sofa → Accessory → Service. **No PDF prototype until Sofa passes** — Sofa is the test
> that decides everything; printing earlier means reprinting everything.

---

## §1 · What this is

One master template for every Carres paper — Purchase Order · Delivery Order · GRN ·
Service Report · Service Note · Claim Report · Return Note · Credit Note (later).
SAP-style: fixed header window + fixed footer window + one variable body. Adding a
document = register it (§8) and write its body. Nobody redesigns a page.

References studied, and what each contributed: **Muji** (alignment as silence — the
governing aesthetic) · **SAP** (master form + MAIN window) · **Stripe** (type restraint,
number as hero) · **DIN 5008** (fixed zones) · **IKEA** (Noto Sans; consistency is the
brand, not the logo).

---

## §2 · The constitution — five laws

1. **BLACK & WHITE FIRST.** Nobody prints colour. The document must be 100% legible on a
   cheap B/W laser, a fax, and a WhatsApp photo of a printout. Hierarchy is carried by
   typography (weight · size) and alignment — never by background fills. Colour is a
   free bonus on screens, nothing more. **Clarity beats minimalism** whenever they fight.
2. **ALIGNMENT LAW (Muji).** Same-kind elements sit on the same X — across the page and
   across every document. Every `#`, every `SO No.`, every Item ID, every stacked label,
   every stacked value, every Qty: one X each, forever. Quiet comes from alignment, not
   from decoration.
3. **AN ITEM NEVER SPLITS ACROSS PAGES.** If the remaining space cannot hold the whole
   item, the whole item moves to the next page. Applies to every document. A sofa whose
   Modules print on page 1 and Orientation on page 2 is a supplier phone call.
4. **ITEM GRAMMAR.** The Description column does not know what a sofa is. It knows
   exactly four layers, in order, each optional except the first:
   ```
   Primary Information      the name          Premium Firm Mattress · L-Shape Sofa
   Secondary Information    the key variant   King · Walnut · Modules …
   Supporting Information   the details       Fabric · Leg · Orientation · Gap
   Remark (optional)        free text         Remark: deliver together with SO-1256
   ```
   Mattress, Bedframe, Sofa, Accessory, Service are just different content in the same
   grammar. The body is never redrawn per product.
5. **NO DATABASE THINKING ON PAPER.** `attrs`, `destination_id`, `warehouse_id`,
   `product_type` — words like these never reach a printed document. The supplier reads
   `Premium Firm Mattress · King · Walnut · Deliver To Carres Klang`, never our schema.

---

## §3 · The three zones

```
A4 portrait · 12mm margins · content 186mm
┌────────────────────────────┐
│ HEADER  fixed 45mm         │  Document Identity 18mm + Information Cards 24mm
├────────────────────────────┤  (page 2+: Identity strip only, 18mm)
│ BODY    variable           │  THE TABLE (§6) + Notes
├────────────────────────────┤
│ FOOTER  fixed 15mm         │  identical on every page of every document
└────────────────────────────┘
```

Header and footer dimensions, typography and structure never change between documents.
Only content changes.

---

## §4 · Header (frozen)

```
CARRES                                   PURCHASE ORDER      ← 11pt caps grey
(wordmark 11pt/700)                      PO-2031             ← 18pt/700 — THE HERO
                                                                (bigger than the title:
Issued 01 Aug 2026 · Required Delivery 15 Aug 2026  Page 1/2    the type repeats, the
──────────────────────────────────────────────────── 0.8pt      number is unique)
```

- The document NUMBER is the largest element — on the phone everybody says "regarding
  PO-2031", nobody says "regarding Purchase Order".
- Meta line: at most two dates + page, registered per document (§8).
- **Information Cards — no frames.** Label (7.5pt caps grey) + content + whitespace;
  one hairline closes the card band. 2–4 cards on a 6-unit weighted grid (an address
  card takes more width); band height fixed at 24mm regardless of card count.
- Page 2+ repeats the Identity strip only. Table header reprints every page.

---

## §5 · Footer (frozen — quiet, legal only)

```
Computer-generated document.
No signature required.

PO-2031                                                    Page 1 of 2
```

- No "Generated from Carres Portal" (IT language — PDF metadata already has it).
- No company address here — the wordmark already said CARRES once. Footer gets quieter,
  never busier.
- No signature boxes anywhere. `Issued By` is metadata in the header meta line / cards;
  the portal audit trail is the record.
- Exception, registered per document: tax documents (Invoice, Credit Note) must carry
  the legal identity block (legal name · SSM no · address · SST) — the law requires it.
  Ops documents stay quiet.

---

## §6 · THE TABLE (frozen grammar)

- **Excel-clean listing, zero grid lines, zero boxes.** No background fill anywhere —
  the table header is two hairlines with 7.5pt caps grey labels between them.
- **Hairline rhythm**: one 0.3pt hairline between every item — always, every document.
  Not a separator that appears past N rows; a fixed rhythm the whole system shares.
  (Zebra striping is rejected: a furniture PO is 5–20 lines, not an Excel export.)
- **IDs are columns, prose is the stack**: things you scan (`#`, `SO No.`, `PO No.`,
  `Item ID`, numerics) get fixed columns speaking the same words as the To Order grid;
  things you read live in Description as the Item Grammar stack (§2.4), auto-height.
- **The paper's own number is the header, never a column.** Related documents' numbers
  come in as columns so the papers chain (DO → SO/PO · GRN → PO).
- Supporting-information stacks print as aligned label/value pairs — labels one X,
  values one X (Alignment Law).
- Numerics hug the right edge, right-aligned.
- Last page: `— End of {DOC-NO} · {n} lines —` (business meaning: a lost page 2 on a
  WhatsApp forward is caught). Continuation pages carry NOTHING extra — `Page 1/2`
  already said it. Financial documents close with a Totals card instead (the only two
  registered closers).
- `NOTES` block after the table, only when there is a note.

Column set for the PO: `# · Sales Order · Item ID · Description · Qty`.

---

## §7 · Typography & tokens (frozen)

| Token | Value |
|---|---|
| Font | Noto Sans (SC subset — ASCII + CJK one file). One family, two voices: 700 caps + letter-spacing for identity/labels, 400/500/600 for content. |
| Sizes | **18** doc number · **11** title/wordmark · **10** Qty (700) · **9.5** primary info (600) · **9** secondary/values/IDs · **7.5** labels/remark/footer |
| Ink / grey | `#1A1714` warm black · `#7A7268` warm grey — **grey lives in TYPE, never in backgrounds** |
| Accent | `#D64F20` terracotta — doc number + identity rule only; the document must survive its death in B/W |
| Spacing | 3mm rhythm — margins 12 · zone gaps 6 · row gap 3 |
| Lines | terracotta identity rule · table-header pair · item hairlines (0.3pt) · footer top. Vertical lines: **zero**. |

---

## §8 · Document Register

| Document | Meta dates | Cards (weight) | ID columns | Numerics | Closer |
|---|---|---|---|---|---|
| Purchase Order | Issued · Required Delivery | Supplier(2) · Deliver To(4) | Sales Order · Item ID | Qty | End line |
| Delivery Order | Issued · Delivery date | Customer(2) · Deliver To(3) · Delivery(1) | Sales Order · PO No. · Item ID | Qty | End line |
| GRN | Received | Supplier(2) · Warehouse(4) | PO No. · Item ID | Ord · Recv · Rej | End line |
| Claim Report | Issued | Supplier(3) · Claim Against(3) | PO No. · Item ID | Qty | End line |
| Return Note | Issued | Supplier(2) · Pickup From(4) | PO No. · Item ID | Qty | End line |
| Service Note | Issued | Customer(3) · Service(3) | — | Done ☐ | End line |
| Invoice (later) | Issued | Bill To(4) · Sold By(2) | Sales Order · Item ID | Qty · Amount | Totals card + legal block |

- The supplier-facing PO prints **no RM value of any kind** — absent from the payload
  (`purchasing_po_document`, migration 0307), not hidden by the template.
- References: `SO No.` is the one customer reference. CR/TCF are AutoCount / Master
  Sheet testing data and never appear in the final design (owner rule, CLAUDE.md top).
- Numbering: new documents use `docNumber()` (`PREFIX-DDMMYY-NNNN`, hashed tail — volume
  private, reprints stable). The PO prints its real id until the clean-start renumber.

---

## §9 · Validation roadmap (the only open work)

```
Mattress ✅ → Bedframe → Sofa (THE decider) → Accessory → Service
→ Final Body → PDF Prototype (ONCE)
```

Bedframe, Sofa, Accessory, Service are validated against the Item Grammar — each is a
test of §2.4, never a redesign of the page. Sofa decides type sizes, line heights,
hairline rhythm and remark handling for everyone; nothing is printed before it passes.
Existing shipped documents (SO · Invoice · Receipt · DO · Loan Note) stay untouched
until migrated deliberately, one at a time.
