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
--      operation for a draft bill with goods received on a GRN (the GRN line,
--      its quantity and the price on the supplier's bill). Goods lines take the
--      usual account; purchasing never picks the payables account.
--      YH (chat 2026-10-26), following Houzs: purchasing may add lines with no
--      GRN link (freight, a service) with an account from Finance's own list,
--      but not one billing material already on a GRN of the bill; a bill with
--      no GRN line (rent, a service) stays Finance's; purchasing may change its
--      OWN draft. ap_account_choices admits operation for that list, and
--      purchasing_supplier_bill_draft() reads an own draft back for editing.
--      A purchasing draft is the same row Finance's draft is, so confirming it
--      posts through the same supplier_bill_confirm, Dr each line, Cr payables.
--      supplier_bill_grn_candidates / supplier_bill_grn_lines admit operation
--      so the bill form can list the GRNs left to bill.
--      Q8 (Chew, WhatsApp to YH 2026-10-26 12:34, "once they save should be
--      direct go to related account as set"; Houzs posts on save): a bill
--      Purchasing saves is confirmed (posted) in the same act (section 4).
--      STAYS FINANCE'S (finance + principal, unchanged): changing anyone
--      else's draft, confirming (posting) anyone else's bill, cancelling, every
--      payment voucher,
--      advance, credit note and debit note. Chew did not mention payments.
--
-- RLS: unchanged. DATA: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · supplier bills, read-only, for purchasing ────────────────────────────
-- `mine`: the caller's own draft, which purchasing may change (2026-10-26).
drop function if exists public.purchasing_supplier_bill_list();
create function public.purchasing_supplier_bill_list()
returns table (id uuid, bill_no text, status text, supplier_id uuid, supplier_name text,
               supplier_invoice_no text, bill_date date, due_date date, po_id text,
               total_amount numeric, paid_total numeric, unpaid numeric, mine boolean)
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
              then (b.total_amount - coalesce(p.paid, 0))::numeric(12,2) end,
         (b.status = 'draft' and b.created_by is not distinct from auth.uid())
    from public.supplier_bills b
    join public.suppliers s on s.id = b.supplier_id
    left join public.ap_bill_paid() p on p.bill_id = b.id
   order by b.created_at desc;
end;
$fn$;

revoke all on function public.purchasing_supplier_bill_list() from public, anon;
grant execute on function public.purchasing_supplier_bill_list() to authenticated;

-- One draft bill, for its form (2026-10-26). Purchasing reads only its own
-- draft; finance and principal any. Goods lines that saving split by channel
-- (0683) come back as the one line that was typed. Null: not there / not yours.
create or replace function public.purchasing_supplier_bill_draft(p_bill_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := coalesce(public.app_role()::text, '');
  v_bill public.supplier_bills%rowtype;
begin
  if v_role not in ('operation', 'principal', 'finance') then
    raise exception 'supplier bills are for purchasing and finance'
      using errcode = '42501', detail = 'forbidden';
  end if;
  select * into v_bill from public.supplier_bills where id = p_bill_id;
  if not found or v_bill.status <> 'draft'
     or (v_role = 'operation' and v_bill.created_by is distinct from auth.uid()) then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_bill.id, 'supplier_id', v_bill.supplier_id,
    'supplier_invoice_no', v_bill.supplier_invoice_no, 'bill_date', v_bill.bill_date,
    'due_date', v_bill.due_date, 'narration', v_bill.narration,
    'lines', coalesce((
      select jsonb_agg(x order by x.first_no)
        from (
          select min(l.line_no) as first_no, l.warehouse_receipt_id, l.po_line_id,
                 to_jsonb(wr) ->> 'grn_no' as grn_no, l.sku, l.description,
                 case when l.warehouse_receipt_id is null then l.account_code end as account_code,
                 sum(l.qty) as qty, l.unit_price,
                 sum(l.amount) as amount,
                 case when l.warehouse_receipt_id is null then l.department_type end as department_type,
                 case when l.warehouse_receipt_id is null then l.department_id end as department_id
            from public.supplier_bill_lines l
            left join public.warehouse_receipts wr on wr.id = l.warehouse_receipt_id
           where l.bill_id = v_bill.id
           group by l.warehouse_receipt_id, l.po_line_id, to_jsonb(wr) ->> 'grn_no', l.sku, l.description,
                    case when l.warehouse_receipt_id is null then l.account_code end, l.unit_price,
                    case when l.warehouse_receipt_id is null then l.department_type end,
                    case when l.warehouse_receipt_id is null then l.department_id end,
                    case when l.warehouse_receipt_id is null then l.id end
        ) x), '[]'::jsonb));
end;
$fn$;

revoke all on function public.purchasing_supplier_bill_draft(uuid) from public, anon;
grant execute on function public.purchasing_supplier_bill_draft(uuid) to authenticated;

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
-- YH (chat 2026-10-26), following Houzs (purchase-invoices.ts, the unlinked-line
-- check and piLocked): a purchasing bill has goods received on it, and may add
-- lines with no GRN link (freight, a service) with an account from Finance's
-- list, but such a line may not bill material already on one of the bill's
-- GRNs. A bill that is only rent or a service stays Finance's. Purchasing may
-- change its OWN bill while it is a draft. Houzs locks a bill once a payment is
-- recorded; in Carres a bill is paid only after Finance confirms it, and a
-- confirmed bill's lines are frozen for everyone, so a draft is that window.
create or replace function public._purchasing_bill_draft_check(
  p_bill_id uuid, p_ap_account_code text, p_lines jsonb)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_line  jsonb;
  v_n     integer := 0;
  v_grns  integer := 0;
  v_bill  public.supplier_bills%rowtype;
  v_rcpts uuid[];
  v_hit   text;
begin
  if p_bill_id is not null then
    select * into v_bill from public.supplier_bills where id = p_bill_id;
    -- Not there: the bill door says so.
    if found and (v_bill.created_by is distinct from auth.uid() or v_bill.status <> 'draft') then
      raise exception 'Purchasing changes only its own draft bill. Ask Finance to change this one.'
        using errcode = '42501', detail = 'not_finance';
    end if;
  end if;
  if nullif(btrim(coalesce(p_ap_account_code, '')), '') is not null then
    raise exception 'Only Finance chooses the payables account.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return;   -- the bill door says what is wrong with the lines
  end if;

  -- The GRNs this bill covers (a link that is not readable is the bill door's to refuse).
  select coalesce(array_agg(distinct (l ->> 'warehouse_receipt_id')::uuid), '{}')
    into v_rcpts
    from jsonb_array_elements(p_lines) l
   where jsonb_typeof(l) = 'object'
     and btrim(coalesce(l ->> 'warehouse_receipt_id', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_line) <> 'object' then
      continue;   -- the bill door refuses it
    end if;
    if nullif(btrim(coalesce(v_line ->> 'delivery_order_id', '')), '') is not null then
      raise exception 'Line %: a delivery order''s transport is Finance''s to bill.', v_n
        using errcode = '42501', detail = 'not_finance';
    end if;
    if nullif(btrim(coalesce(v_line ->> 'warehouse_receipt_id', '')), '') is not null then
      v_grns := v_grns + 1;
      if nullif(btrim(coalesce(v_line ->> 'account_code', '')), '') is not null then
        raise exception 'Line %: goods received take the usual account. Only Finance changes it.', v_n
          using errcode = '42501', detail = 'not_finance';
      end if;
    else
      -- Houzs's unlinked-line check: freight or a service passes; the material
      -- of a GRN on this bill does not, or the same goods are billed twice.
      select pol.sku into v_hit
        from public.warehouse_receipts wr
        cross join lateral jsonb_array_elements(
               case when jsonb_typeof(wr.lines) = 'array' then wr.lines else '[]'::jsonb end) rl
        join public.purchase_order_lines pol on pol.id::text = rl ->> 'id'
       where wr.id = any (v_rcpts)
         and lower(btrim(pol.sku)) in (lower(btrim(coalesce(v_line ->> 'sku', ''))),
                                       lower(btrim(coalesce(v_line ->> 'description', ''))))
       limit 1;
      if v_hit is not null then
        raise exception 'Line %: % is goods received on a GRN on this bill. Bill it from the GRN line, so it is billed once.', v_n, v_hit
          using errcode = '42501', detail = 'unlinked_line_bills_grn_material';
      end if;
    end if;
  end loop;

  if v_grns = 0 then
    raise exception 'Purchasing bills goods received. A bill with no GRN line (rent, a service) is Finance''s to enter.'
      using errcode = '42501', detail = 'purchasing_bills_goods_received';
  end if;
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

-- 2026-10-26: purchasing picks a no-GRN line's account from Finance's own list.
select pg_temp.mig0721_rewrite('public.ap_account_choices()'::regprocedure,
$old$  if not public.gl_may_read() then$old$,
$new$  if not (public.gl_may_read() or coalesce(public.app_role()::text = 'operation', false)) then   -- 0721$new$);

-- ── 4 · a purchasing bill posts when it is saved (Q8, 2026-10-26) ──────────
-- WHY HOUZS: Weisiang's ruling (Mr Lim, WhatsApp 2026-10-22) puts Houzs's
-- rules over Carres's where they clash, and Chew (WhatsApp to YH, 2026-10-26
-- 12:34) answered Q8: "once they save should be direct go to related account
-- as set". Houzs posts a purchase invoice on save (purchase-invoices.ts). So a
-- bill Purchasing saves is confirmed in the same act, through Finance's own
-- supplier_bill_confirm: the same checks, the same Dr each line, Cr payables.
-- Confirm admits operation for ITS OWN bill only (that is the save). Cancelling
-- and every payment stay finance + principal.
select pg_temp.mig0721_rewrite('public.supplier_bill_confirm(uuid)'::regprocedure,
$old$  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance confirms a supplier bill'$old$,
$new$  if v_role is null or v_role not in ('finance','principal')
     -- 0721 (Q8, Chew 2026-10-26): Purchasing's own bill posts as it is saved.
     and not (v_role = 'operation' and exists (select 1 from public.supplier_bills ob
                                                where ob.id = p_bill_id and ob.created_by = auth.uid())) then
    raise exception 'only finance confirms a supplier bill'$new$);

select pg_temp.mig0721_rewrite('public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$  return v_id;
end;$old$,
$new$  -- 0721 (Q8, Chew 2026-10-26; Houzs posts on save): Purchasing's bill posts now.
  if v_role = 'operation' then
    perform public.supplier_bill_confirm(v_id);
  end if;
  return v_id;
end;$new$);

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
  -- Posting admits Purchasing's own bill only (Q8); cancelling and paying stay finance + principal.
  if position($t$ob.created_by = auth.uid()$t$ in
              pg_get_functiondef('public.supplier_bill_confirm(uuid)'::regprocedure)) = 0
     or position('perform public.supplier_bill_confirm(v_id)' in pg_get_functiondef(
              'public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure)) = 0
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
  if has_function_privilege('anon', 'public.purchasing_supplier_bill_draft(uuid)', 'EXECUTE')
     or position('-- 0721' in pg_get_functiondef('public.ap_account_choices()'::regprocedure)) = 0 then
    raise exception '0721: the purchasing bill form''s reads are not as intended';
  end if;
end;
$sanity_0721$;

commit;
