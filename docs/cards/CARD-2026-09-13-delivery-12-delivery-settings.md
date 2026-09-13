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

- [x] Settings group, rail rows and one `Save changes` per page on the Warehouse Settings grammar
- [x] Partner object sections and their doors; fleet templates; coverage informs, never hides
- [x] Delivery Rules and Message Templates on the Payment library grammar; Access links to Staff & Duties
- [x] Retire `PartnerRulesEditor` in the Orders drawer
- [x] Tests, typecheck, design guard; migration probe
- [x] PR → merge → apply migrations → deploy → authenticated production verification — PR #1265, merged `b8dab48d`, 0488 applied through `apply_migration` after the merge (ledger version 20260913072729), Pages + Worker `b8dab48d` (deploy probe 2026-09-13 07:42 UTC). Authenticated walk as operation@carres.com: `Settings → Delivery` renders the `DELIVERY` group (`Logistics Partners` · `Delivery Rules` · `Message Templates` · `Access`) beside the Warehouse group; `Logistics Partners` lists the twelve partners with `Customer-facing number · Not configured` and `Active`, each a door to its partner object; the read-only banner reads `You can read Delivery Settings. Changing them is the manager's.` because the operation account holds no `ops_manager` duty. The one read `GET /operation/delivery-settings` answered 200 with partners (12, each carrying the 0488 facts `customer_phone`, `coverage`, `kv_default`, `cutoff_time`, `handover_points`, `services`, `customer_contact_by`, `record_on_behalf_allowed`, `proof_rules`), drivers, vehicles, templates, changes, partnerAccounts and `canEdit`; a `PUT /partner/details` from the same account was refused 403 `forbidden` — the manager gate holds, so the representative write is the manager's walk (owner action: a principal or `ops_manager` login). Re-read from the database: NETS `active true · kv_default false · customer_contact_by partner · record_on_behalf_allowed true · customer_phone null`; `partner_fleet.active` present; `partner_drivers` 0, `delivery_setting_changes` 0, `delivery_message_templates` 0 (nothing configured yet, none invented).
