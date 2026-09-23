-- 0570 · A heading can be renumbered, and an account can move under another heading.
--
-- WHAT THE OWNER ASKED FOR
--   "header name and number need to be changeable as well", and a move that
--   "doesnt change account number or name, it's just that it falls under
--   different header so that in report that account belongs in the new header
--   it falls into". A move changes REPORT PLACEMENT ONLY.
--
-- APPLY ORDER (read before running)
--   · Apply this file BEFORE any of 1100, 2200, 1300, 3200 or 3300 is
--     renumbered. Section 5 writes those five numbers into gl_account_roles;
--     on a chart where one of them already has another number the insert
--     fails and the whole file rolls back.
--   · Run the two precheck files first (precheck_0570_roles.sql,
--     precheck_0570_keys.sql). Each is one read-only statement.
--   · If the SQL editor reports ANY error, run ROLLBACK (or open a fresh tab)
--     before trying again.
--
-- WHAT WAS MISSING ON MAIN
--   · The Chart of accounts screen (PR 1504) saves through gl_account_update,
--     but no migration on main defines it. 0550 wrote it and never merged, so a
--     database built from main has only gl_account_rename and every Save fails.
--   · gl_accounts_parent_code_fkey has no ON UPDATE action, so renumbering a
--     heading is refused while any account sits under it. The same is true of
--     every other key that names the chart except gl_account_roles (0554).
--   · A document that has left Draft refuses every change to its row, so even
--     with the keys cascading, a renumber of any account a document uses was
--     refused by that document's frozen trigger.
--   · There is no way to change an account's heading at all.
--
-- 1 · Every foreign key that names gl_accounts(code) becomes ON UPDATE CASCADE.
--     0550's walk, unchanged: it finds the keys in the catalog, so the chart's
--     own parent_code is one of them and a renumbered heading keeps its
--     children. A key that already cascades is skipped.
--
-- 2 · gl_account_update(code, name, new_code): 0550's door, one door for an
--     account and a heading alike. The name checks are gl_account_rename's,
--     carried from pg_proc on a 0561 clone; the blank-name test is 0560's form.
--     The number's shape is checked with [0-9], never \d: four digits (1210),
--     or AutoCount's three digits, a dash, a digit or capital letter and three
--     digits (100-0001, 900-A001). It is stored in upper case: 900-a001 is
--     kept as 900-A001. gl_account_rename is
--     dropped, as 0550 did: nothing calls it since PR 1504.
--     Around the number change it sets two transaction-local settings,
--     carres.gl_renumber_from / carres.gl_renumber_to, and clears them after.
--
-- 3 · A frozen document follows a renumber, and nothing else gets through.
--     gl_renumber_only(old, new, code columns) is true only when ALL of:
--       · the row's other columns are identical (to_jsonb minus the code columns);
--       · every code column that changed went from the setting's old number to
--         its new number;
--       · the old number is no longer in gl_accounts and the new one is, which
--         is true only inside the cascade of a real renumber.
--     Every trigger that can refuse an update on a table with a key onto
--     gl_accounts(code) or gl_money_accounts(account_code) is rebuilt from
--     pg_proc on a 0563 clone with only that allowance added at the top (12
--     functions, listed in section 3). gl_entry_lines, gl_money_accounts,
--     card_settlement_routes, gl_payment_account_map, gl_income_account_map and
--     gl_account_roles carry no update trigger. The sanity block refuses the
--     file if any update trigger on those tables lacks the allowance, so a
--     trigger this clone does not have cannot slip through on apply.
--     A renumber never rewrites an amount, a date, a status or any other
--     column; a direct edit of a frozen document is refused exactly as before.
--
-- 4 · gl_account_move(code, to_heading, from_was, from_now, to_was, to_now).
--     Changes parent_code and the order under both headings. Never the number,
--     the name or the kind. It carries 0557's concurrency check for BOTH
--     headings. Refused, each with its own sentence:
--       · a heading: only a posting account moves under another heading; a
--         heading keeps its place among its siblings (0557 reorder). The P&L
--         and Balance Sheet group by the immediate parent only, so a heading
--         moved under another would print 0.00 there. ASSUMPTION the owner
--         can overturn.
--       · a target that is not a heading, or the heading it is already under;
--       · a heading of another kind (asset, liability, equity, income,
--         expense). ASSUMPTION the owner can overturn.
--       · into or out of the heading named by CUSTOMER_MONEY_HEADING or
--         STOCK_HEADING: fin_money_in_account_problem reads the immediate
--         parent to decide how money may be recorded, so a move there would
--         switch a guard on or off. ASSUMPTION the owner can overturn.
--       · the last account under a heading, active or retired: an empty
--         heading becomes a posting account and could never become a heading
--         again once posted to.
--     gl_rule_headings() hands the screen those two heading numbers so it
--     never offers the drop. gl_account_roles_read() hands the screens every
--     role's account, so no screen writes 4900, 6500, 1230, 2110, 2120 or
--     5100: GET /api/finance/ledger/accounts serves both.
--
-- 5 · Account numbers written inside function bodies are read by role
--     (gl_account_roles, 0554's table), because a renumber cannot reach text.
--     Five new roles:
--       '1100' in gl_money_account_add (where a new bank account is hung),
--       '2200' and '1300' in fin_money_in_account_problem (which headings hold
--       customer money and stock), and '3200' / '3300' in the same function.
--     Three refusal sentences named an account by number; they now print the
--     role's own number and name (existing roles, same wording around it):
--       '6500' and '4900' in _gl_money_move_check, '1230' in gl_manual_journal.
--     A NEW MONEY ACCOUNT'S NUMBER follows the heading's own number (YH,
--     23 Sep: follow the AutoCount chart, where banks sit under CASH AT BANK
--     310-0000 as 310-1000, 310-2000 ..). A heading NNN-0000 gives NNN-K000
--     for the smallest free K in 1..9; a heading HH00 gives the smallest free
--     number in HH01..HH99. The 1121-1129 / 1131-1139 ranges are gone.
--     ASSUMPTION: a bank and a holding account follow the same rule, because
--     AutoCount has no GHL, AhaPay or Online holding account; the owner may
--     give holdings their own heading later.
--     Every body is pg_proc's text on a 0561 or 0563 clone with only those
--     lines changed. The sanity block refuses the file if any of those
--     numbers is still written inside one of the five bodies.
--
-- THE DASHBOARD'S CASH (web, not SQL): the Net cash tile and the Cashflow
-- chart add up every account in gl_money_accounts wherever it sits in the
-- chart, not the accounts under one heading. In AutoCount CASH IN HAND
-- 320-0000 is not under CASH AT BANK 310-0000.
--
-- REPORTS: gl_profit_and_loss and gl_balance_sheet group by the live
-- parent_code (`coalesce(a.parent_code, a.code) as hdr`); gl_trial_balance does
-- not group by heading. An account's move shows on the next read. Unchanged.
--
-- RLS: unchanged. No policy is created, dropped or altered. DR/CR: none.
-- No row is read for a backfill, and none is rewritten. The only rows written
-- are five new gl_account_roles rows (a seed, like 0554's seven).

begin;

-- pg_get_constraintdef prints table names as the search_path reads them, and
-- section 1 hands that text back to Postgres, so the path is pinned.
set local search_path = public, pg_temp;

-- ── 1 · every key that names the chart follows a renumber (0550 §1) ─────────
do $cascade$
declare
  v_keys jsonb;
  r      jsonb;
begin
  -- gl_accounts.code, plus any column a foreign key ties to something already
  -- in the set (card_settlement_routes reaches the chart through
  -- gl_money_accounts).
  with recursive closure(relid, attnum) as (
    select a.attrelid, a.attnum
      from pg_attribute a
     where a.attrelid = 'public.gl_accounts'::regclass
       and a.attname = 'code'
       and not a.attisdropped
    union
    select c.conrelid, c.conkey[1]
      from pg_constraint c
      join closure d on d.relid = c.confrelid and d.attnum = c.confkey[1]
     where c.contype = 'f'
       and array_length(c.conkey, 1) = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', c.conname,
           'tbl',  format('%I.%I', ns.nspname, rel.relname),
           'def',  pg_get_constraintdef(c.oid),
           'cols', array_length(c.conkey, 1))), '[]'::jsonb)
    into v_keys
    from pg_constraint c
    join pg_class rel     on rel.oid = c.conrelid
    join pg_namespace ns  on ns.oid = rel.relnamespace
    join closure d on d.relid = c.confrelid and d.attnum = c.confkey[1]
   where c.contype = 'f'
     and c.confupdtype <> 'c';          -- 'c' = already on update cascade

  for r in select value from jsonb_array_elements(v_keys) loop
    -- ON UPDATE is appended to the printed clause, which is only right for a
    -- one-column key that is not DEFERRABLE, not MATCH FULL and not NOT VALID
    -- (precheck_0570_keys.sql shows all three). Stop otherwise.
    if (r->>'def') ~* '\mdeferrable\M|\mmatch\M|\mnot valid\M' or (r->>'cols')::int <> 1 then
      raise exception '0570: % is a shape this migration does not rewrite: %',
        r->>'name', r->>'def';
    end if;
    execute format('alter table %s drop constraint %I', r->>'tbl', r->>'name');
    execute format('alter table %s add constraint %I %s on update cascade',
                   r->>'tbl', r->>'name', r->>'def');
  end loop;
end $cascade$;

-- ── 2 · one door changes an account's or a heading's name and number ─────────
drop function if exists public.gl_account_rename(text, text);

create or replace function public.gl_account_update(p_code text, p_name text, p_new_code text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_old  text;
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := btrim(coalesce(p_new_code, p_code));
begin
  -- 0570: the number is stored in upper case, so 900-a001 is kept as 900-A001.
  -- The shape is checked first, on the typed text with [A-Za-z], because
  -- upper() turns some non-ASCII letters into ASCII ones.
  if v_code ~ '^([0-9]{4}|[0-9]{3}-[0-9A-Za-z][0-9]{3})$' then
    v_code := upper(v_code);
  end if;
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select a.name into v_old from public.gl_accounts a where a.code = p_code for update;
  if not found then
    raise exception 'That account is not in the chart.'
      using errcode = 'P0002', detail = 'account_missing';
  end if;
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'Type the account name.'
      using errcode = '22023', detail = 'name_missing';
  end if;
  if length(v_name) > 60 then
    raise exception 'Keep the name to 60 characters.'
      using errcode = '22023', detail = 'name_too_long';
  end if;
  if exists (select 1 from public.gl_accounts a
              where lower(a.name) = lower(v_name) and a.code <> p_code) then
    raise exception 'An account named % is already in the chart.', v_name
      using errcode = '22023', detail = 'name_exists';
  end if;
  -- [0-9], not \d: \d can take a non-ASCII digit on some collations.
  -- Today's four digits, or AutoCount's: three digits, a dash, then a digit
  -- or a capital letter and three digits (310-1000, 900-A001).
  if v_code !~ '^([0-9]{4}|[0-9]{3}-[0-9A-Z][0-9]{3})$' then
    raise exception 'A number is four digits, like 1210, or AutoCount''s form, like 100-0001 or 900-A001.'
      using errcode = '22023', detail = 'code_shape';
  end if;
  if v_code <> p_code and exists (select 1 from public.gl_accounts a where a.code = v_code) then
    raise exception 'An account numbered % is already in the chart.', v_code
      using errcode = '22023', detail = 'code_exists';
  end if;

  if v_name is distinct from v_old then
    update public.gl_accounts set name = v_name where code = p_code;
  end if;
  -- The number goes last, so the name update above still finds the row by its
  -- old number. Section 1 carries the new number to every row that names it,
  -- including the accounts under a heading; the two settings tell each frozen
  -- document's trigger that this is a renumber (section 3), and are cleared
  -- straight after so nothing later in the transaction can lean on them.
  if v_code <> p_code then
    perform set_config('carres.gl_renumber_from', p_code, true),
            set_config('carres.gl_renumber_to',   v_code, true);
    update public.gl_accounts set code = v_code where code = p_code;
    perform set_config('carres.gl_renumber_from', '', true),
            set_config('carres.gl_renumber_to',   '', true);
  end if;
  return v_code;
end;
$fn$;

comment on function public.gl_account_update(text, text, text) is
  '0570 (0550''s door): changes one account''s or heading''s name and, when a number is given, its number. Every key that names the chart cascades, and a frozen document takes the new number and nothing else. Finance or principal.';
revoke all on function public.gl_account_update(text, text, text) from public, anon;
grant execute on function public.gl_account_update(text, text, text) to authenticated;

-- ── 3 · a frozen document follows a renumber, and nothing else gets through ──
create or replace function public.gl_renumber_only(p_old jsonb, p_new jsonb, p_cols text[])
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  with s as (
    select nullif(current_setting('carres.gl_renumber_from', true), '') as f,
           nullif(current_setting('carres.gl_renumber_to',   true), '') as t
  )
  select coalesce(
           s.f is not null and s.t is not null
       -- nothing but the code columns changed
       and (p_old - p_cols) = (p_new - p_cols)
       -- at least one code column changed, and every one that did went old -> new
       and exists (select 1 from unnest(p_cols) c where (p_old ->> c) is distinct from (p_new ->> c))
       and not exists (select 1 from unnest(p_cols) c
                        where (p_old ->> c) is distinct from (p_new ->> c)
                          and not ((p_old ->> c) = s.f and (p_new ->> c) = s.t))
       -- only inside the cascade: the old number is gone and the new one is there
       and not exists (select 1 from public.gl_accounts a where a.code = s.f)
       and exists (select 1 from public.gl_accounts a where a.code = s.t),
         false)
    from s;
$fn$;

comment on function public.gl_renumber_only(jsonb, jsonb, text[]) is
  '0570: true only while gl_account_update renumbers an account and this row changes nothing but its account-number columns, from that old number to that new one. Read by the frozen-document triggers.';
revoke all on function public.gl_renumber_only(jsonb, jsonb, text[]) from public, anon, authenticated;

-- Each body below is pg_proc's text on a 0563 clone. The only change is the
-- first statement after `begin`, marked 0570.
CREATE OR REPLACE FUNCTION public.gl_accounts_protect_posted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lines bigint;
begin
  -- 0570: a chart renumber. The renumbered account changes only its number,
  -- and an account under a renumbered heading changes only its parent's number.
  if tg_op = 'UPDATE' and (
       (old.code = current_setting('carres.gl_renumber_from', true)
        and new.code = current_setting('carres.gl_renumber_to', true)
        and to_jsonb(new) - 'code' = to_jsonb(old) - 'code')
       or public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['parent_code'])) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.is_active and old.is_active
     and new.parent_code is not distinct from old.parent_code then
    return new;                                   -- nothing dangerous changed
  end if;

  if tg_op = 'UPDATE' and (old.is_active and not new.is_active) then
    select count(*) into v_lines
      from public.gl_entry_lines l where l.account_code = old.code;
    if v_lines > 0 then
      raise exception 'account % has % posted line(s) and cannot be retired — entries touching it would become unreversible', old.code, v_lines
        using errcode = '22023', detail = 'gl_account_has_posted_history',
              hint = 'Rename it, or stop using it. A used account stays in the chart.';
    end if;
  end if;

  -- Making an account into a header: catch it from the CHILD side, because
  -- that is where the change actually happens.
  if tg_op in ('INSERT','UPDATE') and new.parent_code is not null then
    select count(*) into v_lines
      from public.gl_entry_lines l where l.account_code = new.parent_code;
    if v_lines > 0 then
      raise exception 'account % has % posted line(s) and cannot become a header by gaining child %', new.parent_code, v_lines, new.code
        using errcode = '22023', detail = 'gl_parent_has_posted_history',
              hint = 'Hang the new account off a parent that has never been posted to.';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gl_money_move_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['from_account_code', 'to_account_code']) then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'A money move is never deleted. Reverse or cancel it instead.'
      using errcode = '42501', detail = 'no_delete';
  end if;
  if old.status in ('reversed','cancelled')
     or new.move_no           is distinct from old.move_no
     or new.kind              is distinct from old.kind
     or new.move_date         is distinct from old.move_date
     or new.from_account_code is distinct from old.from_account_code
     or new.to_account_code   is distinct from old.to_account_code
     or new.amount            is distinct from old.amount
     or new.fee               is distinct from old.fee
     or new.reference         is distinct from old.reference
     or new.note              is distinct from old.note
     or new.prepared_by       is distinct from old.prepared_by
     or new.prepared_at       is distinct from old.prepared_at
     or new.idempotency_key   is distinct from old.idempotency_key
     or (old.status = 'approved'
         and (new.gl_entry_id is distinct from old.gl_entry_id
              or new.approved_by is distinct from old.approved_by
              or new.approved_at is distinct from old.approved_at)) then
    raise exception 'A money move cannot be edited. Cancel or reverse it and enter a new one.'
      using errcode = '42501', detail = 'money_move_locked';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.other_debtor_invoice_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['debtor_account_code']) then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'An other debtor invoice is never deleted. Cancel it instead.'
      using errcode = '42501', detail = 'no_delete';
  end if;
  if old.status = 'draft' then
    return new;                              -- a draft is still being written
  end if;
  if old.status = 'cancelled' then
    raise exception 'A cancelled invoice is final.'
      using errcode = '42501', detail = 'invoice_cancelled';
  end if;
  -- old.status = 'issued'
  if new.status <> 'cancelled' then
    raise exception 'An issued invoice cannot be edited. Cancel it and raise a corrected one.'
      using errcode = '42501', detail = 'invoice_issued';
  end if;
  if new.invoice_no          is distinct from old.invoice_no
     or new.party_id            is distinct from old.party_id
     or new.invoice_date        is distinct from old.invoice_date
     or new.due_date            is distinct from old.due_date
     or new.reference           is distinct from old.reference
     or new.narration           is distinct from old.narration
     or new.total_amount        is distinct from old.total_amount
     or new.debtor_account_code is distinct from old.debtor_account_code
     or new.gl_entry_id         is distinct from old.gl_entry_id
     or new.issued_at           is distinct from old.issued_at
     or new.issued_by           is distinct from old.issued_by
     or new.created_at          is distinct from old.created_at
     or new.created_by          is distinct from old.created_by then
    raise exception 'Cancelling an invoice may change only its cancellation stamp.'
      using errcode = '42501', detail = 'invoice_issued';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.other_debtor_invoice_lines_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['account_code']) then
    return new;
  end if;
  select status into v_status from public.other_debtor_invoices
   where id = coalesce(new.invoice_id, old.invoice_id);
  if v_status is distinct from 'draft' then
    raise exception 'The lines of an % invoice are frozen.', coalesce(v_status, 'unknown')
      using errcode = '42501', detail = 'invoice_not_draft';
  end if;
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.other_receipt_children_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['account_code']) then
    return new;
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'The lines of a recorded receipt are frozen. Cancel the receipt and record a corrected one.'
      using errcode = '42501', detail = 'receipt_locked';
  end if;
  if not exists (select 1 from public.other_receipts r
                  where r.id = new.receipt_id and r.status = 'posted'
                    and r.created_at = now()) then
    raise exception 'A line can be added to a receipt only while the receipt is being recorded.'
      using errcode = '42501', detail = 'receipt_locked';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.other_receipt_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['money_account_code']) then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'A receipt is never deleted. Cancel it instead.'
      using errcode = '42501', detail = 'no_delete';
  end if;
  if old.status = 'voided' then
    raise exception 'A cancelled receipt is final.'
      using errcode = '42501', detail = 'receipt_cancelled';
  end if;
  if new.status <> 'voided'
     or new.receipt_no         is distinct from old.receipt_no
     or new.party_id           is distinct from old.party_id
     or new.payer_name         is distinct from old.payer_name
     or new.receipt_date       is distinct from old.receipt_date
     or new.money_account_code is distinct from old.money_account_code
     or new.reference          is distinct from old.reference
     or new.narration          is distinct from old.narration
     or new.total_amount       is distinct from old.total_amount
     or new.gl_entry_id        is distinct from old.gl_entry_id
     or new.idempotency_key    is distinct from old.idempotency_key
     or new.created_at         is distinct from old.created_at
     or new.created_by         is distinct from old.created_by then
    raise exception 'A recorded receipt cannot be edited. Cancel it and record a corrected one.'
      using errcode = '42501', detail = 'receipt_locked';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.payment_voucher_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['ap_account_code', 'pay_from_account_code']) then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception
      'a payment voucher is never deleted; cancel it instead'
      using errcode = '42501', detail = 'no_delete';
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if old.status = 'cancelled' then
    raise exception 'a cancelled payment voucher is final'
      using errcode = '42501', detail = 'voucher_cancelled';
  end if;

  if not (
       (old.status = 'prepared' and new.status in ('prepared','checked','draft','cancelled'))
    or (old.status = 'checked'  and new.status in ('checked','approved','draft','cancelled'))
    or (old.status = 'approved' and new.status in ('approved','cancelled'))
  ) then
    raise exception 'a % payment voucher cannot become %', old.status, new.status
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  if new.voucher_no            is distinct from old.voucher_no
     or new.purpose               is distinct from old.purpose
     or new.supplier_id           is distinct from old.supplier_id
     or new.payee_name            is distinct from old.payee_name
     or new.voucher_date          is distinct from old.voucher_date
     or new.amount                is distinct from old.amount
     or new.advance_amount        is distinct from old.advance_amount
     or new.pay_method            is distinct from old.pay_method
     or new.pay_reference         is distinct from old.pay_reference
     or new.pay_from_account_code is distinct from old.pay_from_account_code
     or new.ap_account_code       is distinct from old.ap_account_code
     or new.narration             is distinct from old.narration
     or new.created_at            is distinct from old.created_at
     or new.created_by            is distinct from old.created_by then
    raise exception
      'a prepared payment voucher''s numbers are locked; return it to draft to change them'
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  if new.status <> 'draft'
     and (new.prepared_at is distinct from old.prepared_at
          or new.prepared_by is distinct from old.prepared_by) then
    raise exception 'the preparer of a payment voucher cannot be rewritten'
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  if old.status = 'approved'
     and (new.gl_entry_id is distinct from old.gl_entry_id
          or new.approved_at is distinct from old.approved_at
          or new.approved_by is distinct from old.approved_by
          or new.checked_at  is distinct from old.checked_at
          or new.checked_by  is distinct from old.checked_by) then
    raise exception 'an approved payment voucher can only be cancelled'
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.payment_voucher_lines_only_while_draft()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['account_code']) then
    return new;
  end if;
  select status into v_status from public.payment_vouchers
   where id = coalesce(new.voucher_id, old.voucher_id);
  if v_status is distinct from 'draft' then
    raise exception 'the lines of a payment voucher are frozen once it is prepared'
      using errcode = '42501', detail = 'voucher_not_draft';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.supplier_advance_money_back_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['money_account_code']) then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'money back is never deleted; cancel it instead'
      using errcode = '42501', detail = 'no_delete';
  end if;
  if old.status = 'voided' then
    raise exception 'cancelled money back is final'
      using errcode = '42501', detail = 'money_back_cancelled';
  end if;
  if new.status <> 'voided'
     or new.money_back_no      is distinct from old.money_back_no
     or new.voucher_id         is distinct from old.voucher_id
     or new.money_back_date    is distinct from old.money_back_date
     or new.money_account_code is distinct from old.money_account_code
     or new.amount             is distinct from old.amount
     or new.reference          is distinct from old.reference
     or new.narration          is distinct from old.narration
     or new.gl_entry_id        is distinct from old.gl_entry_id
     or new.idempotency_key    is distinct from old.idempotency_key
     or new.created_at         is distinct from old.created_at
     or new.created_by         is distinct from old.created_by then
    raise exception 'cancelling money back may change only its cancellation stamp'
      using errcode = '42501', detail = 'money_back_locked';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.supplier_bill_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['ap_account_code']) then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception
      'a supplier bill is never deleted; a confirmed bill is cancelled by reversal'
      using errcode = '42501', detail = 'no_delete';
  end if;

  if old.status = 'draft' then
    return new;                          -- a draft is still being written
  end if;

  if old.status = 'cancelled' then
    raise exception 'a cancelled supplier bill is final'
      using errcode = '42501', detail = 'bill_cancelled';
  end if;

  -- old.status = 'confirmed'
  if new.status <> 'cancelled' then
    raise exception
      'a confirmed supplier bill cannot be edited; cancel it by reversal and enter a corrected bill'
      using errcode = '42501', detail = 'bill_confirmed';
  end if;

  if new.bill_no             is distinct from old.bill_no
     or new.supplier_invoice_no is distinct from old.supplier_invoice_no
     or new.supplier_id      is distinct from old.supplier_id
     or new.bill_date        is distinct from old.bill_date
     or new.due_date         is distinct from old.due_date
     or new.po_id            is distinct from old.po_id
     or new.po_receipt_id    is distinct from old.po_receipt_id
     or new.ap_account_code  is distinct from old.ap_account_code
     or new.total_amount     is distinct from old.total_amount
     or new.narration        is distinct from old.narration
     or new.gl_entry_id      is distinct from old.gl_entry_id
     or new.confirmed_at     is distinct from old.confirmed_at
     or new.confirmed_by     is distinct from old.confirmed_by
     or new.created_at       is distinct from old.created_at
     or new.created_by       is distinct from old.created_by then
    raise exception
      'cancelling a supplier bill may change only its cancellation stamp, nothing else'
      using errcode = '42501', detail = 'bill_confirmed';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.supplier_bill_line_grn_ceiling()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_bill     public.supplier_bills%rowtype;
  v_rcpt     public.warehouse_receipts%rowtype;
  v_po       public.purchase_orders%rowtype;
  v_pol      public.purchase_order_lines%rowtype;
  v_grn      text;
  v_billable numeric;
  v_billed   numeric;
  v_holders  text;
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['account_code']) then
    return new;
  end if;
  if new.warehouse_receipt_id is null then
    return new;
  end if;

  select * into v_bill from public.supplier_bills where id = new.bill_id;

  select * into v_rcpt from public.warehouse_receipts
   where id = new.warehouse_receipt_id
   for update;
  if not found then
    raise exception 'Line %: that goods receipt does not exist.', new.line_no
      using errcode = 'P0002', detail = 'grn_missing';
  end if;
  -- Read through to_jsonb: `grn_no` arrives with 0426, and a database where
  -- 0426 has not applied must still run this.
  v_grn := coalesce(to_jsonb(v_rcpt) ->> 'grn_no', 'the goods receipt of ' || v_rcpt.po_id);

  if v_rcpt.status <> 'posted' then
    raise exception 'Line %: % is not finished yet, so it cannot be billed.', new.line_no, v_grn
      using errcode = 'P0001', detail = 'grn_not_posted';
  end if;

  select * into v_po from public.purchase_orders where id = v_rcpt.po_id;
  if v_po.supplier_id is distinct from v_bill.supplier_id then
    raise exception 'Line %: % belongs to a different supplier.', new.line_no, v_grn
      using errcode = 'P0001', detail = 'grn_other_supplier';
  end if;
  -- 0426: a consignment receipt creates no payable — the goods are still the
  -- supplier's.
  if coalesce((to_jsonb(v_po) ->> 'is_consignment')::boolean, false) then
    raise exception 'Line %: % is a consignment receipt. The goods still belong to the supplier, so there is nothing to bill.', new.line_no, v_grn
      using errcode = 'P0001', detail = 'grn_is_consignment';
  end if;

  select * into v_pol from public.purchase_order_lines where id = new.po_line_id;
  if not found or v_pol.po_id is distinct from v_rcpt.po_id then
    raise exception 'Line %: that PO line is not on %.', new.line_no, v_grn
      using errcode = 'P0001', detail = 'po_line_not_on_grn';
  end if;

  v_billable := public.ap_grn_billable_qty(new.warehouse_receipt_id, new.po_line_id);
  if v_billable <= 0 then
    raise exception 'Line %: % received no % that can be billed.', new.line_no, v_grn, v_pol.sku
      using errcode = 'P0001', detail = 'po_line_not_on_grn';
  end if;

  -- Name the bills that hold the quantity: a forgotten DRAFT holds it too, and
  -- the person at the screen has to be able to find it.
  select coalesce(sum(bl.qty), 0),
         string_agg(distinct coalesce(b.bill_no, 'the draft for invoice ' || b.supplier_invoice_no), ', ')
    into v_billed, v_holders
    from public.supplier_bill_lines bl
    join public.supplier_bills b on b.id = bl.bill_id
   where bl.warehouse_receipt_id = new.warehouse_receipt_id
     and bl.po_line_id = new.po_line_id
     and b.status <> 'cancelled'
     and bl.id <> new.id;

  if v_billed + coalesce(new.qty, 0) > v_billable then
    raise exception 'Line %: % received % of %, and % of them are already on %. This line bills %, which is more than arrived.',
      new.line_no, v_grn, trim_scale(v_billable), v_pol.sku, trim_scale(v_billed),
      coalesce(v_holders, 'another bill'), trim_scale(new.qty)
      using errcode = 'P0001', detail = 'grn_over_billed';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.supplier_bill_lines_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
begin
  -- 0570: a chart renumber carries the new account number here, and nothing else.
  if tg_op = 'UPDATE' and public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['account_code']) then
    return new;
  end if;
  select status into v_status from public.supplier_bills
    where id = coalesce(new.bill_id, old.bill_id);

  if v_status is distinct from 'draft' then
    if tg_op = 'DELETE' then
      raise exception
        'a supplier bill line is never deleted once the bill is confirmed; cancel the bill and enter a corrected one'
        using errcode = '42501', detail = 'no_delete';
    end if;
    raise exception
      'the lines of a % supplier bill are frozen', coalesce(v_status, 'missing')
      using errcode = '42501', detail = 'bill_not_draft';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- ── 4 · a posting account moves under another heading ───────────────────────
-- The headings whose immediate children decide how money may be recorded
-- (fin_money_in_account_problem), not only where an account prints.
create or replace function public.gl_rule_headings()
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'The chart is for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  return array[public.gl_account_for('CUSTOMER_MONEY_HEADING'), public.gl_account_for('STOCK_HEADING')];
end;
$fn$;

comment on function public.gl_rule_headings() is
  '0570: the headings named by CUSTOMER_MONEY_HEADING and STOCK_HEADING. No account moves into or out of them, because their children decide how money may be recorded.';
revoke all on function public.gl_rule_headings() from public, anon;
grant execute on function public.gl_rule_headings() to authenticated;

-- Every role and the account it names, for the screens: a screen that needs
-- 4900 Other income or 6500 Bank and payment charges reads it here, by role,
-- so a renumber reaches it. gl_account_roles has RLS on and no policy, and
-- gl_account_for is not granted to authenticated, so this is the one read.
create or replace function public.gl_account_roles_read()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'The chart is for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  return coalesce((select jsonb_object_agg(r.role, r.account_code) from public.gl_account_roles r), '{}'::jsonb);
end;
$fn$;

comment on function public.gl_account_roles_read() is
  '0570: every gl_account_roles row as {role: account code}, for the screens. Finance readers only (gl_may_read).';
revoke all on function public.gl_account_roles_read() from public, anon;
grant execute on function public.gl_account_roles_read() to authenticated;

create or replace function public.gl_account_move(
  p_code      text,
  p_to_parent text,
  p_from_was  text[],
  p_from_now  text[],
  p_to_was    text[],
  p_to_now    text[]
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_from  text;                        -- the heading it leaves
  v_acc   public.gl_accounts%rowtype;
  v_to    public.gl_accounts%rowtype;
  v_hdr   public.gl_accounts%rowtype;
  v_order text[];
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  -- A blank in any list first: a blank makes every comparison below NULL, and
  -- it would be reported as whatever check happened to fail next (0557).
  if exists (select 1 from unnest(coalesce(p_from_was, '{}') || coalesce(p_from_now, '{}')
                              || coalesce(p_to_was, '{}') || coalesce(p_to_now, '{}')) c
              where c is null) then
    raise exception 'The order has a blank where an account should be.'
      using errcode = '22023', detail = 'order_blank';
  end if;

  select a.parent_code into v_from from public.gl_accounts a where a.code = p_code;
  if not found then
    raise exception 'That account is not in the chart.'
      using errcode = 'P0002', detail = 'account_missing';
  end if;

  -- Lock the account, both headings and everything under both, in code order:
  -- the same order gl_accounts_reorder locks in, so a move and a reorder of
  -- the same heading wait for each other instead of deadlocking.
  perform 1 from public.gl_accounts a
    where a.code in (p_code, p_to_parent, v_from)
       or a.parent_code is not distinct from v_from
       or a.parent_code = p_to_parent
    order by a.code
    for update;

  select * into v_acc from public.gl_accounts a where a.code = p_code;
  if v_acc.parent_code is distinct from v_from then
    -- Somebody moved it between the read above and the lock.
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;

  select * into v_to from public.gl_accounts a where a.code = p_to_parent;
  if not found then
    raise exception 'That account is not in the chart.'
      using errcode = 'P0002', detail = 'heading_not_found';
  end if;
  if v_to.code is not distinct from v_acc.parent_code then
    raise exception 'That account is already under this heading.'
      using errcode = '22023', detail = 'move_same_heading';
  end if;
  -- Only a posting account changes heading. The P&L and the Balance Sheet
  -- group by the immediate parent, so a heading moved under another would
  -- print 0.00 there. A heading keeps its place among its siblings (0557).
  if exists (select 1 from public.gl_accounts c where c.parent_code = p_code) then
    raise exception '% % is a heading. A heading stays where it is; drag it among the headings beside it to change its place.', v_acc.code, v_acc.name
      using errcode = '22023', detail = 'move_heading';
  end if;
  -- The target has accounts under it. The account itself has none, so this
  -- also refuses a move under itself.
  if not exists (select 1 from public.gl_accounts c where c.parent_code = p_to_parent) then
    raise exception '% % is not a heading. Move the account under a heading.', v_to.code, v_to.name
      using errcode = '22023', detail = 'move_onto_account';
  end if;
  if v_to.kind <> v_acc.kind then
    raise exception 'An account moves only under a heading of the same kind.'
      using errcode = '22023', detail = 'move_other_kind';
  end if;
  -- A heading whose children decide how money may be recorded: a move into or
  -- out of it would switch a money guard on or off, not only move a line.
  if v_from = any (public.gl_rule_headings()) or p_to_parent = any (public.gl_rule_headings()) then
    select * into v_hdr from public.gl_accounts a
     where a.code = case when v_from = any (public.gl_rule_headings()) then v_from else p_to_parent end;
    raise exception '% % decides how money may be recorded, not only where an account prints. No account moves into or out of it.', v_hdr.code, v_hdr.name
      using errcode = '22023', detail = 'move_rule_heading';
  end if;
  -- The last account under a heading, active or retired, stays: an empty
  -- heading becomes a posting account, and once posted to it could never be a
  -- heading again.
  if v_from is not null
     and not exists (select 1 from public.gl_accounts c where c.parent_code = v_from and c.code <> p_code) then
    select * into v_hdr from public.gl_accounts a where a.code = v_from;
    raise exception '% % is the last account under % %. Move another account under that heading first.', v_acc.code, v_acc.name, v_hdr.code, v_hdr.name
      using errcode = '22023', detail = 'move_last_child';
  end if;

  if coalesce(array_length(p_from_was, 1), 0) = 0 or coalesce(array_length(p_to_was, 1), 0) = 0 then
    raise exception 'Send the order the chart was in before the drag.'
      using errcode = '22023', detail = 'order_was_missing';
  end if;

  -- 0557's check, once per heading: the order the screen read must still be
  -- the order stored now.
  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code is not distinct from v_from;
  if p_from_was is distinct from v_order then
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;
  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code = p_to_parent;
  if p_to_was is distinct from v_order then
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;

  update public.gl_accounts set parent_code = p_to_parent where code = p_code;

  -- Both `now` lists go through 0557's writer, which refuses a duplicate, a
  -- stranger or a missing account and writes 1..n. Its `was` here is the order
  -- stored after the parent changed, read under the locks taken above; the
  -- caller's own `was` lists were checked against the stored order just above.
  -- The heading it left still has an account (the last one never leaves).
  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code is not distinct from v_from;
  perform public.gl_accounts_reorder(v_from, v_order, p_from_now);

  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code = p_to_parent;
  perform public.gl_accounts_reorder(p_to_parent, v_order, p_to_now);

  return p_code;
end;
$fn$;

comment on function public.gl_account_move(text, text, text[], text[], text[], text[]) is
  '0570: puts one posting account under another heading of the same kind, and sets the order under both headings. Never a heading, never the last account under a heading, never into or out of a heading gl_rule_headings names. Refuses an order somebody already replaced, under either heading. The number, name and kind never change. Finance or principal.';
revoke all on function public.gl_account_move(text, text, text[], text[], text[], text[]) from public, anon;
grant execute on function public.gl_account_move(text, text, text[], text[], text[], text[]) to authenticated;

-- ── 5 · numbers written inside two function bodies become roles ──────────────
-- Needs 1100, 2200, 1300, 3200 and 3300 to carry those numbers still (see
-- APPLY ORDER at the top).
insert into public.gl_account_roles (role, account_code) values
  ('MONEY_ACCOUNTS_HEADING',  '1100'),   -- Cash and bank: a new bank account is hung here
  ('CUSTOMER_MONEY_HEADING',  '2200'),   -- Customer money held: recorded in Payments
  ('STOCK_HEADING',           '1300'),   -- Inventory: stock value moves with the goods
  ('RETAINED_EARNINGS',       '3200'),   -- written only by the year-end close
  ('OPENING_BALANCE_EQUITY',  '3300');   -- written only by the opening balances

-- pg_proc on a 0561 clone. '1100' is read from the role, and the new number
-- follows the heading's own number instead of the 1121-1129 / 1131-1139
-- ranges (see section 5 at the top). Every other line is unchanged.
CREATE OR REPLACE FUNCTION public.gl_money_account_add(p_name text, p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := public.app_role()::text;
  v_name text;
  v_code text;
  v_head public.gl_accounts%rowtype;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the money accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_kind is null or p_kind not in ('BANK','HOLDING') then
    raise exception 'Choose the kind: a bank, or an online payment company.'
      using errcode = '22023', detail = 'kind_invalid';
  end if;
  -- Two people adding at once must not both pick the same next code.
  perform pg_advisory_xact_lock(hashtext('gl_money_account_add'));
  v_name := public._gl_money_account_name(p_name, null);

  -- 0570: the heading is read from gl_account_roles, and the number follows
  -- the heading's own number, never a range written here. A heading like
  -- 310-0000 gives 310-1000, 310-2000 .. 310-9000 (AutoCount's banks under
  -- CASH AT BANK); a heading like 1100 gives 1101 .. 1199. The smallest free
  -- one is taken, for a bank and a holding account alike.
  select a.* into v_head from public.gl_accounts a
   where a.code = public.gl_account_for('MONEY_ACCOUNTS_HEADING');
  if v_head.code ~ '^[0-9]{3}-0000$' then
    select min(c.code) into v_code
      from (select left(v_head.code, 4) || k::text || '000' as code
              from generate_series(1, 9) k) c
     where not exists (select 1 from public.gl_accounts a where a.code = c.code);
  elsif v_head.code ~ '^[0-9]{2}00$' then
    select min(c.code) into v_code
      from (select left(v_head.code, 2) || lpad(k::text, 2, '0') as code
              from generate_series(1, 99) k) c
     where not exists (select 1 from public.gl_accounts a where a.code = c.code);
  else
    raise exception 'A new account is numbered from its heading, and % % does not end in 00 or -0000.',
      coalesce(v_head.code, 'The money accounts heading'), coalesce(v_head.name, '')
      using errcode = 'P0001', detail = 'heading_shape';
  end if;
  if v_code is null then
    raise exception 'There is no free number left under % %.', v_head.code, v_head.name
      using errcode = 'P0001', detail = 'no_code_left';
  end if;

  insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for)
  values (v_code, v_name, 'ASSET', v_head.code, false, true, null);
  insert into public.gl_money_accounts (account_code, money_kind, created_by, updated_by)
  values (v_code, p_kind, auth.uid(), auth.uid());
  return v_code;
end;
$function$;

-- pg_proc on a 0561 clone. Only '2200', '1300', '3200' and '3300' changed.
CREATE OR REPLACE FUNCTION public.fin_money_in_account_problem(p_code text, p_use text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v public.gl_accounts%rowtype;
begin
  if p_use is null or p_use not in ('money','receipt_line','invoice_line') then
    raise exception 'unknown account use %', coalesce(p_use, 'null')
      using errcode = '22023', detail = 'unknown_account_use';
  end if;

  select * into v from public.gl_accounts a where a.code = btrim(coalesce(p_code, ''));
  if not found then
    return format('Account %s is not in the chart.', coalesce(nullif(btrim(p_code), ''), 'No account'));
  end if;
  if not v.is_active then
    return format('Account %s %s is retired.', v.code, v.name);
  end if;
  if exists (select 1 from public.gl_accounts c where c.parent_code = v.code) then
    return format('Account %s %s is a group heading. Pick an account under it.', v.code, v.name);
  end if;
  -- 0510: 1230 Advances to suppliers is written only by the Advance flow.
  if v.is_control or v.code = public.gl_account_for('SUPPLIER_ADVANCE') then
    return format('Account %s %s is kept by its own documents and cannot be picked here.', v.code, v.name);
  end if;

  if p_use = 'money' then
    if exists (select 1 from public.gl_money_accounts m
                where m.account_code = v.code and not m.is_active) then
      return format('Account %s %s is retired.', v.code, v.name);
    end if;
    if not public.gl_money_account_ok(v.code, 'in') then      -- 0512: the one list
      return format('Account %s %s is not a bank or cash account.', v.code, v.name);
    end if;
    return null;
  end if;

  if public.ap_account_is_money(v.code) then
    return format('Account %s %s is a bank or cash account. Moving money between our own accounts is not a receipt.', v.code, v.name);
  end if;

  -- Customer sales income is recognised on the customer's invoice (0466).
  -- Neither document here may be a second door for it (ERP-ARCHITECTURE
  -- law C), so an invoice line and a receipt line both refuse every account
  -- the customer invoice routes revenue to.
  if exists (select 1 from public.gl_income_account_map m where m.account_code = v.code) then
    return format('Account %s %s is customer sales income. It is recorded on the customer''s invoice.', v.code, v.name);
  end if;

  if p_use = 'invoice_line' then
    if v.kind not in ('INCOME','EXPENSE') then
      return format('Account %s %s cannot be billed. An invoice line credits income, or recovers a cost.', v.code, v.name);
    end if;
    return null;
  end if;

  -- receipt_line
  -- 0570: the headings and accounts below are read from gl_account_roles.
  if v.parent_code = public.gl_account_for('CUSTOMER_MONEY_HEADING') then
    return format('Account %s %s is customer money. Customer money is recorded in Payments.', v.code, v.name);
  end if;
  -- Stock value moves with the goods, and Stock owns it. Retained earnings
  -- and opening balance equity are written only by the year-end close and the
  -- opening balances. Money never arrives as any of them.
  if v.parent_code = public.gl_account_for('STOCK_HEADING')
     or v.code in (public.gl_account_for('RETAINED_EARNINGS'), public.gl_account_for('OPENING_BALANCE_EQUITY')) then
    return format('Account %s %s cannot be the reason money came in.', v.code, v.name);
  end if;
  return null;
end;
$function$;

-- pg_proc on a 0563 clone. Only the two refusal sentences changed: they name
-- the account by its role's own number and name instead of '6500' and '4900'.
-- The wording around the account is 0537's, unchanged (0554 kept it).
CREATE OR REPLACE FUNCTION public._gl_money_move_check(p_kind text, p_from text, p_to text, p_amount numeric, p_fee numeric, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_from_kind text;
  v_to_kind   text;
  v_named     text;
begin
  -- 0537: two more kinds.
  if p_kind is null or p_kind not in ('TRANSFER','CARD_PAYOUT','BANK_CHARGE','BANK_CREDIT') then
    raise exception 'Choose a bank transfer, a card payout, a bank charge or a bank credit.'
      using errcode = '22023', detail = 'kind_missing';
  end if;
  if p_date is null then
    raise exception 'Choose the date the money moved.'
      using errcode = '22023', detail = 'date_missing';
  end if;
  perform public.fin_refuse_before_go_live(p_date, 'This money move');

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'The amount must be more than RM 0.00, in sen at most.'
      using errcode = '22023', detail = 'amount_invalid';
  end if;
  if p_fee is null or p_fee < 0 or p_fee <> round(p_fee, 2) then
    raise exception 'The fee must be RM 0.00 or more, in sen at most.'
      using errcode = '22023', detail = 'fee_invalid';
  end if;
  -- 0537: only a card payout has a fee.
  if p_kind <> 'CARD_PAYOUT' and p_fee <> 0 then
    raise exception 'Only a card payout has a fee. Record a bank charge as its own money move.'
      using errcode = '22023', detail = 'fee_on_transfer';
  end if;
  if p_from is not distinct from p_to then
    raise exception 'The money must move between two different accounts.'
      using errcode = '22023', detail = 'same_account';
  end if;

  -- 'in' is every in-use CASH, BANK and HOLDING leaf (0512); the kind narrows it.
  select m.money_kind into v_from_kind from public.gl_money_accounts m
   where m.account_code = p_from and public.gl_money_account_ok(p_from, 'in');
  select m.money_kind into v_to_kind from public.gl_money_accounts m
   where m.account_code = p_to and public.gl_money_account_ok(p_to, 'in');

  if p_kind = 'TRANSFER' then
    if v_from_kind is null or v_from_kind not in ('CASH','BANK') then
      raise exception 'Paid from must be a cash or bank account in use.'
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if v_to_kind is null or v_to_kind not in ('CASH','BANK') then
      raise exception 'Paid into must be a cash or bank account in use.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  -- 0537: a bank charge leaves a bank for BANK_AND_PAYMENT_CHARGES; a bank credit reaches a bank from OTHER_INCOME.
  elsif p_kind = 'BANK_CHARGE' then
    if v_from_kind is distinct from 'BANK' then
      raise exception 'A bank charge is taken from a bank account in use.'
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if p_to is distinct from public.gl_account_for('BANK_AND_PAYMENT_CHARGES') then
      -- 0570: the account's own number and name, read by its role.
      select a.code || ' ' || a.name into v_named from public.gl_accounts a
       where a.code = public.gl_account_for('BANK_AND_PAYMENT_CHARGES');
      raise exception 'A bank charge goes to %.', v_named
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  elsif p_kind = 'BANK_CREDIT' then
    if p_from is distinct from public.gl_account_for('OTHER_INCOME') then
      -- 0570: the account's own number and name, read by its role.
      select a.code || ' ' || a.name into v_named from public.gl_accounts a
       where a.code = public.gl_account_for('OTHER_INCOME');
      raise exception 'A bank credit comes from %.', v_named
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if v_to_kind is distinct from 'BANK' then
      raise exception 'A bank credit goes into a bank account in use.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  else
    if v_from_kind is distinct from 'HOLDING' then
      raise exception 'A card payout comes from a card or online holding account in use.'
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if v_to_kind is distinct from 'BANK' then
      raise exception 'A card payout goes into a bank account in use.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  end if;
end;
$function$;

-- pg_proc on a 0563 clone. Only the refusal sentence changed: it names the
-- account by its role's own number and name instead of '1230'.
CREATE OR REPLACE FUNCTION public.gl_manual_journal(p_entry_date date, p_narration text, p_lines jsonb, p_request_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role    app_role;
  v_uid     uuid;
  v_elem    jsonb;
  v_idx     int := 0;
  v_code    text;
  v_control boolean;
  v_doc_no  text;
  v_id      uuid;
  v_seen    public.gl_manual_journal_requests%rowtype;
  v_seen_no text;
begin
  v_role := public.app_role();
  if not coalesce(public.is_principal(), false) then
    raise exception 'gl_manual_journal refused: role % may not raise a manual journal — principal only', coalesce(v_role::text,'none')
      using errcode = '42501', detail = 'gl_manual_journal_forbidden';
  end if;
  v_uid := auth.uid();

  -- A resend carries the same key. The lock queues it behind the first call,
  -- and it then finds what the first call recorded.
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('gl_manual_journal:' || p_request_key::text, 0));
    select r.* into v_seen from public.gl_manual_journal_requests r
     where r.request_key = p_request_key;
    if found then
      -- The same key must carry the same entry. A key sent again with another
      -- date, narration or lines is not a resend: say so, and never hand back
      -- an entry that is not what the person typed.
      if v_seen.entry_date is distinct from p_entry_date
         or v_seen.narration is distinct from btrim(coalesce(p_narration, ''))
         or v_seen.lines is distinct from p_lines
         or v_seen.created_by is distinct from v_uid then
        select e.entry_no into v_seen_no from public.gl_entries e where e.id = v_seen.entry_id;
        raise exception 'gl_manual_journal refused: this request was already recorded as % with different details', coalesce(v_seen_no, v_seen.entry_id::text)
          using errcode = 'P0001', detail = 'idempotency_mismatch';
      end if;
      return v_seen.entry_id;
    end if;
  end if;

  if p_entry_date is null then
    raise exception 'gl_manual_journal refused: entry_date is required — a blank date is never replaced with today'
      using errcode = '22023', detail = 'gl_manual_journal_entry_date_null';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'gl_manual_journal refused: p_lines must be a JSON array, got %', coalesce(jsonb_typeof(p_lines),'null')
      using errcode = '22023', detail = 'gl_manual_journal_lines_not_array';
  end if;
  if nullif(btrim(coalesce(p_narration,'')), '') is null then
    raise exception 'gl_manual_journal refused: a narration is required — a manual journal with no explanation is unauditable'
      using errcode = '22023', detail = 'gl_manual_journal_narration_blank';
  end if;

  -- Control accounts belong to their subsidiary documents, not to a keyboard.
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'gl_manual_journal refused: line % is a %, expected an object', v_idx, jsonb_typeof(v_elem)
        using errcode = '22023', detail = 'gl_manual_journal_line_not_object';
    end if;
    v_code := btrim(coalesce(v_elem->>'account_code',''));
    select a.is_control into v_control from public.gl_accounts a where a.code = v_code;
    if found and v_control then
      raise exception 'gl_manual_journal refused: line % names control account % — AR and AP move only through their own documents', v_idx, v_code
        using errcode = '22023', detail = 'gl_manual_journal_control_account';
    end if;
    -- 0510: the supplier advance account is written only by the Advance flow.
    -- 0570: its number and name are the account's own, read by its role.
    if v_code = public.gl_account_for('SUPPLIER_ADVANCE') then
      raise exception 'gl_manual_journal refused: line % names account % %, which is kept by its own documents', v_idx,
        v_code, (select a.name from public.gl_accounts a where a.code = v_code)
        using errcode = '22023', detail = 'gl_manual_journal_control_account';
    end if;
  end loop;

  v_doc_no := public.gl_next_doc_no('MJ', p_entry_date);

  v_id := public.gl_post('MANUAL', v_doc_no, p_entry_date, p_narration, p_lines);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Manual journal posted · %s · %s', v_doc_no, btrim(p_narration)),
          v_doc_no);

  if p_request_key is not null then
    insert into public.gl_manual_journal_requests
      (request_key, entry_id, entry_date, narration, lines, created_by)
    values
      (p_request_key, v_id, p_entry_date, btrim(p_narration), p_lines, v_uid);
  end if;

  return v_id;
end;
$function$;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_left int;
  v_bad  text;
begin
  -- Every key that names the chart cascades, the chart's own parent key first.
  if not exists (select 1 from pg_constraint
                  where conname = 'gl_accounts_parent_code_fkey'
                    and conrelid = 'public.gl_accounts'::regclass
                    and confupdtype = 'c') then
    raise exception '0570 sanity: a renumbered heading would lose its children';
  end if;
  with recursive closure(relid, attnum) as (
    select a.attrelid, a.attnum
      from pg_attribute a
     where a.attrelid = 'public.gl_accounts'::regclass
       and a.attname = 'code' and not a.attisdropped
    union
    select c.conrelid, c.conkey[1]
      from pg_constraint c
      join closure d on d.relid = c.confrelid and d.attnum = c.confkey[1]
     where c.contype = 'f' and array_length(c.conkey, 1) = 1
  )
  select count(*) into v_left
    from pg_constraint c
    join closure d on d.relid = c.confrelid and d.attnum = c.confkey[1]
   where c.contype = 'f' and c.confupdtype <> 'c';
  if v_left > 0 then
    raise exception '0570 sanity: % key(s) naming the chart still do not cascade', v_left;
  end if;

  -- Every UPDATE trigger on a table that names the chart lets a renumber
  -- through, and names every one of that table's chart columns. A trigger this
  -- file did not rebuild (one the clone lacked) stops the apply here.
  select string_agg(format('%s.%s (%s)', t.tgrelid::regclass, t.tgname, k.col), ', ') into v_bad
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join (select c.conrelid as relid, a.attname::text as col
            from pg_constraint c
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
           where c.contype = 'f'
             and c.confrelid in ('public.gl_accounts'::regclass, 'public.gl_money_accounts'::regclass)) k
      on k.relid = t.tgrelid
   where not t.tgisinternal
     and (t.tgtype & 16) = 16                                   -- fires on UPDATE
     and (p.prosrc !~ 'gl_renumber_only|gl_renumber_from'
          or position(quote_literal(k.col) in p.prosrc) = 0);
  if v_bad is not null then
    raise exception '0570 sanity: these update triggers would refuse a renumber: %', v_bad;
  end if;

  if has_function_privilege('anon', 'public.gl_account_update(text, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_account_update(text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.gl_account_move(text, text, text[], text[], text[], text[])', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_account_move(text, text, text[], text[], text[], text[])', 'execute')
     or has_function_privilege('anon', 'public.gl_rule_headings()', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_rule_headings()', 'execute')
     or has_function_privilege('authenticated', 'public.gl_renumber_only(jsonb, jsonb, text[])', 'execute')
     or has_function_privilege('anon', 'public.gl_renumber_only(jsonb, jsonb, text[])', 'execute') then
    raise exception '0570 sanity: the grants on the 0570 functions are wrong';
  end if;

  -- The two-heading promise is the pair of `was` checks. Without them a move is
  -- last-write-wins under both headings.
  if position('p_from_was is distinct from v_order' in
              pg_get_functiondef('public.gl_account_move(text, text, text[], text[], text[], text[])'::regprocedure)) = 0
     or position('p_to_was is distinct from v_order' in
              pg_get_functiondef('public.gl_account_move(text, text, text[], text[], text[], text[])'::regprocedure)) = 0 then
    raise exception '0570 sanity: gl_account_move does not check the order the caller saw under both headings';
  end if;

  -- The roles gl_rule_headings reads are there.
  if public.gl_account_for('CUSTOMER_MONEY_HEADING') is null or public.gl_account_for('STOCK_HEADING') is null then
    raise exception '0570 sanity: a heading role is missing';
  end if;

  if has_function_privilege('anon', 'public.gl_account_roles_read()', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_account_roles_read()', 'execute') then
    raise exception '0570 sanity: the grants on gl_account_roles_read are wrong';
  end if;

  -- No account number is written inside the five rebuilt bodies, comments
  -- left out: not one of the numbers they used to carry, and not one of the
  -- chart's numbers as they stand when this runs.
  select string_agg(distinct format('%s (%s)', f.fn::regprocedure, n.code), ', ') into v_bad
    from (values ('public.gl_money_account_add(text, text)'),
                 ('public.fin_money_in_account_problem(text, text)'),
                 ('public._gl_money_move_check(text, text, text, numeric, numeric, date)'),
                 ('public.gl_manual_journal(date, text, jsonb, uuid)'),
                 ('public.gl_account_update(text, text, text)')) as f(fn)
    cross join lateral (select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body
                          from pg_proc p where p.oid = f.fn::regprocedure) b
    join (select a.code from public.gl_accounts a
          union
          select unnest(array['1100','1121','1129','1131','1139','1230','1300',
                              '2200','3200','3300','4900','6500'])) n
      on b.body ~ ('(^|[^0-9A-Za-z-])' || n.code || '([^0-9A-Za-z-]|$)')
   -- the shape sentence's own examples, which name no account
   where not (f.fn = 'public.gl_account_update(text, text, text)' and n.code = '1210');
  if v_bad is not null then
    raise exception '0570 sanity: an account number is still written inside a body: %', v_bad;
  end if;

  -- The number's shape, in the door: today's four digits or AutoCount's.
  if position('''^([0-9]{4}|[0-9]{3}-[0-9A-Z][0-9]{3})$''' in
              pg_get_functiondef('public.gl_account_update(text, text, text)'::regprocedure)) = 0 then
    raise exception '0570 sanity: gl_account_update does not check AutoCount''s number shape';
  end if;
  -- 0560's blank test survives in the door.
  if position('coalesce(p_name, '''') !~ ''[^[:space:]]''' in
              pg_get_functiondef('public.gl_account_update(text, text, text)'::regprocedure)) = 0 then
    raise exception '0570 sanity: gl_account_update lost 0560''s blank-name test';
  end if;
end $sanity$;

commit;
