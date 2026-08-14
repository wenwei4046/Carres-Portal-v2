# Carres ERP UI Master Touch-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sales Orders the production reference implementation for the governed ERP Shell, Register, and Object Detail/Edit templates without changing verified Sales Order business writers.

**Architecture:** Recompose existing production-backed components and queries. Keep `DataGrid`, Sales Order APIs, cancellation, revision/history, route, and PDF writers intact; change only presentation, navigation grouping, rail projections, and reusable shell contracts. Add behavior-focused tests before each implementation change, then verify the authenticated deployed UI before recording closure in the two authoritative MASTER files.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query, Vitest/Testing Library, Playwright, pnpm workspace, Cloudflare production pipeline.

**Spec:** Owner acceptance findings in the 2026-08-14 build request; repository authority in `CLAUDE.md`, `docs/ui/MASTER.md`, `docs/orders/MASTER.md`, `docs/ERP-ARCHITECTURE.md`, `docs/COPY-STANDARD.md`, and `docs/01-design-tokens.md`.

## Global Constraints

- Preserve production-verified Sales Order contracts, APIs, writers, permissions, cancellation, revisions/history, route, and PDF semantics.
- Ignore Scan Order/Intake and do not add schema migrations.
- Render only real governed destinations; retain Old Orders until cutover authority proves removal safe.
- Reuse Carres UI tokens and shared components; do not copy 2990 visual tokens.
- Header-column filters remain the sole direct filtering door; outputs remain truthful for filtered and selected states.
- Update MASTER closure only after authenticated production verification.
- Use one reusable Object Header grammar across View, Edit, Revisions, History, and Order Route: one owning-register back destination, persistent object identity, governed actions, and applicable object tabs.
- Keep Order Route read-only and fact-derived; present simultaneous per-goods routes before a compact authoritative obligation checklist, without an invented overall status or manual completion writer.
- Keep one central Settings Workspace. Default module settings presentation is readable summaries with focused item editing, never raw config structures.

---

### Task 1: Register template correction

**Files:**
- Modify: `apps/web/src/pages/operation/SalesOrdersRegister.test.tsx`
- Modify: `apps/web/src/pages/operation/SalesOrdersRegister.tsx`
- Modify: `apps/web/src/components/register/DataGrid.test.tsx`
- Modify: `apps/web/src/components/register/DataGrid.tsx`
- Modify: `apps/web/src/components/register/DataGrid.module.css`

**Interfaces:**
- Consumes: existing `DataGrid` filtered/selected row projections and Sales Order row model.
- Produces: compact governed toolbar slots and category-grouped goods disclosure without changing export data.

- [ ] Write failing tests for removal of permanent scope/duplicate filter/count copy, compact output, page-level create hierarchy, name-only customer cells, and known-category goods groups.
- [ ] Run focused tests and confirm failures are caused by the rejected presentation.
- [ ] Implement the minimal shared-grid and Sales Orders composition changes.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit the register slice.

### Task 2: Object Detail/Edit template correction

**Files:**
- Modify: `apps/web/src/pages/operation/SalesOrderWorkspace.test.tsx`
- Modify: `apps/web/src/pages/operation/SalesOrderWorkspace.tsx`
- Modify: `apps/web/src/pages/operation/SalesOrderTabs.test.tsx`
- Modify: `apps/web/src/pages/operation/SalesOrderTabs.tsx`

**Interfaces:**
- Consumes: existing detail/update/cancel/revision/history/route/PDF functions.
- Produces: one persistent object identity, exact four-item object navigation, readable view/PDF split, and contextual edit actions with unsaved-change protection.

- [ ] Write failing tests for the governed identity/nav/action grammar, quiet edit copy, `Discard`, address preview, source request wording, and persistent context in edit.
- [ ] Run focused tests and confirm expected failures.
- [ ] Recompose the workspace without changing writer payloads or permission checks.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit the object template slice.

### Task 3: ERP Shell V1 left navigation

**Files:**
- Modify: `apps/web/src/pages/portal/PortalSidebar.test.tsx`
- Modify: `apps/web/src/pages/portal/portal-nav.ts`
- Modify: `apps/web/src/pages/portal/PortalSidebar.tsx`

**Interfaces:**
- Consumes: current role-filtered real routes and badge queries.
- Produces: responsibility-grouped navigation labels over the same existing destinations.

- [ ] Write failing tests for governed group headings, real destinations, Catalog naming, and retained temporary Old Orders access.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement grouped navigation while preserving role/route behavior.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit the sidebar slice.

### Task 4: ERP Shell V1 right quick rail

**Files:**
- Modify/Create: `apps/web/src/pages/operation/components/OperationRightRail.test.tsx`
- Modify: `apps/web/src/pages/operation/components/OperationRightRail.tsx`
- Modify: `apps/web/src/pages/operation/components/rail/TeamPanel.tsx`
- Modify: `apps/web/src/pages/operation/components/rail/CalendarPanel.tsx`
- Modify: `apps/web/src/pages/operation/components/rail/TasksPanel.tsx`
- Modify: `apps/web/src/pages/operation/components/GlobalActivity.tsx`
- Modify relevant focused tests beside those components.

**Interfaces:**
- Consumes: existing staff, calendar, work/task, activity, and object-link data; no new writer.
- Produces: `Team | Calendar | My Work | Activity` quick-peek semantics with independent scrolling and a governed 320–360px panel.

- [ ] Write failing tests for labels/order, meaningful badge behavior, ERP-wide summaries, action-taxonomy removal, work grouping/copy, and compact activity filters.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement presentation/projection changes using existing queries and deep-links.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit the rail slice.

### Task 5: Per-goods Order Route presentation

**Files:**
- Modify: `apps/web/src/pages/operation/SalesOrderWorkspace.ui-contract.test.ts`
- Modify: `apps/web/src/pages/operation/SalesOrderWorkspace.test.tsx`
- Modify: `apps/web/src/pages/operation/SalesOrderWorkspace.tsx`
- Modify only if the existing projection cannot express a truthful item grouping: `packages/shared/src/sales-order-route.ts` and its focused tests.

**Interfaces:**
- Consumes: the existing production-verified Order Route read projection and owning-module URLs.
- Produces: one route section per actual goods/category/item scope, truthful stage labels and `CURRENT` position, clickable document identifiers, and a secondary `Still owed` checklist.

- [ ] Add failing contract/render tests that reject dashboard-card lineage and require multiple simultaneous item routes, truthful missing-stage copy, `CURRENT`, owning-object links, and a compact meaningful-only obligation checklist.
- [ ] Run the focused tests and confirm the current card presentation fails them.
- [ ] Extract a focused route renderer if needed and recompose the existing projection without changing its fetches, ownership, or writers.
- [ ] Run the focused route/workspace tests and confirm they pass.
- [ ] Commit the Order Route presentation slice.

### Task 6: Central Settings and readable Sales Order Settings

**Files:**
- Modify: `apps/web/src/pages/operation/SettingsWorkspace.tsx`
- Modify/create focused test: `apps/web/src/pages/operation/SettingsWorkspace.test.tsx`
- Modify: `apps/web/src/pages/operation/SalesOrderSettings.tsx`
- Modify: `apps/web/src/pages/operation/SalesOrderSettings.test.tsx`
- Modify: `apps/web/src/pages/operation/OrderEntryPage.tsx`
- Modify focused tests beside `OrderEntryPage` only where interaction ownership changes.

**Interfaces:**
- Consumes: the existing production-verified Sales Order config query/writer, validation, permissions, and real Settings destinations.
- Produces: permission-filtered central module navigation plus reusable `group -> summary item -> focused Edit -> Save/Cancel/Discard` settings grammar.

- [ ] Add failing tests for real-only central Settings destinations, readable group/summary presentation, one-item focused edit, edit-only Save/Cancel/Discard, and preserved permission/validation behavior.
- [ ] Add a failing terminology test that rejects `Add follow-up` and requires the exact config meaning established from the data contract.
- [ ] Verify the config writer semantics, including whether changes affect new orders only, and encode only supportable explanatory copy in the test.
- [ ] Implement the summary/edit grammar over the existing writer and rename the nested config field action truthfully.
- [ ] Run focused Settings and Order Entry tests and confirm they pass.
- [ ] Commit the Settings presentation slice.

### Task 7: Reusable template contracts and authority update

**Files:**
- Modify: `apps/web/src/pages/operation/SalesOrderWorkspace.ui-contract.test.ts`
- Modify: `docs/ui/MASTER.md`
- Modify: `docs/orders/MASTER.md`

**Interfaces:**
- Consumes: the implemented Object Header and Settings components.
- Produces: reusable PO/GRN/etc object-header and future-module Settings laws without claiming unbuilt destinations.

- [ ] Add/strengthen source contracts that prevent Sales Order-only hardcoding in the reusable object header and prevent raw default config editing.
- [ ] Record the owner-approved corrections as current authority while leaving production-closure claims pending.
- [ ] Run the focused source contracts and documentation consistency checks.
- [ ] Commit the reusable-template authority slice.

### Task 8: Gates, release, production proof, and authoritative closure

**Files:**
- Modify after production proof: `docs/ui/MASTER.md`
- Modify after production proof: `docs/orders/MASTER.md`

**Interfaces:**
- Consumes: repository CI/deploy workflow and authenticated production account already configured by the project.
- Produces: merged/deployed implementation plus dated production evidence in the two current-truth MASTER files.

- [ ] Run focused UI tests, full tests, lint, typecheck, build, migration gate, and relevant Playwright checks.
- [ ] Inspect the final diff against every owner acceptance item and production-contract non-goal.
- [ ] Push a branch, create the PR, satisfy required CI, merge, and follow the repository deployment path.
- [ ] Verify authenticated production at desktop size for Register, expansion, output/columns/filter, Object View/Edit/Revisions/History/Order Route, per-goods route and `Still owed`, central Settings navigation, Sales Order Settings summary/edit interaction and terminology, grouped sidebar, and all rail panels.
- [ ] Only after proof, overwrite `docs/ui/MASTER.md` and `docs/orders/MASTER.md` with the verified current truth; repeat PR/CI/merge/deploy if repository policy requires documentation through the same gate.
- [ ] Run the final production smoke and capture deploy/commit proof.
