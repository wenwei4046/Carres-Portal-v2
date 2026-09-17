-- ═══════════════════════════════════════════════════════════════════════════
-- 0522 · EVERY MANUAL PURCHASE ASKS FOR APPROVAL, AND EVERY ROUND IS KEPT
--
-- Owner rulings 2026-09-16 (docs/purchasing/MASTER.md §5.2 · §9.2;
-- COPY-STANDARD Manual Purchase):
--
--   R1  Every Manual Purchase requires approval, whatever its purpose or
--       amount. The server enforces it; the per-purpose approval setting
--       retires.
--   R3  `Withdraw request` — the requester only, only before a decision and
--       before any PO exists; the real actor and time are stored.
--   R4  `Send back` — the approver only, reason required. The requester uses
--       `Edit and send again` on the SAME request; every round stays in
--       History and the changed submission needs a new approval.
--       Approve / Send back / Refuse / Withdraw racing on one request: the
--       server accepts exactly one and refuses the rest BY NAME.
--   D4  A line marked not going ahead stores its actor.
--
-- ── MEASURED BEFORE WRITING (production, 2026-09-17) ───────────────────────
--   · `purchasing_create_request` read `purchasing_purpose_approval` and could
--     mint `approval_required = false`. All twelve switch rows are `true` and
--     all four live requests carry `approval_required = true`, so nothing
--     on the day changes — the door simply stops being able to say no.
--   · `purchasing_issue_pos_batch` → `purchasing_demand_record_issue` never
--     asked whether the demand's REQUEST was approved. Only the API route did.
--     A direct RPC call could issue an unapproved Manual Purchase.
--   · `purchasing_set_purpose_approval` has no caller in the application.
--   · `purchasing_cancel_demand` stores `cancelled_at` and no actor.
--
-- ── LOCK ORDER — the reason the race has exactly one winner ────────────────
-- Every door that changes a request's decision state takes the REQUEST row
-- FOR UPDATE first. The issue door now takes the same request row FOR SHARE
-- before it locks the demand. So decide, withdraw, send back, resubmit and
-- issue queue on one row in one order (request → demand), and whichever runs
-- second re-reads the committed state and refuses in its own named detail.
--
-- NON-DESTRUCTIVE. Adds columns, one append-only event table and function
-- bodies. No row is updated, deleted or backfilled; the historical
-- `purchasing_purpose_approval` rows and every `approval_required` value stay
-- exactly as stored. Asserts no production row count.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · The facts a round needs ────────────────────────────────────────────
alter table public.purchase_requests
  add column if not exists withdrawn_at      timestamptz,
  add column if not exists withdrawn_by      uuid references public.app_users(id),
  add column if not exists sent_back_at      timestamptz,
  add column if not exists sent_back_by      uuid references public.app_users(id),
  add column if not exists sent_back_reason  text,
  add column if not exists submitted_at      timestamptz,
  add column if not exists round             int not null default 1;

comment on column public.purchase_requests.withdrawn_at is
  'R3 (2026-09-16): the requester withdrew the request before any decision or PO. Terminal.';
comment on column public.purchase_requests.sent_back_at is
  'R4 (2026-09-16): set while the approver has returned the request for changes; cleared when the requester sends it again. Every round is in purchase_request_events.';
comment on column public.purchase_requests.submitted_at is
  'When the CURRENT round was sent for approval. NULL = round 1, whose hand-off is created_at (the immutable Proceed Date).';
comment on column public.purchase_requests.round is
  'The submission round: 1 at creation, +1 on every Edit and send again.';

alter table public.purchase_demands
  add column if not exists cancelled_by uuid references public.app_users(id);
comment on column public.purchase_demands.cancelled_by is
  'D4 (2026-09-16): who marked this line not going ahead. NULL on rows cancelled before 0522 — History prints Staff identity not recorded, never a guess.';

-- ── 2 · Every round, append-only ───────────────────────────────────────────
create table if not exists public.purchase_request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.purchase_requests(id),
  round       int  not null,
  kind        text not null check (kind in ('sent_back', 'resubmitted', 'withdrawn')),
  actor_id    uuid references public.app_users(id),
  occurred_at timestamptz not null default now(),
  reason      text,
  changes     jsonb
);
create index if not exists purchase_request_events_request_idx
  on public.purchase_request_events (request_id, occurred_at);

alter table public.purchase_request_events enable row level security;
drop policy if exists purchase_request_events_read on public.purchase_request_events;
create policy purchase_request_events_read on public.purchase_request_events
  for select to authenticated using ((select public.is_internal()));
-- A new public table inherits ALL for authenticated (0367). The doors below
-- are SECURITY DEFINER; nobody writes this table directly.
revoke insert, update, delete, truncate, references, trigger
  on public.purchase_request_events from authenticated, anon;
grant select on public.purchase_request_events to authenticated;

-- ── 3 · The request's facts, checked ONCE for create and resubmit ─────────
create or replace function public._purchasing_check_request_facts(
  p_purpose text,
  p_destination_id uuid,
  p_why text,
  p_for_service_case_id uuid,
  p_for_staff_user_id uuid,
  p_for_subsidiary_name text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_why        text := nullif(btrim(coalesce(p_why, '')), '');
  v_subsidiary text := nullif(btrim(coalesce(p_for_subsidiary_name, '')), '');
begin
  if p_purpose is null or p_purpose not in
     ('ready_stock', 'showroom_display', 'service_case',
      'internal_staff_purchase', 'subsidiary_purchase', 'other_purchase') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;

  if p_purpose = 'other_purchase' and v_why is null then
    raise exception 'say what this is for' using errcode = '22023', detail = 'why_required';
  end if;

  if p_purpose = 'service_case' then
    if p_for_service_case_id is null then
      raise exception 'name the Service Case this purchase serves'
        using errcode = '22023', detail = 'service_case_required';
    end if;
    if not exists (select 1 from service_cases where id = p_for_service_case_id) then
      raise exception 'unknown service case' using errcode = '22023', detail = 'unknown_service_case';
    end if;
  elsif p_for_service_case_id is not null then
    raise exception 'a % purchase does not name a service case', p_purpose
      using errcode = '22023', detail = 'for_fact_mismatch';
  end if;

  if p_purpose = 'internal_staff_purchase' then
    if p_for_staff_user_id is null then
      raise exception 'name the staff member this purchase serves'
        using errcode = '22023', detail = 'staff_member_required';
    end if;
    if not exists (select 1 from app_users where id = p_for_staff_user_id) then
      raise exception 'unknown staff member' using errcode = '22023', detail = 'unknown_staff_member';
    end if;
  elsif p_for_staff_user_id is not null then
    raise exception 'a % purchase does not name a staff member', p_purpose
      using errcode = '22023', detail = 'for_fact_mismatch';
  end if;

  if p_purpose = 'subsidiary_purchase' then
    if v_subsidiary is null then
      raise exception 'name the subsidiary this purchase serves'
        using errcode = '22023', detail = 'subsidiary_required';
    end if;
  elsif v_subsidiary is not null then
    raise exception 'a % purchase does not name a subsidiary', p_purpose
      using errcode = '22023', detail = 'for_fact_mismatch';
  end if;

  if not exists (
    select 1 from purchasing_destinations where id = p_destination_id and active
  ) then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;
end;
$function$;

revoke all on function public._purchasing_check_request_facts(text, uuid, text, uuid, uuid, text)
  from public, anon, authenticated;

-- ── 4 · R1 · The create door always asks ──────────────────────────────────
create or replace function public.purchasing_create_request(
  p_purpose text,
  p_destination_id uuid,
  p_why text default null::text,
  p_required_by date default null::date,
  p_for_service_case_id uuid default null::uuid,
  p_for_staff_user_id uuid default null::uuid,
  p_for_subsidiary_name text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role app_role;
  v_id   uuid;
  v_no   text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  perform public._purchasing_check_request_facts(
    p_purpose, p_destination_id, p_why,
    p_for_service_case_id, p_for_staff_user_id, p_for_subsidiary_name);

  -- ⭐ R1 · EVERY Manual Purchase asks. `purchasing_purpose_approval` is no
  -- longer read; its historical rows stay stored and unused.
  insert into purchase_requests (purpose, destination_id, required_by, why,
                                 for_service_case_id, for_staff_user_id,
                                 for_subsidiary_name,
                                 approval_required, created_by)
  values (p_purpose, p_destination_id, p_required_by,
          nullif(btrim(coalesce(p_why, '')), ''),
          p_for_service_case_id, p_for_staff_user_id,
          nullif(btrim(coalesce(p_for_subsidiary_name, '')), ''),
          true, auth.uid())
  returning id, req_no into v_id, v_no;

  return jsonb_build_object('id', v_id, 'req_no', v_no, 'approval_required', true);
end;
$function$;

-- The retired switch: kept as a named refusal, never silently accepted.
create or replace function public.purchasing_set_purpose_approval(p_purpose text, p_value boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  raise exception 'per-purpose approval is retired: every Manual Purchase requires approval'
    using errcode = '22023', detail = 'approval_setting_retired';
end;
$function$;

comment on table public.purchasing_purpose_approval is
  'RETIRED by 0522 (owner ruling 2026-09-16): every Manual Purchase requires approval. Historical rows are kept; no door reads or writes them.';

-- ── 5 · The decision door learns Send back and the two new states ─────────
create or replace function public.purchasing_decide_request(
  p_id uuid,
  p_decision text,
  p_reason text default null::text,
  p_cuts jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text := (select public.purchasing_approver_gate());
  v_req  purchase_requests%rowtype;
  v_cut  jsonb;
  v_line purchase_demands%rowtype;
  v_qty  int;
begin
  if p_decision is null or p_decision not in ('approve', 'refuse', 'send_back') then
    raise exception 'decision must be approve, refuse or send_back'
      using errcode = '22023', detail = 'invalid_decision';
  end if;

  -- THE ONE ROW EVERY DECISION QUEUES ON (see header: lock order).
  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.withdrawn_at is not null then
    raise exception 'request was withdrawn'
      using errcode = '22023', detail = 'request_withdrawn';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  if v_req.sent_back_at is not null then
    raise exception 'request is back with the requester'
      using errcode = '22023', detail = 'request_sent_back';
  end if;

  if p_decision in ('refuse', 'send_back') then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'a decision reason is required'
        using errcode = '22023', detail = 'reason_required';
    end if;
    if p_cuts is not null then
      raise exception 'only an approval carries cuts'
        using errcode = '22023', detail = 'cuts_on_refusal';
    end if;
  end if;

  if p_decision = 'refuse' then
    update purchase_requests
       set refused_at = now(), refused_by = auth.uid(),
           refuse_reason = btrim(p_reason)
     where id = p_id;

    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase refused: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'refused');
  end if;

  if p_decision = 'send_back' then
    update purchase_requests
       set sent_back_at = now(), sent_back_by = auth.uid(),
           sent_back_reason = btrim(p_reason)
     where id = p_id;

    insert into purchase_request_events (request_id, round, kind, actor_id, reason)
    values (p_id, v_req.round, 'sent_back', auth.uid(), btrim(p_reason));

    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase sent back for changes: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'sent_back');
  end if;

  -- APPROVE. Cuts first, so a bad cut refuses the whole act atomically.
  if p_cuts is not null then
    if jsonb_typeof(p_cuts) <> 'array' then
      raise exception 'cuts must be an array'
        using errcode = '22023', detail = 'invalid_cuts';
    end if;
    for v_cut in select * from jsonb_array_elements(p_cuts) loop
      select * into v_line from purchase_demands
       where id = (v_cut ->> 'id')::uuid and request_id = p_id
       for update;
      if not found then
        raise exception 'cut names a line this request does not have'
          using errcode = '22023', detail = 'unknown_line';
      end if;
      v_qty := (v_cut ->> 'qty')::int;
      if v_qty is null or v_qty < 0 or v_qty > v_line.qty then
        raise exception 'cut for % must be between 0 and %', v_line.sku, v_line.qty
          using errcode = '22023', detail = 'invalid_cut_qty';
      end if;
      update purchase_demands set approved_qty = v_qty where id = v_line.id;
    end loop;
  end if;

  update purchase_requests
     set approved_at = now(), approved_by = auth.uid()
   where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          'Purchase approved',
          p_id::text);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'approved');
end;
$function$;

-- ── 6 · R3 · Withdraw request ─────────────────────────────────────────────
create or replace function public.purchasing_withdraw_request(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role app_role;
  v_req  purchase_requests%rowtype;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.created_by is null or v_req.created_by <> auth.uid() then
    raise exception 'only the requester may withdraw this request'
      using errcode = '42501', detail = 'not_requester';
  end if;
  if v_req.withdrawn_at is not null then
    raise exception 'request was withdrawn'
      using errcode = '22023', detail = 'request_withdrawn';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  -- Lines in the same lock order the issue door uses (request → demand).
  perform 1 from purchase_demands where request_id = p_id for update;
  if exists (
    select 1 from purchase_demands
     where request_id = p_id and (po_id is not null or issued_qty > 0)
  ) then
    raise exception 'request is already ordered'
      using errcode = '22023', detail = 'request_ordered';
  end if;

  update purchase_requests
     set withdrawn_at = now(), withdrawn_by = auth.uid()
   where id = p_id;

  insert into purchase_request_events (request_id, round, kind, actor_id)
  values (p_id, v_req.round, 'withdrawn', auth.uid());

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          'Purchase request withdrawn',
          p_id::text);

  return jsonb_build_object('id', p_id, 'withdrawn', true);
end;
$function$;

revoke all on function public.purchasing_withdraw_request(uuid) from public, anon;
grant execute on function public.purchasing_withdraw_request(uuid) to authenticated;

-- ── 7 · R4 · Edit and send again — the SAME request, a new round ──────────
-- p_lines: [{ "id": uuid|null, "sku": text, "qty": int, "remark": text|null }]
-- A live line absent from p_lines is marked not going ahead (with its actor);
-- a line whose SKU changed is replaced; a line without an id is added.
create or replace function public.purchasing_resubmit_request(
  p_id uuid,
  p_destination_id uuid,
  p_required_by date,
  p_why text default null::text,
  p_for_service_case_id uuid default null::uuid,
  p_for_staff_user_id uuid default null::uuid,
  p_for_subsidiary_name text default null::text,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role    app_role;
  v_req     purchase_requests%rowtype;
  v_line    jsonb;
  v_old     purchase_demands%rowtype;
  v_keep    uuid[] := '{}';
  v_changes jsonb := '[]'::jsonb;
  v_qty     int;
  v_remark  text;
  v_id      uuid;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.created_by is null or v_req.created_by <> auth.uid() then
    raise exception 'only the requester may send this request again'
      using errcode = '42501', detail = 'not_requester';
  end if;
  if v_req.withdrawn_at is not null then
    raise exception 'request was withdrawn'
      using errcode = '22023', detail = 'request_withdrawn';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  if v_req.sent_back_at is null then
    raise exception 'request was not sent back'
      using errcode = '22023', detail = 'not_sent_back';
  end if;
  if p_required_by is null then
    raise exception 'a delivery date is required'
      using errcode = '22023', detail = 'delivery_date_required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a manual purchase needs at least one line'
      using errcode = '22023', detail = 'lines_required';
  end if;

  -- The purpose is the request's identity and stays; its facts are re-checked.
  perform public._purchasing_check_request_facts(
    v_req.purpose, p_destination_id, p_why,
    p_for_service_case_id, p_for_staff_user_id, p_for_subsidiary_name);

  perform 1 from purchase_demands where request_id = p_id for update;

  -- Header changes, recorded before they are written.
  if v_req.destination_id is distinct from p_destination_id then
    v_changes := v_changes || jsonb_build_object('field', 'destination_id',
      'from', v_req.destination_id, 'to', p_destination_id);
  end if;
  if v_req.required_by is distinct from p_required_by then
    v_changes := v_changes || jsonb_build_object('field', 'required_by',
      'from', v_req.required_by, 'to', p_required_by);
  end if;
  if coalesce(v_req.why, '') is distinct from coalesce(nullif(btrim(coalesce(p_why, '')), ''), '') then
    v_changes := v_changes || jsonb_build_object('field', 'why',
      'from', v_req.why, 'to', nullif(btrim(coalesce(p_why, '')), ''));
  end if;
  if v_req.for_service_case_id is distinct from p_for_service_case_id
     or v_req.for_staff_user_id is distinct from p_for_staff_user_id
     or coalesce(v_req.for_subsidiary_name, '') is distinct from
        coalesce(nullif(btrim(coalesce(p_for_subsidiary_name, '')), ''), '') then
    v_changes := v_changes || jsonb_build_object('field', 'for');
  end if;

  update purchase_requests
     set destination_id      = p_destination_id,
         required_by         = p_required_by,
         why                 = nullif(btrim(coalesce(p_why, '')), ''),
         for_service_case_id = p_for_service_case_id,
         for_staff_user_id   = p_for_staff_user_id,
         for_subsidiary_name = nullif(btrim(coalesce(p_for_subsidiary_name, '')), '')
   where id = p_id;

  -- Kept lines move with the header before any new line is written, so
  -- `purchasing_create_demand` sees one destination on the request.
  update purchase_demands
     set destination_id = p_destination_id,
         required_by    = p_required_by,
         approved_qty   = null
   where request_id = p_id and cancelled_at is null;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'qty')::int;
    v_remark := nullif(btrim(coalesce(v_line ->> 'remark', '')), '');
    if v_qty is null or v_qty < 1 then
      raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
    end if;

    v_old := null;
    if nullif(v_line ->> 'id', '') is not null then
      select * into v_old from purchase_demands
       where id = (v_line ->> 'id')::uuid and request_id = p_id and cancelled_at is null;
      if not found then
        raise exception 'line is not on this request'
          using errcode = '22023', detail = 'unknown_line';
      end if;
    end if;

    if v_old.id is not null and v_old.sku = v_line ->> 'sku' then
      v_keep := v_keep || v_old.id;
      if v_old.qty <> v_qty or coalesce(v_old.remark, '') <> coalesce(v_remark, '') then
        v_changes := v_changes || jsonb_build_object('field', 'line', 'sku', v_old.sku,
          'from', v_old.qty, 'to', v_qty);
        update purchase_demands set qty = v_qty, remark = v_remark where id = v_old.id;
      end if;
    else
      v_id := (public.purchasing_create_demand(
        v_line ->> 'sku', v_qty, p_destination_id, p_required_by, v_remark,
        v_req.purpose, p_id) ->> 'id')::uuid;
      v_keep := v_keep || v_id;
      v_changes := v_changes || jsonb_build_object('field', 'line_added',
        'sku', v_line ->> 'sku', 'to', v_qty);
    end if;
  end loop;

  -- Lines the requester removed: marked not going ahead, with the actor.
  for v_old in
    select * from purchase_demands
     where request_id = p_id and cancelled_at is null and not (id = any(v_keep))
  loop
    update purchase_demands
       set cancelled_at = now(), cancelled_by = auth.uid(),
           cancel_reason = 'Removed before sending again'
     where id = v_old.id;
    v_changes := v_changes || jsonb_build_object('field', 'line_removed',
      'sku', v_old.sku, 'from', v_old.qty);
  end loop;

  update purchase_requests
     set sent_back_at = null, sent_back_by = null, sent_back_reason = null,
         submitted_at = now(), round = v_req.round + 1
   where id = p_id;

  insert into purchase_request_events (request_id, round, kind, actor_id, changes)
  values (p_id, v_req.round + 1, 'resubmitted', auth.uid(), v_changes);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          'Purchase sent again for approval',
          p_id::text);

  return jsonb_build_object('id', p_id, 'round', v_req.round + 1, 'changes', v_changes);
end;
$function$;

revoke all on function public.purchasing_resubmit_request(uuid, uuid, date, text, uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.purchasing_resubmit_request(uuid, uuid, date, text, uuid, uuid, text, jsonb)
  to authenticated;

-- ── 8 · D4 · The not-going-ahead door stores its actor ────────────────────
create or replace function public.purchasing_cancel_demand(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role app_role;
  v_d    purchase_demands;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason,'')) = '' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'already cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;
  if v_d.remaining_qty <= 0 then
    raise exception 'demand % has nothing left to cancel', p_id
      using errcode = 'P0001', detail = 'nothing_to_cancel';
  end if;

  update purchase_demands
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_id;

  select * into v_d from purchase_demands where id = p_id;
  return jsonb_build_object(
    'id',        p_id,
    'cancelled', v_d.remaining_qty,
    'issued',    v_d.issued_qty
  );
end;
$function$;

-- ── 9 · R1 enforced where the goods are bought ────────────────────────────
create or replace function public.purchasing_demand_record_issue(
  p_id uuid, p_qty integer, p_po_id text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role    app_role;
  v_d       purchase_demands;
  v_ceiling int;
  v_request uuid;
  v_req     purchase_requests%rowtype;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  -- ⭐ 0522 · A MANUAL PURCHASE IS BOUGHT ONLY WHILE ITS APPROVAL STANDS.
  -- The request row is taken FOR SHARE before the demand, the same order
  -- every decision door uses, so a withdraw or send back racing this issue
  -- either commits first (and this refuses) or waits for it.
  select request_id into v_request from purchase_demands where id = p_id;
  if v_request is not null then
    select * into v_req from purchase_requests where id = v_request for share;
    if v_req.approved_at is null
       or v_req.refused_at is not null
       or v_req.withdrawn_at is not null
       or v_req.sent_back_at is not null then
      raise exception 'manual purchase % is not approved', v_request
        using errcode = 'P0001', detail = 'not_ready_to_order';
    end if;
  end if;

  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'demand is cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  v_ceiling := coalesce(v_d.approved_qty, v_d.qty);

  if v_d.issued_qty + p_qty > v_ceiling then
    raise exception 'demand % has only % left, cannot take %',
      p_id, greatest(0, v_ceiling - v_d.issued_qty), p_qty
      using errcode = 'P0001', detail = 'over_issue';
  end if;

  update purchase_demands
     set issued_qty = issued_qty + p_qty,
         po_id      = coalesce(po_id, p_po_id),
         ordered_at = case
                        when po_id is null and p_po_id is not null then now()
                        else ordered_at
                      end
   where id = p_id;

  select * into v_d from purchase_demands where id = p_id;
  return jsonb_build_object(
    'id',        p_id,
    'issued',    v_d.issued_qty,
    'remaining', v_d.remaining_qty
  );
end;
$function$;

commit;

-- ─── VERIFY (read-only; run after apply) ────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_name = 'purchase_requests'
--      and column_name in ('withdrawn_at','sent_back_at','submitted_at','round');
--   -- EXPECT: 4 rows
--   select privilege_type from information_schema.role_table_grants
--    where table_name = 'purchase_request_events' and grantee = 'authenticated';
--   -- EXPECT: SELECT only
--   select prosrc ~ 'purchasing_purpose_approval' from pg_proc
--    where proname = 'purchasing_create_request';
--   -- EXPECT: false
