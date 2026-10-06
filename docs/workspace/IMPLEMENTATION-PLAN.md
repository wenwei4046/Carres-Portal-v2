# Workspace Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the governed Workspace Work feed and responsive three-panel Work page, including
rule-admitted owning-module actions, without duplicating module truth or admitting unqualified queues.

**Architecture:** Owning modules continue to project open occurrences. A permission-scoped API
envelope isolates each admitted source, resolves owner/calendar/timing once, and supplies all facts
needed by Work, Team Work and Right Rail. The React page only filters, selects and presents that
response; it never recomputes triggers, completion, ownership or business dates.

**Tech Stack:** TypeScript, Zod, Hono/Cloudflare Workers, React 18, TanStack Query, React Router,
Vitest/Testing Library, Playwright, existing Carres UI kit and Tailwind tokens.

**Spec:** `docs/workspace/MASTER.md` §§1–7, especially §§5–6.

## Global Constraints

- Production code must follow `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md`, `docs/ui/MASTER.md`,
  `docs/01-design-tokens.md` and `docs/COPY-STANDARD.md`.
- Every occurrence declares `embedded`, `open_module` or `read_only`. Embedded actions reuse the
  owning component/API/permission/evidence/completion law; Workspace owns no substitute form.
- Delivery proof review is the first embedded vertical slice. No second embedded action is admitted
  until it passes permission, stale-version, idempotency, uncertain-response and feed-closure tests.
- Only Sales Orders, Purchasing, Receiving, Delivery, Payment and Issue Tracker are admitted.
- Warehouse Outbound, Service Case and Claims remain absent from items, filters and counts.
- `requiredResult`, machine `completionPredicate` and operator-safe `completionStatement` remain
  separate fields. UI never prints a database predicate.
- All day/module/owner totals derive from the same authorised returned item set.
- A failed source cannot erase healthy items or become zero.
- Khor Yee is disabled. Do not hard-code Shasha, Yu Jun or any staff identity into code or fixtures
  outside explicit test data.
- The rejected files under `docs/prototypes/` are not implementation authority and are not committed.
- Every task uses test-first changes and ends in a reviewable commit. Do not merge or deploy as part
  of this plan; deployment requires a separately authorised production step.

---

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/operation-work.ts` | Versioned Work transport schemas and shared types |
| `packages/shared/src/operation-work.test.ts` | Schema, identity and predicate/display separation |
| `apps/api/src/routes/operation/work.ts` | Per-source reads, projection, permission scope and response composition |
| `apps/api/src/routes/operation/work.test.ts` | Partial-source health, dedupe, counts and refusal contract |
| `apps/web/src/pages/operation/use-open-work.ts` | Thin typed adapter over the one cached response |
| `apps/web/src/pages/operation/work/work-model.ts` | Pure authorised filtering, week/day grouping and selection fallback |
| `apps/web/src/pages/operation/work/work-model.test.ts` | Reconciliation and calendar-aware model tests |
| `apps/web/src/pages/operation/work/WorkSplitShell.tsx` | Three/two/one-panel geometry only |
| `apps/web/src/pages/operation/work/WorkDayNav.tsx` | Supplied weekday/module/owner navigation and counts |
| `apps/web/src/pages/operation/work/WorkActionRow.tsx` | Governed two-line selectable action row |
| `apps/web/src/pages/operation/work/WorkActionPanel.tsx` | Structured selected-action detail and governed module-action host |
| `apps/web/src/pages/operation/OperationWork.tsx` | URL state and assembly of the four page-specific components |
| `apps/web/src/pages/operation/OperationWork.test.tsx` | Page states, scopes, URL restoration and access tests |
| `apps/web/src/pages/operation/components/OperationRightRail.tsx` | Same-feed My Work summary and deep links |
| `apps/web/src/pages/operation/components/OperationRightRail.ui-contract.test.ts` | Rail reconciliation and link contract |
| `apps/web/src/dev/work-preview.tsx` | Governed visual fixtures for measured review only |
| `e2e/workspace-work.spec.ts` | Authenticated desktop/mobile journeys and deep links |

### Task 1: Version the authoritative Work transport

**Files:**
- Modify: `packages/shared/src/operation-work.ts`
- Modify: `packages/shared/src/operation-work.test.ts`

**Interfaces:**
- Produces: `OperationWorkResponse`, `OperationWorkItem`, `OperationWorkSourceHealth`.
- `OperationWorkItem` adds `contractVersion: 2`, `completionStatement`, structured timing/calendar,
  optional communication/blocker/next consequence and `observedAt`.
- `OperationWorkResponse` adds `complete` and `sources`; every visible count derives from validated
  authorised `items`, never from a transported second total.
- The strict v2 extension requires one viewer-resolved `interaction` on every occurrence and allows
  one source-versioned `closureReceipt` on the response. Until capability resolution is built, every
  projector defaults truthfully to `open_module`; no client may infer `embedded` from the rule key.

- [x] **Step 1: Write failing schema tests**

Add fixtures proving: machine predicate containing `warehouse_receipts` is accepted but never used as
`completionStatement`; Saturday business deadline and Friday action date coexist; calendar
`not_configured` differs from `read_failed`; communication and next consequence are optional; a
source health row is required for every admitted source represented by the response.

```ts
expect(operationWorkItemSchema.parse(fixture)).toMatchObject({
  contractVersion: 2,
  requiredResult: "GRN posted",
  completionPredicate: "warehouse_receipts + receiving_events posted",
  completionStatement: "The GRN is posted",
  timing: { businessDueOn: "2026-09-19", actionOn: "2026-09-18" },
});
```

- [x] **Step 2: Run the shared contract test and confirm failure**

Run: `pnpm --filter @carres/shared test -- operation-work.test.ts`

Expected: FAIL because contract v2 fields and source health do not exist.

- [x] **Step 3: Add strict v2 schemas and exported inferred types**

Use enums for source state (`healthy | delayed | failed`) and calendar state
(`ready | not_configured | read_failed`). Keep `operationWorkStableId()` unchanged. Rename the
transport field `completionFact` to `completionPredicate`; do not keep two public names for it.
Require an operator-safe `completionStatement` from each projector adapter.

- [x] **Step 4: Run shared tests and typecheck**

Run: `pnpm --filter @carres/shared test -- operation-work.test.ts && pnpm --filter @carres/shared typecheck`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/operation-work.ts packages/shared/src/operation-work.test.ts
git commit -m "feat(work): version authoritative work contract"
```

### Task 2: Make source composition partial-failure safe

**Files:**
- Modify: `apps/api/src/routes/operation/work.ts`
- Modify: `apps/api/src/routes/operation/work.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas.
- Produces: `loadWorkSource(key, loader)` returning `{ health, items }` without swallowing auth
  refusal, and `composeOperationWorkResponse(sourceResults, staff, generatedOn)`.

- [ ] **Step 1: Write failing API composition tests**

Cover six admitted source keys, one failed/others healthy, duplicate stable ID, invalid projector
data, permission refusal and last-safe delayed data. Assert `complete === false`, healthy actions
remain and a failed source has no invented zero.

```ts
expect(body).toMatchObject({
  complete: false,
  sources: expect.arrayContaining([{ key: "receiving", state: "failed" }]),
});
expect(body.items.map((item) => item.module)).toContain("payment");
```

- [ ] **Step 2: Run the focused API test and confirm failure**

Run: `pnpm --filter @carres/api test -- src/routes/operation/work.test.ts`

Expected: FAIL because `Promise.all` rejects the whole feed and no envelope exists.

- [ ] **Step 3: Introduce named source boundaries**

Replace the single undifferentiated `Promise.all` with named admitted-source loaders. Shared reads
used by more than one projector may be fetched once, but each output source receives its own health
record. Authentication/authorisation failures still fail the whole request; operational source
failures become safe `failed` health records. Do not add Warehouse, Claims or Service projections.

- [ ] **Step 4: Compose one reconciled response**

Deduplicate only by stable occurrence ID, validate every healthy source item and attach observation
timestamps. Consumers derive counts from the validated authorised array. A missing source result is a
schema error, never an empty source.

- [ ] **Step 5: Run API and shared Work tests**

Run: `pnpm --filter @carres/api test -- src/routes/operation/work.test.ts && pnpm --filter @carres/shared test -- operation-work.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/operation/work.ts apps/api/src/routes/operation/work.test.ts
git commit -m "feat(work): isolate admitted source failures"
```

### Task 3: Supply governed calendar and readable completion facts

**Files:**
- Create: `supabase/migrations/0516_people_owns_normal_work_week.sql`
- Create: `packages/shared/src/people-work-week.ts`
- Create: `packages/shared/src/people-work-week.test.ts`
- Modify: `apps/api/src/routes/hr-people.ts`
- Modify: `apps/api/src/routes/hr-people.test.ts`
- Modify: `apps/api/src/routes/operation/work.ts`
- Modify: `apps/api/src/routes/operation/work.test.ts`
- Modify projector tests in the owning module only where their contract is incomplete.

**Interfaces:**
- Consumes: module rule, business deadline, Duty resolution and named calendar source.
- Produces per item: `businessDueOn`, `actionOn`, `calendar`, `completionStatement` and explicit
  no-date/no-eligible-actor state.

- [ ] **Step 1: Add failing examples for Friday Payment, Saturday physical work and calendar gaps**

Assert Saturday Payment deadline → Friday action; authorised Saturday Receiving/Delivery stays
Saturday; no eligible actor stays Saturday with `no_eligible_actor`; missing personal calendar is
`not_configured`, not Monday–Friday by default; read failure carries no invented missed age.

- [ ] **Step 2: Add the People-owned normal work week**

Migration `0516_people_owns_normal_work_week.sql` stores validated weekday eligibility against the
internal person record, exposes it through the existing HR People read/write boundary, and audits
changes. `people-work-week.ts` parses weekday numbers without a default. Staff & Duties reads the
resolved result only; it does not gain an editor for this People fact.

- [ ] **Step 3: Add operator-safe completion statements beside each admitted projection**

Examples must be business language (`The GRN is posted`, `The customer-confirmed date and slot are
recorded`, `The outstanding balance is RM 0`). Keep predicates unchanged for closure. Do not copy
the current predicate string into UI data and do not equate a multi-result `requiredResult` with
closure unless the owning module explicitly defines them as identical.

- [ ] **Step 4: Resolve timing through named calendars**

Use module calendar plus resolved acting-person work eligibility. Return the explicit health gap
when personal Saturday eligibility is unavailable. Never add `Saturday Duty` or a Site queue.

- [ ] **Step 5: Run People, API and all touched projector suites**

Run: `pnpm --filter @carres/shared test -- people-work-week.test.ts && pnpm --filter @carres/api test -- src/routes/hr-people.test.ts src/routes/operation/work.test.ts`

Expected: PASS with no raw table name present in any `completionStatement`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0516_people_owns_normal_work_week.sql packages/shared/src/people-work-week.ts packages/shared/src/people-work-week.test.ts apps/api/src/routes/hr-people.ts apps/api/src/routes/hr-people.test.ts apps/api/src/routes/operation/work.ts apps/api/src/routes/operation/work.test.ts
git commit -m "feat(work): project governed calendar and completion copy"
```

### Task 4: Add permission-scoped My Work access

**Files:**
- Modify: `apps/api/src/lib/auth-guards.ts`
- Modify: `apps/api/src/routes/operation/work.ts`
- Modify: `apps/api/src/routes/operation/work.test.ts`

**Interfaces:**
- Produces a Work read guard for active internal roles and an explicit `scope=mine|team` request.
- `mine` returns only acting-person occurrences and authorised source health; `team` remains limited
  to Principal, Operation and Jess's governed access and still honours module permissions.

- [ ] **Step 1: Write failing role/scope tests**

Prove Sales and Finance can read only their own routed occurrences, an unrelated person/object/count
is absent, authorised Team Work can read its scoped set, and widening Work never widens the returned
module deep-link permission.

- [ ] **Step 2: Replace `requireOperation` on the Work read with the scoped guard**

Do not elevate internal module calls. Source adapters must read only facts the caller may access or
use an existing governed server projection that performs its own row-level permission filtering.

- [ ] **Step 3: Run API auth and Work tests, then commit**

```bash
pnpm --filter @carres/api test -- src/routes/operation/work.test.ts
git add apps/api/src/lib/auth-guards.ts apps/api/src/routes/operation/work.ts apps/api/src/routes/operation/work.test.ts
git commit -m "feat(work): scope my work access by actor"
```

### Task 5: Close shared UI-kit prerequisites

**Files:**
- Create: `apps/web/src/components/kit/Avatar.tsx`
- Create: `apps/web/src/components/kit/Avatar.test.tsx`
- Modify: `apps/web/src/components/kit/index.ts`

**Interfaces:**
- Produces one `Avatar` initials algorithm with full name available on hover, focus and tap.
- Work status sentences remain wrapping text; they do not use truncating `StatusPill`.
- `Clear all` is a page-owned governed Button and requires no PageShell fork.

- [ ] **Step 1: Write failing Avatar behaviour tests**

Prove `Shasha` resolves consistently, multi-part names use the governed initials rule, accessible
name is the full person, keyboard focus exposes the same evidence as hover, and historical departed
people can render without becoming selectable owners.

- [ ] **Step 2: Implement Avatar using frozen tokens and Tooltip**

Do not copy one of the seven page-local recipes. Export it through the existing kit barrel and add
no Work-specific business words.

- [ ] **Step 3: Run kit tests and design-standard check, then commit**

```bash
pnpm --filter @carres/web test -- src/components/kit/Avatar.test.tsx
node scripts/check-design-standard.mjs
git add apps/web/src/components/kit/Avatar.tsx apps/web/src/components/kit/Avatar.test.tsx apps/web/src/components/kit/index.ts
git commit -m "feat(ui): govern shared staff avatar"
```

### Task 6: Replace the browser model with one reconciled week model

**Files:**
- Modify: `apps/web/src/pages/operation/use-open-work.ts`
- Modify: `apps/web/src/pages/operation/work/work-model.ts`
- Modify: `apps/web/src/pages/operation/work/work-model.test.ts`

**Interfaces:**
- Consumes: unchanged `useOperationWork()` cache identity and Tasks 1–4 response/scope.
- Produces: pure `buildWorkView(response, urlState, signedInUserId)` with day/module/owner groups,
  selected occurrence fallback and visible health; it does not calculate business dates.

- [ ] **Step 1: Write failing reconciliation tests**

Test My Work acting-person routing, Team Work normal-owner grouping, cover labels, Monday–Friday
always present, conditional Saturday, no-working-date, missed ordering, admitted module filter,
combined URL filters, source-failed visibility and selected-row closure fallback. First open shows
`Missed` plus the current governed day, or the next eligible day when a named public holiday admits
no operation, without duplicating an occurrence.

- [ ] **Step 2: Run model tests and confirm failure**

Run: `pnpm --filter @carres/web test -- src/pages/operation/work/work-model.test.ts`

- [ ] **Step 3: Implement the pure model and thin adapter**

Remove legacy `overdue/today/later` bucket ownership from the UI model. Consume server action dates,
calendar state and counts. Never expose `claims`, `stock` or `service_case` as filter options.

- [ ] **Step 4: Prove every visible total reconciles**

For each fixture, assert day totals, module totals, owner totals and visible rows are projections of
the same array. Assert incomplete health prevents true-empty wording.

- [ ] **Step 5: Run model tests and commit**

```bash
pnpm --filter @carres/web test -- src/pages/operation/work/work-model.test.ts
git add apps/web/src/pages/operation/use-open-work.ts apps/web/src/pages/operation/work
git commit -m "refactor(work): derive one reconciled week view"
```

### Task 7: Build the Work-specific presentation components

**Files:**
- Create: `apps/web/src/pages/operation/work/WorkSplitShell.tsx`
- Create: `apps/web/src/pages/operation/work/WorkDayNav.tsx`
- Create: `apps/web/src/pages/operation/work/WorkActionRow.tsx`
- Create: `apps/web/src/pages/operation/work/WorkActionPanel.tsx`
- Create focused `.test.tsx` files beside each component.

**Interfaces:**
- Consumes only Tasks 5–6 presentation/view data and callbacks.
- Hosts only contract-admitted owning-module mutation components and computes no business fact.

- [ ] **Step 1: Write component contract tests**

Assert panel landmarks and keyboard order; 13/11 two-line grammar; structured owner metadata;
wrapped content; completion statement (never predicate); optional communication and consequence;
all three interaction modes; one `Open {object}` fallback; hover/selected/focus states; no generic
WhatsApp, Copy, Record sent or Done.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm --filter @carres/web test -- src/pages/operation/work/WorkSplitShell.test.tsx src/pages/operation/work/WorkDayNav.test.tsx src/pages/operation/work/WorkActionRow.test.tsx src/pages/operation/work/WorkActionPanel.test.tsx`

- [ ] **Step 3: Implement with existing kit only**

Reuse `PageShell`, `Tabs`, `SearchInput`, `Select`, `Button`, `FilterRail`, `Loading`, `EmptyState`,
`Avatar`, `Badge`, `Tooltip` and Lucide icons. Apply MASTER §5.5 geometry: 240/360/remainder at
≥1104px Work canvas; 340/remainder at 768–1103px; one panel below 768px. Use tokens only.

- [ ] **Step 4: Run focused tests, typecheck and design-standard check**

Run: `pnpm --filter @carres/web test -- src/pages/operation/work && pnpm --filter @carres/web typecheck && node scripts/check-design-standard.mjs`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/operation/work
git commit -m "feat(work): add governed work presentation components"
```

### Task 7A: Admit Delivery proof review as the first embedded action

**Files:**
- Extract from: `apps/web/src/pages/operation/components/DeliveryEvidencePanel.tsx`
- Create: one owning Delivery proof-review component reused by Delivery and Work
- Modify: `apps/web/src/pages/operation/work/WorkActionPanel.tsx`
- Modify Delivery API/contract tests only where source-version or idempotency proof is missing.

- [ ] Prove the existing Delivery API owns permission, evidence, result and completion; add exact
  source-version refusal and idempotent repeat behaviour where absent.
- [ ] Extract one Delivery-owned component and render that same component in Delivery and Work.
- [ ] Test `Accept proof`, `Request more proof` and `Reject proof`, cover permission, stale version,
  duplicate submit, uncertain response, `Not confirmed · Try again`, refreshed-feed closure,
  compact 1440×900 primary-action visibility and automatic next-row selection.
- [ ] Keep supplier reply and every other mutation `open_module`.

**Admission audit — 2026-09-16:** the existing Delivery door already owns the three decisions,
Operation/Principal permission, exact DO/attempt binding, append-only actor/time history and the
source completion fact. `More Proof Required` and `Proof Rejected` require a reason; `Proof
Accepted` does not. It is not yet admissible in Work because the request carries no latest-evidence
source version, the SQL writer appends a duplicate review on repeat submission, the page form is
still private to `DeliveryEvidencePanel`, and the current accepted path saves immediately rather
than using the proposed choose-then-save interaction. Keep `check_delivery_proof` as
`open_module` until stale refusal, idempotent repeat, shared component and receipt tests all pass.

### Task 8: Assemble My Work and Team Work with URL-restorable state

**Files:**
- Modify: `apps/web/src/pages/operation/OperationWork.tsx`
- Modify: `apps/web/src/pages/operation/OperationWork.test.tsx`
- Modify: `apps/web/src/dev/work-preview.tsx`

**Interfaces:**
- Consumes Tasks 6–7.
- Produces query keys: `scope`, `week`, `day`, `module`, `owner`, `q`, `covered`, `blocked`,
  `waiting`, `source`, `selected`.

- [ ] **Step 1: Replace old-page tests with Blueprint journeys**

Test My Work default; Team visibility for Principal/Operation/Jess without permission expansion;
day then module filtering; owner group headers; active filters and Clear all; selection URL; Back/focus
restoration; loading, true empty, no match, partial/whole failure, calendar gaps, refusal and stale
selected action.

- [ ] **Step 2: Run the page suite and confirm failure**

Run: `pnpm --filter @carres/web test -- src/pages/operation/OperationWork.test.tsx`

- [ ] **Step 3: Assemble the page and remove legacy rendering**

Keep `OperationWork.tsx` as orchestration only. Opening a row selects its action panel. Embedded
mutation is owned by Task 7A; `open_module` navigates to `destination`; `read_only` exposes no fake
control. Use source-provided words and dates. Do not create local example records in production code.

- [ ] **Step 4: Update the dev preview with clearly labelled contract-v2 fixtures**

Include healthy, covered, not assigned, no eligible actor, partial failure and selected-closed states.
Fixtures may name fictional people only inside the preview/test file.

- [ ] **Step 5: Run page tests and commit**

```bash
pnpm --filter @carres/web test -- src/pages/operation/OperationWork.test.tsx
git add apps/web/src/pages/operation/OperationWork.tsx apps/web/src/pages/operation/OperationWork.test.tsx apps/web/src/dev/work-preview.tsx
git commit -m "feat(work): assemble my work and team work"
```

### Task 9: Reconcile Right Rail with the v2 feed

**Files:**
- Modify: `apps/web/src/pages/operation/components/OperationRightRail.tsx`
- Modify: `apps/web/src/pages/operation/components/OperationRightRail.ui-contract.test.ts`
- Modify if required: `apps/web/src/pages/operation/work-cache-isolation.test.tsx`

**Interfaces:**
- Consumes the exact existing `useOperationWork()` cache key and Task 6 selectors.
- Produces My Work counts/deep links only; no independent module reads.

- [ ] **Step 1: Add failing reconciliation tests**

Assert Rail counts equal My Work for the signed-in acting person, failed sources show incomplete
health rather than a lower total, and links restore the exact Work scope/day/filter URL. Keep Team
Work and Duty editing out of the Rail.

- [ ] **Step 2: Implement the v2 selector and links**

Do not add a second query key or calculate triggers. Preserve cache-isolation tests against legacy
tasks.

- [ ] **Step 3: Run Rail and cache tests**

Run: `pnpm --filter @carres/web test -- src/pages/operation/components/OperationRightRail.ui-contract.test.ts src/pages/operation/work-cache-isolation.test.tsx`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/operation/components/OperationRightRail.tsx apps/web/src/pages/operation/components/OperationRightRail.ui-contract.test.ts apps/web/src/pages/operation/work-cache-isolation.test.tsx
git commit -m "feat(work): reconcile right rail with work feed"
```

### Task 10: Verify responsive, accessible and production-safe behaviour

**Files:**
- Create: `e2e/workspace-work.spec.ts`
- Update: `docs/workspace/MASTER.md` §10 only with measured implementation evidence after tests pass.
- Create evidence images only under the existing governed evidence directory selected by repo law.

**Interfaces:**
- Consumes completed Tasks 1–9.
- Produces evidence, not new product behaviour.

- [ ] **Step 1: Add authenticated Playwright journeys**

Cover one manager and one non-manager; My/Team permission; owner cover; partial source failure;
selected-action deep link; exact owning-object door; browser Back; keyboard-only selection and focus
return; screen-reader names containing object + problem + action.

- [ ] **Step 2: Capture and measure required widths**

At 1440×900, 1180×820, 820×900 and 390×844 record Work canvas width, panel widths, horizontal
overflow, wrapped action content, minimum touch size and whether the portal sidebar is expanded or
collapsed. Verify 240/360/≥500 only at ≥1104px canvas, 340/≥420 only at 768–1103px canvas, or the
governed single-panel fallback; browser width alone is not evidence.

- [ ] **Step 3: Run focused then repository gates**

Run:

```bash
pnpm --filter @carres/shared test -- operation-work.test.ts
pnpm --filter @carres/api test -- src/routes/operation/work.test.ts
pnpm --filter @carres/web test -- src/pages/operation/OperationWork.test.tsx src/pages/operation/work src/pages/operation/components/OperationRightRail.ui-contract.test.ts
pnpm typecheck
pnpm build
node scripts/check-design-standard.mjs
pnpm exec playwright test e2e/workspace-work.spec.ts
```

Expected: all pass. Any unrelated failure is recorded with an isolated rerun; it is never silently
called a Work pass.

- [ ] **Step 4: Perform live-data owner acceptance without changing records**

Verify real counts reconcile across My Work, Team Work and Right Rail; every admitted module opens
the correct object; Shasha/Yu Jun routing follows live Duty/cover; no Khor Yee open work appears;
failed/disabled sources do not become zero. Record evidence without exposing customer data.

- [ ] **Step 5: Update measured truth and commit**

Only after the evidence exists, add branch/commit/test results to MASTER §10. Do not label the page
deployed or production-verified until the production checks actually run.

```bash
git add e2e/workspace-work.spec.ts docs/workspace/MASTER.md
git commit -m "test(work): prove workspace work acceptance"
```

## Review gates

After Tasks 1–3, review the transport against MASTER §§2–3, 5.2.1 and every admitted row in §6.1.
After Tasks 4–9, review permissions, exact copy, totals, focus, URL restoration and prove that the
only embedded write is the admitted owning-module Delivery component/API. After Task 10, request
owner review. Merge/deploy is a separate explicitly authorised operation.
