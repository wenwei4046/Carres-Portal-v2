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

- [x] Migrations and doors; rolled-back production probe with negative controls — `0489_proof_is_reviewed_and_every_attempt_keeps_its_evidence.sql`: `delivery_attempt_evidence`, `delivery_proof_reviews` (append-only triggers, reason CHECK), `delivery_attempt_evidence_record`, `delivery_proof_review`, `delivery_signed_do_attach`; probe 2026-09-13: three anon doors refused 42501 · blank reason 23514 · review rewrite/delete P0001 · evidence duplicate 23505 · bad kind 23514 · evidence delete P0001, all rolled back
- [x] Evidence section on the DO object with the three review acts — `DeliveryEvidencePanel.tsx` (per-attempt files, driver submission uploader reused, signed paper, review state/history, `Proof Accepted` saves at once, the other two require a reason); the `Delivered` pill is amber until accepted
- [x] `Check delivery proof` queue on Monitor and the register; status second line — `proofReviewStateOf`/`latestEvidenceAtOf` (shared), `proofReviewOf` (register), Monitor view `check_proof`, row action, `Delivered` orange until `Proof Accepted`, `Proof Rejected · {reason}` second line; Work rule `check_delivery_proof` for Delivery Duty and the reopened upload
- [x] Signed-DO attach door on delivered and partially delivered orders — `POST /delivery-orders/:id/signed-document` → `delivery_signed_do_attach` (no status, no stock); the register's `Upload signed Delivery Order` queue now opens the DO object
- [x] Tests, typecheck, design guard — shared 6 new + ladder/engine/words cases; api 9 new; web register/Monitor/DO page cases; tsc ×3 clean; lint stage-1
- [ ] PR → merge → apply → deploy → authenticated production verification
