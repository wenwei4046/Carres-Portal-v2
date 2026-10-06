-- ============================================================================
-- 0452 — stored furniture is LOOKED AT, and the look is recorded
-- (docs/payment/MASTER.md §6)
--
-- §6, verbatim: "At Storage Start, Warehouse records location, packaging,
-- condition, photos, actor and date. Every configured inspection interval
-- (currently 30 days) raises `Check the stored furniture`. Damage opens
-- Service Case/Issue, not a Payment note."
--
-- WHAT WAS MISSING — and why the Work item could not exist without this.
-- The interval is configured (0431's `inspection_days`) and nothing raised the
-- work, because nothing could: the Work engine admits a rule only when it can
-- name an AUTHORITATIVE COMPLETION FACT, and there was no record of a look ever
-- happening. A tick-box would not have been one. This is that fact.
--
-- The same shape serves both halves of §6: the record Warehouse makes AT
-- Storage Start is simply the first inspection, and every later one closes the
-- interval's work and starts the next.
--
-- ⛔ DAMAGE IS NOT RECORDED HERE. §6 sends damage to a Service Case or an
-- Issue, not to a Payment note, so this door has no damage field, no severity
-- and no follow-up: it records what was SEEN. A condition note that mentions
-- damage still leaves the Service Case to be opened by its own owner, and the
-- form says so rather than pretending the note is an escalation.
-- ============================================================================
begin;

create table if not exists public.payment_storage_inspections (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.payment_storage_cases(id) on delete restrict,

  inspected_on date not null,
  -- §6's four recorded facts. Location and packaging are what the warehouse
  -- can act on; condition is what it saw; the photo is what proves it.
  location text not null check (btrim(location) <> ''),
  packaging text not null check (btrim(packaging) <> ''),
  condition_note text not null check (btrim(condition_note) <> ''),
  photo_url text not null check (btrim(photo_url) <> ''),

  recorded_by uuid not null references public.app_users(id),
  recorded_at timestamptz not null default now()
);

create index if not exists payment_storage_inspections_case_idx
  on public.payment_storage_inspections (case_id, inspected_on desc);

comment on table public.payment_storage_inspections is
  '0452: the §6 storage inspection — location, packaging, condition, photo, actor and date. Append-only. The FIRST one is the record Warehouse makes at Storage Start; every later one closes that interval''s `Check the stored furniture` work and starts the next. Damage belongs to a Service Case, never to this record.';

alter table public.payment_storage_inspections enable row level security;

-- 0367's lesson: a new table inherits a blanket write grant nobody asked for.
revoke all on public.payment_storage_inspections from public, anon, authenticated;
grant select on public.payment_storage_inspections to authenticated;

drop policy if exists payment_storage_inspections_internal_read
  on public.payment_storage_inspections;
create policy payment_storage_inspections_internal_read
  on public.payment_storage_inspections for select to authenticated
  using (public.app_role() in ('operation', 'finance', 'principal', 'warehouse'));
-- No insert/update/delete policy: the door below is the only writer.

create or replace function public.payment_record_storage_inspection(
  p_case_id uuid,
  p_inspected_on date,
  p_location text,
  p_packaging text,
  p_condition_note text,
  p_photo_url text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_case payment_storage_cases;
  v_row payment_storage_inspections;
begin
  -- Warehouse does the looking (§6); Operation records alongside it and
  -- principal keeps the owner override. coalesce — NULL must refuse.
  if not coalesce(public.app_role() in ('warehouse', 'operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_inspector';
  end if;

  select * into v_case from payment_storage_cases where id = p_case_id;
  if not found then
    raise exception 'storage case not found' using errcode = '22023', detail = 'case_not_found';
  end if;
  if v_case.status <> 'open' then
    raise exception 'The storage case is closed. There is nothing in storage to check.'
      using errcode = '22023', detail = 'case_closed';
  end if;

  if p_inspected_on is null or p_inspected_on > v_today then
    raise exception 'A check cannot be dated in the future.'
      using errcode = '22023', detail = 'future_inspection';
  end if;
  if p_inspected_on < v_case.storage_start then
    raise exception 'A check cannot be dated before the storage started.'
      using errcode = '22023', detail = 'before_storage_start';
  end if;
  if nullif(btrim(coalesce(p_location, '')), '') is null
     or nullif(btrim(coalesce(p_packaging, '')), '') is null
     or nullif(btrim(coalesce(p_condition_note, '')), '') is null then
    raise exception 'Where it is, how it is packed and what condition it is in are all required.'
      using errcode = '22023', detail = 'facts_required';
  end if;
  if nullif(btrim(coalesce(p_photo_url, '')), '') is null then
    raise exception 'A photo is required — a check nobody can see is not a check.'
      using errcode = '22023', detail = 'photo_required';
  end if;

  insert into payment_storage_inspections
    (case_id, inspected_on, location, packaging, condition_note, photo_url, recorded_by)
  values
    (p_case_id, p_inspected_on, btrim(p_location), btrim(p_packaging),
     btrim(p_condition_note), btrim(p_photo_url), v_uid)
  returning * into v_row;

  insert into ops_activity_log(order_id, action, actor_id, detail)
  values (v_case.order_id, 'storage.checked', v_uid,
          jsonb_build_object('case_id', p_case_id, 'inspection_id', v_row.id,
                             'inspected_on', p_inspected_on, 'location', v_row.location));

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.payment_record_storage_inspection(uuid, date, text, text, text, text) is
  '0452: the one writer for a §6 storage inspection. Warehouse, Operation or principal. Refuses a closed case, a future date, a date before the storage started, a missing fact and a missing photo — a check nobody can see is not a check. It records what was seen; damage is a Service Case, not a field here.';

revoke all on function public.payment_record_storage_inspection(uuid, date, text, text, text, text) from public, anon;
grant execute on function public.payment_record_storage_inspection(uuid, date, text, text, text, text) to authenticated;

commit;
