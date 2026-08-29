# Purchasing, Receiving, and Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the owner-approved Purchasing → Receiving → GRN → Claim/Return → Work chain without creating a second authority, transaction engine, or work queue.

**Architecture:** Each business module remains the writer of its own facts. A shared duty/capability resolver supplies owner, dated-cover, actual-actor, and authority evidence to every governed action. Work reads typed projections from Purchasing, Receiving, Claims, and Returns and deep-links back to the owning module.

**Tech Stack:** TypeScript, React, Hono, Supabase/PostgreSQL, Vitest, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-29-purchasing-receiving-work-design.md`

## Global Constraints

- Do not deploy or apply a production migration until the repository's governed migration approval is given.
- PR #977 (`codex/purchase-orders-register`, head `a575b80c580e8554ab417c5a4d2d11bfac4b416a`) owns the incoming Purchase Orders register and migration `0400_the_po_document_carries_every_destination.sql`. Merge or rebase it before assigning final migration numbers.
- Never edit a committed migration. Renumber only this unmerged branch's new migrations after the integration point is known.
- Never determine Operations Superuser authority from an email string in web, API, or SQL. `app_users.operations_superuser` and `is_operations_superuser(uuid)` are the governed capability.
- PO Duty and GRN Duty remain normal ownership facts. A dated cover is acting ownership. Neither is overwritten when Jess or an Operations Superuser acts.
- Every audit record stores the actual actor separately from normal duty and dated-cover context.
- The two receiving entrances must converge on one posting engine. Warehouse submission does not move Stock.
- Work owns no transaction state and no manual completion toggle for module work.
- SO Batch has no permanent PO Duty block. The compact owner chip appears only with the selected Issue action.
- Register lists use the governed four-sided frame. Destinations come from Purchasing Settings, not runtime literals.
- No production-fix claim is allowed until the exact merged SHA is live on all governed surfaces and `operation@carres.com` reaches the real Issue PO review surface.

## Measured Authority Conflict and Root Cause

The owner-approved rule and current production authority disagree. The owner-approved rule says
normal PO Duty/dated cover, Jess, and the governed Operations Superuser may perform Issue PO while
normal duty remains the accountability fact. Current production still runs the pre-Superuser SQL
truth from `0379_one_actor_authority_for_every_po_door.sql`: `purchasing_actor_may_issue` accepts
only the resolved normal holder/dated cover. The later PO creation functions call that same refusal,
so direct API/RPC use cannot bypass it.

`apps/api/src/routes/operation/purchase-demands.ts` exposes that database answer as `mayIssue`.
`apps/web/src/pages/operation/so-batch/SoBatchRegister.tsx` independently allows eligible demand to
be selected and computes `Issue 1 PO`, but conditionally removes the button when `mayIssue` is
false. That is why the 29 Aug production screenshot can simultaneously show a valid selected row
and no Issue PO action. `apps/api/src/routes/operation/to-order.ts`, Manual Purchase, and the SQL PO
creation authority share the same pre-Superuser refusal, so a browser-only button change would be a
false fix.

This worktree contains an unmerged correction, but production cannot use it until its migration is
renumbered around PR #977, reviewed, merged, approved for production application, deployed, and
walked with the real account.

## Delivery Order

1. `2026-08-29-operations-duty-authority-and-audit.md`
2. `2026-08-29-supplier-confirmation-evidence.md`
3. `2026-08-29-goods-receipt-and-formal-grn.md`
4. `2026-08-29-receiving-continuations.md`
5. `2026-08-29-purchase-return.md`
6. `2026-08-29-cross-module-work-feed.md`
7. `2026-08-29-owner-visible-ui-and-production-rollout.md`

Each plan is independently testable. Plans 2–6 depend on Plan 1's authority/context contract. Plan 4 depends on Plan 3's persisted receipt outcomes. Plan 5 depends on Plan 4's authorised claim outcome. Plan 7 runs only after Plans 1–6 are merged and migration numbering has been reconciled.

## Integration Gate

- [ ] Fetch `origin/main` and PR #977; record their SHAs in the implementation work log.
- [ ] Rebase this branch after PR #977 is merged, or merge PR #977's head into the implementation branch if delivery sequencing requires one combined PR.
- [ ] Run `pnpm ci:migrations` and resolve every duplicate migration number before writing the first new SQL file.
- [ ] Keep `0400_operations_superuser_po_issue_authority.sql` and `0401_deliver_to_is_purchasing_settings.sql` content intact while renumbering them to the first free numbers after the integrated repository/branch maximum.
- [ ] Run `git diff --check` and `pnpm ci:migrations`; expected result: zero whitespace errors and `Migration checks passed`.

## Final Programme Gate

- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`; expected result: all commands exit 0.
- [ ] Open a PR with the seven plan slices represented by reviewable commits and passing CI.
- [ ] Merge only after CI and migration review pass.
- [ ] After the governed production migration approval/apply path completes, fetch main and wait for deployment convergence with `EXPECTED_SHA="$(git rev-parse origin/main)" pnpm ci:smoke`.
- [ ] Complete the real-account owner walk in Plan 7 and attach before/after evidence to the delivery record.
- [ ] Update `docs/purchasing/MASTER.md` from approved-target wording to production-verified wording only after that walk passes.
