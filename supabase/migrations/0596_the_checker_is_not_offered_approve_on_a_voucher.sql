-- =============================================================================
-- 0596_the_checker_is_not_offered_approve_on_a_voucher.sql
-- =============================================================================
-- WHAT WAS WRONG
--   0529 made a payment voucher three people: one prepares, one checks, one
--   approves. payment_voucher_approve refuses the checker (checker_cannot_approve,
--   latest body 0540). But payment_voucher_document still worked out
--   can.approve by leaving out only the preparer. So the voucher page showed
--   "Approve payment" to the person who checked it, and the database then
--   refused the click.
--
-- WHAT THIS CHANGES
--   payment_voucher_document: can.approve is also false for the checker.
--   The body is the latest one, 0485_an_advance_is_knocked_off_a_bill_or_paid_back.sql,
--   changed only where marked 0596. The page reads can.approve and derives
--   nothing itself, so no page change is needed.
--
-- GRANTS: create or replace, so the 0477 grants stay as they are
--   (revoked from public and anon, execute to authenticated).
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

-- Body from 0485. Changed only where marked 0596.
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
      'approve',  v_v.status = 'checked' and v_approver
                  and v_v.prepared_by is distinct from v_me
                  -- 0596: the checker does not approve either (0529).
                  and v_v.checked_by is distinct from v_me,
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

commit;
