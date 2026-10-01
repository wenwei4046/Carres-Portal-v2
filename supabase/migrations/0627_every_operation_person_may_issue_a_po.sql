-- ═══════════════════════════════════════════════════════════════════════════
-- 0627 · EVERY ACTIVE OPERATION PERSON MAY ISSUE A PO
--
-- PURCHASING §5.3 · owner ruling 2026-09-29: every active Operation staff
-- person, including a joining-month newcomer, may place and issue a PO without
-- holding PO Duty or cover. PO Duty (or the dated cover) remains the NORMAL
-- work owner; normal duty, cover and actual issuer are recorded separately.
-- Approval capability is untouched: no approval or self-approval is granted.
--
-- 1 · purchasing_po_actor() stops reading the legacy month tables
--     (ops_po_duty / ops_po_duty_cover, 0379) and returns the ONE Shared Duty
--     Resolver's answer (workspace_resolve_duty('po_duty'), ERP Law F.1) in its
--     existing shape, so every caller keeps its keys.
-- 2 · purchasing_actor_may_issue(uuid) = Operations Superuser OR an active,
--     person Operation account. A shared login (is_person = false) is not a
--     person (0592) and gains nothing here.
-- 3 · po_history.issue_authority learns `operation_staff` — the issuer who is
--     neither the duty holder, the cover nor a superuser. The trigger keeps the
--     duty holder and cover beside the actual actor.
-- 4 · The unversioned 0311 door purchasing_set_line_destination is revoked.
--     A line's Deliver To moves only through the versioned 0610 door, which
--     carries Units and Sales Order lineage.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · one duty resolver ────────────────────────────────────────────────
create or replace function public.purchasing_po_actor()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_duty jsonb := public.workspace_resolve_duty('po_duty', null);
  -- The resolver's system-assignment branch (0625) fills acting_user_id with
  -- the resolved person EVEN WHEN that person is the normal holder
  -- (is_cover = false). 0379's contract, which the issue trigger and po_sends
  -- read, is that acting/cover is set ONLY for a real cover — otherwise the
  -- normal holder would be recorded as their own cover.
  v_is_cover boolean := coalesce((v_duty->>'is_cover')::boolean, false);
begin
  return jsonb_build_object(
    'normal_user_id', nullif(v_duty->>'normal_user_id', '')::uuid,
    'acting_user_id', case when v_is_cover then nullif(v_duty->>'acting_user_id', '')::uuid end,
    'actor_user_id',  nullif(v_duty->>'actor_user_id', '')::uuid,
    'is_cover',       v_is_cover,
    'cover_id',       case when v_is_cover then nullif(v_duty->>'cover_id', '')::uuid end,
    'month',          to_char(timezone('Asia/Kuala_Lumpur', now()), 'YYYY-MM')
  );
end;
$$;

comment on function public.purchasing_po_actor() is
  '0627: the normal PO Duty owner and today''s cover, read from workspace_resolve_duty(po_duty). Ownership only; issue permission is purchasing_actor_may_issue.';

-- ── 2 · every active Operation person may issue ──────────────────────────
create or replace function public.purchasing_actor_may_issue(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null
     and (
       public.is_operations_superuser(p_user)
       or exists (
         select 1 from public.app_users u
          where u.id = p_user
            and u.role = 'operation'
            and u.status = 'active'
            and u.is_person
       )
     );
$$;

revoke all on function public.purchasing_actor_may_issue(uuid) from public;
grant execute on function public.purchasing_actor_may_issue(uuid) to authenticated;

comment on function public.purchasing_actor_may_issue(uuid) is
  '0627 (owner ruling 2026-09-29): any active person Operation account, or an Operations Superuser, may issue and confirm-send a PO. PO Duty is the normal owner, not the permission.';

-- ── 3 · the actual issuer is recorded beside duty and cover ──────────────
alter table public.po_history drop constraint if exists po_history_issue_authority_check;
alter table public.po_history add constraint po_history_issue_authority_check
  check (issue_authority is null
         or issue_authority in ('po_duty', 'po_duty_cover', 'operations_superuser', 'operation_staff'));

create or replace function public.purchasing_record_po_issue_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_who jsonb;
  v_normal uuid;
  v_cover uuid;
  v_authority text;
begin
  -- Seed, service and historical system writes have no end-user actor to claim.
  if v_actor is null then
    return new;
  end if;

  v_who := public.purchasing_po_actor();
  v_normal := nullif(v_who->>'normal_user_id', '')::uuid;
  v_cover := nullif(v_who->>'acting_user_id', '')::uuid;

  v_authority := case
    when v_actor = v_cover then 'po_duty_cover'
    when v_actor = v_normal and v_cover is null then 'po_duty'
    when public.is_operations_superuser(v_actor) then 'operations_superuser'
    when public.purchasing_actor_may_issue(v_actor) then 'operation_staff'
    else null
  end;

  insert into public.po_history (
    po_id, text, by_role,
    by_user_id, issue_duty_user_id, issue_cover_user_id, issue_authority
  ) values (
    new.id, 'Purchase order issued', public.app_role(),
    v_actor, v_normal, v_cover, v_authority
  );

  return new;
end;
$$;

-- ── 4 · the unversioned line-destination door is closed ─────────────────
revoke all on function public.purchasing_set_line_destination(uuid, uuid) from public, anon, authenticated;

-- ── sanity: schema only, never a row count ───────────────────────────────
do $$
begin
  if has_function_privilege('authenticated', 'public.purchasing_set_line_destination(uuid, uuid)', 'execute') then
    raise exception '0627: purchasing_set_line_destination is still executable by authenticated';
  end if;
  if public.purchasing_actor_may_issue(null) then
    raise exception '0627: a null caller may issue';
  end if;
end;
$$;

commit;

-- VERIFY AFTER governed apply (no row-count assertion):
-- select public.purchasing_po_actor();            -- same holder as workspace_resolve_duty('po_duty')
-- select public.purchasing_actor_may_issue(id) from app_users where role = 'operation' and status = 'active' and is_person;
