-- =====================================================================
-- 0287 — Ready Stock K2: the monthly plan
--        (propose → consolidate → approve → PO list)
-- =====================================================================
-- Card: docs/ready-stock-execution-queue.md § K2 (Jess-locked 2026-07-27).
--   "Salesperson submits wanted qty per SKU; Sales Manager sees all proposals
--    + system columns (30/90-day sales · weekend share · current · incoming ·
--    suggestion) and consolidates; COO approves / edits / rejects with
--    remarks; approval hands Operations a ready-to-create PO list.
--    Over-suggestion warning warns, never blocks."
--   Done when: the whole chain is auditable — who asked, who cut, who
--   approved, what was ordered.
--
-- WHAT THIS ADDS
--   1. ops_stock_plans           — one cycle per month.
--   2. ops_stock_plan_proposals  — one row per (cycle, sku, person): the ask.
--   3. ops_stock_plan_lines      — one row per (cycle, sku): the cut + the
--                                  final approved number.
--   4. Five audited SECURITY DEFINER RPCs — the ONLY write door. As in 0286,
--      the tables carry a READ policy and NO write policy at all, so a direct
--      PostgREST write is impossible for every role and the gates below
--      cannot be walked around.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHY THE ACTORS ARE DUTIES, NOT THE CARD'S THREE JOB TITLES
--
-- The card's chain names Salesperson → Sales Manager → COO → Operations.
-- Measured on live prod 2026-07-27, before writing a line of this:
--
--   • `salespersons` holds 5 active rows and ALL FIVE have `user_id = null`.
--     They sign in by PIN (0233); they have no `app_users` row, so they
--     structurally cannot authenticate to the ops API. Wiring "salesperson
--     proposes" to a salesperson login would have produced a lane with ZERO
--     possible submitters on day one.
--   • There is no Sales Manager seat. The ONLY active person holding any duty
--     at all is Jess (COO), who holds all five.
--
-- Shipping the titles literally would therefore have shipped a lane nothing
-- could enter — the HR-P6 lesson (a rollup routed through a seat that does not
-- exist tells the COO her team sold nothing). So the four STAGES are kept
-- exactly as locked, and each is gated on a duty that already exists:
--
--   propose      → any active operation/principal login
--   consolidate  → `ops_manager`   (or principal)
--   approve/send back + edit a final qty
--                → `stock_planner` (or principal) — Jess's locked line
--                  "Only the COO edits reorder points / reserve levels /
--                   approval rules"
--
-- ZERO new duty keys are minted (0286's note: K4 reuses `stock_planner`; the
-- same restraint applies here). Both gates resolve to Jess today, which is
-- honest for a company this size — and the day a Sales Manager is hired,
-- granting that seat `ops_manager` splits the flow with no migration and no
-- code change.
-- ─────────────────────────────────────────────────────────────────────
--
-- NOT IN SCOPE (later cards, deliberately): the emergency lane (K3), pool
-- usage reasons + reserve levels (K4), the health ladder and slow-moving
-- alerts (K5), and auto-creating the PO (the queue doc's LATER section — an
-- approved plan hands over a LIST until the flow proves itself live).
--
-- Tail re-checked immediately before apply (guardrail #8): 0286 was the tail.
-- Dry-run: full body + 21 behaviour assertions in a rolled-back transaction on
-- live prod, verified to leave 0 tables / 0 functions / 0 audit rows behind.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The cycle
-- ---------------------------------------------------------------------
create table if not exists public.ops_stock_plans (
  id                uuid primary key default gen_random_uuid(),
  -- Month anchor. The CHECK is what makes "one plan per month" real: without
  -- it the UNIQUE index would happily accept 2026-08-01 and 2026-08-15 as two
  -- different August plans, and the audit trail would show two answers for one
  -- cycle.
  period            date not null unique check (extract(day from period) = 1),
  title             text,
  status            text not null default 'collecting'
                      check (status in ('collecting','review','approved','rejected')),
  opened_by         uuid references public.app_users(id),
  opened_at         timestamptz not null default now(),
  consolidated_by   uuid references public.app_users(id),
  consolidated_at   timestamptz,
  decided_by        uuid references public.app_users(id),
  decided_at        timestamptz,
  decision_remark   text,
  updated_at        timestamptz not null default now()
);

comment on table public.ops_stock_plans is
  'Ready stock monthly plan cycle (K2). collecting -> review -> approved|rejected. Written only by the ops_stock_plan_* RPCs.';
comment on column public.ops_stock_plans.status is
  'rejected is TERMINAL — a sent-back plan is replaced by opening a new cycle, never quietly re-approved, so the trail never shows two answers for one plan.';

-- ---------------------------------------------------------------------
-- 2. The ask — one row per person per SKU
-- ---------------------------------------------------------------------
create table if not exists public.ops_stock_plan_proposals (
  plan_id      uuid not null references public.ops_stock_plans(id) on delete cascade,
  sku          text not null,
  proposed_by  uuid not null references public.app_users(id),
  qty          int  not null check (qty > 0 and qty <= 100000),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (plan_id, sku, proposed_by)
);

comment on table public.ops_stock_plan_proposals is
  'Who asked for how much (K2). One row per (cycle, sku, person) — re-proposing overwrites your own number, it never stacks. qty is CHECKed > 0: withdrawing deletes the row rather than leaving a 0 that reads like "I want none".';

-- ---------------------------------------------------------------------
-- 3. The cut and the decision — one row per SKU
-- ---------------------------------------------------------------------
create table if not exists public.ops_stock_plan_lines (
  plan_id           uuid not null references public.ops_stock_plans(id) on delete cascade,
  sku               text not null,
  consolidated_qty  int check (consolidated_qty >= 0 and consolidated_qty <= 100000),
  consolidated_by   uuid references public.app_users(id),
  consolidated_at   timestamptz,
  consolidated_note text,
  approved_qty      int check (approved_qty >= 0 and approved_qty <= 100000),
  updated_at        timestamptz not null default now(),
  primary key (plan_id, sku)
);

comment on table public.ops_stock_plan_lines is
  'The manager''s cut and the COO''s final number (K2). approved_qty is the ONLY thing the PO list reads — never a fallback to consolidated_qty — so every ordered unit traces to a decision somebody made. 0 = cut, and drops off the list.';

alter table public.ops_stock_plans           enable row level security;
alter table public.ops_stock_plan_proposals  enable row level security;
alter table public.ops_stock_plan_lines      enable row level security;

-- READ for the operation panel. NO write policy on any of the three, on
-- purpose (0286's shape, and 0279's lesson: a blanket write policy is an open
-- door no RPC gate can close).
drop policy if exists ops_stock_plans_read on public.ops_stock_plans;
create policy ops_stock_plans_read on public.ops_stock_plans
  for select
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

drop policy if exists ops_stock_plan_proposals_read on public.ops_stock_plan_proposals;
create policy ops_stock_plan_proposals_read on public.ops_stock_plan_proposals
  for select
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

drop policy if exists ops_stock_plan_lines_read on public.ops_stock_plan_lines;
create policy ops_stock_plan_lines_read on public.ops_stock_plan_lines
  for select
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

create index if not exists ops_stock_plan_proposals_plan_idx
  on public.ops_stock_plan_proposals (plan_id);
create index if not exists ops_stock_plan_lines_plan_idx
  on public.ops_stock_plan_lines (plan_id);

-- ---------------------------------------------------------------------
-- 4. The gates, in one place
-- ---------------------------------------------------------------------
-- Duties are read INLINE rather than through my_org_duties(), so the gate
-- cannot be loosened later by editing that helper (0286's reasoning). The
-- dealer-exclusion + active-status laws are reproduced here for the same
-- reason.
create or replace function public.ops_stock_plan_has_duty(p_duty text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select role from app_users where id = auth.uid() and status = 'active') = 'principal'
    or exists (
      select 1
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
      where u.id = auth.uid()
        and u.status = 'active'
        and u.role <> 'dealer'
        and pd.duty_key = p_duty
    ),
  false);
$function$;

comment on function public.ops_stock_plan_has_duty(text) is
  'K2 gate helper. principal always passes (the standing role gate, never expressed as a duty — 0260''s law).';

-- ---------------------------------------------------------------------
-- 5. Open a cycle — idempotent per month
-- ---------------------------------------------------------------------
create or replace function public.ops_stock_plan_open(
  p_period date,
  p_title  text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role  text := (select public.app_role());
  v_month date;
  v_id    uuid;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'the ready stock plan is an operation surface';
  end if;

  if p_period is null then
    raise exception 'period_required' using errcode = '22023';
  end if;

  v_month := date_trunc('month', p_period)::date;

  -- Idempotent: two people opening August must land on ONE plan, not race into
  -- two cycles that each hold half the proposals.
  select id into v_id from ops_stock_plans where period = v_month;
  if v_id is not null then
    return v_id;
  end if;

  insert into ops_stock_plans (period, title, opened_by)
  values (v_month, nullif(btrim(coalesce(p_title, '')), ''), auth.uid())
  returning id into v_id;

  -- audit_log.role is the app_role ENUM, not text — v_role is held as text so
  -- it can be compared above, so the cast is required (0286 caught this the
  -- hard way: without it EVERY successful write raises 42804).
  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          format('Ready stock plan opened · %s', to_char(v_month, 'YYYY-MM')),
          v_id::text);

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. Propose — my ask. qty 0 withdraws it.
-- ---------------------------------------------------------------------
create or replace function public.ops_stock_plan_propose(
  p_plan uuid,
  p_sku  text,
  p_qty  int,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text := (select public.app_role());
  v_sku    text := nullif(btrim(coalesce(p_sku, '')), '');
  v_status text;
  v_period date;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sku is null then
    raise exception 'sku_required' using errcode = '22023';
  end if;
  if p_qty is null or p_qty < 0 or p_qty > 100000 then
    raise exception 'qty_out_of_range' using errcode = '22023';
  end if;

  select status, period into v_status, v_period
    from ops_stock_plans where id = p_plan;
  if v_status is null then
    raise exception 'plan_not_found' using errcode = '22023';
  end if;
  -- Proposals close when the manager starts cutting. Letting a late ask land
  -- mid-consolidation would silently change a total somebody already reviewed.
  if v_status <> 'collecting' then
    raise exception 'plan_closed_for_proposals' using errcode = '22023',
      detail = format('plan is %s', v_status);
  end if;

  if p_qty = 0 then
    delete from ops_stock_plan_proposals
     where plan_id = p_plan and sku = v_sku and proposed_by = auth.uid();
  else
    insert into ops_stock_plan_proposals (plan_id, sku, proposed_by, qty, note)
    values (p_plan, v_sku, auth.uid(), p_qty,
            nullif(btrim(coalesce(p_note, '')), ''))
    on conflict (plan_id, sku, proposed_by) do update
      set qty = excluded.qty, note = excluded.note, updated_at = now();
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          case when p_qty = 0
               then format('Ready stock ask withdrawn · %s · %s', to_char(v_period, 'YYYY-MM'), v_sku)
               else format('Ready stock ask · %s · %s x%s', to_char(v_period, 'YYYY-MM'), v_sku, p_qty)
          end,
          p_plan::text);
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. Consolidate — the manager's cut (ops_manager)
-- ---------------------------------------------------------------------
create or replace function public.ops_stock_plan_consolidate(
  p_plan uuid,
  p_sku  text,
  p_qty  int,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text := (select public.app_role());
  v_sku    text := nullif(btrim(coalesce(p_sku, '')), '');
  v_status text;
  v_period date;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.ops_stock_plan_has_duty('ops_manager') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'consolidating is the sales manager''s call';
  end if;
  if v_sku is null then
    raise exception 'sku_required' using errcode = '22023';
  end if;
  if p_qty is null or p_qty < 0 or p_qty > 100000 then
    raise exception 'qty_out_of_range' using errcode = '22023';
  end if;

  select status, period into v_status, v_period
    from ops_stock_plans where id = p_plan;
  if v_status is null then
    raise exception 'plan_not_found' using errcode = '22023';
  end if;
  if v_status in ('approved','rejected') then
    raise exception 'plan_decided' using errcode = '22023',
      detail = format('plan is %s', v_status);
  end if;

  insert into ops_stock_plan_lines
    (plan_id, sku, consolidated_qty, consolidated_by, consolidated_at, consolidated_note)
  values (p_plan, v_sku, p_qty, auth.uid(), now(),
          nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (plan_id, sku) do update
    set consolidated_qty  = excluded.consolidated_qty,
        consolidated_by   = excluded.consolidated_by,
        consolidated_at   = now(),
        consolidated_note = excluded.consolidated_note,
        updated_at        = now();

  -- The first cut moves the cycle into review, which is also what closes
  -- proposals. One act, so the two can never disagree.
  update ops_stock_plans
     set status          = 'review',
         consolidated_by = auth.uid(),
         consolidated_at = coalesce(consolidated_at, now()),
         updated_at      = now()
   where id = p_plan and status = 'collecting';

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          format('Ready stock consolidated · %s · %s -> %s',
                 to_char(v_period, 'YYYY-MM'), v_sku, p_qty),
          p_plan::text);
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. Edit a final quantity before approving (stock_planner)
-- ---------------------------------------------------------------------
create or replace function public.ops_stock_plan_set_final(
  p_plan uuid,
  p_sku  text,
  p_qty  int
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text := (select public.app_role());
  v_sku    text := nullif(btrim(coalesce(p_sku, '')), '');
  v_status text;
  v_period date;
  v_hit    int;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.ops_stock_plan_has_duty('stock_planner') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'the final quantity is the COO''s call';
  end if;
  if v_sku is null then
    raise exception 'sku_required' using errcode = '22023';
  end if;
  if p_qty is null or p_qty < 0 or p_qty > 100000 then
    raise exception 'qty_out_of_range' using errcode = '22023';
  end if;

  select status, period into v_status, v_period
    from ops_stock_plans where id = p_plan;
  if v_status is null then
    raise exception 'plan_not_found' using errcode = '22023';
  end if;
  -- Only while the decision is outstanding. Editing an APPROVED plan would
  -- change what Operations was told to order after they were told it.
  if v_status <> 'review' then
    raise exception 'plan_not_in_review' using errcode = '22023',
      detail = format('plan is %s', v_status);
  end if;

  update ops_stock_plan_lines
     set approved_qty = p_qty, updated_at = now()
   where plan_id = p_plan and sku = v_sku;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'line_not_found' using errcode = '22023',
      detail = 'consolidate the SKU before setting its final quantity';
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          format('Ready stock final qty · %s · %s -> %s',
                 to_char(v_period, 'YYYY-MM'), v_sku, p_qty),
          p_plan::text);
end;
$function$;

-- ---------------------------------------------------------------------
-- 9. Approve / send back (stock_planner)
-- ---------------------------------------------------------------------
create or replace function public.ops_stock_plan_decide(
  p_plan     uuid,
  p_decision text,
  p_remark   text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role     text := (select public.app_role());
  v_remark   text := nullif(btrim(coalesce(p_remark, '')), '');
  v_status   text;
  v_period   date;
  v_lines    int;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.ops_stock_plan_has_duty('stock_planner') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'approving the plan is the COO''s call';
  end if;
  if p_decision is null or p_decision not in ('approve','reject') then
    raise exception 'bad_decision' using errcode = '22023';
  end if;
  -- Sending a plan back with no reason is not a decision — the person who
  -- proposed has to know what to change.
  if p_decision = 'reject' and v_remark is null then
    raise exception 'remark_required' using errcode = '22023';
  end if;

  select status, period into v_status, v_period
    from ops_stock_plans where id = p_plan;
  if v_status is null then
    raise exception 'plan_not_found' using errcode = '22023';
  end if;
  if v_status <> 'review' then
    raise exception 'plan_not_in_review' using errcode = '22023',
      detail = format('plan is %s', v_status);
  end if;

  if p_decision = 'approve' then
    -- A line the COO did not touch is approved AT THE MANAGER'S NUMBER. This
    -- is the one place a fallback is correct: approving is an explicit act
    -- over the whole list, so silence here means "yes, as cut" — unlike the
    -- PO list, which must never guess.
    update ops_stock_plan_lines
       set approved_qty = coalesce(approved_qty, consolidated_qty),
           updated_at   = now()
     where plan_id = p_plan;

    select count(*) into v_lines
      from ops_stock_plan_lines
     where plan_id = p_plan and coalesce(approved_qty, 0) > 0;

    -- Approving nothing is a reject wearing a different word.
    if v_lines = 0 then
      raise exception 'nothing_to_approve' using errcode = '22023',
        detail = 'every line is zero or uncut — send the plan back instead';
    end if;
  end if;

  update ops_stock_plans
     set status          = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         decided_by      = auth.uid(),
         decided_at      = now(),
         decision_remark = v_remark,
         updated_at      = now()
   where id = p_plan;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          case when p_decision = 'approve'
               then format('Ready stock plan APPROVED · %s · %s lines', to_char(v_period, 'YYYY-MM'), v_lines)
               else format('Ready stock plan sent back · %s · %s', to_char(v_period, 'YYYY-MM'), v_remark)
          end,
          p_plan::text);
end;
$function$;

-- ---------------------------------------------------------------------
-- 10. Grants — revoke from BOTH public and anon, then grant back.
--     (Neither revoke alone does anything on Supabase; the pair plus the
--      explicit grant is the only shape that holds — 0268's measurement.)
-- ---------------------------------------------------------------------
revoke all on function public.ops_stock_plan_has_duty(text)                    from public, anon;
revoke all on function public.ops_stock_plan_open(date, text)                  from public, anon;
revoke all on function public.ops_stock_plan_propose(uuid, text, int, text)    from public, anon;
revoke all on function public.ops_stock_plan_consolidate(uuid, text, int, text) from public, anon;
revoke all on function public.ops_stock_plan_set_final(uuid, text, int)        from public, anon;
revoke all on function public.ops_stock_plan_decide(uuid, text, text)          from public, anon;

grant execute on function public.ops_stock_plan_has_duty(text)                    to authenticated;
grant execute on function public.ops_stock_plan_open(date, text)                  to authenticated;
grant execute on function public.ops_stock_plan_propose(uuid, text, int, text)    to authenticated;
grant execute on function public.ops_stock_plan_consolidate(uuid, text, int, text) to authenticated;
grant execute on function public.ops_stock_plan_set_final(uuid, text, int)        to authenticated;
grant execute on function public.ops_stock_plan_decide(uuid, text, text)          to authenticated;

-- ---------------------------------------------------------------------
-- 11. Sanity — flags set inside handlers, ASSERTED OUTSIDE them
--     (guardrail #4: a RAISE inside its own EXCEPTION handler catches
--      itself and proves nothing).
-- ---------------------------------------------------------------------
do $sanity$
declare
  v_sigs      text[] := array[
    'public.ops_stock_plan_has_duty(text)',
    'public.ops_stock_plan_open(date, text)',
    'public.ops_stock_plan_propose(uuid, text, int, text)',
    'public.ops_stock_plan_consolidate(uuid, text, int, text)',
    'public.ops_stock_plan_set_final(uuid, text, int)',
    'public.ops_stock_plan_decide(uuid, text, text)'
  ];
  v_sig       text;
  v_write_pol int;
  v_read_pol  int;
  v_overloads int;
  v_new_duty  int;
begin
  foreach v_sig in array v_sigs loop
    if has_function_privilege('anon', v_sig, 'execute') then
      raise exception 'SANITY: anon can execute %', v_sig;
    end if;
    if not has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception 'SANITY: authenticated cannot execute %', v_sig;
    end if;
  end loop;

  select count(*) into v_write_pol
    from pg_policies
   where schemaname = 'public'
     and tablename in ('ops_stock_plans','ops_stock_plan_proposals','ops_stock_plan_lines')
     and cmd <> 'SELECT';
  if v_write_pol <> 0 then
    raise exception 'SANITY: % write policies on the plan tables — the RPC gate is walkable', v_write_pol;
  end if;

  select count(*) into v_read_pol
    from pg_policies
   where schemaname = 'public'
     and tablename in ('ops_stock_plans','ops_stock_plan_proposals','ops_stock_plan_lines')
     and cmd = 'SELECT';
  if v_read_pol <> 3 then
    raise exception 'SANITY: expected 3 read policies, found %', v_read_pol;
  end if;

  -- A ghost overload is how a "fixed" gate keeps serving the old body.
  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ops_stock_plan_has_duty','ops_stock_plan_open',
                       'ops_stock_plan_propose','ops_stock_plan_consolidate',
                       'ops_stock_plan_set_final','ops_stock_plan_decide');
  if v_overloads <> 6 then
    raise exception 'SANITY: expected exactly 6 plan functions, found %', v_overloads;
  end if;

  -- K2 mints NO duty key. If this ever trips, someone added one against the
  -- card's own restraint (0286's note: K4 reuses stock_planner).
  select count(*) into v_new_duty
    from org_duties where key not in
      ('ops_manager','po_duty_editor','account_creator','finance_approver',
       'roster_editor','stock_planner');
  if v_new_duty <> 0 then
    raise exception 'SANITY: % unexpected duty key(s) — K2 must mint none', v_new_duty;
  end if;

  raise notice 'K2 sanity OK: anon=false auth=true write_policies=0 read_policies=3 functions=6 new_duties=0';
end;
$sanity$;
