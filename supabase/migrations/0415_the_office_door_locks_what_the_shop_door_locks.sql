-- 0415_the_office_door_locks_what_the_shop_door_locks.sql
--
-- THREE AUDIT FINDINGS, ONE SENTENCE: the office save door writes fields that
-- no rule governs, and the evaluator meant to notice cannot see them.
-- F-11, F-12 and F-13.
--
-- ---- F-11 · THE PROMISED DATE HAS ONE DOOR, AND THIS IS NOT IT -------------
--
-- `sales_order_save_revision_unchecked_0354`'s write whitelist carries
-- `delivery_date` and `delivery_date_tbd`; `0391` guards `proceed_date` and
-- nothing else. So the office save door moves the date the customer was
-- promised, silently, with no request and no approval — while ATTRIBUTION, two
-- lines above it in the same function, is refused outright with
-- `attribution_by_request`.
--
-- The screen cannot do it: the delivery-date picker renders in CREATE mode
-- only, and an existing order shows a read-only fact with `Change delivery
-- date` beside it, which opens the amendment. This is a hole only a non-UI
-- caller can walk through.
--
-- ⭐ AND THE ONE SENTENCE THAT AUTHORISED IT HAS EXPIRED ON ITS OWN TERMS.
-- `docs/orders/MASTER.md` §1727 read: *"The Stage-3 amendment lane stays
-- walled; UNTIL IT LANDS, the governed path for a customer change is the SAVE
-- door."* It landed. `sales_order_submit_amendment` and
-- `sales_order_decide_amendment` ship (`0348`, `0354`), the route calls the
-- first at `operation/orders.ts:1884`, and `Change delivery date` is on the
-- card at `SalesOrderWorkspace.tsx:2283`. A conditional whose condition is
-- false is not a competing rule — it is a spent one, and it is deleted in this
-- PR rather than left to contradict §1336's *"read-only facts"*.
--
-- ---- F-12 · THE SHOP DOOR LOCKS AFTER PROCEED; THE OFFICE DOOR DID NOT -----
--
-- `update_order` (`0222`:88-103) refuses six delivery keys once the order is
-- `proceed_order` — the factory has started, so what the crew is walking into
-- may no longer move. `sales_order_save_revision` never tests status at all.
-- One rule, one company, two answers depending on which screen you use.
--
-- ⛔ AND IT MAY NOT BE COPIED AS WRITTEN. `0222` refuses on the KEY BEING
-- PRESENT (`p_payload ? 'delivery_floor'`). The office form posts its whole
-- header on every save — floor, lift and stair count included, unchanged — so
-- a presence test here would refuse every ordinary correction on every
-- proceeded order. Fixing a phone number would fail because the form also
-- mentioned a floor nobody touched.
--
-- So the office lock tests the VALUE. The ruling is served — delivery facts do
-- not move after Proceed — and a save that merely echoes them passes, which is
-- the only way this door can carry the rule at all.
--
-- ---- F-13 · THE FLOORS EVALUATOR WAS BLIND TO TEN FIELDS -------------------
--
-- `sales_order_floors` (`0328`) classifies a proposed change before any write.
-- It predates `0354`, which widened the save door, and knows none of:
-- `customer_race`, `customer_gender`, `customer_birthday`,
-- `customer_address_unknown`, `customer_billing_same`, `entry_fields`,
-- `delivery_stair_items`, `delivery_floor`, `delivery_has_lift`,
-- `proceed_date`. A change to any of them crosses no floor, raises no finding
-- and meets no freeze — the evaluator returns an empty answer, which reads
-- exactly like a clean one.
--
-- ⭐ THE CONCRETE FAILURE, and it got MORE reachable this week. GATE 7 freezes
-- contractual and attribution fields on a `delivered` or `cancelled` order.
-- The three stair inputs are not in that list, and the fee re-stamps whenever
-- they move — so changing the count on a DELIVERED order re-priced it with
-- nothing objecting. `0414` stops it being re-priced at the wrong RATE; this
-- stops it being re-priced at all once the goods are gone.
--
-- ---- HOW EACH FUNCTION IS CHANGED -----------------------------------------
--
-- `sales_order_save_revision` is already `0391`'s wrapper. Its two guards are
-- reproduced BYTE FOR BYTE below and two more are added beside them; it still
-- delegates to `sales_order_save_revision_unchecked_0354`, which is untouched.
--
-- `sales_order_floors` has exactly ONE definition and no wrapper, so it gets
-- the lane's pattern: renamed to `sales_order_floors_unchecked_0328` — body
-- preserved byte for byte, because a RENAME copies nothing — and a
-- same-signature wrapper that delegates and appends. It appends only: a BLOCK
-- for the frozen stair inputs, and the `severity: NONE` clearance `0328`
-- already emits for contact corrections, extended to the six identity fields.
-- No line of `0328`'s logic is retyped, which is the point of renaming rather
-- than rewriting.
--
-- No column, no table, no grant on a NEW object, no RLS policy moves.

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. The save door learns the two locks the shop door already had
-- ---------------------------------------------------------------------

create or replace function public.sales_order_save_revision(
  p_order_id uuid,
  p_header   jsonb default '{}'::jsonb,
  p_lines    jsonb default null,
  p_change   jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old        record;
  v_line       jsonb;
  v_attrs      jsonb;
  v_new_price  numeric;
  v_proceed    date;
  v_order      record;
begin
  -- 0391 · THE PROCEED LOCK. Runs before anything is written, so a refused
  -- save changes nothing.
  if p_header ? 'proceed_date' then
    select proceed_date into v_proceed
      from public.orders
     where id = p_order_id;

    if v_proceed is not null
       and nullif(p_header->>'proceed_date','')::date is distinct from v_proceed then
      raise exception 'The proceed date is already recorded and cannot be changed here'
        using errcode = '22023', detail = 'proceed_date_recorded';
    end if;
  end if;

  -- ── 0415 · THE TWO NEW LOCKS ────────────────────────────────────────────
  -- One read, reused by both. A save that changes nothing they guard never
  -- notices they are here.
  select status, delivery_date, delivery_date_tbd,
         delivery_floor, delivery_has_lift, delivery_stair_items
    into v_order
    from public.orders
   where id = p_order_id;

  -- F-11 · THE PROMISED DATE MOVES THROUGH THE AMENDMENT, NEVER HERE.
  -- Tested on the VALUE: the office form posts the header it holds, and a save
  -- that echoes today's date is not a change to it.
  if p_header ? 'delivery_date'
     and nullif(p_header->>'delivery_date','')::date is distinct from v_order.delivery_date then
    raise exception 'The promised delivery date is changed through the amendment, not here'
      using errcode = '22023', detail = 'promise_moves_by_amendment';
  end if;
  if p_header ? 'delivery_date_tbd'
     and coalesce((p_header->>'delivery_date_tbd')::boolean, false)
         is distinct from coalesce(v_order.delivery_date_tbd, false) then
    raise exception 'The promised delivery date is changed through the amendment, not here'
      using errcode = '22023', detail = 'promise_moves_by_amendment';
  end if;

  -- F-12 · DELIVERY FACTS FREEZE AFTER PROCEED — the same rule `0222` gives
  -- the shop door, by VALUE for the reason in this file's header.
  if v_order.status = 'proceed_order' then
    if (p_header ? 'delivery_floor'
        and nullif(p_header->>'delivery_floor','')::int is distinct from v_order.delivery_floor)
    or (p_header ? 'delivery_has_lift'
        and (p_header->>'delivery_has_lift')::boolean is distinct from v_order.delivery_has_lift)
    or (p_header ? 'delivery_stair_items'
        and nullif(p_header->>'delivery_stair_items','')::int
            is distinct from v_order.delivery_stair_items) then
      raise exception 'Delivery fields are locked after Proceed'
        using errcode = '22023', detail = 'proceed_locked_fields';
    end if;
  end if;

  -- 0385 · PROMO PARITY, reproduced verbatim. A header-only correction does
  -- not touch goods. When the complete line payload is supplied, every
  -- protected line must survive unchanged.
  if p_lines is not null then
    for v_old in
      select id, sku, qty, unit_price, attrs
        from public.order_lines
       where order_id = p_order_id
    loop
      v_attrs := coalesce(v_old.attrs, '{}'::jsonb);
      if v_attrs ?| array['free_gift', 'free_item', 'pwp', 'bundle_group', 'combo_key'] then
        v_line := null;
        select l into v_line
          from jsonb_array_elements(p_lines) as e(l)
         where nullif(l->>'id', '') is not null
           and (l->>'id')::uuid = v_old.id;

        if v_line is null then
          raise exception 'line % is not editable', v_old.id
            using errcode = '22023', detail = 'line_not_editable';
        end if;

        v_new_price := nullif(v_line->>'unit_price', '')::numeric;
        if trim(coalesce(v_line->>'sku', '')) is distinct from v_old.sku
           or nullif(v_line->>'qty', '')::int is distinct from v_old.qty
           or v_new_price is distinct from v_old.unit_price then
          raise exception 'line % is not editable', v_old.id
            using errcode = '22023', detail = 'line_not_editable';
        end if;
      end if;
    end loop;
  end if;

  return public.sales_order_save_revision_unchecked_0354(
    p_order_id, p_header, p_lines, p_change
  );
end;
$$;

comment on function public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb) is
  '0327 door; 0391 wrapper (proceed lock + 0385 promo parity); 0415 adds F-11 (the promised date moves through the amendment, never here) and F-12 (delivery floor/lift/stair count freeze after Proceed, the rule 0222 already gives update_order). Both test the VALUE, not the key: the office form posts its whole header on every save, so a presence test would refuse every ordinary correction. Delegates unchanged to sales_order_save_revision_unchecked_0354.';

-- ---------------------------------------------------------------------
-- 2. The floors evaluator is wrapped, not rewritten
-- ---------------------------------------------------------------------
-- A RENAME preserves the body byte for byte — nothing of 0328 is retyped, so
-- nothing of it can drift. Guarded so a re-run cannot rename the wrapper.

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sales_order_floors_unchecked_0328'
  ) then
    alter function public.sales_order_floors(uuid, text[], jsonb)
      rename to sales_order_floors_unchecked_0328;
  end if;
end $$;

-- ⛔ THE WRAPPER MAY NOT BE CREATED UNLESS THE RENAME HAPPENED, and this guard
-- is here because the first version of this file did not have it.
--
-- If the `create or replace` below ran while the rename had not, it would
-- OVERWRITE 0328's body with a wrapper that calls a function which does not
-- exist — and 0328's body would be gone, not renamed. Every Sales Order write
-- that consults the evaluator would then error, and the original could only be
-- recovered by re-running 0328.
--
-- Raising here makes that state unreachable: the statement aborts, the
-- transaction rolls back, and the database is left exactly as it was. Half of
-- this migration is worse than none of it, so there is no half.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sales_order_floors_unchecked_0328'
  ) then
    raise exception
      '0415 stopped before it could break the floors evaluator: sales_order_floors '
      'was not renamed to sales_order_floors_unchecked_0328, so the wrapper below '
      'would call a function that does not exist. Nothing has been changed. Check '
      'that public.sales_order_floors(uuid, text[], jsonb) exists, then run this '
      'file again as ONE statement so it commits or rolls back together.';
  end if;
end $$;

create or replace function public.sales_order_floors(
  p_order_id uuid,
  p_changed  text[],
  p_proposed_lines jsonb default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_base     jsonb;
  v_findings jsonb;
  v_status   text;
  v_frozen   text[];
  v_named    text[];
begin
  -- 0328 answers first, unchanged: its role check, its order read, its PO
  -- lineage, invoice and stage floors, and its contact clearance.
  v_base := public.sales_order_floors_unchecked_0328(p_order_id, p_changed, p_proposed_lines);
  v_findings := coalesce(v_base -> 'findings', '[]'::jsonb);

  select status into v_status from public.orders where id = p_order_id;

  -- 0415 · GATE 7 gains the three stair-carry inputs. The fee is
  -- `count x floors x rate` and re-stamps whenever they move, so leaving them
  -- out let a DELIVERED or CANCELLED order be re-priced with nothing objecting.
  if v_status in ('delivered', 'cancelled') then
    v_frozen := (select coalesce(array_agg(f), '{}') from unnest(p_changed) f
                  where f in ('delivery_floor','delivery_has_lift','delivery_stair_items'));
    if array_length(v_frozen, 1) > 0 then
      v_findings := v_findings || jsonb_build_object(
        'field', array_to_string(v_frozen, ','),
        'consequence', 'order_addons.STAIR_CARRY',
        'state', v_status,
        'severity', 'BLOCK',
        'evidence', 'GATE 7 (0415) — the order is ' || v_status ||
                    '; the stair-carry inputs price a stamped fee and are frozen with the ' ||
                    'other contractual fields.');
    end if;
  end if;

  -- 0415 · the six answers 0354 added join the contact clearance. They are
  -- corrections like the eleven 0328 already names — allowed, and now NAMED,
  -- so the evaluator stops reporting a change to them as no change at all.
  v_named := (select coalesce(array_agg(f), '{}') from unnest(p_changed) f
               where f in ('customer_race','customer_gender','customer_birthday',
                           'customer_address_unknown','customer_billing_same',
                           'entry_fields'));
  if array_length(v_named, 1) > 0 then
    v_findings := v_findings || jsonb_build_object(
      'field', array_to_string(v_named, ','),
      'consequence', 'none',
      'state', '',
      'severity', 'NONE',
      'evidence', 'Identity and entry-form corrections carry no downstream consequence ' ||
                  '(GATE 6, extended to the 0354 fields by 0415).');
  end if;

  return jsonb_set(v_base, '{findings}', v_findings);
end $$;

revoke all on function public.sales_order_floors(uuid, text[], jsonb) from public;
grant execute on function public.sales_order_floors(uuid, text[], jsonb) to authenticated;
revoke all on function public.sales_order_floors_unchecked_0328(uuid, text[], jsonb) from public;
grant execute on function public.sales_order_floors_unchecked_0328(uuid, text[], jsonb) to authenticated;

comment on function public.sales_order_floors(uuid, text[], jsonb) is
  '0328''s evaluator, wrapped by 0415. Delegates to sales_order_floors_unchecked_0328 (0328''s body, renamed, unretyped) and appends two findings: a BLOCK on the stair-carry inputs of a delivered/cancelled order, and 0328''s own NONE clearance extended to the six fields 0354 added.';

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('sales_order_floors','sales_order_floors_unchecked_0328')
--    order by 1;
--   -- EXPECT: both rows. Only one = the rename did not happen.
--
--   select prosrc like '%promise_moves_by_amendment%' as f11,
--          prosrc like '%proceed_locked_fields%'      as f12
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'sales_order_save_revision';
--   -- EXPECT: true, true. Both false = this migration never ran.
--
--   -- ⭐ THE ONE THAT WOULD HURT IF IT WERE WRONG — an ordinary correction on
--   -- a PROCEEDED order must still pass. The form posts the whole header,
--   -- floor and all, unchanged:
--   --   begin;
--   --   select sales_order_save_revision('<a proceed_order id>',
--   --     jsonb_build_object(
--   --       'customer_phone','012-3456789',
--   --       'delivery_floor',(select delivery_floor from orders where id='<id>')));
--   --   -- EXPECT: succeeds. A refusal means the lock reads the KEY, not the
--   --   -- VALUE, and every correction on every proceeded order is broken.
--   --   rollback;
--
--   -- NEGATIVE CONTROL — actually moving the floor on the same order:
--   --   begin;
--   --   select sales_order_save_revision('<the same id>', '{"delivery_floor": 3}'::jsonb);
--   --   -- EXPECT: ERROR (proceed_locked_fields)
--   --   rollback;
