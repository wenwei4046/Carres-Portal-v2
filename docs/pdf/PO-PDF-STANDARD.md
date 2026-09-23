# Purchase Order PDF Standard

**Start at [`DOCUMENT-KIT.md`](DOCUMENT-KIT.md)** — the shared shape, words and
owner rulings for every Carres document. This file holds only what this
document decides for itself.

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

- **Pre-issue review (owner request, 2026-09-07):** Review Purchase Orders opens
  a draft using this same template immediately. It prints DRAFT / Not issued
  and a do-not-send footer on every page. Only selected SKU quantities, source
  SOs and known supplier/destination facts are previewed; no PO number, issued
  version, issue date, Unit IDs or delivery promise is invented. Issue PO still
  creates the official document; the preview then switches to its print data.

- **Money is ABSENT, structurally.** The payload (0307) carries no RM figure;
  the template cannot print one. The source-scan test enforces it.
- **EVERY PAGE PRINTS THE SAME FULL HEADER, AND THE NUMBER CARRIES ITS
  VERSION — INCLUDING V1** (owner, 2026-09-22; overrides, for the PO only,
  SO-PDF-STANDARD §3's one-line continuation header). Logo · `CARRES SDN.
  BHD.` · SSM · the registered address · the hero **`PO260922-8987(2)`** 18/700
  with `PURCHASE ORDER` beneath — identical on page 1, every continuation page
  and every Deliver To's pages. Between pages only the Deliver To, the goods
  and the footer's `Page n of m` change. The same `PO…({n})` also prints in
  the PO DETAILS `PO No` row and the footer. No separate `Version` row and no
  version printed on its own. **Measured on the OLD `PO-YYYYMMDD-RRRR V{n}` form only — the new
  `PO260924-4827(n)` form is NOT re-measured and no width below is verified for it:** the hero with its version is
  52.9mm, which leaves 112mm beside the 13mm logo — the address's old second
  line (122.4mm) would run under `PURCHASE ORDER`, so the address prints on
  THREE lines (71.0 · 60.8 · 61.0mm) and the header reserve is 26mm, not
  22mm. The dictionary form is `(n)` (owner 2026-09-23; was `V{n}`) for the live template and documents
  issued after cutover. **A document already sent reprints exactly as the supplier received it** —
  a frozen `po_version_documents` payload that printed `V2` still prints `V2`. A supplier holding two papers with one
  number cannot tell which to build from without it, so `(1)` prints too
  (`Version 1 prints nothing` is only the internal REVISIONS PANEL's rule).
  The version the PDF prints is the version the confirmation records:
  `purchasing_po_document` returns it, the template prints it, and
  `purchasing_confirm_po_sent` refuses a mismatch.
- **PO DETAILS — rows, in order (Jess, 2026-09-22; dictionary words only):**
  `PO No` (`PO…({n})`) · `PO Doc Date` · **`PO {n}-Day Delivery Date`** (bold
  value — the supplier's 3-second fact) · `Delivery Method` (`Supplier
  delivers` / `We collect`). `{n}` is exactly the applicable working-day value recorded from Settings
  for this PO, with NO added transit days (Jess, 2026-09-22 correction;
  APPROVED / NOT BUILT). Calculate from PO Date using n working days, skipping
  applicable weekends and public holidays. Example format only:
  `PO 14-Day Delivery Date : Fri, 9 Oct 2026`; Settings at 10 days reads
  `PO 10-Day Delivery Date`. An unknown original prints `PO Delivery Date :
  Not recorded`. **Measured (Noto 8pt):** one line is 31.7mm of label + 22.0mm
  of bold value = 53.7mm > the 52mm column, so the label prints on TWO
  deliberate lines — `PO 14-Day` / `Delivery Date` — colon and value on its
  last line (the SO's two-line-label rule). Label gutter **23mm** (widest
  one-line label `Delivery Method` 21.4mm; widest value `:  Supplier
  delivers` 24.2mm; 23 + 24.2 = 47.2mm ≤ 52). Retired on paper:
  `Deliver by` · `Issued` · `Version` row · **`PO Date`** · `Supplier Default
  Delivery Date` · `Delivery method`. *(This list read `PO Doc Date` until
  2026-09-23 and contradicted the row order three lines above it, which has
  always said `PO Doc Date`. The owner's 2026-09-23 ruling settles it: every
  document's own date reads `{DOC} Doc Date`, so `PO Doc Date` is the word that
  prints and `PO Date` is the one that is retired.)* **No SO No row** — a bulk PO can
  carry dozens; the table's SO NO column is the one home. **ONE layout for
  every PO (Jess, 2026-09-22):** a one-SO purchase order (every sofa PO) keeps
  the SO NO column too — lifting its single SO into PO DETAILS was proposed
  and REFUSED, because two layouts for one document is two standards. Screens speak the
  Business Date Dictionary (`Goods Arrival`); this paper speaks to the
  supplier.
- **Section 2 is THREE columns** — `SUPPLIER (flex) · DELIVER TO (flex) ·
  PO DETAILS (52mm fixed)`. The two ADDRESS blocks size by content
  (Constitution: content decides column width); only the fixed-fact column
  is fixed. **The supplier prints its FULL address** — a formal document
  names both parties completely. **Both party NAMES print bold (600) — the supplier's
  `Name` and the DELIVER TO `Name` — addresses regular** (owner, 2026-09-22:
  one weight for one kind of fact). Detail rows read in time order:
  `PO No · PO Date · PO {n}-Day Delivery Date (bold) · Delivery Method`. Three columns give who supplies · where it goes · when it's due, the
  supplier's 3-second sweep in one row (restores the old law's
  deliver-to-at-section-2). **A PO may carry one or several Deliver To**
  (Jess, 2026-09-22; `docs/purchasing/MASTER.md` §5.4): a sofa PO is always
  one; a mattress/bedframe PO may split its goods across several, and a later
  change keeps the SAME PO number as a new revision. DELIVER TO prints one
  exact name and address — the destination of the goods on that page. Nice
  Future prints its fixed collection sentence via `delivery_instructions`.
- **ONE PDF, ONE PAGE GROUP PER DELIVER TO (Jess, 2026-09-22).** A PO with
  several Deliver To is still ONE complete PDF with ONE PO number and ONE
  revision. **Each Deliver To starts on a new page**, and its pages carry
  only its own goods; a destination may run onto further pages when its
  goods need them. The first page of each destination prints section 2 with
  THAT destination's full name and address in DELIVER TO — plain `DELIVER TO`,
  never `(1 of 2)` (owner, 2026-09-22: location, quantity and page number each
  say one thing). The footer's `Page 1 of 2` carries the page count. **Every page — first,
  continuation and every destination — prints the same full header with
  the same `PO…({n})`** (`PO260922-8987(2)`). Example: that PO = 4 mattresses for Klang
  (page group 1) + 2 for AL (page group 2); still 6 on one PO — no second PO,
  no `Moved from` line, no new Unit IDs. A one-destination PO prints exactly
  as before.
- **Items table**: `# · SO NO · UNIT ID · DESCRIPTION · QTY` — the same five
  columns on every PO and every destination's pages. There is no per-line
  DELIVER TO column: the destination is the page's section 2. `#` numbers run
  on across destinations; each destination's table closes with its own
  `TOTAL` (Klang `TOTAL 4`, AL `TOTAL 2`), and **the LAST page closes with
  `PO TOTAL`** — the whole PO's quantity (`PO TOTAL 6`), one figure with
  nothing beside it (`PO TOTAL · 2 Deliver To` was refused as confusing). A
  one-destination PO prints only its `TOTAL` — the two would be the same
  number. **Issued documents are never re-rendered to a newer rule**: a
  revision already sent reprints exactly as the supplier received it.
  - **UNIT ID — the only approved word; `ITEM ID` is retired (owner ruling
    2026-09-07).** The column prints `ops_stock_items.unit_code` for the
    Units THIS LINE was born with: an exact-unit line (Catalog
    `stock_identity_mode = exact_unit` — traceable furniture and independently
    saleable or replaceable modules) is born with exactly one permanent
    `U1-000-001` per ordered piece **in the same transaction as the PO
    number** (0442 · 0443), bound to the line by `po_line_id`, so two lines of
    one SKU print disjoint IDs. A quantity line (governed interchangeable
    goods — pillows, protectors) has no Unit IDs by law and prints `—`; that
    dash is intentional, not "not allocated". A revision prints the current
    Units only (a reduced line's retired IDs leave the paper; they are never
    reused). The paper and the opened PO's `Document → Goods lines` read the
    same line-bound rows, so they can never disagree. **Never the SKU.** The
    supplier's instruction is one line on its own package label —
    `CARRES UNIT ID: U1-000-001` — no QR, barcode or Carres label template
    is required. A source-scan test fails the template if `Item ID` returns.
  - **HOW A UNIT ID PRINTS — owner ruling (Jess, 2026-09-21).** Ink, 7.5pt —
    the table body's size, never the grey 7pt that made it the faintest text
    on the page. **The last three digits are BOLD** (`U1-000-`**`004`**) — the
    running number is the part a packer reads; the prefix is the same on every
    row. Always the last three, never "only the digits that changed": a run
    `008 → 013` changes two digits, and a single Unit has nothing that changes.
    Underline was tried and refused — it blurs into the grid hairlines on a
    photo or fax. Every code prints in FULL. A run of consecutive Units prints
    as ONE line `U1-000-001 to U1-000-004` (measured 32.4mm with the bold
    digits); consecutiveness is COMPUTED from the codes, never assumed — a gap
    starts a new run on its own line, and `U1-999-999 → U2-000-001` counts as
    consecutive.
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
  - EVERY PO's table closes with the family `TOTAL` row (qty only) — one
    layout for every PO, a one-customer PO included.
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
mirror-reversed; the picture is the contract. **One set per page — BUILT
2026-09-22:** each model's drawing takes a page of its own after the goods
table, headed `SOFA LAYOUT · {model}`, under the same full header.

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

**`PREFIX-YYYYMMDD-RRRR`, and the paper prints exactly what the database holds.**
`docs/purchasing/MASTER.md` §6.1 is the law and migration 0381 enforces it:
`allocate_formal_document_code('PO')` draws `RRRR` at random from that day's
unused codes, unique across every prefix. Production mints `PO-20260922-8987`
(measured 2026-09-23). The old `PO-2044` sequence and the never-built
`PREFIX-DDMMYY-NNNN` proposal are both retired; existing identities are
permanent and are never renumbered.

**THE HEADER, MEASURED ON THE REAL NUMBER — 2026-09-23.** §2's `52.9mm` hero was
measured on `PO-2609-0042 V2`, a number this system cannot produce. Re-measured
against the actual Noto Sans SC 700 file at 18pt, the real hero
`PO260922-8987(2)` is **67.9mm** — fifteen millimetres wider. The header still
holds, and here is the whole arithmetic so nobody has to guess again:

```
content                                        186.0mm
− hero `PO260922-8987(2)`   18/700           67.9
− headerLeft paddingRight                        4.0
− logo                                          13.0
− logo → name gap                                4.0
= the left column's real width                  97.1mm

  `CARRES SDN. BHD.` 14/700 + SSM 8pt           87.6   fits, 9.5mm spare
  address line 1                    8pt         70.6   fits
  address line 2 · 3                8pt         60.5   fits
```

**9.5mm is the whole margin, and the widest thing in it is the company name row,
not the address.** A longer legal name, a second registration number or a fourth
address line spends it. The draft hero without a version is 58.8mm and
`PURCHASE ORDER` beneath is 27.5mm, so neither is the binding constraint. The
26mm header RESERVE is a height and is unaffected. Re-run the measurement
against the font whenever the company block or the number shape changes.

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
| 2026-09-07 | **UNIT ID BORN WITH THE OFFICIAL PO.** Column heading `ITEM ID` → `UNIT ID` (the only approved word). IDs are born in the PO's own transaction for exact-unit lines only, bound to the line (0442 · 0443); a quantity line prints `—` by law; the document reads each line's own Units (`purchasing_po_document`, 0443) and therefore shows exactly what the PO object shows. Supplier instruction stays `CARRES UNIT ID: U1-000-001` on the supplier's own label. | Owner (Purchasing CARD 10) |
| 2026-09-21 | **Unit ID print style**: ink 7.5pt, last three digits bold, consecutive Units as one `first to last` line computed from the codes (gap = new run). Underline refused (blurs into grid hairlines on photo/fax). | Jess |
| 2026-09-22 | **One PO layout**: proposal to move a one-SO PO's `SO No` into PO DETAILS and drop the column REFUSED — every PO keeps the SO NO column (one standard). | Jess |
| 2026-09-22 | **Several Deliver To on one PO, one page group each** (Jess): sofa PO = one Deliver To; mattress/bedframe may split; a later move keeps the SAME PO number as a new revision — no second PO, no `Moved from`, no new Unit IDs. Each Deliver To starts on a new page of one PDF; every page carries the PO number and revision. The per-line DELIVER TO column and `Multiple destinations` are deleted; five columns everywhere. Same-day entries that read "split" as separate POs are overwritten. | Jess |
| 2026-09-22 | PO DETAILS in dictionary words: `PO No` (`PO…({n})`, version printed ONCE beside the number and on every page header — identity-block and `Version` row retired) · `PO Doc Date` · **`PO {n}-Day Delivery Date`** (n = the recorded Settings working-day value, with no added transit days; e.g. `PO 14-Day Delivery Date : Fri, 9 Oct 2026`) · `Delivery Method`. `PO Default Delivery Date` renamed `PO Delivery Date` portal-wide; `Deliver by` / `Issued` retired on paper. | Jess |
| 2026-09-22 | Several-Deliver-To pages simplified (owner, on the rendered preview): plain `DELIVER TO` with that location's full name and address — `(1 of 2)` deleted; each location's table keeps its `TOTAL`; the last page adds **`PO TOTAL`** (whole-PO quantity, nothing beside it); page count lives in the footer `Page n of m`. Version wording corrected: the version travels with every printed PO identity (`PO No` row, page headers, footer) and never prints on its own. | Jess |
| 2026-09-22 | Supplier `Name` prints bold (600), the same weight as the DELIVER TO `Name`; addresses stay regular. | Jess |
| 2026-09-22 | Version placement stated without contradiction: PO DETAILS `PO No` row · continuation page headers · footer; the page-1 hero number does not repeat it. Matches the approved preview; no layout change. | Jess |
| 2026-09-22 | **Every page prints the same full header** (logo · company · SSM · address · hero `PO…({n})` · `PURCHASE ORDER`) — the one-line continuation header and the page-1 hero without version are deleted; only Deliver To, goods and `Page n of m` change between pages. Address prints on three lines and the header reserve grows to 26mm (hero with version measured 52.9mm; old address line 122.4mm collided). Overrides SO-PDF-STANDARD §3's continuation header for the PO only. | Jess |
| 2026-09-22 | **BUILT** (`po-template.tsx`, `GET /print-data`): every rule of 2026-09-21/22 above. The route ADDS `delivery_working_days` (shared `poDeliveryWorkingDays`, the supplier's week + holidays) and `delivery_method` (`suppliers.kind = 'factory_pickup'` → `We collect`) beside the SQL document and overwrites nothing; a kept version (`?version=N`) gets neither and reprints as sent. Every PO closes with `TOTAL`; sofa drawings one set per page. Words never split at a line end (family, SO-PDF-STANDARD §9). No migration. | Jess |
| 2026-09-23 | `PO Date` → **`PO Doc Date`** — owner ruling: every document's own date reads `{DOC} Doc Date` (COPY-STANDARD). **BUILT** on the live template the same day. | Jess |
| 2026-09-23 | Header re-measured on the REAL number: `PO260922-8987(2)` is 67.9mm, not the 52.9mm §2 quoted for a number the allocator cannot mint. The left column is 97.1mm and its widest content — the company name row at 87.6mm, not the address — leaves 9.5mm. No layout change; the figures are now true. | measured |
