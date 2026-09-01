# 【DELIVERY】 — CARD 03 · Partner pickup/delivery calendars + the ONE backward calculation

**Module:** Delivery · **Sequence:** 03 (after the 2026-08-24 workspace correction and the
2026-09-01 MASTER closure) · **Lane:** BUILD — full production vertical slice.

**Authority:** `docs/delivery/MASTER.md` §5.1 (backward planning — Delivery owns the ONE
calculation) and §11 (partner pickup/delivery weekday calendars and surcharge areas are Partner
Settings facts, owner ruling 2026-09-01) · `docs/ERP-ARCHITECTURE.md` §3.6 (Delivery OWNS the
carrier's pickup/delivery calendars and the backward calculation; Warehouse and Purchasing
consume) · `docs/stock/MASTER.md` §5 (Warehouse consumes the calculated latest ready date and
never guesses it) · `docs/ACTION-FLOW-STANDARD.md` Law 2A (an action names its calendar; a
partner's own week is a partner fact, not one of the three house calendars).

**What it owns:** `delivery_partners` journey-calendar columns + governed write door ·
`packages/shared` pure backward-calculation engine · the partners API read/write extension ·
the PartnerRulesEditor extension · the computed `Latest Carres Warehouse ready date` line where
a calendar partner is assigned. **What it may not touch:** the files draft PR #999 owns
(`OperationDelivery.tsx`, `EditDelivery.tsx`, `delivery-work.ts`, `DeliveryOrderPage.tsx`,
`OperationWork.tsx`, `queries.ts` delivery hooks it edits, `delivery-arrangements.ts`) · any
Sales/Stock/Purchasing write door · the Work Engine ladder (a later slice raises the dated
Warehouse/Purchasing Work; this card computes and displays the date).

## Scope

1. **Migration `0411`** (number = max of repo tail 0410, tracker and every branch; verify the
   live applied list before apply): add to `delivery_partners` —
   `pickup_days smallint[]` (weekdays the partner collects from Carres Klang; null = not
   recorded, which stays silent), `journey_regions jsonb` (per destination region: delivery
   weekdays + transit days from pickup), `surcharge_areas text[]`. One audited SECURITY DEFINER
   door `set_partner_journey_calendar` (0283's `set_partner_delivery_rules` pattern — named
   columns, audit line, no wide UPDATE policy). Seed CONFIGURATION per the owner ruling:
   TEOW pickup [1,3,5], regions {Melaka: delivery [1,3,5], transit 0; JB: delivery [2,4,6],
   transit 1}; TT pickup [3], regions {JB: delivery weekdays as recorded, transit 1},
   surcharge_areas ['Pontian','Kota Tinggi','Kulai Tesco','Sedenak']. Seeds are partner
   configuration (survives clean start), not transaction data.
2. **Shared engine** `packages/shared/src/partner-journey.ts` — pure, no clock/IO:
   `latestWarehouseReadyDate({customerDateIso, region, calendar, holidays})` returning the
   chain `{deliveryDay, pickupDay, warehouseReadyBy}` or a named absence
   (`no_calendar` · `no_delivery_day_by_date` · `no_pickup_day`); walks back through the
   partner's own delivery weekdays, then its pickup weekdays minus transit. Absence stays
   silent — a partner with no calendar produces no chain and no guess.
3. **API** — extend `GET /api/operation/partners` and add
   `PUT /:id/journey-calendar` (same guard, zod input, whole-profile write, 422 words an
   operator can act on).
4. **UI** — in `AssignLogisticsDialog` (not a #999 file), when the chosen partner has a
   calendar and the scope has a customer/confirmed date, show the read-only computed line:
   `{partner} picks up from KL on {weekday, date} — Latest Carres Warehouse ready date:
   {weekday, date}`, plus the surcharge-areas fact — never Today/Tomorrow, never a block,
   silence when facts are missing. **Scope adjustment (build decision, recorded):** the
   calendar EDITOR (pickup-day picker, per-region rows) belongs to the Delivery Settings
   surface card, not to the 0283 booking-warning panel inside the Sales Order drawer — that
   panel's response contract does not carry the journey calendar, and widening the Orders
   booking route for a Delivery Settings fact would cross the module seam. Until that card,
   the governed data lives in 0411's seeds and the audited API door.
5. **Tests** — engine table tests (TEOW Melaka same-week, TEOW JB cross-day, TT Wednesday-only,
   holiday collision, absence silence), API contract tests (auth, validation, audit write),
   editor + dialog UI tests. Negative controls: non-operation role 403; no wide-column UPDATE
   possible through the door.

## Acceptance

- Assigning TEOW to a Melaka scope with a confirmed Friday date shows the computed
  Warehouse-ready line for that Friday pickup; TT on a JB scope computes from Wednesday pickup;
  a partner with no calendar shows nothing.
- No file owned by draft PR #999 is modified. No second quantity/status/duty truth is written.
- CI green · merged · deployed · authenticated production verification of the partners door and
  one computed line · this card and `docs/delivery/MASTER.md` §16 updated with the closure SHA.
