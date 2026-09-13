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
- [ ] PR → merge → deploy → authenticated production verification
