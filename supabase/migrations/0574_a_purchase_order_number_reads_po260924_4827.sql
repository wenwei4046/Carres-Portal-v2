-- ═══════════════════════════════════════════════════════════════════════════
-- 0574 · A PURCHASE ORDER NUMBER READS `PO260924-4827`, AND EVERY PREFIX GETS
--        ITS OWN DAILY POOL
--
-- PURCHASING · owner ruling 2026-09-23 (Jess), merged as `docs/purchasing/
-- MASTER.md` §6.1 in PR #1545:
--
--   PO260924-4827      PO · YYMMDD of first issue · four random digits
--   PO260924-4827(1)   the version marker is the PAPER's, not the pool's
--
-- and, for the family: **each prefix has its own independent daily pool of
-- 10,000** — the 0381 rule that one day held one `4827` across every document
-- is retired by the owner, not by this file.
--
-- ── WHAT CHANGES, EXACTLY ─────────────────────────────────────────────────
-- ① THE POOL KEY. `formal_document_codes` moves from `(code_date, code)` to
--    `(code_date, prefix, code)`. No row is read, written or deleted: every
--    existing row is already unique on the wider key, so the new primary key
--    accepts the table as it stands. What it stops doing is REFUSING a second
--    prefix the same digits.
-- ② THE PRINTED FORM, FOR `PO` ONLY. `formal_document_code_text` is the one
--    place a code becomes a number, and it answers the new short form for the
--    prefixes named in `NEW_FORM` (today: `PO`) and the old
--    `PREFIX-YYYYMMDD-RRRR` for every other prefix. MPR, GRN, PRTN, RO, SB,
--    PV, ARI, RV, TR and MM therefore mint EXACTLY what they mint today: the
--    owner's family rule is approved, but switching a prefix's form is that
--    document's own scope, and a number shape changing unannounced is how a
--    supplier ends up holding two numbers for one job.
-- ③ THE CODE CLAIM INSIDE THE PO HELPER. `_operation_create_po_inner` wrote
--    its number back onto the pool row by `split_part(id, '-', 3)` — the third
--    dash-piece. `PO260924-4827` HAS no third piece, so that update would have
--    matched nothing and the pool row would have kept no document_id. It now
--    reads the last four characters (the code in both shapes) and names its
--    own `prefix`, which the wider key requires.
--
-- ── WHAT IS DELIBERATELY NOT CHANGED ──────────────────────────────────────
--   · EXISTING NUMBERS ARE PERMANENT. `PO-20260904-4665`, `PO-2054`, every
--     `MPR-…`, every `REQ-####` — nothing is renumbered, nothing is rewritten,
--     no row is touched. They live in supplier hands, in `po_sends`, in GRNs
--     and in Claim lineage (§6.1 Permanence).
--   · THE DRAW ITSELF. Four random digits from the day's unused codes, unique
--     key, loser of a race draws again, 200 tries then a named refusal
--     (`document_code_pool_exhausted`). Not a sequence, not a timestamp.
--   · THE VERSION MARKER. `(n)` is printed by the PAPER from the PO's own
--     `version` column; no code, pool or row carries it. This file mints
--     numbers, and a version is not part of a number.
--   · `allocate_unit_id` and the Unit series (§6.2) — untouched.
--
-- The helper body below is the COMMITTED body from 0573, extracted verbatim,
-- with ONE edit (③). Re-typing it would silently drop the Catalog
-- classification pass, the Unit birth, the lineage validation and the audit
-- row, none of which this ruling may change.
--
-- RLS: no policy changes. GRANTS: unchanged (the new helper is granted the
--   same audience as the allocator it serves). DATA: none — no row is read,
--   written or deleted by this file.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

set local search_path = public, pg_temp;

-- ─── 1 · one place where a code becomes a number ────────────────────────────

/**
 * THE PRINTED NUMBER FOR ONE (prefix, date, code).
 *
 * ⭐ WHY A FUNCTION AND NOT A `format()` INSIDE THE ALLOCATOR: the shape is now
 * per-prefix, so it is a RULE, and a rule with two spellings drifts. Every
 * caller — the allocator today, a backfill-free reader tomorrow — asks here,
 * and the migration's own sanity block can then assert both shapes without
 * drawing a single code from a real day's pool.
 *
 * `NEW_FORM` is the list of prefixes on the owner's short form. Adding the
 * next one is a one-line migration; it is deliberately NOT a settings row,
 * because a document's number shape is not an operator preference.
 */
create or replace function public.formal_document_code_text(
  p_prefix text,
  p_date date,
  p_code text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_prefix in ('PO')
      then format('%s%s-%s', p_prefix, to_char(p_date, 'YYMMDD'), p_code)
    else format('%s-%s-%s', p_prefix, to_char(p_date, 'YYYYMMDD'), p_code)
  end;
$$;

comment on function public.formal_document_code_text(text, date, text) is
  '0574 (MASTER §6.1, owner ruling 2026-09-23): the ONE place a (prefix, date, code) becomes a printed document number. `PO` wears the short form `PO260924-4827`; every other prefix still wears `PREFIX-YYYYMMDD-RRRR` until its own scope moves it. Immutable: it reads nothing.';

revoke all on function public.formal_document_code_text(text, date, text) from public, anon;
grant execute on function public.formal_document_code_text(text, date, text) to authenticated;

-- ─── 2 · each prefix draws from its own daily pool ──────────────────────────

-- The owner retired the shared pool. The key widens by one column; the rows
-- are untouched and every one of them already satisfies the wider key.
alter table public.formal_document_codes
  drop constraint formal_document_codes_pkey;
alter table public.formal_document_codes
  add constraint formal_document_codes_pkey primary key (code_date, prefix, code);

comment on table public.formal_document_codes is
  '0381, re-keyed by 0574: the daily visible-code pool every Carres formal document draws from (MASTER §6.1). Unique on (date, PREFIX, code) — each prefix owns an independent pool of 10,000 a day (owner ruling 2026-09-23, replacing 0381''s one-4827-a-day-across-prefixes rule). Rows are never deleted: a cancelled number stays taken.';

-- ─── 3 · the allocator asks for the shape instead of spelling it ────────────

create or replace function public.allocate_formal_document_code(
  p_prefix text,
  p_document_id text default null,
  p_date date default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_date, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_code text;
  v_try int := 0;
begin
  if p_prefix !~ '^[A-Z]{2,4}$' then
    raise exception 'document prefix % is not governed', p_prefix
      using errcode = '22023', detail = 'unknown_prefix';
  end if;

  loop
    v_try := v_try + 1;
    if v_try > 200 then
      raise exception 'no free document code left for % on %', p_prefix, v_date
        using errcode = 'P0001', detail = 'document_code_pool_exhausted';
    end if;
    v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    begin
      insert into public.formal_document_codes (code_date, code, prefix, document_id)
      values (v_date, v_code, p_prefix, p_document_id);
      -- ⭐ 0574 · ONE place decides the shape (§6.1). The draw is unchanged.
      return public.formal_document_code_text(p_prefix, v_date, v_code);
    exception when unique_violation then
      -- Somebody else took it between the draw and the insert. Draw again.
      -- Since 0574 that somebody must hold the SAME prefix.
      null;
    end;
  end loop;
end;
$$;

comment on function public.allocate_formal_document_code(text, text, date) is
  '0381, re-shaped by 0574: draws one unused four-digit code from the (date, prefix) pool at random and returns the printed number from `formal_document_code_text`. Never a sequence; a lost race draws again; 200 tries then `document_code_pool_exhausted`.';

-- ─── 4 · the PO helper claims its pool row by the number's TAIL ─────────────

create or replace function public._operation_create_po_inner(
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_lines jsonb,
  p_eta_date date,
  p_so_refs integer[],
  p_note text,
  p_procurement_partner_id uuid default null,
  p_destination_id uuid default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor        text;
  v_po_id        text;
  v_line_count   int;
  v_line         jsonb;
  v_sku          text;
  v_qty          int;
  v_cost         numeric(14,2);
  v_cost_source  cost_source_enum;
  v_attrs        jsonb;
  v_supplier_name text;
  v_line_id      uuid;
  v_src          jsonb;
  v_src_total    int;
  v_mode         text;
  v_line_dest    uuid;
  v_minted       int;
begin
  if p_warehouse_id is null then
    raise exception 'warehouse is required'
      using errcode = '22023', detail = 'warehouse_required';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'supplier not found'
      using errcode = 'P0001', detail = 'supplier_not_found';
  end if;
  if not exists (select 1 from warehouses where id = p_warehouse_id) then
    raise exception 'warehouse not found'
      using errcode = 'P0001', detail = 'warehouse_not_found';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array'
      using errcode = 'P0001', detail = 'lines_empty';
  end if;
  if p_procurement_partner_id is not null
     and not exists (select 1 from delivery_partners where id = p_procurement_partner_id) then
    raise exception 'procurement partner not found'
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;
  -- The PO writes its Deliver To in the SAME insert as its number now (0443),
  -- so a missing destination is refused by name here instead of surfacing as a
  -- raw NOT NULL violation from `purchase_orders.destination_id`.
  if p_destination_id is null or not exists (
    select 1 from purchasing_destinations d where d.id = p_destination_id and d.active
  ) then
    raise exception 'active purchasing destination required'
      using errcode = 'P0001', detail = 'unknown_destination';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');
  select name into v_supplier_name from suppliers where id = p_supplier_id;

  -- ⭐ 0443 · CLASSIFY BEFORE ANY WRITE. A SKU Catalog has not answered for
  -- refuses the WHOLE issue here — no PO number is drawn, no line, no demand
  -- movement, no Unit. The error names the SKU and the concrete Catalog act.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    select s.stock_identity_mode into v_mode
      from product_skus s where s.sku = v_sku;
    if not found then
      raise exception 'SKU % is not in the Catalog', v_sku
        using errcode = 'P0001', detail = 'sku_not_in_catalog';
    end if;
    if v_mode is null then
      raise exception 'Set the stock identity (Unit ID or Quantity) for % in Catalog before issuing a PO', v_sku
        using errcode = 'P0001', detail = 'catalog_identity_mode_missing';
    end if;
  end loop;

  -- ⭐ 0381/0382 · THE LOCKED DOCUMENT NUMBER (MASTER §6.1). This replaced
  -- `max(seq) + 1`, which leaked how much Carres buys to anyone holding two of
  -- our purchase orders.
  v_po_id := public.allocate_formal_document_code('PO');

  insert into purchase_orders
    (id, so_refs, supplier_id, warehouse_id, eta_date, status, sup_status, placed_at,
     procurement_partner_id, destination_id)
  values
    (v_po_id, p_so_refs, p_supplier_id, p_warehouse_id, p_eta_date,
     'open', 'pending', now(),
     p_procurement_partner_id, p_destination_id);

  -- ⭐ 0574 · THE CLAIM IS READ FROM THE NUMBER'S TAIL, NOT ITS THIRD PIECE.
  -- `split_part(id, '-', 3)` was the code while every number wore
  -- `PO-YYYYMMDD-RRRR`; on the new `PO260924-4827` there IS no third piece, so
  -- it returned '' and this row silently kept no document_id. The last four
  -- characters are the code in BOTH shapes. `prefix` now belongs in the key
  -- too: each prefix draws from its own daily pool, so (date, code) alone can
  -- name a GRN's row as easily as this PO's.
  update public.formal_document_codes
     set document_id = v_po_id
   where code_date = (timezone('Asia/Kuala_Lumpur', now()))::date
     and prefix = 'PO'
     and code = right(v_po_id, 4);

  v_line_count := 0;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    v_qty := (v_line->>'qty')::int;
    if v_sku is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid line: sku=%, qty=%', v_sku, v_qty
        using errcode = 'P0001', detail = 'invalid_qty';
    end if;
    v_cost        := (v_line->>'cost')::numeric(14,2);
    v_cost_source := (v_line->>'cost_source')::cost_source_enum;
    -- ⭐ 0573 · A PRICE THAT IS NOT RECORDED DOES NOT STOP THE ORDER (owner
    -- instruction, Jess 2026-09-23). BOTH null is an ABSENCE and is legal —
    -- Catalog simply has no price for this line yet. EXACTLY ONE null is
    -- still refused under the same name: half a commercial fact is a
    -- mistake, not an absence.
    if (v_cost is null) <> (v_cost_source is null) then
      raise exception 'cost and cost_source are recorded together or not at all (sku=%)', v_sku
        using errcode = '22023', detail = 'cost_required';
    end if;
    v_attrs := v_line->'attrs';
    select s.stock_identity_mode into v_mode from product_skus s where s.sku = v_sku;
    v_line_dest := nullif(v_line->>'destination_id', '')::uuid;
    if v_line_dest is not null and not exists (
      select 1 from purchasing_destinations d where d.id = v_line_dest and d.active
    ) then
      raise exception 'line destination is not an active purchasing destination (sku=%)', v_sku
        using errcode = 'P0001', detail = 'unknown_destination';
    end if;

    -- ⭐ 0443 · EVERY LINE FACT IS WRITTEN ON THE LINE ROW IT BELONGS TO — by
    -- the line's own id, never by `(po_id, sku)`. Two lines of one SKU are
    -- two lines.
    insert into purchase_order_lines
      (po_id, sku, qty, received_qty, cost, cost_source, attrs,
       identity_mode, destination_id,
       commercial_treatment, commercial_reason, demand_id)
    values
      (v_po_id, v_sku, v_qty, 0, v_cost, v_cost_source, v_attrs,
       v_mode, v_line_dest,
       nullif(v_line->>'commercial_treatment', ''),
       nullif(btrim(coalesce(v_line->>'commercial_reason', '')), ''),
       nullif(v_line->>'demand_id', '')::uuid)
    returning id into v_line_id;

    -- ⭐ 0382 · THE LINEAGE. The caller passes the SERVER's own recomputed
    -- allocation; it is validated here rather than trusted, because a browser
    -- that could name a source could put one customer's goods on another
    -- customer's order.
    if jsonb_typeof(v_line->'sources') = 'array' then
      v_src_total := 0;
      for v_src in select * from jsonb_array_elements(v_line->'sources')
      loop
        if not exists (select 1 from orders where id = (v_src->>'order_id')::uuid) then
          raise exception 'source order not found (sku=%)', v_sku
            using errcode = 'P0001', detail = 'unknown_source_order';
        end if;
        if nullif(v_src->>'order_line_id', '') is not null
           and not exists (
             select 1 from order_lines
              where id = (v_src->>'order_line_id')::uuid
                and order_id = (v_src->>'order_id')::uuid
           ) then
          raise exception 'source line does not belong to its order (sku=%)', v_sku
            using errcode = 'P0001', detail = 'source_line_mismatch';
        end if;
        insert into po_line_sources (po_id, po_line_id, sku, order_id, so, order_line_id, qty)
        values (
          v_po_id, v_line_id, v_sku,
          (v_src->>'order_id')::uuid,
          nullif(v_src->>'so', '')::int,
          nullif(v_src->>'order_line_id', '')::uuid,
          (v_src->>'qty')::int
        );
        v_src_total := v_src_total + (v_src->>'qty')::int;
      end loop;
      -- The parts must add up to the line. A lineage that does not is worse
      -- than none: it would look authoritative while hiding units.
      if v_src_total <> v_qty then
        raise exception 'source allocation does not add up (sku=%, sources=%, line=%)',
            v_sku, v_src_total, v_qty
          using errcode = 'P0001', detail = 'source_allocation_mismatch';
      end if;
    end if;

    -- ⭐ 0443 · THE BIRTH. An exact-unit line is born with exactly one
    -- permanent Carres Unit ID per ordered piece, bound to THIS line, for
    -- EVERY governed destination (§6.2: the supplier writes it on the package
    -- wherever the goods go). A quantity line is born with none — it is
    -- reconciled by count, and a fake Unit ID would be a lie on the paper.
    if v_mode = 'exact_unit' then
      insert into ops_stock_items
        (unit_code, sku, warehouse_id, status, supplier, po_no, po_line_id,
         identity_scope, source_ref, date_in)
      select public.allocate_unit_id(), v_sku, p_warehouse_id, 'incoming',
             v_supplier_name, v_po_id, v_line_id, 'unit', 'po_mint', current_date
        from generate_series(1, v_qty);
      get diagnostics v_minted = row_count;
      if v_minted <> v_qty then
        raise exception 'Unit ID allocation failed for % (wanted %, got %)', v_sku, v_qty, v_minted
          using errcode = 'P0001', detail = 'unit_allocation_failed';
      end if;
    elsif v_mode <> 'quantity' then
      raise exception 'unknown stock identity mode % on %', v_mode, v_sku
        using errcode = 'P0001', detail = 'catalog_identity_mode_missing';
    end if;

    v_line_count := v_line_count + 1;
  end loop;

  insert into audit_log (role, actor_text, action, ref)
  values ('operation', v_actor,
          format('Created PO %s · %s lines%s',
                 v_po_id, v_line_count,
                 case when p_note is not null and btrim(p_note) <> ''
                      then ' · ' || btrim(p_note)
                      else '' end),
          v_po_id);

  return v_po_id;
end;
$function$;
comment on function public._operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid, uuid) is
  '0443 Unit birth, 0573 price absence, 0574 pool claim: the ONE creation helper. Draws the PO number, writes every line fact on the line''s own row and mints each exact-unit line''s permanent line-bound Unit IDs in one transaction. Since 0573 a line may carry NO cost and NO cost_source — Carres has no price for it yet — but never exactly one of the two. Since 0574 it claims its pool row by (date, prefix PO, the number''s last four characters), which is the code in both the old and the new number shape.';

-- ─── 5 · the proof ──────────────────────────────────────────────────────────
--
-- Catalogue and pure-function reads only: pg_proc, pg_constraint, and
-- `formal_document_code_text`, which is immutable and touches no table. No
-- code is drawn (that would consume a real day's number), no row is read, and
-- no production row count is asserted (red line 8).
do $sanity$
declare
  v_src text;
  v_def text;
  v_n   int;
  m     text;
begin
  -- ① BOTH SHAPES, FROM THE ONE PLACE THAT DECIDES THEM.
  if public.formal_document_code_text('PO', date '2026-09-24', '4827')
     <> 'PO260924-4827' then
    raise exception '0574 sanity: PO does not wear the owner''s short form (got %)',
      public.formal_document_code_text('PO', date '2026-09-24', '4827');
  end if;
  if public.formal_document_code_text('PO', date '2026-01-05', '0007')
     <> 'PO260105-0007' then
    raise exception '0574 sanity: a leading-zero code or a single-digit month is mis-printed (got %)',
      public.formal_document_code_text('PO', date '2026-01-05', '0007');
  end if;
  -- Every OTHER prefix still mints exactly what it minted yesterday.
  foreach m in array array['MPR', 'GRN', 'PRTN', 'RO', 'SB', 'PV', 'ARI', 'RV', 'TR', 'MM', 'DR', 'CO'] loop
    if public.formal_document_code_text(m, date '2026-09-24', '4827')
       <> m || '-20260924-4827' then
      raise exception '0574 sanity: % changed shape and no ruling moved it (got %)',
        m, public.formal_document_code_text(m, date '2026-09-24', '4827');
    end if;
  end loop;

  -- ② THE POOL IS PER PREFIX.
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.formal_document_codes'::regclass and contype = 'p';
  if v_def is null or v_def <> 'PRIMARY KEY (code_date, prefix, code)' then
    raise exception '0574 sanity: the pool key is % and not (code_date, prefix, code)', coalesce(v_def, 'missing');
  end if;
  -- The two shape rules the table has always had must survive the re-key.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.formal_document_codes'::regclass
       and conname = 'formal_document_codes_code_check'
  ) then
    raise exception '0574 sanity: the four-digit code rule was dropped with the key';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.formal_document_codes'::regclass
       and conname = 'formal_document_codes_prefix_check'
  ) then
    raise exception '0574 sanity: the prefix rule was dropped with the key';
  end if;

  -- ③ THE ALLOCATOR ASKS, IT DOES NOT SPELL.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'allocate_formal_document_code';
  if v_n <> 1 then
    raise exception '0574 sanity: expected exactly one allocator, found %', v_n;
  end if;
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'allocate_formal_document_code';
  if position('formal_document_code_text' in v_src) = 0 then
    raise exception '0574 sanity: the allocator still spells the number itself';
  end if;
  foreach m in array array['unknown_prefix', 'document_code_pool_exhausted', 'unique_violation', 'random'] loop
    if position(m in v_src) = 0 then
      raise exception '0574 sanity: the allocator lost %', m;
    end if;
  end loop;

  -- ④ THE PO HELPER KEPT EVERYTHING 0573 LEFT IT, AND CLAIMS BY THE TAIL.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_operation_create_po_inner';
  if v_n <> 1 then
    raise exception '0574 sanity: expected exactly one creation helper, found %', v_n;
  end if;
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_operation_create_po_inner';
  foreach m in array array[
    'catalog_identity_mode_missing', 'cost_required', 'invalid_qty',
    'lines_empty', 'partner_not_found', 'sku_not_in_catalog',
    'source_allocation_mismatch', 'source_line_mismatch', 'supplier_not_found',
    'unit_allocation_failed', 'unknown_destination', 'unknown_source_order',
    'warehouse_not_found', 'warehouse_required',
    'allocate_formal_document_code', 'po_mint', 'ops_stock_items',
    '(v_cost is null) <> (v_cost_source is null)'
  ] loop
    if position(m in v_src) = 0 then
      raise exception '0574 sanity: _operation_create_po_inner lost %', m;
    end if;
  end loop;
  v_n := (length(v_src) - length(replace(v_src, 'raise exception', '')))
         / length('raise exception');
  if v_n <> 16 then
    raise exception '0574 sanity: the creation helper raises % times, expected the committed 16', v_n;
  end if;
  if position('code = right(v_po_id, 4)' in v_src) = 0
     or position('prefix = ''PO''' in v_src) = 0 then
    raise exception '0574 sanity: the helper does not claim its pool row by (prefix, tail)';
  end if;
  if position('split_part(v_po_id' in v_src) > 0 then
    raise exception '0574 sanity: the helper still reads the number''s third dash-piece';
  end if;
end
$sanity$;

commit;
