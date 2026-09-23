-- 0571 . A DELIVERY ORDER WARNS WHEN MONEY IS STILL OWED, INSTEAD OF BLOCKING
--
-- The owner, 2026-09-23: "the automatic block when money is still owed becomes
-- a warning" and "delivery order to warn when part of the money is still
-- uncollected, instead of blocking".
--
-- Every door that issues a delivery order inserts into ops_delivery_orders, so
-- every door passes the one BEFORE INSERT trigger ops_delivery_orders_money_gate
-- (0362, 0441, 0447). The doors, found in pg_proc on a clone at 0561:
--   . the whole-order door: orders.do_number is set and
--     ops_delivery_orders_materialise() inserts the row
--   . delivery_trip_document_mint(uuid, text), one document per trip (0542)
--   . delivery_leg_document_mint(uuid, integer, text), one per journey leg (0491)
--   . operation_attach_do_and_deliver(...) reaches the materialiser when it
--     records a number no document carries yet
--
-- WHAT CHANGES
--   1. Money still owed, with no approved payment approval, no longer refuses
--      outright. The document issues once a signed-in person confirms the
--      exact amount owed. Without that confirmation the insert is refused with
--      the amount, so an API call that skips the confirmation is still refused.
--   2. The confirmation travels inside the issuing transaction, in the
--      transaction-local setting carres.owed_confirmed ('<order id>=<amount>').
--      Three new SECURITY INVOKER doors set it and call the existing door, so
--      each runs with exactly the caller's own rights and RLS:
--        delivery_order_mint_owed_confirmed          (the whole-order door)
--        delivery_trip_document_mint_owed_confirmed  (0542's door)
--        delivery_leg_document_mint_owed_confirmed   (0491's door)
--   3. The document records the confirmation: owed_when_issued (new, the amount
--      owed at that moment) and issued_by (existing, set here to the person who
--      confirmed). No existing column holds an amount, so one column is added.
--   4. Finance's explicit hold (order_finance_exceptions, 0355) is refused in
--      this trigger too, confirmation or not. Until now only the API's gate
--      read it, so a confirmation sent straight to a door would otherwise have
--      carried a held order through.
--
-- WHAT DOES NOT CHANGE: how much is owed (the arithmetic below is carried
-- forward from pg_proc at 0561, line for line), an approved payment approval
-- still opens the gate, no payment, invoice or ledger row is written, no RLS
-- policy moves, and no other existing function body is rebuilt.
--
-- Section 6: no existing row is read, written or backfilled.

alter table public.ops_delivery_orders
  add column owed_when_issued numeric(12,2),
  add constraint ops_delivery_orders_owed_confirmed_by_a_person
    check (owed_when_issued is null or (owed_when_issued > 0 and issued_by is not null));

comment on column public.ops_delivery_orders.owed_when_issued is
  '0571: money still owed when this delivery order was issued despite the warning. issued_by is the person who confirmed it. Null when nothing was owed or an approved payment approval covered it.';

CREATE OR REPLACE FUNCTION public.ops_delivery_orders_money_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_priced    numeric;
  v_paid      numeric;
  v_keyed     numeric;
  v_storage   numeric;
  v_legacy    numeric;
  v_ctrl      record;
  v_owing     numeric;
  v_holds     integer;
  v_reasons   text;
  v_confirm   text := coalesce(current_setting('carres.owed_confirmed', true), '');
  v_confirmed numeric;
begin
  -- 0571 . Finance's explicit hold refuses first, confirmation or not. The
  -- words are the shared financeExceptionReason()'s.
  select count(*), string_agg(e.reason, ' · ' order by e.opened_at)
    into v_holds, v_reasons
    from order_finance_exceptions e
   where e.order_id = new.order_id and e.status = 'open';
  if v_holds > 0 then
    raise exception '%', case when v_holds = 1
        then format('Finance is holding this delivery: %s — Finance clears it.', v_reasons)
        else format('Finance is holding this delivery for %s reasons: %s — Finance clears them.', v_holds, v_reasons)
      end
      using errcode = 'P0001', detail = 'delivery_finance_hold';
  end if;

  select coalesce(sum(l.qty * l.unit_price), 0)
    into v_priced
    from order_lines l
   where l.order_id = new.order_id and l.unit_price is not null;
  select v_priced + coalesce(sum(a.qty * a.unit_price), 0)
    into v_priced
    from order_addons a
   where a.order_id = new.order_id and a.unit_price is not null;

  select greatest(0, coalesce(o.paid, 0)) into v_paid
    from orders o where o.id = new.order_id;

  -- The §2 storage obligation: live ISSUED storage-kind papers with tax.
  -- A draft asks nothing (issued or not, replacement or not); a voided paper
  -- asks nothing until its replacement is ISSUED — a correction, not a waiver.
  select coalesce(sum(i.amount + i.tax_amount), 0)
    into v_storage
    from invoices i
   where i.order_id = new.order_id
     and i.kind in ('storage', 'additional_storage')
     and i.status = 'issued'
     and i.voided_at is null;

  -- 0447 — the KEYED legacy C9 fee, under its own rule: an override beats the
  -- imported pair, `storage_collected_at` clears it, an override of 0 is the
  -- approved write-off. Never netted against `paid` (C9 never read `paid`).
  v_legacy := 0;
  select c.storage_fee_override, c.storage_fee_msbf, c.storage_fee_sof,
         c.storage_collected_at
    into v_ctrl
    from ops_order_control c
   where c.order_id = new.order_id;
  if found and v_ctrl.storage_collected_at is null then
    v_legacy := case
      when v_ctrl.storage_fee_override is not null then greatest(0, v_ctrl.storage_fee_override)
      else greatest(0, coalesce(v_ctrl.storage_fee_msbf, 0) + coalesce(v_ctrl.storage_fee_sof, 0))
    end;
  end if;

  if v_priced > 0 then
    v_owing := greatest(0, v_priced + v_storage - v_paid) + v_legacy;
  else
    select c.balance into v_keyed
      from ops_order_control c where c.order_id = new.order_id;
    if v_keyed is not null then
      v_owing := greatest(0, v_keyed) + v_storage + v_legacy;
    else
      v_owing := greatest(0, v_storage - v_paid) + v_legacy;
    end if;
  end if;

  -- 0571 . Money owed is a warning. Only a person who confirmed this exact
  -- amount inside this transaction issues the document, and the document keeps
  -- the amount and the person. A value the caller wrote is never trusted.
  new.owed_when_issued := null;
  if v_owing > 0 and not exists (
    select 1 from order_delivery_payment_approvals a
     where a.order_id = new.order_id and a.status = 'approved'
  ) then
    v_owing := round(v_owing, 2);
    if split_part(v_confirm, '=', 1) = new.order_id::text then
      v_confirmed := nullif(split_part(v_confirm, '=', 2), '')::numeric;
    end if;
    if v_confirmed is distinct from v_owing or auth.uid() is null then
      raise exception 'RM % is still outstanding. Confirm to issue the delivery order anyway.',
        to_char(v_owing, 'FM999,999,990.00')
        using errcode = 'P0001', detail = 'delivery_money_owed', hint = v_owing::text;
    end if;
    new.owed_when_issued := v_owing;
    new.issued_by := auth.uid();
  end if;

  return new;
end;
$function$;

-- The three confirming doors. SECURITY INVOKER: each does exactly what its
-- caller could already do through the door it wraps, in one transaction that
-- also carries the confirmation. The setting is cleared after the call so it
-- confirms one issue only.

CREATE OR REPLACE FUNCTION public.delivery_order_mint_owed_confirmed(p_order_id uuid, p_do_number text, p_owed_confirmed numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_no text;
begin
  if coalesce(p_do_number, '') !~ '[^[:space:]]' then
    raise exception 'a document carries its number' using errcode = '22023', detail = 'do_number_required';
  end if;
  perform set_config('carres.owed_confirmed', format('%s=%s', p_order_id, p_owed_confirmed), true);
  -- The same write the API makes: only into an empty column, so two callers
  -- cannot mint two numbers. Null back means another caller won.
  update orders set do_number = p_do_number
   where id = p_order_id and do_number is null
  returning do_number into v_no;
  perform set_config('carres.owed_confirmed', '', true);
  return v_no;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delivery_trip_document_mint_owed_confirmed(p_order_id uuid, p_do_number text, p_owed_confirmed numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row jsonb;
begin
  perform set_config('carres.owed_confirmed', format('%s=%s', p_order_id, p_owed_confirmed), true);
  v_row := public.delivery_trip_document_mint(p_order_id, p_do_number);
  perform set_config('carres.owed_confirmed', '', true);
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delivery_leg_document_mint_owed_confirmed(p_order_id uuid, p_leg integer, p_do_number text, p_owed_confirmed numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row jsonb;
begin
  perform set_config('carres.owed_confirmed', format('%s=%s', p_order_id, p_owed_confirmed), true);
  v_row := public.delivery_leg_document_mint(p_order_id, p_leg, p_do_number);
  perform set_config('carres.owed_confirmed', '', true);
  return v_row;
end;
$function$;

revoke all on function public.delivery_order_mint_owed_confirmed(uuid, text, numeric) from public, anon;
revoke all on function public.delivery_trip_document_mint_owed_confirmed(uuid, text, numeric) from public, anon;
revoke all on function public.delivery_leg_document_mint_owed_confirmed(uuid, integer, text, numeric) from public, anon;
grant execute on function public.delivery_order_mint_owed_confirmed(uuid, text, numeric) to authenticated, service_role;
grant execute on function public.delivery_trip_document_mint_owed_confirmed(uuid, text, numeric) to authenticated, service_role;
grant execute on function public.delivery_leg_document_mint_owed_confirmed(uuid, integer, text, numeric) to authenticated, service_role;

-- Sanity: the trigger this file just wrote holds both answers and still
-- counts the same money.
do $sanity$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_delivery_orders_money_gate';
  if position('delivery_money_owed' in v_src) = 0 then
    raise exception '0571 sanity: the money warning is missing from the gate';
  end if;
  if position('delivery_finance_hold' in v_src) = 0 then
    raise exception '0571 sanity: the Finance hold is missing from the gate';
  end if;
  if position('storage_collected_at' in v_src) = 0 or position('additional_storage' in v_src) = 0 then
    raise exception '0571 sanity: the gate lost part of the money arithmetic';
  end if;
end
$sanity$;
