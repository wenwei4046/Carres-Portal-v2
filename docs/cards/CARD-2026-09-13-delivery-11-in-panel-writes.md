# DELIVERY — CARD 11 · In-panel arrangement writes and retirement of Edit Delivery

> Module **DELIVERY** · Card **11** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Move every Delivery arrangement write into the expanded panels' edit states (`Update date and time`, `Assign logistics` / `Change logistics`, driver and vehicle, condo registration, chase message, `Cannot Deliver` on behalf), record the customer contact with WhatsApp proof, and retire the Edit Delivery page.

**Authority:** `docs/delivery/MASTER.md` §5.1, §8.6, §8.8 · `docs/ui/MASTER.md` §4.1 · `docs/COPY-STANDARD.md` Delivery Dates edit-state words · `docs/payment/MASTER.md` §6 (written request) · `docs/orders/MASTER.md` cross-module date contract. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Card 10.

**Runtime readers and writers affected:** Writers: `PUT /api/operation/delivery-arrangements/:orderId` and `/assign`, the reply-proof sign-upload, a new customer-contact door; readers `EditDelivery.tsx` (retired), `OperationDelivery.tsx` panels. Routes `/operation/delivery/edit/:orderId` redirect to the Monitor row.

**Migrations required:** one: the customer contact record (`ops_delivery_contacts`, append-only, purpose · channel · person · time · result · evidence · recorder · proxy) through the governed apply path.

**Production acceptance surface:** Production Monitor: expand a row, `Update date and time`, save a confirmed day and window and remain on the row; a later date refuses to save without the reply proof; `Assign logistics` from the panel; the retired Edit Delivery URL lands on the Monitor row; the arrangement and contact rows re-read from the database.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [ ] Contact record migration and its one door; probe in a rolled-back production transaction
- [ ] Delivery Dates edit state on the panel right slot; Save names its gap; the later-date rule
- [ ] Logistics Details edit state: partner, reason, fleet templates, condo registration, chase message, reply proof, `Cannot Deliver` on behalf
- [ ] Retire `EditDelivery.tsx` and redirect its route; keep the DO preview on the DO object
- [ ] Tests: edit states, refusals, permissions, proxy provenance, keyboard and focus; typecheck; design guard
- [ ] PR → merge → apply migration → deploy → authenticated production verification with a safe representative write and database re-read
