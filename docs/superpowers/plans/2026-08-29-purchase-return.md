# Purchase Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a formal, source-linked Purchase Return only from an authorised claim outcome and change custody only when the exact goods are handed to the supplier/carrier with evidence.

**Architecture:** Purchase Return is its own Purchasing object, not a claim status. A claim-authorised result creates a draft return. PO Duty/cover/Superuser issues the current document and records collection promises. GRN Duty/cover/Superuser records physical handover. Stock custody changes only in the handover transaction.

**Tech Stack:** PostgreSQL, TypeScript, Hono, React, PDF renderer, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-purchasing-receiving-work-design.md` §§4–7, 9.

## Global Constraints

- No blank `+ New Purchase Return` flow.
- One return must reference an approved Supplier Claim outcome and exact source receipt/Units or aggregate quantity.
- Issuing a document does not move Stock.
- Collection scheduling does not move Stock.
- Handover requires counterparty, date/time/site, scan/count, and evidence.
- Finance may read resulting credit context but Purchasing never creates a Finance credit note.

---

## Task 1: Define the Purchase Return object and lifecycle

**Files:**
- Create: `packages/shared/src/purchase-return.ts`
- Create: `packages/shared/src/purchase-return.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] Write failing tests for the closed lifecycle and valid transitions:

```ts
export type PurchaseReturnStatus =
  | "draft"
  | "issued"
  | "collection_scheduled"
  | "handed_over"
  | "cancelled";
```

- [ ] Define schemas for source claim, supplier, site, exact lines/Units, current version, collection promise/evidence, and handover evidence.
- [ ] Add pure transition guards: only draft can issue; issued can schedule; issued/scheduled can hand over; handed-over cannot be edited/cancelled.
- [ ] Add action projectors for `Issue the purchase return`, `Ask {supplier} for the collection date`, and `Hand over {returnNo} to {collector}`.
- [ ] Run `pnpm --filter @carres/shared test -- src/purchase-return.test.ts`; expected result: pass.
- [ ] Commit: `git add packages/shared && git commit -m "test(purchasing): define source-linked purchase returns"`.

## Task 2: Persist the formal document and handover transaction

**Files:**
- Create provisionally: `supabase/migrations/0409_a_purchase_return_moves_only_on_handover.sql`
- Create: `apps/api/src/routes/operation/purchase-returns.test.ts`

- [ ] Write failing SQL/API tests proving no source claim means refusal, document issue leaves custody unchanged, handover moves custody once, and ordinary actors are refused.
- [ ] Create `purchase_returns`, `purchase_return_lines`, `purchase_return_versions`, and append-only `purchase_return_events` with foreign keys to Supplier Claim, PO/GRN sources, supplier, site, and Units where applicable.
- [ ] Allocate formal code using the existing `PRTN` prefix allocator.
- [ ] Add `create_purchase_return_from_claim(claim_id)` that accepts only an authorised claim outcome requiring goods to leave Carres and prevents two live returns for the same claim outcome.
- [ ] Add `issue_purchase_return(return_id)` gated by PO Duty/cover/Superuser and snapshot normal owner, cover, actor, authority, and immutable version lines.
- [ ] Add `record_purchase_return_handover(return_id, collector, occurred_at, site_id, evidence_paths, unit_ids)` gated by GRN Duty/cover/Superuser. Lock the return and Units, validate exact membership/count, write custody events, and mark handed over atomically.
- [ ] Add idempotency constraints and migration sanity checks.
- [ ] Run `pnpm --filter @carres/api test -- src/routes/operation/purchase-returns.test.ts` and `pnpm ci:migrations`; expected result after route implementation: pass.
- [ ] Commit: `git add supabase/migrations apps/api && git commit -m "feat(purchasing): persist formal purchase returns"`.

## Task 3: Add one governed Purchase Returns API

**Files:**
- Create: `apps/api/src/routes/operation/purchase-returns.ts`
- Modify: `apps/api/src/index.ts`
- Complete: `apps/api/src/routes/operation/purchase-returns.test.ts`

- [ ] Add tested routes:
  - `GET /api/operation/purchase-returns`
  - `GET /api/operation/purchase-returns/:id`
  - `POST /api/operation/purchase-returns/from-claim/:claimId`
  - `POST /api/operation/purchase-returns/:id/issue`
  - `POST /api/operation/purchase-returns/:id/collection-promise`
  - `POST /api/operation/purchase-returns/:id/handover`
- [ ] Reuse the purchasing-evidence upload door for collection response and handover files.
- [ ] Make collection promise use the Plan 2 evidence schema and PO Duty authority. Make handover use GRN Duty authority.
- [ ] Return document lineage and structured owner/cover/actor evidence on every event.
- [ ] Run the route test file; expected result: all route, authority, and idempotency tests pass.
- [ ] Commit: `git add apps/api && git commit -m "feat(purchasing): expose one purchase return API"`.

## Task 4: Build the Purchase Returns Register and object workspace

**Files:**
- Create: `apps/web/src/pages/operation/PurchaseReturnsRegister.tsx`
- Create: `apps/web/src/pages/operation/PurchaseReturnsRegister.test.tsx`
- Create: `apps/web/src/pages/operation/PurchaseReturnWorkspace.tsx`
- Create: `apps/web/src/pages/operation/PurchaseReturnWorkspace.test.tsx`
- Create: `apps/web/src/lib/pdf/purchase-return-template.tsx`
- Create: `apps/web/src/lib/pdf/purchase-return-template.test.tsx`
- Modify: `apps/web/src/lib/queries.ts`
- Modify: `apps/web/src/pages/operation/OperationApp.tsx`
- Modify: `apps/web/src/pages/portal/portal-nav.ts`
- Modify: corresponding navigation tests.

- [ ] Write failing tests for source-only creation, four-sided Register frame, issue/collection/handover gates, exact Unit list, current/historic document versions, and separated actor/owner evidence.
- [ ] Replace the `soon` navigation item with the governed Register route; do not add a `+ New` button.
- [ ] Deep-link from authorised Supplier Claim outcomes to the created return object.
- [ ] Use 50/50 document preview only for issue/revision; collection and handover remain guided object actions.
- [ ] Keep handover disabled until exact goods and evidence reconcile.
- [ ] Run the Register, workspace, PDF, and navigation tests; expected result: pass.
- [ ] Commit: `git add apps/web && git commit -m "feat(purchasing): add purchase return workspace"`.

## Task 5: Purchase Return slice verification

- [ ] Run targeted shared, API, web, PDF, and navigation tests.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm ci:migrations`.
- [ ] Verify `rg -n "Purchase Returns" apps/web/src/pages/portal` shows an active route and no `soon: true` entry.
- [ ] Verify no Stock mutation exists in issue or collection-promise handlers.
- [ ] Commit verification corrections with `git commit -m "test(purchasing): verify purchase return custody"`.

