-- 0432 · Purchase Orders correction card (Jess, approved 2026-09-06).
--
-- Four defects, one migration:
--   §1  Every pre-0428 PO lost its displayed date: the register and PDF read
--       `official_delivery_date`, which 0428 left NULL on existing rows. The
--       birth date is recovered ONLY where the stored evidence proves it, and
--       an unprovable original stays NULL — unknown is recorded as unknown.
--   §2  A supplier reply was classified by the BROWSER, every changed date was
--       written as "delayed", and a delay reason was pre-selected. The server
--       now classifies the answer from the recorded original date; an earlier
--       date is `earlier`, not a delay, and a reason exists only for `delayed`.
--   §3  Two different arithmetics wrote `ops_order_control.line_etas` (the
--       reply door per-reply last-write-wins; the balance door by SO-number
--       inference). ONE projector now derives arrival planning from the exact
--       `po_line_sources` lineage across EVERY open PO still owing units.
--   §4  A confirmed send recorded only a version NUMBER. It now freezes the
--       full document payload per version, so a resend reproduces the same
--       recorded facts and a historical version can be reprinted.

-- ── §1 · the original date: one-time capture, evidence-based recovery ───────

-- The column stays immutable once it holds a value. What changes: a NULL may
-- be captured ONCE (this reconciliation, or a later governed recovery), so a
-- recovered original does not need the trigger dropped.
create or replace function public.purchasing_keep_official_delivery_date()
returns trigger language plpgsql set search_path=public,pg_temp as $fn$
begin
  if tg_op='INSERT' then
    new.official_delivery_date := new.eta_date;
  elsif new.official_delivery_date is distinct from old.official_delivery_date
        and old.official_delivery_date is not null then
    raise exception 'The original PO Delivery Date cannot change.' using errcode='22023';
  end if;
  return new;
end;
$fn$;

-- Recovery, from the measured writers of `eta_date` (2026-09-06):
--   birth        `_operation_create_po_inner` inserts it; nothing else sets it
--   moved by     `purchasing_record_ready_date` (0325, silent recompute) and
--                the legacy `purchasing_record_tomorrow_delivery` (0310, on a
--                delayed answer) — both leave a `po_supplier_promises` row.
-- So: no ready_date promise and no delayed reply ⇒ the live eta IS the birth
-- date. A legacy delayed reply kept the date it moved FROM (`previous_date`,
-- cross-checked against po_history). A ready_date PO is unprovable: NULL.
update public.purchase_orders po
   set official_delivery_date = po.eta_date
 where po.official_delivery_date is null
   and po.eta_date is not null
   and not exists (select 1 from public.po_supplier_promises p
                    where p.po_id = po.id and p.kind = 'ready_date')
   and not exists (select 1 from public.po_supplier_promises p
                    where p.po_id = po.id and p.kind = 'tomorrow_delivery'
                      and p.answer = 'delayed');

update public.purchase_orders po
   set official_delivery_date = d.previous_date
  from (select distinct on (p.po_id) p.po_id, p.previous_date
          from public.po_supplier_promises p
         where p.kind = 'tomorrow_delivery' and p.answer = 'delayed'
           and p.previous_date is not null
         order by p.po_id, p.recorded_at asc) d
 where d.po_id = po.id
   and po.official_delivery_date is null
   and not exists (select 1 from public.po_supplier_promises p
                    where p.po_id = po.id and p.kind = 'ready_date');

-- A reply recorded while a PO had only ever held one version was necessarily
-- about version 1. That is the ONLY link the evidence supports: a NULL-version
-- reply on a since-revised PO stays unlinked history.
update public.po_supplier_promises p
   set po_version = 1
  from public.purchase_orders po
 where po.id = p.po_id
   and p.po_version is null
   and coalesce(po.version, 1) = 1;

-- The superseded 0310 door stays sealed both ways: the 0428 trigger already
-- refuses its insert, and now nobody can call it at all.
revoke execute on function public.purchasing_record_tomorrow_delivery(text, text, date, text, text) from authenticated;

-- ── §3 · ONE arrival-planning arithmetic (declared before its callers) ──────

-- For every customer order the named PO supplies through exact recorded
-- lineage, recompute each affected (order, SKU) arrival as the LATEST
-- effective supplier date across ALL open POs still owing units for that
-- order line — never the one reply that happened to be recorded last, and
-- never from SO numbers or SKU similarity. Effective date per supplying PO:
-- line balance promise → current-version supplier reply → original PO date →
-- live planning eta. Fully received lines and closed POs drop out on their
-- own. This writes goods-arrival PLANNING; the customer promise is untouched.
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
             (select coalesce(tp.new_date, tp.about_date)
                from public.po_supplier_promises tp
               where tp.po_id = po2.id and tp.kind = 'tomorrow_delivery'
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

-- The balance door keeps its record and its gate; only its projection changes:
-- it asked `purchasing_push_supplier_date`, which found orders by SO-number
-- inference — the second arithmetic this migration retires.
create or replace function public.purchasing_record_balance_date(
  p_po_line_id uuid,
  p_new_date   date,
  p_reason     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    app_role;
  v_uid     uuid;
  v_actor   text;
  v_line    purchase_order_lines;
  v_po      purchase_orders;
  v_prev    date;
  v_sup     text;
  v_touched int := 0;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  if p_po_line_id is null or p_new_date is null then
    raise exception 'p_po_line_id and p_new_date are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_line from purchase_order_lines where id = p_po_line_id for update;
  if not found then
    raise exception 'PO line % not found', p_po_line_id
      using errcode = '42P01', detail = 'po_line_not_found';
  end if;
  if not (v_line.received_qty > 0 and v_line.received_qty < v_line.qty) then
    raise exception 'PO line % is not part-received', p_po_line_id
      using errcode = 'P0001', detail = 'line_not_part_received';
  end if;

  select * into v_po from purchase_orders where id = v_line.po_id;

  select new_date into v_prev
    from po_supplier_promises
   where po_line_id = p_po_line_id and kind = 'balance_delivery'
   order by recorded_at desc
   limit 1;

  insert into po_supplier_promises
    (po_id, po_line_id, kind, answer, about_qty, previous_date, new_date, reason, recorded_by)
  values
    (v_line.po_id, p_po_line_id, 'balance_delivery', 'balance_date',
     v_line.received_qty, v_prev, p_new_date,
     nullif(btrim(coalesce(p_reason, '')), ''), v_uid);

  v_touched := public.purchasing_project_line_etas(v_line.po_id);

  v_sup   := coalesce((select name from suppliers where id = v_po.supplier_id), 'supplier');
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_line.po_id,
          format('%s will send the balance of %s (%s of %s in) on %s%s',
                 v_sup, v_line.sku, v_line.received_qty, v_line.qty, p_new_date,
                 coalesce(' — ' || nullif(btrim(coalesce(p_reason,'')),''), '')),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — balance of %s promised %s', v_line.po_id, v_line.sku, p_new_date),
          v_line.po_id);

  return jsonb_build_object(
    'po_id',          v_line.po_id,
    'po_line_id',     p_po_line_id,
    'sku',            v_line.sku,
    'about_qty',      v_line.received_qty,
    'new_date',       p_new_date,
    'orders_touched', v_touched
  );
end;
$fn$;

-- ── §2 · the reply tells the truth: the server classifies the answer ────────

-- The stored vocabulary becomes: `confirmed` (the PO date), `earlier`,
-- `delayed` (later, with a reason), `reported` (a date on a PO whose original
-- is genuinely unknown — a pre-0428 record recovery could not prove). The
-- legacy `shipping`/`delayed` rows remain readable history; new inserts may
-- not use `shipping`.
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
  -- The classification is derived from the recorded original date; a row that
  -- claims otherwise is refused whole. A reason exists only on a delay.
  if new.answer is null or new.new_date is null
    or new.answer not in ('confirmed','earlier','delayed','reported')
    or (new.answer='reported' and v_po.official_delivery_date is not null)
    or (new.answer<>'reported' and (
          v_po.official_delivery_date is null
          or new.about_date is distinct from v_po.official_delivery_date
          or (new.answer='confirmed' and new.new_date <> v_po.official_delivery_date)
          or (new.answer='earlier'   and new.new_date >= v_po.official_delivery_date)
          or (new.answer='delayed'   and new.new_date <= v_po.official_delivery_date)))
    or (new.answer='delayed' and coalesce(new.reason,'') not in ('Production Delay','Material Shortage','Transport Delay','Waiting Customer Confirmation','Factory Closed','Other'))
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

create or replace function public.purchasing_record_supplier_reply(p_po_id text,p_reply jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_po public.purchase_orders; v_role public.app_role; v_date date; v_id uuid;
  v_previous date; v_answer text; v_reason text; v_who jsonb; v_touched int;
begin
  v_role:=public.purchasing_supplier_call_gate();
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true then
    raise exception 'Ask PO Duty to record the supplier answer.' using errcode='42501';
  end if;
  select * into v_po from public.purchase_orders where id=p_po_id for update;
  if not found then raise exception 'Purchase Order not found.' using errcode='22023',detail='po_not_found'; end if;
  -- ONE date on the wire. The old keys are read too, so an operator on the
  -- previous bundle during a deploy is not refused — but the browser's own
  -- classification is IGNORED either way: the server compares the date it was
  -- given with the recorded original and writes what actually happened.
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
  if v_answer = 'delayed' then
    if coalesce(v_reason,'') not in ('Production Delay','Material Shortage','Transport Delay','Waiting Customer Confirmation','Factory Closed','Other') then
      raise exception 'Record why the supplier moved the date.' using errcode='22023',detail='reason_required';
    end if;
  else
    v_reason := null;
  end if;
  select coalesce(new_date, about_date) into v_previous
    from public.po_supplier_promises where po_id=p_po_id and kind='tomorrow_delivery'
      and po_version=coalesce(v_po.version,1) order by recorded_at desc,id desc limit 1;
  insert into public.po_supplier_promises(po_id,kind,answer,about_date,previous_date,new_date,
    reason,remarks,recorded_by,po_version,channel,recipient,evidence,reported_by,reported_at)
    values(p_po_id,'tomorrow_delivery',v_answer,v_po.official_delivery_date,v_previous,v_date,
      v_reason,p_reply->>'remarks',auth.uid(),
      (p_reply->>'poVersion')::integer,p_reply->>'channel',btrim(p_reply->>'recipient'),
      btrim(p_reply->>'evidence'),btrim(p_reply->>'reportedBy'),(p_reply->>'reportedAt')::timestamptz)
    returning id into v_id;
  v_touched := public.purchasing_project_line_etas(p_po_id);
  insert into public.po_history(po_id,text,by_role,by_user_id)
    values(p_po_id,format('Supplier answer recorded · PO V%s · %s · %s',
      coalesce(v_po.version,1), v_date,
      case v_answer when 'confirmed' then 'confirms the PO date'
                    when 'earlier' then 'earlier than the PO date'
                    when 'delayed' then format('delayed — %s', v_reason)
                    else 'date reported' end),v_role,auth.uid());
  insert into public.audit_log(role,actor_text,action,ref)
    values(v_role,(select name from public.app_users where id=auth.uid()),'Supplier answer recorded',p_po_id);
  return jsonb_build_object('po_id',p_po_id,'reply_id',v_id,
    'answer',v_answer,'supplier_delivery_date',v_date,'orders_touched',v_touched);
end;
$fn$;
revoke all on function public.purchasing_record_supplier_reply(text,jsonb) from public,anon;
grant execute on function public.purchasing_record_supplier_reply(text,jsonb) to authenticated;

-- ── §4 · the sent document is KEPT, per version ─────────────────────────────

-- The first confirmed send of a version freezes the full document payload the
-- authority rendered at that moment. A resend of the same version reuses the
-- stored document; a revision gets its own row at its own first send. No
-- pre-0430 send is back-invented: where no document was kept, none is shown.
create table public.po_version_documents (
  po_id      text    not null references public.purchase_orders(id),
  po_version integer not null,
  document   jsonb   not null,
  created_by uuid    references public.app_users(id),
  created_at timestamptz not null default now(),
  primary key (po_id, po_version)
);
comment on table public.po_version_documents is
  '0432: the exact document payload of each PO version at its first confirmed send. Immutable; readable only through purchasing_po_version_document().';
alter table public.po_version_documents enable row level security;
revoke all on table public.po_version_documents from public, anon, authenticated;

create or replace function public.purchasing_confirm_po_sent(
  p_po_id text,
  p_expected_version integer,
  p_channel text,
  p_recipient text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_version integer;
  v_status text;
  v_recipient text := btrim(coalesce(p_recipient, ''));
  v_send_id uuid;
  v_who jsonb;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.purchasing_actor_may_issue(v_actor) then
    raise exception 'not_po_duty' using errcode = 'P0001', detail = 'not_po_duty';
  end if;
  v_who := public.purchasing_po_actor();

  if p_channel not in ('whatsapp', 'email', 'print') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;
  if v_recipient = '' then
    raise exception 'recipient_required' using errcode = '22023';
  end if;
  if p_expected_version is null then
    raise exception 'expected_version_required' using errcode = '22023';
  end if;

  select version, status::text into v_version, v_status
  from public.purchase_orders
  where id = p_po_id
  for update;

  if not found then
    raise exception 'po_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'po_not_issuable' using errcode = 'P0001';
  end if;

  if coalesce(v_version, 1) <> p_expected_version then
    raise exception 'stale_po_version: saw %, current is %', p_expected_version, coalesce(v_version, 1)
      using errcode = 'P0001', detail = 'stale_po_version';
  end if;

  -- 0430 · WHAT the supplier received, not only THAT something left. The first
  -- confirmed send of a version keeps the document authority's own payload; a
  -- resend of the same version changes nothing, so the recorded facts of a
  -- version can never drift between two sends of it.
  insert into public.po_version_documents (po_id, po_version, document, created_by)
  values (p_po_id, coalesce(v_version, 1), public.purchasing_po_document(p_po_id), v_actor)
  on conflict (po_id, po_version) do nothing;

  insert into public.po_sends (
    po_id, channel, note, sent_by, kind, recipient, po_version,
    duty_user_id, acting_user_id
  )
  values (
    p_po_id, p_channel, nullif(btrim(coalesce(p_note, '')), ''), v_actor,
    'confirmed_sent', v_recipient, coalesce(v_version, 1),
    nullif(v_who->>'normal_user_id', '')::uuid,
    nullif(v_who->>'acting_user_id', '')::uuid
  )
  returning id into v_send_id;

  insert into public.po_history (po_id, text, by_user_id)
  values (
    p_po_id,
    format('Version %s sent to %s by %s', coalesce(v_version, 1), v_recipient, p_channel),
    v_actor
  );

  return jsonb_build_object(
    'send_id', v_send_id,
    'po_id', p_po_id,
    'po_version', coalesce(v_version, 1),
    'channel', p_channel,
    'recipient', v_recipient
  );
end;
$$;

-- Reading a kept version. Same audience as the live document authority.
create or replace function public.purchasing_po_version_document(p_po_id text, p_version integer)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_doc jsonb;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can read a PO document'
      using errcode = '42501', detail = 'forbidden';
  end if;
  select document into v_doc
    from public.po_version_documents
   where po_id = p_po_id and po_version = p_version;
  if not found then
    raise exception 'No kept document for PO % version %', p_po_id, p_version
      using errcode = 'P0001', detail = 'version_document_missing';
  end if;
  return v_doc;
end;
$fn$;
revoke all on function public.purchasing_po_version_document(text, integer) from public, anon;
grant execute on function public.purchasing_po_version_document(text, integer) to authenticated;
