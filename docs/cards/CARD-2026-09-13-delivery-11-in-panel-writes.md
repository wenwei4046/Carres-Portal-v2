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

- [x] Contact record migration and its one door; probe in a rolled-back production transaction
- [x] Delivery Dates edit state on the panel right slot; Save names its gap; the later-date rule
- [x] Logistics Details edit state: partner, reason, fleet templates, condo registration, chase message, reply proof, `Cannot Deliver` on behalf
- [x] Retire `EditDelivery.tsx` and redirect its route; keep the DO preview on the DO object
- [x] Tests: edit states, refusals, permissions, proxy provenance, keyboard and focus; typecheck; design guard — `DeliveryBrief.test.tsx`, `delivery-arrangements.test.ts`, `delivery-contact.test.ts`; full suites green before PR #1264; tsc ×3 clean; design guard header on `DeliveryBrief.tsx`
- [x] PR → merge → apply migration → deploy → authenticated production verification with a safe representative write and database re-read — PR #1264, merged `0a2697f7`, Pages + Worker `0a2697f7` (deploy probe 2026-09-13 07:05 UTC); 0487 applied. Authenticated walk as operation@carres.com on production Monitor (`?tab=delivery&view=all`, 89 deliveries, no `Edit Delivery` word on the page): expanded SO-1358 (order `0897d1bc-…`) → four panels; `Update date and time` → edit state (date, window, `Information received from`, `WhatsApp proof`); saved Wed, 30 Sep · Morning (9am–12pm) → toast `Delivery confirmed Wed, 30 Sep · Morning (9am–12pm)`, the row stayed expanded in the same queue and read `Confirmed for Wed, 30 Sep`; re-opened and picked Tue, 3 Nov (later than the requested Sat, 31 Oct) → the save button disabled and read `Save confirmed delivery — upload the WhatsApp reply`, the edit state stayed open; `Assign logistics` → edit state with the twelve partners, picked NETS → toast `NETS assigned`, the panel read `Logistics Partner NETS` and the act became `Change logistics`; the retired `/operation/delivery/edit/0897d1bc-…` landed on `/operation?tab=delivery&view=all&open=0897d1bc-…` with the brief unfolded. Re-read from the database: `ops_delivery_arrangements` row `79d211f2-…` (leg 0, partner `c7afcb60-…`, confirmed_date 2026-09-30, confirmed_time `Morning (9am–12pm)`, reply_proof_path null, updated_by the operation account) and `ops_delivery_contacts` row `cac080e6-…` (purpose `confirm_delivery_date`, channel `call`, contacted_person `customer`, result `confirmed`, recorded by the same account).
