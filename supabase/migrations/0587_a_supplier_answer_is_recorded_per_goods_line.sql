-- =============================================================================
-- 0587_a_supplier_answer_is_recorded_per_goods_line.sql
-- Purchasing MASTER §5.7 · owner rulings 2026-09-25 (Jess): the supplier's
-- answer is recorded PER PO GOODS LINE, may SPLIT a line into dated batches,
-- carries `Supplier DO received`, accepts photo/video/PDF evidence, and may be
-- recorded by ANY active Operation person (the recorder is stored beside normal
-- PO Duty and its dated cover, never in their place).
--
-- WHAT WAS MEASURED on origin/main 45e78e9eb
--   · `po_promise_scope` (0433) forces a `tomorrow_delivery` answer to be
--     PO-level: `po_line_id IS NULL AND about_qty IS NULL`. One PO, one date.
--   · `purchasing_record_supplier_reply` (0585) records ONE date for the whole
--     PO and only PO Duty / cover / an Operations Superuser may call it.
--   · `purchasing_po_effective_arrival` answers one date per PO.
--
-- WHAT THIS ADDS
--   §1 `po_supplier_promises` may carry `po_line_id` + `about_qty` on a
--      `tomorrow_delivery` answer (one row per line, or per split batch), and an
--      `answer_group` tying the rows of one recorded answer together.
--   §2 The ONE recording gate (`purchasing_supplier_reply_actor`) now admits any
--      active Operation or Principal person. Issuing, revising, cancelling a PO
--      stay with PO Duty, cover and the Operations Superuser.
--   §3 The ONE per-line door `purchasing_record_supplier_answers`: per line
--      `confirmed` · `new_date` · `split` (batches must total the line's
--      still-to-deliver quantity); the server classifies every date against the
--      immutable original PO Delivery Date; a later date needs one of the eight
--      governed reasons (`Other` needs a note); at least one evidence file; an
--      optional `Supplier DO received` writes the PO's own DO fields once and
--      records the day-before evidence for every expected arrival; a
--      `confirmed` line records the day-before confirmation for its date.
--   §4 Expected arrivals become a SET (one per line/batch): the day-before
--      confirmation may name any of them; the PO-level effective arrival is the
--      last of them; the customer arrival projection reads the line's own
--      newest answer before the PO-level one.
--
-- DELIBERATELY NOT HERE
--   · The PO-level door of 0585 keeps working for rows already written and for
--     the day the old form is still open somewhere; the web now calls only §3.
--   · No row is rewritten: earlier PO-level answers stay PO-level and still
--     count for every line that has no line-level answer of its own.
--
-- RLS: no new table, no policy change. NO ROW COUNT IS ASSERTED (CLAUDE.md §5.8).
-- =============================================================================

-- ── §1 · a line's own answer ─────────────────────────────────────────────────

alter table public.po_supplier_promises
  add column if not exists answer_group uuid;

comment on column public.po_supplier_promises.answer_group is
  '0587 · the rows of ONE recorded supplier answer (one form, several lines/batches) share this id.';

create index if not exists po_supplier_promises_answer_group_idx
  on public.po_supplier_promises (answer_group) where answer_group is not null;

alter table public.po_supplier_promises
  drop constraint if exists po_promise_scope;
alter table public.po_supplier_promises
  add constraint po_promise_scope check (
    (kind = 'tomorrow_delivery'
      and (about_date is not null or answer = 'reported')
      and ((po_line_id is null and about_qty is null)
           or (po_line_id is not null and about_qty is not null and about_qty > 0)))
    or (kind = 'balance_delivery' and po_line_id is not null and about_qty is not null)
    or (kind = 'ready_date' and po_line_id is null and about_qty is null));

-- ── §2 · who may RECORD what the supplier answered ───────────────────────────

-- Owner ruling 2026-09-25: any active Operation person may record what the
-- supplier answered (the holder may be on leave, the job not yet handed to
-- the buddy). The resolver's normal holder and dated cover are still returned
-- and stored; the caller is the actual recorder. This REDEFINES the one
-- recording gate every answer door already asks (0428 replies, 0432 balance
-- and ready dates, 0585 confirmations), so no door is missed and no second
-- gate exists. Issuing, revising and cancelling a PO stay with
-- `purchasing_actor_may_issue()` — PO Duty, cover, Operations Superuser.
-- `purchasing_supplier_call_gate()` already fails CLOSED on a null role and
-- admits operation + principal only; 0266's `status = 'disabled'` is the
-- account switch, checked here once more.
create or replace function public.purchasing_supplier_reply_actor()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $fn$
declare v_uid uuid := auth.uid();
  v_role public.app_role := public.app_role();
  v_duty jsonb := public.workspace_resolve_duty('po_duty', null);
begin
  return v_duty || jsonb_build_object('actual_user_id', v_uid, 'allowed',
    v_uid is not null and v_role in ('operation','principal')
      and exists (select 1 from public.app_users u where u.id = v_uid and u.status = 'active'));
end;
$fn$;
revoke all on function public.purchasing_supplier_reply_actor() from public, anon;

-- The table trigger keeps every rule of 0585 and takes the wider recorder gate
-- for `tomorrow_delivery`; a line-level row must name a line of THIS PO with
-- goods still to deliver, and a batch may not exceed that remainder.
create or replace function public.purchasing_require_reply_evidence()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_po public.purchase_orders; v_who jsonb; v_line public.purchase_order_lines;
begin
  if new.kind <> 'tomorrow_delivery' then return new; end if;
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true then
    raise exception 'Only Operation staff may record the supplier answer.' using errcode='42501';
  end if;
  select * into v_po from public.purchase_orders where id=new.po_id for update;
  if new.po_version is distinct from coalesce(v_po.version,1) then
    raise exception 'Open the current PO and record the supplier answer.' using errcode='22023',detail='stale_po_version';
  end if;
  if v_po.status <> 'open' or not exists(select 1 from public.purchase_order_lines
    where po_id=v_po.id and qty>received_qty) then
    raise exception 'This PO has no goods left to deliver.' using errcode='22023',detail='po_not_open';
  end if;
  if not exists(select 1 from public.po_sends where po_id=v_po.id
    and kind='confirmed_sent' and po_version=new.po_version) then
    raise exception 'Record the current PO PDF sent before the supplier answer.' using errcode='22023',detail='po_not_sent';
  end if;
  if new.po_line_id is not null then
    select * into v_line from public.purchase_order_lines where id = new.po_line_id and po_id = v_po.id;
    if not found then
      raise exception 'That goods line is not on this PO.' using errcode='22023',detail='po_line_not_found';
    end if;
    if v_line.qty - v_line.received_qty <= 0 then
      raise exception 'All of this line was received.' using errcode='22023',detail='line_all_received';
    end if;
    if new.about_qty is null or new.about_qty <= 0 or new.about_qty > v_line.qty - v_line.received_qty then
      raise exception 'A batch cannot exceed what is still to deliver.' using errcode='22023',detail='batch_qty_invalid';
    end if;
  end if;
  if new.answer is null or new.new_date is null
    or new.answer not in ('confirmed','earlier','delayed','reported')
    or (new.answer='reported' and v_po.official_delivery_date is not null)
    or (new.answer<>'reported' and (
          v_po.official_delivery_date is null
          or new.about_date is distinct from v_po.official_delivery_date
          or (new.answer='confirmed' and new.new_date <> v_po.official_delivery_date)
          or (new.answer='earlier'   and new.new_date >= v_po.official_delivery_date)
          or (new.answer='delayed'   and new.new_date <= v_po.official_delivery_date)))
    or (new.answer='delayed' and not (coalesce(new.reason,'') = any (public.purchasing_supplier_delay_reasons())))
    or (new.answer='delayed' and new.reason='Other' and coalesce(new.remarks, '') !~ '[^[:space:]]')
    or (new.answer<>'delayed' and new.reason is not null) then
    raise exception 'Record the supplier delivery date and reason.' using errcode='22023',detail='invalid_input';
  end if;
  if new.channel is null or new.channel not in ('whatsapp','email','phone','in_person')
    or coalesce(new.recipient, '') !~ '[^[:space:]]' or coalesce(new.evidence, '') !~ '[^[:space:]]'
    or coalesce(new.reported_by, '') !~ '[^[:space:]]' or new.reported_at is null
    or left(new.evidence,length(new.po_id)+1) is distinct from new.po_id || '/'
    or not exists(select 1 from storage.objects where bucket_id='delivery-orders' and name=new.evidence)
    or length(new.recipient)>200 or length(new.reported_by)>200 or length(new.evidence)>2000
    or length(new.remarks)>500
    or new.reported_at < (select min(sent_at) from public.po_sends where po_id=v_po.id and kind='confirmed_sent' and po_version=new.po_version)
    or new.reported_at > now() or new.recorded_by is distinct from auth.uid()
    or auth.uid() is null then
    raise exception 'Record the reply channel, recipient, evidence, reporter and time.' using errcode='22023',detail='reply_evidence_required';
  end if;
  new.duty_user_id := nullif(v_who->>'normal_user_id','')::uuid;
  new.acting_user_id := nullif(v_who->>'acting_user_id','')::uuid;
  new.recorded_at:=clock_timestamp();
  return new;
end;
$fn$;

-- ── §4a · the expected arrivals, one per line / batch ────────────────────────

-- For every open line: the batches of the line's NEWEST answer on the current
-- version; else the PO-level newest evidenced answer; else the original PO
-- Delivery Date; else the live planning date. Used by the day-before check,
-- the PO-level effective arrival and the customer arrival projection.
create or replace function public.purchasing_po_expected_arrivals(p_po_id text)
returns table (po_line_id uuid, qty integer, arrival date, answer text, reason text, answer_group uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with po as (select * from purchase_orders where id = p_po_id),
  po_level as (
    select p.new_date, p.answer, p.reason
      from po_supplier_promises p, po
     where p.po_id = po.id and p.kind = 'tomorrow_delivery' and p.po_line_id is null
       and p.po_version = coalesce(po.version, 1)
       and coalesce(p.channel, '') ~ '[^[:space:]]' and coalesce(p.recipient, '') ~ '[^[:space:]]'
       and coalesce(p.evidence, '') ~ '[^[:space:]]' and coalesce(p.reported_by, '') ~ '[^[:space:]]'
       and p.reported_at is not null and p.recorded_by is not null and p.new_date is not null
     order by p.recorded_at desc, p.id desc limit 1),
  lines as (
    select l.id, l.qty - l.received_qty as still
      from purchase_order_lines l, po
     where l.po_id = po.id and l.qty > l.received_qty),
  newest as (
    select distinct on (p.po_line_id) p.po_line_id, p.answer_group, p.recorded_at
      from po_supplier_promises p, po
     where p.po_id = po.id and p.kind = 'tomorrow_delivery' and p.po_line_id is not null
       and p.po_version = coalesce(po.version, 1) and p.new_date is not null
     order by p.po_line_id, p.recorded_at desc, p.id desc),
  line_batches as (
    select p.po_line_id, p.about_qty as qty, p.new_date as arrival, p.answer, p.reason, p.answer_group
      from po_supplier_promises p
      join newest n on n.po_line_id = p.po_line_id
       and (p.answer_group = n.answer_group or (n.answer_group is null and p.recorded_at = n.recorded_at))
     where p.kind = 'tomorrow_delivery' and p.new_date is not null)
  select l.id, coalesce(b.qty, l.still), coalesce(b.arrival, pl.new_date, po.official_delivery_date, po.eta_date),
         coalesce(b.answer, pl.answer), coalesce(b.reason, pl.reason), b.answer_group
    from lines l
    cross join po
    left join po_level pl on true
    left join line_batches b on b.po_line_id = l.id
   order by l.id, coalesce(b.arrival, pl.new_date, po.official_delivery_date, po.eta_date);
$fn$;

comment on function public.purchasing_po_expected_arrivals(text) is
  '0587 · one expected arrival per open line / split batch on the current version: the line''s newest answer, else the PO-level newest evidenced answer, else the original PO Delivery Date, else the planning date.';

revoke all on function public.purchasing_po_expected_arrivals(text) from public, anon;
grant execute on function public.purchasing_po_expected_arrivals(text) to authenticated;

-- The PO-level effective arrival is the LAST expected arrival: the PO is not
-- fully in until its last batch is. Same fallbacks as 0585 when no line is open.
create or replace function public.purchasing_po_effective_arrival(p_po_id text)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select max(a.arrival) from purchasing_po_expected_arrivals(p_po_id) a),
    (select p.new_date from po_supplier_promises p
      where p.po_id = po.id and p.kind = 'tomorrow_delivery'
        and p.po_version = coalesce(po.version, 1)
        and coalesce(p.channel, '') ~ '[^[:space:]]' and coalesce(p.recipient, '') ~ '[^[:space:]]'
        and coalesce(p.evidence, '') ~ '[^[:space:]]' and coalesce(p.reported_by, '') ~ '[^[:space:]]'
        and p.reported_at is not null and p.recorded_by is not null and p.new_date is not null
      order by p.recorded_at desc, p.id desc limit 1),
    po.official_delivery_date,
    po.eta_date)
  from purchase_orders po where po.id = p_po_id;
$fn$;

-- The customer arrival projection reads the LINE's own newest answer (the
-- last batch of it) before the PO-level one — the same ladder as above.
create or replace function public.purchasing_project_line_etas(p_po_id text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_touched integer := 0;
begin
  with affected as (
    select distinct s.order_id, s.sku
      from public.po_line_sources s
      join public.order_lines ol on ol.id = s.order_line_id
       and ol.order_id = s.order_id and ol.sku = s.sku
     where s.po_id = p_po_id
  ), effective as (
    select s2.order_id, s2.sku,
           max(coalesce(
             (select bp.new_date from public.po_supplier_promises bp
               where bp.po_line_id = l2.id and bp.kind = 'balance_delivery'
                 and bp.new_date is not null
               order by bp.recorded_at desc, bp.id desc limit 1),
             (select max(a.arrival) from public.purchasing_po_expected_arrivals(po2.id) a
               where a.po_line_id = l2.id),
             (select coalesce(tp.new_date, tp.about_date)
                from public.po_supplier_promises tp
               where tp.po_id = po2.id and tp.kind = 'tomorrow_delivery' and tp.po_line_id is null
                 and tp.po_version = coalesce(po2.version, 1)
               order by tp.recorded_at desc, tp.id desc limit 1),
             po2.official_delivery_date,
             po2.eta_date)) as eta
      from affected a
      join public.po_line_sources s2 on s2.order_id = a.order_id and s2.sku = a.sku
      join public.purchase_order_lines l2 on l2.id = s2.po_line_id
       and l2.po_id = s2.po_id and l2.sku = s2.sku
      join public.purchase_orders po2 on po2.id = s2.po_id and po2.status = 'open'
     where l2.qty > l2.received_qty
     group by s2.order_id, s2.sku
  ), written as (
    insert into public.ops_order_control(order_id, line_etas, updated_at)
    select e.order_id, jsonb_object_agg(e.sku, to_jsonb(e.eta::text)), now()
      from effective e
     where e.eta is not null
     group by e.order_id
    on conflict (order_id) do update set
      line_etas = coalesce(ops_order_control.line_etas, '{}'::jsonb) || excluded.line_etas,
      updated_at = excluded.updated_at
    returning order_id
  )
  select count(*) into v_touched from written;
  return v_touched;
end;
$fn$;
revoke execute on function public.purchasing_project_line_etas(text) from public, anon, authenticated;

-- ── §3 · the ONE per-line answer door ────────────────────────────────────────

create or replace function public.purchasing_record_supplier_answers(p_po_id text, p jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare
  v_po public.purchase_orders; v_role public.app_role; v_who jsonb; v_version integer;
  v_group uuid := gen_random_uuid(); v_files text[]; v_file text; v_evidence text;
  v_line jsonb; v_pol public.purchase_order_lines; v_still integer; v_kind text;
  v_batch jsonb; v_batches jsonb; v_total integer; v_date date; v_answer text; v_reason text;
  v_remarks text; v_previous date; v_id uuid; v_rows integer := 0; v_confirmations integer := 0;
  v_do_no text; v_do_file text; v_touched integer; v_line_out jsonb := '[]'::jsonb;
  v_last_delay record; v_arrival record; v_summary text := '';
begin
  v_role := public.purchasing_supplier_call_gate();
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true or auth.uid() is null then
    raise exception 'Only Operation staff may record the supplier answer.' using errcode='42501', detail='forbidden';
  end if;
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase Order not found.' using errcode='22023', detail='po_not_found'; end if;

  v_version := nullif(p->>'poVersion','')::integer;
  if v_version is distinct from coalesce(v_po.version, 1) then
    raise exception 'Open the current PO and record the supplier answer.' using errcode='22023', detail='stale_po_version';
  end if;
  if v_po.status <> 'open' or not exists (select 1 from public.purchase_order_lines where po_id = v_po.id and qty > received_qty) then
    raise exception 'This PO has no goods left to deliver.' using errcode='22023', detail='po_not_open';
  end if;
  if not exists (select 1 from public.po_sends where po_id = v_po.id and kind = 'confirmed_sent' and po_version = v_version) then
    raise exception 'Record the current PO PDF sent before the supplier answer.' using errcode='22023', detail='po_not_sent';
  end if;

  -- Evidence: every file must be this PO's own upload. The Supplier DO file
  -- counts as evidence when it is the only file.
  v_do_no := case when coalesce(p#>>'{supplierDo,number}', '') ~ '[^[:space:]]' then btrim(p#>>'{supplierDo,number}') end;
  v_do_file := case when coalesce(p#>>'{supplierDo,file}', '') ~ '[^[:space:]]' then btrim(p#>>'{supplierDo,file}') end;
  if (v_do_no is null) <> (v_do_file is null) then
    raise exception 'Record the Supplier DO number and upload the Supplier DO.' using errcode='22023', detail='supplier_do_incomplete';
  end if;
  if v_do_no is not null and length(v_do_no) not between 3 and 50 then
    raise exception 'The Supplier DO number is 3 to 50 characters.' using errcode='22023', detail='supplier_do_invalid';
  end if;
  select coalesce(array_agg(x order by ord), '{}') into v_files
    from (select distinct on (x) x, ord
            from (select v_do_file as x, 0 as ord
                  union all
                  select btrim(e.value), e.ordinality
                    from jsonb_array_elements_text(coalesce(p->'evidence','[]'::jsonb)) with ordinality e(value, ordinality)) all_files
           where coalesce(x, '') ~ '[^[:space:]]'
           order by x, ord) distinct_files;
  if cardinality(v_files) = 0 then
    raise exception 'Add the WhatsApp screenshot of the supplier''s answer.' using errcode='22023', detail='screenshot_required';
  end if;
  foreach v_file in array v_files loop
    if left(v_file, length(p_po_id)+1) is distinct from p_po_id || '/'
       or not exists (select 1 from storage.objects where bucket_id='delivery-orders' and name=v_file) then
      raise exception 'A file was not uploaded for this PO.' using errcode='22023', detail='screenshot_not_found';
    end if;
  end loop;
  v_evidence := v_files[1];

  if jsonb_typeof(p->'lines') is distinct from 'array' then
    raise exception 'Record the answer per goods line.' using errcode='22023', detail='invalid_input';
  end if;
  if v_do_no is null and not exists (select 1 from jsonb_array_elements(p->'lines') l where coalesce(l->>'answer','no_change') <> 'no_change') then
    raise exception 'Answer at least one goods line or record the Supplier DO.' using errcode='22023', detail='nothing_to_record';
  end if;

  for v_line in select * from jsonb_array_elements(p->'lines') loop
    select * into v_pol from public.purchase_order_lines
      where id = nullif(v_line->>'poLineId','')::uuid and po_id = v_po.id;
    if not found then
      raise exception 'That goods line is not on this PO.' using errcode='22023', detail='po_line_not_found';
    end if;
    v_still := v_pol.qty - v_pol.received_qty;
    if v_still <= 0 then
      raise exception 'All of this line was received.' using errcode='22023', detail='line_all_received';
    end if;
    v_kind := v_line->>'answer';
    if v_kind = 'no_change' then continue; end if;
    if v_kind not in ('confirmed','new_date','split') then
      raise exception 'Choose the supplier''s answer for each line.' using errcode='22023', detail='invalid_input';
    end if;

    -- The batches: one for `confirmed` / `new_date`, several for `split`.
    if v_kind = 'split' then
      v_batches := coalesce(v_line->'batches', '[]'::jsonb);
      if jsonb_typeof(v_batches) <> 'array' or jsonb_array_length(v_batches) = 0 then
        raise exception 'Add at least one delivery date to the split.' using errcode='22023', detail='batches_required';
      end if;
      select coalesce(sum(nullif(b->>'qty','')::integer), 0) into v_total from jsonb_array_elements(v_batches) b;
      if v_total <> v_still then
        raise exception 'The batches must total what is still to deliver.' using errcode='22023', detail='batch_total_mismatch';
      end if;
    elsif v_kind = 'confirmed' then
      -- Confirmed = the line's CURRENT expected date (its newest answer, else the
      -- original PO Delivery Date) stands. The stored row carries the ladder's
      -- own classification; a re-confirmed delay keeps its reason.
      select a.arrival, a.answer, a.reason into v_arrival
        from public.purchasing_po_expected_arrivals(p_po_id) a where a.po_line_id = v_pol.id
        order by a.arrival desc limit 1;
      if v_arrival.arrival is null then
        raise exception 'This line has no date to confirm yet.' using errcode='22023', detail='new_date_required';
      end if;
      v_batches := jsonb_build_array(jsonb_build_object('qty', v_still, 'date', v_arrival.arrival::text,
        'reason', v_arrival.reason, 'remarks', v_line->>'remarks'));
    else
      if coalesce(v_line->>'date','') = '' then
        raise exception 'Record the supplier delivery date.' using errcode='22023', detail='new_date_required';
      end if;
      v_batches := jsonb_build_array(jsonb_build_object('qty', v_still, 'date', v_line->>'date',
        'reason', v_line->>'reason', 'remarks', v_line->>'remarks'));
    end if;

    select coalesce(new_date, about_date) into v_previous
      from public.po_supplier_promises
     where po_id = p_po_id and kind = 'tomorrow_delivery' and po_version = v_version
       and (po_line_id = v_pol.id or po_line_id is null)
     order by (po_line_id is not null) desc, recorded_at desc, id desc limit 1;

    for v_batch in select * from jsonb_array_elements(v_batches) loop
      v_date := nullif(v_batch->>'date','')::date;
      if v_date is null then
        raise exception 'Record the supplier delivery date.' using errcode='22023', detail='new_date_required';
      end if;
      if nullif(v_batch->>'qty','')::integer is null or (v_batch->>'qty')::integer <= 0 then
        raise exception 'A batch needs a quantity.' using errcode='22023', detail='batch_qty_invalid';
      end if;
      v_answer := case
        when v_po.official_delivery_date is null then 'reported'
        when v_date = v_po.official_delivery_date then 'confirmed'
        when v_date < v_po.official_delivery_date then 'earlier'
        else 'delayed' end;
      v_reason := case when coalesce(v_batch->>'reason', '') ~ '[^[:space:]]' then btrim(v_batch->>'reason') end;
      v_remarks := nullif(btrim(coalesce(v_batch->>'remarks', '')), '');
      if v_answer = 'delayed' then
        if v_reason is null then
          -- A re-confirmed delay keeps the reason it was recorded with.
          select p2.reason, p2.remarks into v_last_delay from public.po_supplier_promises p2
           where p2.po_id = p_po_id and p2.kind = 'tomorrow_delivery' and p2.answer = 'delayed'
             and p2.po_version = v_version and (p2.po_line_id = v_pol.id or p2.po_line_id is null)
           order by (p2.po_line_id is not null) desc, p2.recorded_at desc, p2.id desc limit 1;
          v_reason := v_last_delay.reason; v_remarks := coalesce(v_remarks, v_last_delay.remarks);
        end if;
        if not (coalesce(v_reason,'') = any (public.purchasing_supplier_delay_reasons())) then
          raise exception 'Choose why the supplier moved the date.' using errcode='22023', detail='reason_required';
        end if;
        if v_reason = 'Other' and coalesce(v_remarks, '') !~ '[^[:space:]]' then
          raise exception 'Write why the supplier moved the date.' using errcode='22023', detail='other_note_required';
        end if;
      else
        v_reason := null;
      end if;

      insert into public.po_supplier_promises(po_id, po_line_id, kind, answer, about_date, about_qty, previous_date, new_date,
        reason, remarks, recorded_by, po_version, channel, recipient, evidence, reported_by, reported_at, answer_group)
      values (p_po_id, v_pol.id, 'tomorrow_delivery', v_answer, v_po.official_delivery_date, (v_batch->>'qty')::integer,
        v_previous, v_date, v_reason, v_remarks, auth.uid(), v_version, p->>'channel', btrim(p->>'recipient'),
        v_evidence, btrim(p->>'reportedBy'), (p->>'reportedAt')::timestamptz, v_group)
      returning id into v_id;
      v_rows := v_rows + 1;
      foreach v_file in array v_files loop
        insert into public.po_supplier_answer_screenshots(answer_id, path, recorded_by)
          values (v_id, v_file, auth.uid()) on conflict (answer_id, path) do nothing;
      end loop;

      -- A `confirmed` line IS the day-before confirmation for that exact date
      -- and the PO's own Warehouse (§5.7 completion).
      if v_kind = 'confirmed' and v_po.destination_id is not null then
        insert into public.po_arrival_confirmations (po_id, po_version, for_date, destination_id, kind, evidence,
          channel, recipient, reported_by, reported_at, recorded_by, duty_user_id, acting_user_id)
        values (p_po_id, v_version, v_date, v_po.destination_id, 'supplier_confirmation', v_files,
          p->>'channel', btrim(p->>'recipient'), btrim(p->>'reportedBy'), (p->>'reportedAt')::timestamptz, auth.uid(),
          nullif(v_who->>'normal_user_id','')::uuid, nullif(v_who->>'acting_user_id','')::uuid);
        v_confirmations := v_confirmations + 1;
      end if;
      v_summary := v_summary || format('%s%s ×%s · %s%s', case when v_summary = '' then '' else ' · ' end,
        v_pol.sku, (v_batch->>'qty')::integer, v_date,
        case v_answer when 'delayed' then format(' · Delayed · %s', v_reason) when 'earlier' then ' · Earlier' else '' end);
    end loop;
    v_line_out := v_line_out || jsonb_build_object('poLineId', v_pol.id, 'batches', v_batches);
  end loop;

  -- `Supplier DO received`: the PO's own DO fields, written once, and the
  -- day-before evidence for EVERY expected arrival still open.
  if v_do_no is not null then
    update public.purchase_orders
       set do_number = v_do_no, do_file_path = v_do_file, do_uploaded_at = now(), do_uploaded_by = auth.uid()
     where id = p_po_id;
    if v_po.destination_id is not null then
      for v_arrival in select distinct a.arrival from public.purchasing_po_expected_arrivals(p_po_id) a where a.arrival is not null loop
        insert into public.po_arrival_confirmations (po_id, po_version, for_date, destination_id, kind, supplier_do_no, evidence,
          channel, recipient, reported_by, reported_at, recorded_by, duty_user_id, acting_user_id)
        values (p_po_id, v_version, v_arrival.arrival, v_po.destination_id, 'supplier_do', v_do_no, v_files,
          p->>'channel', btrim(p->>'recipient'), btrim(p->>'reportedBy'), (p->>'reportedAt')::timestamptz, auth.uid(),
          nullif(v_who->>'normal_user_id','')::uuid, nullif(v_who->>'acting_user_id','')::uuid);
        v_confirmations := v_confirmations + 1;
      end loop;
    end if;
    insert into public.po_history(po_id, text, by_role, by_user_id)
      values (p_po_id, format('Supplier DO %s recorded · PO V%s', v_do_no, v_version), v_role, auth.uid());
  end if;

  if v_rows > 0 then
    v_touched := public.purchasing_project_line_etas(p_po_id);
    insert into public.po_history(po_id, text, by_role, by_user_id)
      values (p_po_id, format('Supplier answer recorded · PO V%s · %s', v_version, v_summary), v_role, auth.uid());
  end if;
  insert into public.audit_log(role, actor_text, action, ref)
    values (v_role, (select name from public.app_users where id = auth.uid()), 'Supplier answer recorded', p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'answer_group', v_group, 'answers', v_rows,
    'confirmations', v_confirmations, 'supplier_do', v_do_no, 'orders_touched', coalesce(v_touched, 0),
    'lines', v_line_out, 'evidence', cardinality(v_files));
end;
$fn$;

revoke all on function public.purchasing_record_supplier_answers(text, jsonb) from public, anon;
grant execute on function public.purchasing_record_supplier_answers(text, jsonb) to authenticated;

-- ── §4b · the day-before confirmation may name any expected arrival ──────────

create or replace function public.purchasing_record_arrival_confirmation(p_po_id text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     public.app_role;
  v_who      jsonb;
  v_po       public.purchase_orders;
  v_version  integer;
  v_for      date;
  v_kind     text;
  v_shots    text[];
  v_shot     text;
  v_id       uuid;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true or auth.uid() is null then
    raise exception 'Only Operation staff may record the supplier answer.' using errcode='42501', detail='forbidden';
  end if;
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase Order not found.' using errcode='22023', detail='po_not_found'; end if;

  v_version := nullif(p->>'poVersion','')::integer;
  if v_version is distinct from coalesce(v_po.version, 1) then
    raise exception 'Open the current PO and record the supplier answer.' using errcode='22023', detail='stale_po_version';
  end if;
  if v_po.status <> 'open' or not exists (select 1 from purchase_order_lines where po_id = v_po.id and qty > received_qty) then
    raise exception 'This PO has no goods left to deliver.' using errcode='22023', detail='po_not_open';
  end if;
  if not exists (select 1 from po_sends where po_id = v_po.id and kind = 'confirmed_sent' and po_version = v_version) then
    raise exception 'Record the current PO PDF sent before the supplier answer.' using errcode='22023', detail='po_not_sent';
  end if;

  -- The EXACT date: one of the expected arrivals the check was opened for.
  v_for := nullif(p->>'forDate','')::date;
  if v_for is null or not exists (select 1 from purchasing_po_expected_arrivals(p_po_id) a where a.arrival = v_for) then
    raise exception 'The supplier must confirm the expected arrival date.' using errcode='22023', detail='arrival_date_mismatch';
  end if;
  if nullif(p->>'destinationId','')::uuid is distinct from v_po.destination_id or v_po.destination_id is null then
    raise exception 'The supplier must confirm the PO''s own Warehouse.' using errcode='22023', detail='wrong_warehouse';
  end if;

  v_kind := p->>'kind';
  if v_kind not in ('supplier_do', 'supplier_confirmation') then
    raise exception 'Record the Supplier DO or the supplier''s confirmation.' using errcode='22023', detail='invalid_input';
  end if;
  select coalesce(array_agg(btrim(x)), '{}') into v_shots
    from jsonb_array_elements_text(coalesce(p->'evidence','[]'::jsonb)) x
   where coalesce(x, '') ~ '[^[:space:]]';
  if cardinality(v_shots) = 0 then
    raise exception 'Add the Supplier DO or the WhatsApp screenshot.' using errcode='22023', detail='evidence_required';
  end if;
  foreach v_shot in array v_shots loop
    if left(v_shot, length(p_po_id)+1) is distinct from p_po_id || '/'
       or not exists (select 1 from storage.objects where bucket_id='delivery-orders' and name=v_shot) then
      raise exception 'A file was not uploaded for this PO.' using errcode='22023', detail='evidence_not_found';
    end if;
  end loop;
  if (p->>'reportedAt') is not null and (
       (p->>'reportedAt')::timestamptz > now()
       or (p->>'reportedAt')::timestamptz < (select min(sent_at) from po_sends where po_id = v_po.id and kind = 'confirmed_sent' and po_version = v_version)) then
    raise exception 'The supplier''s answer time is outside this PO''s life.' using errcode='22023', detail='reported_at_invalid';
  end if;

  insert into po_arrival_confirmations (
    po_id, po_version, for_date, destination_id, kind, supplier_do_no, evidence,
    channel, recipient, reported_by, reported_at, recorded_by, duty_user_id, acting_user_id
  ) values (
    p_po_id, v_version, v_for, v_po.destination_id, v_kind,
    case when coalesce(p->>'supplierDoNo', '') ~ '[^[:space:]]' then btrim(p->>'supplierDoNo') end,
    v_shots, nullif(p->>'channel',''),
    case when coalesce(p->>'recipient', '') ~ '[^[:space:]]' then btrim(p->>'recipient') end,
    case when coalesce(p->>'reportedBy', '') ~ '[^[:space:]]' then btrim(p->>'reportedBy') end,
    nullif(p->>'reportedAt','')::timestamptz, auth.uid(),
    nullif(v_who->>'normal_user_id','')::uuid, nullif(v_who->>'acting_user_id','')::uuid
  ) returning id into v_id;

  insert into po_history (po_id, text, by_role, by_user_id)
    values (p_po_id,
            format('Supplier %s recorded · PO V%s · %s',
                   case v_kind when 'supplier_do' then format('DO %s', btrim(p->>'supplierDoNo')) else 'confirmation' end,
                   v_version, v_for),
            v_role, auth.uid());
  return jsonb_build_object('po_id', p_po_id, 'confirmation_id', v_id, 'for_date', v_for, 'kind', v_kind);
end;
$fn$;

revoke all on function public.purchasing_record_arrival_confirmation(text, jsonb) from public, anon;
grant execute on function public.purchasing_record_arrival_confirmation(text, jsonb) to authenticated;
