-- ============================================================================
-- 0429 — an invoice asks for money, and keeps its lineage
--        (docs/payment/MASTER.md §4 · §16, owner instruction 2026-09-06)
--
-- The MASTER's document law: an Invoice asks for money; an issued invoice is
-- never edited — correction voids it and issues a linked replacement; Sales,
-- Storage and Additional Storage invoices share one governed numbering and
-- immutable document service.
--
-- Measured before this migration:
--   * `invoices` knows only invoice_no · order_id · amount · tax · issued_at ·
--     voided_at — no draft, no kind, no lineage, no snapshot, no actors.
--   * The only live writer is the 0098 dispatch trigger (live prosrc fires on
--     operation_stage -> 'dispatched'), minting `INV-YYYY-NNNNNN` — a scheme
--     the document-number law (PREFIX-DDMMYY-NNNN, Jess 2026-07-19) retired.
--   * `payment_allocations` links money to the ORDER only; the MASTER's model
--     allocates a payment to invoice obligations.
--
-- This migration gives the invoice its lifecycle and doors:
--   §1  columns: kind · status · snapshot · lineage · actors · reason
--   §2  one live sales invoice per order; allocations may name an invoice
--   §3  payment_invoice_prepare  — the idempotent draft door
--   §4  payment_invoice_issue    — number + snapshot + issue, once
--   §5  payment_invoice_void_replace — Payment Approver duty; lineage kept
--   §6  the dispatch trigger adopts a prepared invoice instead of minting a
--       duplicate, and mints on the governed DDMMYY scheme when none exists
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1 · the lifecycle columns
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists kind text not null default 'sales'
    check (kind in ('sales', 'storage', 'additional_storage')),
  add column if not exists status text not null default 'issued'
    check (status in ('draft', 'issued', 'voided')),
  add column if not exists snapshot jsonb,
  add column if not exists replaces_invoice_id uuid references public.invoices(id),
  add column if not exists created_by uuid references public.app_users(id),
  add column if not exists issued_by uuid references public.app_users(id),
  add column if not exists voided_by uuid references public.app_users(id),
  add column if not exists void_reason text;

comment on column public.invoices.kind is
  '0429: Sales Invoice, Storage Invoice or Additional Storage Invoice — one governed numbering and document service (payment/MASTER.md §4).';
comment on column public.invoices.status is
  '0429: draft -> issued -> voided. A draft may be edited and issued; an issued invoice is never edited — correction voids it and drafts a linked replacement.';
comment on column public.invoices.snapshot is
  '0429: the immutable document content captured at issue. Reprint reads this snapshot, never live order data.';
comment on column public.invoices.replaces_invoice_id is
  '0429: correction lineage — this invoice was drafted to replace the named voided invoice.';

-- Rows that existed before the lifecycle (the dispatch trigger inserts)
-- were issued documents; a stamped voided_at is the void truth.
update public.invoices set status = 'voided'
 where voided_at is not null and status = 'issued';

-- A draft has no number and no issue date yet.
alter table public.invoices alter column invoice_no drop not null;
alter table public.invoices alter column issued_at drop not null;
alter table public.invoices drop constraint if exists invoices_issued_facts_chk;
alter table public.invoices add constraint invoices_issued_facts_chk check (
  (status = 'draft' and invoice_no is null and issued_at is null)
  or (status in ('issued', 'voided') and invoice_no is not null and issued_at is not null)
);
alter table public.invoices drop constraint if exists invoices_void_facts_chk;
alter table public.invoices add constraint invoices_void_facts_chk check (
  status <> 'voided' or voided_at is not null
);

-- ---------------------------------------------------------------------------
-- 2 · one live sales invoice per order; allocations may name an invoice
-- ---------------------------------------------------------------------------

create unique index if not exists invoices_live_sales_per_order_uidx
  on public.invoices (order_id) where kind = 'sales' and status <> 'voided';

comment on index public.invoices_live_sales_per_order_uidx is
  '0429: an order carries at most ONE live Sales Invoice (draft or issued). Correction voids the old one before the replacement draft exists — the doors below serialise that.';

alter table public.payment_allocations
  add column if not exists invoice_id uuid references public.invoices(id);

comment on column public.payment_allocations.invoice_id is
  '0429: the invoice obligation this allocation settles. Null on rows recorded before invoices carried the obligation; the posting service starts naming it when collection converges on invoices.';

-- ---------------------------------------------------------------------------
-- 3 · the draft door — idempotent per order, editable while draft
-- ---------------------------------------------------------------------------

create or replace function public.payment_invoice_prepare(
  p_order_id uuid,
  p_amount numeric,
  p_tax_amount numeric default 0
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_existing invoices;
  v_row invoices;
begin
  if public.app_role() not in ('operation', 'finance', 'principal') then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  if p_order_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'order and a positive amount are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if coalesce(p_tax_amount, 0) < 0 then
    raise exception 'tax cannot be negative' using errcode = '22023', detail = 'invalid_input';
  end if;

  perform 1 from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;

  select * into v_existing from invoices
   where order_id = p_order_id and kind = 'sales' and status <> 'voided'
   limit 1;

  if found and v_existing.status = 'issued' then
    -- An issued invoice is never edited here; correction goes through
    -- payment_invoice_void_replace.
    return jsonb_build_object('already_issued', true, 'invoice', to_jsonb(v_existing));
  end if;

  if found then
    update invoices
       set amount = p_amount, tax_amount = coalesce(p_tax_amount, 0)
     where id = v_existing.id
     returning * into v_row;
    return jsonb_build_object('already_issued', false, 'invoice', to_jsonb(v_row));
  end if;

  insert into invoices (order_id, amount, tax_amount, kind, status, created_by)
  values (p_order_id, p_amount, coalesce(p_tax_amount, 0), 'sales', 'draft', auth.uid())
  returning * into v_row;

  return jsonb_build_object('already_issued', false, 'invoice', to_jsonb(v_row));
end;
$fn$;

comment on function public.payment_invoice_prepare(uuid, numeric, numeric) is
  '0429: the one draft door. Idempotent per order — returns the live Sales Invoice when one exists, edits the draft amount, and never touches an issued document.';

-- ---------------------------------------------------------------------------
-- 4 · the issue door — number + snapshot, once
-- ---------------------------------------------------------------------------

create or replace function public.payment_invoice_issue(
  p_invoice_id uuid,
  p_snapshot jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_inv invoices;
  v_no text;
  v_seq integer := 1;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if public.app_role() not in ('operation', 'finance', 'principal') then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  if p_snapshot is null or p_snapshot = '{}'::jsonb then
    raise exception 'the document snapshot is required'
      using errcode = '22023', detail = 'snapshot_required';
  end if;

  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = '22023', detail = 'invoice_not_found';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'only a draft invoice can be issued'
      using errcode = '22023', detail = 'not_a_draft';
  end if;

  -- The governed document scheme: PREFIX-DDMMYY-NNNN, hashed tail, collision
  -- retry — the same arithmetic the receipt number uses (0351).
  loop
    v_no := 'INV-' || to_char(v_today, 'DDMMYY') || '-' ||
            lpad(mod(abs(hashtext(v_inv.id::text || ':' || v_seq::text)), 10000)::text, 4, '0');
    exit when not exists (select 1 from invoices where invoice_no = v_no);
    v_seq := v_seq + 1;
  end loop;

  update invoices
     set status = 'issued', invoice_no = v_no, issued_at = v_today,
         issued_by = auth.uid(),
         snapshot = p_snapshot || jsonb_build_object('invoice_no', v_no, 'issued_at', v_today)
   where id = v_inv.id
   returning * into v_inv;

  -- The order wears its live Sales Invoice number.
  if v_inv.kind = 'sales' then
    update orders set invoice_no = v_no, invoiced_at = v_today
     where id = v_inv.order_id;
  end if;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (v_inv.order_id,
          format('Invoice issued · %s (RM %s)', v_no, v_inv.amount),
          public.app_role(), auth.uid());

  return jsonb_build_object('invoice', to_jsonb(v_inv));
end;
$fn$;

comment on function public.payment_invoice_issue(uuid, jsonb) is
  '0429: draft -> issued, once. Mints the governed INV-DDMMYY-NNNN number, stores the immutable snapshot, stamps the order. An issued invoice never changes again.';

-- ---------------------------------------------------------------------------
-- 5 · the correction door — void + linked replacement draft
-- ---------------------------------------------------------------------------

create or replace function public.payment_invoice_void_replace(
  p_invoice_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_inv invoices;
  v_replacement invoices;
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('payment_approver', null);
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is required to void an invoice'
      using errcode = '22023', detail = 'reason_required';
  end if;
  -- Payment Approver duty (or its dated cover) corrects money documents;
  -- principal keeps the owner override (workspace/MASTER.md §3). An unassigned
  -- duty resolves a NULL actor — coalesce, or three-valued logic waves the
  -- refusal through (caught by this migration's own negative control).
  if not (coalesce(public.app_role() = 'principal', false)
          or (v_uid is not null
              and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false))) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_approver';
  end if;

  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = '22023', detail = 'invoice_not_found';
  end if;
  if v_inv.status <> 'issued' then
    raise exception 'only an issued invoice can be voided'
      using errcode = '22023', detail = 'not_issued';
  end if;

  perform 1 from orders where id = v_inv.order_id for update;

  update invoices
     set status = 'voided', voided_at = v_today, voided_by = v_uid,
         void_reason = btrim(p_reason)
   where id = v_inv.id
   returning * into v_inv;

  -- The order stops wearing the voided number; the replacement earns its own
  -- at issue.
  if v_inv.kind = 'sales' then
    update orders set invoice_no = null, invoiced_at = null
     where id = v_inv.order_id and invoice_no = v_inv.invoice_no;
  end if;

  insert into invoices
    (order_id, amount, tax_amount, kind, status, replaces_invoice_id, created_by)
  values
    (v_inv.order_id, v_inv.amount, v_inv.tax_amount, v_inv.kind, 'draft', v_inv.id, v_uid)
  returning * into v_replacement;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (v_inv.order_id,
          format('Invoice %s voided · %s · replacement draft created',
                 v_inv.invoice_no, btrim(p_reason)),
          public.app_role(), v_uid);

  return jsonb_build_object('voided', to_jsonb(v_inv),
                            'replacement', to_jsonb(v_replacement));
end;
$fn$;

comment on function public.payment_invoice_void_replace(uuid, text) is
  '0429: correction never edits an issued invoice — it voids it (reason, actor, date kept) and drafts the linked replacement. Payment Approver duty or principal only.';

-- ---------------------------------------------------------------------------
-- 6 · the dispatch trigger adopts a prepared invoice
-- ---------------------------------------------------------------------------

create or replace function public.orders_auto_issue_on_dispatched()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_amount     numeric(12,2);
  v_invoice_no text;
  v_actor_uid  uuid;
  v_live       invoices;
  v_has_live   boolean := false;
  v_seq        integer := 1;
  v_today      date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if new.operation_stage is not distinct from old.operation_stage then
    return new;
  end if;
  if new.operation_stage is distinct from 'dispatched' then
    return new;
  end if;

  v_actor_uid := (select auth.uid());

  if new.do_number is null then
    new.do_number := 'DO-' || lpad(new.so::text, 6, '0');
  end if;

  if new.invoice_no is null then
    select * into v_live from invoices
     where order_id = new.id and kind = 'sales' and status <> 'voided'
     limit 1;
    v_has_live := found;

    if v_has_live and v_live.status = 'issued' then
      -- 0429: a prepared, issued invoice already asks for this money — the
      -- order adopts its number instead of minting a duplicate document.
      new.invoice_no  := v_live.invoice_no;
      new.invoiced_at := v_live.issued_at;
      return new;
    end if;

    select
      coalesce(sum(ol.qty * ol.unit_price), 0) +
      coalesce((select sum(oa.qty * oa.unit_price) from order_addons oa where oa.order_id = new.id), 0)
    into v_amount
    from order_lines ol
    where ol.order_id = new.id;

    loop
      v_invoice_no := 'INV-' || to_char(v_today, 'DDMMYY') || '-' ||
                      lpad(mod(abs(hashtext(new.id::text || ':' || v_seq::text)), 10000)::text, 4, '0');
      exit when not exists (select 1 from invoices where invoice_no = v_invoice_no);
      v_seq := v_seq + 1;
    end loop;

    if v_has_live then
      -- Issue the prepared draft at dispatch rather than inserting a twin.
      update invoices
         set status = 'issued', invoice_no = v_invoice_no, issued_at = v_today,
             issued_by = v_actor_uid,
             snapshot = coalesce(snapshot, '{}'::jsonb)
               || jsonb_build_object('invoice_no', v_invoice_no, 'issued_at', v_today,
                                     'issued_on_dispatch', true)
       where id = v_live.id;
      v_amount := v_live.amount;
    else
      insert into invoices (invoice_no, order_id, amount, tax_amount, issued_at,
                            kind, status, issued_by)
      values (v_invoice_no, new.id, v_amount, 0, v_today, 'sales', 'issued', v_actor_uid)
      on conflict (invoice_no) do nothing;
    end if;

    new.invoice_no  := v_invoice_no;
    new.invoiced_at := v_today;

    insert into order_history (order_id, text, by_role, by_user_id)
    values (new.id,
            format('Sales Invoice auto-issued on dispatch · %s (RM %s)', v_invoice_no, v_amount),
            'operation', v_actor_uid);

    insert into audit_log (role, actor_text, action, ref)
    values ('operation',
            coalesce((select name from app_users where id = v_actor_uid), 'System'),
            format('Auto-issued invoice %s on dispatch of order #%s (RM %s)',
                   v_invoice_no, new.so, v_amount),
            new.id::text);
  end if;

  if new.do_number is distinct from old.do_number then
    insert into order_history (order_id, text, by_role, by_user_id)
    values (new.id,
            format('Carres DO number assigned on dispatch · %s', new.do_number),
            'operation', v_actor_uid);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7 · grants and sanity
-- ---------------------------------------------------------------------------

revoke all on function public.payment_invoice_prepare(uuid, numeric, numeric) from public, anon;
grant execute on function public.payment_invoice_prepare(uuid, numeric, numeric) to authenticated;
revoke all on function public.payment_invoice_issue(uuid, jsonb) from public, anon;
grant execute on function public.payment_invoice_issue(uuid, jsonb) to authenticated;
revoke all on function public.payment_invoice_void_replace(uuid, text) from public, anon;
grant execute on function public.payment_invoice_void_replace(uuid, text) to authenticated;

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('payment_invoice_prepare', 'payment_invoice_issue',
                       'payment_invoice_void_replace');
  if v <> 3 then raise exception 'sanity: % of 3 invoice doors exist', v; end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public'
      and indexname = 'invoices_live_sales_per_order_uidx'
  ) then
    raise exception 'sanity: the live-sales-invoice uniqueness is missing';
  end if;
end $$;

commit;
