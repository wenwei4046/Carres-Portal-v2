# Cross-Module Work Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make My Work and Team Work answer who must do what, on which governed day, where to act, what evidence closes it, and what the completion changes across Purchasing, Receiving, Claims, and Purchase Returns.

**Architecture:** Module engines continue to determine whether an action is open and which module fact closes it. A typed `ModuleWorkItem` contract carries action, owner rule/context, due calendar/date, completion fact, and destination. One read-only API composes module projections. `useOpenWorkSet` combines that feed with existing Order work; Work renders and deep-links without writing module truth.

**Tech Stack:** TypeScript, Hono, React Query, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-purchasing-receiving-work-design.md` §§2–5, 8–9.

## Global Constraints

- Module work has no manual `Done` button. It disappears only when the owning module's completion fact exists.
- My Work is the default view for every user, including managers. Team Work is the supervision view.
- A Purchasing chase row deep-links the exact Purchase Order. A Receiving row deep-links the exact
  PO/Receiving Session. Other rows open Supplier Claims or Purchase Returns according to source;
  Work never redirects every item to Sales Orders and never owns completion.
- The module rail's first panel is `WORK TO DO`, filtered to the current module. It is not a second queue and uses the same feed/counts as Work.
- Due dates name Office or Warehouse calendar explicitly. Late work keeps its original due date.

---

## Task 1: Define a typed module-work projection

**Files:**
- Create: `packages/shared/src/module-work-feed.ts`
- Create: `packages/shared/src/module-work-feed.test.ts`
- Modify: `packages/shared/src/work-engine.ts`
- Modify: `packages/shared/src/work-engine.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] Write failing tests for the five-part contract plus destination and evidence requirement.
- [ ] Add:

```ts
export type WorkCalendar = "office" | "warehouse";
export type WorkModule = "orders" | "purchasing" | "receiving" | "claims" | "purchase_returns";

export interface ModuleWorkItem {
  id: string;
  module: WorkModule;
  ruleKey: string;
  sourceId: string;
  ownerRule: WorkOwnerRule;
  owner: OperationsAuthorityPerson | null;
  action: string;
  dueIso: string | null;
  calendar: WorkCalendar;
  completionFact: string;
  evidenceRequired: boolean;
  destination: string;
  party: string | null;
}
```

- [ ] Extend `WorkOwnerRule` with only the rules needed by approved module actions; do not add names/emails to rule keys.
- [ ] Add validators that reject empty action, completion fact, destination, or an invalid date/calendar combination.
- [ ] Run `pnpm --filter @carres/shared test -- src/module-work-feed.test.ts src/work-engine.test.ts`; expected result: pass.
- [ ] Commit: `git add packages/shared && git commit -m "test(work): define cross-module action projection"`.

## Task 2: Make each module project its own open work

**Files:**
- Modify: `packages/shared/src/purchasing-supplier-calls.ts`
- Modify: `packages/shared/src/purchasing-supplier-calls.test.ts`
- Create: `packages/shared/src/receiving-work.ts`
- Create: `packages/shared/src/receiving-work.test.ts`
- Modify: `packages/shared/src/supplier-claim.ts`
- Modify: `packages/shared/src/supplier-claim.test.ts`
- Modify: `packages/shared/src/purchase-return.ts`
- Modify: `packages/shared/src/purchase-return.test.ts`

- [ ] Add failing projection tests for:
  - Issue PO;
  - confirm ready/arrival/balance date;
  - receive/post GRN on Warehouse-calendar arrival date;
  - claim request/response next action;
  - return collection date and physical handover.
- [ ] Keep trigger and completion decisions in their current module functions; add adapters that shape open facts into `ModuleWorkItem` rather than reimplementing triggers in Work.
- [ ] Set destinations to canonical routes with source IDs in query/path parameters.
- [ ] Assert `not_delivered` projects balance-date work, not a claim; Warehouse `submitted` projects GRN review/post, not a completed receipt.
- [ ] Run the four module test files; expected result: pass.
- [ ] Commit: `git add packages/shared && git commit -m "feat(work): project purchasing receiving and claim actions"`.

## Task 3: Add one read-only composed Work API

**Files:**
- Create: `apps/api/src/routes/operation/work.ts`
- Create: `apps/api/src/routes/operation/work.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] Write failing route tests for `GET /api/operation/work?scope=mine|team&module=...` covering ordinary user, manager, duty owner, dated cover, Operations Superuser, due dates, and deep links.
- [ ] Query authoritative PO/promise, receipt, claim, return, roster/cover, staff, Settings/calendar facts and pass them into the shared projectors.
- [ ] Resolve owner context by rule and relevant action date. A Superuser does not own all work; ownership remains normal duty/cover.
- [ ] For `scope=mine`, use the active cover when one exists; otherwise use the normal owner. Keep the normal owner as accountability context, but do not duplicate one action into both people's My Work. Superuser capability does not automatically make every action My Work.
- [ ] For `scope=team`, require manager/supervision authority and return the same item identities grouped client-side.
- [ ] Apply optional `module` as a response filter only; do not create separate module counts.
- [ ] Run `pnpm --filter @carres/api test -- src/routes/operation/work.test.ts`; expected result: pass.
- [ ] Commit: `git add apps/api && git commit -m "feat(work): expose one composed module feed"`.

## Task 4: Make Work consume the feed and deep-link correctly

**Files:**
- Modify: `apps/web/src/pages/operation/use-open-work.ts`
- Modify: `apps/web/src/pages/operation/OperationWork.tsx`
- Modify: `apps/web/src/pages/operation/OperationWork.test.tsx`
- Modify: `apps/web/src/lib/queries.ts`
- Modify: `apps/web/src/pages/operation/components/rail/TeamPanel.tsx`
- Modify: `apps/web/src/pages/operation/components/rail/TeamPanel.test.tsx`

- [ ] Write failing tests proving managers still land on My Work, Team Work uses the same item IDs/counts, and each module item opens its own destination.
- [ ] Add `useOperationWork(scope, module?)`; merge module items with existing order items by stable `id`, never by display sentence.
- [ ] Replace the current `all rows open Sales Order` callback with `navigate(item.destination)`.
- [ ] Keep Team Work as a view switch, not the default for managers.
- [ ] Make TeamPanel counts derive from the same cached Work query rather than `useOperationOrders()`.
- [ ] Run the Work and TeamPanel tests; expected result: pass.
- [ ] Commit: `git add apps/web && git commit -m "feat(work): show cross-module daily actions"`.

## Task 5: Put contextual WORK TO DO first in module rails

**Files:**
- Create: `apps/web/src/pages/operation/components/rail/ModuleWorkPanel.tsx`
- Create: `apps/web/src/pages/operation/components/rail/ModuleWorkPanel.test.tsx`
- Modify: `apps/web/src/pages/operation/so-batch/SoBatchRegister.tsx`
- Modify after PR #977 integration: `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx`
- Modify: `apps/web/src/pages/operation/OperationReceiving.tsx`
- Modify: `apps/web/src/pages/operation/OperationSupplierClaims.tsx`
- Modify: `apps/web/src/pages/operation/PurchaseReturnsRegister.tsx`
- Modify corresponding page tests.

- [ ] Write failing tests asserting `WORK TO DO` is the first contextual rail panel and contains only current-module items from the one Work query.
- [ ] Reuse one `ModuleWorkPanel` with module prop; no page-local action computation.
- [ ] Keep SO Batch's operational filters below it. Do not insert PO Duty as a permanent rail block.
- [ ] Clicking an item opens its governed destination. `View all` opens My Work with the module filter.
- [ ] Run the component and five page tests; expected result: pass.
- [ ] Commit: `git add apps/web && git commit -m "feat(work): lead module rails with daily actions"`.

## Task 6: Work slice verification

- [ ] Run targeted shared, API, Work, TeamPanel, and module-page tests.
- [ ] Run `pnpm typecheck` and `pnpm lint`.
- [ ] Search `rg -n "workItemsForOrder|useOperationOrders" apps/web/src/pages/operation/components/rail apps/web/src/pages/operation/OperationWork.tsx`; verify no second team count remains.
- [ ] Search for module work completion buttons; expected result: no generic manual completion mutation.
- [ ] Commit verification corrections with `git commit -m "test(work): verify one cross-module work set"`.
