# Purchase Order PDF Standard

**Status** — Law
**Owner** — Loo (baseline 2026-08-01/02; family rewrite approved 2026-08-09)
**This is the ONLY copy.** Amend in place through the Change Policy; the Change
Log records every amendment. Implementation: `apps/web/src/lib/pdf/po-template.tsx`
(the legacy money-leaking `po-template` era is over — this template renders the
money-free `purchasing_po_document` payload, migration 0307).

**The chrome is NOT defined here.** Header, parties voice, ink bar, row pitches,
type sizes, footer, fixed zones — ALL of it is
[`SO-PDF-STANDARD.md`](SO-PDF-STANDARD.md) (§2.1 measurement sheet + §8.5
conversion law), applied verbatim. This file holds only what the PO decides for
itself. **The 2026-08-01 visual spec (logo-stamp header, 35mm label gutter,
zero-fill table, 22mm header) is DELETED, not preserved** — the owner replaced
it on 2026-08-09 after the SO review rounds disproved its zero-fill premise on
real prints. Git history is the archive.

## Change Policy

The current specification is the approved baseline. Proposals must explain
Why change · Benefits · Drawbacks · Impact. No silent overwrites; the owner
approves architectural changes.

## 1 · Mission

A supplier must identify the document, the delivery date and the destination
within three seconds, then read the items without ever meeting a number that is
not theirs. 100% legible on a cheap B/W laser, a fax, a WhatsApp photo.

## 2 · The PO's own rules

- **Money is ABSENT, structurally.** The payload (0307) carries no RM figure;
  the template cannot print one. The source-scan test enforces it.
- **THE DOCUMENT PRINTS ITS VERSION, INCLUDING VERSION 1** (0378, 2026-08-24).
  It appears in the identity block under `PURCHASE ORDER`, as a `Version` row in
  PO DETAILS, and on every continuation header beside the number. A supplier
  holding two papers with one number and no version cannot tell which one to
  build from. **This does NOT change `docs/COPY-STANDARD.md`'s panel rule** —
  `Version 1 prints nothing` governs the internal REVISIONS PANEL, where an
  unrevised PO is just the PO; this is paper that leaves the building, and it
  must be self-identifying. The version the PDF prints is the version the
  confirmation records: `purchasing_po_document` returns it, the template prints
  it, and `purchasing_confirm_po_sent` refuses a mismatch.
- **PO DETAILS**: `PO No · Version · PO Delivery Date (bold value — the supplier's 3-second
  fact; imperative, the reader IS the supplier — lineage: "Required
  Delivery" rejected 2026-08-01, "Supplier Delivery By" frozen, "Supplier"
  dropped on paper 2026-08-09) · PO Issued`. **No SO No row** — a bulk PO can
  carry dozens; the table's SO NO column is the one home. Screens speak the
  Business Date Dictionary (`Goods Arrival`); this paper speaks to the
  supplier.
- **Section 2 is THREE columns** — `SUPPLIER (flex) · DELIVER TO (flex) ·
  PO DETAILS (52mm fixed)`. The two ADDRESS blocks size by content
  (Constitution: content decides column width); only the fixed-fact column
  is fixed. **The supplier prints its FULL address** — a formal document
  names both parties completely. Detail rows read in time order:
  `PO No · Version · PO Issued · PO Delivery Date (bold, last)`. Three columns give who supplies · where it goes · when it's due, the
  supplier's 3-second sweep in one row (restores the old law's
  deliver-to-at-section-2). **One PO may carry one or several governed
  destinations** (Owner B, 2026-08-28). For one destination, DELIVER TO prints
  that exact name and address. For several, it prints `Multiple destinations`
  and every exact name/address used by the goods lines. Nice Future prints its
  fixed collection sentence via `delivery_instructions`.
- **Items table**: `# · SO NO · ITEM ID · DESCRIPTION · DELIVER TO · QTY`.
  - Every goods line prints its effective governed destination name and address.
    `purchase_order_lines.destination_id` overrides the PO default; a null line
    destination follows `purchase_orders.destination_id`. This is document
    truth, not display inference.
  - **Item ID = `ops_stock_items.unit_code` (0153)** — minted at PO-open, one
    scannable id per physical unit. The column the 2026-08-01 law reserved is
    now LIVE: the supplier labels each unit by id; the warehouse scans on
    receive. Prints `—` until codes arrive. **Never the SKU.**
  - **Per-line `SO No` comes from the LINE's own lineage** (`po_line_sources`,
    0382). One aggregated SKU serving three customers prints all three with the
    quantity beside each — `SO-1318 × 2` — because ten mattresses stop being
    interchangeable the moment three people are promised them. A line serving one
    order prints `SO-1318` alone.

    The P5 allocation gap is **CLOSED**. Until 0382 the schema kept `so_refs` on
    the DOCUMENT and nothing per line, so this column printed only when the whole
    PO covered exactly one sales order — every bulk purchase order printed it
    BLANK, and a supplier delivering ten mattresses could not tell Carres whose
    they were. Purchase orders raised before 0382 have no lineage to read and
    keep the old document-level fallback.
  - CR/TCF import refs never appear. No database words on paper. No UOM
    column. An item never splits across pages.
  - A BULK PO (several SOs) closes with the family `TOTAL` row (qty only);
    a one-customer PO does not.
- **Consolidation** (business, unchanged): mattress/bedframe group by model,
  quantity summed, owning SOs listed; sofa = one customer order, max 2 sets.
  The §6.2 bedframe one-PO-one-customer ruling and its recorded conflict with
  `docs/purchasing/MASTER.md` §3 remain OPEN for the purchasing chat — nobody
  resolves it silently from here.

## 3 · Sofa layout drawing

One drawing per model with module lines: bordered module boxes (no outer union
outline), back strip on top, chaise deeper toward the viewer, module code +
that module's fabric under each box, TV marker beneath. Caption: `Top view.
Back at the top. TV in front.` Why: LHF/RHF words alone get sofas built
mirror-reversed; the picture is the contract. One set per page remains the
target for the sofa PO's paging (implement with the long-order pass, matching
the DO's per-set pages).

## 4 · Footer & audit

**`Issued by {name}` is the real issuer** — `audit_log`'s own actor for the
creation, read by `purchasing_po_document` (0383). The route hard-coded it to
`null` until then, so the footer named nobody on every purchase order Carres has
ever sent. **The supplier's FULL address is read too** (`suppliers.address`,
added by 0383): the column has been law since 2026-08-09 and had no field behind
it, so it printed nothing. An address nobody has filled still prints nothing —
the gap is visible rather than fatal, because a purchase order has to be able to
leave.

Family footer with the PO's audit cell: left `{PO no} · Issued by {name}` ·
centre `Computer-generated document · No signature required.` · right page
numbers. No signature boxes anywhere — the portal's audit trail is the record.

## 5 · Numbering

`PO-2044` prints the database id; renumbering to `PREFIX-DDMMYY-NNNN` is a
clean-start job.

**~~the PO itself never revises~~ — SUPERSEDED (Jess, 2026-08-18; 0364).** A
sent PO is not overwritten, it is REVISED: the NUMBER is kept and a version is
minted, because cancel-and-reissue puts two numbers for one job in a factory's
hands and a factory reads two numbers as two jobs. Adding items is still a NEW
PO. The paper therefore carries `PO No` **and** `Version` (§2).

## Change Log

| Date | Change | Approved |
|---|---|---|
| 2026-08-01/02 | Original baseline: header shape, naming, frameless cards, zero-grid table, Item Grammar, sofa one-set-per-page + drawing, quiet footer, no money, no signatures. (Visual spec since superseded; see below.) | Loo |
| 2026-08-09 | PO DETAILS: SO No row removed (the table owns it); `Delivery by` → `Deliver by`. | Loo |
| 2026-08-09 | Section 2 = three columns (SUPPLIER · DELIVER TO · PO DETAILS) — deliver-to returns to section 2. | Loo |
| 2026-08-09 | FINAL (owner: ok): supplier full address; content-driven section-2 widths; detail rows PO No · Issued · Deliver by. | Loo |
| 2026-08-24 | `Version` prints on the paper, including Version 1 — identity block, PO DETAILS row and continuation header (0378). The confirmation records the version the operator rendered; a stale one is refused. The `never revises` line in §5 is marked superseded by 0364. | CARD-2026-08-22-purchasing-02 |
| 2026-08-09 | FAMILY REWRITE: chrome deferred to SO-PDF-STANDARD (§2.1/§8.5); logo-stamp header, 35mm label gutter, caps header dates and the zero-fill table DELETED per the Master Overwrite Law; `Sales Order` column → `SO No`; `TOTAL QUANTITY` → family `TOTAL` row; Item ID column goes LIVE with 0153 unit codes; `Delivery by` bold in PO DETAILS; footer keeps the Issued-by audit. Business rules (no money, consolidation, one destination, sofa drawing) unchanged. | Loo |
| 2026-08-24 | **P5 CLOSED**: per-line `SO No` reads `po_line_sources` (0382), so a bulk PO prints its per-customer breakdown instead of a blank column. `Issued by` is the real `audit_log` actor and the supplier's FULL address is read from `suppliers.address` (0383) — both were hard-coded `null` before. Item ID is fed by the `U1-000-001` allocator (0381). No visual or business rule changed. | CARD-2026-08-22-purchasing-02 |
| 2026-08-28 | **Owner B**: one PO may carry several governed Deliver To destinations. The header names every exact destination and the items table prints each line's effective destination. A post-send destination change still mints a new version and must be sent again. | Owner |
| 2026-08-30 | Purchasing date dictionary alignment: the current official paper prints `PO Issued` and `PO Delivery Date`. Earlier `Issued` / `Deliver by` entries above remain change history, not current copy. | Owner |
