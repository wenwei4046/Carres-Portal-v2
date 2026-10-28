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
--      OWN bill until a payment (section 5). ap_account_choices admits operation for that list, and
--      purchasing_supplier_bill_draft() reads an own draft back for editing.
--      A purchasing draft is the same row Finance's draft is, so confirming it
--      posts through the same supplier_bill_confirm, Dr each line, Cr payables.
--      supplier_bill_grn_candidates / supplier_bill_grn_lines admit operation
--      so the bill form can list the GRNs left to bill.
--      Q9 edit-until-paid (YH 2026-10-26, Houzs piLocked + resyncPiAccounting):
--      Purchasing changes its own POSTED bill until any payment is against it;
--      the posting is reversed and re-posted (section 5).
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
-- `mine`: the caller's own bill with no payment against it, which purchasing
-- may change (Q9, 2026-10-26; Houzs piLocked, purchase-invoices.ts:270-284).
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
         (b.status in ('draft', 'confirmed') and b.created_by is not distinct from auth.uid()
          and not exists (select 1 from public.ap_bill_paid(b.id) hp where hp.held > 0))
    from public.supplier_bills b
    join public.suppliers s on s.id = b.supplier_id
    left join public.ap_bill_paid() p on p.bill_id = b.id
   order by b.created_at desc;
end;
$fn$;

revoke all on function public.purchasing_supplier_bill_list() from public, anon;
grant execute on function public.purchasing_supplier_bill_list() to authenticated;

-- One bill, for its form (2026-10-26). Purchasing reads only its own bill,
-- draft or posted, while no payment is against it (Houzs piLocked,
-- purchase-invoices.ts:270-284); finance and principal any draft. Goods lines that saving split by channel
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
  if not found or v_bill.status = 'cancelled'
     or (v_role <> 'operation' and v_bill.status <> 'draft')
     or (v_role = 'operation' and (v_bill.created_by is distinct from auth.uid()
         or exists (select 1 from public.ap_bill_paid(v_bill.id) hp where hp.held > 0))) then
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
  p_old := replace(p_old, E'\r\n', E'\n');
  p_new := replace(p_new, E'\r\n', E'\n');
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
-- change its OWN bill until any payment, advance or credit note is against it
-- (Houzs piLocked, purchase-invoices.ts:270-284: paid_sen > 0 or cancelled
-- locks it). A posted one is reopened by supplier_bill_save_draft (section 5).
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
    if found and (v_bill.created_by is distinct from auth.uid() or v_bill.status = 'cancelled') then
      raise exception 'Purchasing changes only its own bill. Ask Finance to change this one.'
        using errcode = '42501', detail = 'not_finance';
    end if;
    if found and exists (select 1 from public.ap_bill_paid(p_bill_id) hp where hp.held > 0) then
      raise exception 'A payment is recorded against this bill, so its lines are locked. Ask Finance.'
        using errcode = '42501', detail = 'bill_locked_paid';
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

-- ── 5 · purchasing edits its own posted bill until a payment (Q9, 2026-10-26)
-- WHY HOUZS: Weisiang's ruling (Mr Lim, WhatsApp 2026-10-22) puts Houzs over
-- Carres where they clash; YH (chat 2026-10-26) told us to build Q9 the Houzs
-- way. Houzs lets a posted purchase invoice be edited until a payment is
-- recorded (piLocked, purchase-invoices.ts:270-284) and keeps the ledger right
-- by voiding the posted journal and posting a new one at the new total
-- (resyncPiAccounting, accounting.ts:855+, called after an edit at
-- purchase-invoices.ts:2018-2024). Carres does the same: gl_reverse the posted
-- entry (a contra, nothing deleted), put the bill back to draft, replace the
-- lines, and the save's supplier_bill_confirm posts again. The bill keeps its
-- number. Finance's own bills, and anything with a payment, are unchanged.
select pg_temp.mig0721_rewrite('public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$    if v_bill.status <> 'draft' then
      raise exception 'Only a draft bill can be changed.'$old$,
$new$    -- 0721 (Q9, Houzs resyncPiAccounting): reverse, reopen, the save re-posts.
    -- _purchasing_bill_draft_check held it to own + unpaid; re-read under the lock.
    if v_role = 'operation' and v_bill.status = 'confirmed' then
      if exists (select 1 from public.ap_bill_paid(p_bill_id) hp where hp.held > 0) then
        raise exception 'A payment is recorded against this bill, so its lines are locked. Ask Finance.'
          using errcode = '42501', detail = 'bill_locked_paid';
      end if;
      perform public.gl_reverse(v_bill.gl_entry_id, 'Bill edited by Purchasing before any payment');
      update public.supplier_bills
         set status = 'draft', gl_entry_id = null, confirmed_at = null, confirmed_by = null
       where id = p_bill_id
      returning * into v_bill;
    end if;
    if v_bill.status <> 'draft' then
      raise exception 'Only a draft bill can be changed.'$new$);

-- The frozen trigger lets a confirmed bill go back to draft only when its
-- posting is already reversed and nothing is paid: the step above, nothing else.
select pg_temp.mig0721_rewrite('public.supplier_bill_frozen()'::regprocedure,
$old$  -- old.status = 'confirmed'
  if new.status <> 'cancelled' then$old$,
$new$  -- old.status = 'confirmed'
  -- 0721 (Q9): reopened for a Purchasing edit, its posting already reversed.
  if new.status = 'draft' and new.gl_entry_id is null
     and exists (select 1 from public.gl_entries e where e.id = old.gl_entry_id and e.reversed)
     and not exists (select 1 from public.ap_bill_paid(old.id) hp where hp.held > 0) then
    return new;
  end if;
  if new.status <> 'cancelled' then$new$);

-- A re-post keeps the bill's number (Houzs keeps the PI number on an edit).
select pg_temp.mig0721_rewrite('public.supplier_bill_confirm(uuid)'::regprocedure,
$old$  v_no := public.allocate_formal_document_code('SB', v_bill.id::text, v_bill.bill_date);$old$,
$new$  v_no := coalesce(v_bill.bill_no,   -- 0721: a reopened bill keeps its number
                   public.allocate_formal_document_code('SB', v_bill.id::text, v_bill.bill_date));$new$);

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
  if position('Bill edited by Purchasing before any payment' in pg_get_functiondef(
       'public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure)) = 0
     or position('0721 (Q9)' in pg_get_functiondef('public.supplier_bill_frozen()'::regprocedure)) = 0 then
    raise exception '0721: a posted purchasing bill is not reopened by reversal';
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

-- ── Fabric master stock columns ────────────────────────────────────────────
-- Follows Houzs backend/src/scm/routes/fabric-tracking.ts:264-275 and
-- frontend/src/vendor/scm/lib/fabric-csv.ts:42-53 per Weisiang's ruling
-- (2026-10-22): clear Carres rules, implement Houzs. In Houzs these are plain
-- stored integers on scm.fabric_trackings, typed in or imported by CSV
-- (bulk-upsert); nothing computes them. Same names and units here.
-- The batch save keeps a column's old value (by fabric code) when an entry
-- does not carry it, the way 0226 carries `cost` forward.
alter table public.catalog_fabrics
  add column if not exists price_sen            integer not null default 0,
  add column if not exists soh_sen              integer not null default 0,
  add column if not exists po_outstanding_sen   integer not null default 0,
  add column if not exists last_month_usage_sen integer not null default 0,
  add column if not exists one_week_usage_sen   integer not null default 0,
  add column if not exists two_weeks_usage_sen  integer not null default 0,
  add column if not exists one_month_usage_sen  integer not null default 0,
  add column if not exists shortage_sen         integer not null default 0,
  add column if not exists reorder_point_sen    integer not null default 0,
  add column if not exists lead_time_days       integer not null default 0;

create or replace function public.catalog_fabrics_batch_save(
  p_entries jsonb,
  p_notes   text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_count    integer;
  v_old      jsonb;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'entries must be a json array' using errcode = '22023';
  end if;

  -- 0226 cost + 0721 stock columns, captured before the replace-all delete.
  select coalesce(jsonb_object_agg(fabric_code, jsonb_build_object(
           'cost', cost, 'price_sen', price_sen, 'soh_sen', soh_sen,
           'po_outstanding_sen', po_outstanding_sen, 'last_month_usage_sen', last_month_usage_sen,
           'one_week_usage_sen', one_week_usage_sen, 'two_weeks_usage_sen', two_weeks_usage_sen,
           'one_month_usage_sen', one_month_usage_sen, 'shortage_sen', shortage_sen,
           'reorder_point_sen', reorder_point_sen, 'lead_time_days', lead_time_days)), '{}'::jsonb)
    into v_old
    from public.catalog_fabrics;

  delete from public.catalog_fabrics where id is not null;

  insert into public.catalog_fabrics
    (fabric_code, series, description, supplier_code,
     sofa_tier, bedframe_tier, active, sort_order, cost,
     price_sen, soh_sen, po_outstanding_sen, last_month_usage_sen, one_week_usage_sen,
     two_weeks_usage_sen, one_month_usage_sen, shortage_sen, reorder_point_sen, lead_time_days,
     updated_at, updated_by)
  select
    x.code,
    nullif(btrim(coalesce(x.elem->>'series', '')), ''),
    nullif(btrim(coalesce(x.elem->>'description', '')), ''),
    nullif(btrim(coalesce(x.elem->>'supplierCode', '')), ''),
    coalesce(nullif(btrim(coalesce(x.elem->>'sofaTier', '')), ''), 'PRICE_2'),
    coalesce(nullif(btrim(coalesce(x.elem->>'bedframeTier', '')), ''), 'PRICE_2'),
    coalesce((x.elem->>'active')::boolean, true),
    x.ord,
    (v_old->x.code->>'cost')::numeric,
    coalesce((x.elem->>'priceSen')::integer,          (v_old->x.code->>'price_sen')::integer, 0),
    coalesce((x.elem->>'sohSen')::integer,            (v_old->x.code->>'soh_sen')::integer, 0),
    coalesce((x.elem->>'poOutstandingSen')::integer,  (v_old->x.code->>'po_outstanding_sen')::integer, 0),
    coalesce((x.elem->>'lastMonthUsageSen')::integer, (v_old->x.code->>'last_month_usage_sen')::integer, 0),
    coalesce((x.elem->>'oneWeekUsageSen')::integer,   (v_old->x.code->>'one_week_usage_sen')::integer, 0),
    coalesce((x.elem->>'twoWeeksUsageSen')::integer,  (v_old->x.code->>'two_weeks_usage_sen')::integer, 0),
    coalesce((x.elem->>'oneMonthUsageSen')::integer,  (v_old->x.code->>'one_month_usage_sen')::integer, 0),
    coalesce((x.elem->>'shortageSen')::integer,       (v_old->x.code->>'shortage_sen')::integer, 0),
    coalesce((x.elem->>'reorderPointSen')::integer,   (v_old->x.code->>'reorder_point_sen')::integer, 0),
    coalesce((x.elem->>'leadTimeDays')::integer,      (v_old->x.code->>'lead_time_days')::integer, 0),
    now(),
    (select auth.uid())
  from (
    select btrim(e.elem->>'fabricCode') as code, e.elem, e.ord
      from jsonb_array_elements(p_entries) with ordinality as e(elem, ord)
  ) x
  where coalesce(x.code, '') <> '';

  get diagnostics v_count = row_count;

  -- The history snapshot keeps the 0202 shape (no cost, no stock), as before.
  select coalesce(jsonb_agg(jsonb_build_object(
           'fabricCode', fabric_code, 'series', series,
           'description', description, 'supplierCode', supplier_code,
           'sofaTier', sofa_tier, 'bedframeTier', bedframe_tier,
           'active', active, 'sortOrder', sort_order) order by sort_order), '[]'::jsonb)
    into v_snapshot
    from public.catalog_fabrics;

  insert into public.catalog_config_history (section, snapshot, effective_from, notes, created_by)
  values ('fabrics', v_snapshot, (timezone('Asia/Kuala_Lumpur', now()))::date,
          nullif(btrim(coalesce(p_notes, '')), ''), (select auth.uid()));

  return jsonb_build_object('ok', true, 'count', v_count, 'snapshot', v_snapshot);
end;
$$;

-- 0527 grants survive create or replace; restate them so this file stands alone.
revoke all on function public.catalog_fabrics_batch_save(jsonb, text) from public, anon;
grant execute on function public.catalog_fabrics_batch_save(jsonb, text) to authenticated;

do $fabric_0721$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'catalog_fabrics'
         and column_name in ('price_sen','soh_sen','po_outstanding_sen','last_month_usage_sen',
                             'one_week_usage_sen','two_weeks_usage_sen','one_month_usage_sen',
                             'shortage_sen','reorder_point_sen','lead_time_days')) <> 10
     or position('reorderPointSen' in pg_get_functiondef(
          'public.catalog_fabrics_batch_save(jsonb, text)'::regprocedure)) = 0
     or has_function_privilege('anon', 'public.catalog_fabrics_batch_save(jsonb, text)', 'EXECUTE') then
    raise exception '0721: fabric stock columns are not as intended';
  end if;
end;
$fabric_0721$;

commit;
