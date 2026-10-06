-- 0437 — offboard one Operation employee without rewriting her history
--
-- Effective 2026-09-07. Historical actor, assignment and employment evidence
-- stays readable. Current/future access, pool membership, cover and duty are
-- removed. PO and GRN remain segregated between the two current Operation
-- staff: Yu Jun orders while Shasha receives for the rest of September; the
-- monthly pair alternates afterwards.

begin;

set search_path = public, pg_temp;

do $offboard$
declare
  v_exit_date date := date '2026-09-07';
  v_khor uuid;
  v_yu_jun uuid;
  v_shasha uuid;
  v_principal uuid;
  v_employee uuid;
begin
  select id into v_khor from app_users where lower(email) = 'khoryee@carres.com';
  select id into v_yu_jun from app_users where lower(email) = 'yujun@carres.com';
  select id into v_shasha from app_users where lower(email) = 'shasha@carres.com';
  select id into v_principal from app_users
   where lower(email) = 'principal@carres.com'
   order by created_at
   limit 1;

  if v_khor is null or v_yu_jun is null or v_shasha is null then
    raise exception '0437 requires Khor Yee, Yu Jun and Shasha accounts';
  end if;
  if v_yu_jun = v_shasha then
    raise exception '0437 requires two distinct remaining staff accounts';
  end if;

  -- Access and the retired order-assignment pool are current configuration,
  -- not history. The staff code and past actor references remain untouched.
  update app_users set status = 'disabled' where id = v_khor;
  delete from ops_staff_settings where user_id = v_khor;

  -- Record the employment result once. Do not store probation commentary in
  -- source control or duplicate an event when a production operator already
  -- recorded the same effective termination.
  select id into v_employee from hr_employees where app_user_id = v_khor;
  if v_employee is not null then
    update hr_employees
       set exit_date = v_exit_date,
           exit_reason = 'terminated',
           exit_note = null,
           updated_at = now(),
           updated_by = v_principal
     where id = v_employee
       and (exit_date is null or exit_date >= v_exit_date);

    insert into hr_employment_events
      (employee_id, event, effective_date, note, recorded_by)
    select v_employee, 'terminated', v_exit_date, null, v_principal
     where not exists (
       select 1 from hr_employment_events
        where employee_id = v_employee
          and event = 'terminated'
          and effective_date = v_exit_date
     );
  end if;

  -- Covers that never began are configuration and may be removed. A cover
  -- that already happened is retained and only closed before the exit date.
  delete from workspace_duty_covers
   where (normal_user_id = v_khor or acting_user_id = v_khor)
     and starts_on >= v_exit_date;
  update workspace_duty_covers
     set ends_on = v_exit_date - 1
   where (normal_user_id = v_khor or acting_user_id = v_khor)
     and starts_on < v_exit_date
     and ends_on >= v_exit_date;

  delete from ops_po_duty_cover
   where (normal_user_id = v_khor or acting_user_id = v_khor)
     and starts_on >= v_exit_date;
  update ops_po_duty_cover
     set ends_on = v_exit_date - 1
   where (normal_user_id = v_khor or acting_user_id = v_khor)
     and starts_on < v_exit_date
     and ends_on >= v_exit_date;

  -- End an assignment that has already supplied historical truth; remove a
  -- future assignment that never became effective. No past holder is changed.
  delete from workspace_duty_assignments
   where holder_id = v_khor and effective_from >= v_exit_date;
  update workspace_duty_assignments
     set effective_until = v_exit_date - 1
   where holder_id = v_khor
     and effective_from < v_exit_date
     and (effective_until is null or effective_until >= v_exit_date);

  -- The current month is explicit. Newer rows win in the shared resolver,
  -- preserving the old assignment row as evidence.
  insert into workspace_duty_assignments
    (duty_key, holder_id, effective_from, effective_until, assigned_by, note)
  values
    ('po_duty', v_yu_jun, v_exit_date, date '2026-09-30', v_principal,
     'Two-person Operation duty after staff offboarding'),
    ('grn_duty', v_shasha, v_exit_date, date '2026-09-30', v_principal,
     'Two-person Operation duty after staff offboarding');

  insert into workspace_duty_assignments
    (duty_key, holder_id, effective_from, effective_until, assigned_by, note)
  select duty_key,
         case
           when duty_key = 'po_duty' and month_number % 2 = 0 then v_shasha
           when duty_key = 'po_duty' then v_yu_jun
           when month_number % 2 = 0 then v_yu_jun
           else v_shasha
         end,
         month_start,
         (month_start + interval '1 month - 1 day')::date,
         v_principal,
         'Two-person Operation duty rotation'
    from (
      select month_start::date,
             row_number() over (order by month_start) + 1 as month_number
        from generate_series(date '2026-10-01', date '2027-09-01', interval '1 month') month_start
    ) months
    cross join (values ('po_duty'), ('grn_duty')) duties(duty_key);

  -- The one-release legacy readers still ask ops_po_duty. Keep their monthly
  -- answer aligned while they are retired; GRN remains the next month's PO
  -- holder, so the two staff never order and receive in the same month.
  insert into ops_po_duty (month, user_id, assigned_by)
  select to_char(month_start, 'YYYY-MM'),
         case when row_number() over (order by month_start) % 2 = 1
              then v_yu_jun else v_shasha end,
         v_principal
    from generate_series(date '2026-09-01', date '2027-09-01', interval '1 month') month_start
  on conflict (month) do update
    set user_id = excluded.user_id,
        assigned_by = excluded.assigned_by,
        updated_at = now();

  insert into audit_log (role, actor_text, action, ref)
  values ('principal',
          coalesce((select name from app_users where id = v_principal), 'Principal'),
          'Operation staff offboarded; active duties moved to the two-person roster',
          v_khor::text);
end
$offboard$;

-- Fail the migration if current truth can still route work or access to the
-- departed account. Historical rows before 2026-09-07 are intentionally valid.
do $sanity$
declare
  v_khor uuid := (select id from app_users where lower(email) = 'khoryee@carres.com');
begin
  if exists (select 1 from app_users where id = v_khor and status <> 'disabled') then
    raise exception '0437 sanity: departed account remains active';
  end if;
  if exists (select 1 from ops_staff_settings where user_id = v_khor) then
    raise exception '0437 sanity: departed account remains in staff pool';
  end if;
  if exists (
    select 1 from workspace_duty_assignments
     where holder_id = v_khor
       and effective_from <= date '2026-09-07'
       and (effective_until is null or effective_until >= date '2026-09-07')
  ) then
    raise exception '0437 sanity: departed account still holds a Workspace duty';
  end if;
  if exists (
    select 1 from workspace_duty_covers
     where (normal_user_id = v_khor or acting_user_id = v_khor)
       and date '2026-09-07' between starts_on and ends_on
  ) then
    raise exception '0437 sanity: departed account still has active cover';
  end if;
end
$sanity$;

commit;
