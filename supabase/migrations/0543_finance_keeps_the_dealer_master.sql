-- 0543 — Finance keeps the dealer master (name, address, code, contact, state).
--
-- OWNER NOTES (YH, KL Gateway meetings, 18 Sep 2026)
--   Finance maintains the dealer table in the ERP: name, address, code,
--   contact, the usual fields. State is usually not picked.
--
-- WHAT THIS CHANGES
--   1. dealers.code: a short code like JB1, JB2. Capital letters and digits,
--      unique, empty for every existing row (nothing is filled in).
--   2. dealers.state: an optional Malaysian state, free of any check here;
--      the screen offers the fixed state list.
--   3. dealer_save_master(dealer, patch): one write door for the master
--      fields only (name, region, address, ssm_code, contact_name,
--      contact_phone, contact, code, state). Principal and finance may call
--      it. A key absent from the patch is left alone; an empty code or state
--      clears it.
--
-- RLS: NOT CHANGED. dealers_principal_write (0002) still lets only the
--   principal write the dealers table directly. A row policy cannot limit
--   which columns finance may touch, so instead of widening it, finance
--   writes through this definer door, which touches the master columns only.
--   Status, channel, credit, deposit and logins stay principal-only.
--   Finance already reads dealers through dealers_internal_read (is_internal).

alter table public.dealers
  add column if not exists code  text,
  add column if not exists state text;

alter table public.dealers
  add constraint dealers_code_format check (code ~ '^[A-Z0-9]{1,12}$'),
  add constraint dealers_code_unique unique (code);

create or replace function public.dealer_save_master(
  p_dealer_id uuid,
  p_patch     jsonb
)
returns public.dealers
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.dealers;
begin
  if public.app_role() is null or public.app_role() not in ('principal', 'finance') then
    raise exception 'Only the principal or finance may edit a dealer'
      using errcode = '42501';
  end if;

  update public.dealers d set
    name          = case when p_patch ? 'name'         then p_patch->>'name'         else d.name end,
    region        = case when p_patch ? 'region'       then p_patch->>'region'       else d.region end,
    address       = case when p_patch ? 'address'      then p_patch->>'address'      else d.address end,
    ssm_code      = case when p_patch ? 'ssm_code'     then p_patch->>'ssm_code'     else d.ssm_code end,
    contact_name  = case when p_patch ? 'contact_name' then p_patch->>'contact_name' else d.contact_name end,
    contact_phone = case when p_patch ? 'contact_phone' then p_patch->>'contact_phone' else d.contact_phone end,
    contact       = case when p_patch ? 'contact'      then p_patch->>'contact'      else d.contact end,
    code          = case when p_patch ? 'code'  then nullif(upper(trim(p_patch->>'code')), '') else d.code end,
    state         = case when p_patch ? 'state' then nullif(trim(p_patch->>'state'), '')       else d.state end
  where d.id = p_dealer_id
  returning d.* into v_row;

  if v_row.id is null then
    raise exception 'Dealer not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$function$;

revoke execute on function public.dealer_save_master(uuid, jsonb) from public, anon;
grant execute on function public.dealer_save_master(uuid, jsonb) to authenticated;
