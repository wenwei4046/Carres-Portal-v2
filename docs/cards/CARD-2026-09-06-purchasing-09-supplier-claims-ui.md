# 【PURCHASING】 — CARD 【09】 · Case-linked Supplier Claims

Lane: BUILD / DELIVERY. Owner authorises testing and deployment (2026-09-07).
Status: BUILD / NOT DEPLOYED. Register/read-only object already verified in PR #1138.
Authority: Purchasing MASTER §9.5 and its first READY scope; UI MASTER; Workspace shared Work/Duty authority.

## Current implementation

One stock-only Case intake without fake customer answers; retry-stable report identity;
Receiving links exact Claim-held Units and permanent receiving result identities atomically.
Only a verified occurrence + Unit + problem automatically matches an existing Case. Staff
may explicitly select a matching existing Case to add evidence. New Case remains the default
for a later fault, which stays distinct even while an older Case remains open. Hold release does
not delete incident history. Photos reference original storage and attribution, including
the real evidence format constraint. Manual links reject partial overlap across multiple
Units and retain the verified Unit identities after holds end.

The Case/Claim doors use shared components and preserve the deployed factual Register.
Current source-search Work is projected on the server through the one shared Work feed;
no old browser composer or separate assignment roster is restored.

## Database release gate

The additive SQL is `supplier-claims-case-intake.sql` in this directory, outside migrations.
It adds stock-only intake facts, Case/Claim links, permanent Unit/report identities and
narrow authenticated writers. It changes the existing Receiving record hook within its
posting transaction. No production rows are backfilled or deleted. New link/report read
policies require visibility of their owning Case; direct writes remain revoked. The stock
report writer is a definer with active-internal and operation/principal checks because its
internal tables are RPC-only. Existing table RLS policies are unchanged.

Before numbering/apply: owner review of this concrete database change; maximum tracker,
repository and all-branch tail; assertions and negative control in rolled-back production
transaction; commit exact reviewed migration; apply exact file and reconcile tracker/source;
then merge/deploy dependent code and verify authenticated production.

## Verification

Isolated PostgreSQL assertions pass: retries, changed payload refusal, source/role/duty denial,
current cover, same-SKU foreign Unit exclusion, exact occurrence, later fault while earlier
Case remains open, hold release, original evidence and authenticated RPC/direct-write denial.
Negative control restoring old matching fails as expected. Full production schema replay and
live assertion checks remain open. Run `scripts/check-supplier-claims-case-sql.mjs` with
external PGLITE_MODULE. Later scopes retain versioned instruction/send/reply evidence,
Settings 2+2 dates, goods remedies and Finance-backed closure; this Card does not claim them.
