-- =====================================================================
-- 0290 — Ready Stock K3: the urgent (emergency) request lane
-- =====================================================================
-- Card: docs/ready-stock-execution-queue.md § K3 (Jess-locked 2026-07-27).
--   "same flow, any time, flagged EMERGENCY with reason (Promotion ·
--    Unexpected demand · Weekend stock low · OOS risk · New launch · Other);
--    skips consolidation (straight to COO), never mixes into the monthly
--    plan's numbers."
--   Done when: a viral-product weekend can be restocked without waiting for
--   month-end.
--
-- WHAT THIS ADDS
--   1. ops_stock_emergency_requests — ONE table, one row per (item, ask).
--   2. Three audited SECURITY DEFINER RPCs — the ONLY write door. As in 0286
--      and 0287 the table carries a READ policy and NO write policy at all, so
--      a direct PostgREST write is impossible for every role and the gates
--      below cannot be walked around.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHY A SEPARATE TABLE RATHER THAN A FLAG ON THE PROPOSALS
--
-- "Never mixes into the monthly plan's numbers" is the card's own sentence,
-- and an `is_emergency` boolean on `ops_stock_plan_proposals` would have been
-- less SQL. It would also have made every future reader of that table
-- responsible for remembering to filter it — and the first one who forgets
-- silently inflates a month's ask with a weekend panic, which is exactly the
-- failure the sentence exists to prevent.
--
-- So the guarantee is structural instead: an urgent ask is not a proposal, it
-- has NO `plan_id` column, and K2's `computePlanView` reads proposals. The two
-- lanes cannot be joined by accident because there is nothing to join on. The
-- sanity block at the bottom asserts that absence, so a later card cannot
-- quietly add the column and reconnect them.
--
-- WHY THERE IS NO CYCLE
--
-- A request is filed against a DAY, not a month. That is what makes "any time"
-- real: gating an emergency behind the monthly cycle's `collecting` window
-- would reproduce the exact wait the card is written to remove.
--
-- WHY A FOURTH STATE (`ordered`) THE CARD DOES NOT NAME
--
-- K2's handover list is scoped by its month, so it clears itself. This lane
-- runs continuously — without a way to say "I raised the PO" an approved
-- request would sit on the worklist forever and the list would stop being a
-- worklist. This is NOT auto-PO (the queue doc's LATER section); it is a human
-- ticking a box, gated on `po_duty_editor` — the duty that already means "the
-- person who raises purchase orders".
--
-- THE GATES (ZERO new duty keys — 0286's note, asserted in 0287, held here)
--   raise         → any active operation/principal login. It is the person on
--                   the floor who sees the shelf empty; a duty gate here would
--                   mean the only people who can report an emergency are the
--                   two who are already busy.
--   decide        → `stock_planner` (or principal) — the COO's call, the same
--                   seat that approves the monthly plan. There is deliberately
--                   NO consolidation gate: the card says this lane skips it,
--                   so cutting the number and approving it are ONE act.
--   mark ordered  → `po_duty_editor` (or principal).
--
-- Measured live 2026-07-27 before writing this: `org_duties` holds exactly the
-- six keys 0287 asserted, and Jess is the only active person holding any of
-- them (`ops_manager`, `stock_planner`, `po_duty_editor`, `account_creator`,
-- `finance_approver`). Both gates resolve to her today — honest for a company
-- this size, and hiring a purchaser or a planner splits the lane by granting a
-- seat, with no migration and no code change.
-- ─────────────────────────────────────────────────────────────────────
--
-- NOT IN SCOPE (later cards, deliberately): pool usage reasons + reserve
-- levels (K4), the health ladder and slow-moving alerts (K5), and
-- auto-creating the purchase order.
--
-- Tail re-checked immediately before apply (guardrail #8): 0289 was the tail.
-- Dry-run: full body + 24 behaviour assertions in a rolled-back transaction on
-- live prod, verified to leave 0 tables / 0 functions / 0 audit rows behind.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The ask
-- ---------------------------------------------------------------------
create table if not exists public.ops_stock_emergency_requests (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null check (btrim(sku) <> ''),
  qty             int  not null check (qty > 0 and qty <= 100000),
  -- The card's six, verbatim. Mirrored by EMERGENCY_REASONS in
  -- packages/shared/src/emergency-stock-request.ts — a flat, locked key list,
  -- so unlike 0289's per-slot evidence rules a CHECK is a true mirror here and
  -- not a copy that can drift into a different answer.
  reason          text not null check (reason in (
                    'promotion','unexpected_demand','weekend_low',
                    'oos_risk','new_launch','other')),
  note            text,
  requested_by    uuid not null references public.app_users(id),
  requested_at    timestamptz not null default now(),

  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected','ordered')),

  approved_qty    int check (approved_qty >= 0 and approved_qty <= 100000),
  decided_by      uuid references public.app_users(id),
  decided_at      timestamptz,
  decision_remark text,

  ordered_by      uuid references public.app_users(id),
  ordered_at      timestamptz,
  updated_at      timestamptz not null default now(),

  -- "Other" with an empty note explains nothing, and the whole point of a
  -- locked reason list is that K4/K5 can read WHY the ready pool drains. The
  -- same rule refuses it on the client, in the route and here — the DB is the
  -- one that cannot be skipped.
  constraint ops_stock_emergency_other_needs_words
    check (reason <> 'other' or btrim(coalesce(note, '')) <> ''),

  -- A decided row must say who decided it. Without this a status could be
  -- flipped by any future path and read as an approval nobody made.
  constraint ops_stock_emergency_decision_is_attributed
    check (
      status = 'pending'
      or (decided_by is not null and decided_at is not null)
    ),

  -- Turning an ask down without a word is not an answer.
  constraint ops_stock_emergency_reject_needs_reason
    check (status <> 'rejected' or btrim(coalesce(decision_remark, '')) <> ''),

  -- Ordered means somebody raised the PO — it can only follow an approval that
  -- carries a number, and it has to say who.
  constraint ops_stock_emergency_ordered_is_attributed
    check (
      status <> 'ordered'
      or (ordered_by is not null and ordered_at is not null
          and coalesce(approved_qty, 0) > 0)
    )
);

comment on table public.ops_stock_emergency_requests is
  'Ready stock URGENT lane (K3). Deliberately has NO plan_id: an urgent ask is not a monthly proposal, so the card''s "never mixes into the monthly plan''s numbers" is structural rather than a filter somebody has to remember. Written only by the ops_stock_emergency_* RPCs.';
comment on column public.ops_stock_emergency_requests.status is
  'pending -> approved|rejected -> ordered. rejected and ordered are TERMINAL; a turned-down ask is raised again, never quietly re-approved.';
comment on column public.ops_stock_emergency_requests.approved_qty is
  'The COO''s number, which may be smaller than qty. The urgent PO list reads THIS and never falls back to what was asked — 0287''s law.';

alter table public.ops_stock_emergency_requests enable row level security;

-- READ for the operation panel. NO write policy, on purpose (0287's shape,
-- 0279's lesson: a blanket write policy is an open door no RPC gate can close).
drop policy if exists ops_stock_emergency_read on public.ops_stock_emergency_requests;
create policy ops_stock_emergency_read on public.ops_stock_emergency_requests
  for select
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

-- The screen's default question is "what is waiting for me?".
create index if not exists ops_stock_emergency_open_idx
  on public.ops_stock_emergency_requests (status, requested_at desc);

-- ---------------------------------------------------------------------
-- 2. Raise — any operation login
-- ---------------------------------------------------------------------
create or replace function public.ops_stock_emergency_raise(
  p_sku    text,
  p_qty    int,
  p_reason text,
  p_note   text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.app_role());
  v_sku  text := nullif(btrim(coalesce(p_sku, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id   uuid;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'the urgent restock lane is an operation surface';
  end if;
  if v_sku is null then
    raise exception 'sku_required' using errcode = '22023';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > 100000 then
    raise exception 'qty_out_of_range' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in (
       'promotion','unexpected_demand','weekend_low',
       'oos_risk','new_launch','other') then
    raise exception 'bad_reason' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'reason_needs_words' using errcode = '22023',
      detail = 'say what the reason is when you pick Other';
  end if;

  insert into ops_stock_emergency_requests (sku, qty, reason, note, requested_by)
  values (v_sku, p_qty, p_reason, v_note, auth.uid())
  returning id into v_id;

  -- audit_log.role is the app_role ENUM, not text (0286 caught this the hard
  -- way: without the cast EVERY successful write raises 42804).
  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          format('Urgent restock raised · %s x%s · %s', v_sku, p_qty, p_reason),
          v_id::text);

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Decide — approve (optionally at a smaller number) or turn down
--    (stock_planner). Cutting and approving are ONE act: this lane skips
--    consolidation, so it must be answerable in one click.
-- ---------------------------------------------------------------------
create or replace function public.ops_stock_emergency_decide(
  p_id       uuid,
  p_decision text,
  p_qty      int  default null,
  p_remark   text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text := (select public.app_role());
  v_remark text := nullif(btrim(coalesce(p_remark, '')), '');
  v_status text;
  v_sku    text;
  v_asked  int;
  v_qty    int;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Same seat that approves the monthly plan. `is_internal()` is deliberately
  -- NOT used: it admits roles that have no business committing purchase money.
  if not public.ops_stock_plan_has_duty('stock_planner') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'answering an urgent request is the COO''s call';
  end if;
  if p_decision is null or p_decision not in ('approve','reject') then
    raise exception 'bad_decision' using errcode = '22023';
  end if;
  if p_decision = 'reject' and v_remark is null then
    raise exception 'remark_required' using errcode = '22023';
  end if;

  select status, sku, qty into v_status, v_sku, v_asked
    from ops_stock_emergency_requests where id = p_id
    for update;
  if v_status is null then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
  -- Only an outstanding ask can be answered. Re-deciding a settled one would
  -- put two answers in the trail for one question.
  if v_status <> 'pending' then
    raise exception 'request_already_answered' using errcode = '22023',
      detail = format('request is %s', v_status);
  end if;

  if p_decision = 'approve' then
    -- Silence means "yes, as asked" — the same place a fallback is correct in
    -- 0287 (approving is an explicit act over this one row). The PO list still
    -- reads approved_qty and never guesses.
    v_qty := coalesce(p_qty, v_asked);
    if v_qty < 0 or v_qty > 100000 then
      raise exception 'qty_out_of_range' using errcode = '22023';
    end if;
    -- Approving zero is a refusal wearing a different word, and it would leave
    -- a row that reads "approved" but can never be ordered.
    if v_qty = 0 then
      raise exception 'nothing_to_approve' using errcode = '22023',
        detail = 'turn the request down instead of approving zero';
    end if;

    update ops_stock_emergency_requests
       set status          = 'approved',
           approved_qty    = v_qty,
           decided_by      = auth.uid(),
           decided_at      = now(),
           decision_remark = v_remark,
           updated_at      = now()
     where id = p_id;
  else
    update ops_stock_emergency_requests
       set status          = 'rejected',
           approved_qty    = null,
           decided_by      = auth.uid(),
           decided_at      = now(),
           decision_remark = v_remark,
           updated_at      = now()
     where id = p_id;
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          case when p_decision = 'approve'
               then format('Urgent restock APPROVED · %s x%s (asked %s)', v_sku, v_qty, v_asked)
               else format('Urgent restock turned down · %s · %s', v_sku, v_remark)
          end,
          p_id::text);
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Mark ordered — the purchase order has been raised (po_duty_editor).
--    This is what keeps a continuous worklist a worklist.
-- ---------------------------------------------------------------------
create or replace function public.ops_stock_emergency_mark_ordered(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text := (select public.app_role());
  v_status text;
  v_sku    text;
  v_qty    int;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.ops_stock_plan_has_duty('po_duty_editor') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'only the person who raises purchase orders can tick this off';
  end if;

  select status, sku, approved_qty into v_status, v_sku, v_qty
    from ops_stock_emergency_requests where id = p_id
    for update;
  if v_status is null then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
  -- Nothing that was never approved can have been ordered.
  if v_status <> 'approved' then
    raise exception 'request_not_approved' using errcode = '22023',
      detail = format('request is %s', v_status);
  end if;

  update ops_stock_emergency_requests
     set status     = 'ordered',
         ordered_by = auth.uid(),
         ordered_at = now(),
         updated_at = now()
   where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          format('Urgent restock ordered · %s x%s', v_sku, v_qty),
          p_id::text);
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Grants — revoke from BOTH public and anon, then grant back.
--    (Neither revoke alone does anything on Supabase; the pair plus the
--     explicit grant is the only shape that holds — 0268's measurement.)
-- ---------------------------------------------------------------------
revoke all on function public.ops_stock_emergency_raise(text, int, text, text) from public, anon;
revoke all on function public.ops_stock_emergency_decide(uuid, text, int, text) from public, anon;
revoke all on function public.ops_stock_emergency_mark_ordered(uuid)            from public, anon;

grant execute on function public.ops_stock_emergency_raise(text, int, text, text) to authenticated;
grant execute on function public.ops_stock_emergency_decide(uuid, text, int, text) to authenticated;
grant execute on function public.ops_stock_emergency_mark_ordered(uuid)            to authenticated;

-- ---------------------------------------------------------------------
-- 6. Sanity — flags set inside handlers, ASSERTED OUTSIDE them
--    (guardrail #4: a RAISE inside its own EXCEPTION handler catches
--     itself and proves nothing).
-- ---------------------------------------------------------------------
do $sanity$
declare
  v_sigs      text[] := array[
    'public.ops_stock_emergency_raise(text, int, text, text)',
    'public.ops_stock_emergency_decide(uuid, text, int, text)',
    'public.ops_stock_emergency_mark_ordered(uuid)'
  ];
  v_sig       text;
  v_write_pol int;
  v_read_pol  int;
  v_overloads int;
  v_new_duty  int;
  v_plan_link int;
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
     and tablename = 'ops_stock_emergency_requests'
     and cmd <> 'SELECT';
  if v_write_pol <> 0 then
    raise exception 'SANITY: % write policies on the urgent table — the RPC gate is walkable', v_write_pol;
  end if;

  select count(*) into v_read_pol
    from pg_policies
   where schemaname = 'public'
     and tablename = 'ops_stock_emergency_requests'
     and cmd = 'SELECT';
  if v_read_pol <> 1 then
    raise exception 'SANITY: expected 1 read policy, found %', v_read_pol;
  end if;

  -- A ghost overload is how a "fixed" gate keeps serving the old body.
  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ops_stock_emergency_raise','ops_stock_emergency_decide',
                       'ops_stock_emergency_mark_ordered');
  if v_overloads <> 3 then
    raise exception 'SANITY: expected exactly 3 urgent functions, found %', v_overloads;
  end if;

  -- K3 mints NO duty key either. Same restraint 0287 asserted.
  select count(*) into v_new_duty
    from org_duties where key not in
      ('ops_manager','po_duty_editor','account_creator','finance_approver',
       'roster_editor','stock_planner');
  if v_new_duty <> 0 then
    raise exception 'SANITY: % unexpected duty key(s) — K3 must mint none', v_new_duty;
  end if;

  -- THE CARD'S OWN LINE, made structural: there is nothing to join the two
  -- lanes on. If a later card adds a plan link, this trips and the reviewer
  -- has to argue for it out loud.
  select count(*) into v_plan_link
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'ops_stock_emergency_requests'
     and column_name in ('plan_id','period');
  if v_plan_link <> 0 then
    raise exception 'SANITY: the urgent table gained a plan link — it must never mix into the monthly numbers';
  end if;

  raise notice 'K3 sanity OK: anon=false auth=true write_policies=0 read_policies=1 functions=3 new_duties=0 plan_link=0';
end;
$sanity$;
