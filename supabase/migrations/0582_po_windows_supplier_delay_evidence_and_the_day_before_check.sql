-- =============================================================================
-- 0582_po_windows_supplier_delay_evidence_and_the_day_before_check.sql
-- Purchasing MASTER §§5.6.1, 5.7 · owner rulings 2026-09-24 (Jess), PR #1598.
--
-- WHAT WAS MISSING, MEASURED on origin/main ac1d280ea
--   · No PO window exists: `purchasing_settings` holds `po_days` only, and no
--     supplier cut-off is stored anywhere (0303 · 0318 · 0307).
--   · A supplier delay (0432 `purchasing_record_supplier_reply`) takes ONE
--     evidence file and the pre-2026-09-24 reason list; `Other` needs no note.
--   · The day-before check (`purchasing.confirm_tomorrows_delivery`) closes on
--     any answer ABOUT the date — no Supplier DO, no named Warehouse.
--
-- WHAT THIS ADDS
--   §1 PO windows. `purchasing_settings` gains the first standard window
--      (11:30 Malaysia time, editable) and an optional second one (16:00,
--      editable, may be switched off). `purchasing_supplier_settings` gains a
--      supplier's governed EARLIER cut-off. Two setter doors, each writing the
--      Purchasing change history (actor, time, old, new).
--   §2 Supplier delay evidence. A delayed answer needs one of the eight
--      governed reasons, a note for `Other`, the new date, and AT LEAST ONE
--      WhatsApp screenshot (more may be kept) in the append-only
--      `po_supplier_answer_screenshots`. The answer ledger itself becomes
--      append-only; the original PO Delivery Date stays immutable (0428).
--   §3 The effective arrival — ONE definition, `purchasing_po_effective_arrival`:
--      the latest evidenced answer on the current version, else the original
--      PO Delivery Date, else the live planning date.
--   §4 The day-before check's evidence, `po_arrival_confirmations`: the Supplier
--      DO, or an evidenced confirmation, for the EXACT effective arrival and the
--      PO's own Warehouse, on the exact current version. Append-only. Neither
--      proves receipt: only Receiving and its GRN do (Stock MASTER §2).
--
-- DELIBERATELY NOT HERE
--   · No window moves an existing PO, its PO Date or its PO Delivery Date.
--     Applying windows to the issue doors is a separate, later change.
--   · Rows written before this migration keep their old reason words.
--
-- RLS: two NEW tables, RLS ENABLED, internal staff may READ; no client writes
--   (only the SECURITY DEFINER doors below). `po_supplier_promises` keeps its
--   policies; an append-only trigger is added. No existing policy changes.
-- NO ROW COUNT IS ASSERTED (CLAUDE.md §5.8).
-- =============================================================================

-- ── §1 · PO windows ──────────────────────────────────────────────────────────

alter table public.purchasing_settings
  add column if not exists po_window_first time not null default '11:30',
  add column if not exists po_window_second time default '16:00',
  add column if not exists po_window_second_enabled boolean not null default true;

alter table public.purchasing_settings
  drop constraint if exists purchasing_settings_po_windows_order;
alter table public.purchasing_settings
  add constraint purchasing_settings_po_windows_order check (
    po_window_second is null or po_window_second > po_window_first),
  drop constraint if exists purchasing_settings_po_window_second_present;
alter table public.purchasing_settings
  add constraint purchasing_settings_po_window_second_present check (
    not po_window_second_enabled or po_window_second is not null);

comment on column public.purchasing_settings.po_window_first is
  '0582 · the first daily PO window, Malaysia wall-clock time (initially 11:30). Demand admitted before it belongs to it.';
comment on column public.purchasing_settings.po_window_second is
  '0582 · the optional second daily PO window (initially 16:00); used only while po_window_second_enabled.';

alter table public.purchasing_supplier_settings
  add column if not exists po_cutoff time;

comment on column public.purchasing_supplier_settings.po_cutoff is
  '0582 · this supplier''s governed EARLIER cut-off (Malaysia time). A standard window later than it is invalid for the supplier; when no standard window is at or before it, the cut-off itself is the supplier''s window. NULL = the standard windows.';

create or replace function public.purchasing_set_po_windows(
  p_first          time,
  p_second         time,
  p_second_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  public.purchasing_settings;
begin
  if p_first is null then
    raise exception 'The first PO window needs a time.' using errcode = '22023', detail = 'po_window_first_required';
  end if;
  if coalesce(p_second_enabled, false) and p_second is null then
    raise exception 'The second PO window needs a time.' using errcode = '22023', detail = 'po_window_second_required';
  end if;
  if p_second is not null and p_second <= p_first then
    raise exception 'The second PO window must be later than the first.' using errcode = '22023', detail = 'po_windows_out_of_order';
  end if;
  select * into v_old from purchasing_settings where id = 1 for update;
  update purchasing_settings
     set po_window_first = p_first,
         po_window_second = p_second,
         po_window_second_enabled = coalesce(p_second_enabled, false),
         updated_by = auth.uid(),
         updated_at = now()
   where id = 1;
  perform purchasing_record_change(
    v_role, 'po_windows', null, null,
    format('%s · %s · %s', v_old.po_window_first, coalesce(v_old.po_window_second::text, '-'),
           case when v_old.po_window_second_enabled then 'on' else 'off' end),
    format('%s · %s · %s', p_first, coalesce(p_second::text, '-'),
           case when coalesce(p_second_enabled, false) then 'on' else 'off' end),
    format('Purchasing setting · PO windows %s / %s -> %s / %s',
           v_old.po_window_first,
           case when v_old.po_window_second_enabled then v_old.po_window_second::text else 'off' end,
           p_first,
           case when coalesce(p_second_enabled, false) then p_second::text else 'off' end));
end;
$fn$;

revoke all on function public.purchasing_set_po_windows(time, time, boolean) from public, anon;
grant execute on function public.purchasing_set_po_windows(time, time, boolean) to authenticated;

create or replace function public.purchasing_set_supplier_po_cutoff(
  p_supplier_id uuid,
  p_cutoff      time
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  time;
  v_last time;
  v_name text;
begin
  if p_supplier_id is null or not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'unknown_supplier' using errcode = '22023';
  end if;
  -- EARLIER only: a supplier cut-off later than the last enabled standard
  -- window would place its demand in a window that does not exist.
  select case when po_window_second_enabled then po_window_second else po_window_first end
    into v_last from purchasing_settings where id = 1;
  if p_cutoff is not null and p_cutoff >= v_last then
    raise exception 'A supplier cut-off must be earlier than the last PO window.'
      using errcode = '22023', detail = 'supplier_cutoff_not_earlier';
  end if;
  select po_cutoff into v_old from purchasing_supplier_settings where supplier_id = p_supplier_id;
  select name into v_name from suppliers where id = p_supplier_id;
  insert into purchasing_supplier_settings (supplier_id, po_cutoff, updated_by, updated_at)
  values (p_supplier_id, p_cutoff, auth.uid(), now())
  on conflict (supplier_id) do update
    set po_cutoff = excluded.po_cutoff, updated_by = excluded.updated_by, updated_at = now();
  perform purchasing_record_change(
    v_role, 'supplier_po_cutoff', p_supplier_id, null,
    v_old::text, p_cutoff::text,
    format('Purchasing setting · %s PO cut-off %s -> %s',
           v_name, coalesce(v_old::text, 'standard windows'), coalesce(p_cutoff::text, 'standard windows')));
end;
$fn$;

revoke all on function public.purchasing_set_supplier_po_cutoff(uuid, time) from public, anon;
grant execute on function public.purchasing_set_supplier_po_cutoff(uuid, time) to authenticated;

-- ── §2 · supplier delay evidence ─────────────────────────────────────────────

create table if not exists public.po_supplier_answer_screenshots (
  id          uuid primary key default gen_random_uuid(),
  answer_id   uuid not null references public.po_supplier_promises(id) on delete restrict,
  path        text not null check (length(path) between 3 and 2000),
  recorded_by uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (answer_id, path)
);

comment on table public.po_supplier_answer_screenshots is
  '0582 · every WhatsApp screenshot kept for a supplier answer (at least one for a delay; more may be kept). Append-only; written only by purchasing_record_supplier_reply.';

create index if not exists po_supplier_answer_screenshots_answer_idx
  on public.po_supplier_answer_screenshots (answer_id);

alter table public.po_supplier_answer_screenshots enable row level security;
revoke all on public.po_supplier_answer_screenshots from public, anon, authenticated;
grant select on public.po_supplier_answer_screenshots to authenticated;
drop policy if exists po_supplier_answer_screenshots_internal_read on public.po_supplier_answer_screenshots;
create policy po_supplier_answer_screenshots_internal_read
  on public.po_supplier_answer_screenshots for select to authenticated
  using ((select public.is_internal()));

-- One refusal shared by every append-only Purchasing evidence table.
create or replace function public._purchasing_evidence_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  raise exception 'Supplier evidence is history: it is never changed or removed.'
    using errcode = '42501', detail = 'supplier_evidence_append_only';
end;
$fn$;

drop trigger if exists po_supplier_answer_screenshots_append_only on public.po_supplier_answer_screenshots;
create trigger po_supplier_answer_screenshots_append_only
  before update or delete on public.po_supplier_answer_screenshots
  for each row execute function public._purchasing_evidence_append_only();

-- The answer ledger was append-only by convention (0306: "no column to
-- overwrite"); it is now append-only by structure.
drop trigger if exists po_supplier_promises_append_only on public.po_supplier_promises;
create trigger po_supplier_promises_append_only
  before update or delete on public.po_supplier_promises
  for each row execute function public._purchasing_evidence_append_only();

/** The eight governed delay reasons (owner-approved 2026-09-24). */
create or replace function public.purchasing_supplier_delay_reasons()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select array['Production delay', 'Material unavailable', 'Capacity / scheduling delay',
               'Quality issue / remake', 'Transport delay', 'Supplier closed / holiday',
               'Partial quantity ready', 'Other']::text[];
$fn$;

-- The table trigger keeps every 0432 rule and takes the new reason list; a
-- delay that names `Other` must say what.
create or replace function public.purchasing_require_reply_evidence()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_po public.purchase_orders; v_who jsonb;
begin
  if new.kind <> 'tomorrow_delivery' then return new; end if;
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true then
    raise exception 'Ask PO Duty to record the supplier answer.' using errcode='42501';
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
    or (new.answer='delayed' and new.reason='Other' and nullif(btrim(coalesce(new.remarks,'')),'') is null)
    or (new.answer<>'delayed' and new.reason is not null) then
    raise exception 'Record the supplier delivery date and reason.' using errcode='22023',detail='invalid_input';
  end if;
  if new.channel is null or new.channel not in ('whatsapp','email','phone','in_person')
    or nullif(btrim(new.recipient),'') is null or nullif(btrim(new.evidence),'') is null
    or nullif(btrim(new.reported_by),'') is null or new.reported_at is null
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

-- The ONE reply door (Law C): the same classification as 0432, now with the
-- screenshot set — the evidence file plus any further screenshots. A delay
-- without a screenshot, a governed reason or a date is refused whole.
create or replace function public.purchasing_record_supplier_reply(p_po_id text,p_reply jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_po public.purchase_orders; v_role public.app_role; v_date date; v_id uuid;
  v_previous date; v_answer text; v_reason text; v_who jsonb; v_touched int;
  v_shots text[]; v_shot text; v_evidence text;
begin
  v_role:=public.purchasing_supplier_call_gate();
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true then
    raise exception 'Ask PO Duty to record the supplier answer.' using errcode='42501';
  end if;
  select * into v_po from public.purchase_orders where id=p_po_id for update;
  if not found then raise exception 'Purchase Order not found.' using errcode='22023',detail='po_not_found'; end if;
  v_date := coalesce(nullif(p_reply->>'supplierDate','')::date,
                     nullif(p_reply->>'newDate','')::date,
                     nullif(p_reply->>'firstDate','')::date);
  if v_date is null then
    raise exception 'Record the supplier delivery date.' using errcode='22023',detail='new_date_required';
  end if;
  v_answer := case
    when v_po.official_delivery_date is null then 'reported'
    when v_date = v_po.official_delivery_date then 'confirmed'
    when v_date < v_po.official_delivery_date then 'earlier'
    else 'delayed' end;
  v_reason := nullif(btrim(coalesce(p_reply->>'reason','')),'');
  -- The screenshot set: the reply's evidence file (the WhatsApp screenshot the
  -- existing form uploads) first, then any further screenshots.
  v_evidence := nullif(btrim(coalesce(p_reply->>'evidence','')),'');
  select coalesce(array_agg(x order by ord), '{}') into v_shots
    from (select distinct on (x) x, ord
            from (select v_evidence as x, 0 as ord
                  union all
                  select btrim(e.value), e.ordinality
                    from jsonb_array_elements_text(coalesce(p_reply->'screenshots','[]'::jsonb)) with ordinality e(value, ordinality)) all_shots
           where nullif(x,'') is not null
           order by x, ord) distinct_shots;
  if v_answer = 'delayed' then
    if not (coalesce(v_reason,'') = any (public.purchasing_supplier_delay_reasons())) then
      raise exception 'Choose why the supplier moved the date.' using errcode='22023',detail='reason_required';
    end if;
    if v_reason = 'Other' and nullif(btrim(coalesce(p_reply->>'remarks','')),'') is null then
      raise exception 'Write why the supplier moved the date.' using errcode='22023',detail='other_note_required';
    end if;
    if cardinality(v_shots) = 0 then
      raise exception 'Add the WhatsApp screenshot of the supplier''s answer.' using errcode='22023',detail='screenshot_required';
    end if;
  else
    v_reason := null;
  end if;
  foreach v_shot in array v_shots loop
    if left(v_shot, length(p_po_id)+1) is distinct from p_po_id || '/'
       or not exists (select 1 from storage.objects where bucket_id='delivery-orders' and name=v_shot) then
      raise exception 'A screenshot was not uploaded for this PO.' using errcode='22023',detail='screenshot_not_found';
    end if;
  end loop;
  -- The single evidence file 0428 requires is the first screenshot.
  v_evidence := coalesce(v_evidence, v_shots[1]);
  select coalesce(new_date, about_date) into v_previous
    from public.po_supplier_promises where po_id=p_po_id and kind='tomorrow_delivery'
      and po_version=coalesce(v_po.version,1) order by recorded_at desc,id desc limit 1;
  insert into public.po_supplier_promises(po_id,kind,answer,about_date,previous_date,new_date,
    reason,remarks,recorded_by,po_version,channel,recipient,evidence,reported_by,reported_at)
    values(p_po_id,'tomorrow_delivery',v_answer,v_po.official_delivery_date,v_previous,v_date,
      v_reason,p_reply->>'remarks',auth.uid(),
      (p_reply->>'poVersion')::integer,p_reply->>'channel',btrim(p_reply->>'recipient'),
      v_evidence,btrim(p_reply->>'reportedBy'),(p_reply->>'reportedAt')::timestamptz)
    returning id into v_id;
  foreach v_shot in array v_shots loop
    insert into public.po_supplier_answer_screenshots(answer_id, path, recorded_by)
      values (v_id, v_shot, auth.uid())
      on conflict (answer_id, path) do nothing;
  end loop;
  v_touched := public.purchasing_project_line_etas(p_po_id);
  insert into public.po_history(po_id,text,by_role,by_user_id)
    values(p_po_id,format('Supplier answer recorded · PO V%s · %s · %s',
      coalesce(v_po.version,1), v_date,
      case v_answer when 'confirmed' then 'confirms the PO date'
                    when 'earlier' then 'earlier than the PO date'
                    when 'delayed' then format('Delayed · %s', v_reason)
                    else 'date reported' end),v_role,auth.uid());
  insert into public.audit_log(role,actor_text,action,ref)
    values(v_role,(select name from public.app_users where id=auth.uid()),'Supplier answer recorded',p_po_id);
  return jsonb_build_object('po_id',p_po_id,'reply_id',v_id,
    'answer',v_answer,'supplier_delivery_date',v_date,'orders_touched',v_touched,
    'screenshots',cardinality(v_shots));
end;
$fn$;

-- ── §3 · the effective arrival ───────────────────────────────────────────────

create or replace function public.purchasing_po_effective_arrival(p_po_id text)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select p.new_date from po_supplier_promises p
      where p.po_id = po.id and p.kind = 'tomorrow_delivery'
        and p.po_version = coalesce(po.version, 1)
        and nullif(btrim(p.channel), '') is not null and nullif(btrim(p.recipient), '') is not null
        and nullif(btrim(p.evidence), '') is not null and nullif(btrim(p.reported_by), '') is not null
        and p.reported_at is not null and p.recorded_by is not null and p.new_date is not null
      order by p.recorded_at desc, p.id desc limit 1),
    po.official_delivery_date,
    po.eta_date)
  from purchase_orders po where po.id = p_po_id;
$fn$;

comment on function public.purchasing_po_effective_arrival(text) is
  '0582 · the effective expected arrival: the latest evidenced supplier answer on the CURRENT version, else the immutable original PO Delivery Date, else the live planning date. Mirrors effectivePoArrivalOf (shared) — one definition.';

revoke all on function public.purchasing_po_effective_arrival(text) from public, anon;
grant execute on function public.purchasing_po_effective_arrival(text) to authenticated;

-- ── §4 · the day-before check's evidence ─────────────────────────────────────

create table if not exists public.po_arrival_confirmations (
  id              uuid primary key default gen_random_uuid(),
  po_id           text not null references public.purchase_orders(id) on delete restrict,
  po_version      integer not null check (po_version >= 1),
  for_date        date not null,
  destination_id  uuid not null references public.purchasing_destinations(id),
  kind            text not null check (kind in ('supplier_do', 'supplier_confirmation')),
  supplier_do_no  text check (supplier_do_no is null or length(btrim(supplier_do_no)) between 1 and 100),
  evidence        text[] not null check (cardinality(evidence) >= 1),
  channel         text check (channel in ('whatsapp', 'email', 'phone', 'in_person')),
  recipient       text check (recipient is null or length(recipient) <= 200),
  reported_by     text check (reported_by is null or length(reported_by) <= 200),
  reported_at     timestamptz,
  recorded_by     uuid not null,
  recorded_at     timestamptz not null default clock_timestamp(),
  duty_user_id    uuid,
  acting_user_id  uuid,
  constraint po_arrival_confirmations_do_has_number
    check (kind <> 'supplier_do' or supplier_do_no is not null),
  constraint po_arrival_confirmations_confirmation_is_evidenced
    check (kind <> 'supplier_confirmation'
           or (channel is not null and nullif(btrim(recipient), '') is not null
               and nullif(btrim(reported_by), '') is not null and reported_at is not null))
);

comment on table public.po_arrival_confirmations is
  '0582 · the day-before check''s evidence: the Supplier DO, or an evidenced supplier confirmation, that the PO''s goods go to its own Warehouse on the exact effective arrival. Never a receipt: only Receiving/GRN proves arrival. Append-only; written only by purchasing_record_arrival_confirmation.';

create index if not exists po_arrival_confirmations_po_idx
  on public.po_arrival_confirmations (po_id, for_date);

alter table public.po_arrival_confirmations enable row level security;
revoke all on public.po_arrival_confirmations from public, anon, authenticated;
grant select on public.po_arrival_confirmations to authenticated;
drop policy if exists po_arrival_confirmations_internal_read on public.po_arrival_confirmations;
create policy po_arrival_confirmations_internal_read
  on public.po_arrival_confirmations for select to authenticated
  using ((select public.is_internal()));

drop trigger if exists po_arrival_confirmations_append_only on public.po_arrival_confirmations;
create trigger po_arrival_confirmations_append_only
  before update or delete on public.po_arrival_confirmations
  for each row execute function public._purchasing_evidence_append_only();

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
  v_effective date;
  v_kind     text;
  v_shots    text[];
  v_shot     text;
  v_id       uuid;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true or auth.uid() is null then
    raise exception 'Ask PO Duty to record the supplier answer.' using errcode='42501', detail='forbidden';
  end if;
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase Order not found.' using errcode='22023', detail='po_not_found'; end if;

  -- The EXACT version: declared by the caller, never read back.
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

  -- The EXACT date: the effective arrival the check was opened for.
  v_for := nullif(p->>'forDate','')::date;
  v_effective := public.purchasing_po_effective_arrival(p_po_id);
  if v_for is null or v_for is distinct from v_effective then
    raise exception 'The supplier must confirm the expected arrival date.' using errcode='22023', detail='arrival_date_mismatch';
  end if;
  -- The NAMED Warehouse: the PO's own destination.
  if nullif(p->>'destinationId','')::uuid is distinct from v_po.destination_id or v_po.destination_id is null then
    raise exception 'The supplier must confirm the PO''s own Warehouse.' using errcode='22023', detail='wrong_warehouse';
  end if;

  v_kind := p->>'kind';
  if v_kind not in ('supplier_do', 'supplier_confirmation') then
    raise exception 'Record the Supplier DO or the supplier''s confirmation.' using errcode='22023', detail='invalid_input';
  end if;
  select coalesce(array_agg(btrim(x)), '{}') into v_shots
    from jsonb_array_elements_text(coalesce(p->'evidence','[]'::jsonb)) x
   where nullif(btrim(x),'') is not null;
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
    p_po_id, v_version, v_for, v_po.destination_id, v_kind, nullif(btrim(coalesce(p->>'supplierDoNo','')),''),
    v_shots, nullif(p->>'channel',''), nullif(btrim(coalesce(p->>'recipient','')),''),
    nullif(btrim(coalesce(p->>'reportedBy','')),''), nullif(p->>'reportedAt','')::timestamptz, auth.uid(),
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
