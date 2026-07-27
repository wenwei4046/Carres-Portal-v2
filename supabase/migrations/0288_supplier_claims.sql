-- =============================================================================
-- 0288_supplier_claims.sql — R2 of the receiving & claim queue
-- =============================================================================
-- Card R2 (docs/receiving-claim-execution-queue.md, locked with Jess 2026-07-27):
-- "any Damaged/Wrong-item qty (or an open Pending qty older than the supplier's
--  promise) auto-creates a Supplier claim case: PO · supplier · SKU · qty ·
--  photos · reported by/date."
-- Done when: **a receiving problem cannot exist without a case row chasing it.**
--
-- R1 (0284) gave a PO line three honest numbers. A number on a line chases
-- nobody — this migration turns each one into a CASE with an owner, evidence
-- and a date, and then makes it structurally impossible to record the number
-- without the case.
--
-- What this does:
--   1. `supplier_claims` — one row per problem. Snapshots supplier / sku /
--      category so the claim survives a line edit; carries its photos inline
--      (the `delivery_photos` shape from 0280: {path, at, by}).
--   2. `claim_product_category(sku)` + `supplier_claim_type_allowed(cat, type)`
--      — the S1 vocabulary, mirrored in SQL because the database cannot import
--      TypeScript (same law as 0285's priority rule and 0281's due dates).
--   3. `po_line_issue_requires_claim` — the GUARD. Any door that raises a
--      line's damaged/wrong counter without a covering claim is REFUSED.
--   4. `operation_receive_po_with_do` — mints the claims (with their evidence)
--      immediately before it bumps the counters. Every other line of the body
--      is unchanged from 0284.
--   5. `supplier_claim_sweep_overdue()` — the second half of the card: an open
--      pending qty past the supplier's promised ETA becomes a `late_delivery`
--      claim. Idempotent, one open claim per line, cron-driven.
--
-- Deliberate design decisions (each one is load-bearing):
--
--   * ONE claim-type vocabulary, not two. A claim type is a service-case issue
--     key (0285) — `wrong_sku · missing_parts · wrong_spec · wrong_colour ·
--     colour_uneven · damaged · other` — plus exactly one word a customer can
--     never report: `late_delivery`. "Wrong colour" means the same thing
--     whether the customer found it or the warehouse did, and S5 can count it
--     from one column.
--   * The damaged and wrong-item DOMAINS ARE DISJOINT, and the guard depends on
--     it: a claim typed `damaged` covers the damaged counter; every other
--     non-late type covers the wrong-item counter. That is why the wrong-item
--     picker never offers `damaged` — one unit must not be counted twice under
--     two names.
--   * Evidence is a CHECK, not a convention. A damaged / wrong-item claim with
--     an empty photo array cannot be stored at all (S2's law: no evidence, no
--     case). `late_delivery` is exempt — there is nothing to photograph.
--   * A claim NEVER produces a credit note (Jess, locked): credit notes are
--     Finance-only, for billing mistakes. Nothing here speaks money.
--   * `po_line_id` is ON DELETE SET NULL and supplier/sku/category are
--     SNAPSHOTS — an ordinary line edit must not erase the chase, and an old
--     claim must never re-derive itself from today's catalog (0285's law).
--   * `status` is deliberately two-valued (open/closed). The ask/answer pair
--     and the resolution flow are R3's card; this leaves room without
--     pre-empting it.
--
-- Live state when this was written: **0 purchase orders and 0 PO lines exist**
-- in production, so nothing is backfilled and no existing row can violate the
-- new guard. Verified in a rolled-back transaction against live before apply.
-- =============================================================================

set search_path = public;

-- ── 1 · the table ────────────────────────────────────────────────────────────

create sequence if not exists public.supplier_claims_no_seq start with 1001;

create table if not exists public.supplier_claims (
  id               uuid primary key default gen_random_uuid(),
  claim_no         text not null unique
                     default ('SC-' || nextval('public.supplier_claims_no_seq')),
  po_id            text not null references public.purchase_orders(id) on delete cascade,
  -- SET NULL, not CASCADE: an ordinary line edit deletes and re-creates lines
  -- (0255's replace pipeline). The chase must outlive that.
  po_line_id       uuid references public.purchase_order_lines(id) on delete set null,
  -- Snapshots. Who owes us this, and what was it — as at the moment we found
  -- the problem, never re-derived.
  supplier_id      uuid not null references public.suppliers(id),
  sku              text not null,
  product_category text not null
                     check (product_category in ('mattress','bedframe','sofa','other')),
  claim_type       text not null
                     check (claim_type in ('wrong_sku','missing_parts','wrong_spec',
                                           'wrong_colour','colour_uneven','damaged',
                                           'other','late_delivery')),
  qty              int  not null check (qty > 0),
  status           text not null default 'open' check (status in ('open','closed')),
  -- The delivery this came in on — the number the supplier will recognise.
  do_number        text,
  photos           jsonb not null default '[]'::jsonb,
  note             text,
  reported_by      uuid references public.app_users(id) on delete set null,
  reported_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint supplier_claims_photos_is_array check (jsonb_typeof(photos) = 'array'),
  -- S2's evidence law, as a thing the table itself will not store.
  constraint supplier_claims_evidence_required
    check (claim_type = 'late_delivery' or jsonb_array_length(photos) > 0)
);

create index if not exists supplier_claims_open_idx
  on public.supplier_claims (status, reported_at desc);
create index if not exists supplier_claims_po_idx      on public.supplier_claims (po_id);
create index if not exists supplier_claims_line_idx    on public.supplier_claims (po_line_id);
create index if not exists supplier_claims_supplier_idx on public.supplier_claims (supplier_id);

comment on table public.supplier_claims is
  'R2 (0288): one row per receiving problem — the case that chases the supplier for goods they owe us. Minted by operation_receive_po_with_do (damaged/wrong item) and supplier_claim_sweep_overdue (late delivery); a guard trigger refuses any line issue that has no covering claim. NEVER produces a credit note (Jess, locked) — resolutions are goods actions.';
comment on column public.supplier_claims.claim_type is
  'R2: a service-case issue key (0285) plus late_delivery. DISJOINT DOMAINS: claim_type=damaged covers the line''s damaged_qty; every other non-late type covers wrong_item_qty. The guard trigger depends on this split.';
comment on column public.supplier_claims.photos is
  'R2: evidence, as {path, at, by} entries (the 0280 delivery-photo shape). path = object key in the private delivery-orders bucket under <po_id>/. A damaged/wrong claim cannot exist with an empty array (CHECK).';

alter table public.supplier_claims enable row level security;

-- Read = internal (principal/operation/finance/bd). No INSERT/UPDATE/DELETE
-- policy exists on purpose: every write goes through a SECURITY DEFINER RPC, so
-- there is no PostgREST door that can file, edit or drop a claim by hand.
drop policy if exists supplier_claims_read_internal on public.supplier_claims;
create policy supplier_claims_read_internal on public.supplier_claims
  for select to authenticated
  using ( (select public.is_internal()) );

grant select on public.supplier_claims to authenticated;
revoke insert, update, delete on public.supplier_claims from authenticated;

-- ── 2 · the vocabulary, mirrored in SQL ──────────────────────────────────────

-- The claim's product family. Mirrors `caseProductCategory` in
-- packages/shared/src/service-case-intake.ts: the native `mattress:` /
-- `bedframe:` / `sofa:` SKU head wins first (that is what lineCategory does),
-- otherwise the catalog/keyword classifier `resolve_demand_category` (0148,
-- itself the declared mirror of lineCategory) decides. Anything else — an
-- accessory, a service charge, a SKU nobody recognises — is `other`.
create or replace function public.claim_product_category(p_sku text)
returns text
language sql
stable
as $$
  select case
    when p_sku is null or btrim(p_sku) = '' then 'other'
    when lower(split_part(btrim(p_sku), ':', 1)) in ('mattress','bedframe','sofa')
      then lower(split_part(btrim(p_sku), ':', 1))
    when public.resolve_demand_category(p_sku) in ('mattress','bedframe','sofa')
      then public.resolve_demand_category(p_sku)
    else 'other'
  end;
$$;

-- May this claim type be filed for a WRONG-ITEM unit of this category?
-- Mirrors `isWrongItemClaimTypeFor` in packages/shared/src/supplier-claim.ts
-- (which is itself `caseIssuesFor(cat)` minus `damaged`).
--
-- `damaged` and `late_delivery` are refused in every category: damage has its
-- own counter, and nothing about a delivery that arrived can be late.
-- `other` — the category we could not name — accepts any issue key rather than
-- its own narrow list: refusing "colour uneven" on a sofa the classifier failed
-- to recognise would block a real receiving over a naming detail, and a blocked
-- receiving is worse than a loosely-typed claim.
create or replace function public.supplier_claim_type_allowed(
  p_category text,
  p_claim_type text
) returns boolean
language sql
immutable
as $$
  select case
    when p_claim_type is null or p_category is null then false
    when p_claim_type in ('damaged','late_delivery') then false
    when p_category = 'mattress' then p_claim_type in ('wrong_sku','other')
    when p_category = 'bedframe' then p_claim_type in ('missing_parts','wrong_spec','wrong_colour','other')
    when p_category = 'sofa'     then p_claim_type in ('missing_parts','wrong_spec','wrong_colour','colour_uneven','other')
    when p_category = 'other'    then p_claim_type in ('wrong_sku','missing_parts','wrong_spec','wrong_colour','colour_uneven','other')
    else false
  end;
$$;

-- Storage paths → the {path, at, by} entries the claim stores. Duplicates and
-- blanks are dropped; a non-string element is ignored rather than stored as
-- junk. Empty in → empty out, which the evidence CHECK then refuses for a
-- damaged/wrong claim.
create or replace function public.supplier_claim_photo_entries(p_paths jsonb, p_by uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('path', t.p, 'at', now(), 'by', p_by)),
    '[]'::jsonb)
  from (
    select distinct btrim(e.value #>> '{}') as p
      from jsonb_array_elements(
             case when jsonb_typeof(coalesce(p_paths, '[]'::jsonb)) = 'array'
                  then p_paths else '[]'::jsonb end) e
     where jsonb_typeof(e.value) = 'string'
       and length(btrim(e.value #>> '{}')) > 0
  ) t;
$$;

-- ── 3 · the guard — a problem cannot exist without a case ────────────────────

create or replace function public.po_line_issue_requires_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old_damaged int := 0;
  v_old_wrong   int := 0;
  v_claimed     int;
begin
  if tg_op = 'UPDATE' then
    v_old_damaged := coalesce(old.damaged_qty, 0);
    v_old_wrong   := coalesce(old.wrong_item_qty, 0);
  end if;

  if coalesce(new.damaged_qty, 0) > v_old_damaged then
    select coalesce(sum(qty), 0) into v_claimed
      from public.supplier_claims
     where po_line_id = new.id and claim_type = 'damaged';
    if v_claimed < new.damaged_qty then
      raise exception
        'damaged units on PO line % are not covered by a supplier claim (claimed %, reported %)',
        new.id, v_claimed, new.damaged_qty
        using errcode = 'P0001', detail = 'claim_required_damaged';
    end if;
  end if;

  if coalesce(new.wrong_item_qty, 0) > v_old_wrong then
    -- Every non-damaged, non-late type covers the wrong-item counter — see the
    -- disjoint-domains note at the top of this file.
    select coalesce(sum(qty), 0) into v_claimed
      from public.supplier_claims
     where po_line_id = new.id and claim_type not in ('damaged','late_delivery');
    if v_claimed < new.wrong_item_qty then
      raise exception
        'wrong-item units on PO line % are not covered by a supplier claim (claimed %, reported %)',
        new.id, v_claimed, new.wrong_item_qty
        using errcode = 'P0001', detail = 'claim_required_wrong_item';
    end if;
  end if;

  return null;
end;
$fn$;

comment on function public.po_line_issue_requires_claim() is
  'R2 (0288) THE GUARD: raising a PO line''s damaged_qty / wrong_item_qty without a covering supplier_claims row is refused, whichever door tries it. This is what makes "a receiving problem cannot exist without a case row chasing it" a property of the database rather than a habit of one RPC.';

drop trigger if exists po_line_issue_requires_claim on public.purchase_order_lines;
create trigger po_line_issue_requires_claim
  after insert or update on public.purchase_order_lines
  for each row execute function public.po_line_issue_requires_claim();

-- ── 4 · receiving mints the claim ────────────────────────────────────────────

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
  v_line               jsonb;
  v_line_id            uuid;
  v_received_qty       int;
  v_damaged_add        int;
  v_wrong_add          int;
  v_damaged_total      int := 0;
  v_wrong_total        int := 0;
  v_claims_created     int := 0;
  v_category           text;
  v_wrong_type         text;
  v_photos             jsonb;
  v_existing_line      purchase_order_lines;
  v_sku                text;
  v_delta              int;
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

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_received_qty := nullif(v_line->>'received_qty', '')::int;
    -- R1: what THIS delivery found wrong. Absent = 0, so a pre-R1 caller
    -- behaves exactly as before.
    v_damaged_add := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong_add   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);

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
      );
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
      );
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

      update ops_stock_items
         set status = 'free', updated_at = now()
       where id in (
         select id from ops_stock_items
          where po_no = p_po_id and sku = v_sku and status = 'incoming'
          order by created_at
          limit v_delta
       );

      v_lines_updated := v_lines_updated + 1;
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
                      then format(' · issue: %s damaged, %s wrong item · %s supplier claim(s) opened',
                                  v_damaged_total, v_wrong_total, v_claims_created)
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
    'claims_created',    v_claims_created
  );
end;
$fn$;

grant execute on function public.operation_receive_po_with_do(text, text, text, jsonb) to authenticated;

-- ── 5 · the supplier's promise, unkept ───────────────────────────────────────

-- The second half of the card: an open pending qty older than the supplier's
-- promise becomes a claim too. `eta_date` IS the promise (it is what the PO
-- tells the supplier and what the Receiving queue shows).
--
-- Idempotent by construction: at most ONE open late_delivery claim per line, so
-- running it twice a day, or twice in a minute, changes nothing. The qty is the
-- pending qty at the moment the claim is raised — a snapshot, like every other
-- field on the row.
--
-- Callable by service_role ONLY (the daily cron). No `authenticated` grant:
-- 0266's lesson is that a NULL app_role must never fall through a gate, and the
-- simplest way to guarantee that is to give the role no door at all.
create or replace function public.supplier_claim_sweep_overdue()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row     record;
  v_created int := 0;
begin
  for v_row in
    select pol.id as line_id,
           pol.sku as sku,
           pol.qty - pol.received_qty as pending,
           po.id as po_id,
           po.supplier_id as supplier_id,
           po.eta_date as eta_date
      from purchase_order_lines pol
      join purchase_orders po on po.id = pol.po_id
     where po.status = 'open'
       and po.eta_date is not null
       and po.eta_date < current_date
       and pol.qty > pol.received_qty
       and not exists (
         select 1 from supplier_claims sc
          where sc.po_line_id = pol.id
            and sc.claim_type = 'late_delivery'
            and sc.status = 'open'
       )
     order by po.eta_date
  loop
    insert into supplier_claims (
      po_id, po_line_id, supplier_id, sku, product_category,
      claim_type, qty, note
    ) values (
      v_row.po_id, v_row.line_id, v_row.supplier_id, v_row.sku,
      public.claim_product_category(v_row.sku),
      'late_delivery', v_row.pending,
      format('Promised %s — still pending delivery.', to_char(v_row.eta_date, 'DD Mon YY'))
    );
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('claims_created', v_created);
end;
$fn$;

revoke execute on function public.supplier_claim_sweep_overdue() from public;
revoke execute on function public.supplier_claim_sweep_overdue() from anon;
revoke execute on function public.supplier_claim_sweep_overdue() from authenticated;
grant execute on function public.supplier_claim_sweep_overdue() to service_role;

-- ── sanity ───────────────────────────────────────────────────────────────────

do $$
declare
  v_copies int;
  v_ok     boolean;
begin
  -- one copy of each function we touched (no ghost overloads)
  select count(*) into v_copies from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'operation_receive_po_with_do';
  if v_copies <> 1 then raise exception 'sanity: % copies of the receive RPC', v_copies; end if;

  select count(*) into v_copies from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'supplier_claim_sweep_overdue';
  if v_copies <> 1 then raise exception 'sanity: % copies of the sweep', v_copies; end if;

  -- the guard is armed
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.purchase_order_lines'::regclass
                    and tgname = 'po_line_issue_requires_claim'
                    and not tgisinternal) then
    raise exception 'sanity: the claim guard trigger is not installed';
  end if;

  -- RLS on, and no write policy exists
  select relrowsecurity into v_ok from pg_class where oid = 'public.supplier_claims'::regclass;
  if not v_ok then raise exception 'sanity: RLS off on supplier_claims'; end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'supplier_claims'
                and cmd <> 'SELECT') then
    raise exception 'sanity: supplier_claims has a non-SELECT policy';
  end if;

  -- the sweep is service_role-only, asserted BOTH directions (0281's rule:
  -- a revoke alone proves nothing)
  if has_function_privilege('authenticated', 'public.supplier_claim_sweep_overdue()', 'execute') then
    raise exception 'sanity: authenticated can still run the sweep';
  end if;
  if has_function_privilege('anon', 'public.supplier_claim_sweep_overdue()', 'execute') then
    raise exception 'sanity: anon can still run the sweep';
  end if;
  if not has_function_privilege('service_role', 'public.supplier_claim_sweep_overdue()', 'execute') then
    raise exception 'sanity: service_role lost execute on the sweep';
  end if;
  if not has_function_privilege('authenticated', 'public.operation_receive_po_with_do(text, text, text, jsonb)', 'execute') then
    raise exception 'sanity: authenticated lost execute on the receive RPC';
  end if;

  -- the vocabulary mirrors packages/shared/src/supplier-claim.ts
  if public.supplier_claim_type_allowed('mattress','colour_uneven') then
    raise exception 'sanity: a mattress must not accept colour_uneven';
  end if;
  if not public.supplier_claim_type_allowed('sofa','colour_uneven') then
    raise exception 'sanity: a sofa must accept colour_uneven';
  end if;
  if public.supplier_claim_type_allowed('sofa','damaged')
     or public.supplier_claim_type_allowed('sofa','late_delivery') then
    raise exception 'sanity: the reserved types must never be wrong-item types';
  end if;
  if not public.supplier_claim_type_allowed('other','colour_uneven') then
    raise exception 'sanity: an unnamed category must not block a receiving';
  end if;
end $$;
