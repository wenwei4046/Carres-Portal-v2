-- =============================================================================
-- 0635_one_person_may_check_and_approve_a_payment_voucher.sql
-- =============================================================================
-- WHAT WAS WRONG
--   0529 made a payment voucher three people: one prepares, one checks, one
--   approves. payment_voucher_approve refuses the checker
--   (checker_cannot_approve, latest body 0540). The constraint
--   payment_vouchers_checker_is_not_approver says the same, and
--   payment_voucher_document hides Approve from the checker (0596).
--
--   Chew (Finance) ruled on 2026-10-03 that one person MAY both check and
--   approve a voucher when they hold both rights (docs/finance/MASTER.md §2).
--
-- WHAT THIS CHANGES
--   1. The constraint payment_vouchers_checker_is_not_approver is dropped.
--   2. payment_voucher_approve no longer refuses the checker. The body is the
--      latest one, 0540_every_finance_line_carries_a_department.sql, changed
--      only where marked 0635.
--   3. payment_voucher_document offers Approve to the checker. The body is the
--      latest one, 0596_the_checker_is_not_offered_approve_on_a_voucher.sql,
--      changed only where marked 0635.
--
-- WHAT DOES NOT CHANGE
--   The preparer may still neither check nor approve their own voucher
--   (separation_of_duties). Every payment is therefore still signed by at
--   least two people. Approving still takes the finance approver (0508, 0514).
--
-- GRANTS: create or replace, so the existing grants stay as they are.
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

-- ── 1 · the constraint ───────────────────────────────────────────────────────
alter table public.payment_vouchers
  drop constraint if exists payment_vouchers_checker_is_not_approver;

-- ── 2 · approve: body from 0540. Changed only where marked 0635. ─────────────
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

  -- 0635: the checker MAY approve (Chew, 2026-10-03). 0529's checker rule is gone.

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

-- ── 3 · the voucher page: body from 0596. Changed only where marked 0635. ────
create or replace function public.payment_voucher_document(p_voucher_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_v        public.payment_vouchers%rowtype;
  v_me       uuid := auth.uid();
  v_role     text := public.app_role()::text;
  v_finance  boolean;
  v_approver boolean;
  v_adv      record;
  v_in_use   boolean := false;
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  select * into v_v from public.payment_vouchers where id = p_voucher_id;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;

  v_finance  := coalesce(v_role in ('finance','principal'), false);
  v_approver := public.has_finance_approver(v_me);

  -- What is left of the advance (0484 law D). Null until the voucher is
  -- approved: before that the advance is a plan, not money.
  select ao.applied_total, ao.money_back_total, ao.advance_open into v_adv
    from public.supplier_advance_open(p_voucher_id) ao;
  v_in_use := v_adv.advance_open is not null and v_adv.advance_open < v_v.advance_amount;

  return jsonb_build_object(
    'voucher', (
      select to_jsonb(x) from (
        select v.id, v.voucher_no, v.status, v.purpose, v.supplier_id,
               s.name as supplier_name, s.kind::text as supplier_kind, v.payee_name,
               v.voucher_date, v.amount, v.advance_amount,
               v.ap_account_code, apc.name as ap_account_name,
               v.pay_method, v.pay_reference,
               v.pay_from_account_code, a.name as pay_from_name, v.narration,
               v.created_at, cr.name as created_by_name,
               v.prepared_at, pu.name as prepared_by_name,
               v.checked_at, cu.name as checked_by_name,
               v.approved_at, au.name as approved_by_name,
               v.rejected_at, ru.name as rejected_by_name, v.reject_reason,
               v.cancelled_at, xu.name as cancelled_by_name, v.cancel_reason,
               e.entry_no as entry_no, re.entry_no as reversal_entry_no
          from public.payment_vouchers v
          left join public.suppliers s   on s.id = v.supplier_id
          left join public.gl_accounts a on a.code = v.pay_from_account_code
          left join public.gl_accounts apc on apc.code = v.ap_account_code
          left join public.app_users cr on cr.id = v.created_by
          left join public.app_users pu on pu.id = v.prepared_by
          left join public.app_users cu on cu.id = v.checked_by
          left join public.app_users au on au.id = v.approved_by
          left join public.app_users ru on ru.id = v.rejected_by
          left join public.app_users xu on xu.id = v.cancelled_by
          left join public.gl_entries e  on e.id = v.gl_entry_id
          left join public.gl_entries re on re.id = v.reversal_entry_id
         where v.id = p_voucher_id) x),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.line_no) from (
        select l.line_no, l.account_code, ac.name as account_name, l.description, l.amount
          from public.payment_voucher_lines l
          left join public.gl_accounts ac on ac.code = l.account_code
         where l.voucher_id = p_voucher_id) y), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.bill_date, z.bill_no) from (
        select al.bill_id, b.bill_no, b.supplier_invoice_no, b.bill_date, b.due_date,
               b.total_amount as bill_total, b.ap_account_code, al.amount_applied
          from public.payment_voucher_allocations al
          join public.supplier_bills b on b.id = al.bill_id
         where al.voucher_id = p_voucher_id) z), '[]'::jsonb),
    'advance', case when v_v.advance_amount > 0 then jsonb_build_object(
      'advance_amount',   v_v.advance_amount,
      'applied_total',    coalesce(v_adv.applied_total, 0),
      'money_back_total', coalesce(v_adv.money_back_total, 0),
      'advance_open',     v_adv.advance_open,
      'applications', coalesce((
        select jsonb_agg(to_jsonb(ap) order by ap.created_at) from (
          select sa.id, sa.bill_id, b.bill_no, b.supplier_invoice_no, b.bill_date,
                 sa.amount, sa.status, sa.created_at, cu.name as created_by_name,
                 sa.cancelled_at, xu.name as cancelled_by_name, sa.cancel_reason
            from public.supplier_advance_applications sa
            join public.supplier_bills b on b.id = sa.bill_id
            left join public.app_users cu on cu.id = sa.created_by
            left join public.app_users xu on xu.id = sa.cancelled_by
           where sa.voucher_id = p_voucher_id) ap), '[]'::jsonb),
      'money_back', coalesce((
        select jsonb_agg(to_jsonb(mb) order by mb.money_back_date, mb.money_back_no) from (
          select m.id, m.money_back_no, m.money_back_date, m.money_account_code,
                 ma.name as money_account_name, m.amount, m.reference, m.narration, m.status,
                 e.entry_no, re.entry_no as reversal_entry_no,
                 m.created_at, cu.name as created_by_name,
                 m.voided_at, xu.name as voided_by_name, m.void_reason
            from public.supplier_advance_money_back m
            left join public.gl_accounts ma on ma.code = m.money_account_code
            left join public.gl_entries e  on e.id = m.gl_entry_id
            left join public.gl_entries re on re.id = m.reversal_entry_id
            left join public.app_users cu on cu.id = m.created_by
            left join public.app_users xu on xu.id = m.voided_by
           where m.voucher_id = p_voucher_id) mb), '[]'::jsonb)
    ) end,
    'files', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.uploaded_at) from (
        select fl.id, fl.file_name, fl.mime_type, fl.size_bytes, fl.storage_path,
               fl.uploaded_at, u.name as uploaded_by_name
          from public.ap_document_files fl
          left join public.app_users u on u.id = fl.uploaded_by
         where fl.document_type = 'PAYMENT_VOUCHER' and fl.document_id = p_voucher_id) f), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(ev) order by ev.at) from (
        select e.action, e.note, e.at, u.name as actor_name
          from public.ap_document_events e
          left join public.app_users u on u.id = e.actor
         where e.document_type = 'PAYMENT_VOUCHER' and e.document_id = p_voucher_id) ev), '[]'::jsonb),
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'you_prepared', v_v.prepared_by is not null and v_v.prepared_by = v_me,
    'can', jsonb_build_object(
      'edit',     v_v.status = 'draft' and v_finance,
      'prepare',  v_v.status = 'draft' and v_finance,
      'check',    v_v.status = 'prepared' and v_finance
                  and v_v.prepared_by is distinct from v_me,
      -- 0635: the checker MAY approve (Chew, 2026-10-03); only the preparer may not.
      'approve',  v_v.status = 'checked' and v_approver
                  and v_v.prepared_by is distinct from v_me,
      'reject',   v_v.status in ('prepared','checked') and (v_finance or v_approver),
      'cancel',   case v_v.status
                    when 'approved' then v_approver and not v_in_use
                    when 'cancelled' then false
                    else v_finance end,
      'add_file', v_v.status <> 'cancelled' and v_finance,
      'apply_advance',     v_v.status = 'approved' and v_finance and coalesce(v_adv.advance_open, 0) > 0,
      'take_advance_off',  v_v.status = 'approved' and v_finance,
      'money_back',        v_v.status = 'approved' and v_finance and coalesce(v_adv.advance_open, 0) > 0,
      'cancel_money_back', v_v.status = 'approved' and v_approver)
  );
end;
$fn$;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'payment_voucher_approve';
  if position('checker_cannot_approve' in v_src) > 0 then
    raise exception '0635 sanity: payment_voucher_approve still refuses the checker';
  end if;
  if position('separation_of_duties' in v_src) = 0 or position('not_finance_approver' in v_src) = 0
     or position('v_v.advance_amount' in v_src) = 0 or position('department_type' in v_src) = 0 then
    raise exception '0635 sanity: payment_voucher_approve lost the preparer rule, the approver gate, the advance or the department';
  end if;
  if exists (select 1 from pg_constraint
              where conname = 'payment_vouchers_checker_is_not_approver') then
    raise exception '0635 sanity: the checker constraint is still there';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'payment_voucher_document';
  if position('v_v.checked_by is distinct from v_me' in v_src) > 0 then
    raise exception '0635 sanity: payment_voucher_document still hides Approve from the checker';
  end if;
  if position('v_v.prepared_by is distinct from v_me' in v_src) = 0 then
    raise exception '0635 sanity: payment_voucher_document lost the preparer rule';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('payment_voucher_approve', 'payment_voucher_document')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0635 sanity: a function lost security definer or its search_path';
  end if;
end
$sanity$;

commit;
