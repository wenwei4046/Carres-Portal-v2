# Cross-module Workspace Work Feed — Implementation Plan

**Status:** APPROVED for build · corrected 2026-09-06 against `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md`, and `docs/workspace/MASTER.md`.

**Goal:** Replace the browser-composed Work dataset with one read-only server feed used by Work and the Quick Rail, without copying module truth or adding module-local work panels.

**Architecture:** Owning modules remain authoritative for triggers and completion. Shared projectors translate authoritative facts into the structured Work contract. `GET /api/operation/work` composes the admitted module projections once. My Work, Team Work, and Quick Rail are filters or summaries over the same response. The feed writes nothing and exposes no generic Done action.

**Initial admission:** Sales Orders, Manual Purchase, and Receiving only. Other modules enter in later cards after they prove trigger, owner rule, due/SLA, completion fact, and exact object door.

## Non-negotiable laws

- Action has an Owner; a Sales Order does not have one universal Owner.
- Normal owner, active cover, and acting person remain separate structured fields.
- Object identity is the row/card header; owner is metadata; action sentence contains only the act.
- Completion is an authoritative owning-module fact. Workspace never stores duplicate completion state.
- One feed supplies My Work, Team Work, and Quick Rail counts.
- No module-local `WORK TO DO` panel is created.
- Dashboard remains last and is not part of this build.

## Task 1 — Lock the wire contract

**Files**

- Create `packages/shared/src/operation-work.ts`
- Create `packages/shared/src/operation-work.test.ts`
- Modify `packages/shared/src/index.ts`

**TDD sequence**

1. Write failing contract tests for stable identity, object header, two-line facts, owner identities, timing, completion fact, and exact destination.
2. Add the minimal schema/types and deterministic stable-id helper.
3. Verify malformed or incomplete work cannot be admitted.

## Task 2 — Build the server composition boundary

**Files**

- Create `apps/api/src/routes/operation/work.ts`
- Create `apps/api/src/routes/operation/work.test.ts`
- Modify `apps/api/src/index.ts`

**TDD sequence**

1. Write failing route tests proving one response includes admitted Orders, Manual Purchase, and Receiving actions.
2. Reuse the existing module projectors; do not invent trigger arithmetic in the route.
3. Resolve normal owner, active cover, and acting person from Workspace duty resolution.
4. Return one authorized open set plus staff needed for Team grouping.
5. Prove completed module facts remove items, unresolved duty does not borrow a PIC, and cover changes acting person without rewriting normal owner.
6. Prove each item carries an exact owning-object destination.

## Task 3 — Add the one client query

**Files**

- Modify `apps/web/src/lib/queries.ts`
- Create or modify focused query tests where the repository pattern requires them.

**TDD sequence**

1. Add a failing test for `useOperationWork` reading `/api/operation/work` under one cache key.
2. Implement the typed query with no client-side trigger projection.

## Task 4 — Switch Work to the server feed

**Files**

- Modify `apps/web/src/pages/operation/use-open-work.ts`
- Modify `apps/web/src/pages/operation/OperationWork.tsx`
- Modify `apps/web/src/pages/operation/OperationWork.test.tsx`

**TDD sequence**

1. Rewrite tests first so My Work filters by acting person and Team Work groups by normal owner from the server response.
2. Preserve cover evidence, due/late copy, module filter, search, empty/error/loading states, and exact object deep links.
3. Delete the browser-side Orders, Manual Purchase, and Receiving composition.
4. Make My Work the default for every user, including managers.

## Task 5 — Switch Quick Rail to the same response

**Files**

- Modify `apps/web/src/pages/operation/components/rail/TeamPanel.tsx`
- Modify `apps/web/src/pages/operation/components/rail/TeamPanel.test.tsx`

**TDD sequence**

1. Write failing tests that rail counts equal the shared response and covered work counts for the acting person.
2. Keep the rail a compact count/navigation surface; do not render a second action list.
3. Retain the governed duty coverage door and its authorization.

## Task 6 — Remove duplicate paths and verify

1. Search for remaining browser-side work composition and independent Team workload arithmetic.
2. Run focused shared, API, Work, and TeamPanel tests.
3. Run shared/API/web typechecks and lint.
4. Run full shared, API, and web suites.
5. Update `docs/workspace/MASTER.md` current-truth and gap sections only after the implementation is proven.
6. Commit the verified implementation and push the build branch for review; do not deploy production from this plan.

## Explicitly deferred

- Dashboard composition and KPI work.
- Payment, Delivery, Stock/Warehouse, Service Case, and Issue Tracker admission until each passes the module admission gate.
- Notifications delivery mechanics.
- New manual assignment or generic completion controls.

