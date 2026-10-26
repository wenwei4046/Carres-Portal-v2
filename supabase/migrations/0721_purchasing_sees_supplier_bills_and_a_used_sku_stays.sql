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
--      own ap_bill_paid(), so there is one paid arithmetic. It writes nothing.
--      No ledger, account or file facts are returned.
--   2. product_skus refuses to DELETE a SKU that orders, purchase orders,
--      stock Units or supplier bills name. Those rows keep the SKU as text with
--      no foreign key, so a hard delete used to leave them pointing at nothing.
--      Houzs lets purchasing bulk-delete products; protecting the data is the
--      condition. The refusal names the SKU. Turning a SKU off
--      (discontinued_at / pos_active) is unchanged and is the way to retire it.
--   3. Purchasing enters a supplier bill (Chew, Finance, WhatsApp 2026-10-23,
--      relayed by YH: "Can be both to proceed the step first? Because the
--      duties right now still at finance, coming maybe will be purchasing").
--      ONE ENGINE: supplier_bill_save_draft, Finance's own door, now admits
--      operation for a NEW draft bill whose every line is goods received on a
--      GRN (the GRN line, its quantity and the price on the supplier's bill).
--      The usual account and payables account apply; purchasing picks neither.
--      A purchasing draft is the same row Finance's draft is, so confirming it
--      posts through the same supplier_bill_confirm, Dr each line, Cr payables.
--      supplier_bill_grn_candidates / supplier_bill_grn_lines admit operation
--      so the bill form can list the GRNs left to bill.
--      STAYS FINANCE'S (finance + principal, unchanged): changing a saved
--      draft, confirming (posting) it, cancelling it, every payment voucher,
--      advance, credit note and debit note. Chew did not mention payments.
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

-- ── 3 · purchasing enters a supplier bill from goods received (Chew 2026-10-23)

-- Replace one exact snippet of a live function. Applied already (the new text
-- is there): nothing to do. Otherwise the old text must occur exactly once.
create or replace function pg_temp.mig0721_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  if position(p_new in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0721: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- What purchasing may send to Finance's bill door. Called only from inside
-- supplier_bill_save_draft, for the operation role.
create or replace function public._purchasing_bill_draft_check(
  p_bill_id uuid, p_ap_account_code text, p_lines jsonb)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_line jsonb;
  v_n    integer := 0;
begin
  if p_bill_id is not null then
    raise exception 'Only Finance changes a saved bill.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if nullif(btrim(coalesce(p_ap_account_code, '')), '') is not null then
    raise exception 'Only Finance chooses the payables account.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return;   -- the bill door says what is wrong with the lines
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_line) <> 'object'
       or nullif(btrim(coalesce(v_line ->> 'warehouse_receipt_id', '')), '') is null
       or nullif(btrim(coalesce(v_line ->> 'po_line_id', '')), '') is null
       or nullif(btrim(coalesce(v_line ->> 'delivery_order_id', '')), '') is not null then
      raise exception 'Line %: Purchasing bills goods received. Add the line from its GRN, or ask Finance to enter this bill.', v_n
        using errcode = '42501', detail = 'purchasing_bills_goods_received';
    end if;
    if nullif(btrim(coalesce(v_line ->> 'account_code', '')), '') is not null then
      raise exception 'Line %: Only Finance chooses an account.', v_n
        using errcode = '42501', detail = 'not_finance';
    end if;
  end loop;
end;
$fn$;

revoke all on function public._purchasing_bill_draft_check(uuid, text, jsonb) from public, anon, authenticated;

select pg_temp.mig0721_rewrite('public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance enters a supplier bill'
      using errcode = '42501', detail = 'not_finance';
  end if;
$old$,
$new$  if v_role is null or v_role not in ('finance','principal','operation') then
    raise exception 'only finance and purchasing enter a supplier bill'
      using errcode = '42501', detail = 'not_finance';
  end if;
  -- 0721 (Chew 2026-10-23): purchasing enters a new bill from goods received.
  if v_role = 'operation' then
    perform public._purchasing_bill_draft_check(p_bill_id, p_ap_account_code, p_lines);
  end if;
$new$);

select pg_temp.mig0721_rewrite('public.supplier_bill_grn_candidates(uuid)'::regprocedure,
$old$  if not public.gl_may_read() then$old$,
$new$  if not (public.gl_may_read() or coalesce(public.app_role()::text = 'operation', false)) then   -- 0721$new$);

select pg_temp.mig0721_rewrite('public.supplier_bill_grn_lines(uuid)'::regprocedure,
$old$  if not public.gl_may_read() then$old$,
$new$  if not (public.gl_may_read() or coalesce(public.app_role()::text = 'operation', false)) then   -- 0721$new$);

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
  if position('_purchasing_bill_draft_check' in pg_get_functiondef(
       'public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure)) = 0 then
    raise exception '0721: supplier_bill_save_draft does not hold purchasing to a new GRN bill';
  end if;
  -- Posting, cancelling and paying stay finance + principal.
  if position($t$v_role not in ('finance','principal')$t$ in
              pg_get_functiondef('public.supplier_bill_confirm(uuid)'::regprocedure)) = 0
     or position($t$v_role not in ('finance','principal')$t$ in
              pg_get_functiondef('public.supplier_bill_cancel(uuid, text)'::regprocedure)) = 0
     or position($t$v_role not in ('finance','principal')$t$ in
              pg_get_functiondef((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'public' and p.proname = 'payment_voucher_save_draft'
                                   order by p.pronargs desc limit 1))) = 0 then
    raise exception '0721: confirming, cancelling or paying a bill no longer reads as finance only';
  end if;
  if has_function_privilege('authenticated', 'public._purchasing_bill_draft_check(uuid, text, jsonb)', 'EXECUTE') then
    raise exception '0721: _purchasing_bill_draft_check is callable on its own';
  end if;
end;
$sanity_0721$;

commit;
