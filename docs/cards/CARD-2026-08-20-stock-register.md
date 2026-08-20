STATUS: QUEUED — DEPENDS ON WAREHOUSE UNIT AUTHORITY FOUNDATION
DATE: 2026-08-20
PR: pending
IMPLEMENTATION: APPROVED — Warehouse Blueprint persisted in docs/stock/MASTER.md
and owner instructed 2026-08-20 to open the first two build Cards.

# STOCK REGISTER — REPLACE ON HAND WITH THE APPROVED MASTER LIST

**SCOPE — after the Unit Authority Foundation is production-verified, replace the legacy On hand
surface with the approved Stock Register and left filter rail. NOTHING ELSE.**

Read latest main: CLAUDE.md, docs/ERP-ARCHITECTURE.md §2.1 and §3.5,
docs/stock/MASTER.md, docs/ui/MASTER.md, docs/COPY-STANDARD.md, design tokens,
components and page patterns. Measure the shipped Warehouse rail and current Stock page before
editing. Reuse the approved Shell, Register and Object Detail grammar.

This Card does not rebuild the already-shipped Warehouse sidebar, build Ready stock, Transfers,
Counts, month-end, partner integrations or heavy WMS. It consumes Card 1's authority and never
creates another inventory calculation.

## 1 · Destination and purpose

The Warehouse child destination is **Stock**, not On hand or Stock Units.

It is the one current listing for every controlled Unit:

- Available;
- Reserved / sold;
- Incoming;
- In transit;
- showroom/outlet;
- waiting inspection;
- repair;
- supplier collection and other active control.

Delivered and ended Units are accessible through Delivered / history and exact-ID search, not mixed
into the default current view.

## 2 · Register template

Default information hierarchy:

- Carres Unit ID and Catalog product identity;
- Where;
- Who has it;
- Ownership;
- Availability;
- Condition;
- one Current attention item when action is genuinely open.

Do not repeat Unit, SO, customer or owner names inside the action sentence when their identity
already belongs to the row/object metadata. Owner renders as structured avatar metadata. No
generic status, Edit, Delete or row-level stock total editor.

Opening a row goes to the Unit Object surface governed by the Object Detail Template. The title is
the Unit ID and product; it shows current facts, reservation/source links, evidence, In & out,
issues and history. Only fact-permitted actions appear.

## 3 · Left filter rail

Retain the left rail for fast daily, weekly and monthly use. It filters the same Unit authority:

- All stock;
- Attention: waiting inspection, cannot find, Unit ID issue, Site differs, damaged, components
  missing, returned not checked, evidence incomplete, not recently verified;
- Availability: Available, Reserved / sold, Incoming, In transit, Not available;
- Site / Where;
- Ownership: Carres Owned, Supplier Consignment;
- Catalog category, including an honest Not in catalog bucket when Catalog was actually queried;
- Changed: Today, This week, This month.

One selection applies within a section unless the existing approved rail component explicitly
supports multi-select. Choices across sections combine. All stock clears every filter.

Changed means at least one Warehouse physical event in the chosen period, not viewed, edited copy,
financial note or another module's unrelated update. Today / This week / This month are filters
only; every displayed Work date remains an actual weekday/date.

## 4 · Search, date and wording

- Search by Unit ID, product/SKU, source PO/Consignment, Sales Order and supplier reference when
  the authoritative join exists.
- Current-year dates render like Tue, 18 Aug.
- Non-current-year dates render like Fri, 1 Jan 2027.
- Time renders like Tue, 18 Aug · 10:42 AM.
- Formal standalone exports and audit evidence show the year.
- Inventory, Movements, Custody, Hold and Quarantine are not operator-facing Stock words.

## 5 · Work integration

The Register may show one compact current action derived by the shared Work Engine. It may not
author a duplicate action or manual task.

Example structure:

- first line: observed fact, such as Unit cannot be found;
- second line: owner avatar metadata plus concrete action;
- full Trigger, Checklist, Completion, Due, source and cover remain in Work / Unit Detail.

Vague Review, Handle, Follow up, Priority, Next Action and generic Mark done are forbidden.

## 6 · Verification

Tests and production verification must prove:

- the sidebar row and page destination say Stock;
- all current Unit states are views of one register, not separate stores;
- every quantity and filter count derives from Card 1's Unit authority;
- rail sections, cross-section filtering, clear-all and URL/deep-link behaviour work;
- Changed time scopes use physical events only;
- current/non-current year formatting follows the approved grammar;
- keyboard, responsive and empty/loading/error behaviour follow the shared templates;
- no dead controls, duplicate page title, generic editor or second reservation door;
- exact Unit search opens the correct Unit Object;
- the old On hand wording is absent from the operator surface.

## Acceptance boundary

Stock is the production Warehouse master list, backed only by the exact-Unit authority. The old
On hand surface no longer defines wording or availability. The implementing PR updates
docs/stock/MASTER.md and UI authority with measured BUILT / VERIFIED evidence and completes CI,
merge, deployment and production SHA verification.
