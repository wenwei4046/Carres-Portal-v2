-- 0674 — Every existing Settings section is edited by the people Jess names.
--
-- Owner rule (Carres Settings List TEAM-02 · SET-01, confirmed 9 Oct 2026):
-- Jess (the principal) edits every Settings section and may name a person
-- for a named section (0668 `settings_can_edit`). Until today each module
-- kept its own gate — "principal or the ops_manager position duty". Measured
-- 9 Oct 2026: the only active ops_manager holder is Jess herself, so moving
-- every gate onto `settings_can_edit` removes nobody's live right; after this
-- migration a named section editor can actually save.
--
-- What changes, gate by gate (signature, return value and the "no active
-- account" refusal are kept):
--   purchasing_settings_gate()      → settings_can_edit('purchasing')
--   payment_settings_gate()         → settings_can_edit('payment')
--   delivery_settings_gate()        → settings_can_edit('delivery')
--   warehouse_settings_gate()       → settings_can_edit('warehouse') OR the
--                                     existing Warehouse capability
--                                     `manage_warehouse_settings` (WH-05: a
--                                     Warehouse-owned grant already made; it
--                                     is kept, never silently removed)
--   workspace_duty_settings_gate()  → a person account AND
--                                     settings_can_edit('staff_duties')
--   set_order_entry_config(...)     → settings_can_edit('sales_orders')
--                                     (was: any operation account), and each
--                                     save now keeps who · when · old → new
--                                     in settings_changes (0669).
-- The can-edit readers (delivery_can_manage_settings,
-- warehouse_can_manage_settings, workspace_can_assign_duties) call these
-- gates, so they follow without a change.
--
-- Not changed: purchasing_set_supplier_terms_days keeps its own role gate
-- (principal · operation · finance, 0530) — a Finance-shared field.
-- No RLS policy changes.

create or replace function public.purchasing_settings_gate()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role());
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if not coalesce(public.settings_can_edit('purchasing'), false) then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'purchasing settings are set by the people named for this section';
  end if;
  return v_role;
end;
$fn$;

create or replace function public.payment_settings_gate()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if (select public.app_role()) is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if not coalesce(public.settings_can_edit('payment'), false) then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'payment settings are set by the people named for this section';
  end if;
end;
$fn$;

create or replace function public.delivery_settings_gate()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if (select public.app_role()) is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if not coalesce(public.settings_can_edit('delivery'), false) then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'delivery settings are set by the people named for this section';
  end if;
end;
$fn$;

create or replace function public.warehouse_settings_gate()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if (select public.app_role()) is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if coalesce(public.settings_can_edit('warehouse'), false) then return; end if;
  if public.warehouse_holds_capability('manage_warehouse_settings', auth.uid()) then return; end if;
  raise exception 'forbidden' using errcode = '42501',
    detail = 'warehouse settings are set by the people named for this section';
end;
$fn$;

create or replace function public.workspace_duty_settings_gate()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role());
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if not public.workspace_is_person(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'duty assignments are set by a person';
  end if;
  if not coalesce(public.settings_can_edit('staff_duties'), false) then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'duty assignments are set by the people named for this section';
  end if;
  return v_role;
end;
$fn$;

create or replace function public.set_order_entry_config(
  p_payment_methods jsonb,
  p_form_fields     jsonb
) returns public.order_entry_config
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before public.order_entry_config;
  v_row    public.order_entry_config;
  v_old    jsonb := '{}'::jsonb;
  v_new    jsonb := '{}'::jsonb;
begin
  if (select public.app_role()) is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if not coalesce(public.settings_can_edit('sales_orders'), false) then
    raise exception 'forbidden: sales order settings are set by the people named for this section'
      using errcode = '42501', detail = 'not_settings_editor';
  end if;
  if p_payment_methods is not null and jsonb_typeof(p_payment_methods) <> 'array' then
    raise exception 'payment_methods must be a jsonb array' using errcode = '22023';
  end if;
  if p_form_fields is not null and jsonb_typeof(p_form_fields) <> 'object' then
    raise exception 'form_fields must be a jsonb object' using errcode = '22023';
  end if;

  select * into v_before from public.order_entry_config where id = true for update;

  update public.order_entry_config
     set payment_methods = coalesce(p_payment_methods, payment_methods),
         form_fields     = coalesce(p_form_fields, form_fields),
         updated_at      = now(),
         updated_by      = auth.uid()
   where id = true
   returning * into v_row;

  if v_before.payment_methods is distinct from v_row.payment_methods then
    v_old := v_old || jsonb_build_object('payment_methods', v_before.payment_methods);
    v_new := v_new || jsonb_build_object('payment_methods', v_row.payment_methods);
  end if;
  if v_before.form_fields is distinct from v_row.form_fields then
    v_old := v_old || jsonb_build_object('form_fields', v_before.form_fields);
    v_new := v_new || jsonb_build_object('form_fields', v_row.form_fields);
  end if;
  if v_new <> '{}'::jsonb then
    insert into public.settings_changes (section, what, old_value, new_value, actor_id)
    values ('sales_orders', 'order_entry_config', v_old, v_new, auth.uid());
  end if;
  return v_row;
end;
$fn$;

revoke all on function public.set_order_entry_config(jsonb, jsonb) from public, anon;
grant execute on function public.set_order_entry_config(jsonb, jsonb) to authenticated;
