-- =============================================================================
-- 0648_finance_also_decides_who_may_ask_finance_to_pay.sql
-- =============================================================================
-- WHAT CHANGES
--   Chew (Finance) 2026-10-03, docs/finance/MASTER.md §3.3: Finance ticks
--   which Operation staff may ask Finance to pay; the boss still may. 0645 let
--   only the boss tick. Only the people ticked see `Payment Requests` and can
--   ask; Finance and the boss always may, as before.
--
--   finance_request_grant_set: re-created from 0645's body (the only one) with
--   one change, the gate: a Finance person or the principal person, through
--   the new helper _finance_may_grant_requests(). Its refusal now says so.
--   payment_request_me: gains `may_grant` (the same helper) so the page knows
--   who may tick. `boss` stays exactly as it was.
--   payment_request_save: re-created from 0645's body (the only one) with one
--   changed sentence, its refusal to someone not allowed: `Only staff allowed
--   by Finance or the boss can ask Finance to pay.` (was: "the boss has
--   allowed"). The sanity block checks nothing else in it changed.
--
-- RLS: unchanged. No policy is created, dropped or altered. DATA: none read
-- or written. DR/CR: none.
-- =============================================================================

begin;

-- The request door as it stands, so the sanity block can prove that one
-- sentence is all that changed in it.
create temp table _0648_request_door_before on commit drop as
  select replace(p.prosrc, chr(13), '') as src
    from pg_proc p
   where p.oid = 'public.payment_request_save(uuid, text, numeric, text, date, text, text, text, text, text, date)'::regprocedure;

-- May this person tick who may ask? A Finance person or the principal person;
-- a shared login is never a person (0645's own test for the boss).
create or replace function public._finance_may_grant_requests()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(public.app_role()::text in ('finance', 'principal')
                  and public.workspace_is_person(auth.uid()), false)
$fn$;
revoke all on function public._finance_may_grant_requests() from public, anon, authenticated;

create or replace function public.finance_request_grant_set(p_user_id uuid, p_allowed boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me   uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_user public.app_users%rowtype;
  v_id   uuid;
begin
  if v_me is null or not public._finance_may_grant_requests() then
    raise exception 'Only Finance or the boss decides who may ask Finance to pay.' using errcode = '42501', detail = 'may_not_grant';
  end if;
  select * into v_user from public.app_users where id = p_user_id;
  if not found or v_user.status <> 'active' or v_user.role::text <> 'operation' or not coalesce(v_user.is_person, true) then
    raise exception 'Only an active Operation staff member can be allowed to ask.' using errcode = 'P0001', detail = 'not_grantable';
  end if;
  perform 1 from public.app_users where id = p_user_id for update;  -- one change for one person at a time
  select g.id into v_id from public.finance_request_grants g where g.user_id = p_user_id and g.revoked_at is null;
  if p_allowed and v_id is null then
    insert into public.finance_request_grants (user_id, granted_by) values (p_user_id, v_me) returning id into v_id;
  elsif not p_allowed and v_id is not null then
    update public.finance_request_grants set revoked_by = v_me, revoked_at = now() where id = v_id;
  end if;
  return v_id;
end;
$fn$;

-- What the menu and the page need to know about the caller.
create or replace function public.payment_request_me()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'may_request', public.finance_may_request_payment(auth.uid()),
    'finance', coalesce(public.app_role()::text in ('finance', 'principal'), false),
    'boss', coalesce(public.app_role()::text = 'principal' and public.workspace_is_person(auth.uid()), false),
    'may_grant', public._finance_may_grant_requests())
$fn$;

-- The request door, re-created from 0645's body (the only one) with one
-- change: its refusal names who allows, now that Finance does too.
create or replace function public.payment_request_save(
  p_request_id          uuid,
  p_payee_name          text,
  p_amount              numeric,
  p_purpose             text,
  p_pay_by              date default null,
  p_note                text default null,
  p_bank_name           text default null,
  p_bank_account_no     text default null,
  p_bank_account_holder text default null,
  p_bill_no             text default null,
  p_bill_date           date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me  uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_req public.payment_requests%rowtype;
  v_id  uuid;
  v_today date := timezone('Asia/Kuala_Lumpur', now())::date;
begin
  if v_me is null or not public.finance_may_request_payment(v_me) then
    raise exception 'Only staff allowed by Finance or the boss can ask Finance to pay.'
      using errcode = '42501', detail = 'not_allowed_to_request';
  end if;
  if coalesce(p_payee_name, '') !~ '[^[:space:]]' then
    raise exception 'Say who is to be paid.' using errcode = 'P0001', detail = 'payee_missing';
  end if;
  if length(btrim(p_payee_name)) > 120 then
    raise exception 'The payee''s name is too long.' using errcode = 'P0001', detail = 'payee_too_long';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than RM 0.00.' using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'Type the amount in ringgit and sen, like 1250.00.' using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if coalesce(p_purpose, '') !~ '[^[:space:]]' then
    raise exception 'Say what the payment is for.' using errcode = 'P0001', detail = 'purpose_missing';
  end if;
  if length(btrim(p_purpose)) > 300 then
    raise exception 'Keep what it is for to 300 characters.' using errcode = 'P0001', detail = 'purpose_too_long';
  end if;
  if length(coalesce(p_note, '')) > 2000 then
    raise exception 'Keep the note to 2,000 characters.' using errcode = 'P0001', detail = 'note_too_long';
  end if;
  if length(btrim(coalesce(p_bank_name, ''))) > 80 or length(btrim(coalesce(p_bank_account_no, ''))) > 40
     or length(btrim(coalesce(p_bank_account_holder, ''))) > 120 or length(btrim(coalesce(p_bill_no, ''))) > 80 then
    raise exception 'A bank or bill detail is too long.' using errcode = 'P0001', detail = 'detail_too_long';
  end if;
  if p_bank_account_no is not null and btrim(p_bank_account_no) <> '' and btrim(p_bank_account_no) !~ '^[0-9][0-9 -]{4,38}[0-9]$' then
    raise exception 'An account number is digits only.' using errcode = 'P0001', detail = 'account_no_invalid';
  end if;

  if p_request_id is null then
    v_id := gen_random_uuid();
    insert into public.payment_requests
      (id, request_no, requested_by, payee_name, amount, pay_by, purpose, note,
       bank_name, bank_account_no, bank_account_holder, bill_no, bill_date)
    values
      (v_id, public.allocate_formal_document_code('PRQ', v_id::text, v_today), v_me,
       btrim(p_payee_name), p_amount, p_pay_by, btrim(p_purpose), nullif(btrim(coalesce(p_note, '')), ''),
       nullif(btrim(coalesce(p_bank_name, '')), ''), nullif(btrim(coalesce(p_bank_account_no, '')), ''),
       nullif(btrim(coalesce(p_bank_account_holder, '')), ''), nullif(btrim(coalesce(p_bill_no, '')), ''), p_bill_date);
    perform public._payment_request_event(v_id, 'submitted', null);
    return v_id;
  end if;

  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found or (v_req.requested_by <> v_me and not coalesce(public.gl_may_read(), false)) then
    raise exception 'That payment request is not one you can open.' using errcode = 'P0002', detail = 'request_missing';
  end if;
  if v_req.requested_by <> v_me then
    raise exception 'Only the person who asked changes a request. Finance returns it instead.'
      using errcode = '42501', detail = 'not_yours';
  end if;
  if v_req.status not in ('submitted', 'returned') then
    raise exception 'Payment request % is % and can no longer change.', v_req.request_no,
      case v_req.status when 'answered' then 'answered by Finance' else 'withdrawn' end
      using errcode = 'P0001', detail = 'request_locked';
  end if;

  update public.payment_requests
     set payee_name = btrim(p_payee_name), amount = p_amount, pay_by = p_pay_by, purpose = btrim(p_purpose),
         note = nullif(btrim(coalesce(p_note, '')), ''),
         bank_name = nullif(btrim(coalesce(p_bank_name, '')), ''),
         bank_account_no = nullif(btrim(coalesce(p_bank_account_no, '')), ''),
         bank_account_holder = nullif(btrim(coalesce(p_bank_account_holder, '')), ''),
         bill_no = nullif(btrim(coalesce(p_bill_no, '')), ''), bill_date = p_bill_date,
         status = 'submitted', updated_at = now()
   where id = p_request_id;
  perform public._payment_request_event(p_request_id,
    case when v_req.status = 'returned' then 'resubmitted' else 'edited' end, null);
  return p_request_id;
end;
$fn$;

-- The grants are unchanged from 0645; re-stated so this file stands alone.
revoke all on function public.finance_request_grant_set(uuid, boolean) from public, anon;
revoke all on function public.payment_request_me() from public, anon;
grant execute on function public.finance_request_grant_set(uuid, boolean) to authenticated;
grant execute on function public.payment_request_me() to authenticated;

do $sanity$
begin
  if has_function_privilege('authenticated', 'public._finance_may_grant_requests()', 'execute') then
    raise exception '0648 sanity: the internal helper is callable from outside';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('_finance_may_grant_requests', 'finance_request_grant_set', 'payment_request_me', 'payment_request_save')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0648 sanity: a function lost security definer or its search_path';
  end if;
  if position('_finance_may_grant_requests()' in pg_get_functiondef('public.finance_request_grant_set(uuid, boolean)'::regprocedure)) = 0 then
    raise exception '0648 sanity: the grant door does not use the one gate';
  end if;
  -- The request door: the one sentence changed, nothing else.
  if (select replace(b.src, 'Only staff the boss has allowed can ask Finance to pay.',
                            'Only staff allowed by Finance or the boss can ask Finance to pay.')
        from _0648_request_door_before b)
     is distinct from
     (select replace(p.prosrc, chr(13), '') from pg_proc p
       where p.oid = 'public.payment_request_save(uuid, text, numeric, text, date, text, text, text, text, text, date)'::regprocedure) then
    raise exception '0648 sanity: the request door changed beyond its one sentence';
  end if;
  -- No caller: nobody may tick.
  if public._finance_may_grant_requests() then
    raise exception '0648 sanity: an anonymous caller may tick';
  end if;
end
$sanity$;

commit;
