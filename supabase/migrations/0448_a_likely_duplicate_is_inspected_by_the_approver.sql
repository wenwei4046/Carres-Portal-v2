-- ============================================================================
-- 0448 — a likely duplicate is inspected by the APPROVER, not waved through by
--        the keyer (docs/payment/MASTER.md §5)
--
-- §5, verbatim: "Likely duplicate: compare customer, amount, paid date and
-- reference; staff must inspect the earlier payment before privileged
-- continuation."
--
-- WHAT WAS MISSING. The shipped guard (2026-09-08) computes the match in the
-- BROWSER and shuts the button until a tickbox is ticked. Three parts of §5
-- were still not enforced:
--
--   · "privileged continuation" — the server accepted the post from anyone.
--     A tickbox in a page nobody has to use is not a permission. §5's own
--     owner table names the authority: `Suspected wrong/duplicate | Payment
--     Approver`. So continuing past a match is the APPROVER's act, exactly as
--     `payment_void` already is (0430).
--   · "compare CUSTOMER" — the browser only ever compared payments on the SAME
--     order. The same transfer keyed onto the customer's OTHER order is the
--     duplicate §5 is most worried about, and nothing looked for it.
--   · the browser cannot see a payment recorded one second ago by someone else,
--     and a page that fails to load the earlier payments silently found none.
--
-- ⛔ THIS IS NOT IDEMPOTENCY, and the two must not be confused. The posting
-- key (0351) answers "is this the SAME submission arriving twice?" — a retry,
-- a double-click, a webhook redelivery — and it returns the original row
-- unchanged. This answers a different question: "is this a DIFFERENT
-- submission of money that was already recorded?" An exact idempotent retry is
-- therefore explicitly exempt below; it is not a duplicate, it is the same act.
--
--   §1  `_payment_duplicate_matches` — the §5 comparison in SQL, over the
--       CUSTOMER's live payments, mirroring the shared TS rule the page uses.
--   §2  `payment_record` — the human door — locks the order FIRST (so two
--       concurrent submissions serialise and the second one sees the first),
--       runs the gate, and refuses unless an approver acknowledged. The
--       acknowledgement and what it was shown are stored on the payment row.
--
-- Machine channels (`sales_top_up`, the Stripe doors) are deliberately NOT
-- gated: they are not a human keying a transfer twice, they carry the payment
-- processor's own reference, and their idempotency key already answers the
-- only question that applies to them. Refusing a captured payment would lose
-- real money.
-- ============================================================================
begin;

-- §1 · the §5 comparison, in SQL, over the CUSTOMER ---------------------------
create or replace function public._payment_duplicate_matches(
  p_order_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_reference text
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with me as (
    select o.id,
           nullif(regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g'), '') as phone,
           upper(btrim(coalesce(o.customer_name, ''))) as name
      from orders o where o.id = p_order_id
  ),
  -- "the customer": the same order always, plus every other order that is
  -- provably the same person — the same phone digits when both carry a usable
  -- one, else the same name spelled the same way. One customer having several
  -- SOs is normal here (see the Ref-number semantics), so the search cannot
  -- stop at the order in front of the operator.
  mine as (
    select o.id
      from orders o, me
     where o.id = me.id
        or (me.phone is not null and length(me.phone) >= 7
            and nullif(regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g'), '') = me.phone)
        or (me.phone is null and me.name <> ''
            and upper(btrim(coalesce(o.customer_name, ''))) = me.name)
  )
  select coalesce(jsonb_agg(m order by m.ref_hit, m.days_apart, m.paid_on desc), '[]'::jsonb)
    from (
      select p.id, p.receipt_no, p.amount, p.paid_on, p.reference, p.order_id, o.so,
             case when btrim(lower(coalesce(p.reference, ''))) <> ''
                   and btrim(lower(coalesce(p.reference, ''))) = btrim(lower(coalesce(p_reference, '')))
                  then 0 else 1 end as ref_hit,
             abs(p.paid_on - p_paid_on) as days_apart
        from order_payments p
        join orders o on o.id = p.order_id
       where p.order_id in (select id from mine)
         and p.voided_at is null
         and (
           (btrim(lower(coalesce(p.reference, ''))) <> ''
            and btrim(lower(coalesce(p.reference, ''))) = btrim(lower(coalesce(p_reference, ''))))
           or (p.amount = p_amount and abs(p.paid_on - p_paid_on) <= 2)
         )
    ) m;
$fn$;

comment on function public._payment_duplicate_matches(uuid,numeric,date,text) is
  '0448: the payment/MASTER.md §5 likely-duplicate comparison — customer, amount, paid date, reference — over the CUSTOMER''s live payments, not only the order in front of the operator. Same rule as the shared TS `likelyDuplicatePayments` the page draws: an identical reference matches on its own and ranks first; otherwise an equal amount within two days either side. A voided payment is not money and never matches.';

revoke all on function public._payment_duplicate_matches(uuid,numeric,date,text) from public, anon, authenticated;

-- §2 · the human door gates on the approver ----------------------------------
drop function if exists public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text);

create function public.payment_record(
  p_order_id uuid, p_amount numeric, p_paid_on date, p_method text, p_kind text,
  p_reference text default null, p_note text default null, p_receipt_url text default null,
  p_receipt_no text default null, p_counts_toward_paid boolean default true,
  p_idempotency_key text default null,
  p_duplicate_ack boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_key   text := coalesce(nullif(btrim(coalesce(p_idempotency_key, '')), ''), p_receipt_no);
  v_dups  jsonb := '[]'::jsonb;
  v_names text;
  v_uid   uuid := auth.uid();
  v_duty  jsonb;
  v_meta  jsonb := '{}'::jsonb;
begin
  -- 0448 also closes a three-valued hole this door has carried since 0351:
  -- `app_role()` answers NULL for a JWT whose subject has no `app_users` row,
  -- and `NULL not in (...)` is NULL, which `if` treats as FALSE — so the guard
  -- did not fire and an unknown caller reached the insert. Only the
  -- `recorded_by` foreign key stopped the money, by accident. Coalesced, the
  -- unknown caller is refused by the guard that was written to refuse it.
  if coalesce(public.app_role() not in ('operation','principal'), true) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_operation';
  end if;

  -- CONCURRENCY. Take the order lock BEFORE looking for duplicates, so two
  -- submissions of the same transfer cannot both pass the gate: the second
  -- waits here, and after the first commits it SEES that payment. The owner
  -- re-locks the same row in the same transaction, which costs nothing.
  perform 1 from orders where id = p_order_id for update;

  -- IDEMPOTENT RETRY ≠ DUPLICATE. The same channel and key arriving again is
  -- the same act; the owner answers it with the original row. Never gate it.
  if not exists (
    select 1 from order_payments
     where source_channel = 'manual_payment' and idempotency_key = v_key
  ) then
    v_dups := public._payment_duplicate_matches(p_order_id, p_amount, p_paid_on, p_reference);

    if jsonb_array_length(v_dups) > 0 then
      select string_agg(
               format('%s · RM %s · %s%s',
                      coalesce(d->>'receipt_no', 'payment'),
                      to_char((d->>'amount')::numeric, 'FM999,999,990.00'),
                      d->>'paid_on',
                      case when (d->>'order_id') is distinct from p_order_id::text
                           then ' · SO ' || coalesce(d->>'so', '?') else '' end),
               '; ' order by ord)
        into v_names
        from jsonb_array_elements(v_dups) with ordinality as t(d, ord);

      if not coalesce(p_duplicate_ack, false) then
        raise exception
          'This looks like a payment already recorded (%). Open it first — if this is a different payment, a Payment Approver continues.',
          v_names
          using errcode = 'P0001', detail = 'possible_duplicate_payment';
      end if;

      -- PRIVILEGED CONTINUATION (§5 owner table: Payment Approver). The duty
      -- answer is coalesced — an unassigned duty must refuse, never admit.
      v_duty := public.workspace_resolve_duty('payment_approver', null);
      if not (coalesce(public.app_role() = 'principal', false)
              or (v_uid is not null
                  and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false))) then
        raise exception
          'Only the Payment Approver can record this — it looks like a payment already recorded (%).',
          v_names
          using errcode = '42501', detail = 'not_payment_approver';
      end if;

      -- What the approver was shown, and that they continued, live on the row.
      v_meta := jsonb_build_object(
        'duplicate_ack', true,
        'duplicate_ack_by', v_uid,
        'duplicate_ack_at', now(),
        'duplicate_matches', v_dups);

      insert into ops_activity_log(order_id, action, actor_id, detail)
      values (p_order_id, 'payment.duplicate_acknowledged', v_uid,
              jsonb_build_object('amount', p_amount, 'paid_on', p_paid_on,
                                 'reference', nullif(btrim(coalesce(p_reference,'')),''),
                                 'matches', v_dups));
    end if;
  end if;

  return public._customer_payment_post(p_order_id, p_amount, p_paid_on, p_method, p_kind,
    'manual_payment', v_key, p_reference,
    p_reference, p_note, p_receipt_url, p_receipt_no, v_meta, p_counts_toward_paid);
end;
$fn$;

comment on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text,boolean) is
  '0448: the human payment door. §5 is enforced here, not in the browser: the order is locked first so concurrent submissions serialise, the CUSTOMER''s live payments are compared on amount, paid date and reference, and a match refuses unless `p_duplicate_ack` is true AND the caller is the Payment Approver duty (Shared Duty Resolver) or principal. An exact idempotent retry is exempt — that is the same act, not a second one. Machine channels keep their own doors. The acknowledgement, its actor and the matches shown are stored in the payment''s source_metadata and in ops_activity_log.';

revoke all on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text,boolean) from public, anon;
grant execute on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text,boolean) to authenticated;

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'payment_record';
  if v <> 1 then raise exception 'sanity: % copies of payment_record', v; end if;
end $$;

commit;
