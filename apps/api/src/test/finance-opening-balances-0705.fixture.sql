-- 0705's PGlite fixture (apps/api/src/test/finance-opening-balances-0705.test.ts).
-- Upstream tables are minimal. The functions 0705 rewrites are production's
-- (read 2026-10-22), shortened to what this test runs and keeping, exactly,
-- every text 0705 replaces; their helpers are stubs. The migration's own
-- rewrite helper refuses unless each text is found once, here as on production.
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create type public.app_role as enum ('finance', 'principal', 'operation');
create table public.app_users (id uuid primary key, name text, role public.app_role);
create function public.app_role() returns public.app_role language sql stable as $$
  select u.role from public.app_users u where u.id = auth.uid() $$;
create function public.is_principal() returns boolean language sql stable as $$
  select coalesce(public.app_role() = 'principal', false) $$;
create function public.gl_may_read() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.app_role() in ('finance','principal'), false) $$;
create table public.audit_log (id uuid primary key default gen_random_uuid(), role public.app_role, actor_text text,
  action text not null, dealer_id uuid, ref text, occurred_at timestamptz not null default now());

create table public.gl_config (id boolean primary key check (id), go_live_on date, books_closed_through date,
  updated_at timestamptz, updated_by uuid);
insert into public.gl_config (id, go_live_on) values (true, date '2026-09-10');
create table public.gl_accounts (code text primary key, name text not null, kind text not null, parent_code text,
  is_active boolean not null default true, is_control boolean not null default false, control_for text,
  created_at timestamptz default now(), sort_order integer not null default 0, is_heading boolean not null default false,
  section text, special text, money_in_use boolean);
insert into public.gl_accounts (code, name, kind, is_control, control_for, special) values
  ('150-0000','RETAINED EARNING','EQUITY',false,null,'SRE'),
  ('160-0000','OPENING BALANCE','EQUITY',false,null,null),
  ('300-1000','SHOWROOM DEBTORS','ASSET',true,'CUSTOMER','SDC'),
  ('300-3000','SUBSCRIPTION DEBTORS','ASSET',true,'CUSTOMER','SDC'),
  ('305-0000','OTHER DEBTOR','ASSET',true,'OTHER','SDC'),
  ('310-2000','HONG LEONG BANK','ASSET',false,null,'SBK'),
  ('320-0000','CASH IN HAND','ASSET',false,null,'SCH'),
  ('330-0000','STOCK','ASSET',false,null,'SBS'),
  ('400-0000','TRADE CREDITORS','LIABILITY',true,'SUPPLIER','SCC'),
  ('500-0000','SALES','INCOME',false,null,null),
  ('900-0001','RENT','EXPENSE',false,null,null);
create table public.gl_account_roles (role text primary key, account_code text);
insert into public.gl_account_roles values ('OPENING_BALANCE_EQUITY','160-0000'),('STOCK','330-0000'),
  ('SUPPLIER_ADVANCE','1230'),('SHOWROOM_DEBTORS','300-1000'),('SUBSCRIPTION_DEBTORS','300-3000'),
  ('TRADE_PAYABLE','400-0000'),('RETAINED_EARNINGS','150-0000');
create table public.gl_entries (id uuid primary key default gen_random_uuid(), entry_no text unique not null, entry_date date not null,
  source_type text not null, source_doc_no text not null, narration text, total_debit numeric(14,2) not null, total_credit numeric(14,2) not null,
  posted boolean not null default false, reversed boolean not null default false, reversed_by uuid references public.gl_entries(id),
  reverses uuid references public.gl_entries(id), created_at timestamptz default now(), created_by uuid references public.app_users(id),
  check (total_debit = total_credit), check (total_debit > 0));
create unique index gl_entries_one_active_per_source on public.gl_entries (source_type, source_doc_no) where posted and not reversed;
create table public.gl_entry_lines (id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.gl_entries(id),
  line_no int not null, account_code text not null references public.gl_accounts(code) on update cascade,
  debit numeric(14,2) not null default 0, credit numeric(14,2) not null default 0, party_type text, party_id uuid, memo text,
  department_type text, department_id uuid, unique (entry_id, line_no),
  check ((debit = 0) <> (credit = 0)), check ((party_type is null) = (party_id is null)));
create table public.gl_doc_series (prefix text primary key, description text);
insert into public.gl_doc_series values ('JE','Journal entry');
create table public.gl_doc_counters (prefix text, period text, next_value int, primary key (prefix, period));

create function public.gl_next_doc_no(p_prefix text, p_on_date date) returns text language plpgsql security definer set search_path = public, pg_temp as $function$
declare v_prefix text; v_period text; v_number integer;
begin
  v_prefix := upper(btrim(coalesce(p_prefix, '')));
  if not exists (select 1 from gl_doc_series s where s.prefix = v_prefix) then
    raise exception 'document prefix % is not registered in gl_doc_series', v_prefix using errcode = '22023', detail = 'unknown_prefix';
  end if;
  v_period := to_char(p_on_date, 'YYYYMM');
  insert into gl_doc_counters (prefix, period, next_value) values (v_prefix, v_period, 2)
  on conflict (prefix, period) do update set next_value = gl_doc_counters.next_value + 1
  returning next_value - 1 into v_number;
  return v_prefix || '-' || v_period || '-' || lpad(v_number::text, 4, '0');
end; $function$;

create function public.gl_entries_refuse_closed_month() returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare v_closed date;
begin
  select c.books_closed_through into v_closed from public.gl_config c where c.id;
  if v_closed is null then return new; end if;
  if new.entry_date <= v_closed or (tg_op = 'UPDATE' and old.entry_date <= v_closed) then
    if new.source_type like '%\_REVERSAL' then
      raise exception 'The books are closed up to %. An entry dated % cannot be reversed.', v_closed, new.entry_date using errcode = '22023', detail = 'books_closed';
    end if;
    raise exception 'The books are closed up to %. Date this in an open month.', v_closed using errcode = '22023', detail = 'books_closed';
  end if;
  return new;
end; $function$;
create trigger gl_entries_refuse_closed_month_trg before insert or update of entry_date on public.gl_entries
  for each row execute function public.gl_entries_refuse_closed_month();

create function public.gl_account_for(p_role text) returns text language plpgsql stable security definer set search_path = public, pg_temp as $function$
declare v_code text;
begin
  select r.account_code into v_code from public.gl_account_roles r where r.role = p_role;
  if v_code is null then
    raise exception 'The chart has no account for %.', coalesce(p_role, 'that job') using errcode = '22023', detail = 'account_role_unmapped';
  end if;
  return v_code;
end; $function$;

create function public.gl_report_guard() returns date language plpgsql stable security definer set search_path = public, pg_temp as $function$
declare v_go_live date;
begin
  if not public.gl_may_read() then raise exception 'gl reports are internal only' using errcode = '42501'; end if;
  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  if v_go_live is null then raise exception 'no go-live' using errcode = '55000'; end if;
  return v_go_live;
end; $function$;

create function public.fin_rm(numeric) returns text language sql immutable as $$ select 'RM ' || to_char($1, 'FM999,999,999,990.00') $$;
create function public.pwp_phone_key(text) returns text language sql immutable as $$ select regexp_replace(coalesce($1,''), '[^0-9]', '', 'g') $$;

-- gl_post, production body (0580), the date check exactly as live.
create function public.gl_post(p_source_type text, p_source_doc_no text, p_entry_date date, p_narration text, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid         uuid;
  v_existing    uuid;
  v_go_live     date;
  v_count       int;
  v_elem        jsonb;
  v_idx         int := 0;
  v_code        text;
  v_active      boolean;
  v_control     boolean;
  v_control_for text;
  v_debit       numeric(12,2);
  v_credit      numeric(12,2);
  v_party_type  text;
  v_party_id    uuid;
  v_kind        text;
  v_heading     boolean;
  v_dept_type   text;
  v_dept_id     uuid;
  v_sum_debit   numeric(12,2) := 0;
  v_sum_credit  numeric(12,2) := 0;
  v_norm        jsonb := '[]'::jsonb;
  v_source_type text;
  v_doc_no      text;
  v_entry_no    text;
  v_entry_id    uuid;
begin
  v_uid := auth.uid();
  v_source_type := btrim(coalesce(p_source_type, ''));
  v_doc_no      := btrim(coalesce(p_source_doc_no, ''));
  if v_source_type = '' then
    raise exception 'gl_post refused: source_type is required' using errcode = '22023', detail = 'gl_post_source_type_blank';
  end if;
  if v_doc_no = '' then
    raise exception 'gl_post refused: source_doc_no is required for source_type %', v_source_type using errcode = '22023', detail = 'gl_post_source_doc_no_blank';
  end if;
  select e.id into v_existing from public.gl_entries e
   where e.source_type = v_source_type and e.source_doc_no = v_doc_no and e.posted and not e.reversed limit 1;
  if v_existing is not null then
    return v_existing;
  end if;
  if p_entry_date is null then
    raise exception 'gl_post refused: entry_date is required' using errcode = '22023', detail = 'gl_post_entry_date_null';
  end if;

  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  if v_go_live is null then
    raise exception 'gl_post refused: no go-live' using errcode = '22023', detail = 'gl_post_no_go_live';
  end if;
  if p_entry_date < v_go_live then
    raise exception 'gl_post refused: entry_date % is before the ledger go-live date %', p_entry_date, v_go_live
      using errcode = '22023', detail = 'gl_post_entry_date_before_go_live';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'gl_post refused: p_lines must be a JSON array' using errcode = '22023', detail = 'gl_post_lines_not_array';
  end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 2 then
    raise exception 'gl_post refused: an entry needs at least two lines' using errcode = '22023', detail = 'gl_post_too_few_lines';
  end if;
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    v_code := btrim(coalesce(v_elem->>'account_code', ''));
    select a.is_active, a.is_control, a.control_for, a.kind, a.is_heading
      into v_active, v_control, v_control_for, v_kind, v_heading
      from public.gl_accounts a where a.code = v_code;
    if not found then
      raise exception 'gl_post refused: line % names account %, which is not in the chart', v_idx, v_code using errcode = '23503', detail = 'gl_post_account_unknown';
    end if;
    if not v_active then
      raise exception 'gl_post refused: inactive' using errcode = '22023', detail = 'gl_post_account_inactive';
    end if;
    if v_heading then
      raise exception 'gl_post refused: header' using errcode = '22023', detail = 'gl_post_account_is_header';
    end if;
    v_debit  := round(coalesce((v_elem->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_elem->>'credit')::numeric, 0), 2);
    if v_debit < 0 or v_credit < 0 then
      raise exception 'gl_post refused: negative' using errcode = '22023', detail = 'gl_post_line_negative';
    end if;
    if v_debit <> 0 and v_credit <> 0 then
      raise exception 'gl_post refused: two sided' using errcode = '22023', detail = 'gl_post_line_two_sided';
    end if;
    if v_debit = 0 and v_credit = 0 then
      raise exception 'gl_post refused: line % empty', v_idx using errcode = '22023', detail = 'gl_post_line_empty';
    end if;
    v_party_type := nullif(btrim(coalesce(v_elem->>'party_type','')), '');
    v_party_id := nullif(btrim(coalesce(v_elem->>'party_id','')), '')::uuid;
    if (v_party_type is null) <> (v_party_id is null) then
      raise exception 'gl_post refused: half party' using errcode = '22023', detail = 'gl_post_line_party_half_named';
    end if;
    if v_control and (v_party_type is null or v_party_id is null) then
      raise exception 'gl_post refused: control needs party' using errcode = '22023', detail = 'gl_post_control_account_needs_party';
    end if;
    if v_control and v_party_type is distinct from v_control_for then
      raise exception 'gl_post refused: wrong side' using errcode = '22023', detail = 'gl_post_party_type_wrong_side';
    end if;
    v_dept_type := nullif(btrim(coalesce(v_elem->>'department_type','')), '');
    v_dept_id := nullif(btrim(coalesce(v_elem->>'department_id','')), '')::uuid;
    v_sum_debit  := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;
    v_norm := v_norm || jsonb_build_object('line_no', v_idx, 'account_code', v_code, 'debit', v_debit, 'credit', v_credit,
      'party_type', v_party_type, 'party_id', v_party_id, 'memo', nullif(btrim(coalesce(v_elem->>'memo','')), ''),
      'department_type', v_dept_type, 'department_id', v_dept_id);
  end loop;
  if v_sum_debit <> v_sum_credit then
    raise exception 'gl_post refused: out of balance' using errcode = '23514', detail = 'gl_post_out_of_balance';
  end if;
  if v_sum_debit = 0 then
    raise exception 'gl_post refused: zero' using errcode = '22023', detail = 'gl_post_zero_total';
  end if;
  v_entry_no := public.gl_next_doc_no('JE', p_entry_date);
  insert into public.gl_entries (entry_no, entry_date, source_type, source_doc_no, narration, total_debit, total_credit, posted, created_by)
  values (v_entry_no, p_entry_date, v_source_type, v_doc_no, nullif(btrim(coalesce(p_narration,'')), ''), v_sum_debit, v_sum_credit, true,
          (select u.id from public.app_users u where u.id = v_uid))
  returning id into v_entry_id;
  insert into public.gl_entry_lines (entry_id, line_no, account_code, debit, credit, party_type, party_id, memo, department_type, department_id)
  select v_entry_id, (l->>'line_no')::int, l->>'account_code', (l->>'debit')::numeric, (l->>'credit')::numeric,
         l->>'party_type', (l->>'party_id')::uuid, l->>'memo', l->>'department_type', (l->>'department_id')::uuid
    from jsonb_array_elements(v_norm) l;
  return v_entry_id;
end;
$function$;

create function public.gl_reverse(p_entry_id uuid, p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_role app_role; v_uid uuid; v_orig public.gl_entries; v_lines jsonb; v_new_id uuid; v_reason text;
begin
  v_role := public.app_role(); v_uid := auth.uid();
  select * into v_orig from public.gl_entries where id = p_entry_id for update;
  if not found then raise exception 'not found' using errcode = '42P01', detail = 'gl_reverse_entry_not_found'; end if;
  if v_orig.reversed then raise exception 'already' using errcode = '22023', detail = 'gl_reverse_already_reversed'; end if;
  v_reason := nullif(btrim(coalesce(p_reason,'')), '');
  if v_reason is null then raise exception 'reason' using errcode = '22023', detail = 'gl_reverse_reason_blank'; end if;
  select jsonb_agg(jsonb_build_object('account_code', l.account_code, 'debit', l.credit, 'credit', l.debit,
           'party_type', l.party_type, 'party_id', l.party_id, 'memo', l.memo,
           'department_type', l.department_type, 'department_id', l.department_id) order by l.line_no)
    into v_lines from public.gl_entry_lines l where l.entry_id = v_orig.id;
  update public.gl_entries set reversed = true where id = v_orig.id;
  v_new_id := public.gl_post(v_orig.source_type || '_REVERSAL', v_orig.source_doc_no, v_orig.entry_date,
    format('Reversal of %s — %s', v_orig.entry_no, v_reason), v_lines);
  update public.gl_entries set reverses = v_orig.id where id = v_new_id;
  update public.gl_entries set reversed_by = v_new_id where id = v_orig.id;
  insert into audit_log (role, actor_text, action, ref) values (v_role, (select name from app_users where id = v_uid),
    format('Ledger entry reversed · %s · %s', v_orig.entry_no, v_reason), v_orig.source_doc_no);
  return v_new_id;
end;
$function$;

create function public.gl_ledger_health() returns table (check_key text, status text)
language plpgsql security definer set search_path = public, pg_temp as $function$
declare v_go_live date; v_pre_go_live bigint := 0;
begin
  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  select count(*) into v_pre_go_live
  from public.gl_entries e
  where e.posted
    and v_go_live is not null
    and e.entry_date < v_go_live;

  return query select 'entry_before_go_live'::text, case when v_pre_go_live = 0 then 'OK' else 'FAIL' end;
end;
$function$;

-- Parties and orders.
create table public.customers (id uuid primary key default gen_random_uuid(), name text, phone text, phone_key text unique,
  email text, address text, notes text, created_at timestamptz default now(), updated_at timestamptz, created_by uuid, stripe_customer_id text);
create table public.finance_parties (id uuid primary key default gen_random_uuid(), name text not null, kind text not null check (kind in ('company','person')),
  registration_no text, phone text, email text, address text, notes text, is_active boolean not null default true,
  created_at timestamptz default now(), created_by uuid, updated_at timestamptz, updated_by uuid);
create table public.suppliers (id uuid primary key default gen_random_uuid(), name text, kind text default 'supplier');
create table public.dealers (id uuid primary key default gen_random_uuid(), name text, channel text);
create table public.orders (id uuid primary key default gen_random_uuid(), so integer unique, customer_name text, customer_phone text,
  delivered_at timestamptz, dealer_id uuid, outlet_id uuid, source_system text);
create view public.fin_order_channels as select o.id as order_id, 'SHOWROOM'::text as department_type, null::uuid as department_id from public.orders o;
create table public.fin_dealer_debtor_accounts (dealer_id uuid primary key, account_code text not null unique);
create function public._fin_dealer_debtor_account(uuid) returns text language sql as $$ select '300-1000'::text $$;
create view public.gl_line_departments as select l.id as line_id, l.entry_id, l.department_type, l.department_id
  from public.gl_entry_lines l where l.department_type is not null;

create function public.gl_ar_account_for_order(p_order_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_type text; v_id uuid;
begin
  select c.department_type, c.department_id into v_type, v_id from public.fin_order_channels c where c.order_id = p_order_id;
  if v_type = 'SUBSCRIPTION' then return public.gl_account_for('SUBSCRIPTION_DEBTORS');
  elsif v_type = 'DEALER' then return public._fin_dealer_debtor_account(v_id);
  end if;
  return public.gl_account_for('SHOWROOM_DEBTORS');
end;
$function$;

create function public.gl_customer_party_for_order(p_order_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_order orders; v_phone_key text; v_id uuid;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found'; end if;
  v_phone_key := case when coalesce(v_order.customer_phone, '') !~ '[^[:space:]]' then null else public.pwp_phone_key(v_order.customer_phone) end;
  if v_phone_key is null or v_phone_key = '' then
    raise exception 'no phone' using errcode = '22023', detail = 'customer_identity_required';
  end if;
  select c.id into v_id from customers c where c.phone_key = v_phone_key;
  if found then return v_id; end if;
  insert into customers (name, phone, phone_key, created_by)
  values (coalesce(nullif(btrim(v_order.customer_name), ''), 'Customer'), v_order.customer_phone, v_phone_key, auth.uid())
  on conflict (phone_key) do nothing returning id into v_id;
  if v_id is null then select c.id into v_id from customers c where c.phone_key = v_phone_key; end if;
  return v_id;
end;
$function$;

-- AR sources.
create table public.invoices (id uuid primary key default gen_random_uuid(), invoice_no text, kind text, order_id uuid, issued_at date,
  amount numeric, tax_amount numeric, status text, voided_at timestamptz);
create table public.order_payments (id uuid primary key default gen_random_uuid(), order_id uuid, amount numeric, paid_on date, voided_at timestamptz, receipt_no text, kind text);
create table public.other_debtor_invoices (id uuid primary key default gen_random_uuid(), party_id uuid, invoice_no text, invoice_date date, due_date date, total_amount numeric, status text);
create table public.other_receipts (id uuid primary key default gen_random_uuid(), status text, receipt_date date);
create table public.other_receipt_allocations (receipt_id uuid, invoice_id uuid, amount numeric);

-- AP sources.
create table public.supplier_bills (id uuid primary key default gen_random_uuid(), bill_no text, supplier_invoice_no text, supplier_id uuid,
  bill_date date, due_date date, total_amount numeric, status text, ap_account_code text);
create table public.supplier_debit_notes (id uuid primary key default gen_random_uuid(), note_no text, supplier_note_no text, supplier_id uuid,
  note_date date, due_date date, total_amount numeric, status text, ap_account_code text);
create function public.ap_debit_note_settled(p_as_at date default null) returns table (debit_note_id uuid, paid numeric)
  language sql stable as $$ select null::uuid, null::numeric where false $$;
create table public.payment_vouchers (id uuid primary key default gen_random_uuid(), voucher_no text, purpose text, supplier_id uuid,
  payee_name text, voucher_date date, amount numeric(12,2), advance_amount numeric(12,2) default 0, ap_account_code text,
  pay_method text, pay_reference text, pay_from_account_code text, narration text, status text, created_by uuid,
  prepared_by uuid, gl_entry_id uuid, approved_at timestamptz, approved_by uuid);
create table public.payment_voucher_lines (voucher_id uuid, line_no int, account_code text, description text, amount numeric,
  department_type text, department_id uuid);
create table public.payment_voucher_allocations (id uuid primary key default gen_random_uuid(), voucher_id uuid, bill_id uuid,
  amount_applied numeric, created_by uuid);
create table public.payment_voucher_debit_note_allocations (id uuid primary key default gen_random_uuid(), voucher_id uuid,
  debit_note_id uuid, amount_applied numeric, created_by uuid);
create table public.supplier_advance_applications (bill_id uuid, amount numeric, status text, created_at timestamptz, cancelled_at timestamptz);
create table public.supplier_credit_notes (id uuid primary key, note_date date);
create table public.supplier_credit_note_applications (note_id uuid, bill_id uuid, amount numeric, status text, created_at timestamptz, cancelled_at timestamptz);

CREATE FUNCTION public.ap_bill_settled(p_as_at date DEFAULT NULL::date)
 RETURNS TABLE(bill_id uuid, paid numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select x.bid, coalesce(sum(x.amount), 0)::numeric(12,2)
    from (
      select al.bill_id as bid, al.amount_applied as amount
        from public.payment_voucher_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status = 'approved'
         and (p_as_at is null or pv.voucher_date <= p_as_at)
      union all
      select ap.bill_id, ap.amount
        from public.supplier_advance_applications ap
       where (p_as_at is null and ap.status = 'applied')
      union all
      select ca.bill_id, ca.amount
        from public.supplier_credit_note_applications ca
        join public.supplier_credit_notes cn on cn.id = ca.note_id
       where (p_as_at is null and ca.status = 'applied')
    ) x
   group by x.bid
$function$;

CREATE FUNCTION public.fin_ap_aging(p_as_at date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_go_live date;
  v_out     jsonb;
begin
  v_go_live := public.gl_report_guard();
  if p_as_at is null then
    raise exception 'fin_ap_aging: p_as_at is required'
      using errcode = '22004';
  end if;

  with ctl as (
    select a.code, a.name
      from public.gl_accounts a
     where a.is_control and a.control_for = 'SUPPLIER'
  ),
  ln as (
    select l.account_code, l.party_id, l.debit, l.credit
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
     where e.posted
       and e.entry_date <= p_as_at
       and l.account_code in (select code from ctl)
  ),
  ctl_balance as (
    select c.code, c.name, coalesce(sum(ln.credit - ln.debit), 0) as balance
      from ctl c
      left join ln on ln.account_code = c.code
     group by c.code, c.name
  ),
  party_balance as (
    select ln.party_id as supplier_id, sum(ln.credit - ln.debit) as balance
      from ln
     group by ln.party_id
  ),
  settled as (
    select s.bill_id, s.paid from public.ap_bill_settled(p_as_at) s
  ),
  open_bills as (
    select b.id, b.bill_no, b.supplier_invoice_no, b.supplier_id, b.bill_date, b.due_date,
           b.total_amount, b.total_amount - coalesce(st.paid, 0) as open, 'bill'::text as kind
      from public.supplier_bills b
      left join settled st on st.bill_id = b.id
     where b.status = 'confirmed'
       and b.bill_date <= p_as_at
       and b.ap_account_code in (select code from ctl)
    union all
    -- 0681: a supplier debit note is owed like a bill, aged by its own dates.
    select d.id, d.note_no, d.supplier_note_no, d.supplier_id, d.note_date, d.due_date,
           d.total_amount, d.total_amount - coalesce(ds.paid, 0), 'debit_note'::text
      from public.supplier_debit_notes d
      left join public.ap_debit_note_settled(p_as_at) ds on ds.debit_note_id = d.id
     where d.status = 'confirmed'
       and d.note_date <= p_as_at
       and d.ap_account_code in (select code from ctl)
  ),
  parties as (
    select pb.supplier_id from party_balance pb where pb.balance <> 0
    union
    select ob.supplier_id from open_bills ob where ob.open > 0
  )
  select jsonb_build_object(
    'as_at',      p_as_at,
    'go_live_on', v_go_live,
    'controls',   coalesce((select jsonb_agg(jsonb_build_object(
                     'account_code', cb.code, 'name', cb.name, 'balance', cb.balance) order by cb.code)
                     from ctl_balance cb), '[]'::jsonb),
    'suppliers',  coalesce((
      select jsonb_agg(jsonb_build_object(
               'supplier_id', p.supplier_id,
               'name',        s.name,
               'kind',        s.kind,
               'balance',     coalesce(pb.balance, 0),
               'bills',       coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'bill_id',             ob.id,
                          'bill_no',             ob.bill_no,
                          'supplier_invoice_no', ob.supplier_invoice_no,
                          'bill_date',           ob.bill_date,
                          'due_date',            ob.due_date,
                          'total',               ob.total_amount,
                          'open',                ob.open,
                          'kind',                ob.kind)
                        order by ob.bill_date, ob.bill_no)
                   from open_bills ob
                  where ob.supplier_id = p.supplier_id and ob.open > 0), '[]'::jsonb))
             order by s.name, p.supplier_id)
        from parties p
        left join public.suppliers s on s.id = p.supplier_id
        left join party_balance pb on pb.supplier_id = p.supplier_id), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$function$;

CREATE FUNCTION public.fin_ar_aging(p_as_at date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_go_live date;
  v_out     jsonb;
begin
  v_go_live := public.gl_report_guard();
  if p_as_at is null then
    raise exception 'fin_ar_aging: p_as_at is required'
      using errcode = '22004';
  end if;

  with ctl as (
    select a.code, a.name
      from public.gl_accounts a
     where a.is_control
       and a.kind = 'ASSET'
       and a.control_for in ('CUSTOMER', 'OTHER')
  ),
  ln as (
    select l.id as line_id, l.account_code, l.party_type, l.party_id, l.debit, l.credit
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
     where e.posted
       and e.entry_date <= p_as_at
       and l.account_code in (select code from ctl)
  ),
  ctl_balance as (
    select c.code, c.name, coalesce(sum(ln.debit - ln.credit), 0) as balance
      from ctl c
      left join ln on ln.account_code = c.code
     group by c.code, c.name
  ),
  party_balance as (
    select ln.party_type, ln.party_id, sum(ln.debit - ln.credit) as balance
      from ln
     where ln.party_id is not null
     group by ln.party_type, ln.party_id
  ),
  -- 0690: the channels a debtor's balance sits in, by the department the
  -- reports give each line (gl_line_departments). RM 0.00 in a channel is no
  -- channel.
  party_channel as (
    select ln.party_type, ln.party_id, d.department_type, d.department_id,
           sum(ln.debit - ln.credit) as amount
      from ln
      join public.gl_line_departments d on d.line_id = ln.line_id
     where ln.party_id is not null
     group by ln.party_type, ln.party_id, d.department_type, d.department_id
    having sum(ln.debit - ln.credit) <> 0
  ),
  -- A customer's invoices, on the books' own window.
  cust_inv as (
    select i.id, i.invoice_no, i.kind, i.order_id, i.issued_at as invoice_date,
           round(i.amount + coalesce(i.tax_amount, 0), 2) as total
      from public.invoices i
     where i.status = 'issued'
       and i.voided_at is null
       and i.issued_at >= v_go_live
       and i.issued_at <= p_as_at
  ),
  cust_paid as (
    select p.order_id, sum(p.amount) as paid
      from public.order_payments p
     where p.voided_at is null
       and p.paid_on >= v_go_live
       and p.paid_on <= p_as_at
     group by p.order_id
  ),
  -- What the order has paid fills its earliest invoice first.
  cust_open as (
    select ci.id, ci.invoice_no, ci.kind, ci.order_id, ci.invoice_date, ci.total,
           greatest(0, least(ci.total,
             sum(ci.total) over (partition by ci.order_id
                                 order by ci.invoice_date, ci.invoice_no
                                 rows between unbounded preceding and current row)
             - coalesce(cp.paid, 0))) as open
      from cust_inv ci
      left join cust_paid cp on cp.order_id = ci.order_id
  ),
  open_inv as (
    select 'CUSTOMER'::text as party_type,
           coalesce(
             (select l.party_id
                from public.gl_entries e
                join public.gl_entry_lines l on l.entry_id = e.id and l.party_type = 'CUSTOMER'
               where e.source_type = 'SALES_INVOICE'
                 and e.source_doc_no = co.invoice_no
                 and e.posted
                 and not e.reversed
               order by l.line_no
               limit 1),
             (select c.id from public.customers c
               where c.phone_key = public.pwp_phone_key(o.customer_phone))) as party_id,
           co.id as invoice_id, co.invoice_no, co.kind, co.order_id, o.so,
           co.invoice_date, null::date as due_date, co.total, co.open,
           ch.department_type, ch.department_id
      from cust_open co
      join public.orders o on o.id = co.order_id
      left join public.fin_order_channels ch on ch.order_id = co.order_id
     where co.open > 0
    union all
    -- An other debtor's invoices.
    select 'OTHER', x.party_id, x.id, x.invoice_no, 'other', null::uuid, null::integer,
           x.invoice_date, x.due_date, x.total_amount, x.open, null::text, null::uuid
      from (
        select i.id, i.party_id, i.invoice_no, i.invoice_date, i.due_date, i.total_amount,
               i.total_amount - coalesce((select sum(a.amount)
                                            from public.other_receipt_allocations a
                                            join public.other_receipts r on r.id = a.receipt_id
                                           where a.invoice_id = i.id
                                             and r.status = 'posted'
                                             and r.receipt_date <= p_as_at), 0) as open
          from public.other_debtor_invoices i
         where i.status = 'issued'
           and i.invoice_date >= v_go_live
           and i.invoice_date <= p_as_at
      ) x
     where x.open > 0
  ),
  parties as (
    select pb.party_type, pb.party_id from party_balance pb where pb.balance <> 0
    union
    select oi.party_type, oi.party_id from open_inv oi
  )
  select jsonb_build_object(
    'as_at',      p_as_at,
    'go_live_on', v_go_live,
    'controls',   coalesce((select jsonb_agg(jsonb_build_object(
                     'account_code', cb.code, 'name', cb.name, 'balance', cb.balance) order by cb.code)
                     from ctl_balance cb), '[]'::jsonb),
    'debtors',    coalesce((
      select jsonb_agg(jsonb_build_object(
               'party_type', p.party_type,
               'party_id',   p.party_id,
               'name',       case p.party_type when 'CUSTOMER' then cu.name else fp.name end,
               'kind',       case p.party_type when 'CUSTOMER' then 'customer' else fp.kind end,
               'balance',    coalesce(pb.balance, 0),
               'channels',   coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'department_type', pc.department_type,
                          'department_id',   pc.department_id,
                          'amount',          pc.amount)
                        order by pc.department_type, pc.department_id)
                   from party_channel pc
                  where pc.party_type = p.party_type
                    and pc.party_id is not distinct from p.party_id), '[]'::jsonb),
               'invoices',   coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'invoice_id',      oi.invoice_id,
                          'invoice_no',      oi.invoice_no,
                          'kind',            oi.kind,
                          'order_id',        oi.order_id,
                          'so',              oi.so,
                          'invoice_date',    oi.invoice_date,
                          'due_date',        oi.due_date,
                          'total',           oi.total,
                          'open',            oi.open,
                          'department_type', oi.department_type,
                          'department_id',   oi.department_id)
                        order by oi.invoice_date, oi.invoice_no)
                   from open_inv oi
                  where oi.party_type = p.party_type
                    and oi.party_id is not distinct from p.party_id), '[]'::jsonb))
             order by case p.party_type when 'CUSTOMER' then cu.name else fp.name end, p.party_type, p.party_id)
        from parties p
        left join public.customers cu on p.party_type = 'CUSTOMER' and cu.id = p.party_id
        left join public.finance_parties fp on p.party_type = 'OTHER' and fp.id = p.party_id
        left join party_balance pb on pb.party_type = p.party_type and pb.party_id = p.party_id), '[]'::jsonb),
    'before_go_live', (
      select jsonb_build_object('count', count(*),
                                'amount', coalesce(sum(round(i.amount + coalesce(i.tax_amount, 0), 2)), 0))
        from public.invoices i
       where i.status = 'issued'
         and i.voided_at is null
         and i.issued_at < v_go_live)
  ) into v_out;

  return v_out;
end;
$function$;

-- Stock sources.
create table public.ops_stock_items (id uuid primary key default gen_random_uuid(), unit_code text unique, sku text, qty integer default 1,
  identity_scope text, po_no text, po_line_id uuid, status text, warehouse_id uuid, holder_party_id uuid, ownership text,
  created_at timestamptz default now());
create table public.stock_unit_events (unit_id uuid, event text, event_at timestamptz, from_value text, seq bigint);
create table public.warehouses (id uuid primary key, name text, kind text);
create table public.stock_operating_parties (id uuid primary key, name text, kind text);
create table public.warehouse_site_profiles (site_id uuid, operating_party_id uuid);
create table public.purchase_order_lines (id uuid primary key, commercial_treatment text, cost numeric);
create table public.arrival_sources (id uuid primary key, kind text, cancelled_at timestamptz);
create table public.arrival_source_units (source_id uuid, stock_item_id uuid);
create table public.arrival_source_events (source_id uuid, kind text, occurred_at timestamptz, unit_ids uuid[]);

CREATE FUNCTION public.fin_stock_value(p_month_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cut   timestamptz;
  v_today date := timezone('Asia/Kuala_Lumpur', now())::date;
begin
  if not public.gl_may_read() then
    raise exception 'finance reports are internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  v_cut := (p_month_end + 1)::timestamp at time zone 'Asia/Kuala_Lumpur';

  return (
    with there as (
      select s.*
        from public.ops_stock_items s
        left join lateral (
          select min(e.event_at) as born_at
            from public.stock_unit_events e
           where e.unit_id = s.id and e.event = 'unit_born'
        ) b on true
       where coalesce(b.born_at, s.created_at) < v_cut
    ),
    held as (
      select t.id, t.unit_code, t.sku, t.qty, t.identity_scope, t.po_no, t.po_line_id, t.status,
             t.warehouse_id as site_id, t.holder_party_id as holder_id, t.ownership
        from there t
       where t.status in ('free', 'reserved', 'on_hold', 'transferred')
    ),
    placed as (
      select h.*,
             'warehouse'::text as bucket,
             case when pol.id is null then null
                  when pol.commercial_treatment = 'free_of_charge' then 0::numeric
                  else pol.cost end as unit_cost
        from held h
        left join public.purchase_order_lines pol on pol.id = h.po_line_id
    )
    select jsonb_build_object(
      'month_end', p_month_end,
      'units', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'unit_code', p.unit_code, 'qty', p.qty, 'unit_cost', p.unit_cost,
                 'value', case when p.unit_cost is null then null else round(p.qty * p.unit_cost, 2) end)
               order by p.unit_code)
          from placed p
         where p.ownership = 'carres_owned'), '[]'::jsonb))
  );
end;
$function$;

-- Payment vouchers: the functions 0705 rewrites, copied from production
-- (read 2026-10-22); their upstream helpers are stubs.
create function public._ap_require_account(text, text, text) returns void language sql as $$ select $$;
create function public.ap_refuse_before_go_live(date, text) returns void language sql as $$ select $$;
create function public._ap_event(text, uuid, text, text) returns void language sql as $$ select $$;
create function public.has_finance_approver(uuid) returns boolean language sql as $$ select true $$;
create function public.fin_line_department(jsonb, text, text, out department_type text, out department_id uuid)
  language sql as $$ select null::text, null::uuid $$;
create function public.ap_bill_paid(p_bill_id uuid default null) returns table (bill_id uuid, paid numeric(12,2), held numeric(12,2))
  language sql stable as $$ select null::uuid, null::numeric(12,2), null::numeric(12,2) where false $$;
create function public.ap_debit_note_paid(p_note_id uuid default null) returns table (debit_note_id uuid, paid numeric(12,2), held numeric(12,2))
  language sql stable as $$ select null::uuid, null::numeric(12,2), null::numeric(12,2) where false $$;
create function public.supplier_advance_open() returns table (supplier_id uuid, advance_open numeric)
  language sql stable as $$ select null::uuid, null::numeric where false $$;
create function public.supplier_credit_open() returns table (supplier_id uuid, credit_open numeric)
  language sql stable as $$ select null::uuid, null::numeric where false $$;
create function public.supplier_debit_open() returns table (supplier_id uuid, debit_open numeric)
  language sql stable as $$ select null::uuid, null::numeric where false $$;
create function public.pv_allocation_only_while_draft() returns trigger language plpgsql as $$
declare v_status text;
begin
  select v.status into v_status from public.payment_vouchers v where v.id = coalesce(new.voucher_id, old.voucher_id);
  if v_status is distinct from 'draft' then
    raise exception 'only while draft' using errcode = 'P0001', detail = 'voucher_not_draft';
  end if;
  return coalesce(new, old);
end $$;

-- Reduced to the text 0705 changes (the real ones list every field).
CREATE FUNCTION public.payment_voucher_document(p_voucher_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return jsonb_build_object(
    'voucher_id', p_voucher_id,
    -- 0681: the supplier debit notes it pays.
    'debit_notes', coalesce((
      select jsonb_agg(dl.debit_note_id) from public.payment_voucher_debit_note_allocations dl
       where dl.voucher_id = p_voucher_id), '[]'::jsonb));
end;
$function$;

CREATE FUNCTION public.payment_voucher_register() RETURNS TABLE(id uuid, docs text, one integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  select v.id,
         (select string_agg(x.doc_no, ', ' order by x.doc_date)
            from (select coalesce(dn.note_no, dn.supplier_note_no) as doc_no, dn.note_date as doc_date
                    from public.payment_voucher_debit_note_allocations dl
                    join public.supplier_debit_notes dn on dn.id = dl.debit_note_id
                   where dl.voucher_id = v.id) x),
         1
    from public.payment_vouchers v
$function$;

CREATE FUNCTION public.payment_voucher_save_draft(p_voucher_id uuid, p_purpose text, p_supplier_id uuid, p_payee_name text, p_voucher_date date, p_pay_from_account_code text, p_lines jsonb DEFAULT '[]'::jsonb, p_allocations jsonb DEFAULT '[]'::jsonb, p_pay_method text DEFAULT 'BANK_TRANSFER'::text, p_pay_reference text DEFAULT NULL::text, p_narration text DEFAULT NULL::text, p_advance_amount numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_v        public.payment_vouchers%rowtype;
  v_supplier public.suppliers%rowtype;
  v_purpose  text := upper(btrim(coalesce(p_purpose, '')));
  v_method   text := upper(btrim(coalesce(p_pay_method, 'BANK_TRANSFER')));
  v_lines    jsonb := coalesce(p_lines, '[]'::jsonb);
  v_allocs   jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_advance  numeric(12,2) := coalesce(p_advance_amount, 0);
  v_ap       text;
  v_payee    text;
  v_pay_from text := btrim(coalesce(p_pay_from_account_code, ''));
  v_line     jsonb;
  v_n        integer := 0;
  v_amount   numeric(12,2);
  v_account  text;
  v_bill_id  uuid;
  v_seen     uuid[] := '{}';
  v_total    numeric(12,2) := 0;
  v_id       uuid;
  v_dept     record;   -- 0540
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance writes a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_voucher_id is not null then
    select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
    if not found then
      raise exception 'That payment voucher does not exist.'
        using errcode = 'P0002', detail = 'voucher_missing';
    end if;
    if v_v.status <> 'draft' then
      raise exception 'Only a draft payment voucher can be changed.'
        using errcode = 'P0001', detail = 'voucher_not_draft';
    end if;
  end if;

  if v_purpose not in ('SUPPLIER_BILLS','DIRECT') then
    raise exception 'Choose what this voucher is for: paying supplier bills, or a direct payment.'
      using errcode = 'P0001', detail = 'purpose_invalid';
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_typeof(v_allocs) <> 'array' then
    raise exception 'The lines of this voucher are not readable.'
      using errcode = 'P0001', detail = 'lines_invalid';
  end if;

  if p_supplier_id is not null then
    select * into v_supplier from public.suppliers where id = p_supplier_id;
    if not found then
      raise exception 'That supplier does not exist.'
        using errcode = 'P0001', detail = 'supplier_missing';
    end if;
  end if;
  if v_purpose = 'SUPPLIER_BILLS' and p_supplier_id is null then
    raise exception 'Choose the supplier whose bills this voucher pays.'
      using errcode = 'P0001', detail = 'supplier_required';
  end if;

  v_payee := coalesce(nullif(btrim(coalesce(p_payee_name, '')), ''), v_supplier.name);
  if v_payee is null then
    raise exception 'Type who is being paid.'
      using errcode = 'P0001', detail = 'payee_missing';
  end if;
  if p_voucher_date is null then
    raise exception 'Type the payment date.'
      using errcode = 'P0001', detail = 'date_missing';
  end if;
  perform public.ap_refuse_before_go_live(p_voucher_date, 'This payment voucher');
  perform public._ap_require_account(v_pay_from, 'pay_from', 'Pay from');
  if v_method not in ('BANK_TRANSFER','CHEQUE','CASH','OTHER') then
    raise exception 'Choose how the money is paid.'
      using errcode = 'P0001', detail = 'pay_method_invalid';
  end if;

  if p_advance_amount is not null and round(p_advance_amount, 2) <> p_advance_amount then
    raise exception 'Type the advance in ringgit and sen, like 1250.00.'
      using errcode = 'P0001', detail = 'advance_invalid';
  end if;
  if v_advance < 0 then
    raise exception 'The advance cannot be less than RM 0.00.'
      using errcode = 'P0001', detail = 'advance_invalid';
  end if;
  if v_advance > 0 and v_purpose <> 'SUPPLIER_BILLS' then
    raise exception 'A direct payment does not carry an advance.'
      using errcode = 'P0001', detail = 'direct_pays_no_advance';
  end if;
  if v_advance > 0 then
    v_ap := public.gl_account_for(
              case when v_supplier.kind::text = 'other_creditor' then 'OTHER_PAYABLE' else 'TRADE_PAYABLE' end);
    perform public._ap_require_account(v_ap, 'ap', 'Advance');
  end if;

  if v_purpose = 'SUPPLIER_BILLS' then
    if jsonb_array_length(v_allocs) = 0 and v_advance = 0 then
      raise exception 'Choose at least one bill to pay, or type an advance.'
        using errcode = 'P0001', detail = 'no_bills';
    end if;
  else
    if jsonb_array_length(v_allocs) > 0 then
      raise exception 'A direct payment does not pay bills.'
        using errcode = 'P0001', detail = 'direct_pays_no_bill';
    end if;
    if jsonb_array_length(v_lines) = 0 then
      raise exception 'Add at least one line: what is this money paying for?'
        using errcode = 'P0001', detail = 'no_lines';
    end if;
  end if;
  if jsonb_array_length(v_lines) > 100 or jsonb_array_length(v_allocs) > 200 then
    raise exception 'This voucher has too many lines.'
      using errcode = 'P0001', detail = 'too_many_lines';
  end if;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_n := v_n + 1;
    begin
      v_amount := round(nullif(btrim(coalesce(v_line ->> 'amount', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Line %: the amount is not a number.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Line %: the amount must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'line_amount_invalid';
    end if;
    if coalesce(v_line ->> 'description', '') !~ '[^[:space:]]' then
      raise exception 'Line %: say what this payment is for.', v_n
        using errcode = 'P0001', detail = 'line_needs_description';
    end if;
    v_account := btrim(coalesce(v_line ->> 'account_code', ''));
    perform public._ap_require_account(v_account, 'voucher_line', format('Line %s', v_n));
    perform public.fin_line_department(v_line, v_account, format('Line %s', v_n));   -- 0540
    v_total := v_total + v_amount;
  end loop;

  v_n := 0;
  for v_line in select value from jsonb_array_elements(v_allocs) loop
    v_n := v_n + 1;
    -- 0681: a voucher that pays supplier bills pays a supplier debit note the same way.
    if nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '') is not null
       and nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '') is not null then
      raise exception 'Bill %: choose a bill or a debit note, not both.', v_n
        using errcode = 'P0001', detail = 'allocation_invalid';
    end if;
    begin
      v_bill_id := coalesce(nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '')::uuid,
                            nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '')::uuid);
      v_amount  := round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Bill %: the amount or the bill is not readable.', v_n
        using errcode = 'P0001', detail = 'allocation_invalid';
    end;
    if v_bill_id is null then
      raise exception 'Bill %: choose the bill.', v_n
        using errcode = 'P0001', detail = 'allocation_invalid';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Bill %: the amount to pay must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'allocation_amount_invalid';
    end if;
    if v_bill_id = any (v_seen) then
      raise exception 'The same bill is on this voucher twice.'
        using errcode = 'P0001', detail = 'bill_twice';
    end if;
    v_seen := v_seen || v_bill_id;
    v_total := v_total + v_amount;
  end loop;

  v_total := v_total + v_advance;

  if v_total <= 0 then
    raise exception 'A voucher of RM 0.00 pays nothing.'
      using errcode = 'P0001', detail = 'zero_total';
  end if;

  if p_voucher_id is null then
    insert into public.payment_vouchers
      (purpose, supplier_id, payee_name, voucher_date, amount, advance_amount, ap_account_code,
       pay_method, pay_reference, pay_from_account_code, narration, status, created_by)
    values
      (v_purpose, p_supplier_id, v_payee, p_voucher_date, v_total, v_advance, v_ap,
       v_method, nullif(btrim(coalesce(p_pay_reference, '')), ''), v_pay_from,
       nullif(btrim(coalesce(p_narration, '')), ''), 'draft', v_me)
    returning id into v_id;
  else
    v_id := p_voucher_id;
    update public.payment_vouchers
       set purpose = v_purpose, supplier_id = p_supplier_id, payee_name = v_payee, voucher_date = p_voucher_date,
           amount = v_total, advance_amount = v_advance, ap_account_code = v_ap, pay_method = v_method,
           pay_reference = nullif(btrim(coalesce(p_pay_reference, '')), ''), pay_from_account_code = v_pay_from,
           narration = nullif(btrim(coalesce(p_narration, '')), '')
     where id = v_id;
    delete from public.payment_voucher_lines       where voucher_id = v_id;
    delete from public.payment_voucher_allocations where voucher_id = v_id;
    delete from public.payment_voucher_debit_note_allocations where voucher_id = v_id;   -- 0681
  end if;

  v_n := 0;
  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_n := v_n + 1;
    v_dept := public.fin_line_department(v_line, btrim(v_line ->> 'account_code'), format('Line %s', v_n));
    insert into public.payment_voucher_lines
      (voucher_id, line_no, account_code, description, amount, department_type, department_id)
    values (v_id, v_n, btrim(v_line ->> 'account_code'),
            nullif(btrim(coalesce(v_line ->> 'description', '')), ''),
            round((v_line ->> 'amount')::numeric, 2),
            v_dept.department_type, v_dept.department_id);
  end loop;

  for v_line in select value from jsonb_array_elements(v_allocs) loop
    if nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '') is not null then
      -- 0681: a debit note, in its own table; its ceiling trigger measures it.
      insert into public.payment_voucher_debit_note_allocations (voucher_id, debit_note_id, amount_applied, created_by)
      values (v_id, (v_line ->> 'debit_note_id')::uuid,
              round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2),
              v_me);
    else
      insert into public.payment_voucher_allocations (voucher_id, bill_id, amount_applied, created_by)
      values (v_id, (v_line ->> 'bill_id')::uuid,
              round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2),
              v_me);
    end if;
  end loop;

  perform public._ap_event('PAYMENT_VOUCHER', v_id,
                           case when p_voucher_id is null then 'created' else 'edited' end, null);
  return v_id;
end;
$function$;

CREATE FUNCTION public._payment_voucher_validate(p_voucher_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_v       public.payment_vouchers%rowtype;
  v_lines   numeric(12,2);
  v_allocs  numeric(12,2);
  v_nlines  integer;
  v_nallocs integer;
  v_bad     text;
  r         record;
begin
  select * into v_v from public.payment_vouchers where id = p_voucher_id;

  select coalesce(sum(amount), 0), count(*) into v_lines, v_nlines
    from public.payment_voucher_lines where voucher_id = p_voucher_id;
  select coalesce(sum(x.amount_applied), 0), count(*) into v_allocs, v_nallocs
    from (select a.amount_applied from public.payment_voucher_allocations a
           where a.voucher_id = p_voucher_id
          union all
          -- 0681: the supplier debit notes it pays count as its bills do.
          select d.amount_applied from public.payment_voucher_debit_note_allocations d
           where d.voucher_id = p_voucher_id) x;

  if v_lines + v_allocs + v_v.advance_amount <> v_v.amount then
    raise exception 'This voucher is for RM %, but its lines, bills and advance add up to RM %.',
      to_char(v_v.amount, 'FM999,999,999,990.00'),
      to_char(v_lines + v_allocs + v_v.advance_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'total_not_equal';
  end if;

  -- 0681: the debit notes as they stand NOW, as the bills above.
  select string_agg(coalesce(d.note_no, d.supplier_note_no), ', ') into v_bad
    from public.payment_voucher_debit_note_allocations a
    join public.supplier_debit_notes d on d.id = a.debit_note_id
   where a.voucher_id = p_voucher_id
     and (d.status <> 'confirmed'
          or d.supplier_id is distinct from v_v.supplier_id
          or coalesce((select dp.held from public.ap_debit_note_paid(a.debit_note_id) dp), 0) > d.total_amount);
  if v_bad is not null then
    raise exception 'These debit notes can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'debit_note_cannot_take_payment';
  end if;
end;
$function$;

CREATE FUNCTION public.payment_voucher_approve(p_voucher_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_v     public.payment_vouchers%rowtype;
  v_me    uuid := auth.uid();
  v_lines jsonb := '[]'::jsonb;
  v_entry uuid;
  r       record;
begin
  if v_me is null then
    raise exception 'no signed-in account' using errcode = '42501', detail = 'no_session';
  end if;
  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if v_v.status <> 'checked' then
    raise exception 'Only a checked payment voucher can be approved.' using errcode = 'P0001', detail = 'voucher_not_checked';
  end if;
  if not public.has_finance_approver(v_me) then
    raise exception 'Approving a payment takes the finance approver.' using errcode = '42501', detail = 'not_finance_approver';
  end if;
  if v_v.prepared_by = v_me then
    raise exception 'separation of duties' using errcode = 'P0001', detail = 'separation_of_duties';
  end if;

  -- 0681: and the debit notes it pays.
  perform 1 from public.supplier_debit_notes d
   where d.id in (select a.debit_note_id from public.payment_voucher_debit_note_allocations a
                   where a.voucher_id = p_voucher_id)
     for update;
  perform public._payment_voucher_validate(p_voucher_id);

  for r in select b.ap_account_code, b.supplier_id, b.bill_no, b.supplier_invoice_no, a.amount_applied
             from public.payment_voucher_allocations a
             join public.supplier_bills b on b.id = a.bill_id
            where a.voucher_id = p_voucher_id loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', r.ap_account_code, 'debit', r.amount_applied, 'credit', 0,
      'party_type', 'SUPPLIER', 'party_id', r.supplier_id, 'memo', 'Pays ' || r.bill_no));
  end loop;

  -- Dr the advance to the supplier's own payables control (0484). The bill it
  -- is knocked off later credits the same account and party.
  if v_v.advance_amount > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', v_v.ap_account_code, 'debit', v_v.advance_amount, 'credit', 0,
      'party_type', 'SUPPLIER', 'party_id', v_v.supplier_id, 'memo', 'Advance · ' || v_v.voucher_no));
  end if;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code', v_v.pay_from_account_code, 'debit', 0, 'credit', v_v.amount, 'memo', v_v.payee_name));

  v_entry := public.gl_post('PAYMENT_VOUCHER', v_v.voucher_no, v_v.voucher_date,
    coalesce(v_v.narration, 'Payment voucher ' || v_v.voucher_no), v_lines);

  update public.payment_vouchers
     set status = 'approved', gl_entry_id = v_entry, approved_at = now(), approved_by = v_me
   where id = p_voucher_id;
  return v_entry;
end;
$function$;

CREATE FUNCTION public.ap_outstanding(p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(supplier_id uuid, supplier_name text, bills_confirmed integer, billed_total numeric, allocated_total numeric, paid_total numeric, balance_owing numeric, uncommitted numeric, oldest_confirmed_bill_date date, go_live_on date, supplier_kind text, open_bills integer, oldest_unpaid_bill_date date, advance_open numeric, net_owing numeric, credit_open numeric, debit_open numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_go_live date;
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;

  select gc.go_live_on into v_go_live from public.gl_config gc where gc.id;

  return query
  with bill_paid as (
    select sb.supplier_id as sid, sb.bill_date, sb.total_amount,
           coalesce(bp.paid, 0) as paid,
           coalesce(bp.held, 0) as allocated
      from public.supplier_bills sb
      left join public.ap_bill_paid() bp on bp.bill_id = sb.id
     where sb.status = 'confirmed'
  ), per_supplier as (
    select bpd.sid,
           count(*) as cnt,
           sum(bpd.total_amount) as billed,
           sum(bpd.allocated) as allocated,
           sum(bpd.paid) as paid,
           min(bpd.bill_date) as oldest,
           count(*) filter (where bpd.total_amount > bpd.paid) as open_cnt,
           min(bpd.bill_date) filter (where bpd.total_amount > bpd.paid) as oldest_open
      from bill_paid bpd
     group by bpd.sid
  ), advance as (
    select ao.supplier_id as sid, sum(ao.advance_open) as open_total
      from public.supplier_advance_open() ao
     group by ao.supplier_id
  ), credit as (
    select co.supplier_id as sid, sum(co.credit_open) as open_total
      from public.supplier_credit_open() co
     group by co.supplier_id
  ), debit_notes as (
    -- 0681: confirmed debit notes not yet paid.
    select dn.supplier_id as sid, sum(dn.debit_open) as open_total
      from public.supplier_debit_open() dn
     group by dn.supplier_id
  ), owed as (
    select s.id as sid, s.name, s.kind::text as kind,
           ps.cnt, ps.billed, ps.allocated, ps.paid, ps.oldest, ps.open_cnt, ps.oldest_open,
           (coalesce(ps.billed, 0) - coalesce(ps.paid, 0)) as owing,
           coalesce(adv.open_total, 0) as adv_open,
           coalesce(cr.open_total, 0) as cr_open,
           coalesce(db.open_total, 0) as db_open
      from public.suppliers s
      left join per_supplier ps on ps.sid = s.id
      left join advance adv on adv.sid = s.id
      left join credit cr on cr.sid = s.id
      left join debit_notes db on db.sid = s.id
     where p_supplier_id is null or s.id = p_supplier_id
  )
  select o.sid,
         o.name,
         coalesce(o.cnt, 0)::integer,
         coalesce(o.billed, 0)::numeric(12,2),
         coalesce(o.allocated, 0)::numeric(12,2),
         coalesce(o.paid, 0)::numeric(12,2),
         o.owing::numeric(12,2),
         (coalesce(o.billed, 0) - coalesce(o.allocated, 0))::numeric(12,2),
         o.oldest,
         v_go_live,
         o.kind,
         coalesce(o.open_cnt, 0)::integer,
         o.oldest_open,
         o.adv_open::numeric(12,2),
         (o.owing + o.db_open - o.adv_open - o.cr_open)::numeric(12,2),
         o.cr_open::numeric(12,2),
         o.db_open::numeric(12,2)
    from owed o
   order by o.name;
end;
$function$;

CREATE FUNCTION public.gl_receivables_reconcile()
 RETURNS TABLE(checked_at timestamp with time zone, go_live_on date, ar_account_code text, missing_first text, comparable boolean, ledger_ar_balance numeric, operational_ar_balance numeric, difference numeric, unposted_invoice_count bigint, unposted_invoice_amount numeric, storage_recognised_uncollected numeric, pre_go_live_open_count bigint, pre_go_live_open_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_go_live   date;
  v_ar        text;
  v_ledger    numeric(12,2) := 0;
  v_inv       numeric(12,2) := 0;
  v_pay       numeric(12,2) := 0;
  v_unp_n     bigint := 0;
  v_unp_amt   numeric(12,2) := 0;
  v_stor      numeric(12,2) := 0;
  v_pre_n     bigint := 0;
  v_pre_amt   numeric(12,2) := 0;
  v_missing   text[] := array[]::text[];
begin
  if not public.gl_may_read() then
    raise exception 'internal roles only' using errcode = '42501';
  end if;
  select c.go_live_on into v_go_live from gl_config c where c.id;
  select string_agg(a.code, ', ' order by a.code) into v_ar
    from gl_accounts a where a.kind = 'ASSET' and a.control_for = 'CUSTOMER';
  if v_ar is not null then
    select round(coalesce(sum(l.debit - l.credit), 0), 2)
      into v_ledger
      from gl_entry_lines l
      join gl_entries e on e.id = l.entry_id
     where l.account_code in (select a.code from gl_accounts a
                               where a.kind = 'ASSET' and a.control_for = 'CUSTOMER')   -- 0685
       and e.posted;
  end if;

  if v_go_live is not null then
    select round(coalesce(sum(i.amount + coalesce(i.tax_amount, 0)), 0), 2)
      into v_inv
      from invoices i
     where i.voided_at is null
       and i.issued_at >= v_go_live;

    select round(coalesce(sum(p.amount), 0), 2)
      into v_pay
      from order_payments p
     where p.voided_at is null
       and p.paid_on >= v_go_live;

    -- Invoices this window should have posted and did not.
    select count(*)::bigint, round(coalesce(sum(i.amount + coalesce(i.tax_amount, 0)), 0), 2)
      into v_unp_n, v_unp_amt
      from invoices i
     where i.voided_at is null
       and i.issued_at >= v_go_live
       and not exists (select 1 from gl_entries e
          where e.source_type = 'SALES_INVOICE' and e.source_doc_no = i.invoice_no and e.posted and not e.reversed);
  end if;

  return query
  select now(),
         v_go_live,
         v_ar,
         array_to_string(v_missing, ' · '),
         (v_go_live is not null and v_ar is not null and v_unp_n = 0 and v_stor = 0),
         v_ledger,
         round(v_inv - v_pay, 2),
         round(v_ledger - (v_inv - v_pay), 2),
         v_unp_n,
         v_unp_amt,
         v_stor,
         v_pre_n,
         v_pre_amt;
end;
$function$;
