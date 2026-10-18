# Exact SC remedy SQL review — 18 Oct 2026

Status: BUILT locally; SQL NOT APPROVED / NOT APPLIED / NOT DEPLOYED. Current production remains 007c76e585f724ce0303c35c4b31981ea07827ff. Finance cancellation remains separate pending actual YH agreement.

Draft: `service-case-remedy-approval.draft.sql`
SHA-256: `667a43d1a981dc6c29a1eb38fbdaa50190afd8feabb36acbc2fa598a316a508d`
File MD5: `d258692e945dad4e66d8f7f5d06f722e`
Machine inventory: `service-case-remedy.manifest.json` (all 10 body hashes, signatures, definers, ACL surfaces).

## Business result

The existing Service Case Approver reviews the exact remedy, goods/quantity/recipient scope, existing policy/version/result, movement, free/charged amount/payer, affected Units when identifiable and actual Case evidence. The existing approvals record stores the decision; Case holds immutable binding/history. Charged proposals record the actual payer respondent/date/evidence, separate from the staff recorder or approver. This is a manual qualified review over source evidence, not a complete entitlement engine or proof of automatic absolute-prohibition evaluation. `not_eligible` permits only the existing paid-service/goodwill paths; prohibited/evidence-required results and arbitrary override keys are not accepted.

Purchasing still approves independently. The existing Stock and PO writers only admit an SC request after its exact Case approval; quantities and source coverage remain with those writers. Local example: requested 2, Stock 1 + PO 1; third good refused. Routine follow-up/new supporting Case file and stock/buy-only revision do not force another Case vote. Changed material Case/remedy/goods/recipient scope requires review. Approval does not issue, reserve, send, settle money or complete Service.

## Objects and access — explicit changes

- Add `service_cases.remedy_approval_events jsonb NOT NULL DEFAULT []`. No new table or business-data backfill.
- Add two immutable-history/binding triggers: `service_case_remedy_history_guard` on Case and `service_case_remedy_approval_guard` on approvals. The generic approval decision cannot bypass a trusted Case decision event.
- **RLS changes:** add restrictive SELECT policy `service_case_remedy_approval_visibility` on approvals. Typed Case remedy records are narrowed to Operation/Principal; all other approval rows retain existing policy behavior. This is not a blanket claim that permissions are unchanged.
- **New authenticated EXECUTE surfaces:** `service_case_remedy_read(uuid)`, `service_case_remedy_propose(uuid,jsonb)`, `service_case_remedy_decide(uuid,jsonb)`. Each explicitly gates Operation/Principal; writes require active person and actual existing duty for decision. Revoke PUBLIC/anon; private helpers not executable by authenticated/anon. Existing release RPC remains authenticated.
- Replace private `_purchasing_context_execution_admission(uuid)`, private `_purchasing_request_context_state(uuid)` and existing `purchasing_request_context_release()`. Existing private invoker/ACL boundaries retained. Release fingerprint reports SC execution only for this exact guard, cancellation remains false.
- No role/duty, Storage policy, bucket exposure, Finance access, or supplier/customer message added.

Production read-only preimages measured this run: context-state body `85a7228cdced6b259af4e76acf918eaf`; execution body `159f568d9ecbca6cf0330fcd38cc6ef0`; release body `b1878eee09922947f7b90e0c5b58b5cc`. Draft asserts these and absence of new Case objects before applying. Tracker tail 0700, version 20261018074151. Remeasure number across tracker/main/all branches before formal naming.

## Exact Tasks/Workspace connection

The existing Purchasing source now discovers pending typed Case proposals in ordered pages, reads each owning Case RPC as caller, and projects one `service_case.remedy_approve` occurrence under the existing `service_case_approver` duty. It opens `/operation?tab=service-notes&case=<exact Case>`; both Tasks and Workspace read this same source. The owning decision is the only writer; saved approval/refusal closes the occurrence through existing `work_record_completed`. The due date is the existing Service §7.9 next Office working day after the immutable proposed-event timestamp, using the same stored Office calendar as Work. No new Service module/source, second task system, invented deadline, internal-task copy or generic tick. The MPR itself also opens its linked Case directly.

## Verification and limits

- Shared: 46 targeted schema/refusal/Work-engine tests PASS.
- API: 54 existing Work tests and 5 route/projector tests PASS. Signed actual API + authenticated PostgreSQL PASS: unqualified decision denied; actual qualified identity/time saved; new pending occurrence discovered at exact Case; no completion on refusal; actual existing SQL Work completion ledger populated only after saved decision; no Purchasing approval/reservation/issue side effect.
- Local SQL lifecycle PASS: trusted role/duty, separate Purchasing vote, Stock1+PO1 of2, retries, generic-door/forged-history/scope-change/third-good/removed-evidence negatives, unchanged follow-up and actual procurement-only revision/reapproval. All fixtures rolled back.
- Web: 181 relevant existing MPR/Service/Case component tests PASS. Shared/API/web typechecks PASS after fixing test fixture types. `git diff --check` PASS.
- Native existing Case page, actual signed owned-local API/database: actual approver name, exact2goods, selected evidence link, requester has no Approve, unsaved Case facts disable decision; unsent remedy draft survives the existing kit Discard dialog's Cancel. Native page at1280 DOM viewport has no document horizontal overflow. New section uses current kit. Existing legacy Case modal/other fields are not a full Service UI kit adoption; that remains a measured scope limit.
- Local PostgREST-shaped transport and TEST Storage signing are explicitly test adapters; not actual provider upload/signing proof. The standalone local SQL lifecycle uses the real current admission; the API adapter's existing local-only writer-admission override is not production guard proof. Actual Storage objects in tests are TEST metadata. Production verification is read-only and will not manufacture orders, Cases, decisions or messages.
- Exact production-probe draft was run locally: all10 body hashes, ACLs, restrictive policy, triggers and unauthorised read/propose/decide negative controls reached the deliberate PROBE_ROLLBACK. This probe contains no business fixtures/writes. It has NOT run against production yet.

## One requested approval and rollout

Approve the exact SQL above for the established ENGINEERING §5 flow. After approval: rehash bytes/recheck preimages and numbering; copy exact approved bytes to the formal next migration; commit and push before applying; one atomic rolled-back production metadata/guard probe with negative controls; verify no tracker/objects/business counts persisted; apply the committed exact file once; reconcile tracker file MD5 and all10 committed function bodies/ACLs/column/triggers/policy; required exact-head CI/review/merge and deployment; verify five canonical surface versions and actual signed-in read-only Case/MPR/Tasks entry. Report exact live SHA and the real boundary of the no-write walk.

Rollback: the probe always aborts atomically. After actual apply, preserve all recorded Case history and never drop/rewrite business records as an automatic rollback. If rollout fails, keep/redeploy prior application release and close SC execution through a separately reviewed exact forward SQL correction; ordinary GP/RS and existing release remain protected. Do not reapply0697–0700. SQL approval here does not authorise Finance cancellation work.
