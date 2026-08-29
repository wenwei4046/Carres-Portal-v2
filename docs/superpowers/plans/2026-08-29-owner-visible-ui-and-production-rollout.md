# Owner-Visible UI and Production Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the exact owner-visible corrections—Issue PO for the real Operations account, compact selected-action owner chip, first-panel daily work, four-sided Registers, and Settings-driven destinations—and prove them on the exact production SHA.

**Architecture:** Reconcile this worktree's already-written UI/authority slices with PR #977, retain one canonical Purchase Orders implementation, and verify the complete vertical slice from server capability through selected-action review. Deployment proof comes from the repository SHA endpoints plus an authenticated real-account browser walk.

**Tech Stack:** React, Hono, PostgreSQL, Vitest, Playwright/browser walk, GitHub CI, Cloudflare deploy proof.

**Spec:** `docs/superpowers/specs/2026-08-29-purchasing-receiving-work-design.md` §§8–10.

## Global Constraints

- Do not add a permanent PO Duty toolbar or rail panel.
- Selected Issue action direction is `1 selected · 1 unit · Issue 1 PO    [YJ] [Issue PO]`.
- Do not put Yu Jun's name in the action sentence. The chip title may read `Yu Jun · PO Duty`; a cover chip names the cover and normal owner.
- Authorised normal duty/cover, Jess, and `operation@carres.com` see the active Issue PO button. Ordinary non-duty/non-cover/non-superusers do not.
- Register tables have visible top, bottom, left, and right framing through the shared kit.
- Destinations `AL Sungai Buloh` and `Ohana` are Settings records, with future locations addable without a deployment.
- Do not claim fixed from local screenshots or a branch SHA.

---

## Task 1: Reconcile the two in-flight Purchasing branches

**Files:**
- Current branch commits: `bba3bcc0`, `1c7cc586`, `bb79786f`, `8d510b6a`
- PR #977 head at planning time: `a575b80c580e8554ab417c5a4d2d11bfac4b416a`
- Collision files: `apps/api/src/routes/operation/pos.ts`, `apps/api/src/routes/operation/pos.test.ts`, `apps/web/src/lib/queries.ts`, `docs/purchasing/MASTER.md`, `packages/shared/src/index.ts`, migration numbers.

- [x] Fetch latest main and PR #977, re-read changed files, and record actual integration SHAs.
- [x] Integrate PR #977's head into one delivery branch because the PR remains open.
- [x] Keep PR #977's `purchase-orders/PurchaseOrdersPage.tsx` as canonical and preserve the Superuser actor/owner evidence while resolving its API read conflict.
- [x] Renumber this branch's provisional migrations from the integrated maximum: `0401` Operations Superuser and `0402` Deliver To Settings.
- [x] Run the migration checker, 612 targeted API/web/shared tests, and `git diff --check`; result: pass.
- [ ] Commit: `git add -A && git commit -m "chore(purchasing): reconcile purchase register delivery"`.

## Task 2: Lock the exact SO Batch selected action

**Files:**
- Modify: `apps/web/src/pages/operation/so-batch/SoBatchRegister.tsx`
- Modify: `apps/web/src/pages/operation/so-batch/SoBatchRegister.test.tsx`
- Modify: `apps/web/src/pages/operation/so-batch/SoBatchIssueWorkspace.tsx`
- Modify: `apps/web/src/pages/operation/so-batch/SoBatchIssueWorkspace.test.tsx`

- [ ] Keep/add failing tests for Operations Superuser button visibility, ordinary-user refusal, normal duty chip, cover chip, no permanent duty block, and actor/owner distinction after issue.
- [ ] Render summary text on the left and only the compact display-owner chip plus active `Issue PO` button on the right.
- [ ] Source `mayAct` and owner context from the API authority payload; do not compare authenticated user IDs in the component.
- [ ] Ensure the button opens the existing official Issue workspace and cannot bypass commercial approval.
- [ ] Run both SO Batch test files; expected result: pass.
- [ ] Commit: `git add apps/web && git commit -m "fix(purchasing): restore governed Issue PO action"`.

## Task 3: Enforce the four-sided frame through the shared UI kit

**Files:**
- Modify: `apps/web/src/components/register/DataGrid.tsx`
- Modify: `apps/web/src/components/register/DataGrid.module.css`
- Modify: `apps/web/src/components/register/DataGrid.sticky.test.tsx`
- Modify: `apps/web/src/components/kit/DataTable.tsx`
- Modify: `apps/web/src/components/kit/grid-powers.test.tsx`
- Modify: `apps/web/src/pages/operation/SalesOrdersRegister.tsx`
- Modify: `apps/web/src/pages/operation/so-batch/SoBatchRegister.tsx`

- [ ] Write/retain tests asserting one outer frame owns all four borders and inner scroll/sticky regions do not erase the left/right edge.
- [ ] Implement the frame in the shared Register/DataTable kit, not page-local CSS.
- [ ] Verify SO Batch and Sales Orders use the shared frame with horizontal scrolling, sticky headers, expanded rows, and empty states.
- [ ] Run DataGrid/DataTable plus SO Batch and Sales Orders tests; expected result: pass.
- [ ] Run `pnpm --filter @carres/web lint`; expected result: design checks pass.
- [ ] Commit: `git add apps/web && git commit -m "fix(ui): frame every register table"`.

## Task 4: Finish Settings-driven receiving destinations

**Files:**
- Current integrated number: `supabase/migrations/0402_deliver_to_is_purchasing_settings.sql`
- Modify: `packages/shared/src/purchasing-settings.ts`
- Modify: `packages/shared/src/purchasing-settings.test.ts`
- Modify: `apps/api/src/lib/purchasing-settings.ts`
- Modify: `apps/api/src/lib/purchasing-settings.test.ts`
- Modify: `apps/api/src/routes/operation/purchasing-settings.ts`
- Modify: `apps/api/src/routes/operation/purchasing-settings.test.ts`
- Modify: `apps/web/src/pages/operation/OperationPurchasingSettings.tsx`
- Modify: `apps/web/src/pages/operation/OperationPurchasingSettings.test.tsx`
- Modify destination readers in SO Batch, Manual Purchase, Purchase Orders, and Receiving.

- [ ] Keep/add failing tests for seeded `AL Sungai Buloh` and `Ohana`, add/edit/deactivate future destinations, receiving party, calendar, stock consequence, and evidence requirement fields.
- [ ] Treat Purchasing Settings as the one source. Remove runtime dropdown literals from all four readers.
- [ ] Preserve inactive historical destinations on existing documents but exclude them from new choices.
- [ ] Validate that every destination specifies Carres station or external Warehouse receiving mode, Office/Warehouse calendar as applicable, stock site/consequence, and evidence rule.
- [ ] Run shared, API, Settings page, SO Batch, Manual Purchase, Purchase Orders, and Receiving tests; expected result: pass.
- [ ] Commit: `git add packages/shared apps/api apps/web supabase/migrations && git commit -m "feat(purchasing): govern receiving destinations in settings"`.

## Task 5: Full repository and migration gates

- [ ] Run `pnpm ci:migrations`; expected result: pass with unique immutable numbers.
- [ ] Run `pnpm test`; expected result: all workspace test suites pass.
- [ ] Run `pnpm typecheck`; expected result: all packages exit 0.
- [ ] Run `pnpm lint`; expected result: design and code lint exit 0.
- [ ] Run `pnpm build`; expected result: API/shared/web build gates exit 0 and deploy proof is generated.
- [ ] Run `git diff --check` and inspect `git status --short`; expected result: no whitespace errors and only intended changes.
- [ ] Request code review, address findings, rerun every failed/affected gate, and commit corrections.

## Task 6: Local owner walk with production-shaped authority

**Files:**
- Create: `e2e/operation-superuser-po-issue.spec.ts`
- Modify only if needed: `scripts/seed-test-users.ts`
- Modify only if needed: `scripts/seed-e2e-fixtures.sql`

- [ ] Add a local E2E test whose test user is flagged `operations_superuser=true` but is not PO Duty/cover.
- [ ] Seed one eligible SO demand through existing fixture helpers; do not hardcode sample staff/supplier/order data into runtime.
- [ ] Assert the user selects a buyable row, sees selection summary + owner chip + `Issue PO`, opens the official review surface, and the review preserves actual actor vs normal owner.
- [ ] Assert an ordinary operation fixture sees no active issue action and receives 403 on direct API attempt.
- [ ] Run `pnpm test:e2e -- e2e/operation-superuser-po-issue.spec.ts`; expected result: pass with retained trace only on failure.
- [ ] Attach the local before/after screenshots and test output to the PR; do not label them production proof.
- [ ] Commit: `git add e2e scripts && git commit -m "test(purchasing): walk superuser Issue PO journey"`.

## Task 7: Merge, migration approval, deploy, and exact-SHA proof

- [ ] Push the delivery branch, open/update the PR, and wait for required CI checks.
- [ ] Obtain the repository-governed production migration approval. Do not run a direct production apply from the worktree.
- [ ] Merge through the normal protected-main path.
- [ ] Fetch merged main, record `git rev-parse origin/main`, and run `EXPECTED_SHA="$(git rev-parse origin/main)" pnpm ci:smoke`; expected result: all five governed surfaces report that SHA.
- [ ] If migration approval/application is pending, report the delivery as blocked by that named gate; do not call it fixed.

## Task 8: Real Operation-account production owner walk

- [ ] Sign in at the canonical ERP as the real `operation@carres.com` account without exposing credentials in logs or tests.
- [ ] Open `SO Batch Purchase`; verify the first rail panel is `WORK TO DO`, there is no permanent PO Duty block, and the Register has all four borders.
- [ ] Select one real eligible row. Capture evidence that the bar shows the correct selection/unit/PO summary, compact duty/cover chip, and active `Issue PO` button.
- [ ] Open the Issue PO review surface without confirming a real supplier send unless separately authorised.
- [ ] Verify the page identifies the real actor separately from normal PO Duty/cover context.
- [ ] Verify Purchase Settings offers `AL Sungai Buloh` and `Ohana` and can support another inactive test definition without affecting live orders; do not create throwaway production Settings data unless explicitly authorised.
- [ ] Attach before/after screenshots, account, timestamp, exact SHA, selected real object ID, and observed result to the PR/delivery record.
- [ ] Only now update `docs/purchasing/MASTER.md` to state the exact SHA is production verified and commit the closure through the normal PR path.
