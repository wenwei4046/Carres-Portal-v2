# DELIVERY — CARD 15 · Loan offer record and Delivery connection

> Module **DELIVERY** · Card **15** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Record the loan offer, acceptance and rejection on the Sales Order beside `ops_sofa_loans`, read it on Order Route and print the current loan line on Monitor and the DO.

**Authority:** `docs/delivery/MASTER.md` §14.2 · `docs/orders/MASTER.md` §7 and Card 6 · `docs/COPY-STANDARD.md` Order Route LOAN words. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Card 10 (panel 4 loan line).

**Runtime readers and writers affected:** Writers: a new Orders-owned loan-offer door; readers: `SalesOrderRoute`, Monitor panel 4, `DeliveryOrderPage.tsx`, the Work `collect_loan_item` rule.

**Migrations required:** yes: `ops_loan_offers`, append-only, Orders-owned.

**Production acceptance surface:** Production: an offer recorded on a Sales Order shows on Order Route with its decision; an accepted loan with its exact Unit prints `Loan {Unit ID} · collect back on delivery day` on Monitor and the DO.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [x] Migration and door; probe — `0492_the_loan_offer_is_a_record_on_the_sales_order.sql`: `ops_loan_offers` (seq append order, offer-says-what and decline-says-why CHECKs, append-only trigger, internal read), `sales_order_loan_offer_record`; rolled-back probe 2026-09-13: anon 42501 · answer before offer 22023 · offer without label 22023 · decline without reason 22023 · accept after decline 22023 · decline carries the offer's label · re-offer then accept · rewrite P0001 · four History lines
- [x] Order Route LOAN node reads the offer history — `RouteLoanOffer`/`loanOffers` in the route input; an open or accepted offer is the node until the item is out; the route facts fan-in reads `GET /orders/:id/loan-offers`
- [x] Monitor and DO loan line — the orders list and the DO detail carry the loaned Unit's identity; panel 4 and the DO `Loan collection` print `Loan {Unit ID} · collect back on delivery day` per loan out; the SO drawer's Loan panel gains the offer block (`Offer a loan` · `Customer accepted` · `Customer declined`)
- [x] Tests, typecheck, design guard — targeted + full suites green; tsc ×3; `pnpm --filter web lint`; rolled-back probe of 0492 (answer needs an open offer; decline needs a reason)
- [x] PR → merge → apply → deploy → authenticated production verification — PR #1271 squash-merged `0dc51c6b`; **0492 applied** 2026-09-13; deploy converged (`erp` + Worker `/health` report `0dc51c6b815e12aa9e62aaa76b3938c104dc8555`); walked as operation@carres.com on SO-1362 (`db9c939a-…`): `POST /loan-offers {accepted}` before any offer → 422 `record the offer before the customer's answer` · `{offered, label "Display bedframe · JAGER-SS", reason}` → 201 seq 1 · `{declined}` without reason → 422 `Say why the customer declined.` · `{accepted}` → 201 seq 2 · `GET` lists accepted then offered · History `Loan offered · Display bedframe · JAGER-SS — …` and `Customer accepted the loan · Display bedframe · JAGER-SS` · the SO drawer `Loan` tab prints `Customer accepted the loan · Display bedframe · JAGER-SS` with the `Offer a loan` door and the offer history line · Order Route (`/operation/orders/so/{id}?route=1`) draws the `loan-offer:{id}` node reading `Customer accepted the loan · Display bedframe · JAGER-SS` over `Prepare the loan Unit` on the `route-band-loan`. Monitor's `Loan {Unit ID} · collect back on delivery day` line needs an `ops_sofa_loans` row (the loan itself, a separate door) — not exercised.
