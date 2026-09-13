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
- [x] PR → merge → apply → deploy → authenticated production verification — PR #1266, merged `4aed29dc`, 0489 applied through `apply_migration` after the merge (tracker `20260913082417`), Pages + Worker `4aed29dc` (deploy probe 2026-09-13 08:4x UTC). A sibling Payment merge (#1267) carried a second `0489`; both halves are applied and the pair is baselined in `scripts/check-migrations.mjs` (PR #1268) — red line 6 keeps both files as committed. Authenticated walk as operation@carres.com: the DO object `DO-180826-3035` renders the `Evidence` section (`An uploaded file records what the driver sent…`, `No delivery result recorded yet — evidence binds to the delivery it proves.`, `SIGNED DELIVERY ORDER · No signed document yet`) in place of the two pre-ruling panels; the register read `GET /delivery-orders` carries `proofReviews` and `attemptEvidence`, the document read carries them with the reviewer's name; the Delivery Orders register rail reads `Record delivery result 1 · Upload delivery photo 0 · Upload signed Delivery Order 0 · Check delivery proof 0` with `?work=check_proof` narrowing to `0 of 2 delivery orders`; Monitor's rail reads its seventh row `Check delivery proof 0` (active on `?view=check_proof`, `No matching deliveries.`). The review door: `POST /proof-review {decision: more_required}` without a reason → 422 `Say why more proof is needed, or why it is rejected.`; with a reason → 201; `{decision: accepted}` → 201. Re-read from the database: `delivery_proof_reviews` rows `15a888e9-…` (`more_required`, the reason, reviewed_by the operation account, 08:46:14 UTC) and `723faf83-…` (`accepted`, no reason, 08:46:14 UTC), both append-only; `order_history` lines `DO-180826-3035 · More Proof Required — Production verification 2026-09-13 — no delivery photo on file` and `DO-180826-3035 · Proof Accepted` by `operation`. Production holds no delivered attempt yet (both live documents are `Out for delivery`), so the green-only-when-accepted pill and the reopened upload were proven by the suites, not walked; the review records themselves are on a test document and stay as history.
