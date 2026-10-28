-- =============================================================================
-- 0694_a_person_adds_an_internal_task_for_a_colleague.sql
-- =============================================================================
-- WHAT THE OWNER RULED (docs/workspace/MASTER.md "Employee-created internal
-- tasks", Jess 2026-10-14):
--   An employee may add an internal temporary task with `+ Task` and give it
--   to another employee. Creator, assignee, due date, the actual completion
--   actor and time, and the history are kept. It is internal work: it replaces
--   no system-generated action, completing it approves nothing and posts
--   nothing in another module, and being given a task grants no permission.
--
-- WHAT WAS MISSING
--   No record fitted. `ops_tasks` (0162) is the older order follow-up board:
--   most of its rows are raised by a scan, have no assignee, and it keeps no
--   completion actor and no history. It is left exactly as it is.
--
-- WHAT THIS ADDS
--   1 · public.internal_tasks: one row per task (title, optional detail,
--       created_by, assigned_to, due_on, done_at + done_by).
--   2 · public.internal_task_events: its history, one `added` and at most one
--       `done` row, each with the actor and the time.
--   3 · Four doors. Writes: internal_task_add, internal_task_mark_done.
--       Reads: internal_tasks_open, internal_task_read.
--
-- ROW LEVEL SECURITY (new tables only; no existing policy is touched)
--   Both tables: RLS on, no privilege for public or anon, SELECT only for
--   signed-in Operation and Principal accounts (public.is_operation()). No
--   client may write a row: every write goes through the two definer doors
--   above, which take the actor from auth.uid() and refuse anyone else.
--
-- WHAT IT DOES NOT TOUCH
--   No other module's table, function or policy. The Work ledger (0584) is
--   written by the API through its own existing completion door.
--
-- Schema only. Nothing is counted, removed or rewritten.
-- =============================================================================

set search_path = public, pg_temp;

-- ── 1 · THE TASK ─────────────────────────────────────────────────────────────
create table if not exists public.internal_tasks (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null check (char_length(btrim(title)) between 1 and 160),
  detail       text        check (detail is null or char_length(detail) between 1 and 2000),
  created_by   uuid        not null references public.app_users(id),
  assigned_to  uuid        not null references public.app_users(id),
  due_on       date        not null,
  created_at   timestamptz not null default clock_timestamp(),
  done_at      timestamptz,
  done_by      uuid        references public.app_users(id),
  -- One request makes one task: a retry after a lost answer returns the same row.
  request_key  text        not null unique check (char_length(request_key) >= 8),
  constraint internal_tasks_done_names_its_actor check ((done_at is null) = (done_by is null))
);

create index if not exists internal_tasks_open_by_due
  on public.internal_tasks (due_on) where done_at is null;

comment on table public.internal_tasks is
  '0694: a task one employee adds for another (Workspace MASTER, Jess 2026-10-14). Internal work only: it closes by its own Mark done, and closes nothing in any other module.';

-- ── 2 · ITS HISTORY ──────────────────────────────────────────────────────────
create table if not exists public.internal_task_events (
  id        uuid        primary key default gen_random_uuid(),
  task_id   uuid        not null references public.internal_tasks(id),
  event     text        not null check (event in ('added', 'done')),
  actor_id  uuid        not null references public.app_users(id),
  at        timestamptz not null default clock_timestamp(),
  constraint internal_task_events_one_of_each unique (task_id, event)
);

comment on table public.internal_task_events is
  '0694: the history of an internal task: who added it and when, who marked it done and when. Written only by the 0694 doors.';

-- ── RLS: read for Operation and Principal, no client write ───────────────────
alter table public.internal_tasks       enable row level security;
alter table public.internal_task_events enable row level security;

revoke all on public.internal_tasks       from public, anon, authenticated;
revoke all on public.internal_task_events from public, anon, authenticated;
grant select on public.internal_tasks       to authenticated;
grant select on public.internal_task_events to authenticated;
grant all on public.internal_tasks       to service_role;
grant all on public.internal_task_events to service_role;

create policy internal_tasks_operation_read on public.internal_tasks
  for select to authenticated using ((select public.is_operation()));
create policy internal_task_events_operation_read on public.internal_task_events
  for select to authenticated using ((select public.is_operation()));

-- A person's name as the screens print it: the name, else the sign-in email.
create or replace function public._internal_task_person(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'userId', u.id,
    'name', coalesce(nullif(btrim(u.name), ''), u.email)
  )
  from public.app_users u
  where u.id = p_user;
$fn$;

revoke all on function public._internal_task_person(uuid) from public, anon, authenticated;

-- ── 3 · ADD ──────────────────────────────────────────────────────────────────
create or replace function public.internal_task_add(
  p_title        text,
  p_detail       text,
  p_assigned_to  uuid,
  p_due_on       date,
  p_request_key  text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor  uuid := auth.uid();
  v_today  date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_title  text := btrim(coalesce(p_title, ''));
  v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
  v_id     uuid;
  v_owner  uuid;
begin
  if v_actor is null or not public.is_operation() then
    raise exception 'only Operation staff add a task'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_request_key is null or char_length(p_request_key) < 8 then
    raise exception 'a request key is required'
      using errcode = '22023', detail = 'request_key_required';
  end if;

  -- The same request answers with the same task.
  select t.id, t.created_by into v_id, v_owner
    from public.internal_tasks t where t.request_key = p_request_key;
  if found then
    if v_owner <> v_actor then
      raise exception 'this request key belongs to another task'
        using errcode = '22023', detail = 'request_key_reused';
    end if;
    return v_id;
  end if;

  if char_length(v_title) = 0 then
    raise exception 'task name is required'
      using errcode = '22023', detail = 'title_required';
  end if;
  if char_length(v_title) > 160 then
    raise exception 'task name is too long'
      using errcode = '22023', detail = 'title_too_long';
  end if;
  if v_detail is not null and char_length(v_detail) > 2000 then
    raise exception 'description is too long'
      using errcode = '22023', detail = 'detail_too_long';
  end if;
  if p_due_on is null then
    raise exception 'due date is required'
      using errcode = '22023', detail = 'due_required';
  end if;
  if p_due_on < v_today then
    raise exception 'due date has passed'
      using errcode = '22023', detail = 'due_in_past';
  end if;
  if not public._office_is_working_day(p_due_on) then
    raise exception 'due date is not an Office working day'
      using errcode = '22023', detail = 'due_not_working_day';
  end if;
  if not exists (
    select 1 from public.app_users u
     where u.id = p_assigned_to
       and u.status = 'active'
       and u.role in ('operation', 'principal')
  ) then
    raise exception 'choose an active Operation account'
      using errcode = '22023', detail = 'assignee_not_staff';
  end if;

  begin
    insert into public.internal_tasks (title, detail, created_by, assigned_to, due_on, request_key)
    values (v_title, v_detail, v_actor, p_assigned_to, p_due_on, p_request_key)
    returning id into v_id;
  exception when unique_violation then
    -- Two copies of one request arrived together: the first one made the task.
    select t.id into v_id from public.internal_tasks t
     where t.request_key = p_request_key and t.created_by = v_actor;
    if v_id is null then
      raise exception 'this request key belongs to another task'
        using errcode = '22023', detail = 'request_key_reused';
    end if;
    return v_id;
  end;

  insert into public.internal_task_events (task_id, event, actor_id)
  values (v_id, 'added', v_actor);
  return v_id;
end;
$fn$;

revoke all on function public.internal_task_add(text, text, uuid, date, text) from public, anon;
grant execute on function public.internal_task_add(text, text, uuid, date, text) to authenticated;

comment on function public.internal_task_add(text, text, uuid, date, text) is
  '0694: an Operation or Principal account adds an internal task for an active Operation or Principal account, due today or later on an Office working day. Grants nothing and writes no other module.';

-- ── 4 · MARK DONE ────────────────────────────────────────────────────────────
-- Any Operation or Principal account may finish it (Workspace MASTER §3: being
-- assigned is accountability, never an execution restriction). The person who
-- pressed it is the recorded actor. A second press changes nothing.
create or replace function public.internal_task_mark_done(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_task  public.internal_tasks%rowtype;
  v_first boolean := false;
begin
  if v_actor is null or not public.is_operation() then
    raise exception 'only Operation staff finish a task'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_task from public.internal_tasks t where t.id = p_task_id for update;
  if not found then
    raise exception 'task not found'
      using errcode = '22023', detail = 'task_not_found';
  end if;

  if v_task.done_at is null then
    update public.internal_tasks t
       set done_at = clock_timestamp(), done_by = v_actor
     where t.id = p_task_id
    returning * into v_task;
    insert into public.internal_task_events (task_id, event, actor_id, at)
    values (p_task_id, 'done', v_actor, v_task.done_at);
    v_first := true;
  end if;

  return jsonb_build_object(
    'id', v_task.id,
    'title', v_task.title,
    'dueOn', v_task.due_on,
    'doneAt', v_task.done_at,
    'doneBy', v_task.done_by,
    'recorded', v_first
  );
end;
$fn$;

revoke all on function public.internal_task_mark_done(uuid) from public, anon;
grant execute on function public.internal_task_mark_done(uuid) to authenticated;

comment on function public.internal_task_mark_done(uuid) is
  '0694: marks one internal task done and records who and when. It writes this task and its history only.';

-- ── 5 · READS ────────────────────────────────────────────────────────────────
create or replace function public.internal_tasks_open()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null or not public.is_operation() then
    raise exception 'only Operation staff read tasks'
      using errcode = '42501', detail = 'forbidden';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'title', t.title,
             'dueOn', t.due_on,
             'createdAt', t.created_at,
             'createdBy', public._internal_task_person(t.created_by),
             'assignedTo', public._internal_task_person(t.assigned_to)
           ) order by t.due_on, t.created_at)
      from public.internal_tasks t
     where t.done_at is null
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.internal_tasks_open() from public, anon;
grant execute on function public.internal_tasks_open() to authenticated;

create or replace function public.internal_task_read(p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_task public.internal_tasks%rowtype;
begin
  if auth.uid() is null or not public.is_operation() then
    raise exception 'only Operation staff read tasks'
      using errcode = '42501', detail = 'forbidden';
  end if;
  select * into v_task from public.internal_tasks t where t.id = p_task_id;
  if not found then
    raise exception 'task not found'
      using errcode = '22023', detail = 'task_not_found';
  end if;
  return jsonb_build_object(
    'id', v_task.id,
    'title', v_task.title,
    'detail', v_task.detail,
    'dueOn', v_task.due_on,
    'createdAt', v_task.created_at,
    'createdBy', public._internal_task_person(v_task.created_by),
    'assignedTo', public._internal_task_person(v_task.assigned_to),
    'doneAt', v_task.done_at,
    'doneBy', case when v_task.done_by is null then null else public._internal_task_person(v_task.done_by) end,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event', e.event,
               'at', e.at,
               'actor', public._internal_task_person(e.actor_id)
             ) order by e.at)
        from public.internal_task_events e
       where e.task_id = v_task.id
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.internal_task_read(uuid) from public, anon;
grant execute on function public.internal_task_read(uuid) to authenticated;
