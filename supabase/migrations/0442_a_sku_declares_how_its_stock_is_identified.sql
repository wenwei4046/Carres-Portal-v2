-- 0442_a_sku_declares_how_its_stock_is_identified.sql
--
-- ⭐ CATALOG OWNS ONE MORE ANSWER: "is this SKU traced one Unit at a time, or
-- counted?" (PURCHASING × CATALOG × STOCK × RECEIVING · Unit ID Born With
-- Official PO — Traceable Goods and Quantity Goods, owner ruling 2026-09-07).
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
--
--   1. No per-SKU stock identity mode existed. PO issue minted `qty` Unit IDs
--      for EVERY positive line (0382:200-205) — a pillow line of 300 got 300
--      permanent Carres Unit IDs nobody will ever write on a package, while the
--      Stock model (0218 · 0366 §4 · 0368 §1) already says a pillow is a
--      quantity row and only sofa/bedframe/mattress are traced one by one.
--   2. A Unit was linked to its PO by `(po_no, sku)` text matching; there was no
--      `po_line_id`. Two lines of one SKU (a per-line Deliver To split, 0311)
--      could not be told apart at Unit level in the PDF (0428:311), the API
--      (`pos.ts` `/units`), the receiving validator (0426:175) or the page.
--   3. `allocate_unit_id()` was EXECUTE-granted to `authenticated` (0381:184)
--      and even `anon`, so any signed-in browser could consume numbers outside
--      official PO issue. `gen_unit_code()` was reachable the same way.
--
-- ── WHAT THIS FILE DOES (schema and the one-time classification only) ──────
--
--   · `product_skus.stock_identity_mode` — `exact_unit` | `quantity` | NULL.
--     NULL is "Catalog has not said": official PO issue REFUSES such a SKU by
--     name (0443) instead of choosing for it.
--   · `product_sku_identity_history` — append-only ledger of every mode fact,
--     including the controlled one-time classification below.
--   · The ONE-TIME CLASSIFICATION, from the Catalog's own category, where the
--     existing authority makes the answer deterministic (Stock MASTER §3 and
--     0368 §1: sofa · bedframe · mattress are traced one by one; accessories —
--     today pillows and a mattress protector — are interchangeable). Service
--     and guarantee SKUs are not physical goods and stay NULL. After this file
--     the STORED mode is the authority; nothing derives a mode at runtime from
--     category, supplier, destination, SKU text or `pos_active`.
--   · `purchase_order_lines.identity_mode` — the mode SNAPSHOTTED onto the line
--     at issue (a later Catalog change never rewrites an issued document).
--     Existing lines are stamped from today's classification so the receiving
--     verifier (0444) has one answer for every line.
--   · `ops_stock_items.po_line_id` — the immutable line binding. Existing
--     PO-minted Units are bound where their `(po_no, sku)` names exactly one
--     line (measured 2026-09-07: no PO carries a duplicate-SKU line today).
--   · `ops_stock_items.identity_scope` — `unit` (a Carres Unit ID) or
--     `quantity` (a bulk register row standing for N counted pieces, 0218;
--     its `unit_code` is a technical register key and is NEVER shown as a Unit
--     ID). Both new columns join the permanence trigger: set once, never
--     changed.
--   · The allocators close: `allocate_unit_id()` and `gen_unit_code()` are
--     revoked from `public`, `anon`, `authenticated` and `service_role`. The
--     SECURITY DEFINER PO authority (0443) still calls them as their owner.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
--
--   · It renumbers, deletes or reuses NO existing Unit ID (Stock §3 · §6.2).
--   · It asserts no production row count (red line 8). Every backfill is a
--     predicate, never a number.
--   · It does not touch the PO issue, revision or receiving engines — 0443 and
--     0444 do, and they depend on the columns created here.
-- ─────────────────────────────────────────────────────────────────────────────

set search_path = public;

-- ─── 1 · Catalog: the stored, per-SKU stock identity mode ───────────────────

alter table public.product_skus
  add column if not exists stock_identity_mode text
  check (stock_identity_mode in ('exact_unit', 'quantity'));

comment on column public.product_skus.stock_identity_mode is
  '0442: how Stock identifies this SKU. exact_unit = every physical piece is one permanent Carres Unit ID born at official PO issue; quantity = governed interchangeable goods, counted, never given Unit IDs; NULL = Catalog has not said, and official PO issue refuses the SKU by name. Stored truth — never derived at runtime.';

create table if not exists public.product_sku_identity_history (
  id            uuid primary key default gen_random_uuid(),
  sku_id        uuid not null references public.product_skus(id),
  sku           text not null,
  previous_mode text check (previous_mode in ('exact_unit', 'quantity')),
  mode          text check (mode in ('exact_unit', 'quantity')),
  basis         text not null,
  actor_id      uuid,
  recorded_at   timestamptz not null default now()
);

comment on table public.product_sku_identity_history is
  '0442: append-only ledger of every stock identity mode fact on a SKU — the one-time category classification and every later Catalog edit. Never updated, never deleted.';

alter table public.product_sku_identity_history enable row level security;
revoke all on public.product_sku_identity_history from public, anon, authenticated;
grant select on public.product_sku_identity_history to authenticated;

drop policy if exists sku_identity_history_read on public.product_sku_identity_history;
create policy sku_identity_history_read on public.product_sku_identity_history
  for select using ((select auth.uid()) is not null);

-- ─── 2 · THE ONE-TIME CLASSIFICATION (controlled, auditable, then never again) ─
--
-- Category decides ONLY here, ONLY for rows Catalog has not yet answered, and
-- ONLY where the existing authority is deterministic. The ledger records the
-- basis for every row it touches.

insert into public.product_sku_identity_history (sku_id, sku, previous_mode, mode, basis)
select s.id, s.sku, null,
       case when pm.category in ('mattress', 'bedframe', 'sofa') then 'exact_unit'
            when pm.category = 'accessory' then 'quantity'
       end,
       format('one_time_classification_0442:category=%s', pm.category)
  from public.product_skus s
  join public.product_models pm on pm.id = s.model_id
 where s.stock_identity_mode is null
   and pm.category in ('mattress', 'bedframe', 'sofa', 'accessory');

update public.product_skus s
   set stock_identity_mode = case when pm.category in ('mattress', 'bedframe', 'sofa') then 'exact_unit'
                                  when pm.category = 'accessory' then 'quantity'
                             end,
       updated_at = now()
  from public.product_models pm
 where pm.id = s.model_id
   and s.stock_identity_mode is null
   and pm.category in ('mattress', 'bedframe', 'sofa', 'accessory');

-- From here on every change is a Catalog edit and is written to the ledger by
-- the trigger, with the actor. (Created AFTER the classification so the
-- one-time rows carry their own basis, not `catalog_edit`.)
create or replace function public.trg_product_sku_identity_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.stock_identity_mode is not null then
      insert into public.product_sku_identity_history (sku_id, sku, previous_mode, mode, basis, actor_id)
      values (new.id, new.sku, null, new.stock_identity_mode, 'catalog_create', auth.uid());
    end if;
  elsif new.stock_identity_mode is distinct from old.stock_identity_mode then
    insert into public.product_sku_identity_history (sku_id, sku, previous_mode, mode, basis, actor_id)
    values (new.id, new.sku, old.stock_identity_mode, new.stock_identity_mode, 'catalog_edit', auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists product_sku_identity_history on public.product_skus;
create trigger product_sku_identity_history
  after insert or update of stock_identity_mode on public.product_skus
  for each row execute function public.trg_product_sku_identity_history();

-- ─── 3 · The PO line snapshots the mode it was issued under ─────────────────

alter table public.purchase_order_lines
  add column if not exists identity_mode text
  check (identity_mode in ('exact_unit', 'quantity'));

comment on column public.purchase_order_lines.identity_mode is
  '0442: the Catalog stock identity mode SNAPSHOTTED at official PO issue. exact_unit = one permanent Unit ID per ordered piece, bound to this line; quantity = zero Unit IDs, reconciled by count. A later Catalog change never rewrites an issued line.';

update public.purchase_order_lines l
   set identity_mode = s.stock_identity_mode
  from public.product_skus s
 where s.sku = l.sku
   and l.identity_mode is null
   and s.stock_identity_mode is not null;

-- ─── 4 · A Unit is bound to its LINE, and a register row says what it is ────

alter table public.ops_stock_items
  add column if not exists po_line_id uuid references public.purchase_order_lines(id);

comment on column public.ops_stock_items.po_line_id is
  '0442: the immutable PO line this Unit was born for. Set once at official PO issue (or by the one-time 0442 binding for Units minted before it); never changed. `po_no` + `sku` alone cannot tell two lines of one SKU apart.';

create index if not exists ops_stock_items_po_line_id_idx
  on public.ops_stock_items (po_line_id);

alter table public.ops_stock_items
  add column if not exists identity_scope text not null default 'unit'
  check (identity_scope in ('unit', 'quantity'));

comment on column public.ops_stock_items.identity_scope is
  '0442: unit = this row IS one permanent Carres Unit ID; quantity = a bulk register row standing for `qty` counted pieces of governed interchangeable goods (0218). A quantity row''s unit_code is a technical register key and is never shown, printed or scanned as a Unit ID.';

-- Bind every existing PO-minted Unit whose (po_no, sku) names exactly ONE line.
-- A predicate, not a count: a PO that ever carried two lines of one SKU keeps
-- those Units unbound rather than guessing.
update public.ops_stock_items si
   set po_line_id = l.id
  from public.purchase_order_lines l
 where si.po_line_id is null
   and si.po_no is not null
   and l.po_id = si.po_no
   and l.sku = si.sku
   and (select count(*) from public.purchase_order_lines x
         where x.po_id = l.po_id and x.sku = l.sku) = 1;

-- Rows that already stand for several pieces are quantity rows by definition
-- (0218: "one ops_stock_items record per sheet line ... carries the line
-- quantity"). Nothing else is reclassified.
update public.ops_stock_items
   set identity_scope = 'quantity'
 where qty > 1
   and identity_scope = 'unit';

-- The binding and the scope join the permanence rule (0366 §3): an identity
-- that can be re-pointed is an identity Receiving can mint a second time.
create or replace function public.trg_stock_unit_identity_permanence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'unit % (%) is a permanent record — end its lifecycle, never delete it',
      old.unit_code, old.id
      using errcode = 'P0001', detail = 'unit_never_deleted';
  end if;

  if new.unit_code is distinct from old.unit_code then
    raise exception
      'unit % cannot be renamed to % — a replacement label keeps the original id',
      old.unit_code, new.unit_code
      using errcode = 'P0001', detail = 'unit_code_immutable';
  end if;

  -- 0442 · once a Unit knows its line it never changes its mind.
  if old.po_line_id is not null and new.po_line_id is distinct from old.po_line_id then
    raise exception
      'unit % is bound to PO line % for life',
      old.unit_code, old.po_line_id
      using errcode = 'P0001', detail = 'unit_line_immutable';
  end if;

  if new.identity_scope is distinct from old.identity_scope then
    raise exception
      'unit % cannot change between a Unit ID and a quantity row',
      old.unit_code
      using errcode = 'P0001', detail = 'unit_scope_immutable';
  end if;

  return new;
end;
$$;

-- ─── 5 · The allocators close to everything but the PO authority ────────────
--
-- 0381 granted `allocate_unit_id()` to `authenticated` (and the default PUBLIC
-- grant reached `anon`); 0366 left `gen_unit_code()` executable by
-- `authenticated`. Official PO issue (0443) is a SECURITY DEFINER function that
-- calls them as their owner, so no caller role needs — or gets — the grant.

revoke all on function public.allocate_unit_id() from public, anon, authenticated, service_role;
revoke all on function public.gen_unit_code() from public, anon, authenticated, service_role;

-- ─── 6 · sanity — the shape, never a count ───────────────────────────────────

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'product_skus'
                    and column_name = 'stock_identity_mode') then
    raise exception '0442: product_skus.stock_identity_mode is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'purchase_order_lines'
                    and column_name = 'identity_mode') then
    raise exception '0442: purchase_order_lines.identity_mode is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ops_stock_items'
                    and column_name = 'po_line_id') then
    raise exception '0442: ops_stock_items.po_line_id is missing';
  end if;
  if exists (select 1 from information_schema.routine_privileges
              where routine_schema = 'public' and routine_name = 'allocate_unit_id'
                and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')) then
    raise exception '0442: allocate_unit_id() is still reachable from a client role';
  end if;
  if exists (select 1 from information_schema.routine_privileges
              where routine_schema = 'public' and routine_name = 'gen_unit_code'
                and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')) then
    raise exception '0442: gen_unit_code() is still reachable from a client role';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select stock_identity_mode, count(*) from product_skus group by 1;
--   -- EXPECT: exact_unit for mattress/bedframe/sofa, quantity for accessory,
--   --         NULL only for service/guarantee
--   select basis, count(*) from product_sku_identity_history group by 1;
--   select count(*) from ops_stock_items where po_no is not null and po_line_id is null;
--   -- EXPECT: only Units whose po_no names no single line (legacy refs)
--   select grantee from information_schema.routine_privileges
--    where routine_name in ('allocate_unit_id','gen_unit_code');
--   -- EXPECT: the owner only
