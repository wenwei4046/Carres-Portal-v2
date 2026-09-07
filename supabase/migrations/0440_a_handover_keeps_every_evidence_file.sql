-- 0440 — a handover act keeps EVERY evidence file (unified Warehouse
-- Inbound/Outbound card, 2026-09-07).
--
-- Until now one loading act stored exactly one proof file
-- (`delivery_handover_events.proof_path`), and the row is append-only, so a
-- second photo of the same load had nowhere to live. The operator's reality
-- is several photos and sometimes a video per load. This migration adds the
-- child ledger `delivery_handover_evidence` — one row per file, photo or
-- video, append-only, uploader and time recorded — and re-creates the ONE
-- handover door with `p_evidence jsonb`: many files per act, first file
-- mirrored into `proof_path` so every legacy reader keeps working. Saved
-- evidence cannot be edited or deleted by any client; later uploads append.
--
-- NOT APPLIED at authoring time. Verify the tracker tail before applying.

begin;
set search_path = public, pg_temp;

-- ── 1 · the evidence ledger ─────────────────────────────────────────────────
create table if not exists delivery_handover_evidence (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references delivery_handover_events(id),
  delivery_order_id uuid not null references ops_delivery_orders(id),
  path              text not null check (length(btrim(path)) > 0),
  kind              text not null check (kind in ('photo','video')),
  recorded_by       uuid not null references app_users(id),
  recorded_at       timestamptz not null default now(),
  unique (event_id, path)
);
create index if not exists delivery_handover_evidence_do
  on delivery_handover_evidence(delivery_order_id, recorded_at, id);

alter table delivery_handover_evidence enable row level security;
create policy delivery_handover_evidence_read
  on delivery_handover_evidence for select to authenticated
  using ((select public.is_internal()));
grant select on delivery_handover_evidence to authenticated;
revoke insert, update, delete on delivery_handover_evidence from authenticated, anon;

-- Append-only: the ledger can only grow, exactly like its parent events.
create or replace function public.delivery_handover_evidence_no_rewrite()
returns trigger language plpgsql as $$
begin
  raise exception 'handover evidence is append-only — corrections append, never rewrite'
    using errcode = 'P0001', detail = 'evidence_append_only';
end $$;
drop trigger if exists delivery_handover_evidence_no_rewrite on delivery_handover_evidence;
create trigger delivery_handover_evidence_no_rewrite
  before update or delete on delivery_handover_evidence
  for each row execute function public.delivery_handover_evidence_no_rewrite();

-- ── 2 · the ONE door learns the evidence list ───────────────────────────────
drop function if exists public.delivery_handover_record(uuid, text, text, text, jsonb, text, text, text[]);

create or replace function public.delivery_handover_record(
  p_do_id         uuid,
  p_kind          text,
  p_receiver_name text   default null,
  p_vehicle       text   default null,
  p_goods         jsonb  default null,
  p_note          text   default null,
  p_proof_path    text   default null,
  p_unit_codes    text[] default null,
  p_evidence      jsonb  default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role      app_role;
  v_uid       uuid;
  v_warehouse_id uuid;
  v_do        ops_delivery_orders;
  v_duty      text;
  v_company   text;
  v_counter   text;
  v_row       delivery_handover_events;
  v_line      text;
  v_items     uuid[];
  v_bad       text;
  v_party     uuid;
  v_required  int;
  v_accepted  int;
  v_n         int;
  v_evd        jsonb;
  v_first_path text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal','warehouse') then
    raise exception 'forbidden: only operation, principal or a warehouse login records a handover fact'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_kind is null or p_kind not in
     ('ready_for_handover','handed_over','received_by_logistics') then
    raise exception '% is not a handover fact this door records', coalesce(p_kind,'null')
      using errcode = '22023', detail = 'bad_kind';
  end if;
  -- Warehouse records physical Warehouse acts only — never the counterparty's
  -- receipt, never a Delivery Result (card §9).
  if v_role = 'warehouse' then
    if p_kind = 'received_by_logistics' then
      raise exception 'forbidden: logistics receipt is the receiving party''s own fact'
        using errcode = '42501', detail = 'forbidden';
    end if;
    v_warehouse_id := public.app_warehouse_id();
    if v_warehouse_id is null then
      raise exception 'forbidden: this warehouse login is not bound to a warehouse'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;
  if p_goods is not null and jsonb_typeof(p_goods) <> 'array' then
    raise exception 'goods must be a list of {sku, qty}'
      using errcode = '22023', detail = 'bad_goods';
  end if;

  -- 0440 — MANY evidence files per act, each named {path, kind}. New files
  -- append; nothing here can overwrite or drop an earlier file.
  if p_evidence is not null then
    if jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) > 20 then
      raise exception 'evidence must be a list of at most 20 files'
        using errcode = '22023', detail = 'bad_evidence';
    end if;
    for v_evd in select value from jsonb_array_elements(p_evidence) loop
      if coalesce(btrim(v_evd->>'path'),'') = ''
         or coalesce(v_evd->>'kind','') not in ('photo','video') then
        raise exception 'each evidence file names its path and its kind (photo or video)'
          using errcode = '22023', detail = 'bad_evidence';
      end if;
    end loop;
    if (select count(distinct value->>'path') from jsonb_array_elements(p_evidence))
       <> jsonb_array_length(p_evidence) then
      raise exception 'each evidence file is attached once'
        using errcode = '22023', detail = 'duplicate_evidence';
    end if;
    if jsonb_array_length(p_evidence) > 0 then
      v_first_path := btrim(p_evidence->0->>'path');
    end if;
  end if;

  select * into v_do from ops_delivery_orders where id = p_do_id for update;
  if v_do.id is null then
    raise exception 'delivery order not found'
      using errcode = '42P01', detail = 'delivery_order_not_found';
  end if;
  if v_do.voided_at is not null then
    raise exception 'this delivery order was cancelled — a cancelled document has no handover'
      using errcode = 'P0001', detail = 'delivery_order_voided';
  end if;

  -- `ready_for_handover` and `received_by_logistics` stay once-per-document.
  if p_kind <> 'handed_over' and exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = p_kind) then
    raise exception 'this fact is already recorded on % — history is never rewritten', v_do.do_number
      using errcode = 'P0001', detail = 'handover_fact_already_recorded';
  end if;
  if p_kind = 'received_by_logistics' and not exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = 'handed_over') then
    raise exception 'logistics receipt is confirmed only after a handover is recorded'
      using errcode = 'P0001', detail = 'handover_out_of_order';
  end if;

  if p_kind = 'handed_over' then
    if p_receiver_name is null or btrim(p_receiver_name) = '' then
      raise exception 'a handover names the person who actually received the goods'
        using errcode = '22023', detail = 'receiver_required';
    end if;
    if (p_proof_path is null or btrim(p_proof_path) = '') and v_first_path is null then
      raise exception 'a handover carries its proof — photos or videos of the loaded goods'
        using errcode = '22023', detail = 'proof_required';
    end if;

    -- The batch names its exact Units, and the document must carry a scope.
    select count(*) into v_required
      from delivery_order_units where delivery_order_id = p_do_id;
    if v_required = 0 then
      raise exception '% has no recorded exact-Unit scope — its scope must exist before goods leave', v_do.do_number
        using errcode = 'P0001', detail = 'exact_units_not_recorded';
    end if;
    if p_unit_codes is null or array_length(p_unit_codes, 1) is null then
      raise exception 'a handover names the exact Unit IDs it moves'
        using errcode = '22023', detail = 'units_required';
    end if;
    select count(distinct c.code) into v_n from unnest(p_unit_codes) c(code);
    if v_n <> array_length(p_unit_codes, 1) then
      raise exception 'a Unit appears twice in this batch — each Unit is accepted once'
        using errcode = 'P0001', detail = 'duplicate_unit_in_batch';
    end if;

    -- Every code is a Unit of THIS scope, at the caller's Site for a
    -- warehouse login, still with a warehouse-side holder, and not yet
    -- accepted. The Units are locked first (FOR UPDATE cannot ride an
    -- aggregate) so a concurrent batch cannot double-move them.
    perform 1
      from ops_stock_items i
      join delivery_order_units u
        on u.delivery_order_id = p_do_id and u.item_id = i.id
     where i.unit_code = any(p_unit_codes)
     for update of i;
    select array_agg(i.id) into v_items
      from unnest(p_unit_codes) c(code)
      join ops_stock_items i on i.unit_code = c.code
      join delivery_order_units u
        on u.delivery_order_id = p_do_id and u.item_id = i.id
     where v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id;
    if coalesce(array_length(v_items, 1), 0) <> array_length(p_unit_codes, 1) then
      select c.code into v_bad
        from unnest(p_unit_codes) c(code)
       where not exists (
         select 1 from ops_stock_items i
           join delivery_order_units u
             on u.delivery_order_id = p_do_id and u.item_id = i.id
          where i.unit_code = c.code
            and (v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id))
       limit 1;
      raise exception '% is not a Unit this delivery order requires at your Site', coalesce(v_bad, 'a Unit')
        using errcode = 'P0001', detail = 'unit_not_in_scope';
    end if;

    -- Already accepted for this scope? Refused, not silently reconciled —
    -- goods cannot physically leave twice.
    select i.unit_code into v_bad
      from delivery_handover_event_units eu
      join ops_stock_items i on i.id = eu.item_id
     where eu.delivery_order_id = p_do_id
       and eu.recorded_side = 'warehouse'
       and eu.item_id = any(v_items)
     limit 1;
    if v_bad is not null then
      raise exception '% was already handed over on % — a Unit is accepted once', v_bad, v_do.do_number
        using errcode = 'P0001', detail = 'unit_already_handed_over';
    end if;

    -- A Unit already with a carrier is not at the Warehouse to hand over.
    select i.unit_code into v_bad
      from ops_stock_items i
      join stock_operating_parties sop on sop.id = i.holder_party_id
     where i.id = any(v_items) and sop.kind = 'delivery_operator'
     limit 1;
    if v_bad is not null then
      raise exception '% is already with a delivery party — it is not at the Warehouse', v_bad
        using errcode = 'P0001', detail = 'unit_not_with_warehouse';
    end if;

    -- The physical checkpoint: every Unit scanned, checked and packed.
    select i.unit_code into v_bad
      from unnest(v_items) t(item_id)
      join ops_stock_items i on i.id = t.item_id
     where (select count(distinct p.fact) from delivery_unit_prep p
             where p.delivery_order_id = p_do_id and p.item_id = t.item_id
               and p.fact in ('scanned','checked','packed')) < 3
     limit 1;
    if v_bad is not null then
      raise exception '% is not ready — scan, check and pack every Unit before the handover', v_bad
        using errcode = 'P0001', detail = 'prep_incomplete';
    end if;

    -- WHO HAS IT next: the governed Delivery operating party, resolved from
    -- the document's own partner assignment — never from client text.
    select dp.operating_party_id into v_party
      from ops_delivery_arrangements a
      join delivery_partners dp on dp.id = a.partner_id
     where a.order_id = v_do.order_id and a.leg = 0;
    if v_party is null then
      raise exception 'no goods-holder identity is recorded for this delivery''s partner — assign the Logistics Partner first'
        using errcode = 'P0001', detail = 'partner_holder_not_recorded';
    end if;
  end if;

  if p_kind = 'received_by_logistics' then
    v_duty    := 'logistics';
    v_company := v_do.logistics_partner;
    v_counter := null;
  else
    v_duty    := 'warehouse';
    select w.name into v_company
      from orders o left join warehouses w on w.id = o.warehouse_id
     where o.id = v_do.order_id;
    v_counter := case when p_kind = 'handed_over' then v_do.logistics_partner end;
  end if;

  insert into delivery_handover_events
    (delivery_order_id, kind, duty, company, counterparty, receiver_name,
     vehicle, goods, note, proof_path, recorded_by)
  values
    (p_do_id, p_kind, v_duty, v_company, v_counter,
     nullif(btrim(coalesce(p_receiver_name,'')),''),
     nullif(btrim(coalesce(p_vehicle,'')),''),
     p_goods,
     nullif(btrim(coalesce(p_note,'')),''),
     nullif(btrim(coalesce(p_proof_path, v_first_path, '')),''),
     v_uid)
  returning * into v_row;

  if p_evidence is not null and jsonb_array_length(p_evidence) > 0 then
    insert into delivery_handover_evidence
      (event_id, delivery_order_id, path, kind, recorded_by)
    select v_row.id, p_do_id, btrim(e.value->>'path'), e.value->>'kind', v_uid
      from jsonb_array_elements(p_evidence) e;
  end if;

  if p_kind = 'handed_over' then
    insert into delivery_handover_event_units
      (event_id, delivery_order_id, item_id, recorded_side)
    select v_row.id, p_do_id, t.item_id, 'warehouse' from unnest(v_items) t(item_id);

    -- Only the accepted Units change WHO HAS IT — in this same transaction.
    -- 0366's lineage trigger records each holder change append-only.
    update ops_stock_items
       set holder_party_id = v_party, updated_at = now()
     where id = any(v_items);

    select count(*) into v_accepted
      from delivery_handover_event_units
     where delivery_order_id = p_do_id and recorded_side = 'warehouse';
  end if;

  -- The Logistics receipt may name ITS OWN exact Units — the counterparty's
  -- statement, preserved beside the Warehouse's, changing no holder and
  -- overwriting nothing. The unmatched IDs are the two sides' difference.
  if p_kind = 'received_by_logistics'
     and p_unit_codes is not null and array_length(p_unit_codes, 1) is not null then
    select c.code into v_bad
      from unnest(p_unit_codes) c(code)
     where not exists (
       select 1 from ops_stock_items i
         join delivery_order_units u
           on u.delivery_order_id = p_do_id and u.item_id = i.id
        where i.unit_code = c.code)
     limit 1;
    if v_bad is not null then
      raise exception '% is not a Unit this delivery order requires', v_bad
        using errcode = 'P0001', detail = 'unit_not_in_scope';
    end if;
    insert into delivery_handover_event_units
      (event_id, delivery_order_id, item_id, recorded_side)
    select v_row.id, p_do_id, i.id, 'logistics'
      from unnest(p_unit_codes) c(code)
      join ops_stock_items i on i.unit_code = c.code
    on conflict (delivery_order_id, item_id, recorded_side) do nothing;
  end if;

  v_line := case p_kind
    when 'ready_for_handover' then
      'Goods ready for handover — ' || v_do.do_number
    when 'handed_over' then
      'Handed over ' || array_length(v_items, 1) || ' of ' || v_required
        || ' Units to ' || coalesce(v_do.logistics_partner, 'logistics')
        || ' — received by ' || btrim(p_receiver_name) || ' (' || v_do.do_number || ')'
    else
      'Logistics confirmed receipt — ' || v_do.do_number || ' is out for delivery'
  end;
  insert into order_history (order_id, text, by_role)
  values (v_do.order_id, v_line, v_role);

  return to_jsonb(v_row) || jsonb_build_object(
    'acceptedUnits', coalesce(v_accepted, 0),
    'requiredUnits', coalesce(v_required, 0));
end;
$fn$;


comment on function public.delivery_handover_record(uuid, text, text, text, jsonb, text, text, text[], jsonb) is
  '0440 — the ONE handover door. As 0424, plus p_evidence: many photo/video files per act, appended to delivery_handover_evidence; the first file also fills proof_path for legacy readers. A handed_over still requires receiver + at least one proof file.';

-- ── 3 · sanity — shape only, never a production row count ───────────────────
do $sanity$
declare
  v int;
begin
  select count(*) into v from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'delivery_handover_evidence'
     and grantee in ('authenticated','anon')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v is distinct from 0 then
    raise exception '0440 sanity: % write grant(s) survive on delivery_handover_evidence', v;
  end if;
  select count(*) into v from pg_proc where proname = 'delivery_handover_record';
  if v is distinct from 1 then
    raise exception '0440 sanity: expected exactly one delivery_handover_record, found %', v;
  end if;
end $sanity$;

commit;
