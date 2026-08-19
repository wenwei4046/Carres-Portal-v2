-- =============================================================================
-- 0363_the_warehouse_hands_over_and_logistics_receives.sql
-- WAREHOUSE → LOGISTICS HANDOVER — slice 1 · the facts that light `Out for
-- delivery` (owner-approved chain, docs/delivery/MASTER.md §4, 2026-08-14;
-- card docs/cards/CARD-2026-08-19-warehouse-handover-chain.md).
--
-- THE LAW THIS RECORDS (§4, verbatim boundaries):
--
--   Ready for Handover  →  Handed Over  →  Received by Logistics
--
--   · Ready for Handover is NOT handover.
--   · Handed Over is NOT Logistics receipt — it records goods/quantity, both
--     parties, the actual receiver, time, vehicle when known, and proof.
--   · Received by Logistics is NOT delivery.
--   · A discrepancy never overwrites either party's original fact: the receipt
--     event carries the receiver's OWN goods count beside the handover's.
--
-- Each fact is an append-only event on the DELIVERY ORDER (0356) recording
-- person, company and ACTIVE DUTY (Warehouse Work vs Logistics Work — one
-- personal login may hold both; no shared company login). No duty roster
-- exists yet, so the duty word is stamped by the act itself, exactly as the
-- blueprint card records the duty word elsewhere.
--
-- WHAT THE FACTS UNLOCK. `deliveryOrderStatusOf` (the ONE arithmetic,
-- packages/shared) gains its missing input: a DO whose goods are Received by
-- Logistics and not yet resulted derives `Out for delivery`. NOTHING IS
-- STORED AS A STATUS — this table stores observations; the arithmetic stays
-- the only status writer-of-answers (Architecture Law D).
--
-- History is append-only (0344's discipline): no UPDATE, no DELETE, ever —
-- enforced at the destination, not inside one RPC. One event kind per
-- document: a rebooked trip is a NEW DO, so the chain never restarts on the
-- same number. Corrections are a later slice's append-only Correction (§6);
-- silently editable history cannot be un-shipped.
-- =============================================================================

-- ── 1 · the events ───────────────────────────────────────────────────────────
create table if not exists public.delivery_handover_events (
  id                uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references public.ops_delivery_orders(id) on delete restrict,
  kind              text not null check (kind in
                      ('ready_for_handover','handed_over','received_by_logistics')),
  -- The ACTIVE DUTY of the person recording — the §4 word, never a roster
  -- lookup (no roster exists yet). Warehouse acts carry 'warehouse';
  -- the Logistics receipt carries 'logistics'.
  duty              text not null check (duty in ('warehouse','logistics')),
  -- The business identity acting (NETS Warehouse ≠ NETS Logistics even when
  -- one legal company supplies both). NULL when the portal does not know it —
  -- a company nobody recorded is not invented.
  company           text,
  -- Handed Over only: the receiving business identity and the actual receiver.
  counterparty      text,
  receiver_name     text,
  vehicle           text,
  -- What THIS party says physically moved: [{sku, qty}]. The handover records
  -- the warehouse's count; the receipt records logistics' own — a discrepancy
  -- keeps both facts visible and overwrites neither.
  goods             jsonb check (goods is null or jsonb_typeof(goods) = 'array'),
  note              text,
  -- Proof bound to the exact event it proves (§6 law): an object key in the
  -- private proof-of-delivery bucket under handover/{delivery_order_id}/.
  proof_path        text,
  recorded_by       uuid not null references auth.users(id),
  recorded_at       timestamptz not null default now(),
  -- One chain pass per document (a rebooked trip is a NEW DO).
  unique (delivery_order_id, kind)
);

create index if not exists delivery_handover_events_do_idx
  on public.delivery_handover_events (delivery_order_id);

comment on table public.delivery_handover_events is
  'Warehouse→Logistics handover chain on one DO (delivery MASTER §4, 0363): ready_for_handover → handed_over → received_by_logistics. Append-only observations — person + company + active duty + time + proof; status is DERIVED by deliveryOrderStatusOf, never stored.';
comment on column public.delivery_handover_events.goods is
  'What THIS party says moved: [{sku, qty}]. Receipt with a different count is a discrepancy — both facts stay, neither is overwritten.';

alter table public.delivery_handover_events enable row level security;

drop policy if exists delivery_handover_events_read_internal
  on public.delivery_handover_events;
create policy delivery_handover_events_read_internal
  on public.delivery_handover_events
  for select using ((select public.is_internal()));

-- No write policies and no write grants: the ONE door below is the only writer.
revoke insert, update, delete on public.delivery_handover_events
  from authenticated, anon;

-- Append-only, enforced at the destination (0299's lesson).
create or replace function public.delivery_handover_events_append_only()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'a handover fact is history — it is never edited or deleted'
    using errcode = 'P0001', detail = 'handover_event_append_only';
end;
$fn$;

drop trigger if exists delivery_handover_events_no_rewrite
  on public.delivery_handover_events;
create trigger delivery_handover_events_no_rewrite
  before update or delete on public.delivery_handover_events
  for each row execute function public.delivery_handover_events_append_only();

-- ── 2 · the ONE door ─────────────────────────────────────────────────────────
-- Records one fact in the chain, in order, on a live document. The duty word
-- and both companies are stamped server-side from the act and the document —
-- never trusted from the client.
create or replace function public.delivery_handover_record(
  p_do_id         uuid,
  p_kind          text,
  p_receiver_name text  default null,
  p_vehicle       text  default null,
  p_goods         jsonb default null,
  p_note          text  default null,
  p_proof_path    text  default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role      app_role;
  v_uid       uuid;
  v_do        ops_delivery_orders;
  v_duty      text;
  v_company   text;
  v_counter   text;
  v_row       delivery_handover_events;
  v_line      text;
begin
  -- Warehouse staff work under operation logins today (0344's precedent);
  -- principal is the go-live fallback.
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal records a handover fact'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_kind is null or p_kind not in
     ('ready_for_handover','handed_over','received_by_logistics') then
    raise exception '% is not a handover fact this door records', coalesce(p_kind,'null')
      using errcode = '22023', detail = 'bad_kind';
  end if;
  if p_goods is not null and jsonb_typeof(p_goods) <> 'array' then
    raise exception 'goods must be a list of {sku, qty}'
      using errcode = '22023', detail = 'bad_goods';
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

  -- The chain is ORDERED (§4): each fact requires the one before it, and a
  -- fact is recorded once — a rebooked trip is a NEW document.
  if exists (select 1 from delivery_handover_events
              where delivery_order_id = p_do_id and kind = p_kind) then
    raise exception 'this fact is already recorded on % — history is never rewritten', v_do.do_number
      using errcode = 'P0001', detail = 'handover_fact_already_recorded';
  end if;
  if p_kind = 'handed_over' and not exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = 'ready_for_handover') then
    raise exception 'goods are handed over only after Ready for handover is recorded'
      using errcode = 'P0001', detail = 'handover_out_of_order';
  end if;
  if p_kind = 'received_by_logistics' and not exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = 'handed_over') then
    raise exception 'logistics receipt is confirmed only after the handover is recorded'
      using errcode = 'P0001', detail = 'handover_out_of_order';
  end if;

  -- Handed Over records both parties, the actual receiver and proof (§4 —
  -- "signature/photo/reply proof"; a handover without proof is not recorded).
  if p_kind = 'handed_over' then
    if p_receiver_name is null or btrim(p_receiver_name) = '' then
      raise exception 'a handover names the person who actually received the goods'
        using errcode = '22023', detail = 'receiver_required';
    end if;
    if p_proof_path is null or btrim(p_proof_path) = '' then
      raise exception 'a handover carries its proof — signature, photo or reply'
        using errcode = '22023', detail = 'proof_required';
    end if;
  end if;

  -- The duty word is the act's own (§4; no roster exists yet), and the company
  -- is the document's — never the client's word.
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
     nullif(btrim(coalesce(p_proof_path,'')),''),
     v_uid)
  returning * into v_row;

  -- The Sales Order route's History reads order_history — the business fact,
  -- in business words (never a system step).
  v_line := case p_kind
    when 'ready_for_handover' then
      'Goods ready for handover — ' || v_do.do_number
    when 'handed_over' then
      'Goods handed over to ' || coalesce(v_do.logistics_partner, 'logistics')
        || ' — received by ' || btrim(p_receiver_name) || ' (' || v_do.do_number || ')'
    else
      'Logistics confirmed receipt — ' || v_do.do_number || ' is out for delivery'
  end;
  insert into order_history (order_id, text, by_role)
  values (v_do.order_id, v_line, v_role);

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.delivery_handover_record(uuid, text, text, text, jsonb, text, text) is
  'The ONE door for the §4 handover chain (0363): ordered, once per fact, live documents only. Handed Over requires the actual receiver + proof. Duty and companies are stamped server-side; every fact also lands on order_history in business words.';
