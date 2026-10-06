# Staff & Duties UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked Staff & Duties document with the approved searchable Duty catalogue,
selected-Duty detail, focused assignment/cover actions, source-aware states and responsive behavior.

**Architecture:** Keep `GET /api/operation/workspace-duties` and its SQL resolver as the only source
of owner, cover, permission and history truth. The browser may search and select the returned
catalogue, but it must not calculate ownership, eligibility, overlap or completion. Existing POST
doors remain the writers; the UI presents their governed response and refreshes the one read.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind with Carres tokens, TanStack Query, React Router,
Vitest and Testing Library.

**Spec:** `docs/workspace/MASTER.md` §§3–4.7, `docs/COPY-STANDARD.md` “Workspace destination words”,
`docs/ui/MASTER.md`, `docs/01-design-tokens.md`, `docs/02-components.md` and
`docs/03-page-patterns.md`.

## Global Constraints

- Do not add a second Duty catalogue, resolver, staff roster, owner calculation or history store.
- Current active Operation roster is Yu Jun and Shasha; Khor Yee may appear only in immutable history.
- Use only existing Carres tokens and shared controls; do not invent hex values or a new theme.
- Exact screen wording comes from `docs/COPY-STANDARD.md`; no generic `Saved`, `Invalid` or
  `Something went wrong`.
- Non-managers receive the full authorised read view and no write-control imitation.
- Every server refusal stays authoritative and visible beside the focused action.
- Assignment and cover history remain append-only; this slice adds no edit/delete action.
- Do not modify an existing migration. No database migration is planned for this UI slice.
- Keep production deployment outside this implementation plan until repository gates pass.

## File map

- Modify `apps/web/src/pages/operation/StaffDuties.tsx` — page shell and orchestration only.
- Create `apps/web/src/pages/operation/staff-duties/DutyCatalogue.tsx` — search, state filter and
  selected-duty list.
- Create `apps/web/src/pages/operation/staff-duties/DutyDetail.tsx` — current facts and history.
- Create `apps/web/src/pages/operation/staff-duties/DutyActionDialog.tsx` — shared focused-dialog shell.
- Create `apps/web/src/pages/operation/staff-duties/AssignHolderForm.tsx` — assignment input and copy.
- Create `apps/web/src/pages/operation/staff-duties/AddCoverForm.tsx` — cover input and copy.
- Create `apps/web/src/pages/operation/staff-duties/staff-duties-model.ts` — pure search/state/date
  presentation helpers; never owner resolution.
- Replace `apps/web/src/pages/operation/StaffDuties.test.tsx` with page-contract tests.
- Create `apps/web/src/pages/operation/staff-duties/staff-duties-model.test.ts` — pure helper tests.
- Modify `apps/api/src/routes/operation/workspace-duties.test.ts` only if a failing read-contract test
  proves the existing catalogue order, active names or history response is not already covered.

---

### Task 1: Lock the page model without duplicating business truth

**Files:**
- Create: `apps/web/src/pages/operation/staff-duties/staff-duties-model.ts`
- Test: `apps/web/src/pages/operation/staff-duties/staff-duties-model.test.ts`

**Interfaces:**
- Consumes: `WorkspaceDutiesResponse["duties"][number]` from `@/lib/queries`.
- Produces: `DutyStateFilter`, `matchesDutySearch`, `matchesDutyState`, `dutyDisplayState`.

- [ ] **Step 1: Write failing tests for search and visible state**

```ts
expect(matchesDutySearch(poDuty, "po duty")).toBe(true);
expect(matchesDutySearch(poDuty, "yu jun")).toBe(true);
expect(matchesDutySearch(poDuty, "shasha")).toBe(true); // historical/cover identity
expect(matchesDutyState(unassignedDuty, "not_assigned")).toBe(true);
expect(matchesDutyState(coveredDuty, "covered_today")).toBe(true);
expect(matchesDutyState(futureCoverDuty, "cover_scheduled")).toBe(true);
```

- [ ] **Step 2: Run the model test and verify the missing module fails**

Run: `pnpm --filter @carres/web test -- staff-duties-model.test.ts`

Expected: FAIL because `staff-duties-model.ts` does not exist.

- [ ] **Step 3: Implement presentation-only helpers**

```ts
export type DutyStateFilter = "all" | "covered_today" | "cover_scheduled" | "not_assigned";

export function matchesDutySearch(duty: Duty, raw: string): boolean {
  const query = raw.trim().toLocaleLowerCase();
  if (!query) return true;
  return [
    duty.label,
    duty.resolution.normal_user_name,
    duty.resolution.acting_user_name,
    ...duty.assignments.flatMap((a) => [a.holder_name, a.assigned_by_name]),
    ...duty.covers.flatMap((c) => [c.normal_user_name, c.acting_user_name, c.assigned_by_name]),
  ].some((value) => value?.toLocaleLowerCase().includes(query));
}
```

`dutyDisplayState` may classify only the already-returned resolution and dated cover rows for
display. It must not choose an owner, infer eligibility or mutate dates.

- [ ] **Step 4: Run the model tests**

Run: `pnpm --filter @carres/web test -- staff-duties-model.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/operation/staff-duties
git commit -m "test(workspace): lock duty catalogue presentation model"
```

### Task 2: Build the catalogue and selected-Duty composition

**Files:**
- Create: `apps/web/src/pages/operation/staff-duties/DutyCatalogue.tsx`
- Create: `apps/web/src/pages/operation/staff-duties/DutyDetail.tsx`
- Modify: `apps/web/src/pages/operation/StaffDuties.tsx`
- Test: `apps/web/src/pages/operation/StaffDuties.test.tsx`

**Interfaces:**
- Consumes: ordered `duties`, selected `dutyKey`, search and `DutyStateFilter`.
- Produces: `onSelect(dutyKey)` and the approved catalogue/detail reading order.

- [ ] **Step 1: Write failing page tests**

```tsx
expect(screen.getByRole("heading", { name: "Staff & Duties" })).toBeVisible();
expect(screen.getByText("Who holds each company duty today and who covers an absence.")).toBeVisible();
expect(screen.getAllByTestId(/^duty-catalogue-/)).toHaveLength(11);
fireEvent.click(screen.getByTestId("duty-catalogue-grn_duty"));
expect(screen.getByTestId("selected-duty-grn_duty")).toBeVisible();
expect(screen.getByText("Normal owner")).toBeVisible();
expect(screen.getByText("Acting today")).toBeVisible();
```

Also test search, every state filter, no-match copy, selected-duty URL restoration and a deep link
such as `/operation?tab=staff-duties&duty=grn_duty`.

- [ ] **Step 2: Run the page test and verify it fails against the stacked document**

Run: `pnpm --filter @carres/web test -- StaffDuties.test.tsx`

Expected: FAIL because catalogue/detail controls and URL selection are absent.

- [ ] **Step 3: Implement the desktop and narrow-screen shell**

Use this DOM order:

```tsx
<ModuleHeader word="Staff & Duties" destinationHeader />
<main>
  <p>Who holds each company duty today and who covers an absence.</p>
  <div className="grid min-h-0 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
    <DutyCatalogue />
    <DutyDetail />
  </div>
</main>
```

At 1440px and 1024px the catalogue/detail remain side by side. Below 1024px the selected detail is
full width with a visible `Back to duties` door. Search/filter state stays local; selected `duty`
stays URL-visible. Use `replace` when correcting an unknown Duty key and `push` for a user selection.

- [ ] **Step 4: Render exact current facts**

The detail labels are `Normal owner`, `Acting today`, `Effective`, `Cover` and `Reason`. Do not print
the same person twice when no cover acts. `Not assigned` prints `Nobody holds {Duty}.` and the
manager sees `Assign holder`; the reader sees no disabled action.

- [ ] **Step 5: Run the focused page tests**

Run: `pnpm --filter @carres/web test -- StaffDuties.test.tsx`

Expected: PASS for composition, search, filters, no-match and URL selection.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/operation/StaffDuties.tsx apps/web/src/pages/operation/staff-duties apps/web/src/pages/operation/StaffDuties.test.tsx
git commit -m "feat(workspace): add duty catalogue and selected detail"
```

### Task 3: Move assignment into one focused action

**Files:**
- Create: `apps/web/src/pages/operation/staff-duties/DutyActionDialog.tsx`
- Create: `apps/web/src/pages/operation/staff-duties/AssignHolderForm.tsx`
- Modify: `apps/web/src/pages/operation/staff-duties/DutyDetail.tsx`
- Test: `apps/web/src/pages/operation/StaffDuties.test.tsx`

**Interfaces:**
- Consumes: selected Duty, active Operation staff returned by `useOperationStaff`, and
  `useWorkspaceAssignDutyMutation`.
- Produces: one append-only assignment request and exact success/refusal copy.

- [ ] **Step 1: Write failing interaction tests**

```tsx
fireEvent.click(screen.getByRole("button", { name: "Assign holder" }));
expect(screen.getByRole("dialog", { name: "Assign holder" })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "Assign holder" }));
expect(screen.getByText("Choose a holder.")).toBeVisible();
```

Test reversed dates, inactive/disabled staff absence, pending disablement, server refusal preserving
values, Escape/cancel focus return and success copy `{name} holds {Duty} from {date}`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm --filter @carres/web test -- StaffDuties.test.tsx`

Expected: FAIL because assignment is still permanently expanded.

- [ ] **Step 3: Implement the dialog and form**

The form fields remain `Duty`, `Holder`, `Effective from`, optional `Until`, optional `Note`. The
Duty is printed, not editable. Client checks use the exact Copy Standard sentences, then the server
rechecks every fact. Do not filter by hard-coded names; consume active Operation staff and rely on
the write door for final eligibility.

```ts
if (!holderId) return setError("Choose a holder.");
if (!effectiveFrom) return setError("Choose when this holder starts.");
if (effectiveUntil && effectiveUntil < effectiveFrom) {
  return setError("Until must be on or after Effective from.");
}
```

On success, close the dialog only after query invalidation completes, announce the exact success
sentence, keep the selected Duty, and return focus to `Assign holder`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @carres/web test -- StaffDuties.test.tsx`

Expected: PASS for assignment behavior and non-manager absence of controls.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/operation/staff-duties apps/web/src/pages/operation/StaffDuties.test.tsx
git commit -m "feat(workspace): focus duty holder assignment"
```

### Task 4: Move Buddy cover into one focused action

**Files:**
- Create: `apps/web/src/pages/operation/staff-duties/AddCoverForm.tsx`
- Modify: `apps/web/src/pages/operation/staff-duties/DutyDetail.tsx`
- Test: `apps/web/src/pages/operation/StaffDuties.test.tsx`

**Interfaces:**
- Consumes: selected Duty, active staff, and `useWorkspaceCoverDutyMutation`.
- Produces: one append-only cover request and exact success/refusal copy.

- [ ] **Step 1: Write failing cover tests**

Cover tests must prove: no normal owner refuses locally; acting person is required; normal owner is
not offered as cover; dates are required and ordered; pending prevents duplicates; server refusal
preserves values; success announces `{acting person} covers {normal owner} for {Duty}, {from}–{until}`.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @carres/web test -- StaffDuties.test.tsx`

Expected: FAIL because cover remains permanently expanded and lacks the governed checks.

- [ ] **Step 3: Implement Add Cover**

Use the shared dialog. Fields are `Acting person`, `From`, `Until`, `Reason`. The normal owner and
resulting period appear before confirmation. Preserve server text exactly. Do not locally activate
cover or change the normal owner while the request is pending.

- [ ] **Step 4: Run the focused tests**

Run: `pnpm --filter @carres/web test -- StaffDuties.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/operation/staff-duties apps/web/src/pages/operation/StaffDuties.test.tsx
git commit -m "feat(workspace): focus dated buddy cover"
```

### Task 5: Close states, history and accessibility

**Files:**
- Modify: `apps/web/src/pages/operation/StaffDuties.tsx`
- Modify: `apps/web/src/pages/operation/staff-duties/DutyCatalogue.tsx`
- Modify: `apps/web/src/pages/operation/staff-duties/DutyDetail.tsx`
- Test: `apps/web/src/pages/operation/StaffDuties.test.tsx`

**Interfaces:**
- Consumes: query loading/error/data and selected Duty history.
- Produces: every §4.5 state with stable focus and reading order.

- [ ] **Step 1: Add failing state/accessibility tests**

Prove catalogue/detail skeleton geometry, catalogue failure, unknown/empty catalogue as configuration
failure, no search match, `No assignments yet`, `No covers yet`, scheduled cover, keyboard catalogue
selection, dialog focus return, accessible avatar/full names and wrapped 390px content.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @carres/web test -- StaffDuties.test.tsx`

- [ ] **Step 3: Implement the missing states**

History uses the governed three-rank record grammar: event first; actor/time second; important note
or reason third. Never render edit/delete controls, raw ISO dates, a dash placeholder or a
dot-separated database sentence.

- [ ] **Step 4: Run web tests, typecheck and design guards**

```bash
pnpm --filter @carres/web test -- StaffDuties.test.tsx staff-duties-model.test.ts
pnpm --filter @carres/web typecheck
pnpm --filter @carres/web lint
```

Expected: all PASS with no new design-standard exception.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/operation/StaffDuties.tsx apps/web/src/pages/operation/staff-duties apps/web/src/pages/operation/StaffDuties.test.tsx
git commit -m "test(workspace): close staff duties UI contract"
```

### Task 6: Integration and production gate

**Files:**
- Modify only if required by a failing test:
  `apps/api/src/routes/operation/workspace-duties.test.ts`
- Modify after verified implementation reality:
  `docs/workspace/MASTER.md`

**Interfaces:**
- Consumes: finished page and existing API/write doors.
- Produces: review evidence; it does not authorize deployment by itself.

- [ ] **Step 1: Run focused API and web suites**

```bash
pnpm --filter @carres/api test -- workspace-duties.test.ts
pnpm --filter @carres/web test -- StaffDuties.test.tsx staff-duties-model.test.ts
```

- [ ] **Step 2: Run repository gates**

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

- [ ] **Step 3: Perform authenticated acceptance**

Use one manager and one non-manager account. Prove the 11 catalogue Duties once each; Yu Jun and
Shasha as the only current eligible people; Khor Yee absent from current/future choices but retained
in history where present; assignment and cover resolution matching Team Work and one protected
module door; exact read/write failure behavior; and readable 1440, 1024 and 390px layouts.

- [ ] **Step 4: Update measured truth only after evidence exists**

In `docs/workspace/MASTER.md` §10, record the commit, environments, accounts/roles, tested Duty/date
boundaries and failures. Do not change `APPROVED / LOCKED` to production-complete from local tests.

- [ ] **Step 5: Commit the evidence**

```bash
git add docs/workspace/MASTER.md apps/api/src/routes/operation/workspace-duties.test.ts
git commit -m "docs(workspace): record staff duties verification"
```

## Self-review

- Spec coverage: §§4.1–4.7 map to Tasks 1–6; no Dashboard, Work, Issue Tracker or notification build
  is smuggled into this slice.
- Placeholders: none. Every task names its files, test command, expected result and commit boundary.
- Type consistency: all components consume the existing `WorkspaceDutiesResponse`; no parallel Duty
  or person type is introduced.
- Known boundary: server capability eligibility and overlap/correction law must remain authoritative.
  If authenticated negative tests disprove the existing SQL doors, stop this UI slice and create a
  separate backend correction plan; do not hide the defect in browser filtering.

## Claude implementation prompt

Implement this plan exactly as written. Start by reading `CLAUDE.md`, `DESIGN.md`,
`docs/workspace/MASTER.md` §§3–4.7, the Workspace destination section in
`docs/COPY-STANDARD.md`, `docs/ui/MASTER.md`, and this plan. Then inspect the current
`StaffDuties.tsx`, its tests, the workspace-duties API route, query hooks and SQL doors.

Work only on Staff & Duties. Do not build Work, Issue Tracker, Notifications or Dashboard in this
slice. Use test-first commits in Task order. Preserve the existing API and shared resolver as the
only truth; do not calculate ownership or cover in the browser, add a staff roster, hard-code Yu Jun
or Shasha, or revive Khor Yee. Do not edit an existing migration. If the server fails an approved
business rule, report the measured failure and stop before inventing a client workaround.

Complete every repository gate in Task 6. Do not merge, deploy or claim production completion until
authenticated manager/non-manager evidence and the 1440/1024/390 acceptance checks pass. Update the
Workspace MASTER only with measured implementation truth.
