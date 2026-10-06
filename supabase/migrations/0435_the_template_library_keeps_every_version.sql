-- ============================================================================
-- 0435 — the template library keeps every version
--        (docs/payment/MASTER.md §16 TEMPLATE LIBRARY, owner instruction
--         2026-09-06)
--
-- The MASTER's template law: `Settings → Payment → WhatsApp Templates` holds
-- multiple named Active templates per governed purpose and ONE Default per
-- purpose; saved template versions are immutable history; staff may edit
-- ordinary wording for one message but the library is the manager's.
--
-- Measured before this migration: the only template truth is hard-coded
-- wa-templates.ts (the LOCKED Jess 2026-07-13 wording). No stored template,
-- no versions, no purposes.
--
--   §1  payment_message_templates — append-only version rows; the newest
--       version of a template_key is its head. One default per purpose among
--       active heads.
--   §2  the three manager doors (save · set default · set active), all
--       through the payment settings manager gate and change log.
--   §3  seeds: ONLY the two already-locked customer wordings (reminder and
--       follow-up) become stored defaults, with their merge fields named.
--       No other purpose receives invented wording — an empty purpose says
--       so until its owner-approved text is entered.
-- ============================================================================

begin;

set search_path = public, pg_temp;

create table if not exists public.payment_message_templates (
  id uuid primary key default gen_random_uuid(),
  template_key uuid not null default gen_random_uuid(),
  purpose text not null check (purpose in (
    'standard_bank_transfer', 'gentle_reminder', 'should_have_been_received',
    'customer_promised', 'standard_payment_link', 'new_link_after_expiry',
    'payment_received', 'partial_payment_received')),
  name text not null,
  body text not null,
  version int not null check (version >= 1),
  active boolean not null default true,
  is_default boolean not null default false,
  is_head boolean not null default true,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

comment on table public.payment_message_templates is
  '0435: the WhatsApp template library (payment/MASTER.md §16). Every save appends a new version row; the newest version of a template_key is its head. Rows are never edited or deleted — versions and actual sent messages stay immutable history.';

create unique index if not exists payment_templates_one_head_uidx
  on public.payment_message_templates (template_key) where is_head;
create unique index if not exists payment_templates_one_default_uidx
  on public.payment_message_templates (purpose) where is_head and is_default and active;
create index if not exists payment_templates_purpose_idx
  on public.payment_message_templates (purpose, is_head);

alter table public.payment_message_templates enable row level security;
drop policy if exists payment_templates_read on public.payment_message_templates;
create policy payment_templates_read on public.payment_message_templates
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.payment_message_templates from authenticated, anon;

-- ---------------------------------------------------------------------------
-- §2 · the manager doors
-- ---------------------------------------------------------------------------

/** Save = append a version. A null key starts a new template at version 1;
 *  an existing key gets version n+1 carrying its active/default state. */
create or replace function public.payment_template_save(
  p_template_key uuid,
  p_purpose text,
  p_name text,
  p_body text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_prev payment_message_templates;
  v_row payment_message_templates;
  v_key uuid := coalesce(p_template_key, gen_random_uuid());
begin
  perform public.payment_settings_gate();
  if p_purpose not in (
    'standard_bank_transfer', 'gentle_reminder', 'should_have_been_received',
    'customer_promised', 'standard_payment_link', 'new_link_after_expiry',
    'payment_received', 'partial_payment_received') then
    raise exception 'unknown template purpose' using errcode = '22023', detail = 'bad_purpose';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'the template name is required' using errcode = '22023', detail = 'name_required';
  end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'the template wording is required' using errcode = '22023', detail = 'body_required';
  end if;

  if p_template_key is not null then
    select * into v_prev from payment_message_templates
     where template_key = p_template_key and is_head for update;
    if not found then
      raise exception 'template not found' using errcode = '22023', detail = 'template_not_found';
    end if;
    if v_prev.purpose <> p_purpose then
      raise exception 'a template keeps its purpose; make a new template instead'
        using errcode = '22023', detail = 'purpose_locked';
    end if;
    update payment_message_templates set is_head = false, is_default = false
     where id = v_prev.id;
  end if;

  insert into payment_message_templates
    (template_key, purpose, name, body, version, active, is_default, is_head, created_by)
  values
    (v_key, p_purpose, btrim(p_name), p_body,
     coalesce(v_prev.version, 0) + 1,
     coalesce(v_prev.active, true),
     coalesce(v_prev.is_default, false),
     true, auth.uid())
  returning * into v_row;

  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('template:' || v_key, to_jsonb(v_prev), to_jsonb(v_row), auth.uid());
  return to_jsonb(v_row);
end;
$fn$;

create or replace function public.payment_template_set_default(
  p_template_key uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row payment_message_templates;
begin
  perform public.payment_settings_gate();
  select * into v_row from payment_message_templates
   where template_key = p_template_key and is_head for update;
  if not found then
    raise exception 'template not found' using errcode = '22023', detail = 'template_not_found';
  end if;
  if not v_row.active then
    raise exception 'an inactive template cannot be the Default'
      using errcode = '22023', detail = 'inactive_default';
  end if;
  update payment_message_templates set is_default = false
   where purpose = v_row.purpose and is_head and is_default and id <> v_row.id;
  update payment_message_templates set is_default = true
   where id = v_row.id
   returning * into v_row;
  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('template_default:' || v_row.purpose, null, to_jsonb(v_row), auth.uid());
  return to_jsonb(v_row);
end;
$fn$;

create or replace function public.payment_template_set_active(
  p_template_key uuid,
  p_active boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row payment_message_templates;
begin
  perform public.payment_settings_gate();
  if p_active is null then
    raise exception 'say Active yes or no' using errcode = '22023', detail = 'bad_active';
  end if;
  select * into v_row from payment_message_templates
   where template_key = p_template_key and is_head for update;
  if not found then
    raise exception 'template not found' using errcode = '22023', detail = 'template_not_found';
  end if;
  update payment_message_templates
     set active = p_active,
         is_default = case when p_active then is_default else false end
   where id = v_row.id
   returning * into v_row;
  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('template_active:' || p_template_key, null, to_jsonb(v_row), auth.uid());
  return to_jsonb(v_row);
end;
$fn$;

revoke all on function public.payment_template_save(uuid, text, text, text) from public, anon;
grant execute on function public.payment_template_save(uuid, text, text, text) to authenticated;
revoke all on function public.payment_template_set_default(uuid) from public, anon;
grant execute on function public.payment_template_set_default(uuid) to authenticated;
revoke all on function public.payment_template_set_active(uuid, boolean) from public, anon;
grant execute on function public.payment_template_set_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- §3 · seeds — ONLY the already-locked wordings (Jess 2026-07-13)
-- ---------------------------------------------------------------------------

insert into public.payment_message_templates
  (purpose, name, body, version, active, is_default, is_head)
select 'gentle_reminder', 'Standard reminder',
E'Hi {customer},\nJust a friendly reminder regarding your order.\n\nREF: {ref}\nOutstanding: RM {outstanding}\nItem: {items}\n\nDo let us know once arranged. Thank you!',
  1, true, true, true
 where not exists (select 1 from public.payment_message_templates where purpose = 'gentle_reminder');

insert into public.payment_message_templates
  (purpose, name, body, version, active, is_default, is_head)
select 'should_have_been_received', 'Standard follow-up',
E'Hi {customer},\nFollowing up on your order — the balance below is still outstanding.\n\nREF: {ref}\nOutstanding: RM {outstanding}\nItem: {items}\n\nKindly arrange payment so we can proceed. Thank you!',
  1, true, true, true
 where not exists (select 1 from public.payment_message_templates where purpose = 'should_have_been_received');

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'payment_template_save'
  ) then
    raise exception 'sanity: the template save door is missing';
  end if;
  if not exists (select 1 from payment_message_templates
                  where purpose = 'gentle_reminder' and is_head and is_default) then
    raise exception 'sanity: the locked reminder seed is missing';
  end if;
end $$;

commit;
