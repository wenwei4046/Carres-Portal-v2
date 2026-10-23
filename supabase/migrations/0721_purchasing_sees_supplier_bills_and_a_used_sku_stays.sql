-- =============================================================================
-- 0721_purchasing_sees_supplier_bills_and_a_used_sku_stays.sql
-- =============================================================================
-- THE RULING: Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp
--   2026-10-22, relayed by YH 2026-10-23): "I think just clear Carress rules and
--   Implement Houzs inside". Purchasing staff get the Houzs SCM pages. Jess
--   (author of the Purchasing MASTER rules this overturns) was not part of this
--   decision. docs/purchasing/MASTER.md records each overturned line.
--
-- WHAT THIS CHANGES
--   1. purchasing_supplier_bill_list(): the supplier bills, read-only, for
--      operation, principal and finance. Houzs keeps purchase invoices inside
--      SCM. This is a READ of Finance's own bills; paid comes from Finance's
--      own ap_bill_paid(), so there is one paid arithmetic. It writes nothing:
--      entering, confirming and paying a bill stay Finance's doors
--      (supplier_bill_save_draft / payment vouchers, finance + principal only).
--      No ledger, account or file facts are returned.
--   2. product_skus refuses to DELETE a SKU that orders, purchase orders,
--      stock Units or supplier bills name. Those rows keep the SKU as text with
--      no foreign key, so a hard delete used to leave them pointing at nothing.
--      Houzs lets purchasing bulk-delete products; protecting the data is the
--      condition. The refusal names the SKU. Turning a SKU off
--      (discontinued_at / pos_active) is unchanged and is the way to retire it.
--
-- RLS: unchanged. DATA: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · supplier bills, read-only, for purchasing ────────────────────────────
create or replace function public.purchasing_supplier_bill_list()
returns table (id uuid, bill_no text, status text, supplier_id uuid, supplier_name text,
               supplier_invoice_no text, bill_date date, due_date date, po_id text,
               total_amount numeric, paid_total numeric, unpaid numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if coalesce(public.app_role()::text, '') not in ('operation', 'principal', 'finance') then
    raise exception 'supplier bills are for purchasing and finance'
      using errcode = '42501', detail = 'forbidden';
  end if;

  return query
  select b.id, b.bill_no, b.status, b.supplier_id, s.name,
         b.supplier_invoice_no, b.bill_date, b.due_date, b.po_id,
         b.total_amount,
         coalesce(p.paid, 0)::numeric(12,2),
         case when b.status = 'confirmed'
              then (b.total_amount - coalesce(p.paid, 0))::numeric(12,2) end
    from public.supplier_bills b
    join public.suppliers s on s.id = b.supplier_id
    left join public.ap_bill_paid() p on p.bill_id = b.id
   order by b.created_at desc;
end;
$fn$;

revoke all on function public.purchasing_supplier_bill_list() from public, anon;
grant execute on function public.purchasing_supplier_bill_list() to authenticated;

-- ── 2 · a SKU that documents name cannot be deleted ──────────────────────────
create or replace function public._product_sku_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if exists (select 1 from public.order_lines where sku = old.sku)
     or exists (select 1 from public.purchase_order_lines where sku = old.sku)
     or exists (select 1 from public.ops_stock_items where sku = old.sku)
     or exists (select 1 from public.supplier_bill_lines where sku = old.sku) then
    raise exception '% is on orders, purchase orders, stock or bills, so it was not deleted. Turn it off instead.', old.sku
      using errcode = 'P0001', detail = 'sku_in_use';
  end if;
  return old;
end;
$fn$;

revoke all on function public._product_sku_delete_guard() from public, anon, authenticated;

drop trigger if exists product_sku_delete_guard on public.product_skus;
create trigger product_sku_delete_guard
  before delete on public.product_skus
  for each row execute function public._product_sku_delete_guard();

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity_0721$
begin
  if has_function_privilege('anon', 'public.purchasing_supplier_bill_list()', 'EXECUTE') then
    raise exception '0721: anon can read supplier bills';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.product_skus'::regclass
                    and tgname = 'product_sku_delete_guard' and not tgisinternal) then
    raise exception '0721: product_skus has no delete guard';
  end if;
end;
$sanity_0721$;

commit;
