-- =============================================================================
-- 0722_office_staff_edit_the_state_city_and_postcode_lists.sql
-- =============================================================================
-- THE RULING: Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH
--   2026-10-23: "just clear Carress rules and Implement Houzs inside"). Office
--   staff edit the State, City and Postcode lists the address pickers offer,
--   the Houzs SO Maintenance way. Jess and Loo were not part of this decision.
--   It overturns Loo's 2026-07-19 "completeness comes from this dataset, not
--   typing" (apps/web/src/data/malaysia-postcodes.ts).
--
-- WHAT THIS CHANGES
--   address_list_overrides   one row per change on top of the generated
--                            national file (which stays untouched): add,
--                            rename (State or City) or hide a State, City or
--                            Postcode. Every signed-in account reads it (the
--                            dealer POS pickers use the same lists).
--   settings_save_address_override   the one write door. Gate: the Sales
--                            Order Settings editors (settings_can_edit
--                            'sales_orders', 0668). Every save and removal is
--                            kept in settings_changes ('sales_orders',
--                            'address_list'), who · when · old → new.
--
-- WHAT IT DOES NOT CHANGE: the delivery locality reader (docs/delivery/MASTER.md
--   resolveDeliveryLocality) still reads the national dataset. Stored orders
--   are never rewritten; a hidden or renamed name stays on the orders that
--   recorded it.
--
-- Deploy: merge, then run this file once. Safe to re-run.
-- =============================================================================

create table if not exists public.address_list_overrides (
  id          bigint generated always as identity primary key,
  state       text not null check (btrim(state) <> ''),
  city        text check (city is null or btrim(city) <> ''),
  postcode    text check (postcode is null or postcode ~ '^\d{5}$'),
  rename_to   text check (rename_to is null or btrim(rename_to) <> ''),
  hidden      boolean not null default false,
  changed_by  uuid references public.app_users(id),
  changed_at  timestamptz not null default now(),
  constraint address_list_overrides_postcode_needs_city check (postcode is null or city is not null),
  constraint address_list_overrides_one_action check (not (hidden and rename_to is not null)),
  constraint address_list_overrides_no_postcode_rename check (rename_to is null or postcode is null)
);

create unique index if not exists address_list_overrides_one_per_name
  on public.address_list_overrides (state, coalesce(city, ''), coalesce(postcode, ''));

alter table public.address_list_overrides enable row level security;
revoke all on public.address_list_overrides from public, anon, authenticated;
grant select on public.address_list_overrides to authenticated;
grant all on public.address_list_overrides to service_role;

drop policy if exists address_list_overrides_read on public.address_list_overrides;
create policy address_list_overrides_read on public.address_list_overrides
  for select to authenticated using (true);

-- p_remove = true deletes the row for that name (the list goes back to the
-- national file for it). Otherwise the row for that name is written: hidden,
-- renamed (p_rename_to), or neither = added.
create or replace function public.settings_save_address_override(
  p_state text, p_city text, p_postcode text, p_rename_to text, p_hidden boolean,
  p_remove boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_state    text := nullif(btrim(coalesce(p_state, '')), '');
  v_city     text := nullif(btrim(coalesce(p_city, '')), '');
  v_postcode text := nullif(btrim(coalesce(p_postcode, '')), '');
  v_rename   text := nullif(btrim(coalesce(p_rename_to, '')), '');
  v_hidden   boolean := coalesce(p_hidden, false);
  v_before   public.address_list_overrides;
  v_after    public.address_list_overrides;
begin
  perform public._settings_require_editor('sales_orders');
  if v_state is null then
    raise exception 'a state is required' using errcode = '22023', detail = 'state_required';
  end if;

  select * into v_before from public.address_list_overrides
   where state = v_state and coalesce(city, '') = coalesce(v_city, '')
     and coalesce(postcode, '') = coalesce(v_postcode, '')
   for update;

  if coalesce(p_remove, false) then
    if v_before.id is null then
      return null;
    end if;
    delete from public.address_list_overrides where id = v_before.id;
  else
    if v_before.id is null then
      insert into public.address_list_overrides (state, city, postcode, rename_to, hidden, changed_by)
      values (v_state, v_city, v_postcode, v_rename, v_hidden, auth.uid())
      returning * into v_after;
    else
      update public.address_list_overrides
         set rename_to = v_rename, hidden = v_hidden,
             changed_by = auth.uid(), changed_at = clock_timestamp()
       where id = v_before.id
      returning * into v_after;
    end if;
  end if;

  insert into public.settings_changes (section, what, old_value, new_value, actor_id)
  values ('sales_orders', 'address_list',
          case when v_before.id is null then null
               else jsonb_build_object('state', v_before.state, 'city', v_before.city, 'postcode', v_before.postcode,
                                       'rename_to', v_before.rename_to, 'hidden', v_before.hidden) end,
          case when v_after.id is null then null
               else jsonb_build_object('state', v_after.state, 'city', v_after.city, 'postcode', v_after.postcode,
                                       'rename_to', v_after.rename_to, 'hidden', v_after.hidden) end,
          auth.uid());
  return to_jsonb(v_after);
end;
$fn$;

comment on function public.settings_save_address_override(text, text, text, text, boolean, boolean) is
  '0722: Weisiang''s decision (Mr Lim, WhatsApp 2026-10-22; Jess was not part of it) — office staff add, rename or hide a State, City or Postcode on top of the national file. Gate: Sales Order Settings editors.';

revoke all on function public.settings_save_address_override(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.settings_save_address_override(text, text, text, text, boolean, boolean) to authenticated;
