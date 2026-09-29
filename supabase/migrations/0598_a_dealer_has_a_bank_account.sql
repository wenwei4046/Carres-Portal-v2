-- 0598 — A dealer has a bank account.
--
-- OWNER NOTES (owner meeting): dealer maintenance keeps the standard info and
--   the dealer's bank account, so a commission payment voucher can use it.
--
-- WHAT THIS CHANGES
--   1. dealers.bank_name, dealers.bank_account_no, dealers.bank_account_holder:
--      three nullable text columns, empty for every existing row.
--   2. dealers_bank_account_no_format: an account number is digits only,
--      6 to 20 of them. NULL is allowed (not filled in yet).
--   3. dealer_save_master(dealer, patch): redefined from its latest body (0543)
--      to also save the three bank keys. Same role rule as the other master
--      fields (principal and finance). An empty value clears the field. The
--      signature is unchanged, so grants carry over; they are restated below
--      exactly as 0543 left them.
--
-- RLS: NOT CHANGED. Finance still writes only through this definer door.

alter table public.dealers
  add column if not exists bank_name           text,
  add column if not exists bank_account_no     text,
  add column if not exists bank_account_holder text;

-- Guarded so the file can be run a second time without failing.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'dealers_bank_account_no_format'
                    and conrelid = 'public.dealers'::regclass) then
    alter table public.dealers
      add constraint dealers_bank_account_no_format
        check (bank_account_no ~ '^[0-9]{6,20}$');
  end if;
end $$;

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
    state         = case when p_patch ? 'state' then nullif(trim(p_patch->>'state'), '')       else d.state end,
    bank_name           = case when p_patch ? 'bank_name'
                               then nullif(trim(p_patch->>'bank_name'), '') else d.bank_name end,
    bank_account_no     = case when p_patch ? 'bank_account_no'
                               then nullif(trim(p_patch->>'bank_account_no'), '') else d.bank_account_no end,
    bank_account_holder = case when p_patch ? 'bank_account_holder'
                               then nullif(trim(p_patch->>'bank_account_holder'), '') else d.bank_account_holder end
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
