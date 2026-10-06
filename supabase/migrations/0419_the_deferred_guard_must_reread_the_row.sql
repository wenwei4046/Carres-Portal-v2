-- 0419_the_deferred_guard_must_reread_the_row
--
-- 0418 WAS HALF THE FIX, AND THE HALF IT MISSED IS THE ONE THAT MATTERED.
--
-- 0418 correctly identified that `trg_po_supplier_collection_guard` ran before
-- `destination_id` had been written — the governed writers insert the PO and
-- set its destination in a second statement — and deferred the trigger to end
-- of transaction so it would see the finished row.
--
-- It does not see the finished row. A deferred AFTER trigger fires at commit,
-- but `NEW` still holds the ROW IMAGE CAPTURED AT INSERT TIME. Deferring moved
-- WHEN the trigger runs without changing WHAT it reads, so `new.destination_id`
-- was still null at commit and the guard refused exactly as before.
--
-- MEASURED (YH, 2026-09-03, production, after 0418 was applied). SO-1205's
-- Ohana line, `Ohana → Ohana` on the review screen, one supplier row, one
-- settings row, `pg_trigger` confirming the trigger is a deferrable initially
-- deferred constraint trigger — and the same refusal.
--
-- THE FIX. Read the row's current state out of `purchase_orders` by id instead
-- of trusting the captured image. At commit every statement in the transaction
-- has run, so the table holds the values the transaction is actually committing
-- — which is the guarantee 0418 was reaching for.
--
-- The rule is unchanged. Same three refusals, same codes, same words, same
-- narrowing so an unrelated write does not re-open a settled PO.

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
  v_supplier_name text;
  v_dest_name text;
  v_po record;
begin
  /* A constraint trigger cannot carry `update of supplier_id, destination_id,
     procurement_partner_id`, so 0418's hand narrowing is kept: without it,
     changing Purchasing Settings would retroactively freeze every PO already
     issued under the old rule. */
  if tg_op = 'UPDATE'
     and new.supplier_id is not distinct from old.supplier_id
     and new.destination_id is not distinct from old.destination_id
     and new.procurement_partner_id is not distinct from old.procurement_partner_id
  then
    return new;
  end if;

  /* ⭐ THE ROW AS IT STANDS NOW, not as it was inserted. This is the whole
     point of the deferral, and 0418 left it out. A PO deleted later in the
     same transaction has nothing left to check. */
  select po.supplier_id, po.destination_id, po.procurement_partner_id
    into v_po
    from public.purchase_orders po
   where po.id = new.id;

  if not found then
    return new;
  end if;

  select s.kind,
         s.name,
         ss.collected_by_partner_id,
         ss.fixed_destination_id
    into v_kind, v_supplier_name, v_partner_id, v_destination_id
    from public.suppliers s
    left join public.purchasing_supplier_settings ss
      on ss.supplier_id = s.id
   where s.id = v_po.supplier_id;

  if v_kind is null then
    raise exception 'The PO supplier does not exist.'
      using errcode = '23503', detail = 'supplier_not_found';
  end if;

  if v_kind = 'factory_pickup' then
    if v_partner_id is null then
      raise exception 'Factory collection is not configured for this supplier.'
        using errcode = 'P0001',
              detail = 'supplier_collection_not_configured',
              hint = json_build_object('supplier', v_supplier_name)::text;
    end if;
    if v_po.procurement_partner_id is distinct from v_partner_id then
      raise exception 'The PO collector must match Purchasing Settings.'
        using errcode = 'P0001',
              detail = 'supplier_collection_mismatch',
              hint = json_build_object('supplier', v_supplier_name)::text;
    end if;
    if v_destination_id is not null
       and v_po.destination_id is distinct from v_destination_id then
      /* The two names travel WITH the refusal. The route reads the settings as
         the OPERATOR while this function is `security definer`, so the rule can
         be invisible to the very code that has to explain it — which is why the
         message reached the screen naming neither party. */
      select name into v_dest_name
        from public.purchasing_destinations where id = v_destination_id;
      raise exception 'The PO destination must match Purchasing Settings.'
        using errcode = 'P0001',
              detail = 'supplier_collection_destination_mismatch',
              hint = json_build_object(
                       'supplier', v_supplier_name,
                       'destination', v_dest_name
                     )::text;
    end if;
  elsif v_po.procurement_partner_id is not null then
    raise exception 'A supplier that delivers its own goods has no collection partner.'
      using errcode = 'P0001',
            detail = 'pickup_partner_not_allowed',
            hint = json_build_object('supplier', v_supplier_name)::text;
  end if;

  return new;
end;
$fn$;

comment on function public.trg_po_supplier_collection_guard() is
  'Enforces the governed supplier collector and fixed destination on every PO writer. Deferred to end of transaction (0418) and re-reads the committed row rather than the inserted image (0419), because the governed writers set destination_id in a statement after the insert.';
