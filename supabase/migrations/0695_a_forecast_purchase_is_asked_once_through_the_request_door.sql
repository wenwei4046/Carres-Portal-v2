-- =============================================================================
-- 0695_a_forecast_purchase_is_asked_once_through_the_request_door.sql
-- =============================================================================
-- THE RULING (Jess 2026-10-14, A; docs/purchasing/MASTER.md section 5 "Forecast
--   Purchase approval and issuance" and section 9.14):
--   Jess approves Forecast Purchase. After her approval PO Duty issues the PO
--   and sends it. Approval and issuance are separate acts with their own
--   actor and time. The existing governed doors are reused; there is no new
--   independent purchasing writer. Before issuance the forecast source, the
--   approved scope and the current stock and PO coverage are checked again.
--
-- WHAT THIS ADDS
--   1. forecast_purchase_requests: one row per Manual Purchase Request that
--      Forecast Purchase asked for. It is the STRUCTURED mark that a request
--      came from the forecast (never a text match on its requirement), keeps
--      the week and the lines as they were asked, and holds the key of the
--      submission that made it. Nobody reads or writes the table directly.
--   2. purchasing_forecast_requests_in_progress(): the ONE arithmetic of what
--      open Ready Stock requests that buy extra have still to put on a PO,
--      per request and SKU (Law D). A request in progress is NOT stock and is
--      NOT ordered supply; it only stops the same size being asked for twice.
--   3. purchasing_submit_forecast_requests(): the forecast's submit door. One
--      submission at a time (a transaction lock), it
--        a. answers a RETRY of a submission that already went through with the
--           requests that submission made, and writes nothing;
--        b. refuses when what is in progress for a SKU is no longer what the
--           caller read (`forecast_in_progress_changed`), so two people who
--           press at the same moment cannot both ask for the same pieces;
--        c. raises each request through the EXISTING whole-request door
--           `purchasing_create_request_with_lines` (0562), so every rule of a
--           Manual Purchase Request still runs in its own body, approval is
--           still required, and this function writes no request row itself;
--        d. records the mark.
--      All requests of one submission are one transaction: all or none.
--   4. purchasing_forecast_request_marks(uuid[]): the marks of the named
--      requests, for the issue door's forecast recheck.
--   5. purchasing_forecast_submission(uuid): the requests a submission key
--      already made, for the caller's own retry. The API asks it before it
--      checks quantities, so a retry is answered and not refused as a new ask.
--
-- ROW SECURITY
--   The new table has row security ON and no policy, and every direct grant is
--   taken away from public, anon and authenticated. It is reached only through
--   the functions above, each of which admits Operation and Principal and
--   nobody else. No existing policy, grant, table or function is changed.
--
-- NOT DESTRUCTIVE
--   Additive only: one new table, one index, five new functions (one of them
--   internal). No existing object is replaced, no row is written, updated or
--   removed by applying this file, and no production row count is asserted.
--   Before this file is applied nothing calls these names; the page that does
--   is deployed after it.
-- =============================================================================

create table if not exists public.forecast_purchase_requests (
  request_id      uuid primary key references public.purchase_requests(id),
  /* The Monday of the week the suggestion was made for. */
  forecast_week   date not null,
  /* The submission that raised it: one key per press of Send for approval. */
  submission_key  uuid not null,
  /* The lines as asked: [{ sku, qty, in_progress, basis }]. */
  lines           jsonb not null,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  constraint forecast_purchase_requests_lines_is_array check (jsonb_typeof(lines) = 'array')
);

create index if not exists forecast_purchase_requests_submission_key_idx
  on public.forecast_purchase_requests (submission_key);

comment on table public.forecast_purchase_requests is
  '0695 : the structured mark that a Manual Purchase Request was asked for by Forecast Purchase: its week, its lines as asked and the submission key. Written only by purchasing_submit_forecast_requests, read only through purchasing_forecast_request_marks and purchasing_forecast_requests_in_progress.';

alter table public.forecast_purchase_requests enable row level security;
revoke all on table public.forecast_purchase_requests from public, anon, authenticated;

-- ----------------------------------------------------------------
-- 1. WHAT IS IN PROGRESS : the one arithmetic, shared by the page's read and
--    the submit door's own check.
-- ----------------------------------------------------------------
create or replace function public._purchasing_forecast_in_progress_rows()
returns table (request_id uuid, req_no text, state text, sku text, qty integer, from_forecast boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select r.id,
         r.req_no,
         case when r.approved_at is not null and r.sent_back_at is null then 'ready'
              when r.sent_back_at is not null then 'sent_back'
              else 'waiting' end,
         d.sku,
         greatest(0, coalesce(d.approved_qty, d.qty) - coalesce(d.issued_qty, 0))::integer,
         exists (select 1 from forecast_purchase_requests f where f.request_id = r.id),
         r.created_at
    from purchase_requests r
    join purchase_demands d on d.request_id = r.id
   where r.purpose = 'ready_stock'
     and r.fulfilment_intent = 'additional_stock'
     and r.refused_at is null
     and r.withdrawn_at is null
     and d.cancelled_at is null
     and greatest(0, coalesce(d.approved_qty, d.qty) - coalesce(d.issued_qty, 0)) > 0;
$fn$;

revoke all on function public._purchasing_forecast_in_progress_rows() from public, anon, authenticated;

create or replace function public.purchasing_forecast_requests_in_progress()
returns table (request_id uuid, req_no text, state text, sku text, qty integer, from_forecast boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role := public.app_role();
begin
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return query
    select p.request_id, p.req_no, p.state, p.sku, p.qty, p.from_forecast
      from public._purchasing_forecast_in_progress_rows() p
     order by p.created_at, p.req_no, p.sku;
end;
$fn$;

revoke all on function public.purchasing_forecast_requests_in_progress() from public, anon;
grant execute on function public.purchasing_forecast_requests_in_progress() to authenticated;

comment on function public.purchasing_forecast_requests_in_progress() is
  '0695 : what open Ready Stock requests that buy extra have still to put on a PO, per request and SKU: approved quantity (else the asked quantity) less what is issued, for requests neither refused nor withdrawn and lines not cancelled. The ONE arithmetic of a request in progress (Law D). It is not stock and not ordered supply.';

-- ----------------------------------------------------------------
-- 2. THE MARKS : which of the named requests the forecast asked for.
-- ----------------------------------------------------------------
create or replace function public.purchasing_forecast_request_marks(p_request_ids uuid[])
returns table (request_id uuid, forecast_week date, lines jsonb)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role := public.app_role();
begin
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return query
    select f.request_id, f.forecast_week, f.lines
      from forecast_purchase_requests f
     where f.request_id = any (coalesce(p_request_ids, '{}'::uuid[]));
end;
$fn$;

revoke all on function public.purchasing_forecast_request_marks(uuid[]) from public, anon;
grant execute on function public.purchasing_forecast_request_marks(uuid[]) to authenticated;

comment on function public.purchasing_forecast_request_marks(uuid[]) is
  '0695 : the forecast mark of each named Manual Purchase Request that Forecast Purchase asked for (week and lines as asked); a request it did not ask for returns no row. Read by the issue door to recheck a forecast request before a PO is issued.';

-- ----------------------------------------------------------------
-- 2b. A SUBMISSION ALREADY MADE : the caller's own retry reads what its key did.
-- ----------------------------------------------------------------
create or replace function public.purchasing_forecast_submission(p_submission_key uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role := public.app_role();
begin
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return (
    select jsonb_agg(jsonb_build_object('id', f.request_id, 'req_no', r.req_no) order by r.created_at, r.req_no)
      from forecast_purchase_requests f
      join purchase_requests r on r.id = f.request_id
     where f.submission_key = p_submission_key
       and f.created_by = auth.uid());
end;
$fn$;

revoke all on function public.purchasing_forecast_submission(uuid) from public, anon;
grant execute on function public.purchasing_forecast_submission(uuid) to authenticated;

comment on function public.purchasing_forecast_submission(uuid) is
  '0695 : the requests the caller''s own submission key already made (id and MPR No), or NULL when that key made none. Lets a retry be answered with the first result.';

-- ----------------------------------------------------------------
-- 3. THE SUBMIT DOOR
--    p_groups: [{ required_by, requirement, lines: [{ sku, qty, in_progress, basis }] }]
--    One group becomes one Manual Purchase Request (one supplier and category).
-- ----------------------------------------------------------------
create or replace function public.purchasing_submit_forecast_requests(
  p_submission_key uuid,
  p_forecast_week  date,
  p_destination_id uuid,
  p_groups         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   app_role := public.app_role();
  v_group  jsonb;
  v_line   jsonb;
  v_sku    text;
  v_qty    integer;
  v_seen   integer;
  v_now    integer;
  v_made   jsonb;
  v_id     uuid;
  v_out    jsonb := '[]'::jsonb;
  v_owner  uuid;
begin
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_submission_key is null or p_forecast_week is null or p_destination_id is null
     or p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'a forecast submission needs its key, week, destination and lines'
      using errcode = '22023', detail = 'invalid_forecast_submission';
  end if;

  -- ONE SUBMISSION AT A TIME. Two people pressing in the same moment run one
  -- after the other, so the second reads what the first has just asked for.
  perform pg_advisory_xact_lock(hashtextextended('purchasing.forecast_purchase.submit', 0));

  -- A RETRY ANSWERS WITH WHAT WAS MADE. The first press went through and its
  -- answer was lost on the way back: the same key returns the same requests
  -- and nothing is written. A key somebody else used is refused.
  select f.created_by into v_owner
    from forecast_purchase_requests f
   where f.submission_key = p_submission_key
   limit 1;
  if found then
    if v_owner is distinct from auth.uid() then
      raise exception 'this submission key belongs to another person'
        using errcode = '22023', detail = 'invalid_forecast_submission';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'requests', coalesce((
        select jsonb_agg(jsonb_build_object('id', f.request_id, 'req_no', r.req_no) order by r.created_at, r.req_no)
          from forecast_purchase_requests f
          join purchase_requests r on r.id = f.request_id
         where f.submission_key = p_submission_key), '[]'::jsonb));
  end if;

  -- NOTHING MOVED UNDER THE CALLER. The caller worked out each quantity from
  -- what it read as in progress. If that is no longer true for any SKU, the
  -- whole submission is refused and nothing is written.
  for v_group in select * from jsonb_array_elements(p_groups)
  loop
    if jsonb_typeof(v_group -> 'lines') is distinct from 'array' or jsonb_array_length(v_group -> 'lines') = 0
       or nullif(v_group ->> 'required_by', '') is null then
      raise exception 'a forecast request needs its delivery date and lines'
        using errcode = '22023', detail = 'invalid_forecast_submission';
    end if;
    for v_line in select * from jsonb_array_elements(v_group -> 'lines')
    loop
      v_sku  := nullif(btrim(coalesce(v_line ->> 'sku', '')), '');
      v_qty  := (v_line ->> 'qty')::integer;
      v_seen := coalesce((v_line ->> 'in_progress')::integer, 0);
      if v_sku is null or v_qty is null or v_qty < 1 or v_seen < 0 then
        raise exception 'a forecast line needs its SKU and a quantity of at least 1'
          using errcode = '22023', detail = 'invalid_forecast_submission';
      end if;
      select coalesce(sum(p.qty), 0)::integer into v_now
        from public._purchasing_forecast_in_progress_rows() p
       where p.sku = v_sku;
      if v_now <> v_seen then
        raise exception 'what is in progress for % changed: read %, now %', v_sku, v_seen, v_now
          using errcode = 'P0001', detail = 'forecast_in_progress_changed', hint = v_sku;
      end if;
    end loop;
  end loop;

  -- EACH REQUEST, THROUGH THE EXISTING DOOR. Every purpose rule, the supplier
  -- rule of every line and the approval rule run inside it; a refusal there
  -- takes the whole submission with it.
  for v_group in select * from jsonb_array_elements(p_groups)
  loop
    v_made := public.purchasing_create_request_with_lines(
      p_purpose              => 'ready_stock',
      p_destination_id       => p_destination_id,
      p_required_by          => (v_group ->> 'required_by')::date,
      p_lines                => (
        select jsonb_agg(jsonb_build_object(
                 'sku', l ->> 'sku',
                 'qty', (l ->> 'qty')::integer,
                 'required_by', v_group ->> 'required_by'))
          from jsonb_array_elements(v_group -> 'lines') l),
      p_fulfilment_intent    => 'additional_stock',
      p_purchase_requirement => nullif(btrim(coalesce(v_group ->> 'requirement', '')), '')
    );
    v_id := (v_made ->> 'id')::uuid;
    insert into forecast_purchase_requests (request_id, forecast_week, submission_key, lines, created_by)
    values (v_id, p_forecast_week, p_submission_key, v_group -> 'lines', auth.uid());
    v_out := v_out || jsonb_build_object('id', v_id, 'req_no', v_made ->> 'req_no');
  end loop;

  return jsonb_build_object('replayed', false, 'requests', v_out);
end;
$fn$;

revoke all on function public.purchasing_submit_forecast_requests(uuid, date, uuid, jsonb) from public, anon;
grant execute on function public.purchasing_submit_forecast_requests(uuid, date, uuid, jsonb) to authenticated;

comment on function public.purchasing_submit_forecast_requests(uuid, date, uuid, jsonb) is
  '0695 : Forecast Purchase''s submit door. One submission at a time; a retry with the same key answers with the requests it already made; refuses forecast_in_progress_changed when another request for a SKU appeared since the caller read; raises each request through purchasing_create_request_with_lines (Ready Stock, additional_stock), so approval stays required and this function writes no request row itself; records the forecast mark. All or none.';
