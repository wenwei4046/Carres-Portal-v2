# DELIVERY — CARD 18 · Sales Orders required delivery-facts gate

> Module **DELIVERY** · Card **18** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Make delivery address, state, building type, floor, lift, access and the requested delivery information required Sales Portal facts of a valid new order, at the wizard and at every create door, so Monitor's `Order details incomplete` line applies only to legacy rows.

**Authority:** `docs/orders/MASTER.md` §7 (the required Sales facts ruling) and the Sales Portal entry gate · `docs/delivery/MASTER.md` §8.3 · `docs/COPY-STANDARD.md` Sales Order entry-gate words. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** none (Sales Orders' build; named here because Monitor depends on it).

**Runtime readers and writers affected:** Writers: `createOrderInputSchema`, the POS wizard steps, the office create door; readers: Monitor's problem line.

**Migrations required:** none expected; the schema refuses at entry.

**Production acceptance surface:** Production POS refuses a new order missing any required delivery fact with the governed refusal; a complete order reaches Monitor with no `Order details incomplete` line.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [x] Schema and wizard refusals with the governed words — `DELIVERY_FACT_REFUSALS` (shared `sales-order-form.ts`); `createOrderInputSchema` refuses a missing address (the `addressUnknown` escape), state and building type; the wizard's `step1FirstIssue` drops the `or tick 'Unknown'` branch and `CustomerStep` no longer offers `Fill in address later`; stale drafts reload with the tick off
- [x] Office create door parity — `rawCreateOrderInputSchema` refuses the same six facts with the same words; `PrincipalNewOrder` drops the `Fill in address later` tick, adds `Building type *` (rides `entry_data.fields.building_type`), requires the delivery date, and prints the first missing fact under the form (`raw-first-issue`) before the round trip
- [x] Tests, typecheck — shared `orders.entry-gate.test.ts`; api `orders-raw.test.ts` refusal cases + fixture; web draft/CustomerStep/PrincipalNewOrder tests updated; tsc ×3
- [x] PR → merge → deploy → authenticated production verification — PR #1273 squash-merged `4e944e51`; deploy converged (`erp` + Worker `/health` report `4e944e51c6c8682f65aec28c3a1d8c67158210f3`); walked as operation@carres.com against the office door `POST /api/orders/raw`: no building type → 400 `Building type — pick the building the goods go to` · `addressUnknown: true` → 400 `Delivery address — ask the customer for the address before you save the order` · no State → 400 `Delivery address — pick the State` · no date → 400 `Delivery date is required. Ask the customer for the date before you save the order.` · no lift answer → 400 `Lift — say whether the building has a lift`. A complete body (SO-1362, earlier the same day, pre-gate) created and reached Monitor with no `Order details incomplete` line. **Owner action:** the office form (`/principal?tab=new-order`, principal-only) and the dealer POS wizard are not reachable by operation@ — a principal/dealer walk of the `Building type *` field, the retired `Fill in address later` tick and the `raw-first-issue` line is owed.


## Supplemental authenticated form proof · 2026-09-13 23:29–23:34 MYT

On production SHA `f2fb3efeb89c395dd9f7ee96cdc49d60e6e103ff` (all five deploy surfaces verified), principal opened `/principal?tab=new-order`. `Building type *` was present; `Fill in address later` absent. An unsaved labeled test draft (Carres Kelana Jaya, customer `DELIVERY ACCEPTANCE UNSAVED CARD18`, free-text test line) kept Create order disabled and displayed the governed address refusal. With address, Selangor / Klang / 41000 completed, the refusal changed to `Building type — pick the building the goods go to`; selecting Landed changed it to the governed missing-date refusal. No order was submitted and no production Sales Order was created. This proves the office form’s missing-fact display; it does not claim a completed-order submission.

Dealer boundary: `dealer-test@x.com` authenticated successfully at `pos.carresofficial.com` with role dealer and dealer ID `00000000-0000-0000-0000-000000000d01`, but `/dealer` stopped at `First-time setup · 1 of 3 / Set up staff sign-in`, before the POS wizard. The other documented demo identity `dealer@carres.com` refused its recorded login. No PIN or store-security configuration was created or reset. Outstanding: an existing test staff login that has completed PIN setup is required for the dealer wizard walk. User input requested while other convergence work continues.

At 00:44 MYT on `9dd3945b`, principal resumed the existing unsaved test draft and completed the native delivery date (`2026-10-02`) using a real keyboard change. With the existing complete Selangor/Klang/41000 address and Landed type, the required-fact refusal disappeared and Create order became enabled. No order submitted and no payment recorded; this proves the positive form state, not a new post-gate order creation.
