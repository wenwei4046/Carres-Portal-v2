# Workspace Staff & Duties Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the one ERP-wide owner-Duty registry and resolver so every action preserves its Duty, normal owner, active cover, acting person and actual actor without module-local staff routing.

**Architecture:** `workspace_owner_duties` is deliberately separate from `org_duties`: the latter grants position capabilities and may have many holders, while an owner Duty has exactly one effective Primary and optional Buddy. PostgreSQL resolves the effective owner from assignments plus People-owned unavailability; API and UI consume that result and never reproduce the arithmetic. Existing PO/GRN tables survive only behind compatibility adapters until their callers migrate.

**Tech Stack:** PostgreSQL/Supabase migrations, TypeScript, Zod, Hono, React Query, React, Vitest.

**Spec:** `docs/workspace/MASTER.md` §§2–6, `docs/ERP-ARCHITECTURE.md` Law F.1, `docs/ACTION-FLOW-STANDARD.md` Duty evidence law.

## Global Constraints

- Owner Duty is not permission. Never reuse `org_position_duties` as the owner assignment store.
- A module stores a Duty key only; never a holder name/email or local cover.
- Primary, Buddy, acting person, authorised actual actor and immutable historical actor remain distinct.
- Missing/disabled/unavailable ownership resolves to `not_assigned`; never fall back to PIC, email or Manager.
- Date resolution uses Malaysia business date supplied explicitly to the resolver.
- Existing PO/GRN behaviour remains compatible until every caller moves; no big-bang deletion.
- No Dashboard or cross-module Work UI is part of this foundation.

---

### Task 1: Freeze the shared owner-Duty contract

**Files:**
- Create: `packages/shared/src/workspace-duty.ts`
- Create: `packages/shared/src/workspace-duty.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: stable Duty keys supplied by module action contracts.
- Produces: `WorkspaceDuty`, `WorkspaceDutyAssignment`, `WorkspaceDutyResolution`, and Zod schemas used by API/UI.

- [ ] **Step 1: Write failing contract tests** proving Primary, Buddy, acting person and actual actor cannot collapse into one field, `not_assigned` carries no acting person, and a Duty key cannot be an email.
- [ ] **Step 2: Run the focused test** with `pnpm --filter @carres/shared test -- src/workspace-duty.test.ts`; expect missing-module failure.
- [ ] **Step 3: Implement the contract:**

```ts
export interface WorkspaceDutyPerson {
  userId: string;
  name: string | null;
}

export interface WorkspaceDutyResolution {
  dutyKey: string;
  onDate: string;
  normalOwner: WorkspaceDutyPerson | null;
  buddy: WorkspaceDutyPerson | null;
  activeCover: WorkspaceDutyPerson | null;
  actingPerson: WorkspaceDutyPerson | null;
  state: "primary" | "covered" | "not_assigned";
  assignmentId: string | null;
}

export interface WorkspaceActionActorEvidence {
  dutyKey: string;
  onDate: string;
  normalOwnerUserId: string | null;
  activeCoverUserId: string | null;
  actualActorUserId: string;
  assignmentId: string | null;
}
```

Use Zod to reject blank keys, `@`, invalid dates, identical Primary/Buddy and evidence without an actual actor.
- [ ] **Step 4: Export and rerun shared tests**; expect pass.
- [ ] **Step 5: Commit** with `git commit -m "test(workspace): define owner duty resolution contract"`.

### Task 2: Add effective-dated registry, People unavailability and one SQL resolver

**Files:**
- Create: `supabase/migrations/0425_one_workspace_owner_duty_resolver.sql`
- Create: `apps/api/src/lib/workspace-duty-migration.test.ts`

**Interfaces:**
- Consumes: authenticated `app_users`, effective assignment date, People unavailability.
- Produces: `workspace_resolve_duty(text,date)` and audited assignment/unavailability RPCs.

- [ ] **Step 1: Write failing migration-contract tests** for these tables/functions:

```sql
workspace_owner_duties
workspace_duty_assignments
hr_staff_unavailability
workspace_resolve_duty(p_duty_key text, p_on date)
workspace_set_duty_assignment(...)
hr_set_staff_unavailability(...)
```

- [ ] **Step 2: Run** `pnpm --filter @carres/api test -- src/lib/workspace-duty-migration.test.ts`; expect missing migration failure.
- [ ] **Step 3: Implement additive schema** with effective `starts_on`/`ends_on`, one Primary, optional distinct Buddy, created/changed actor/time, append-only audit rows and fail-closed RLS. Prevent overlapping active assignments for one Duty.
- [ ] **Step 4: Seed only approved named owner Duties** from ERP Architecture. Seed no person by email. Migrate PO/GRN effective holders from existing factual rows only; ambiguous history remains null and is reported.
- [ ] **Step 5: Implement resolver output:**

```sql
jsonb_build_object(
  'duty_key', p_duty_key,
  'assignment_id', v_assignment_id,
  'normal_user_id', v_primary,
  'buddy_user_id', v_buddy,
  'active_cover_user_id', v_cover,
  'acting_user_id', coalesce(v_cover, v_primary),
  'state', v_state,
  'on_date', p_on
)
```

The resolver checks active account, last working date and `hr_staff_unavailability`; an unavailable Primary uses the configured eligible Buddy, otherwise resolves `not_assigned`.
- [ ] **Step 6: Add compatibility wrappers** so `purchasing_po_actor()` and GRN resolution delegate to `workspace_resolve_duty` without changing their public response during this slice.
- [ ] **Step 7: Run migration tests and `pnpm ci:migrations`**; expect pass and no duplicate migration number. If main gained 0425 before execution, renumber this unapplied migration to the next free number before editing it.
- [ ] **Step 8: Commit** with `git commit -m "feat(workspace): add shared owner duty resolver"`.

### Task 3: Expose one governed Staff & Duties API

**Files:**
- Create: `apps/api/src/routes/operation/workspace-duties.ts`
- Create: `apps/api/src/routes/operation/workspace-duties.test.ts`
- Create: `apps/api/src/lib/workspace-duty.ts`
- Create: `apps/api/src/lib/workspace-duty.test.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: Task 2 RPCs and Task 1 schemas.
- Produces: list/current/future resolution reads and manager-only audited writes.

- [ ] **Step 1: Write failing tests** for list, date resolution, set Primary/Buddy, leave activation, disabled staff, overlap rejection, ordinary-user refusal and immutable history.
- [ ] **Step 2: Run focused API tests**; expect route/import failure.
- [ ] **Step 3: Implement:**

```text
GET  /api/operation/workspace/duties?on=YYYY-MM-DD
POST /api/operation/workspace/duties/:key/assignment
POST /api/hr/team/:userId/unavailability
```

Reads expose stable user IDs and display names, never email-derived identity. Writes accept IDs/dates only and call audited SQL RPCs. Capability checks remain separate from resolved ownership.
- [ ] **Step 4: Rerun focused API tests**, then `pnpm --filter @carres/api test`; expect pass.
- [ ] **Step 5: Commit** with `git commit -m "feat(workspace): expose staff and duties authority"`.

### Task 4: Build the Staff & Duties administration surface

**Files:**
- Create: `apps/web/src/pages/operation/WorkspaceStaffDuties.tsx`
- Create: `apps/web/src/pages/operation/WorkspaceStaffDuties.test.tsx`
- Modify: `apps/web/src/pages/operation/OperationApp.tsx`
- Modify: `apps/web/src/pages/portal/portal-nav.ts`
- Modify: `apps/web/src/lib/queries.ts`

**Interfaces:**
- Consumes: Task 3 endpoints and existing proven UI kit.
- Produces: the only Primary/Buddy/effective-date edit door.

- [ ] **Step 1: Write failing UI tests** proving one row per Duty, Primary and Buddy are separate, covered state preserves both names, `Not assigned` links to the edit door, non-managers are read-only/refused, and no module-local wording appears.
- [ ] **Step 2: Run** `pnpm --filter @carres/web test -- src/pages/operation/WorkspaceStaffDuties.test.tsx`; expect missing component/page failure.
- [ ] **Step 3: Implement with existing kit only.** If the approved owner avatar cannot be composed from the proven kit, stop for kit admission; do not invent it inline. Use governed date formatting and one save action for one assignment change.
- [ ] **Step 4: Add navigation under Workspace** without moving Dashboard/Work or creating a second Team/HR duty editor.
- [ ] **Step 5: Rerun focused tests, typecheck and lint**; expect pass.
- [ ] **Step 6: Commit** with `git commit -m "feat(workspace): add staff and duties settings"`.

### Task 5: Converge legacy callers without changing business outcomes

**Files:**
- Modify: `apps/api/src/lib/purchasing-po-authority.ts`
- Modify: `apps/api/src/routes/operation/po-duty.ts`
- Modify: `apps/web/src/pages/operation/use-open-work.ts`
- Modify: `packages/shared/src/work-engine.ts`
- Modify corresponding tests.

**Interfaces:**
- Consumes: Task 3 resolution context.
- Produces: shared resolution for PO/GRN and Work while preserving existing source completion.

- [ ] **Step 1: Write failing tests** proving PO/GRN/Payment/Delivery owner rules do not read a local roster or fall back to PIC and that My Work routes to active cover while Team Work retains normal owner.
- [ ] **Step 2: Replace direct `ops_po_duty`/cover reads** with the shared resolver adapter. Keep compatibility routes only for old callers and record their exact deletion dependency in the owning MASTER, not as an ungoverned runtime marker.
- [ ] **Step 3: Replace `ownerName/ownerUserId/ownerDuty` ambiguity** with Task 1 resolution fields at the Work boundary. Do not change action trigger/completion logic.
- [ ] **Step 4: Run focused Work, PO duty and authority tests**, then shared/API/web suites touched by the change.
- [ ] **Step 5: Commit** with `git commit -m "refactor(work): resolve action owners through workspace duties"`.

### Task 6: Verify the foundation and close authority

**Files:**
- Modify after production evidence: `docs/workspace/MASTER.md`
- Modify only where implementation truth changed: relevant module MASTERs.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: production evidence and the next module-projection handoff.

- [ ] **Step 1: Run** shared, API and web focused tests, `pnpm typecheck`, `pnpm lint`, and `pnpm ci:migrations`.
- [ ] **Step 2: Search current code** for direct `ops_po_duty`, `ops_po_duty_cover`, hard-coded Jess/Manager/email owner routing, PIC fallback and page-local cover arithmetic. Every remaining occurrence must be migration history or an explicit compatibility adapter.
- [ ] **Step 3: Verify on production-safe data:** change one future Duty Primary, activate one Buddy cover, confirm My Work routing changes once, confirm Team Work preserves normal owner, record an authorised act and confirm immutable actual actor evidence.
- [ ] **Step 4: Overwrite MASTER implementation state only after production proof.** Do not claim Dashboard or cross-module module projections complete.
- [ ] **Step 5: Commit** with `git commit -m "docs(workspace): close staff and duties foundation"`.

## Self-review

- Spec coverage: Duty registry, Primary, Buddy, leave, resolution, actor evidence, permissions, UI, compatibility and production proof each have a task.
- Boundary: no Dashboard, notification or module trigger/completion implementation is included.
- Type consistency: Task 1 resolution/evidence fields are consumed unchanged by Tasks 3–5.
- No placeholder business rule: missing assignment fails closed; migration renumbering is a repository integration safeguard, not an unresolved product decision.
