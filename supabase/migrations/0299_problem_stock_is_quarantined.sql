-- =============================================================================
-- 0299_problem_stock_is_quarantined.sql — R4 of the receiving & claim queue
-- =============================================================================
-- Card R4 (docs/receiving-claim-execution-queue.md, locked with Jess 2026-07-27):
-- "damaged/wrong units flip to `on_hold` (with reason) so they can never be
--  allocated, reserved, or delivered; goods physically sent back flip to
--  `returned_to_supplier`; claim resolution flips them back to free (or writes
--  them off)."
-- ALREADY EXISTS: ops_stock_items per-unit statuses — ADD statuses to the
-- existing machine, never a parallel table.
-- Done when: **a held unit is invisible to every sell/reserve/deliver path,
-- provably.**
--
-- ── What was actually wrong ─────────────────────────────────────────────────
-- A PO mints one `incoming` unit per ordered piece (0153/0154) and the receive
-- flips the good ones to `free`. R1 (0284) deliberately did NOT receive a
-- damaged or wrong unit — "that is also why R4 will have something to
-- quarantine and nothing to un-book". What it left behind is a unit stuck at
-- `incoming` forever, and `incoming` is not a neutral parking space:
-- `reorder-alert.ts` and `ready-stock-plan.ts` both read it as "ordered, on the
-- way". So a unit sitting BROKEN in our own warehouse was being counted as a
-- future arrival that will never come, and the reorder engine under-ordered by
-- exactly that many. This migration gives those units a status that tells the
-- truth.
--
-- What this does:
--   1. THREE new statuses on the existing machine: `on_hold` ·
--      `returned_to_supplier` · `written_off`, plus the columns that say why a
--      unit is held, under which claim, and when the hold ended.
--   2. `ops_stock_hold_transition_guard` — the done-when, as a property of the
--      TABLE rather than of one function (see below).
--   3. `operation_receive_po_with_do` (4th revision) quarantines the damaged /
--      wrong units it just raised a claim for, and mints replacement units when
--      a later DO makes good on them.
--   4. `ops_stock_resolve_hold(claim, outcome, note)` — the three ways a hold
--      ends, one transaction each.
--
-- ── Why the guard is a DESTINATION rule and not a caller check ──────────────
-- `ops_stock_items` carries a blanket `FOR ALL TO authenticated USING
-- (is_internal())` policy, and live code updates `status` through PostgREST in
-- three places (the sofa-loan claim, its rollback, the loan return). A rule
-- that only lived inside an RPC would be a rule one PostgREST call walks
-- around, and revoking column-level UPDATE would break the sofa-loan flow —
-- which is a different card's machinery.
--
-- So the guard never asks WHO is writing. It constrains WHERE a held unit may
-- go: `free`, `returned_to_supplier` or `written_off`, and nothing else. The
-- three states every sell / reserve / deliver path actually writes —
-- `reserved`, `sold`, `transferred` — are unreachable from `on_hold` no matter
-- who tries or through which door. That is the card's "provably", held by the
-- table itself. The read side needs no change at all, because every one of
-- those paths already filters on `status = 'free'` (or `IN ('free','reserved')`
-- for takeout, whose second value is a unit already drawn from this same pool);
-- `ops_rollup_stock_balances` counts only `free` + `reserved`, so a held unit is
-- absent from the aggregate ledger the whole logistics reserve machine runs on.
--
-- Deliberate design decisions (each one is load-bearing):
--
--   * **A hold is created by RECEIVING and by nothing else** — the guard allows
--     `incoming → on_hold` and no other entry. A unit already in the pool that
--     is later found damaged has its own machine (`needs_repair` + condition,
--     the Defective view); a second quarantine concept competing with it would
--     give the warehouse two ways to say one thing, and let a held unit be
--     "refurbished" back into the pool without the claim ever being answered.
--   * **`returned_to_supplier` and `written_off` are TERMINAL.** Goods that
--     physically left do not come back; a replacement is a new delivery of a new
--     unit, which is exactly what the line's pending qty is already asking for.
--   * **A held unit cannot be DELETED.** `DELETE /api/ops/stock/:itemId` is a
--     hard delete meant for a mis-keyed row; used on a held unit it would erase
--     the physical evidence an open claim is chasing.
--   * **A write-off must carry a note.** Destroying a unit we paid for is the
--     one outcome that leaves no other trace of why. The other two describe
--     themselves, and are NOT made to demand one — a mandatory box people must
--     fill to proceed gets filled with "." (0291's rule, same reasoning).
--   * **`back_to_stock` does NOT touch the PO line.** `received_qty` means
--     "good units this supplier delivered against this line", and a unit we
--     quarantined and then decided to keep was not delivered good — the damage
--     happened, `damaged_qty` records it (R1: the issue counters ACCUMULATE),
--     and whether the supplier is still on the hook is settled by the CLAIM's
--     answer, not by a stock move. It DOES write a `stock_movements` row and
--     re-roll `stock_balances`, because the goods genuinely enter sellable stock
--     at that moment and In & out must be able to say when. Consequence,
--     reported not hidden: a PO whose shortfall was closed by a release rather
--     than by a replacement delivery stays `open`. That is pre-existing R1
--     behaviour (only the receive RPC ever closes a PO), not something R4
--     introduces, and it is filed as a carry-forward.
--   * **The receive now MINTS the shortfall.** With the damaged units held
--     rather than left `incoming`, a replacement DO finds nothing to flip: the
--     old `update … where status='incoming' limit v_delta` would move 0 rows
--     while `stock_balances` gained 2, and the next rollup would silently take
--     them straight back off again. (Before R4 the same line did something
--     worse but count-correct: it freed the BROKEN units, because they were the
--     only `incoming` ones left.) Own warehouses only — the same `kind = 'own'`
--     condition the PO mint uses, so a partner warehouse keeps having no
--     per-unit register rather than growing one by accident.
--   * **A claim on a non-own warehouse holds 0 units and does not fail.** The
--     per-unit register is Carres-owned scope; the claim is still the chase.
--     `units_held` in the receive payload says what really happened.
--
-- Live state when this was written: **87 ops_stock_items, ALL `free`; 0 purchase
-- orders, 0 PO lines, 0 supplier claims.** So no row can violate the new
-- constraints, nothing is backfilled, and the first held unit will be created by
-- the first receive that finds a problem. Verified in a rolled-back transaction
-- against live before apply.
-- =============================================================================

set search_path = public;

-- ── 1 · the statuses and the hold's own columns ──────────────────────────────

alter table public.ops_stock_items
  drop constraint if exists ops_stock_items_status_check;

alter table public.ops_stock_items
  add constraint ops_stock_items_status_check
  check (status in ('incoming','free','reserved','sold','transferred','voided',
                    'on_hold','returned_to_supplier','written_off'));

alter table public.ops_stock_items
  add column if not exists hold_reason       text,
  add column if not exists hold_claim_id     uuid references public.supplier_claims(id) on delete set null,
  add column if not exists held_at           timestamptz,
  add column if not exists hold_released_at  timestamptz,
  add column if not exists hold_release_note text;

comment on column public.ops_stock_items.hold_reason is
  'R4 (0299): why receiving quarantined this unit — damaged | wrong_item. R2''s disjoint domains, kept disjoint: a unit belongs to exactly one bucket and can never be counted under both.';
comment on column public.ops_stock_items.hold_claim_id is
  'R4 (0299): the supplier claim chasing this unit. ON DELETE SET NULL — a claim can vanish with its PO, but the physical unit and its hold must not.';
comment on column public.ops_stock_items.hold_released_at is
  'R4 (0299): when the hold ended. The stamps SURVIVE the release, so a unit put back in stock still remembers it once arrived damaged — that history is what R5''s damage rate reads.';

alter table public.ops_stock_items
  drop constraint if exists ops_stock_items_hold_reason_valid,
  drop constraint if exists ops_stock_items_hold_stamped,
  drop constraint if exists ops_stock_items_held_needs_reason,
  drop constraint if exists ops_stock_items_release_needs_hold,
  drop constraint if exists ops_stock_items_write_off_needs_words;

alter table public.ops_stock_items
  add constraint ops_stock_items_hold_reason_valid
    check (hold_reason is null or hold_reason in ('damaged','wrong_item')),
  -- A recorded hold always carries its date; a date with no reason is a hold
  -- nobody can read.
  add constraint ops_stock_items_hold_stamped
    check ((hold_reason is null) = (held_at is null)),
  -- The card's "(with reason)", as a thing the table will not store otherwise.
  add constraint ops_stock_items_held_needs_reason
    check (status <> 'on_hold' or hold_reason is not null),
  -- You cannot end a hold that never began.
  add constraint ops_stock_items_release_needs_hold
    check (hold_released_at is null or hold_reason is not null),
  -- A unit destroyed with no words is a record that says nothing.
  add constraint ops_stock_items_write_off_needs_words
    check (status <> 'written_off'
           or length(btrim(coalesce(hold_release_note, ''))) > 0);

create index if not exists ops_stock_items_hold_claim_idx
  on public.ops_stock_items (hold_claim_id)
  where hold_claim_id is not null;
create index if not exists ops_stock_items_on_hold_idx
  on public.ops_stock_items (sku)
  where status = 'on_hold';

-- ── 2 · the guard ────────────────────────────────────────────────────────────
--
-- THE DONE-WHEN. See the header for why this is a destination rule rather than
-- a caller check. It fires on every door — RPC, PostgREST, a hand-run UPDATE in
-- a SQL console — because it asks only where the row is going.

create or replace function public.ops_stock_hold_transition_guard()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status = 'on_hold' then
      raise exception
        'unit % is on hold under an open supplier claim and cannot be deleted', old.id
        using errcode = 'P0001', detail = 'held_unit_not_deletable';
    end if;
    return old;
  end if;

  if new.status is distinct from old.status then
    -- Leaving quarantine: three ways out, and none of them sells the unit.
    if old.status = 'on_hold'
       and new.status not in ('free','returned_to_supplier','written_off') then
      raise exception
        'unit % is on hold: it cannot become %, only free, returned_to_supplier or written_off',
        old.id, new.status
        using errcode = 'P0001', detail = 'held_unit_not_available';
    end if;

    -- Goods that physically left do not come back.
    if old.status in ('returned_to_supplier','written_off') then
      raise exception
        'unit % already left as % — a replacement is a new unit, not this one',
        old.id, old.status
        using errcode = 'P0001', detail = 'terminal_unit_status';
    end if;

    -- Entering quarantine: receiving is the only door. A unit already in the
    -- pool that turns out to be damaged belongs to needs_repair, not here.
    if new.status = 'on_hold' and old.status <> 'incoming' then
      raise exception
        'only an arriving unit can be put on hold (unit % is %)', old.id, old.status
        using errcode = 'P0001', detail = 'hold_only_from_incoming';
    end if;
  end if;

  return new;
end;
$fn$;

comment on function public.ops_stock_hold_transition_guard() is
  'R4 (0299): the card''s "a held unit is invisible to every sell/reserve/deliver path, provably". Asks WHERE a unit is going, never WHO is writing — so it holds against PostgREST and a hand-run UPDATE, not only against the RPC.';

drop trigger if exists ops_stock_hold_transitions on public.ops_stock_items;
create trigger ops_stock_hold_transitions
  before update or delete on public.ops_stock_items
  for each row execute function public.ops_stock_hold_transition_guard();

-- ── 3 · receiving quarantines what it just claimed ───────────────────────────
--
-- Identical to the live 0288 body except for the two blocks marked R4. Same
-- signature, same role gate, same claim minting, same thread / reserve
-- behaviour.

create or replace function public.operation_receive_po_with_do(
  p_po_id        text,
  p_do_file_path text,
  p_do_number    text,
  p_lines        jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_po                 purchase_orders;
  v_role               app_role;
  v_uid                uuid;
  v_actor              text;
  v_was_relocated      boolean;
  v_is_own             boolean := false;
  v_supplier_name      text;
  v_line               jsonb;
  v_line_id            uuid;
  v_received_qty       int;
  v_damaged_add        int;
  v_wrong_add          int;
  v_damaged_total      int := 0;
  v_wrong_total        int := 0;
  v_claims_created     int := 0;
  v_damaged_claim      uuid;
  v_wrong_claim        uuid;
  v_category           text;
  v_wrong_type         text;
  v_photos             jsonb;
  v_existing_line      purchase_order_lines;
  v_sku                text;
  v_delta              int;
  v_freed              int;
  v_minted             int;
  v_held               int;
  v_units_held         int := 0;
  v_lines_updated      int := 0;
  v_thread             record;
  v_target_thread_stage operation_stage;
  v_target_sup_status  po_sup_status;
  v_threads_advanced   int := 0;
  v_reserve            record;
  v_thread_satisfied   boolean;
  v_outstanding        int;
begin
  if p_po_id is null or length(btrim(p_po_id)) = 0 then
    raise exception 'p_po_id required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_file_path is null or length(btrim(p_do_file_path)) = 0 then
    raise exception 'p_do_file_path required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_number is null or length(btrim(p_do_number)) = 0 then
    raise exception 'p_do_number required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines required (at least one line)' using errcode = '22023', detail = 'invalid_input';
  end if;

  v_uid  := auth.uid();
  v_role := public.app_role();

  if v_role not in ('operation', 'principal', 'partner') then
    raise exception 'forbidden: only logistics/principal/partner can receive POs'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_role = 'partner' then
    select * into v_po from purchase_orders
     where id = p_po_id and procurement_partner_id = public.app_partner_id()
     for update;
  else
    select * into v_po from purchase_orders where id = p_po_id for update;
  end if;
  if not found then
    raise exception 'PO not found or not assigned to caller'
      using errcode = '42501', detail = 'po_not_found_or_cross_tenant';
  end if;

  if v_po.status = 'received' then
    raise exception 'PO already fully received'
      using errcode = '22023', detail = 'already_received';
  end if;

  v_was_relocated := v_po.sup_status = 'relocated';
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  -- R4: the per-unit register is Carres-owned scope (0154's rule, read the same
  -- way here as at PO-open so the two cannot drift).
  select (kind = 'own') into v_is_own from warehouses where id = v_po.warehouse_id;
  v_is_own := coalesce(v_is_own, false);
  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_received_qty := nullif(v_line->>'received_qty', '')::int;
    -- R1: what THIS delivery found wrong. Absent = 0, so a pre-R1 caller
    -- behaves exactly as before.
    v_damaged_add := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong_add   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);
    v_damaged_claim := null;
    v_wrong_claim   := null;

    if v_line_id is null or v_received_qty is null or v_received_qty < 0 then
      raise exception 'invalid line: id=%, received_qty=%', v_line_id, v_received_qty
        using errcode = '22023', detail = 'invalid_line';
    end if;
    if v_damaged_add < 0 or v_wrong_add < 0 then
      raise exception 'invalid line: damaged_qty=%, wrong_item_qty=%', v_damaged_add, v_wrong_add
        using errcode = '22023', detail = 'invalid_line';
    end if;

    select * into v_existing_line from purchase_order_lines
     where id = v_line_id and po_id = p_po_id for update;
    if not found then
      raise exception 'PO line not found for id=%', v_line_id using errcode = '42P01', detail = 'po_line_not_found';
    end if;

    v_sku := v_existing_line.sku;

    if v_received_qty > v_existing_line.qty then
      raise exception 'over-received: % > ordered %', v_received_qty, v_existing_line.qty
        using errcode = 'P0001', detail = 'over_received';
    end if;

    -- R1: one delivery may never account for more units than the line still
    -- owes. NOTE this is deliberately per-DO, not cumulative — a line ordered
    -- 10 can record 10 damaged and later 10 received once they are replaced.
    if v_received_qty + v_damaged_add + v_wrong_add > v_existing_line.qty then
      raise exception 'reported % units on a line of % (received % + damaged % + wrong %)',
                      v_received_qty + v_damaged_add + v_wrong_add, v_existing_line.qty,
                      v_received_qty, v_damaged_add, v_wrong_add
        using errcode = 'P0001', detail = 'report_exceeds_ordered';
    end if;

    v_delta := v_received_qty - v_existing_line.received_qty;
    if v_delta < 0 then
      raise exception 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        using errcode = 'P0001', detail = 'received_qty_decrease';
    end if;

    -- R2: the problem becomes a CASE — before the counters move, because the
    -- guard trigger checks the counters against the claims that exist.
    if v_damaged_add > 0 or v_wrong_add > 0 then
      v_category := public.claim_product_category(v_sku);
    end if;

    if v_damaged_add > 0 then
      v_photos := public.supplier_claim_photo_entries(v_line->'damaged_photos', v_uid);
      if jsonb_array_length(v_photos) = 0 then
        raise exception 'damaged units on % need at least one photo', v_sku
          using errcode = 'P0001', detail = 'claim_evidence_required';
      end if;
      insert into supplier_claims (
        po_id, po_line_id, supplier_id, sku, product_category,
        claim_type, qty, do_number, photos, reported_by
      ) values (
        p_po_id, v_line_id, v_po.supplier_id, v_sku, v_category,
        'damaged', v_damaged_add, btrim(p_do_number), v_photos, v_uid
      )
      returning id into v_damaged_claim;
      v_claims_created := v_claims_created + 1;
    end if;

    if v_wrong_add > 0 then
      v_wrong_type := nullif(btrim(coalesce(v_line->>'wrong_item_claim_type', '')), '');
      if v_wrong_type is null then
        raise exception 'wrong-item units on % need a claim type', v_sku
          using errcode = 'P0001', detail = 'claim_type_required';
      end if;
      if not public.supplier_claim_type_allowed(v_category, v_wrong_type) then
        raise exception 'claim type % is not offered for a % item', v_wrong_type, v_category
          using errcode = 'P0001', detail = 'claim_type_invalid';
      end if;
      v_photos := public.supplier_claim_photo_entries(v_line->'wrong_item_photos', v_uid);
      if jsonb_array_length(v_photos) = 0 then
        raise exception 'wrong-item units on % need at least one photo', v_sku
          using errcode = 'P0001', detail = 'claim_evidence_required';
      end if;
      insert into supplier_claims (
        po_id, po_line_id, supplier_id, sku, product_category,
        claim_type, qty, do_number, photos, reported_by
      ) values (
        p_po_id, v_line_id, v_po.supplier_id, v_sku, v_category,
        v_wrong_type, v_wrong_add, btrim(p_do_number), v_photos, v_uid
      )
      returning id into v_wrong_claim;
      v_claims_created := v_claims_created + 1;
    end if;

    -- R1: the issue counters ACCUMULATE; received_qty keeps new-total semantics.
    update purchase_order_lines
       set received_qty   = v_received_qty,
           damaged_qty    = damaged_qty + v_damaged_add,
           wrong_item_qty = wrong_item_qty + v_wrong_add
     where id = v_line_id;

    v_damaged_total := v_damaged_total + v_damaged_add;
    v_wrong_total   := v_wrong_total + v_wrong_add;

    if v_delta > 0 then
      insert into stock_balances (sku, warehouse_id, qty)
        values (v_sku, v_po.warehouse_id, v_delta)
        on conflict (sku, warehouse_id)
        do update set qty = stock_balances.qty + v_delta, updated_at = now();

      insert into stock_movements (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
      values (v_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, v_role, v_uid);

      with freed as (
        update ops_stock_items
           set status = 'free', updated_at = now()
         where id in (
           select id from ops_stock_items
            where po_no = p_po_id and sku = v_sku and status = 'incoming'
            order by created_at
            limit v_delta
         )
        returning 1
      )
      select count(*) into v_freed from freed;

      -- R4: a REPLACEMENT delivery has no `incoming` unit left to flip — the
      -- units this line minted at PO-open were used up by the first DO and by
      -- the hold. The goods are physically here, so mint the shortfall as new
      -- free units. Own warehouses only, the same condition the PO mint uses:
      -- a partner warehouse keeps having no per-unit register rather than
      -- growing one by accident. Without this the register silently drifts
      -- BELOW stock_balances and the next rollup takes the units back off.
      v_minted := 0;
      if v_is_own and v_freed < v_delta then
        insert into ops_stock_items
          (unit_code, sku, warehouse_id, status, supplier, po_no, source_ref, date_in)
        select public.gen_unit_code(), v_sku, v_po.warehouse_id, 'free',
               v_supplier_name, p_po_id, btrim(p_do_number), current_date
          from generate_series(1, v_delta - v_freed);
        v_minted := v_delta - v_freed;
      end if;

      v_lines_updated := v_lines_updated + 1;
    end if;

    -- R4: quarantine what we just raised a claim for. AFTER the free-flip, so
    -- the good units are taken first and the hold gets what is left — the
    -- physical units the operator set aside.
    if v_damaged_claim is not null then
      with held as (
        update ops_stock_items
           set status        = 'on_hold',
               hold_reason   = 'damaged',
               hold_claim_id = v_damaged_claim,
               held_at       = now(),
               updated_at    = now()
         where id in (
           select id from ops_stock_items
            where po_no = p_po_id and sku = v_sku and status = 'incoming'
            order by created_at
            limit v_damaged_add
         )
        returning 1
      )
      select count(*) into v_held from held;
      v_units_held := v_units_held + v_held;
    end if;

    if v_wrong_claim is not null then
      with held as (
        update ops_stock_items
           set status        = 'on_hold',
               hold_reason   = 'wrong_item',
               hold_claim_id = v_wrong_claim,
               held_at       = now(),
               updated_at    = now()
         where id in (
           select id from ops_stock_items
            where po_no = p_po_id and sku = v_sku and status = 'incoming'
            order by created_at
            limit v_wrong_add
         )
        returning 1
      )
      select count(*) into v_held from held;
      v_units_held := v_units_held + v_held;
    end if;
  end loop;

  for v_thread in
    select * from order_supplier_threads
     where po_id = p_po_id and operation_stage = 'in_production'
  loop
    select coalesce(bool_and(pol.received_qty >= pol.qty), true)
      into v_thread_satisfied
      from order_lines ol
      join product_skus ps on ps.sku = ol.sku
      join product_models pm on pm.id = ps.model_id
      left join purchase_order_lines pol
        on pol.po_id = p_po_id and pol.sku = ol.sku
     where ol.order_id = v_thread.order_id
       and ps.supplier_id = v_thread.supplier_id
       and pm.category::text = v_thread.category;

    if not v_thread_satisfied then
      continue;
    end if;

    if v_was_relocated then
      v_target_thread_stage := 'waiting';
    else
      v_target_thread_stage := case when v_thread.sop_name = 'SOFA_SPECIAL'
                                    then 'dispatched'
                                    else 'ready_to_dispatch'
                               end;
    end if;

    update order_supplier_threads
       set operation_stage = v_target_thread_stage,
           warehouse_id    = v_po.warehouse_id,
           reserved_at     = now(),
           updated_at      = now()
     where id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    for v_reserve in
      select ol.sku as sku, ol.qty as qty
        from order_lines ol
        join product_skus ps on ps.sku = ol.sku
        join product_models pm on pm.id = ps.model_id
       where ol.order_id = v_thread.order_id
         and ps.supplier_id = v_thread.supplier_id
         and pm.category::text = v_thread.category
    loop
      begin
        update stock_balances
           set reserved   = reserved + v_reserve.qty, updated_at = now()
         where sku = v_reserve.sku and warehouse_id = v_po.warehouse_id;
        if not found then
          raise exception 'no stock_balances row for sku=% wh=%', v_reserve.sku, v_po.warehouse_id
            using errcode = 'P0001', detail = 'insufficient_stock_for_reserve';
        end if;
      exception
        when check_violation then
          raise exception 'cannot reserve sku=% at wh=% (qty < reserved + %)',
                          v_reserve.sku, v_po.warehouse_id, v_reserve.qty
            using errcode = 'P0001', detail = 'insufficient_stock_for_reserve';
      end;
    end loop;
  end loop;

  select count(*) into v_outstanding
    from purchase_order_lines where po_id = p_po_id and received_qty < qty;

  if v_outstanding = 0 then
    if v_was_relocated then
      v_target_sup_status := 'at_warehouse_waiting';
    else
      v_target_sup_status := 'delivered';
    end if;

    update purchase_orders
       set status         = 'received',
           sup_status     = v_target_sup_status,
           do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  else
    update purchase_orders
       set do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  end if;

  insert into po_history (po_id, text, by_role)
  values (p_po_id,
          format('Received with DO %s (%s path) — %s line(s), %s thread(s)%s',
                 btrim(p_do_number),
                 case when v_was_relocated then 'relocated→at_warehouse_waiting' else 'normal→delivered' end,
                 v_lines_updated, v_threads_advanced,
                 case when v_damaged_total + v_wrong_total > 0
                      then format(' · issue: %s damaged, %s wrong item · %s supplier claim(s) opened · %s unit(s) on hold',
                                  v_damaged_total, v_wrong_total, v_claims_created, v_units_held)
                      else '' end),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Received PO %s with DO %s', p_po_id, btrim(p_do_number)), p_po_id);

  return jsonb_build_object(
    'po_id',             p_po_id,
    'do_file_path',      p_do_file_path,
    'do_number',         btrim(p_do_number),
    'lines_updated',     v_lines_updated,
    'threads_advanced',  v_threads_advanced,
    'po_status',         (select status from purchase_orders where id = p_po_id),
    'sup_status',        (select sup_status from purchase_orders where id = p_po_id),
    'was_relocated',     v_was_relocated,
    'damaged_qty',       v_damaged_total,
    'wrong_item_qty',    v_wrong_total,
    'claims_created',    v_claims_created,
    'units_held',        v_units_held
  );
end;
$fn$;

grant execute on function public.operation_receive_po_with_do(text, text, text, jsonb) to authenticated;

-- ── 4 · how a hold ends ──────────────────────────────────────────────────────
--
-- One RPC, three outcomes, one transaction each. Resolves EVERY unit still held
-- under the claim: the units of one claim are one problem, one supplier answer
-- and one physical decision. A per-unit split can be added when a real case
-- needs one; inventing the UI for it now would be building for a case nobody
-- has met.

create or replace function public.ops_stock_resolve_hold(
  p_claim_id uuid,
  p_outcome  text,
  p_note     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    app_role;
  v_uid     uuid;
  v_actor   text;
  v_claim   supplier_claims;
  v_outcome text;
  v_note    text;
  v_status  text;
  v_units   int := 0;
  v_moved   jsonb;
  v_row     jsonb;
begin
  v_role := public.app_role();
  -- 0266's lesson: `not in` on a NULL is NULL, so the gate is written to fail
  -- closed rather than to fall through.
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can resolve held stock'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  v_outcome := nullif(btrim(coalesce(p_outcome, '')), '');
  v_note    := nullif(btrim(coalesce(p_note, '')), '');

  if p_claim_id is null or v_outcome is null then
    raise exception 'p_claim_id and p_outcome are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if v_outcome not in ('back_to_stock','returned','written_off') then
    raise exception '% is not one of the three ways a hold ends', v_outcome
      using errcode = 'P0001', detail = 'outcome_invalid';
  end if;
  -- Mirrors `holdOutcomeNeedsNote` in packages/shared/src/stock-hold.ts.
  if v_outcome = 'written_off' and v_note is null then
    raise exception 'a write-off must say why the units were destroyed'
      using errcode = 'P0001', detail = 'note_required';
  end if;

  select * into v_claim from supplier_claims where id = p_claim_id;
  if not found then
    raise exception 'claim not found' using errcode = '42P01', detail = 'claim_not_found';
  end if;

  v_status := case v_outcome
                when 'back_to_stock' then 'free'
                when 'returned'      then 'returned_to_supplier'
                else 'written_off'
              end;

  -- Lock the held units before deciding anything about them: two operators on
  -- the same claim must not both believe they moved the same two pieces.
  perform 1 from ops_stock_items
   where hold_claim_id = p_claim_id and status = 'on_hold'
   for update;

  select count(*) into v_units
    from ops_stock_items
   where hold_claim_id = p_claim_id and status = 'on_hold';

  if v_units = 0 then
    raise exception 'claim % has no units on hold', v_claim.claim_no
      using errcode = 'P0001', detail = 'no_held_units';
  end if;

  -- The units MOVED BY THIS CALL, taken from the update's own RETURNING rather
  -- than re-read afterwards: re-reading "the claim's free units" would also
  -- sweep up units an earlier release had already put back, and count them
  -- into stock twice.
  with moved as (
    update ops_stock_items
       set status            = v_status,
           -- The hold's own stamps SURVIVE: a unit put back in stock still
           -- remembers that it arrived damaged.
           hold_released_at  = now(),
           hold_release_note = v_note,
           updated_at        = now()
     where hold_claim_id = p_claim_id and status = 'on_hold'
    returning sku, warehouse_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('sku', g.sku, 'wh', g.warehouse_id, 'n', g.n)),
                  '[]'::jsonb)
    into v_moved
    from (select sku, warehouse_id, count(*)::int as n
            from moved group by sku, warehouse_id) g;

  -- Only `back_to_stock` puts goods into sellable stock, so only it moves the
  -- ledger. A returned or written-off unit was never counted in
  -- `stock_balances` (the rollup reads free + reserved only), so there is
  -- nothing to take out — writing an 'out' movement for it would invent a
  -- departure from a shelf the unit never sat on.
  if v_outcome = 'back_to_stock' then
    for v_row in select * from jsonb_array_elements(v_moved) loop
      insert into stock_movements (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
      values (v_row->>'sku', (v_row->>'wh')::uuid, (v_row->>'n')::int, 'in',
              v_claim.claim_no, v_role, v_uid);
      perform public.ops_rollup_stock_balances((v_row->>'wh')::uuid);
    end loop;
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_claim.po_id,
          format('Claim %s — %s unit(s) %s%s', v_claim.claim_no, v_units,
                 case v_outcome
                   when 'back_to_stock' then 'put back in stock'
                   when 'returned'      then 'returned to ' ||
                        coalesce((select name from suppliers where id = v_claim.supplier_id), 'supplier')
                   else 'written off'
                 end,
                 case when v_note is null then '' else format(' (%s)', v_note) end),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Held stock resolved · %s · %s unit(s) · %s',
                 v_claim.claim_no, v_units, v_outcome),
          v_claim.claim_no);

  return jsonb_build_object(
    'claim_no', v_claim.claim_no,
    'outcome',  v_outcome,
    'status',   v_status,
    'units',    v_units
  );
end;
$fn$;

revoke execute on function public.ops_stock_resolve_hold(uuid, text, text) from public;
revoke execute on function public.ops_stock_resolve_hold(uuid, text, text) from anon;
grant execute on function public.ops_stock_resolve_hold(uuid, text, text) to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────

do $$
declare
  v_copies int;
  v_ok     boolean;
  v_name   text;
  v_def    text;
begin
  -- EXACTLY one copy of every function touched, checked per NAME (0291's rule:
  -- a function that failed to create produces no group at all).
  foreach v_name in array array['operation_receive_po_with_do',
                                'ops_stock_resolve_hold',
                                'ops_stock_hold_transition_guard']
  loop
    select count(*) into v_copies
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;
    if v_copies <> 1 then
      raise exception 'sanity: % copies of %', v_copies, v_name;
    end if;
  end loop;

  -- The three new statuses are storable and the old six survive.
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.ops_stock_items'::regclass
     and conname  = 'ops_stock_items_status_check';
  foreach v_name in array array['incoming','free','reserved','sold','transferred',
                                'voided','on_hold','returned_to_supplier','written_off']
  loop
    if position('''' || v_name || '''' in v_def) = 0 then
      raise exception 'sanity: status % is not accepted by the CHECK', v_name;
    end if;
  end loop;

  -- The hold constraints are installed.
  select count(*) into v_copies
    from pg_constraint
   where conrelid = 'public.ops_stock_items'::regclass
     and conname in ('ops_stock_items_hold_reason_valid',
                     'ops_stock_items_hold_stamped',
                     'ops_stock_items_held_needs_reason',
                     'ops_stock_items_release_needs_hold',
                     'ops_stock_items_write_off_needs_words');
  if v_copies <> 5 then
    raise exception 'sanity: expected 5 hold constraints, found %', v_copies;
  end if;

  -- The guard is armed on BOTH events. A trigger that only fired on UPDATE
  -- would leave the hard-delete door open, which is half the point of it.
  select count(*) into v_copies
    from pg_trigger
   where tgrelid = 'public.ops_stock_items'::regclass
     and tgname  = 'ops_stock_hold_transitions'
     and not tgisinternal;
  if v_copies <> 1 then
    raise exception 'sanity: the hold guard trigger is not installed';
  end if;

  -- R2's guard is still armed — R4 rewrote the receive RPC and must not have
  -- disturbed it.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.purchase_order_lines'::regclass
                    and tgname = 'po_line_issue_requires_claim'
                    and not tgisinternal) then
    raise exception 'sanity: R2''s claim guard trigger is gone';
  end if;

  -- Nothing on hold can be sellable: the register is clean at ship, and an
  -- on-hold row can never satisfy the free-only predicate every pick uses.
  if exists (select 1 from ops_stock_items
              where status = 'on_hold' and hold_reason is null) then
    raise exception 'sanity: a held unit exists with no reason';
  end if;

  -- Grants, asserted BOTH directions (0281's rule: a revoke alone proves
  -- nothing, and `revoke … from public` does not drop `anon` on Supabase).
  if has_function_privilege('anon', 'public.ops_stock_resolve_hold(uuid, text, text)', 'execute') then
    raise exception 'sanity: anon can resolve held stock';
  end if;
  if not has_function_privilege('authenticated', 'public.ops_stock_resolve_hold(uuid, text, text)', 'execute') then
    raise exception 'sanity: authenticated lost execute on ops_stock_resolve_hold';
  end if;
  if not has_function_privilege('authenticated', 'public.operation_receive_po_with_do(text, text, text, jsonb)', 'execute') then
    raise exception 'sanity: authenticated lost execute on the receive RPC';
  end if;

  -- RLS is still on and still has no new door.
  select relrowsecurity into v_ok from pg_class where oid = 'public.ops_stock_items'::regclass;
  if not v_ok then raise exception 'sanity: RLS off on ops_stock_items'; end if;
end $$;
