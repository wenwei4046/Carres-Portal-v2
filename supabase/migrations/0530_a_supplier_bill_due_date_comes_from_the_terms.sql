-- 0530 — a supplier bill's due date comes from the PO's or the supplier's terms.
--
-- OWNER RULING (YH, 17 Sep 2026)
--   Payment terms can be set per supplier AND per PO. The PO's terms win when
--   set, otherwise the supplier's. Finance picks which to use later.
--
-- WHAT THIS CHANGES
--   1. suppliers.terms_days and purchase_orders.terms_days: a whole number of
--      days, 0 or more, empty by default. No row is filled in. The free-text
--      suppliers.payment_terms column is not touched.
--   2. Two small write doors, because no screen edits a supplier or a PO
--      header directly:
--        purchasing_set_supplier_terms_days(supplier, days)
--        purchasing_set_po_terms_days(po, days)
--      Principal, operation and finance may call them. NULL days clears it.
--
--   The bill's due date is NOT computed here. The bill form fills it in from
--   the terms (bill date + days) and the user can still change or clear it;
--   supplier_bill_save_draft (0477) is unchanged.

alter table public.suppliers
  add column if not exists terms_days integer,
  add constraint suppliers_terms_days_not_negative check (terms_days >= 0);

alter table public.purchase_orders
  add column if not exists terms_days integer,
  add constraint purchase_orders_terms_days_not_negative check (terms_days >= 0);

create or replace function public.purchasing_set_supplier_terms_days(
  p_supplier_id uuid,
  p_days        int
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.app_role())::text;
  v_old  int;
  v_name text;
begin
  -- coalesce: a caller with no role is refused, not let through (0500).
  if coalesce(v_role, '') not in ('principal', 'operation', 'finance') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'payment terms are set by principal, operation or finance';
  end if;
  if p_days is not null and (p_days < 0 or p_days > 365) then
    raise exception 'terms_days_out_of_range' using errcode = '22023';
  end if;

  select terms_days, name into v_old, v_name
    from suppliers where id = p_supplier_id for update;
  if not found then
    raise exception 'unknown_supplier' using errcode = '22023';
  end if;

  update suppliers set terms_days = p_days where id = p_supplier_id;

  perform purchasing_record_change(
    v_role, 'supplier_terms_days', p_supplier_id, null,
    v_old::text, p_days::text,
    format('Payment terms · %s %s -> %s days',
           v_name, coalesce(v_old::text, '-'), coalesce(p_days::text, '-')));
end;
$function$;

create or replace function public.purchasing_set_po_terms_days(
  p_po_id text,
  p_days  int
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role public.app_role := public.app_role();
  v_old  int;
begin
  if v_role is null or v_role::text not in ('principal', 'operation', 'finance') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'payment terms are set by principal, operation or finance';
  end if;
  if p_days is not null and (p_days < 0 or p_days > 365) then
    raise exception 'terms_days_out_of_range' using errcode = '22023';
  end if;

  select terms_days into v_old from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  update purchase_orders set terms_days = p_days where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Payment terms %s -> %s days',
                 coalesce(v_old::text, '-'), coalesce(p_days::text, '-')),
          v_role, auth.uid());
end;
$function$;

revoke all on function public.purchasing_set_supplier_terms_days(uuid, int) from public, anon;
revoke all on function public.purchasing_set_po_terms_days(text, int) from public, anon;
grant execute on function public.purchasing_set_supplier_terms_days(uuid, int) to authenticated;
grant execute on function public.purchasing_set_po_terms_days(text, int) to authenticated;
