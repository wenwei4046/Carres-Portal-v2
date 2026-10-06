-- 0468_the_document_decides_who_the_ledger_decides_what.sql
--
-- WHAT THIS FIXES
--
-- 0463 made every customer payment post to the ledger, and a refused post
-- cancels the payment. That is on purpose. But gl_post (0462) also checked the
-- caller's ROLE, and only let finance, operation and principal through.
-- gl_reverse let only finance and principal through. Several doors that take
-- or void money run as other people:
--
--   1. Dealer top-up on the POS (`top_up_order`) runs as the dealer, and it
--      also admits logistics and bd. Every one of those top-ups would fail.
--   2. The Stripe webhook runs with the admin key, so there is no user and no
--      role. Stripe would take the customer's money and Carres would record
--      nothing.
--   3. `payment_void` admits whoever holds the Payment Approver duty. If that
--      person is in operation, the reversal is refused and the void fails.
--   4. Voiding an invoice reverses its revenue through a trigger. Anyone other
--      than finance or principal voiding an invoice would be refused.
--
-- None of this has happened: 0461 to 0467 are merged but have not been
-- applied to any database. This file must be applied with them.
--
-- THE FIX
--
-- A role check belongs to the DOCUMENT, not the ledger engine. Every function
-- that calls gl_post or gl_reverse already checks who the caller is, with the
-- rule that fits that document:
--
--   payment record / top-up / receipt   their own rules (0351, 0430, 0449)
--   payment_void                        principal or Payment Approver (0430)
--   issue_order_invoice                 operation or finance (0466)
--   supplier bills and vouchers         finance or principal (0464)
--   gl_manual_journal                   principal only (0462, ruling M)
--
-- So gl_post and gl_reverse lose their role check and keep every validity
-- check (date, go-live, chart, header, control account party, balance). To
-- stop anyone calling them straight from the API, execute is revoked from
-- `authenticated`. Only `security definer` functions can now reach them, and
-- every caller listed above is one. Nothing in apps/ calls gl_post or
-- gl_reverse directly.
--
-- This is a TIGHTENING for direct access: before this file, finance,
-- operation and principal could post any balanced entry to any account
-- straight over the API. After it, nobody can. Every entry has to come from a
-- document.
--
-- WHY THE BODIES ARE COPIED
--
-- `create or replace` overwrites the whole body, so both functions are copied
-- in full from 0462, which is their only and latest definition. The only
-- change is the role check. The sanity block at the bottom checks that the
-- validity checks are still in the live bodies.

-- ── 1 · gl_post, without the role check ─────────────────────────────────────
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

    select a.is_active, a.is_control, a.control_for into v_active, v_control, v_control_for
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

    if v_party_type is not null and v_party_type not in ('CUSTOMER','SUPPLIER') then
      raise exception 'gl_post refused: line % party_type % is neither CUSTOMER nor SUPPLIER', v_idx, v_party_type
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

    v_sum_debit  := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;

    v_norm := v_norm || jsonb_build_object(
      'line_no',      v_idx,
      'account_code', v_code,
      'debit',        v_debit,
      'credit',       v_credit,
      'party_type',   v_party_type,
      'party_id',     v_party_id,
      'memo',         nullif(btrim(coalesce(v_elem->>'memo','')), '')
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
    (entry_id, line_no, account_code, debit, credit, party_type, party_id, memo)
  select v_entry_id,
         (l->>'line_no')::int,
         l->>'account_code',
         (l->>'debit')::numeric,
         (l->>'credit')::numeric,
         l->>'party_type',
         (l->>'party_id')::uuid,
         l->>'memo'
    from jsonb_array_elements(v_norm) l;

  return v_entry_id;
end;
$fn$;

-- ── 2 · gl_reverse, without the role check ──────────────────────────────────
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
             'memo',         l.memo
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

revoke all on function public.gl_post(text,text,date,text,jsonb) from public, anon, authenticated;
revoke all on function public.gl_reverse(uuid,text) from public, anon, authenticated;

comment on function public.gl_post(text,text,date,text,jsonb) is
  'The ONE ledger writer. Idempotent per (source_type, source_doc_no). Refuses; never repairs. A null entry_date raises and is never replaced with today. No role check since 0468: the calling document decides who; this decides what. Not callable over the API.';

comment on function public.gl_reverse(uuid,text) is
  'Writes a contra entry with the sides swapped and stamps the original. Never deletes. Raises if already reversed. No role check since 0468: the calling document decides who. Not callable over the API.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_post_src text;
  v_rev_src  text;
  v_go_live  date;
  v_a        text;
  v_b        text;
  v_entry    uuid;
  v_contra   uuid;
begin
  -- 1 · nobody reaches the engine over the API.
  if has_function_privilege('authenticated', 'public.gl_post(text,text,date,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.gl_post(text,text,date,text,jsonb)', 'execute') then
    raise exception '0468 sanity: gl_post is still callable over the API';
  end if;
  if has_function_privilege('authenticated', 'public.gl_reverse(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.gl_reverse(uuid,text)', 'execute') then
    raise exception '0468 sanity: gl_reverse is still callable over the API';
  end if;

  -- 2 · the role check is gone, and every validity check is still there.
  select p.prosrc into v_post_src from pg_proc p
   where p.oid = 'public.gl_post(text,text,date,text,jsonb)'::regprocedure;
  select p.prosrc into v_rev_src from pg_proc p
   where p.oid = 'public.gl_reverse(uuid,text)'::regprocedure;
  if v_post_src like '%gl_post_forbidden%' or v_rev_src like '%gl_reverse_forbidden%' then
    raise exception '0468 sanity: a role check is still in the live body';
  end if;
  if v_post_src not like '%gl_post_entry_date_null%'
     or v_post_src not like '%gl_post_entry_date_before_go_live%'
     or v_post_src not like '%gl_post_account_is_header%'
     or v_post_src not like '%gl_post_control_account_needs_party%'
     or v_post_src not like '%gl_post_party_type_wrong_side%'
     or v_post_src not like '%gl_post_out_of_balance%' then
    raise exception '0468 sanity: gl_post lost a validity check';
  end if;
  if v_rev_src not like '%gl_reverse_already_reversed%'
     or v_rev_src not like '%gl_reverse_reason_blank%' then
    raise exception '0468 sanity: gl_reverse lost a validity check';
  end if;

  -- 3 · a caller with no role (this migration, exactly like the Stripe
  --     webhook) can post and reverse. The probe runs inside a block that
  --     always raises, so PostgreSQL rolls back the two entries, their lines,
  --     the audit row and the counter. Nothing is left behind.
  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  select a.code into v_a from public.gl_accounts a
   where a.is_active and not a.is_control
     and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
   order by a.code limit 1;
  select a.code into v_b from public.gl_accounts a
   where a.is_active and not a.is_control and a.code <> v_a
     and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
   order by a.code limit 1;
  if v_go_live is null or v_a is null or v_b is null then
    raise exception '0468 sanity: no go-live date or no two postable accounts to probe with';
  end if;

  begin
    v_entry := public.gl_post('PROBE_0468', 'PROBE-0468', v_go_live, 'no-role probe',
      jsonb_build_array(
        jsonb_build_object('account_code', v_a, 'debit', 1),
        jsonb_build_object('account_code', v_b, 'credit', 1)));
    if v_entry is null then
      raise exception '0468 sanity: a no-role gl_post returned no entry';
    end if;
    v_contra := public.gl_reverse(v_entry, 'no-role probe');
    if v_contra is null then
      raise exception '0468 sanity: a no-role gl_reverse returned no entry';
    end if;
    -- Nothing is wrong. This is how the probe's rows are undone.
    raise exception 'gl_0468_probe_rollback';
  exception when others then
    -- A real failure keeps its own message and keeps travelling.
    if sqlerrm <> 'gl_0468_probe_rollback' then
      raise;
    end if;
  end;

  raise notice '0468 OK: the document decides who, the ledger decides what';
end $sanity$;
