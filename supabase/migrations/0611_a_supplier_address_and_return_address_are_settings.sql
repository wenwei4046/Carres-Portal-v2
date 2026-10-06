-- =============================================================================
-- 0611_a_supplier_address_and_return_address_are_settings.sql
-- Purchasing MASTER §9.6 (`Return To` = the supplier's recorded return address,
-- owner-approved 2026-09-25) and §5.5 Supplier Master · Settings → Purchasing.
--
-- WHAT WAS MISSING (measured on production 2026-09-29):
--   · `suppliers.address` (0383) prints on the PO and Repair Order PDFs, and
--     SO Batch Purchase says `Address not recorded. Check Suppliers.` — but no
--     screen, route or function could write it. 11 suppliers, 0 addresses.
--   · `suppliers.return_address` (0609, Purchase Returns lane) is the `Return
--     To` of a Purchase Return; Issue refuses while it is blank. Nothing could
--     write it either, so Issue Purchase Return was blocked for every supplier.
--
-- WHAT THIS DOES
--   `purchasing_set_supplier_address(p_supplier_id, p_kind, p_text)` — ONE door
--   for the two supplier addresses, one field per call so saving one never
--   overwrites the other:
--     · p_kind is `address` or `return_address` (closed list, refused by name);
--     · the text is trimmed; blank saves NULL (the Purchase Return refusal and
--       the PDFs' "leave out when empty" rule keep working);
--     · at most 500 characters;
--     · gate `purchasing_settings_gate()` — the same gate as every other
--       Purchasing Settings writer (principal, or the ops_manager duty);
--     · history through `purchasing_record_change` (`supplier_address` /
--       `supplier_return_address`), old → new.
--   One address is never copied into the other.
--
-- DELIBERATELY NOT HERE
--   · No column is added (both exist). No row is rewritten. RLS unchanged.
--     NO ROW COUNT IS ASSERTED.
-- =============================================================================

create or replace function public.purchasing_set_supplier_address(
  p_supplier_id uuid,
  p_kind        text,
  p_text        text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_new  text := nullif(btrim(coalesce(p_text, '')), '');
  v_old  text;
  v_name text;
begin
  if p_kind is null or p_kind not in ('address', 'return_address') then
    raise exception 'unknown_address_kind' using errcode = '22023', detail = coalesce(p_kind, '');
  end if;
  if v_new is not null and length(v_new) > 500 then
    raise exception 'address_too_long' using errcode = '22023';
  end if;

  select case p_kind when 'address' then address else return_address end, name
    into v_old, v_name
    from suppliers where id = p_supplier_id for update;
  if not found then
    raise exception 'unknown_supplier' using errcode = '22023';
  end if;

  if p_kind = 'address' then
    update suppliers set address = v_new where id = p_supplier_id;
  else
    update suppliers set return_address = v_new where id = p_supplier_id;
  end if;

  perform purchasing_record_change(
    v_role,
    case p_kind when 'address' then 'supplier_address' else 'supplier_return_address' end,
    -- `purchasing_setting_changes.new_value` is NOT NULL: a cleared address
    -- is recorded as an empty value, never skipped.
    p_supplier_id, null, v_old, coalesce(v_new, ''),
    format('Purchasing setting · %s %s changed',
           v_name, case p_kind when 'address' then 'Address' else 'Return address' end));
end;
$function$;

revoke all on function public.purchasing_set_supplier_address(uuid, text, text) from public, anon;
grant execute on function public.purchasing_set_supplier_address(uuid, text, text) to authenticated;

comment on function public.purchasing_set_supplier_address(uuid, text, text) is
  '0611 · Settings → Purchasing: one supplier''s `Address` (PO / Repair Order PDF) or `Return address` (Purchase Return `Return To`). One field per call; blank = NULL; never copies one into the other.';

-- SANITY — one overload, both columns present.
do $sanity$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_set_supplier_address';
  if v_n <> 1 then
    raise exception '0611 sanity: purchasing_set_supplier_address must have one overload, found %', v_n;
  end if;
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'suppliers'
     and column_name in ('address', 'return_address');
  if v_n <> 2 then
    raise exception '0611 sanity: suppliers.address and suppliers.return_address must both exist';
  end if;
end $sanity$;
