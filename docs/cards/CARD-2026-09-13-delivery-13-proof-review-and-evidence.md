# DELIVERY — CARD 13 · Proof review and per-attempt evidence

> Module **DELIVERY** · Card **13** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Add the proof-review record (`Proof Accepted` · `More Proof Required` · `Proof Rejected` with reasons), per-attempt evidence, the `Check delivery proof` queues, and the signed-DO attach door for a delivered or partially delivered order.

**Authority:** `docs/delivery/MASTER.md` §6, §6.1, §8.2, §8.7, §9 · `docs/COPY-STANDARD.md` Delivery Order document words · `docs/ui/MASTER.md` §3 viewer width. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Card 08 (owner), Card 09 (status second line).

**Runtime readers and writers affected:** Writers: new review and evidence doors, the signed-DO attach door; readers: `missingDeliveryProofOf`, `driverSubmissionOf`, `DeliveryOrderPage.tsx`, `DeliveryOrdersRegister.tsx`, Monitor `Upload delivery proof`.

**Migrations required:** yes: `delivery_proof_reviews` and `delivery_attempt_evidence`, append-only, through the governed apply path.

**Production acceptance surface:** Production DO object: review a delivered order's proof; `Delivered` turns green on Monitor only after `Proof Accepted`; a rejection reopens `Upload delivery proof` with the reason; the signed DO attaches on a partially delivered order.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [ ] Migrations and doors; rolled-back production probe with negative controls
- [ ] Evidence section on the DO object with the three review acts
- [ ] `Check delivery proof` queue on Monitor and the register; status second line
- [ ] Signed-DO attach door on delivered and partially delivered orders
- [ ] Tests, typecheck, design guard
- [ ] PR → merge → apply → deploy → authenticated production verification
