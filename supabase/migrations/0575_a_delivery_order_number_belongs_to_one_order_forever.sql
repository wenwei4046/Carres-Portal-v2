-- =============================================================================
-- 0575_a_delivery_order_number_belongs_to_one_order_forever.sql
-- Delivery MASTER §3.1 · owner ruling 2026-09-23 (Jess) — the DO number.
--
-- WHAT WAS WRONG, MEASURED on origin/main 855c305c4
--   · The API minted `DO-DDMMYY-NNNN` with the tail = FNV(order id) mod 10^4
--     (apps/api/src/lib/delivery-order-issue.ts:154/:332) and checked for a
--     clash only among the SAME order's documents. Two different orders issued
--     on one day could therefore produce the same number.
--   · The one materialiser (0356:120-122) then did
--         if exists (... do_number = new.do_number) then return new;
--     — a SILENT SKIP: the second order wore the first order's number on
--     `orders.do_number` and had NO `ops_delivery_orders` row of its own. The
--     tail is deterministic, so every retry that day failed the same way.
--
-- WHAT THIS CHANGES
--   A. ONE allocator for the Delivery Order number, with its OWN pool
--      (`delivery_document_numbers`). It is deliberately separate from 0381's
--      `formal_document_codes`: DO and SDO never share a pool with any other
--      document. The approved form:
--          Outright      DO  + YYMM of issue (Malaysia) + '-' + 4 random digits
--          Subscription  SDO + YYMM of issue (Malaysia) + '-' + 5 random digits
--      Subscription = the order's `source_system = 'rental'` (0275 stamps it).
--      Fixed width, never widened. Drawn at random, independent of the SO
--      number. A clash is REDRAWN inside the allocator. A drawn number is kept
--      in the pool forever, so it is never handed out again — not even after
--      its document is voided. When a month's pool is exhausted the draw
--      REFUSES (`delivery_order_numbers_used_up`); it never widens itself.
--   B. The materialiser REFUSES a number another order already owns (23505,
--      `delivery_order_number_taken`) instead of skipping it. The same order
--      re-stating its own number (the leg/trip doors mirror their row onto the
--      order) is still the quiet no-op it always was.
--   C. The legacy dispatch backstop (0476 `orders_auto_issue_on_dispatched`),
--      which invented `'DO-' || lpad(so, 6, '0')` for a dispatched order that
--      had no document, now draws from the same allocator. The rewrite is
--      GUARDED: it edits exactly that one line of the live body and raises if
--      the line is not there, so it cannot overwrite a body it did not expect.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   · Old `DO-DDMMYY-NNNN` numbers are test data (clean start): no row is
--     renumbered, and every reader keeps accepting them.
--   · No gate changes: the money gate (0362/0561 `ops_delivery_orders_money_gate`),
--     the issue gates in the API and the exact-Unit freeze are untouched.
--   · `formal_document_codes` / `allocate_formal_document_code` are untouched.
--
-- RLS: the new table `delivery_document_numbers` has RLS ENABLED and NO policy,
--   and every table privilege is revoked from anon/authenticated — nobody reads
--   or writes it directly; only the SECURITY DEFINER allocator touches it. No
--   existing policy changes.
-- NO ROW COUNT IS ASSERTED (CLAUDE.md §5.8).
-- =============================================================================

-- ── A. the pool ──────────────────────────────────────────────────────────────

create table if not exists public.delivery_document_numbers (
  do_number text primary key,
  series    text not null check (series in ('DO', 'SDO')),
  period    text not null check (period ~ '^[0-9]{4}$'),
  order_id  uuid not null references public.orders(id) on delete restrict,
  drawn_at  timestamptz not null default now(),
  drawn_by  uuid,
  constraint delivery_document_numbers_shape check (
    (series = 'DO'  and do_number ~ '^DO[0-9]{4}-[0-9]{4}$') or
    (series = 'SDO' and do_number ~ '^SDO[0-9]{4}-[0-9]{5}$')
  ),
  constraint delivery_document_numbers_period
    check (substr(do_number, length(series) + 1, 4) = period)
);

comment on table public.delivery_document_numbers is
  'Every Delivery Order number ever drawn (0575). A number here is never handed out again, even when its document is voided. Written only by _delivery_document_number_draw.';

create index if not exists delivery_document_numbers_order_idx
  on public.delivery_document_numbers (order_id);

alter table public.delivery_document_numbers enable row level security;
revoke all on public.delivery_document_numbers from public, anon, authenticated;

-- The draw itself. No caller gate: it is not executable by any client role;
-- the gated door below and the dispatch backstop call it.
create or replace function public._delivery_document_number_draw(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_source text;
  v_series text;
  v_width  int;
  v_period text;
  v_number text;
  v_try    int;
begin
  select o.source_system into v_source from orders o where o.id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = 'P0002', detail = 'order_not_found';
  end if;

  -- The business decides the prefix and the width (owner ruling 2026-09-23).
  if v_source is not distinct from 'rental' then
    v_series := 'SDO'; v_width := 5;
  else
    v_series := 'DO';  v_width := 4;
  end if;
  v_period := to_char(timezone('Asia/Kuala_Lumpur', now()), 'YYMM');

  for v_try in 1 .. 500 loop
    v_number := v_series || v_period || '-'
             || lpad(floor(random() * power(10, v_width))::bigint::text, v_width, '0');
    -- A document row that already wears it (belt and braces: every document
    -- number drawn here is also in the pool, so this only guards hand-made rows).
    continue when exists (select 1 from ops_delivery_orders d where upper(d.do_number) = v_number);
    insert into delivery_document_numbers (do_number, series, period, order_id, drawn_by)
    values (v_number, v_series, v_period, p_order_id, auth.uid())
    on conflict (do_number) do nothing;
    if found then
      return v_number;
    end if;
  end loop;

  raise exception 'the % delivery order numbers for % are used up', v_series, v_period
    using errcode = 'P0001', detail = 'delivery_order_numbers_used_up';
end;
$fn$;

revoke all on function public._delivery_document_number_draw(uuid) from public, anon, authenticated;

comment on function public._delivery_document_number_draw(uuid) is
  '0575 · draws one never-used Delivery Order number: DO+YYMM-4 digits (Outright) or SDO+YYMM-5 digits (Subscription, source_system = rental). Redraws on a clash; refuses when the month is used up; never widens.';

-- The door the API calls. Internal staff (the issuing doors run as the
-- operator) or the service role (Finance's clear door issues as the SYSTEM).
create or replace function public.delivery_document_number_draw(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not (coalesce(auth.role() = 'service_role', false) or coalesce((select public.is_internal()), false)) then
    raise exception 'forbidden: only the issuing doors draw a Delivery Order number'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_order_id is null then
    raise exception 'a Delivery Order number is drawn for an order'
      using errcode = '22023', detail = 'order_required';
  end if;
  return public._delivery_document_number_draw(p_order_id);
end;
$fn$;

revoke all on function public.delivery_document_number_draw(uuid) from public, anon;
grant execute on function public.delivery_document_number_draw(uuid) to authenticated, service_role;

-- ── B. the materialiser refuses, never skips ────────────────────────────────

create or replace function public.ops_delivery_orders_materialise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ctl   record;
  v_owner uuid;
begin
  if new.do_number is null then
    return new;
  end if;
  select d.order_id into v_owner
    from ops_delivery_orders d
   where upper(d.do_number) = upper(btrim(new.do_number))
   limit 1;
  if found then
    -- 0575 · The same order re-stating its own document (the leg and trip
    -- doors insert the row, then mirror its number onto the order): nothing
    -- to add. ANOTHER order's number is refused — never worn silently.
    if v_owner = new.id then
      return new;
    end if;
    raise exception 'delivery order number % already belongs to another order', new.do_number
      using errcode = '23505', detail = 'delivery_order_number_taken';
  end if;

  -- The trip facts as they stand at mint: the live booking columns (0277/0282)
  -- and the partner the appointment names (0346 first — the carrier the
  -- booking was actually made with; the assignment columns are the fallback).
  -- Absent facts stay NULL — a legacy mint with no booking is still a document.
  select c.booking_groups, c.confirmed_date, c.confirmed_time_slot,
         c.confirmed_partner_id
    into v_ctl
    from ops_order_control c
   where c.order_id = new.id;

  insert into ops_delivery_orders
    (order_id, do_number, trip_groups, delivery_date, time_slot,
     logistics_partner, issued_by)
  values
    (new.id,
     new.do_number,
     v_ctl.booking_groups,
     v_ctl.confirmed_date,
     v_ctl.confirmed_time_slot,
     (select p.name from delivery_partners p
       where p.id = coalesce(v_ctl.confirmed_partner_id,
                             new.ops_assigned_logistic,
                             new.delivery_partner_id)),
     auth.uid());
  return new;
end;
$fn$;

comment on function public.ops_delivery_orders_materialise() is
  'ONE writer for the DO register (0356): whichever door mints orders.do_number, the document row exists. 0575: a number another order owns is REFUSED (delivery_order_number_taken), never skipped.';

-- ── C. the dispatch backstop draws from the same pool (guarded edit) ────────

do $guard$
declare
  v_def    text;
  v_needle constant text := $n$new.do_number := 'DO-' || lpad(new.so::text, 6, '0');$n$;
  v_new    constant text := $n$new.do_number := public._delivery_document_number_draw(new.id);$n$;
begin
  select pg_get_functiondef('public.orders_auto_issue_on_dispatched()'::regprocedure) into v_def;
  if position(v_needle in v_def) = 0 then
    raise exception '0575: orders_auto_issue_on_dispatched does not carry the expected fallback line; refusing to rewrite a body this migration did not expect';
  end if;
  execute replace(v_def, v_needle, v_new);
end;
$guard$;
