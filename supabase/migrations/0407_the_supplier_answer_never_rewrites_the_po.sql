-- ============================================================================
-- 0407 — the supplier answer never rewrites the official PO
--
-- `placed_at` is the PO Issued fact. `po_delivery_date` is the supplier-facing
-- date printed on the current official document. A supplier's later answer is
-- a third fact and belongs in the append-only promise ledger with evidence.
-- Legacy rows stay NULL: copying the mutable legacy `eta_date` would present a
-- planning date as an official document fact without evidence.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · the official date carried by the current PO version
-- ---------------------------------------------------------------------------
alter table public.purchase_orders
  add column if not exists po_delivery_date date;

comment on column public.purchase_orders.po_delivery_date is
  '0407: the delivery date printed on the current official PO version. Legacy rows stay NULL because eta_date may already contain a later supplier answer.';

-- Every governed PO creation door ultimately inserts `eta_date` through
-- `_operation_create_po_inner`. For NEW rows only, that reviewed input is also
-- the first official PO Delivery Date. There is deliberately no UPDATE
-- backfill: history is not reconstructed from a mutable planning field.
create or replace function public.purchasing_set_new_po_delivery_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.po_delivery_date is null then
    new.po_delivery_date := new.eta_date;
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_orders_set_new_po_delivery_date on public.purchase_orders;
create trigger purchase_orders_set_new_po_delivery_date
before insert on public.purchase_orders
for each row execute function public.purchasing_set_new_po_delivery_date();

-- ---------------------------------------------------------------------------
-- 2 · a supplier answer is an evidence record, never a PO overwrite
-- ---------------------------------------------------------------------------
alter table public.po_supplier_promises
  add column if not exists channel text;
alter table public.po_supplier_promises
  add column if not exists evidence jsonb;
alter table public.po_supplier_promises
  add column if not exists supplier_answered_at timestamptz;
alter table public.po_supplier_promises
  add column if not exists reported_by uuid references public.app_users(id) on delete set null;
alter table public.po_supplier_promises
  add column if not exists remarks text;

alter table public.po_supplier_promises
  drop constraint if exists po_supplier_promises_channel;
alter table public.po_supplier_promises
  add constraint po_supplier_promises_channel check (
    channel is null or channel in ('whatsapp', 'email', 'phone', 'in_person')
  );

alter table public.po_supplier_promises
  drop constraint if exists po_supplier_promises_evidence_shape;
alter table public.po_supplier_promises
  add constraint po_supplier_promises_evidence_shape check (
    evidence is null
    or (
      channel in ('whatsapp', 'email')
      and evidence->>'kind' = 'file'
      and nullif(btrim(evidence->>'path'), '') is not null
    )
    or (
      channel in ('phone', 'in_person')
      and evidence->>'kind' = 'note'
      and nullif(btrim(evidence->>'note'), '') is not null
    )
  );

comment on column public.po_supplier_promises.channel is
  '0407: how the supplier gave this answer. NULL only on legacy rows.';
comment on column public.po_supplier_promises.evidence is
  '0407: immutable file evidence for WhatsApp/email, or a structured note for phone/in-person. NULL only on legacy rows.';
comment on column public.po_supplier_promises.supplier_answered_at is
  '0407: when the supplier actually answered; separate from recorded_at.';
comment on column public.po_supplier_promises.reported_by is
  '0407: who heard or saw the supplier answer; separate from recorded_by, the actual Portal actor.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase-order-evidence',
  'purchase-order-evidence',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists purchase_order_evidence_internal_read on storage.objects;
drop policy if exists purchase_order_evidence_operations_insert on storage.objects;

create policy purchase_order_evidence_internal_read on storage.objects
for select to authenticated
using (
  bucket_id = 'purchase-order-evidence'
  and (select public.is_internal())
);

create policy purchase_order_evidence_operations_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'purchase-order-evidence'
  and (select public.app_role()) in ('operation', 'principal')
);

-- No UPDATE or DELETE policy: a supplier answer screenshot is evidence.

-- ---------------------------------------------------------------------------
-- 3 · every evidence door reuses the one PO authority from 0403
-- ---------------------------------------------------------------------------
-- Preserve the normal owner and dated cover as metadata. The actual actor is
-- always `sent_by`. A Superuser who helps does not become a fictional cover.
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
as $confirm_sent$
declare
  v_actor uuid := auth.uid();
  v_version integer;
  v_status text;
  v_recipient text := btrim(coalesce(p_recipient, ''));
  v_send_id uuid;
  v_who jsonb := public.purchasing_po_actor();
  v_acting uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.purchasing_actor_may_issue(v_actor) then
    raise exception 'not_po_duty' using errcode = 'P0001', detail = 'not_po_duty';
  end if;
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
  if v_status <> 'open' then
    raise exception 'po_not_issuable' using errcode = 'P0001';
  end if;
  if coalesce(v_version, 1) <> p_expected_version then
    raise exception 'stale_po_version: saw %, current is %',
      p_expected_version, coalesce(v_version, 1)
      using errcode = 'P0001', detail = 'stale_po_version';
  end if;

  v_acting := nullif(v_who->>'acting_user_id', '')::uuid;
  if v_acting is distinct from v_actor then
    v_acting := null;
  end if;

  insert into public.po_sends (
    po_id, channel, note, sent_by, kind, recipient, po_version,
    duty_user_id, acting_user_id
  ) values (
    p_po_id, p_channel, nullif(btrim(coalesce(p_note, '')), ''), v_actor,
    'confirmed_sent', v_recipient, coalesce(v_version, 1),
    nullif(v_who->>'normal_user_id', '')::uuid, v_acting
  ) returning id into v_send_id;

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
$confirm_sent$;

revoke all on function public.purchasing_confirm_po_sent(text, integer, text, text, text) from public, anon;
grant execute on function public.purchasing_confirm_po_sent(text, integer, text, text, text) to authenticated;

-- Opening a communication app is useful history, but it is neither a send nor
-- a document revision. Record the exact current version without minting a
-- po_revisions row.
create or replace function public.purchasing_record_send(
  p_po_id text,
  p_channel text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $external_open$
declare
  v_role app_role;
  v_uid uuid := auth.uid();
  v_actor text;
  v_status text;
  v_version integer;
  v_who jsonb := public.purchasing_po_actor();
  v_acting uuid;
  v_door text;
begin
  v_role := public.purchasing_supplier_call_gate();
  if not public.purchasing_actor_may_issue(v_uid) then
    raise exception 'not_po_duty'
      using errcode = 'P0001', detail = 'not_po_duty';
  end if;
  if p_channel not in ('whatsapp', 'email', 'print') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;

  select status::text, coalesce(version, 1) into v_status, v_version
    from public.purchase_orders
   where id = p_po_id
   for update;
  if not found then
    raise exception 'po_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'open' then
    raise exception 'po_not_open' using errcode = 'P0001', detail = 'po_not_open';
  end if;

  v_acting := nullif(v_who->>'acting_user_id', '')::uuid;
  if v_acting is distinct from v_uid then v_acting := null; end if;

  insert into public.po_sends (
    po_id, channel, note, sent_by, kind, po_version,
    duty_user_id, acting_user_id
  ) values (
    p_po_id, p_channel, nullif(btrim(coalesce(p_note, '')), ''), v_uid,
    'external_open', v_version,
    nullif(v_who->>'normal_user_id', '')::uuid, v_acting
  );

  v_door := case p_channel
    when 'whatsapp' then 'WhatsApp'
    when 'email' then 'Email'
    else 'PDF'
  end;
  v_actor := coalesce(
    (select name from public.app_users where id = v_uid),
    initcap(v_role::text)
  );
  insert into public.po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, format('%s opened · Version %s', v_door, v_version), v_role, v_uid);
  insert into public.audit_log (role, actor_text, action, ref)
  values (
    v_role, v_actor,
    format('PO %s — %s opened · Version %s', p_po_id, v_door, v_version),
    p_po_id
  );

  return jsonb_build_object(
    'po_id', p_po_id,
    'channel', p_channel,
    'kind', 'external_open',
    'po_version', v_version
  );
end;
$external_open$;

revoke all on function public.purchasing_record_send(text, text, text) from public, anon;
grant execute on function public.purchasing_record_send(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · the ONE supplier-answer door
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_record_supplier_answer(
  p_po_id text,
  p_answer text,
  p_po_delivery_date date,
  p_supplier_delivery_date date,
  p_channel text,
  p_evidence jsonb,
  p_supplier_answered_at timestamptz,
  p_reported_by uuid,
  p_reason text default null,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $supplier_answer$
declare
  v_role app_role;
  v_recorder uuid := auth.uid();
  v_po purchase_orders;
  v_previous date;
  v_answer text := nullif(btrim(coalesce(p_answer, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
  v_touched integer := 0;
  v_id uuid;
  v_actor text;
begin
  v_role := public.purchasing_supplier_call_gate();
  if v_recorder is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.purchasing_actor_may_issue(v_recorder) then
    raise exception 'not_po_duty'
      using errcode = 'P0001', detail = 'not_po_duty';
  end if;
  if v_answer not in ('same_as_po', 'changed_date')
     or p_po_delivery_date is null
     or p_supplier_delivery_date is null
     or p_supplier_answered_at is null
     or p_reported_by is null then
    raise exception 'supplier answer facts are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_channel not in ('whatsapp', 'email', 'phone', 'in_person') then
    raise exception 'invalid channel'
      using errcode = '22023', detail = 'invalid_channel';
  end if;
  if not exists (select 1 from public.app_users where id = p_reported_by) then
    raise exception 'reporter not found'
      using errcode = '22023', detail = 'reported_by_not_found';
  end if;
  if p_channel in ('whatsapp', 'email') and not coalesce((
    p_evidence->>'kind' = 'file'
    and nullif(btrim(p_evidence->>'path'), '') is not null
  ), false) then
    raise exception 'file evidence required'
      using errcode = '22023', detail = 'evidence_required';
  end if;
  if p_channel in ('phone', 'in_person') and not coalesce((
    p_evidence->>'kind' = 'note'
    and nullif(btrim(p_evidence->>'note'), '') is not null
  ), false) then
    raise exception 'structured note required'
      using errcode = '22023', detail = 'evidence_required';
  end if;

  select * into v_po
    from public.purchase_orders
   where id = p_po_id
   for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = 'P0002', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %, not open', p_po_id, v_po.status
      using errcode = 'P0001', detail = 'po_not_open';
  end if;
  if p_po_delivery_date is distinct from v_po.po_delivery_date then
    raise exception 'The PO Delivery Date changed. Reload the Purchase Order.'
      using errcode = '40001', detail = 'stale_po_delivery_date';
  end if;
  if p_channel in ('whatsapp', 'email')
     and (p_evidence->>'path') not like p_po_id || '/%' then
    raise exception 'Evidence must belong to this Purchase Order'
      using errcode = '22023', detail = 'invalid_evidence_path';
  end if;
  if v_po.po_delivery_date is null then
    raise exception 'PO % has no official PO Delivery Date', p_po_id
      using errcode = 'P0001', detail = 'po_delivery_date_required';
  end if;
  if not exists (
    select 1 from public.po_sends s
     where s.po_id = p_po_id
       and s.kind = 'confirmed_sent'
       and s.po_version = coalesce(v_po.version, 1)
  ) then
    raise exception 'The current PO PDF has not been sent'
      using errcode = 'P0001', detail = 'current_version_not_sent';
  end if;

  if v_answer = 'same_as_po'
     and p_supplier_delivery_date is distinct from v_po.po_delivery_date then
    raise exception 'Same as PO must match the PO Delivery Date'
      using errcode = '22023', detail = 'same_as_po_mismatch';
  end if;
  if v_answer = 'changed_date'
     and p_supplier_delivery_date is not distinct from v_po.po_delivery_date then
    raise exception 'Changed date must differ from the PO Delivery Date'
      using errcode = '22023', detail = 'changed_date_mismatch';
  end if;
  if v_answer = 'changed_date' and v_reason is null then
    raise exception 'A changed supplier date needs a reason'
      using errcode = '22023', detail = 'reason_required';
  end if;

  select coalesce(p.new_date, p.about_date) into v_previous
    from public.po_supplier_promises p
   where p.po_id = p_po_id and p.kind = 'tomorrow_delivery'
   order by p.recorded_at desc
   limit 1;

  insert into public.po_supplier_promises (
    po_id, kind, answer, about_date, previous_date, new_date, reason,
    channel, evidence, supplier_answered_at, reported_by,
    recorded_by, recorded_at, remarks
  ) values (
    p_po_id,
    'tomorrow_delivery',
    case when v_answer = 'same_as_po' then 'shipping' else 'delayed' end,
    v_po.po_delivery_date,
    coalesce(v_previous, v_po.po_delivery_date),
    p_supplier_delivery_date,
    v_reason,
    p_channel,
    p_evidence,
    p_supplier_answered_at,
    p_reported_by,
    v_recorder,
    now(),
    v_remarks
  ) returning id into v_id;

  if v_answer = 'changed_date' then
    v_touched := public.purchasing_push_supplier_date(
      p_po_id, p_supplier_delivery_date, null
    );
  end if;

  insert into public.po_history (po_id, text, by_role, by_user_id)
  values (
    p_po_id,
    case when v_answer = 'same_as_po'
      then format('Supplier confirmed the PO Delivery Date: %s', p_supplier_delivery_date)
      else format('Supplier Delivery Date recorded: %s — %s', p_supplier_delivery_date, v_reason)
    end,
    v_role,
    v_recorder
  );

  v_actor := coalesce(
    (select name from public.app_users where id = v_recorder),
    initcap(v_role::text)
  );
  insert into public.audit_log (role, actor_text, action, ref)
  values (v_role, v_actor, format('PO %s — supplier answer recorded', p_po_id), p_po_id);

  return jsonb_build_object(
    'id', v_id,
    'po_id', p_po_id,
    'answer', v_answer,
    'po_delivery_date', v_po.po_delivery_date,
    'supplier_delivery_date', p_supplier_delivery_date,
    'channel', p_channel,
    'supplier_answered_at', p_supplier_answered_at,
    'reported_by', p_reported_by,
    'recorded_by', v_recorder,
    'orders_touched', v_touched
  );
end;
$supplier_answer$;

revoke all on function public.purchasing_record_supplier_answer(
  text, text, date, date, text, jsonb, timestamptz, uuid, text, text
) from public, anon;
grant execute on function public.purchasing_record_supplier_answer(
  text, text, date, date, text, jsonb, timestamptz, uuid, text, text
) to authenticated;

comment on function public.purchasing_record_supplier_answer(
  text, text, date, date, text, jsonb, timestamptz, uuid, text, text
) is
  '0407: the ONE evidence door for the supplier delivery answer. It appends channel, evidence, reporter, recorder and both times; it never rewrites purchase_orders.';

-- 0310's supplier-call writer rewrites eta_date and has no governed evidence.
-- Keep it only as migration history; browsers must use the one door above.
revoke all on function public.purchasing_record_tomorrow_delivery(
  text, text, date, text, text
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5 · the official document reads only official facts
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_po_document(p_po_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $po_document$
declare
  v_role app_role;
  v_po purchase_orders;
  v_dest purchasing_destinations;
  v_sup suppliers;
  v_address text;
  v_sup_addr text;
  v_lines jsonb;
  v_issuer text;
  v_missing_destination_name text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can export a PO document'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from public.purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status = 'cancelled' then
    raise exception 'PO % is cancelled and cannot be exported', p_po_id
      using errcode = 'P0001', detail = 'po_not_printable';
  end if;

  select * into v_dest from public.purchasing_destinations where id = v_po.destination_id;
  select * into v_sup from public.suppliers where id = v_po.supplier_id;
  if v_dest.warehouse_id is not null then
    select address into v_address from public.warehouses where id = v_dest.warehouse_id;
  else
    v_address := v_dest.address;
  end if;
  if v_address is null or length(btrim(v_address)) = 0 then
    raise exception 'no address on file for %', v_dest.name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  select coalesce(d.name, 'the recorded Deliver To')
    into v_missing_destination_name
    from public.purchase_order_lines l
    left join public.purchasing_destinations d
      on d.id = coalesce(l.destination_id, v_po.destination_id)
    left join public.warehouses w on w.id = d.warehouse_id
   where l.po_id = p_po_id
     and nullif(btrim(case when d.warehouse_id is not null then w.address else d.address end), '') is null
   limit 1;
  if found then
    raise exception 'no address on file for %', v_missing_destination_name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  v_sup_addr := nullif(btrim(coalesce(v_sup.address, '')), '');
  select actor_text into v_issuer
    from public.audit_log
   where ref = p_po_id and action like 'Created PO %'
   order by occurred_at asc
   limit 1;

  select coalesce(jsonb_agg(x order by x->>'sku'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
        'sku', l.sku,
        'description', coalesce(ps.variant, l.sku),
        'qty', l.qty,
        'unit', 'pc',
        'destination', (
          select jsonb_build_object(
            'name', d.name,
            'address', case when d.warehouse_id is not null then w.address else d.address end
          )
          from public.purchasing_destinations d
          left join public.warehouses w on w.id = d.warehouse_id
          where d.id = coalesce(l.destination_id, v_po.destination_id)
        ),
        'attrs', (
          select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
            from jsonb_each(coalesce(l.attrs, '{}'::jsonb)) as e(k, v)
           where k in ('color', 'gap', 'fabric_name')
        ),
        'unit_codes', (
          select coalesce(jsonb_agg(si.unit_code order by si.unit_code), '[]'::jsonb)
            from public.ops_stock_items si
           where si.po_no = l.po_id and si.sku = l.sku
        ),
        'sources', (
          select coalesce(
            jsonb_agg(jsonb_build_object('so', s.so, 'qty', s.qty) order by s.so nulls last),
            '[]'::jsonb
          )
          from public.po_line_sources s
          where s.po_line_id = l.id
        )
      ) as x
      from public.purchase_order_lines l
      left join public.product_skus ps on ps.sku = l.sku
      where l.po_id = p_po_id
    ) s;

  return jsonb_build_object(
    'po_number', v_po.id,
    'po_id', v_po.id,
    'version', coalesce(v_po.version, 1),
    'issue_date', to_char(v_po.placed_at, 'YYYY-MM-DD'),
    'supplier', jsonb_build_object(
      'name', coalesce(v_sup.name, 'Supplier'),
      'address', v_sup_addr,
      'contact', v_sup.contact
    ),
    'destination', jsonb_build_object('name', v_dest.name, 'address', v_address),
    'delivery_instructions', nullif(btrim(coalesce(v_po.delivery_instructions, '')), ''),
    'eta_date',    v_po.po_delivery_date,
    'so_refs', to_jsonb(coalesce(v_po.so_refs, array[]::int[])),
    'issued_by', v_issuer,
    'lines', v_lines,
    'terms', null
  );
end;
$po_document$;

comment on function public.purchasing_po_document(text) is
  '0407: the official PO prints placed_at as PO Issued and po_delivery_date as PO Delivery Date. Supplier answers never alter it.';

revoke execute on function public.purchasing_po_document(text) from public, anon;
grant execute on function public.purchasing_po_document(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6 · an official date change mints a governed PO version
-- ---------------------------------------------------------------------------
drop function if exists public.purchasing_revise_po(text, text, jsonb);

create or replace function public.purchasing_revise_po(
  p_po_id text,
  p_reason text,
  p_po_delivery_date date,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $revise_po$
declare
  v_role app_role;
  v_uid uuid := auth.uid();
  v_actor text;
  v_reason text;
  v_po purchase_orders;
  v_el jsonb;
  v_line_id uuid;
  v_qty integer;
  v_dest uuid;
  v_has_dest boolean;
  v_line purchase_order_lines;
  v_changes text[] := '{}';
  v_updates jsonb := '[]'::jsonb;
  v_snap jsonb;
  v_last_rev integer;
  v_rev po_revisions;
  v_version integer;
  v_dest_name text;
begin
  v_role := public.purchasing_supplier_call_gate();
  if not public.purchasing_actor_may_issue(v_uid) then
    raise exception 'not_po_duty'
      using errcode = 'P0001', detail = 'not_po_duty';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A revision must say why'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_po
    from public.purchase_orders
   where id = p_po_id
   for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %, not open', p_po_id, v_po.status
      using errcode = '22023', detail = 'po_not_open';
  end if;

  if p_po_delivery_date is not null
     and p_po_delivery_date is distinct from v_po.po_delivery_date then
    v_changes := v_changes || format(
      'PO Delivery Date %s → %s',
      coalesce(v_po.po_delivery_date::text, 'Not recorded'),
      p_po_delivery_date
    );
  end if;

  -- Validate every line before writing any line. Existing goods only; adding
  -- goods remains a new PO. Received good units are the hard quantity floor.
  for v_el in select * from jsonb_array_elements(p_lines) loop
    begin
      v_line_id := (v_el ->> 'line_id')::uuid;
    exception when others then
      raise exception 'line_id must be a uuid'
        using errcode = '22023', detail = 'invalid_input';
    end;
    if v_el -> 'qty' is null or jsonb_typeof(v_el -> 'qty') <> 'number' then
      raise exception 'qty is required per line'
        using errcode = '22023', detail = 'invalid_input';
    end if;
    v_qty := (v_el ->> 'qty')::integer;

    v_has_dest := v_el ? 'destination_id';
    v_dest := null;
    if v_has_dest and jsonb_typeof(v_el -> 'destination_id') <> 'null' then
      begin
        v_dest := (v_el ->> 'destination_id')::uuid;
      exception when others then
        raise exception 'destination_id must be a uuid or null'
          using errcode = '22023', detail = 'invalid_input';
      end;
      if not exists (select 1 from public.purchasing_destinations d where d.id = v_dest) then
        raise exception 'destination % is not in the registry', v_dest
          using errcode = '22023', detail = 'invalid_input';
      end if;
    end if;

    select * into v_line
      from public.purchase_order_lines
     where id = v_line_id and po_id = p_po_id
     for update;
    if not found then
      raise exception 'PO line % is not on %', v_line_id, p_po_id
        using errcode = '22023', detail = 'po_line_not_found';
    end if;
    if v_qty is null or v_qty < 1 then
      raise exception 'qty must be at least 1'
        using errcode = '22023', detail = 'invalid_input';
    end if;
    if v_qty < v_line.received_qty then
      raise exception '% cannot go below the % already received (asked for %)',
        v_line.sku, v_line.received_qty, v_qty
        using errcode = 'P0001', detail = 'received_floor';
    end if;

    if v_qty is distinct from v_line.qty then
      v_changes := v_changes || format('%s qty %s → %s', v_line.sku, v_line.qty, v_qty);
    end if;
    if v_has_dest and v_dest is distinct from v_line.destination_id then
      v_dest_name := coalesce(
        (select d.name from public.purchasing_destinations d where d.id = v_dest),
        'PO default'
      );
      v_changes := v_changes || format('%s → %s', v_line.sku, v_dest_name);
    end if;
    v_updates := v_updates || jsonb_build_array(jsonb_build_object(
      'line_id', v_line_id,
      'qty', v_qty,
      'has_dest', v_has_dest,
      'destination_id', v_dest
    ));
  end loop;

  if coalesce(array_length(v_changes, 1), 0) = 0 then
    raise exception 'Nothing changed'
      using errcode = '22023', detail = 'nothing_changed';
  end if;

  -- Snapshot the exact prior official document before any write.
  select jsonb_build_object(
    'eta_date', v_po.eta_date,
    'po_delivery_date', v_po.po_delivery_date,
    'destination_id', v_po.destination_id,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku', l.sku,
        'qty', l.qty,
        'destination_id', l.destination_id
      ) order by l.sku, l.id)
      from public.purchase_order_lines l
      where l.po_id = p_po_id
    ), '[]'::jsonb)
  ) into v_snap;

  select coalesce(max(rev_no), 0) into v_last_rev
    from public.po_revisions
   where po_id = p_po_id;
  insert into public.po_revisions (po_id, rev_no, snapshot, reason, created_by)
  values (p_po_id, v_last_rev + 1, v_snap, v_reason, v_uid)
  returning * into v_rev;

  perform set_config('carres.po_revise', 'true', true);
  for v_el in select * from jsonb_array_elements(v_updates) loop
    if (v_el ->> 'has_dest')::boolean then
      update public.purchase_order_lines
         set qty = (v_el ->> 'qty')::integer,
             destination_id = (v_el ->> 'destination_id')::uuid
       where id = (v_el ->> 'line_id')::uuid;
    else
      update public.purchase_order_lines
         set qty = (v_el ->> 'qty')::integer
       where id = (v_el ->> 'line_id')::uuid;
    end if;
  end loop;

  v_version := coalesce(v_po.version, 1) + 1;
  update public.purchase_orders
     set po_delivery_date = coalesce(p_po_delivery_date, po_delivery_date),
         version = v_version,
         revised_at = now(),
         updated_at = now()
   where id = p_po_id;

  v_actor := coalesce(
    (select name from public.app_users where id = v_uid),
    initcap(v_role::text)
  );
  insert into public.po_history (po_id, text, by_role, by_user_id)
  values (
    p_po_id,
    format(
      'Revised to Version %s — %s — %s',
      v_version, array_to_string(v_changes, ' · '), v_reason
    ),
    v_role,
    v_uid
  );
  insert into public.audit_log (role, actor_text, action, ref)
  values (
    v_role,
    v_actor,
    format('PO %s — revised to Version %s', p_po_id, v_version),
    p_po_id
  );

  return jsonb_build_object(
    'po_id', p_po_id,
    'version', v_version,
    'rev_no', v_rev.rev_no,
    'po_delivery_date', coalesce(p_po_delivery_date, v_po.po_delivery_date),
    'changes', to_jsonb(v_changes)
  );
end;
$revise_po$;

revoke all on function public.purchasing_revise_po(text, text, date, jsonb) from public, anon;
grant execute on function public.purchasing_revise_po(text, text, date, jsonb) to authenticated, service_role;

do $$
begin
  if (
    select count(*)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'purchasing_revise_po'
  ) <> 1 then
    raise exception '0407: purchasing_revise_po must have exactly ONE signature';
  end if;
end $$;

commit;
