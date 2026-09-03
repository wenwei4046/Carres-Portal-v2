-- 0418_the_collection_guard_waits_for_the_destination
--
-- THE GUARD READ A FIELD THAT HAD NOT BEEN WRITTEN YET.
--
-- 0405 put `trg_po_supplier_collection_guard` on `purchase_orders` as an
-- IMMEDIATE `before insert or update` trigger. But `_operation_create_po_inner`
-- (0154/0382) does not set `destination_id` in its INSERT at all — the column
-- is not in its column list. Every governed writer therefore creates the row
-- first and sets the destination in a SECOND statement:
--
--     v_po_id := public._operation_create_po_inner(...);   -- INSERT, guard fires
--     update purchase_orders set destination_id = v_destination_id ...
--
-- (`purchasing_issue_pos_batch`, 0401 §598-611; the same shape in 0337, 0361,
-- 0380, 0398, 0399.) So the guard compared the supplier's governed destination
-- against a NULL, found them distinct, and raised
-- `supplier_collection_destination_mismatch` — before the statement that would
-- have made them agree could run.
--
-- MEASURED (YH, 2026-09-03, production). Ohana is `factory_pickup`, collected
-- by EU, fixed destination `Ohana`. SO-1205's Ohana line is issued with Deliver
-- To = `Ohana` — the correct value, and the API's own check at
-- `to-order.ts` passes it — and the database still refused. Nice Future on the
-- same order succeeded, because its fixed destination is the one the insert
-- happens to leave behind. The rule was not wrong; its TIMING was. No operator
-- could satisfy it, because the value it read was never one they could set.
--
-- THE FIX IS THE PATTERN THIS SCHEMA ALREADY USES. 0307 §5 met the identical
-- problem with `trg_po_units_follow_destination` — a trigger that had to see a
-- row after later statements finished it — and solved it with a DEFERRED
-- CONSTRAINT TRIGGER: "runs at end of transaction, by which time every line and
-- every unit is there — which is what makes 'in whatever order the fields were
-- set' literally true." The collection guard wants exactly that guarantee.
--
-- The rule itself is UNCHANGED. Same three refusals, same codes, same words.
-- It now reads the row the transaction actually committed to, instead of a
-- half-built one. A batch that violates the rule still rolls back whole.

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
begin
  /* The original trigger was `update of supplier_id, destination_id,
     procurement_partner_id`, so an unrelated write — a status change, an ETA
     correction — never re-opened a settled PO. A constraint trigger cannot
     carry a column list, so the same narrowing is done here by hand. Without
     it, changing Purchasing Settings would retroactively freeze every PO
     already issued under the old rule. */
  if tg_op = 'UPDATE'
     and new.supplier_id is not distinct from old.supplier_id
     and new.destination_id is not distinct from old.destination_id
     and new.procurement_partner_id is not distinct from old.procurement_partner_id
  then
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
      /* ⭐ THE REFUSAL CARRIES THE TWO NAMES (YH, 2026-09-03).
         `detail` alone reached the operator as "The supplier must be collected
         to its configured destination" — the factless fallback in
         `purchasingRefusal`, naming neither party, on a batch that may span
         several suppliers. The route cannot fill those names in itself: it
         reads `purchasing_supplier_settings` as the OPERATOR, and this trigger
         is `security definer`, so the rule can be invisible to the very code
         that has to explain it. So the names travel WITH the refusal, from the
         one reader that is guaranteed to see them. `hint` is JSON because a
         supplier called "NETS, Klang" would otherwise split a delimiter. */
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
  elsif new.procurement_partner_id is not null then
    raise exception 'A supplier that delivers its own goods has no collection partner.'
      using errcode = 'P0001', detail = 'pickup_partner_not_allowed';
  end if;

  return new;
end;
$fn$;

/* The immediate trigger goes; the deferred constraint trigger replaces it.
   Both names are dropped because a constraint trigger cannot be created over a
   plain trigger of the same name. */
drop trigger if exists trg_po_supplier_collection_guard on public.purchase_orders;

create constraint trigger trg_po_supplier_collection_guard
  after insert or update on public.purchase_orders
  deferrable initially deferred
  for each row execute function public.trg_po_supplier_collection_guard();

revoke all on function public.trg_po_supplier_collection_guard() from public;

comment on function public.trg_po_supplier_collection_guard() is
  'Enforces the governed supplier collector and fixed destination on every PO writer. Deferred to end of transaction (0418) because the governed writers set destination_id in a statement after the insert.';
