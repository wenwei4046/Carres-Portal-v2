-- 0293_service_case_follow_ups.sql
-- (Drafted as 0291; renumbered before apply — parallel lines applied
--  0291_supplier_claim_lifecycle and 0292_ready_stock_pool_usage to the shared
--  prod database while this was being built. Guardrail #8: check the tracker
--  tail immediately before numbering AND again before applying; both catches
--  came from the second check.)
--
-- Service Case execution queue S3 — **the case drives the follow-ups.**
-- Locked with Jess 2026-07-27 (docs/service-case-execution-queue.md card S3):
-- "on submit, the system creates the next steps instead of the staff
--  remembering", and **closing a case requires all its tasks closed +
--  customer-confirmed.**
--
-- Additive only. Two columns, one helper, two CHECKs, one trigger.
--
--   * service_cases.progress    — jsonb array of {step, on, at, by, by_role,
--                                 note?}. The RECORDED OUTCOME of each step in
--                                 the chain: `on` is the business date (the day
--                                 it happened, or the day the supplier
--                                 promised), `at` is when the row was typed.
--   * service_cases.supplier_id — resolved from the item's SKU at intake and
--                                 SNAPSHOTTED, so the follow-up can NAME the
--                                 factory ("Call Ohana — confirm the repair
--                                 date") instead of saying "the supplier".
--
-- ── Where the STEPS are, and why they are not a table ───────────────────────
--
-- There is no `service_case_tasks` table, and that is the design, not a
-- shortcut. The steps are DERIVED from answers the case already carries
-- (`customer_wants` → `caseFollowUpPlan` in packages/shared/service-case-plan.ts):
--
--   repair        → supplier date · collect · send to supplier · check in · redeliver
--   replace       → supplier date · collect · redeliver
--   missing parts → supplier date · redeliver
--   inspection    → inspect
--   refund        → collect
--   every case    → the customer confirms it is solved
--
-- Rows can be forgotten at creation, deleted, or left pointing at an answer
-- somebody has since edited. A derivation cannot: change what the customer
-- asked for and the chain changes with it, on every screen at once. What the
-- database stores is the half that genuinely IS a fact — that the thing
-- happened, on a date, recorded by a named person.
--
-- Same reasoning as 0289: the CHECKLIST (which steps, in which order) is a
-- function of a multi-valued answer and stays in the shared TypeScript module,
-- enforced by the API. SQL holds only what it can hold ALONE, and holds it
-- exactly:
--
--   1. THE STAMP. `service_case_progress_wellformed` refuses any entry missing
--      step / on / at / by / by_role. "Who recorded it and when" is then
--      structurally true rather than trusted to the write path.
--   2. THE FLOOR. `service_case_close_needs_customer` refuses the transition
--      into a CLOSED status unless the customer's own confirmation is on file.
--      Strictly WEAKER than the API gate (which additionally requires every
--      other step of the chain), so it can never refuse something the API
--      would have allowed — and it is the one half of the card's acceptance
--      that does not depend on which boxes were ticked at intake.
--
-- The floor fires only on the TRANSITION into closed (or on a case born
-- closed). Cases that are already closed — including the one live row,
-- SC2607-01, real data, never delete — are untouched and stay valid.
--
-- Live state when this was written: 1 service case, already closed; 0 rows in
-- progress on anything. Verified in a rolled-back transaction against live
-- before apply.
--
-- RLS: service_cases' single existing policy (sc_op_principal_all, operation +
-- principal, ALL) already covers both new columns. No policy change.

set search_path = public;

alter table public.service_cases
  add column if not exists progress    jsonb not null default '[]'::jsonb,
  add column if not exists supplier_id uuid references public.suppliers(id);

-- ── 1 · the stamp ────────────────────────────────────────────────────────────
-- A CHECK cannot contain a set-returning function, so the per-element walk
-- lives in an IMMUTABLE helper (the 0289 shape). jsonb_typeof(NULL) is NULL and
-- NULL is DISTINCT FROM 'string', so a MISSING key fails exactly the way a
-- wrong-typed one does — which is the point: the stamp cannot be omitted.
create or replace function public.service_case_progress_wellformed(v jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(v) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(v) e
       where jsonb_typeof(e.value)              <> 'object'
          or jsonb_typeof(e.value -> 'step')    is distinct from 'string'
          or jsonb_typeof(e.value -> 'on')      is distinct from 'string'
          or jsonb_typeof(e.value -> 'at')      is distinct from 'string'
          or jsonb_typeof(e.value -> 'by')      is distinct from 'string'
          or jsonb_typeof(e.value -> 'by_role') is distinct from 'string'
          or e.value ->> 'step' = ''
          or e.value ->> 'on'   = ''
     );
$$;

comment on function public.service_case_progress_wellformed(jsonb) is
  'S3 (0293): every follow-up outcome must carry step/on/at/by/by_role. Makes "who recorded it and when" structurally non-optional rather than trusted to the write path.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sc_progress_wellformed') then
    alter table public.service_cases add constraint sc_progress_wellformed
      check (public.service_case_progress_wellformed(progress));
  end if;
end $$;

comment on column public.service_cases.progress is
  'S3 (0293): the follow-up chain''s recorded outcomes — jsonb array of {step, on, at, by, by_role, note?}. step = a key from CASE_STEP_ORDER (packages/shared/service-case-plan.ts); the STEPS themselves are derived from customer_wants, never stored. Append-only: written by the dedicated progress endpoint, never by the generic PATCH.';
comment on column public.service_cases.supplier_id is
  'S3 (0293): the factory this case is about, resolved from product_skus at intake and snapshotted (S1''s law) so the follow-up can name it. Null when the product cannot be traced to one.';

-- An unindexed FK makes every supplier delete seq-scan this table, and S5 will
-- group cases by supplier.
create index if not exists service_cases_supplier_id_idx
  on public.service_cases (supplier_id)
  where supplier_id is not null;

-- ── 2 · the floor: nobody closes a case the customer has not confirmed ───────
-- SECURITY DEFINER on purpose: the function reads service_case_statuses, and a
-- caller who cannot see that row would otherwise resolve is_closed to NULL and
-- sail straight through the gate. A backstop that fails OPEN is not a backstop.
create or replace function public.service_case_close_needs_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_closed boolean;
  was_closed boolean;
begin
  select coalesce(is_closed, false) into now_closed
    from public.service_case_statuses where id = new.status_id;
  if not coalesce(now_closed, false) then
    return new;                       -- not closing; nothing to say
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(is_closed, false) into was_closed
      from public.service_case_statuses where id = old.status_id;
    if coalesce(was_closed, false) then
      return new;                     -- already closed; this is not the transition
    end if;
  end if;

  -- Malformed progress is sc_progress_wellformed's refusal to give, not this
  -- one's: raising here would report the wrong problem.
  if jsonb_typeof(new.progress) is distinct from 'array' then
    return new;
  end if;

  if not exists (
    select 1 from jsonb_array_elements(new.progress) e
    where e.value ->> 'step' = 'customer_confirmed'
  ) then
    raise exception
      'This case cannot be closed yet. Call the customer, then record that they confirmed the problem is solved.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function public.service_case_close_needs_customer() is
  'S3 (0293): the card''s acceptance, as the half the database can hold alone — a case may not ENTER a closed status without the customer''s confirmation on file. Strictly weaker than the API gate (which also requires every other step of the chain), so it can never refuse what the API allows. Fires on the transition only; already-closed cases are untouched.';

drop trigger if exists service_cases_close_needs_customer on public.service_cases;
create trigger service_cases_close_needs_customer
  before insert or update of status_id, progress on public.service_cases
  for each row execute function public.service_case_close_needs_customer();

-- ── sanity ──────────────────────────────────────────────────────────────────
do $$
declare
  refused    boolean;
  case_id    uuid;
  open_st    uuid := (select id from public.service_case_statuses where code = 'pending');
  closed_st  uuid := (select id from public.service_case_statuses where code = 'resolved');
  confirmed  jsonb := jsonb_build_array(jsonb_build_object(
    'step', 'customer_confirmed', 'on', '2026-07-27',
    'at', '2026-07-27T02:00:00Z', 'by', '00000000-0000-0000-0000-000000000001',
    'by_role', 'operation'));
begin
  if open_st is null or closed_st is null then
    raise exception 'S3 sanity: the seeded statuses are missing';
  end if;

  insert into public.service_cases (case_no, customer_name, status_id)
  values ('SC-SANITY-0293', 'sanity', open_st) returning id into case_id;

  if (select jsonb_array_length(progress) from public.service_cases where id = case_id) <> 0 then
    raise exception 'S3 sanity: progress must default to an empty array';
  end if;

  -- THE FLOOR. The flag is set INSIDE the handler and checked OUTSIDE it — a
  -- RAISE inside its own EXCEPTION block catches itself and proves nothing
  -- (the 0279 lesson).
  refused := false;
  begin
    update public.service_cases set status_id = closed_st where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S3 sanity: a case closed with no customer confirmation';
  end if;

  -- A case BORN closed must be refused the same way.
  refused := false;
  begin
    insert into public.service_cases (case_no, customer_name, status_id)
    values ('SC-SANITY-0293b', 'sanity', closed_st);
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S3 sanity: a case was born closed with no customer confirmation';
  end if;

  -- ...and with the confirmation on file it closes (a too-tight gate is as bad
  -- as none).
  update public.service_cases set progress = confirmed where id = case_id;
  update public.service_cases set status_id = closed_st where id = case_id;
  if (select status_id from public.service_cases where id = case_id) is distinct from closed_st then
    raise exception 'S3 sanity: a confirmed case did not close';
  end if;

  -- An already-closed case must stay editable — the gate is the transition, not
  -- a permanent lock on the row.
  update public.service_cases set carres_action = 'edited after closing' where id = case_id;

  -- THE STAMP: an entry with no recorder must be refused...
  refused := false;
  begin
    update public.service_cases
       set progress = jsonb_build_array(jsonb_build_object(
             'step', 'collect', 'on', '2026-07-27', 'at', '2026-07-27T02:00:00Z',
             'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S3 sanity: a progress entry with no recorder was accepted';
  end if;

  -- ...one with no business date...
  refused := false;
  begin
    update public.service_cases
       set progress = jsonb_build_array(jsonb_build_object(
             'step', 'collect', 'at', '2026-07-27T02:00:00Z',
             'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S3 sanity: a progress entry with no date was accepted';
  end if;

  -- ...and a bare object instead of an array.
  refused := false;
  begin
    update public.service_cases set progress = '{"step":"collect"}'::jsonb where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S3 sanity: progress accepted a non-array';
  end if;

  -- A real entry with a note must be ACCEPTED.
  update public.service_cases
     set progress = confirmed || jsonb_build_array(jsonb_build_object(
           'step', 'inspect', 'on', '2026-07-26', 'at', '2026-07-27T02:00:00Z',
           'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation',
           'note', 'Left corner seam open, 4 inches.'))
   where id = case_id;
  if (select jsonb_array_length(progress) from public.service_cases where id = case_id) <> 2 then
    raise exception 'S3 sanity: a stamped progress entry was not stored';
  end if;

  -- The supplier snapshot must accept a real factory and refuse an invented one.
  update public.service_cases
     set supplier_id = (select id from public.suppliers order by name limit 1)
   where id = case_id;

  refused := false;
  begin
    update public.service_cases
       set supplier_id = '00000000-0000-0000-0000-0000000000ff'
     where id = case_id;
  exception when foreign_key_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S3 sanity: supplier_id accepted a supplier that does not exist';
  end if;

  delete from public.service_cases where case_no in ('SC-SANITY-0293', 'SC-SANITY-0293b');

  -- The one real case must be untouched and still readable.
  if not exists (select 1 from public.service_cases where case_no = 'SC2607-01') then
    raise exception 'S3 sanity: the live case is missing';
  end if;

  raise notice 'S3 sanity: OK';
end $$;
