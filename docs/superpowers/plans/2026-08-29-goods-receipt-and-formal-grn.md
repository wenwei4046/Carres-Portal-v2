# Goods Receipt and Formal GRN Implementation Plan

> **SUPERSEDED — DO NOT EXECUTE.** Owner correction, 2026-08-29: the workspace is `Receiving`,
> Supplier DO and physical receipt produce the Carres Goods Receipt/numbered GRN, and quantities are
> Order / Received / Damaged / Wrong Item / Pending Delivery. Damaged, wrong and extra goods never
> reduce Pending Delivery or create available Stock. The separate Receiving task owns the corrected
> implementation. This file remains only as historical evidence and authorises no Receiving UI or
> migration work from the SO Batch Purchase task.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge Carres-station and external-Warehouse receiving on one GRN-Duty-controlled posting engine that records exact outcomes, creates one formal GRN, and applies Stock/Claim consequences once.

**Architecture:** Both entrances create or update a `warehouse_receipts` Receiving Session. External Warehouse may submit but never post. Carres station may count and immediately request posting. One SQL posting function validates the session, enforces GRN Duty/cover/Superuser authority, allocates a formal GRN number, records audit context, and calls the existing stock receive engine once.

**Tech Stack:** PostgreSQL, TypeScript, Hono, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-purchasing-receiving-work-design.md` §§4–7, 9.

## Global Constraints

- Keep the one rota: GRN Duty is the following month's `ops_po_duty` row.
- Warehouse submission does not move Stock and does not create a formal GRN.
- Carres direct receiving and Warehouse review must call the same posting function.
- `posted_by` is the actual actor. Store normal GRN Duty and dated cover separately.
- One physical Unit has one outcome. Aggregate-only categories still reconcile accepted + issue + rejected + not delivered to expected quantity.
- Posting is idempotent; retries return the existing GRN and never double-move Stock.

---

## Task 1: Replace ambiguous receiving counters with a closed outcome contract

**Files:**
- Modify: `packages/shared/src/warehouse-receipt.ts`
- Modify: `packages/shared/src/warehouse-receipt.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] Write failing tests for these exact outcomes:

```ts
export type ReceivingOutcome =
  | "accepted"
  | "accepted_with_issue"
  | "rejected"
  | "not_delivered";

export interface ReceivingUnitOutcome {
  unitId: string;
  outcome: ReceivingOutcome;
  issueType: string | null;
  evidencePaths: readonly string[];
}
```

- [ ] Extend each line draft with `expectedQty`, `acceptedQty`, `acceptedWithIssueQty`, `rejectedQty`, `notDeliveredQty`, and `unitOutcomes`.
- [ ] Add `receivingOutcomeProblems` enforcing non-negative integers, exact quantity reconciliation, unique required Unit IDs, issue evidence for `accepted_with_issue`, and observable reason/evidence for `rejected`.
- [ ] Preserve a compatibility mapper from current `receivedNow`, `damagedQty`, and `wrongItemQty` payloads for historic receipt reads only. New submissions must use the closed outcome fields.
- [ ] Run `pnpm --filter @carres/shared test -- src/warehouse-receipt.test.ts`; expected result: pass.
- [ ] Commit: `git add packages/shared && git commit -m "test(receiving): define exact receipt outcomes"`.

## Task 2: Persist formal GRN identity and posting evidence

**Files:**
- Create provisionally: `supabase/migrations/0407_one_receiving_session_posts_one_grn.sql`
- Modify tests: `apps/api/src/routes/operation/warehouse-receipts.test.ts`
- Modify tests: `apps/api/src/routes/operation/pos.test.ts`

- [ ] Before implementation, add failing tests asserting both Office and Warehouse posting call `post_receiving_session` and never call `operation_receive_po_with_do` directly from a route.
- [ ] Add to `warehouse_receipts`: `grn_number`, `normal_grn_duty_user_id`, `acting_cover_user_id`, `posted_by`, `post_authority`, and a unique partial index on non-null `grn_number`.
- [ ] Add `receiving_unit_outcomes` with one row per source receipt line + Unit ID and a unique constraint preventing two outcomes for the same Unit in one session.
- [ ] For aggregate-only goods, persist the four quantities in the session line JSON and validate their sum server-side.
- [ ] Implement `post_receiving_session(p_receipt_id uuid)` as `security definer` with locked `search_path`:
  1. lock the session row;
  2. return the existing posted result if already posted;
  3. require `operations_actor_may_act(auth.uid(), 'grn_duty', goods_received_at)`;
  4. validate the signed DO and complete outcomes;
  5. allocate `GRN-YYYYMMDD-RRRR` through the existing formal document allocator;
  6. call the existing stock/claim consequence engine once;
  7. store status, GRN, normal duty, cover, actual actor, authority, and event metadata atomically.
- [ ] Remove broad `is_operation()` posting authority from `office_receive_post` and `warehouse_receipt_check_in`; retain them as compatibility wrappers into `post_receiving_session`.
- [ ] Add migration sanity checks for GRN Duty, dated cover, Operations Superuser, ordinary-user refusal, and idempotent retry.
- [ ] Run the two route test files plus `pnpm ci:migrations`; expected result: pass.
- [ ] Commit: `git add supabase/migrations apps/api && git commit -m "feat(receiving): post one formal GRN through one authority"`.

## Task 3: Keep the two entrances but remove the second posting implementation

**Files:**
- Modify: `apps/api/src/routes/warehouse/receiving.ts`
- Modify: `apps/api/src/routes/warehouse/receiving.test.ts`
- Modify: `apps/api/src/routes/operation/warehouse-receipts.ts`
- Modify: `apps/api/src/routes/operation/warehouse-receipts.test.ts`
- Modify: `apps/api/src/routes/operation/pos.ts`
- Modify: `apps/api/src/routes/operation/pos.test.ts`

- [ ] Write failing tests that Warehouse POST creates `submitted`, Operation review posts it, and Office direct receiving creates then posts the same session shape.
- [ ] Update Warehouse submission to persist the new outcome payload while retaining Warehouse-authenticated submit authority only.
- [ ] Update Operation review to call `post_receiving_session` and return structured 403 authority details for an ordinary user.
- [ ] Update Office direct receiving to create the session and call `post_receiving_session` in the governed database path; no application-side stock writes.
- [ ] Return `grnNumber`, `normalGrnDuty`, `datedCover`, `actualActor`, and `postAuthority` in receipt detail/history responses.
- [ ] Run all three route test files; expected result: pass and only the shared posting RPC appears in post routes.
- [ ] Commit: `git add apps/api && git commit -m "refactor(receiving): converge office and warehouse posting"`.

## Task 4: Make Goods Receipts guide count, inspect, and post

**Files:**
- Modify: `apps/web/src/pages/operation/OperationReceiving.tsx`
- Modify: `apps/web/src/pages/operation/OperationReceiving.test.tsx`
- Modify: `apps/web/src/pages/operation/components/ReceivingWorkspace.tsx`
- Create: `apps/web/src/pages/operation/components/ReceivingWorkspace.test.tsx`
- Modify: `apps/web/src/lib/queries.ts`

- [ ] Write failing tests for exact outcome totals, Unit uniqueness, evidence gates, submitted-vs-posted distinction, GRN Duty authority, and Superuser posting without owner impersonation.
- [ ] Replace damaged/wrong counter presentation with one outcome choice per Unit or reconciled aggregate quantities.
- [ ] On external sessions, label the action as review/post; do not imply Warehouse submission already received Stock.
- [ ] Show formal GRN only after successful posting. The activity shows actual poster and normal GRN Duty/cover separately.
- [ ] Invalidate Goods Receipts, Purchase Orders, Stock, Claims, and Work queries only after posting succeeds.
- [ ] Run the two web test files; expected result: pass.
- [ ] Commit: `git add apps/web && git commit -m "feat(receiving): guide governed GRN posting"`.

## Task 5: GRN slice verification

- [ ] Run shared warehouse-receipt tests, API receiving tests, and web receiving tests.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm ci:migrations`.
- [ ] Search `rg -n "operation_receive_po_with_do|office_receive_post|warehouse_receipt_check_in|post_receiving_session" apps supabase/migrations`; verify current routes converge on `post_receiving_session` and only migration history contains prior direct paths.
- [ ] Commit verification corrections with `git commit -m "test(receiving): verify one formal GRN engine"`.
