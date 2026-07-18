-- 0233_staff_pin_login.sql
-- Staff PIN login (Loo 2026-07-18): dealer/showroom POS gains outlet-pick +
-- 6-digit-PIN staff identity. Three tiers on salespersons (principal/manager/
-- salesperson) + a deny-all PIN ledger verified only inside SECURITY DEFINER
-- fns reachable by service_role alone (the Hono staff routes).
--
-- Additive; zero data changes (existing rows default to salesperson tier);
-- existing RLS policies, create_order, and the 0004 auth hook are UNTOUCHED.
-- (0230/0231 were taken by parallel sessions — numbering keys on timestamp.)

-- 1) salespersons → staff tiers -------------------------------------------

alter table public.salespersons
  add column if not exists staff_role text not null default 'salesperson',
  add column if not exists color text,
  add column if not exists active boolean not null default true;

do $$ begin
  alter table public.salespersons
    add constraint salespersons_staff_role_check
    check (staff_role in ('principal', 'manager', 'salesperson'));
exception when duplicate_object then null; end $$;

comment on column public.salespersons.staff_role is
  'POS staff tier: principal (store owner, all outlets) / manager (outlet-bound) / salesperson. Tier rules enforced in the Hono staff routes via the staff session token.';
comment on column public.salespersons.color is
  'STAFF_COLORS palette key for the PIN-screen avatar tile (packages/shared/src/schemas/staff.ts).';
comment on column public.salespersons.active is
  'Soft deactivation. orders.salesperson_id FK is NO ACTION, so referenced staff can never be hard-deleted — deactivate instead.';

-- 2) PIN ledger — deny-all RLS --------------------------------------------
-- No policies on purpose: user JWTs (authenticated) can neither read nor
-- write; service_role bypasses RLS. The bcrypt hash never leaves Postgres —
-- both fns below return only status/void.

create table if not exists public.salesperson_pins (
  salesperson_id uuid primary key
    references public.salespersons(id) on delete cascade,
  pin_hash        text        not null,
  failed_attempts int         not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.salesperson_pins enable row level security;

comment on table public.salesperson_pins is
  '6-digit staff PIN hashes (bcrypt via pgcrypto). Deny-all RLS: only staff_verify_pin/staff_set_pin (SECURITY DEFINER, service_role-only EXECUTE) touch this table.';

-- 3) verify fn — 5 consecutive fails => 15-minute lock ---------------------
-- pgcrypto lives in the `extensions` schema on Supabase, hence the qualified
-- extensions.crypt()/gen_salt() calls (search_path stays public,pg_temp).

create or replace function public.staff_verify_pin(p_salesperson_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash   text;
  v_fails  int;
  v_locked timestamptz;
  v_active boolean;
begin
  select p.pin_hash, p.failed_attempts, p.locked_until, s.active
    into v_hash, v_fails, v_locked, v_active
    from public.salesperson_pins p
    join public.salespersons s on s.id = p.salesperson_id
   where p.salesperson_id = p_salesperson_id
   for update of p;

  if not found or not v_active then
    return jsonb_build_object('status', 'no_pin');
  end if;

  if v_locked is not null and v_locked > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', v_locked);
  end if;

  -- an expired lock starts a fresh attempt window
  if v_locked is not null then
    v_fails := 0;
  end if;

  if v_hash = extensions.crypt(p_pin, v_hash) then
    update public.salesperson_pins
       set failed_attempts = 0, locked_until = null, updated_at = now()
     where salesperson_id = p_salesperson_id;
    return jsonb_build_object('status', 'ok');
  end if;

  update public.salesperson_pins
     set failed_attempts = v_fails + 1,
         locked_until    = case when v_fails + 1 >= 5
                                then now() + interval '15 minutes' end,
         updated_at      = now()
   where salesperson_id = p_salesperson_id;

  if v_fails + 1 >= 5 then
    return jsonb_build_object('status', 'locked',
                              'locked_until', now() + interval '15 minutes');
  end if;
  return jsonb_build_object('status', 'bad_pin', 'remaining', 5 - (v_fails + 1));
end $$;

-- 4) set fn — upsert + reset the attempt window ----------------------------

create or replace function public.staff_set_pin(p_salesperson_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'pin must be exactly 6 digits' using errcode = '22023';
  end if;
  insert into public.salesperson_pins (salesperson_id, pin_hash)
  values (p_salesperson_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (salesperson_id) do update
     set pin_hash        = excluded.pin_hash,
         failed_attempts = 0,
         locked_until    = null,
         updated_at      = now();
end $$;

-- 5) EXECUTE: service_role ONLY --------------------------------------------
-- Supabase default-grants EXECUTE to authenticated/anon on new fns (0188
-- lesson) — revoke explicitly, then assert.

revoke all on function public.staff_verify_pin(uuid, text) from public;
revoke all on function public.staff_verify_pin(uuid, text) from authenticated, anon;
revoke all on function public.staff_set_pin(uuid, text) from public;
revoke all on function public.staff_set_pin(uuid, text) from authenticated, anon;
grant execute on function public.staff_verify_pin(uuid, text) to service_role;
grant execute on function public.staff_set_pin(uuid, text) to service_role;

do $$ begin
  if has_function_privilege('authenticated', 'public.staff_verify_pin(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.staff_verify_pin(uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.staff_set_pin(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.staff_set_pin(uuid, text)', 'EXECUTE') then
    raise exception 'staff PIN fns must not be callable by authenticated/anon';
  end if;
end $$;
