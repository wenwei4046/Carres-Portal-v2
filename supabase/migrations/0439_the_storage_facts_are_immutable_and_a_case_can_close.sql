-- ============================================================================
-- 0439 — the storage facts are immutable, and a case can close
-- (docs/payment/MASTER.md §6 · §7 — the boundary hardening 0436 promised)
--
-- §6: the first valid Storage Start is PERMANENT, and an old case never
-- recalculates. 0436 enforced that by giving the table no client write policy
-- and by keeping the doors away from those columns — a discipline, not a
-- guarantee. This migration makes it STRUCTURAL:
--
--   §1  a BEFORE UPDATE trigger refuses any change to the witnessed facts,
--       the derived start or the rule snapshot, refuses rolling
--       billed_through_period backwards (a charge, once on paper, is never
--       un-billed by an update — the 0429 void lineage is the correction
--       path), and refuses reopening a closed case.
--   §2  payment_storage_close — the one closing door: the storage ended
--       (the goods went out, or the case is otherwise finished). Closing
--       states its reason, appends the order history fact, and a closed
--       case refuses charging and extra-free decisions (0436/0438 already
--       check status).
-- ============================================================================
begin;

-- §1 · immutability ----------------------------------------------------------
create or replace function public.payment_storage_case_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.storage_start is distinct from old.storage_start
     or new.readiness_witnessed_on is distinct from old.readiness_witnessed_on
     or new.customer_delay_witnessed_on is distinct from old.customer_delay_witnessed_on
     or new.delay_witness_note is distinct from old.delay_witness_note
     or new.product_group is distinct from old.product_group
     or new.order_id is distinct from old.order_id
     or new.rule_free_days is distinct from old.rule_free_days
     or new.rule_charge_amount is distinct from old.rule_charge_amount
     or new.rule_cycle_days is distinct from old.rule_cycle_days
     or new.rule_operation_limit_day is distinct from old.rule_operation_limit_day
     or new.rule_waiver_limit_day is distinct from old.rule_waiver_limit_day
     or new.rule_extra_free_allowed is distinct from old.rule_extra_free_allowed
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'the storage start, its witnesses and its rule snapshot are permanent'
      using errcode = '42501', detail = 'storage_facts_immutable';
  end if;
  if new.billed_through_period < old.billed_through_period then
    raise exception 'a billed period is never un-billed by an update — void the paper instead'
      using errcode = '42501', detail = 'billed_periods_only_advance';
  end if;
  if old.status = 'closed' and new.status = 'open' then
    raise exception 'a closed storage case does not reopen'
      using errcode = '42501', detail = 'case_stays_closed';
  end if;
  return new;
end;
$fn$;

drop trigger if exists payment_storage_case_guard on public.payment_storage_cases;
create trigger payment_storage_case_guard
  before update on public.payment_storage_cases
  for each row execute function public.payment_storage_case_guard();

comment on function public.payment_storage_case_guard() is
  '0439: §6 made structural — the witnessed facts, derived start and rule snapshot never change; billed periods only advance; a closed case stays closed.';

-- §2 · the closing door -------------------------------------------------------
create or replace function public.payment_storage_close(
  p_case_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_case payment_storage_cases;
begin
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_recorder';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'the reason is required' using errcode = '22023', detail = 'missing_reason';
  end if;

  select * into v_case from payment_storage_cases where id = p_case_id for update;
  if not found then
    raise exception 'storage case not found' using errcode = '22023', detail = 'case_not_found';
  end if;
  if v_case.status = 'closed' then
    raise exception 'the storage case is already closed'
      using errcode = '22023', detail = 'already_closed';
  end if;

  update payment_storage_cases
     set status = 'closed', closed_at = now()
   where id = p_case_id
   returning * into v_case;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (v_case.order_id,
          format('Storage ended · %s · %s', v_case.product_group, btrim(p_reason)),
          public.app_role(), v_uid);

  return to_jsonb(v_case);
end;
$fn$;

revoke all on function public.payment_storage_close(uuid, text) from public, anon;
grant execute on function public.payment_storage_close(uuid, text) to authenticated;

comment on function public.payment_storage_close(uuid, text) is
  '0439: the one storage-case closing door — states its reason, appends the order history fact; a closed case refuses charging, extra-free decisions and reopening.';

commit;
