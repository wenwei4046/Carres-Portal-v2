-- 0405_supplier_collection_is_governed
--
-- Supplier collection is Purchasing master data, not a choice made while
-- issuing one PO. This trigger sits on the shared document boundary so SO
-- Batch Purchase, Manual Purchase and every future governed writer obey the
-- same collector and fixed destination.

create or replace function public.trg_po_supplier_collection_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_kind public.supplier_kind;
  v_partner_id uuid;
  v_destination_id uuid;
begin
  select s.kind,
         ss.collected_by_partner_id,
         ss.fixed_destination_id
    into v_kind, v_partner_id, v_destination_id
    from public.suppliers s
    left join public.purchasing_supplier_settings ss
      on ss.supplier_id = s.id
   where s.id = new.supplier_id;

  if v_kind is null then
    raise exception 'The PO supplier does not exist.'
      using errcode = '23503', detail = 'supplier_not_found';
  end if;

  if v_kind = 'factory_pickup' then
    if v_partner_id is null then
      raise exception 'Factory collection is not configured for this supplier.'
        using errcode = 'P0001', detail = 'supplier_collection_not_configured';
    end if;
    if new.procurement_partner_id is distinct from v_partner_id then
      raise exception 'The PO collector must match Purchasing Settings.'
        using errcode = 'P0001', detail = 'supplier_collection_mismatch';
    end if;
    if v_destination_id is not null
       and new.destination_id is distinct from v_destination_id then
      raise exception 'The PO destination must match Purchasing Settings.'
        using errcode = 'P0001', detail = 'supplier_collection_destination_mismatch';
    end if;
  elsif new.procurement_partner_id is not null then
    raise exception 'A supplier that delivers its own goods has no collection partner.'
      using errcode = 'P0001', detail = 'pickup_partner_not_allowed';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_po_supplier_collection_guard on public.purchase_orders;
create trigger trg_po_supplier_collection_guard
  before insert or update of supplier_id, destination_id, procurement_partner_id
  on public.purchase_orders
  for each row execute function public.trg_po_supplier_collection_guard();

revoke all on function public.trg_po_supplier_collection_guard() from public;

comment on function public.trg_po_supplier_collection_guard() is
  'Enforces the governed supplier collector and fixed destination on every PO writer.';
