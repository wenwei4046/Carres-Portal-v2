-- 0306_purchasing_supplier_calls.sql
--
-- P3 · The two supplier calls the portal has never had
--   `Call {supplier} — confirm tomorrow's delivery`   (counted per PO)
--   `Call {supplier} — confirm balance delivery date` (counted per PO line)
--
-- The flow is `docs/PURCHASING-WORKING-FLOW.md` §3; the five strings for each
-- are already locked in `docs/COPY-STANDARD.md`. This migration invents no word
-- and no second delay model.
--
-- Live today: 0 purchase_orders, 0 purchase_order_lines, 0 claims. Nothing can
-- reach either action until a real PO exists — P3 decides the behaviour before
-- the first one appears, exactly as C7, C8 and C9 did. **NO BACKFILL**: every
-- row in the database is test data and go-live starts clean.
--
-- ── The PM decision this migration carries (Loo, 2026-07-29) ─────────────────
--
-- A new BALANCE delivery date enters Delay planning exactly as a delayed
-- tomorrow's-delivery answer does. The portal must surface every known risk to
-- the customer delivery window, and the existing delay model is the one that
-- evaluates it — `ops_order_control.line_etas` → C8's ladder → 0305's clock.
--
-- ACCEPTED TEMPORARY LIMITATION, recorded rather than worked around: a PO line
-- MERGES several customers' quantities (§3 — "ten customers' bed frames from
-- Ohana is one PO") and nothing in the data says whose units are the short
-- ones. So a balance date lands on EVERY customer order the PO covers, and on a
-- merged PO some of those are false positives. That is an ALLOCATION gap and it
-- belongs to **P5**, not here. It is also consistent with what the engine
-- already believes: 0299's receive RPC advances a customer thread only when
-- `bool_and(received_qty >= qty)`, so a short PO line already leaves every
-- linked customer waiting.

set search_path = public;

-- ── 1 · the promise ledger — the answer AND the history, one table ───────────
--
-- APPEND-ONLY on purpose. §3: "Every promise is kept, not overwritten … a
-- single 'latest date' column can never answer *how often does this supplier
-- move the date* — and that question is the whole point of R5's scorecard."
-- A table with no updatable date has no way to lose one, so "kept as history"
-- is structural rather than a habit. The CURRENT answer is the latest row.
--
-- `about_date` / `about_qty` are S4's discipline, the one C8 made load-bearing:
-- AN EVENT NAMES THE THING IT WAS MADE ABOUT. An answer given about the 3rd is
-- not an answer about the 9th, so when the factory moves again the latest row
-- stops matching and the call re-opens by itself. Without it, one phone call
-- would silence every future call on that PO — `ops_order_control.balance`'s
-- disease with a supplier's name on it.
create table if not exists public.po_supplier_promises (
  id            uuid primary key default gen_random_uuid(),
  po_id         text not null references public.purchase_orders(id) on delete cascade,
  -- NULL = a PO-level answer (`Confirm tomorrow's delivery`, counted per PO).
  -- SET  = a per-line answer (`Confirm balance delivery date`, per PO line).
  po_line_id    uuid references public.purchase_order_lines(id) on delete cascade,
  kind          text not null check (kind in ('tomorrow_delivery','balance_delivery')),
  answer        text not null check (answer in ('shipping','delayed','balance_date')),
  -- what the answer was ABOUT
  about_date    date,          -- tomorrow_delivery: the expected arrival asked about
  about_qty     int,           -- balance_delivery: received_qty at the time
  previous_date date,          -- the date we held before this answer
  new_date      date,          -- the date the supplier now promises
  reason        text,
  recorded_by   uuid references public.app_users(id) on delete set null,
  recorded_at   timestamptz not null default now(),

  -- Each kind may only carry its own answers. A third value cannot be invented
  -- by a client, because the engine has no branch for one (0304's rule).
  constraint po_promise_kind_answer check (
    (kind = 'tomorrow_delivery' and answer in ('shipping','delayed')) or
    (kind = 'balance_delivery'  and answer = 'balance_date')
  ),
  -- A PO-level answer names a PO date and no line; a line answer names a line
  -- and the quantity it was about.
  constraint po_promise_scope check (
    (kind = 'tomorrow_delivery' and po_line_id is null
       and about_date is not null and about_qty is null) or
    (kind = 'balance_delivery'  and po_line_id is not null
       and about_qty  is not null)
  ),
  -- "delayed" and "the balance ships on …" are both worthless without the date:
  -- half a record is worse than none.
  constraint po_promise_new_date_required check (
    (answer = 'shipping') or (new_date is not null)
  )
);

create index if not exists po_promises_po_idx
  on public.po_supplier_promises (po_id, recorded_at desc);
create index if not exists po_promises_line_idx
  on public.po_supplier_promises (po_line_id, recorded_at desc);

comment on table public.po_supplier_promises is
  'P3 (0306): every answer a supplier gave about a delivery date, append-only. The CURRENT answer is the latest row; there is no column to overwrite, which is how PURCHASING-WORKING-FLOW §3''s "every promise is kept" is structural rather than a habit. about_date / about_qty name what the answer was made ABOUT, so a factory that moves again re-opens the call (C8''s delay_decision_eta, one module over). Written ONLY by purchasing_record_tomorrow_delivery / purchasing_record_balance_date — no write policy exists.';

alter table public.po_supplier_promises enable row level security;

-- Read = internal. NO insert/update/delete policy, on purpose: every write goes
-- through a SECURITY DEFINER RPC, so there is no PostgREST door that can file
-- or edit a supplier promise by hand (0288's pattern, and P1's).
drop policy if exists po_promises_read_internal on public.po_supplier_promises;
create policy po_promises_read_internal on public.po_supplier_promises
  for select to authenticated
  using ( (select public.is_internal()) );

grant select on public.po_supplier_promises to authenticated;
-- Both directions, per the guardrail: `revoke … from public` alone does NOT
-- drop `anon` on Supabase, and `from anon` alone leaves `public` in place.
revoke insert, update, delete on public.po_supplier_promises from public;
revoke insert, update, delete on public.po_supplier_promises from anon;
revoke insert, update, delete on public.po_supplier_promises from authenticated;

-- ── 2 · the day a line went short — the Due that had nowhere to live ─────────
--
-- §3's balance call is due "the working day after the short delivery" and
-- NOTHING stored that day: 0299's operation_receive_po_with_do writes
-- received_qty and never writes po_receipts (measured 2026-07-28: zero
-- references in that migration). A Due that cannot be computed is one of Law
-- 2's six things missing, and Law 2 says do not build it.
--
-- A TRIGGER rather than route code, which is 0305's own discipline:
-- `received_qty` has three doors (0299's RPC, 0076's legacy
-- logistics_receive_po_with_do, any internal PostgREST update) and a stamp one
-- route writes is a stamp the other two walk around. It also makes the day
-- SERVER-OWNED, so nobody can move their own deadline.
alter table public.purchase_order_lines
  add column if not exists short_since date;

comment on column public.purchase_order_lines.short_since is
  'P3 (0306): the MYT business day this line last took a SHORT delivery — some good units in, the supplier still owes the rest. Server-owned (trigger trg_po_line_short_since), so it holds against every door that writes received_qty. NULL once nothing is outstanding: a shortfall that does not exist has no start. No backfill — nothing can be stamped for a delivery nobody recorded (S5''s refusal of closed_at).';

create or replace function public.trg_stamp_po_line_short_since()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- A SHORT delivery: good units arrived on this pass AND the supplier still
  -- owes the rest. `coalesce(old.…, 0)` makes INSERT and UPDATE one rule.
  if new.received_qty > coalesce(old.received_qty, 0)
     and new.received_qty > 0
     and new.received_qty < new.qty then
    new.short_since := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  elsif new.received_qty >= new.qty then
    -- Nothing outstanding: the shortfall does not exist, so neither does its
    -- start. Same shape as 0305 clearing the delay pair when the overshoot goes.
    new.short_since := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_po_line_short_since on public.purchase_order_lines;
create trigger trg_po_line_short_since
before insert or update on public.purchase_order_lines
for each row execute function public.trg_stamp_po_line_short_since();

-- ── 3 · the gate ─────────────────────────────────────────────────────────────
--
-- operation + principal — the same gate as the route and as the claim desk.
-- NOT is_internal(): that admits finance and bd, and neither makes a supplier
-- call. 0266's lesson is written into the shape — a NULL role must fail CLOSED,
-- because `NULL not in (…)` is NULL and an IF on NULL never fires.
create or replace function public.purchasing_supplier_call_gate()
returns app_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v_role app_role;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can record a supplier answer'
      using errcode = '42501', detail = 'forbidden';
  end if;
  return v_role;
end;
$fn$;

-- ── 4 · a recorded supplier date reaches the store the LADDER reads ──────────
--
-- `ops_order_control.line_etas`, keyed by the exact order_lines.sku — the ONE
-- store `stockEtaOf` reads (apps/web OperationOrdersControl → shared
-- order-actions). Writing it is what makes §3's "when the answer is delayed,
-- the portal opens Delay planning" true WITHOUT a second delay model: C8's
-- goodsAction opens Delay planning by itself, and 0305's BEFORE trigger stamps
-- the delay clock on the way in.
--
-- This does NOT rule on the stock_eta-vs-line_etas question (Loo 2026-07-28:
-- settle the ETA model after P5). It writes the store the LADDER reads, which
-- is the same decision 0305's trigger took.
--
-- `p_sku` NULL = every SKU the PO still owes (the whole delivery moved).
-- `p_sku` set  = that line only (a balance date is about ONE line, and pushing
--                it onto the PO's other outstanding lines would re-date
--                promises the supplier never moved).
create or replace function public.purchasing_push_supplier_date(
  p_po_id    text,
  p_new_date date,
  p_sku      text default null
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_po      purchase_orders;
  v_sos     int[];
  v_order   record;
  v_patch   jsonb;
  v_touched int := 0;
begin
  if p_new_date is null then return 0; end if;
  select * into v_po from purchase_orders where id = p_po_id;
  if not found then return 0; end if;

  v_sos := array_remove(
             array_cat(array[v_po.so], coalesce(v_po.so_refs, array[]::int[])),
             null);
  if v_sos is null or coalesce(array_length(v_sos, 1), 0) = 0 then return 0; end if;

  for v_order in select o.id from orders o where o.so = any(v_sos) loop
    -- Only the SKUs this PO still owes, and only where the order really carries
    -- that line: line_etas is keyed by the exact order_lines.sku, which is what
    -- the ladder reads. A key nothing matches would be a date about nothing.
    select jsonb_object_agg(t.sku, to_jsonb(p_new_date::text))
      into v_patch
      from (
        select distinct pol.sku
          from purchase_order_lines pol
         where pol.po_id = p_po_id
           and pol.received_qty < pol.qty
           and (p_sku is null or pol.sku = p_sku)
           and exists (select 1 from order_lines ol
                        where ol.order_id = v_order.id and ol.sku = pol.sku)
      ) t;
    if v_patch is null then continue; end if;

    insert into ops_order_control (order_id, line_etas, updated_at)
    values (v_order.id, v_patch, now())
    on conflict (order_id) do update
      set line_etas  = coalesce(ops_order_control.line_etas, '{}'::jsonb) || v_patch,
          updated_at = now();
    v_touched := v_touched + 1;
  end loop;

  return v_touched;
end;
$fn$;

-- ── 5 · `Confirm tomorrow's delivery` — the answer ───────────────────────────
create or replace function public.purchasing_record_tomorrow_delivery(
  p_po_id    text,
  p_answer   text,
  p_new_date date default null,
  p_reason   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    app_role;
  v_uid     uuid;
  v_actor   text;
  v_po      purchase_orders;
  v_answer  text;
  v_about   date;
  v_touched int := 0;
  v_sup     text;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  v_answer := nullif(btrim(coalesce(p_answer, '')), '');
  if p_po_id is null or v_answer is null or v_answer not in ('shipping','delayed') then
    raise exception 'p_po_id and p_answer (shipping|delayed) are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if v_answer = 'delayed' and p_new_date is null then
    raise exception 'a delayed answer must carry the new date'
      using errcode = '22023', detail = 'new_date_required';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %', p_po_id, v_po.status
      using errcode = 'P0001', detail = 'po_not_open';
  end if;

  -- The date this call was ABOUT. No expected arrival = the call could never
  -- have appeared, so there is nothing to answer.
  v_about := v_po.eta_date;
  if v_about is null then
    raise exception 'PO % has no expected arrival date to confirm', p_po_id
      using errcode = 'P0001', detail = 'no_expected_arrival';
  end if;

  insert into po_supplier_promises
    (po_id, kind, answer, about_date, previous_date, new_date, reason, recorded_by)
  values
    (p_po_id, 'tomorrow_delivery', v_answer, v_about, v_about,
     case when v_answer = 'delayed' then p_new_date else null end,
     nullif(btrim(coalesce(p_reason, '')), ''), v_uid);

  if v_answer = 'delayed' then
    -- The expected arrival IS the thing that moved. Moving it re-opens the call
    -- under the new date by itself, which is the loop §3 describes.
    update purchase_orders
       set eta_date = p_new_date, updated_at = now()
     where id = p_po_id;
    v_touched := public.purchasing_push_supplier_date(p_po_id, p_new_date, null);
  end if;

  v_sup   := coalesce((select name from suppliers where id = v_po.supplier_id), 'supplier');
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (p_po_id,
          case when v_answer = 'shipping'
               then format('%s confirmed the delivery for %s', v_sup, v_about)
               else format('%s moved the delivery from %s to %s%s',
                           v_sup, v_about, p_new_date,
                           coalesce(' — ' || nullif(btrim(coalesce(p_reason,'')),''), ''))
          end,
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — tomorrow''s delivery: %s', p_po_id, v_answer), p_po_id);

  return jsonb_build_object(
    'po_id',          p_po_id,
    'answer',         v_answer,
    'about_date',     v_about,
    'new_date',       p_new_date,
    'orders_touched', v_touched
  );
end;
$fn$;

-- ── 6 · `Confirm balance delivery date` — the answer ─────────────────────────
--
-- PM decision A (Loo, 2026-07-29): the balance date ALSO reaches the ladder, so
-- a balance that lands after the customer's promised date opens Delay planning
-- by itself. Same engine, same clock, no second delay model.
--
-- It pushes ONLY this line's SKU. `purchase_orders.eta_date` is about the whole
-- PO and this promise is about ONE line, so moving the PO's own date here would
-- re-date the other lines' call — which is why the push is SKU-scoped and the
-- PO header is left alone.
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
  -- §9: part-received means SOME good units in and some still owed. A line with
  -- nothing in has no balance yet; a full line has no balance left.
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

  v_touched := public.purchasing_push_supplier_date(v_line.po_id, p_new_date, v_line.sku);

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

-- The push helper is INTERNAL: it is the two RPCs' own step, never a door of
-- its own. Granting it would let a client re-date a customer's goods without
-- recording who promised what.
revoke execute on function public.purchasing_push_supplier_date(text, date, text) from public;
revoke execute on function public.purchasing_push_supplier_date(text, date, text) from anon;
revoke execute on function public.purchasing_push_supplier_date(text, date, text) from authenticated;

revoke execute on function public.purchasing_record_tomorrow_delivery(text, text, date, text) from public;
revoke execute on function public.purchasing_record_tomorrow_delivery(text, text, date, text) from anon;
revoke execute on function public.purchasing_record_balance_date(uuid, date, text) from public;
revoke execute on function public.purchasing_record_balance_date(uuid, date, text) from anon;

grant execute on function public.purchasing_record_tomorrow_delivery(text, text, date, text) to authenticated;
grant execute on function public.purchasing_record_balance_date(uuid, date, text) to authenticated;

-- ── 7 · sanity — the migration checks itself ─────────────────────────────────
do $$
declare n int;
begin
  -- no write door on the ledger
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'po_supplier_promises' and cmd <> 'SELECT';
  if n <> 0 then raise exception 'sanity: po_supplier_promises has a non-SELECT policy'; end if;

  -- exactly one signature each (guardrail #8: a defaulted param must not leave
  -- a second overload behind)
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'purchasing_record_tomorrow_delivery';
  if n <> 1 then raise exception 'sanity: % signatures of purchasing_record_tomorrow_delivery', n; end if;
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'purchasing_record_balance_date';
  if n <> 1 then raise exception 'sanity: % signatures of purchasing_record_balance_date', n; end if;
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'purchasing_push_supplier_date';
  if n <> 1 then raise exception 'sanity: % signatures of purchasing_push_supplier_date', n; end if;

  -- both directions of the grant — a revoke alone proves nothing
  if has_function_privilege('anon',
       'public.purchasing_record_tomorrow_delivery(text, text, date, text)', 'execute')
  then raise exception 'sanity: anon can execute purchasing_record_tomorrow_delivery'; end if;
  if has_function_privilege('authenticated',
       'public.purchasing_push_supplier_date(text, date, text)', 'execute')
  then raise exception 'sanity: authenticated can execute the internal push helper'; end if;
  if not has_function_privilege('authenticated',
       'public.purchasing_record_balance_date(uuid, date, text)', 'execute')
  then raise exception 'sanity: authenticated cannot execute purchasing_record_balance_date'; end if;
  if not has_function_privilege('authenticated',
       'public.purchasing_record_tomorrow_delivery(text, text, date, text)', 'execute')
  then raise exception 'sanity: authenticated cannot execute purchasing_record_tomorrow_delivery'; end if;

  -- the stamp is a trigger, so it holds against every door that writes received_qty
  select count(*) into n from pg_trigger
   where tgname = 'trg_po_line_short_since' and not tgisinternal;
  if n <> 1 then raise exception 'sanity: short_since trigger missing'; end if;

  -- P3 adds NO second delay model
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'po_supplier_promises'
     and column_name like 'delay%';
  if n <> 0 then raise exception 'sanity: a delay column appeared on the promise ledger'; end if;
end $$;
