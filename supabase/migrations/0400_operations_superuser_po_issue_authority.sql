-- =============================================================================
-- 0400 · Operations Superuser uses the one PO-issue authority
-- =============================================================================
-- PO Duty / dated cover remains the normal work owner. This migration adds a
-- governed capability for exceptional operational action; it never changes
-- the owner and never makes an email comparison at runtime.
--
-- PO creation audit is stamped at the purchase_orders boundary, so SO Batch
-- Purchase and Manual Purchase cannot diverge. The actual actor, normal holder
-- and dated cover are three separate facts.
--
-- NO RLS CHANGE. NO production apply is authorised by this repository change.
-- =============================================================================

begin;

alter table public.app_users
  add column if not exists operations_superuser boolean not null default false;

comment on column public.app_users.operations_superuser is
  'Governed Operations Superuser capability. It permits operational action without changing normal duty ownership.';

-- The Owner-governed shared Operations account. This is a one-time data
-- assignment; application and SQL callers never identify it by email.
update public.app_users
   set operations_superuser = true
 where lower(email) = 'operation@carres.com';

create or replace function public.is_operations_superuser(p_user uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select coalesce((
    select u.operations_superuser or u.role = 'principal'
      from public.app_users u
     where u.id = p_user
  ), false);
$$;

revoke all on function public.is_operations_superuser(uuid) from public;
grant execute on function public.is_operations_superuser(uuid) to authenticated;

comment on function public.is_operations_superuser(uuid) is
  '0400: governed operational capability. Principal (Jess) and explicitly flagged accounts may act without inheriting PO Duty ownership.';

create or replace function public.purchasing_actor_may_issue(p_user uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select p_user is not null
     and (
       public.is_operations_superuser(p_user)
       or (public.purchasing_po_actor()->>'actor_user_id')::uuid = p_user
     );
$$;

revoke all on function public.purchasing_actor_may_issue(uuid) from public;
grant execute on function public.purchasing_actor_may_issue(uuid) to authenticated;

comment on function public.purchasing_actor_may_issue(uuid) is
  '0400: the one PO issue capability — current duty, dated cover, or governed Operations Superuser.';

comment on column public.po_sends.acting_user_id is
  'Dated PO Duty cover in force when the send was confirmed. sent_by is the actual actor; a superuser action never turns this cover into the actor.';

alter table public.po_history
  add column if not exists issue_duty_user_id uuid references public.app_users(id);
alter table public.po_history
  add column if not exists issue_cover_user_id uuid references public.app_users(id);
alter table public.po_history
  add column if not exists issue_authority text
    check (issue_authority is null or issue_authority in ('po_duty', 'po_duty_cover', 'operations_superuser'));

comment on column public.po_history.issue_duty_user_id is
  'Normal PO Duty owner at issue time; distinct from the actual actor.';
comment on column public.po_history.issue_cover_user_id is
  'Dated PO Duty cover in force at issue time, whether the cover or a superuser acted.';
comment on column public.po_history.issue_authority is
  'Authority used by the actual actor: po_duty, po_duty_cover, or operations_superuser.';

create or replace function public.purchasing_record_po_issue_authority()
returns trigger
language plpgsql
security definer
set search_path = public
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

comment on function public.purchasing_record_po_issue_authority() is
  '0400: atomically records actual PO issuer plus normal duty and dated cover context for every purchase_order insert.';

drop trigger if exists purchasing_record_po_issue_authority on public.purchase_orders;
create trigger purchasing_record_po_issue_authority
  after insert on public.purchase_orders
  for each row
  execute function public.purchasing_record_po_issue_authority();

commit;

-- VERIFY AFTER governed apply (no row-count assertion):
-- select operations_superuser from app_users where lower(email) = 'operation@carres.com';
-- select proname from pg_proc where proname in ('is_operations_superuser', 'purchasing_actor_may_issue');
-- Issue one eligible PO as operation@ and inspect po_history.by_user_id,
-- issue_duty_user_id, issue_cover_user_id and issue_authority.
