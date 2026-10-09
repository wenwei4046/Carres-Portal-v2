-- 0678 — Issue Tracker Settings keep a change record (Carres Settings List
-- SET-01 "Old/new · actor/time" for every authorised Settings change; ISS-04
-- History "Who · when · old → new"; owner 9 Oct 2026).
--
-- Scope: the existing Settings → Issue Tracker → Related Party master only.
-- Every insert, edit or removal of a Related Party writes one row to the
-- Settings change record (0669 `settings_changes`, section 'issue_tracker'):
-- who (the signed-in person; null only for a system write), when, the old and
-- the new values. A reason is not compulsory (not confirmed). No other Issue
-- Tracker behaviour changes; Issue Tracker itself stays not authorised beyond
-- this Settings record. No RLS policy changes.

create or replace function public._issue_related_party_record_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'id' - 'created_at' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'id' - 'created_at' end;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  insert into public.settings_changes (section, what, old_value, new_value, actor_id)
  values ('issue_tracker',
          'related_party:' || coalesce(case when tg_op = 'DELETE' then old.name else new.name end, ''),
          v_old, v_new,
          (select u.id from public.app_users u where u.id = auth.uid()));
  return null;
end;
$fn$;
revoke all on function public._issue_related_party_record_change() from public, anon, authenticated;

drop trigger if exists issue_related_parties_record_change on public.issue_related_parties;
create trigger issue_related_parties_record_change
  after insert or update or delete on public.issue_related_parties
  for each row execute function public._issue_related_party_record_change();
