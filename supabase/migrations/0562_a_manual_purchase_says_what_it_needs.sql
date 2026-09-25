-- ═══════════════════════════════════════════════════════════════════════════
-- 0562 · A MANUAL PURCHASE SAYS WHAT IT NEEDS
-- PURCHASING CARD 13 — owner ruling (Jess, 2026-09-22): the create /
-- returned-request edit form carries an OPTIONAL `Purchase requirement` on
-- EVERY purpose (`docs/purchasing/MASTER.md` §9.2, `docs/COPY-STANDARD.md`
-- Manual Purchase create fields).
--
-- ⭐ WHY IT IS ITS OWN COLUMN, AND NOT `why`.
-- `why` is `Other Purchase`'s REQUIRED reason — the answer to *should Carres
-- buy this at all* (Card 04, 2026-08-29). The requirement answers a different
-- question: *what must the goods satisfy*. One column for both would make
-- every later reader guess which question a row answered, and would make a
-- routine `Ready Stock` request look as if it had been asked a question the
-- ruling says it is never asked.
--
-- ⛔ NOTHING IS BACKFILLED (CLAUDE.md §6). A request raised before this file
-- recorded no requirement, and NULL keeps saying exactly that.
--
-- ── HOW THE THREE DOORS ARE WRITTEN, AND WHY IT MATTERS ────────────────────
-- Each body below is the COMMITTED body of its door — 0546's header door,
-- 0549's whole-request door, 0522's returned-request door — with the new
-- argument added and nothing else touched. They are not re-derived from the
-- spec: re-typing `purchasing_resubmit_request` from memory would have
-- silently dropped its round events, its audit row, its change ledger and its
-- `approved_qty` reset, none of which this card is allowed to change.
--
-- ── THE OVERLOAD TRAP, AND WHY THIS FILE STILL LEAVES ONE OPEN ─────────────
-- 0549 is the lesson: adding an argument created a SECOND overload beside the
-- old one, PostgREST resolved by the argument NAMES the caller sent, and the
-- old door kept winning — so the column was read everywhere and written
-- nowhere. The fix for that is exactly one door per name.
--
-- ⛔ BUT NOT IN THIS FILE, AND THAT IS DELIBERATE. A migration is applied
-- BEFORE its bundle reaches production, so for a few minutes the LIVE browser
-- is still sending nine argument names. Dropping the nine-name door here would
-- refuse every Manual Purchase raised inside that window. The superseded
-- overloads therefore survive this migration as deliberate legacy doors — the
-- same shape 0471/0472 used — and `0563` drops them once all three production
-- surfaces report the merge SHA. During the window a request raised by the old
-- bundle records no requirement, which is the honest NULL, not a dropped fact.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

alter table public.purchase_requests
  add column if not exists purchase_requirement text;

comment on column public.purchase_requests.purchase_requirement is
  '0562 — the requester''s optional statement of what the goods must satisfy, on every purpose (owner ruling Jess, 2026-09-22). NOT `why`: that column is Other Purchase''s required reason for buying at all. NULL means none was recorded and is never guessed or backfilled.';

-- ───────────────────────────────────────────────────────────────────────────
-- ① THE HEADER DOOR — 0546's body, plus the requirement
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.purchasing_create_request(
  p_purpose text,
  p_destination_id uuid,
  p_why text default null::text,
  p_required_by date default null::date,
  p_for_service_case_id uuid default null::uuid,
  p_for_staff_user_id uuid default null::uuid,
  p_for_subsidiary_name text default null::text,
  p_fulfilment_intent text default null::text,
  p_purchase_requirement text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role   app_role;
  v_id     uuid;
  v_no     text;
  v_intent text := nullif(btrim(coalesce(p_fulfilment_intent, '')), '');
  -- 0562 · `Purchase requirement` — OPTIONAL on EVERY purpose, and trimmed to
  -- a real absence: a blank string would store "the requester answered
  -- nothing" as if it were an answer.
  v_need   text := nullif(btrim(coalesce(p_purchase_requirement, '')), '');
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if v_intent is not null and v_intent not in ('concrete_need', 'additional_stock') then
    raise exception 'unknown fulfilment intent' using errcode = '22023',
      detail = 'unknown_fulfilment_intent';
  end if;

  perform public._purchasing_check_request_facts(
    p_purpose, p_destination_id, p_why,
    p_for_service_case_id, p_for_staff_user_id, p_for_subsidiary_name);

  insert into purchase_requests (purpose, destination_id, required_by, why,
                                 for_service_case_id, for_staff_user_id,
                                 for_subsidiary_name, fulfilment_intent,
                                 purchase_requirement,
                                 approval_required, created_by)
  values (p_purpose, p_destination_id, p_required_by,
          nullif(btrim(coalesce(p_why, '')), ''),
          p_for_service_case_id, p_for_staff_user_id,
          nullif(btrim(coalesce(p_for_subsidiary_name, '')), ''),
          v_intent,
          v_need,
          true, auth.uid())
  returning id, req_no into v_id, v_no;

  return jsonb_build_object('id', v_id, 'req_no', v_no, 'approval_required', true,
                            'fulfilment_intent', v_intent,
                            'purchase_requirement', v_need);
end;
$function$;


revoke execute on function public.purchasing_create_request(
  text, uuid, text, date, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.purchasing_create_request(
  text, uuid, text, date, uuid, uuid, text, text, text) to authenticated;

comment on function public.purchasing_create_request(
  text, uuid, text, date, uuid, uuid, text, text, text) is
  '0562 — 0546''s header door plus the optional Purchase requirement (owner 2026-09-22). Every purpose may carry it; `why` stays Other Purchase''s required reason, checked where it always was, in _purchasing_check_request_facts. Approval stays required for every request (0522; owner selection A, 2026-09-22). The superseded 8- and 7-argument overloads are dropped here so no caller can bind to a door that discards the new fact — the 0549 defect, not repeated.';

-- ───────────────────────────────────────────────────────────────────────────
-- ② THE WHOLE-REQUEST DOOR — 0549's body, plus the requirement, PASSED BY NAME
-- ───────────────────────────────────────────────────────────────────────────
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
    v_line_ids := v_line_ids || jsonb_build_array(v_one ->> 'id');
  end loop;

  -- The header door's own answer, plus what was written under it. The browser
  -- reads `id` and `req_no` exactly as it did from the header-only call.
  return v_header || jsonb_build_object('line_ids', v_line_ids);
end;
$fn$;


revoke execute on function public.purchasing_create_request_with_lines(
  text, uuid, text, date, uuid, uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.purchasing_create_request_with_lines(
  text, uuid, text, date, uuid, uuid, text, jsonb, text, text) to authenticated;

comment on function public.purchasing_create_request_with_lines(
  text, uuid, text, date, uuid, uuid, text, jsonb, text, text) is
  '0562 — 0410/0549''s whole-request door plus the optional Purchase requirement, passed to the header door BY NAME for the reason 0549 exists. Still one transaction: a refusal on line three still takes the header with it.';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ THE RETURNED-REQUEST DOOR — 0522's body, plus the requirement
--    It is REPLACED each round (never coalesced), so a requirement the
--    requester deleted actually goes, and the change is recorded in the same
--    ledger every other header change is.
-- ───────────────────────────────────────────────────────────────────────────
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
  v_id      uuid;
  -- 0562 · trimmed to a real absence, so CLEARING it is a real edit.
  v_need    text := nullif(btrim(coalesce(p_purchase_requirement, '')), '');
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


revoke execute on function public.purchasing_resubmit_request(
  uuid, uuid, date, text, uuid, uuid, text, jsonb, text) from public, anon;
grant execute on function public.purchasing_resubmit_request(
  uuid, uuid, date, text, uuid, uuid, text, jsonb, text) to authenticated;

comment on function public.purchasing_resubmit_request(
  uuid, uuid, date, text, uuid, uuid, text, jsonb, text) is
  '0562 — 0522''s returned-request door plus the optional Purchase requirement, REPLACED on each round so a requester can clear it, and recorded in the round''s own change ledger. Requester-only, sent-back-only; removed lines are still cancelled with their stored reason.';

-- ───────────────────────────────────────────────────────────────────────────
-- SANITY — the shape, and the thing that could silently break
-- ───────────────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_n int;
begin
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'purchase_requests'
     and column_name = 'purchase_requirement' and is_nullable = 'YES';
  if v_n <> 1 then
    raise exception '0562 sanity: purchase_requirement must exist and stay nullable';
  end if;

  -- ⭐ THE THREE NEW DOORS EXIST, each with the requirement on the end. One
  -- door per name is `0563`'s assertion: this file deliberately leaves the
  -- superseded overloads in place for the deploy window.
  if to_regprocedure(
       'public.purchasing_create_request(text, uuid, text, date, uuid, uuid, text, text, text)'
     ) is null
     or to_regprocedure(
       'public.purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb, text, text)'
     ) is null
     or to_regprocedure(
       'public.purchasing_resubmit_request(uuid, uuid, date, text, uuid, uuid, text, jsonb, text)'
     ) is null then
    raise exception '0562 sanity: a requirement-carrying door is missing';
  end if;

  -- The whole-request door must NAME the requirement when it calls the header,
  -- for the same reason 0549 had to name the intent.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'purchasing_create_request_with_lines'
     and p.prosrc like '%p_purchase_requirement => p_purchase_requirement%';
  if v_n <> 1 then
    raise exception '0562 sanity: the create door must pass the requirement by name';
  end if;

  -- The returned-request door must WRITE it, or an edit would silently keep
  -- the old requirement for ever.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'purchasing_resubmit_request'
     and p.prosrc like '%purchase_requirement = v_need%';
  if v_n <> 1 then
    raise exception '0562 sanity: the resubmit door must write the requirement';
  end if;
end
$sanity$;

commit;
