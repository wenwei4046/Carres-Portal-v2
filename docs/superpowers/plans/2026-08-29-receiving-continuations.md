# Receiving Continuations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn partial, rejected, and accepted-with-issue receipt outcomes into the correct governed next work without reversing accepted goods or inventing claims.

**Architecture:** Receipt outcomes are immutable source facts. Pure shared projectors derive open balance, supplier obligation, and claim need. The posting transaction writes consequences once: accepted goods enter the correct stock state, outstanding balance remains Incoming, accepted-with-issue opens a source-linked claim/hold, and on-spot rejection opens a claim only when a supplier obligation still exists.

**Tech Stack:** TypeScript, PostgreSQL, Hono, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-purchasing-receiving-work-design.md` §§5–7, 9.

## Global Constraints

- Partial receipt never rolls back accepted quantity.
- `not_delivered` creates balance work, not a damage claim.
- `rejected` goods never become available Stock.
- `accepted_with_issue` goods become controlled/unavailable and create a source-linked Supplier Claim.
- A claim is not opened for a completed on-spot hand-back unless the supplier still owes replacement, repair, refund, or another governed obligation.
- Balance-date completion requires the evidenced supplier promise from the Supplier Confirmation plan.

---

## Task 1: Define consequence projection as pure tested logic

**Files:**
- Create: `packages/shared/src/receiving-consequences.ts`
- Create: `packages/shared/src/receiving-consequences.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/supplier-claim.ts`
- Modify: `packages/shared/src/supplier-claim.test.ts`

- [ ] Write a table-driven failing test for accepted, partial/not-delivered, rejected-and-handed-back, rejected-with-obligation, and accepted-with-issue outcomes.
- [ ] Export:

```ts
export interface ReceivingConsequence {
  stock: "available" | "controlled" | "none";
  openBalanceQty: number;
  opensSupplierClaim: boolean;
  claimSource: "accepted_with_issue" | "rejected_with_obligation" | null;
}
```

- [ ] Add `receivingConsequenceOf` and `receiptSupplierObligation` with no I/O or dates.
- [ ] Extend Supplier Claim source vocabulary so the source receipt/session/outcome is explicit and exact Unit IDs remain traceable.
- [ ] Run the two shared test files; expected result: pass.
- [ ] Commit: `git add packages/shared && git commit -m "test(receiving): define outcome continuations"`.

## Task 2: Apply consequences atomically during posting

**Files:**
- Create provisionally: `supabase/migrations/0408_receipt_outcomes_open_their_own_continuations.sql`
- Modify tests: `apps/api/src/routes/operation/warehouse-receipts.test.ts`
- Modify tests: `apps/api/src/routes/operation/supplier-claims.test.ts`

- [ ] Add failing tests proving partial receipt leaves accepted Stock posted and opens only balance work; accepted-with-issue creates controlled Stock plus one claim; on-spot rejection without continuing obligation creates no claim.
- [ ] Through the migration, update the one posting engine to write a unique consequence event per receipt outcome. Enforce uniqueness by source receipt + source line + Unit/outcome.
- [ ] Stamp `purchase_order_lines.short_since` only for outstanding quantity and keep `received_qty` equal to accepted + accepted-with-issue, never rejected/not-delivered.
- [ ] Link generated claims to `warehouse_receipt_id`, source line, exact Unit IDs, and outcome kind.
- [ ] Ensure a retry reads the existing consequence rows and creates nothing twice.
- [ ] Add migration sanity blocks for all five scenarios from Task 1.
- [ ] Run API tests and `pnpm ci:migrations`; expected result: pass.
- [ ] Commit: `git add supabase/migrations apps/api && git commit -m "feat(receiving): persist outcome continuations once"`.

## Task 3: Expose the correct next action in Purchase Orders and Claims

**Files:**
- Modify: `apps/api/src/routes/operation/pos.ts`
- Modify: `apps/api/src/routes/operation/pos.test.ts`
- Modify: `apps/api/src/routes/operation/supplier-claims.ts`
- Modify: `apps/api/src/routes/operation/supplier-claims.test.ts`
- Modify after PR #977 integration: `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx`
- Modify: `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx`
- Modify: `apps/web/src/pages/operation/OperationSupplierClaims.tsx`
- Modify: `apps/web/src/pages/operation/OperationSupplierClaims.test.tsx`

- [ ] Write failing UI/API tests proving partial balance shows `Ask {supplier} for the balance delivery date`; accepted-with-issue deep-links to the source claim; rejected-without-obligation shows evidence but no open claim.
- [ ] Return receipt continuation facts in PO detail and claim detail responses; do not recompute source outcome from prose.
- [ ] Use the existing balance-date route with the new evidence contract. Do not add a second balance promise endpoint.
- [ ] Show exact source GRN/session, Unit IDs, outcome, and current supplier obligation on the Claim object.
- [ ] Run the four route/page test files; expected result: pass.
- [ ] Commit: `git add apps/api apps/web && git commit -m "feat(purchasing): show receipt continuations at their source"`.

## Task 4: Continuation slice verification

- [ ] Run `pnpm --filter @carres/shared test -- src/receiving-consequences.test.ts src/supplier-claim.test.ts`.
- [ ] Run the targeted API and web tests from Task 3.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm ci:migrations`.
- [ ] Search for any new manual `Complete` mutation for balance/claim work; expected result: none.
- [ ] Commit verification corrections with `git commit -m "test(receiving): verify partial reject and issue continuations"`.

