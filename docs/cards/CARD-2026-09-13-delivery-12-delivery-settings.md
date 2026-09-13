# DELIVERY — CARD 12 · Delivery Settings

> Module **DELIVERY** · Card **12** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Build the `Delivery` group in the Settings Workspace: Logistics Partners (details, coverage, schedule, warehouses and handover points, drivers, vehicles, services and charges, Portal access), Delivery Rules, Message Templates and Access, and retire the Orders drawer partner-rules editor.

**Authority:** `docs/delivery/MASTER.md` §11, §5.3 · `docs/ui/MASTER.md` Settings Workspace rail and `Save changes` laws · `docs/stock/MASTER.md` §11 (Warehouse Settings grammar) · `docs/payment/MASTER.md` §12 (template library grammar) · `docs/orders/MASTER.md` D5. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Card 08 (Access links to Staff & Duties).

**Runtime readers and writers affected:** Writers: the existing partner-rules and pickup-week doors (0283, 0411), `partner_fleet`, new coverage and template doors; readers: `SettingsWorkspace.tsx`, `OrderDetailDrawer.tsx` (`PartnerRulesEditor` retired), Monitor assignment, the backward calculation.

**Migrations required:** yes: partner coverage (states, cities, postcodes, exclusions, default flag), cut-off, handover points, services and charges, Portal roles; template library for Delivery messages.

**Production acceptance surface:** Production `Settings → Delivery` renders every section with `Not configured` where unrecorded; a manager saves a partner's customer-facing number and schedule and the Monitor assignment door pre-selects NETS for Klang Valley from the flag; Payment reads the partner number from the record.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [ ] Settings group, rail rows and one `Save changes` per page on the Warehouse Settings grammar
- [ ] Partner object sections and their doors; fleet templates; coverage informs, never hides
- [ ] Delivery Rules and Message Templates on the Payment library grammar; Access links to Staff & Duties
- [ ] Retire `PartnerRulesEditor` in the Orders drawer
- [ ] Tests, typecheck, design guard; migration probe
- [ ] PR → merge → apply migrations → deploy → authenticated production verification
