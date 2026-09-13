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

- [ ] Migration and door; probe
- [ ] Order Route LOAN node reads the offer history
- [ ] Monitor and DO loan line
- [ ] Tests, typecheck, design guard
- [ ] PR → merge → apply → deploy → authenticated production verification
