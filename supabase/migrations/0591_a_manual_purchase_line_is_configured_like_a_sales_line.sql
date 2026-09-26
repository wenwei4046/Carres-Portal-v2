-- =============================================================================
-- 0591_a_manual_purchase_line_is_configured_like_a_sales_line.sql
-- Purchasing MASTER §9.2 · owner correction 2026-09-26 (Jess): "I order what,
-- got colour to choose, what I want more to write, no free text."
--
-- WHAT WAS MEASURED on origin/main
--   · A Sales portal order line is CONFIGURED (size · mattress gap · fabric ·
--     colour · options · leg height · special add-ons — Catalog choices) and
--     the choice lives in the line's `attrs`; a PO born from a Sales Order
--     prints it under the item (`Sand · Fabric CG-012`, PO-PDF-STANDARD).
--   · A Manual Purchase line (`purchase_demands`, 0319) carries only `sku`,
--     `qty` and a free-text `remark`; its PO prints no configuration, and
--     0562 added a second free text (`purchase_requirement`) instead of the
--     configuration the owner's blueprint always had.
--
-- WHAT THIS ADDS
--   §1 `purchase_demands.attrs jsonb` — the line's configuration, the same
--      shape `order_lines.attrs` / `purchase_order_lines.attrs` (0073) carry.
--   §2 The ONE create door (`purchasing_create_request_with_lines`) and the
--      ONE returned-request door (`purchasing_resubmit_request`) read
--      `attrs` from each line and keep it; resubmit records a changed
--      configuration in the round's change ledger (`line_configured`).
--      Signatures are unchanged — the API keeps calling each door by name.
--   The issue route reads `purchase_demands.attrs` into the PO line payload;
--   `purchasing_issue_pos_batch` (0574) already writes `v_line->'attrs'`.
--
-- DELIBERATELY NOT HERE
--   · `purchase_requests.purchase_requirement` and `purchase_demands.remark`
--     are NOT dropped (red line 5.1); the form stops writing them.
--   · No row is rewritten; older demands simply have no configuration.
--
-- RLS: no new table, no policy change. NO ROW COUNT IS ASSERTED (CLAUDE.md §5.8).
-- =============================================================================

-- ── §1 · the line's configuration ───────────────────────────────────────────

alter table public.purchase_demands
  add column if not exists attrs jsonb;

comment on column public.purchase_demands.attrs is
  '0591 · the line''s configuration chosen like a Sales portal line (colour · fabric · size · options), the same shape as order_lines.attrs; copied to purchase_order_lines.attrs at issue so the PO PDF prints it. NULL = no configuration.';

-- ── §2 · the two request doors keep it ──────────────────────────────────────

create or replace function public.purchasing_create_request_with_lines(
  p_purpose             text,
  p_destination_id      uuid,
  p_why                 text default null,
  p_required_by         date default null,
  p_for_service_case_id uuid default null,
  p_for_staff_user_id   uuid default null,
  p_for_subsidiary_name text default null,
  p_lines               jsonb default '[]'::jsonb,
  p_fulfilment_intent   text default null,
  p_purchase_requirement text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_header   jsonb;
  v_id       uuid;
  v_line     jsonb;
  v_one      jsonb;
  v_line_ids jsonb := '[]'::jsonb;
begin
  -- 0591 · 0562's body plus the per-line configuration (`attrs`); the
  -- signature is unchanged, so the API keeps calling the one door by name.
  -- A request with no lines is the half-record this door exists to prevent.
  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'a manual purchase needs at least one line'
      using errcode = '22023', detail = 'lines_required';
  end if;

  -- THE HEADER, through its own door. Every purpose rule, the `why` rule and
  -- the three structured-For rules run inside `purchasing_create_request`.
  -- 0549: the arguments are NAMED, so this binds to the eight-argument form
  -- 0546 created and the intent actually reaches the row. Called positionally
  -- it would bind to 0522's seven-argument twin and silently store NULL —
  -- which is the defect this file exists to close.
  v_header := public.purchasing_create_request(
    p_purpose             => p_purpose,
    p_destination_id      => p_destination_id,
    p_why                 => p_why,
    p_required_by         => p_required_by,
    p_for_service_case_id => p_for_service_case_id,
    p_for_staff_user_id   => p_for_staff_user_id,
    p_for_subsidiary_name => p_for_subsidiary_name,
    p_fulfilment_intent   => p_fulfilment_intent,
    p_purchase_requirement => p_purchase_requirement
  );
  v_id := (v_header ->> 'id')::uuid;

  -- THE LINES, through their own door, in the order they were typed. Any
  -- refusal raised in here aborts this function, and the header inserted above
  -- goes with it — that is the whole point of this file.
  --
  -- The destination and the purpose come from the HEADER, never from the line
  -- payload. `purchasing_create_demand` refuses a line that contradicts its
  -- request (`destination_mismatch` / `purpose_mismatch`), so passing the
  -- header's own values removes a way to be refused for a fact nobody was
  -- asked about twice.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_one := public.purchasing_create_demand(
      v_line ->> 'sku',
      (v_line ->> 'qty')::int,
      p_destination_id,
      nullif(v_line ->> 'required_by', '')::date,
      v_line ->> 'remark',
      p_purpose,
      v_id
    );
    -- 0591 · the line's CONFIGURATION, chosen like a Sales portal line
    -- (colour · fabric · size · options), kept on the demand so the PO it
    -- becomes prints it. An object or nothing; a non-object is ignored.
    if jsonb_typeof(v_line -> 'attrs') = 'object' and v_line -> 'attrs' <> '{}'::jsonb then
      update public.purchase_demands
         set attrs = v_line -> 'attrs'
       where id = (v_one ->> 'id')::uuid;
    end if;
    v_line_ids := v_line_ids || jsonb_build_array(v_one ->> 'id');
  end loop;

  -- The header door's own answer, plus what was written under it. The browser
  -- reads `id` and `req_no` exactly as it did from the header-only call.
  return v_header || jsonb_build_object('line_ids', v_line_ids);
end;
$fn$;

create or replace function public.purchasing_resubmit_request(
  p_id uuid,
  p_destination_id uuid,
  p_required_by date,
  p_why text default null::text,
  p_for_service_case_id uuid default null::uuid,
  p_for_staff_user_id uuid default null::uuid,
  p_for_subsidiary_name text default null::text,
  p_lines jsonb default '[]'::jsonb,
  p_purchase_requirement text default null::text
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
  v_attrs   jsonb;
  v_id      uuid;
  -- 0562 · trimmed to a real absence, so CLEARING it is a real edit.
  v_need    text := nullif(btrim(coalesce(p_purchase_requirement, '')), '');
begin
  -- 0591 · 0562's body plus the per-line configuration (`attrs`), compared
  -- and recorded like every other line change; the signature is unchanged.
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
  if coalesce(v_req.purchase_requirement, '') is distinct from coalesce(v_need, '') then
    v_changes := v_changes || jsonb_build_object('field', 'purchase_requirement',
      'from', v_req.purchase_requirement, 'to', v_need);
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
         for_subsidiary_name = nullif(btrim(coalesce(p_for_subsidiary_name, '')), ''),
         purchase_requirement = v_need
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
    -- 0591 · the configuration travels with the line on every round; an
    -- absent or empty object means "no configuration", never "keep the old".
    v_attrs := case when jsonb_typeof(v_line -> 'attrs') = 'object' and v_line -> 'attrs' <> '{}'::jsonb
                    then v_line -> 'attrs' end;
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
      if v_old.attrs is distinct from v_attrs then
        v_changes := v_changes || jsonb_build_object('field', 'line_configured', 'sku', v_old.sku,
          'from', v_old.attrs, 'to', v_attrs);
        update purchase_demands set attrs = v_attrs where id = v_old.id;
      end if;
    else
      v_id := (public.purchasing_create_demand(
        v_line ->> 'sku', v_qty, p_destination_id, p_required_by, v_remark,
        v_req.purpose, p_id) ->> 'id')::uuid;
      if v_attrs is not null then
        update purchase_demands set attrs = v_attrs where id = v_id;
      end if;
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

revoke execute on function public.purchasing_create_request_with_lines(
  text, uuid, text, date, uuid, uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.purchasing_create_request_with_lines(
  text, uuid, text, date, uuid, uuid, text, jsonb, text, text) to authenticated;
comment on function public.purchasing_create_request_with_lines(
  text, uuid, text, date, uuid, uuid, text, jsonb, text, text) is
  '0591 — 0562''s whole-request door plus each line''s configuration (`attrs`, the Sales portal shape), kept on the demand so the PO it becomes prints it. Still one transaction.';

revoke execute on function public.purchasing_resubmit_request(
  uuid, uuid, date, text, uuid, uuid, text, jsonb, text) from public, anon;
grant execute on function public.purchasing_resubmit_request(
  uuid, uuid, date, text, uuid, uuid, text, jsonb, text) to authenticated;
comment on function public.purchasing_resubmit_request(
  uuid, uuid, date, text, uuid, uuid, text, jsonb, text) is
  '0591 — 0562''s returned-request door plus each line''s configuration, compared every round and recorded as `line_configured` in the round''s change ledger.';

-- ───────────────────────────────────────────────────────────────────────────
-- SANITY — the column, and still ONE door per name (0563)
-- ───────────────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_n int;
  v_bad text;
begin
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'purchase_demands'
     and column_name = 'attrs' and is_nullable = 'YES' and data_type = 'jsonb';
  if v_n <> 1 then
    raise exception '0591 sanity: purchase_demands.attrs must exist, nullable, jsonb';
  end if;
  select string_agg(t.fn, ', ') into v_bad
    from (values ('purchasing_create_request_with_lines'), ('purchasing_resubmit_request')) as t(fn)
   where (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = t.fn) <> 1;
  if v_bad is not null then
    raise exception '0591 sanity: these doors do not have exactly one overload: %', v_bad;
  end if;
end $sanity$;
