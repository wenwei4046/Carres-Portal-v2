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

- **One shared customer header:** name · order · phone; a ▾/▴ at the lower right of the customer cell
  opens the sales facts (no `Order info` words); address with its own toggle (▴ while open); target
  date; Open and Close. The header grows with a long name; nothing overlaps.
- **Sales facts:** `Order date` · `Sales Location` · `Salesperson`, label above value.
- **Info opens sales facts and address; every other module starts with both closed.** Switching module
  applies that module's default and closes items and editors.
- **Summary cells:** title row, value, optional status line — top aligned on common baselines, left
  aligned, ▾ at the right of the title row for a fact with an editor. Each module shows only its own
  facts: Info `Total · Paid · Outstanding`; Delivery `Stock · Logistics · Customer · DO`.
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
- **Items, Communication and Timeline start closed.** Times show without a zone suffix
  (`30 Sep · 4:08 PM`); the full instant stays in the element; a date-only source shows the date and
  `Time unavailable`.
- Communication: channel select in its header, `To`, `Subject` for Email only, Message ⋯ for Find /
  Save as / Manage templates (Escape or a press outside closes it), a 320px naming dialog, one
  attachment entry, `Copy message` and `Open WhatsApp` / `Open email`. Links open drafts only.

## What the /ui example is — and is not

It is a **UI example**. SO-1368 order facts (customer, order date, Sales Location, Salesperson,
Total/Paid/Outstanding, the payment at 2026-09-30T08:08:32Z, receipt RC-300926-3735) are the verified
handoff sample. Stock `1/1 Ready` is a layout sample. Any Customer date or Logistics company saved on
/ui exists only in that browser tab: **nothing is written to the ERP**, and it is not an order fact.
`Preview: next save fails` is a /ui control that simulates a failed save. The header ↗ opens the existing Sales Order page. × closes the card.

## Real Sales Orders adoption — owner authorised 2026-10-04

The Listing Table/Cards quick view uses `SalesOrderCompactView` and this kit, rather than reference
HTML/CSS. The SO number lazily opens the Orders endpoint’s current saved-version document through
`SalesOrderCardDocument` / `PdfPreview`; ↗ opens the full order and its existing deliberate Edit gate.
The shared Drawer `compact-card` variant supplies focus containment, Escape, background scroll lock
and return focus with an accessible hidden title; visible identity and Close belong to this card.
Info and Delivery retain their defaults. Email, Dealer, Proceed Date, payment/receipt/delivery status,
Items and related documents remain reachable in the collapsed module content. Address keeps Floor,
Lift and stair carry facts. No sample dates, stock quantities or customer details become live facts.
Delivery reads the existing Monitor projection for the final receiver; goods exclude services. Missing
or failed reads stay explicit. Customer date and optional time remain separate from crew ETA.
Existing Delivery-owned `DeliveryDatesEdit` / `LogisticsDetailsEdit` forms are reused through their
governed arrangement door, including reason/evidence rules, permission checks and server refusals.
Their compact action row uses Cancel then Save; failure retains input and exposes its reason.
DO conditions are read-only and cannot issue or release a document. Timeline uses recorded events,
full instants and avatar identity without repeating names; its loading/error state stays inside its
collapsed section. Communication only prepares drafts; attachments remain explicitly preview-only.
This scoped adoption does not change tokens, phone navigation or Work contacts.

Delivery status: implemented on the isolated BUILD branch; release and authenticated verification
remain pending. A /ui result does not prove this business entry.

## Differences from the reference page (125 checks: 25 states × 5 widths)

`compact-card-states.mjs` compares geometry, text and styles and names a reason for every difference.
Strictly identical states: **0**, because three global fixes touch every state. Card height equal:
**118 of 125**. Unexplained differences: **0**.

| Kind | Checks | What differs | Height |
|---|---:|---|---|
| Global fix · governed word | 45 | Logistics empty `Not assigned` (reference prints `No logistics picked`, retired in COPY-STANDARD 2026-09-24) | same |
| Global fix · reference defect | 55 | Info values stay left aligned and keep the Paid \| Outstanding divider (a leftover flex rule centres them and drops the divider) | same |
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
