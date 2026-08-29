# Operations Duty Authority and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give PO and GRN actions one governed authority resolver that admits normal duty, dated cover, Jess, and flagged Operations Superusers while preserving normal owner, cover, actual actor, and authority as separate evidence.

**Architecture:** PostgreSQL owns the security decision. A generic duty-context resolver derives PO Duty or the one-month-offset GRN Duty from `ops_po_duty`, overlays a dated cover, and evaluates `is_operations_superuser`. API code reads that resolver and returns structured context; web code only renders the server result. Existing PO creation functions retain compatibility wrappers that delegate to the generic authority.

**Tech Stack:** PostgreSQL/Supabase, TypeScript, Hono, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-purchasing-receiving-work-design.md` §§3–5, 8–9.

## Global Constraints

- Do not add `operations_superuser` to the PO Duty roster or infer it from manager status.
- Do not let `operation@carres.com` edit the duty roster; roster editing remains `po_duty_editor`.
- Do not remove the actual actor from existing `sent_by` / `posted_by` fields.
- Do not create route-specific email allowlists.
- Preserve a compatibility SQL wrapper named `purchasing_actor_may_issue(uuid)` so existing PO creation RPCs remain on one database gate.
- Resolve the migration number only after the integration gate in the index plan.

---

## Task 1: Freeze the shared authority contract with failing tests

**Files:**
- Create: `packages/shared/src/operations-action-authority.ts`
- Create: `packages/shared/src/operations-action-authority.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] Write tests for the exact structured contract before implementation:

```ts
const context: OperationsActionAuthority = {
  dutyKey: "po_duty",
  normalOwner: { userId: NORMAL_ID, name: "Yu Jun", email: "yu@carres.com" },
  datedCover: null,
  displayOwner: { userId: NORMAL_ID, name: "Yu Jun", email: "yu@carres.com" },
  actualActor: { userId: OP_ID, name: "Operation", email: "operation@carres.com" },
  authority: "operations_superuser",
  mayAct: true,
  onDate: "2026-08-29",
};
expect(context.actualActor.userId).not.toBe(context.normalOwner.userId);
```

- [ ] Define and export these closed types:

```ts
export type OperationsDutyKey = "po_duty" | "grn_duty";
export type OperationsActionAuthorityKind =
  | "normal_duty"
  | "dated_cover"
  | "operations_superuser"
  | "refused";

export interface OperationsAuthorityPerson {
  userId: string;
  name: string | null;
  email: string;
}

export interface OperationsActionAuthority {
  dutyKey: OperationsDutyKey;
  normalOwner: OperationsAuthorityPerson | null;
  datedCover: OperationsAuthorityPerson | null;
  displayOwner: OperationsAuthorityPerson | null;
  actualActor: OperationsAuthorityPerson;
  authority: OperationsActionAuthorityKind;
  mayAct: boolean;
  onDate: string;
}
```

- [ ] Add pure helpers `operationsDisplayOwner`, `operationsOwnerChipTitle`, and `operationsAuthorityEvidence` with tests proving a cover replaces the chip owner while the normal owner and actual actor remain present in evidence.
- [ ] Run `pnpm --filter @carres/shared test -- src/operations-action-authority.test.ts`; expected result before implementation: failing import/expectations; after implementation: all tests pass.
- [ ] Commit: `git add packages/shared/src && git commit -m "test(operations): define duty authority evidence contract"`.

## Task 2: Generalise the dated-cover and capability authority in SQL

**Files:**
- Create provisionally: `supabase/migrations/0403_one_operations_duty_authority.sql`
- Modify through new migration only: objects originally created by `0379_one_actor_authority_for_every_po_door.sql` and the renumbered Operations Superuser migration.
- Test: `apps/api/src/lib/operations-action-authority.test.ts`

- [ ] First add failing SQL-contract tests that read the migration text and assert it creates exactly these callable interfaces:

```sql
public.operations_duty_context(p_duty_key text, p_on date)
public.operations_actor_may_act(p_user uuid, p_duty_key text, p_on date)
public.is_operations_superuser(p_user uuid)
```

- [ ] In the migration, rename `ops_po_duty_cover` to `ops_duty_cover`, add `duty_key text not null default 'po_duty'`, constrain it to `po_duty | grn_duty`, and recreate `ops_po_duty_cover` as a read-only compatibility view filtered to `po_duty`. Revoke writes to the view.
- [ ] Implement `operations_duty_context` as a `security definer`, stable function with a locked `search_path`. For `grn_duty`, derive the roster month as the following calendar month; do not add a second GRN roster.
- [ ] Return one JSON object with `normal_user_id`, `cover_user_id`, `acting_user_id`, `duty_key`, and `on_date`. `acting_user_id` is cover when an active cover exists, otherwise normal owner.
- [ ] Implement `operations_actor_may_act` so it returns true only when the actor is the normal owner, active cover, or `is_operations_superuser(actor)`.
- [ ] Replace `purchasing_actor_may_issue(uuid)` with a wrapper that calls `operations_actor_may_act(user, 'po_duty', current_myt_date())`.
- [ ] Add migration sanity blocks proving:
  - a flagged Operations Superuser passes;
  - a normal PO Duty holder passes;
  - an active PO cover passes;
  - an ordinary operation user fails;
  - GRN Duty resolves from the following roster month;
  - no anonymous role can execute write-authority functions.
- [ ] Run `pnpm --filter @carres/api test -- src/lib/operations-action-authority.test.ts` and `pnpm ci:migrations`; expected result: tests pass and migration checks report no duplicate/edited migration.
- [ ] Commit: `git add supabase/migrations apps/api/src/lib && git commit -m "feat(operations): unify duty and superuser authority"`.

## Task 3: Make the API consume the database authority once

**Files:**
- Create: `apps/api/src/lib/operations-action-authority.ts`
- Create: `apps/api/src/lib/operations-action-authority.test.ts`
- Modify: `apps/api/src/lib/purchasing-po-authority.ts`
- Modify: `apps/api/src/routes/operation/purchase-demands.ts`
- Modify: `apps/api/src/routes/operation/purchase-demands.test.ts`
- Modify: `apps/api/src/routes/operation/to-order.ts`
- Modify: `apps/api/src/routes/operation/to-order.test.ts`
- Modify: `apps/api/src/routes/operation/manual-purchase.ts`
- Modify: `apps/api/src/routes/operation/pos.ts`
- Modify: corresponding route test files.

- [ ] Write failing tests for `resolveOperationsActionAuthority(sb, actorId, dutyKey, onDate)` covering normal duty, dated cover, Operations Superuser, and refusal.
- [ ] Implement one RPC read of `operations_duty_context`, one RPC read of `operations_actor_may_act`, and one user enrichment query. Do not accept role/email/duties from request bodies.
- [ ] Change `purchasingActorMayIssue` into a compatibility adapter over `resolveOperationsActionAuthority(..., "po_duty", ...)`; remove any duplicate `actorId === authenticatedUserId` or manager/email decision.
- [ ] Update SO Batch, Manual Purchase, and Purchase Orders API payloads to return `issueAuthority: OperationsActionAuthority`.
- [ ] Keep the PO creation RPC's own SQL gate. The API result is for early refusal and presentation, not a replacement for database authority.
- [ ] Assert route tests distinguish `actualActor.userId` from `normalOwner.userId` for a superuser issue.
- [ ] Run:
  - `pnpm --filter @carres/api test -- src/lib/operations-action-authority.test.ts`
  - `pnpm --filter @carres/api test -- src/routes/operation/purchase-demands.test.ts src/routes/operation/to-order.test.ts src/routes/operation/manual-purchase.test.ts src/routes/operation/pos.test.ts`
  Expected result: all pass; ordinary users receive 403 and superusers reach the governed RPC.
- [ ] Commit: `git add apps/api && git commit -m "refactor(purchasing): consume one operations authority"`.

## Task 4: Persist the full action evidence on PO issuance

**Files:**
- Create provisionally: `supabase/migrations/0404_po_issue_records_owner_cover_and_actor.sql`
- Modify: `apps/api/src/routes/operation/pos.test.ts`
- Modify: `apps/web/src/pages/operation/components/PoIssueEvidence.test.tsx`

- [ ] Write failing tests for a superuser-issued PO asserting all four values: normal duty, dated cover if active, actual actor, and `operations_superuser` authority.
- [ ] Through a new migration, update every current PO creation/confirm-sent function to snapshot `normal_duty_user_id`, `acting_cover_user_id`, `actual_actor_user_id`, and `issue_authority` from the shared resolver in the same transaction.
- [ ] Backfill `actual_actor_user_id` from existing `sent_by` where safe; leave historic unknown owner/cover fields null rather than inventing identities.
- [ ] Keep `sent_by` as the actual actor for compatibility and add a check that it equals `actual_actor_user_id` for newly written rows.
- [ ] Ensure `po_history` records the same distinct fields in event metadata.
- [ ] Run the PO route and evidence-component tests; expected result: UI text reads the actual actor and normal duty without implying impersonation.
- [ ] Run `pnpm ci:migrations`; expected result: pass.
- [ ] Commit: `git add supabase/migrations apps/api apps/web && git commit -m "feat(purchasing): preserve issue owner and actor evidence"`.

## Task 5: Authority slice verification

- [ ] Run `pnpm --filter @carres/shared test`.
- [ ] Run `pnpm --filter @carres/api test`.
- [ ] Run `pnpm --filter @carres/web test -- src/pages/operation/so-batch/SoBatchRegister.test.tsx src/pages/operation/components/PoIssueEvidence.test.tsx`.
- [ ] Run `pnpm typecheck` and `pnpm ci:migrations`.
- [ ] Inspect `rg -n "operation@carres.com|jess@carres.com|actorId === authenticatedUserId|Only Current PO Duty|only Current PO Duty" apps packages supabase/migrations docs --glob '!docs/archive/**'`; expected result: no current route/screen authority hardcode and no contradictory current-law copy. Historical committed migrations may retain comments but later functions must override them.
- [ ] Commit any verification-only corrections with `git commit -m "test(operations): verify shared duty authority"`.
