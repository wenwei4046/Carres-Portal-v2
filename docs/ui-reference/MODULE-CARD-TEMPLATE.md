# Compact module card — contract

Owner rules 2026-10-03 / 2026-10-04: one shared customer header for every module, with the owner's
Stock and Customer corrections. This is the only card contract.

**Use the kit component, never these files:** `apps/web/src/components/kit/CompactModuleCard.tsx`
(live on `/ui#compact-card` with Info and Delivery). The reference page `module-card-reference.html`
(SHA-256 `98c1ae5396a53143…`, published at `/ui-kit/module-card`; the retired `/ui-kit/delivery-card`
and `/ui-kit/delivery-card.html` answer with a 301 that keeps the query string) is the proof target.
`node scripts/compact-card-states.mjs <dev url>` drives both through 25 states at five widths, compares
geometry, text and styles, and must report **no unexplained difference**.
`module-card-measurements.json` holds reference and component heights per state and width.

## Rules

**Shared Header colour — owner approved 2026-10-04:** use existing Radix slate-12 background, white primary text and countdown, slate-4 contact text, slate-11 dividers/hover. Countdown uses the existing label token (11px/500/14px), with no pale badge fill. Focus is visibly white inside the dark header. Only the identity Header changes; address details, tabs, summary and body stay light. Every CompactModuleCard consumer inherits this treatment; no per-module copy. This scoped approval does not decide the remaining card palette, font or radius.

- **One shared customer header:** name · order · phone; a ▾/▴ at the lower right of the customer cell
  opens the sales facts (no `Order info` words); address with its own toggle (▴ while open); target
  date (`d Mon`) with the signed calendar-day countdown from Malaysia today (`27d`); Open and Close.
  The phone glyph and number form one wrapping unit. The header grows with a long name; nothing overlaps.
- **Sales facts:** `Order date` · `Sales Location` · `Salesperson`, label above value.
- **Info opens sales facts and address; every other module starts with both closed.** Switching module
  applies that module's default and closes items and editors.
- **Summary cells:** title row, value, optional status line — top aligned on common baselines, left
  aligned, ▾ at the right of the title row for a fact with an editor. Each module shows only its own
  facts: Info `Total · Paid · Balance due`; Delivery `Stock · Logistics · Customer · DO`.
- **Stock:** value `{ready}/{goods}`, status `Ready` on its own line; only goods count. Service lines
  are not goods: the item list reads `Service`, never a dash.
- **Logistics:** empty value `Not assigned`.
- **Customer** (Delivery MASTER, "Customer summary cell"): before agreement `Date not confirmed`; after
  agreement the date plus only the agreed precision on one line — `31 Oct`, `31 Oct · Afternoon`,
  `31 Oct · 3:00 PM` — and status `Date confirmed`. No placeholder time, no empty row. It is the
  customer-agreed arrangement, never the Logistics ETA. Only the final customer leg is titled
  `Customer`; a warehouse leg names its actual receiver.
- **Editors:** one open at a time, inside the card; a successful save folds it and updates the summary
  at once; reopening shows what was saved; Cancel leaves the summary unchanged; a refused or failed
  save keeps the input and says why; `Cancel` then `Save` at the right. No saved-note or recorded-at
  stamp — the Timeline records who recorded it. Logistics contacts the customer; Operation may record
  Logistics' reply, and the Timeline names Operation only as the recorder.
- **DO:** read-only conditions, one per line; no manual tick, no repeated explanation.
- **Items contains goods and services only.** Info uses its separate `Info · Order details` disclosure
  for Email, Dealer, Proceed Date, statuses and related documents; it starts closed. The requested
  date stays in the shared Header. The compact goods table includes Unit price and Amount with two
  decimal places, and service Stock Status reads `Service`. The shared Register expansion is unchanged.
- **Items, Communication and Timeline start closed.** Times show without a zone suffix
  (`30 Sep · 4:08 PM`); the full instant stays in the element; a date-only source shows the date and
  `Time unavailable`.
- Communication: channel select in its header, `To`, `Subject` for Email only, Message ⋯ for Find /
  Save as / Manage templates (Escape or a press outside closes it), a 320px naming dialog, one
  attachment entry, `Copy message` and `Open WhatsApp` / `Open email`. Links open drafts only.

## What the /ui example is — and is not

It is a **UI example**. SO-1368 order facts (customer, order date, Sales Location, Salesperson,
Total/Paid/Balance due, the payment at 2026-09-30T08:08:32Z, receipt RC-300926-3735) are the verified
handoff sample. Stock `1/1 Ready` is a layout sample. Any Customer date or Logistics company saved on
/ui exists only in that browser tab: **nothing is written to the ERP**, and it is not an order fact.
`Preview: next save fails` is a /ui control that simulates a failed save. The header ↗ opens the existing Sales Order page. × closes the card.

## Real Sales Orders adoption — owner authorised 2026-10-04

The Listing Table/Cards quick view uses `SalesOrderCompactView` and this kit, rather than reference
HTML/CSS. The SO number lazily opens the Orders endpoint’s current saved-version document through
`SalesOrderCardDocument` / `PdfPreview`; ↗ opens the full order and its existing deliberate Edit gate.
The shared Drawer `compact-card` variant supplies focus containment, Escape, background scroll lock
and return focus with an accessible hidden title; visible identity and Close belong to this card.
Info and Delivery retain their defaults. Email, Dealer, Proceed Date, payment/receipt/delivery status
and related documents remain in the separate Info details disclosure; Items contains only goods and
services. Address keeps the recorded building type, Floor, Lift and stair carry facts, with named
unknowns rather than fabricated zero values. No sample dates, stock quantities or customer details become live facts.
Delivery reads the existing Monitor projection for the final receiver; goods exclude services. Missing
or failed reads stay explicit. Customer date and optional time remain separate from crew ETA.
Existing Delivery-owned `DeliveryDatesEdit` / `LogisticsDetailsEdit` forms are reused through their
governed arrangement door, including reason/evidence rules, permission checks and server refusals.
Their compact action row uses Cancel then Save; failure retains input and exposes its reason.
The compact Customer editor starts with no inferred information source and requires an actual choice;
the existing save door records contact/proxy separately from the logged-in recorder. Coverage-based
Logistics preselection remains an unsaved assignment draft, labelled `Assign logistics`; the summary
continues to show only the saved partner. Compact crew fields share a row, with ETA, condo and reply
proof retained. Its prepared message belongs in Communication, outside the assignment editor.
DO conditions are read-only and cannot issue or release a document. Timeline uses recorded events,
full instants and avatar identity without repeating names; its loading/error state stays inside its
collapsed section. Communication only prepares drafts; attachments remain explicitly preview-only. Info supplies the
Payment’s active current reminder/follow-up templates (Default first), with the existing governed
wording as the same fallback its Invoice composer uses, only when money is actually outstanding.
Delivery supplies only the saved Logistics recipient and its existing group door, active current
`ask_partner_for_date` templates from Delivery Settings (Default first), or the existing governed
Delivery details wording when no active template exists. No saved partner means no Logistics
communication door. Shared Settings versions are read here; Save as/Manage retain the kit’s existing
browser-template scope and do not write the backend template library.
This scoped adoption does not change tokens, phone navigation or Work contacts.

**Reuse and verification boundary (2026-10-04):** `CompactModuleCard` owns card content;
`Drawer` owns this Register overlay, not the Workspace Working Panel container. Modules provide
facts, editors, actions and permissions through the kit API; a new missing shared capability returns
to the shared UI owner rather than being drawn locally. The current contract is the owner-rules
2026-10-03/04 contract in this file; a production commit is recorded only after release proof.
SO ↗ continues to `/operation/orders/so/:id`. Its existing `SalesOrderWorkspace` supplies the
responsive two-pane form/document view and deliberate Edit; successful saves end editing and refresh
its source facts/revisions, while Back returns to the Register. This release does not change those
mechanics or claim that one navigation click proves the whole save/return journey. Existing full-page
contract/document tests passed (105 checks); authenticated navigation, Edit/Cancel, formal preview
and Back are verified below. A live successful save is not claimed.
Workspace Working Panel and other modules have not adopted this adapter. Their placement, recorded
contact channels, domain headers and approved full-page composition remain module-owned; customer/SO
header assumptions must not be imposed on supplier POs or source-free purchasing objects.

**Current bounded acceptance — 2026-10-04:** Orders MASTER owns the existing-path matrix. PR #1878 deployed086f23d with exact CI/deploy and independent five-surface proof; real entry verified its fact/template/context repairs and five widths. Completed SO-1362 Delivery still needs PR #1881 target proof. PR #1879 governs the subsequent header and Balance due correction. No complete-module claim follows from the card proof.

**Initial production evidence — scoped Sales Orders adoption, 2026-10-04.** PR #1871 merged as
`a9dbb6b8918e9337328eefccebe547ee1d2f4ab6`. CI `37189941545`, Deploy `37190758212` and independent five-surface
revision verification passed. Sara · Principal used the real Listing Cards entry: Info showed the
saved money; Delivery showed actual0/1 goods, Not assigned, Date not confirmed and No DO yet.
Customer form opened and Cancel preserved those facts; DO conditions remained non-interactive.
The SO number rendered the saved formal document. Info/Delivery were photographed at
1146/480/440/420/390px with no page overflow. Full-page navigation produced equal752px panes at
1800px, formal PDF remained visible through Edit/Cancel, and Back restored search1368 and Cards.
137 targeted card/Register tests and105 existing full-page checks passed before release.
No live record was changed for a save test; success/failure/Cancel are covered by tests, not claimed
as a live save. No Print/Download was invoked; physical printing remains unverified.
The compact Drawer's accessible hidden identity contains no focusable duplicate Close; its visible
card controls own initial focus and Close. The regression covers initial focus, Escape and return;
its targeted kit/dialog suite passed23 checks. Source-backed address facts name Floor, No lift/Has
lift (shared LIFT_OPTIONS) and Items needing stair carry rather than presenting bare numbers or Yes/No.
A /ui result alone still does not prove a business entry.

## Differences from the reference page (125 checks: 25 states × 5 widths)

`compact-card-states.mjs` compares geometry, text and styles and names a reason for every difference.
Strictly identical states: **0**, because three global fixes touch every state. Card height equal:
**118 of 125**. Unexplained differences: **0**.

| Kind | Checks | What differs | Height |
|---|---:|---|---|
| Global fix · governed word | 45 | Logistics empty `Not assigned` (reference prints `No logistics picked`, retired in COPY-STANDARD 2026-09-24) | same |
| Global fix · reference defect | 55 | Info values stay left aligned and keep the Paid \| Balance due divider (a leftover flex rule centres them and drops the divider) | same |
| Global fix · reference defect | 50 | Address arrow `▴` while the address is open (reference shows `▾` on first load) | same |
| Owner rule | 5 | Reopened Customer editor shows the saved answer (reference opens an empty form) | **+99px** |
| Owner rule | 5 | DO conditions one per line (reference two per line on wide cards) | **+26px** on the two widest cards |
| Owner rule | 5 | After a not-agreed result the cell keeps `Date not confirmed` (reference prints `No Answer`) | same |
| Owner rule | 10 | Service lines read `Service`, not `—` | same |
| Reference behaviour removed | Customer saves | No `Preview only · Recorded at …` note (hidden in the reference before comparing) | same |

100 checks differ only by the three global fixes; 25 differ by an owner rule.

## Open — not approved

- Palette, font family, radii and drawn glyphs are the reference's own, not `01-design-tokens.md`.
- Phone: controls stay 32px; a 40px touch version needs a module-tab-row decision (shown separately).
- The editable `To` differs from the Work panel's recorded-channels-only rule.
- The editor's red error line (`#ce2c31`, the kit red-11 value) is new to the card and awaits review.
