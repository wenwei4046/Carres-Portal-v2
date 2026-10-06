-- ============================================================================
-- 0446 — the customer's answer is a recorded result
-- (docs/payment/MASTER.md §3 — the structured collection outcome, and the
--  promise-to-pay the risk sort has been asking for since the Blueprint)
--
-- §3, verbatim: "Staff record a structured result: `Customer paid` · `Customer
-- will pay on a date` · `Customer needs help` · `Customer disputes the amount`
-- · `Customer did not answer`. The system creates the next action. `Done` never
-- replaces authoritative completion."
--
-- The 2026-09-08 audit found this NOT BUILT: 0434 records the message we SENT
-- and its proof, but nothing records what the customer ANSWERED, so the §3
-- risk sort could never rank "missed promise" and no next action could be
-- derived from a result. This migration adds the missing half.
--
--   §1  payment_collection_outcomes — append-only; one row per recorded
--       conversation. `Customer will pay on a date` REQUIRES its date and the
--       date may not be in the past; every other outcome carries none.
--   §2  payment_record_collection_outcome — the one recording door. Appends
--       the order history fact and stamps the shared chase clock, exactly as
--       the message ledger does.
--
-- ⛔ THE OUTCOME IS NOT MONEY. `Customer paid` records what the customer SAID;
-- it never writes `orders.paid`, never mints a receipt and never closes a
-- balance — the canonical posting service is still the only money writer
-- (§2). "Done never replaces authoritative completion."
-- ============================================================================
begin;

-- §1 · the ledger ------------------------------------------------------------
create table if not exists public.payment_collection_outcomes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  invoice_id uuid references public.invoices(id),
  outcome text not null check (outcome in (
    'customer_paid', 'will_pay_on_date', 'needs_help',
    'disputes_amount', 'no_answer'
  )),
  /** Only `will_pay_on_date` carries one, and it must carry one. */
  promised_date date,
  note text,
  recorded_by uuid not null references public.app_users(id),
  recorded_at timestamptz not null default now(),
  constraint payment_outcome_promise_pairs check (
    (outcome = 'will_pay_on_date') = (promised_date is not null)
  )
);

comment on table public.payment_collection_outcomes is
  '0446: the append-only record of what the CUSTOMER answered (payment/MASTER.md §3). Never money — the canonical posting service stays the only writer of orders.paid.';

create index if not exists payment_collection_outcomes_order_idx
  on public.payment_collection_outcomes (order_id, recorded_at desc);

alter table public.payment_collection_outcomes enable row level security;

-- 0367's lesson: a new table inherits a blanket write grant nobody asked for.
revoke all on public.payment_collection_outcomes from authenticated, anon;
grant select on public.payment_collection_outcomes to authenticated;

drop policy if exists payment_collection_outcomes_internal_read on public.payment_collection_outcomes;
create policy payment_collection_outcomes_internal_read on public.payment_collection_outcomes
  for select to authenticated
  using (public.app_role() in ('operation', 'finance', 'principal'));
-- No insert/update/delete policy: the door below is the only writer, and the
-- ledger is append-only — a wrong result is corrected by recording the next
-- conversation, never by editing what was said.

-- §2 · the one recording door -------------------------------------------------
create or replace function public.payment_record_collection_outcome(
  p_order_id uuid,
  p_outcome text,
  p_promised_date date default null,
  p_note text default null,
  p_invoice_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_row payment_collection_outcomes;
  v_so integer;
  v_word text;
begin
  -- The collection staff §12 admits: Payment Duty and the responsible
  -- Delivery Operation both hold conversations; principal keeps the override.
  -- coalesce — a NULL role must refuse (the 0429 three-valued lesson).
  if not coalesce(public.app_role() in ('operation', 'finance', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_collection_staff';
  end if;

  if p_outcome not in ('customer_paid', 'will_pay_on_date', 'needs_help',
                       'disputes_amount', 'no_answer') then
    raise exception 'unknown collection outcome'
      using errcode = '22023', detail = 'bad_outcome';
  end if;

  if p_outcome = 'will_pay_on_date' then
    if p_promised_date is null then
      raise exception 'a promised date is required'
        using errcode = '22023', detail = 'promise_date_required';
    end if;
    if p_promised_date < v_today then
      raise exception 'a promise cannot be in the past'
        using errcode = '22023', detail = 'promise_in_past';
    end if;
  elsif p_promised_date is not null then
    raise exception 'only a promise to pay carries a date'
      using errcode = '22023', detail = 'unexpected_promise_date';
  end if;

  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;
  if p_invoice_id is not null and not exists (
    select 1 from invoices i where i.id = p_invoice_id and i.order_id = p_order_id
  ) then
    raise exception 'that invoice belongs to another order'
      using errcode = '22023', detail = 'invoice_not_on_order';
  end if;

  insert into payment_collection_outcomes
    (order_id, invoice_id, outcome, promised_date, note, recorded_by)
  values
    (p_order_id, p_invoice_id, p_outcome, p_promised_date,
     nullif(btrim(coalesce(p_note, '')), ''), v_uid)
  returning * into v_row;

  v_word := case p_outcome
    when 'customer_paid' then 'Customer paid'
    when 'will_pay_on_date' then format('Customer will pay on %s', p_promised_date)
    when 'needs_help' then 'Customer needs help'
    when 'disputes_amount' then 'Customer disputes the amount'
    else 'Customer did not answer'
  end;
  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id, format('Collection result · %s', v_word),
          public.app_role(), v_uid);

  -- The shared chase stamp, exactly as the message ledger sets it (0434).
  update ops_order_control
     set last_chased_at = now(), updated_by = v_uid, updated_at = now()
   where order_id = p_order_id;

  return to_jsonb(v_row);
end;
$fn$;

revoke all on function public.payment_record_collection_outcome(uuid, text, date, text, uuid) from public, anon;
grant execute on function public.payment_record_collection_outcome(uuid, text, date, text, uuid) to authenticated;

comment on function public.payment_record_collection_outcome(uuid, text, date, text, uuid) is
  '0446: the ONE door that records what the customer answered (§3). A promise carries its date and the date is never in the past; no other outcome carries one. Appends the order history fact and the shared chase stamp. It never writes money.';

commit;
