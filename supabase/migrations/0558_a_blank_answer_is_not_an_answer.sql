-- =============================================================================
-- 0558_a_blank_answer_is_not_an_answer.sql
-- =============================================================================
-- WHAT WAS WRONG
--   A guard that forces someone to type a reason, a name, a document number or
--   an evidence path tested emptiness with one-argument btrim(). In Postgres
--   btrim(text) trims the SPACE character and nothing else:
--
--     select btrim(E'\t') = '';   -- false
--     select btrim(E'\n') = '';   -- false
--     select btrim('  ')   = '';   -- true
--
--   So a single tab, or a single line break, passed every one of those guards
--   as if someone had typed a word. Someone cancels an order, presses Tab in
--   the reason box and saves: the cancellation is recorded with a reason that
--   is one invisible character, and every report of it shows a blank.
--
--   0552 fixed one door this way (the payment voucher line description) and
--   named the idiom: ask whether the value contains any character that is NOT
--   whitespace. This file sweeps the rest of them in one pass.
--
-- WHAT THIS CHANGES
--   114 guards in 80 functions. Every body below was carried forward
--   from the LIVE catalog (pg_get_functiondef over pg_proc) rather than from a
--   migration file, because a later create-or-replace silently wins and the
--   newest file on disk is not always the live body. Nothing in any body was
--   changed except the emptiness test itself:
--
--     nullif(btrim(coalesce(X, '')), '') is null   ->  coalesce(X, '') !~ '[^[:space:]]'
--     btrim(X) = ''                                ->  coalesce(X, '') !~ '[^[:space:]]'
--     length(btrim(coalesce(X, ''))) = 0           ->  coalesce(X, '') !~ '[^[:space:]]'
--     length(trim(coalesce(X, ''))) = 0            ->  coalesce(X, '') !~ '[^[:space:]]'
--
--   A minimum-length rule is a different rule and is left alone; the blank test
--   is added beside it, because three tabs are three characters long:
--
--     length(btrim(X)) < 3  ->  (length(btrim(X)) < 3 or coalesce(X, '') !~ '[^[:space:]]')
--
--   coalesce() around the value is load-bearing: NULL !~ '...' is NULL, and a
--   NULL condition does not fire an IF.
--
--   Not swept, on purpose: tests on codes, keys, enums, uuids, dates and SKUs,
--   where a blank is a different question and a tab was never a word. The PR
--   body lists every one of them. Also not swept: four functions that an
--   unmerged migration between 0550 and 0557 redefines
--   (_customer_payment_post, gl_manual_journal, payment_voucher_save_draft,
--   supplier_bill_save_draft) — redefining them here would silently revert
--   that work, because this file applies last.
--
--   Grants are not restated: create or replace keeps the function's existing
--   ACL, and no signature below changes.
--
--   The sanity block at the end reads the live catalog back and refuses to let
--   this migration commit unless every function it just wrote carries the test.
--
-- RLS: unchanged. DATA: none — no row is read or written. DR/CR: none.
-- SECTION 6: rows already saved with a whitespace-only answer stay as they are;
--   the next write of that row is what fixes it.
-- =============================================================================

begin;


-- _payment_voucher_validate(p_voucher_id uuid)
--   0558: length(btrim(coalesce(v_v.payee_name, ''))) = 0
CREATE OR REPLACE FUNCTION public._payment_voucher_validate(p_voucher_id uuid)
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

  perform public.ap_refuse_before_go_live(v_v.voucher_date, 'This payment voucher');
  perform public._ap_require_account(v_v.pay_from_account_code, 'pay_from', 'Pay from');
  if coalesce(v_v.payee_name, '') !~ '[^[:space:]]' then
    raise exception 'Type who is being paid.'
      using errcode = 'P0001', detail = 'payee_missing';
  end if;

  for r in select l.line_no, l.account_code
             from public.payment_voucher_lines l
            where l.voucher_id = p_voucher_id order by l.line_no loop
    perform public._ap_require_account(r.account_code, 'voucher_line', format('Line %s', r.line_no));
    if r.account_code = v_v.pay_from_account_code then
      raise exception 'Line %: the money cannot be paid from and to the same account.', r.line_no
        using errcode = 'P0001', detail = 'line_is_pay_from';
    end if;
  end loop;

  select coalesce(sum(amount), 0), count(*) into v_lines, v_nlines
    from public.payment_voucher_lines where voucher_id = p_voucher_id;
  select coalesce(sum(amount_applied), 0), count(*) into v_allocs, v_nallocs
    from public.payment_voucher_allocations where voucher_id = p_voucher_id;

  if coalesce(v_v.purpose, 'SUPPLIER_BILLS') = 'SUPPLIER_BILLS' then
    if v_v.supplier_id is null then
      raise exception 'Choose the supplier whose bills this voucher pays.'
        using errcode = 'P0001', detail = 'supplier_required';
    end if;
    if v_nallocs = 0 and v_v.advance_amount = 0 then
      raise exception 'Choose at least one bill to pay, or type an advance.'
        using errcode = 'P0001', detail = 'no_bills';
    end if;
    if v_v.advance_amount > 0 then
      perform public._ap_require_account(v_v.ap_account_code, 'ap', 'Advance');
    end if;
  else
    if v_nallocs > 0 then
      raise exception 'A direct payment does not pay bills.'
        using errcode = 'P0001', detail = 'direct_pays_no_bill';
    end if;
    if v_v.advance_amount > 0 then
      raise exception 'A direct payment does not carry an advance.'
        using errcode = 'P0001', detail = 'direct_pays_no_advance';
    end if;
    if v_nlines = 0 then
      raise exception 'Add at least one line: what is this money paying for?'
        using errcode = 'P0001', detail = 'no_lines';
    end if;
  end if;

  -- Every ringgit paid says what it pays: the total IS lines + bills + advance.
  if v_lines + v_allocs + v_v.advance_amount <> v_v.amount then
    raise exception 'This voucher is for RM %, but its lines, bills and advance add up to RM %.',
      to_char(v_v.amount, 'FM999,999,999,990.00'),
      to_char(v_lines + v_allocs + v_v.advance_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'total_not_equal';
  end if;

  -- The bills as they stand NOW: still confirmed, still this supplier's, and
  -- not over-paid by another voucher or an advance since this one was typed.
  select string_agg(coalesce(b.bill_no, b.supplier_invoice_no), ', ') into v_bad
    from public.payment_voucher_allocations a
    join public.supplier_bills b on b.id = a.bill_id
   where a.voucher_id = p_voucher_id
     and (b.status <> 'confirmed'
          or b.supplier_id is distinct from v_v.supplier_id
          or coalesce((select bp.held from public.ap_bill_paid(a.bill_id) bp), 0) > b.total_amount);
  if v_bad is not null then
    raise exception 'These bills can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'bill_cannot_take_payment';
  end if;
end;
$function$;

-- _sales_order_proceed(p_order_id uuid, p_strict boolean, p_actor_role app_role, p_actor_text text)
--   0558: btrim(v_order.customer_address) = ''
--   0558: btrim(v_order.customer_phone) = ''
--   0558: btrim(v_order.customer_name) = ''
CREATE OR REPLACE FUNCTION public._sales_order_proceed(p_order_id uuid, p_strict boolean, p_actor_role app_role, p_actor_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order orders;
  v_total numeric(12,2);
  v_rental rental_agreements;
  v_blocker text;
begin
  select * into v_order
    from orders
   where id = p_order_id
   for update;

  if not found then
    if p_strict then
      raise exception 'Order not found'
        using errcode = '42P01', detail = 'order_not_found';
    end if;
    return jsonb_build_object('id', p_order_id, 'proceeded', false,
                              'blocker', 'order_not_found');
  end if;

  if v_order.status <> 'place' then
    if p_strict then
      raise exception 'Order is not in Place status'
        using errcode = '22023', detail = 'wrong_status';
    end if;
    return jsonb_build_object('id', p_order_id, 'proceeded', false,
                              'status', v_order.status, 'blocker', 'wrong_status');
  end if;

  select * into v_rental
    from rental_agreements
   where order_id = p_order_id
   limit 1;

  if v_order.customer_name is null or coalesce(v_order.customer_name, '') !~ '[^[:space:]]' then
    v_blocker := 'customer_name_required';
  elsif v_order.customer_phone is null or coalesce(v_order.customer_phone, '') !~ '[^[:space:]]' then
    v_blocker := 'customer_phone_required';
  elsif v_order.customer_address_unknown
        or v_order.customer_address is null
        or coalesce(v_order.customer_address, '') !~ '[^[:space:]]' then
    v_blocker := 'delivery_address_required';
  elsif v_order.delivery_date_tbd or v_order.delivery_date is null then
    v_blocker := 'delivery_date_required';
  elsif v_rental.id is null and v_order.signature_url is null then
    v_blocker := 'signature_required';
  elsif v_rental.id is null and not v_order.terms_accepted then
    v_blocker := 'terms_not_accepted';
  elsif v_rental.id is not null and v_rental.status = 'rejected' then
    v_blocker := 'rental_rejected';
  elsif v_rental.id is not null and v_rental.status <> 'active' then
    v_blocker := 'rental_not_approved';
  end if;

  if v_blocker is null and v_rental.id is null then
    select
      coalesce((select sum(unit_price * qty) from order_lines
                 where order_id = p_order_id), 0)
      + coalesce((select sum(unit_price * qty) from order_addons
                   where order_id = p_order_id), 0)
      into v_total;

    if v_total <= 0 then
      v_blocker := 'total_amount_missing';
    elsif coalesce(v_order.paid, 0) < v_total * 0.5 then
      v_blocker := 'payment_below_50';
    end if;
  end if;

  if v_blocker is not null then
    if p_strict then
      case v_blocker
        when 'customer_name_required' then
          raise exception 'Customer name is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'customer_phone_required' then
          raise exception 'Customer phone is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'delivery_address_required' then
          raise exception 'Delivery address is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'delivery_date_required' then
          raise exception 'Delivery date is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'signature_required' then
          raise exception 'Customer signature is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'terms_not_accepted' then
          raise exception 'Terms must be accepted'
            using errcode = 'P0001', detail = v_blocker;
        when 'total_amount_missing' then
          raise exception 'Order total is zero — nothing to proceed'
            using errcode = 'P0001', detail = v_blocker;
        when 'payment_below_50' then
          raise exception 'Payment must be at least 50 percent of total'
            using errcode = 'P0001', detail = v_blocker;
        when 'rental_rejected' then
          raise exception 'Rental % was rejected — this order cannot proceed',
            v_rental.agreement_no
            using errcode = 'P0001', detail = v_blocker;
        when 'rental_not_approved' then
          raise exception 'Rental % is still awaiting finance approval',
            v_rental.agreement_no
            using errcode = 'P0001', detail = v_blocker;
      end case;
    end if;
    return jsonb_build_object('id', p_order_id, 'proceeded', false,
                              'status', 'place', 'blocker', v_blocker);
  end if;

  update orders
     set status = 'proceed_order',
         operation_stage = 'confirmed',
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    case when v_rental.id is null
      then 'Order proceeded · awaiting logistics triage'
      else 'Rental ' || v_rental.agreement_no
           || ' approved · order proceeded, awaiting logistics triage'
    end,
    p_actor_role,
    jsonb_build_object('kind', 'proceed', 'automatic', not p_strict)
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    p_actor_role,
    nullif(btrim(coalesce(p_actor_text, '')), ''),
    'order.proceeded',
    v_order.dealer_id,
    'SO-' || v_order.so::text
  );

  return jsonb_build_object(
    'id', v_order.id,
    'so', v_order.so,
    'status', 'proceed_order',
    'operation_stage', 'confirmed',
    'proceeded', true
  );
end;
$function$;

-- _set_order_address_0391_locked_impl(p_order_id uuid, p_address text, p_billing text, p_billing_same boolean, p_parts jsonb)
--   0558: trim(p_address) = ''
CREATE OR REPLACE FUNCTION public._set_order_address_0391_locked_impl(p_order_id uuid, p_address text, p_billing text, p_billing_same boolean, p_parts jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer address update' using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Address can only be set on Place orders'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_address is null or coalesce(p_address, '') !~ '[^[:space:]]' then
    raise exception 'Address is required'
      using errcode = '22023', detail = 'invalid_address';
  end if;

  -- 0230: parts must be an object when present (lenient absent = flat write).
  if p_parts is not null and jsonb_typeof(p_parts) <> 'object' then
    raise exception 'p_parts must be a json object'
      using errcode = '22023', detail = 'invalid_address_parts';
  end if;

  update orders
     set customer_address = trim(p_address),
         customer_address_unknown = false,
         -- 0230: structured parts stored when sent, CLEARED on a flat-only
         -- write (same stale-guard as update_order — parts never outlive the
         -- string they were composed into).
         customer_address_line1    = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'line1', '')), '') else null end,
         customer_address_line2    = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'line2', '')), '') else null end,
         customer_address_state    = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'state', '')), '') else null end,
         customer_address_city     = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'city', '')), '') else null end,
         customer_address_postcode = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'postcode', '')), '') else null end,
         customer_billing = case when coalesce(p_billing_same, true) then null else nullif(trim(p_billing), '') end,
         customer_billing_same = coalesce(p_billing_same, true),
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, 'Delivery address provided', v_role);

  return jsonb_build_object('id', p_order_id);
end;
$function$;

-- _update_order_0391_locked_impl(p_order_id uuid, p_payload jsonb)
--   0558: coalesce(trim(p_payload->>'customer_name'), '') = ''
CREATE OR REPLACE FUNCTION public._update_order_0391_locked_impl(p_order_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_changed          text[] := '{}';
  v_new_delivery     date;
  v_new_proceed      date;
  v_has_parts        boolean; -- 0230 --
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- 0222: NULL role (anon key / orphaned JWT) must not slip past the
  -- cross-dealer guard's NULL-boolean semantics — reject outright.
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  -- 0222: field-scoped status gate replaces the wholesale `<> 'place'` reject.
  -- Place orders stay fully editable; Proceed orders accept CUSTOMER fields
  -- only (the POS proceed lane keeps customer details/payment editable while
  -- products + dates lock); delivered/cancelled stay uneditable.
  if v_order.status not in ('place','proceed_order') then
    raise exception 'Order is no longer editable'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Payload must be a JSON object'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  -- 0222: in the Proceed lane the delivery/date fields are locked — the
  -- caller must un-proceed first ("move back to edit"). Whole edit rejects
  -- (not silently filtered) so the client never half-applies a patch.
  if v_order.status = 'proceed_order'
     and (p_payload ? 'delivery_date'
          or p_payload ? 'proceed_date'
          or p_payload ? 'delivery_date_tbd'
          or p_payload ? 'delivery_floor'
          or p_payload ? 'delivery_has_lift'
          -- not an accepted key today, but the Hono route forwards it; keep it
          -- locked so a future schema addition can't slip past this gate
          or p_payload ? 'delivery_stair_items') then
    raise exception 'Delivery fields are locked after Proceed'
      using errcode = '22023', detail = 'proceed_locked_fields';
  end if;

  -- 0230: structured parts ride WITH the composed string, never alone — the
  -- composed `customer_address` is what every downstream consumer reads, so a
  -- parts-only write would silently desync the two representations.
  v_has_parts := p_payload ? 'customer_address_line1'
              or p_payload ? 'customer_address_line2'
              or p_payload ? 'customer_address_state'
              or p_payload ? 'customer_address_city'
              or p_payload ? 'customer_address_postcode';
  if v_has_parts and not p_payload ? 'customer_address' then
    raise exception 'structured address parts require the composed customer_address in the same payload'
      using errcode = '22023', detail = 'address_parts_without_composed';
  end if;

  if p_payload ? 'customer_name' then
    if coalesce(p_payload->>'customer_name', '') !~ '[^[:space:]]' then
      raise exception 'Customer name cannot be empty'
        using errcode = '22023', detail = 'invalid_customer_name';
    end if;
    v_changed := array_append(v_changed, 'customer_name');
  end if;
  if p_payload ? 'customer_phone'           then v_changed := array_append(v_changed, 'customer_phone'); end if;
  -- 0222: customer_email accepted (0200 column), nullable trim like phone.
  if p_payload ? 'customer_email'           then v_changed := array_append(v_changed, 'customer_email'); end if;
  if p_payload ? 'customer_address'         then v_changed := array_append(v_changed, 'customer_address'); end if;
  if p_payload ? 'customer_address_unknown' then v_changed := array_append(v_changed, 'customer_address_unknown'); end if;
  -- 0230: structured address parts (customer-class, proceed-lane editable).
  if p_payload ? 'customer_address_line1'    then v_changed := array_append(v_changed, 'customer_address_line1'); end if;
  if p_payload ? 'customer_address_line2'    then v_changed := array_append(v_changed, 'customer_address_line2'); end if;
  if p_payload ? 'customer_address_state'    then v_changed := array_append(v_changed, 'customer_address_state'); end if;
  if p_payload ? 'customer_address_city'     then v_changed := array_append(v_changed, 'customer_address_city'); end if;
  if p_payload ? 'customer_address_postcode' then v_changed := array_append(v_changed, 'customer_address_postcode'); end if;
  if p_payload ? 'customer_billing'         then v_changed := array_append(v_changed, 'customer_billing'); end if;
  if p_payload ? 'customer_billing_same'    then v_changed := array_append(v_changed, 'customer_billing_same'); end if;
  if p_payload ? 'customer_emergency'       then v_changed := array_append(v_changed, 'customer_emergency'); end if;
  if p_payload ? 'delivery_date'            then v_changed := array_append(v_changed, 'delivery_date'); end if;
  if p_payload ? 'proceed_date'             then v_changed := array_append(v_changed, 'proceed_date'); end if;
  if p_payload ? 'delivery_date_tbd'        then v_changed := array_append(v_changed, 'delivery_date_tbd'); end if;
  if p_payload ? 'delivery_floor'           then v_changed := array_append(v_changed, 'delivery_floor'); end if;
  if p_payload ? 'delivery_has_lift'        then v_changed := array_append(v_changed, 'delivery_has_lift'); end if;

  if cardinality(v_changed) = 0 then
    raise exception 'No editable fields in payload'
      using errcode = '22023', detail = 'no_changes';
  end if;

  update orders set
    customer_name            = case when p_payload ? 'customer_name'
                                    then trim(p_payload->>'customer_name') else customer_name end,
    customer_phone           = case when p_payload ? 'customer_phone'
                                    then nullif(trim(p_payload->>'customer_phone'), '') else customer_phone end,
    -- 0222: email mirrors the phone treatment (trim, empty → null).
    customer_email           = case when p_payload ? 'customer_email'
                                    then nullif(trim(p_payload->>'customer_email'), '') else customer_email end,
    customer_address         = case when p_payload ? 'customer_address'
                                    then nullif(trim(p_payload->>'customer_address'), '') else customer_address end,
    customer_address_unknown = case when p_payload ? 'customer_address_unknown'
                                    then (p_payload->>'customer_address_unknown')::boolean else customer_address_unknown end,
    -- 0230: each structured column takes its sent value; a flat-only
    -- customer_address write (no parts in the payload) CLEARS it instead
    -- (stale-guard — the string is no longer known to match the parts).
    customer_address_line1    = case when p_payload ? 'customer_address_line1'
                                     then nullif(trim(p_payload->>'customer_address_line1'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_line1 end,
    customer_address_line2    = case when p_payload ? 'customer_address_line2'
                                     then nullif(trim(p_payload->>'customer_address_line2'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_line2 end,
    customer_address_state    = case when p_payload ? 'customer_address_state'
                                     then nullif(trim(p_payload->>'customer_address_state'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_state end,
    customer_address_city     = case when p_payload ? 'customer_address_city'
                                     then nullif(trim(p_payload->>'customer_address_city'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_city end,
    customer_address_postcode = case when p_payload ? 'customer_address_postcode'
                                     then nullif(trim(p_payload->>'customer_address_postcode'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_postcode end,
    customer_billing         = case when p_payload ? 'customer_billing'
                                    then nullif(trim(p_payload->>'customer_billing'), '') else customer_billing end,
    customer_billing_same    = case when p_payload ? 'customer_billing_same'
                                    then (p_payload->>'customer_billing_same')::boolean else customer_billing_same end,
    customer_emergency       = case when p_payload ? 'customer_emergency'
                                    then nullif(trim(p_payload->>'customer_emergency'), '') else customer_emergency end,
    delivery_date            = case when p_payload ? 'delivery_date'
                                    then nullif(p_payload->>'delivery_date', '')::date else delivery_date end,
    proceed_date             = case when p_payload ? 'proceed_date'
                                    then nullif(p_payload->>'proceed_date', '')::date else proceed_date end,
    delivery_date_tbd        = case when p_payload ? 'delivery_date_tbd'
                                    then (p_payload->>'delivery_date_tbd')::boolean else delivery_date_tbd end,
    delivery_floor           = case when p_payload ? 'delivery_floor'
                                    then greatest(1, (p_payload->>'delivery_floor')::int) else delivery_floor end,
    delivery_has_lift        = case when p_payload ? 'delivery_has_lift'
                                    then (p_payload->>'delivery_has_lift')::boolean else delivery_has_lift end,
    updated_at               = now()
  where id = p_order_id
  returning delivery_date, proceed_date into v_new_delivery, v_new_proceed;

  -- Phase 11.1 — after applying the partial edit, the resulting pair must stay
  -- ordered (proceed <= delivery). Raising here rolls the whole edit back.
  if v_new_delivery is not null and v_new_proceed is not null
     and v_new_proceed > v_new_delivery then
    raise exception 'proceed date must be on or before delivery date'
      using errcode = '22023', detail = 'proceed_after_delivery';
  end if;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Order details updated · %s field(s)', cardinality(v_changed)),
    v_role,
    jsonb_build_object('kind', 'edit', 'changed', to_jsonb(v_changed), 'payload', p_payload)
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.edited', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'changed', v_changed);
end;
$function$;

-- arrival_source_create(p_input jsonb)
--   0558: nullif(btrim(p_input->'case_approval'->>'note'),'') is null
--   0558: nullif(btrim(p_input->>'reason'),'') is null
CREATE OR REPLACE FUNCTION public.arrival_source_create(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 s arrival_sources; u ops_stock_items; cl supplier_claims; ca service_cases;
 v_id uuid := (p_input->>'id')::uuid; v_kind text := p_input->>'kind';
 v_units uuid[]; v_unit_id uuid; v_new_id uuid; v_no text;
 v_claim uuid := nullif(p_input->>'claim_id','')::uuid;
 v_case uuid := nullif(p_input->>'case_id','')::uuid;
 -- 0490: a failed-delivery return bound to the Delivery Visit that failed.
 v_attempt uuid := nullif(p_input->>'attempt_id','')::uuid;
 at delivery_attempts; v_attempt_order uuid;
 v_from uuid := nullif(p_input->>'from_site_id','')::uuid;
 v_to uuid := (p_input->>'to_site_id')::uuid;
begin
 perform arrival_source_gate();
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 select * into s from arrival_sources where id=v_id;
 if found then
  if s.created_by <> auth.uid() or not exists(select 1 from arrival_source_events where source_id=v_id and kind='planned' and payload=p_input) then raise exception 'source key already used' using errcode='40001'; end if;
  return to_jsonb(s);
 end if;
 if v_kind not in ('transfer','customer-return','failed-delivery-return','repair-return','supplier-replacement') or coalesce(p_input->>'reason', '') !~ '[^[:space:]]' then raise exception 'source type and reason required' using errcode='22023'; end if;
 select array_agg(value::uuid order by value) into v_units from jsonb_array_elements_text(p_input->'unit_ids');
 if coalesce(cardinality(v_units),0)=0 or cardinality(v_units)>200 or cardinality(v_units) <> (select count(distinct x) from unnest(v_units) x) then raise exception 'name each exact Unit once' using errcode='22023'; end if;
 if not exists(select 1 from stock_operating_parties where id=(p_input->>'party_id')::uuid and active) then raise exception 'choose an active operating party' using errcode='22023'; end if;
 if v_claim is not null then select * into cl from supplier_claims where id=v_claim for update; if not found then raise exception 'Claim not found' using errcode='P0002'; end if; end if;
 if v_case is not null then select * into ca from service_cases where id=v_case for update; if not found then raise exception 'Case not found' using errcode='P0002'; end if; end if;
 if v_attempt is not null then
  if v_kind <> 'failed-delivery-return' then raise exception 'only a failed-delivery return is bound to a Delivery Visit' using errcode='22023'; end if;
  select * into at from delivery_attempts where id=v_attempt; if not found then raise exception 'Delivery Visit not found' using errcode='P0002'; end if;
  if at.result not in ('failed','partial') then raise exception 'goods come back from a failed or partially delivered visit' using errcode='22023'; end if;
  v_attempt_order := at.order_id;
 end if;
 if v_case is not null then
  if coalesce((p_input->'case_approval'->>'approved')::boolean,false) is not true or coalesce(p_input->'case_approval'->>'note', '') !~ '[^[:space:]]' or jsonb_typeof(p_input->'case_approval'->'condition_required') is distinct from 'boolean' or nullif(p_input->'case_approval'->>'photo_date','') is null then raise exception 'record the Case remedy approval and evidence first' using errcode='22023'; end if;
  if (p_input->'case_approval'->>'photo_date')::date>(now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'evidence date cannot be in the future' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'case_approval'->'evidence_paths') is distinct from 'array' or jsonb_array_length(p_input->'case_approval'->'evidence_paths')=0 then raise exception 'Case evidence required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_input->'case_approval'->'evidence_paths') path where not exists(select 1 from jsonb_array_elements(ca.evidence) file where file->>'path'=path and (not (p_input->'case_approval'->>'condition_required')::boolean or file->>'kind'='photo'))) then raise exception 'approval evidence must belong to the Case; condition review needs photos' using errcode='22023'; end if;
  if (p_input->'case_approval'->>'condition_required')::boolean and not coalesce(p_input->'case_approval'->'passed_conditions' @> '["no_stain","no_liquid_odour","no_pests","sanitary","no_tear_burn_cut","no_customer_damage","correct_item","safe_wrapped"]'::jsonb,false) then raise exception 'condition check failed or missing; do not book collection' using errcode='22023'; end if;
 end if;
 -- The owning outcome is read, never inferred from the independent execution layer.
 if v_kind='repair-return' and ((v_claim is not null and cl.customer_resolution is distinct from 'repair') or (v_claim is null and ca.order_id is null)) then raise exception 'record the authorised repair outcome in the Claim first' using errcode='22023'; end if;
 if v_kind='supplier-replacement' and (cl.id is null or cl.customer_resolution is distinct from 'replace') then raise exception 'record the authorised replacement outcome in the Claim first' using errcode='22023'; end if;
 if v_kind in ('customer-return','failed-delivery-return') and v_attempt is null and ca.order_id is null then raise exception 'the Case must name its Sales Order' using errcode='22023'; end if;
 v_no := case when v_kind='transfer' then allocate_formal_document_code('TR',v_id::text)
              when v_kind='repair-return' then allocate_formal_document_code('RO',v_id::text)
              when v_claim is not null then cl.claim_no
              -- 0490: the paper the goods went out on names the return.
              when v_attempt is not null then coalesce(at.do_number, 'SO-' || (select so::text from orders where id=v_attempt_order))
              else ca.case_no end;
 insert into arrival_sources(id,source_no,kind,claim_id,case_id,attempt_id,from_site_id,to_site_id,party_id,expected_date,collection_date,reason,created_by,sales_order_ref,case_approval)
 values(v_id,v_no,v_kind,v_claim,v_case,v_attempt,v_from,v_to,(p_input->>'party_id')::uuid,(p_input->>'expected_date')::date,nullif(p_input->>'collection_date','')::date,btrim(p_input->>'reason'),auth.uid(),nullif(btrim(p_input->>'sales_order_ref'),''),case when v_case is not null then (p_input->'case_approval')||jsonb_build_object('approved_by',auth.uid(),'approved_at',now()) else null end) returning * into s;
 foreach v_unit_id in array v_units loop
  select * into u from ops_stock_items where id=v_unit_id for update;
  if not found or u.qty<>1 then raise exception 'an exact Unit is required' using errcode='22023'; end if;
  if exists(select 1 from arrival_source_units au join arrival_sources a on a.id=au.source_id where (au.stock_item_id=u.id or au.replaces_item_id=u.id) and a.cancelled_at is null and not exists(select 1 from receiving_unit_results ur join warehouse_receipts r on r.id=ur.receipt_id where r.arrival_source_id=a.id and r.status='posted' and ur.stock_item_id=au.stock_item_id and ur.outcome in ('received','received_with_issue'))) then raise exception 'Unit already has open arrival work' using errcode='40001'; end if;
  if v_kind='transfer' and (u.warehouse_id is distinct from v_from or u.status not in ('free','reserved')) then raise exception 'Unit must be at origin and movable' using errcode='22023'; end if;
  if v_kind='repair-return' and (v_from is null or u.warehouse_id is distinct from v_from or u.status not in ('free','reserved','on_hold')) then raise exception 'repair needs the exact Units at the recorded origin Site' using errcode='22023'; end if;
  if v_kind='transfer' and u.reserved_ref is not null and u.reserved_ref is distinct from nullif(btrim(p_input->>'sales_order_ref'),'') then raise exception 'a reserved Unit requires its owning Sales Order transfer instruction' using errcode='22023'; end if;
  if v_kind in ('repair-return','supplier-replacement') and v_claim is not null and u.hold_claim_id is distinct from v_claim then raise exception 'Unit does not belong to this Claim' using errcode='22023'; end if;
  if v_kind in ('customer-return','failed-delivery-return') and v_attempt is null and u.sold_order_id is distinct from ca.order_id then raise exception 'Unit does not belong to the Case Sales Order' using errcode='22023'; end if;
  -- 0490: a Unit coming back from a failed visit is one the visit's own document required
  -- (0424 scope) and is still reserved to that order, with the partner as its holder.
  if v_attempt is not null and not exists(select 1 from delivery_order_units du join ops_delivery_orders d on d.id=du.delivery_order_id where du.item_id=u.id and d.order_id=v_attempt_order and d.do_number is not distinct from at.do_number) then raise exception 'Unit was not on the failed visit''s Delivery Order' using errcode='22023'; end if;
  if v_attempt is not null and u.status <> 'reserved' then raise exception 'a Unit coming back from a failed visit is still reserved to its order' using errcode='22023'; end if;
  if v_kind='repair-return' and v_claim is null and u.sold_order_id is distinct from ca.order_id then raise exception 'Unit does not belong to the Case Sales Order' using errcode='22023'; end if;
  if v_kind in ('customer-return','failed-delivery-return') and v_attempt is null and u.status not in ('sold','transferred') then raise exception 'Unit is already at Carres; use its inspection work' using errcode='22023'; end if;
  if v_kind <> 'supplier-replacement' and u.status in ('voided','written_off','returned_to_supplier') then raise exception 'ended Unit cannot return on this source' using errcode='22023'; end if;
  if v_kind='supplier-replacement' then
   -- New physical object: allocate identity from the existing single authority.
   -- No po_no: the original PO Receiving door must never consume this separately
   -- authorised replacement. Original PO lineage remains through Claim/replaces_item_id.
   insert into ops_stock_items(unit_code,sku,warehouse_id,status,supplier,po_no,ownership,qty)
   values(allocate_unit_id(),u.sku,v_to,'incoming',u.supplier,null,u.ownership,1) returning id into v_new_id;
   insert into arrival_source_units values(v_id,v_new_id,u.id,'incoming',null);
  else insert into arrival_source_units values(v_id,u.id,null,u.status,u.holder_party_id); end if;
 end loop;
 insert into arrival_source_events(source_id,kind,occurred_at,actor_id,payload)
 values(v_id,'planned',now(),auth.uid(),p_input);
 return to_jsonb(s);
end $function$;

-- arrival_source_handover(p_id uuid, p_input jsonb)
--   0558: nullif(btrim(p_input->>'evidence'),'') is null
--   0558: nullif(btrim(p_input->>'person'),'') is null
CREATE OR REPLACE FUNCTION public.arrival_source_handover(p_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s arrival_sources; u ops_stock_items; v_units uuid[]; v_id uuid; e arrival_source_events;
 v_kind text:=p_input->>'kind'; v_party uuid:=(p_input->>'party_id')::uuid;
begin
 perform arrival_source_gate();
 select * into s from arrival_sources where id=p_id for update;
 if not found then raise exception 'source not found' using errcode='P0002'; end if;
 select * into e from arrival_source_events where save_key=(p_input->>'key')::uuid;
 if found then
  if e.source_id<>p_id or e.actor_id<>auth.uid() or e.payload<>p_input then raise exception 'handover key already used' using errcode='40001'; end if;
  return to_jsonb(e);
 end if;
 if s.cancelled_at is not null then raise exception 'source is cancelled' using errcode='22023'; end if;
 if v_kind not in ('collected','carrier_received','collection_refused') or coalesce(p_input->>'person', '') !~ '[^[:space:]]' or coalesce(p_input->>'evidence', '') !~ '[^[:space:]]' then raise exception 'record actual handover, person and evidence' using errcode='22023'; end if;
 if (p_input->>'occurred_at')::timestamptz > now() then raise exception 'actual handover cannot be in the future' using errcode='22023'; end if;
 if coalesce((s.case_approval->>'condition_required')::boolean,false) and v_kind='carrier_received' and exists(select 1 from jsonb_array_elements_text(p_input->'unit_ids') uid where not exists(select 1 from arrival_source_events where source_id=p_id and kind='collected' and uid::uuid=any(unit_ids))) then raise exception 'record the accepted doorstep check before carrier receipt' using errcode='22023'; end if;
 if not exists(select 1 from stock_operating_parties where id=v_party and active) then raise exception 'party not found' using errcode='22023'; end if;
 if coalesce((s.case_approval->>'condition_required')::boolean,false) and v_kind in ('collected','collection_refused') then
  if jsonb_typeof(p_input->'collection_review'->'evidence_paths') is distinct from 'array' or jsonb_array_length(p_input->'collection_review'->'evidence_paths')=0 then raise exception 'doorstep condition photos required before loading' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_input->'collection_review'->'evidence_paths') path where split_part(path,'/',1)<>p_id::text or not exists(select 1 from storage.objects where bucket_id='arrival-proofs' and name=path and lower(path) ~ '\.(jpg|jpeg|png)$')) then raise exception 'upload this source doorstep photos first' using errcode='22023'; end if;
  if v_kind='collected' and not coalesce(p_input->'collection_review'->'passed_conditions' @> '["no_stain","no_liquid_odour","no_pests","sanitary","no_tear_burn_cut","no_customer_damage","correct_item","safe_wrapped"]'::jsonb,false) then raise exception 'condition failed or missing; do not collect' using errcode='22023'; end if;
 end if;
 select array_agg(value::uuid order by value) into v_units from jsonb_array_elements_text(p_input->'unit_ids');
 if coalesce(cardinality(v_units),0)=0 or cardinality(v_units)>200 or cardinality(v_units)<>(select count(distinct x) from unnest(v_units) x) then raise exception 'name each Unit once' using errcode='22023'; end if;
 foreach v_id in array v_units loop
  select * into u from ops_stock_items where id=v_id for update;
  if not found or not exists(select 1 from arrival_source_units where source_id=p_id and stock_item_id=v_id) then raise exception 'Unit does not belong to source' using errcode='22023'; end if;

  -- A delayed fact may complete history, but a new custody write must still
  -- refer to the same physical journey that was authorised when planned.
  if v_kind<>'collection_refused'
   and not exists(select 1 from receiving_unit_results ur join warehouse_receipts wr on wr.id=ur.receipt_id where wr.arrival_source_id=p_id and wr.status='posted' and ur.stock_item_id=v_id and ur.outcome<>'not_received')
   and not exists(select 1 from arrival_source_events later where later.source_id=p_id and v_id=any(later.unit_ids) and later.kind in ('collected','carrier_received') and later.occurred_at>(p_input->>'occurred_at')::timestamptz) then
    if u.status in ('voided','written_off','returned_to_supplier') then raise exception 'Unit journey has ended' using errcode='40001'; end if;
    if not exists(select 1 from arrival_source_events where source_id=p_id and v_id=any(unit_ids) and kind in ('collected','carrier_received')) then
     if (s.kind='transfer' and (u.warehouse_id is distinct from s.from_site_id or u.status not in ('free','reserved') or (u.reserved_ref is not null and u.reserved_ref is distinct from s.sales_order_ref)))
       or (s.kind='repair-return' and (u.warehouse_id is distinct from s.from_site_id or u.status not in ('free','reserved','on_hold')))
       or (s.kind='supplier-replacement' and u.status<>'incoming')
       or (s.kind in ('customer-return','failed-delivery-return') and s.attempt_id is null and (u.status not in ('sold','transferred') or u.sold_order_id is distinct from (select order_id from service_cases where id=s.case_id)))
       or (s.kind='failed-delivery-return' and s.attempt_id is not null and u.status not in ('reserved','transferred'))
     then raise exception 'Unit has changed since planning; inspect its current journey' using errcode='40001'; end if;
    elsif u.status<>'transferred' or u.holder_party_id is distinct from (select party_id from arrival_source_events where source_id=p_id and v_id=any(unit_ids) and kind in ('collected','carrier_received') order by occurred_at desc,recorded_at desc,id desc limit 1) then
     raise exception 'Unit custody has changed outside this journey' using errcode='40001';
    end if;
  end if;
  if v_kind<>'collection_refused' and exists(select 1 from arrival_source_events where source_id=p_id and kind=v_kind and v_id=any(unit_ids)) then raise exception 'this Unit handover is already recorded' using errcode='40001'; end if;
  if v_kind='collected' and s.kind='transfer' and not exists(select 1 from arrival_source_events where source_id=p_id and kind='carrier_received' and v_id=any(unit_ids)) and not exists(select 1 from receiving_unit_results ur join warehouse_receipts wr on wr.id=ur.receipt_id where wr.arrival_source_id=p_id and wr.status='posted' and ur.stock_item_id=v_id and ur.outcome<>'not_received') and (u.warehouse_id is distinct from s.from_site_id or u.status not in ('free','reserved')) then raise exception 'Unit is no longer movable at origin' using errcode='40001'; end if;
 end loop;
 insert into arrival_source_events(source_id,save_key,kind,unit_ids,party_id,person,evidence,occurred_at,actor_id,payload)
 values(p_id,(p_input->>'key')::uuid,v_kind,v_units,v_party,btrim(p_input->>'person'),btrim(p_input->>'evidence'),(p_input->>'occurred_at')::timestamptz,auth.uid(),p_input) returning * into e;
 -- The individual handover changes only the named Units; origin Site remains
 -- their last confirmed Site until Receiving proves destination arrival.
 update ops_stock_items i set holder_party_id=v_party,status='transferred',updated_at=now() where i.id=any(v_units) and v_kind<>'collection_refused'
 and not exists(select 1 from receiving_unit_results ur join warehouse_receipts wr on wr.id=ur.receipt_id where wr.arrival_source_id=p_id and wr.status='posted' and ur.stock_item_id=i.id and ur.outcome<>'not_received')
 and not exists(select 1 from arrival_source_events later where later.source_id=p_id and i.id=any(later.unit_ids) and later.kind in ('collected','carrier_received') and later.occurred_at>e.occurred_at);
 return to_jsonb(e);
end $function$;

-- arrival_source_plan(p_id uuid, p_input jsonb, p_cancel boolean)
--   0558: nullif(btrim(p_input->>'reason'),'') is null
CREATE OR REPLACE FUNCTION public.arrival_source_plan(p_id uuid, p_input jsonb, p_cancel boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s arrival_sources;
begin
 perform arrival_source_gate();
 select * into s from arrival_sources where id=p_id for update;
 if not found then raise exception 'source not found' using errcode='P0002'; end if;
 if coalesce(p_input->>'reason', '') !~ '[^[:space:]]' then raise exception 'reason required' using errcode='22023'; end if;
 if s.cancelled_at is not null then raise exception 'source already cancelled' using errcode='22023'; end if;
 if p_cancel then
  if exists(select 1 from arrival_source_events where source_id=p_id and kind in ('collected','carrier_received')) or exists(select 1 from warehouse_receipts where arrival_source_id=p_id and status='posted') then raise exception 'goods have moved; record the next physical journey' using errcode='22023'; end if;
  perform 1 from ops_stock_items i join arrival_source_units u on u.stock_item_id=i.id where u.source_id=p_id order by i.id for update of i;
  if exists(select 1 from arrival_source_units u join ops_stock_items i on i.id=u.stock_item_id where u.source_id=p_id and u.replaces_item_id is not null and i.status<>'incoming') then raise exception 'replacement Unit has changed; inspect its current journey before cancellation' using errcode='22023'; end if;
  update arrival_sources set cancelled_at=now(),cancel_reason=btrim(p_input->>'reason') where id=p_id;
  -- A cancelled replacement instruction ends only its unreceived new identities.
  update ops_stock_items i set status='voided',updated_at=now() from arrival_source_units u where u.source_id=p_id and u.stock_item_id=i.id and u.replaces_item_id is not null and i.status='incoming';
 else
  update arrival_sources set expected_date=(p_input->>'expected_date')::date,collection_date=nullif(p_input->>'collection_date','')::date where id=p_id;
 end if;
 insert into arrival_source_events(source_id,kind,occurred_at,actor_id,payload)
 values(p_id,case when p_cancel then 'cancelled' else 'dates_changed' end,now(),auth.uid(),jsonb_build_object('before',to_jsonb(s),'change',p_input));
 return (select to_jsonb(a) from arrival_sources a where id=p_id);
end $function$;

-- commission_reopen_run(p_run_id uuid, p_reason text)
--   0558: btrim(p_reason) = ''
CREATE OR REPLACE FUNCTION public.commission_reopen_run(p_run_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_run commission_runs%rowtype;
begin
  if coalesce((select public.app_role())::text, '') <> 'principal' then
    raise exception 'principal_only' using errcode = '42501';
  end if;
  if p_reason is null or coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'reason_required';
  end if;

  select * into v_run from commission_runs where id = p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'paid' then raise exception 'already_paid'; end if;
  if v_run.status <> 'approved' then raise exception 'not_approved'; end if;

  update commission_runs
     set status = 'draft', approved_by = null, approved_at = null
   where id = p_run_id;

  insert into audit_log (role, actor_text, action, ref)
  values ('principal', (select name from app_users where id = auth.uid()),
          format('Commission month REOPENED - %s %s/%s - %s',
                 v_run.program, v_run.month, v_run.year, btrim(p_reason)),
          p_run_id::text);
end;
$function$;

-- create_rental_agreement(p_plan_id uuid, p_customer_name text, p_customer_phone text, p_customer_email text, p_customer_address text, p_dealer_id uuid, p_salesperson_id uuid, p_start_date date, p_notes text, p_delivery_date date, p_signature_path text, p_signed_name text, p_signed_nric text)
--   0558: nullif(trim(coalesce(p_customer_address, v_customer.address, '')), '') IS NULL
--   0558: coalesce(trim(p_customer_name), '') = ''
CREATE OR REPLACE FUNCTION public.create_rental_agreement(p_plan_id uuid, p_customer_name text, p_customer_phone text, p_customer_email text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text, p_dealer_id uuid DEFAULT NULL::uuid, p_salesperson_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_signature_path text DEFAULT NULL::text, p_signed_name text DEFAULT NULL::text, p_signed_nric text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role        text := (SELECT auth.jwt()->'app_metadata'->>'role');
  v_jwt_dealer  uuid := (SELECT public.app_dealer_id());
  v_dealer_id   uuid;
  v_phone_key   text;
  v_today       date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_start       date;
  v_plan        rental_plans;
  v_customer    customers;
  v_agreement   rental_agreements;
  v_order       orders;
  v_channel     text;
  v_contract    numeric(12,2);
  -- 0279
  v_template    jsonb;
  v_sig_path    text := nullif(btrim(coalesce(p_signature_path, '')), '');
  v_sig_name    text := nullif(btrim(coalesce(p_signed_name, '')), '');
  v_sig_nric    text := nullif(btrim(coalesce(p_signed_nric, '')), '');
BEGIN
  IF v_role IS NULL OR v_role NOT IN
     ('dealer','salesperson','showroom','bd','principal','operation','finance') THEN
    RAISE EXCEPTION 'Role cannot sell rental plans'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  v_dealer_id := coalesce(v_jwt_dealer, p_dealer_id);

  -- 0275: a rental now produces a Sales Order, and an order belongs to a store.
  IF v_dealer_id IS NULL THEN
    RAISE EXCEPTION 'A rental must be sold through a store - pick the store first'
      USING errcode = 'P0001', detail = 'dealer_required';
  END IF;

  -- 0279: the signature, checked BEFORE anything is written. "No signature, no
  -- order" (Loo, locked) — so there is no half-made application to clean up.
  IF v_sig_path IS NULL THEN
    RAISE EXCEPTION 'The customer must sign before a rental can be submitted'
      USING errcode = 'P0001', detail = 'signature_required';
  END IF;
  -- The API writes this key itself with the service client (a store JWT fails
  -- the bucket's is_internal() INSERT policy, so a client-side upload is
  -- structurally impossible). Refuse anything not in that bucket.
  IF v_sig_path NOT LIKE 'rental-agreements/%' THEN
    RAISE EXCEPTION 'Signature is not stored in the agreements bucket'
      USING errcode = 'P0001', detail = 'invalid_signature_path';
  END IF;
  IF v_sig_name IS NULL THEN
    RAISE EXCEPTION 'Who signed? A name is required alongside the signature'
      USING errcode = 'P0001', detail = 'signed_name_required';
  END IF;

  -- 0279: WHICH paper was signed. Resolved here so the contract records the
  -- exact version, and refused by name when Loo has not published wording yet —
  -- a rental cannot be signed against a document that does not exist.
  v_template := public.rental_current_agreement_template();
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'No rental agreement wording is published - author it in Admin > Rental > Agreements first'
      USING errcode = 'P0001', detail = 'no_agreement_template';
  END IF;

  IF coalesce(p_customer_name, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'Customer name is required'
      USING errcode = 'P0001', detail = 'invalid_customer';
  END IF;

  v_phone_key := public.pwp_phone_key(p_customer_phone);
  IF coalesce(v_phone_key, '') = '' THEN
    RAISE EXCEPTION 'Customer phone has no usable digits'
      USING errcode = 'P0001', detail = 'invalid_phone';
  END IF;

  v_start := coalesce(p_start_date, v_today);
  IF v_start < v_today - 7 OR v_start > v_today + 180 THEN
    RAISE EXCEPTION 'Start date out of range'
      USING errcode = 'P0001', detail = 'invalid_start_date';
  END IF;

  SELECT * INTO v_plan FROM rental_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental plan not found'
      USING errcode = 'P0001', detail = 'plan_not_found';
  END IF;
  IF NOT v_plan.active THEN
    RAISE EXCEPTION 'Rental plan is not active'
      USING errcode = 'P0001', detail = 'plan_inactive';
  END IF;
  -- CF `rental-combo-agreement-sku-null`: a combo plan carries no sku and
  -- `rental_agreements.sku` is NOT NULL, so it would blow up mid-transaction
  -- with a constraint error nobody can read. Refuse it up front instead.
  IF coalesce(v_plan.sku, '') = '' THEN
    RAISE EXCEPTION 'That rental plan has no SKU to deliver (combo plans are not sellable yet)'
      USING errcode = 'P0001', detail = 'plan_has_no_sku';
  END IF;

  IF p_salesperson_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM salespersons s WHERE s.id = p_salesperson_id) THEN
    RAISE EXCEPTION 'Unknown salesperson'
      USING errcode = 'P0001', detail = 'invalid_salesperson';
  END IF;

  INSERT INTO customers (name, phone, phone_key, email, address, created_by)
  VALUES (
    trim(p_customer_name),
    trim(p_customer_phone),
    v_phone_key,
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_customer_address, '')), ''),
    auth.uid()
  )
  ON CONFLICT (phone_key) DO UPDATE
    SET email      = coalesce(customers.email,   excluded.email),
        address    = coalesce(customers.address, excluded.address),
        updated_at = now()
  RETURNING * INTO v_customer;

  INSERT INTO rental_agreements (
    customer_id, dealer_id, salesperson_id, plan_id,
    sku, term_months, monthly_fee, supplier_rate_pct, commission_base_pct,
    start_date, status, notes, created_by, included_package_id,
    -- 0279 — the evidence. `created_by` above is the staff member who witnessed
    -- it, so the witness needs no column of its own.
    signed_at, signed_name, signed_nric, signature_path,
    template_id, template_version
  ) VALUES (
    v_customer.id, v_dealer_id, p_salesperson_id, v_plan.id,
    v_plan.sku, v_plan.term_months, v_plan.monthly_fee,
    v_plan.supplier_rate_pct, v_plan.commission_base_pct,
    v_start, 'pending_approval', nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(), v_plan.included_package_id,
    now(), v_sig_name, v_sig_nric, v_sig_path,
    (v_template->>'id')::uuid, (v_template->>'version')::integer
  )
  RETURNING * INTO v_agreement;

  v_contract := round(v_plan.monthly_fee * v_plan.term_months, 2);
  v_channel  := coalesce((SELECT channel FROM dealers WHERE id = v_dealer_id), 'dealer');

  -- the Sales Order. Born 'place'; it reaches operations only when finance
  -- approves (rental_approve_agreement proceeds it), which is the locked flow.
  INSERT INTO orders (
    dealer_id, channel, salesperson_id, status,
    customer_name, customer_phone, customer_address, customer_address_unknown,
    delivery_date, delivery_date_tbd,
    paid, terms_accepted, source_system
  ) VALUES (
    v_dealer_id, v_channel, p_salesperson_id, 'place',
    v_customer.name, v_customer.phone,
    nullif(trim(coalesce(p_customer_address, v_customer.address, '')), ''),
    coalesce(coalesce(p_customer_address, v_customer.address, '') !~ '[^[:space:]]', true),
    p_delivery_date, p_delivery_date IS NULL,
    -- Nothing is paid at signing: month 1 is collected by Stripe after approval.
    -- 0279: terms_accepted is now TRUE and it is the truth — the customer signed
    -- the wording resolved above, in this same transaction.
    0, true, 'rental'
  )
  RETURNING * INTO v_order;

  -- ONE line: the thing to deliver. Priced ZERO on purpose (see the header) --
  -- the rental terms ride in attrs so the paperwork can print them without any
  -- of it reaching a total.
  INSERT INTO order_lines (order_id, sku, qty, unit_price, attrs)
  VALUES (
    v_order.id, v_plan.sku, 1, 0,
    jsonb_build_object(
      'rental', jsonb_build_object(
        'agreementId',   v_agreement.id,
        'agreementNo',   v_agreement.agreement_no,
        'planId',        v_plan.id,
        'termMonths',    v_plan.term_months,
        'monthlyFee',    v_plan.monthly_fee,
        'contractTotal', v_contract
      ),
      'remark', 'Rental ' || v_agreement.agreement_no || ' - RM'
                || trim(to_char(v_plan.monthly_fee, 'FM999999990.00')) || '/mo x '
                || v_plan.term_months || ' months = RM'
                || trim(to_char(v_contract, 'FM999999990.00'))
    )
  );

  UPDATE rental_agreements SET order_id = v_order.id, updated_at = now()
   WHERE id = v_agreement.id
   RETURNING * INTO v_agreement;

  -- 0279: this line already claimed "signed". Now it names WHO and WHICH paper,
  -- so the order timeline carries the evidence too.
  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    v_order.id,
    'Rental ' || v_agreement.agreement_no || ' signed by ' || v_sig_name
      || ' (' || coalesce(v_template->>'name', 'agreement') || ' v'
      || (v_template->>'version') || ') - awaiting finance credit approval',
    (SELECT public.app_role())
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'pos-rental:' || v_role, 'rental.agreement_submitted',
          v_dealer_id, v_agreement.agreement_no);

  RETURN jsonb_build_object(
    'agreement',       to_jsonb(v_agreement),
    'customer',        to_jsonb(v_customer),
    'unit',            NULL,
    'entitlementId',   NULL,
    'visitsTotal',     0,
    'pendingApproval', true,
    'orderId',         v_order.id,
    'so',              v_order.so
  );
END;
$function$;

-- dealer_invite(p_name text, p_region text, p_contact text)
--   0558: btrim(p_contact) = ''
--   0558: btrim(p_region) = ''
--   0558: btrim(p_name) = ''
CREATE OR REPLACE FUNCTION public.dealer_invite(p_name text, p_region text, p_contact text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dealer    dealers;
  v_approval  approvals;
  v_existing  dealers;
  v_actor     text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;

  if p_name is null or coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'name required' using errcode = '22023', detail = 'name_missing';
  end if;
  if p_region is null or coalesce(p_region, '') !~ '[^[:space:]]' then
    raise exception 'region required' using errcode = '22023', detail = 'region_missing';
  end if;
  if p_contact is null or coalesce(p_contact, '') !~ '[^[:space:]]' then
    raise exception 'contact required' using errcode = '22023', detail = 'contact_missing';
  end if;

  -- Idempotency check: same name + region in pending status returns existing record.
  select * into v_existing
    from dealers
   where status = 'pending'
     and lower(btrim(name)) = lower(btrim(p_name))
     and lower(btrim(region)) = lower(btrim(p_region))
   limit 1;

  if found then
    select * into v_approval
      from approvals
     where kind = 'new_dealer'
       and refers_to = v_existing.id::text
       and status = 'pending'
     limit 1;

    return jsonb_build_object(
      'dealer',   row_to_json(v_existing),
      'approval', row_to_json(v_approval),
      'idempotent', true
    );
  end if;

  insert into dealers (name, region, contact, status)
  values (btrim(p_name), btrim(p_region), btrim(p_contact), 'pending')
  returning * into v_dealer;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Principal');
  insert into approvals (kind, title, actor, refers_to, dealer_id, status, created_by)
  values (
    'new_dealer',
    format('New dealer application · %s', v_dealer.name),
    'HQ · ' || v_actor,
    v_dealer.id::text,
    v_dealer.id,
    'pending',
    auth.uid()
  )
  returning * into v_approval;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('principal', v_actor, format('Invited dealer · %s', v_dealer.name), v_dealer.id, v_dealer.id::text);

  return jsonb_build_object(
    'dealer',   row_to_json(v_dealer),
    'approval', row_to_json(v_approval),
    'idempotent', false
  );
end;
$function$;

-- delivery_handover_record(p_do_id uuid, p_kind text, p_receiver_name text, p_vehicle text, p_goods jsonb, p_note text, p_proof_path text, p_unit_codes text[], p_evidence jsonb)
--   0558: btrim(p_proof_path) = ''
--   0558: btrim(p_receiver_name) = ''
--   0558: coalesce(btrim(v_evd->>'path'),'') = ''
CREATE OR REPLACE FUNCTION public.delivery_handover_record(p_do_id uuid, p_kind text, p_receiver_name text DEFAULT NULL::text, p_vehicle text DEFAULT NULL::text, p_goods jsonb DEFAULT NULL::jsonb, p_note text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text, p_unit_codes text[] DEFAULT NULL::text[], p_evidence jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role      app_role;
  v_uid       uuid;
  v_warehouse_id uuid;
  v_do        ops_delivery_orders;
  v_duty      text;
  v_company   text;
  v_counter   text;
  v_row       delivery_handover_events;
  v_line      text;
  v_items     uuid[];
  v_bad       text;
  v_party     uuid;
  v_prev_party uuid;
  v_required  int;
  v_accepted  int;
  v_n         int;
  v_evd        jsonb;
  v_first_path text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal','warehouse') then
    raise exception 'forbidden: only operation, principal or a warehouse login records a handover fact'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_kind is null or p_kind not in
     ('ready_for_handover','handed_over','received_by_logistics') then
    raise exception '% is not a handover fact this door records', coalesce(p_kind,'null')
      using errcode = '22023', detail = 'bad_kind';
  end if;
  -- Warehouse records physical Warehouse acts only — never the counterparty's
  -- receipt, never a Delivery Result (card §9).
  if v_role = 'warehouse' then
    if p_kind = 'received_by_logistics' then
      raise exception 'forbidden: logistics receipt is the receiving party''s own fact'
        using errcode = '42501', detail = 'forbidden';
    end if;
    v_warehouse_id := public.app_warehouse_id();
    if v_warehouse_id is null then
      raise exception 'forbidden: this warehouse login is not bound to a warehouse'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;
  if p_goods is not null and jsonb_typeof(p_goods) <> 'array' then
    raise exception 'goods must be a list of {sku, qty}'
      using errcode = '22023', detail = 'bad_goods';
  end if;

  -- 0440 — MANY evidence files per act, each named {path, kind}. New files
  -- append; nothing here can overwrite or drop an earlier file.
  if p_evidence is not null then
    if jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) > 20 then
      raise exception 'evidence must be a list of at most 20 files'
        using errcode = '22023', detail = 'bad_evidence';
    end if;
    for v_evd in select value from jsonb_array_elements(p_evidence) loop
      if coalesce(v_evd->>'path', '') !~ '[^[:space:]]'
         or coalesce(v_evd->>'kind','') not in ('photo','video') then
        raise exception 'each evidence file names its path and its kind (photo or video)'
          using errcode = '22023', detail = 'bad_evidence';
      end if;
    end loop;
    if (select count(distinct value->>'path') from jsonb_array_elements(p_evidence))
       <> jsonb_array_length(p_evidence) then
      raise exception 'each evidence file is attached once'
        using errcode = '22023', detail = 'duplicate_evidence';
    end if;
    if jsonb_array_length(p_evidence) > 0 then
      v_first_path := btrim(p_evidence->0->>'path');
    end if;
  end if;

  select * into v_do from ops_delivery_orders where id = p_do_id for update;
  if v_do.id is null then
    raise exception 'delivery order not found'
      using errcode = '42P01', detail = 'delivery_order_not_found';
  end if;
  if v_do.voided_at is not null then
    raise exception 'this delivery order was cancelled — a cancelled document has no handover'
      using errcode = 'P0001', detail = 'delivery_order_voided';
  end if;

  -- `ready_for_handover` and `received_by_logistics` stay once-per-document.
  if p_kind <> 'handed_over' and exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = p_kind) then
    raise exception 'this fact is already recorded on % — history is never rewritten', v_do.do_number
      using errcode = 'P0001', detail = 'handover_fact_already_recorded';
  end if;
  if p_kind = 'received_by_logistics' and not exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = 'handed_over') then
    raise exception 'logistics receipt is confirmed only after a handover is recorded'
      using errcode = 'P0001', detail = 'handover_out_of_order';
  end if;

  if p_kind = 'handed_over' then
    if p_receiver_name is null or coalesce(p_receiver_name, '') !~ '[^[:space:]]' then
      raise exception 'a handover names the person who actually received the goods'
        using errcode = '22023', detail = 'receiver_required';
    end if;
    if (p_proof_path is null or coalesce(p_proof_path, '') !~ '[^[:space:]]') and v_first_path is null then
      raise exception 'a handover carries its proof — photos or videos of the loaded goods'
        using errcode = '22023', detail = 'proof_required';
    end if;

    -- The batch names its exact Units, and the document must carry a scope.
    select count(*) into v_required
      from delivery_order_units where delivery_order_id = p_do_id;
    if v_required = 0 then
      raise exception '% has no recorded exact-Unit scope — its scope must exist before goods leave', v_do.do_number
        using errcode = 'P0001', detail = 'exact_units_not_recorded';
    end if;
    if p_unit_codes is null or array_length(p_unit_codes, 1) is null then
      raise exception 'a handover names the exact Unit IDs it moves'
        using errcode = '22023', detail = 'units_required';
    end if;
    select count(distinct c.code) into v_n from unnest(p_unit_codes) c(code);
    if v_n <> array_length(p_unit_codes, 1) then
      raise exception 'a Unit appears twice in this batch — each Unit is accepted once'
        using errcode = 'P0001', detail = 'duplicate_unit_in_batch';
    end if;

    -- Every code is a Unit of THIS scope, at the caller's Site for a
    -- warehouse login, still with a warehouse-side holder, and not yet
    -- accepted. The Units are locked first (FOR UPDATE cannot ride an
    -- aggregate) so a concurrent batch cannot double-move them.
    perform 1
      from ops_stock_items i
      join delivery_order_units u
        on u.delivery_order_id = p_do_id and u.item_id = i.id
     where i.unit_code = any(p_unit_codes)
     for update of i;
    select array_agg(i.id) into v_items
      from unnest(p_unit_codes) c(code)
      join ops_stock_items i on i.unit_code = c.code
      join delivery_order_units u
        on u.delivery_order_id = p_do_id and u.item_id = i.id
     where v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id;
    if coalesce(array_length(v_items, 1), 0) <> array_length(p_unit_codes, 1) then
      select c.code into v_bad
        from unnest(p_unit_codes) c(code)
       where not exists (
         select 1 from ops_stock_items i
           join delivery_order_units u
             on u.delivery_order_id = p_do_id and u.item_id = i.id
          where i.unit_code = c.code
            and (v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id))
       limit 1;
      raise exception '% is not a Unit this delivery order requires at your Site', coalesce(v_bad, 'a Unit')
        using errcode = 'P0001', detail = 'unit_not_in_scope';
    end if;

    -- Already accepted for this scope? Refused, not silently reconciled —
    -- goods cannot physically leave twice.
    select i.unit_code into v_bad
      from delivery_handover_event_units eu
      join ops_stock_items i on i.id = eu.item_id
     where eu.delivery_order_id = p_do_id
       and eu.recorded_side = 'warehouse'
       and eu.item_id = any(v_items)
     limit 1;
    if v_bad is not null then
      raise exception '% was already handed over on % — a Unit is accepted once', v_bad, v_do.do_number
        using errcode = 'P0001', detail = 'unit_already_handed_over';
    end if;

    -- 0497: WHO HANDS IT OVER. A whole-order document (leg 0) and a Journey's
    -- first leg hand over FROM THE WAREHOUSE: a Unit already with a carrier is
    -- not there to hand over. A later leg (leg 2..n) hands over from the
    -- PREVIOUS leg's partner at its named warehouse (Delivery MASTER §4, §14.1):
    -- every Unit must be held by that partner's operating party — never by the
    -- Warehouse, never by another carrier.
    if coalesce(v_do.leg, 0) > 1 then
      select dp.operating_party_id into v_prev_party
        from ops_delivery_arrangements a
        join delivery_partners dp on dp.id = a.partner_id
       where a.order_id = v_do.order_id and a.leg = v_do.leg - 1;
      if v_prev_party is null then
        raise exception 'the previous leg has no Logistics Partner recorded — assign it first'
          using errcode = 'P0001', detail = 'previous_leg_partner_not_recorded';
      end if;
      select i.unit_code into v_bad
        from ops_stock_items i
       where i.id = any(v_items) and i.holder_party_id is distinct from v_prev_party
       limit 1;
      if v_bad is not null then
        raise exception '% is not with the previous leg''s partner — it cannot be handed over from there', v_bad
          using errcode = 'P0001', detail = 'unit_not_with_previous_leg';
      end if;
    else
      select i.unit_code into v_bad
        from ops_stock_items i
        join stock_operating_parties sop on sop.id = i.holder_party_id
       where i.id = any(v_items) and sop.kind = 'delivery_operator'
       limit 1;
      if v_bad is not null then
        raise exception '% is already with a delivery party — it is not at the Warehouse', v_bad
          using errcode = 'P0001', detail = 'unit_not_with_warehouse';
      end if;
    end if;

    -- The physical checkpoint: every Unit scanned, checked and packed.
    select i.unit_code into v_bad
      from unnest(v_items) t(item_id)
      join ops_stock_items i on i.id = t.item_id
     where (select count(distinct p.fact) from delivery_unit_prep p
             where p.delivery_order_id = p_do_id and p.item_id = t.item_id
               and p.fact in ('scanned','checked','packed')) < 3
     limit 1;
    if v_bad is not null then
      raise exception '% is not ready — scan, check and pack every Unit before the handover', v_bad
        using errcode = 'P0001', detail = 'prep_incomplete';
    end if;

    -- WHO HAS IT next: the governed Delivery operating party, resolved from
    -- the document's own partner assignment — never from client text.
    -- 0494: the DOCUMENT's own scope. A Journey leg's document (0491, `leg`
    -- 1..n) hands over to the LEG's partner — the arrangement keyed
    -- (order, leg) — never to the whole-order arrangement at leg 0. A
    -- whole-order document still reads leg 0 (its `leg` is 0).
    select dp.operating_party_id into v_party
      from ops_delivery_arrangements a
      join delivery_partners dp on dp.id = a.partner_id
     where a.order_id = v_do.order_id and a.leg = coalesce(v_do.leg, 0);
    if v_party is null then
      raise exception 'no goods-holder identity is recorded for this delivery''s partner — assign the Logistics Partner first'
        using errcode = 'P0001', detail = 'partner_holder_not_recorded';
    end if;
  end if;

  if p_kind = 'received_by_logistics' then
    v_duty    := 'logistics';
    v_company := v_do.logistics_partner;
    v_counter := null;
  else
    v_duty    := 'warehouse';
    if coalesce(v_do.leg, 0) > 1 then
      -- 0497: a later leg's handover is made by the PREVIOUS leg's partner.
      select dp.name into v_company
        from ops_delivery_arrangements a
        join delivery_partners dp on dp.id = a.partner_id
       where a.order_id = v_do.order_id and a.leg = v_do.leg - 1;
    else
      select w.name into v_company
        from orders o left join warehouses w on w.id = o.warehouse_id
       where o.id = v_do.order_id;
    end if;
    v_counter := case when p_kind = 'handed_over' then v_do.logistics_partner end;
  end if;

  insert into delivery_handover_events
    (delivery_order_id, kind, duty, company, counterparty, receiver_name,
     vehicle, goods, note, proof_path, recorded_by)
  values
    (p_do_id, p_kind, v_duty, v_company, v_counter,
     nullif(btrim(coalesce(p_receiver_name,'')),''),
     nullif(btrim(coalesce(p_vehicle,'')),''),
     p_goods,
     nullif(btrim(coalesce(p_note,'')),''),
     nullif(btrim(coalesce(p_proof_path, v_first_path, '')),''),
     v_uid)
  returning * into v_row;

  if p_evidence is not null and jsonb_array_length(p_evidence) > 0 then
    insert into delivery_handover_evidence
      (event_id, delivery_order_id, path, kind, recorded_by)
    select v_row.id, p_do_id, btrim(e.value->>'path'), e.value->>'kind', v_uid
      from jsonb_array_elements(p_evidence) e;
  end if;

  if p_kind = 'handed_over' then
    insert into delivery_handover_event_units
      (event_id, delivery_order_id, item_id, recorded_side)
    select v_row.id, p_do_id, t.item_id, 'warehouse' from unnest(v_items) t(item_id);

    -- Only the accepted Units change WHO HAS IT — in this same transaction.
    -- 0366's lineage trigger records each holder change append-only.
    update ops_stock_items
       set holder_party_id = v_party, updated_at = now()
     where id = any(v_items);

    select count(*) into v_accepted
      from delivery_handover_event_units
     where delivery_order_id = p_do_id and recorded_side = 'warehouse';
  end if;

  -- The Logistics receipt may name ITS OWN exact Units — the counterparty's
  -- statement, preserved beside the Warehouse's, changing no holder and
  -- overwriting nothing. The unmatched IDs are the two sides' difference.
  if p_kind = 'received_by_logistics'
     and p_unit_codes is not null and array_length(p_unit_codes, 1) is not null then
    select c.code into v_bad
      from unnest(p_unit_codes) c(code)
     where not exists (
       select 1 from ops_stock_items i
         join delivery_order_units u
           on u.delivery_order_id = p_do_id and u.item_id = i.id
        where i.unit_code = c.code)
     limit 1;
    if v_bad is not null then
      raise exception '% is not a Unit this delivery order requires', v_bad
        using errcode = 'P0001', detail = 'unit_not_in_scope';
    end if;
    insert into delivery_handover_event_units
      (event_id, delivery_order_id, item_id, recorded_side)
    select v_row.id, p_do_id, i.id, 'logistics'
      from unnest(p_unit_codes) c(code)
      join ops_stock_items i on i.unit_code = c.code
    on conflict (delivery_order_id, item_id, recorded_side) do nothing;
  end if;

  v_line := case p_kind
    when 'ready_for_handover' then
      'Goods ready for handover — ' || v_do.do_number
    when 'handed_over' then
      'Handed over ' || array_length(v_items, 1) || ' of ' || v_required
        || ' Units to ' || coalesce(v_do.logistics_partner, 'logistics')
        || ' — received by ' || btrim(p_receiver_name) || ' (' || v_do.do_number || ')'
    else
      'Logistics confirmed receipt — ' || v_do.do_number || ' is out for delivery'
  end;
  insert into order_history (order_id, text, by_role)
  values (v_do.order_id, v_line, v_role);

  return to_jsonb(v_row) || jsonb_build_object(
    'acceptedUnits', coalesce(v_accepted, 0),
    'requiredUnits', coalesce(v_required, 0));
end;
$function$;

-- delivery_leg_document_mint(p_order_id uuid, p_leg integer, p_do_number text)
--   0558: nullif(btrim(coalesce(p_do_number, '')), '') is null
CREATE OR REPLACE FUNCTION public.delivery_leg_document_mint(p_order_id uuid, p_leg integer, p_do_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order orders;
  v_arr ops_delivery_arrangements;
  v_stop jsonb;
  v_last int;
  v_row ops_delivery_orders;
begin
  if not (select public.is_operation()) then
    raise exception 'Only operation or principal may issue a Delivery Order' using errcode = '42501';
  end if;
  if coalesce(p_leg, 0) < 1 then
    raise exception 'a leg document names its leg' using errcode = '22023', detail = 'leg_required';
  end if;
  if coalesce(p_do_number, '') !~ '[^[:space:]]' then
    raise exception 'a document carries its number' using errcode = '22023', detail = 'do_number_required';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  select s into v_stop from jsonb_array_elements(coalesce(v_order.delivery_stops, '[]'::jsonb)) s where (s->>'leg')::int = p_leg;
  if v_stop is null then
    raise exception 'leg % is not on this order''s Delivery Journey', p_leg using errcode = '22023', detail = 'leg_not_on_journey';
  end if;
  select coalesce(max((s->>'leg')::int), 0) into v_last from jsonb_array_elements(coalesce(v_order.delivery_stops, '[]'::jsonb)) s;
  select * into v_arr from ops_delivery_arrangements where order_id = p_order_id and leg = p_leg;
  if not found or v_arr.partner_id is null or v_arr.confirmed_date is null then
    raise exception 'the leg needs its Logistics Partner and its agreed day before a document issues'
      using errcode = '22023', detail = 'leg_not_arranged';
  end if;
  select * into v_row from ops_delivery_orders where order_id = p_order_id and leg = p_leg and voided_at is null;
  if found then
    return to_jsonb(v_row);
  end if;
  insert into ops_delivery_orders (order_id, do_number, leg, trip_groups, delivery_date, time_slot, logistics_partner, issued_by)
  values (p_order_id, upper(btrim(p_do_number)), p_leg, null, v_arr.confirmed_date, v_arr.confirmed_time,
          (select p.name from delivery_partners p where p.id = v_arr.partner_id), auth.uid())
  returning * into v_row;
  -- The customer-facing leg mirrors the active number for the legacy readers
  -- (0356's own rule: a split-trip door inserts directly and mirrors the number).
  if p_leg = v_last and v_order.do_number is null then
    update orders set do_number = v_row.do_number where id = p_order_id;
  end if;
  insert into order_history (order_id, text, by_role)
  values (p_order_id, format('%s issued for leg %s · %s → %s', v_row.do_number, p_leg, coalesce(v_stop->>'from_loc', ''), coalesce(v_stop->>'to_loc', '')), (select public.app_role()));
  return to_jsonb(v_row);
end;
$function$;

-- delivery_payment_approval_decide(p_id uuid, p_decision text, p_reason text)
--   0558: btrim(p_reason) = ''
CREATE OR REPLACE FUNCTION public.delivery_payment_approval_decide(p_id uuid, p_decision text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row order_delivery_payment_approvals;
begin
  perform public.delivery_payment_approver_gate();

  if p_id is null
     or p_decision is null
     or p_decision not in ('approved', 'refused') then
    raise exception 'the decision is approved or refused'
      using errcode = '22023', detail = 'invalid_decision';
  end if;
  if p_reason is null or coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'the decision records the approver''s reason — black and white'
      using errcode = '22023', detail = 'reason_required';
  end if;

  -- Lock the row so two clicks cannot both believe they decided it.
  select * into v_row
    from order_delivery_payment_approvals
   where id = p_id
     for update;

  if v_row.id is null then
    raise exception 'payment approval request not found'
      using errcode = '42P01', detail = 'payment_approval_not_found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'this request is already decided — a decision is never re-decided'
      using errcode = 'P0001', detail = 'already_decided';
  end if;

  update order_delivery_payment_approvals
     set status          = p_decision,
         decided_at      = now(),
         decided_by      = auth.uid(),
         decision_reason = btrim(p_reason)
   where id = p_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

-- delivery_payment_approval_request(p_order_id uuid, p_reason text)
--   0558: btrim(p_reason) = ''
CREATE OR REPLACE FUNCTION public.delivery_payment_approval_request(p_order_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role app_role;
  v_row  order_delivery_payment_approvals;
  v_so   int;
begin
  -- Operation and the salesperson raise (card §2); principal may too — the
  -- boss asking is not forbidden by a rule about who must ask.
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'salesperson', 'principal') then
    raise exception 'forbidden: operation or the salesperson raises a payment approval request'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_order_id is null or p_reason is null or coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'an order and a reason are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- One request at a time: a second ask while one waits would only split the
  -- approver's queue. Raising again AFTER a refusal is allowed — it is a new
  -- request, and the refused row stays as history.
  if exists (
    select 1 from order_delivery_payment_approvals a
     where a.order_id = p_order_id and a.status = 'pending'
  ) then
    raise exception 'a payment approval request is already waiting for the approver'
      using errcode = 'P0001', detail = 'request_already_pending';
  end if;

  insert into order_delivery_payment_approvals (order_id, request_reason, requested_by)
  values (p_order_id, btrim(p_reason), auth.uid())
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

-- delivery_proof_review(p_do_number text, p_attempt_id uuid, p_decision text, p_reason text, p_expected_evidence_at timestamp with time zone, p_idempotency_key uuid)
--   0558: nullif(btrim(coalesce(p_reason, '')), '') is null
CREATE OR REPLACE FUNCTION public.delivery_proof_review(p_do_number text, p_attempt_id uuid, p_decision text, p_reason text, p_expected_evidence_at timestamp with time zone, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_doc ops_delivery_orders;
  v_existing delivery_proof_reviews;
  v_row delivery_proof_reviews;
  v_latest_evidence timestamptz;
  v_word text;
begin
  if not (select public.is_operation()) then
    raise exception 'Only operation or principal may review delivery proof' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'A proof review retry key is required'
      using errcode = '22023', detail = 'idempotency_required';
  end if;

  select * into v_existing
    from delivery_proof_reviews
   where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.do_number = upper(p_do_number)
       and v_existing.attempt_id is not distinct from p_attempt_id
       and v_existing.decision = p_decision
       and v_existing.reason is not distinct from nullif(btrim(coalesce(p_reason, '')), '')
       and v_existing.source_version is not distinct from p_expected_evidence_at then
      return to_jsonb(v_existing);
    end if;
    raise exception 'That proof review retry key was already used for another result'
      using errcode = '22023', detail = 'idempotency_conflict';
  end if;

  select * into v_doc from ops_delivery_orders where do_number = upper(p_do_number);
  if not found then
    raise exception 'Delivery order not found' using errcode = 'P0002';
  end if;
  perform 1 from orders where id = v_doc.order_id for update;

  if p_decision not in ('accepted', 'more_required', 'rejected') then
    raise exception 'a review is Proof Accepted, More Proof Required or Proof Rejected'
      using errcode = '22023', detail = 'bad_decision';
  end if;
  if p_decision <> 'accepted' and coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'say why more proof is needed, or why it is rejected'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if p_attempt_id is not null and not exists (
    select 1 from delivery_attempts where id = p_attempt_id and do_number = v_doc.do_number
  ) then
    raise exception 'that delivery attempt does not belong to this document'
      using errcode = '22023', detail = 'attempt_mismatch';
  end if;

  select max(candidate.at) into v_latest_evidence
  from (
    select max(e.recorded_at) as at
      from delivery_attempt_evidence e
     where e.do_number = v_doc.do_number
    union all
    select max(o.do_uploaded_at) as at
      from orders o
     where o.id = v_doc.order_id
       and o.do_number = v_doc.do_number
       and o.do_file_path is not null
    union all
    select max(nullif(photo->>'at', '')::timestamptz) as at
     from ops_order_control c
      cross join lateral jsonb_array_elements(coalesce(c.delivery_photos, '[]'::jsonb)) photo
     where c.order_id = v_doc.order_id
       and btrim(coalesce(photo->>'doNumber', '')) = v_doc.do_number
  ) candidate;

  if v_latest_evidence is null then
    raise exception 'There is no delivery proof to review'
      using errcode = '22023', detail = 'proof_missing';
  end if;
  if p_expected_evidence_at is null or p_expected_evidence_at is distinct from v_latest_evidence then
    raise exception 'The delivery proof changed. Review the latest proof.'
      using errcode = '40001', detail = 'stale_proof_evidence';
  end if;

  insert into delivery_proof_reviews
    (order_id, do_number, attempt_id, decision, reason, reviewed_by, source_version, idempotency_key)
  values
    (v_doc.order_id, v_doc.do_number, p_attempt_id, p_decision,
     nullif(btrim(coalesce(p_reason, '')), ''), auth.uid(), v_latest_evidence, p_idempotency_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into v_row;

  -- Two identical retries can both pass the first read before either commit.
  -- The partial unique index chooses one writer; the other reads that result
  -- instead of appending a second review or surfacing a database error.
  if not found then
    select * into v_existing
      from delivery_proof_reviews
     where idempotency_key = p_idempotency_key;
    if v_existing.do_number = v_doc.do_number
       and v_existing.attempt_id is not distinct from p_attempt_id
       and v_existing.decision = p_decision
       and v_existing.reason is not distinct from nullif(btrim(coalesce(p_reason, '')), '')
       and v_existing.source_version is not distinct from p_expected_evidence_at then
      return to_jsonb(v_existing);
    end if;
    raise exception 'That proof review retry key was already used for another result'
      using errcode = '22023', detail = 'idempotency_conflict';
  end if;

  v_word := case p_decision
    when 'accepted' then 'Proof Accepted'
    when 'more_required' then 'More Proof Required'
    else 'Proof Rejected'
  end;
  insert into order_history (order_id, text, by_role)
  values (v_doc.order_id,
          format('%s · %s%s', v_doc.do_number, v_word,
                 case when v_row.reason is not null then ' — ' || v_row.reason else '' end),
          (select public.app_role()));
  return to_jsonb(v_row);
end;
$function$;

-- delivery_save_partner_driver(p_partner_id uuid, p_driver_id uuid, p_name text, p_phone text, p_active boolean)
--   0558: nullif(btrim(coalesce(p_name, '')), '') is null
CREATE OR REPLACE FUNCTION public.delivery_save_partner_driver(p_partner_id uuid, p_driver_id uuid, p_name text, p_phone text, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old partner_drivers;
  v_new partner_drivers;
begin
  perform public.delivery_settings_gate();
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'the driver name is required' using errcode = '22023', detail = 'name_required';
  end if;
  if not exists (select 1 from delivery_partners where id = p_partner_id) then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  if p_driver_id is not null then
    select * into v_old from partner_drivers where id = p_driver_id and partner_id = p_partner_id for update;
    if not found then
      raise exception 'driver template not found' using errcode = 'P0002';
    end if;
    update partner_drivers
       set name = btrim(p_name), phone = nullif(btrim(coalesce(p_phone, '')), ''), active = coalesce(p_active, true)
     where id = p_driver_id
     returning * into v_new;
  else
    insert into partner_drivers (partner_id, name, phone, active)
    values (p_partner_id, btrim(p_name), nullif(btrim(coalesce(p_phone, '')), ''), coalesce(p_active, true))
    returning * into v_new;
  end if;
  perform public.delivery_record_setting_change('partner_driver', p_partner_id, to_jsonb(v_old), to_jsonb(v_new));
  return to_jsonb(v_new);
end;
$function$;

-- delivery_save_partner_vehicle(p_partner_id uuid, p_vehicle_id uuid, p_plate text, p_vehicle_type text, p_capacity text, p_driver_name text, p_driver_phone text, p_active boolean)
--   0558: nullif(btrim(coalesce(p_vehicle_type, '')), '') is null
--   0558: nullif(btrim(coalesce(p_plate, '')), '') is null
CREATE OR REPLACE FUNCTION public.delivery_save_partner_vehicle(p_partner_id uuid, p_vehicle_id uuid, p_plate text, p_vehicle_type text, p_capacity text, p_driver_name text, p_driver_phone text, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old partner_fleet;
  v_new partner_fleet;
begin
  perform public.delivery_settings_gate();
  if coalesce(p_plate, '') !~ '[^[:space:]]' then
    raise exception 'the vehicle plate is required' using errcode = '22023', detail = 'plate_required';
  end if;
  if coalesce(p_vehicle_type, '') !~ '[^[:space:]]' then
    raise exception 'the vehicle type is required' using errcode = '22023', detail = 'vehicle_type_required';
  end if;
  if not exists (select 1 from delivery_partners where id = p_partner_id) then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  if p_vehicle_id is not null then
    select * into v_old from partner_fleet where id = p_vehicle_id and partner_id = p_partner_id for update;
    if not found then
      raise exception 'vehicle template not found' using errcode = 'P0002';
    end if;
    update partner_fleet
       set plate = btrim(p_plate), vehicle_type = btrim(p_vehicle_type),
           capacity = nullif(btrim(coalesce(p_capacity, '')), ''),
           driver_name = nullif(btrim(coalesce(p_driver_name, '')), ''),
           driver_phone = nullif(btrim(coalesce(p_driver_phone, '')), ''),
           active = coalesce(p_active, true)
     where id = p_vehicle_id
     returning * into v_new;
  else
    insert into partner_fleet (partner_id, plate, vehicle_type, capacity, driver_name, driver_phone, active)
    values (p_partner_id, btrim(p_plate), btrim(p_vehicle_type),
            nullif(btrim(coalesce(p_capacity, '')), ''),
            nullif(btrim(coalesce(p_driver_name, '')), ''),
            nullif(btrim(coalesce(p_driver_phone, '')), ''),
            coalesce(p_active, true))
    returning * into v_new;
  end if;
  perform public.delivery_record_setting_change('partner_vehicle', p_partner_id, to_jsonb(v_old), to_jsonb(v_new));
  return to_jsonb(v_new);
end;
$function$;

-- delivery_set_partner_details(p_partner_id uuid, p_name text, p_active boolean, p_customer_phone text, p_office_contact text, p_address text, p_whatsapp_group_url text)
--   0558: nullif(btrim(coalesce(p_name, '')), '') is null
CREATE OR REPLACE FUNCTION public.delivery_set_partner_details(p_partner_id uuid, p_name text, p_active boolean, p_customer_phone text, p_office_contact text, p_address text, p_whatsapp_group_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old delivery_partners;
  v_new delivery_partners;
begin
  perform public.delivery_settings_gate();
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'the partner name is required' using errcode = '22023', detail = 'name_required';
  end if;
  select * into v_old from delivery_partners where id = p_partner_id for update;
  if not found then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  update delivery_partners
     set name = btrim(p_name),
         active = coalesce(p_active, true),
         customer_phone = nullif(btrim(coalesce(p_customer_phone, '')), ''),
         office_contact = nullif(btrim(coalesce(p_office_contact, '')), ''),
         address = nullif(btrim(coalesce(p_address, '')), ''),
         whatsapp_group_url = nullif(btrim(coalesce(p_whatsapp_group_url, '')), '')
   where id = p_partner_id
   returning * into v_new;
  perform public.delivery_record_setting_change(
    'partner_details', p_partner_id,
    jsonb_build_object('name', v_old.name, 'active', v_old.active, 'customer_phone', v_old.customer_phone,
                       'office_contact', v_old.office_contact, 'address', v_old.address,
                       'whatsapp_group_url', v_old.whatsapp_group_url),
    jsonb_build_object('name', v_new.name, 'active', v_new.active, 'customer_phone', v_new.customer_phone,
                       'office_contact', v_new.office_contact, 'address', v_new.address,
                       'whatsapp_group_url', v_new.whatsapp_group_url));
  return jsonb_build_object('id', v_new.id);
end;
$function$;

-- delivery_template_save(p_template_key uuid, p_purpose text, p_channel text, p_name text, p_body text)
--   0558: nullif(btrim(coalesce(p_body, '')), '') is null
--   0558: nullif(btrim(coalesce(p_name, '')), '') is null
CREATE OR REPLACE FUNCTION public.delivery_template_save(p_template_key uuid, p_purpose text, p_channel text, p_name text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_prev delivery_message_templates;
  v_row delivery_message_templates;
  v_key uuid := coalesce(p_template_key, gen_random_uuid());
begin
  perform public.delivery_settings_gate();
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'the template name is required' using errcode = '22023', detail = 'name_required';
  end if;
  if coalesce(p_body, '') !~ '[^[:space:]]' then
    raise exception 'the template wording is required' using errcode = '22023', detail = 'body_required';
  end if;
  if p_template_key is not null then
    select * into v_prev from delivery_message_templates where template_key = p_template_key and is_head for update;
    if not found then
      raise exception 'template not found' using errcode = '22023', detail = 'template_not_found';
    end if;
    if v_prev.purpose <> p_purpose then
      raise exception 'a template keeps its purpose; make a new template instead'
        using errcode = '22023', detail = 'purpose_locked';
    end if;
    update delivery_message_templates set is_head = false, is_default = false where id = v_prev.id;
  end if;
  insert into delivery_message_templates
    (template_key, purpose, channel, name, body, version, active, is_default, is_head, created_by)
  values
    (v_key, p_purpose, coalesce(p_channel, 'whatsapp'), btrim(p_name), p_body,
     coalesce(v_prev.version, 0) + 1, coalesce(v_prev.active, true), coalesce(v_prev.is_default, false),
     true, auth.uid())
  returning * into v_row;
  perform public.delivery_record_setting_change('template:' || v_key, null, to_jsonb(v_prev), to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$function$;

-- delivery_trip_document_mint(p_order_id uuid, p_do_number text)
--   0558: nullif(btrim(coalesce(p_do_number, '')), '') is null
CREATE OR REPLACE FUNCTION public.delivery_trip_document_mint(p_order_id uuid, p_do_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order orders;
  v_ctl ops_order_control;
  v_trip int;
  v_row ops_delivery_orders;
begin
  if not (coalesce(auth.role() = 'service_role', false) or coalesce((select public.is_operation()), false)) then
    raise exception 'Only operation or principal may issue a Delivery Order' using errcode = '42501';
  end if;
  if coalesce(p_do_number, '') !~ '[^[:space:]]' then
    raise exception 'a document carries its number' using errcode = '22023', detail = 'do_number_required';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  select * into v_ctl from ops_order_control where order_id = p_order_id;
  if v_ctl.booking_groups is null or v_ctl.booking_stage is distinct from 'confirmed' or v_ctl.confirmed_date is null then
    raise exception 'a split trip needs its confirmed booking and its delivery groups before a document issues'
      using errcode = '22023', detail = 'trip_not_booked';
  end if;
  -- The order already carries this trip's number: the same paper back.
  if v_order.do_number is not null then
    select * into v_row from ops_delivery_orders where do_number = v_order.do_number;
    return to_jsonb(v_row);
  end if;
  -- The same trip, still live: the same paper back.
  select * into v_row from ops_delivery_orders
   where order_id = p_order_id and leg = 0 and voided_at is null
     and trip_groups is not distinct from v_ctl.booking_groups
   order by issued_at desc limit 1;
  if not found then
    select min(t) into v_trip from generate_series(1, 3) t
     where not exists (select 1 from ops_delivery_orders d
                        where d.order_id = p_order_id and d.leg = 0 and d.trip = t and d.voided_at is null);
    if v_trip is null then
      raise exception 'an order goes out on three trips at most'
        using errcode = '22023', detail = 'three_trips_at_most';
    end if;
    insert into ops_delivery_orders (order_id, do_number, leg, trip, trip_groups, delivery_date, time_slot, logistics_partner, issued_by)
    values (p_order_id, upper(btrim(p_do_number)), 0, v_trip, v_ctl.booking_groups, v_ctl.confirmed_date, v_ctl.confirmed_time_slot,
            (select p.name from delivery_partners p
              where p.id = coalesce(v_ctl.confirmed_partner_id, v_order.ops_assigned_logistic, v_order.delivery_partner_id)),
            auth.uid())
    returning * into v_row;
    insert into order_history (order_id, text, by_role)
    values (p_order_id, format('%s issued for trip %s · %s', v_row.do_number, v_trip, array_to_string(v_row.trip_groups, ', ')), (select public.app_role()));
  end if;
  -- The materialiser (0356) sees the row already exists and inserts nothing.
  update orders set do_number = v_row.do_number where id = p_order_id;
  return to_jsonb(v_row);
end;
$function$;

-- finance_exception_clear(p_id uuid, p_evidence text)
--   0558: btrim(p_evidence) = ''
CREATE OR REPLACE FUNCTION public.finance_exception_clear(p_id uuid, p_evidence text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role app_role;
  v_row  order_finance_exceptions;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'forbidden: only finance can clear a finance exception'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_id is null or p_evidence is null or coalesce(p_evidence, '') !~ '[^[:space:]]' then
    raise exception 'clear evidence is required to lift a finance exception'
      using errcode = '22023', detail = 'evidence_required';
  end if;

  -- Lock the row so two clicks cannot both believe they cleared it.
  select * into v_row
    from order_finance_exceptions
   where id = p_id
     for update;

  if v_row.id is null then
    raise exception 'finance exception not found'
      using errcode = '42P01', detail = 'finance_exception_not_found';
  end if;

  if v_row.status = 'cleared' then
    raise exception 'this finance exception is already cleared'
      using errcode = 'P0001', detail = 'already_cleared';
  end if;

  update order_finance_exceptions
     set status         = 'cleared',
         cleared_at     = now(),
         cleared_by     = auth.uid(),
         clear_evidence = btrim(p_evidence)
   where id = p_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

-- finance_exception_open(p_order_id uuid, p_reason text)
--   0558: btrim(p_reason) = ''
CREATE OR REPLACE FUNCTION public.finance_exception_open(p_order_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role app_role;
  v_row  order_finance_exceptions;
  v_so   int;
begin
  -- The same role gate every Phase 5 finance RPC uses. `principal` is admitted
  -- for the same reason it is admitted there: it is the go-live fallback while
  -- a dedicated finance account does not yet exist.
  v_role := public.app_role();
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'forbidden: only finance can open a finance exception'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_order_id is null or p_reason is null or coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'an order and a reason are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  insert into order_finance_exceptions (order_id, reason, opened_by)
  values (p_order_id, btrim(p_reason), auth.uid())
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

-- finance_party_create(p_name text, p_kind text, p_registration_no text, p_phone text, p_email text, p_address text, p_notes text)
--   0558: length(btrim(coalesce(p_name, ''))) = 0
CREATE OR REPLACE FUNCTION public.finance_party_create(p_name text, p_kind text, p_registration_no text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := public.app_role()::text;
  v_id   uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance adds a party.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'Type the party''s name.'
      using errcode = '22023', detail = 'name_missing';
  end if;
  if p_kind is null or p_kind not in ('company','person') then
    raise exception 'Choose whether the party is a company or a person.'
      using errcode = '22023', detail = 'kind_invalid';
  end if;
  begin
    insert into public.finance_parties
      (name, kind, registration_no, phone, email, address, notes, created_by, updated_by)
    values
      (btrim(p_name), p_kind,
       nullif(btrim(coalesce(p_registration_no, '')), ''),
       nullif(btrim(coalesce(p_phone, '')), ''),
       nullif(btrim(coalesce(p_email, '')), ''),
       nullif(btrim(coalesce(p_address, '')), ''),
       nullif(btrim(coalesce(p_notes, '')), ''),
       auth.uid(), auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'A party named % is already on the list.', btrim(p_name)
      using errcode = '22023', detail = 'party_exists';
  end;
  return v_id;
end;
$function$;

-- finance_party_update(p_party_id uuid, p_name text, p_kind text, p_registration_no text, p_phone text, p_email text, p_address text, p_notes text, p_is_active boolean)
--   0558: length(btrim(coalesce(p_name, ''))) = 0
CREATE OR REPLACE FUNCTION public.finance_party_update(p_party_id uuid, p_name text, p_kind text, p_registration_no text, p_phone text, p_email text, p_address text, p_notes text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role  text := public.app_role()::text;
  v_party public.finance_parties%rowtype;
  v_open  numeric(12,2);
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance edits a party.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select * into v_party from public.finance_parties where id = p_party_id for update;
  if not found then
    raise exception 'Party not found.'
      using errcode = 'P0002', detail = 'party_missing';
  end if;
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'Type the party''s name.'
      using errcode = '22023', detail = 'name_missing';
  end if;
  if p_kind is null or p_kind not in ('company','person') then
    raise exception 'Choose whether the party is a company or a person.'
      using errcode = '22023', detail = 'kind_invalid';
  end if;
  -- A party that still owes money cannot leave the list: its outstanding
  -- would stop being anybody's job.
  if v_party.is_active and p_is_active is false then
    select coalesce(sum(i.total_amount), 0)
           - coalesce((select sum(a.amount)
                         from public.other_receipt_allocations a
                         join public.other_receipts r on r.id = a.receipt_id
                         join public.other_debtor_invoices i2 on i2.id = a.invoice_id
                        where r.status = 'posted' and i2.status = 'issued'
                          and i2.party_id = p_party_id), 0)
      into v_open
      from public.other_debtor_invoices i
     where i.party_id = p_party_id and i.status = 'issued';
    if v_open > 0 then
      raise exception '% still owes %. A party with money outstanding stays on the list.',
        v_party.name, public.fin_rm(v_open)
        using errcode = 'P0001', detail = 'party_has_outstanding';
    end if;
  end if;
  begin
    update public.finance_parties
       set name            = btrim(p_name),
           kind            = p_kind,
           registration_no = nullif(btrim(coalesce(p_registration_no, '')), ''),
           phone           = nullif(btrim(coalesce(p_phone, '')), ''),
           email           = nullif(btrim(coalesce(p_email, '')), ''),
           address         = nullif(btrim(coalesce(p_address, '')), ''),
           notes           = nullif(btrim(coalesce(p_notes, '')), ''),
           is_active       = coalesce(p_is_active, v_party.is_active),
           updated_at      = now(),
           updated_by      = auth.uid()
     where id = p_party_id;
  exception when unique_violation then
    raise exception 'A party named % is already on the list.', btrim(p_name)
      using errcode = '22023', detail = 'party_exists';
  end;
  return p_party_id;
end;
$function$;

-- gl_customer_party_for_order(p_order_id uuid)
--   0558: nullif(btrim(coalesce(v_order.customer_phone, '')), '') is null
CREATE OR REPLACE FUNCTION public.gl_customer_party_for_order(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order     orders;
  v_phone_key text;
  v_id        uuid;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
  end if;

  v_phone_key := case
    when coalesce(v_order.customer_phone, '') !~ '[^[:space:]]' then null
    else public.pwp_phone_key(v_order.customer_phone)
  end;

  if v_phone_key is null or v_phone_key = '' then
    raise exception 'this order has no customer phone, so the payment cannot name a ledger party — add the phone to the order and record the payment again'
      using errcode = '22023', detail = 'customer_identity_required';
  end if;

  select c.id into v_id from customers c where c.phone_key = v_phone_key;
  if found then
    return v_id;
  end if;

  insert into customers (name, phone, phone_key, created_by)
  values (coalesce(nullif(btrim(v_order.customer_name), ''), 'Customer'),
          v_order.customer_phone, v_phone_key, auth.uid())
  on conflict (phone_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- Lost the race to a concurrent insert; the winner's row is the answer.
    select c.id into v_id from customers c where c.phone_key = v_phone_key;
  end if;
  if v_id is null then
    raise exception 'could not resolve a customer party for this order'
      using errcode = '22023', detail = 'customer_identity_required';
  end if;
  return v_id;
end;
$function$;

-- gl_money_move_reverse(p_move_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.gl_money_move_reverse(p_move_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.app_role()::text;
  v_m        public.gl_money_moves%rowtype;
  v_reversal uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance cancels a money move.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Type why the money move is cancelled.'
      using errcode = '22023', detail = 'reason_missing';
  end if;
  select * into v_m from public.gl_money_moves where id = p_move_id for update;
  if not found then
    raise exception 'That money move does not exist.'
      using errcode = 'P0002', detail = 'money_move_missing';
  end if;
  if v_m.status in ('reversed','cancelled') then
    raise exception 'Money move % is already %.', v_m.move_no, v_m.status
      using errcode = 'P0001', detail = 'money_move_ended';
  end if;

  if v_m.status = 'approved' then
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Reversing a posted money move takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;
    v_reversal := public.gl_reverse(v_m.gl_entry_id, btrim(p_reason));
  end if;

  update public.gl_money_moves
     set status            = case when v_reversal is null then 'cancelled' else 'reversed' end,
         reversal_entry_id = v_reversal,
         ended_by          = auth.uid(),
         ended_at          = now(),
         end_reason        = btrim(p_reason)
   where id = p_move_id;
  return p_move_id;
end;
$function$;

-- issue_record_action_result(p_issue_id uuid, p_action_id uuid, p_result_code text, p_result text, p_next_action jsonb)
--   0558: length(btrim(p_result)) < 3
CREATE OR REPLACE FUNCTION public.issue_record_action_result(p_issue_id uuid, p_action_id uuid, p_result_code text, p_result text, p_next_action jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_current public.issue_actions;
  v_duty jsonb;
  v_next public.issue_actions;
begin
  if v_uid is null or (public.app_role() is null or public.app_role() not in ('operation','principal')) then
    raise exception 'operation access required' using errcode = '42501';
  end if;
  if p_result_code is null or p_result_code not in ('accepted','rejected','proof_added','correction_confirmed','repair_confirmed','replacement_confirmed','answer_recorded') or (length(btrim(p_result)) < 3 or coalesce(p_result, '') !~ '[^[:space:]]') then
    raise exception 'a governed result is required' using errcode = '22023';
  end if;

  select * into v_current from public.issue_actions
   where id = p_action_id and issue_id = p_issue_id and status = 'open'
   for update;
  if not found then raise exception 'current action not found' using errcode = 'P0002'; end if;

  v_duty := public.workspace_resolve_duty(v_current.owner_rule, null);
  if nullif(v_duty->>'actor_user_id','')::uuid is distinct from v_uid
     and not public.is_operations_superuser(v_uid) then
    raise exception 'current Duty or cover must record this result' using errcode = '42501';
  end if;

  update public.issue_actions
     set status = case when p_next_action is null then 'completed' else 'replaced' end,
         result_code = p_result_code, result = btrim(p_result), completed_by = v_uid,
         completed_at = now(),
         normal_owner_id = nullif(v_duty->>'normal_user_id','')::uuid,
         cover_owner_id = nullif(v_duty->>'acting_user_id','')::uuid,
         assignment_id = null
   where id = v_current.id;

  if p_next_action is not null then
    insert into public.issue_actions
      (issue_id, sequence, trigger, owner_rule, action, recipient, required_result, due_on, opened_by)
    values (
      p_issue_id, v_current.sequence + 1,
      btrim(p_next_action->>'trigger'), p_next_action->>'ownerRule',
      btrim(p_next_action->>'action'), btrim(p_next_action->>'recipient'),
      btrim(p_next_action->>'requiredResult'), (p_next_action->>'dueOn')::date, v_uid
    ) returning * into v_next;
    update public.issue_actions set replaced_by = v_next.id where id = v_current.id;
  end if;

  insert into public.issue_timeline(issue_id, event_kind, summary, actor_id, payload)
  values (p_issue_id, 'action_result_recorded', btrim(p_result), v_uid,
    jsonb_build_object('action_id', v_current.id, 'result_code', p_result_code,
      'owner_rule', v_current.owner_rule,
      'normal_owner_id', v_duty->>'normal_user_id',
      'cover_owner_id', v_duty->>'acting_user_id',
      'next_action_id', v_next.id));

  update public.issues
     set status = case when p_next_action is null then 'waiting_review' else 'open' end,
         updated_at = now()
   where id = p_issue_id;
  return jsonb_build_object('action_id', v_current.id, 'next_action_id', v_next.id);
end
$function$;

-- office_receive_post(p_po_id text, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb, p_goods_received_at date, p_actual_site_id uuid, p_arrival_evidence jsonb, p_extra_lines jsonb, p_save_key uuid)
--   0558: length(btrim(coalesce(p_do_file_path, ''))) = 0
--   0558: length(btrim(coalesce(p_do_number, ''))) < 3
CREATE OR REPLACE FUNCTION public.office_receive_post(p_po_id text, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb, p_goods_received_at date DEFAULT NULL::date, p_actual_site_id uuid DEFAULT NULL::uuid, p_arrival_evidence jsonb DEFAULT NULL::jsonb, p_extra_lines jsonb DEFAULT NULL::jsonb, p_save_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid; v_po purchase_orders; v_valid jsonb; v_line jsonb;
  v_pol purchase_order_lines; v_payload jsonb := '[]'::jsonb;
  v_receipt_id uuid; v_grn_date date; v_counted int;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_prior warehouse_receipts; v_before uuid[]; v_result jsonb; v_linked int;
  v_ctx jsonb; v_extras jsonb; v_grn text; v_units int;
begin
  v_uid := auth.uid();

  -- The one authority: GRN Duty, its dated cover, or an Operations
  -- Superuser (0425). The trio is stored as evidence, never collapsed.
  v_ctx := public.receiving_require_post_authority();

  -- Idempotency: a retried Save with the same key returns the FIRST posting
  -- instead of minting a second GRN, a second Unit receipt or a second
  -- stock movement (owner instruction 2026-09-04 §5C).
  if p_save_key is not null then
    select * into v_prior from warehouse_receipts where save_key = p_save_key;
    if found then
      return jsonb_build_object(
        'receipt_id', v_prior.id, 'po_id', v_prior.po_id,
        'status', v_prior.status, 'grn_no', v_prior.grn_no,
        'already_saved', true);
    end if;
  end if;

  if (length(btrim(coalesce(p_do_number, ''))) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') then
    raise exception 'a DO number is required'
      using errcode = '22023', detail = 'do_number_required';
  end if;
  if coalesce(p_do_file_path, '') !~ '[^[:space:]]' then
    raise exception 'a photo of the signed DO is required'
      using errcode = '22023', detail = 'do_file_required';
  end if;

  v_grn_date := coalesce(p_goods_received_at, v_today_myt);
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received At cannot be in the future'
      using errcode = '22023', detail = 'received_date_future';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', p_po_id
      using errcode = '22023', detail = 'po_not_open';
  end if;
  if v_grn_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Goods Received At cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;
  if p_actual_site_id is not null and not exists (
    select 1 from warehouses where id = p_actual_site_id
  ) then
    raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
  end if;

  select * into v_prior from warehouse_receipts
   where po_id = p_po_id and status = 'submitted' limit 1;
  if found then
    raise exception 'the warehouse already filed a receiving for % (DO %) — check that one in instead',
                    p_po_id, coalesce(v_prior.do_number, '—')
      using errcode = 'P0001', detail = 'receipt_awaiting_review';
  end if;

  select * into v_prior from warehouse_receipts
   where po_id = p_po_id
     and lower(btrim(do_number)) = lower(btrim(p_do_number))
     and status <> 'voided'
   limit 1;
  if found then
    if v_prior.status = 'returned' then
      raise exception 'DO % was returned to the warehouse — reopen that receiving, do not file a new one',
                      btrim(p_do_number)
        using errcode = 'P0001', detail = 'do_returned_use_resubmit';
    else
      raise exception 'DO % was already received on % (session %)',
                      btrim(p_do_number),
                      to_char(v_prior.goods_received_at, 'DD Mon YY'), v_prior.id
        using errcode = 'P0001', detail = 'do_already_received';
    end if;
  end if;

  v_valid   := public.warehouse_receipt_validate_lines(p_po_id, p_lines, v_uid);
  v_counted := (v_valid->>'counted')::int;
  v_extras  := public.receiving_validate_session_extras(p_arrival_evidence, p_extra_lines);

  for v_line in select * from jsonb_array_elements(v_valid->'lines') loop
    select * into v_pol from purchase_order_lines
     where id = (v_line->>'id')::uuid and po_id = p_po_id;
    if not found then
      raise exception 'PO line % is gone — reload the purchase order and count again',
                      v_line->>'sku'
        using errcode = 'P0001', detail = 'po_line_not_found';
    end if;
    v_payload := v_payload || jsonb_build_array(jsonb_build_object(
      'id', v_line->>'id',
      'received_qty', v_pol.received_qty + coalesce((v_line->>'received_now')::int, 0),
      'damaged_qty', coalesce((v_line->>'damaged_qty')::int, 0),
      'wrong_item_qty', coalesce((v_line->>'wrong_item_qty')::int, 0),
      'wrong_item_claim_type', v_line->>'wrong_item_claim_type',
      'damaged_photos', coalesce(v_line->'damaged_photos', '[]'::jsonb),
      'wrong_item_photos', coalesce(v_line->'wrong_item_photos', '[]'::jsonb),
      'units', coalesce(v_line->'units', '[]'::jsonb)));
  end loop;

  insert into warehouse_receipts (
    po_id, warehouse_id, do_number, do_file_path, note, lines,
    goods_received_at, submitted_from, status,
    submitted_by, submitted_at, posted_by, posted_at,
    reviewed_by, reviewed_at,
    actual_site_id, save_key, arrival_evidence, extra_lines,
    posted_duty_holder, posted_duty_cover, posted_authority,
    po_status_before, sup_status_before
  ) values (
    p_po_id, v_po.warehouse_id, btrim(p_do_number), btrim(p_do_file_path),
    nullif(btrim(coalesce(p_note, '')), ''), v_valid->'lines',
    v_grn_date, 'office', 'posted',
    v_uid, now(), v_uid, now(),
    v_uid, now(),
    p_actual_site_id, p_save_key,
    v_extras->'arrival_evidence', v_extras->'extra_lines',
    nullif(v_ctx->>'normal_user_id','')::uuid,
    nullif(v_ctx->>'acting_user_id','')::uuid,
    case when coalesce((v_ctx->>'is_superuser')::boolean, false)
              and v_uid is distinct from nullif(v_ctx->>'actor_user_id','')::uuid
         then 'superuser'
         when coalesce((v_ctx->>'is_cover')::boolean, false)
              and v_uid = nullif(v_ctx->>'acting_user_id','')::uuid
         then 'cover'
         else 'grn_duty' end,
    v_po.status, v_po.sup_status::text
  ) returning id into v_receipt_id;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_before
    from supplier_claims where po_id = p_po_id;

  v_result := public.operation_receive_po_with_do(
    p_po_id, btrim(p_do_file_path), btrim(p_do_number), v_payload, p_actual_site_id);

  update supplier_claims
     set warehouse_receipt_id = v_receipt_id
   where po_id = p_po_id and not (id = any(v_before))
     and warehouse_receipt_id is null;
  get diagnostics v_linked = row_count;

  -- The formal GRN number exists from the posted session (MASTER §7.3),
  -- drawn from the one daily formal-document pool (0381).
  v_grn := public.allocate_formal_document_code('GRN', v_receipt_id::text);
  update warehouse_receipts set grn_no = v_grn where id = v_receipt_id;

  v_units := public.receiving_record_unit_results(v_receipt_id, v_valid->'lines');

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (v_receipt_id, 'posted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'units_counted', v_counted,
                             'entry_source', 'office',
                             'claims_linked', v_linked,
                             'grn_no', v_grn,
                             'actual_site_id', p_actual_site_id,
                             'unit_results', v_units,
                             'extra_lines', jsonb_array_length(coalesce(v_extras->'extra_lines','[]'::jsonb)),
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Received %s unit%s against DO %s · %s',
                 v_counted, case when v_counted = 1 then '' else 's' end,
                 btrim(p_do_number), v_grn),
          public.app_role(), v_uid);

  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Checked in %s (DO %s, %s unit%s) · %s', p_po_id, btrim(p_do_number),
                 v_counted, case when v_counted = 1 then '' else 's' end, v_grn),
          p_po_id);

  return jsonb_build_object('receipt_id', v_receipt_id, 'po_id', p_po_id,
                            'status', 'posted', 'grn_no', v_grn,
                            'units_counted', v_counted,
                            'claims_linked', v_linked, 'receive', v_result);
end;
$function$;

-- operation_abandon_order(p_order_id uuid, p_reason text)
--   0558: btrim(p_reason) = ''
CREATE OR REPLACE FUNCTION public.operation_abandon_order(p_order_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order orders;
  v_actor text;
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  if p_reason is null or coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.status <> 'proceed_order' then
    raise exception 'order is not in proceed_order state'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  -- Release any reservation only when the order had stock reserved (i.e. it
  -- was past awaiting_stock). proceed_request / awaiting_stock orders never
  -- held a reserve, so no release is needed for them. Helper clamps with
  -- GREATEST(0, ...) so legacy zero-reserve rows are safe.
  if v_order.operation_stage in ('ready_to_dispatch', 'dispatched') then
    perform public._operation_release_order_reserve(p_order_id);
  end if;

  -- See 0019 top-of-file note: operation_stage enum lacks 'cancelled', so
  -- we clear it to NULL. orders.status='cancelled' is the source of truth.
  update orders
     set status          = 'cancelled',
         operation_stage = null,
         updated_at      = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('Order abandoned · %s', p_reason),
    'operation'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('operation', v_actor,
          format('Abandoned DL-%s · %s', v_order.so, p_reason),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'id',              v_order.id,
    'so',              v_order.so,
    'status',          'cancelled',
    'operation_stage', null
  );
end;
$function$;

-- operation_add_annotation(p_order_id uuid, p_content text, p_tag text)
--   0558: length(trim(p_content)) = 0
CREATE OR REPLACE FUNCTION public.operation_add_annotation(p_order_id uuid, p_content text, p_tag text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role    text;
  v_user_id uuid;
  v_row     order_annotations;
BEGIN
  v_role    := (SELECT role FROM public.app_users WHERE id = auth.uid());
  v_user_id := auth.uid();

  IF (v_role is null or v_role NOT IN ('principal','operation','finance','bd')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_content IS NULL OR coalesce(p_content, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'content required' USING ERRCODE = '22000';
  END IF;

  IF p_tag IS NOT NULL AND p_tag NOT IN ('follow_up','escalate','resolved') THEN
    RAISE EXCEPTION 'invalid tag: %. Must be follow_up, escalate or resolved', p_tag
      USING ERRCODE = '22000';
  END IF;

  INSERT INTO order_annotations (order_id, content, tag, created_by)
  VALUES (p_order_id, trim(p_content), p_tag, v_user_id)
  RETURNING * INTO v_row;

  -- auto-log so timeline stays unified
  INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
  VALUES (
    p_order_id,
    'annotation_added',
    v_user_id,
    jsonb_build_object('tag', p_tag, 'preview', left(trim(p_content), 60))
  );

  RETURN row_to_json(v_row);
END;
$function$;

-- operation_assign_partner_and_dispatch(p_po_id text, p_partner_id uuid, p_outsource_name text, p_outsource_contact text, p_outsource_zones text, p_warehouse_override_id uuid)
--   0558: length(btrim(coalesce(p_outsource_contact, ''))) = 0
--   0558: length(btrim(coalesce(p_outsource_name, ''))) = 0
CREATE OR REPLACE FUNCTION public.operation_assign_partner_and_dispatch(p_po_id text, p_partner_id uuid DEFAULT NULL::uuid, p_outsource_name text DEFAULT NULL::text, p_outsource_contact text DEFAULT NULL::text, p_outsource_zones text DEFAULT NULL::text, p_warehouse_override_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po              purchase_orders;
  v_role            app_role;
  v_actor           text;
  v_partner_name    text;
  v_warehouse_name  text;
  v_outsource       boolean;
begin
  v_role := public.app_role();

  if v_role is distinct from 'operation' then
    raise exception 'forbidden: logistics only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 2. XOR validation: exactly one of partner_id or outsource_name MUST be set.
  if (p_partner_id is null) = (p_outsource_name is null) then
    raise exception 'exactly one of partner_id or outsource_name must be provided'
      using errcode = '22023', detail = 'partner_or_outsource_xor';
  end if;

  v_outsource := p_partner_id is null;

  -- Outsource-specific validation.
  if v_outsource then
    if coalesce(p_outsource_name, '') !~ '[^[:space:]]' then
      raise exception 'outsource name cannot be empty'
        using errcode = '22023', detail = 'outsource_name_empty';
    end if;
    if coalesce(p_outsource_contact, '') !~ '[^[:space:]]' then
      raise exception 'outsource contact is required'
        using errcode = '22023', detail = 'outsource_contact_required';
    end if;
  end if;

  -- 3. Lock PO row (Codex Bug 7 race guard -- the assign step must observe
  --    a stable PO state to avoid double-assignment if two logistics users
  --    click simultaneously).
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- Validate optional warehouse override.
  if p_warehouse_override_id is not null then
    if not exists (select 1 from warehouses where id = p_warehouse_override_id) then
      raise exception 'warehouse not found'
        using errcode = '42P01', detail = 'warehouse_not_found';
    end if;
  end if;

  -- Validate registered partner.
  if not v_outsource then
    select name into v_partner_name from delivery_partners where id = p_partner_id;
    if v_partner_name is null then
      raise exception 'delivery partner not found'
        using errcode = '42P01', detail = 'partner_not_found';
    end if;
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Logistics');

  -- 4. Mutate PO. The 0030 CHECK po_outsource_xor_partner enforces:
  --    (outsource_partner_name is null) OR (procurement_partner_id is null).
  --    We always clear the OTHER side to keep that invariant.
  if v_outsource then
    update purchase_orders
       set procurement_partner_id     = null,
           outsource_partner_name     = btrim(p_outsource_name),
           outsource_partner_contact  = btrim(p_outsource_contact),
           outsource_partner_zones    = nullif(btrim(coalesce(p_outsource_zones, '')), ''),
           sup_status                 = 'pickup_assigned',
           warehouse_id               = coalesce(p_warehouse_override_id, warehouse_id),
           updated_at                 = now()
     where id = p_po_id;
  else
    update purchase_orders
       set procurement_partner_id     = p_partner_id,
           outsource_partner_name     = null,
           outsource_partner_contact  = null,
           outsource_partner_zones    = null,
           sup_status                 = 'pickup_assigned',
           warehouse_id               = coalesce(p_warehouse_override_id, warehouse_id),
           updated_at                 = now()
     where id = p_po_id;
  end if;

  if p_warehouse_override_id is not null then
    select name into v_warehouse_name from warehouses where id = p_warehouse_override_id;
  end if;

  -- 5. po_history (kind captured in text per existing po_history shape -- the
  --    table doesn't have a `kind` column).
  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    case when v_outsource
         then format('Partner assigned (outsource: %s)%s',
                     btrim(p_outsource_name),
                     case when p_warehouse_override_id is not null
                          then ' to ' || coalesce(v_warehouse_name, 'warehouse')
                          else '' end)
         else format('Partner assigned: %s%s',
                     v_partner_name,
                     case when p_warehouse_override_id is not null
                          then ' to ' || coalesce(v_warehouse_name, 'warehouse')
                          else '' end)
    end,
    'operation'
  );

  -- 6. audit_log -- action prefix tags this as the new v3 RPC.
  insert into audit_log (role, actor_text, action, ref)
  values ('operation', v_actor,
          format('Assigned partner-and-dispatch %s -- %s%s',
                 p_po_id,
                 case when v_outsource
                      then 'outsource: ' || btrim(p_outsource_name)
                      else v_partner_name end,
                 case when p_warehouse_override_id is not null
                      then ' (wh: ' || coalesce(v_warehouse_name, 'override') || ')'
                      else '' end),
          p_po_id);

  return jsonb_build_object(
    'po_id',                  p_po_id,
    'sup_status',             'pickup_assigned',
    'outsource',              v_outsource,
    'procurement_partner_id', case when v_outsource then null else p_partner_id end,
    'outsource_partner_name', case when v_outsource then btrim(p_outsource_name) else null end,
    'warehouse_id',           coalesce(p_warehouse_override_id, v_po.warehouse_id)
  );
end;
$function$;

-- operation_attach_do_and_deliver(p_order_id uuid, p_do_number text, p_do_note text, p_signed boolean, p_do_file_path text, p_signature_url text, p_signed_by text)
--   0558: length(btrim(p_do_file_path)) = 0
--   0558: length(btrim(p_do_number)) < 3
CREATE OR REPLACE FUNCTION public.operation_attach_do_and_deliver(p_order_id uuid, p_do_number text, p_do_note text, p_signed boolean, p_do_file_path text, p_signature_url text DEFAULT NULL::text, p_signed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order   orders;
  v_actor   text;
  v_line    record;
  v_user_id uuid;
  v_threads_advanced int;
  v_units_sold int := 0;
  v_line_sold  int;
  v_sold_ids uuid[] := '{}';
  v_line_ids uuid[];
  v_attempt_id uuid;
  v_attempt_no int;
  v_confirmed date;
  -- 0497
  v_doc      ops_delivery_orders;
  v_stops    jsonb;
  v_last_leg int := 0;
  v_missing  int := 0;
  v_goods_out boolean := false;
BEGIN
  v_user_id := (select auth.uid());

  IF NOT public.is_operation() THEN
    RAISE EXCEPTION 'forbidden: logistics only' USING ERRCODE = '42501';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_number IS NULL OR (length(btrim(p_do_number)) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_file_path IS NULL OR coalesce(p_do_file_path, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'DO file required'
      USING ERRCODE = 'P0001', DETAIL = 'do_file_required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found'
      USING ERRCODE = '42P01', DETAIL = 'order_not_found';
  END IF;
  IF v_order.status <> 'proceed_order' THEN
    RAISE EXCEPTION 'order is not proceeded'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  -- 0497 · The document this delivery is recorded against: the order's LIVE
  -- document carrying this number (0356 register; 0491 legs).
  SELECT * INTO v_doc FROM ops_delivery_orders
   WHERE order_id = p_order_id AND voided_at IS NULL
     AND do_number = upper(btrim(p_do_number))
   ORDER BY issued_at DESC LIMIT 1;

  -- 0497 · A Journey delivers on its LAST leg's own document, and only once
  -- every earlier leg has arrived (Delivery MASTER §14.1).
  v_stops := coalesce(v_order.delivery_stops, '[]'::jsonb);
  IF jsonb_typeof(v_stops) = 'array' THEN
    SELECT coalesce(max((s->>'leg')::int), 0) INTO v_last_leg FROM jsonb_array_elements(v_stops) s;
  END IF;
  IF v_last_leg > 0 THEN
    IF v_doc.id IS NULL OR coalesce(v_doc.leg, 0) <> v_last_leg THEN
      RAISE EXCEPTION 'the customer leg is delivered on the last leg''s own Delivery Order'
        USING ERRCODE = 'P0001', DETAIL = 'journey_document_required';
    END IF;
    SELECT count(*) INTO v_missing
      FROM jsonb_array_elements(v_stops) s
     WHERE (s->>'leg')::int < v_last_leg
       AND NOT EXISTS (
         SELECT 1 FROM delivery_attempts a
          WHERE a.order_id = p_order_id AND a.leg = (s->>'leg')::int AND a.result = 'delivered');
    IF v_missing > 0 THEN
      RAISE EXCEPTION 'an earlier leg has not arrived yet — the Journey completes leg by leg'
        USING ERRCODE = 'P0001', DETAIL = 'journey_incomplete';
    END IF;
  END IF;

  -- 0497 · The goods are OUT WITH LOGISTICS: the live document's logistics
  -- receipt (0363/0494), or the legacy dispatched stage the supplier-thread
  -- machine still sets.
  v_goods_out := v_order.operation_stage IS NOT DISTINCT FROM 'dispatched'
    OR (v_doc.id IS NOT NULL AND EXISTS (
          SELECT 1 FROM delivery_handover_events e
           WHERE e.delivery_order_id = v_doc.id AND e.kind = 'received_by_logistics'));
  IF NOT v_goods_out THEN
    RAISE EXCEPTION 'the goods are not out with logistics yet — record the handover and the logistics receipt first'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_user_id), 'Logistics');

  UPDATE orders
     SET status            = 'delivered',
         operation_stage   = 'delivered',
         do_number         = btrim(p_do_number),
         do_note           = nullif(btrim(coalesce(p_do_note, '')), ''),
         do_file_path      = btrim(p_do_file_path),
         do_uploaded_at    = now(),
         do_uploaded_by    = v_user_id,
         pod_signature_url = nullif(btrim(coalesce(p_signature_url, '')), ''),
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = now(),
         dispatched_at     = coalesce(dispatched_at, now()),
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_order_id;

  -- 0497 · The Journey's last stop completes with the customer's receipt.
  IF v_last_leg > 0 THEN
    UPDATE orders
       SET delivery_stops = (
         SELECT jsonb_agg(
                  CASE WHEN (s->>'leg')::int = v_last_leg
                       THEN s || jsonb_build_object('status', 'delivered', 'delivered_at', now())
                       ELSE s END
                  ORDER BY (s->>'leg')::int)
           FROM jsonb_array_elements(v_stops) s)
     WHERE id = p_order_id;
  END IF;

  -- 0497 · The delivered document's EXACT Units become sold (0424 snapshot).
  -- No stock total is written: totals derive from the Unit register (0366).
  IF v_doc.id IS NOT NULL AND EXISTS (SELECT 1 FROM delivery_order_units WHERE delivery_order_id = v_doc.id) THEN
    WITH sold AS (
      UPDATE ops_stock_items i
         SET status        = 'sold',
             sold_at       = now(),
             sold_order_id = p_order_id,
             reserved_ref  = 'SO-' || v_order.so::text,
             ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]), 'SO-' || v_order.so::text),
             updated_at    = now()
       WHERE i.id IN (SELECT du.item_id FROM delivery_order_units du WHERE du.delivery_order_id = v_doc.id)
         AND i.status = 'reserved'
      RETURNING i.id
    )
    SELECT count(*), coalesce(array_agg(id), '{}'::uuid[]) INTO v_units_sold, v_sold_ids FROM sold;
  ELSE
    -- A document with no Unit snapshot (pre-0424): the legacy pick, by SKU at
    -- the order's warehouse, reserved first.
    FOR v_line IN SELECT sku, qty FROM order_lines WHERE order_id = p_order_id LOOP
      WITH sold AS (
        UPDATE ops_stock_items i
           SET status        = 'sold',
               sold_at       = now(),
               sold_order_id = p_order_id,
               reserved_ref  = 'SO-' || v_order.so::text,
               ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]), 'SO-' || v_order.so::text),
               updated_at    = now()
         WHERE i.id IN (
           SELECT s.id FROM ops_stock_items s
            WHERE s.sku = v_line.sku
              AND s.warehouse_id IS NOT DISTINCT FROM v_order.warehouse_id
              AND ( (s.status = 'reserved' AND s.reserved_ref = 'SO-' || v_order.so::text)
                 OR s.status IN ('incoming','free') )
            ORDER BY CASE WHEN s.status = 'reserved' THEN 0 ELSE 1 END, s.date_in, s.created_at
            LIMIT v_line.qty)
        RETURNING i.id
      )
      SELECT count(*), coalesce(array_agg(id), '{}'::uuid[]) INTO v_line_sold, v_line_ids FROM sold;
      v_sold_ids := v_sold_ids || v_line_ids;
      v_units_sold := v_units_sold + v_line_sold;
    END LOOP;
  END IF;

  SELECT confirmed_date INTO v_confirmed FROM ops_order_control WHERE order_id = p_order_id;
  IF v_last_leg > 0 THEN
    SELECT a.confirmed_date INTO v_confirmed
      FROM ops_delivery_arrangements a WHERE a.order_id = p_order_id AND a.leg = v_last_leg;
  END IF;
  SELECT coalesce(max(attempt_no), 0) + 1 INTO v_attempt_no
    FROM delivery_attempts WHERE order_id = p_order_id;
  INSERT INTO delivery_attempts
    (order_id, attempt_no, result, do_number, logistics_name, scheduled_date, recorded_by, leg)
  VALUES
    (p_order_id, v_attempt_no, 'delivered', btrim(p_do_number),
     coalesce(v_doc.logistics_partner,
              (SELECT name FROM delivery_partners WHERE id = v_order.delivery_partner_id),
              (SELECT name FROM delivery_partners WHERE id = v_order.ops_assigned_logistic)),
     v_confirmed, v_user_id, v_last_leg)
  RETURNING id INTO v_attempt_id;
  INSERT INTO delivery_attempt_units (attempt_id, item_id, outcome)
  SELECT v_attempt_id, unnest(v_sold_ids), 'delivered';

  UPDATE order_supplier_threads
     SET operation_stage = 'delivered',
         delivered_at    = COALESCE(delivered_at, now()),
         updated_at      = now()
   WHERE order_id = p_order_id
     AND operation_stage <> 'delivered';
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    p_order_id,
    format('Delivered · DO %s · file %s · signed by %s · %s unit(s) sold%s%s',
           btrim(p_do_number),
           btrim(p_do_file_path),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer'),
           v_units_sold,
           CASE WHEN v_last_leg > 0 THEN format(' · Journey complete on leg %s', v_last_leg) ELSE '' END,
           CASE WHEN v_threads_advanced > 0
                THEN format(' · %s thread(s) advanced', v_threads_advanced)
                ELSE '' END),
    'operation'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('operation', v_actor,
          format('Delivered SO-%s · DO %s', v_order.so, btrim(p_do_number)),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  RETURN jsonb_build_object(
    'id',                v_order.id,
    'so',                v_order.so,
    'status',            'delivered',
    'operation_stage',   'delivered',
    'do_number',         btrim(p_do_number),
    'do_file_path',      btrim(p_do_file_path),
    'pod_signature_url', nullif(btrim(coalesce(p_signature_url, '')), ''),
    'pod_signed_by',     nullif(btrim(coalesce(p_signed_by, '')), ''),
    'delivered_at',      now(),
    'units_sold',        v_units_sold,
    'threads_advanced',  v_threads_advanced,
    'attempt_id',        v_attempt_id,
    'journey_last_leg',  v_last_leg
  );
END;
$function$;

-- operation_cancel_po(p_po_id text, p_reason text)
--   0558: btrim(p_reason) = ''
CREATE OR REPLACE FUNCTION public.operation_cancel_po(p_po_id text, p_reason text)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po               purchase_orders;
  v_dealer_id        uuid;
  v_actor            text;
  v_threads_released int;
  v_units_voided     int := 0;   -- 0154
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics role required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_reason is null or coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status <> 'open' then
    raise exception 'PO is not open (current status: %)', v_po.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if v_po.so is not null then
    select dealer_id into v_dealer_id
      from orders where so = v_po.so
      limit 1;
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update purchase_orders
    set status = 'cancelled',
        updated_at = now()
    where id = p_po_id
    returning * into v_po;

  update order_supplier_threads
     set po_id        = null,
         warehouse_id = null,
         updated_at   = now()
   where po_id = p_po_id;
  get diagnostics v_threads_released = row_count;

  -- 0154: void this PO's never-arrived (incoming) tracked units so phantom IDs
  -- don't linger in the per-unit register.
  update ops_stock_items
     set status = 'voided', updated_at = now()
   where po_no = p_po_id and status = 'incoming';
  get diagnostics v_units_voided = row_count;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    'operation',
    v_actor,
    format('Cancelled PO %s · %s threads released · %s unit(s) voided · %s',
           p_po_id, v_threads_released, v_units_voided, p_reason),
    v_dealer_id,
    p_po_id
  );

  return v_po;
end;
$function$;

-- operation_receive_po_with_do(p_po_id text, p_do_file_path text, p_do_number text, p_lines jsonb, p_actual_site_id uuid)
--   0558: length(btrim(p_do_number)) = 0
--   0558: length(btrim(p_do_file_path)) = 0
CREATE OR REPLACE FUNCTION public.operation_receive_po_with_do(p_po_id text, p_do_file_path text, p_do_number text, p_lines jsonb, p_actual_site_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po                 purchase_orders;
  v_role               app_role;
  v_uid                uuid;
  v_actor              text;
  v_was_relocated      boolean;
  v_is_own             boolean := false;
  v_posts_stock        boolean := false;
  v_supplier_name      text;
  v_line               jsonb;
  v_line_id            uuid;
  v_received_qty       int;
  v_damaged_add        int;
  v_wrong_add          int;
  v_damaged_total      int := 0;
  v_wrong_total        int := 0;
  v_claims_created     int := 0;
  v_damaged_claim      uuid;
  v_wrong_claim        uuid;
  v_category           text;
  v_wrong_type         text;
  v_photos             jsonb;
  v_existing_line      purchase_order_lines;
  v_sku                text;
  v_delta              int;
  v_freed              int;
  v_minted             int;
  v_held               int;
  v_units_held         int := 0;
  v_lines_updated      int := 0;
  v_thread             record;
  v_target_thread_stage operation_stage;
  v_target_sup_status  po_sup_status;
  v_threads_advanced   int := 0;
  v_reserve            record;
  v_thread_satisfied   boolean;
  v_outstanding        int;
  -- 0426 anchors
  v_site               uuid;
  v_recv_ids           uuid[];
  v_dmg_ids            uuid[];
  v_wrong_ids          uuid[];
  v_ownership          text;
  -- 0444
  v_mode               text;
  v_named              int;
  v_rest               int;
begin
  if p_po_id is null or length(btrim(p_po_id)) = 0 then
    raise exception 'p_po_id required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_file_path is null or coalesce(p_do_file_path, '') !~ '[^[:space:]]' then
    raise exception 'p_do_file_path required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_number is null or coalesce(p_do_number, '') !~ '[^[:space:]]' then
    raise exception 'p_do_number required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines required (at least one line)' using errcode = '22023', detail = 'invalid_input';
  end if;

  v_uid  := auth.uid();
  v_role := public.app_role();

  if (v_role is null or v_role not in ('operation', 'principal', 'partner')) then
    raise exception 'forbidden: only logistics/principal/partner can receive POs'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_role = 'partner' then
    select * into v_po from purchase_orders
     where id = p_po_id and procurement_partner_id = public.app_partner_id()
     for update;
  else
    select * into v_po from purchase_orders where id = p_po_id for update;
  end if;
  if not found then
    raise exception 'PO not found or not assigned to caller'
      using errcode = '42501', detail = 'po_not_found_or_cross_tenant';
  end if;

  if v_po.status = 'received' then
    raise exception 'PO already fully received'
      using errcode = '22023', detail = 'already_received';
  end if;

  -- 0426 · the Actual Site: where the goods PHYSICALLY landed. It never
  -- rewrites the PO's Deliver To; it decides where the stock consequence
  -- posts. Null = the PO's own booked warehouse, exactly as before.
  if p_actual_site_id is not null and not exists (
    select 1 from warehouses where id = p_actual_site_id
  ) then
    raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
  end if;
  v_site := coalesce(p_actual_site_id, v_po.warehouse_id);

  -- 0426 · consignment: a consignment source's received Units remain
  -- SUPPLIER-OWNED (0366's ownership contract) and receipt creates no
  -- payable — the engine touches no Finance/AP record either way.
  v_ownership := case when v_po.is_consignment then 'supplier_consignment'
                      else 'carres_owned' end;

  v_was_relocated := v_po.sup_status = 'relocated';
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  -- R4: the per-unit register is Carres-owned scope — read at the PHYSICAL
  -- site (0426), because that is where the units land.
  select (kind = 'own') into v_is_own from warehouses where id = v_site;
  -- P4: goods become Carres stock when they physically land at a Carres
  -- warehouse. Without an Actual Site override that is still the original
  -- rule (destination books into the PO's warehouse); with one, the recorded
  -- physical arrival wins (owner instruction 2026-09-04: valid received
  -- Units enter Inventory at the Actual Site).
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false) or p_actual_site_id is not null;
  v_is_own := coalesce(v_is_own, false);
  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_received_qty := nullif(v_line->>'received_qty', '')::int;
    v_damaged_add := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong_add   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);
    v_damaged_claim := null;
    v_wrong_claim   := null;

    -- 0426 · the exact Units this line named, split by outcome. Empty arrays
    -- mean a quantity line (governed interchangeable goods) and the original
    -- oldest-first behaviour holds.
    select coalesce(array_agg((u->>'stock_item_id')::uuid), '{}'::uuid[])
      into v_recv_ids
      from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) u
     where u->>'outcome' = 'received';
    select coalesce(array_agg((u->>'stock_item_id')::uuid), '{}'::uuid[])
      into v_dmg_ids
      from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) u
     where u->>'outcome' = 'received_with_issue' and u->>'issue_kind' = 'damaged';
    select coalesce(array_agg((u->>'stock_item_id')::uuid), '{}'::uuid[])
      into v_wrong_ids
      from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) u
     where u->>'outcome' = 'received_with_issue' and u->>'issue_kind' = 'wrong_item';

    if v_line_id is null or v_received_qty is null or v_received_qty < 0 then
      raise exception 'invalid line: id=%, received_qty=%', v_line_id, v_received_qty
        using errcode = '22023', detail = 'invalid_line';
    end if;
    if v_damaged_add < 0 or v_wrong_add < 0 then
      raise exception 'invalid line: damaged_qty=%, wrong_item_qty=%', v_damaged_add, v_wrong_add
        using errcode = '22023', detail = 'invalid_line';
    end if;

    select * into v_existing_line from purchase_order_lines
     where id = v_line_id and po_id = p_po_id for update;
    if not found then
      raise exception 'PO line not found for id=%', v_line_id using errcode = '42P01', detail = 'po_line_not_found';
    end if;

    v_sku := v_existing_line.sku;

    if v_received_qty > v_existing_line.qty then
      raise exception 'over-received: % > ordered %', v_received_qty, v_existing_line.qty
        using errcode = 'P0001', detail = 'over_received';
    end if;

    if v_received_qty + v_damaged_add + v_wrong_add > v_existing_line.qty then
      raise exception 'reported % units on a line of % (received % + damaged % + wrong %)',
                      v_received_qty + v_damaged_add + v_wrong_add, v_existing_line.qty,
                      v_received_qty, v_damaged_add, v_wrong_add
        using errcode = 'P0001', detail = 'report_exceeds_ordered';
    end if;

    v_delta := v_received_qty - v_existing_line.received_qty;
    if v_delta < 0 then
      raise exception 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        using errcode = 'P0001', detail = 'received_qty_decrease';
    end if;

    -- ⭐ 0444 · THE MODE DECIDES, AT THE ENGINE TOO. A direct caller cannot
    -- take the quantity path for a traceable line by leaving `units` out,
    -- nor name Units against a quantity line. For an exact-unit line the
    -- named outcomes ARE the quantities — the counts must agree exactly.
    v_mode  := v_existing_line.identity_mode;
    v_named := cardinality(v_recv_ids) + cardinality(v_dmg_ids) + cardinality(v_wrong_ids);
    if v_mode is null then
      raise exception 'line % has no stock identity mode — set it for the SKU in Catalog', v_sku
        using errcode = 'P0001', detail = 'line_identity_mode_missing';
    end if;
    if v_mode = 'quantity' and v_named > 0 then
      raise exception 'line % is counted by quantity — it has no Unit IDs to scan', v_sku
        using errcode = 'P0001', detail = 'quantity_line_takes_no_units';
    end if;
    if v_mode = 'exact_unit' then
      if v_named = 0 and (v_delta > 0 or v_damaged_add > 0 or v_wrong_add > 0) then
        raise exception 'line % is traced by Unit ID — record one result for each expected Unit', v_sku
          using errcode = 'P0001', detail = 'exact_unit_line_needs_units';
      end if;
      if cardinality(v_recv_ids) <> v_delta
         or cardinality(v_dmg_ids) <> v_damaged_add
         or cardinality(v_wrong_ids) <> v_wrong_add then
        raise exception 'line % names % received, % damaged and % wrong Units but reports %, % and %',
                        v_sku, cardinality(v_recv_ids), cardinality(v_dmg_ids), cardinality(v_wrong_ids),
                        v_delta, v_damaged_add, v_wrong_add
          using errcode = 'P0001', detail = 'unit_outcomes_mismatch';
      end if;
      -- Every named Unit must be THIS line's, still incoming.
      if exists (
        select 1 from unnest(v_recv_ids || v_dmg_ids || v_wrong_ids) as x(id)
          left join ops_stock_items u on u.id = x.id
         where u.id is null or u.po_line_id is distinct from v_line_id
            or u.identity_scope <> 'unit' or u.status <> 'incoming'
      ) then
        raise exception 'a named Unit on % is not an incoming Unit of this line', v_sku
          using errcode = 'P0001', detail = 'unit_not_on_this_line';
      end if;
    end if;

    if v_damaged_add > 0 or v_wrong_add > 0 then
      v_category := public.claim_product_category(v_sku);
    end if;

    if v_damaged_add > 0 then
      v_photos := public.supplier_claim_photo_entries(v_line->'damaged_photos', v_uid);
      if jsonb_array_length(v_photos) = 0 then
        raise exception 'damaged units on % need at least one photo', v_sku
          using errcode = 'P0001', detail = 'claim_evidence_required';
      end if;
      insert into supplier_claims (
        po_id, po_line_id, supplier_id, sku, product_category,
        claim_type, qty, do_number, photos, reported_by
      ) values (
        p_po_id, v_line_id, v_po.supplier_id, v_sku, v_category,
        'damaged', v_damaged_add, btrim(p_do_number), v_photos, v_uid
      )
      returning id into v_damaged_claim;
      v_claims_created := v_claims_created + 1;
    end if;

    if v_wrong_add > 0 then
      v_wrong_type := nullif(btrim(coalesce(v_line->>'wrong_item_claim_type', '')), '');
      if v_wrong_type is null then
        raise exception 'wrong-item units on % need a claim type', v_sku
          using errcode = 'P0001', detail = 'claim_type_required';
      end if;
      if not public.supplier_claim_type_allowed(v_category, v_wrong_type) then
        raise exception 'claim type % is not offered for a % item', v_wrong_type, v_category
          using errcode = 'P0001', detail = 'claim_type_invalid';
      end if;
      v_photos := public.supplier_claim_photo_entries(v_line->'wrong_item_photos', v_uid);
      if jsonb_array_length(v_photos) = 0 then
        raise exception 'wrong-item units on % need at least one photo', v_sku
          using errcode = 'P0001', detail = 'claim_evidence_required';
      end if;
      insert into supplier_claims (
        po_id, po_line_id, supplier_id, sku, product_category,
        claim_type, qty, do_number, photos, reported_by
      ) values (
        p_po_id, v_line_id, v_po.supplier_id, v_sku, v_category,
        v_wrong_type, v_wrong_add, btrim(p_do_number), v_photos, v_uid
      )
      returning id into v_wrong_claim;
      v_claims_created := v_claims_created + 1;
    end if;

    update purchase_order_lines
       set received_qty   = v_received_qty,
           damaged_qty    = damaged_qty + v_damaged_add,
           wrong_item_qty = wrong_item_qty + v_wrong_add
     where id = v_line_id;

    v_damaged_total := v_damaged_total + v_damaged_add;
    v_wrong_total   := v_wrong_total + v_wrong_add;

    if v_delta > 0 and v_posts_stock then
      -- 0366 · the unit register is the ONE inventory authority: stock posts by
      -- flipping/minting Units only. `stock_balances` is derived by the rollup
      -- triggers on `ops_stock_items` — a direct write here is refused by
      -- `trg_stock_balances_derived_only` (this replaces the pre-0366 balance
      -- write the previous engine definition still carried).

      -- 0426 · EXACT-UNIT flips first (ERP-ARCHITECTURE §3.4): the scanned
      -- `Received` Units become free at the Actual Site. A quantity line
      -- keeps the oldest-first flip.
      if cardinality(v_recv_ids) > 0 then
        with freed as (
          update ops_stock_items
             set status = 'free', warehouse_id = v_site, updated_at = now(),
                 ownership = case when v_po.is_consignment
                                  then 'supplier_consignment' else ownership end,
                 supplier = coalesce(nullif(btrim(coalesce(supplier, '')), ''), v_supplier_name)
           where id = any(v_recv_ids) and status = 'incoming'
          returning 1
        )
        select count(*) into v_freed from freed;
        if v_freed <> cardinality(v_recv_ids) then
          raise exception 'a scanned unit on % was already received — reload and count again', v_sku
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
      else
        -- 0444 · QUANTITY LINE. Units minted for this line before 0442 (fake
        -- IDs the old issue path gave interchangeable goods) are permanent:
        -- they flip oldest-first, by LINE, until none are left. The rest of
        -- the received count becomes ONE bulk register row — counted goods,
        -- no Unit ID. Nothing is minted as a Unit.
        with freed as (
          update ops_stock_items
             set status = 'free', warehouse_id = v_site, updated_at = now(),
                 ownership = case when v_po.is_consignment
                                  then 'supplier_consignment' else ownership end,
                 supplier = coalesce(nullif(btrim(coalesce(supplier, '')), ''), v_supplier_name)
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
              order by created_at
              limit v_delta
           )
          returning 1
        )
        select count(*) into v_freed from freed;
        v_rest := v_delta - v_freed;
        if v_rest > 0 then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, po_line_id,
             identity_scope, qty, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_sku, v_site, 'free', v_ownership,
             v_supplier_name, p_po_id, v_line_id,
             'quantity', v_rest, btrim(p_do_number), current_date);
        end if;
      end if;

      -- 0444 · no shortfall mint: Receiving never creates an identity.
      v_minted := 0;

      v_lines_updated := v_lines_updated + 1;
    end if;

    -- Quarantine the claimed units — the EXACT scanned ones when named,
    -- otherwise oldest-first, after the free-flip as before.
    if v_damaged_claim is not null then
      if cardinality(v_dmg_ids) > 0 then
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'damaged',
                 hold_claim_id = v_damaged_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id = any(v_dmg_ids) and status = 'incoming'
          returning 1
        )
        select count(*) into v_held from held;
        if v_held <> cardinality(v_dmg_ids) then
          raise exception 'a damaged unit on % was already received — reload and count again', v_sku
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
      else
        -- 0444 · quantity line: legacy line-bound Units first, then one bulk
        -- controlled row for the rest. Received-with-issue goods are present
        -- but unavailable; they never become a Unit.
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'damaged',
                 hold_claim_id = v_damaged_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
              order by created_at
              limit v_damaged_add
           )
          returning 1
        )
        select count(*) into v_held from held;
        v_rest := v_damaged_add - v_held;
        if v_rest > 0 and v_posts_stock then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, po_line_id,
             identity_scope, qty, hold_reason, hold_claim_id, held_at, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_sku, v_site, 'on_hold', v_ownership,
             v_supplier_name, p_po_id, v_line_id,
             'quantity', v_rest, 'damaged', v_damaged_claim, now(), btrim(p_do_number), current_date);
          v_held := v_held + v_rest;
        end if;
      end if;
      v_units_held := v_units_held + v_held;
    end if;

    if v_wrong_claim is not null then
      if cardinality(v_wrong_ids) > 0 then
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'wrong_item',
                 hold_claim_id = v_wrong_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id = any(v_wrong_ids) and status = 'incoming'
          returning 1
        )
        select count(*) into v_held from held;
        if v_held <> cardinality(v_wrong_ids) then
          raise exception 'a wrong-item unit on % was already received — reload and count again', v_sku
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
      else
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'wrong_item',
                 hold_claim_id = v_wrong_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
              order by created_at
              limit v_wrong_add
           )
          returning 1
        )
        select count(*) into v_held from held;
        v_rest := v_wrong_add - v_held;
        if v_rest > 0 and v_posts_stock then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, po_line_id,
             identity_scope, qty, hold_reason, hold_claim_id, held_at, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_sku, v_site, 'on_hold', v_ownership,
             v_supplier_name, p_po_id, v_line_id,
             'quantity', v_rest, 'wrong_item', v_wrong_claim, now(), btrim(p_do_number), current_date);
          v_held := v_held + v_rest;
        end if;
      end if;
      v_units_held := v_units_held + v_held;
    end if;
  end loop;

  for v_thread in
    select * from order_supplier_threads
     where po_id = p_po_id and operation_stage = 'in_production'
  loop
    select coalesce(bool_and(pol.received_qty >= pol.qty), true)
      into v_thread_satisfied
      from order_lines ol
      join product_skus ps on ps.sku = ol.sku
      join product_models pm on pm.id = ps.model_id
      left join purchase_order_lines pol
        on pol.po_id = p_po_id and pol.sku = ol.sku
     where ol.order_id = v_thread.order_id
       and ps.supplier_id = v_thread.supplier_id
       and pm.category::text = v_thread.category;

    if not v_thread_satisfied then
      continue;
    end if;

    if v_was_relocated then
      v_target_thread_stage := 'waiting';
    else
      v_target_thread_stage := case when v_thread.sop_name = 'SOFA_SPECIAL'
                                    then 'dispatched'
                                    else 'ready_to_dispatch'
                               end;
    end if;

    update order_supplier_threads
       set operation_stage = v_target_thread_stage,
           warehouse_id    = v_site,
           reserved_at     = now(),
           updated_at      = now()
     where id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    -- 0366 · `reserved` is the Sales Order's exact-Unit binding, owned by the
    -- Stock reserve door (`status = 'reserved'` + `reserved_ref`), never an
    -- aggregate counter. The pre-0366 `stock_balances.reserved` increment the
    -- previous engine definition carried is removed — a receiving advances the
    -- thread; the dispatch flow binds its exact Units.
  end loop;

  select count(*) into v_outstanding
    from purchase_order_lines where po_id = p_po_id and received_qty < qty;

  if v_outstanding = 0 then
    if v_was_relocated then
      v_target_sup_status := 'at_warehouse_waiting';
    else
      v_target_sup_status := 'delivered';
    end if;

    update purchase_orders
       set status         = 'received',
           sup_status     = v_target_sup_status,
           do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  else
    update purchase_orders
       set do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  end if;

  insert into po_history (po_id, text, by_role)
  values (p_po_id,
          format('Received with DO %s (%s path) — %s line(s), %s thread(s)%s',
                 btrim(p_do_number),
                 case when v_was_relocated then 'relocated→at_warehouse_waiting' else 'normal→delivered' end,
                 v_lines_updated, v_threads_advanced,
                 case when v_damaged_total + v_wrong_total > 0
                      then format(' · issue: %s damaged, %s wrong item · %s supplier claim(s) opened · %s unit(s) on hold',
                                  v_damaged_total, v_wrong_total, v_claims_created, v_units_held)
                      else '' end),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Received PO %s with DO %s', p_po_id, btrim(p_do_number)), p_po_id);

  return jsonb_build_object(
    'po_id',             p_po_id,
    'do_file_path',      p_do_file_path,
    'do_number',         btrim(p_do_number),
    'lines_updated',     v_lines_updated,
    'threads_advanced',  v_threads_advanced,
    'po_status',         (select status from purchase_orders where id = p_po_id),
    'sup_status',        (select sup_status from purchase_orders where id = p_po_id),
    'was_relocated',     v_was_relocated,
    'damaged_qty',       v_damaged_total,
    'wrong_item_qty',    v_wrong_total,
    'claims_created',    v_claims_created,
    'units_held',        v_units_held,
    'actual_site_id',    v_site
  );
end;
$function$;

-- operation_receive_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text)
--   0558: btrim(p_do_file_path) = ''
--   0558: length(btrim(p_do_number)) < 3
CREATE OR REPLACE FUNCTION public.operation_receive_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po           purchase_orders;
  v_actor_uid    uuid;
  v_event_id     uuid;
  v_thread_count int;
  v_remaining    int;
  v_new_sup_status po_sup_status;
  v_oid          uuid;
BEGIN
  v_actor_uid  := (SELECT auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'operation') THEN
    RAISE EXCEPTION 'forbidden: logistics role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF p_do_number IS NULL OR (length(btrim(p_do_number)) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;
  IF p_do_file_path IS NULL OR coalesce(p_do_file_path, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'DO file path required'
      USING ERRCODE = '22023', DETAIL = 'do_file_required';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT count(*) INTO v_thread_count
    FROM order_supplier_threads
   WHERE id = ANY(p_thread_ids)
     AND po_id = p_po_id
     AND supplier_ready_at IS NOT NULL
     AND pickup_event_id IS NULL
   FOR UPDATE;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id, btrim(p_do_number), btrim(p_do_file_path), nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'operation')
  RETURNING id INTO v_event_id;

  -- F1 fix: own_logistics receive lands goods at WH awaiting customer-leg dispatch.
  -- Always 'ready_to_dispatch' (no SOFA_SPECIAL branch because own_logistics
  -- by definition routes goods through the warehouse, not direct-to-customer).
  UPDATE order_supplier_threads
     SET pickup_event_id = v_event_id,
         operation_stage = 'ready_to_dispatch'::operation_stage,
         updated_at      = now()
   WHERE id = ANY(p_thread_ids);

  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  -- F3 fix: terminal converges to 'delivered' (consistency with
  -- operation_receive_po_with_do); intermediate stays 'partially_shipped'.
  IF v_remaining = 0 THEN
    v_new_sup_status := 'delivered';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Logistics received %s thread(s) · DO %s · sup_status → %s',
                 v_thread_count, btrim(p_do_number), v_new_sup_status),
          'operation', v_actor_uid);

  -- B (Loo 2026-05-31): auto-dispatch any order whose goods are now all at the
  -- WH and which has a non-rejected pre-chosen customer-leg LP (no accept needed).
  FOR v_oid IN
    SELECT DISTINCT order_id FROM order_supplier_threads WHERE id = ANY(p_thread_ids)
  LOOP
    PERFORM public._operation_auto_dispatch_if_ready(v_oid);
  END LOOP;

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count', v_thread_count,
    'po_sup_status', v_new_sup_status
  );
END;
$function$;

-- ops_stock_bind_units(p_item_ids uuid[], p_ref text, p_note text)
--   0558: btrim(p_ref) = ''
CREATE OR REPLACE FUNCTION public.ops_stock_bind_units(p_item_ids uuid[], p_ref text, p_note text DEFAULT NULL::text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ids uuid[];
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if p_ref is null or coalesce(p_ref, '') !~ '[^[:space:]]' then
    raise exception 'a reservation names the order it is for'
      using errcode = 'P0001', detail = 'ref_required';
  end if;

  if exists (
    select 1 from public.ops_stock_items
     where id = any(p_item_ids) and qty > 1
  ) then
    raise exception 'a bulk record cannot carry one customer''s promise'
      using errcode = 'P0001', detail = 'bulk_never_reserved';
  end if;

  with bound as (
    update public.ops_stock_items
       set status = 'reserved', reserved_ref = p_ref, updated_at = now()
     where id = any(p_item_ids)
       and status = 'free'
       and needs_repair = false
    returning id
  )
  select array_agg(id) into v_ids from bound;

  return coalesce(v_ids, '{}'::uuid[]);
end;
$function$;

-- other_debtor_invoice_cancel(p_invoice_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.other_debtor_invoice_cancel(p_invoice_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.app_role()::text;
  v_inv      public.other_debtor_invoices%rowtype;
  v_received numeric(12,2);
  v_nos      text;
  v_reversal uuid;
begin
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Type why the invoice is cancelled.'
      using errcode = '22023', detail = 'reason_missing';
  end if;
  select * into v_inv from public.other_debtor_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.'
      using errcode = 'P0002', detail = 'invoice_missing';
  end if;
  if v_inv.status = 'cancelled' then
    raise exception 'This invoice is already cancelled.'
      using errcode = '22023', detail = 'already_cancelled';
  end if;

  if v_inv.status = 'draft' then
    if v_role is null or v_role not in ('finance','principal') then
      raise exception 'Only Finance cancels a draft invoice.'
        using errcode = '42501', detail = 'not_finance';
    end if;
  else
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Cancelling an issued invoice takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;
    select coalesce(sum(a.amount), 0), string_agg(r.receipt_no, ', ' order by r.receipt_no)
      into v_received, v_nos
      from public.other_receipt_allocations a
      join public.other_receipts r on r.id = a.receipt_id
     where a.invoice_id = p_invoice_id and r.status = 'posted';
    if v_received > 0 then
      raise exception '% of this invoice was received on %. Cancel those receipts first.',
        public.fin_rm(v_received), v_nos
        using errcode = 'P0001', detail = 'invoice_has_receipts';
    end if;
    v_reversal := public.gl_reverse(v_inv.gl_entry_id, btrim(p_reason));
  end if;

  update public.other_debtor_invoices
     set status            = 'cancelled',
         reversal_entry_id = v_reversal,
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancel_reason     = btrim(p_reason),
         updated_at        = now(),
         updated_by        = auth.uid()
   where id = p_invoice_id;

  return v_reversal;
end;
$function$;

-- other_receipt_void(p_receipt_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.other_receipt_void(p_receipt_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rec      public.other_receipts%rowtype;
  v_reversal uuid;
begin
  if not public.has_finance_approver(auth.uid()) then
    raise exception 'Cancelling a receipt takes the finance approver.'
      using errcode = '42501', detail = 'not_finance_approver';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Type why the receipt is cancelled.'
      using errcode = '22023', detail = 'reason_missing';
  end if;
  select * into v_rec from public.other_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'Receipt not found.'
      using errcode = 'P0002', detail = 'receipt_missing';
  end if;
  if v_rec.status = 'voided' then
    raise exception 'This receipt is already cancelled.'
      using errcode = '22023', detail = 'already_cancelled';
  end if;

  v_reversal := public.gl_reverse(v_rec.gl_entry_id, btrim(p_reason));

  update public.other_receipts
     set status            = 'voided',
         reversal_entry_id = v_reversal,
         voided_at         = now(),
         voided_by         = auth.uid(),
         void_reason       = btrim(p_reason)
   where id = p_receipt_id;

  return v_reversal;
end;
$function$;

-- partner_attach_pod(p_thread_id uuid, p_pod_path text, p_do_number text, p_do_note text, p_signed boolean, p_signature_url text, p_signed_by text)
--   0558: length(btrim(p_do_number)) < 3
--   0558: btrim(p_pod_path) = ''
CREATE OR REPLACE FUNCTION public.partner_attach_pod(p_thread_id uuid, p_pod_path text, p_do_number text, p_do_note text, p_signed boolean, p_signature_url text DEFAULT NULL::text, p_signed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread     order_supplier_threads;
  v_partner_id uuid;
  v_user_id    uuid;
BEGIN
  v_partner_id := public.app_partner_id();
  v_user_id    := (select auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'partner') THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_pod_path IS NULL OR coalesce(p_pod_path, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'pod_path required'
      USING ERRCODE = '22023', DETAIL = 'pod_path_required';
  END IF;

  IF p_do_number IS NULL OR (length(btrim(p_do_number)) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  IF v_thread.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: not this partner''s thread'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_thread.operation_stage IS DISTINCT FROM 'dispatched' THEN
    RAISE EXCEPTION 'thread is not in dispatched state (got %)', v_thread.operation_stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  UPDATE order_supplier_threads
     SET pod_url           = btrim(p_pod_path),
         pod_do_number     = btrim(p_do_number),
         pod_note          = nullif(btrim(coalesce(p_do_note, '')), ''),
         pod_uploaded_at   = now(),
         pod_uploaded_by   = v_user_id,
         pod_signature_url = nullif(btrim(coalesce(p_signature_url, '')), ''),
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = now(),
         operation_stage   = 'delivered',
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_thread_id;

  INSERT INTO order_history (order_id, text, by_role, by_user_id)
  VALUES (
    v_thread.order_id,
    format('POD attached for thread %s · DO %s · signed by %s · stage → delivered',
           p_thread_id, btrim(p_do_number),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer')),
    'partner',
    v_user_id
  );

  RETURN jsonb_build_object(
    'thread_id',         p_thread_id,
    'operation_stage',   'delivered',
    'pod_url',           btrim(p_pod_path),
    'pod_do_number',     btrim(p_do_number),
    'pod_signature_url', nullif(btrim(coalesce(p_signature_url, '')), ''),
    'pod_signed_by',     nullif(btrim(coalesce(p_signed_by, '')), '')
  );
END;
$function$;

-- partner_pickup_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text)
--   0558: length(btrim(p_do_number)) < 3
CREATE OR REPLACE FUNCTION public.partner_pickup_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po              purchase_orders;
  v_partner_id      uuid;
  v_actor_uid       uuid;
  v_event_id        uuid;
  v_thread_count    int;
  v_remaining       int;
  v_new_sup_status  po_sup_status;
  v_existing_events int;
  v_do_number       text;
  v_oid             uuid;
BEGIN
  v_partner_id := public.app_partner_id();
  v_actor_uid  := (SELECT auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'partner') THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;
  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: PO not assigned to this partner'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  WITH locked AS (
    SELECT id FROM order_supplier_threads
     WHERE id = ANY(p_thread_ids)
       AND po_id = p_po_id
       AND supplier_ready_at IS NOT NULL
       AND pickup_event_id IS NULL
     FOR UPDATE
  )
  SELECT count(*) INTO v_thread_count FROM locked;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible (not ready / wrong PO / already picked)'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  IF p_do_number IS NULL OR (length(btrim(p_do_number)) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') THEN
    SELECT count(*) INTO v_existing_events FROM po_pickup_events WHERE po_id = p_po_id;
    v_do_number := format('DO-%s-%s', p_po_id, lpad((v_existing_events + 1)::text, 3, '0'));
  ELSE
    v_do_number := btrim(p_do_number);
  END IF;

  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id,
          v_do_number,
          nullif(btrim(coalesce(p_do_file_path, '')), ''),
          nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'partner')
  RETURNING id INTO v_event_id;

  UPDATE order_supplier_threads t
     SET pickup_event_id = v_event_id,
         operation_stage = CASE WHEN t.sop_name = 'SOFA_SPECIAL'
                                THEN 'dispatched'::operation_stage
                                ELSE 'ready_to_dispatch'::operation_stage
                           END,
         updated_at      = now()
   WHERE t.id = ANY(p_thread_ids);

  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  IF v_remaining = 0 THEN
    v_new_sup_status := 'shipped';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Partner picked up %s thread(s) · DO %s · sup_status -> %s',
                 v_thread_count, v_do_number, v_new_sup_status),
          'partner', v_actor_uid);

  -- B (Loo 2026-05-31): factory-pickup STANDARD goods land at the WH
  -- (ready_to_dispatch); auto-dispatch the order if all its goods are now at
  -- the WH and a non-rejected LP was pre-chosen. SOFA_SPECIAL threads are
  -- already 'dispatched' so the helper's gate skips them.
  FOR v_oid IN
    SELECT DISTINCT order_id FROM order_supplier_threads WHERE id = ANY(p_thread_ids)
  LOOP
    PERFORM public._operation_auto_dispatch_if_ready(v_oid);
  END LOOP;

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count',    v_thread_count,
    'do_number',       v_do_number,
    'po_sup_status',   v_new_sup_status
  );
END;
$function$;

-- payment_collection_owner_handover(p_order_id uuid, p_new_owner_user_id uuid, p_reason text, p_effective_from date)
--   0558: length(btrim(p_reason)) < 3
CREATE OR REPLACE FUNCTION public.payment_collection_owner_handover(p_order_id uuid, p_new_owner_user_id uuid, p_reason text, p_effective_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_from date := coalesce(p_effective_from, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_current uuid;
  v_row public.payment_collection_owners;
begin
  perform public.workspace_duty_settings_gate();

  if p_order_id is null or not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'unknown order' using errcode = '22023', detail = 'unknown_order';
  end if;
  if p_reason is null or (length(btrim(p_reason)) < 3 or coalesce(p_reason, '') !~ '[^[:space:]]') then
    raise exception 'a handover states its reason' using errcode = '22023', detail = 'reason_required';
  end if;
  if not exists (
    select 1 from public.app_users u
     where u.id = p_new_owner_user_id and u.status = 'active'
       and u.role in ('operation', 'principal')
  ) then
    raise exception 'the new owner must be active Operation staff'
      using errcode = '22023', detail = 'new_owner_not_operation_staff';
  end if;
  -- 0504: only an INDIVIDUAL carries responsibility.
  if not exists (
    select 1 from public.app_users u
     where u.id = p_new_owner_user_id and u.staff_code is not null
  ) then
    raise exception 'the new owner must be a person, not a shared account'
      using errcode = '22023', detail = 'new_owner_not_individual';
  end if;

  select c.owner_user_id into v_current
    from public.payment_collection_owners c
   where c.order_id = p_order_id and c.effective_from <= v_from
   order by c.effective_from desc, c.changed_at desc
   limit 1;

  if v_current = p_new_owner_user_id then
    raise exception 'this person already owns the collection'
      using errcode = '22023', detail = 'same_owner';
  end if;

  insert into public.payment_collection_owners
    (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
  values
    (p_order_id, p_new_owner_user_id, v_current, 'handover', btrim(p_reason), v_uid, clock_timestamp(), v_from)
  returning * into v_row;

  -- The assignment follows the handover, so the Sales Order and the collection
  -- desk name the same person. The ledger row above is already current, so the
  -- §3 trigger writes nothing further.
  insert into public.ops_order_control (order_id, assigned_staff, assigned_by, assigned_at, updated_by)
  values (p_order_id, p_new_owner_user_id, v_uid, now(), v_uid)
  on conflict (order_id) do update
    set assigned_staff = excluded.assigned_staff,
        assigned_by = excluded.assigned_by,
        assigned_at = excluded.assigned_at,
        updated_by = excluded.updated_by;

  return to_jsonb(v_row);
end;
$function$;

-- payment_invoice_void_replace(p_invoice_id uuid, p_reason text)
--   0558: nullif(btrim(coalesce(p_reason, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_invoice_void_replace(p_invoice_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv invoices;
  v_replacement invoices;
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('payment_approver', null);
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a reason is required to void an invoice'
      using errcode = '22023', detail = 'reason_required';
  end if;
  -- Payment Approver duty (or its dated cover) corrects money documents;
  -- principal keeps the owner override (workspace/MASTER.md §3). An unassigned
  -- duty resolves a NULL actor — coalesce, or three-valued logic waves the
  -- refusal through (caught by this migration's own negative control).
  if not (coalesce(public.app_role() = 'principal' and public.workspace_is_person(auth.uid()), false)
          or (v_uid is not null
              and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false))) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_approver';
  end if;

  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = '22023', detail = 'invoice_not_found';
  end if;
  if v_inv.status <> 'issued' then
    raise exception 'only an issued invoice can be voided'
      using errcode = '22023', detail = 'not_issued';
  end if;

  perform 1 from orders where id = v_inv.order_id for update;

  update invoices
     set status = 'voided', voided_at = v_today, voided_by = v_uid,
         void_reason = btrim(p_reason)
   where id = v_inv.id
   returning * into v_inv;

  -- The order stops wearing the voided number; the replacement earns its own
  -- at issue.
  if v_inv.kind = 'sales' then
    update orders set invoice_no = null, invoiced_at = null
     where id = v_inv.order_id and invoice_no = v_inv.invoice_no;
  end if;

  insert into invoices
    (order_id, amount, tax_amount, kind, status, replaces_invoice_id, created_by)
  values
    (v_inv.order_id, v_inv.amount, v_inv.tax_amount, v_inv.kind, 'draft', v_inv.id, v_uid)
  returning * into v_replacement;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (v_inv.order_id,
          format('Invoice %s voided · %s · replacement draft created',
                 v_inv.invoice_no, btrim(p_reason)),
          public.app_role(), v_uid);

  return jsonb_build_object('voided', to_jsonb(v_inv),
                            'replacement', to_jsonb(v_replacement));
end;
$function$;

-- payment_record_delivery_date_request(p_order_id uuid, p_requested_date date, p_reason_key text, p_reason_detail text, p_terms_acknowledged boolean, p_free_storage_requested boolean, p_evidence_url text)
--   0558: nullif(btrim(coalesce(p_evidence_url, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_record_delivery_date_request(p_order_id uuid, p_requested_date date, p_reason_key text, p_reason_detail text, p_terms_acknowledged boolean, p_free_storage_requested boolean, p_evidence_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_row payment_delivery_date_requests;
  v_so integer;
begin
  -- Operation records it at the delivery-window call (§6); principal keeps the
  -- owner override. coalesce — NULL must refuse (the 0429 lesson).
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_recorder';
  end if;

  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;

  if p_requested_date is null or p_requested_date < v_today then
    raise exception 'The date the customer asked for has already passed.'
      using errcode = '22023', detail = 'date_in_the_past';
  end if;
  if nullif(btrim(coalesce(p_reason_key, '')), '') is null then
    raise exception 'The reason is required.'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if not coalesce(p_terms_acknowledged, false) then
    raise exception 'The customer must acknowledge the storage terms.'
      using errcode = '22023', detail = 'terms_not_acknowledged';
  end if;
  if coalesce(p_evidence_url, '') !~ '[^[:space:]]' then
    raise exception 'Attach what the customer sent. A telephone call cannot change the date or obtain free storage.'
      using errcode = '22023', detail = 'evidence_required';
  end if;

  insert into payment_delivery_date_requests
    (order_id, requested_date, reason_key, reason_detail, terms_acknowledged,
     free_storage_requested, evidence_url, recorded_by)
  values
    (p_order_id, p_requested_date, btrim(p_reason_key),
     nullif(btrim(coalesce(p_reason_detail, '')), ''), true,
     coalesce(p_free_storage_requested, false), btrim(p_evidence_url), v_uid)
  returning * into v_row;

  insert into ops_activity_log(order_id, action, actor_id, detail)
  values (p_order_id, 'storage.later_delivery_requested', v_uid,
          jsonb_build_object('request_id', v_row.id, 'requested_date', p_requested_date,
                             'reason_key', v_row.reason_key,
                             'free_storage_requested', v_row.free_storage_requested));

  return to_jsonb(v_row);
end;
$function$;

-- payment_record_message_sent(p_order_id uuid, p_invoice_id uuid, p_kind text, p_message_text text, p_template_key text, p_screenshot_url text)
--   0558: nullif(btrim(coalesce(p_screenshot_url, '')), '') is null
--   0558: nullif(btrim(coalesce(p_message_text, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_record_message_sent(p_order_id uuid, p_invoice_id uuid, p_kind text, p_message_text text, p_template_key text, p_screenshot_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row payment_communications;
begin
  if (public.app_role() is null or public.app_role() not in ('operation', 'finance', 'principal')) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  if p_order_id is null then
    raise exception 'the order is required' using errcode = '22023', detail = 'order_required';
  end if;
  if p_kind not in ('payment_request', 'reminder', 'receipt', 'storage', 'other') then
    raise exception 'unknown message kind' using errcode = '22023', detail = 'bad_kind';
  end if;
  if coalesce(p_message_text, '') !~ '[^[:space:]]' then
    raise exception 'the sent message text is required'
      using errcode = '22023', detail = 'message_required';
  end if;
  -- Opening WhatsApp is neither sent nor read: the record needs the proof.
  if coalesce(p_screenshot_url, '') !~ '[^[:space:]]' then
    raise exception 'the sent screenshot is required'
      using errcode = '22023', detail = 'screenshot_required';
  end if;
  perform 1 from orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;
  if p_invoice_id is not null then
    perform 1 from invoices where id = p_invoice_id and order_id = p_order_id;
    if not found then
      raise exception 'the invoice does not belong to this order'
        using errcode = '22023', detail = 'invoice_mismatch';
    end if;
  end if;

  insert into payment_communications
    (order_id, invoice_id, kind, message_text, template_key,
     sent_screenshot_url, recorded_by)
  values
    (p_order_id, p_invoice_id, p_kind, p_message_text,
     nullif(btrim(coalesce(p_template_key, '')), ''),
     btrim(p_screenshot_url), auth.uid())
  returning * into v_row;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          format('Payment message sent · %s', p_kind),
          public.app_role(), auth.uid());

  update ops_order_control set last_chased_at = now(), updated_by = auth.uid(), updated_at = now()
   where order_id = p_order_id;

  return to_jsonb(v_row);
end;
$function$;

-- payment_record_storage_inspection(p_case_id uuid, p_inspected_on date, p_location text, p_packaging text, p_condition_note text, p_photo_url text)
--   0558: nullif(btrim(coalesce(p_photo_url, '')), '') is null
--   0558: nullif(btrim(coalesce(p_condition_note, '')), '') is null
--   0558: nullif(btrim(coalesce(p_packaging, '')), '') is null
--   0558: nullif(btrim(coalesce(p_location, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_record_storage_inspection(p_case_id uuid, p_inspected_on date, p_location text, p_packaging text, p_condition_note text, p_photo_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_case payment_storage_cases;
  v_row payment_storage_inspections;
begin
  -- Warehouse does the looking (§6); Operation records alongside it and
  -- principal keeps the owner override. coalesce — NULL must refuse.
  if not coalesce(public.app_role() in ('warehouse', 'operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_inspector';
  end if;

  select * into v_case from payment_storage_cases where id = p_case_id;
  if not found then
    raise exception 'storage case not found' using errcode = '22023', detail = 'case_not_found';
  end if;
  if v_case.status <> 'open' then
    raise exception 'The storage case is closed. There is nothing in storage to check.'
      using errcode = '22023', detail = 'case_closed';
  end if;

  if p_inspected_on is null or p_inspected_on > v_today then
    raise exception 'A check cannot be dated in the future.'
      using errcode = '22023', detail = 'future_inspection';
  end if;
  if p_inspected_on < v_case.storage_start then
    raise exception 'A check cannot be dated before the storage started.'
      using errcode = '22023', detail = 'before_storage_start';
  end if;
  if coalesce(p_location, '') !~ '[^[:space:]]'
     or coalesce(p_packaging, '') !~ '[^[:space:]]'
     or coalesce(p_condition_note, '') !~ '[^[:space:]]' then
    raise exception 'Where it is, how it is packed and what condition it is in are all required.'
      using errcode = '22023', detail = 'facts_required';
  end if;
  if coalesce(p_photo_url, '') !~ '[^[:space:]]' then
    raise exception 'A photo is required — a check nobody can see is not a check.'
      using errcode = '22023', detail = 'photo_required';
  end if;

  insert into payment_storage_inspections
    (case_id, inspected_on, location, packaging, condition_note, photo_url, recorded_by)
  values
    (p_case_id, p_inspected_on, btrim(p_location), btrim(p_packaging),
     btrim(p_condition_note), btrim(p_photo_url), v_uid)
  returning * into v_row;

  insert into ops_activity_log(order_id, action, actor_id, detail)
  values (v_case.order_id, 'storage.checked', v_uid,
          jsonb_build_object('case_id', p_case_id, 'inspection_id', v_row.id,
                             'inspected_on', p_inspected_on, 'location', v_row.location));

  return to_jsonb(v_row);
end;
$function$;

-- payment_set_bank_account(p_route_source text, p_bank_name text, p_account_name text, p_account_no text)
--   0558: nullif(btrim(coalesce(p_bank_name, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_set_bank_account(p_route_source text, p_bank_name text, p_account_name text, p_account_no text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old payment_bank_accounts;
  v_new payment_bank_accounts;
begin
  perform public.payment_settings_gate();
  if p_route_source not in ('pj_showroom', 'dealer') then
    raise exception 'unknown order source' using errcode = '22023', detail = 'bad_route_source';
  end if;
  if coalesce(p_bank_name, '') !~ '[^[:space:]]' then
    raise exception 'the bank name is required' using errcode = '22023', detail = 'bank_required';
  end if;
  select * into v_old from payment_bank_accounts where route_source = p_route_source for update;
  update payment_bank_accounts
     set bank_name = btrim(p_bank_name),
         account_name = nullif(btrim(coalesce(p_account_name, '')), ''),
         account_no = nullif(btrim(coalesce(p_account_no, '')), ''),
         updated_by = auth.uid(), updated_at = now()
   where route_source = p_route_source
   returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('bank_account:' || p_route_source, to_jsonb(v_old), to_jsonb(v_new), auth.uid());
  return to_jsonb(v_new);
end;
$function$;

-- payment_set_collection_timing(p_ask_days_before integer, p_deadline_days_before integer, p_effective_from date, p_reason text)
--   0558: nullif(btrim(coalesce(p_reason, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_set_collection_timing(p_ask_days_before integer, p_deadline_days_before integer, p_effective_from date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old payment_collection_timing_rules;
  v_new payment_collection_timing_rules;
begin
  perform public.payment_settings_gate();
  if p_ask_days_before is null or p_deadline_days_before is null then
    raise exception 'both numbers are required' using errcode = '22023', detail = 'missing_days';
  end if;
  if p_ask_days_before <= p_deadline_days_before then
    raise exception 'asking must start earlier than the payment deadline'
      using errcode = '22023', detail = 'ask_not_before_deadline';
  end if;
  if p_effective_from is null or p_effective_from < (timezone('Asia/Kuala_Lumpur', now()))::date then  -- 0524: KL today, not the UTC clock
    raise exception 'the effective date must be today or later'
      using errcode = '22023', detail = 'bad_effective_from';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'missing_reason';
  end if;
  select * into v_old from payment_collection_timing_rules
   order by effective_from desc, created_at desc limit 1;
  insert into payment_collection_timing_rules
    (ask_days_before, deadline_days_before, effective_from, reason, created_by)
  values (p_ask_days_before, p_deadline_days_before, p_effective_from, btrim(p_reason), auth.uid())
  returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id, reason, effective_from)
  values ('collection_timing', to_jsonb(v_old), to_jsonb(v_new), auth.uid(), btrim(p_reason), p_effective_from);
  return to_jsonb(v_new);
end;
$function$;

-- payment_set_storage_rule(p_product_group text, p_free_days integer, p_charge_amount numeric, p_cycle_days integer, p_operation_limit_day integer, p_waiver_limit_day integer, p_extra_free_allowed boolean, p_inspection_days integer, p_effective_from date, p_reason text)
--   0558: nullif(btrim(coalesce(p_reason, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_set_storage_rule(p_product_group text, p_free_days integer, p_charge_amount numeric, p_cycle_days integer, p_operation_limit_day integer, p_waiver_limit_day integer, p_extra_free_allowed boolean, p_inspection_days integer, p_effective_from date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old payment_storage_rules;
  v_new payment_storage_rules;
begin
  perform public.payment_settings_gate();
  if p_product_group not in ('mattress_bedframe', 'sofa') then
    raise exception 'unknown product group' using errcode = '22023', detail = 'bad_group';
  end if;
  if p_effective_from is null or p_effective_from < (timezone('Asia/Kuala_Lumpur', now()))::date then  -- 0524: KL today, not the UTC clock
    raise exception 'the effective date must be today or later'
      using errcode = '22023', detail = 'bad_effective_from';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'missing_reason';
  end if;
  -- Automatic free days ≤ Operation limit ≤ Approver limit, where enabled.
  if p_extra_free_allowed and p_operation_limit_day is not null and p_free_days > p_operation_limit_day then
    raise exception 'free days cannot exceed the Operation limit'
      using errcode = '22023', detail = 'free_over_operation';
  end if;
  if p_extra_free_allowed and p_operation_limit_day is not null and p_waiver_limit_day is not null
     and p_operation_limit_day > p_waiver_limit_day then
    raise exception 'the Operation limit cannot exceed the Approver limit'
      using errcode = '22023', detail = 'operation_over_approver';
  end if;
  select * into v_old from payment_storage_rules
   where product_group = p_product_group
   order by effective_from desc, created_at desc limit 1;
  insert into payment_storage_rules
    (product_group, free_days, charge_amount, cycle_days, operation_limit_day,
     waiver_limit_day, extra_free_allowed, inspection_days, effective_from, created_by)
  values
    (p_product_group, p_free_days, p_charge_amount, p_cycle_days,
     p_operation_limit_day, p_waiver_limit_day, p_extra_free_allowed,
     p_inspection_days, p_effective_from, auth.uid())
  returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id, reason, effective_from)
  values ('storage_rule:' || p_product_group, to_jsonb(v_old), to_jsonb(v_new), auth.uid(),
          btrim(p_reason), p_effective_from);
  return to_jsonb(v_new);
end;
$function$;

-- payment_storage_close(p_case_id uuid, p_reason text)
--   0558: nullif(btrim(coalesce(p_reason, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_storage_close(p_case_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_case payment_storage_cases;
begin
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_recorder';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
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
$function$;

-- payment_storage_extra_free(p_case_id uuid, p_free_until date, p_reason text, p_evidence_url text)
--   0558: nullif(btrim(coalesce(p_evidence_url, '')), '') is null
--   0558: nullif(btrim(coalesce(p_reason, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_storage_extra_free(p_case_id uuid, p_free_until date, p_reason text, p_evidence_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('storage_waiver_approver', null);
  v_case payment_storage_cases;
  v_total_day integer;
  v_is_waiver_approver boolean;
begin
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
  if not v_case.rule_extra_free_allowed then
    raise exception 'extra free storage is not allowed for this group'
      using errcode = '22023', detail = 'extra_free_not_allowed';
  end if;
  if p_free_until is null or p_free_until < v_case.storage_start then
    raise exception 'the free-until date must be on or after the storage start'
      using errcode = '22023', detail = 'bad_free_until';
  end if;
  if v_case.approved_free_until is not null and p_free_until <= v_case.approved_free_until then
    raise exception 'an approval may only extend the free period'
      using errcode = '22023', detail = 'not_an_extension';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'the reason is required' using errcode = '22023', detail = 'missing_reason';
  end if;
  -- §6: no written request means no free-storage approval.
  if coalesce(p_evidence_url, '') !~ '[^[:space:]]' then
    raise exception 'the written request evidence is required'
      using errcode = '22023', detail = 'missing_written_request';
  end if;

  -- Total day counts from the start: the start day is day 1 (§7 examples).
  v_total_day := (p_free_until - v_case.storage_start) + 1;

  -- Storage Waiver Approver via the Shared Duty Resolver (0425); principal
  -- keeps the owner override. An unassigned duty resolves NULL — coalesce,
  -- or three-valued logic waves the refusal through (the 0429 lesson).
  v_is_waiver_approver := coalesce(public.app_role() = 'principal' and public.workspace_is_person(auth.uid()), false)
    or (v_uid is not null
        and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false));

  if v_case.rule_operation_limit_day is not null
     and v_total_day <= v_case.rule_operation_limit_day then
    null; -- Operation (or principal) may approve through its own limit day.
  elsif v_case.rule_waiver_limit_day is not null
        and v_total_day <= v_case.rule_waiver_limit_day then
    if not v_is_waiver_approver then
      raise exception 'only the Storage Waiver Approver may approve this far'
        using errcode = '42501', detail = 'needs_waiver_approver';
    end if;
  else
    raise exception 'no authority may approve free storage this far'
      using errcode = '22023', detail = 'beyond_every_limit';
  end if;

  update payment_storage_cases
     set approved_free_until = p_free_until,
         approved_by = v_uid,
         approved_at = now(),
         approval_reason = btrim(p_reason),
         approval_evidence_url = btrim(p_evidence_url)
   where id = p_case_id
   returning * into v_case;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (v_case.order_id,
          format('Free storage approved through %s (day %s)', p_free_until, v_total_day),
          public.app_role(), v_uid);

  return to_jsonb(v_case);
end;
$function$;

-- payment_storage_start(p_order_id uuid, p_product_group text, p_readiness_on date, p_customer_delay_on date, p_witness_note text, p_evidence_url text)
--   0558: nullif(btrim(coalesce(p_witness_note, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_storage_start(p_order_id uuid, p_product_group text, p_readiness_on date, p_customer_delay_on date, p_witness_note text, p_evidence_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_start date;
  v_rule record;
  v_case payment_storage_cases;
  v_so integer;
  v_ctrl record;
  v_legacy_fee numeric;
begin
  -- Operation records storage at the delivery-window call (§6); principal
  -- keeps the owner override. coalesce — NULL must refuse (the 0429 lesson).
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_recorder';
  end if;

  if p_product_group not in ('mattress_bedframe', 'sofa') then
    raise exception 'unknown product group' using errcode = '22023', detail = 'bad_group';
  end if;
  if p_readiness_on is null or p_customer_delay_on is null then
    raise exception 'both witnessed facts are required' using errcode = '22023', detail = 'missing_witness';
  end if;
  if p_readiness_on > v_today or p_customer_delay_on > v_today then
    raise exception 'a witness cannot be in the future' using errcode = '22023', detail = 'future_witness';
  end if;
  if coalesce(p_witness_note, '') !~ '[^[:space:]]' then
    raise exception 'the witness note is required' using errcode = '22023', detail = 'missing_note';
  end if;

  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;

  -- 0445 — the two storage models may not overlap on one order. The keyed
  -- legacy fee is the unambiguous half of C9 (`storageHold`'s override /
  -- imported ladder); its date-walked accrual stays TS-side (Law D), so this
  -- guard asks only about a KEYED, uncollected figure — the state a human
  -- created and a human can clear.
  select c.storage_fee_override, c.storage_fee_msbf, c.storage_fee_sof,
         c.storage_collected_at
    into v_ctrl
    from ops_order_control c
   where c.order_id = p_order_id;
  if found and v_ctrl.storage_collected_at is null then
    v_legacy_fee := case
      when v_ctrl.storage_fee_override is not null then greatest(0, v_ctrl.storage_fee_override)
      else greatest(0, coalesce(v_ctrl.storage_fee_msbf, 0) + coalesce(v_ctrl.storage_fee_sof, 0))
    end;
    if coalesce(v_legacy_fee, 0) > 0 then
      raise exception
        'This order still carries an uncollected storage fee of RM % from the old records. Collect it, or set the storage fee to 0 in the order, before starting a storage case.',
        to_char(v_legacy_fee, 'FM999,999,990.00')
        using errcode = '22023', detail = 'legacy_storage_fee_unreconciled';
    end if;
  end if;

  -- The system derives the start — the LATER witnessed fact (§6).
  v_start := greatest(p_readiness_on, p_customer_delay_on);

  -- Snapshot the §7 rule effective AT the start for this group.
  select r.free_days, r.charge_amount, r.cycle_days,
         r.operation_limit_day, r.waiver_limit_day, r.extra_free_allowed
    into v_rule
    from payment_storage_rules r
   where r.product_group = p_product_group
     and r.effective_from <= v_start
   order by r.effective_from desc, r.created_at desc
   limit 1;
  if v_rule is null then
    raise exception 'no storage rule is effective for this start'
      using errcode = '22023', detail = 'no_effective_rule';
  end if;

  insert into payment_storage_cases (
    order_id, product_group,
    readiness_witnessed_on, customer_delay_witnessed_on,
    delay_witness_note, delay_evidence_url,
    storage_start,
    rule_free_days, rule_charge_amount, rule_cycle_days,
    rule_operation_limit_day, rule_waiver_limit_day, rule_extra_free_allowed,
    created_by
  ) values (
    p_order_id, p_product_group,
    p_readiness_on, p_customer_delay_on,
    btrim(p_witness_note), nullif(btrim(coalesce(p_evidence_url, '')), ''),
    v_start,
    v_rule.free_days, v_rule.charge_amount, v_rule.cycle_days,
    v_rule.operation_limit_day, v_rule.waiver_limit_day, v_rule.extra_free_allowed,
    v_uid
  )
  returning * into v_case;
  -- A second start for the same order + group hits payment_storage_one_case:
  -- the FIRST valid start is permanent (§6).

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          format('Storage started · %s · %s', p_product_group, v_start),
          public.app_role(), v_uid);

  return to_jsonb(v_case);
end;
$function$;

-- payment_template_save(p_template_key uuid, p_purpose text, p_name text, p_body text)
--   0558: nullif(btrim(coalesce(p_body, '')), '') is null
--   0558: nullif(btrim(coalesce(p_name, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_template_save(p_template_key uuid, p_purpose text, p_name text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_prev payment_message_templates;
  v_row payment_message_templates;
  v_key uuid := coalesce(p_template_key, gen_random_uuid());
begin
  perform public.payment_settings_gate();
  if p_purpose not in (
    'standard_bank_transfer', 'gentle_reminder', 'should_have_been_received',
    'customer_promised', 'standard_payment_link', 'new_link_after_expiry',
    'payment_received', 'partial_payment_received') then
    raise exception 'unknown template purpose' using errcode = '22023', detail = 'bad_purpose';
  end if;
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'the template name is required' using errcode = '22023', detail = 'name_required';
  end if;
  if coalesce(p_body, '') !~ '[^[:space:]]' then
    raise exception 'the template wording is required' using errcode = '22023', detail = 'body_required';
  end if;

  if p_template_key is not null then
    select * into v_prev from payment_message_templates
     where template_key = p_template_key and is_head for update;
    if not found then
      raise exception 'template not found' using errcode = '22023', detail = 'template_not_found';
    end if;
    if v_prev.purpose <> p_purpose then
      raise exception 'a template keeps its purpose; make a new template instead'
        using errcode = '22023', detail = 'purpose_locked';
    end if;
    update payment_message_templates set is_head = false, is_default = false
     where id = v_prev.id;
  end if;

  insert into payment_message_templates
    (template_key, purpose, name, body, version, active, is_default, is_head, created_by)
  values
    (v_key, p_purpose, btrim(p_name), p_body,
     coalesce(v_prev.version, 0) + 1,
     coalesce(v_prev.active, true),
     coalesce(v_prev.is_default, false),
     true, auth.uid())
  returning * into v_row;

  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('template:' || v_key, to_jsonb(v_prev), to_jsonb(v_row), auth.uid());
  return to_jsonb(v_row);
end;
$function$;

-- payment_void(p_payment_id uuid, p_reason text)
--   0558: nullif(btrim(coalesce(p_reason, '')), '') is null
CREATE OR REPLACE FUNCTION public.payment_void(p_payment_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row order_payments; v_paid numeric; v_live_storage integer;
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('payment_approver', null);
  v_alloc record;
  v_any boolean := false;
  v_doc_no text; v_entry uuid; v_contra uuid;   -- 0463
begin
  -- 0430 §1: a void with no reason is refused.
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a reason is required to void a payment'
      using errcode = '22023', detail = 'reason_required';
  end if;
  -- 0513: the roles the API admits (operation or principal, order-payments.ts
  -- requireOperationOrPrincipal), and no others. app_role() is NULL for a
  -- disabled or unknown account, and coalesce turns that into a refusal.
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'Operation or principal only'
      using errcode = '42501', detail = 'role_not_admitted';
  end if;
  -- 0430 §2: Payment Approver duty, or principal. The duty answer is coalesced
  -- — an unassigned duty must refuse, never NULL its way past the guard.
  if not (coalesce(public.app_role() = 'principal' and public.workspace_is_person(auth.uid()), false)
          or (v_uid is not null
              and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false))) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_approver';
  end if;
  select * into v_row from order_payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found' using errcode='42P01',detail='payment_not_found'; end if;
  if v_row.voided_at is not null then raise exception 'payment is already voided' using errcode='22023',detail='already_voided'; end if;
  update order_payments set voided_at=now(),voided_by=auth.uid(),void_reason=nullif(btrim(coalesce(p_reason,'')),'') where id=p_payment_id;

  -- 0450 §3: reverse each LIVE allocation on the order that actually holds it.
  for v_alloc in select a.order_id, a.amount from payment_allocations a
                  where a.payment_id = p_payment_id and a.voided_at is null loop
    v_any := true;
    update orders set paid = greatest(0, coalesce(paid,0) - v_alloc.amount), updated_at = now()
     where id = v_alloc.order_id;
  end loop;

  update payment_allocations set voided_at=now(),voided_by=auth.uid(),void_reason=nullif(btrim(coalesce(p_reason,'')),'')
   where payment_id=p_payment_id and voided_at is null;

  if v_row.kind='storage' then
    select count(*) into v_live_storage from order_payments where order_id=v_row.order_id and kind='storage' and voided_at is null;
    if v_live_storage=0 then update ops_order_control set storage_collected_at=null,storage_paid=null,updated_by=auth.uid(),updated_at=now() where order_id=v_row.order_id; end if;
  elsif v_row.counted_in_paid and not v_any then
    -- No allocation row exists (a legacy record): the 0430 behaviour, unchanged.
    update orders set paid=greatest(0,coalesce(paid,0)-v_row.amount),updated_at=now() where id=v_row.order_id;
  end if;
  select paid into v_paid from orders where id=v_row.order_id;

  insert into ops_activity_log(order_id,action,actor_id,detail) values(v_row.order_id,'payment.voided',auth.uid(),jsonb_build_object('amount',v_row.amount,'payment_id',v_row.id,'reason',p_reason));

  -- ── 0463 · contra-reverse the journal entry, if this payment ever made one.
  -- A payment recorded before go-live has no entry; that is the quiet skip,
  -- not a failure. Anything else that goes wrong rolls the void back.
  v_doc_no := coalesce(nullif(btrim(coalesce(v_row.receipt_no, '')), ''), v_row.id::text);
  select e.id into v_entry from gl_entries e
   where e.source_type = 'CUSTOMER_PAYMENT' and e.source_doc_no = v_doc_no
     and e.posted and not e.reversed;
  if v_entry is not null then
    v_contra := public.gl_reverse(v_entry,
      coalesce(nullif(btrim(coalesce(p_reason,'')),''), 'Payment voided'));
  end if;

  return jsonb_build_object('payment_id',p_payment_id,'orders_paid',v_paid,'gl_entry_id',v_contra);
end;
$function$;

-- payment_voucher_cancel(p_voucher_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.payment_voucher_cancel(p_voucher_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.app_role()::text;
  v_v        public.payment_vouchers%rowtype;
  v_open     numeric(12,2);
  v_reversal uuid;
begin
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Say why this voucher is cancelled.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status = 'cancelled' then
    raise exception 'This payment voucher is already cancelled.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  if v_v.status = 'approved' then
    -- Money left the bank. Unbooking it takes the same approver who let it go.
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Cancelling an approved payment takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;
    -- 0484: reversing the voucher reverses the whole advance. If part of it
    -- already settles a bill, or came back, the bill would stay paid by money
    -- the ledger no longer shows. Those come off first. (The voucher row is
    -- locked above; the knock-off and money-back doors lock it too.)
    if v_v.advance_amount > 0 then
      v_open := coalesce((select ao.advance_open from public.supplier_advance_open(p_voucher_id) ao), 0);
      if v_open < v_v.advance_amount then
        raise exception 'RM % of this voucher''s advance is taken off bills or has come back. Take the advance off each bill, and cancel each money back, before cancelling the voucher.',
          to_char(v_v.advance_amount - v_open, 'FM999,999,999,990.00')
          using errcode = 'P0001', detail = 'advance_in_use';
      end if;
    end if;
    v_reversal := public.gl_reverse(v_v.gl_entry_id, btrim(p_reason));
  else
    if v_role is null or v_role not in ('finance','principal') then
      raise exception 'only finance cancels a payment voucher'
        using errcode = '42501', detail = 'not_finance';
    end if;
  end if;

  update public.payment_vouchers
     set status            = 'cancelled',
         reversal_entry_id = v_reversal,
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancel_reason     = btrim(p_reason)
   where id = p_voucher_id;

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'cancelled', btrim(p_reason));
  return v_reversal;
end;
$function$;

-- payment_voucher_reject(p_voucher_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.payment_voucher_reject(p_voucher_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := auth.uid();
  v_v    public.payment_vouchers%rowtype;
begin
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Say what must change before it comes back.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;
  if v_me is null
     or not (coalesce(v_role in ('finance','principal'), false)
             or public.has_finance_approver(v_me)) then
    raise exception 'only finance returns a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status not in ('prepared','checked') then
    raise exception 'Only a prepared or checked payment voucher can be returned to draft.'
      using errcode = 'P0001', detail = 'voucher_not_in_review';
  end if;

  update public.payment_vouchers
     set status        = 'draft',
         prepared_at   = null,
         prepared_by   = null,
         checked_at    = null,
         checked_by    = null,
         rejected_at   = now(),
         rejected_by   = v_me,
         reject_reason = btrim(p_reason)
   where id = p_voucher_id;

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'rejected', btrim(p_reason));
end;
$function$;

-- purchasing_cancel_demand(p_id uuid, p_reason text)
--   0558: btrim(coalesce(p_reason,'')) = ''
CREATE OR REPLACE FUNCTION public.purchasing_cancel_demand(p_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role app_role;
  v_d    purchase_demands;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(p_reason,'') !~ '[^[:space:]]' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'already cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;
  if v_d.remaining_qty <= 0 then
    raise exception 'demand % has nothing left to cancel', p_id
      using errcode = 'P0001', detail = 'nothing_to_cancel';
  end if;

  update purchase_demands
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_id;

  select * into v_d from purchase_demands where id = p_id;
  return jsonb_build_object(
    'id',        p_id,
    'cancelled', v_d.remaining_qty,
    'issued',    v_d.issued_qty
  );
end;
$function$;

-- purchasing_decide_request(p_id uuid, p_decision text, p_reason text, p_cuts jsonb)
--   0558: nullif(btrim(coalesce(p_reason, '')), '') is null
CREATE OR REPLACE FUNCTION public.purchasing_decide_request(p_id uuid, p_decision text, p_reason text DEFAULT NULL::text, p_cuts jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := (select public.purchasing_approver_gate());
  v_req  purchase_requests%rowtype;
  v_cut  jsonb;
  v_line purchase_demands%rowtype;
  v_qty  int;
begin
  if p_decision is null or p_decision not in ('approve', 'refuse', 'send_back') then
    raise exception 'decision must be approve, refuse or send_back'
      using errcode = '22023', detail = 'invalid_decision';
  end if;

  -- THE ONE ROW EVERY DECISION QUEUES ON (see 0522 header: lock order).
  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.withdrawn_at is not null then
    raise exception 'request was withdrawn'
      using errcode = '22023', detail = 'request_withdrawn';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  if v_req.sent_back_at is not null then
    raise exception 'request is back with the requester'
      using errcode = '22023', detail = 'request_sent_back';
  end if;
  -- Owner ruling 2026-09-18: nobody approves a Manual Purchase they raised.
  -- The requester withdraws instead; a decision is somebody else's.
  if v_req.created_by is not distinct from auth.uid() then
    raise exception 'you cannot decide a purchase you raised'
      using errcode = '42501', detail = 'own_request';
  end if;

  if p_decision in ('refuse', 'send_back') then
    if coalesce(p_reason, '') !~ '[^[:space:]]' then
      raise exception 'a decision reason is required'
        using errcode = '22023', detail = 'reason_required';
    end if;
    if p_cuts is not null then
      raise exception 'only an approval carries cuts'
        using errcode = '22023', detail = 'cuts_on_refusal';
    end if;
  end if;

  if p_decision = 'refuse' then
    update purchase_requests
       set refused_at = now(), refused_by = auth.uid(),
           refuse_reason = btrim(p_reason)
     where id = p_id;

    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase refused: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'refused');
  end if;

  if p_decision = 'send_back' then
    update purchase_requests
       set sent_back_at = now(), sent_back_by = auth.uid(),
           sent_back_reason = btrim(p_reason)
     where id = p_id;

    insert into purchase_request_events (request_id, round, kind, actor_id, reason)
    values (p_id, v_req.round, 'sent_back', auth.uid(), btrim(p_reason));

    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase sent back for changes: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'sent_back');
  end if;

  -- APPROVE. Cuts first, so a bad cut refuses the whole act atomically.
  if p_cuts is not null then
    if jsonb_typeof(p_cuts) <> 'array' then
      raise exception 'cuts must be an array'
        using errcode = '22023', detail = 'invalid_cuts';
    end if;
    for v_cut in select * from jsonb_array_elements(p_cuts) loop
      select * into v_line from purchase_demands
       where id = (v_cut ->> 'id')::uuid and request_id = p_id
       for update;
      if not found then
        raise exception 'cut names a line this request does not have'
          using errcode = '22023', detail = 'unknown_line';
      end if;
      v_qty := (v_cut ->> 'qty')::int;
      if v_qty is null or v_qty < 0 or v_qty > v_line.qty then
        raise exception 'cut for % must be between 0 and %', v_line.sku, v_line.qty
          using errcode = '22023', detail = 'invalid_cut_qty';
      end if;
      update purchase_demands set approved_qty = v_qty where id = v_line.id;
    end loop;
  end if;

  update purchase_requests
     set approved_at = now(), approved_by = auth.uid()
   where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          'Purchase approved',
          p_id::text);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'approved');
end;
$function$;

-- purchasing_po_document(p_po_id text)
--   0558: length(btrim(v_address)) = 0
CREATE OR REPLACE FUNCTION public.purchasing_po_document(p_po_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     app_role;
  v_po       purchase_orders;
  v_dest     purchasing_destinations;
  v_sup      suppliers;
  v_address  text;
  v_sup_addr text;
  v_lines    jsonb;
  v_issuer   text;
  v_missing_destination_name text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can export a PO document'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status = 'cancelled' then
    raise exception 'PO % is cancelled and cannot be exported', p_po_id
      using errcode = 'P0001', detail = 'po_not_printable';
  end if;

  select * into v_dest from purchasing_destinations where id = v_po.destination_id;
  select * into v_sup from suppliers where id = v_po.supplier_id;

  if v_dest.warehouse_id is not null then
    select address into v_address from warehouses where id = v_dest.warehouse_id;
  else
    v_address := v_dest.address;
  end if;

  if v_address is null or coalesce(v_address, '') !~ '[^[:space:]]' then
    raise exception 'no address on file for %', v_dest.name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  -- One PO may carry several destinations. Every line must still resolve to a
  -- real printable address before the formal document can leave Carres.
  select coalesce(d.name, 'the recorded Deliver To')
    into v_missing_destination_name
    from purchase_order_lines l
    left join purchasing_destinations d
      on d.id = coalesce(l.destination_id, v_po.destination_id)
    left join warehouses w on w.id = d.warehouse_id
   where l.po_id = p_po_id
     and nullif(btrim(case when d.warehouse_id is not null then w.address else d.address end), '') is null
   limit 1;

  if found then
    raise exception 'no address on file for %', v_missing_destination_name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  v_sup_addr := nullif(btrim(coalesce(v_sup.address, '')), '');

  -- audit_log's one timestamp is `occurred_at` (0001). This was incorrectly
  -- spelled `created_at` in 0383, making every document call fail before any
  -- payload could be returned.
  select actor_text into v_issuer
    from audit_log
   where ref = p_po_id and action like 'Created PO %'
   order by occurred_at asc
   limit 1;

  select coalesce(jsonb_agg(x order by x->>'sku'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
               'sku',         l.sku,
               'description', coalesce(ps.variant, l.sku),
               'qty',         l.qty,
               'unit',        'pc',
               'destination', (
                 select jsonb_build_object(
                          'name', d.name,
                          'address', case when d.warehouse_id is not null then w.address else d.address end
                        )
                   from purchasing_destinations d
                   left join warehouses w on w.id = d.warehouse_id
                  where d.id = coalesce(l.destination_id, v_po.destination_id)
               ),
               'attrs',       (
                 select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                   from jsonb_each(coalesce(l.attrs, '{}'::jsonb)) as e(k, v)
                  where k in ('color', 'gap', 'fabric_name')
               ),
               -- 0443 · the Units THIS LINE was born with, by immutable line
               -- binding — never `(po_no, sku)`. Retired (voided) Units of a
               -- reduced revision stay off the current paper; a quantity
               -- line prints none because it has none.
               'identity_mode', l.identity_mode,
               'unit_codes', (
                 select coalesce(jsonb_agg(si.unit_code order by si.unit_code), '[]'::jsonb)
                   from ops_stock_items si
                  where si.po_line_id = l.id
                    and si.identity_scope = 'unit'
                    and si.status <> 'voided'
               ),
               'sources', (
                 select coalesce(
                          jsonb_agg(jsonb_build_object('so', s.so, 'qty', s.qty)
                                    order by s.so nulls last),
                          '[]'::jsonb)
                   from po_line_sources s
                  where s.po_line_id = l.id
               )
             ) as x
        from purchase_order_lines l
        left join product_skus ps on ps.sku = l.sku
       where l.po_id = p_po_id
    ) s;

  return jsonb_build_object(
    'po_number',   v_po.id,
    'po_id',       v_po.id,
    'version',     coalesce(v_po.version, 1),
    'issue_date',  to_char(coalesce(v_po.placed_at, now()), 'YYYY-MM-DD'),
    'supplier', jsonb_build_object(
      'name',    coalesce(v_sup.name, 'Supplier'),
      'address', v_sup_addr,
      'contact', v_sup.contact
    ),
    'destination', jsonb_build_object(
      'name',    v_dest.name,
      'address', v_address
    ),
    'delivery_instructions', nullif(btrim(coalesce(v_po.delivery_instructions, '')), ''),
    'eta_date',    v_po.official_delivery_date,
    'so_refs',     to_jsonb(coalesce(v_po.so_refs, array[]::int[])),
    'issued_by',   v_issuer,
    'lines',       v_lines,
    'terms',       null
  );
end;
$function$;

-- purchasing_require_reply_evidence()
--   0558: nullif(btrim(new.reported_by),'') is null
--   0558: nullif(btrim(new.evidence),'') is null
--   0558: nullif(btrim(new.recipient),'') is null
CREATE OR REPLACE FUNCTION public.purchasing_require_reply_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_po public.purchase_orders; v_who jsonb;
begin
  if new.kind <> 'tomorrow_delivery' then return new; end if;
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true then
    raise exception 'Ask PO Duty to record the supplier answer.' using errcode='42501';
  end if;
  select * into v_po from public.purchase_orders where id=new.po_id for update;
  if new.po_version is distinct from coalesce(v_po.version,1) then
    raise exception 'Open the current PO and record the supplier answer.' using errcode='22023',detail='stale_po_version';
  end if;
  if v_po.status <> 'open' or not exists(select 1 from public.purchase_order_lines
    where po_id=v_po.id and qty>received_qty) then
    raise exception 'This PO has no goods left to deliver.' using errcode='22023',detail='po_not_open';
  end if;
  if not exists(select 1 from public.po_sends where po_id=v_po.id
    and kind='confirmed_sent' and po_version=new.po_version) then
    raise exception 'Record the current PO PDF sent before the supplier answer.' using errcode='22023',detail='po_not_sent';
  end if;
  -- The classification is derived from the recorded original date; a row that
  -- claims otherwise is refused whole. A reason exists only on a delay.
  if new.answer is null or new.new_date is null
    or new.answer not in ('confirmed','earlier','delayed','reported')
    or (new.answer='reported' and v_po.official_delivery_date is not null)
    or (new.answer<>'reported' and (
          v_po.official_delivery_date is null
          or new.about_date is distinct from v_po.official_delivery_date
          or (new.answer='confirmed' and new.new_date <> v_po.official_delivery_date)
          or (new.answer='earlier'   and new.new_date >= v_po.official_delivery_date)
          or (new.answer='delayed'   and new.new_date <= v_po.official_delivery_date)))
    or (new.answer='delayed' and coalesce(new.reason,'') not in ('Production Delay','Material Shortage','Transport Delay','Waiting Customer Confirmation','Factory Closed','Other'))
    or (new.answer<>'delayed' and new.reason is not null) then
    raise exception 'Record the supplier delivery date and reason.' using errcode='22023',detail='invalid_input';
  end if;
  if new.channel is null or new.channel not in ('whatsapp','email','phone','in_person')
    or coalesce(new.recipient, '') !~ '[^[:space:]]' or coalesce(new.evidence, '') !~ '[^[:space:]]'
    or coalesce(new.reported_by, '') !~ '[^[:space:]]' or new.reported_at is null
    or left(new.evidence,length(new.po_id)+1) is distinct from new.po_id || '/'
    or not exists(select 1 from storage.objects where bucket_id='delivery-orders' and name=new.evidence)
    or length(new.recipient)>200 or length(new.reported_by)>200 or length(new.evidence)>2000
    or length(new.remarks)>500
    or new.reported_at < (select min(sent_at) from public.po_sends where po_id=v_po.id and kind='confirmed_sent' and po_version=new.po_version)
    or new.reported_at > now() or new.recorded_by is distinct from auth.uid()
    or auth.uid() is null then
    raise exception 'Record the reply channel, recipient, evidence, reporter and time.' using errcode='22023',detail='reply_evidence_required';
  end if;
  new.duty_user_id := nullif(v_who->>'normal_user_id','')::uuid;
  new.acting_user_id := nullif(v_who->>'acting_user_id','')::uuid;
  new.recorded_at:=clock_timestamp();
  return new;
end;
$function$;

-- receiving_amend(p_receipt_id uuid, p_reason text, p_changes jsonb, p_save_key uuid)
--   0558: length(btrim(coalesce(v_chg->>'path',''))) < 3
--   0558: length(v_new_do_file) < 3
--   0558: length(v_new_do) < 3
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.receiving_amend(p_receipt_id uuid, p_reason text, p_changes jsonb, p_save_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ctx jsonb;
  v_receipt warehouse_receipts;
  v_po purchase_orders;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_new_date date; v_new_do text; v_new_site uuid;
  v_clash warehouse_receipts;
  v_lines jsonb; v_chg jsonb; v_stored jsonb; v_stored_lines jsonb;
  v_line_id uuid; v_old_recv int; v_new_recv int; v_d int;
  v_pol purchase_order_lines;
  v_posts_stock boolean; v_site uuid; v_is_own boolean;
  v_moved int; v_supplier_name text;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_qty_changed boolean := false;
  v_outstanding int;
  v_prior_event receiving_events;
  -- 0427
  v_new_do_file text;
  v_evidence_add jsonb;
  v_evidence_before int;
  -- 0444
  v_rest int;
  v_bulk ops_stock_items;
begin
  v_ctx := public.receiving_require_post_authority();
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a correction reason is required'
      using errcode = '22023', detail = 'amend_reason_required';
  end if;

  -- Idempotency: the same amendment save key returns the recorded event.
  if p_save_key is not null then
    select * into v_prior_event from receiving_events
     where receipt_id = p_receipt_id and event = 'amended'
       and payload->>'save_key' = p_save_key::text
     limit 1;
    if found then
      return jsonb_build_object('receipt_id', p_receipt_id,
                                'status', 'posted', 'already_saved', true);
    end if;
  end if;

  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'posted' then
    raise exception 'only a posted receiving can be amended'
      using errcode = '22023', detail = 'receipt_not_posted';
  end if;

  select * into v_po from purchase_orders where id = v_receipt.po_id for update;

  -- Where this session's stock consequence lives.
  v_site := coalesce(v_receipt.actual_site_id, v_po.warehouse_id);
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false) or v_receipt.actual_site_id is not null;
  select (kind = 'own') into v_is_own from warehouses where id = v_site;
  v_is_own := coalesce(v_is_own, false);
  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  -- ── header facts ─────────────────────────────────────────────────────────
  if p_changes ? 'goods_received_at' then
    v_new_date := nullif(p_changes->>'goods_received_at','')::date;
    if v_new_date is null or v_new_date > v_today_myt then
      raise exception 'Goods received on cannot be in the future'
        using errcode = '22023', detail = 'received_date_future';
    end if;
    if v_new_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Goods received on cannot be before the PO date (%)',
                      to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
        using errcode = '22023', detail = 'received_date_before_po';
    end if;
    if v_new_date is distinct from v_receipt.goods_received_at then
      v_before := v_before || jsonb_build_object('goods_received_at', v_receipt.goods_received_at);
      v_after  := v_after  || jsonb_build_object('goods_received_at', v_new_date);
      update warehouse_receipts set goods_received_at = v_new_date, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'do_number' then
    v_new_do := btrim(coalesce(p_changes->>'do_number',''));
    if (length(v_new_do) < 3 or coalesce(v_new_do, '') !~ '[^[:space:]]') then
      raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
    end if;
    if lower(v_new_do) is distinct from lower(coalesce(v_receipt.do_number,'')) then
      select * into v_clash from warehouse_receipts
       where po_id = v_receipt.po_id and lower(btrim(do_number)) = lower(v_new_do)
         and id <> v_receipt.id and status <> 'voided' limit 1;
      if found then
        raise exception 'DO % already belongs to another receiving (session %)', v_new_do, v_clash.id
          using errcode = 'P0001', detail = 'do_already_received';
      end if;
      v_before := v_before || jsonb_build_object('do_number', v_receipt.do_number);
      v_after  := v_after  || jsonb_build_object('do_number', v_new_do);
      update warehouse_receipts set do_number = v_new_do, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'actual_site_id' then
    v_new_site := nullif(p_changes->>'actual_site_id','')::uuid;
    if v_new_site is not null and not exists (select 1 from warehouses where id = v_new_site) then
      raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
    end if;
    if v_new_site is distinct from v_receipt.actual_site_id then
      v_before := v_before || jsonb_build_object('actual_site_id', v_receipt.actual_site_id);
      v_after  := v_after  || jsonb_build_object('actual_site_id', v_new_site);
      update warehouse_receipts set actual_site_id = v_new_site, updated_at = now()
       where id = p_receipt_id;
      -- The recorded location truth changes; posted stock is NOT silently
      -- relocated — a physical move is Stock's transfer door.
    end if;
  end if;

  -- ── 0427 · the paper's evidence ──────────────────────────────────────────
  if p_changes ? 'do_file_path' then
    v_new_do_file := btrim(coalesce(p_changes->>'do_file_path',''));
    if (length(v_new_do_file) < 3 or coalesce(v_new_do_file, '') !~ '[^[:space:]]') then
      raise exception 'a corrected DO file is required'
        using errcode = '22023', detail = 'do_file_invalid';
    end if;
    if v_new_do_file is distinct from coalesce(v_receipt.do_file_path,'') then
      -- The old paper is PRESERVED in before/after; the file is never deleted.
      v_before := v_before || jsonb_build_object('do_file_path', v_receipt.do_file_path);
      v_after  := v_after  || jsonb_build_object('do_file_path', v_new_do_file);
      update warehouse_receipts set do_file_path = v_new_do_file, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'arrival_evidence_add' then
    v_evidence_add := p_changes->'arrival_evidence_add';
    if v_evidence_add is not null and jsonb_typeof(v_evidence_add) = 'array'
       and jsonb_array_length(v_evidence_add) > 0 then
      for v_chg in select * from jsonb_array_elements(v_evidence_add) loop
        if (length(btrim(coalesce(v_chg->>'path',''))) < 3 or coalesce(v_chg->>'path','') !~ '[^[:space:]]')
           or coalesce(v_chg->>'kind','') not in ('photo','video') then
          raise exception 'invalid arrival evidence entry'
            using errcode = '22023', detail = 'evidence_invalid';
        end if;
      end loop;
      v_evidence_before :=
        coalesce(jsonb_array_length(coalesce(v_receipt.arrival_evidence, '[]'::jsonb)), 0);
      v_before := v_before || jsonb_build_object('arrival_evidence_count', v_evidence_before);
      v_after  := v_after  || jsonb_build_object(
        'arrival_evidence_count', v_evidence_before + jsonb_array_length(v_evidence_add));
      -- APPEND-ONLY: an amendment never removes recorded evidence.
      update warehouse_receipts
         set arrival_evidence = coalesce(arrival_evidence, '[]'::jsonb) || v_evidence_add,
             updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  -- ── per-line received-quantity corrections ───────────────────────────────
  v_lines := p_changes->'lines';
  if v_lines is not null and jsonb_typeof(v_lines) = 'array' and jsonb_array_length(v_lines) > 0 then
    v_stored_lines := coalesce(v_receipt.lines, '[]'::jsonb);
    for v_chg in select * from jsonb_array_elements(v_lines) loop
      v_line_id := nullif(v_chg->>'id','')::uuid;
      v_new_recv := nullif(v_chg->>'received_now','')::int;
      if v_line_id is null or v_new_recv is null or v_new_recv < 0 then
        raise exception 'invalid correction line' using errcode = '22023', detail = 'invalid_line';
      end if;
      select t.val into v_stored
        from jsonb_array_elements(v_stored_lines) as t(val)
       where (t.val->>'id')::uuid = v_line_id limit 1;
      if v_stored is null then
        raise exception 'this receiving did not count that line'
          using errcode = '22023', detail = 'line_not_in_session';
      end if;
      v_old_recv := coalesce((v_stored->>'received_now')::int, 0);
      v_d := v_new_recv - v_old_recv;
      if v_d = 0 then continue; end if;
      v_qty_changed := true;

      select * into v_pol from purchase_order_lines
       where id = v_line_id and po_id = v_receipt.po_id for update;
      if not found then
        raise exception 'PO line not found for id=%', v_line_id
          using errcode = '42P01', detail = 'po_line_not_found';
      end if;

      if v_d > 0 then
        -- Under-count correction: the goods were in the SAME physical
        -- arrival, so they join this session (a NEW arrival is a NEW
        -- session/GRN, never an amendment).
        if v_pol.received_qty + v_d > v_pol.qty then
          raise exception 'line % would exceed its Order Qty', v_pol.sku
            using errcode = 'P0001', detail = 'over_received';
        end if;
        update purchase_order_lines set received_qty = received_qty + v_d
         where id = v_line_id;
        if v_posts_stock then
          -- 0444 · an under-count correction flips this LINE's own incoming
          -- Units (oldest first). An exact-unit line that has none left to
          -- flip is refused: Receiving never invents an identity. A quantity
          -- line records the rest as a bulk register row.
          with freed as (
            update ops_stock_items
               set status = 'free', warehouse_id = v_site, updated_at = now()
             where id in (
               select id from ops_stock_items
                where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
                order by created_at limit v_d)
            returning 1)
          select count(*) into v_moved from freed;
          v_rest := v_d - v_moved;
          if v_rest > 0 then
            if v_pol.identity_mode = 'exact_unit' then
              raise exception 'line % has no more expected Units to receive', v_pol.sku
                using errcode = 'P0001', detail = 'exact_unit_line_needs_units';
            end if;
            insert into ops_stock_items
              (unit_code, sku, warehouse_id, status, supplier, po_no, po_line_id,
               identity_scope, qty, source_ref, date_in)
            values
              (public.gen_quantity_key(), v_pol.sku, v_site, 'free',
               v_supplier_name, v_receipt.po_id, v_line_id,
               'quantity', v_rest, format('amend:%s', p_receipt_id), current_date);
          end if;
        end if;
      else
        -- Over-count correction: reverse the exact consequence, or refuse
        -- with the named blocker.
        if exists (
          select 1 from order_supplier_threads
           where po_id = v_receipt.po_id
             and operation_stage in ('ready_to_dispatch','dispatched','delivered')
        ) then
          raise exception 'goods from % already moved to dispatch — the count cannot be lowered', v_receipt.po_id
            using errcode = 'P0001', detail = 'threads_block_amend';
        end if;
        if v_pol.received_qty + v_d < 0 then
          raise exception 'line % cannot go below zero received', v_pol.sku
            using errcode = 'P0001', detail = 'lines_block_amend';
        end if;
        if v_posts_stock then
          -- Exact units first: this session's own received results, still free.
          with take as (
            select r.stock_item_id from receiving_unit_results r
              join ops_stock_items i on i.id = r.stock_item_id
             where r.receipt_id = p_receipt_id and r.outcome = 'received'
               and i.status = 'free'
             order by r.created_at desc limit (-v_d)
          ), back as (
            update ops_stock_items set status = 'incoming',
                   warehouse_id = v_po.warehouse_id, updated_at = now()
             where id in (select stock_item_id from take)
            returning id)
          select count(*) into v_moved from back;
          if v_moved < (-v_d) then
            -- 0444 · by LINE. Exact Units go back to incoming; a quantity
            -- line's bulk rows shrink (a row that reaches zero is retired,
            -- never deleted).
            with take as (
              select id from ops_stock_items
               where po_line_id = v_line_id and identity_scope = 'unit' and status = 'free'
               order by created_at desc limit ((-v_d) - v_moved)
            ), back as (
              update ops_stock_items set status = 'incoming',
                     warehouse_id = v_po.warehouse_id, updated_at = now()
               where id in (select id from take)
              returning id)
            select v_moved + count(*) into v_moved from back;
          end if;
          while v_moved < (-v_d) loop
            select * into v_bulk from ops_stock_items
             where po_line_id = v_line_id and identity_scope = 'quantity' and status = 'free'
             order by created_at desc limit 1 for update;
            exit when not found;
            v_rest := least(v_bulk.qty, (-v_d) - v_moved);
            if v_rest = v_bulk.qty then
              update ops_stock_items set status = 'voided', updated_at = now() where id = v_bulk.id;
            else
              update ops_stock_items set qty = qty - v_rest, updated_at = now() where id = v_bulk.id;
            end if;
            v_moved := v_moved + v_rest;
          end loop;
          if v_moved < (-v_d) then
            raise exception 'units on % are reserved or moved — the count cannot be lowered', v_pol.sku
              using errcode = 'P0001', detail = 'units_block_amend';
          end if;
          -- The rollup triggers lower the derived `stock_balances` as the
          -- Units return to incoming (0366).
          -- The unit results this correction reversed read Not received now.
          update receiving_unit_results r
             set outcome = 'not_received', issue_kind = null
            from ops_stock_items i
           where r.receipt_id = p_receipt_id and r.stock_item_id = i.id
             and r.outcome = 'received' and i.status = 'incoming';
        end if;
        update purchase_order_lines set received_qty = received_qty + v_d
         where id = v_line_id;
        -- Un-completing the PO restores the snapshot taken at posting.
        select count(*) into v_outstanding
          from purchase_order_lines where po_id = v_receipt.po_id and received_qty < qty;
        if v_po.status = 'received' and v_outstanding > 0 then
          if v_receipt.po_status_before is null then
            raise exception 'this receiving completed the PO before state snapshots existed'
              using errcode = 'P0001', detail = 'legacy_completion_block_amend';
          end if;
          update purchase_orders
             set status = v_receipt.po_status_before::po_status,
                 sup_status = v_receipt.sup_status_before::po_sup_status,
                 updated_at = now()
           where id = v_receipt.po_id;
        end if;
      end if;

      v_before := v_before || jsonb_build_object('line_' || v_line_id, v_old_recv);
      v_after  := v_after  || jsonb_build_object('line_' || v_line_id, v_new_recv);
      -- The session's own record states the corrected count.
      update warehouse_receipts
         set lines = (
           select jsonb_agg(case when (t.val->>'id')::uuid = v_line_id
                                 then jsonb_set(t.val, '{received_now}', to_jsonb(v_new_recv))
                                 else t.val end)
             from jsonb_array_elements(warehouse_receipts.lines) as t(val)),
             updated_at = now()
       where id = p_receipt_id;
    end loop;
  end if;

  if v_before = '{}'::jsonb then
    raise exception 'nothing changed — state the correction first'
      using errcode = '22023', detail = 'nothing_to_amend';
  end if;

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'amended', v_uid,
          jsonb_build_object('reason', btrim(p_reason),
                             'before', v_before, 'after', v_after,
                             'save_key', p_save_key,
                             'grn_no', v_receipt.grn_no,
                             'quantities_changed', v_qty_changed,
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving %s amended — %s',
                 coalesce(v_receipt.grn_no, 'record'), btrim(p_reason)),
          public.app_role(), v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Amended %s — %s', coalesce(v_receipt.grn_no, p_receipt_id::text), btrim(p_reason)),
          v_receipt.po_id);

  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'posted',
                            'before', v_before, 'after', v_after);
end;
$function$;

-- receiving_arrival_post(p_source_id uuid, p_input jsonb)
--   0558: nullif(btrim(p_input->>'do_file_path'),'') is null
--   0558: nullif(btrim(p_input->>'do_number'),'') is null
--   0558: nullif(btrim(p_input->>'handover_person'),'') is null
CREATE OR REPLACE FUNCTION public.receiving_arrival_post(p_source_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s arrival_sources; r warehouse_receipts; u ops_stock_items; v jsonb; v_units jsonb; v_lines jsonb;
 ctx jsonb; v_grn text; v_receipt uuid:=gen_random_uuid(); v_before jsonb:='{}'; v_after jsonb:='{}'; v_expected int; v_seen uuid[]:='{}'; v_id uuid;
 v_site uuid:=(p_input->>'actual_site_id')::uuid; v_holder uuid:=(p_input->>'holder_party_id')::uuid;
begin
 perform arrival_source_gate();
 ctx:=receiving_require_post_authority();
 select * into s from arrival_sources where id=p_source_id for update;
 if not found then raise exception 'source not found' using errcode='P0002'; end if;
 select * into r from warehouse_receipts where save_key=(p_input->>'key')::uuid;
 if found then
  if r.arrival_source_id is distinct from p_source_id or r.posted_by<>auth.uid() or not exists(select 1 from receiving_events where receipt_id=r.id and event='posted' and payload->'input'=p_input) then raise exception 'receiving key already used' using errcode='40001'; end if;
  return to_jsonb(r);
 end if;
 if s.cancelled_at is not null then raise exception 'source cancelled' using errcode='22023'; end if;
 if (p_input->>'goods_received_at')::date > (now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'actual receipt cannot be in the future' using errcode='22023'; end if;
 if not exists(select 1 from warehouses where id=v_site) or not exists(select 1 from stock_operating_parties where id=v_holder and active and kind in ('warehouse_operator','showroom','partner')) then raise exception 'record the actual Site and receiving party' using errcode='22023'; end if;
 if coalesce(p_input->>'handover_person', '') !~ '[^[:space:]]' or coalesce(p_input->>'do_number', '') !~ '[^[:space:]]' or coalesce(p_input->>'do_file_path', '') !~ '[^[:space:]]' then raise exception 'handover person, document and proof required' using errcode='22023'; end if;
 if exists(select 1 from warehouse_receipts where arrival_source_id=p_source_id and status<>'voided' and lower(btrim(do_number))=lower(btrim(p_input->>'do_number'))) then raise exception 'this handover document already has a Receiving' using errcode='40001'; end if;
 if split_part(p_input->>'do_file_path','/',1)<>p_source_id::text or not exists(select 1 from storage.objects where bucket_id='arrival-proofs' and name=p_input->>'do_file_path') then raise exception 'upload this source handover proof first' using errcode='22023'; end if;
 v_units:=p_input->'units';
 if jsonb_typeof(v_units)<>'array' or jsonb_array_length(v_units)=0 or jsonb_array_length(v_units)>200 then raise exception 'record exact Unit outcomes' using errcode='22023'; end if;
 if not exists(select 1 from jsonb_array_elements(v_units) x where x->>'outcome' in ('received','received_with_issue')) then raise exception 'record at least one received Unit' using errcode='22023'; end if;
 -- Lock all named Units in deterministic order. Omitted Units retain their
 -- last confirmed holder; no quantity-based or whole-source transition.
 for v in select value from jsonb_array_elements(v_units) order by value->>'stock_item_id' loop
  v_id:=(v->>'stock_item_id')::uuid;
  if v_id=any(v_seen) then raise exception 'Unit scanned twice' using errcode='22023'; end if;
  v_seen:=array_append(v_seen,v_id);
  select * into u from ops_stock_items where id=v_id for update;
  if not found or u.qty<>1 or not exists(select 1 from arrival_source_units where source_id=p_source_id and stock_item_id=v_id) then raise exception 'Unit not expected on this source' using errcode='22023'; end if;
  if coalesce(v->>'outcome','') not in ('received','received_with_issue','not_received') or ((v->>'outcome'='received_with_issue') <> (nullif(v->>'issue_kind','') is not null)) or (nullif(v->>'issue_kind','') is not null and v->>'issue_kind' not in ('damaged','wrong_item')) then raise exception 'record a valid per-Unit result' using errcode='22023'; end if;
  if v->>'outcome'<>'not_received' and exists(select 1 from receiving_unit_results ur join warehouse_receipts wr on wr.id=ur.receipt_id where wr.arrival_source_id=p_source_id and wr.status='posted' and ur.stock_item_id=v_id and ur.outcome<>'not_received') then raise exception 'Unit already received on this source' using errcode='40001'; end if;
  v_before:=v_before||jsonb_build_object(u.id::text,to_jsonb(u));
  if v->>'outcome'<>'not_received' and u.status in ('voided','written_off','returned_to_supplier') then raise exception 'ended Unit cannot be received' using errcode='22023'; end if;
 end loop;
 -- Keep the existing line-based GRN readers usable. Commercial PO quantities
 -- are not touched: these lines describe only the exact named physical results.
 select jsonb_agg(jsonb_build_object('id',i.id,'sku',i.sku,'received_now',case when x->>'outcome'='received' then 1 else 0 end,'damaged_qty',case when x->>'issue_kind'='damaged' then 1 else 0 end,'wrong_item_qty',case when x->>'issue_kind'='wrong_item' then 1 else 0 end,'units',jsonb_build_array(x||jsonb_build_object('unit_code',i.unit_code)))) into v_lines
 from jsonb_array_elements(v_units) x join ops_stock_items i on i.id=(x->>'stock_item_id')::uuid;
 v_grn:=allocate_formal_document_code('GRN',v_receipt::text);
 insert into warehouse_receipts(id,arrival_source_id,warehouse_id,actual_site_id,do_number,do_file_path,note,lines,status,submitted_from,goods_received_at,submitted_by,posted_by,posted_at,grn_no,save_key,posted_duty_holder,posted_duty_cover,posted_authority)
 values(v_receipt,p_source_id,v_site,v_site,btrim(p_input->>'do_number'),btrim(p_input->>'do_file_path'),nullif(btrim(p_input->>'note'),''),v_lines,'posted','office',(p_input->>'goods_received_at')::date,auth.uid(),auth.uid(),now(),v_grn,(p_input->>'key')::uuid,nullif(ctx->>'normal_user_id','')::uuid,nullif(ctx->>'acting_user_id','')::uuid,case when coalesce((ctx->>'is_superuser')::boolean,false) and auth.uid() is distinct from nullif(ctx->>'actor_user_id','')::uuid then 'superuser' when coalesce((ctx->>'is_cover')::boolean,false) and auth.uid()=nullif(ctx->>'acting_user_id','')::uuid then 'cover' else 'grn_duty' end) returning * into r;
 perform receiving_record_unit_results(v_receipt,v_lines);
 for v in select value from jsonb_array_elements(v_units) loop
  if v->>'outcome'='not_received' then continue; end if;
  v_id:=(v->>'stock_item_id')::uuid;
  select * into u from ops_stock_items where id=v_id;
  update ops_stock_items set warehouse_id=v_site,holder_party_id=v_holder,last_verified_at=now(),
   status=case when reserved_ref is not null then 'reserved' when s.kind in ('customer-return','failed-delivery-return','repair-return') or v->>'outcome'='received_with_issue' then 'on_hold' else 'free' end,
   needs_repair=case when reserved_ref is not null and (s.kind in ('customer-return','failed-delivery-return','repair-return') or v->>'outcome'='received_with_issue') then true else needs_repair end,
   hold_reason=case when s.kind in ('customer-return','failed-delivery-return') then 'customer_return' when s.kind='repair-return' or v->>'outcome'='received_with_issue' then 'inspection' else hold_reason end,
   held_at=case when s.kind in ('customer-return','failed-delivery-return','repair-return') or v->>'outcome'='received_with_issue' then now() else held_at end,
   updated_at=now() where id=v_id;
 end loop;
 select jsonb_object_agg(i.id::text,to_jsonb(i)) into v_after from ops_stock_items i where i.id=any(v_seen);
 insert into receiving_events(receipt_id,event,actor_id,payload) values(v_receipt,'posted',auth.uid(),jsonb_build_object('source_id',p_source_id,'input',p_input,'lines',v_lines,'duty',ctx,'before_units',v_before,'after_units',v_after));
 return to_jsonb(r);
end $function$;

-- receiving_arrival_void(p_receipt_id uuid, p_reason text)
--   0558: nullif(btrim(p_reason),'') is null
CREATE OR REPLACE FUNCTION public.receiving_arrival_void(p_receipt_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r warehouse_receipts; p jsonb; old_u ops_stock_items; now_u ops_stock_items; ur receiving_unit_results;
begin
 perform arrival_source_gate(); perform receiving_require_post_authority();
 select * into r from warehouse_receipts where id=p_receipt_id for update;
 if not found or r.arrival_source_id is null then raise exception 'arrival Receiving not found' using errcode='P0002'; end if;
 perform 1 from arrival_sources where id=r.arrival_source_id for update;
 if r.status='voided' then return to_jsonb(r); end if;
 if r.status<>'posted' or coalesce(p_reason, '') !~ '[^[:space:]]' then raise exception 'valid Receiving and reason required' using errcode='22023'; end if;
 select payload into p from receiving_events where receipt_id=r.id and event='posted';
 for ur in select * from receiving_unit_results where receipt_id=r.id and outcome<>'not_received' order by stock_item_id loop
  select * into now_u from ops_stock_items where id=ur.stock_item_id for update;
  if p->'after_units'->ur.stock_item_id::text is distinct from to_jsonb(now_u) then raise exception 'Unit % changed after Receiving; correct its later record first',ur.unit_code using errcode='40001'; end if;
 end loop;
 insert into receiving_events(receipt_id,event,actor_id,payload) values(r.id,'voided',auth.uid(),jsonb_build_object('reason',btrim(p_reason),'before_units',p->'before_units','voided_at',now()));
 for ur in select * from receiving_unit_results where receipt_id=r.id and outcome<>'not_received' order by stock_item_id loop
  select * into old_u from jsonb_populate_record(null::ops_stock_items,p->'before_units'->ur.stock_item_id::text);
  update ops_stock_items set warehouse_id=old_u.warehouse_id,holder_party_id=old_u.holder_party_id,status=old_u.status,needs_repair=old_u.needs_repair,hold_reason=old_u.hold_reason,held_at=old_u.held_at,last_verified_at=old_u.last_verified_at,updated_at=now() where id=ur.stock_item_id;
 end loop;
 update warehouse_receipts set status='voided',void_at=now(),void_by=auth.uid(),void_reason=btrim(p_reason) where id=r.id returning * into r;
 return to_jsonb(r);
end $function$;

-- receiving_validate_session_extras(p_arrival_evidence jsonb, p_extra_lines jsonb)
--   0558: length(btrim(coalesce(v->>'path',''))) = 0
CREATE OR REPLACE FUNCTION public.receiving_validate_session_extras(p_arrival_evidence jsonb, p_extra_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb; v_ev jsonb := '[]'::jsonb; v_extra jsonb := '[]'::jsonb;
begin
  if p_arrival_evidence is not null and jsonb_typeof(p_arrival_evidence) = 'array' then
    for v in select * from jsonb_array_elements(p_arrival_evidence) loop
      if coalesce(v->>'path','') !~ '[^[:space:]]'
         or coalesce(v->>'kind','') not in ('photo','video') then
        raise exception 'arrival evidence must be a photo or video file'
          using errcode = '22023', detail = 'evidence_kind_invalid';
      end if;
      v_ev := v_ev || jsonb_build_array(jsonb_build_object(
        'path', btrim(v->>'path'), 'kind', v->>'kind'));
    end loop;
  end if;
  if p_extra_lines is not null and jsonb_typeof(p_extra_lines) = 'array' then
    for v in select * from jsonb_array_elements(p_extra_lines) loop
      if length(btrim(coalesce(v->>'sku',''))) = 0
         or coalesce(nullif(v->>'qty','')::int, 0) <= 0 then
        raise exception 'an extra goods line needs a SKU and a quantity'
          using errcode = '22023', detail = 'extra_line_invalid';
      end if;
      v_extra := v_extra || jsonb_build_array(jsonb_build_object(
        'sku', btrim(v->>'sku'),
        'qty', (v->>'qty')::int,
        'note', nullif(btrim(coalesce(v->>'note','')), '')));
    end loop;
  end if;
  return jsonb_build_object('arrival_evidence', v_ev, 'extra_lines', v_extra);
end;
$function$;

-- receiving_void(p_receipt_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.receiving_void(p_receipt_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ctx jsonb;
  v_receipt warehouse_receipts;
  v_po purchase_orders;
  v_line jsonb; v_pol purchase_order_lines;
  v_recv int; v_dmg int; v_wrong int;
  v_posts_stock boolean; v_site uuid; v_moved int;
  v_claims int;
begin
  v_ctx := public.receiving_require_post_authority();
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a void reason is required'
      using errcode = '22023', detail = 'void_reason_required';
  end if;
  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status = 'voided' then
    return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'voided',
                              'already_saved', true);
  end if;
  if v_receipt.status <> 'posted' then
    raise exception 'only a posted receiving can be voided'
      using errcode = '22023', detail = 'receipt_not_posted';
  end if;

  select * into v_po from purchase_orders where id = v_receipt.po_id for update;
  v_site := coalesce(v_receipt.actual_site_id, v_po.warehouse_id);
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false) or v_receipt.actual_site_id is not null;

  -- ── named downstream blockers, never a partial void ──────────────────────
  select count(*) into v_claims from supplier_claims
   where warehouse_receipt_id = p_receipt_id;
  if v_claims > 0 then
    raise exception '% supplier claim(s) were opened from this receiving — settle them first', v_claims
      using errcode = 'P0001', detail = 'claims_block_void';
  end if;
  if exists (
    select 1 from order_supplier_threads
     where po_id = v_receipt.po_id
       and operation_stage in ('ready_to_dispatch','dispatched','delivered')
  ) then
    raise exception 'goods from % already moved to dispatch — this receiving cannot be voided', v_receipt.po_id
      using errcode = 'P0001', detail = 'threads_block_void';
  end if;
  if v_po.status = 'received' and v_receipt.po_status_before is null then
    raise exception 'this receiving completed the PO before state snapshots existed'
      using errcode = 'P0001', detail = 'legacy_completion_block_void';
  end if;

  -- ── reverse every line exactly ───────────────────────────────────────────
  for v_line in select * from jsonb_array_elements(coalesce(v_receipt.lines, '[]'::jsonb)) loop
    v_recv  := coalesce((v_line->>'received_now')::int, 0);
    v_dmg   := coalesce((v_line->>'damaged_qty')::int, 0);
    v_wrong := coalesce((v_line->>'wrong_item_qty')::int, 0);
    if v_recv + v_dmg + v_wrong = 0 then continue; end if;
    select * into v_pol from purchase_order_lines
     where id = (v_line->>'id')::uuid and po_id = v_receipt.po_id for update;
    if not found then
      raise exception 'PO line % is gone — this receiving cannot be voided automatically', v_line->>'sku'
        using errcode = 'P0001', detail = 'lines_block_void';
    end if;
    if v_pol.received_qty < v_recv or v_pol.damaged_qty < v_dmg or v_pol.wrong_item_qty < v_wrong then
      raise exception 'line % no longer carries this receiving''s quantities', v_pol.sku
        using errcode = 'P0001', detail = 'lines_block_void';
    end if;

    if v_recv > 0 and v_posts_stock then
      -- Exact units first; a legacy quantity session reverses newest-first.
      with take as (
        select r.stock_item_id from receiving_unit_results r
          join ops_stock_items i on i.id = r.stock_item_id
         where r.receipt_id = p_receipt_id and r.outcome = 'received'
           and i.sku = v_pol.sku and i.status = 'free'
         order by r.created_at desc limit v_recv
      ), back as (
        update ops_stock_items set status = 'incoming',
               warehouse_id = v_po.warehouse_id, updated_at = now()
         where id in (select stock_item_id from take)
        returning id)
      select count(*) into v_moved from back;
      if v_moved < v_recv then
        with take as (
          select id from ops_stock_items
           where po_no = v_receipt.po_id and sku = v_pol.sku and status = 'free'
           order by created_at desc limit (v_recv - v_moved)
        ), back as (
          update ops_stock_items set status = 'incoming',
                 warehouse_id = v_po.warehouse_id, updated_at = now()
           where id in (select id from take)
          returning id)
        select v_moved + count(*) into v_moved from back;
      end if;
      if v_moved < v_recv then
        raise exception 'units on % are reserved or moved — this receiving cannot be voided', v_pol.sku
          using errcode = 'P0001', detail = 'units_block_void';
      end if;
      -- The rollup triggers lower the derived `stock_balances` as the Units
      -- return to incoming (0366).
    end if;

    update purchase_order_lines
       set received_qty   = received_qty - v_recv,
           damaged_qty    = damaged_qty - v_dmg,
           wrong_item_qty = wrong_item_qty - v_wrong
     where id = v_pol.id;
  end loop;

  if v_po.status = 'received' then
    update purchase_orders
       set status = v_receipt.po_status_before::po_status,
           sup_status = v_receipt.sup_status_before::po_sup_status,
           updated_at = now()
     where id = v_receipt.po_id;
  end if;

  update warehouse_receipts
     set status = 'voided', void_at = now(), void_by = v_uid,
         void_reason = btrim(p_reason), updated_at = now()
   where id = p_receipt_id;

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'voided', v_uid,
          jsonb_build_object('reason', btrim(p_reason),
                             'grn_no', v_receipt.grn_no,
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving %s voided — %s',
                 coalesce(v_receipt.grn_no, 'record'), btrim(p_reason)),
          public.app_role(), v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Voided %s — %s', coalesce(v_receipt.grn_no, p_receipt_id::text), btrim(p_reason)),
          v_receipt.po_id);

  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'voided',
                            'grn_no', v_receipt.grn_no);
end;
$function$;

-- refund_request(p_order_id uuid, p_amount numeric, p_reason text)
--   0558: btrim(p_reason) = ''
CREATE OR REPLACE FUNCTION public.refund_request(p_order_id uuid, p_amount numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role app_role;
  v_uid  uuid;
  v_row  order_refunds;
  v_so   int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can request a refund'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_order_id is null or p_amount is null or p_amount <= 0
     or p_reason is null or coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'order, positive amount and a reason are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
  end if;

  insert into order_refunds (order_id, amount, reason, requested_by)
  values (p_order_id, p_amount, btrim(p_reason), v_uid)
  returning * into v_row;

  insert into order_history (order_id, text, by_role)
  values (p_order_id,
          format('Refund requested · RM %s · %s', p_amount, btrim(p_reason)),
          'operation');
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, (select name from app_users where id = v_uid),
          format('Refund requested · RM %s', p_amount), 'SO-' || v_so::text);

  return to_jsonb(v_row);
end;
$function$;

-- rental_approve_agreement(p_agreement_id uuid, p_note text, p_credit_check text, p_credit_reference text)
--   0558: coalesce(btrim(p_note), '') = ''
CREATE OR REPLACE FUNCTION public.rental_approve_agreement(p_agreement_id uuid, p_note text DEFAULT NULL::text, p_credit_check text DEFAULT NULL::text, p_credit_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ra             rental_agreements;
  v_pkg            service_packages;
  v_unit           rental_stock_units;
  v_entitlement_id uuid;
  v_visits_total   integer := 0;
  v_proceeded      boolean := false;
  v_proceed_note   text;
  v_scheduled      numeric(12,2);
  v_contract       numeric(12,2);
BEGIN
  IF NOT public.rental_can_approve() THEN
    RAISE EXCEPTION 'Only finance or the principal may approve a rental agreement'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  SELECT * INTO v_ra FROM rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental agreement not found'
      USING errcode = 'P0001', detail = 'agreement_not_found';
  END IF;
  IF v_ra.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Agreement is not awaiting approval (status %)', v_ra.status
      USING errcode = 'P0001', detail = 'not_pending';
  END IF;

  -- 0279 — an unsigned application cannot be approved, and because 0275's
  -- proceed_order rental branch requires 'active', that also means it can never
  -- reach operations. Closes CF `rental-approve-without-signature`.
  IF v_ra.signed_at IS NULL THEN
    RAISE EXCEPTION 'This application carries no signature - it cannot be approved'
      USING errcode = 'P0001', detail = 'not_signed';
  END IF;

  UPDATE rental_agreements
     SET status     = 'active',
         decided_by = auth.uid(),
         decided_at = now(),
         -- 0538 — the check Finance ran, typed by hand. Blank keeps what is there.
         credit_check      = coalesce(nullif(btrim(p_credit_check), ''), credit_check),
         credit_reference  = coalesce(nullif(btrim(p_credit_reference), ''), credit_reference),
         credit_checked_at = CASE
                               WHEN coalesce(btrim(p_credit_check), '') <> ''
                                 OR coalesce(btrim(p_credit_reference), '') <> ''
                               THEN now() ELSE credit_checked_at
                             END,
         notes      = CASE
                        WHEN coalesce(p_note, '') !~ '[^[:space:]]' THEN notes
                        ELSE coalesce(notes || E'\n', '') || btrim(p_note)
                      END,
         updated_at = now()
   WHERE id = v_ra.id
   RETURNING * INTO v_ra;

  -- 0281 — the schedule speaks the 7th (Loo's T&C), not the signing day.
  INSERT INTO rental_billings (agreement_id, seq, due_date, amount_due, status)
  SELECT v_ra.id, d.seq, d.due_date, v_ra.monthly_fee, 'due'
    FROM public.rental_due_dates(v_ra.start_date, v_ra.term_months) AS d;

  -- ...and Loo's law is asserted, not assumed: "as long as the sum is correct".
  SELECT coalesce(sum(amount_due), 0) INTO v_scheduled
    FROM rental_billings WHERE agreement_id = v_ra.id;
  v_contract := round(v_ra.monthly_fee * v_ra.term_months, 2);
  IF v_scheduled <> v_contract THEN
    RAISE EXCEPTION 'Schedule totals % but the contract is % - refusing to approve',
      v_scheduled, v_contract
      USING errcode = 'P0001', detail = 'schedule_sum_mismatch';
  END IF;

  INSERT INTO rental_stock_units (sku, agreement_id, customer_id, status, updated_by)
  VALUES (v_ra.sku, v_ra.id, v_ra.customer_id, 'allocated', auth.uid())
  RETURNING * INTO v_unit;

  INSERT INTO rental_unit_events (unit_id, event_type, description, actor)
  VALUES (
    v_unit.id, 'note',
    'Allocated on approval of ' || v_ra.agreement_no,
    auth.uid()
  );

  IF v_ra.included_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM service_packages WHERE id = v_ra.included_package_id;
    IF FOUND THEN
      v_visits_total := greatest(
        1, floor((v_ra.term_months * v_pkg.visits_per_year)::numeric / 12)::integer
      );

      INSERT INTO service_entitlements (
        customer_id, package_id, source, agreement_id,
        visits_total, starts_on, expires_on, status, created_by
      ) VALUES (
        v_ra.customer_id, v_pkg.id, 'rental', v_ra.id,
        v_visits_total, v_ra.start_date,
        (v_ra.start_date + make_interval(months => v_ra.term_months))::date,
        'active', auth.uid()
      )
      RETURNING id INTO v_entitlement_id;

      INSERT INTO service_visits (entitlement_id, seq, due_date, unit_id, status)
      SELECT v_entitlement_id,
             gs,
             v_ra.start_date + round(gs * 365.0 / v_pkg.visits_per_year)::integer,
             v_unit.id,
             'pending'
        FROM generate_series(1, v_visits_total) AS gs;
    END IF;
  END IF;

  -- 0275 - "Approve -> the sales order moves on to operations" (Loo, locked).
  -- Wrapped: a missing delivery date must NOT undo a credit decision.
  IF v_ra.order_id IS NOT NULL THEN
    BEGIN
      PERFORM public.proceed_order(v_ra.order_id);
      v_proceeded := true;
    EXCEPTION WHEN OTHERS THEN
      v_proceed_note := coalesce(
        nullif(btrim(SQLERRM), ''), 'the order could not be proceeded'
      );
      INSERT INTO order_history (order_id, text, by_role)
      VALUES (
        v_ra.order_id,
        'Rental ' || v_ra.agreement_no
          || ' APPROVED, but the order is still in Place: ' || v_proceed_note,
        (SELECT public.app_role())
      );
    END;
  END IF;

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'rental-approver', 'rental.agreement_approved',
          v_ra.dealer_id, v_ra.agreement_no);

  RETURN jsonb_build_object(
    'agreement',      to_jsonb(v_ra),
    'unit',           to_jsonb(v_unit),
    'entitlementId',  v_entitlement_id,
    'visitsTotal',    v_visits_total,
    'orderProceeded', v_proceeded,
    'orderBlockedBy', v_proceed_note
  );
END;
$function$;

-- sales_order_create_unchecked_0374(p_header jsonb, p_lines jsonb)
--   0558: length(trim(coalesce(p_header->>'customer_name',''))) = 0
CREATE OR REPLACE FUNCTION public.sales_order_create_unchecked_0374(p_header jsonb, p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role     text := public.app_role();
  v_order_id uuid;
  v_so       int;
  v_line     jsonb;
  v_fields   jsonb := '{}'::jsonb;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if coalesce(p_header->>'customer_name','') !~ '[^[:space:]]' then
    raise exception 'Customer name is required' using errcode = '22023';
  end if;
  if nullif(p_header->>'dealer_id','') is null then
    raise exception 'A dealer is required' using errcode = '22023';
  end if;
  -- orders_salesperson_required (0296): every order the portal writes names
  -- who sold it. Refused here with a sentence, before the constraint speaks.
  if nullif(p_header->>'salesperson_id','') is null then
    raise exception 'A salesperson is required' using errcode = '22023';
  end if;

  if p_header ? 'entry_fields' then
    if jsonb_typeof(p_header->'entry_fields') <> 'object' then
      raise exception 'entry_fields must be an object' using errcode = '22023';
    end if;
    v_fields := coalesce((
      select jsonb_object_agg(k, val)
        from jsonb_each(p_header->'entry_fields') e(k, val)
       where jsonb_typeof(val) <> 'null' and nullif(trim(val #>> '{}'),'') is not null
    ), '{}'::jsonb);
  end if;

  insert into orders (
    status, channel, dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_email, customer_address,
    customer_address_line1, customer_address_line2, customer_address_city,
    customer_address_state, customer_address_postcode,
    customer_emergency, customer_billing,
    delivery_date, delivery_date_tbd, proceed_date,
    delivery_floor, delivery_has_lift,
    customer_race, customer_gender, customer_birthday,
    customer_address_unknown, customer_billing_same, delivery_stair_items,
    entry_data
  ) values (
    'place',
    case when nullif(p_header->>'outlet_id','') is not null then 'showroom' else 'dealer' end,
    (p_header->>'dealer_id')::uuid,
    nullif(p_header->>'outlet_id','')::uuid,
    nullif(p_header->>'salesperson_id','')::uuid,
    trim(p_header->>'customer_name'),
    nullif(p_header->>'customer_phone',''),
    nullif(p_header->>'customer_email',''),
    nullif(p_header->>'customer_address',''),
    nullif(p_header->>'customer_address_line1',''),
    nullif(p_header->>'customer_address_line2',''),
    nullif(p_header->>'customer_address_city',''),
    nullif(p_header->>'customer_address_state',''),
    nullif(p_header->>'customer_address_postcode',''),
    nullif(p_header->>'customer_emergency',''),
    nullif(p_header->>'customer_billing',''),
    nullif(p_header->>'delivery_date','')::date,
    coalesce((p_header->>'delivery_date_tbd')::boolean, false),
    nullif(p_header->>'proceed_date','')::date,
    coalesce((p_header->>'delivery_floor')::int, 1),
    coalesce((p_header->>'delivery_has_lift')::boolean, false),
    nullif(p_header->>'customer_race',''),
    nullif(p_header->>'customer_gender',''),
    nullif(p_header->>'customer_birthday','')::date,
    coalesce((p_header->>'customer_address_unknown')::boolean, false),
    coalesce((p_header->>'customer_billing_same')::boolean, true),
    nullif(p_header->>'delivery_stair_items','')::int,
    case when v_fields = '{}'::jsonb then null
         else jsonb_build_object('fields', v_fields) end
  )
  returning id, so into v_order_id, v_so;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if length(trim(coalesce(v_line->>'sku',''))) = 0 then
        raise exception 'A line needs a SKU' using errcode = '22023';
      end if;
      if coalesce((v_line->>'qty')::int, 0) < 1 then
        raise exception 'Line % qty must be at least 1', v_line->>'sku' using errcode = '22023';
      end if;
      if coalesce((v_line->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Line % needs a unit price of 0 or more', v_line->>'sku' using errcode = '22023';
      end if;
      -- 0374 — `attrs` rides the birth. ABSENT stays NULL: a line with no
      -- configuration must look exactly as it did before this migration, not
      -- gain an empty object that later code would read as "configured, with
      -- nothing in it".
      insert into order_lines(order_id, sku, qty, unit_price, attrs)
      values (
        v_order_id,
        trim(v_line->>'sku'),
        (v_line->>'qty')::int,
        (v_line->>'unit_price')::numeric,
        case when jsonb_typeof(v_line->'attrs') = 'object' then v_line->'attrs' else null end
      );
    end loop;
  end if;

  -- Rev 1 = the created state. The order is BORN with its original on file.
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (v_order_id, 1, public.sales_order_snapshot(v_order_id), auth.uid());

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (
    v_order_id,
    'Order created (office) · Rev 1',
    v_role::app_role,
    auth.uid(),
    jsonb_build_object('kind','created_office','revision',1)
  );

  return jsonb_build_object('id', v_order_id, 'so', v_so, 'revision', 1);
end $function$;

-- sales_order_save_revision_unchecked_0354(p_order_id uuid, p_header jsonb, p_lines jsonb, p_change jsonb)
--   0558: length(trim(coalesce(p_header->>'customer_name',''))) = 0
CREATE OR REPLACE FUNCTION public.sales_order_save_revision_unchecked_0354(p_order_id uuid, p_header jsonb DEFAULT '{}'::jsonb, p_lines jsonb DEFAULT NULL::jsonb, p_change jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role        text := public.app_role();
  v_order       orders%rowtype;
  v_changed     text[] := '{}';
  v_next        int;
  v_line        jsonb;
  v_keep_ids    uuid[] := '{}';
  v_id          uuid;
  v_old         jsonb;
  v_new         jsonb;
  v_keys        text[] := array[
    'customer_name','customer_phone','customer_email','customer_address',
    'customer_address_line1','customer_address_line2','customer_address_city',
    'customer_address_state','customer_address_postcode','customer_emergency',
    'customer_billing','delivery_date','delivery_date_tbd','proceed_date',
    'delivery_floor','delivery_has_lift',
    -- 0354 · every remaining question the Sales Portal asks
    'customer_race','customer_gender','customer_birthday',
    'customer_address_unknown','customer_billing_same','delivery_stair_items',
    'entry_fields'
  ];
  v_key         text;
  v_work        int := 0;
  v_change_type text;
  v_note        text;
  v_contractual boolean;
  v_thread      record;
  v_floor       jsonb;
  v_floor_names text[];
  v_proposed    jsonb := null;
  v_fields      jsonb;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_header ? 'salesperson_id' or p_header ? 'outlet_id'
     or p_header ? 'dealer_id' or p_header ? 'channel' then
    raise exception 'Attribution moves by request - submit an attribution change for approval'
      using errcode = '22023', detail = 'attribution_by_request';
  end if;

  -- The cause, validated up front. Whether it is REQUIRED is decided after
  -- the diff — only a change that moves the contractual fields demands it.
  if p_change is not null then
    if jsonb_typeof(p_change) <> 'object' then
      raise exception 'p_change must be an object' using errcode = '22023';
    end if;
    v_change_type := nullif(trim(coalesce(p_change->>'change_type','')), '');
    v_note        := nullif(trim(coalesce(p_change->>'note','')), '');
    if v_change_type is not null
       and v_change_type not in ('staff_correction','customer_change') then
      raise exception 'change_type must be staff_correction or customer_change'
        using errcode = '22023', detail = 'invalid_change_type';
    end if;
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if (p_header is null or p_header = '{}'::jsonb) and p_lines is null then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;

  -- 0257 parity + Card 1 §7: a line with a live procurement thread is a
  -- production commitment. Removing it (the delete would CASCADE the thread,
  -- 0124) or changing its SKU refuses BEFORE anything is written. Qty and
  -- price edits pass through — the received floor and the operation gate
  -- speak to those below.
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_thread in
      select ol.id, ol.sku
        from order_lines ol
       where ol.order_id = p_order_id
         and exists (select 1 from order_supplier_threads t where t.order_line_id = ol.id)
    loop
      select l into v_line
        from jsonb_array_elements(p_lines) l
       where nullif(l->>'id','') is not null
         and (l->>'id')::uuid = v_thread.id;
      if v_line is null then
        raise exception 'Line % is in production - it cannot be removed here', v_thread.sku
          using errcode = '22023', detail = 'line_in_production';
      end if;
      if trim(coalesce(v_line->>'sku','')) is distinct from v_thread.sku then
        raise exception 'Line % is in production - its item cannot be changed here', v_thread.sku
          using errcode = '22023', detail = 'line_in_production';
      end if;
    end loop;
  end if;

  v_old := public.sales_order_snapshot(p_order_id);
  if not exists (select 1 from sales_order_revisions where order_id = p_order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (p_order_id, 1, v_old, auth.uid());
  end if;

  foreach v_key in array v_keys loop
    if p_header ? v_key then
      case v_key
        when 'delivery_date' then
          update orders set delivery_date = nullif(p_header->>'delivery_date','')::date where id = p_order_id;
        when 'proceed_date' then
          update orders set proceed_date = nullif(p_header->>'proceed_date','')::date where id = p_order_id;
        when 'delivery_date_tbd' then
          update orders set delivery_date_tbd = coalesce((p_header->>'delivery_date_tbd')::boolean, false) where id = p_order_id;
        when 'delivery_floor' then
          update orders set delivery_floor = coalesce((p_header->>'delivery_floor')::int, 1) where id = p_order_id;
        when 'delivery_has_lift' then
          update orders set delivery_has_lift = coalesce((p_header->>'delivery_has_lift')::boolean, false) where id = p_order_id;
        when 'customer_name' then
          if coalesce(p_header->>'customer_name','') !~ '[^[:space:]]' then
            raise exception 'Customer name is required' using errcode = '22023';
          end if;
          update orders set customer_name = trim(p_header->>'customer_name') where id = p_order_id;
        -- 0354 · the typed columns cannot ride the generic text path.
        when 'customer_birthday' then
          update orders set customer_birthday = nullif(p_header->>'customer_birthday','')::date where id = p_order_id;
        when 'customer_address_unknown' then
          update orders set customer_address_unknown = coalesce((p_header->>'customer_address_unknown')::boolean, false) where id = p_order_id;
        when 'customer_billing_same' then
          update orders set customer_billing_same = coalesce((p_header->>'customer_billing_same')::boolean, true) where id = p_order_id;
        when 'delivery_stair_items' then
          update orders set delivery_stair_items = nullif(p_header->>'delivery_stair_items','')::int where id = p_order_id;
        -- 0219's bag: the building type and the operator's own fields. MERGED,
        -- never replaced — the form sends the keys it renders, and a config
        -- field retired last month must not be erased by an unrelated save.
        -- An explicit JSON null CLEARS one key, which is how the form empties
        -- a field the operator blanked.
        when 'entry_fields' then
          if jsonb_typeof(p_header->'entry_fields') <> 'object' then
            raise exception 'entry_fields must be an object' using errcode = '22023';
          end if;
          v_fields := coalesce(v_order.entry_data->'fields','{}'::jsonb) || (p_header->'entry_fields');
          v_fields := coalesce((
            select jsonb_object_agg(k, val)
              from jsonb_each(v_fields) e(k, val)
             where jsonb_typeof(val) <> 'null' and nullif(trim(val #>> '{}'),'') is not null
          ), '{}'::jsonb);
          update orders
             set entry_data = jsonb_set(
                   coalesce(entry_data, '{}'::jsonb), '{fields}', v_fields, true)
           where id = p_order_id;
        else
          execute format('update orders set %I = $1 where id = $2', v_key)
            using nullif(p_header->>v_key, ''), p_order_id;
      end case;
    end if;
  end loop;

  if p_lines is not null then
    if jsonb_typeof(p_lines) <> 'array' then
      raise exception 'p_lines must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_lines) = 0 then
      raise exception 'An order needs at least one item' using errcode = '22023';
    end if;
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if length(trim(coalesce(v_line->>'sku',''))) = 0 then
        raise exception 'A line needs a SKU' using errcode = '22023';
      end if;
      if coalesce((v_line->>'qty')::int, 0) < 1 then
        raise exception 'Line % qty must be at least 1', v_line->>'sku' using errcode = '22023';
      end if;
      if coalesce((v_line->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Line % needs a unit price of 0 or more', v_line->>'sku' using errcode = '22023';
      end if;
      if v_line ? 'id' and nullif(v_line->>'id','') is not null then
        v_id := (v_line->>'id')::uuid;
        update order_lines
           set sku = trim(v_line->>'sku'),
               qty = (v_line->>'qty')::int,
               unit_price = (v_line->>'unit_price')::numeric
         where id = v_id and order_id = p_order_id;
        if not found then
          raise exception 'Line % does not belong to this order', v_id using errcode = '22023';
        end if;
      else
        insert into order_lines(order_id, sku, qty, unit_price)
        values (p_order_id, trim(v_line->>'sku'), (v_line->>'qty')::int, (v_line->>'unit_price')::numeric)
        returning id into v_id;
      end if;
      v_keep_ids := array_append(v_keep_ids, v_id);
    end loop;
    delete from order_lines
     where order_id = p_order_id
       and not (id = any(v_keep_ids));
  end if;

  v_new := public.sales_order_snapshot(p_order_id);
  if v_new = v_old then
    raise exception 'Nothing changed' using errcode = '22023';
  end if;

  foreach v_key in array v_keys loop
    if (v_old->'header'->v_key) is distinct from (v_new->'header'->v_key) then
      v_changed := array_append(v_changed, v_key);
    end if;
  end loop;
  if (v_old->'lines') is distinct from (v_new->'lines') then
    v_changed := array_append(v_changed, 'items');
  end if;

  -- CARD 1 §3 · a contractual change states its cause; a pure Class-B
  -- correction (contact / address / floor / proceed_date) IS a correction.
  v_contractual := ('items' = any(v_changed))
                or ('delivery_date' = any(v_changed))
                or ('delivery_date_tbd' = any(v_changed));
  if v_contractual and v_change_type is null then
    raise exception 'Say who asked: staff correction or customer change'
      using errcode = '22023', detail = 'change_type_required';
  end if;
  if not v_contractual then
    v_change_type := coalesce(v_change_type, 'staff_correction');
  end if;

  -- THE FLOORS BITE (0328, GATE 6/7) — evaluated on what ACTUALLY changed,
  -- inside the same transaction; any BLOCK rolls the whole save back.
  v_floor_names := array(select case when k = 'items' then 'order_lines' else k end
                           from unnest(v_changed) k);
  if 'order_lines' = any(v_floor_names) then
    select jsonb_agg(jsonb_build_object('sku', sku, 'qty', qty))
      into v_proposed
      from order_lines where order_id = p_order_id;
  end if;
  for v_floor in
    select f from jsonb_array_elements(
      public.sales_order_floors(p_order_id, v_floor_names, v_proposed)->'findings') f
    where f->>'severity' = 'BLOCK'
  loop
    raise exception '%', coalesce(v_floor->>'evidence', 'Blocked by a downstream floor')
      using errcode = '22023', detail = 'blocked_by_floor';
  end loop;

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = p_order_id;
  insert into sales_order_revisions(order_id, revision, snapshot, created_by, change_type, note)
  values (p_order_id, v_next, v_new, auth.uid(), v_change_type, v_note);

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          case v_change_type
            when 'customer_change' then 'Customer change - Rev '
            else 'Staff correction - Rev '
          end || v_next || ' - ' || array_to_string(v_changed, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','edit','changed', to_jsonb(v_changed), 'revision', v_next,
                             'change_type', v_change_type, 'note', v_note));

  -- 3.4 · the consequence outlives the tab (0332/0333, unchanged).
  begin
    v_work := public._raise_correction_work(p_order_id, v_floor_names, v_next, 'B');
  exception when others then
    raise warning 'correction work not raised for % rev %: %', p_order_id, v_next, sqlerrm;
  end;

  return jsonb_build_object('revision', v_next, 'changed', to_jsonb(v_changed),
                            'change_type', v_change_type,
                            'correction_work_raised', v_work);
end $function$;

-- sales_order_submit_attribution(p_order_id uuid, p_changes jsonb, p_reason text)
--   0558: length(trim(coalesce(p_reason,''))) = 0
CREATE OR REPLACE FUNCTION public.sales_order_submit_attribution(p_order_id uuid, p_changes jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role   text := public.app_role();
  v_fields text[];
  v_id     uuid;
  v_key    text;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if coalesce(p_reason,'') !~ '[^[:space:]]' then
    raise exception 'A reason is required' using errcode = '22023', detail = 'reason_required';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'p_changes must be an object' using errcode = '22023';
  end if;
  v_fields := array(select jsonb_object_keys(p_changes));
  if array_length(v_fields,1) is null then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;
  foreach v_key in array v_fields loop
    if v_key not in ('salesperson_id','dealer_id','outlet_id','channel') then
      raise exception 'Field % is not an attribution field', v_key using errcode = '22023';
    end if;
  end loop;
  if p_changes ? 'channel'
     and p_changes->>'channel' not in ('dealer','showroom') then
    raise exception 'channel must be dealer or showroom' using errcode = '22023';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  begin
    insert into order_change_requests (order_id, kind, payload, status, requested_by)
    values (p_order_id, 'attribution',
            jsonb_build_object('changes', p_changes, 'reason', trim(p_reason)),
            'pending', auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'An attribution change is already waiting on this order'
      using errcode = '22023', detail = 'pending_exists';
  end;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          'Attribution change requested — ' || array_to_string(v_fields, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_requested','fields',to_jsonb(v_fields)));
  return jsonb_build_object('id', v_id, 'fields', to_jsonb(v_fields));
end $function$;

-- sales_order_withdraw_attribution(p_request_id uuid, p_reason text)
--   0558: length(trim(coalesce(p_reason,''))) = 0
CREATE OR REPLACE FUNCTION public.sales_order_withdraw_attribution(p_request_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role   text := public.app_role();
  v_req    order_change_requests%rowtype;
  v_fields text[];
begin
  if coalesce(p_reason,'') !~ '[^[:space:]]' then
    raise exception 'A reason is required' using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found or v_req.kind <> 'attribution' then
    raise exception 'Attribution request not found' using errcode = 'P0002';
  end if;

  if v_req.applied_at is not null then
    raise exception 'This change was already applied — it is history now, not a decision to take back'
      using errcode = '22023', detail = 'already_applied';
  end if;
  if v_req.status <> 'approved' then
    raise exception 'Only an approved request can be withdrawn'
      using errcode = '22023', detail = 'not_approved';
  end if;

  v_fields := array(select jsonb_object_keys(v_req.payload->'changes'));

  -- GATE 3, the SAME routing as the approval it takes back.
  if (v_fields && array['dealer_id','channel']) then
    if (v_role is null or v_role <> 'principal') then
      raise exception 'Dealer/channel attribution is approved by the principal only'
        using errcode = '42501', detail = 'approver_principal_only';
    end if;
  else
    if (v_role is null or v_role not in ('hr','principal')) then
      raise exception 'Salesperson/showroom attribution is approved by HR or the principal'
        using errcode = '42501', detail = 'approver_hr_or_principal';
    end if;
  end if;

  update order_change_requests
     set status = 'cancelled',
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = trim(p_reason)
   where id = p_request_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_req.order_id,
          'Attribution change withdrawn — ' || array_to_string(v_fields, ', ')
            || ' — ' || trim(p_reason),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_withdrawn','fields',to_jsonb(v_fields)));

  return jsonb_build_object('id', p_request_id, 'status', 'cancelled');
end $function$;

-- supplier_advance_application_cancel(p_application_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.supplier_advance_application_cancel(p_application_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_a    public.supplier_advance_applications%rowtype;
  v_pv   text;
  v_bill text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance takes an advance off a bill.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Say why the advance is taken off this bill.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;

  select * into v_a from public.supplier_advance_applications where id = p_application_id for update;
  if not found then
    raise exception 'That advance on a bill does not exist.'
      using errcode = 'P0002', detail = 'application_missing';
  end if;
  if v_a.status <> 'applied' then
    raise exception 'This advance is already taken off the bill.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  update public.supplier_advance_applications
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancelled_by  = v_me,
         cancel_reason = btrim(p_reason)
   where id = p_application_id;

  select v.voucher_no into v_pv from public.payment_vouchers v where v.id = v_a.voucher_id;
  select coalesce(b.bill_no, b.supplier_invoice_no) into v_bill from public.supplier_bills b where b.id = v_a.bill_id;
  perform public._ap_event('PAYMENT_VOUCHER', v_a.voucher_id, 'advance_taken_off',
                           v_bill || ' · ' || public.fin_rm(v_a.amount) || ' · ' || btrim(p_reason));
  perform public._ap_event('SUPPLIER_BILL', v_a.bill_id, 'advance_taken_off',
                           v_pv || ' · ' || public.fin_rm(v_a.amount) || ' · ' || btrim(p_reason));
  return p_application_id;
end;
$function$;

-- supplier_advance_money_back_cancel(p_money_back_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.supplier_advance_money_back_cancel(p_money_back_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_m        public.supplier_advance_money_back%rowtype;
  v_reversal uuid;
begin
  if not public.has_finance_approver(auth.uid()) then
    raise exception 'Cancelling money back takes the finance approver.'
      using errcode = '42501', detail = 'not_finance_approver';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Say why this money back is cancelled.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;

  select * into v_m from public.supplier_advance_money_back where id = p_money_back_id for update;
  if not found then
    raise exception 'That money back does not exist.'
      using errcode = 'P0002', detail = 'money_back_missing';
  end if;
  if v_m.status = 'voided' then
    raise exception 'This money back is already cancelled.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  -- The contra on the ORIGINAL date (gl_reverse). The advance has the money
  -- again: it may be knocked off a bill, or come back another day.
  v_reversal := public.gl_reverse(v_m.gl_entry_id, btrim(p_reason));

  update public.supplier_advance_money_back
     set status            = 'voided',
         reversal_entry_id = v_reversal,
         voided_at         = now(),
         voided_by         = auth.uid(),
         void_reason       = btrim(p_reason)
   where id = p_money_back_id;

  perform public._ap_event('PAYMENT_VOUCHER', v_m.voucher_id, 'money_back_cancelled',
                           v_m.money_back_no || ' · ' || btrim(p_reason));
  return v_reversal;
end;
$function$;

-- supplier_bill_cancel(p_bill_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.supplier_bill_cancel(p_bill_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.app_role()::text;
  v_bill     public.supplier_bills%rowtype;
  v_open     numeric(12,2);
  v_reversal uuid;
begin
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Say why this bill is cancelled.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;

  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill does not exist.'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;
  if v_bill.status = 'cancelled' then
    raise exception 'This bill is already cancelled.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  if v_bill.status = 'draft' then
    if v_role is null or v_role not in ('finance','principal') then
      raise exception 'only finance cancels a draft supplier bill'
        using errcode = '42501', detail = 'not_finance';
    end if;
  else
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Cancelling a confirmed bill takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;

    v_open := coalesce((select bp.held from public.ap_bill_paid(p_bill_id) bp), 0);

    if v_open > 0 then
      raise exception 'RM % of this bill is on a payment voucher or an advance. Cancel the voucher, or take the advance off this bill, first.',
        to_char(v_open, 'FM999,999,999,990.00')
        using errcode = 'P0001', detail = 'bill_allocated';
    end if;

    v_reversal := public.gl_reverse(v_bill.gl_entry_id, btrim(p_reason));
  end if;

  update public.supplier_bills
     set status            = 'cancelled',
         reversal_entry_id = v_reversal,
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancel_reason     = btrim(p_reason)
   where id = p_bill_id;

  perform public._ap_event('SUPPLIER_BILL', p_bill_id, 'cancelled', btrim(p_reason));
  return v_reversal;
end;
$function$;

-- supplier_mark_delivered(p_po_id text, p_do_number text, p_do_file_path text, p_do_note text)
--   0558: btrim(p_do_file_path) = ''
--   0558: btrim(p_do_number) = ''
CREATE OR REPLACE FUNCTION public.supplier_mark_delivered(p_po_id text, p_do_number text, p_do_file_path text, p_do_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po          purchase_orders;
  v_role        app_role;
  v_supplier_id uuid;
  v_uid         uuid;
  v_actor       text;
BEGIN
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();
  v_uid         := (select auth.uid());

  IF (v_role is null or v_role <> 'supplier') THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF p_do_number IS NULL OR coalesce(p_do_number, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'DO number is required'
      USING ERRCODE = '22023', DETAIL = 'missing_do_number';
  END IF;

  IF p_do_file_path IS NULL OR coalesce(p_do_file_path, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'DO file is required'
      USING ERRCODE = '22023', DETAIL = 'do_file_path_required';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found'
      USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_supplier_id IS NULL OR v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross-supplier mark-delivered'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Valid sources: pickup_accepted (own_logistics + factory_pickup pickup
  -- flow), shipped (own_logistics direct ship variant), partner_confirmed
  -- (0090 sofa flow — partner_owned WH accepted the supplier-delivered goods).
  IF v_po.sup_status NOT IN ('pickup_accepted', 'shipped', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pickup_accepted/shipped/partner_confirmed state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_uid), 'Supplier');

  UPDATE purchase_orders
     SET sup_status     = 'delivered',
         do_number      = btrim(p_do_number),
         do_file_path   = btrim(p_do_file_path),
         do_uploaded_at = now(),
         do_uploaded_by = v_uid,
         updated_at     = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (
    p_po_id,
    format('DO uploaded · %s%s · file %s',
           btrim(p_do_number),
           CASE WHEN p_do_note IS NOT NULL AND btrim(p_do_note) <> ''
                THEN ' · ' || btrim(p_do_note)
                ELSE '' END,
           btrim(p_do_file_path)),
    'supplier',
    v_uid
  );

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (
    'supplier',
    v_actor,
    format('Marked PO %s delivered (DO %s)', p_po_id, btrim(p_do_number)),
    p_po_id
  );

  RETURN jsonb_build_object(
    'po_id',        p_po_id,
    'sup_status',   'delivered',
    'do_number',    btrim(p_do_number),
    'do_file_path', btrim(p_do_file_path)
  );
END;
$function$;

-- warehouse_import_holiday_calendar(p_country text, p_state text, p_source_name text, p_source_reference text, p_verified_at timestamp with time zone, p_dates jsonb)
--   0558: nullif(btrim(coalesce(p_source_reference, '')), '') is null
--   0558: nullif(btrim(coalesce(p_source_name, '')), '') is null
CREATE OR REPLACE FUNCTION public.warehouse_import_holiday_calendar(p_country text, p_state text, p_source_name text, p_source_reference text, p_verified_at timestamp with time zone, p_dates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_state text := nullif(btrim(coalesce(p_state, '')), '');
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_version int;
  v_cal warehouse_holiday_calendars;
  v_count int;
begin
  perform public.warehouse_settings_gate();

  if v_country is null then
    raise exception 'name the country this calendar covers'
      using errcode = '22023', detail = 'country_required';
  end if;
  if coalesce(p_source_name, '') !~ '[^[:space:]]' then
    raise exception 'name the source this calendar came from'
      using errcode = '22023', detail = 'source_name_required';
  end if;
  if coalesce(p_source_reference, '') !~ '[^[:space:]]' then
    raise exception 'give the source reference'
      using errcode = '22023', detail = 'source_reference_required';
  end if;
  if p_verified_at is null then
    raise exception 'say when this calendar was verified'
      using errcode = '22023', detail = 'verified_at_required';
  end if;
  if p_dates is null or jsonb_typeof(p_dates) <> 'array'
     or jsonb_array_length(p_dates) = 0 then
    raise exception 'an import with no date is not a calendar'
      using errcode = '22023', detail = 'no_dates';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from warehouse_holiday_calendars
   where country = v_country and coalesce(state, '') = coalesce(v_state, '');

  update warehouse_holiday_calendars
     set active = false
   where country = v_country and coalesce(state, '') = coalesce(v_state, '') and active;

  insert into warehouse_holiday_calendars
    (country, state, version, source_name, source_reference, verified_at, imported_by)
  values
    (v_country, v_state, v_version, btrim(p_source_name), btrim(p_source_reference),
     p_verified_at, auth.uid())
  returning * into v_cal;

  insert into warehouse_holiday_dates (calendar_id, on_date, name, observed)
  select v_cal.id,
         (e->>'date')::date,
         btrim(e->>'name'),
         coalesce((e->>'observed')::boolean, false)
    from jsonb_array_elements(p_dates) e
   where nullif(btrim(coalesce(e->>'name', '')), '') is not null
     and nullif(e->>'date', '') is not null
  on conflict (calendar_id, on_date, name) do nothing;

  select count(*) into v_count from warehouse_holiday_dates where calendar_id = v_cal.id;
  if v_count = 0 then
    raise exception 'every row needs a date and a name'
      using errcode = '22023', detail = 'no_usable_dates';
  end if;

  insert into warehouse_setting_changes (what, old_value, new_value, reason, actor_id)
  values ('holiday_calendar:' || v_country || coalesce('/' || v_state, ''),
          null,
          to_jsonb(v_cal) || jsonb_build_object('dates', v_count),
          btrim(p_source_name) || ' · ' || btrim(p_source_reference),
          auth.uid());

  return to_jsonb(v_cal) || jsonb_build_object('dates', v_count);
end;
$function$;

-- warehouse_receipt_return(p_receipt_id uuid, p_reason text)
--   0558: length(btrim(coalesce(p_reason, ''))) = 0
CREATE OR REPLACE FUNCTION public.warehouse_receipt_return(p_receipt_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_receipt warehouse_receipts; v_uid uuid;
begin
  v_uid := auth.uid();
  perform public.receiving_require_post_authority();
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'say what the warehouse must fix' using errcode = '22023', detail = 'reason_required';
  end if;
  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'submitted' then
    raise exception 'this receiving has already been reviewed' using errcode = '22023', detail = 'receipt_not_open';
  end if;
  update warehouse_receipts
     set status = 'returned', return_reason = btrim(p_reason),
         reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
   where id = p_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'returned', v_uid, jsonb_build_object('reason', btrim(p_reason)));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving with DO %s sent back to %s — %s', v_receipt.do_number,
                 coalesce((select name from warehouses where id = v_receipt.warehouse_id), 'the warehouse'),
                 btrim(p_reason)),
          public.app_role(), v_uid);
  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'returned');
end;
$function$;

-- warehouse_resubmit_receipt(p_receipt_id uuid, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb, p_goods_received_at date, p_arrival_evidence jsonb, p_extra_lines jsonb)
--   0558: length(btrim(coalesce(p_do_file_path, ''))) = 0
--   0558: length(btrim(coalesce(p_do_number, ''))) < 3
CREATE OR REPLACE FUNCTION public.warehouse_resubmit_receipt(p_receipt_id uuid, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb, p_goods_received_at date DEFAULT NULL::date, p_arrival_evidence jsonb DEFAULT NULL::jsonb, p_extra_lines jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_wh_id uuid; v_uid uuid; v_receipt warehouse_receipts; v_po purchase_orders;
  v_valid jsonb; v_grn_date date; v_extras jsonb;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_clash warehouse_receipts;
begin
  v_uid := auth.uid();
  if (public.app_role() is null or public.app_role() <> 'warehouse') then
    raise exception 'forbidden: warehouse role required' using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse' using errcode = '42501', detail = 'no_warehouse';
  end if;
  select * into v_receipt from warehouse_receipts
   where id = p_receipt_id and warehouse_id = v_wh_id for update;
  if not found then
    raise exception 'receipt not found for this warehouse' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'returned' then
    raise exception 'only a returned receiving can be resubmitted (this one is %)', v_receipt.status
      using errcode = '22023', detail = 'receipt_not_returned';
  end if;
  if (length(btrim(coalesce(p_do_number, ''))) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') then
    raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
  end if;
  if coalesce(p_do_file_path, '') !~ '[^[:space:]]' then
    raise exception 'a photo of the signed DO is required' using errcode = '22023', detail = 'do_file_required';
  end if;
  v_grn_date := coalesce(p_goods_received_at, v_today_myt);
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received At cannot be in the future'
      using errcode = '22023', detail = 'received_date_future';
  end if;
  select * into v_po from purchase_orders where id = v_receipt.po_id for update;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', v_receipt.po_id using errcode = '22023', detail = 'po_not_open';
  end if;
  if v_grn_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Goods Received At cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;
  select * into v_clash from warehouse_receipts
   where po_id = v_receipt.po_id and lower(btrim(do_number)) = lower(btrim(p_do_number))
     and id <> v_receipt.id and status <> 'voided';
  if found then
    raise exception 'DO % already belongs to another receiving (session %)',
                    btrim(p_do_number), v_clash.id
      using errcode = 'P0001', detail = 'do_already_received';
  end if;
  v_valid  := public.warehouse_receipt_validate_lines(v_receipt.po_id, p_lines, v_uid);
  v_extras := public.receiving_validate_session_extras(p_arrival_evidence, p_extra_lines);
  update warehouse_receipts
     set status = 'submitted', do_number = btrim(p_do_number),
         do_file_path = btrim(p_do_file_path),
         note = nullif(btrim(coalesce(p_note, '')), ''),
         lines = v_valid->'lines', goods_received_at = v_grn_date,
         -- A resubmission that names new evidence replaces it; one that
         -- names none keeps what the first count attached.
         arrival_evidence = case when p_arrival_evidence is null
                                 then arrival_evidence
                                 else v_extras->'arrival_evidence' end,
         extra_lines = case when p_extra_lines is null
                            then extra_lines
                            else v_extras->'extra_lines' end,
         submitted_by = v_uid, submitted_at = now(), updated_at = now()
   where id = p_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'resubmitted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'units_counted', (v_valid->>'counted')::int));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('%s resubmitted the receiving with DO %s — waiting Carres check',
                 coalesce((select name from warehouses where id = v_wh_id), 'The warehouse'),
                 btrim(p_do_number)),
          'warehouse', v_uid);
  return jsonb_build_object('id', p_receipt_id, 'po_id', v_receipt.po_id, 'status', 'submitted');
end;
$function$;

-- warehouse_save_special_date(p_id uuid, p_site_id uuid, p_on_date date, p_kind text, p_opens_at time without time zone, p_closes_at time without time zone, p_reason text)
--   0558: nullif(btrim(coalesce(p_reason, '')), '') is null
CREATE OR REPLACE FUNCTION public.warehouse_save_special_date(p_id uuid, p_site_id uuid, p_on_date date, p_kind text, p_opens_at time without time zone, p_closes_at time without time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old public.warehouse_special_dates;
  v_new public.warehouse_special_dates;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  perform public.warehouse_settings_gate();

  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'say why this date is different'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if p_on_date is null or p_on_date < v_today then
    raise exception 'a Special Date that has passed is history and cannot be changed'
      using errcode = '22023', detail = 'special_date_in_the_past';
  end if;
  if p_kind not in ('closed_all_day', 'receiving_unavailable', 'collection_unavailable',
                    'special_receiving_hours', 'special_collection_hours') then
    raise exception 'unknown kind of Special Date'
      using errcode = '22023', detail = 'bad_kind';
  end if;
  if p_kind in ('special_receiving_hours', 'special_collection_hours') then
    if p_opens_at is null or p_closes_at is null then
      raise exception 'give both an opening and a closing time'
        using errcode = '22023', detail = 'times_incomplete';
    end if;
    if p_closes_at <= p_opens_at then
      raise exception 'the closing time must be later than the opening time'
        using errcode = '22023', detail = 'closes_before_opens';
    end if;
  end if;
  if not exists (select 1 from warehouses where id = p_site_id) then
    raise exception 'unknown warehouse site' using errcode = '22023', detail = 'unknown_site';
  end if;

  if p_id is not null then
    select * into v_old from warehouse_special_dates where id = p_id for update;
    if not found then
      raise exception 'that Special Date is not on record'
        using errcode = '22023', detail = 'unknown_special_date';
    end if;
    if v_old.on_date < v_today then
      raise exception 'a Special Date that has passed is history and cannot be changed'
        using errcode = '22023', detail = 'special_date_in_the_past';
    end if;
    update warehouse_special_dates
       set site_id = p_site_id, on_date = p_on_date, kind = p_kind,
           opens_at = case when p_kind in ('special_receiving_hours', 'special_collection_hours')
                           then p_opens_at else null end,
           closes_at = case when p_kind in ('special_receiving_hours', 'special_collection_hours')
                            then p_closes_at else null end,
           reason = btrim(p_reason), updated_by = auth.uid(), updated_at = now()
     where id = p_id
     returning * into v_new;
  else
    insert into warehouse_special_dates
      (site_id, on_date, kind, opens_at, closes_at, reason, created_by, updated_by)
    values
      (p_site_id, p_on_date, p_kind,
       case when p_kind in ('special_receiving_hours', 'special_collection_hours')
            then p_opens_at else null end,
       case when p_kind in ('special_receiving_hours', 'special_collection_hours')
            then p_closes_at else null end,
       btrim(p_reason), auth.uid(), auth.uid())
    returning * into v_new;
  end if;

  insert into warehouse_setting_changes (what, old_value, new_value, reason, actor_id)
  values ('special_date:' || v_new.id::text, to_jsonb(v_old), to_jsonb(v_new),
          btrim(p_reason), auth.uid());
  return to_jsonb(v_new);
end;
$function$;

-- warehouse_set_site_details(p_site_id uuid, p_name text, p_address text, p_status text, p_operating_party_id uuid, p_time_zone text, p_key_contact_id uuid, p_contact_number text)
--   0558: nullif(btrim(coalesce(p_name, '')), '') is null
CREATE OR REPLACE FUNCTION public.warehouse_set_site_details(p_site_id uuid, p_name text, p_address text, p_status text, p_operating_party_id uuid, p_time_zone text, p_key_contact_id uuid, p_contact_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_prev_contact uuid;
begin
  perform public.warehouse_settings_gate();

  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'the warehouse site name is required'
      using errcode = '22023', detail = 'site_name_required';
  end if;
  if p_status not in ('active', 'closed') then
    raise exception 'unknown status' using errcode = '22023', detail = 'bad_status';
  end if;
  if nullif(btrim(coalesce(p_time_zone, '')), '') is null then
    raise exception 'the time zone is required'
      using errcode = '22023', detail = 'time_zone_required';
  end if;

  if p_operating_party_id is not null
     and not exists (select 1 from stock_operating_parties
                      where id = p_operating_party_id and active) then
    raise exception 'choose an operating organisation that already exists'
      using errcode = '22023', detail = 'unknown_operating_party';
  end if;

  -- 0458 · a warehouse is operated by a WAREHOUSE operator
  if p_operating_party_id is not null
     and not exists (select 1 from stock_operating_parties
                      where id = p_operating_party_id
                        and active and kind = 'warehouse_operator') then
    raise exception 'that organisation does not operate a warehouse'
      using errcode = '22023', detail = 'not_a_warehouse_operator';
  end if;

  select key_contact_id into v_prev_contact
    from warehouse_site_profiles where site_id = p_site_id for update;

  if p_key_contact_id is not null
     and p_key_contact_id is distinct from v_prev_contact
     and not exists (select 1 from app_users
                      where id = p_key_contact_id and status = 'active') then
    raise exception 'the key contact must be an active person'
      using errcode = '22023', detail = 'key_contact_not_active';
  end if;

  -- 0458 · and the key contact must be a PERSON
  if p_key_contact_id is not null
     and p_key_contact_id is distinct from v_prev_contact
     and not public.warehouse_is_person(p_key_contact_id) then
    raise exception 'the key contact must be a person, not a shared account'
      using errcode = '22023', detail = 'key_contact_not_a_person';
  end if;

  select jsonb_build_object(
           'name', w.name, 'address', w.address, 'status', p.status,
           'operating_party_id', p.operating_party_id, 'time_zone', p.time_zone,
           'key_contact_id', p.key_contact_id,
           'key_contact_name', (select name from app_users a where a.id = p.key_contact_id),
           'contact_number', p.contact_number)
    into v_old
    from warehouses w
    left join warehouse_site_profiles p on p.site_id = w.id
   where w.id = p_site_id;
  if v_old is null then
    raise exception 'unknown warehouse site' using errcode = '22023', detail = 'unknown_site';
  end if;

  update warehouses
     set name = btrim(p_name),
         address = nullif(btrim(coalesce(p_address, '')), '')
   where id = p_site_id;

  insert into warehouse_site_profiles as p
    (site_id, status, operating_party_id, time_zone, key_contact_id,
     contact_number, updated_by, updated_at)
  values
    (p_site_id, p_status, p_operating_party_id, btrim(p_time_zone), p_key_contact_id,
     nullif(btrim(coalesce(p_contact_number, '')), ''), auth.uid(), now())
  on conflict (site_id) do update
     set status = excluded.status,
         operating_party_id = excluded.operating_party_id,
         time_zone = excluded.time_zone,
         key_contact_id = excluded.key_contact_id,
         contact_number = excluded.contact_number,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at;

  select jsonb_build_object(
           'name', w.name, 'address', w.address, 'status', p.status,
           'operating_party_id', p.operating_party_id, 'time_zone', p.time_zone,
           'key_contact_id', p.key_contact_id,
           'key_contact_name', (select name from app_users a where a.id = p.key_contact_id),
           'contact_number', p.contact_number)
    into v_new
    from warehouses w
    join warehouse_site_profiles p on p.site_id = w.id
   where w.id = p_site_id;

  if v_new is distinct from v_old then
    insert into warehouse_setting_changes (what, old_value, new_value, actor_id)
    values ('site_details:' || p_site_id::text, v_old, v_new, auth.uid());
  end if;
  return v_new;
end;
$function$;

-- warehouse_submit_receipt(p_po_id text, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb, p_goods_received_at date, p_arrival_evidence jsonb, p_extra_lines jsonb)
--   0558: length(btrim(coalesce(p_do_file_path, ''))) = 0
--   0558: length(btrim(coalesce(p_do_number, ''))) < 3
CREATE OR REPLACE FUNCTION public.warehouse_submit_receipt(p_po_id text, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb, p_goods_received_at date DEFAULT NULL::date, p_arrival_evidence jsonb DEFAULT NULL::jsonb, p_extra_lines jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_wh_id uuid; v_uid uuid; v_po purchase_orders; v_valid jsonb;
  v_receipt_id uuid; v_grn_date date;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_prior warehouse_receipts; v_extras jsonb;
begin
  v_uid := auth.uid();
  if (public.app_role() is null or public.app_role() <> 'warehouse') then
    raise exception 'forbidden: warehouse role required' using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse' using errcode = '42501', detail = 'no_warehouse';
  end if;
  if (length(btrim(coalesce(p_do_number, ''))) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') then
    raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
  end if;
  if coalesce(p_do_file_path, '') !~ '[^[:space:]]' then
    raise exception 'a photo of the signed DO is required' using errcode = '22023', detail = 'do_file_required';
  end if;
  v_grn_date := coalesce(p_goods_received_at, v_today_myt);
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received At cannot be in the future'
      using errcode = '22023', detail = 'received_date_future';
  end if;
  select * into v_po from purchase_orders where id = p_po_id and warehouse_id = v_wh_id for update;
  if not found then
    raise exception 'PO not found for this warehouse'
      using errcode = '42501', detail = 'po_not_found_or_cross_tenant';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', p_po_id using errcode = '22023', detail = 'po_not_open';
  end if;
  if v_grn_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Goods Received At cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;
  if exists (select 1 from warehouse_receipts where po_id = p_po_id and status = 'submitted') then
    raise exception 'a receiving for % is already waiting for Carres', p_po_id
      using errcode = 'P0001', detail = 'receipt_already_open';
  end if;
  select * into v_prior from warehouse_receipts
   where po_id = p_po_id and lower(btrim(do_number)) = lower(btrim(p_do_number))
     and status <> 'voided';
  if found then
    if v_prior.status = 'returned' then
      raise exception 'DO % was returned — reopen and resubmit that receiving, do not file a new one',
                      btrim(p_do_number)
        using errcode = 'P0001', detail = 'do_returned_use_resubmit';
    else
      raise exception 'DO % was already received on % (session %)',
                      btrim(p_do_number), to_char(v_prior.goods_received_at, 'DD Mon YY'), v_prior.id
        using errcode = 'P0001', detail = 'do_already_received';
    end if;
  end if;
  v_valid  := public.warehouse_receipt_validate_lines(p_po_id, p_lines, v_uid);
  v_extras := public.receiving_validate_session_extras(p_arrival_evidence, p_extra_lines);
  insert into warehouse_receipts (
    po_id, warehouse_id, do_number, do_file_path, note, lines,
    goods_received_at, submitted_from, status, submitted_by,
    arrival_evidence, extra_lines
  ) values (
    p_po_id, v_wh_id, btrim(p_do_number), btrim(p_do_file_path),
    nullif(btrim(coalesce(p_note, '')), ''), v_valid->'lines',
    v_grn_date, 'warehouse', 'submitted', v_uid,
    v_extras->'arrival_evidence', v_extras->'extra_lines'
  ) returning id into v_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (v_receipt_id, 'submitted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'units_counted', (v_valid->>'counted')::int,
                             'arrival_evidence', jsonb_array_length(coalesce(v_extras->'arrival_evidence','[]'::jsonb)),
                             'extra_lines', jsonb_array_length(coalesce(v_extras->'extra_lines','[]'::jsonb))));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('%s filed a receiving with DO %s — waiting Carres check',
                 coalesce((select name from warehouses where id = v_wh_id), 'The warehouse'),
                 btrim(p_do_number)),
          'warehouse', v_uid);
  return jsonb_build_object('id', v_receipt_id, 'po_id', p_po_id, 'status', 'submitted');
end;
$function$;

-- 0558 sanity: read the live catalog back and COUNT. Each function below must
-- carry the non-whitespace test once per door this file fixed in it — a count,
-- not a presence, because most of these functions guard more than one box and
-- "contains the string somewhere" would pass with every door but one reverted.
do $sanity$
declare
  v_bad text;
begin
  select string_agg(format('%s (want %s, found %s)', t.n, t.want, coalesce(f.got, -1)), '; ')
    into v_bad
    from (values
    ('_payment_voucher_validate', 'p_voucher_id uuid', 1),
    ('_sales_order_proceed', 'p_order_id uuid, p_strict boolean, p_actor_role app_role, p_actor_text text', 3),
    ('_set_order_address_0391_locked_impl', 'p_order_id uuid, p_address text, p_billing text, p_billing_same boolean, p_parts jsonb', 1),
    ('_update_order_0391_locked_impl', 'p_order_id uuid, p_payload jsonb', 1),
    ('arrival_source_create', 'p_input jsonb', 2),
    ('arrival_source_handover', 'p_id uuid, p_input jsonb', 2),
    ('arrival_source_plan', 'p_id uuid, p_input jsonb, p_cancel boolean', 1),
    ('commission_reopen_run', 'p_run_id uuid, p_reason text', 1),
    ('create_rental_agreement', 'p_plan_id uuid, p_customer_name text, p_customer_phone text, p_customer_email text, p_customer_address text, p_dealer_id uuid, p_salesperson_id uuid, p_start_date date, p_notes text, p_delivery_date date, p_signature_path text, p_signed_name text, p_signed_nric text', 2),
    ('dealer_invite', 'p_name text, p_region text, p_contact text', 3),
    ('delivery_handover_record', 'p_do_id uuid, p_kind text, p_receiver_name text, p_vehicle text, p_goods jsonb, p_note text, p_proof_path text, p_unit_codes text[], p_evidence jsonb', 3),
    ('delivery_leg_document_mint', 'p_order_id uuid, p_leg integer, p_do_number text', 1),
    ('delivery_payment_approval_decide', 'p_id uuid, p_decision text, p_reason text', 1),
    ('delivery_payment_approval_request', 'p_order_id uuid, p_reason text', 1),
    ('delivery_proof_review', 'p_do_number text, p_attempt_id uuid, p_decision text, p_reason text, p_expected_evidence_at timestamp with time zone, p_idempotency_key uuid', 1),
    ('delivery_save_partner_driver', 'p_partner_id uuid, p_driver_id uuid, p_name text, p_phone text, p_active boolean', 1),
    ('delivery_save_partner_vehicle', 'p_partner_id uuid, p_vehicle_id uuid, p_plate text, p_vehicle_type text, p_capacity text, p_driver_name text, p_driver_phone text, p_active boolean', 2),
    ('delivery_set_partner_details', 'p_partner_id uuid, p_name text, p_active boolean, p_customer_phone text, p_office_contact text, p_address text, p_whatsapp_group_url text', 1),
    ('delivery_template_save', 'p_template_key uuid, p_purpose text, p_channel text, p_name text, p_body text', 2),
    ('delivery_trip_document_mint', 'p_order_id uuid, p_do_number text', 1),
    ('finance_exception_clear', 'p_id uuid, p_evidence text', 1),
    ('finance_exception_open', 'p_order_id uuid, p_reason text', 1),
    ('finance_party_create', 'p_name text, p_kind text, p_registration_no text, p_phone text, p_email text, p_address text, p_notes text', 1),
    ('finance_party_update', 'p_party_id uuid, p_name text, p_kind text, p_registration_no text, p_phone text, p_email text, p_address text, p_notes text, p_is_active boolean', 1),
    ('gl_customer_party_for_order', 'p_order_id uuid', 1),
    ('gl_money_move_reverse', 'p_move_id uuid, p_reason text', 1),
    ('issue_record_action_result', 'p_issue_id uuid, p_action_id uuid, p_result_code text, p_result text, p_next_action jsonb', 1),
    ('office_receive_post', 'p_po_id text, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb, p_goods_received_at date, p_actual_site_id uuid, p_arrival_evidence jsonb, p_extra_lines jsonb, p_save_key uuid', 2),
    ('operation_abandon_order', 'p_order_id uuid, p_reason text', 1),
    ('operation_add_annotation', 'p_order_id uuid, p_content text, p_tag text', 1),
    ('operation_assign_partner_and_dispatch', 'p_po_id text, p_partner_id uuid, p_outsource_name text, p_outsource_contact text, p_outsource_zones text, p_warehouse_override_id uuid', 2),
    ('operation_attach_do_and_deliver', 'p_order_id uuid, p_do_number text, p_do_note text, p_signed boolean, p_do_file_path text, p_signature_url text, p_signed_by text', 2),
    ('operation_cancel_po', 'p_po_id text, p_reason text', 1),
    ('operation_receive_po_with_do', 'p_po_id text, p_do_file_path text, p_do_number text, p_lines jsonb, p_actual_site_id uuid', 2),
    ('operation_receive_threads', 'p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text', 2),
    ('ops_stock_bind_units', 'p_item_ids uuid[], p_ref text, p_note text', 1),
    ('other_debtor_invoice_cancel', 'p_invoice_id uuid, p_reason text', 1),
    ('other_receipt_void', 'p_receipt_id uuid, p_reason text', 1),
    ('partner_attach_pod', 'p_thread_id uuid, p_pod_path text, p_do_number text, p_do_note text, p_signed boolean, p_signature_url text, p_signed_by text', 2),
    ('partner_pickup_threads', 'p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text', 1),
    ('payment_collection_owner_handover', 'p_order_id uuid, p_new_owner_user_id uuid, p_reason text, p_effective_from date', 1),
    ('payment_invoice_void_replace', 'p_invoice_id uuid, p_reason text', 1),
    ('payment_record_delivery_date_request', 'p_order_id uuid, p_requested_date date, p_reason_key text, p_reason_detail text, p_terms_acknowledged boolean, p_free_storage_requested boolean, p_evidence_url text', 1),
    ('payment_record_message_sent', 'p_order_id uuid, p_invoice_id uuid, p_kind text, p_message_text text, p_template_key text, p_screenshot_url text', 2),
    ('payment_record_storage_inspection', 'p_case_id uuid, p_inspected_on date, p_location text, p_packaging text, p_condition_note text, p_photo_url text', 4),
    ('payment_set_bank_account', 'p_route_source text, p_bank_name text, p_account_name text, p_account_no text', 1),
    ('payment_set_collection_timing', 'p_ask_days_before integer, p_deadline_days_before integer, p_effective_from date, p_reason text', 1),
    ('payment_set_storage_rule', 'p_product_group text, p_free_days integer, p_charge_amount numeric, p_cycle_days integer, p_operation_limit_day integer, p_waiver_limit_day integer, p_extra_free_allowed boolean, p_inspection_days integer, p_effective_from date, p_reason text', 1),
    ('payment_storage_close', 'p_case_id uuid, p_reason text', 1),
    ('payment_storage_extra_free', 'p_case_id uuid, p_free_until date, p_reason text, p_evidence_url text', 2),
    ('payment_storage_start', 'p_order_id uuid, p_product_group text, p_readiness_on date, p_customer_delay_on date, p_witness_note text, p_evidence_url text', 1),
    ('payment_template_save', 'p_template_key uuid, p_purpose text, p_name text, p_body text', 2),
    ('payment_void', 'p_payment_id uuid, p_reason text', 1),
    ('payment_voucher_cancel', 'p_voucher_id uuid, p_reason text', 1),
    ('payment_voucher_reject', 'p_voucher_id uuid, p_reason text', 1),
    ('purchasing_cancel_demand', 'p_id uuid, p_reason text', 1),
    ('purchasing_decide_request', 'p_id uuid, p_decision text, p_reason text, p_cuts jsonb', 1),
    ('purchasing_po_document', 'p_po_id text', 1),
    ('purchasing_require_reply_evidence', '', 3),
    ('receiving_amend', 'p_receipt_id uuid, p_reason text, p_changes jsonb, p_save_key uuid', 4),
    ('receiving_arrival_post', 'p_source_id uuid, p_input jsonb', 3),
    ('receiving_arrival_void', 'p_receipt_id uuid, p_reason text', 1),
    ('receiving_validate_session_extras', 'p_arrival_evidence jsonb, p_extra_lines jsonb', 1),
    ('receiving_void', 'p_receipt_id uuid, p_reason text', 1),
    ('refund_request', 'p_order_id uuid, p_amount numeric, p_reason text', 1),
    ('rental_approve_agreement', 'p_agreement_id uuid, p_note text, p_credit_check text, p_credit_reference text', 1),
    ('sales_order_create_unchecked_0374', 'p_header jsonb, p_lines jsonb', 1),
    ('sales_order_save_revision_unchecked_0354', 'p_order_id uuid, p_header jsonb, p_lines jsonb, p_change jsonb', 1),
    ('sales_order_submit_attribution', 'p_order_id uuid, p_changes jsonb, p_reason text', 1),
    ('sales_order_withdraw_attribution', 'p_request_id uuid, p_reason text', 1),
    ('supplier_advance_application_cancel', 'p_application_id uuid, p_reason text', 1),
    ('supplier_advance_money_back_cancel', 'p_money_back_id uuid, p_reason text', 1),
    ('supplier_bill_cancel', 'p_bill_id uuid, p_reason text', 1),
    ('supplier_mark_delivered', 'p_po_id text, p_do_number text, p_do_file_path text, p_do_note text', 2),
    ('warehouse_import_holiday_calendar', 'p_country text, p_state text, p_source_name text, p_source_reference text, p_verified_at timestamp with time zone, p_dates jsonb', 2),
    ('warehouse_receipt_return', 'p_receipt_id uuid, p_reason text', 1),
    ('warehouse_resubmit_receipt', 'p_receipt_id uuid, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb, p_goods_received_at date, p_arrival_evidence jsonb, p_extra_lines jsonb', 2),
    ('warehouse_save_special_date', 'p_id uuid, p_site_id uuid, p_on_date date, p_kind text, p_opens_at time without time zone, p_closes_at time without time zone, p_reason text', 1),
    ('warehouse_set_site_details', 'p_site_id uuid, p_name text, p_address text, p_status text, p_operating_party_id uuid, p_time_zone text, p_key_contact_id uuid, p_contact_number text', 1),
    ('warehouse_submit_receipt', 'p_po_id text, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb, p_goods_received_at date, p_arrival_evidence jsonb, p_extra_lines jsonb', 2)
    ) as t(n, sig, want)
    left join lateral (
      select (length(p.prosrc) - length(replace(p.prosrc, '[^[:space:]]', ''))) / length('[^[:space:]]') as got
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname = t.n
         and pg_get_function_identity_arguments(p.oid) = t.sig
    ) f on true
   where coalesce(f.got, -1) < t.want;
  if v_bad is not null then
    raise exception '0558 sanity: these functions do not carry the non-whitespace test on every door: %', v_bad;
  end if;
end
$sanity$;

commit;
