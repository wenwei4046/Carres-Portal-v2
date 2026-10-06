# Delivery Work Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the existing Delivery page as the approved Delivery Work surface that tells inexperienced staff, by actual calendar date, what happened and what to do.

**Architecture:** Keep the current order queries, shared Work Engine calculations, Calendar pane, Delivery detail and authoritative Order drawer. Replace only the page composition and queue-row presentation with the governed Destination Header, 45px Work Toolbar and date-grouped work surface; do not add a second action engine or backend write door.

**Tech Stack:** React 18, TypeScript, Tailwind tokens, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/delivery/MASTER.md` and `docs/ui/MASTER.md`

## Global Constraints

- Header says `Delivery Work`; no breadcrumb, repeated icon or `Today` label.
- Employee UI never displays generic `Due`, `Next Action` or `Priority`.
- Work is grouped by actual weekday + date; current-year format omits the year.
- Each row separates the missing/current fact from one concrete action sentence.
- Existing shared Work Engine facts and completion routes remain authoritative.
- No New DO, Issue, Release, Approve or Request Delivery Order control.
- Use existing Carres tokens and components only.

---

### Task 1: Pin the Delivery Work contract with tests

**Files:**
- Modify: `apps/web/src/pages/operation/OperationDelivery.test.tsx`

**Interfaces:**
- Consumes: existing mocked operation orders, partners and stock queries.
- Produces: UI assertions for `Delivery Work`, actual date grouping, simple action copy and banned-word absence.

- [ ] Add a test asserting the destination header says `Delivery Work` and the page has no `Operations` breadcrumb or `Today` label.
- [ ] Add a dated-row test asserting a visible weekday/date group and one concrete action sentence.
- [ ] Add assertions that ordinary page text does not contain `Due`, `Next Action` or `Priority`.
- [ ] Run `pnpm --filter @carres/web test -- OperationDelivery.test.tsx` and confirm the new assertions fail before implementation.

### Task 2: Apply the governed shell and toolbar

**Files:**
- Modify: `apps/web/src/pages/operation/OperationDelivery.tsx`

**Interfaces:**
- Consumes: `ModuleHeader`, existing Queues/Calendar view state, existing facets and detail panes.
- Produces: 50px `Delivery Work` destination header and one 45px toolbar without create controls.

- [ ] Replace `ListPageShell` title/breadcrumb composition with a full-height page wrapper and `ModuleHeader` using `destinationHeader`.
- [ ] Render one 45px toolbar containing the existing view selector and truthful current-view count.
- [ ] Keep global Jump to, alerts, help and settings through `ModuleHeader`.
- [ ] Keep existing facet, Calendar and detail capabilities inside the work surface; do not create a second route or endpoint.

### Task 3: Replace generic deadline rows with guided dated work

**Files:**
- Modify: `apps/web/src/pages/operation/OperationDelivery.tsx`
- Test: `apps/web/src/pages/operation/OperationDelivery.test.tsx`

**Interfaces:**
- Consumes: `DeliveryRow.dueIso`, booking/promised date facts and `orderActionLine`.
- Produces: stable date grouping plus `whatHappened` and `whatToDo` display strings.

- [ ] Derive each work date from the governed action date, then booking date, then promised customer date; unresolved dates render in a named `Date not set` group rather than a blank or guessed date.
- [ ] Map each existing delivery action key to one primary-school-English fact and concrete instruction without changing trigger/completion logic.
- [ ] Group queue rows under formatted actual date headings.
- [ ] Remove action pills and inline `Due` text; render object identity, factual reason and concrete action as separate visual ranks.
- [ ] Keep row selection opening the existing Delivery detail; the existing authoritative drawer remains the completion route.

### Task 4: Verify no capability regression

**Files:**
- Test: `apps/web/src/pages/operation/OperationDelivery.test.tsx`

**Interfaces:**
- Consumes: completed Delivery Work page.
- Produces: passing focused tests, typecheck and build evidence.

- [ ] Run the focused Delivery test file.
- [ ] Run the web TypeScript check.
- [ ] Run the web production build.
- [ ] Run `git diff --check` and inspect the final diff for runtime files outside this first-page scope.
- [ ] Update `docs/delivery/MASTER.md` only with validated implementation evidence; do not change approved business rules.
