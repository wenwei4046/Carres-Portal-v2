-- 0593 . Finance may suspend and reactivate a dealer
--
-- Owner ruling (YH, 28 Sep 2026): Finance may suspend a dealer and reactivate
-- it, "for now". Inviting a dealer stays with the principal (not ruled).
--   1. dealer_set_status (0013) refused everyone but the principal. It now
--      lets the principal or Finance through. The role is read NULL-safe:
--      coalesce(app_role()::text, '') in (...), so a caller with no active
--      account (app_role() is NULL) is refused, never waved through.
--   2. The audit row names the caller's real role. 0013 wrote 'principal'
--      for every change, which would log a Finance suspension as the
--      principal's. The action text is unchanged.
--   3. Everything else is 0013's body: active|suspended only, a same-status
--      call returns the row untouched, a missing dealer is 42P01.
-- What a suspension does is unchanged: it sets dealers.status and writes the
-- audit row. Nothing else reads dealers.status to refuse a login or an order.
-- RLS: no change. GRANTS: authenticated only; public and anon revoked (0482).
-- No new words on screen. No account code. No backfill.

begin;

create or replace function public.dealer_set_status(
  p_dealer_id  uuid,
  p_new_status dealer_status,
  p_reason     text default null
)
returns dealers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer dealers;
  v_actor  text;
  v_role   app_role;
begin
  v_role := public.app_role();
  -- 0593: principal or Finance. NULL-safe: no active account = no role = refused.
  if coalesce(v_role::text, '') not in ('principal', 'finance') then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;

  if p_new_status not in ('active', 'suspended') then
    raise exception 'set_status only for active|suspended (use approval_decide for pending->active)'
      using errcode = '22023', detail = 'invalid_status';
  end if;

  select * into v_dealer from dealers where id = p_dealer_id;
  if not found then
    raise exception 'dealer not found' using errcode = '42P01';
  end if;

  if v_dealer.status = p_new_status then
    return v_dealer;
  end if;

  update dealers set status = p_new_status, updated_at = now()
   where id = p_dealer_id
   returning * into v_dealer;

  v_actor := coalesce((select name from app_users where id = auth.uid()), initcap(v_role::text));
  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    v_role,
    v_actor,
    format('%s dealer · %s%s',
      case p_new_status when 'suspended' then 'Suspended' when 'active' then 'Reactivated' else 'Updated' end,
      v_dealer.name,
      case when p_reason is not null and btrim(p_reason) <> '' then ' (' || p_reason || ')' else '' end),
    p_dealer_id,
    p_dealer_id::text
  );

  return v_dealer;
end;
$$;

comment on function public.dealer_set_status(uuid, dealer_status, text) is
  '0593: suspend or reactivate a dealer. Principal or Finance (NULL-safe role check); the audit row names the caller''s role.';

revoke all on function public.dealer_set_status(uuid, dealer_status, text) from public, anon;
grant execute on function public.dealer_set_status(uuid, dealer_status, text) to authenticated;

do $check$
begin
  if has_function_privilege('anon', 'public.dealer_set_status(uuid, dealer_status, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.dealer_set_status(uuid, dealer_status, text)', 'execute') then
    raise exception '0593 check: dealer_set_status has the wrong grants';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = 'public.dealer_set_status(uuid, dealer_status, text)'::regprocedure
                    and p.prosecdef and p.proconfig @> array['search_path=public, pg_temp']) then
    raise exception '0593 check: dealer_set_status lost security definer or its search_path';
  end if;
end
$check$;

commit;
