-- 0578 · A department filter survives a customer payment keyed by its receipt number.
--
-- WHAT WAS WRONG
-- The Journal filtered by a department (/finance/ledger?dept=SHOWROOM) answered
-- HTTP 500. So did every other read of gl_line_departments (0540): the Trial
-- Balance, account ledger, Profit and Loss and Balance Sheet with a department,
-- through gl_department_lines.
--
-- The view finds a customer payment's order by its receipt number, or by the
-- payment id when source_doc_no is a uuid:
--     p.receipt_no = e.source_doc_no
--  or (e.source_doc_no ~* '<uuid>' and p.id = e.source_doc_no::uuid)
-- Postgres does not promise to test the regex first. Once order_payments is big
-- enough for its indexes, the planner turns the OR into a BitmapOr and uses
-- `p.id = e.source_doc_no::uuid` as an index key, so the cast runs on every
-- receipt number. 'OR-1' is not a uuid: 22P02, and the API answers 500.
-- Measured on a local copy of main with 6,000 payments: the plan shows
-- `Index Cond: (id = (e_1.source_doc_no)::uuid)` and the read fails with
-- `invalid input syntax for type uuid: "OR-1"`.
--
-- WHAT THIS CHANGES
-- The cast sits inside a CASE, which is evaluated in order: a source_doc_no that
-- is not a uuid gives null and matches no payment. Nothing else in the view
-- changes. Columns, order and grants are the same, so gl_department_lines and
-- gl_entry_departments keep working unchanged.

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
          or p.id = case when e.source_doc_no ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         then e.source_doc_no::uuid end
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

revoke all on public.gl_line_departments from public, anon;
grant select on public.gl_line_departments to authenticated;
