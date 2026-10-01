# SALES ORDERS — CARD 14 · Staff amendments and exception approval

Module: Sales Orders · Sequence: 14 · Lane: scoped BUILD
Status: IMPLEMENTED FOR REVIEW — local verification complete; no production deployment or live assignment authorised.
Authority: Jess's scoped BUILD commission; documentation PR #1826, head
`3408afea35cc4ca4b8a024c04f4df9bc847cec03`; Orders MASTER § Staff amendments and
Sales Approver and Requested Delivery Date changes. The complete module PLAN is
not approved by this commission. Documentation PR remains OPEN.

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

## Verification

Measured on the isolated build branch, initially based on main `2b9119eb0`, then
integrated with main `45f43e96b` in `c36135ef4`; no production claim:

- Real local PostgreSQL: **28/28 pass**, including atomic ordinary apply, dated Principal cover, same-person
  Sales Approver approval, parallel evidence/supplier/price gates, exact-line PO
  coverage, ambiguous legacy-source refusal, earlier-date warehouse readiness,
  PIC attribution and existing refund approval without payout.
- Negative control: replacing the local readiness helper with unconditional `true`
  made the earlier-date refusal test fail; original helper restored and suite passed.
- Shared suite: **192 files / 3,975 tests pass**. API suite: **202 files / 3,890 tests
  pass**, 26 database-dependent files skipped in that generic run. The 28 tests above
  were separately executed on real PostgreSQL and are not counted as skipped passes.
- Full web run: **407 files / 5,831 tests passed**, with 2 files / 3 tests skipped.
  Its one failing file was the shell routing fixture (43 tests lacked the query
  provider after notification moved to the phone-capable app shell). It now isolates
  that separately tested reader; the corrected shell/panel/notification run passed
  **50/50**. This is a documented correction and rerun, not a claim that the earlier
  full command exited green.
- After main integration: **178 web, 275 API and 37 shared tests passed**. The final
  added rejection-permission guard passed all **6 panel tests**. Earlier page and
  notification contract run passed **98/98**.
- Additional partner/Work boundary tests: **16/16 pass**; together with the real
  PostgreSQL suite the final focused run passed **44/44**.
- Full migration replay: this branch **618 applied / 7 failed**; clean detached
  baseline `2b9119eb0` **616 applied / the same 7 failed**. After main integration the replay is **620 applied / the same 7 failed** (main added
  0627–0628). Both new scoped migrations pass.
  Existing failures: 0149, 0317, 0339, 0398a, 0453, 0561 and 0588. The last is an
  unallowlisted `42P16` view-column issue reproduced in the baseline. No committed
  migration or replay allowlist was edited to hide it.
- Browser: real Operation shell and amendment components, isolated fixture API only.
  Ordinary supplier request has no approval button; an unknown supplier date stays
  pending with actual recorder/evidence; a confirmed dated answer refreshes the
  request; assigned price approval records through its own door. No browser errors.
  [Supplier waiting](../evidence/sales-orders-14/supplier-waiting.png) ·
  [Price review](../evidence/sales-orders-14/price-review.png) ·
  [Assigned self-approval](../evidence/sales-orders-14/self-approval.png).
  These screenshots prove rendering/interaction, not persisted production state.

Final API/web type checks and the local production bundle pass. Lint passes its
existing warn-only baseline (8,321 findings); migration naming/immutability validates
both new files, and whitespace checks pass. Read-only production tracker and all
committed branch heads were checked before numbering: the highest existing number
was 0628. No production Duty holder is assigned; local preview/database processes
were stopped after verification.

Review: [PR #1834](https://github.com/wenwei4046/Carres-Portal-v2/pull/1834). Review
only; no main merge, deployment or live operational write is authorised.

## Remaining business boundary

Whole-SO cancellation after Proceed stays refused until its complete cross-module
consequence law is approved. No payout, ordinary-address expansion, attribution
consolidation or manual delivery-charge lane is introduced. The system-priced
charge target is retained in the governing MASTER as approved/not built. This
scoped implementation does not declare the whole Sales Orders PLAN complete.
