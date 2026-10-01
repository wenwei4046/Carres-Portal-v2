# SALES ORDERS — CARD 14 · Staff amendments and exception approval

Module: Sales Orders · Sequence: 14 · Lane: scoped BUILD
Status: IMPLEMENTED FOR REVIEW — local verification complete; no production deployment or live assignment authorised.
Authority: Jess's scoped BUILD commission; documentation PR #1826, head
`9153f309f`; Orders MASTER § Staff amendments and
Sales Approver and Requested Delivery Date changes. The complete Blueprint approval is not a full-module BUILD commission. Documentation PR remains OPEN.

## Acceptance boundary

One amendment, one effective outcome; reuse existing evidence, immutable revisions,
classification, shared duties, Work/activity and money ownership. Ordinary changes
apply with evidence, with supplier feasibility first for changed lines covered by
issued POs. Price decreases require the assigned active Principal Sales Approver.
Operation helpers retain actual actor and notify the PIC. Earlier customer dates
require ready warehouse goods; later dates retain evidence/storage rules. Logistics'
early arrangement requires customer WhatsApp evidence and preserves the SO date.

No live writes, main merge or deployment. No new fee/service, attribution, address,
refund or post-Proceed cancellation consequence rules. The latest approved Sales
Approver self-decision is included; system-priced delivery-charge recalculation
remains an approved target outside this scoped implementation.

## Measured capability map

| Capability | Current evidence | Work |
|---|---|---|
| Complete proposal, evidence hash, atomic apply, revision/history | 0564, orders changes route | KEEP; remove universal Principal gate only for authorised ordinary scope |
| Staff submission | 0500 submit function admits Operation/Principal | KEEP; no PIC gate |
| Duty selection/cover/qualification | shared catalogue, workspace_duty_holder_roles, workspace_resolve_duty | COPY REQUIRED: admit Sales Approver without bootstrap |
| Supplier line coverage | po_line_sources + exact reserved Units | ADAPT; no whole-order PO gate |
| PIC notification | shared ops_activity_log; global activity reader | GAP: prove addressed visibility, not merely a history insert |
| Whole-SO cancellation after Proceed | 0350 place-only refusal; Orders MASTER cancellation closure | Preserve refusal pending complete consequence law |
| Refund | Payment MASTER §13 exceptional Service/Finance path | Preserve owning execution; do not create routine refund UI |

## Release review — corrected scoped candidate; delivery still requires authorization

Review commission: inspect and fix the commissioned slice, with no main merge,
deployment, live Duty assignment or production transaction. Full Blueprint approval
in PLAN PR #1826 is not a new BUILD commission. No new kit component is needed.

### Corrections completed

- The detail response carries the exact unedited header/line/service payload. The
  page freezes it with the draft, including across background refetches. The API
  classifies that baseline; 0632 compares it with current truth under Order → exact
  source-line → service-row locks before any write. Old clients without a baseline
  are refused. The unguarded new automatic-submit RPC is internal-only.
- Replacing an out-of-date request and submitting its replacement are one
  transaction. An invalid agreement or failed application preserves the old request.
- Amendment decisions, supplier answers and customer evidence take the Order before
  the request row. Decisions lock source lines before re-reading feasibility; earlier
  date checks take Unit locks afterwards. This matches Purchasing's order/source
  locking direction and does not redefine coverage or rewrite a PO.
- A missing PIC uses the existing shared Delivery Duty resolver. An unassigned Duty
  produces an explicit unassigned activity fact, never a fictitious recipient.
  The PIC and actual actor remain separate; no assignment is bootstrapped.
- Issued-file capture reads the current sheet, then verifies that its latest revision
  is still the revision being captured. A newer or unverifiable revision produces
  the existing labelled reconstruction instead of a wrongly attributed original.
  Capture failures now show the approved reconstruction wording. They do not undo
  effective business truth. No durable retry/server document service is claimed.

- Stair fees now reuse the existing governed calculator before review and commit.
  The database validates the same inputs and pinned/current rate under source locks,
  then calls the existing stair-fee writer inside the goods/header transaction before
  minting the immutable revision. Fee impact and the review dialog use that same
  quoted result. The staff amendment routes no longer restamp after commit. A moved
  rate/input requires review again; no tariff, pinning or approval policy is changed.

### Measured release boundary

| Operation | Finding / release boundary |
|---|---|
| Ordinary evidenced amendment with unchanged fees | Atomic effect, actual actor and revision pass locally; candidate capability only, not an isolated production feature switch |
| Mixed goods/configuration, lower unit price and later date | All remain unchanged until supplier date/evidence and assigned Sales Approver decision are complete; exact configuration, quantity, price and date then apply together |
| Supplier refusal, waiting or no confirmed date | Request stays pending; no partial goods, price or date effect |
| Stale browser draft / replacement failure / lock timeout | Refused or rolled back; draft remains on screen; no partial new request |
| Earlier customer date | Requires exact eligible warehouse Units; incoming PO coverage, showroom and damaged stock do not prove readiness |
| Price exception / existing SO refund obligation | Resolved qualified Sales Approver required; role alone cannot approve; own request allowed by the scoped owner ruling; refund approval does not pay money |
| Separate legacy Finance `refunds` / `approval_decide` | Unchanged under Payment MASTER §13; not certified against this new Duty; no claim of universal refund convergence |
| Whole-order cancellation after Proceed | Existing refusal preserved; approved whole-domain target is not implemented by this commission |
| Delivery-charge recalculation | Approved target, not implemented here; no manually invented waiver lane |
| Stair-fee-affecting amendment | Existing arithmetic and pinning, effective goods/charge and immutable revision commit together; failure rolls all of them back |
| PDF capture failure | Approved labelled reconstruction stays allowed. Lack of universal server capture alone is not a new release gate; provenance is separately protected |
| No PIC / no Delivery Duty | Honest unassigned event; notification cannot be claimed delivered until an eligible holder exists |

**Corrected amount-consistency case:** qty 1, third floor, no lift, stair-items 2,
pinned RM50 per item/floor above floor 2, stored charge RM50. An evidenced qty 1 → 2
amendment now commits qty 2, charge **RM100** and revision charge **RM100** together.
Injected stair-row failure rolls back goods, charge, request and revision. Failure
at the final supplier gate preserves the prior pending request and answers; retry
applies once. Mixed configuration/qty/lower price/later date, fee-inclusive financial
impact, pinned tariff stability and changed unpinned tariff refusal also pass.

**Recommendation:** the corrected commissioned slice is a release candidate after
exact-head CI and the preflight below. It includes ordinary evidenced amendments,
existing supplier/price gates, atomic stair fees and qualified exception review.
It does not implement all approved Sales Order capabilities. System-priced delivery
charge, post-Proceed whole-order cancellation and universal Finance refund convergence
remain outside this commission. Keep their existing guarded behavior visible.

### Verification and upgrade evidence

- Real PostgreSQL 17: **43/43 pass**. Includes mixed configuration/qty/price/date,
  supplier refusal, missing date, dated cover/self-review, exact source identity,
  readiness, refund-without-payout, actual authenticated-role execution, internal
  automatic-submit permission, baseline refusal, replacement rollback and a real
  two-connection source-lock timeout/stale retry. API route checks **15/15 pass**, pricing checks **5/5** and existing recomputation checks **8/8**: **71 total**.
- The five baseline/replacement/no-PIC checks first failed against 0630 (28 prior
  checks still passed), then passed with 0632. The existing readiness negative control
  also failed as intended when its local helper was replaced with unconditional true.
- Web page/panel/addressed-activity checks: **105/105 pass**. Historical-document and
  issued-file race/fail-closed checks: **8/8 pass** (**113 total**). API and web type checks pass.
- Prior full CI at `26f8e808919ecdd46211adf1f25a8c77059cad6c` passed all guards,
  types, tests, build and secret scan. That is prior-head evidence, not a substitute
  for CI on this review correction's exact PR head.
- Fresh replay to 0628 still has seven failures: 0149, 0317, 0339, 0398a, 0453,
  0561 and 0588. They are **not** accepted as harmless upgrade proof. The original
  migrations and allowlist remain unchanged.
- Read-only live catalog export: **801 public non-extension function definitions**
  and **281 relation contracts**. A disposable replay database was overlaid with
  those actual definitions and the actual Stock Unit identity/PO-reason constraints
  and triggers. All 801 function fingerprints matched exactly before upgrade.
  Relevant tables' column/default/constraint/trigger facts matched (constraint order
  was normalized). Exclusions: three unrelated import/seed-backup tables and the
  archived `purchase_requests_checkpoint_a` constraints. RLS/ACL/index inventory and
  production data are not claimed cloned. This is a scoped upgrade rehearsal.
- Selective 0629 → 0630 → 0632 application passed against that reconstructed state;
  tests above passed. Purchasing then reported production 0631 tracker
  `20261001062406`, file MD5 `8efc838e3f7fdc78d23059fff0354cba`; its exact committed
  file was also applied locally before the final combined check. Purchasing also delivered 0633 in PR1837,
  main `36e2840dd8dcce6eeb77252417ab57febbd6848d`, tracker `20261001064254`,
  file MD5 `b71e5e603b66adc6ab2bd0276abdfd6b`; its exact committed file was applied locally,
  then all **71 combined DB/API/pricing checks passed**.
  This chat made no live schema or operational write. 0632 belongs to SO PR #1834;
  0633 belongs to Purchasing PR #1837 and was delivered by that chat, not this one.
- Initial read-only live availability check: Sales Approver and Delivery Duty have
  no holder; PO Duty has a resolved person; two active Principals and four active
  Operation users exist. **2/32 proceeded TEST orders** have no PIC. These are test
  data observations, not customer-production-population claims or a cleanup request.

### Actual staff walkthrough and design critique

The real shell and components were opened against a local fixture-only API; all
unhandled `/api/` calls are refused. This is browser evidence, not a live staff trial.

- Desktop 1440×1100: Edit → change phone → Save → review before/after → enter reason
  → keyboard Enter on Save. A simulated stale response leaves the edited phone,
  reason and review dialog intact, displays `Action changed · Review again`, and
  produces no browser exception. [Observed stale draft](../evidence/sales-orders-14/stale-draft-preserved.png).
- Phone 390×844: the supplier request shows the real recorder, before/after values,
  customer evidence and named PO Duty in a single column. The ordinary path has no
  Approve button. [Observed mobile supplier panel](../evidence/sales-orders-14/supplier-mobile.png).
- Desktop priced review: mattress qty 2 → 1 and stair-items 2 → 1 show the same
  stair charge RM100 → RM50, total RM4,130 → RM2,190 and RM809.50 overpayment for
  Payments review. The existing Sales Approver gate remains; no browser exception.
  [Observed priced review](../evidence/sales-orders-14/priced-amendment-review.png).
- Existing desktop supplier, price and self-decision walkthroughs remain captured:
  [Supplier](../evidence/sales-orders-14/supplier-waiting.png),
  [Price](../evidence/sales-orders-14/price-review.png),
  [Self-decision](../evidence/sales-orders-14/self-approval.png).

**Strengths:** existing Modal, Select, DatePicker, Input, Button and toast conventions
keep the operator's action consistent; evidence and next actor stay together.
**Corrected critical finding:** the fee and revision now share one transaction. **Major:** stale recovery safely keeps the draft,
but does not yet merge/rebase it or offer a guided field comparison; the current
message requires rereading the order. **Minor:** the mobile request is long and needs
vertical scrolling to reach the record button. None of these requires copying a
Houzs page or adding an inline component. **Recommendation:** retain the kit and
existing fallback and atomic charge integrity, then validate the complete action with an
operator. No new owner design question is needed for this review.

### Conditional preflight, deployment order and recovery

These are engineering instructions for a later expressly authorised delivery, not
permission to run them now. Local proof does not claim production verification.

1. Freeze the selected Git head and require its complete CI to pass. Reconcile the
   approved authority in PR1826 and shared template PR1836 with the owning chats;
   neither docs PR is deployment permission. Check current main and all migration
   heads for collisions. Do not overwrite committed 0629/0630 or Purchasing0631/0633.
2. Read the live tracker and function signatures/bodies again. Require the rehearsed
   amendment/refund/Duty contracts or stop and rehearse the measured drift. Verify
   exact source-line/Unit linkage and the shared lock order with Purchasing's final
   0633 head. Repeat the relevant selective upgrade and concurrency test locally.
3. Verify active Duty qualification/dated cover and PIC or Delivery Duty availability
   for the actual offered paths. Obtain explicit owner authorization for any live
   assignments; never choose a Principal automatically. Preserve test-data clean-start
   rules; this review authorizes no historical transaction cleanup or cutover.
4. After explicit release approval, apply only missing reviewed migrations in dependency
   order: SO 0629 → 0630 → 0632; Purchasing0631/0633 follows its verified tracker and
   owner, with combined order/source/Unit locking verified before offering linked
   procurement/reservation journeys. Never replay all historical files in production.
5. Deploy the matching API, then matching web bundle as one controlled release. The
   old web client lacks the baseline/fee quote and must reload before submitting to the new
   API. Pending requests that change stair inputs without a valid quote become stale
   and must be re-proposed through the existing guarded replacement action. Read-only production checks must verify actual deployed commit, RPC contracts,
   permissions and visible Duty resolution. Real live transaction smoke tests need
   separate explicit authorization; no fabricated customer transaction is implied.
6. If migration fails, stop before API/web rollout and inspect the transaction boundary.
   If a deployed check fails, suspend the affected write door while restoring the last
   compatible API/web release; an old API must not silently discard the new baseline
   protection. Keep additive schema and immutable revisions/evidence; use a reviewed
   forward migration for any database correction. Never delete a request, rewrite a
   past revision, undo money or unreserve Units as a rollback shortcut.

Review: [PR #1834](https://github.com/wenwei4046/Carres-Portal-v2/pull/1834).
No main merge, deployment or live assignment has been performed by this chat.
