-- =============================================================================
-- 0660_merchant_payments_name_their_card_machine.sql
-- =============================================================================
-- THE RULING (Chew, Finance, 2026-10-07, docs/finance/MASTER.md §0 "How money
--   is recorded"; build 「你直接做完先」 2026-10-08): a customer pays by Online
--   transfer, Cash, Cheque or Merchant, and Merchant then asks which card
--   machine took the card: PBB, GHL, HLBB, MBB or AhaPay. Each machine's money
--   lands in its own clearing account: 315-1000 PBB, 315-2000 GHL, 315-3000
--   HLBB, 315-4000 MBB, 315-6000 AhaPay. Chew authorised Finance to change the
--   payment settings of order entry and Payment directly (「直接改」,
--   2026-10-07, Finance MASTER §1 exceptions).
--
-- WHAT WAS MISSING (measured 2026-10-08)
--   - A card payment was 'card', 'credit_card' or 'debit_card', and all three
--     post to 1130 CARD - MACHINE NOT KNOWN: no payment said which machine
--     took it, so no clearing account could be matched to its machine.
--   - Order entry's Credit / Debit asked the customer's bank; the answer was
--     kept on the order only and never reached the payment or the ledger.
--   - Six functions wrote the card family as a fixed list of three words.
--
-- WHAT THIS ADDS
--   1. payment_is_card(method): the card family in one predicate: card,
--      credit_card, debit_card (and what folds into them) and every merchant_
--      machine method. A machine payment needs its approval code and is
--      offered to card settlement.
--   2. payment_method_key folds 'merchant' (no machine named) into 'card',
--      as it already folds 'credit' and 'installment'.
--   3. payment_method_for_machine(method, machine): order entry's Merchant and
--      its Card machine answer become that machine's method.
--   4. By guarded rewrite of each live body (0500/0503 style: one short piece
--      of text, found exactly once, everything else unchanged):
--      - _customer_payment_post and _payment_reference_guard ask a machine
--        payment for its approval code;
--      - _card_settlement_candidates, card_settlement_match and
--        card_settlement_review treat a machine payment as a card payment;
--      - _order_create_deposit records a Merchant deposit as its machine.
--      _card_payout_holdings is NOT changed: a machine's clearing account is
--      paid out only through Card settlement once Finance gives it a card
--      payout bank (0541), as 315-2000 GHL has today. Card settlement reads
--      PBB, GHL and Maybank statements only, so HLBB and AhaPay money must
--      stay payable by a Money moves card payout until it reads theirs.
--   5. Settings → Payment → Payment methods: the five machines, each with its
--      clearing account; Bank transfer is named Online transfer; DuitNow QR,
--      Credit card and Debit card are switched off (their accounts and every
--      payment already recorded with them stay). The order is Online
--      transfer, Cash, Cheque, then the machines. Each change of a name or of
--      Active, and each new method, is kept in payment_setting_changes.
--   6. Order entry's methods (order_entry_config): Online transfer, Cash,
--      Cheque, and Merchant, which asks the Card machine; Credit / Debit and
--      Installment are switched off. Every other setting there stays.
--
-- RLS: none changed. DATA: configuration only (payment methods, their money
--   accounts, order entry's methods); no payment, order or entry is touched.
-- DR/CR: none now. A machine payment recorded after this debits its
--   machine's clearing account where a card payment debited 1130; the credit
--   side is unchanged. A Merchant payment that names no machine still debits
--   1130.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the card family, one predicate ───────────────────────────────────────
create or replace function public.payment_is_card(p_method text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $fn$
  -- card · credit_card · debit_card (credit, installment and merchant fold to
  -- card) and every card machine, merchant_<machine> (0660).
  select coalesce(k in ('card', 'credit_card', 'debit_card') or k like 'merchant\_%', false)
    from (select public.payment_method_key(p_method) as k) s;
$fn$;

comment on function public.payment_is_card(text) is
  '0660: the card family: card, credit_card, debit_card and every merchant_ card machine method. A card payment needs its approval code and is matched in card settlement.';

revoke all on function public.payment_is_card(text) from public, anon;
grant execute on function public.payment_is_card(text) to authenticated;

-- ── 2 · order entry's Merchant and its Card machine answer ───────────────────
create or replace function public.payment_method_for_machine(p_method text, p_machine text)
returns text
language sql
stable
set search_path = public, pg_temp
as $fn$
  -- 'merchant' with a machine that has its own method (merchant_pbb …)
  -- becomes that method; anything else is returned as it came.
  select case
           when lower(btrim(coalesce(p_method, ''))) = 'merchant' then
             coalesce((select m.method
                         from public.payment_manual_methods m
                        where m.method = 'merchant_' || lower(regexp_replace(coalesce(p_machine, ''), '[^A-Za-z0-9]+', '', 'g'))
                          and m.method <> 'merchant_'),
                      p_method)
           else p_method
         end;
$fn$;

comment on function public.payment_method_for_machine(text, text) is
  '0660: order entry''s Merchant plus its Card machine answer (PBB, GHL, HLBB, MBB, AhaPay) becomes that machine''s payment method. With no known machine it stays merchant, which folds to card.';

revoke all on function public.payment_method_for_machine(text, text) from public, anon, authenticated;

-- ── 3 · the guarded rewrites ────────────────────────────────────────────────
-- Each changes one short piece of the LIVE body, which must hold it exactly
-- once (line ends read as LF); everything else in the body stays as it is.
create or replace function pg_temp.mig0660_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0660: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- What each rewritten function was before, to prove nothing else moved.
create temporary table mig0660_before on commit drop as
select p.oid::regprocedure as fn, p.prosecdef, p.proconfig, p.provolatile, p.prorettype
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('payment_method_key', '_customer_payment_post', '_payment_reference_guard',
                     '_card_settlement_candidates', 'card_settlement_match', 'card_settlement_review',
                     '_order_create_deposit');

-- (a) 'merchant' with no machine is a card payment, as 'credit' is.
select pg_temp.mig0660_rewrite('public.payment_method_key(text)'::regprocedure,
$old$when 'installment'   then 'card'$old$,
$new$when 'installment'   then 'card'
           when 'merchant'      then 'card'$new$);

-- (b) a machine payment needs its approval code, at every door.
select pg_temp.mig0660_rewrite(
  'public._customer_payment_post(uuid, numeric, date, text, text, text, text, text, text, text, text, text, jsonb, boolean)'::regprocedure,
$old$elsif v_method in ('card', 'credit_card', 'debit_card') then$old$,
$new$elsif public.payment_is_card(v_method) then$new$);

select pg_temp.mig0660_rewrite('public._payment_reference_guard(text, text)'::regprocedure,
$old$elsif v_method in ('card', 'credit_card', 'debit_card') then$old$,
$new$elsif public.payment_is_card(v_method) then$new$);

-- (c) card settlement: a machine payment is a card payment, matched to a
--     statement row like any card payment.
select pg_temp.mig0660_rewrite('public._card_settlement_candidates(uuid)'::regprocedure,
$old$join near p on public.payment_method_key(p.method) in ('card', 'credit_card', 'debit_card')$old$,
$new$join near p on public.payment_is_card(p.method)$new$);

select pg_temp.mig0660_rewrite('public.card_settlement_match(uuid, uuid)'::regprocedure,
$old$and public.payment_method_key(p.method) in ('card', 'credit_card', 'debit_card')) then$old$,
$new$and public.payment_is_card(p.method)) then$new$);

select pg_temp.mig0660_rewrite('public.card_settlement_review()'::regprocedure,
$old$and public.payment_method_key(p.method) in ('card', 'credit_card', 'debit_card')$old$,
$new$and public.payment_is_card(p.method)$new$);

-- (d) a deposit taken with a new order: Merchant becomes its machine.
select pg_temp.mig0660_rewrite('public._order_create_deposit(uuid, jsonb)'::regprocedure,
$old$v_ref := nullif(btrim(coalesce(p_payload->>'approval_code', '')), '');$old$,
$new$v_ref := nullif(btrim(coalesce(p_payload->>'approval_code', '')), '');
  -- 0660: Merchant names its card machine (order entry's Card machine answer).
  v_method := public.payment_method_for_machine(v_method, p_payload #>> '{entry_data,payment,machine}');$new$);

-- ── 4 · Settings → Payment → Payment methods ─────────────────────────────────
-- New methods are added only when absent; each change of a name or of Active,
-- and each new method, is kept as payment_method_save keeps it.
do $methods$
declare
  c_reason constant text :=
    'Chew 2026-10-07: Online transfer, Cash, Cheque or Merchant, then the card machine (Finance MASTER §0)';
  r       record;
  v_old   public.payment_manual_methods;
  v_new   public.payment_manual_methods;
  v_had   boolean;
  v_acct  text;
begin
  for r in
    select * from (values
      ('bank',            'Online transfer',   true,   1, null::text),
      ('cash',            null,                true,   2, null),
      ('cheque',          null,                true,   3, null),
      ('merchant_pbb',    'Merchant · PBB',    true,   4, '315-1000'),
      ('merchant_ghl',    'Merchant · GHL',    true,   5, '315-2000'),
      ('merchant_hlbb',   'Merchant · HLBB',   true,   6, '315-3000'),
      ('merchant_mbb',    'Merchant · MBB',    true,   7, '315-4000'),
      ('merchant_ahapay', 'Merchant · AhaPay', true,   8, '315-6000'),
      ('duitnow_qr',      null,                false,  9, null),
      ('credit_card',     null,                false, 10, null),
      ('debit_card',      null,                false, 11, null)
    ) as t(method, label, active, sort, account_code)
  loop
    select * into v_old from public.payment_manual_methods m where m.method = r.method for update;
    v_had := found;
    if not v_had and r.account_code is null then
      raise exception '0660: payment method % is not in Settings → Payment', r.method;
    end if;

    if v_had then
      update public.payment_manual_methods m
         set label      = coalesce(r.label, m.label),
             active     = r.active,
             sort       = r.sort,
             updated_at = case when coalesce(r.label, m.label) is distinct from m.label
                                 or r.active is distinct from m.active
                               then now() else m.updated_at end,
             updated_by = case when coalesce(r.label, m.label) is distinct from m.label
                                 or r.active is distinct from m.active
                               then null else m.updated_by end
       where m.method = r.method
       returning * into v_new;
    else
      insert into public.payment_manual_methods (method, label, active, sort, updated_by, updated_at)
      values (r.method, r.label, r.active, r.sort, null, now())
      returning * into v_new;
      insert into public.gl_payment_account_map (method, source_channel, account_code, note, updated_by)
      values (r.method, '*', r.account_code, 'Card machine (0660)', null)
      on conflict (method, source_channel) do nothing;
    end if;

    select g.account_code into v_acct
      from public.gl_payment_account_map g
     where g.method = r.method and g.source_channel = '*';

    if not v_had
       or v_new.label is distinct from v_old.label
       or v_new.active is distinct from v_old.active then
      insert into public.payment_setting_changes (what, old_value, new_value, actor_id, reason)
      values ('manual_method:' || r.method,
              case when v_had then to_jsonb(v_old) || jsonb_build_object('account_code', v_acct) end,
              to_jsonb(v_new) || jsonb_build_object('account_code', v_acct),
              null,
              c_reason);
    end if;
  end loop;
end $methods$;

-- ── 5 · order entry's methods ────────────────────────────────────────────────
-- Built from the list as it stands: Credit / Debit and Installment are
-- switched off, Cheque and Merchant are added when absent, and every other
-- method and field stays as it is.
update public.order_entry_config c
   set payment_methods =
         coalesce((select jsonb_agg(case when e ->> 'key' in ('credit', 'installment')
                                         then e || jsonb_build_object('active', false)
                                         else e end
                                    order by t.n)
                     from jsonb_array_elements(coalesce(c.payment_methods, '[]'::jsonb)) with ordinality as t(e, n)),
                  '[]'::jsonb)
         || case when exists (select 1 from jsonb_array_elements(coalesce(c.payment_methods, '[]'::jsonb)) e
                               where e ->> 'key' = 'cheque')
                 then '[]'::jsonb
                 else jsonb_build_array(jsonb_build_object(
                        'key', 'cheque', 'label', 'Cheque', 'sublabel', '', 'active', true,
                        'approvalCodeRequired', true, 'followUps', '[]'::jsonb))
            end
         || case when exists (select 1 from jsonb_array_elements(coalesce(c.payment_methods, '[]'::jsonb)) e
                               where e ->> 'key' = 'merchant')
                 then '[]'::jsonb
                 else jsonb_build_array(jsonb_build_object(
                        'key', 'merchant', 'label', 'Merchant', 'sublabel', 'Card machine', 'active', true,
                        'approvalCodeRequired', true,
                        'followUps', jsonb_build_array(jsonb_build_object(
                          'key', 'machine', 'label', 'Card machine',
                          'options', jsonb_build_array('PBB', 'GHL', 'HLBB', 'MBB', 'AhaPay'),
                          'required', true))))
            end,
       updated_at = now(),
       updated_by = null
 where c.id;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src  text;
  v_bad  text;
  v_keys text;
  r      record;
begin
  -- the card family
  if not (public.payment_is_card('card') and public.payment_is_card('credit_card')
          and public.payment_is_card('debit_card') and public.payment_is_card('credit')
          and public.payment_is_card('installment') and public.payment_is_card('Merchant')
          and public.payment_is_card('merchant_pbb') and public.payment_is_card('merchant_ahapay')) then
    raise exception '0660: payment_is_card misses a card method';
  end if;
  if public.payment_is_card('cash') or public.payment_is_card('bank') or public.payment_is_card('cheque')
     or public.payment_is_card('online') or public.payment_is_card('duitnow_qr')
     or public.payment_is_card('other') or public.payment_is_card(null) or public.payment_is_card('merchantx') then
    raise exception '0660: payment_is_card takes a method that is not a card';
  end if;
  if public.payment_method_key('Merchant') is distinct from 'card'
     or public.payment_method_key('installment') is distinct from 'card'
     or public.payment_method_key('bank_transfer') is distinct from 'bank'
     or public.payment_method_key('merchant_pbb') is distinct from 'merchant_pbb' then
    raise exception '0660: payment_method_key folds wrongly';
  end if;
  if public.payment_method_for_machine('merchant', 'PBB') is distinct from 'merchant_pbb'
     or public.payment_method_for_machine('Merchant', 'AhaPay') is distinct from 'merchant_ahapay'
     or public.payment_method_for_machine('merchant', null) is distinct from 'merchant'
     or public.payment_method_for_machine('merchant', 'Other') is distinct from 'merchant'
     or public.payment_method_for_machine('cash', 'PBB') is distinct from 'cash' then
    raise exception '0660: payment_method_for_machine names the wrong method';
  end if;

  -- each machine: Active, its own clearing account, a card account in use
  for r in select * from (values
      ('merchant_pbb', '315-1000'), ('merchant_ghl', '315-2000'), ('merchant_hlbb', '315-3000'),
      ('merchant_mbb', '315-4000'), ('merchant_ahapay', '315-6000')) as t(method, account_code)
  loop
    if not exists (select 1 from public.payment_manual_methods m where m.method = r.method and m.active) then
      raise exception '0660: % is not an Active payment method', r.method;
    end if;
    if public.gl_account_for_payment_method(r.method, 'order_create') is distinct from r.account_code
       or public.gl_account_for_payment_method(r.method, 'manual_payment') is distinct from r.account_code then
      raise exception '0660: % does not land in %', r.method, r.account_code;
    end if;
    if not public.gl_money_account_ok(r.account_code)
       or not exists (select 1 from public.gl_money_accounts a
                       where a.account_code = r.account_code and a.money_kind = 'HOLDING' and a.is_active) then
      raise exception '0660: % is not a card account in use', r.account_code;
    end if;
  end loop;
  -- the switched-off methods keep their accounts, so old payments still read
  if exists (select 1 from public.payment_manual_methods m
              where m.method in ('duitnow_qr', 'credit_card', 'debit_card')
                and (m.active or public.gl_account_for_payment_method(m.method, null) is null)) then
    raise exception '0660: DuitNow QR, Credit card or Debit card is still Active or lost its account';
  end if;
  select string_agg(m.method, ',' order by m.sort, m.method) into v_keys
    from public.payment_manual_methods m where m.active;
  if v_keys is distinct from 'bank,cash,cheque,merchant_pbb,merchant_ghl,merchant_hlbb,merchant_mbb,merchant_ahapay' then
    raise exception '0660: the Active payment methods are %, not the ruled list', v_keys;
  end if;
  if (select m.label from public.payment_manual_methods m where m.method = 'bank') is distinct from 'Online transfer' then
    raise exception '0660: Bank transfer was not named Online transfer';
  end if;

  -- order entry: Online transfer, Cash, Cheque, Merchant; every Card machine
  -- answer names a machine method
  select string_agg(e ->> 'key', ',' order by t.n) into v_keys
    from public.order_entry_config c,
         jsonb_array_elements(c.payment_methods) with ordinality as t(e, n)
   where c.id and (e ->> 'active')::boolean;
  if v_keys is distinct from 'online,cash,cheque,merchant' then
    raise exception '0660: order entry offers %, not Online transfer, Cash, Cheque and Merchant', v_keys;
  end if;
  select string_agg(o, ', ') into v_bad
    from public.order_entry_config c,
         jsonb_array_elements(c.payment_methods) e,
         jsonb_array_elements(e -> 'followUps') fu,
         jsonb_array_elements_text(fu -> 'options') o
   where c.id and e ->> 'key' = 'merchant' and fu ->> 'key' = 'machine'
     and public.payment_method_for_machine('merchant', o) not like 'merchant\_%';
  if v_bad is not null then
    raise exception '0660: these card machines have no payment method: %', v_bad;
  end if;
  if not exists (select 1 from public.order_entry_config c, jsonb_array_elements(c.payment_methods) e,
                               jsonb_array_elements(e -> 'followUps') fu
                  where c.id and e ->> 'key' = 'merchant' and (fu ->> 'required')::boolean
                    and fu ->> 'key' = 'machine' and jsonb_array_length(fu -> 'options') = 5) then
    raise exception '0660: order entry''s Merchant does not ask the Card machine';
  end if;

  -- the rewrites: the old list is gone, the new call is in, nothing else moved
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('_customer_payment_post', '_payment_reference_guard',
                                  '_card_settlement_candidates', 'card_settlement_match', 'card_settlement_review')
                and (position($t$('card', 'credit_card', 'debit_card')$t$ in pg_get_functiondef(p.oid)) > 0
                     or position('payment_is_card(' in pg_get_functiondef(p.oid)) = 0)) then
    raise exception '0660: a card function still lists the card family by hand';
  end if;
  select pg_get_functiondef('public._order_create_deposit(uuid, jsonb)'::regprocedure) into v_src;
  if position('payment_method_for_machine(' in v_src) = 0 or position('_customer_payment_post(' in v_src) = 0 then
    raise exception '0660: _order_create_deposit does not name the card machine';
  end if;
  select pg_get_functiondef('public._customer_payment_post(uuid, numeric, date, text, text, text, text, text, text, text, text, text, jsonb, boolean)'::regprocedure) into v_src;
  if position('_customer_payment_to_ledger(' in v_src) = 0 or position('payment_account_unmapped' in v_src) = 0 then
    raise exception '0660: _customer_payment_post lost its ledger posting or its money account check';
  end if;
  select string_agg(b.fn::text, ', ') into v_bad
    from mig0660_before b
    join pg_proc p on p.oid = b.fn::oid
   where p.prosecdef is distinct from b.prosecdef or p.proconfig is distinct from b.proconfig
      or p.provolatile is distinct from b.provolatile or p.prorettype is distinct from b.prorettype;
  if v_bad is not null then
    raise exception '0660: a rewritten function changed more than its text: %', v_bad;
  end if;
  if (select count(*) from mig0660_before) <> 7 then
    raise exception '0660: expected the seven functions this rewrites';
  end if;
  -- a machine's account is not made a card payout account here (see 4 above)
  select pg_get_functiondef('public._card_payout_holdings()'::regprocedure) into v_src;
  if position('payment_is_card(' in v_src) > 0 then
    raise exception '0660: _card_payout_holdings was changed';
  end if;

  if has_function_privilege('anon', 'public.payment_is_card(text)', 'execute')
     or has_function_privilege('authenticated', 'public.payment_method_for_machine(text, text)', 'execute')
     or has_function_privilege('anon', 'public.payment_method_for_machine(text, text)', 'execute') then
    raise exception '0660: a payment helper is open to callers it should not be';
  end if;
end $sanity$;

commit;
