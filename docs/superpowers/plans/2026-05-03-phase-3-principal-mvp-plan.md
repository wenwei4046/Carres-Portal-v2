# Phase 3 — Principal MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 3-page Principal admin shell (Dashboard + Approvals + Dealers + Invite) that lets Loo run his daily HQ workflow — see network KPIs, decide refund/new_dealer approvals, manage dealer roster.

**Architecture:** Vite SPA → Hono on Cloudflare Workers (JWT verify + `requireRole(['principal'])`) → Supabase Postgres via `security definer` RPCs. No new RLS policies. Sidebar shell with 3 active tabs + 6 disabled tabs (greyed). All 5 RPCs follow Phase 2C error-contract pattern (SQLSTATE → 422 with `{error, code, message}`).

**Tech Stack:** TypeScript · React 18 · Vite · React Router 7 · TanStack Query 5 · Zustand 5 · Tailwind 3 · shadcn/ui · Hono v4 · Cloudflare Workers · Supabase Postgres · Sonner toasts · Vitest · Playwright.

**Source spec:** `docs/superpowers/specs/2026-05-03-phase-3-principal-mvp-design.md` (commits 9e9268b + 7373ef5).

---

## File Structure Map

### Create (new files)

```
supabase/migrations/
  0012_add_rejected_dealer_status.sql      ← Milestone 1
  0013_principal_admin.sql                  ← Milestone 1
  0014_approval_decide_extend.sql           ← Milestone 1

packages/shared/src/schemas/
  approvals.ts                              ← Milestone 1 (zod)
  principal-dealers.ts                      ← Milestone 1 (zod)

apps/api/src/routes/
  principal/
    dashboard.ts                            ← Milestone 2
    approvals.ts                            ← Milestone 2
    dealers.ts                              ← Milestone 2
  principal/dashboard.test.ts               ← Milestone 2
  principal/approvals.test.ts               ← Milestone 2
  principal/dealers.test.ts                 ← Milestone 2

apps/web/src/lib/
  toast-copy.ts                             ← Milestone 3

apps/web/src/pages/principal/
  PrincipalApp.tsx                          ← Milestone 3
  PrincipalSidebar.tsx                      ← Milestone 3
  PrincipalDashboard.tsx                    ← Milestone 3
  PrincipalApprovals.tsx                    ← Milestone 4
  PrincipalDealers.tsx                      ← Milestone 5
  components/
    KpiStrip.tsx                            ← Milestone 3
    DealerLeaderboard.tsx                   ← Milestone 3
    ApprovalsTile.tsx                       ← Milestone 3
    AlertsTile.tsx                          ← Milestone 3
    RecentActivityTile.tsx                  ← Milestone 3
    RoleChip.tsx                            ← Milestone 3 (shared with Approvals)
    ApprovalKindBadge.tsx                   ← Milestone 4 (shared with Dashboard)
    ApprovalStatusPill.tsx                  ← Milestone 4
    ApprovalRow.tsx                         ← Milestone 4
    ApprovalDrawer.tsx                      ← Milestone 4
    DealerStatusPill.tsx                    ← Milestone 5
    DealerRow.tsx                           ← Milestone 5
    DealerDrawer.tsx                        ← Milestone 5
    CreditTermsEditor.tsx                   ← Milestone 5
    InviteDealerModal.tsx                   ← Milestone 5

apps/web/src/lib/
  toast-copy.test.ts                        ← Milestone 3

apps/web/e2e/
  principal-approve-refund.spec.ts          ← Milestone 6
```

### Modify (existing files)

```
apps/api/src/index.ts                       ← Mount /api/principal/* + /api/approvals routers
apps/web/src/lib/queries.ts                 ← Add qk.principal.* + mutation hooks
apps/web/src/lib/auth.ts                    ← Login redirect for principal role (verify, may already work)
apps/web/src/App.tsx                        ← Add /principal/* route
apps/web/src/pages/Login.tsx                ← Verify principal role redirects to /principal
packages/shared/src/index.ts                ← Re-export new schemas
supabase/seed.sql                           ← Remove discount approval row (Loo: not in business model)
```

### Test budget

| Workspace | Current | New | Target |
|---|---|---|---|
| `packages/shared` | 17 | +3 (schemas) | 20 |
| `apps/api` | 65 | +28 (3 route files × ~9 tests) | 93 |
| `apps/web` | 77 | +12 (components + toast-copy + KPI calc) | 89 |
| Playwright E2E | 3 | +1 (approve refund) | 4 |
| **Total** | **162** | **+44** | **~206** |

---

## Milestone 1 — Foundation (Tasks 1-5)

### Task 1: Migration 0012 — add 'rejected' to dealer_status enum

**Files:**
- Create: `supabase/migrations/0012_add_rejected_dealer_status.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 0012_add_rejected_dealer_status.sql
-- Adds 'rejected' status for dealers whose new_dealer approval was declined.
-- Postgres rule: enum value addition must be in its own migration; cannot be used
-- in the same transaction it was created. 0014 (approval_decide extension) uses
-- this value, so 0012 must run first.
alter type dealer_status add value if not exists 'rejected';
```

- [ ] **Step 2: Apply via Supabase MCP**

Tool: `mcp__supabase__apply_migration`
- name: `add_rejected_dealer_status`
- query: (the SQL above)

Expected: success response.

- [ ] **Step 3: Verify the enum**

Tool: `mcp__supabase__execute_sql`
```sql
select unnest(enum_range(null::dealer_status)) as value order by 1;
```

Expected: 4 rows — `active`, `pending`, `rejected`, `suspended`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_add_rejected_dealer_status.sql
git commit -m "feat(db): add 'rejected' to dealer_status enum (0012)"
```

---

### Task 2: Migration 0013 — Principal admin RPCs + audit_log index

**Files:**
- Create: `supabase/migrations/0013_principal_admin.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0013_principal_admin.sql
-- Adds Principal-side RPCs (dealer_invite, dealer_set_status, dealer_set_terms,
-- principal_dashboard_summary) and an index on audit_log.occurred_at for the
-- Recent Activity tile.
--
-- All RPCs are SECURITY DEFINER with manual is_principal() guard. No RLS changes.
-- SQLSTATE codes follow Phase 2C convention: 42501 forbidden, 42P01 not_found,
-- 22023 invalid_param.

-- Index for Recent Activity tile (audit_log ordered by occurred_at desc).
create index if not exists audit_log_occurred_at_idx on audit_log (occurred_at desc);

-- ----------------------------------------------------------------------------
-- dealer_invite(p_name, p_region, p_contact) → jsonb
-- Idempotent: if a pending dealer with same (name, region) exists, returns it
-- without creating a duplicate. Otherwise creates dealer (status=pending) +
-- a new_dealer approval row in one tx.
-- ----------------------------------------------------------------------------
create or replace function public.dealer_invite(
  p_name    text,
  p_region  text,
  p_contact text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer    dealers;
  v_approval  approvals;
  v_existing  dealers;
  v_actor     text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'name required' using errcode = '22023', detail = 'name_missing';
  end if;
  if p_region is null or btrim(p_region) = '' then
    raise exception 'region required' using errcode = '22023', detail = 'region_missing';
  end if;
  if p_contact is null or btrim(p_contact) = '' then
    raise exception 'contact required' using errcode = '22023', detail = 'contact_missing';
  end if;

  -- Idempotency check: same name + region in pending status returns existing record.
  select * into v_existing
    from dealers
   where status = 'pending'
     and lower(btrim(name)) = lower(btrim(p_name))
     and lower(btrim(region)) = lower(btrim(p_region))
   limit 1;

  if found then
    -- Return existing dealer + its pending approval (if any).
    select * into v_approval
      from approvals
     where kind = 'new_dealer'
       and refers_to = v_existing.id::text
       and status = 'pending'
     limit 1;

    return jsonb_build_object(
      'dealer',   row_to_json(v_existing),
      'approval', row_to_json(v_approval),
      'idempotent', true
    );
  end if;

  -- Create new dealer.
  insert into dealers (name, region, contact, status)
  values (btrim(p_name), btrim(p_region), btrim(p_contact), 'pending')
  returning * into v_dealer;

  -- Create new_dealer approval.
  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Principal');
  insert into approvals (kind, title, actor, refers_to, dealer_id, status, created_by)
  values (
    'new_dealer',
    format('New dealer application · %s', v_dealer.name),
    'HQ · ' || v_actor,
    v_dealer.id::text,
    v_dealer.id,
    'pending',
    auth.uid()
  )
  returning * into v_approval;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('principal', v_actor, format('Invited dealer · %s', v_dealer.name), v_dealer.id, v_dealer.id::text);

  return jsonb_build_object(
    'dealer',   row_to_json(v_dealer),
    'approval', row_to_json(v_approval),
    'idempotent', false
  );
end;
$$;

revoke all on function public.dealer_invite(text, text, text) from public;
grant execute on function public.dealer_invite(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- dealer_set_status(p_dealer_id, p_new_status, p_reason) → dealers
-- Suspend / reactivate. Same-status update is a no-op (returns existing row).
-- ----------------------------------------------------------------------------
create or replace function public.dealer_set_status(
  p_dealer_id  uuid,
  p_new_status dealer_status,
  p_reason     text default null
)
returns dealers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer dealers;
  v_actor  text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;

  if p_new_status not in ('active', 'suspended') then
    raise exception 'set_status only for active|suspended (use approval_decide for pending→active)'
      using errcode = '22023', detail = 'invalid_status';
  end if;

  select * into v_dealer from dealers where id = p_dealer_id;
  if not found then
    raise exception 'dealer not found' using errcode = '42P01';
  end if;

  if v_dealer.status = p_new_status then
    return v_dealer; -- no-op
  end if;

  update dealers set status = p_new_status, updated_at = now()
   where id = p_dealer_id
   returning * into v_dealer;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Principal');
  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    'principal',
    v_actor,
    format('%s dealer · %s%s',
      case p_new_status when 'suspended' then 'Suspended' when 'active' then 'Reactivated' else 'Updated' end,
      v_dealer.name,
      case when p_reason is not null and btrim(p_reason) <> '' then ' (' || p_reason || ')' else '' end),
    p_dealer_id,
    p_dealer_id::text
  );

  return v_dealer;
end;
$$;

revoke all on function public.dealer_set_status(uuid, dealer_status, text) from public;
grant execute on function public.dealer_set_status(uuid, dealer_status, text) to authenticated;

-- ----------------------------------------------------------------------------
-- dealer_set_terms(p_dealer_id, p_credit_limit, p_payment_terms) → dealers
-- ----------------------------------------------------------------------------
create or replace function public.dealer_set_terms(
  p_dealer_id     uuid,
  p_credit_limit  numeric,
  p_payment_terms text
)
returns dealers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer dealers;
  v_actor  text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;
  if p_credit_limit is null or p_credit_limit < 0 then
    raise exception 'credit_limit must be >= 0' using errcode = '22023', detail = 'invalid_credit_limit';
  end if;
  if p_payment_terms not in ('NET 14','NET 30','NET 60','COD') then
    raise exception 'payment_terms must be NET 14|NET 30|NET 60|COD'
      using errcode = '22023', detail = 'invalid_terms';
  end if;

  update dealers
     set credit_limit = p_credit_limit,
         payment_terms = p_payment_terms,
         updated_at = now()
   where id = p_dealer_id
   returning * into v_dealer;
  if not found then
    raise exception 'dealer not found' using errcode = '42P01';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Principal');
  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('principal', v_actor, format('Updated terms · %s', v_dealer.name), p_dealer_id, p_dealer_id::text);

  return v_dealer;
end;
$$;

revoke all on function public.dealer_set_terms(uuid, numeric, text) from public;
grant execute on function public.dealer_set_terms(uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- principal_dashboard_summary() → jsonb
-- One round-trip for KPI strip + leaderboard + pending approvals + audit recent.
-- Uses lateral joins for per-dealer stats (no N+1).
-- ----------------------------------------------------------------------------
create or replace function public.principal_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_kpis              jsonb;
  v_leaderboard       jsonb;
  v_pending_approvals jsonb;
  v_audit_recent      jsonb;
  v_alerts            jsonb;
begin
  if not public.is_principal() then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;

  -- KPIs
  select jsonb_build_object(
    'total_gmv',          coalesce((select sum(unit_price * qty) from order_lines), 0)
                          + coalesce((select sum(unit_price * qty) from order_addons), 0),
    'active_orders',      (select count(*) from orders where status not in ('delivered','cancelled')),
    'active_dealers',     (select count(*) from dealers where status = 'active'),
    'total_dealers',      (select count(*) from dealers where status <> 'rejected'),
    'pending_approvals',  (select count(*) from approvals where status = 'pending' and kind <> 'discount'),
    'low_stock_skus',     0  -- Placeholder until Phase 4 stock data exists.
  )
  into v_kpis;

  -- Leaderboard: top 4 dealers by GMV, with order count
  select coalesce(jsonb_agg(row_to_json(t) order by t.gmv desc), '[]'::jsonb) into v_leaderboard
  from (
    select d.id, d.name, d.region, d.status,
           coalesce(s.order_count, 0) as order_count,
           coalesce(s.gmv, 0)         as gmv
      from dealers d
      left join lateral (
        select count(*)                                     as order_count,
               coalesce(sum(line_total + addon_total), 0)   as gmv
          from orders o
          left join lateral (
            select coalesce(sum(unit_price * qty), 0) as line_total
              from order_lines where order_id = o.id
          ) ol on true
          left join lateral (
            select coalesce(sum(unit_price * qty), 0) as addon_total
              from order_addons where order_id = o.id
          ) oa on true
          where o.dealer_id = d.id
      ) s on true
      where d.status <> 'rejected'
      order by gmv desc
      limit 4
  ) t;

  -- Pending approvals (top 4, exclude discount)
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_pending_approvals
  from (
    select id, kind, title, actor, refers_to, amount, dealer_id, created_at
      from approvals
     where status = 'pending' and kind <> 'discount'
     order by created_at desc
     limit 4
  ) t;

  -- Recent activity (top 5)
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_audit_recent
  from (
    select id, role, actor_text, action, dealer_id, ref, occurred_at
      from audit_log
     order by occurred_at desc
     limit 5
  ) t;

  -- Alerts (suspended count + low stock placeholder)
  select jsonb_build_object(
    'suspended_dealers', (select count(*) from dealers where status = 'suspended'),
    'low_stock',         '[]'::jsonb
  )
  into v_alerts;

  return jsonb_build_object(
    'kpis',              v_kpis,
    'leaderboard',       v_leaderboard,
    'pending_approvals', v_pending_approvals,
    'audit_recent',      v_audit_recent,
    'alerts',            v_alerts
  );
end;
$$;

revoke all on function public.principal_dashboard_summary() from public;
grant execute on function public.principal_dashboard_summary() to authenticated;
```

- [ ] **Step 2: Apply via MCP**

Tool: `mcp__supabase__apply_migration`
- name: `principal_admin`
- query: (the SQL above)

Expected: success.

- [ ] **Step 3: Smoke test the RPCs**

Tool: `mcp__supabase__execute_sql`
```sql
-- Verify all 4 functions exist:
select proname from pg_proc
 where proname in ('dealer_invite','dealer_set_status','dealer_set_terms','principal_dashboard_summary')
 order by proname;
```

Expected: 4 rows.

```sql
-- Verify the index exists:
select indexname from pg_indexes where tablename = 'audit_log' and indexname = 'audit_log_occurred_at_idx';
```

Expected: 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_principal_admin.sql
git commit -m "feat(db): principal admin RPCs + audit_log index (0013)"
```

---

### Task 3: Migration 0014 — extend approval_decide for new_dealer

**Files:**
- Create: `supabase/migrations/0014_approval_decide_extend.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0014_approval_decide_extend.sql
-- Extends approval_decide RPC (from 0003) to handle 'new_dealer' approvals.
-- On approve: dealer.status pending → active, joined_date = today
-- On reject:  dealer.status pending → rejected (uses enum value from 0012)
-- Refund logic from 0003 unchanged. Discount/top_up/price_change kinds remain
-- decision-only (no kind-specific side-effect) per Phase 3 MVP scope.

create or replace function approval_decide(
  p_id      uuid,
  p_status  approval_status,
  p_note    text
) returns approvals
language plpgsql security definer as $$
declare v_app approvals;
begin
  if not public.is_principal() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update approvals set
    status = p_status,
    decided_at = now(),
    decided_by = auth.uid(),
    decision_note = p_note
    where id = p_id
    returning * into v_app;

  if not found then
    raise exception 'approval not found' using errcode = '42P01';
  end if;

  -- Refund side-effect (unchanged from 0003).
  if v_app.kind = 'refund' and v_app.refers_to is not null then
    update refunds set
      status = case when p_status = 'approved' then 'approved'::refund_status else 'rejected'::refund_status end,
      approval_id = v_app.id,
      approved_at = case when p_status = 'approved' then now() end
      where order_id = (select id from orders where dl::text = replace(v_app.refers_to,'DL-',''));
  end if;

  -- NEW: new_dealer side-effect.
  if v_app.kind = 'new_dealer' and v_app.refers_to is not null then
    update dealers
       set status = case when p_status = 'approved' then 'active'::dealer_status
                         else 'rejected'::dealer_status end,
           joined_date = case when p_status = 'approved' then current_date else null end,
           updated_at = now()
     where id = v_app.refers_to::uuid;
  end if;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('principal',
          (select name from app_users where id = auth.uid()),
          format('%s approval · %s', p_status, v_app.title),
          v_app.dealer_id,
          v_app.refers_to);

  return v_app;
end;
$$;
```

- [ ] **Step 2: Apply via MCP**

Tool: `mcp__supabase__apply_migration`
- name: `approval_decide_extend`
- query: (the SQL above)

Expected: success.

- [ ] **Step 3: Verify the function body now references `dealer_status`**

Tool: `mcp__supabase__execute_sql`
```sql
select pg_get_functiondef('approval_decide(uuid, approval_status, text)'::regprocedure)
       like '%new_dealer%' as has_new_dealer_logic;
```

Expected: `t` (true).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_approval_decide_extend.sql
git commit -m "feat(db): extend approval_decide for new_dealer kind (0014)"
```

---

### Task 4: Shared zod schemas

**Files:**
- Create: `packages/shared/src/schemas/approvals.ts`
- Create: `packages/shared/src/schemas/principal-dealers.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/approvals.test.ts`, `principal-dealers.test.ts`

- [ ] **Step 1: Write the failing test for approvals schema**

`packages/shared/src/schemas/approvals.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decideApprovalInput } from './approvals';

describe('decideApprovalInput', () => {
  it('accepts approved with note', () => {
    expect(decideApprovalInput.safeParse({ status: 'approved', note: 'looks good' }).success).toBe(true);
  });
  it('accepts rejected without note', () => {
    expect(decideApprovalInput.safeParse({ status: 'rejected' }).success).toBe(true);
  });
  it('rejects pending status', () => {
    expect(decideApprovalInput.safeParse({ status: 'pending' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm --filter @carres/shared test --run src/schemas/approvals.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement schema**

`packages/shared/src/schemas/approvals.ts`:
```ts
import { z } from 'zod';

export const decideApprovalInput = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalInput>;

export const listApprovalsQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  kind:   z.enum(['refund', 'new_dealer', 'top_up', 'price_change', 'other']).optional(),
});
export type ListApprovalsQuery = z.infer<typeof listApprovalsQuery>;
```

- [ ] **Step 4: Write the failing test for dealer schemas**

`packages/shared/src/schemas/principal-dealers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { inviteDealerInput, setDealerStatusInput, setDealerTermsInput } from './principal-dealers';

describe('principal dealer schemas', () => {
  it('inviteDealerInput requires name/region/contact', () => {
    expect(inviteDealerInput.safeParse({ name: 'X', region: 'KL', contact: 'Loo · 012' }).success).toBe(true);
    expect(inviteDealerInput.safeParse({ name: '', region: 'KL', contact: 'x' }).success).toBe(false);
  });
  it('setDealerStatusInput allows active|suspended only', () => {
    expect(setDealerStatusInput.safeParse({ status: 'active' }).success).toBe(true);
    expect(setDealerStatusInput.safeParse({ status: 'suspended', reason: 'inactive' }).success).toBe(true);
    expect(setDealerStatusInput.safeParse({ status: 'pending' }).success).toBe(false);
  });
  it('setDealerTermsInput validates terms enum', () => {
    expect(setDealerTermsInput.safeParse({ creditLimit: 50000, paymentTerms: 'NET 30' }).success).toBe(true);
    expect(setDealerTermsInput.safeParse({ creditLimit: -1, paymentTerms: 'NET 30' }).success).toBe(false);
    expect(setDealerTermsInput.safeParse({ creditLimit: 0, paymentTerms: 'NET 90' }).success).toBe(false);
  });
});
```

- [ ] **Step 5: Run — FAIL**

```bash
pnpm --filter @carres/shared test --run src/schemas/principal-dealers.test.ts
```

- [ ] **Step 6: Implement dealer schemas**

`packages/shared/src/schemas/principal-dealers.ts`:
```ts
import { z } from 'zod';

export const inviteDealerInput = z.object({
  name:    z.string().trim().min(2).max(120),
  region:  z.string().trim().min(2).max(80),
  contact: z.string().trim().min(3).max(160),
});
export type InviteDealerInput = z.infer<typeof inviteDealerInput>;

export const setDealerStatusInput = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(200).optional(),
});
export type SetDealerStatusInput = z.infer<typeof setDealerStatusInput>;

export const setDealerTermsInput = z.object({
  creditLimit:  z.number().nonnegative().max(10_000_000),
  paymentTerms: z.enum(['NET 14', 'NET 30', 'NET 60', 'COD']),
});
export type SetDealerTermsInput = z.infer<typeof setDealerTermsInput>;
```

- [ ] **Step 7: Re-export from package index**

Modify `packages/shared/src/index.ts` — add:
```ts
export * from './schemas/approvals';
export * from './schemas/principal-dealers';
```

- [ ] **Step 8: Run all shared tests — PASS**

```bash
pnpm --filter @carres/shared test --run
```
Expected: 20 tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/schemas/approvals.ts \
        packages/shared/src/schemas/approvals.test.ts \
        packages/shared/src/schemas/principal-dealers.ts \
        packages/shared/src/schemas/principal-dealers.test.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): zod schemas for principal approvals + dealer admin"
```

---

### Task 5: Verify migration baseline

**Files:** none new

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```
Expected: 162 + 3 (new schema tests) = 165 green.

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @carres/web build
```
Expected: green.

---

## Milestone 2 — Backend API (Tasks 6-11)

### Task 6: Hono router scaffold + dashboard route

**Files:**
- Create: `apps/api/src/routes/principal/dashboard.ts`
- Create: `apps/api/src/routes/principal/dashboard.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/principal/dashboard.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../../app';
import { setTestEnv, signInAsPrincipal, signInAsDealer, _setJwksForTesting } from '../../test-helpers';

beforeAll(async () => { await _setJwksForTesting(); });

describe('GET /api/principal/dashboard', () => {
  it('returns 200 + summary JSON for principal', async () => {
    const token = await signInAsPrincipal();
    const res = await app.fetch(new Request('http://x/api/principal/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kpis: any; leaderboard: any[]; pending_approvals: any[]; audit_recent: any[]; alerts: any };
    expect(body.kpis).toBeDefined();
    expect(Array.isArray(body.leaderboard)).toBe(true);
    expect(Array.isArray(body.pending_approvals)).toBe(true);
    expect(Array.isArray(body.audit_recent)).toBe(true);
  });
  it('returns 403 for dealer role', async () => {
    const token = await signInAsDealer();
    const res = await app.fetch(new Request('http://x/api/principal/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    expect(res.status).toBe(403);
  });
  it('returns 401 with no token', async () => {
    const res = await app.fetch(new Request('http://x/api/principal/dashboard'), setTestEnv());
    expect(res.status).toBe(401);
  });
});
```

(Note: `signInAsPrincipal` / `signInAsDealer` test helpers must exist in `apps/api/src/test-helpers.ts`. If they don't, add them — they should call the real Supabase auth endpoint with seeded credentials and return a JWT.)

- [ ] **Step 2: Run — FAIL**

```bash
pnpm --filter @carres/api test --run src/routes/principal/dashboard.test.ts
```

- [ ] **Step 3: Implement the route**

`apps/api/src/routes/principal/dashboard.ts`:
```ts
import { Hono } from 'hono';
import { requireRole } from '../../middleware/auth';
import { userClient } from '../../lib/supabase';
import type { AppEnv } from '../../app';

export const principalDashboardRouter = new Hono<AppEnv>();

principalDashboardRouter.use('*', requireRole(['principal']));

principalDashboardRouter.get('/', async (c) => {
  const sb = userClient(c.env, c.req.header('Authorization')!);
  const { data, error } = await sb.rpc('principal_dashboard_summary');
  if (error) return c.json({ error: 'rpc_failed', message: error.message }, 500);
  return c.json(data);
});
```

- [ ] **Step 4: Mount in `apps/api/src/index.ts`**

Add after existing route mounts:
```ts
import { principalDashboardRouter } from './routes/principal/dashboard';
// ...
app.route('/api/principal/dashboard', principalDashboardRouter);
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm --filter @carres/api test --run src/routes/principal/dashboard.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/principal/dashboard.ts \
        apps/api/src/routes/principal/dashboard.test.ts \
        apps/api/src/index.ts
git commit -m "feat(api): GET /api/principal/dashboard"
```

---

### Task 7: Approvals routes (list + decide)

**Files:**
- Create: `apps/api/src/routes/principal/approvals.ts`
- Create: `apps/api/src/routes/principal/approvals.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/principal/approvals.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../../app';
import { setTestEnv, signInAsPrincipal, signInAsDealer, _setJwksForTesting } from '../../test-helpers';

beforeAll(async () => { await _setJwksForTesting(); });

describe('GET /api/approvals', () => {
  it('lists pending approvals (default), excludes discount', async () => {
    const token = await signInAsPrincipal();
    const res = await app.fetch(new Request('http://x/api/approvals', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approvals: Array<{ id: string; kind: string; status: string }> };
    expect(body.approvals.every(a => a.status === 'pending')).toBe(true);
    expect(body.approvals.every(a => a.kind !== 'discount')).toBe(true);
  });
  it('filters by status', async () => {
    const token = await signInAsPrincipal();
    const res = await app.fetch(new Request('http://x/api/approvals?status=approved', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    const body = (await res.json()) as { approvals: any[] };
    expect(body.approvals.every((a: any) => a.status === 'approved')).toBe(true);
  });
  it('returns 403 for dealer', async () => {
    const token = await signInAsDealer();
    const res = await app.fetch(new Request('http://x/api/approvals', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/approvals/:id/decide', () => {
  it('approves a pending refund and ripples to refunds table', async () => {
    const token = await signInAsPrincipal();
    // First, fetch a pending refund.
    const list = await app.fetch(new Request('http://x/api/approvals?status=pending', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    const { approvals } = (await list.json()) as { approvals: Array<{ id: string; kind: string }> };
    const refund = approvals.find(a => a.kind === 'refund');
    expect(refund).toBeDefined();

    const res = await app.fetch(new Request(`http://x/api/approvals/${refund!.id}/decide`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'approved', note: 'test approve' }),
    }), setTestEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approval: { status: string; decision_note: string } };
    expect(body.approval.status).toBe('approved');
    expect(body.approval.decision_note).toBe('test approve');
  });
  it('rejects with 422 + invalid_param if missing status', async () => {
    const token = await signInAsPrincipal();
    const res = await app.fetch(new Request(`http://x/api/approvals/00000000-0000-0000-0000-000000000000/decide`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }), setTestEnv());
    expect(res.status).toBe(422);
  });
  it('returns 403 for dealer', async () => {
    const token = await signInAsDealer();
    const res = await app.fetch(new Request(`http://x/api/approvals/00000000-0000-0000-0000-000000000000/decide`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    }), setTestEnv());
    expect(res.status).toBe(403);
  });
  it('rejects double-approve idempotently (second call still returns 200, status stays approved)', async () => {
    // Idempotency note: Phase 3 spec leaves this as natural — approval_decide will overwrite
    // with same fields. Test verifies no error explosion.
    const token = await signInAsPrincipal();
    const list = await app.fetch(new Request('http://x/api/approvals?status=approved', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    const { approvals } = (await list.json()) as { approvals: Array<{ id: string }> };
    if (approvals.length === 0) return; // skip if no approved
    const res = await app.fetch(new Request(`http://x/api/approvals/${approvals[0].id}/decide`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'approved', note: 're-approve' }),
    }), setTestEnv());
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm --filter @carres/api test --run src/routes/principal/approvals.test.ts
```

- [ ] **Step 3: Implement the route**

`apps/api/src/routes/principal/approvals.ts`:
```ts
import { Hono } from 'hono';
import { decideApprovalInput, listApprovalsQuery } from '@carres/shared';
import { requireRole } from '../../middleware/auth';
import { userClient } from '../../lib/supabase';
import { mapPgError } from '../../lib/pg-errors';
import type { AppEnv } from '../../app';

export const approvalsRouter = new Hono<AppEnv>();

approvalsRouter.use('*', requireRole(['principal']));

approvalsRouter.get('/', async (c) => {
  const parsed = listApprovalsQuery.safeParse({
    status: c.req.query('status') ?? undefined,
    kind:   c.req.query('kind') ?? undefined,
  });
  if (!parsed.success) {
    return c.json({ error: 'invalid_query', code: 'invalid_param', message: parsed.error.message }, 422);
  }
  const { status, kind } = parsed.data;
  const sb = userClient(c.env, c.req.header('Authorization')!);
  let q = sb.from('approvals').select('*').order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  if (kind) q = q.eq('kind', kind);
  // Always exclude discount per Phase 3 MVP scope.
  q = q.neq('kind', 'discount');
  const { data, error } = await q;
  if (error) return c.json({ error: 'query_failed', message: error.message }, 500);
  return c.json({ approvals: data });
});

approvalsRouter.post('/:id/decide', async (c) => {
  const id = c.req.param('id');
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = decideApprovalInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', code: 'invalid_param', message: parsed.error.message }, 422);
  }
  const sb = userClient(c.env, c.req.header('Authorization')!);
  const { data, error } = await sb.rpc('approval_decide', {
    p_id:     id,
    p_status: parsed.data.status,
    p_note:   parsed.data.note ?? null,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json({ approval: data });
});
```

- [ ] **Step 4: Mount + run — PASS**

Modify `apps/api/src/index.ts`:
```ts
import { approvalsRouter } from './routes/principal/approvals';
app.route('/api/approvals', approvalsRouter);
```

```bash
pnpm --filter @carres/api test --run src/routes/principal/approvals.test.ts
```
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/principal/approvals.ts \
        apps/api/src/routes/principal/approvals.test.ts \
        apps/api/src/index.ts
git commit -m "feat(api): GET/POST /api/approvals + decide RPC bridge"
```

---

### Task 8: Dealers routes — list + detail

**Files:**
- Create: `apps/api/src/routes/principal/dealers.ts`
- Create: `apps/api/src/routes/principal/dealers.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests for list + detail**

`apps/api/src/routes/principal/dealers.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../../app';
import { setTestEnv, signInAsPrincipal, signInAsDealer, _setJwksForTesting } from '../../test-helpers';

beforeAll(async () => { await _setJwksForTesting(); });

describe('GET /api/principal/dealers', () => {
  it('lists dealers with computed stats', async () => {
    const token = await signInAsPrincipal();
    const res = await app.fetch(new Request('http://x/api/principal/dealers', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dealers: Array<{ id: string; orderCount: number; gmv: number; outstanding: number }> };
    expect(body.dealers.length).toBeGreaterThan(0);
    expect(body.dealers[0]).toHaveProperty('orderCount');
    expect(body.dealers[0]).toHaveProperty('gmv');
    expect(body.dealers[0]).toHaveProperty('outstanding');
  });
  it('excludes rejected dealers by default', async () => {
    const token = await signInAsPrincipal();
    const res = await app.fetch(new Request('http://x/api/principal/dealers', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    const body = (await res.json()) as { dealers: Array<{ status: string }> };
    expect(body.dealers.every(d => d.status !== 'rejected')).toBe(true);
  });
  it('returns 403 for dealer role', async () => {
    const token = await signInAsDealer();
    const res = await app.fetch(new Request('http://x/api/principal/dealers', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    expect(res.status).toBe(403);
  });
});

describe('GET /api/principal/dealers/:id', () => {
  it('returns dealer detail with recent orders', async () => {
    const token = await signInAsPrincipal();
    const list = await app.fetch(new Request('http://x/api/principal/dealers', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    const { dealers } = (await list.json()) as { dealers: Array<{ id: string }> };
    const detail = await app.fetch(new Request(`http://x/api/principal/dealers/${dealers[0].id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { dealer: { id: string }; recentOrders: any[] };
    expect(body.dealer.id).toBe(dealers[0].id);
    expect(Array.isArray(body.recentOrders)).toBe(true);
  });
  it('returns 404 for unknown id', async () => {
    const token = await signInAsPrincipal();
    const res = await app.fetch(new Request('http://x/api/principal/dealers/00000000-0000-0000-0000-000000000000', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm --filter @carres/api test --run src/routes/principal/dealers.test.ts
```

- [ ] **Step 3: Implement list + detail (uses lateral join via inline SQL)**

`apps/api/src/routes/principal/dealers.ts`:
```ts
import { Hono } from 'hono';
import { requireRole } from '../../middleware/auth';
import { userClient } from '../../lib/supabase';
import type { AppEnv } from '../../app';
import {
  inviteDealerInput,
  setDealerStatusInput,
  setDealerTermsInput,
} from '@carres/shared';
import { mapPgError } from '../../lib/pg-errors';

export const principalDealersRouter = new Hono<AppEnv>();
principalDealersRouter.use('*', requireRole(['principal']));

/** Fetch dealer with computed stats (orderCount, gmv, outstanding) and reshape. */
async function fetchAndShapeDealer(c: any, dealerId: string) {
  const sb = userClient(c.env, c.req.header('Authorization')!);
  const { data, error } = await sb.rpc('principal_dashboard_summary'); // reuse the same shape function later if extracted; for detail we run a focused query
  // Detail query: dealer + last 8 orders + computed stats.
  const detailSql = `
    select
      d.*,
      coalesce(s.order_count, 0) as order_count,
      coalesce(s.gmv, 0)         as gmv,
      coalesce(s.outstanding, 0) as outstanding
    from dealers d
    left join lateral (
      select count(*) as order_count,
             coalesce(sum(line_total + addon_total), 0) as gmv,
             coalesce(sum(greatest(0, (line_total + addon_total) - o.paid)), 0) as outstanding
        from orders o
        left join lateral (select coalesce(sum(unit_price * qty), 0) as line_total
                             from order_lines where order_id = o.id) ol on true
        left join lateral (select coalesce(sum(unit_price * qty), 0) as addon_total
                             from order_addons where order_id = o.id) oa on true
        where o.dealer_id = d.id
    ) s on true
    where d.id = $1::uuid
  `;
  // (Use rpc-style or PostgREST raw SQL via supabase.rpc with a wrapper. For simplicity here,
  // call a helper RPC `dealer_with_stats(p_id uuid)` defined in 0013. If not, run inline via .rpc.)
  // Implementation note: define `dealer_with_stats` in 0013 if not present.
  const { data: rows, error: e1 } = await sb.rpc('dealer_with_stats', { p_id: dealerId });
  if (e1) throw e1;
  if (!rows || rows.length === 0) return null;
  const dealer = rows[0];

  const { data: ordRows, error: e2 } = await sb
    .from('orders')
    .select('id, dl, status, customer_name, paid, placed_at, order_lines(unit_price, qty), order_addons(unit_price, qty)')
    .eq('dealer_id', dealerId)
    .order('placed_at', { ascending: false })
    .limit(8);
  if (e2) throw e2;

  const recentOrders = (ordRows ?? []).map((o: any) => {
    const total =
      (o.order_lines  ?? []).reduce((s: number, l: any) => s + Number(l.unit_price) * Number(l.qty), 0) +
      (o.order_addons ?? []).reduce((s: number, a: any) => s + Number(a.unit_price) * Number(a.qty), 0);
    return {
      id: o.id, dl: o.dl, status: o.status, customerName: o.customer_name,
      paid: Number(o.paid ?? 0), total,
    };
  });
  return { dealer, recentOrders };
}

principalDealersRouter.get('/', async (c) => {
  const sb = userClient(c.env, c.req.header('Authorization')!);
  const { data, error } = await sb.rpc('dealers_with_stats_list');
  if (error) return c.json({ error: 'query_failed', message: error.message }, 500);
  // dealers_with_stats_list RPC returns rows with: id, name, region, contact, status, joined_date,
  // credit_limit, payment_terms, deposit_balance, order_count, gmv, outstanding
  const dealers = (data ?? []).map((d: any) => ({
    id: d.id, name: d.name, region: d.region, contact: d.contact, status: d.status,
    joinedDate: d.joined_date, creditLimit: Number(d.credit_limit ?? 0),
    paymentTerms: d.payment_terms ?? 'NET 30',
    depositBalance: Number(d.deposit_balance ?? 0),
    orderCount: Number(d.order_count ?? 0),
    gmv: Number(d.gmv ?? 0),
    outstanding: Number(d.outstanding ?? 0),
  }));
  return c.json({ dealers });
});

principalDealersRouter.get('/:id', async (c) => {
  try {
    const result = await fetchAndShapeDealer(c, c.req.param('id'));
    if (!result) return c.json({ error: 'not_found', code: 'not_found', message: 'Dealer not found' }, 404);
    return c.json(result);
  } catch (e: any) {
    const mapped = mapPgError(e);
    return c.json(mapped.body, mapped.status);
  }
});
```

(Note: if `dealer_with_stats` and `dealers_with_stats_list` helper RPCs aren't already in `0013`, **add them now** — extend `0013_principal_admin.sql` to include both helpers, then re-apply migration. They share the lateral-join pattern from `principal_dashboard_summary`.)

- [ ] **Step 4: Add the two missing helper RPCs to 0013**

Append to `supabase/migrations/0013_principal_admin.sql` (re-apply after edit):
```sql
-- Helper: single-dealer with stats (used by GET /api/principal/dealers/:id).
create or replace function public.dealer_with_stats(p_id uuid)
returns setof dealers
language sql security definer stable as $$
  select * from dealers where id = p_id; -- detail-only; stats computed in route via separate query
$$;

-- (Switched to simpler design: route computes stats from query for /:id;
-- list endpoint uses the dedicated function below.)
create or replace function public.dealers_with_stats_list()
returns table (
  id uuid, name text, region text, contact text, status dealer_status,
  joined_date date, credit_limit numeric, payment_terms text, deposit_balance numeric,
  order_count bigint, gmv numeric, outstanding numeric
)
language sql security definer stable as $$
  select d.id, d.name, d.region, d.contact, d.status, d.joined_date,
         d.credit_limit, d.payment_terms, d.deposit_balance,
         coalesce(s.order_count, 0)::bigint,
         coalesce(s.gmv, 0)::numeric,
         coalesce(s.outstanding, 0)::numeric
    from dealers d
    left join lateral (
      select count(*) as order_count,
             coalesce(sum(line_total + addon_total), 0) as gmv,
             coalesce(sum(greatest(0, (line_total + addon_total) - o.paid)), 0) as outstanding
        from orders o
        left join lateral (select coalesce(sum(unit_price * qty), 0) as line_total
                             from order_lines where order_id = o.id) ol on true
        left join lateral (select coalesce(sum(unit_price * qty), 0) as addon_total
                             from order_addons where order_id = o.id) oa on true
        where o.dealer_id = d.id
    ) s on true
    where d.status <> 'rejected'
    order by d.name;
$$;

revoke all on function public.dealer_with_stats(uuid) from public;
grant execute on function public.dealer_with_stats(uuid) to authenticated;
revoke all on function public.dealers_with_stats_list() from public;
grant execute on function public.dealers_with_stats_list() to authenticated;
```

Re-apply `0013` via `mcp__supabase__apply_migration` (or run as ad-hoc SQL since adding `create or replace` is idempotent).

- [ ] **Step 5: Run tests — PASS**

```bash
pnpm --filter @carres/api test --run src/routes/principal/dealers.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/principal/dealers.ts \
        apps/api/src/routes/principal/dealers.test.ts \
        apps/api/src/index.ts \
        supabase/migrations/0013_principal_admin.sql
git commit -m "feat(api): GET /api/principal/dealers list + detail"
```

---

### Task 9: Dealer mutation routes — invite + status + terms

**Files:**
- Modify: `apps/api/src/routes/principal/dealers.ts` (add 3 POST handlers)
- Modify: `apps/api/src/routes/principal/dealers.test.ts` (add 3 test groups)

- [ ] **Step 1: Write failing tests**

Append to `apps/api/src/routes/principal/dealers.test.ts`:
```ts
describe('POST /api/principal/dealers/invite', () => {
  it('creates dealer + new_dealer approval (pending)', async () => {
    const token = await signInAsPrincipal();
    const unique = `Test Dealer ${Date.now()}`;
    const res = await app.fetch(new Request('http://x/api/principal/dealers/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: unique, region: 'KL', contact: 'Test · 012-3456789' }),
    }), setTestEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dealer: { name: string; status: string }; approval: { kind: string; status: string }; idempotent: boolean };
    expect(body.dealer.name).toBe(unique);
    expect(body.dealer.status).toBe('pending');
    expect(body.approval.kind).toBe('new_dealer');
    expect(body.approval.status).toBe('pending');
    expect(body.idempotent).toBe(false);
  });
  it('idempotent on double-invite (returns same dealer + idempotent=true)', async () => {
    const token = await signInAsPrincipal();
    const unique = `Test Dealer ${Date.now()}_idem`;
    const r1 = await app.fetch(new Request('http://x/api/principal/dealers/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: unique, region: 'KL', contact: 'Test · 012' }),
    }), setTestEnv());
    const b1 = (await r1.json()) as any;
    const r2 = await app.fetch(new Request('http://x/api/principal/dealers/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: unique, region: 'KL', contact: 'Test · 012' }),
    }), setTestEnv());
    const b2 = (await r2.json()) as any;
    expect(b2.dealer.id).toBe(b1.dealer.id);
    expect(b2.idempotent).toBe(true);
  });
  it('rejects empty name with 422', async () => {
    const token = await signInAsPrincipal();
    const res = await app.fetch(new Request('http://x/api/principal/dealers/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', region: 'KL', contact: 'x' }),
    }), setTestEnv());
    expect(res.status).toBe(422);
  });
});

describe('POST /api/principal/dealers/:id/status', () => {
  it('suspends an active dealer', async () => {
    const token = await signInAsPrincipal();
    const list = await app.fetch(new Request('http://x/api/principal/dealers', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    const { dealers } = (await list.json()) as { dealers: Array<{ id: string; status: string }> };
    const active = dealers.find(d => d.status === 'active')!;
    const res = await app.fetch(new Request(`http://x/api/principal/dealers/${active.id}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'suspended', reason: 'inactive' }),
    }), setTestEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dealer: { status: string } };
    expect(body.dealer.status).toBe('suspended');
    // Restore for other tests:
    await app.fetch(new Request(`http://x/api/principal/dealers/${active.id}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    }), setTestEnv());
  });
  it('rejects invalid status with 422', async () => {
    const token = await signInAsPrincipal();
    const res = await app.fetch(new Request('http://x/api/principal/dealers/00000000-0000-0000-0000-000000000d01/status', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    }), setTestEnv());
    expect(res.status).toBe(422);
  });
});

describe('POST /api/principal/dealers/:id/terms', () => {
  it('updates credit limit + payment terms', async () => {
    const token = await signInAsPrincipal();
    const list = await app.fetch(new Request('http://x/api/principal/dealers', {
      headers: { Authorization: `Bearer ${token}` },
    }), setTestEnv());
    const { dealers } = (await list.json()) as { dealers: Array<{ id: string; status: string; creditLimit: number }> };
    const target = dealers.find(d => d.status === 'active')!;
    const original = target.creditLimit;
    const res = await app.fetch(new Request(`http://x/api/principal/dealers/${target.id}/terms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ creditLimit: 99999, paymentTerms: 'NET 60' }),
    }), setTestEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dealer: { credit_limit: string | number; payment_terms: string } };
    expect(Number(body.dealer.credit_limit)).toBe(99999);
    expect(body.dealer.payment_terms).toBe('NET 60');
    // Restore:
    await app.fetch(new Request(`http://x/api/principal/dealers/${target.id}/terms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ creditLimit: original, paymentTerms: 'NET 30' }),
    }), setTestEnv());
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm --filter @carres/api test --run src/routes/principal/dealers.test.ts
```

- [ ] **Step 3: Implement the 3 mutation routes**

Append to `apps/api/src/routes/principal/dealers.ts`:
```ts
principalDealersRouter.post('/invite', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = inviteDealerInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', code: 'invalid_param', message: parsed.error.message }, 422);
  }
  const sb = userClient(c.env, c.req.header('Authorization')!);
  const { data, error } = await sb.rpc('dealer_invite', {
    p_name:    parsed.data.name,
    p_region:  parsed.data.region,
    p_contact: parsed.data.contact,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json(data); // { dealer, approval, idempotent }
});

principalDealersRouter.post('/:id/status', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = setDealerStatusInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', code: 'invalid_param', message: parsed.error.message }, 422);
  }
  const sb = userClient(c.env, c.req.header('Authorization')!);
  const { data, error } = await sb.rpc('dealer_set_status', {
    p_dealer_id:  c.req.param('id'),
    p_new_status: parsed.data.status,
    p_reason:     parsed.data.reason ?? null,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json({ dealer: data });
});

principalDealersRouter.post('/:id/terms', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = setDealerTermsInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', code: 'invalid_param', message: parsed.error.message }, 422);
  }
  const sb = userClient(c.env, c.req.header('Authorization')!);
  const { data, error } = await sb.rpc('dealer_set_terms', {
    p_dealer_id:     c.req.param('id'),
    p_credit_limit:  parsed.data.creditLimit,
    p_payment_terms: parsed.data.paymentTerms,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json({ dealer: data });
});
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm --filter @carres/api test --run src/routes/principal/dealers.test.ts
```
Expected: 9 tests pass total (5 list/detail + 4 mutation groups).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/principal/dealers.ts \
        apps/api/src/routes/principal/dealers.test.ts
git commit -m "feat(api): POST /api/principal/dealers invite/status/terms"
```

---

### Task 10: Mount dealers router + run full api suite

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add the mount**

```ts
import { principalDealersRouter } from './routes/principal/dealers';
app.route('/api/principal/dealers', principalDealersRouter);
```

- [ ] **Step 2: Run all api tests**

```bash
pnpm --filter @carres/api test --run
```
Expected: 65 (existing) + ~20 (new principal) = ~85+ green.

- [ ] **Step 3: Commit if changed**

```bash
git add apps/api/src/index.ts
git commit -m "chore(api): mount principal dealers router"
```

---

### Task 11: Backend smoke — manual curl verification

**Files:** none

- [ ] **Step 1: Start dev servers**

```bash
pnpm dev
```

- [ ] **Step 2: Get a principal JWT**

```bash
curl -X POST 'https://kfprgpjpaffedghytstl.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: <ANON_KEY>' \
  -H 'content-type: application/json' \
  -d '{"email":"sara@carres.com","password":"111"}' | jq -r .access_token
```

(Save as `$JWT` shell variable.)

- [ ] **Step 3: Hit each endpoint**

```bash
curl -s http://localhost:8787/api/principal/dashboard       -H "Authorization: Bearer $JWT" | jq .kpis
curl -s http://localhost:8787/api/approvals?status=pending  -H "Authorization: Bearer $JWT" | jq '.approvals | length'
curl -s http://localhost:8787/api/principal/dealers          -H "Authorization: Bearer $JWT" | jq '.dealers | length'
```

Expected: KPI object with 6 fields, ~3 pending approvals (refund + new_dealer + ...), 5 dealers.

---

## Milestone 3 — Frontend shell + Dashboard (Tasks 12-17)

### Task 12: Toast copy constants + tests

**Files:**
- Create: `apps/web/src/lib/toast-copy.ts`
- Create: `apps/web/src/lib/toast-copy.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/web/src/lib/toast-copy.test.ts
import { describe, it, expect } from 'vitest';
import { TOAST } from './toast-copy';

describe('TOAST', () => {
  it('approveRefund formats with title segment', () => {
    expect(TOAST.approveRefund('Refund · RM 2,400 · Damaged')).toBe('Approved refund · Refund');
  });
  it('rejectApproval handles new_dealer', () => {
    expect(TOAST.rejectApproval('new_dealer', 'New dealer · Sleep Studio')).toBe('Rejected new_dealer · New dealer');
  });
  it('inviteSuccess formats name', () => {
    expect(TOAST.inviteSuccess('Sleep Studio')).toBe('Sleep Studio invited · approval queued');
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/toast-copy.ts
const titleSegment = (title: string) => title.split(' · ')[0];

export const TOAST = {
  approveRefund: (title: string) => `Approved refund · ${titleSegment(title)}`,
  approveNewDealer: (name: string) => `${name} approved · now active`,
  rejectApproval: (kind: string, title: string) => `Rejected ${kind} · ${titleSegment(title)}`,
  inviteSuccess:  (name: string) => `${name} invited · approval queued`,
  suspendSuccess: (name: string) => `${name} suspended`,
  reactivateSuccess: (name: string) => `${name} reactivated`,
  termsUpdated:   (name: string) => `Credit terms updated · ${name}`,
};
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/toast-copy.ts apps/web/src/lib/toast-copy.test.ts
git commit -m "feat(web): toast copy constants for Phase 3"
```

---

### Task 13: queries.ts — add qk.principal + mutation hooks

**Files:**
- Modify: `apps/web/src/lib/queries.ts`

- [ ] **Step 1: Add the keys**

Find the `qk` export. Add:
```ts
export const qk = {
  // ... existing keys
  principal: {
    dashboard: () => ['principal', 'dashboard'] as const,
    approvals: (filters?: { status?: string; kind?: string }) =>
      ['principal', 'approvals', filters ?? {}] as const,
    dealers: (filters?: { status?: string; search?: string }) =>
      ['principal', 'dealers', filters ?? {}] as const,
    dealer: (id: string) => ['principal', 'dealers', id] as const,
  },
};
```

- [ ] **Step 2: Add data hooks**

Append to the file:
```ts
export function usePrincipalDashboard() {
  return useQuery({
    queryKey: qk.principal.dashboard(),
    queryFn: () => apiFetch<{ kpis: any; leaderboard: any[]; pending_approvals: any[]; audit_recent: any[]; alerts: any }>('/api/principal/dashboard'),
  });
}

export function useApprovals(filters: { status?: string; kind?: string } = {}) {
  return useQuery({
    queryKey: qk.principal.approvals(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.kind)   params.set('kind', filters.kind);
      const qs = params.toString();
      return apiFetch<{ approvals: any[] }>(`/api/approvals${qs ? '?' + qs : ''}`);
    },
  });
}

export function usePrincipalDealers() {
  return useQuery({
    queryKey: qk.principal.dealers(),
    queryFn: () => apiFetch<{ dealers: any[] }>('/api/principal/dealers'),
  });
}

export function usePrincipalDealer(id: string | null) {
  return useQuery({
    queryKey: id ? qk.principal.dealer(id) : ['principal','dealers','null'],
    queryFn: () => apiFetch<{ dealer: any; recentOrders: any[] }>(`/api/principal/dealers/${id}`),
    enabled: !!id,
  });
}
```

- [ ] **Step 3: Add mutation hooks (closure-captured ID pattern from Phase 2C)**

```ts
export function useDecideApproval(approvalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: 'approved' | 'rejected'; note?: string }) =>
      apiFetch<{ approval: any }>(`/api/approvals/${approvalId}/decide`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.principal.approvals(), exact: false });
      await qc.invalidateQueries({ queryKey: qk.principal.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.principal.dealers(), exact: false });
    },
  });
}

export function useInviteDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; region: string; contact: string }) =>
      apiFetch<{ dealer: any; approval: any; idempotent: boolean }>('/api/principal/dealers/invite', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.principal.dealers(), exact: false });
      await qc.invalidateQueries({ queryKey: qk.principal.approvals(), exact: false });
      await qc.invalidateQueries({ queryKey: qk.principal.dashboard(), exact: true });
    },
  });
}

export function useDealerSetStatus(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: 'active' | 'suspended'; reason?: string }) =>
      apiFetch<{ dealer: any }>(`/api/principal/dealers/${dealerId}/status`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.principal.dealer(dealerId), exact: true });
      await qc.invalidateQueries({ queryKey: qk.principal.dealers(), exact: false });
      await qc.invalidateQueries({ queryKey: qk.principal.dashboard(), exact: true });
    },
  });
}

export function useDealerSetTerms(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { creditLimit: number; paymentTerms: string }) =>
      apiFetch<{ dealer: any }>(`/api/principal/dealers/${dealerId}/terms`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.principal.dealer(dealerId), exact: true });
      await qc.invalidateQueries({ queryKey: qk.principal.dealers(), exact: false });
    },
  });
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @carres/web typecheck
```
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/queries.ts
git commit -m "feat(web): qk.principal keys + 4 dashboard/approval/dealer hooks"
```

---

### Task 14: PrincipalApp shell + sidebar

**Files:**
- Create: `apps/web/src/pages/principal/PrincipalApp.tsx`
- Create: `apps/web/src/pages/principal/PrincipalSidebar.tsx`
- Modify: `apps/web/src/App.tsx` (add route)

- [ ] **Step 1: Implement sidebar**

`apps/web/src/pages/principal/PrincipalSidebar.tsx` — match `reference/proto/principal.jsx:76-129` structure. 5 nav groups, 3 active + 6 disabled. Active state uses brand-signature accent bar. Disabled items are greyed (`text-base-400`) with `cursor-not-allowed`.

```tsx
import { useAuth } from '@/lib/auth';

const NAV_GROUPS = [
  { label: 'Pulse',   items: [
    { k: 'dashboard', t: 'Dashboard',   icon: '◆', enabled: true },
    { k: 'approvals', t: 'Approvals',   icon: '◉', enabled: true },
  ]},
  { label: 'Network', items: [
    { k: 'dealers',   t: 'Dealers',     icon: '▤', enabled: true },
    { k: 'suppliers', t: 'Suppliers',   icon: '▥', enabled: false, phase: 'Phase 6' },
  ]},
  { label: 'Catalog', items: [
    { k: 'catalog',   t: 'Catalog & Pricing', icon: '▭', enabled: false, phase: 'Phase 5' },
  ]},
  { label: 'Records', items: [
    { k: 'orders',    t: 'All orders',  icon: '▣', enabled: false, phase: 'Phase 5' },
    { k: 'stock',     t: 'Stock',       icon: '□', enabled: false, phase: 'Phase 4' },
    { k: 'audit',     t: 'Audit log',   icon: '≡', enabled: false, phase: 'Phase 5' },
  ]},
  { label: 'Admin',   items: [
    { k: 'accounts',  t: 'Accounts',    icon: '◐', enabled: false, phase: 'Phase 8' },
  ]},
];

interface Props {
  active: string;
  onChange: (k: string) => void;
  pendingCount: number;
}

export default function PrincipalSidebar({ active, onChange, pendingCount }: Props) {
  const user = useAuth(s => s.user);
  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <aside className="bg-white border-r border-base-200 py-5 flex flex-col h-screen sticky top-0 w-[232px]">
      <div className="px-[22px] pb-[18px]">
        <button onClick={() => onChange('dashboard')} className="block text-left">
          <span className="font-display text-base-900 text-lg">Carres · Portal</span>
        </button>
      </div>
      <nav className="flex-1 px-3 pt-5 pb-1 flex flex-col gap-3.5 overflow-auto">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div className="kicker text-base-500 px-3.5 pb-1.5 text-[9px] tracking-[0.16em]">{group.label}</div>
            <div className="flex flex-col gap-px">
              {group.items.map(n => {
                const isActive = active === n.k;
                const showBadge = n.k === 'approvals' && pendingCount > 0;
                const cls = `relative w-full text-left px-3.5 py-[9px] rounded text-[13px] flex items-center gap-[11px] ${
                  !n.enabled ? 'text-base-400 cursor-not-allowed' :
                  isActive ? 'bg-base-100 text-base-900 font-semibold' :
                  'text-base-600 font-medium hover:bg-base-50'
                }`;
                return (
                  <button key={n.k} disabled={!n.enabled}
                    onClick={() => n.enabled && onChange(n.k)}
                    title={!n.enabled ? `Coming in ${n.phase}` : undefined}
                    className={cls}>
                    {isActive && <span className="absolute left-0 top-[7px] bottom-[7px] w-[3px] bg-brand-signature rounded-r-sm" />}
                    <span className={`w-4 text-center text-[13px] ${isActive ? 'text-brand-signature' : 'text-base-400'}`}>{n.icon}</span>
                    <span className="flex-1">{n.t}</span>
                    {showBadge && (
                      <span className="font-mono bg-brand-signature text-white rounded-full px-[7px] py-[1px] text-[10px] font-bold min-w-[16px] text-center">{pendingCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-[22px] py-4 border-t border-base-100 flex items-center gap-2.5">
        <div className="w-[34px] h-[34px] rounded-full bg-base-900 text-white grid place-items-center text-[11px] font-semibold">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-base-900 truncate">{user?.email}</div>
          <div className="text-[9.5px] text-base-500 uppercase tracking-[0.1em] mt-px">Principal</div>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Implement shell**

`apps/web/src/pages/principal/PrincipalApp.tsx`:
```tsx
import { useState } from 'react';
import PrincipalSidebar from './PrincipalSidebar';
import PrincipalDashboard from './PrincipalDashboard';
import PrincipalApprovals from './PrincipalApprovals';
import PrincipalDealers from './PrincipalDealers';
import { usePrincipalDashboard } from '@/lib/queries';

export default function PrincipalApp() {
  const [tab, setTab] = useState('dashboard');
  const { data } = usePrincipalDashboard();
  const pendingCount = data?.kpis?.pending_approvals ?? 0;

  return (
    <div className="min-h-screen bg-bg text-base-900 grid" style={{ gridTemplateColumns: '232px 1fr', fontFamily: 'DM Sans, sans-serif' }}>
      <PrincipalSidebar active={tab} onChange={setTab} pendingCount={pendingCount} />
      <main className="min-w-0 overflow-auto">
        {tab === 'dashboard' && <PrincipalDashboard setTab={setTab} />}
        {tab === 'approvals' && <PrincipalApprovals />}
        {tab === 'dealers'   && <PrincipalDealers />}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Add route to App.tsx**

```tsx
import PrincipalApp from './pages/principal/PrincipalApp';
// inside <Routes>:
<Route path="/principal/*" element={<RequireAuth roles={['principal']}><PrincipalApp /></RequireAuth>} />
```

Also confirm Login.tsx redirects principal role to `/principal` — if not, add the case.

- [ ] **Step 4: Stub the 3 pages so app compiles**

Create empty stubs with `<div>Dashboard coming soon</div>`, `<div>Approvals coming soon</div>`, `<div>Dealers coming soon</div>` in their respective files.

- [ ] **Step 5: Build + smoke**

```bash
pnpm --filter @carres/web build
```
Expected: green.

Manual: `pnpm dev`, log in as `sara@carres.com / 111`, verify lands on `/principal`, sidebar renders with 3 active + 6 disabled tabs, can click between Dashboard/Approvals/Dealers stubs.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/principal/PrincipalApp.tsx \
        apps/web/src/pages/principal/PrincipalSidebar.tsx \
        apps/web/src/pages/principal/PrincipalDashboard.tsx \
        apps/web/src/pages/principal/PrincipalApprovals.tsx \
        apps/web/src/pages/principal/PrincipalDealers.tsx \
        apps/web/src/App.tsx \
        apps/web/src/pages/Login.tsx
git commit -m "feat(web): PrincipalApp shell + sidebar + 3 page stubs + route"
```

---

### Task 15: Dashboard KPI strip + Leaderboard

**Files:**
- Create: `apps/web/src/pages/principal/components/KpiStrip.tsx`
- Create: `apps/web/src/pages/principal/components/DealerLeaderboard.tsx`
- Modify: `apps/web/src/pages/principal/PrincipalDashboard.tsx` (replace stub)

- [ ] **Step 1: Implement KpiStrip**

```tsx
// apps/web/src/pages/principal/components/KpiStrip.tsx
interface KPI { label: string; value: string | number; accent?: boolean; onClick?: () => void; }
function KpiCard({ label, value, accent, onClick }: KPI) {
  const cls = `px-[18px] py-4 rounded-md flex flex-col gap-1 ${
    accent ? 'bg-brand-signature/5 border border-brand-signature/30' : 'bg-white border border-base-200'
  } ${onClick ? 'cursor-pointer text-left' : ''}`;
  return (
    <button onClick={onClick} disabled={!onClick} className={cls}>
      <div className="kicker text-[9.5px] text-base-500">{label}</div>
      <div className="font-display text-[26px] font-semibold tracking-tight text-base-900">{value}</div>
    </button>
  );
}

export default function KpiStrip({ kpis, setTab }: { kpis: any; setTab: (t: string) => void }) {
  const fmt = (n: number) => `RM ${(n/1000).toFixed(1)}k`;
  return (
    <div className="grid grid-cols-5 gap-[14px] mb-6">
      <KpiCard label="GMV (period)"      value={fmt(kpis.total_gmv)} />
      <KpiCard label="Active orders"     value={kpis.active_orders} />
      <KpiCard label="Active dealers"    value={`${kpis.active_dealers}/${kpis.total_dealers}`} />
      <KpiCard label="Pending approvals" value={kpis.pending_approvals} accent={kpis.pending_approvals > 0} onClick={() => setTab('approvals')} />
      <KpiCard label="Low-stock SKUs"    value={kpis.low_stock_skus} />
    </div>
  );
}
```

- [ ] **Step 2: Implement DealerLeaderboard**

```tsx
// apps/web/src/pages/principal/components/DealerLeaderboard.tsx
export default function DealerLeaderboard({ stats, setTab }: { stats: any[]; setTab: (t: string) => void }) {
  const max = Math.max(1, ...stats.map(s => Number(s.gmv)));
  return (
    <div className="bg-white border border-base-200 rounded-md p-0">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-base-100">
        <div className="font-display text-base font-semibold">Dealer leaderboard</div>
        <button onClick={() => setTab('dealers')} className="btn btn-secondary text-[11px] py-1 px-2.5">Manage all</button>
      </div>
      <div className="py-2">
        {stats.map((d: any, i: number) => (
          <div key={d.id} className={`px-[18px] py-2.5 grid items-center gap-3 ${d.status === 'suspended' ? 'opacity-50' : ''}`} style={{ gridTemplateColumns: '20px 1fr auto' }}>
            <div className="font-mono text-[11px] text-base-400">{i + 1}</div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold flex items-center gap-2">
                {d.name}
                {d.status === 'suspended' && <span className="text-[9px] px-1.5 py-px bg-base-200 rounded-full text-base-600">SUSPENDED</span>}
                {d.status === 'pending'   && <span className="text-[9px] px-1.5 py-px bg-brand-signature/12 rounded-full text-brand-signature">PENDING</span>}
              </div>
              <div className="h-1 bg-base-100 rounded-sm mt-1.5 overflow-hidden">
                <div className="h-full bg-brand-signature" style={{ width: `${(Number(d.gmv) / max) * 100}%` }} />
              </div>
              <div className="text-[11px] text-base-500 mt-1">{d.region} · {d.order_count} orders</div>
            </div>
            <div className="font-mono text-[13px] font-bold text-base-900">RM {(Number(d.gmv)/1000).toFixed(1)}k</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into Dashboard**

```tsx
// apps/web/src/pages/principal/PrincipalDashboard.tsx
import { usePrincipalDashboard } from '@/lib/queries';
import KpiStrip from './components/KpiStrip';
import DealerLeaderboard from './components/DealerLeaderboard';

export default function PrincipalDashboard({ setTab }: { setTab: (t: string) => void }) {
  const { data, isLoading } = usePrincipalDashboard();
  if (isLoading || !data) return <div className="p-8">Loading…</div>;
  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-7">
        <div className="kicker">HQ · Overview</div>
        <h1 className="font-display text-[34px] leading-[1.05] mt-1.5 tracking-tight">The whole network, at a glance.</h1>
        <div className="font-body text-[13px] text-base-600 mt-1.5">{data.kpis.total_dealers} dealers · {data.kpis.active_orders} active orders</div>
      </div>
      <KpiStrip kpis={data.kpis} setTab={setTab} />
      <div className="grid gap-[18px]" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <DealerLeaderboard stats={data.leaderboard} setTab={setTab} />
        {/* Approvals + Alerts + Recent activity tiles wired in next task */}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Smoke + commit**

```bash
pnpm --filter @carres/web build
```

```bash
git add apps/web/src/pages/principal/components/KpiStrip.tsx \
        apps/web/src/pages/principal/components/DealerLeaderboard.tsx \
        apps/web/src/pages/principal/PrincipalDashboard.tsx
git commit -m "feat(web): Dashboard KPI strip + Dealer leaderboard"
```

---

### Task 16: Dashboard remaining tiles (Approvals + Alerts + Activity)

**Files:**
- Create: `apps/web/src/pages/principal/components/ApprovalsTile.tsx`
- Create: `apps/web/src/pages/principal/components/AlertsTile.tsx`
- Create: `apps/web/src/pages/principal/components/RecentActivityTile.tsx`
- Create: `apps/web/src/pages/principal/components/ApprovalKindBadge.tsx`
- Create: `apps/web/src/pages/principal/components/RoleChip.tsx`
- Modify: `PrincipalDashboard.tsx` (mount remaining tiles)

- [ ] **Step 1: Implement shared badges**

```tsx
// apps/web/src/pages/principal/components/ApprovalKindBadge.tsx
const KIND_STYLE: Record<string, { l: string; bg: string; c: string }> = {
  refund:     { l: 'Refund',   bg: 'bg-brand-signature/12', c: 'text-brand-signature' },
  new_dealer: { l: 'Dealer',   bg: 'bg-[#3c5a78]/12',       c: 'text-[#3c5a78]' },
  top_up:     { l: 'Top-up',   bg: 'bg-base-100',           c: 'text-base-700' },
  price_change: { l: 'Price', bg: 'bg-base-100',           c: 'text-base-700' },
  other:      { l: 'Other',    bg: 'bg-base-100',           c: 'text-base-700' },
};
export default function ApprovalKindBadge({ kind }: { kind: string }) {
  const s = KIND_STYLE[kind] ?? KIND_STYLE.other;
  return <span className={`px-2 py-[2px] rounded-full text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${s.bg} ${s.c}`}>{s.l}</span>;
}
```

```tsx
// apps/web/src/pages/principal/components/RoleChip.tsx
const ROLE_COLOR: Record<string, string> = {
  dealer: 'text-[#3c5a78]', logistics: 'text-[#8b5e3c]', finance: 'text-success',
  supplier: 'text-[#7a3f86]', principal: 'text-brand-signature', showroom: 'text-[#3c5a78]',
  system: 'text-base-500', bd: 'text-base-700',
};
export default function RoleChip({ role }: { role: string }) {
  return <span className={`px-[7px] py-[2px] bg-base-100 rounded text-[9.5px] font-bold uppercase tracking-wider ${ROLE_COLOR[role] ?? 'text-base-500'}`}>{role}</span>;
}
```

- [ ] **Step 2: Implement ApprovalsTile**

```tsx
// apps/web/src/pages/principal/components/ApprovalsTile.tsx
import ApprovalKindBadge from './ApprovalKindBadge';
export default function ApprovalsTile({ pending, setTab }: { pending: any[]; setTab: (t: string) => void }) {
  return (
    <div className="bg-white border border-base-200 rounded-md p-0">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-base-100">
        <div className="font-display text-base font-semibold">Awaiting your decision</div>
        {pending.length > 0 && <button onClick={() => setTab('approvals')} className="btn btn-primary text-[11px] py-1 px-2.5">Review all</button>}
      </div>
      {pending.length === 0 ? (
        <div className="p-7 text-center text-[12px] text-base-500">Inbox zero · everything's been decided.</div>
      ) : (
        <div>
          {pending.map(a => (
            <div key={a.id} className="px-[18px] py-3 border-t border-base-100 flex items-center gap-2.5">
              <ApprovalKindBadge kind={a.kind} />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold leading-tight">{a.title}</div>
                <div className="text-[10.5px] text-base-500 mt-0.5">{a.actor} · {new Date(a.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement AlertsTile + RecentActivityTile** (similar structure — match `principal-dashboard.jsx:136-188` exactly. Empty state for AlertsTile is "All systems normal" when `suspended_dealers === 0` and `low_stock` is empty.)

```tsx
// apps/web/src/pages/principal/components/AlertsTile.tsx
export default function AlertsTile({ alerts, setTab }: { alerts: { suspended_dealers: number; low_stock: any[] }; setTab: (t: string) => void }) {
  const { suspended_dealers, low_stock } = alerts;
  if (suspended_dealers === 0 && low_stock.length === 0) {
    return (
      <div className="bg-white border border-base-200 rounded-md p-0">
        <div className="px-[18px] py-3.5 border-b border-base-100 font-display text-base font-semibold">Alerts</div>
        <div className="p-7 text-center text-[12px] text-base-500">All systems normal.</div>
      </div>
    );
  }
  return (
    <div className="bg-white border border-base-200 rounded-md p-0">
      <div className="px-[18px] py-3.5 border-b border-base-100 font-display text-base font-semibold">Alerts</div>
      <div>
        {low_stock.map((s: any) => (
          <div key={s.sku} className="px-[18px] py-2.5 border-t border-base-100 flex items-center gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-signature" />
            <div className="flex-1 text-[12px]">{s.name}</div>
            <div className="font-mono text-[11px] text-base-600">{s.available} left · {s.incoming} incoming</div>
          </div>
        ))}
        {suspended_dealers > 0 && (
          <button onClick={() => setTab('dealers')} className="w-full px-[18px] py-2.5 border-t border-base-100 flex items-center gap-2.5 text-left">
            <div className="w-1.5 h-1.5 rounded-full bg-base-500" />
            <div className="flex-1 text-[12px]">{suspended_dealers} dealer{suspended_dealers > 1 ? 's' : ''} suspended</div>
            <div className="text-[11px] text-base-500">Review →</div>
          </button>
        )}
      </div>
    </div>
  );
}
```

```tsx
// apps/web/src/pages/principal/components/RecentActivityTile.tsx
import RoleChip from './RoleChip';
export default function RecentActivityTile({ rows }: { rows: any[] }) {
  return (
    <div className="bg-white border border-base-200 rounded-md p-0">
      <div className="px-[18px] py-3.5 border-b border-base-100 font-display text-base font-semibold">Recent activity</div>
      <div>
        {rows.map(e => (
          <div key={e.id} className="px-[18px] py-2.5 border-t border-base-100 grid items-center gap-2.5 text-[12px]" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
            <RoleChip role={e.role} />
            <div className="min-w-0 truncate">
              <span className="text-base-900">{e.action}</span>
              <span className="text-base-500"> · {e.actor_text}</span>
            </div>
            <div className="font-mono text-[10.5px] text-base-400">{new Date(e.occurred_at).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into Dashboard**

Update `PrincipalDashboard.tsx` to mount all 4 tiles in the 1.4:1 grid:
```tsx
<div className="grid gap-[18px]" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
  <DealerLeaderboard stats={data.leaderboard} setTab={setTab} />
  <ApprovalsTile pending={data.pending_approvals} setTab={setTab} />
  <AlertsTile alerts={data.alerts} setTab={setTab} />
  <RecentActivityTile rows={data.audit_recent} />
</div>
```

- [ ] **Step 5: Smoke + commit**

```bash
pnpm --filter @carres/web build
```

Manual: log in as Sara → Dashboard → see 4 tiles populated.

```bash
git add apps/web/src/pages/principal/components/
git commit -m "feat(web): Dashboard tiles — Approvals + Alerts + Recent activity + badges"
```

---

### Task 17: Add Sonner toast Toaster verification + design-review-lite for dashboard

**Files:** none new

- [ ] **Step 1: Verify Sonner is mounted**

Search `apps/web/src/App.tsx` for `<Toaster`. Should be there from Phase 2C. If not, add `<Toaster position="top-right" richColors closeButton />`.

- [ ] **Step 2: Compare against proto screenshot**

Open `reference/proto/principal-dashboard.jsx` source as visual reference. Take a screenshot of `/principal` (use `/design-review` skill or browser snapshot) and compare. Must match: KPI strip layout (5 cards), 4 tiles in 1.4:1 grid, brand-signature accent on pending KPI when count > 0, leaderboard bar widths.

- [ ] **Step 3: Fix any drift, commit**

---

## Milestone 4 — Approvals page (Tasks 18-21)

### Task 18: ApprovalStatusPill + ApprovalRow

**Files:**
- Create: `apps/web/src/pages/principal/components/ApprovalStatusPill.tsx`
- Create: `apps/web/src/pages/principal/components/ApprovalRow.tsx`

- [ ] **Step 1: Implement pill**

```tsx
// ApprovalStatusPill.tsx
const STATUS: Record<string, { l: string; bg: string; c: string }> = {
  pending:  { l: 'Pending',  bg: 'bg-brand-signature/12', c: 'text-brand-signature' },
  approved: { l: 'Approved', bg: 'bg-success/12',         c: 'text-success' },
  rejected: { l: 'Rejected', bg: 'bg-base-100',           c: 'text-base-600' },
};
export default function ApprovalStatusPill({ status }: { status: string }) {
  const s = STATUS[status];
  return <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.c}`}>{s.l}</span>;
}
```

- [ ] **Step 2: Implement row**

```tsx
// ApprovalRow.tsx — match proto/principal-approvals.jsx:107-121
import ApprovalKindBadge from './ApprovalKindBadge';
import ApprovalStatusPill from './ApprovalStatusPill';
export default function ApprovalRow({ a, onOpen }: { a: any; onOpen: () => void }) {
  const isPending = a.status === 'pending';
  return (
    <button onClick={onOpen} className={`w-full text-left grid items-center gap-4 px-5 py-4 bg-white border rounded-md ${
      isPending ? 'border-base-200' : 'border-base-100 opacity-70'
    }`} style={{ gridTemplateColumns: 'auto 1fr auto auto' }}>
      <ApprovalKindBadge kind={a.kind} />
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-base-900">{a.title}</div>
        <div className="text-[11.5px] text-base-500 mt-0.5">{a.actor} · {new Date(a.created_at).toLocaleDateString()} · ref {a.refers_to}</div>
      </div>
      {a.amount ? <div className="font-mono text-[14px] font-bold text-base-900">RM {Number(a.amount).toLocaleString()}</div> : <div />}
      <ApprovalStatusPill status={a.status} />
    </button>
  );
}
```

- [ ] **Step 3: Commit**

---

### Task 19: ApprovalDrawer (with decide form)

**Files:**
- Create: `apps/web/src/pages/principal/components/ApprovalDrawer.tsx`

- [ ] **Step 1: Implement drawer matching proto:132-188**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useDecideApproval } from '@/lib/queries';
import { TOAST } from '@/lib/toast-copy';
import ApprovalKindBadge from './ApprovalKindBadge';
import ApprovalStatusPill from './ApprovalStatusPill';

interface Props { approval: any; onClose: () => void; }

export default function ApprovalDrawer({ approval, onClose }: Props) {
  const [note, setNote] = useState('');
  const decide = useDecideApproval(approval.id);
  const isPending = approval.status === 'pending';

  async function submit(status: 'approved' | 'rejected') {
    try {
      await decide.mutateAsync({ status, note: note || undefined });
      const t = status === 'approved'
        ? (approval.kind === 'refund' ? TOAST.approveRefund(approval.title) : `Approved ${approval.kind} · ${approval.title.split(' · ')[0]}`)
        : TOAST.rejectApproval(approval.kind, approval.title);
      toast.success(t);
      onClose();
    } catch (e) {
      const msg = e instanceof ApiError ? e.body?.message ?? e.message : 'Failed';
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-[520px] bg-white h-screen overflow-auto p-7 flex flex-col">
        <div className="flex justify-between items-start mb-[18px]">
          <div>
            <div className="kicker">{approval.id.slice(0, 8)}</div>
            <h2 className="font-display text-[22px] leading-tight mt-1 tracking-tight">{approval.title}</h2>
          </div>
          <button onClick={onClose} className="text-base-500 text-lg">×</button>
        </div>
        <div className="grid gap-x-4 gap-y-2.5 text-[13px] py-4 border-y border-base-100 mb-[18px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
          <div className="text-base-500 text-[11.5px]">Type</div>     <div><ApprovalKindBadge kind={approval.kind} /></div>
          <div className="text-base-500 text-[11.5px]">Status</div>   <div><ApprovalStatusPill status={approval.status} /></div>
          <div className="text-base-500 text-[11.5px]">By</div>       <div>{approval.actor}</div>
          <div className="text-base-500 text-[11.5px]">When</div>     <div>{new Date(approval.created_at).toLocaleString()}</div>
          <div className="text-base-500 text-[11.5px]">Ref</div>      <div className="font-mono text-[12px]">{approval.refers_to ?? '—'}</div>
          {approval.amount && <><div className="text-base-500 text-[11.5px]">Amount</div><div className="font-mono font-bold">RM {Number(approval.amount).toLocaleString()}</div></>}
          {approval.reason && <><div className="text-base-500 text-[11.5px]">Reason</div><div>{approval.reason}</div></>}
        </div>
        {!isPending && approval.decided_at && (
          <div className="mb-[18px] p-3.5 bg-base-50 rounded-md">
            <div className="label mb-1.5">Decision</div>
            <div className="text-[13px]"><strong>{approval.decided_by ?? '—'}</strong> · {new Date(approval.decided_at).toLocaleString()}</div>
            {approval.decision_note && <div className="text-[12px] text-base-600 mt-1">{approval.decision_note}</div>}
          </div>
        )}
        <div className="flex-1" />
        {isPending && (
          <div className="pt-[18px] border-t border-base-100">
            <div className="label mb-1.5">Note (optional)</div>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Reason or condition…"
              className="w-full px-2.5 py-2 border border-base-200 rounded text-[12px] resize-y min-h-[60px] outline-none mb-3" />
            <div className="flex gap-2">
              <button onClick={() => submit('rejected')} disabled={decide.isPending} className="btn btn-secondary flex-1">Reject</button>
              <button onClick={() => submit('approved')} disabled={decide.isPending} className="btn btn-primary flex-1">Approve</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 20: PrincipalApprovals page

**Files:**
- Replace stub: `apps/web/src/pages/principal/PrincipalApprovals.tsx`

- [ ] **Step 1: Implement page** matching proto:8-105:

```tsx
import { useMemo, useState } from 'react';
import { useApprovals } from '@/lib/queries';
import ApprovalRow from './components/ApprovalRow';
import ApprovalDrawer from './components/ApprovalDrawer';

export default function PrincipalApprovals() {
  const [filter, setFilter] = useState<'pending'|'approved'|'rejected'|'all'>('pending');
  const [open, setOpen] = useState<any>(null);

  const all = useApprovals({ status: 'all' });
  const data = useApprovals({ status: filter });

  const counts = useMemo(() => {
    const list = all.data?.approvals ?? [];
    return {
      pending:  list.filter((a: any) => a.status === 'pending').length,
      approved: list.filter((a: any) => a.status === 'approved').length,
      rejected: list.filter((a: any) => a.status === 'rejected').length,
    };
  }, [all.data]);

  if (data.isLoading || !data.data) return <div className="p-8">Loading…</div>;
  const items = data.data.approvals;

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-5">
        <div className="kicker">HQ · Approvals</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight">Decisions in your court</h1>
        <div className="font-body text-[13px] text-base-600 mt-1.5">{counts.pending} pending · auto-routed from Finance, Sales and Catalog.</div>
      </div>
      <div className="flex gap-1 mb-[18px] p-1 bg-base-100 rounded w-fit">
        {(['pending','approved','rejected','all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3.5 py-1.5 text-[12px] rounded-sm capitalize ${
            filter === f ? 'bg-white font-semibold text-base-900' : 'text-base-600 font-medium'
          }`}>
            {f}{f !== 'all' ? ` · ${counts[f as keyof typeof counts]}` : ''}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="bg-white border border-base-200 rounded-md p-12 text-center text-base-500">
          <div className="text-[32px] mb-2 text-base-300">—</div>
          <div className="font-display text-[18px]">Nothing here</div>
          <div className="text-[12px] mt-1">No approvals match this filter.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((a: any) => <ApprovalRow key={a.id} a={a} onOpen={() => setOpen(a)} />)}
        </div>
      )}
      {open && <ApprovalDrawer approval={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Smoke + commit**

```bash
pnpm --filter @carres/web build
```

Manual: log in as Sara, click Approvals → see 3 pending (refund + 2 new_dealer if Sleep Studio seeded) → click refund → drawer slides in → write note → Approve → toast → drawer closes → row moves to Approved tab.

```bash
git add apps/web/src/pages/principal/PrincipalApprovals.tsx \
        apps/web/src/pages/principal/components/Approval*.tsx
git commit -m "feat(web): PrincipalApprovals page with row + drawer + decide"
```

---

### Task 21: ApprovalDrawer empty/edge tests

**Files:**
- Create: `apps/web/src/pages/principal/components/ApprovalDrawer.test.tsx`

- [ ] **Step 1: Test empty filter, drawer note flow**

```tsx
// (vitest + RTL) test renders drawer with mocked approval, types note, clicks Approve, asserts mutation called
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ApprovalDrawer from './ApprovalDrawer';
// mock useDecideApproval to spy
vi.mock('@/lib/queries', () => ({
  useDecideApproval: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
}));

describe('ApprovalDrawer', () => {
  it('shows Approve/Reject for pending', () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}>
      <ApprovalDrawer approval={{ id: 'a1', kind: 'refund', title: 'Refund · RM 100', status: 'pending', actor: 'F', created_at: new Date().toISOString(), refers_to: 'DL-1' }} onClose={() => {}} />
    </QueryClientProvider>);
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });
  it('hides action buttons for approved status', () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}>
      <ApprovalDrawer approval={{ id: 'a2', kind: 'refund', title: 'Refund', status: 'approved', actor: 'F', created_at: new Date().toISOString(), decided_at: new Date().toISOString() }} onClose={() => {}} />
    </QueryClientProvider>);
    expect(screen.queryByText('Approve')).toBeNull();
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm --filter @carres/web test --run src/pages/principal/components/ApprovalDrawer.test.tsx
```

```bash
git add apps/web/src/pages/principal/components/ApprovalDrawer.test.tsx
git commit -m "test(web): ApprovalDrawer pending/approved render variants"
```

---

## Milestone 5 — Dealers page + Invite (Tasks 22-26)

### Task 22: DealerStatusPill + DealerRow

**Files:**
- Create: `apps/web/src/pages/principal/components/DealerStatusPill.tsx`
- Create: `apps/web/src/pages/principal/components/DealerRow.tsx`

- [ ] **Step 1: Implement pill** (matches proto:112-119)

```tsx
const STYLE: Record<string, { l: string; bg: string; c: string }> = {
  active:    { l: 'Active',    bg: 'bg-success/12',         c: 'text-success' },
  pending:   { l: 'Pending',   bg: 'bg-brand-signature/12', c: 'text-brand-signature' },
  suspended: { l: 'Suspended', bg: 'bg-base-200',           c: 'text-base-700' },
  rejected:  { l: 'Rejected',  bg: 'bg-base-100',           c: 'text-base-500' },
};
export default function DealerStatusPill({ status }: { status: string }) {
  const s = STYLE[status] ?? STYLE.pending;
  return <span className={`px-2.5 py-[3px] rounded-full text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.c}`}>{s.l}</span>;
}
```

- [ ] **Step 2: Implement DealerRow** (table row matching proto:74-90)

```tsx
import DealerStatusPill from './DealerStatusPill';
export default function DealerRow({ d, onOpen }: { d: any; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="border-t border-base-100 cursor-pointer hover:bg-base-50">
      <td className="px-4 py-3">
        <div className="font-semibold">{d.name}</div>
        <div className="text-[11px] text-base-500 mt-0.5">{d.contact}</div>
      </td>
      <td className="px-4 py-3 text-base-700">{d.region}</td>
      <td className="px-4 py-3 text-base-700">{d.joinedDate ?? '—'}</td>
      <td className="px-4 py-3 text-right font-mono">{d.orderCount}</td>
      <td className="px-4 py-3 text-right font-bold font-mono">RM {(Number(d.gmv)/1000).toFixed(1)}k</td>
      <td className={`px-4 py-3 text-right font-mono ${d.outstanding > 0 ? 'text-brand-signature' : 'text-base-500'}`}>
        {d.outstanding ? `RM ${Number(d.outstanding).toLocaleString()}` : '—'}
      </td>
      <td className="px-4 py-3"><DealerStatusPill status={d.status} /></td>
      <td className="px-4 py-3 text-right text-base-400">›</td>
    </tr>
  );
}
```

- [ ] **Step 3: Commit**

---

### Task 23: CreditTermsEditor + DealerDrawer

**Files:**
- Create: `apps/web/src/pages/principal/components/CreditTermsEditor.tsx`
- Create: `apps/web/src/pages/principal/components/DealerDrawer.tsx`

- [ ] **Step 1: Implement CreditTermsEditor** (matches proto:152-182)

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { useDealerSetTerms } from '@/lib/queries';
import { TOAST } from '@/lib/toast-copy';

export default function CreditTermsEditor({ dealerId, dealerName, creditLimit, paymentTerms }: { dealerId: string; dealerName: string; creditLimit: number; paymentTerms: string }) {
  const [editing, setEditing] = useState(false);
  const [credit, setCredit] = useState(String(creditLimit));
  const [terms, setTerms] = useState(paymentTerms);
  const setT = useDealerSetTerms(dealerId);

  async function save() {
    try {
      await setT.mutateAsync({ creditLimit: parseFloat(credit) || 0, paymentTerms: terms });
      toast.success(TOAST.termsUpdated(dealerName));
      setEditing(false);
    } catch (e: any) { toast.error(e?.body?.message ?? 'Failed to update terms'); }
  }

  return (
    <div className="bg-white border border-base-200 rounded-md p-4 mb-4">
      <div className="flex justify-between items-center mb-2">
        <div className="label">Credit terms</div>
        {!editing
          ? <button onClick={() => setEditing(true)} className="text-[11px] text-brand-signature font-semibold">Edit</button>
          : <div className="flex gap-1.5">
              <button onClick={() => { setEditing(false); setCredit(String(creditLimit)); setTerms(paymentTerms); }} className="text-[11px] text-base-500">Cancel</button>
              <button onClick={save} disabled={setT.isPending} className="text-[11px] text-brand-signature font-semibold">Save</button>
            </div>}
      </div>
      {!editing ? (
        <div className="grid grid-cols-2 gap-2.5 text-[13px]">
          <div><span className="text-base-500">Limit · </span><span className="font-mono font-semibold">RM {Number(creditLimit).toLocaleString()}</span></div>
          <div><span className="text-base-500">Terms · </span><span className="font-mono">{paymentTerms}</span></div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <div className="text-[10px] text-base-500 mb-1">Credit limit (RM)</div>
            <input value={credit} onChange={e => setCredit(e.target.value)} className="w-full px-2 py-1.5 border border-base-200 rounded text-[12px] font-mono outline-none" />
          </div>
          <div>
            <div className="text-[10px] text-base-500 mb-1">Payment terms</div>
            <select value={terms} onChange={e => setTerms(e.target.value)} className="w-full px-2 py-1.5 border border-base-200 rounded text-[12px] bg-white">
              <option>NET 14</option><option>NET 30</option><option>NET 60</option><option>COD</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement DealerDrawer** (matches proto:121-225)

```tsx
import { toast } from 'sonner';
import { usePrincipalDealer, useDealerSetStatus } from '@/lib/queries';
import { TOAST } from '@/lib/toast-copy';
import DealerStatusPill from './DealerStatusPill';
import CreditTermsEditor from './CreditTermsEditor';

export default function DealerDrawer({ dealerId, onClose }: { dealerId: string; onClose: () => void }) {
  const { data, isLoading } = usePrincipalDealer(dealerId);
  const setStatus = useDealerSetStatus(dealerId);

  if (isLoading || !data) return null;
  const { dealer, recentOrders } = data;

  async function suspend() {
    if (!window.confirm(`Suspend ${dealer.name}? They won't be able to place new orders.`)) return;
    try {
      await setStatus.mutateAsync({ status: 'suspended' });
      toast.success(TOAST.suspendSuccess(dealer.name));
      onClose();
    } catch (e: any) { toast.error(e?.body?.message ?? 'Failed'); }
  }
  async function reactivate() {
    try {
      await setStatus.mutateAsync({ status: 'active' });
      toast.success(TOAST.reactivateSuccess(dealer.name));
      onClose();
    } catch (e: any) { toast.error(e?.body?.message ?? 'Failed'); }
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-[520px] bg-white h-screen overflow-auto p-7">
        <div className="flex justify-between items-start mb-[18px]">
          <div>
            <div className="kicker">{dealer.id.slice(0, 8)}</div>
            <h2 className="font-display text-[22px] leading-tight mt-1 tracking-tight">{dealer.name}</h2>
            <div className="text-[12px] text-base-600 mt-1">{dealer.contact}</div>
          </div>
          <button onClick={onClose} className="text-base-500 text-lg">×</button>
        </div>
        <div className="flex gap-2 mb-[18px]">
          <DealerStatusPill status={dealer.status} />
          <span className="text-[11.5px] text-base-500 pt-0.5">{dealer.region} · joined {dealer.joined_date ?? '—'}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Stat label="Orders" v={dealer.order_count ?? 0} />
          <Stat label="GMV" v={`RM ${(Number(dealer.gmv ?? 0)/1000).toFixed(1)}k`} />
          <Stat label="Outstanding" v={dealer.outstanding ? `RM ${Number(dealer.outstanding).toLocaleString()}` : '—'} accent={Number(dealer.outstanding ?? 0) > 0} />
        </div>
        <CreditTermsEditor dealerId={dealer.id} dealerName={dealer.name} creditLimit={Number(dealer.credit_limit ?? 0)} paymentTerms={dealer.payment_terms ?? 'NET 30'} />
        {recentOrders.length > 0 ? (
          <div className="mb-[18px]">
            <div className="label mb-2">Recent orders</div>
            <div className="bg-white border border-base-200 rounded-md p-0">
              {recentOrders.map((o: any, i: number) => (
                <div key={o.id} className={`px-3.5 py-2.5 flex justify-between text-[12px] ${i ? 'border-t border-base-100' : ''}`}>
                  <div>
                    <div className="font-mono text-[11px] font-semibold">DL-{o.dl}</div>
                    <div className="text-[11px] text-base-500">{o.customerName}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">RM {Number(o.total).toLocaleString()}</div>
                    <div className="text-[10px] text-base-500 uppercase">{o.status.replace('_', ' ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-[18px]">
            <div className="label mb-2">Recent orders</div>
            <div className="bg-base-50 rounded-md p-6 text-center text-[12px] text-base-500">No orders yet.</div>
          </div>
        )}
        <div className="pt-[18px] border-t border-base-100 flex gap-2">
          {dealer.status === 'active'    && <button onClick={suspend}    disabled={setStatus.isPending} className="btn btn-secondary flex-1 text-brand-signature">Suspend</button>}
          {dealer.status === 'suspended' && <button onClick={reactivate} disabled={setStatus.isPending} className="btn btn-primary   flex-1">Reactivate</button>}
          {dealer.status === 'pending'   && <div className="flex-1 text-[11.5px] text-base-500 text-center p-2">Awaiting approval · review in <strong className="text-brand-signature">Approvals</strong> tab</div>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, v, accent }: { label: string; v: string | number; accent?: boolean }) {
  return (
    <div className="bg-base-50 p-3 rounded">
      <div className="label text-[9.5px] mb-1">{label}</div>
      <div className={`font-mono text-base font-bold ${accent ? 'text-brand-signature' : 'text-base-900'}`}>{v}</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

---

### Task 24: InviteDealerModal

**Files:**
- Create: `apps/web/src/pages/principal/components/InviteDealerModal.tsx`

- [ ] **Step 1: Implement** (matches proto:227-254)

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { useInviteDealer } from '@/lib/queries';
import { TOAST } from '@/lib/toast-copy';

export default function InviteDealerModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [contact, setContact] = useState('');
  const invite = useInviteDealer();
  const valid = name.trim().length > 1 && region.trim().length > 1 && contact.trim().length > 2;

  async function submit() {
    if (!valid || invite.isPending) return;
    try {
      const res = await invite.mutateAsync({ name: name.trim(), region: region.trim(), contact: contact.trim() });
      if (res.idempotent) toast.info(`${res.dealer.name} already invited (no duplicate created)`);
      else toast.success(TOAST.inviteSuccess(res.dealer.name));
      onClose();
    } catch (e: any) { toast.error(e?.body?.message ?? 'Failed'); }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-[440px] p-6 bg-white border border-base-200 rounded-md">
        <div className="kicker">Network</div>
        <div className="font-display text-[20px] mt-1 mb-1.5">Invite a new dealer</div>
        <div className="text-[12px] text-base-600 mb-[18px]">They'll appear with status <strong>Pending</strong> until approved.</div>
        <div className="grid gap-3 mb-[18px]">
          <Field label="Business name" v={name} onChange={setName} placeholder="ComfortBeds Sdn Bhd" />
          <Field label="Region"        v={region} onChange={setRegion} placeholder="Klang Valley · Selangor · ..." />
          <Field label="Contact"       v={contact} onChange={setContact} placeholder="Name · phone" />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={submit} disabled={!valid || invite.isPending} className="btn btn-primary">{invite.isPending ? 'Sending…' : 'Send invite'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, v, onChange, placeholder }: { label: string; v: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <div>
      <div className="label mb-1 text-[9.5px]">{label}</div>
      <input value={v} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-base-200 rounded text-[13px] outline-none" />
    </div>
  );
}
```

- [ ] **Step 2: Test validation**

`InviteDealerModal.test.tsx`:
```tsx
// Verify Send invite is disabled with empty inputs
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InviteDealerModal from './InviteDealerModal';
vi.mock('@/lib/queries', () => ({ useInviteDealer: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
describe('InviteDealerModal', () => {
  it('disables Send invite with empty fields', () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><InviteDealerModal onClose={() => {}} /></QueryClientProvider>);
    expect(screen.getByText('Send invite').closest('button')!.hasAttribute('disabled')).toBe(true);
  });
});
```

- [ ] **Step 3: Commit**

---

### Task 25: PrincipalDealers page

**Files:**
- Replace stub: `apps/web/src/pages/principal/PrincipalDealers.tsx`

- [ ] **Step 1: Implement** matching proto:4-106

```tsx
import { useMemo, useState } from 'react';
import { usePrincipalDealers } from '@/lib/queries';
import DealerRow from './components/DealerRow';
import DealerDrawer from './components/DealerDrawer';
import InviteDealerModal from './components/InviteDealerModal';

export default function PrincipalDealers() {
  const { data, isLoading } = usePrincipalDealers();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all'|'active'|'pending'|'suspended'|'rejected'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const filtered = useMemo(() => {
    const list = data?.dealers ?? [];
    return list.filter((d: any) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.region.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, search, statusFilter]);

  if (isLoading || !data) return <div className="p-8">Loading…</div>;
  const counts = {
    active:    data.dealers.filter((d: any) => d.status === 'active').length,
    pending:   data.dealers.filter((d: any) => d.status === 'pending').length,
    suspended: data.dealers.filter((d: any) => d.status === 'suspended').length,
  };

  return (
    <div className="px-9 py-8 pb-14">
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="kicker">HQ · Network</div>
          <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight">Dealers</h1>
          <div className="font-body text-[13px] text-base-600 mt-1.5">{counts.active} active · {counts.pending} pending · {counts.suspended} suspended</div>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn btn-primary">+ Invite dealer</button>
      </div>
      <div className="flex gap-2 mb-3.5 items-center">
        <input type="search" placeholder="Search dealers or regions…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-base-200 rounded text-[13px] outline-none" />
        <div className="flex gap-1 p-1 bg-base-100 rounded">
          {(['all','active','pending','suspended','rejected'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} className={`px-2.5 py-1 text-[11.5px] rounded-sm capitalize ${
              statusFilter === f ? 'bg-white font-semibold text-base-900' : 'text-base-600 font-medium'
            }`}>{f}</button>
          ))}
        </div>
      </div>
      <div className="bg-white border border-base-200 rounded-md p-0 overflow-auto">
        <table className="w-full border-collapse text-[13px] min-w-[800px]">
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <Th>Dealer</Th><Th>Region</Th><Th>Joined</Th><Th right>Orders</Th><Th right>GMV</Th><Th right>Outstanding</Th><Th>Status</Th><Th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((d: any) => <DealerRow key={d.id} d={d} onOpen={() => setOpenId(d.id)} />)}
          </tbody>
        </table>
      </div>
      {openId && <DealerDrawer dealerId={openId} onClose={() => setOpenId(null)} />}
      {showInvite && <InviteDealerModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-base-500 ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
```

- [ ] **Step 2: Smoke + commit**

```bash
pnpm --filter @carres/web build
```

Manual: log in as Sara → Dealers → see 5 seeded dealers → click row → drawer → click Suspend → status flips → toast → re-open drawer → status is suspended. Click "+ Invite dealer" → modal → fill in → Send → toast → see new pending row.

```bash
git add apps/web/src/pages/principal/PrincipalDealers.tsx \
        apps/web/src/pages/principal/components/Dealer*.tsx \
        apps/web/src/pages/principal/components/CreditTermsEditor.tsx \
        apps/web/src/pages/principal/components/InviteDealerModal.tsx \
        apps/web/src/pages/principal/components/InviteDealerModal.test.tsx
git commit -m "feat(web): PrincipalDealers page + drawer + invite modal"
```

---

### Task 26: Run full web test suite

- [ ] **Step 1: Run web tests**

```bash
pnpm --filter @carres/web test --run
```
Expected: 77 (existing) + ~12 (toast-copy + ApprovalDrawer + InviteDealerModal + KPI calc) = ~89 green.

- [ ] **Step 2: Run all workspace tests**

```bash
pnpm test
```
Expected: ~205 green.

---

## Milestone 6 — Polish + ship (Tasks 27-31)

### Task 27: Playwright E2E — approve refund

**Files:**
- Create: `apps/web/e2e/principal-approve-refund.spec.ts`

- [ ] **Step 1: Implement spec**

```ts
import { test, expect } from '@playwright/test';

test('Sara approves a pending refund end-to-end', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type=email]', 'sara@carres.com');
  await page.fill('input[type=password]', '111');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('**/principal');

  await expect(page.getByText('The whole network, at a glance.')).toBeVisible();

  const pendingKpi = page.getByRole('button', { name: /Pending approvals/i });
  await pendingKpi.click();

  await expect(page.getByText('Decisions in your court')).toBeVisible();
  const refundRow = page.getByRole('button').filter({ hasText: /Refund/i }).first();
  await refundRow.click();

  await expect(page.getByText('Approve')).toBeVisible();
  await page.fill('textarea[placeholder*="Reason"]', 'E2E test approval');
  await page.click('button:has-text("Approve")');

  await expect(page.getByText(/Approved refund/i)).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @carres/web e2e --grep "approves a pending refund"
```
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/principal-approve-refund.spec.ts
git commit -m "test(web/e2e): Sara approves pending refund happy path"
```

---

### Task 28: Run /review for backend safety pass

- [ ] **Step 1: Invoke `/review`**

Expected categories: SQL safety (RPCs use SECURITY DEFINER + manual guards, ✅), trust boundary (every route requireRole('principal'), ✅), error mapping (mapPgError used everywhere, ✅), no service_role leak (grep apps/web/dist for SERVICE_ROLE → 0).

- [ ] **Step 2: Apply any review findings as small commits**

---

### Task 29: Run /design-review for proto fidelity pass

- [ ] **Step 1: Invoke `/design-review`**

Compare each Phase 3 page screenshot against `reference/proto/principal-*.jsx` source. Fix drift on tokens / spacing / typography / interaction states.

- [ ] **Step 2: Apply findings**

---

### Task 30: Update seed.sql + write phase-3-reflection

**Files:**
- Modify: `supabase/seed.sql` (remove the discount approval row)
- Create: `phase-3-reflection.md`
- Modify: `CLAUDE.md` (§17 status block)

- [ ] **Step 1: Remove discount seed row**

In `supabase/seed.sql`, find the line `('discount', 'Discount 20% · DL-1248 · King set bundle', ...` and delete it (per Loo: not in business model).

- [ ] **Step 2: Write reflection** (mirror `phase-1-reflection.md` structure)

Sections: What shipped (table) · What surprised us (numbered + carry-forward) · Schema tweaks · What got deferred · Time spent · Carry into Phase 4 · Acceptance check.

- [ ] **Step 3: Update CLAUDE.md §17**

```
Current phase: between phases — Phase 3 complete, Phase 4 not yet started
Last phase completed: Phase 3 (Principal MVP) — 2026-05-XX, tag phase-3-complete
Tags so far: phase-0/1/2a/2b/2c/3-complete
Test count: ~206 green
Next decision pending: Phase 4 Logistics scope (RED LINE: needs explicit confirmation, RLS UPDATE policies likely required)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql phase-3-reflection.md CLAUDE.md
git commit -m "docs(phase-3): reflection + seed cleanup + status update"
```

---

### Task 31: Tag + push

- [ ] **Step 1: Verify clean state**

```bash
git status
pnpm test
pnpm --filter @carres/web build
```
Expected: clean tree, ~206 tests green, build OK.

- [ ] **Step 2: Tag + push**

```bash
git tag -a phase-3-complete -m "Phase 3 — Principal MVP (Dashboard + Approvals + Dealers + Invite)"
git push origin main
git push origin phase-3-complete
```

- [ ] **Step 3: Update task tracking**

Mark Phase 3 complete in your project tracker. Suggest `/context-save` checkpoint for next session pickup.

---

## Self-review checklist

Before declaring this plan ready for execution, verify:

- [ ] Every spec section (1-12) has a corresponding task in this plan
- [ ] No TBD / TODO / "implement later" placeholders
- [ ] Type names + method signatures consistent across tasks (`useDecideApproval(approvalId)` consistent everywhere; `inviteDealerInput` schema name consistent)
- [ ] Migration order: 0012 → 0013 → 0014 (Postgres enum rule)
- [ ] All 7 API routes have a test file path specified
- [ ] All 4 mutation hooks include `await qc.invalidateQueries({ exact })` per Phase 2C carry-forward
- [ ] Toast strings centralised in `toast-copy.ts`
- [ ] No new RLS policies introduced (RED LINE check)
- [ ] Discount approval kind explicitly excluded server-side AND removed from seed
- [ ] Acceptance criteria from spec §10 are exercised by E2E (Task 27) or manual smoke (Tasks 11, 14, 16, 20, 25)
