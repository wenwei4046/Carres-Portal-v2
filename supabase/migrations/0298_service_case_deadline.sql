-- 0298_service_case_deadline.sql
--
-- Service Case execution queue S4 — **no case silently passes day 14.**
-- Locked with Jess 2026-07-27 (docs/service-case-execution-queue.md card S4):
-- "every case shows its deadline (14 WORKING days from report) … at day 10
--  unresolved the operator informs the customer BEFORE day 14, with a T4-style
--  structured reason … special-order parts may extend once — extension
--  recorded with reason."
--
-- Additive only. ONE column, two helpers, two CHECKs. No trigger, no RPC.
--
--   * service_cases.sla_events — jsonb array of
--     {kind, on, reason, note?, until?, due, at, by, by_role}
--
-- ── Where the DEADLINE is, and why it is not a column ───────────────────────
--
-- There is no `due_at`. The deadline is `opened_at + 14 working days`, computed
-- every time the case is read (packages/shared/service-case-sla.ts, the same
-- working-day engine procurement and delivery already use). A stored deadline
-- is a copy of a rule: correct the holiday calendar and every stored copy is
-- silently wrong, while a derivation fixes every case at once. This is the same
-- decision 0293 made about the follow-up steps, applied to the clock.
--
-- What the database stores is the half that genuinely IS a fact and cannot be
-- derived from anything: that somebody rang the customer on a date and gave a
-- reason, and that the deadline was moved once.
--
-- ── Why every event carries the deadline it was made against ────────────────
--
-- "The customer has been told" is never true in general — it is true about ONE
-- deadline. So each event records `due`, the deadline in force when it was
-- made, and an extension records `until`, the deadline it CREATED. The call is
-- owed again whenever no event points at the deadline in force. Without that
-- field, moving the deadline would mark the new one as already explained, and
-- the case the extension was created for would be the one case that never gets
-- the second call.
--
-- ── What SQL holds, and what it deliberately does not ───────────────────────
--
-- Same division as 0289 and 0293. SQL holds only what it can hold ALONE, and
-- holds it exactly:
--
--   1. THE STAMP. `service_case_sla_events_wellformed` refuses any entry
--      missing kind / on / reason / due / at / by / by_role, or naming a kind
--      outside the two, or an `extension` with no new deadline on it. "Who
--      recorded it and when" is then structurally true rather than trusted to
--      the write path.
--   2. EXTEND ONCE. `service_case_sla_one_extension` refuses a second
--      extension entry. The card's own word, as a constraint rather than a
--      promise — the one rule here that a future write path could otherwise
--      break by accident.
--
-- The BOUNDS on an extension (after the deadline it replaces, at most one more
-- 14-working-day period) stay in the API, exactly as 0289 left the evidence
-- checklist there: they are a function of the working-day calendar, and a SQL
-- copy of that calendar would be a second, drifting rule rather than a mirror.
--
-- Live state when this was written: 1 service case (SC2607-01, real data, never
-- delete), already closed, opened 2026-06-16 — so no case on file has a running
-- clock and nothing existing changes shape. Verified in a rolled-back
-- transaction against live before apply.
--
-- RLS: service_cases' single existing policy (sc_op_principal_all, operation +
-- principal, ALL) already covers the new column. No policy change.

set search_path = public;

alter table public.service_cases
  add column if not exists sla_events jsonb not null default '[]'::jsonb;

-- ── 1 · the stamp ────────────────────────────────────────────────────────────
-- A CHECK cannot contain a set-returning function, so the per-element walk
-- lives in an IMMUTABLE helper (the 0289 / 0293 shape). jsonb_typeof(NULL) is
-- NULL and NULL is DISTINCT FROM 'string', so a MISSING key fails exactly the
-- way a wrong-typed one does — which is the point: the stamp cannot be omitted.
create or replace function public.service_case_sla_events_wellformed(v jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(v) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(v) e
       where jsonb_typeof(e.value)              <> 'object'
          or jsonb_typeof(e.value -> 'kind')    is distinct from 'string'
          or jsonb_typeof(e.value -> 'on')      is distinct from 'string'
          or jsonb_typeof(e.value -> 'reason')  is distinct from 'string'
          or jsonb_typeof(e.value -> 'due')     is distinct from 'string'
          or jsonb_typeof(e.value -> 'at')      is distinct from 'string'
          or jsonb_typeof(e.value -> 'by')      is distinct from 'string'
          or jsonb_typeof(e.value -> 'by_role') is distinct from 'string'
          or e.value ->> 'kind'   not in ('customer_told', 'extension')
          or e.value ->> 'on'     = ''
          or e.value ->> 'reason' = ''
          or e.value ->> 'due'    = ''
          -- An extension with no new deadline on it moves nothing and would
          -- leave the case reading its old deadline with its one move spent.
          or (e.value ->> 'kind' = 'extension'
              and (jsonb_typeof(e.value -> 'until') is distinct from 'string'
                   or e.value ->> 'until' = ''))
     );
$$;

comment on function public.service_case_sla_events_wellformed(jsonb) is
  'S4 (0298): every deadline event must carry kind/on/reason/due/at/by/by_role, name one of the two kinds, and — for an extension — the new deadline. Makes "who told the customer, when, and about which deadline" structurally non-optional rather than trusted to the write path.';

-- ── 2 · extend ONCE ──────────────────────────────────────────────────────────
create or replace function public.service_case_sla_one_extension(v jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(v) is distinct from 'array'
      or (select count(*)
            from jsonb_array_elements(v) e
           where e.value ->> 'kind' = 'extension') <= 1;
$$;

comment on function public.service_case_sla_one_extension(jsonb) is
  'S4 (0298): the card''s "may extend once", as a constraint rather than a promise. Returns true for a non-array so that a malformed value is refused by sc_sla_events_wellformed, which reports the real problem, instead of by this one.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sc_sla_events_wellformed') then
    alter table public.service_cases add constraint sc_sla_events_wellformed
      check (public.service_case_sla_events_wellformed(sla_events));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sc_sla_one_extension') then
    alter table public.service_cases add constraint sc_sla_one_extension
      check (public.service_case_sla_one_extension(sla_events));
  end if;
end $$;

comment on column public.service_cases.sla_events is
  'S4 (0298): the deadline''s recorded events — jsonb array of {kind, on, reason, note?, until?, due, at, by, by_role}. kind = customer_told | extension. The DEADLINE itself is not stored: it is opened_at + 14 working days, derived by caseSlaClock (packages/shared/service-case-sla.ts). `due` is the deadline the event was made against, so moving the deadline re-opens the call instead of inheriting the last one''s silence. Append-only: written by the dedicated deadline endpoint, never by the generic PATCH.';

-- ── sanity ──────────────────────────────────────────────────────────────────
do $$
declare
  refused  boolean;
  case_id  uuid;
  open_st  uuid := (select id from public.service_case_statuses where code = 'pending');
  ok_call  jsonb := jsonb_build_array(jsonb_build_object(
    'kind', 'customer_told', 'on', '2026-07-17', 'reason', 'supplier_no_date',
    'due', '2026-07-22', 'at', '2026-07-17T02:00:00Z',
    'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation'));
  ok_ext   jsonb := jsonb_build_array(jsonb_build_object(
    'kind', 'extension', 'on', '2026-07-17', 'reason', 'supplier_special_order',
    'until', '2026-07-31', 'due', '2026-07-22', 'at', '2026-07-17T02:00:00Z',
    'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation'));
begin
  if open_st is null then
    raise exception 'S4 sanity: the seeded statuses are missing';
  end if;

  insert into public.service_cases (case_no, customer_name, status_id)
  values ('SC-SANITY-0298', 'sanity', open_st) returning id into case_id;

  if (select jsonb_array_length(sla_events) from public.service_cases where id = case_id) <> 0 then
    raise exception 'S4 sanity: sla_events must default to an empty array';
  end if;

  -- THE STAMP. Every flag is set INSIDE the handler and checked OUTSIDE it — a
  -- RAISE inside its own EXCEPTION block catches itself and proves nothing
  -- (the 0279 lesson, kept).
  refused := false;
  begin
    update public.service_cases
       set sla_events = jsonb_build_array(jsonb_build_object(
             'kind', 'customer_told', 'on', '2026-07-17', 'reason', 'no_stock',
             'due', '2026-07-22', 'at', '2026-07-17T02:00:00Z', 'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S4 sanity: a deadline event with no recorder was accepted';
  end if;

  -- ...with no reason...
  refused := false;
  begin
    update public.service_cases
       set sla_events = jsonb_build_array(jsonb_build_object(
             'kind', 'customer_told', 'on', '2026-07-17', 'due', '2026-07-22',
             'at', '2026-07-17T02:00:00Z',
             'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S4 sanity: a deadline event with no reason was accepted';
  end if;

  -- ...with no deadline to point at (the field the second call depends on)...
  refused := false;
  begin
    update public.service_cases
       set sla_events = jsonb_build_array(jsonb_build_object(
             'kind', 'customer_told', 'on', '2026-07-17', 'reason', 'no_stock',
             'at', '2026-07-17T02:00:00Z',
             'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S4 sanity: a deadline event naming no deadline was accepted';
  end if;

  -- ...naming a kind nobody defined...
  refused := false;
  begin
    update public.service_cases
       set sla_events = jsonb_build_array(jsonb_build_object(
             'kind', 'reminder', 'on', '2026-07-17', 'reason', 'no_stock',
             'due', '2026-07-22', 'at', '2026-07-17T02:00:00Z',
             'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S4 sanity: a deadline event of an unknown kind was accepted';
  end if;

  -- ...an extension that moves the deadline nowhere...
  refused := false;
  begin
    update public.service_cases
       set sla_events = jsonb_build_array(jsonb_build_object(
             'kind', 'extension', 'on', '2026-07-17', 'reason', 'supplier_special_order',
             'due', '2026-07-22', 'at', '2026-07-17T02:00:00Z',
             'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation'))
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S4 sanity: an extension with no new deadline was accepted';
  end if;

  -- ...and a bare object instead of an array.
  refused := false;
  begin
    update public.service_cases set sla_events = '{"kind":"customer_told"}'::jsonb
     where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S4 sanity: sla_events accepted a non-array';
  end if;

  -- EXTEND ONCE: one extension is fine...
  update public.service_cases set sla_events = ok_call || ok_ext where id = case_id;
  if (select jsonb_array_length(sla_events) from public.service_cases where id = case_id) <> 2 then
    raise exception 'S4 sanity: a stamped deadline event was not stored';
  end if;

  -- ...a second call about the moved deadline is fine...
  update public.service_cases
     set sla_events = ok_call || ok_ext || jsonb_build_array(jsonb_build_object(
           'kind', 'customer_told', 'on', '2026-07-29', 'reason', 'supplier_no_date',
           'due', '2026-07-31', 'at', '2026-07-29T02:00:00Z',
           'by', '00000000-0000-0000-0000-000000000001', 'by_role', 'operation',
           'note', 'Factory closed for the holiday.'))
   where id = case_id;
  if (select jsonb_array_length(sla_events) from public.service_cases where id = case_id) <> 3 then
    raise exception 'S4 sanity: a second call about the moved deadline was refused';
  end if;

  -- ...a SECOND extension is not.
  refused := false;
  begin
    update public.service_cases set sla_events = ok_ext || ok_ext where id = case_id;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'S4 sanity: a case moved its deadline twice';
  end if;

  delete from public.service_cases where case_no = 'SC-SANITY-0298';

  -- The one real case must be untouched, readable, and carrying the new default.
  if not exists (
    select 1 from public.service_cases
     where case_no = 'SC2607-01' and sla_events = '[]'::jsonb
  ) then
    raise exception 'S4 sanity: the live case is missing or did not take the default';
  end if;

  raise notice 'S4 sanity: OK';
end $$;
