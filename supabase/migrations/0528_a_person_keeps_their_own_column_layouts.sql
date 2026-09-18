-- =============================================================================
-- 0528_a_person_keeps_their_own_column_layouts.sql (Jess 2026-09-17)
-- =============================================================================
-- Personal saved column layouts — ui MASTER §6.7 rule 4, Purchasing MASTER §9.3.
-- Purchase Orders pilots it; no other listing is admitted until the owner
-- accepts the pilot, so `listing` is a closed list of one.
--
-- WHAT A LAYOUT IS. Column order, widths, visibility and sort — nothing else.
-- Search, filters and group open/closed state are never saved; the shape check
-- refuses any other key, so a client cannot smuggle them in.
--
-- WHO SEES IT. Only the person who saved it.
--   · RLS is on. The ONE policy is SELECT `user_id = auth.uid()`.
--   · INSERT / UPDATE / DELETE are revoked from `authenticated`; writes go
--     through the two doors below, which act only on `auth.uid()`'s own rows.
--     No door accepts a user id, so no caller can write for somebody else.
--   · A company default is not a row here: `Reset columns` returns to the
--     page's own layout, so a personal layout can never change anyone else's.
--
-- LIMITS. Up to 10 layouts per person per listing (saving under an existing
-- name replaces it and never counts twice). At most one default per person per
-- listing (partial unique index). Names are 1–60 characters, trimmed.
-- =============================================================================

create or replace function public.register_layout_shape_ok(p_layout jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(p_layout) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(p_layout) k
      where k not in ('order', 'hidden', 'widths', 'sort')
    )
    and jsonb_typeof(coalesce(p_layout->'order', '[]'::jsonb)) = 'array'
    and jsonb_typeof(coalesce(p_layout->'hidden', '[]'::jsonb)) = 'array'
    and jsonb_typeof(coalesce(p_layout->'widths', '{}'::jsonb)) = 'object'
    and jsonb_typeof(coalesce(p_layout->'sort', 'null'::jsonb)) in ('null', 'object');
$$;

create table public.register_personal_layouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  listing     text not null check (listing in ('purchase_orders')),
  name        text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  layout      jsonb not null check (public.register_layout_shape_ok(layout)),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, listing, name)
);

create unique index register_personal_layouts_one_default
  on public.register_personal_layouts (user_id, listing)
  where is_default;

alter table public.register_personal_layouts enable row level security;

create policy register_personal_layouts_own_read on public.register_personal_layouts
  for select
  to authenticated
  using ( user_id = ( select auth.uid() ) );

revoke all on public.register_personal_layouts from anon;
revoke insert, update, delete on public.register_personal_layouts from authenticated;
grant select on public.register_personal_layouts to authenticated;

-- =============================================================================
-- register_layout_save(listing, name, layout) — save, or replace by name.
-- Refuses: not signed in (42501) · unknown listing / bad name / bad shape
-- (22023) · an 11th name (`register_layout_limit`, 23514).
-- =============================================================================
create or replace function public.register_layout_save(
  p_listing text,
  p_name text,
  p_layout jsonb
)
returns public.register_personal_layouts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_row public.register_personal_layouts;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_listing is distinct from 'purchase_orders' then
    raise exception 'register_layout_listing' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'register_layout_name' using errcode = '22023';
  end if;
  if p_layout is null or not public.register_layout_shape_ok(p_layout) then
    raise exception 'register_layout_shape' using errcode = '22023';
  end if;

  -- One person's saves are serialised, so two tabs cannot both take the 10th slot.
  perform pg_advisory_xact_lock(hashtextextended('register_layout:' || v_user::text || ':' || p_listing, 0));

  update public.register_personal_layouts
     set layout = p_layout, updated_at = now()
   where user_id = v_user and listing = p_listing and name = v_name
  returning * into v_row;
  if found then
    return v_row;
  end if;

  if (select count(*) from public.register_personal_layouts
       where user_id = v_user and listing = p_listing) >= 10 then
    raise exception 'register_layout_limit' using errcode = '23514';
  end if;

  insert into public.register_personal_layouts (user_id, listing, name, layout)
  values (v_user, p_listing, v_name, p_layout)
  returning * into v_row;
  return v_row;
end;
$$;

-- =============================================================================
-- register_layout_set_default(id) — make one of MY layouts my default.
-- Another person's id is indistinguishable from a missing one (P0002).
-- =============================================================================
create or replace function public.register_layout_set_default(p_id uuid)
returns public.register_personal_layouts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_listing text;
  v_row public.register_personal_layouts;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select listing into v_listing
    from public.register_personal_layouts
   where id = p_id and user_id = v_user;
  if v_listing is null then
    raise exception 'register_layout_not_found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('register_layout:' || v_user::text || ':' || v_listing, 0));
  update public.register_personal_layouts
     set is_default = false, updated_at = now()
   where user_id = v_user and listing = v_listing and is_default and id <> p_id;
  update public.register_personal_layouts
     set is_default = true, updated_at = now()
   where id = p_id and user_id = v_user
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.register_layout_save(text, text, jsonb) from public;
revoke all on function public.register_layout_set_default(uuid) from public;
grant execute on function public.register_layout_save(text, text, jsonb) to authenticated;
grant execute on function public.register_layout_set_default(uuid) to authenticated;
