-- ============================================================================
-- 0438 — a commenced period becomes a Storage Invoice
-- (docs/payment/MASTER.md §4 · §7 — the charge side of 0436's storage case)
--
-- §7: a period is charged the moment it COMMENCES. 0436 records the case and
-- its rule snapshot; this migration turns commenced, unbilled periods into a
-- real invoice through the EXISTING 0429 lifecycle — the same numbering, the
-- same immutable snapshot, the same void/replacement lineage. Nothing here
-- invents a second document authority.
--
--   §1  invoices.storage_case_id — a storage-kind invoice names its case.
--       payment_storage_cases.billed_through_period — how many commenced
--       periods have been turned into paper (advanced atomically).
--   §2  payment_storage_invoice(case) — the ONE charge door. Computes the
--       commenced periods from the case's OWN snapshot (the §7 arithmetic,
--       probe-pinned to the §7 worked examples), refuses when nothing new
--       has commenced, drafts the invoice (kind `storage` for the first
--       paper, `additional_storage` after) and issues it through
--       payment_invoice_issue with a server-composed snapshot.
-- ============================================================================
begin;

-- §1 · the links --------------------------------------------------------------
alter table public.invoices
  add column if not exists storage_case_id uuid references public.payment_storage_cases(id);

comment on column public.invoices.storage_case_id is
  '0438: the storage case a storage-kind invoice charges for. NULL on a Sales Invoice.';

alter table public.payment_storage_cases
  add column if not exists billed_through_period integer not null default 0
    check (billed_through_period >= 0);

comment on column public.payment_storage_cases.billed_through_period is
  '0438: how many commenced §7 periods have been invoiced. The charge door advances it atomically with the paper it mints.';

-- §2 · the charge door --------------------------------------------------------
create or replace function public.payment_storage_invoice(
  p_case_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_case payment_storage_cases;
  v_order orders;
  v_free_until date;
  v_days_past integer;
  v_commenced integer;
  v_new_periods integer;
  v_amount numeric(12,2);
  v_kind text;
  v_draft invoices;
  v_issued jsonb;
begin
  -- §12: sending an invoice is Operation's work; Finance reads and exports.
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_recorder';
  end if;

  select * into v_case from payment_storage_cases where id = p_case_id for update;
  if not found then
    raise exception 'storage case not found' using errcode = '22023', detail = 'case_not_found';
  end if;
  if v_case.status <> 'open' then
    raise exception 'the storage case is closed' using errcode = '22023', detail = 'case_closed';
  end if;
  select * into v_order from orders where id = v_case.order_id;

  -- The §7 arithmetic, from the case's OWN snapshot (shared/payment-storage.ts
  -- says the same and both are probe/test-pinned to the §7 worked examples):
  -- free end = start + free_days − 1, extended only by a LATER approval; a
  -- period is charged the moment it commences.
  v_free_until := v_case.storage_start + (greatest(v_case.rule_free_days, 0) - 1);
  if v_case.approved_free_until is not null and v_case.approved_free_until > v_free_until then
    v_free_until := v_case.approved_free_until;
  end if;
  v_days_past := v_today - v_free_until;
  if v_days_past <= 0 then
    v_commenced := 0;
  else
    v_commenced := ceil(v_days_past::numeric / greatest(v_case.rule_cycle_days, 1));
  end if;

  v_new_periods := v_commenced - v_case.billed_through_period;
  if v_new_periods <= 0 then
    raise exception 'no new storage period has commenced'
      using errcode = '22023', detail = 'nothing_to_charge';
  end if;

  v_amount := v_new_periods * v_case.rule_charge_amount;
  v_kind := case when v_case.billed_through_period = 0 then 'storage'
                 else 'additional_storage' end;

  insert into invoices (order_id, amount, tax_amount, kind, status, created_by, storage_case_id)
  values (v_case.order_id, v_amount, 0, v_kind, 'draft', v_uid, v_case.id)
  returning * into v_draft;

  -- The EXISTING issue door mints the governed number and freezes the
  -- snapshot — one numbering authority, forever (0429).
  v_issued := public.payment_invoice_issue(v_draft.id, jsonb_build_object(
    'document_kind', v_kind,
    'so', v_order.so,
    'customer_name', v_order.customer_name,
    'storage_case_id', v_case.id,
    'product_group', v_case.product_group,
    'storage_start', v_case.storage_start,
    'free_until', v_free_until,
    'periods_from', v_case.billed_through_period + 1,
    'periods_through', v_commenced,
    'period_days', v_case.rule_cycle_days,
    'charge_per_period', v_case.rule_charge_amount,
    'amount', v_amount
  ));

  update payment_storage_cases
     set billed_through_period = v_commenced
   where id = v_case.id;

  return jsonb_build_object(
    'invoice', v_issued->'invoice',
    'new_periods', v_new_periods,
    'billed_through_period', v_commenced
  );
end;
$fn$;

revoke all on function public.payment_storage_invoice(uuid) from public, anon;
grant execute on function public.payment_storage_invoice(uuid) to authenticated;

comment on function public.payment_storage_invoice(uuid) is
  '0438: the ONE storage charge door — commenced unbilled §7 periods become a Storage / Additional Storage Invoice through the 0429 lifecycle (same numbering, snapshot and lineage), and the case advances billed_through_period atomically.';

commit;
