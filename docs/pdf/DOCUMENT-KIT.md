# The Carres Document Kit — every printed document starts here

**Status** — Law · **Owner** — Jess
**Read this BEFORE designing or changing any Carres PDF.** It is the one entry
point: what a Carres document looks like, which words it may use, which
documents exist, and where each one's own rules live. A chat that designs a
document without this file will redraw a shape the owner already settled.

The measurement sheet (every size, weight and row pitch) is **not duplicated
here**: it lives in [`SO-PDF-STANDARD.md`](SO-PDF-STANDARD.md) §2.1 + §8.5 and
is the family's, not the Sales Order's alone. One copy, one truth.

---

## 1 · The documents, and where their own rules live

| Document | Who reads it | Its own rules | Built? |
|---|---|---|---|
| **Sales Order** | customer | [`SO-PDF-STANDARD.md`](SO-PDF-STANDARD.md) — **and the family chrome** | ✅ |
| **Purchase Order** | supplier | [`PO-PDF-STANDARD.md`](PO-PDF-STANDARD.md) | ✅ |
| **Delivery Order** | customer, crew | [`DO-PDF-STANDARD.md`](DO-PDF-STANDARD.md) | ✅ built, **old style — owes the kit** |
| **Goods Received Note** | internal, supplier claim | *(none yet)* · business rules: `purchasing/MASTER.md` §Receiving | ✅ built, **old style + no standard** |
| **Tax Invoice** | customer | *(none yet)* | ✅ built, **no standard, SST unresolved** |
| **Payment Request** | customer | *(none yet)* | ✅ built — the SAME template as the Tax Invoice, switched by `doc_title`. An imported order's own tax invoice lives in AutoCount, so this mode prints no SST rows and reads `Total due`. Two documents, one file: change one, check both. |
| **Receipt** | customer | *(none yet)* | ✅ built, no standard |
| **Payment Voucher** · **Other Debtor Invoice** | finance | *(none yet)* | ✅ built, no standard |
| **Loan Note** · **Extension Agreement** · **Pickup sheet** · **Listing export** | mixed | *(none yet)* | ✅ built, no standard |
| **Purchase Return (PR)** | supplier | *(none yet)* · `purchasing/MASTER.md` §9.6 | ❌ **the Register is LIVE, the document is not** (0548 applied, screen deployed 2026-09-19). Money-free (§4) |
| **Repair Order (RO)** | supplier | *(none yet)* · `purchasing/MASTER.md` §9.7 | ❌ approved, not built. Money-free (§4) — a printed price reads as accepting the charge |
| **Consignment Order (CO)** · **Consignment Return (CRTN)** · **Consignment Sale Notice (CSN)** | supplier (CSN: supplier + finance) | *(none yet)* · `purchasing/MASTER.md` §§9.9–9.11 | ❌ approved, not built. A paired swap shares the CO's one PDF; the CSN prints no customer name and no selling price |
| **Supplier Claim pack** | supplier | *(none yet)* · `purchasing/MASTER.md` §9.5 | ❌ approved, not built |
| **Delivery Return** | customer | *(none yet)* · `service/MASTER.md` §Document decision | ❌ approved, not built |
| **Visual Service Note** | warehouse, logistics, supplier | *(none yet)* · `service/MASTER.md` §Document decision | ❌ approved, not built — role-specific copies reveal only what that role needs |
| **Credit Note** | customer, finance | *(none yet)* · `service/MASTER.md` · `stock/MASTER.md` | ❌ approved, not built — Finance owns it; no supplier document carries the credit |
| **Customer Statement** | customer | *(none yet)* · `payment/MASTER.md` | ❌ **the read is BUILT, the document is not** — `GET /invoices/statement/:orderId` feeds a screen only, so a customer asking what they owe across orders gets a screenshot |
| **Rental agreement (signed)** · **Diglant Forecast proposal** | customer / Diglant | `rental/MASTER.md` | ❌ not built. The forecast must print `Forecast proposal — Not a Purchase Order` |

A document with no standard of its own still obeys THIS file.

**NOT documents, and they must stay that way.** A page that owns a number is not
therefore a page that owns a paper:

- **Display Request (`DR-`)** — `purchasing/MASTER.md` §9.8 rules it an internal
  object with **no PDF preview**. Showroom asks, Purchasing decides; the CO, the
  Manual Purchase or the transfer that follows is the paper.
- **Manual Purchase (`MPR-`)** — an internal request that produces demand and,
  once approved, a Purchase Order. The MPR preview is the create workspace's
  read-back half and says so in its own source; `PO No` remains the only
  purchasing number a supplier ever sees. **But its REASON is not internal** —
  it prints on the Purchase Order that request becomes (§3 rule 11).
- **Purchase demand** — `purchasing/MASTER.md` §3.3: staff never create or send
  a demand document.
- **Stock Transfer (`Transfer No`)** — `stock/MASTER.md` proves handover by
  scan, holder change and evidence, not by paper.

## 2 · The shape every document shares

```
HEADER   logo 13mm · CARRES SDN. BHD. 14/700 · SSM 8 grey · address THREE lines
         8pt · right: the NUMBER 18/700 over the document name 9pt grey caps
         · 0.5pt rule.  A4 portrait, 12mm margins, content 186mm.
SECTION 2  the parties and the facts, in 2 or 3 columns, grey labels + ink
         values; NAMES bold (600), addresses regular.
TABLE    ink bar, white 7.5/700 caps heads (max TWO lines); rows boxed in
         0.3pt HAIR with absolute full-height column rules; body 7.5pt;
         a closing TOTAL row between two ink rules.
FOOTER   fixed on every page: {doc no} · {audit actor} | the legal sentence |
         `Page n of m`, 7.5pt grey.
```

- **Colours:** ink `#1A1714` · grey `#7A7268` · hairline `#CFC9C0` · quiet
  grey `#B8B1A7` (a real zero) · bar = ink with white text. Nothing else.
- **Font:** Noto Sans SC only. **A word never splits at a line end** — the
  hyphenation callback is off family-wide (`fonts/noto.ts`).
- **Never** a colour, a zebra stripe, a grey band behind rows, an emoji or a
  symbol the font lacks — `◀ ▲ ● ✓` are NOT in the subset and print as
  garbage. Allowed marks: `· • — ×`.

## 3 · The rules that came from real owner reviews

1. **Every page prints the SAME full header**, and the number carries its
   version wherever it appears (`PO-20260922-8987 V2`). Only the content and
   `Page n of m` change between pages. *(PO, 2026-09-22; the SO keeps its
   one-line continuation header until reviewed.)*
2. **One page group per destination**: when one document serves several
   places, each starts a NEW page with its own section 2 and its own `TOTAL`;
   the last page closes with the whole-document total.
3. **A sofa set owns a page** — its layout drawing is the build contract and
   two contracts on one sheet get built as one.
4. **Unit IDs print in FULL**, ink 7.5pt, **last three digits bold**;
   consecutive Units collapse to `first to last`, COMPUTED from the codes, and
   a gap starts a new line. Never a range that hides a gap.
5. **A quantity is a count: centred, one weight.** Money is right-aligned.
   *(Owner 2026-09-22. CLOSED 2026-09-23 — every goods document obeys it:
   PO · Sales Order · Delivery Order · GRN · Tax Invoice / Payment Request.
   The GRN was missing from the original gap list and was right-aligned too;
   its five quantity columns are centred with the rest. Bold belongs to the
   TOTAL row alone — `Qty > 1 prints bold` is retired, and
   `quantity-is-a-count.test.ts` fails the build if right-alignment or a bold
   body quantity returns.)*
6. **A column prints only when it has something to say.** Order and Received
   always print; Damaged · Wrong Item · Extra · Pending appear only when a row
   carries a number. When none do, ONE line says so — absence is a sentence,
   never a blank.
7. **A real zero prints quiet grey; an exception prints bold ink.** No colour,
   no icon.
8. **Never print the same fact twice** on one document.
9. **A fact that is normally the header's prints on the line only when it
   DIFFERS** (Oracle's printed-PO rule, adopted).
10. **Issued documents are never re-rendered to a newer rule**: a version
    already sent reprints exactly as the supplier or customer received it.
11. **THE REASON PRINTS — owner, Jess 2026-09-23.** When a document exists
    because something went wrong or something was specially asked for, the paper
    says WHAT and WHY, in a `Reason` box under section 2. It applies to the
    **Repair Order** (what is being repaired) and to a **Manual Purchase's
    Purchase Order** (what it is for) — the reason is already recorded at
    creation (`Purpose` · `Purchase requirement` · `What is this for?`) and
    today dies on the screen. **The box is not a new field and never a second
    place to type**: it prints the recorded reason verbatim, or it does not
    print at all. Rule 6 governs it — an SO-driven PO carries no reason and
    shows no box; one layout serves both.
12. **THE PHOTO IS THE REASON — owner, Jess 2026-09-23.** A **Repair Order**
    carries the damage photographs, laid out exactly as the PO lays out a sofa
    set: **a page of its own after the goods table**, headed
    `DAMAGE PHOTOS · {Unit ID}`, under the same full header. Why: warehouse,
    driver, supplier and operation all hold this one paper, and words alone get
    the wrong thing repaired — the same failure the sofa layout drawing exists
    to stop (§3.3). **The photos are the Claim's and the Unit's own evidence,
    read through, never re-uploaded to the document**: one set of pictures, one
    truth, so the paper and the screen can never disagree. A Repair Order whose
    source carries no photograph prints one line saying so — absence is a
    sentence (rule 6), never a blank page.

## 4 · Words and dates

- **Every visible word comes from [`../COPY-STANDARD.md`](../COPY-STANDARD.md).**
  A word that is not in the dictionary does not go on paper: it is added to the
  dictionary first, by the owner.
- **Every document's own date is `{DOC} Doc Date`** — `SO Doc Date` ·
  `PO Doc Date` · `GRN Doc Date` · `DO Doc Date` · `RO Doc Date` · `PR Doc
  Date`, and every document added later (owner, 2026-09-23).
- Printed dates read `Fri, 9 Oct 2026`. A time reads `3:42 PM`.
- **A money-free document cannot print a figure**: its payload carries none, and
  a source-scan test keeps it that way. The money-free documents are
  **PO · DO · GRN · Purchase Return · Repair Order** (owner, Jess 2026-09-23:
  *"no need show money"*). A supplier document names the goods — Unit ID,
  quantity, reason — never their value. Two reasons, both the owner's:
  a printed repair price reads as Carres accepting the supplier's charge, which
  `../purchasing/MASTER.md` §9.7 explicitly refuses; and the credit or refund
  consequence belongs to Finance's own document, not to the return that caused
  it. The Consignment documents inherit this by the same rule —
  an unsold consignment return creates no refund, credit or value posting
  (`../purchasing/MASTER.md` §9.10).

## 5 · Before showing the owner a document design

Do all of it unasked, in this order — she should never have to ask for it:

1. **Study the references**: 2990 (`~/Desktop/2990s/apps/backend/src/lib/*-pdf.ts`)
   and the international equivalent (SAP · Oracle · Business Central · Odoo).
   Write down what was kept, adapted and rejected, and why.
2. **Check every word** against the dictionary: ✅ found · ❌ replaced ·
   ❓ genuinely new (needs the owner).
3. **ASCII first**, columns aligned, at the real width.
4. **Rate it out of 10 with the deductions written down**, fix them, rate again.
   **Only show a 10.**
5. **Render it and look at it** before sending. A claim about a layout that was
   never rendered is not evidence.
