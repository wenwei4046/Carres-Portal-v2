-- 0540 · Every finance line carries a department.
--
-- DEPT-1..7, RPT-5, APV-6. Every income and expense line belongs to one
-- department: a Showroom (an outlet of a showroom-channel dealer), a Dealer
-- (a non-showroom dealer), Subscription, or Office. Office has expenses only.
--
-- There is no second master list: fin_departments() reads outlets and dealers.
-- The four manual documents (supplier bill, payment voucher, other debtor
-- invoice, other receipt) store the department on each line and hand it to
-- gl_post, which writes it onto gl_entry_lines. Sales invoices, customer
-- payments and rental collections take theirs at read time from the order
-- (gl_line_departments). Report functions gain two optional arguments.
--
-- Old rows stay null; a department is required only when a draft is saved.
-- APV-6 needs nothing new: payment_voucher_lines_only_while_draft already
-- freezes a voucher line (and its department) once the voucher leaves Draft.
--
-- RLS: unchanged. The new columns sit on tables whose policies already cover
-- every column. The new views are owner-rights and gate in their own WHERE
-- (gl_may_read() / is_internal()), the same way the finance views do.

begin;

-- ── 1 · Columns ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['gl_entry_lines','supplier_bill_lines','payment_voucher_lines',
                           'other_receipt_lines','other_debtor_invoice_lines'] loop
    execute format('alter table public.%I add column if not exists department_type text, '
                   'add column if not exists department_id uuid', t);
    execute format('alter table public.%I add constraint %I check ('
                   '(department_type is null and department_id is null) or '
                   '(department_type in (''SHOWROOM'',''DEALER'') and department_id is not null) or '
                   '(department_type in (''SUBSCRIPTION'',''OFFICE'') and department_id is null))',
                   t, t || '_department_shape');
  end loop;
end $$;

-- ── 2 · The department list ─────────────────────────────────────────────────
create or replace function public.fin_departments()
returns table (department_type text, department_id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select * from (
    select 'SHOWROOM'::text, o.id, o.name
      from public.outlets o join public.dealers d on d.id = o.dealer_id
     where d.channel = 'showroom'
    union all
    select 'DEALER', d.id, d.name from public.dealers d where d.channel is distinct from 'showroom'
    union all
    select 'SUBSCRIPTION', null::uuid, 'Subscription'
    union all
    select 'OFFICE', null::uuid, 'Office'
  ) x
  where public.is_internal();
$$;
revoke all on function public.fin_departments() from public, anon;
grant execute on function public.fin_departments() to authenticated;
comment on function public.fin_departments() is
  '0540: the finance departments, read from outlets and dealers. Not a second master list.';

-- The one sentence a line's department can be refused with (null = fine).
create or replace function public.fin_department_problem(p_type text, p_id uuid, p_account_code text)
returns text
language sql stable set search_path = public
as $$
  select case
    when p_type is null then 'Choose the department.'
    when not exists (select 1 from public.fin_departments() f
                      where f.department_type = p_type
                        and f.department_id is not distinct from p_id)
      then 'That department is not on the list.'
    when p_type = 'OFFICE'
     and (select a.kind from public.gl_accounts a where a.code = p_account_code) = 'INCOME'
      then 'Office has expenses only. Choose another department for income.'
  end;
$$;
revoke all on function public.fin_department_problem(text, uuid, text) from public, anon;
grant execute on function public.fin_department_problem(text, uuid, text) to authenticated;

-- Read a draft line's department, or refuse it with '<Line n>: <sentence>'.
create or replace function public.fin_line_department(
  p_line jsonb, p_account_code text, p_what text,
  out department_type text, out department_id uuid)
language plpgsql stable set search_path = public
as $$
declare v_problem text;
begin
  department_type := nullif(btrim(coalesce(p_line ->> 'department_type', '')), '');
  begin
    department_id := nullif(btrim(coalesce(p_line ->> 'department_id', '')), '')::uuid;
  exception when invalid_text_representation then
    raise exception '%: That department is not on the list.', p_what
      using errcode = 'P0001', detail = 'line_department_refused';
  end;
  v_problem := public.fin_department_problem(department_type, department_id, p_account_code);
  if v_problem is not null then
    raise exception '%: %', p_what, v_problem
      using errcode = 'P0001', detail = 'line_department_refused';
  end if;
end;
$$;
revoke all on function public.fin_line_department(jsonb, text, text) from public, anon;
grant execute on function public.fin_line_department(jsonb, text, text) to authenticated;

-- ── 3 · Derived departments ─────────────────────────────────────────────────
-- An order's department: rental is Subscription; a showroom dealer's order is
-- its outlet; any other dealer's order is that dealer.
-- ponytail: a showroom order with no outlet_id resolves to nothing (untagged).
create or replace view public.fin_order_departments as
select o.id as order_id,
       case when o.source_system = 'rental' then 'SUBSCRIPTION'
            when d.channel = 'showroom' then 'SHOWROOM'
            else 'DEALER' end as department_type,
       case when o.source_system = 'rental' then null
            when d.channel = 'showroom' then o.outlet_id
            else o.dealer_id end as department_id
  from public.orders o
  left join public.dealers d on d.id = o.dealer_id
 where public.is_internal()
   and (o.source_system = 'rental'
        or (d.channel = 'showroom' and o.outlet_id is not null)
        or (d.channel is distinct from 'showroom' and o.dealer_id is not null));

-- A PO line's department, when every sales order it serves agrees (DEPT-6).
-- ponytail: a PO line serving two departments gets no default; it is not
-- split by quantity. The bill clerk picks one.
create or replace view public.fin_po_line_departments as
select s.po_line_id, min(od.department_type) as department_type,
       (array_agg(od.department_id))[1] as department_id
  from public.po_line_sources s
  join public.fin_order_departments od on od.order_id = s.order_id
 group by s.po_line_id
having count(distinct (od.department_type, od.department_id)) = 1;

-- Every ledger line's department: its own, else its entry's one explicit
-- department, else the one its source document derives from the order.
create or replace view public.gl_line_departments as
with explicit_entry as (
  select l.entry_id, min(l.department_type) as department_type,
         (array_agg(l.department_id))[1] as department_id
    from public.gl_entry_lines l
   where l.department_type is not null
   group by l.entry_id
  having count(distinct (l.department_type, l.department_id)) = 1
),
derived as (
  select e.id as entry_id, od.department_type, od.department_id
    from public.gl_entries e
    join public.invoices i on i.invoice_no = e.source_doc_no
    join public.fin_order_departments od on od.order_id = i.order_id
   where regexp_replace(e.source_type, '_REVERSAL$', '') = 'SALES_INVOICE'
  union all
  select e.id, od.department_type, od.department_id
    from public.gl_entries e
    cross join lateral (
      select p.order_id from public.order_payments p
       where p.receipt_no = e.source_doc_no
          or (e.source_doc_no ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and p.id = e.source_doc_no::uuid)
       limit 1) p
    join public.fin_order_departments od on od.order_id = p.order_id
   where regexp_replace(e.source_type, '_REVERSAL$', '') = 'CUSTOMER_PAYMENT'
  union all
  select e.id, 'SUBSCRIPTION', null::uuid
    from public.gl_entries e
   where regexp_replace(e.source_type, '_REVERSAL$', '') = 'RENTAL_PAYMENT'
)
select l.id as line_id, l.entry_id,
       coalesce(l.department_type, x.department_type, dv.department_type) as department_type,
       case when l.department_type is not null then l.department_id
            when x.department_type is not null then x.department_id
            else dv.department_id end as department_id
  from public.gl_entry_lines l
  left join explicit_entry x on x.entry_id = l.entry_id
  left join derived dv on dv.entry_id = l.entry_id
 where public.gl_may_read()
   and coalesce(l.department_type, x.department_type, dv.department_type) is not null;

revoke all on public.fin_order_departments, public.fin_po_line_departments,
              public.gl_line_departments from public, anon;
grant select on public.fin_order_departments, public.fin_po_line_departments,
                public.gl_line_departments to authenticated;

-- The ledger lines of one department (all of them when no type is given).
create or replace function public.gl_department_lines(p_type text, p_id uuid)
returns setof public.gl_entry_lines
language sql stable set search_path = public
as $$
  select l.* from public.gl_entry_lines l
   where p_type is null
      or l.id in (select d.line_id from public.gl_line_departments d
                   where d.department_type = p_type
                     and (p_id is null or d.department_id = p_id));
$$;
revoke all on function public.gl_department_lines(text, uuid) from public, anon;
grant execute on function public.gl_department_lines(text, uuid) to authenticated;

-- Computed relationships for PostgREST filters (Journal, receivables register).
create or replace function public.gl_entry_departments(public.gl_entries)
returns setof public.gl_line_departments
language sql stable set search_path = public
as $$ select * from public.gl_line_departments d where d.entry_id = $1.id $$;
revoke all on function public.gl_entry_departments(public.gl_entries) from public, anon;
grant execute on function public.gl_entry_departments(public.gl_entries) to authenticated;

create or replace function public.invoice_department(public.invoices)
returns setof public.fin_order_departments
language sql stable set search_path = public
as $$ select * from public.fin_order_departments d where d.order_id = $1.order_id $$;
revoke all on function public.invoice_department(public.invoices) from public, anon;
grant execute on function public.invoice_department(public.invoices) to authenticated;

-- ── 4 · gl_post and gl_reverse carry the department (bodies from 0478 / 0468) ─
create or replace function public.gl_post(
  p_source_type   text,
  p_source_doc_no text,
  p_entry_date    date,
  p_narration     text,
  p_lines         jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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
  v_kind        text;   -- 0540
  v_dept_type   text;   -- 0540
  v_dept_id     uuid;   -- 0540
  v_sum_debit   numeric(12,2) := 0;
  v_sum_credit  numeric(12,2) := 0;
  v_norm        jsonb := '[]'::jsonb;
  v_source_type text;
  v_doc_no      text;
  v_entry_no    text;
  v_entry_id    uuid;
begin
  -- 0468: no role check here. WHO may act is decided by the document function
  -- that calls this one (a payment, an invoice, a bill, a journal), because
  -- that function knows the business rule. This function decides only whether
  -- the entry itself is valid. Nobody can call it over the API: execute is
  -- revoked from authenticated at the bottom of 0468.
  v_uid := auth.uid();

  -- Step 0 · the source identity must exist before step 1 can look it up.
  -- (Not in the contract's numbered list, but step 1 is undefined without it.)
  v_source_type := btrim(coalesce(p_source_type, ''));
  v_doc_no      := btrim(coalesce(p_source_doc_no, ''));
  if v_source_type = '' then
    raise exception 'gl_post refused: source_type is required'
      using errcode = '22023', detail = 'gl_post_source_type_blank';
  end if;
  if v_doc_no = '' then
    raise exception 'gl_post refused: source_doc_no is required for source_type %', v_source_type
      using errcode = '22023', detail = 'gl_post_source_doc_no_blank';
  end if;

  -- ── Step 1 · idempotency. A retry, a double-click and a replayed webhook
  -- all find the entry that already stands and get its id back. No raise.
  select e.id into v_existing
    from public.gl_entries e
   where e.source_type = v_source_type
     and e.source_doc_no = v_doc_no
     and e.posted
     and not e.reversed
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- ── Step 2 · the date.
  -- A NULL date RAISES. It is NEVER silently replaced with current_date. The
  -- system being replaced substitutes today, which quietly posts money into the
  -- wrong month; that is the one bug this whole file exists to refuse to copy.
  if p_entry_date is null then
    raise exception 'gl_post refused: entry_date is required for %/% — a blank date is never replaced with today', v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_entry_date_null';
  end if;

  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  if v_go_live is null then
    raise exception 'gl_post refused: the ledger has no go-live date configured (gl_config is empty)'
      using errcode = '22023', detail = 'gl_post_no_go_live';
  end if;
  if p_entry_date < v_go_live then
    raise exception 'gl_post refused: entry_date % is before the ledger go-live date %', p_entry_date, v_go_live
      using errcode = '22023', detail = 'gl_post_entry_date_before_go_live';
  end if;

  -- ── Step 3 · the shape of the line list.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'gl_post refused: p_lines must be a JSON array, got % for %/%',
      coalesce(jsonb_typeof(p_lines), 'null'), v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_lines_not_array';
  end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 2 then
    raise exception 'gl_post refused: an entry needs at least two lines, got % for %/%', v_count, v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_too_few_lines';
  end if;

  -- ── Step 4 · every line, one at a time. Each refusal names the line number
  -- AND the offending value, because "invalid line" is not a debuggable error.
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;

    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'gl_post refused: line % is a %, expected an object', v_idx, jsonb_typeof(v_elem)
        using errcode = '22023', detail = 'gl_post_line_not_object';
    end if;

    v_code := btrim(coalesce(v_elem->>'account_code', ''));
    if v_code = '' then
      raise exception 'gl_post refused: line % has no account_code', v_idx
        using errcode = '22023', detail = 'gl_post_line_account_code_blank';
    end if;

    select a.is_active, a.is_control, a.control_for, a.kind into v_active, v_control, v_control_for, v_kind
      from public.gl_accounts a where a.code = v_code;
    if not found then
      raise exception 'gl_post refused: line % names account %, which is not in the chart', v_idx, v_code
        using errcode = '23503', detail = 'gl_post_account_unknown';
    end if;
    if not v_active then
      raise exception 'gl_post refused: line % names account %, which is retired', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_account_inactive';
    end if;
    -- A HEADER is derived, never declared: any account that ANY row names as
    -- its parent_code, active or retired. Retiring the last child must not
    -- silently turn a header into a postable leaf, so `is_active` is not part
    -- of this test.
    if exists (select 1 from public.gl_accounts c where c.parent_code = v_code) then
      raise exception 'gl_post refused: line % names account %, which is a header account and cannot be posted to', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_account_is_header';
    end if;

    -- Amounts. A non-numeric amount is refused by name rather than by an
    -- unreadable cast error, and both sides are rounded to the storage scale
    -- BEFORE the balance test, so a set of lines that balances on input can
    -- never become unbalanced on write.
    if v_elem ? 'debit' and jsonb_typeof(v_elem->'debit') not in ('number','null') then
      raise exception 'gl_post refused: line % debit is a %, expected a number', v_idx, jsonb_typeof(v_elem->'debit')
        using errcode = '22023', detail = 'gl_post_line_debit_not_number';
    end if;
    if v_elem ? 'credit' and jsonb_typeof(v_elem->'credit') not in ('number','null') then
      raise exception 'gl_post refused: line % credit is a %, expected a number', v_idx, jsonb_typeof(v_elem->'credit')
        using errcode = '22023', detail = 'gl_post_line_credit_not_number';
    end if;
    v_debit  := round(coalesce((v_elem->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_elem->>'credit')::numeric, 0), 2);

    if v_debit < 0 or v_credit < 0 then
      raise exception 'gl_post refused: line % on account % has a negative amount (debit %, credit %) — reverse the sides instead', v_idx, v_code, v_debit, v_credit
        using errcode = '22023', detail = 'gl_post_line_negative';
    end if;
    if v_debit <> 0 and v_credit <> 0 then
      raise exception 'gl_post refused: line % on account % has both a debit (%) and a credit (%)', v_idx, v_code, v_debit, v_credit
        using errcode = '22023', detail = 'gl_post_line_two_sided';
    end if;
    if v_debit = 0 and v_credit = 0 then
      raise exception 'gl_post refused: line % on account % has neither a debit nor a credit', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_line_empty';
    end if;

    -- The party.
    v_party_type := nullif(btrim(coalesce(v_elem->>'party_type','')), '');
    begin
      v_party_id := nullif(btrim(coalesce(v_elem->>'party_id','')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'gl_post refused: line % party_id % is not a uuid', v_idx, v_elem->>'party_id'
        using errcode = '22023', detail = 'gl_post_line_party_id_not_uuid';
    end;

    -- 0478: a third party type, OTHER (a finance_parties row). These lines are
    -- the only difference from the 0468 body.
    if v_party_type is not null and v_party_type not in ('CUSTOMER','SUPPLIER','OTHER') then
      raise exception 'gl_post refused: line % party_type % is not CUSTOMER, SUPPLIER or OTHER', v_idx, v_party_type
        using errcode = '22023', detail = 'gl_post_line_party_type_unknown';
    end if;
    if (v_party_type is null) <> (v_party_id is null) then
      raise exception 'gl_post refused: line % names a party by only half — party_type %, party_id %',
        v_idx, coalesce(v_party_type,'null'), coalesce(v_party_id::text,'null')
        using errcode = '22023', detail = 'gl_post_line_party_half_named';
    end if;
    -- A control account (AR / AP) is a subsidiary ledger in disguise: without a
    -- party the balance can never be broken back down to who owes it.
    if v_control and (v_party_type is null or v_party_id is null) then
      raise exception 'gl_post refused: line % posts to control account % without a party — both party_type and party_id are required', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_control_account_needs_party';
    end if;
    -- And it must be the right KIND of party. Trade receivables is a customer
    -- ledger; booking a supplier into it produces a balance that looks correct
    -- in total and cannot be broken back down to anybody. Checking that a party
    -- exists is not the same as checking it belongs here.
    if v_control and v_party_type is distinct from v_control_for then
      raise exception 'gl_post refused: line % posts a % to account %, which is a % control account',
        v_idx, v_party_type, v_code, v_control_for
        using errcode = '22023', detail = 'gl_post_party_type_wrong_side';
    end if;

    -- 0540: the department. Its shape (which type needs which id) is the
    -- table's check constraint; the one rule that needs the chart is here:
    -- Office has expenses only.
    v_dept_type := nullif(btrim(coalesce(v_elem->>'department_type','')), '');
    begin
      v_dept_id := nullif(btrim(coalesce(v_elem->>'department_id','')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'gl_post refused: line % department_id % is not a uuid', v_idx, v_elem->>'department_id'
        using errcode = '22023', detail = 'gl_post_line_department_id_not_uuid';
    end;
    if v_dept_type = 'OFFICE' and v_kind = 'INCOME' then
      raise exception 'gl_post refused: line % puts income on account % in the Office department', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_office_income';
    end if;

    v_sum_debit  := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;

    v_norm := v_norm || jsonb_build_object(
      'line_no',      v_idx,
      'account_code', v_code,
      'debit',        v_debit,
      'credit',       v_credit,
      'party_type',   v_party_type,
      'party_id',     v_party_id,
      'memo',         nullif(btrim(coalesce(v_elem->>'memo','')), ''),
      'department_type', v_dept_type,
      'department_id',   v_dept_id
    );
  end loop;

  -- ── Step 5 · the balance.
  if v_sum_debit <> v_sum_credit then
    raise exception 'gl_post refused: %/% is out of balance — debit % vs credit % (difference %)',
      v_source_type, v_doc_no, v_sum_debit, v_sum_credit, (v_sum_debit - v_sum_credit)
      using errcode = '23514', detail = 'gl_post_out_of_balance';
  end if;
  if v_sum_debit = 0 then
    raise exception 'gl_post refused: %/% totals zero on both sides — an entry that moves nothing is not an entry',
      v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_zero_total';
  end if;

  -- ── Step 6 · allocate the number and write.
  v_entry_no := public.gl_next_doc_no('JE', p_entry_date);

  insert into public.gl_entries
    (entry_no, entry_date, source_type, source_doc_no, narration,
     total_debit, total_credit, posted, created_by)
  values
    (v_entry_no, p_entry_date, v_source_type, v_doc_no,
     nullif(btrim(coalesce(p_narration,'')), ''),
     v_sum_debit, v_sum_credit, true,
     (select u.id from public.app_users u where u.id = v_uid))
  returning id into v_entry_id;

  insert into public.gl_entry_lines
    (entry_id, line_no, account_code, debit, credit, party_type, party_id, memo,
     department_type, department_id)
  select v_entry_id,
         (l->>'line_no')::int,
         l->>'account_code',
         (l->>'debit')::numeric,
         (l->>'credit')::numeric,
         l->>'party_type',
         (l->>'party_id')::uuid,
         l->>'memo',
         l->>'department_type',
         (l->>'department_id')::uuid
    from jsonb_array_elements(v_norm) l;

  return v_entry_id;
end;
$fn$;

create or replace function public.gl_reverse(
  p_entry_id uuid,
  p_reason   text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_uid      uuid;
  v_orig     public.gl_entries;
  v_lines    jsonb;
  v_new_id   uuid;
  v_reason   text;
begin
  -- 0468: no role check here, for the same reason as gl_post. The caller (a
  -- payment void, an invoice void, a bill cancel) has already decided the
  -- person may do this. The role is still read, for the audit row only; it is
  -- null when the caller is a system job, and audit_log.role allows that.
  v_role := public.app_role();
  v_uid := auth.uid();

  if p_entry_id is null then
    raise exception 'gl_reverse refused: entry id is required'
      using errcode = '22023', detail = 'gl_reverse_entry_id_null';
  end if;

  select * into v_orig from public.gl_entries where id = p_entry_id for update;
  if not found then
    raise exception 'gl_reverse refused: entry % does not exist', p_entry_id
      using errcode = '42P01', detail = 'gl_reverse_entry_not_found';
  end if;
  if v_orig.reversed then
    raise exception 'gl_reverse refused: entry % (%) is already reversed by %',
      v_orig.entry_no, v_orig.source_doc_no, coalesce(v_orig.reversed_by::text, 'unknown')
      using errcode = '22023', detail = 'gl_reverse_already_reversed';
  end if;
  if v_orig.reverses is not null then
    raise exception 'gl_reverse refused: entry % is itself a contra entry — post a corrected entry instead of reversing a reversal', v_orig.entry_no
      using errcode = '22023', detail = 'gl_reverse_of_a_reversal';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason,'')), '');
  if v_reason is null then
    raise exception 'gl_reverse refused: a reason is required to reverse entry %', v_orig.entry_no
      using errcode = '22023', detail = 'gl_reverse_reason_blank';
  end if;

  -- The sides swap. Everything else — account, party, memo — is copied, so the
  -- contra nets the original to zero line for line.
  select jsonb_agg(
           jsonb_build_object(
             'account_code', l.account_code,
             'debit',        l.credit,
             'credit',       l.debit,
             'party_type',   l.party_type,
             'party_id',     l.party_id,
             'memo',         l.memo,
             'department_type', l.department_type,   -- 0540
             'department_id',   l.department_id
           ) order by l.line_no)
    into v_lines
    from public.gl_entry_lines l
   where l.entry_id = v_orig.id;

  -- Stamp the original BEFORE posting the contra. Two reasons: the partial
  -- unique index gl_entries_one_active_per_source only covers posted AND
  -- unreversed rows, so marking the original reversed here is what frees
  -- (source_type, source_doc_no) for a later corrected re-post of the same
  -- document; and it makes the reversal and the re-post able to coexist rather
  -- than the second one being rejected as a duplicate.
  update public.gl_entries
     set reversed = true
   where id = v_orig.id;

  -- The contra goes through the SAME gate as everything else (law 1: gl_post is
  -- the only writer). It carries the original's entry_date so the pair nets to
  -- zero inside the period it belongs to, not the period it was noticed in.
  v_new_id := public.gl_post(
    v_orig.source_type || '_REVERSAL',
    v_orig.source_doc_no,
    v_orig.entry_date,
    format('Reversal of %s — %s', v_orig.entry_no, v_reason),
    v_lines
  );

  update public.gl_entries set reverses    = v_orig.id where id = v_new_id;
  update public.gl_entries set reversed_by = v_new_id  where id = v_orig.id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Ledger entry reversed · %s · %s', v_orig.entry_no, v_reason),
          v_orig.source_doc_no);

  return v_new_id;
end;
$fn$;

-- ── 5 · The four manual documents store and post the department ──────────
-- Bodies: bill save/confirm 0477, voucher save 0484, voucher approve 0529,
-- other debtor invoice lines/issue 0478, other receipt 0478.
create or replace function public.supplier_bill_save_draft(
  p_bill_id             uuid,
  p_supplier_id         uuid,
  p_supplier_invoice_no text,
  p_bill_date           date,
  p_lines               jsonb,
  p_due_date            date default null,
  p_ap_account_code     text default null,
  p_narration           text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_bill     public.supplier_bills%rowtype;
  v_supplier public.suppliers%rowtype;
  v_invoice  text := btrim(coalesce(p_supplier_invoice_no, ''));
  v_ap       text;
  v_dup      text;
  v_line     jsonb;
  v_n        integer := 0;
  v_total    numeric(12,2) := 0;
  v_rcpt     uuid;
  v_pol_id   uuid;
  v_pol      public.purchase_order_lines%rowtype;
  v_account  text;
  v_qty      numeric(12,2);
  v_price    numeric(12,2);
  v_amount   numeric(12,2);
  v_sku      text;
  v_desc     text;
  v_dept     record;   -- 0540
  v_pos      text[] := '{}';
  v_id       uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance enters a supplier bill'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_bill_id is not null then
    select * into v_bill from public.supplier_bills where id = p_bill_id for update;
    if not found then
      raise exception 'That bill does not exist.'
        using errcode = 'P0002', detail = 'bill_missing';
    end if;
    if v_bill.status <> 'draft' then
      raise exception 'Only a draft bill can be changed.'
        using errcode = 'P0001', detail = 'bill_not_draft';
    end if;
  end if;

  select * into v_supplier from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Choose who sent this bill.'
      using errcode = 'P0001', detail = 'supplier_missing';
  end if;
  if v_invoice = '' then
    raise exception 'Type the invoice number printed on the supplier''s bill.'
      using errcode = 'P0001', detail = 'invoice_no_missing';
  end if;
  if p_bill_date is null then
    raise exception 'Type the date printed on the supplier''s bill.'
      using errcode = 'P0001', detail = 'bill_date_missing';
  end if;
  perform public.ap_refuse_before_go_live(p_bill_date, 'This bill');
  if p_due_date is not null and p_due_date < p_bill_date then
    raise exception 'The due date is before the bill date.'
      using errcode = 'P0001', detail = 'due_before_bill_date';
  end if;

  -- The same invoice entered twice is how a supplier gets paid twice. The
  -- unique index (0464) is the last line; this says it in words first.
  select coalesce(b.bill_no, 'a draft bill') into v_dup
    from public.supplier_bills b
   where b.supplier_id = p_supplier_id
     and lower(btrim(b.supplier_invoice_no)) = lower(v_invoice)
     and b.status <> 'cancelled'
     and b.id is distinct from p_bill_id
   limit 1;
  if v_dup is not null then
    raise exception 'Invoice % from % is already entered, as %.', v_invoice, v_supplier.name, v_dup
      using errcode = 'P0001', detail = 'invoice_already_entered';
  end if;

  -- 2120 for an other creditor, 2110 for a supplier, unless finance chose
  -- another SUPPLIER payables account.
  v_ap := coalesce(nullif(btrim(coalesce(p_ap_account_code, '')), ''),
                   case when v_supplier.kind::text = 'other_creditor' then '2120' else '2110' end);
  perform public._ap_require_account(v_ap, 'ap', 'Payables account');

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A bill needs at least one line.'
      using errcode = 'P0001', detail = 'no_lines';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'A bill can have at most 300 lines.'
      using errcode = 'P0001', detail = 'too_many_lines';
  end if;

  if p_bill_id is null then
    insert into public.supplier_bills
      (supplier_invoice_no, supplier_id, bill_date, due_date, ap_account_code,
       narration, created_by)
    values
      (v_invoice, p_supplier_id, p_bill_date, p_due_date, v_ap,
       nullif(btrim(coalesce(p_narration, '')), ''), v_me)
    returning id into v_id;
  else
    v_id := p_bill_id;
    update public.supplier_bills
       set supplier_invoice_no = v_invoice,
           supplier_id         = p_supplier_id,
           bill_date           = p_bill_date,
           due_date            = p_due_date,
           ap_account_code     = v_ap,
           narration           = nullif(btrim(coalesce(p_narration, '')), ''),
           po_id               = null,
           total_amount        = 0
     where id = v_id;
    -- A draft's lines are replaced whole. Allowed only while draft
    -- (supplier_bill_lines_frozen); a draft has posted nothing.
    delete from public.supplier_bill_lines where bill_id = v_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Line % is not a bill line.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end if;
    begin
      v_rcpt   := nullif(btrim(coalesce(v_line ->> 'warehouse_receipt_id', '')), '')::uuid;
      v_pol_id := nullif(btrim(coalesce(v_line ->> 'po_line_id', '')), '')::uuid;
      v_qty    := round(nullif(btrim(coalesce(v_line ->> 'qty', '')), '')::numeric, 2);
      v_price  := round(nullif(btrim(coalesce(v_line ->> 'unit_price', '')), '')::numeric, 2);
      v_amount := round(nullif(btrim(coalesce(v_line ->> 'amount', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Line %: a number or a link on it is not readable.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end;
    v_account := nullif(btrim(coalesce(v_line ->> 'account_code', '')), '');
    v_sku     := nullif(btrim(coalesce(v_line ->> 'sku', '')), '');
    v_desc    := nullif(btrim(coalesce(v_line ->> 'description', '')), '');

    if (v_rcpt is null) <> (v_pol_id is null) then
      raise exception 'Line %: a goods line names both its goods receipt and its PO line.', v_n
        using errcode = 'P0001', detail = 'grn_link_half';
    end if;

    if v_rcpt is not null then
      select * into v_pol from public.purchase_order_lines where id = v_pol_id;
      if not found then
        raise exception 'Line %: that PO line does not exist.', v_n
          using errcode = 'P0001', detail = 'po_line_missing';
      end if;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Line %: type how many % this bill charges for.', v_n, v_pol.sku
          using errcode = 'P0001', detail = 'grn_line_needs_qty';
      end if;
      if v_price is null or v_price < 0 then
        raise exception 'Line %: type the unit price on the supplier''s bill.', v_n
          using errcode = 'P0001', detail = 'grn_line_needs_price';
      end if;
      v_amount  := round(v_qty * v_price, 2);
      v_account := coalesce(v_account, '5100');     -- periodic stock: cost of goods sold
      v_sku     := coalesce(v_sku, v_pol.sku);
      v_desc    := coalesce(v_desc, v_pol.sku);
      if not (v_pol.po_id = any (v_pos)) then
        v_pos := v_pos || v_pol.po_id;
      end if;
    else
      if v_qty is not null and v_qty <= 0 then
        raise exception 'Line %: the quantity must be more than 0.', v_n
          using errcode = 'P0001', detail = 'line_qty_invalid';
      end if;
      if v_price is not null and v_price < 0 then
        raise exception 'Line %: the unit price cannot be below 0.', v_n
          using errcode = 'P0001', detail = 'line_price_invalid';
      end if;
      if v_qty is not null and v_price is not null then
        v_amount := round(v_qty * v_price, 2);
      end if;
      if v_desc is null and v_sku is null then
        raise exception 'Line %: say what this charge is for.', v_n
          using errcode = 'P0001', detail = 'line_needs_description';
      end if;
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Line %: the amount must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'line_amount_invalid';
    end if;
    perform public._ap_require_account(v_account, 'bill_line', format('Line %s', v_n));
    -- 0540: a goods line with no department takes its sales order's (DEPT-6).
    if v_pol_id is not null and nullif(btrim(coalesce(v_line ->> 'department_type', '')), '') is null then
      v_line := v_line || coalesce((select jsonb_build_object('department_type', d.department_type,
                                                              'department_id',   d.department_id)
                                      from public.fin_po_line_departments d
                                     where d.po_line_id = v_pol_id), '{}'::jsonb);
    end if;
    v_dept := public.fin_line_department(v_line, v_account, format('Line %s', v_n));

    insert into public.supplier_bill_lines
      (bill_id, line_no, account_code, description, sku, qty, unit_price, amount,
       warehouse_receipt_id, po_line_id, department_type, department_id)
    values
      (v_id, v_n, v_account, v_desc, v_sku, v_qty, v_price, v_amount,
       v_rcpt, v_pol_id, v_dept.department_type, v_dept.department_id);
    v_total := v_total + v_amount;
  end loop;

  update public.supplier_bills
     set total_amount = v_total,
         po_id        = case when cardinality(v_pos) = 1 then v_pos[1] end
   where id = v_id;

  perform public._ap_event('SUPPLIER_BILL', v_id,
                           case when p_bill_id is null then 'created' else 'edited' end, null);
  return v_id;
end;
$fn$;

create or replace function public.supplier_bill_confirm(p_bill_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_bill  public.supplier_bills%rowtype;
  v_total numeric(12,2);
  v_lines jsonb;
  v_no    text;
  v_entry uuid;
  v_bad   text;
  r       record;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance confirms a supplier bill'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill does not exist.'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;
  if v_bill.status <> 'draft' then
    raise exception 'This bill is already %.',
      case v_bill.status when 'confirmed' then 'confirmed' else 'cancelled' end
      using errcode = 'P0001', detail = 'bill_not_draft';
  end if;

  perform public.ap_refuse_before_go_live(v_bill.bill_date, 'This bill');
  perform public._ap_require_account(v_bill.ap_account_code, 'ap', 'Payables account');

  for r in select l.line_no, l.account_code
             from public.supplier_bill_lines l
            where l.bill_id = p_bill_id order by l.line_no loop
    perform public._ap_require_account(r.account_code, 'bill_line', format('Line %s', r.line_no));
  end loop;

  select coalesce(sum(amount), 0) into v_total
    from public.supplier_bill_lines where bill_id = p_bill_id;
  if v_total <= 0 then
    raise exception 'A bill of RM 0.00 is not a bill.'
      using errcode = 'P0001', detail = 'zero_total';
  end if;

  -- The GRNs as they stand NOW. Lock them first, so a concurrent bill on the
  -- same GRN waits for this one.
  perform 1
     from public.warehouse_receipts wr
    where wr.id in (select l.warehouse_receipt_id from public.supplier_bill_lines l
                     where l.bill_id = p_bill_id and l.warehouse_receipt_id is not null)
    for update;

  select string_agg(format('line %s', x.line_no), ', ' order by x.line_no) into v_bad
    from (
      select bl.line_no
        from public.supplier_bill_lines bl
        join public.warehouse_receipts wr on wr.id = bl.warehouse_receipt_id
       where bl.bill_id = p_bill_id
         and (wr.status <> 'posted'
              or (select coalesce(sum(b2l.qty), 0)
                    from public.supplier_bill_lines b2l
                    join public.supplier_bills b2 on b2.id = b2l.bill_id
                   where b2l.warehouse_receipt_id = bl.warehouse_receipt_id
                     and b2l.po_line_id = bl.po_line_id
                     and b2.status <> 'cancelled')
                 > public.ap_grn_billable_qty(bl.warehouse_receipt_id, bl.po_line_id))
    ) x;
  if v_bad is not null then
    raise exception 'The goods receipt changed after this bill was saved (%). Open the bill, correct the quantities and confirm again.', v_bad
      using errcode = 'P0001', detail = 'grn_changed_since_draft';
  end if;

  -- Dr each line, Cr the AP control for the whole, party = the supplier.
  select jsonb_agg(
           jsonb_build_object(
             'account_code', l.account_code,
             'debit',  l.amount,
             'credit', 0,
             'memo',   coalesce(l.description, l.sku),
             'department_type', l.department_type,   -- 0540
             'department_id',   l.department_id)
           order by l.line_no)
    into v_lines
    from public.supplier_bill_lines l
   where l.bill_id = p_bill_id;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'account_code', v_bill.ap_account_code,
      'debit',  0,
      'credit', v_total,
      'party_type', 'SUPPLIER',
      'party_id',   v_bill.supplier_id,
      'memo',       'Supplier invoice ' || v_bill.supplier_invoice_no));

  -- Random, not sequential — purchasing MASTER §6.1 (as 0464).
  v_no := public.allocate_formal_document_code('SB', v_bill.id::text, v_bill.bill_date);

  v_entry := public.gl_post(
    'SUPPLIER_BILL',
    v_no,
    v_bill.bill_date,
    coalesce(v_bill.narration,
             'Supplier bill ' || v_no || ' · invoice ' || v_bill.supplier_invoice_no),
    v_lines);

  update public.supplier_bills
     set bill_no      = v_no,
         total_amount = v_total,
         status       = 'confirmed',
         gl_entry_id  = v_entry,
         confirmed_at = now(),
         confirmed_by = auth.uid()
   where id = p_bill_id;

  perform public._ap_event('SUPPLIER_BILL', p_bill_id, 'confirmed', v_no);
  return v_entry;
end;
$fn$;

create or replace function public.payment_voucher_save_draft(
  p_voucher_id            uuid,
  p_purpose               text,
  p_supplier_id           uuid,
  p_payee_name            text,
  p_voucher_date          date,
  p_pay_from_account_code text,
  p_lines                 jsonb   default '[]'::jsonb,
  p_allocations           jsonb   default '[]'::jsonb,
  p_pay_method            text    default 'BANK_TRANSFER',
  p_pay_reference         text    default null,
  p_narration             text    default null,
  p_advance_amount        numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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

  -- The header, in the order the form asks for it: who, when, from where, how.
  -- Checked before what the voucher pays, so the first refusal names the
  -- first wrong field on the screen.
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

  -- The advance: money for this supplier before its bill (0484).
  if p_advance_amount is not null and round(p_advance_amount, 2) <> p_advance_amount then
    raise exception 'Type the advance in ringgit and sen, like 1250.00.'
      using errcode = 'P0001', detail = 'advance_invalid';
  end if;
  if v_advance < 0 then
    raise exception 'The advance cannot be less than RM 0.00.'
      using errcode = 'P0001', detail = 'advance_invalid';
  end if;
  if v_advance > 0 and v_purpose <> 'SUPPLIER_BILLS' then
    raise exception 'A direct payment does not carry an advance. Choose "Pay supplier bills" to pay a supplier before its bill.'
      using errcode = 'P0001', detail = 'direct_pays_no_advance';
  end if;
  if v_advance > 0 then
    -- The same payables account a bill from this supplier defaults to, so the
    -- advance can be knocked off that bill later.
    v_ap := case when v_supplier.kind::text = 'other_creditor' then '2120' else '2110' end;
    perform public._ap_require_account(v_ap, 'ap', 'Advance');
  end if;

  -- What it pays.
  if v_purpose = 'SUPPLIER_BILLS' then
    if jsonb_array_length(v_allocs) = 0 and v_advance = 0 then
      raise exception 'Choose at least one bill to pay, or type an advance.'
        using errcode = 'P0001', detail = 'no_bills';
    end if;
  else
    if jsonb_array_length(v_allocs) > 0 then
      raise exception 'A direct payment does not pay bills. Choose "Pay supplier bills" to pay a bill.'
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

  -- Read and check every line before anything is written.
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
    v_account := btrim(coalesce(v_line ->> 'account_code', ''));
    perform public._ap_require_account(v_account, 'voucher_line', format('Line %s', v_n));
    if v_account = v_pay_from then
      raise exception 'Line %: the money cannot be paid from and to the same account.', v_n
        using errcode = 'P0001', detail = 'line_is_pay_from';
    end if;
    perform public.fin_line_department(v_line, v_account, format('Line %s', v_n));   -- 0540
    v_total := v_total + v_amount;
  end loop;

  v_n := 0;
  for v_line in select value from jsonb_array_elements(v_allocs) loop
    v_n := v_n + 1;
    begin
      v_bill_id := nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '')::uuid;
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
       set purpose               = v_purpose,
           supplier_id           = p_supplier_id,
           payee_name            = v_payee,
           voucher_date          = p_voucher_date,
           amount                = v_total,
           advance_amount        = v_advance,
           ap_account_code       = v_ap,
           pay_method            = v_method,
           pay_reference         = nullif(btrim(coalesce(p_pay_reference, '')), ''),
           pay_from_account_code = v_pay_from,
           narration             = nullif(btrim(coalesce(p_narration, '')), '')
     where id = v_id;
    -- A draft's lines and bills are replaced whole — allowed only while draft
    -- (the two only-while-draft triggers). A draft has posted nothing.
    delete from public.payment_voucher_lines       where voucher_id = v_id;
    delete from public.payment_voucher_allocations where voucher_id = v_id;
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

  -- The ceilings (bill confirmed, same supplier, not over-paid) are the
  -- allocation trigger's job — it locks the bill while it measures.
  for v_line in select value from jsonb_array_elements(v_allocs) loop
    insert into public.payment_voucher_allocations (voucher_id, bill_id, amount_applied, created_by)
    values (v_id, (v_line ->> 'bill_id')::uuid,
            round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2),
            v_me);
  end loop;

  perform public._ap_event('PAYMENT_VOUCHER', v_id,
                           case when p_voucher_id is null then 'created' else 'edited' end, null);
  return v_id;
end;
$fn$;

create or replace function public.payment_voucher_approve(p_voucher_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_v     public.payment_vouchers%rowtype;
  v_me    uuid := auth.uid();
  v_lines jsonb := '[]'::jsonb;
  v_entry uuid;
  r       record;
begin
  if v_me is null then
    raise exception 'no signed-in account'
      using errcode = '42501', detail = 'no_session';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status <> 'checked' then
    raise exception 'Only a checked payment voucher can be approved.'
      using errcode = 'P0001', detail = 'voucher_not_checked';
  end if;

  if not public.has_finance_approver(v_me) then
    raise exception 'Approving a payment takes the finance approver.'
      using errcode = '42501', detail = 'not_finance_approver';
  end if;

  -- THE SEPARATION OF DUTIES. Worded so nobody reads it as a permission that
  -- somebody in HR forgot to switch on.
  if v_v.prepared_by = v_me then
    raise exception
      'separation of duties: you prepared payment voucher %, so you may not also approve it. This is not a permissions problem and granting yourself another duty will not change it — two people sign a payment out, and the second one must be somebody else.',
      v_v.voucher_no
      using errcode = 'P0001', detail = 'separation_of_duties',
            hint = 'Ask another holder of the finance approver duty to approve it.';
  end if;

  -- 0529: three people sign a payment out. The checker is not the approver.
  if v_v.checked_by = v_me then
    raise exception
      'You checked payment voucher %, so somebody else must approve it. Three different people prepare, check and approve a payment.',
      v_v.voucher_no
      using errcode = '42501', detail = 'checker_cannot_approve',
            hint = 'Ask another finance approver to approve it.';
  end if;

  -- Lock the bills this voucher pays, then re-check everything as it stands.
  perform 1 from public.supplier_bills b
   where b.id in (select a.bill_id from public.payment_voucher_allocations a
                   where a.voucher_id = p_voucher_id)
     for update;
  perform public._payment_voucher_validate(p_voucher_id);

  -- Dr each direct line.
  for r in select l.account_code, l.amount, l.description, l.department_type, l.department_id
             from public.payment_voucher_lines l
            where l.voucher_id = p_voucher_id order by l.line_no loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', r.account_code,
      'debit',  r.amount,
      'credit', 0,
      'memo',   coalesce(r.description, 'Payment voucher ' || v_v.voucher_no),
      'department_type', r.department_type,   -- 0540
      'department_id',   r.department_id));
  end loop;

  -- Dr each paid bill's OWN AP control, party = that bill's supplier.
  for r in select b.ap_account_code, b.supplier_id, b.bill_no, b.supplier_invoice_no,
                  a.amount_applied
             from public.payment_voucher_allocations a
             join public.supplier_bills b on b.id = a.bill_id
            where a.voucher_id = p_voucher_id
            order by b.bill_date, b.bill_no loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', r.ap_account_code,
      'debit',  r.amount_applied,
      'credit', 0,
      'party_type', 'SUPPLIER',
      'party_id',   r.supplier_id,
      'memo',   'Pays ' || r.bill_no || ' · invoice ' || r.supplier_invoice_no));
  end loop;

  -- Dr the advance to the supplier's own payables control (0484). The bill it
  -- is knocked off later credits the same account and party, so the knock-off
  -- itself moves nothing.
  if v_v.advance_amount > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', v_v.ap_account_code,
      'debit',  v_v.advance_amount,
      'credit', 0,
      'party_type', 'SUPPLIER',
      'party_id',   v_v.supplier_id,
      'memo',   'Advance · ' || v_v.voucher_no));
  end if;

  -- Cr the money account, for the whole voucher.
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code', v_v.pay_from_account_code,
    'debit',  0,
    'credit', v_v.amount,
    'memo',   concat_ws(' · ',
                case v_v.pay_method
                  when 'BANK_TRANSFER' then 'Bank transfer'
                  when 'CHEQUE' then 'Cheque'
                  when 'CASH' then 'Cash'
                  else 'Other' end,
                v_v.pay_reference,
                v_v.payee_name)));

  v_entry := public.gl_post(
    'PAYMENT_VOUCHER',
    v_v.voucher_no,
    v_v.voucher_date,
    coalesce(v_v.narration, 'Payment voucher ' || v_v.voucher_no || ' · ' || v_v.payee_name),
    v_lines);

  update public.payment_vouchers
     set status      = 'approved',
         gl_entry_id = v_entry,
         approved_at = now(),
         approved_by = v_me
   where id = p_voucher_id;

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'approved', v_v.voucher_no);
  return v_entry;
end;
$fn$;

create or replace function public.other_debtor_invoice_write_lines(p_invoice_id uuid, p_lines jsonb)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_elem    jsonb;
  v_idx     integer := 0;
  v_code    text;
  v_problem text;
  v_amount  numeric(12,2);
  v_total   numeric(12,2) := 0;
  v_dept    record;   -- 0540
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An invoice needs at least one line.'
      using errcode = '22023', detail = 'no_lines';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'An invoice takes at most 50 lines.'
      using errcode = '22023', detail = 'too_many_lines';
  end if;
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'Line %: not a line.', v_idx
        using errcode = '22023', detail = 'line_not_object';
    end if;
    v_code := btrim(coalesce(v_elem ->> 'account_code', ''));
    v_problem := public.fin_money_in_account_problem(v_code, 'invoice_line');
    if v_problem is not null then
      raise exception 'Line %: %', v_idx, v_problem
        using errcode = '22023', detail = 'line_account_refused';
    end if;
    v_amount := public.fin_json_amount(v_elem, 'amount', format('Line %s', v_idx));
    v_dept := public.fin_line_department(v_elem, v_code, format('Line %s', v_idx));   -- 0540
    insert into public.other_debtor_invoice_lines
      (invoice_id, line_no, account_code, description, amount, department_type, department_id)
    values (p_invoice_id, v_idx, v_code,
            nullif(btrim(coalesce(v_elem ->> 'description', '')), ''), v_amount,
            v_dept.department_type, v_dept.department_id);
    v_total := v_total + v_amount;
  end loop;
  return v_total;
end;
$fn$;

create or replace function public.other_debtor_invoice_issue(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    text := public.app_role()::text;
  v_inv     public.other_debtor_invoices%rowtype;
  v_party   public.finance_parties%rowtype;
  v_line    record;
  v_problem text;
  v_total   numeric(12,2);
  v_ctl     text;
  v_no      text;
  v_lines   jsonb;
  v_entry   uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance issues an other debtor invoice.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_inv from public.other_debtor_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.'
      using errcode = 'P0002', detail = 'invoice_missing';
  end if;
  if v_inv.status = 'issued' then
    raise exception 'Invoice % is already issued.', v_inv.invoice_no
      using errcode = '22023', detail = 'already_issued';
  end if;
  if v_inv.status = 'cancelled' then
    raise exception 'This invoice is cancelled. It cannot be issued.'
      using errcode = '22023', detail = 'invoice_cancelled';
  end if;

  select * into v_party from public.finance_parties where id = v_inv.party_id;
  if not v_party.is_active then
    raise exception '% is no longer on the list. The invoice cannot be issued.', v_party.name
      using errcode = '22023', detail = 'party_inactive';
  end if;

  perform public.fin_refuse_before_go_live(v_inv.invoice_date, 'This invoice');

  -- The chart may have moved since the draft was saved.
  for v_line in select l.line_no, l.account_code from public.other_debtor_invoice_lines l
                 where l.invoice_id = p_invoice_id order by l.line_no loop
    v_problem := public.fin_money_in_account_problem(v_line.account_code, 'invoice_line');
    if v_problem is not null then
      raise exception 'Line %: %', v_line.line_no, v_problem
        using errcode = '22023', detail = 'line_account_refused';
    end if;
  end loop;

  select coalesce(sum(amount), 0) into v_total
    from public.other_debtor_invoice_lines where invoice_id = p_invoice_id;
  if v_total <= 0 then
    raise exception 'An invoice of RM 0.00 is not an invoice.'
      using errcode = '22023', detail = 'zero_total';
  end if;

  v_ctl := public.fin_other_debtor_control_account();

  -- Random, not counted (0381, purchasing MASTER §6.1): this number goes to a
  -- sister company, and a counted one would tell them how many we raised.
  v_no := public.allocate_formal_document_code('ARI', v_inv.id::text, v_inv.invoice_date);

  select jsonb_build_array(jsonb_build_object(
           'account_code', v_ctl,
           'debit',        v_total,
           'credit',       0,
           'party_type',   'OTHER',
           'party_id',     v_inv.party_id,
           'memo',         'Invoice ' || v_no || ' · ' || v_party.name))
         || coalesce(jsonb_agg(jsonb_build_object(
           'account_code', l.account_code,
           'debit',        0,
           'credit',       l.amount,
           'memo',         coalesce(l.description, 'Invoice ' || v_no),
           'department_type', l.department_type,   -- 0540
           'department_id',   l.department_id)
           order by l.line_no), '[]'::jsonb)
    into v_lines
    from public.other_debtor_invoice_lines l
   where l.invoice_id = p_invoice_id;

  v_entry := public.gl_post(
    'OTHER_DEBTOR_INVOICE',
    v_no,
    v_inv.invoice_date,
    coalesce(v_inv.narration, 'Other debtor invoice ' || v_no || ' · ' || v_party.name),
    v_lines);

  update public.other_debtor_invoices
     set invoice_no          = v_no,
         total_amount        = v_total,
         debtor_account_code = v_ctl,
         status              = 'issued',
         gl_entry_id         = v_entry,
         issued_at           = now(),
         issued_by           = auth.uid(),
         updated_at          = now(),
         updated_by          = auth.uid()
   where id = p_invoice_id;

  return v_entry;
end;
$fn$;

create or replace function public.other_receipt_create(
  p_receipt_date       date,
  p_money_account_code text,
  p_lines              jsonb default '[]'::jsonb,
  p_allocations        jsonb default '[]'::jsonb,
  p_party_id           uuid  default null,
  p_payer_name         text  default null,
  p_reference          text  default null,
  p_narration          text  default null,
  p_idempotency_key    uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role        text := public.app_role()::text;
  v_existing    uuid;
  v_party       public.finance_parties%rowtype;
  v_has_party   boolean := false;
  v_payer       text;
  v_problem     text;
  v_lines       jsonb := coalesce(p_lines, '[]'::jsonb);
  v_allocs      jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_elem        jsonb;
  v_idx         integer;
  v_code        text;
  v_amount      numeric(12,2);
  v_inv_id      uuid;
  v_inv         public.other_debtor_invoices%rowtype;
  v_received    numeric(12,2);
  v_seen        uuid[] := '{}';
  v_line_rows   jsonb := '[]'::jsonb;
  v_alloc_rows  jsonb := '[]'::jsonb;
  v_total       numeric(12,2) := 0;
  v_id          uuid;
  v_no          text;
  v_gl          jsonb;
  v_entry       uuid;
  v_dept        record;   -- 0540
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance records a receipt.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  -- A double press sends the same key twice. The lock queues the second call
  -- behind the first, and the second finds the first's receipt.
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('other_receipt:' || p_idempotency_key::text, 0));
    select id into v_existing from public.other_receipts where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if p_receipt_date is null then
    raise exception 'Choose the date the money was received.'
      using errcode = '22023', detail = 'date_missing';
  end if;
  perform public.fin_refuse_before_go_live(p_receipt_date, 'This receipt');

  v_problem := public.fin_money_in_account_problem(p_money_account_code, 'money');
  if v_problem is not null then
    raise exception 'Received into: %', v_problem
      using errcode = '22023', detail = 'money_account_refused';
  end if;

  if p_party_id is not null then
    select * into v_party from public.finance_parties where id = p_party_id;
    if not found then
      raise exception 'Party not found.'
        using errcode = 'P0002', detail = 'party_missing';
    end if;
    if not v_party.is_active then
      raise exception '% is no longer on the list.', v_party.name
        using errcode = '22023', detail = 'party_inactive';
    end if;
    v_has_party := true;
  end if;

  v_payer := nullif(btrim(coalesce(p_payer_name, '')), '');
  if v_payer is null and v_has_party then
    v_payer := v_party.name;
  end if;
  if v_payer is null then
    raise exception 'Who paid? Type the payer''s name, or choose a party.'
      using errcode = '22023', detail = 'payer_missing';
  end if;

  if jsonb_typeof(v_lines) <> 'array' or jsonb_typeof(v_allocs) <> 'array' then
    raise exception 'The lines of a receipt must be a list.'
      using errcode = '22023', detail = 'lines_not_array';
  end if;
  if jsonb_array_length(v_lines) + jsonb_array_length(v_allocs) = 0 then
    raise exception 'A receipt needs at least one line, or one invoice it pays.'
      using errcode = '22023', detail = 'no_lines';
  end if;
  if jsonb_array_length(v_lines) > 50 or jsonb_array_length(v_allocs) > 50 then
    raise exception 'A receipt takes at most 50 lines and 50 invoices.'
      using errcode = '22023', detail = 'too_many_lines';
  end if;

  -- Lines: what the money was, when it is not an invoice being paid.
  v_idx := 0;
  for v_elem in select value from jsonb_array_elements(v_lines) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'Line %: not a line.', v_idx
        using errcode = '22023', detail = 'line_not_object';
    end if;
    v_code := btrim(coalesce(v_elem ->> 'account_code', ''));
    v_problem := public.fin_money_in_account_problem(v_code, 'receipt_line');
    if v_problem is not null then
      raise exception 'Line %: %', v_idx, v_problem
        using errcode = '22023', detail = 'line_account_refused';
    end if;
    v_amount := public.fin_json_amount(v_elem, 'amount', format('Line %s', v_idx));
    v_dept := public.fin_line_department(v_elem, v_code, format('Line %s', v_idx));   -- 0540
    v_line_rows := v_line_rows || jsonb_build_object(
      'line_no', v_idx, 'account_code', v_code, 'amount', v_amount,
      'description', nullif(btrim(coalesce(v_elem ->> 'description', '')), ''),
      'department_type', v_dept.department_type, 'department_id', v_dept.department_id);
    v_total := v_total + v_amount;
  end loop;

  -- Invoices: money against other debtor invoices of this same party.
  if jsonb_array_length(v_allocs) > 0 then
    if not v_has_party then
      raise exception 'Money against an invoice needs the party the invoice was issued to.'
        using errcode = '22023', detail = 'party_missing';
    end if;
    -- Lock every invoice first, in one fixed order, so two receipts naming
    -- the same invoices cannot deadlock each other.
    begin
      perform 1 from public.other_debtor_invoices i
       where i.id in (select (e ->> 'invoice_id')::uuid from jsonb_array_elements(v_allocs) e)
       order by i.id
       for update;
    exception when invalid_text_representation then
      raise exception 'An invoice in this receipt is not a valid invoice.'
        using errcode = '22023', detail = 'invoice_id_invalid';
    end;

    v_idx := 0;
    for v_elem in select value from jsonb_array_elements(v_allocs) loop
      v_idx := v_idx + 1;
      v_inv_id := nullif(btrim(coalesce(v_elem ->> 'invoice_id', '')), '')::uuid;
      if v_inv_id is null then
        raise exception 'Invoice %: choose the invoice.', v_idx
          using errcode = '22023', detail = 'invoice_missing';
      end if;
      if v_inv_id = any(v_seen) then
        raise exception 'The same invoice is listed twice. Put the whole amount on one row.'
          using errcode = '22023', detail = 'invoice_twice';
      end if;
      v_seen := v_seen || v_inv_id;

      select * into v_inv from public.other_debtor_invoices where id = v_inv_id;
      if not found then
        raise exception 'Invoice not found.'
          using errcode = 'P0002', detail = 'invoice_missing';
      end if;
      if v_inv.status <> 'issued' then
        raise exception 'Only an issued invoice can be paid. This one is %.', v_inv.status
          using errcode = '22023', detail = 'invoice_not_issued';
      end if;
      if v_inv.party_id <> p_party_id then
        raise exception 'Invoice % was issued to a different party.', v_inv.invoice_no
          using errcode = '22023', detail = 'party_mismatch';
      end if;

      v_amount := public.fin_json_amount(v_elem, 'amount', 'Invoice ' || v_inv.invoice_no);
      select coalesce(sum(a.amount), 0) into v_received
        from public.other_receipt_allocations a
        join public.other_receipts r on r.id = a.receipt_id
       where a.invoice_id = v_inv.id and r.status = 'posted';
      if v_amount > v_inv.total_amount - v_received then
        raise exception 'Invoice % has % outstanding. % is more than that.',
          v_inv.invoice_no, public.fin_rm(v_inv.total_amount - v_received), public.fin_rm(v_amount)
          using errcode = 'P0001', detail = 'invoice_over_received';
      end if;

      v_alloc_rows := v_alloc_rows || jsonb_build_object(
        'invoice_id', v_inv.id, 'invoice_no', v_inv.invoice_no,
        'account_code', v_inv.debtor_account_code, 'amount', v_amount);
      v_total := v_total + v_amount;
    end loop;
  end if;

  if v_total <= 0 then
    raise exception 'A receipt of RM 0.00 is not a receipt.'
      using errcode = '22023', detail = 'zero_total';
  end if;

  v_id := gen_random_uuid();
  v_no := public.allocate_formal_document_code('RV', v_id::text, p_receipt_date);

  -- The entry: one debit to the money, one credit per line and per invoice.
  v_gl := jsonb_build_array(jsonb_build_object(
    'account_code', btrim(p_money_account_code),
    'debit',        v_total,
    'credit',       0,
    'memo',         'Receipt ' || v_no || ' · ' || v_payer));
  select v_gl || coalesce(jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'account_code', l ->> 'account_code',
             'debit',        0,
             'credit',       (l ->> 'amount')::numeric,
             'party_type',   case when v_has_party then 'OTHER' end,
             'party_id',     case when v_has_party then p_party_id end,
             'memo',         coalesce(l ->> 'description', 'Receipt ' || v_no),
             'department_type', l ->> 'department_type',   -- 0540
             'department_id',   l ->> 'department_id'))
           order by (l ->> 'line_no')::int), '[]'::jsonb)
    into v_gl
    from jsonb_array_elements(v_line_rows) l;
  select v_gl || coalesce(jsonb_agg(
           jsonb_build_object(
             'account_code', a ->> 'account_code',
             'debit',        0,
             'credit',       (a ->> 'amount')::numeric,
             'party_type',   'OTHER',
             'party_id',     p_party_id,
             'memo',         'Invoice ' || (a ->> 'invoice_no'))
           order by a ->> 'invoice_no'), '[]'::jsonb)
    into v_gl
    from jsonb_array_elements(v_alloc_rows) a;

  v_entry := public.gl_post(
    'OTHER_RECEIPT',
    v_no,
    p_receipt_date,
    coalesce(nullif(btrim(coalesce(p_narration, '')), ''), 'Receipt ' || v_no || ' · ' || v_payer),
    v_gl);

  insert into public.other_receipts
    (id, receipt_no, party_id, payer_name, receipt_date, money_account_code,
     reference, narration, total_amount, status, gl_entry_id, idempotency_key, created_by)
  values
    (v_id, v_no, p_party_id, v_payer, p_receipt_date, btrim(p_money_account_code),
     nullif(btrim(coalesce(p_reference, '')), ''),
     nullif(btrim(coalesce(p_narration, '')), ''),
     v_total, 'posted', v_entry, p_idempotency_key, auth.uid());

  insert into public.other_receipt_lines
    (receipt_id, line_no, account_code, description, amount, department_type, department_id)
  select v_id, (l ->> 'line_no')::int, l ->> 'account_code', l ->> 'description', (l ->> 'amount')::numeric,
         l ->> 'department_type', (l ->> 'department_id')::uuid
    from jsonb_array_elements(v_line_rows) l;

  insert into public.other_receipt_allocations (receipt_id, invoice_id, amount)
  select v_id, (a ->> 'invoice_id')::uuid, (a ->> 'amount')::numeric
    from jsonb_array_elements(v_alloc_rows) a;

  return v_id;
end;
$fn$;

-- ── 6 · Reports take an optional department (bodies: 0469, BS 0507) ────────
-- Only change: the lines are read through gl_department_lines(...).
drop function public.gl_trial_balance(date);
drop function public.gl_account_ledger(text, date, date);
drop function public.gl_profit_and_loss(date, date);
drop function public.gl_balance_sheet(date);
create function public.gl_trial_balance(
  p_as_of date,
  p_department_type text default null,
  p_department_id   uuid default null
)
returns table (
  report_status   text,
  go_live_on      date,
  as_of           date,
  ordinal         bigint,
  row_kind        text,
  account_code    text,
  account_name    text,
  kind            text,
  is_control      boolean,
  is_active       boolean,
  total_debit     numeric(14,2),
  total_credit    numeric(14,2),
  natural_balance numeric(14,2),
  balances        boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live date;
begin
  v_go_live := public.gl_report_guard();

  if p_as_of is null then
    raise exception 'gl_trial_balance: p_as_of is required'
      using errcode = '22004';
  end if;

  -- Before the ledger starts is a STATEMENT, not an absence of rows.
  if p_as_of < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_as_of, 1::bigint, 'NOTICE'::text,
             null::text, null::text, null::text, null::boolean, null::boolean,
             null::numeric(14,2), null::numeric(14,2), null::numeric(14,2), null::boolean;
    return;
  end if;

  return query
  with movement as (
    select l.account_code                as acct,
           sum(l.debit)::numeric(14,2)   as dr,
           sum(l.credit)::numeric(14,2)  as cr
    from public.gl_department_lines(p_department_type, p_department_id) l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted
      and e.entry_date <= p_as_of
    group by l.account_code
  ),
  per_account as (
    select a.code, a.name, a.kind, a.is_control, a.is_active,
           coalesce(m.dr, 0)::numeric(14,2) as dr,
           coalesce(m.cr, 0)::numeric(14,2) as cr
    from public.gl_accounts a
    left join movement m on m.acct = a.code
  ),
  body as (
    select 0                                  as sort1,
           p.code                             as sort2,
           row_number() over (order by p.code) as ord_hint,
           'ACCOUNT'::text                    as rk,
           p.code, p.name, p.kind, p.is_control, p.is_active,
           p.dr, p.cr,
           (case when p.kind in ('ASSET','EXPENSE')
                 then p.dr - p.cr
                 else p.cr - p.dr end)::numeric(14,2) as nat,
           null::boolean                      as bal
    from per_account p
    union all
    select 1, null, 0,
           'TOTAL'::text,
           null, 'All accounts', null, null, null,
           coalesce(sum(p.dr), 0)::numeric(14,2),
           coalesce(sum(p.cr), 0)::numeric(14,2),
           null::numeric(14,2),
           (coalesce(sum(p.dr), 0) = coalesce(sum(p.cr), 0))
    from per_account p
  )
  select 'OK'::text,
         v_go_live,
         p_as_of,
         row_number() over (order by b.sort1, b.sort2 nulls last),
         b.rk, b.code, b.name, b.kind, b.is_control, b.is_active,
         b.dr, b.cr, b.nat, b.bal
  from body b
  order by b.sort1, b.sort2 nulls last;
end;
$$;

create function public.gl_account_ledger(
  p_account_code text,
  p_from         date,
  p_to           date,
  p_department_type text default null,
  p_department_id   uuid default null
)
returns table (
  report_status   text,
  go_live_on      date,
  period_from     date,
  period_to       date,
  account_code    text,
  account_name    text,
  kind            text,
  ordinal         bigint,
  row_kind        text,
  entry_date      date,
  entry_no        text,
  source_type     text,
  source_doc_no   text,
  narration       text,
  memo            text,
  party_type      text,
  party_id        uuid,
  debit           numeric(14,2),
  credit          numeric(14,2),
  running_balance numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live date;
  v_name    text;
  v_kind    text;
  v_opening numeric(14,2);
begin
  v_go_live := public.gl_report_guard();

  if p_account_code is null or p_from is null or p_to is null then
    raise exception 'gl_account_ledger: p_account_code, p_from and p_to are all required'
      using errcode = '22004';
  end if;
  if p_to < p_from then
    raise exception 'gl_account_ledger: p_to (%) is earlier than p_from (%)', p_to, p_from
      using errcode = '22007';
  end if;

  select a.name, a.kind into v_name, v_kind
  from public.gl_accounts a
  where a.code = p_account_code;

  -- An account that is not in the chart is said out loud. Returning nothing
  -- would read as "this account had a quiet year".
  if v_name is null then
    return query
      select 'ACCOUNT_NOT_FOUND'::text, v_go_live, p_from, p_to,
             p_account_code, null::text, null::text,
             1::bigint, 'NOTICE'::text,
             null::date, null::text, null::text, null::text, null::text, null::text,
             null::text, null::uuid,
             null::numeric(14,2), null::numeric(14,2), null::numeric(14,2);
    return;
  end if;

  if p_to < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_from, p_to,
             p_account_code, v_name, v_kind,
             1::bigint, 'NOTICE'::text,
             null::date, null::text, null::text, null::text, null::text, null::text,
             null::text, null::uuid,
             null::numeric(14,2), null::numeric(14,2), null::numeric(14,2);
    return;
  end if;

  -- The opening balance: EVERYTHING before p_from, not just this financial year.
  select coalesce(sum(
           case when v_kind in ('ASSET','EXPENSE')
                then l.debit - l.credit
                else l.credit - l.debit end), 0)::numeric(14,2)
    into v_opening
  from public.gl_department_lines(p_department_type, p_department_id) l
  join public.gl_entries e on e.id = l.entry_id
  where e.posted
    and l.account_code = p_account_code
    and e.entry_date < p_from;

  return query
  with in_window as (
    select e.entry_date  as ed,
           e.entry_no    as eno,
           e.source_type as st,
           e.source_doc_no as sdn,
           e.narration   as narr,
           l.line_no     as ln,
           l.memo        as mm,
           l.party_type  as pt,
           l.party_id    as pid,
           l.debit::numeric(14,2)  as dr,
           l.credit::numeric(14,2) as cr,
           (case when v_kind in ('ASSET','EXPENSE')
                 then l.debit - l.credit
                 else l.credit - l.debit end)::numeric(14,2) as signed_amt
    from public.gl_department_lines(p_department_type, p_department_id) l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted
      and l.account_code = p_account_code
      and e.entry_date between p_from and p_to
  ),
  running as (
    select w.*,
           (v_opening + sum(w.signed_amt) over (
              order by w.ed, w.eno, w.ln
              rows between unbounded preceding and current row
           ))::numeric(14,2) as rb,
           row_number() over (order by w.ed, w.eno, w.ln) as rn
    from in_window w
  ),
  body as (
    -- row one, always, even when the window is empty
    select 0 as sort1, 0::bigint as sort2,
           'OPENING'::text as rk,
           null::date as ed, null::text as eno, null::text as st, null::text as sdn,
           'Opening balance'::text as narr,
           ('Everything posted before ' || p_from::text)::text as mm,
           null::text as pt, null::uuid as pid,
           null::numeric(14,2) as dr, null::numeric(14,2) as cr,
           v_opening as rb
    union all
    select 1, r.rn, 'LINE'::text,
           r.ed, r.eno, r.st, r.sdn, r.narr, r.mm, r.pt, r.pid, r.dr, r.cr, r.rb
    from running r
    union all
    select 2, 0::bigint, 'CLOSING'::text,
           null::date, null::text, null::text, null::text,
           'Closing balance'::text,
           ('As at ' || p_to::text)::text,
           null::text, null::uuid,
           (select coalesce(sum(w.dr), 0)::numeric(14,2) from in_window w),
           (select coalesce(sum(w.cr), 0)::numeric(14,2) from in_window w),
           (v_opening + (select coalesce(sum(w.signed_amt), 0) from in_window w))::numeric(14,2)
  )
  select 'OK'::text, v_go_live, p_from, p_to,
         p_account_code, v_name, v_kind,
         row_number() over (order by b.sort1, b.sort2),
         b.rk, b.ed, b.eno, b.st, b.sdn, b.narr, b.mm, b.pt, b.pid, b.dr, b.cr, b.rb
  from body b
  order by b.sort1, b.sort2;
end;
$$;

create function public.gl_profit_and_loss(
  p_from date,
  p_to   date,
  p_department_type text default null,
  p_department_id   uuid default null
)
returns table (
  report_status text,
  go_live_on    date,
  period_from   date,
  period_to     date,
  ordinal       bigint,
  section       text,
  row_kind      text,
  header_code   text,
  header_name   text,
  account_code  text,
  account_name  text,
  amount        numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live date;
begin
  v_go_live := public.gl_report_guard();

  if p_from is null or p_to is null then
    raise exception 'gl_profit_and_loss: p_from and p_to are both required'
      using errcode = '22004';
  end if;
  if p_to < p_from then
    raise exception 'gl_profit_and_loss: p_to (%) is earlier than p_from (%)', p_to, p_from
      using errcode = '22007';
  end if;

  if p_to < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_from, p_to, 1::bigint,
             null::text, 'NOTICE'::text, null::text, null::text, null::text, null::text,
             null::numeric(14,2);
    return;
  end if;

  return query
  with movement as (
    select l.account_code as acct,
           sum(l.debit)::numeric(14,2)  as dr,
           sum(l.credit)::numeric(14,2) as cr
    from public.gl_department_lines(p_department_type, p_department_id) l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted
      and e.entry_date between p_from and p_to
    group by l.account_code
  ),
  pl_accounts as (
    select a.code,
           a.name,
           a.kind,
           coalesce(a.parent_code, a.code) as hdr,
           -- income reads credit-positive, expense reads debit-positive, so both
           -- sections are printed as plain positive amounts and the net figure
           -- is income minus expense with no sign gymnastics on the screen.
           (case when a.kind = 'INCOME'
                 then coalesce(m.cr, 0) - coalesce(m.dr, 0)
                 else coalesce(m.dr, 0) - coalesce(m.cr, 0) end)::numeric(14,2) as amt
    from public.gl_accounts a
    left join movement m on m.acct = a.code
    where a.kind in ('INCOME','EXPENSE')
      and (a.is_active or m.acct is not null)   -- retired accounts still show if they moved
  ),
  hdr_names as (
    select h.code, h.name from public.gl_accounts h
  ),
  body as (
    select case when p.kind = 'INCOME' then 1 else 2 end as sort1,
           p.hdr                                          as sort2,
           0                                              as sort3,
           p.code                                         as sort4,
           p.kind                                         as sect,
           'ACCOUNT'::text                                as rk,
           p.hdr                                          as hcode,
           hn.name                                        as hname,
           p.code                                         as acode,
           p.name                                         as aname,
           p.amt                                          as amt
    from pl_accounts p
    left join hdr_names hn on hn.code = p.hdr

    union all

    select case when p.kind = 'INCOME' then 1 else 2 end,
           p.hdr, 1, '',
           p.kind, 'HEADER_SUBTOTAL'::text,
           p.hdr, hn.name,
           null::text, null::text,
           sum(p.amt)::numeric(14,2)
    from pl_accounts p
    left join hdr_names hn on hn.code = p.hdr
    group by 1, p.hdr, hn.name, p.kind

    union all

    select case when p.kind = 'INCOME' then 1 else 2 end,
           null, 2, '',
           p.kind, 'SECTION_TOTAL'::text,
           null::text,
           case when p.kind = 'INCOME' then 'Total income' else 'Total expense' end,
           null::text, null::text,
           sum(p.amt)::numeric(14,2)
    from pl_accounts p
    group by 1, p.kind

    union all

    select 3, null, 0, '',
           'NET'::text, 'NET'::text,
           null::text, 'Net result for the period'::text,
           null::text, null::text,
           coalesce(sum(case when p.kind = 'INCOME' then p.amt else -p.amt end), 0)::numeric(14,2)
    from pl_accounts p
  )
  select 'OK'::text, v_go_live, p_from, p_to,
         row_number() over (order by b.sort1, b.sort2 nulls last, b.sort3, b.sort4),
         b.sect, b.rk, b.hcode, b.hname, b.acode, b.aname, b.amt
  from body b
  order by b.sort1, b.sort2 nulls last, b.sort3, b.sort4;
end;
$$;

create function public.gl_balance_sheet(
  p_as_of date,
  p_department_type text default null,
  p_department_id   uuid default null
)
returns table (
  report_status       text,
  go_live_on          date,
  as_of               date,
  ordinal             bigint,
  section             text,
  row_kind            text,
  header_code         text,
  header_name         text,
  account_code        text,
  account_name        text,
  amount              numeric(14,2),
  equation_balances   boolean,
  equation_difference numeric(14,2),
  reclassified        numeric(14,2),
  reclassified_for    text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  -- Where customers' money paid before the invoice is shown. The account's own
  -- name ("Customer deposits held") is the line label.
  c_deposits constant text := '2210';
  -- Where money paid to suppliers before their bill is shown (0507). The
  -- account's own name ("Advances to suppliers") is the line label.
  c_advances constant text := '1230';
  v_go_live        date;
  v_assets         numeric(14,2);
  v_liab           numeric(14,2);
  v_equity         numeric(14,2);
  v_result         numeric(14,2);
  v_diff           numeric(14,2);
  v_moved_by_acct  jsonb;
  v_moved          numeric(14,2);
  v_adv_by_acct    jsonb;
  v_adv            numeric(14,2);
begin
  v_go_live := public.gl_report_guard();

  if p_as_of is null then
    raise exception 'gl_balance_sheet: p_as_of is required'
      using errcode = '22004';
  end if;

  if p_as_of < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_as_of, 1::bigint,
             null::text, 'NOTICE'::text, null::text, null::text, null::text, null::text,
             null::numeric(14,2), null::boolean, null::numeric(14,2), null::numeric(14,2),
             null::text;
    return;
  end if;

  -- Customers who paid before their invoice (0506). Each customer's balance on
  -- each customer control asset account; a balance below zero is money held
  -- for that customer. Summed per account, computed once.
  select coalesce(jsonb_object_agg(c.acct, c.moved), '{}'::jsonb),
         coalesce(sum(c.moved), 0)::numeric(14,2)
  into v_moved_by_acct, v_moved
  from (
    select p.acct, sum(-p.bal)::numeric(14,2) as moved
    from (
      select l.account_code as acct,
             sum(l.debit - l.credit) as bal
      from public.gl_department_lines(p_department_type, p_department_id) l
      join public.gl_entries e on e.id = l.entry_id
      join public.gl_accounts a on a.code = l.account_code
      where e.posted
        and e.entry_date <= p_as_of
        and a.kind = 'ASSET'
        and a.control_for = 'CUSTOMER'
      group by l.account_code, l.party_type, l.party_id
    ) p
    where p.bal < 0
    group by p.acct
  ) c;

  -- Suppliers paid before their bill (0507). Each supplier's balance on each
  -- supplier control liability account; a balance below zero is money Carres
  -- paid that supplier ahead of its bills. Summed per account, computed once.
  select coalesce(jsonb_object_agg(c.acct, c.moved), '{}'::jsonb),
         coalesce(sum(c.moved), 0)::numeric(14,2)
  into v_adv_by_acct, v_adv
  from (
    select p.acct, sum(-p.bal)::numeric(14,2) as moved
    from (
      select l.account_code as acct,
             sum(l.credit - l.debit) as bal
      from public.gl_department_lines(p_department_type, p_department_id) l
      join public.gl_entries e on e.id = l.entry_id
      join public.gl_accounts a on a.code = l.account_code
      where e.posted
        and e.entry_date <= p_as_of
        and a.kind = 'LIABILITY'
        and a.control_for = 'SUPPLIER'
      group by l.account_code, l.party_type, l.party_id
    ) p
    where p.bal < 0
    group by p.acct
  ) c;

  -- The moved money needs a line to land on. Without it the totals below would
  -- still agree while the printed rows did not, so refuse instead.
  if v_moved <> 0 and not exists (
    select 1 from public.gl_accounts where code = c_deposits and kind = 'LIABILITY'
  ) then
    raise exception 'gl_balance_sheet: account % (LIABILITY) is missing', c_deposits
      using errcode = 'P0002';
  end if;
  if v_adv <> 0 and not exists (
    select 1 from public.gl_accounts where code = c_advances and kind = 'ASSET'
  ) then
    raise exception 'gl_balance_sheet: account % (ASSET) is missing', c_advances
      using errcode = 'P0002';
  end if;

  -- The three section totals and the undistributed result, computed once so the
  -- equation row is arithmetic on the same numbers the rows below print.
  --
  -- The result line reads `credit - debit` for BOTH income and expense on
  -- purpose. Profit is income minus expense; income is credit-positive and
  -- expense is debit-positive, so
  --     (credit-debit for income) - (debit-credit for expense)
  --   = (credit-debit for income) + (credit-debit for expense)
  -- and the two collapse into one expression. An expense therefore lands here
  -- as a negative number, which is exactly what reduces equity.
  select
    coalesce(sum(case when a.kind = 'ASSET'     then l.debit  - l.credit else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when a.kind = 'LIABILITY' then l.credit - l.debit  else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when a.kind = 'EQUITY'    then l.credit - l.debit  else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when a.kind in ('INCOME','EXPENSE')
                      then l.credit - l.debit else 0 end), 0)::numeric(14,2)
  into v_assets, v_liab, v_equity, v_result
  from public.gl_department_lines(p_department_type, p_department_id) l
  join public.gl_entries e on e.id = l.entry_id
  join public.gl_accounts a on a.code = l.account_code
  where e.posted
    and e.entry_date <= p_as_of;

  -- The moved money leaves the wrong side of receivables and payables, so
  -- assets and liabilities each rise by both amounts: customer money onto
  -- customer deposits (0506), supplier money onto advances to suppliers (0507).
  v_assets := (v_assets + v_moved + v_adv)::numeric(14,2);
  v_liab   := (v_liab + v_moved + v_adv)::numeric(14,2);

  v_diff := (v_assets - (v_liab + v_equity + v_result))::numeric(14,2);

  return query
  with movement as (
    select l.account_code as acct,
           sum(l.debit)::numeric(14,2)  as dr,
           sum(l.credit)::numeric(14,2) as cr
    from public.gl_department_lines(p_department_type, p_department_id) l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted
      and e.entry_date <= p_as_of
    group by l.account_code
  ),
  bs_raw as (
    select a.code, a.name, a.kind,
           coalesce(a.parent_code, a.code) as hdr,
           (case when a.kind = 'ASSET'
                 then coalesce(m.dr, 0) - coalesce(m.cr, 0)
                 else coalesce(m.cr, 0) - coalesce(m.dr, 0) end)::numeric(14,2) as booked,
           (case when a.code = c_deposits then v_moved
                 when a.code = c_advances then v_adv
                 when v_moved_by_acct ? a.code then -((v_moved_by_acct ->> a.code)::numeric)
                 when v_adv_by_acct ? a.code then -((v_adv_by_acct ->> a.code)::numeric)
                 else null end)::numeric(14,2) as moved,
           (case when a.code = c_deposits or v_moved_by_acct ? a.code then 'CUSTOMER'
                 when a.code = c_advances or v_adv_by_acct ? a.code then 'SUPPLIER'
                 else null end)::text as moved_for
    from public.gl_accounts a
    left join movement m on m.acct = a.code
    where a.kind in ('ASSET','LIABILITY','EQUITY')
      and (a.is_active or m.acct is not null
           or (a.code = c_deposits and v_moved <> 0)
           or (a.code = c_advances and v_adv <> 0))
  ),
  bs_accounts as (
    -- A control account's printed amount is its balance LESS the (negative)
    -- moved share, i.e. only the parties on the right side; 2210's and 1230's
    -- are their balance plus it.
    select r.code, r.name, r.kind, r.hdr,
           (r.booked + case when r.code in (c_deposits, c_advances) then coalesce(r.moved, 0)
                            else -coalesce(r.moved, 0) end)::numeric(14,2) as amt,
           r.moved,
           r.moved_for
    from bs_raw r
  ),
  hdr_names as (
    select h.code, h.name from public.gl_accounts h
  ),
  sect_ord as (
    select 'ASSET'::text as k, 1 as o
    union all select 'LIABILITY', 2
    union all select 'EQUITY', 3
  ),
  body as (
    select s.o                    as sort1,
           b.hdr                  as sort2,
           0                      as sort3,
           b.code                 as sort4,
           b.kind                 as sect,
           'ACCOUNT'::text        as rk,
           b.hdr                  as hcode,
           hn.name                as hname,
           b.code                 as acode,
           b.name                 as aname,
           b.amt                  as amt,
           b.moved                as moved,
           b.moved_for            as moved_for
    from bs_accounts b
    join sect_ord s on s.k = b.kind
    left join hdr_names hn on hn.code = b.hdr

    union all

    select s.o, b.hdr, 1, '',
           b.kind, 'HEADER_SUBTOTAL'::text,
           b.hdr, hn.name, null::text, null::text,
           sum(b.amt)::numeric(14,2),
           null::numeric(14,2), null::text
    from bs_accounts b
    join sect_ord s on s.k = b.kind
    left join hdr_names hn on hn.code = b.hdr
    group by s.o, b.hdr, hn.name, b.kind

    union all

    -- the profit nobody has closed yet, sitting where a closing entry would put it
    select 3, null, 1, 'zz',
           'EQUITY'::text, 'DERIVED'::text,
           null::text,
           'Result not yet closed to equity'::text,
           null::text,
           'Derived from income and expense accounts up to the as-of date'::text,
           v_result,
           null::numeric(14,2), null::text

    union all

    select s.o, null, 2, '',
           b.kind, 'SECTION_TOTAL'::text,
           null::text,
           ('Total ' || lower(b.kind))::text,
           null::text, null::text,
           (sum(b.amt) + case when b.kind = 'EQUITY' then v_result else 0 end)::numeric(14,2),
           null::numeric(14,2), null::text
    from bs_accounts b
    join sect_ord s on s.k = b.kind
    group by s.o, b.kind

    union all

    -- always emitted, healthy or not
    select 4, null, 0, '',
           'CHECK'::text, 'EQUATION'::text,
           null::text,
           'Assets minus (liabilities + equity + unclosed result)'::text,
           null::text, null::text,
           v_diff,
           null::numeric(14,2), null::text
  )
  select 'OK'::text, v_go_live, p_as_of,
         row_number() over (order by b2.sort1, b2.sort2 nulls last, b2.sort3, b2.sort4),
         b2.sect, b2.rk, b2.hcode, b2.hname, b2.acode, b2.aname, b2.amt,
         (v_diff = 0), v_diff, b2.moved, b2.moved_for
  from body b2
  order by b2.sort1, b2.sort2 nulls last, b2.sort3, b2.sort4;
end;
$$;

revoke all on function public.gl_trial_balance(date, text, uuid) from public, anon;
revoke all on function public.gl_account_ledger(text, date, date, text, uuid) from public, anon;
revoke all on function public.gl_profit_and_loss(date, date, text, uuid) from public, anon;
revoke all on function public.gl_balance_sheet(date, text, uuid) from public, anon;
grant execute on function public.gl_trial_balance(date, text, uuid) to authenticated;
grant execute on function public.gl_account_ledger(text, date, date, text, uuid) to authenticated;
grant execute on function public.gl_profit_and_loss(date, date, text, uuid) to authenticated;
grant execute on function public.gl_balance_sheet(date, text, uuid) to authenticated;
comment on function public.gl_trial_balance(date, text, uuid) is
  'Trial balance as of a date; 0540: optionally one department type or one department.';
comment on function public.gl_account_ledger(text, date, date, text, uuid) is
  'One account''s ledger for a period; 0540: optionally one department.';
comment on function public.gl_profit_and_loss(date, date, text, uuid) is
  'Profit and loss for a period; 0540: optionally one department.';
comment on function public.gl_balance_sheet(date, text, uuid) is
  'Balance sheet as of a date; 0540: optionally one department. A filtered sheet may not balance: contra lines of a mixed document are untagged.';

-- ── 7 · Sanity (shape only, never a row count) ──────────────────────────────
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and column_name in ('department_type','department_id')
         and table_name in ('gl_entry_lines','supplier_bill_lines','payment_voucher_lines',
                            'other_receipt_lines','other_debtor_invoice_lines')) <> 10 then
    raise exception '0540: department columns missing';
  end if;
  if to_regprocedure('public.gl_balance_sheet(date,text,uuid)') is null
     or to_regprocedure('public.gl_balance_sheet(date)') is not null then
    raise exception '0540: gl_balance_sheet signature not replaced';
  end if;
end $$;

commit;
