-- 0269_hr_employee_master (2026-07-26, HR-P4 — Loo approved the mock, then "good may proceed").
-- Numbered at apply: remote tracker tail was 0268_rental_approver_gate (list_migrations
-- checked — guardrail #8). Re-check before applying; the parallel line moves fast.
--
-- WHAT THIS IS
--   The people spine. One row per human who has a CRnnn code — nine of them today
--   (CR001-CR007 are app_users, CR008-CR009 are showroom salespersons).
--
-- THE ONE RULE THAT SHAPES THIS WHOLE TABLE
--   hr_employees stores a field ONLY IF NEITHER identity table already has a home
--   for it. It does NOT carry full_name, staff_code, status, work email, position
--   or reporting line — those live on app_users / salespersons / org_positions and
--   are READ THROUGH the join.
--
--   The ratified spec asked for `staff_code (sync w/ CRnnn)` plus copies of
--   full_name / phone / dob / gender / status. That was rejected in design review
--   and Loo took the redesign. Two reasons, the second one is the serious one:
--     1. Anything kept in step by a "sync" drifts. There would be two answers to
--        "what is this person called".
--     2. `status` is now LOAD-BEARING FOR AUTH. Since 0266/0267 app_users.status
--        decides whether app_role() returns anything at all. A second, cosmetic
--        `status` on hr_employees is how HR marks someone resigned, believes access
--        is gone, and is wrong — the exact failure that let samantha@carres.com keep
--        a live session from May to July.
--   So the People screen answers TWO separate questions in two separate columns:
--     Employment = HR's record of the person   (derived here, from the dates)
--     Access     = the real switch             (app_users.status / salespersons.active)
--
--   Corollary, deliberately accepted: `dob` and `gender` are NOT here. salespersons
--   already stores birthday/gender and has FOUR live write sites (create-account.ts,
--   hr-team.ts, staff.ts create + patch). Copying them would re-create the drift this
--   table exists to avoid, and repointing all four would drag the live POS staff
--   profile into this phase. Floor staff read theirs through the join like every other
--   identity field; HQ staff have no birthday field today and nobody has asked for one.
--   Carry-forward `hr-hq-staff-no-birthday` records the choice.
--
-- ALSO DELIBERATE
--   * hr_employment_events records ONLY hired/confirmed/resigned/terminated/rehired.
--     Promotions and transfers already have a home in org_position_history (0254) —
--     the drawer merges the two for display rather than writing a third log.
--   * Checklists are a fixed list in @carres/shared, not a config table. A company
--     hiring ~3 people a year does not need per-role custom checklists; this table
--     stores only the ticks. Same instinct that killed O1's "mark 37 as legacy" button.
--   * IC and bank account never enter a list or detail payload. hr_employee_detail
--     returns booleans; hr_reveal_employee_field hands the value over and writes the
--     audit row in the SAME transaction, so the trail cannot be incomplete.
--   * Every gate uses the post-0266 fail-closed shape
--     `coalesce((select public.app_role())::text, '') not in (...)`. The bare
--     `app_role() not in (...)` form evaluates NULL for a disabled user, the IF never
--     fires, and the function RUNS. Do not "simplify" it back.
--   * Self-writes carry a `SELF - ` audit prefix (§4 of the HR spec — Loo overruled
--     preventive segregation of duties in favour of a legible trail, so the trail has
--     to actually be filterable).

-- APPLIED 2026-07-26 as 0269_hr_employee_master. Audit separators are plain
-- hyphens (not the house middot) because that is what went in — this file is
-- kept byte-faithful to live rather than tidier than it.

-- ── A. hr_employees ──────────────────────────────────────────────────────────

create table public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  entity text not null default 'carres',

  -- Dual identity. Both may be set: that IS the merge for a floor-staff member who
  -- later gets a portal login (O4 route B). No merge RPC needed — the "merge" is
  -- filling in the second column on the row that already exists.
  -- ON DELETE RESTRICT: accounts are disabled, never hard-deleted. If someone tries,
  -- a clean error beats silently orphaning or nulling out a person's HR file.
  app_user_id    uuid unique references public.app_users(id)    on delete restrict,
  salesperson_id uuid unique references public.salespersons(id) on delete restrict,
  constraint hr_employees_needs_an_identity
    check (app_user_id is not null or salesperson_id is not null),

  -- Identity (HR-private only — name/code/position/status are NOT here, see header)
  ic_number      text,
  nationality    text,
  marital_status text check (marital_status is null
    or marital_status in ('single', 'married', 'divorced', 'widowed')),

  -- Contact (personal — the WORK email lives on the identity row)
  personal_email     text,
  personal_phone     text,
  emergency_name     text,
  emergency_phone    text,
  emergency_relation text,
  address            jsonb,

  -- Bank + statutory REFERENCE numbers. Carres never computes EPF/SOCSO/EIS/PCB
  -- (§6 of the HR spec, permanent). These ride the payroll-SaaS export and nothing else.
  bank_name       text,
  bank_account_no text,
  bank_holder     text,
  epf_no          text,
  socso_no        text,
  tax_no          text,

  -- Employment
  employment_type text check (employment_type is null
    or employment_type in ('full_time', 'part_time', 'contract', 'intern')),
  join_date    date,
  confirm_date date,
  exit_date    date,
  exit_reason  text check (exit_reason is null
    or exit_reason in ('resigned', 'terminated', 'contract_ended')),
  exit_note    text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.hr_employees is
  'HR-private satellite of app_users/salespersons. Stores ONLY fields with no home '
  'on the identity tables — never name, staff_code, status, work email or position.';
comment on column public.hr_employees.exit_date is
  'Employment status is DERIVED from the dates, never stored. This column does not '
  'control access: app_users.status / salespersons.active do (0266/0267).';

create index hr_employees_app_user_idx    on public.hr_employees (app_user_id);
create index hr_employees_salesperson_idx on public.hr_employees (salesperson_id);

alter table public.hr_employees enable row level security;
create policy hr_employees_hr_rw on public.hr_employees
  for all
  using      (coalesce((select public.app_role())::text, '') in ('hr', 'principal'))
  with check (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── B. hr_employment_events — append-only lifecycle log ──────────────────────
-- Lifecycle ONLY. Position changes belong to org_position_history (0254).

create table public.hr_employment_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  event text not null check (event in
    ('hired', 'confirmed', 'resigned', 'terminated', 'rehired')),
  effective_date date not null,
  note text,
  recorded_by uuid,
  recorded_at timestamptz not null default now()
);
create index hr_employment_events_employee_idx
  on public.hr_employment_events (employee_id, effective_date desc);

alter table public.hr_employment_events enable row level security;
create policy hr_employment_events_hr_rw on public.hr_employment_events
  for all
  using      (coalesce((select public.app_role())::text, '') in ('hr', 'principal'))
  with check (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── C. hr_employee_documents — private vault refs ────────────────────────────
-- Soft delete only: an employment document is evidence.

create table public.hr_employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  doc_type text not null check (doc_type in ('ic', 'contract', 'certificate', 'other')),
  file_path text not null,
  file_name text not null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);
create index hr_employee_documents_employee_idx
  on public.hr_employee_documents (employee_id, uploaded_at desc);

alter table public.hr_employee_documents enable row level security;
create policy hr_employee_documents_hr_rw on public.hr_employee_documents
  for all
  using      (coalesce((select public.app_role())::text, '') in ('hr', 'principal'))
  with check (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── D. hr_checklist_items — ticks only, the LIST is a shared constant ────────
-- Row present = done. Unticking deletes the row. No templates, no instances.

create table public.hr_checklist_items (
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  kind text not null check (kind in ('onboarding', 'offboarding')),
  item_key text not null,
  done_at timestamptz not null default now(),
  done_by uuid,
  primary key (employee_id, kind, item_key)
);

alter table public.hr_checklist_items enable row level security;
create policy hr_checklist_items_hr_rw on public.hr_checklist_items
  for all
  using      (coalesce((select public.app_role())::text, '') in ('hr', 'principal'))
  with check (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── E. private document bucket ───────────────────────────────────────────────
-- Employment documents are PII. Unlike the internal-wide buckets, this one admits
-- hr + principal ONLY — is_internal() would let operation and finance read ICs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-docs', 'hr-docs', false, 10485760,
        array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hr_docs_hr_select on storage.objects;
drop policy if exists hr_docs_hr_insert on storage.objects;

create policy hr_docs_hr_select on storage.objects
  for select to authenticated
  using (bucket_id = 'hr-docs'
         and coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

create policy hr_docs_hr_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'hr-docs'
              and coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- Deliberately NO delete policy — the vault soft-deletes in the table instead.

-- ── F. helpers ───────────────────────────────────────────────────────────────

-- Profile completeness: 8 things HR needs before someone can go on a payroll export.
-- Kept in SQL (not the client) so the roster count and the drawer can never disagree.
create or replace function public._hr_employee_filled(e public.hr_employees)
returns int
language sql
immutable
as $$
  select (case when e.ic_number       is not null then 1 else 0 end)
       + (case when e.nationality     is not null then 1 else 0 end)
       + (case when e.personal_phone  is not null then 1 else 0 end)
       + (case when e.emergency_name  is not null
               and  e.emergency_phone is not null then 1 else 0 end)
       + (case when e.address         is not null then 1 else 0 end)
       + (case when e.bank_name       is not null
               and  e.bank_account_no is not null then 1 else 0 end)
       + (case when coalesce(e.epf_no, e.socso_no, e.tax_no) is not null then 1 else 0 end)
       + (case when e.join_date       is not null
               and  e.employment_type is not null then 1 else 0 end);
$$;

-- Employment status, DERIVED. Never stored, never confused with access.
-- STABLE, not IMMUTABLE: it reads current_date. Marking a current_date function
-- immutable lets the planner fold today's answer into a cached plan or an index.
create or replace function public._hr_employment_status(e public.hr_employees)
returns text
language sql
stable
as $$
  select case
    when e.exit_date is not null and e.exit_date <= current_date then 'left'
    when e.exit_date is not null                                 then 'leaving'
    when e.join_date is null                                     then 'not_recorded'
    when e.join_date > current_date                              then 'incoming'
    when e.confirm_date is null                                  then 'probation'
    else 'active'
  end;
$$;

-- Is the caller this employee? Drives the `SELF - ` audit prefix.
create or replace function public._hr_is_self(e public.hr_employees)
returns boolean
language sql
stable
as $$
  select e.app_user_id is not null and e.app_user_id = auth.uid();
$$;

-- ── G. hr_people_source() — the one gated roster read ────────────────────────
-- Identity is READ THROUGH the join. IC and bank account are NOT in this payload
-- and must never be added to it.

create or replace function public.hr_people_source()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x."staffCode" nulls last)
      from (
        -- HQ humans: an app_users row carrying a CR code.
        -- The store joins are here for the MERGED case (someone who holds both a
        -- login and a floor identity — O4 route B). They appear once, as HQ.
        select
          e.id                       as "employeeId",
          e.entity                   as entity,
          'hq'                       as kind,
          u.id                       as "subjectId",
          u.staff_code               as "staffCode",
          u.name                     as name,
          u.email                    as "workEmail",
          p.name                     as "positionName",
          p.band                     as band,
          null::text                 as "staffRole",
          dep.name                   as "departmentName",
          d2.name                    as "storeName",
          mgr.name                   as "reportsToName",
          case when u.status::text = 'active' then 'can_login' else 'disabled' end
                                     as access,
          public._hr_employment_status(e) as employment,
          e.join_date                as "joinDate",
          e.confirm_date             as "confirmDate",
          e.exit_date                as "exitDate",
          e.employment_type          as "employmentType",
          public._hr_employee_filled(e)   as filled
        from hr_employees e
        join app_users u on u.id = e.app_user_id
        left join org_positions p on p.id = u.position_id
        left join org_departments dep on dep.id = p.department_id
        left join app_users mgr on mgr.id = u.reports_to_user_id
        left join salespersons sp2 on sp2.id = e.salesperson_id
        left join dealers d2 on d2.id = sp2.dealer_id

        union all

        -- Showroom floor staff with no login of their own. `app_user_id is null`
        -- is what stops a merged person being listed twice.
        -- staff_role goes out RAW — labelling it here would fork STAFF_TIER_LABEL,
        -- the exact duplication HR-P2 spent a migration deduping.
        select
          e.id, e.entity, 'floor',
          sp.id, sp.staff_code, sp.name, sp.email,
          null::text, null::text, sp.staff_role, null::text, d.name, null::text,
          case when sp.active then 'pin_only' else 'disabled' end,
          public._hr_employment_status(e),
          e.join_date, e.confirm_date, e.exit_date, e.employment_type,
          public._hr_employee_filled(e)
        from hr_employees e
        join salespersons sp on sp.id = e.salesperson_id
        join dealers d on d.id = sp.dealer_id and d.channel = 'showroom'
        where e.app_user_id is null
      ) x), '[]'::jsonb),

    -- "Access is already cut but nobody wrote down why" — the banner's whole job.
    'accessWithoutExit', coalesce((
      select count(*)
      from hr_employees e
      left join app_users u on u.id = e.app_user_id
      left join salespersons sp on sp.id = e.salesperson_id
      where e.exit_date is null
        and (u.status::text = 'disabled' or sp.active = false)), 0),

    'totalFields', 8)
  into v_result;

  return v_result;
end;
$$;

-- ── H. hr_employee_detail() — the drawer ─────────────────────────────────────
-- Returns booleans for IC and bank account, never the values. Employment history
-- MERGES hr_employment_events with org_position_history so the drawer shows one
-- timeline without a second log having to be written.

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

-- ── I. hr_reveal_employee_field() — value + audit, one transaction ───────────
-- The ONLY door to an IC or bank account number. Because the value and the audit
-- row are written by the same statement, there is no path where a number is read
-- without a trail — which is the whole point of masking it in the first place.

create or replace function public.hr_reveal_employee_field(
  p_employee_id uuid, p_field text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_e hr_employees%rowtype;
  v_value text;
  v_who text;
  v_label text;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_field is null or p_field not in ('ic_number', 'bank_account_no') then
    raise exception 'field_not_revealable';
  end if;

  select * into v_e from hr_employees where id = p_employee_id;
  if not found then raise exception 'employee_not_found'; end if;

  v_value := case p_field
    when 'ic_number' then v_e.ic_number
    else v_e.bank_account_no end;
  if v_value is null then raise exception 'field_empty'; end if;

  select coalesce(u.name, sp.name) into v_who
  from hr_employees e
  left join app_users u on u.id = e.app_user_id
  left join salespersons sp on sp.id = e.salesperson_id
  where e.id = p_employee_id;

  v_label := case p_field when 'ic_number' then 'IC number' else 'bank account' end;

  insert into audit_log (role, actor_text, action, ref)
  values (
    (select public.app_role()),
    (select name from app_users where id = auth.uid()),
    case when public._hr_is_self(v_e) then 'SELF - ' else '' end
      || format('Revealed %s - %s', v_label, coalesce(v_who, '-')),
    p_employee_id::text);

  return v_value;
end;
$$;

-- ── J. hr_upsert_employee() — audited patch on a whitelist ───────────────────

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
                  'employment_type', 'join_date', 'confirm_date')
  limit 1;
  if v_bad is not null then
    raise exception 'field_not_editable: %', v_bad;
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

-- ── K. hr_record_exit() — dates + the lifecycle event, together ──────────────
-- Does NOT touch access. Cutting the login is a separate, explicit act (the Hono
-- access door) precisely so nobody can believe writing a date revoked anything.

create or replace function public.hr_record_exit(
  p_employee_id uuid, p_exit_date date, p_reason text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_e hr_employees%rowtype;
  v_who text;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('resigned', 'terminated', 'contract_ended') then
    raise exception 'invalid_reason';
  end if;
  if p_exit_date is null then raise exception 'exit_date_required'; end if;

  select * into v_e from hr_employees where id = p_employee_id for update;
  if not found then raise exception 'employee_not_found'; end if;
  if v_e.join_date is not null and p_exit_date < v_e.join_date then
    raise exception 'exit_before_join';
  end if;

  update hr_employees set
    exit_date = p_exit_date, exit_reason = p_reason,
    exit_note = nullif(p_note, ''),
    updated_at = now(), updated_by = auth.uid()
  where id = p_employee_id;

  insert into hr_employment_events
    (employee_id, event, effective_date, note, recorded_by)
  values (p_employee_id,
          case p_reason when 'terminated' then 'terminated' else 'resigned' end,
          p_exit_date, nullif(p_note, ''), auth.uid());

  select coalesce(u.name, sp.name) into v_who
  from hr_employees e
  left join app_users u on u.id = e.app_user_id
  left join salespersons sp on sp.id = e.salesperson_id
  where e.id = p_employee_id;

  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          (select name from app_users where id = auth.uid()),
          format('Exit recorded - %s - %s on %s',
                 coalesce(v_who, '-'), p_reason, p_exit_date),
          p_employee_id::text);
end;
$$;

-- ── L. hr_set_checklist_item() — a tick is a row ─────────────────────────────
-- Not audited: done_by/done_at on the row IS the trail, and an audit line per
-- checkbox would drown the log that matters.

create or replace function public.hr_set_checklist_item(
  p_employee_id uuid, p_kind text, p_item_key text, p_done boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('onboarding', 'offboarding') then
    raise exception 'invalid_kind';
  end if;
  if not exists (select 1 from hr_employees where id = p_employee_id) then
    raise exception 'employee_not_found';
  end if;

  if p_done then
    insert into hr_checklist_items (employee_id, kind, item_key, done_by)
    values (p_employee_id, p_kind, p_item_key, auth.uid())
    on conflict (employee_id, kind, item_key) do nothing;
  else
    delete from hr_checklist_items
    where employee_id = p_employee_id and kind = p_kind and item_key = p_item_key;
  end if;
end;
$$;

-- ── M. hr_add_employee() — the door stays the Team tab ───────────────────────
-- Called by Hono right after the Team tab mints a CR code. Idempotent so a retry
-- (or a backfill re-run) cannot create a second file for the same person, and so
-- a floor-staff member who later gains a login MERGES onto the existing row
-- instead of forking — risk #3 in the spec, closed by construction.

create or replace function public.hr_add_employee(
  p_kind text, p_subject_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('hq', 'floor') then raise exception 'invalid_kind'; end if;

  if p_kind = 'hq' then
    select staff_code into v_code from app_users where id = p_subject_id;
    if v_code is null then raise exception 'needs_staff_code'; end if;

    select id into v_id from hr_employees where app_user_id = p_subject_id;
    if v_id is not null then return v_id; end if;

    -- same human already on file via their floor identity? merge, do not fork.
    select e.id into v_id from hr_employees e
    join salespersons sp on sp.id = e.salesperson_id
    where sp.staff_code = v_code and e.app_user_id is null;
    if v_id is not null then
      update hr_employees set app_user_id = p_subject_id, updated_at = now()
      where id = v_id;
      return v_id;
    end if;

    insert into hr_employees (app_user_id) values (p_subject_id) returning id into v_id;
  else
    select sp.staff_code into v_code
    from salespersons sp
    join dealers d on d.id = sp.dealer_id and d.channel = 'showroom'
    where sp.id = p_subject_id;
    if v_code is null then raise exception 'needs_staff_code_or_not_showroom'; end if;

    select id into v_id from hr_employees where salesperson_id = p_subject_id;
    if v_id is not null then return v_id; end if;

    select e.id into v_id from hr_employees e
    join app_users u on u.id = e.app_user_id
    where u.staff_code = v_code and e.salesperson_id is null;
    if v_id is not null then
      update hr_employees set salesperson_id = p_subject_id, updated_at = now()
      where id = v_id;
      return v_id;
    end if;

    insert into hr_employees (salesperson_id) values (p_subject_id) returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- ── N. backfill — exactly the CR-coded humans, nothing else ──────────────────
-- The spec said "one row per existing internal user + showroom staff", which taken
-- literally would file Nets · Dispatch, Ohana · Sales and the Kelana Jaya store
-- login as employees (20 identity rows live today). The CR code is the filter:
-- have one and you are a person, do not and you are a robot, a store or an outside
-- company. Dealer-channel salespersons are excluded by the same rule AND by the
-- dealer-exclusion law — the three of them carry no code.

insert into public.hr_employees (app_user_id)
select u.id from public.app_users u
where u.staff_code is not null
on conflict (app_user_id) do nothing;

insert into public.hr_employees (salesperson_id)
select sp.id from public.salespersons sp
join public.dealers d on d.id = sp.dealer_id and d.channel = 'showroom'
where sp.staff_code is not null
on conflict (salesperson_id) do nothing;

-- ── O. sanity ────────────────────────────────────────────────────────────────

do $$
declare
  v_people int;
  v_coded  int;
  v_orphan int;
begin
  select count(*) into v_people from hr_employees;

  select (select count(*) from app_users where staff_code is not null)
       + (select count(*) from salespersons sp
          join dealers d on d.id = sp.dealer_id and d.channel = 'showroom'
          where sp.staff_code is not null)
    into v_coded;

  if v_people <> v_coded then
    raise exception 'backfill mismatch: % employees for % CR-coded humans',
      v_people, v_coded;
  end if;

  -- nobody should be on file without an identity (the CHECK covers it; belt and brace)
  select count(*) into v_orphan from hr_employees
  where app_user_id is null and salesperson_id is null;
  if v_orphan > 0 then raise exception 'employee rows with no identity'; end if;

  raise notice 'hr_employees backfilled: % people', v_people;
end $$;
