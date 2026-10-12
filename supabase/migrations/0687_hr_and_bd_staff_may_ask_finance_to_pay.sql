-- =============================================================================
-- 0687_hr_and_bd_staff_may_ask_finance_to_pay.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-12, 「hr & BD 也到能申请」; docs/finance/MASTER.md
--   §3.3 and §1 Exceptions): HR and BD staff may ask Finance to pay a bill
--   through Payment Requests, as the Operation staff Finance or the boss ticks
--   may.
--
-- WHAT THIS CHANGES
--   finance_request_grant_list lists active HR and BD staff beside Operation
--   staff, and finance_request_grant_set lets Finance or the boss tick them.
--   Asking was already decided by the grant, not the role
--   (finance_may_request_payment, 0645), so no other door changes. A shared
--   login still cannot be ticked.
--
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- Replace one exact snippet of a live function; refuse unless it occurs once.
-- Each snippet sits mid-line, so its note is a block comment, never `--`.
create or replace function pg_temp.mig0687_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0687: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

select pg_temp.mig0687_rewrite('public.finance_request_grant_list()'::regprocedure,
$old$u.role::text = 'operation'$old$,
$new$u.role::text in ('operation', 'hr', 'bd') /* 0687 */$new$);

select pg_temp.mig0687_rewrite('public.finance_request_grant_set(uuid, boolean)'::regprocedure,
$old$v_user.role::text <> 'operation'$old$,
$new$v_user.role::text not in ('operation', 'hr', 'bd') /* 0687 */$new$);

select pg_temp.mig0687_rewrite('public.finance_request_grant_set(uuid, boolean)'::regprocedure,
$old$'Only an active Operation staff member can be allowed to ask.'$old$,
$new$'Only an active Operation, HR or BD staff member can be allowed to ask.'$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select pg_get_functiondef('public.finance_request_grant_list()'::regprocedure) into v_src;
  if position('in (''operation'', ''hr'', ''bd'')' in v_src) = 0 or position('gl_may_read' in v_src) = 0
     or position('is_person' in v_src) = 0 then
    raise exception '0687: the list does not take HR and BD staff, or lost a check';
  end if;
  select pg_get_functiondef('public.finance_request_grant_set(uuid, boolean)'::regprocedure) into v_src;
  if position('not in (''operation'', ''hr'', ''bd'')' in v_src) = 0
     or position('_finance_may_grant_requests' in v_src) = 0 or position('is_person' in v_src) = 0 then
    raise exception '0687: ticking does not take HR and BD staff, or lost a check';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('finance_request_grant_list', 'finance_request_grant_set')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0687: a grant function lost security definer or its search_path';
  end if;
end $sanity$;

commit;
