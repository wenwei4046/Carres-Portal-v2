-- =============================================================================
-- 0677_office_doors_count_the_office_calendar_people_keep_a_working_week_and_courier_dispatch_has_a_lead.sql
-- =============================================================================
-- WHAT THE OWNER ORDERED (Jess, 9 Oct 2026):
--   "The database working-day calculations and the Delivery date calculations
--    must connect to their own effective calendar." · the payment ACTION day
--   follows the responsible person's own working days (Office weekdays when
--   none are recorded) · DEL-10 courier dispatch is decided: 3 working days,
--   adjustable.
--
-- WHAT WAS WRONG
--   1 · Two SQL doors counted the Office week by themselves: 0584
--       `work_record_request_sent` refused `isodow in (6,7)` and 0602's
--       Repair Order receipt refused `isodow >= 6` and counted Mon–Fri with
--       `_office_weekdays_between`. Neither read the stored Office calendar
--       (0669 `office_calendar.work_days` + `office_holidays`), so an Office
--       that works Saturday was refused and a recorded Office holiday was a
--       working day.
--   2 · Nothing stored a person's normal working week, so the payment action
--       day could only follow the Office weekdays.
--   3 · The courier dispatch target (DEL-10) had no storage.
--
-- WHAT THIS CHANGES
--   §1 · ONE SQL helper `_office_is_working_day(date)`: a day is an Office
--        working day when its weekday is in `office_calendar.work_days` (owner
--        default Monday–Friday when the row is unreadable) and it is not a
--        recorded `office_holidays` date. SQL cannot see the built-in holiday
--        list (`packages/shared/src/my-holidays.ts`) the app keeps in force
--        for a year nobody recorded: the APP computes every default date with
--        the full calendar; these doors only refuse what the stored calendar
--        says is not a working day.
--        `_office_weekdays_between` (0602) now counts those days, and the two
--        doors refuse a non-working Office day through the helper:
--          · `work_record_request_sent` (latest: 0584) — reply due date
--          · `repair_order_record_supplier_receipt` (latest: 0602) — target
--   §2 · People keep a working week: `hr_employees.work_days smallint[]`
--        (NULL = not recorded; else a non-empty subset of 0..6, 0 = Sunday).
--        Only HR / principal write it, through the existing HR door
--        `hr_upsert_employee` (latest: 0269; anon closed by 0482) and see it
--        through `hr_employee_detail` (latest: 0269). Workspace and Payment
--        never edit it. `workspace_person_work_days(uuid[])` hands internal
--        readers ONLY the user id and the working days — nothing else of the
--        HR file — so Work and the Payment Monitor can step an action day back
--        on the responsible person's own week.
--   §3 · Delivery Rules keeps `courier_dispatch_working_days` (default 3,
--        range 1–30) with the 0673 door pattern:
--        `delivery_set_courier_dispatch_lead(days, revision, reason)` behind
--        `_settings_require_editor('delivery')`, history in
--        `delivery_setting_changes` (who · when · old → new · effective date ·
--        reason).
--
-- GRANTS: `workspace_person_work_days` and the courier door are EXECUTE to
--   authenticated only (revoked from public and anon). The HR functions keep
--   the grants they already have (create or replace keeps them). No RLS
--   policy changes: `hr_employees` stays HR-only; the narrow read is a
--   definer function gated on `is_internal()`.
--
-- Schema only. Nothing is counted, deleted or rewritten.
-- =============================================================================

set search_path = public, pg_temp;

-- ═════════════════════════════════════════════════════════════════════════════
-- §1 · the Office calendar in SQL
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public._office_is_working_day(p_day date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p_day is not null
     and extract(dow from p_day)::smallint = any (
           coalesce((select c.work_days from public.office_calendar c where c.id = 1),
                    '{1,2,3,4,5}'::smallint[]))
     and not exists (select 1 from public.office_holidays h where h.holiday_date = p_day);
$fn$;

revoke all on function public._office_is_working_day(date) from public, anon;
grant execute on function public._office_is_working_day(date) to authenticated;

comment on function public._office_is_working_day(date) is
  '0677: an Office working day per the STORED Office calendar (0669 office_calendar.work_days, default Monday–Friday; recorded office_holidays). The built-in holiday list for unrecorded years lives in the app only.';

/** Office working days in (p_from, p_to] on the stored Office calendar. */
create or replace function public._office_weekdays_between(p_from date, p_to date)
returns int
language sql
stable
set search_path = public, pg_temp
as $fn$
  select count(*)::int
    from generate_series((p_from + 1)::timestamp, p_to::timestamp, interval '1 day') d
   where public._office_is_working_day(d::date);
$fn$;

comment on function public._office_weekdays_between(date, date) is
  '0677: Office working days in (p_from, p_to] on the stored Office calendar (weekdays + recorded holidays) — was Mon–Fri only (0602).';

-- ── work_record_request_sent (latest definition: 0584) ───────────────────────
create or replace function public.work_record_request_sent(
  p_occurrence_id   text,
  p_channel         text,
  p_contact_kind    text,
  p_contact_id      uuid,
  p_reply_due_on    date,
  p_source_version  text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id    uuid;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if auth.uid() is null or not coalesce((select public.is_internal()), false) then
    raise exception 'forbidden: only internal staff record a Work send'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_id := public._work_event_replay(p_idempotency_key, p_occurrence_id, 'request_sent');
  if v_id is not null then
    return v_id;
  end if;
  perform public._work_refuse_if_completed(p_occurrence_id);
  -- 0677: an Office working day of the STORED Office calendar, not Mon–Fri.
  if p_reply_due_on is null or p_reply_due_on < v_today
     or not public._office_is_working_day(p_reply_due_on) then
    raise exception 'the reply due date must be a working day from today'
      using errcode = '22023', detail = 'reply_due_not_a_working_day';
  end if;

  insert into work_occurrence_events (
    occurrence_id, event, actor_id, channel, contact_kind, contact_id,
    reply_due_on, source_version, idempotency_key
  ) values (
    p_occurrence_id, 'request_sent', auth.uid(), p_channel, p_contact_kind, p_contact_id,
    p_reply_due_on, p_source_version, p_idempotency_key
  ) returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function public.work_record_request_sent(text, text, text, uuid, date, text, text) from public, anon;
grant execute on function public.work_record_request_sent(text, text, text, uuid, date, text, text) to authenticated;

-- ── repair_order_record_supplier_receipt (latest definition: 0602) ───────────
create or replace function public.repair_order_record_supplier_receipt(
  p_ro_id       uuid,
  p_received_at timestamptz,
  p_source      text,
  p_evidence    text,
  p_target      date,
  p_calendar    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    app_role := public._repair_order_gate();
  v_ro      repair_orders;
  v_period  int;
  v_from    date;
  v_days    int;
begin
  select * into v_ro from repair_orders where id = p_ro_id for update;
  if not found then
    raise exception 'Repair Order not found' using errcode = 'P0002', detail = 'ro_not_found';
  end if;
  if v_ro.cancelled_at is not null then
    raise exception '% is cancelled', v_ro.ro_no using errcode = '22023', detail = 'ro_cancelled';
  end if;
  if v_ro.supplier_received_at is not null then
    raise exception 'Supplier receipt is already recorded' using errcode = '40001', detail = 'receipt_already_recorded';
  end if;
  -- §9.7: receipt of the SPECIFIC RO version — it must have been sent.
  if not exists (select 1 from document_sends where document_kind = 'repair_order'
                  and document_id = v_ro.id and version = v_ro.version and confirmed) then
    raise exception 'Issue repair order first' using errcode = '22023', detail = 'not_issued';
  end if;
  if p_received_at is null or p_received_at > now() + interval '5 minutes' then
    raise exception 'the received time cannot be in the future' using errcode = '22023', detail = 'received_in_future';
  end if;
  if p_received_at < v_ro.created_at then
    raise exception 'the received time is before the Repair Order existed' using errcode = '22023', detail = 'received_before_ro';
  end if;
  if coalesce(p_source, '') !~ '[^[:space:]]' or coalesce(p_evidence, '') !~ '[^[:space:]]' then
    raise exception 'Record how the Supplier confirmed and the reply reference'
      using errcode = '22023', detail = 'receipt_evidence_required';
  end if;
  if coalesce(p_calendar, '') !~ '[^[:space:]]' then
    raise exception 'the calendar is required' using errcode = '22023', detail = 'calendar_required';
  end if;

  select repair_return_working_days into v_period from purchasing_settings order by id limit 1;
  v_period := coalesce(v_period, 14);
  v_from := (timezone('Asia/Kuala_Lumpur', p_received_at))::date;
  -- 0677: the target is an Office working day of the STORED Office calendar.
  if p_target is null or not public._office_is_working_day(p_target) then
    raise exception 'the return target must be an Office working day' using errcode = '22023', detail = 'target_not_working_day';
  end if;
  v_days := public._office_weekdays_between(v_from, p_target);
  if v_days < v_period or v_days > v_period + 15 then
    raise exception 'the return target is not % Office working days after receipt', v_period
      using errcode = '22023', detail = 'target_not_governed_period';
  end if;

  update repair_orders set
    supplier_received_at = p_received_at,
    supplier_received_version = v_ro.version,
    supplier_received_source = btrim(p_source),
    supplier_received_evidence = btrim(p_evidence),
    supplier_received_by = auth.uid(),
    supplier_received_recorded_at = now(),
    return_target_date = p_target,
    return_target_working_days = v_period,
    return_target_calendar = btrim(p_calendar)
  where id = v_ro.id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'repair_order_record_supplier_receipt',
          format('%s received %s · target %s (%s working days)', v_ro.ro_no, p_received_at, p_target, v_period));

  return jsonb_build_object('id', v_ro.id, 'return_target_date', p_target, 'working_days', v_period);
end;
$fn$;

revoke all on function public.repair_order_record_supplier_receipt(uuid, timestamptz, text, text, date, text) from public, anon;
grant execute on function public.repair_order_record_supplier_receipt(uuid, timestamptz, text, text, date, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- §2 · a person's working week (People / HR owns it)
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.hr_employees
  add column if not exists work_days smallint[];

alter table public.hr_employees
  drop constraint if exists hr_employees_work_days_valid;
alter table public.hr_employees
  add constraint hr_employees_work_days_valid
  check (work_days is null
         or (cardinality(work_days) between 1 and 7
             and work_days <@ '{0,1,2,3,4,5,6}'::smallint[]));

comment on column public.hr_employees.work_days is
  '0677: the person''s normal working weekdays (0 = Sunday … 6 = Saturday). NULL = not recorded — the Office working weekdays apply. People/HR owns it (Workspace MASTER: the Shared Duty Resolver combines the person calendar with the module calendar); only hr_upsert_employee writes it.';

-- ── hr_upsert_employee (latest definition: 0269) — `work_days` joins the whitelist
create or replace function public.hr_upsert_employee(
  p_employee_id uuid, p_patch jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_e hr_employees%rowtype;
  v_who text;
  v_keys text[];
  v_bad text;
  v_days smallint[];
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_e from hr_employees where id = p_employee_id for update;
  if not found then raise exception 'employee_not_found'; end if;

  -- Hono validates with zod; this is the second line of defence. Without it a
  -- non-object patch makes jsonb_object_keys throw a raw 500 instead of a 4xx.
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch';
  end if;

  -- Whitelist. Exit fields are NOT here — they go through hr_record_exit so the
  -- lifecycle event is written with them and can never be skipped.
  select array_agg(k) into v_keys from jsonb_object_keys(p_patch) k;
  select k into v_bad from unnest(coalesce(v_keys, '{}'::text[])) k
  where k not in ('ic_number', 'nationality', 'marital_status',
                  'personal_email', 'personal_phone',
                  'emergency_name', 'emergency_phone', 'emergency_relation',
                  'address', 'bank_name', 'bank_account_no', 'bank_holder',
                  'epf_no', 'socso_no', 'tax_no',
                  'employment_type', 'join_date', 'confirm_date',
                  'work_days')
  limit 1;
  if v_bad is not null then
    raise exception 'field_not_editable: %', v_bad;
  end if;

  -- 0677 · the working week: null (not recorded) or a non-empty set of 0..6.
  if p_patch ? 'work_days' then
    if jsonb_typeof(p_patch -> 'work_days') = 'null' then
      v_days := null;
    elsif jsonb_typeof(p_patch -> 'work_days') <> 'array'
       or jsonb_array_length(p_patch -> 'work_days') = 0
       or exists (select 1 from jsonb_array_elements_text(p_patch -> 'work_days') d
                   where d !~ '^[0-6]$') then
      raise exception 'invalid_patch';
    else
      select array_agg(distinct d::smallint order by d::smallint) into v_days
        from jsonb_array_elements_text(p_patch -> 'work_days') d;
    end if;
  end if;

  update hr_employees e set
    ic_number       = case when p_patch ? 'ic_number'       then nullif(p_patch->>'ic_number', '')       else e.ic_number end,
    nationality     = case when p_patch ? 'nationality'     then nullif(p_patch->>'nationality', '')     else e.nationality end,
    marital_status  = case when p_patch ? 'marital_status'  then nullif(p_patch->>'marital_status', '')  else e.marital_status end,
    personal_email  = case when p_patch ? 'personal_email'  then nullif(p_patch->>'personal_email', '')  else e.personal_email end,
    personal_phone  = case when p_patch ? 'personal_phone'  then nullif(p_patch->>'personal_phone', '')  else e.personal_phone end,
    emergency_name  = case when p_patch ? 'emergency_name'  then nullif(p_patch->>'emergency_name', '')  else e.emergency_name end,
    emergency_phone = case when p_patch ? 'emergency_phone' then nullif(p_patch->>'emergency_phone', '') else e.emergency_phone end,
    emergency_relation = case when p_patch ? 'emergency_relation' then nullif(p_patch->>'emergency_relation', '') else e.emergency_relation end,
    address         = case when p_patch ? 'address'         then (case when jsonb_typeof(p_patch->'address') = 'object' then p_patch->'address' else null end) else e.address end,
    bank_name       = case when p_patch ? 'bank_name'       then nullif(p_patch->>'bank_name', '')       else e.bank_name end,
    bank_account_no = case when p_patch ? 'bank_account_no' then nullif(p_patch->>'bank_account_no', '') else e.bank_account_no end,
    bank_holder     = case when p_patch ? 'bank_holder'     then nullif(p_patch->>'bank_holder', '')     else e.bank_holder end,
    epf_no          = case when p_patch ? 'epf_no'          then nullif(p_patch->>'epf_no', '')          else e.epf_no end,
    socso_no        = case when p_patch ? 'socso_no'        then nullif(p_patch->>'socso_no', '')        else e.socso_no end,
    tax_no          = case when p_patch ? 'tax_no'          then nullif(p_patch->>'tax_no', '')          else e.tax_no end,
    employment_type = case when p_patch ? 'employment_type' then nullif(p_patch->>'employment_type', '') else e.employment_type end,
    join_date       = case when p_patch ? 'join_date'       then nullif(p_patch->>'join_date', '')::date    else e.join_date end,
    confirm_date    = case when p_patch ? 'confirm_date'    then nullif(p_patch->>'confirm_date', '')::date else e.confirm_date end,
    work_days       = case when p_patch ? 'work_days'       then v_days else e.work_days end,
    updated_at = now(),
    updated_by = auth.uid()
  where e.id = p_employee_id;

  select coalesce(u.name, sp.name) into v_who
  from hr_employees e
  left join app_users u on u.id = e.app_user_id
  left join salespersons sp on sp.id = e.salesperson_id
  where e.id = p_employee_id;

  -- Field NAMES only. Putting an IC or an account number into audit_log would
  -- undo the masking one line below the function that enforces it.
  insert into audit_log (role, actor_text, action, ref)
  values (
    (select public.app_role()),
    (select name from app_users where id = auth.uid()),
    case when public._hr_is_self(v_e) then 'SELF - ' else '' end
      || format('Employee profile - %s - %s',
                coalesce(v_who, '-'),
                array_to_string(coalesce(v_keys, '{}'::text[]), ', ')),
    p_employee_id::text);
end;
$$;

revoke all on function public.hr_upsert_employee(uuid, jsonb) from public, anon;

-- ── hr_employee_detail (latest definition: 0269) — the drawer shows `workDays`
create or replace function public.hr_employee_detail(p_employee_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_e hr_employees%rowtype;
  v_subject uuid;
  v_result jsonb;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_e from hr_employees where id = p_employee_id;
  if not found then raise exception 'employee_not_found'; end if;
  v_subject := coalesce(v_e.app_user_id, v_e.salesperson_id);

  select jsonb_build_object(
    'employeeId', v_e.id,
    'entity', v_e.entity,
    'appUserId', v_e.app_user_id,
    'salespersonId', v_e.salesperson_id,

    -- HR-private, safe to send
    'nationality', v_e.nationality,
    'maritalStatus', v_e.marital_status,
    'personalEmail', v_e.personal_email,
    'personalPhone', v_e.personal_phone,
    'emergencyName', v_e.emergency_name,
    'emergencyPhone', v_e.emergency_phone,
    'emergencyRelation', v_e.emergency_relation,
    'address', v_e.address,
    'bankName', v_e.bank_name,
    'bankHolder', v_e.bank_holder,
    'epfNo', v_e.epf_no,
    'socsoNo', v_e.socso_no,
    'taxNo', v_e.tax_no,
    'employmentType', v_e.employment_type,
    'joinDate', v_e.join_date,
    'confirmDate', v_e.confirm_date,
    'exitDate', v_e.exit_date,
    'exitReason', v_e.exit_reason,
    'exitNote', v_e.exit_note,
    'employment', public._hr_employment_status(v_e),
    'filled', public._hr_employee_filled(v_e),
    -- 0677 · the normal working week; null = not recorded.
    'workDays', to_jsonb(v_e.work_days),

    -- NEVER the values. Reveal is its own audited call.
    'hasIcNumber', v_e.ic_number is not null,
    'hasBankAccount', v_e.bank_account_no is not null,

    'events', coalesce((
      select jsonb_agg(t order by t."effectiveDate" desc, t.kind)
      from (
        select ev.event as kind, ev.effective_date as "effectiveDate", ev.note as note,
               (select name from app_users a where a.id = ev.recorded_by) as "byName"
        from hr_employment_events ev where ev.employee_id = p_employee_id
        union all
        -- position changes already have a home; show them, do not re-log them
        select 'position', h.changed_at::date,
               coalesce(h.prev_position, '-') || ' -> ' || coalesce(h.new_position, '-'),
               (select name from app_users a where a.id = h.changed_by)
        from org_position_history h where h.subject_id = v_subject
      ) t), '[]'::jsonb),

    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'docType', d.doc_type, 'fileName', d.file_name,
        'filePath', d.file_path, 'uploadedAt', d.uploaded_at,
        'byName', (select name from app_users a where a.id = d.uploaded_by))
        order by d.uploaded_at desc)
      from hr_employee_documents d
      where d.employee_id = p_employee_id and d.deleted_at is null), '[]'::jsonb),

    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', ci.kind, 'itemKey', ci.item_key, 'doneAt', ci.done_at,
        'byName', (select name from app_users a where a.id = ci.done_by)))
      from hr_checklist_items ci where ci.employee_id = p_employee_id), '[]'::jsonb))
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.hr_employee_detail(uuid) from public, anon;

-- ── the narrow read: working days ONLY, for internal readers ─────────────────
create or replace function public.workspace_person_work_days(p_user_ids uuid[])
returns table (user_id uuid, work_days smallint[])
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null or not coalesce((select public.is_internal()), false) then
    raise exception 'forbidden: only internal staff read working days'
      using errcode = '42501', detail = 'forbidden';
  end if;
  return query
    select e.app_user_id, e.work_days
      from public.hr_employees e
     where e.app_user_id = any (coalesce(p_user_ids, '{}'::uuid[]))
       and e.work_days is not null;
end;
$fn$;

revoke all on function public.workspace_person_work_days(uuid[]) from public, anon;
grant execute on function public.workspace_person_work_days(uuid[]) to authenticated;

comment on function public.workspace_person_work_days(uuid[]) is
  '0677: the recorded normal working weekdays of the named people (user id + work_days ONLY — nothing else of the HR file). Internal staff only. A person not returned has no recorded week: the Office working weekdays apply.';

-- ═════════════════════════════════════════════════════════════════════════════
-- §3 · Delivery Rules → Courier dispatch within (DEL-10)
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.delivery_rules
  add column if not exists courier_dispatch_working_days int not null default 3;

alter table public.delivery_rules
  drop constraint if exists delivery_rules_courier_dispatch_range;
alter table public.delivery_rules
  add constraint delivery_rules_courier_dispatch_range
  check (courier_dispatch_working_days between 1 and 30);

comment on column public.delivery_rules.courier_dispatch_working_days is
  '0677: DEL-10 `Courier dispatch within` {n} working days after the Warehouse confirms the goods can be packed (default 3, range 1–30), counted on the dispatching Warehouse''s calendar.';

create or replace function public.delivery_set_courier_dispatch_lead(
  p_working_days int,
  p_revision bigint,
  p_reason text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before public.delivery_rules;
  v_after  public.delivery_rules;
  v_today  date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_reason text := case when coalesce(p_reason, '') ~ '[^[:space:]]' then btrim(p_reason) else null end;
begin
  perform public._settings_require_editor('delivery');
  if p_working_days is null or p_revision is null then
    raise exception 'the number of working days is required'
      using errcode = '22023', detail = 'missing_days';
  end if;
  if p_working_days not between 1 and 30 then
    raise exception 'choose between 1 and 30 working days'
      using errcode = '22023', detail = 'days_out_of_range';
  end if;
  select * into strict v_before from public.delivery_rules where id = 1 for update;
  if v_before.revision <> p_revision then
    raise exception 'settings changed' using errcode = '40001', detail = 'settings_changed';
  end if;
  if v_before.courier_dispatch_working_days = p_working_days then
    return to_jsonb(v_before);
  end if;
  update public.delivery_rules set
    courier_dispatch_working_days = p_working_days,
    revision   = revision + 1,
    changed_at = clock_timestamp(),
    changed_by = auth.uid()
  where id = 1
  returning * into v_after;
  insert into public.delivery_setting_changes
    (what, partner_id, old_value, new_value, actor_id, reason, effective_from)
  values ('courier_dispatch_lead', null,
          jsonb_build_object('courier_dispatch_working_days', v_before.courier_dispatch_working_days),
          jsonb_build_object('courier_dispatch_working_days', v_after.courier_dispatch_working_days),
          auth.uid(), v_reason, v_today);
  return to_jsonb(v_after);
end;
$fn$;

revoke all on function public.delivery_set_courier_dispatch_lead(int, bigint, text) from public, anon;
grant execute on function public.delivery_set_courier_dispatch_lead(int, bigint, text) to authenticated;

comment on function public.delivery_set_courier_dispatch_lead(int, bigint, text) is
  '0677: Delivery Rules → Courier dispatch within {n} working days after the Warehouse confirms the goods can be packed (DEL-10). Settings editor gate; keeps who · when · old → new · effective date · reason.';
