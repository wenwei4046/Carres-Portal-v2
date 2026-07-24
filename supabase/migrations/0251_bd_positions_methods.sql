-- 0251_bd_positions_methods — BD parity with the staff engine (2026-07-25, Loo):
-- BD gets the SAME two methods (percentage | per_model "item KPI") and TWO
-- positions — BD Executive / CBO — where the CBO earns the rate DIFFERENCE as
-- override on executives' dealer sales (mirror of the Sales Manager rule; own
-- assigned dealers at own rate; no override under per_model).
--
-- bd_profiles (position per BD user) + bd_commission_config (ONE global method
-- switch — dealers have no outlet concept) + a `program` discriminator on the
-- three per-model config tables so BD's item-KPI numbers are SEPARATE from the
-- showroom staff's (default 'staff' keeps every existing row meaning what it
-- meant). hr_commission_source gains bdProfiles / bdMethod / dealerLines and
-- stamps program on the per-model config keys. All additive + dormant.

create table public.bd_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  position text not null default 'executive' check (position in ('executive', 'cbo')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.bd_profiles enable row level security;
create policy bd_profiles_hr_rw on public.bd_profiles
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

create table public.bd_commission_config (
  id boolean primary key default true check (id),
  method text not null default 'percentage' check (method in ('percentage', 'per_model')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.bd_commission_config enable row level security;
create policy bd_config_hr_rw on public.bd_commission_config
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));
insert into public.bd_commission_config (id) values (true);

alter table public.model_commission_rates
  add column program text not null default 'staff' check (program in ('staff', 'bd'));
alter table public.model_commission_rates
  drop constraint model_commission_rates_model_id_key;
alter table public.model_commission_rates
  add constraint model_commission_rates_model_program_key unique (model_id, program);

alter table public.model_commission_tiers
  add column program text not null default 'staff' check (program in ('staff', 'bd'));
alter table public.model_commission_tiers
  drop constraint model_commission_tiers_model_id_threshold_qty_key;
alter table public.model_commission_tiers
  add constraint model_commission_tiers_model_program_threshold_key
  unique (model_id, program, threshold_qty);

alter table public.commission_milestones
  add column program text not null default 'staff' check (program in ('staff', 'bd'));
