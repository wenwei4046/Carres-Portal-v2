-- =============================================================================
-- 0302_warehouse_files_its_own_receiving — R6 of the receiving & claim queue
-- =============================================================================
-- Card R6 (docs/receiving-claim-execution-queue.md, locked with Jess
-- 2026-07-27). Done-when: "a Klang receiving lands in the system with zero ops
-- typing — ops only reviews."
--
-- ── The one structural decision ─────────────────────────────────────────────
--
-- A warehouse submission is a QUEUED CALL to the receive engine, never a second
-- engine. `warehouse_receipt_check_in` replays the stored payload through
-- `operation_receive_po_with_do` — so R1's counters, R2's claim minting and its
-- guard trigger, R4's quarantine and the thread/stock cascade all come along
-- unchanged and un-copied. There is exactly ONE implementation of "receive a
-- PO" in this database, and this migration does not add a second.
--
-- ── The number that is stored as a DELTA, and why ───────────────────────────
--
-- `operation_receive_po_with_do` takes `received_qty` as a NEW TOTAL. A receipt
-- may sit for hours before ops opens it, and another DO can land in between —
-- so a stored new-total would be true when it was typed and wrong when it was
-- replayed (it would either be refused as a decrease or silently swallow the
-- other delivery). What the warehouse observed is a DELTA: how many good units
-- came off THIS truck. `received_now` is what is filed; the check-in adds it to
-- whatever the line has received by then.
--
-- ── Why the warehouse gets no RLS grant at all ──────────────────────────────
--
-- Every warehouse read AND write is a SECURITY DEFINER RPC gated on
-- `app_role() = 'warehouse'` and scoped by `app_warehouse_id()`. Not one table
-- policy names the role, which is asserted at the bottom of this file. That is
-- the strongest available statement of the card's "what it can NEVER do":
-- prices, stock adjustments, settings, deletes and other warehouses are not
-- filtered out of a view they can reach — there is no view they can reach.
-- (Storage is the one exception and it has to be: an upload goes through a
-- signed URL, so `storage.objects` policies ARE the boundary there. Both
-- branches are scoped to POs bound for the caller's own warehouse.)
--
-- ── What ops sees ───────────────────────────────────────────────────────────
--
-- `warehouse_receipts` DOES carry an ordinary internal READ policy, because the
-- ops Receiving page reads it through PostgREST like every other internal list.
-- It carries NO write policy: the three moves (submit · check in · send back)
-- are RPCs, so there is no door that can forge, edit or delete a receipt.
--
-- Live state when this was written: 1 warehouse (Carres Klang, own),
-- 0 purchase orders, 0 PO lines, 0 claims, 15 accounts and no 'warehouse'
-- account yet — so nothing is backfilled and no existing row can violate
-- anything added here.
-- =============================================================================

set search_path = public;

-- ── 1 · the account is bound to a warehouse ──────────────────────────────────

alter table public.app_users
  add column if not exists warehouse_id uuid references public.warehouses(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.app_users'::regclass
       and conname = 'app_users_warehouse_id_iff_role_warehouse'
  ) then
    -- Mirrors 0041's partner constraint exactly: the entity id and the role
    -- imply each other, so a warehouse login can never be unscoped and no
    -- other role can quietly acquire a warehouse.
    alter table public.app_users
      add constraint app_users_warehouse_id_iff_role_warehouse
      check (
        (role = 'warehouse'::app_role and warehouse_id is not null)
        or (role <> 'warehouse'::app_role and warehouse_id is null)
      );
  end if;
end $$;

create index if not exists app_users_warehouse_id_idx
  on public.app_users(warehouse_id);

comment on column public.app_users.warehouse_id is
  'R6: which warehouse this login belongs to. NOT NULL exactly when role=warehouse (CHECK). Every warehouse-side RPC scopes on it via app_warehouse_id().';

-- ── 2 · the scope helper ─────────────────────────────────────────────────────

-- STABLE + SECURITY DEFINER per CLAUDE.md §8 fix 3; every policy/RPC call site
-- wraps it `(select ...)` so PG runs it once per query (fix 2).
-- `status = 'active'` is included from birth — 0266 had to retrofit that onto
-- the older helpers, and a new one should not repeat the hole.
create or replace function public.app_warehouse_id()
returns uuid
language sql
stable
security definer
as $function$
  select warehouse_id from public.app_users
   where id = auth.uid() and status = 'active'
$function$;

comment on function public.app_warehouse_id() is
  'R6: the caller''s warehouse, or NULL for everyone else. Active accounts only — a disabled warehouse login scopes to nothing, which makes every warehouse RPC return empty rather than needing its own status check.';

-- ── 3 · the JWT learns the warehouse ─────────────────────────────────────────

-- Byte-identical to the live 0267 version except the two `warehouse_id` lines.
-- Same reasoning 0267 recorded: no exception handler (a throw here must fail
-- token issuance loudly rather than mint a roleless token), and the body stays
-- small enough that it cannot realistically throw.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user_id    uuid;
  v_user_row   record;
  v_meta       jsonb;
begin
  v_user_id := (event->>'user_id')::uuid;

  select role::text        as role,
         dealer_id::text    as dealer_id,
         supplier_id::text  as supplier_id,
         partner_id::text   as partner_id,
         outlet_id::text    as outlet_id,
         -- R6 (0302): the warehouse login's scope, beside the other entity ids.
         warehouse_id::text as warehouse_id
    into v_user_row
    from public.app_users
    where id = v_user_id
      -- 0267: a non-active account matches no row, so no role is minted and
      -- the existing guard below returns the event untouched.
      and status = 'active';

  if v_user_row.role is null then
    return event;
  end if;

  -- jsonb_strip_nulls keeps the claim absent for every non-warehouse account,
  -- so no existing token shape changes.
  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'role',         v_user_row.role,
    'dealer_id',    v_user_row.dealer_id,
    'supplier_id',  v_user_row.supplier_id,
    'partner_id',   v_user_row.partner_id,
    'outlet_id',    v_user_row.outlet_id,
    'warehouse_id', v_user_row.warehouse_id
  ));

  return jsonb_set(
    event,
    '{claims, app_metadata}',
    coalesce(event #> '{claims, app_metadata}', '{}'::jsonb) || v_meta,
    true
  );
end;
$function$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from public, anon, authenticated;

-- ── 4 · the receipt ──────────────────────────────────────────────────────────

create table if not exists public.warehouse_receipts (
  id             uuid primary key default gen_random_uuid(),
  po_id          text not null references public.purchase_orders(id) on delete cascade,
  -- Snapshot: which warehouse filed this. Never re-derived from the PO, because
  -- the PO's warehouse can be relocated and the record of who counted must not
  -- move with it.
  warehouse_id   uuid not null references public.warehouses(id),
  do_number      text not null check (length(btrim(do_number)) >= 3),
  do_file_path   text not null check (length(btrim(do_file_path)) > 0),
  note           text,
  -- The R1 payload, exactly as the check-in will replay it. Array of
  -- {id, sku, received_now, damaged_qty, wrong_item_qty, wrong_item_claim_type,
  --  damaged_photos[], wrong_item_photos[]}.
  lines          jsonb not null,
  status         text not null default 'submitted'
                   check (status in ('submitted','checked_in','returned')),
  submitted_by   uuid references public.app_users(id) on delete set null,
  submitted_at   timestamptz not null default now(),
  reviewed_by    uuid references public.app_users(id) on delete set null,
  reviewed_at    timestamptz,
  return_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint warehouse_receipts_lines_is_array
    check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  -- A send-back with no reason is a record that teaches nobody anything — the
  -- same law R3 applied to a rejected claim.
  constraint warehouse_receipts_return_reason
    check (status <> 'returned' or length(btrim(coalesce(return_reason,''))) > 0),
  -- Reviewed exactly when it has left the queue.
  constraint warehouse_receipts_reviewed_stamp
    check ((status = 'submitted') = (reviewed_at is null))
);

-- One open receipt per PO. Without this a warehouse could file the same
-- delivery twice and ops could check both in, double-counting the goods.
create unique index if not exists warehouse_receipts_one_open
  on public.warehouse_receipts (po_id) where status = 'submitted';
create index if not exists warehouse_receipts_queue_idx
  on public.warehouse_receipts (status, submitted_at desc);
create index if not exists warehouse_receipts_wh_idx
  on public.warehouse_receipts (warehouse_id, submitted_at desc);

comment on table public.warehouse_receipts is
  'R6 (0302): one row per receiving the WAREHOUSE filed. Goods do not move when this is written — ops check-in replays the stored payload through operation_receive_po_with_do, which is the only receive engine in this database. Writes are RPC-only (no write policy).';
comment on column public.warehouse_receipts.lines is
  'R6: the R1 payload. `received_now` is a DELTA (good units off THIS truck), NOT the RPC''s running `received_qty` — a receipt may sit while another DO lands, and a stored total would be stale by the time it is replayed.';

alter table public.warehouse_receipts enable row level security;

-- Read = internal, exactly like every other ops list (the Receiving page reads
-- it through PostgREST). The WAREHOUSE does not read it here: it reads its own
-- through warehouse_my_receipts(), so no policy has to name the role.
drop policy if exists warehouse_receipts_read_internal on public.warehouse_receipts;
create policy warehouse_receipts_read_internal on public.warehouse_receipts
  for select to authenticated
  using ( (select public.is_internal()) or (select public.is_operation()) );

grant select on public.warehouse_receipts to authenticated;
revoke insert, update, delete on public.warehouse_receipts from authenticated, anon;

-- ── 5 · a claim remembers which receipt found it ─────────────────────────────

alter table public.supplier_claims
  add column if not exists warehouse_receipt_id uuid
    references public.warehouse_receipts(id) on delete set null;

create index if not exists supplier_claims_receipt_idx
  on public.supplier_claims (warehouse_receipt_id);

comment on column public.supplier_claims.warehouse_receipt_id is
  'R6: the warehouse receipt whose check-in minted this claim, or NULL when ops received the PO directly. `reported_by` stays the person who FILED the claim (ops, at check-in); who FOUND the problem is this receipt''s submitted_by. Two facts, two columns, neither guessed.';

-- ── 6 · storage: the warehouse may upload its own DO and claim photos ────────
--
-- This is the one place the warehouse touches RLS, and it has to be: the
-- browser uploads through a signed URL, so storage.objects policies ARE the
-- boundary. Both branches are scoped by the PO's own warehouse, so a warehouse
-- cannot read or write a file belonging to a PO that was never coming to them.
-- Everything else in these policies is byte-identical to what is live.

DROP POLICY IF EXISTS "delivery_orders_read" ON storage.objects;
CREATE POLICY "delivery_orders_read" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-orders' AND (
    (select public.app_role()) IN ('operation', 'principal')
    OR (
      (select public.app_role()) = 'partner'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.procurement_partner_id = (select public.app_partner_id())
      )
    )
    OR (
      (select public.app_role()) = 'supplier'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.supplier_id = (select public.app_supplier_id())
      )
    )
    OR (
      (select public.app_role()) = 'warehouse'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.warehouse_id = (select public.app_warehouse_id())
      )
    )
  )
);

DROP POLICY IF EXISTS "delivery_orders_write" ON storage.objects;
CREATE POLICY "delivery_orders_write" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-orders' AND (
    (select public.app_role()) IN ('operation', 'principal')
    OR (
      (select public.app_role()) = 'partner'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.procurement_partner_id = (select public.app_partner_id())
      )
    )
    OR (
      (select public.app_role()) = 'supplier'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.supplier_id = (select public.app_supplier_id())
      )
    )
    OR (
      (select public.app_role()) = 'warehouse'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.warehouse_id = (select public.app_warehouse_id())
      )
    )
  )
);

-- ── 7 · what a warehouse login can see ───────────────────────────────────────

-- The incoming list. Returns the warehouse's own name (the shell header needs
-- it), and one entry per open PO bound for it — with the four R1 numbers per
-- line and the line's product family so the wrong-item picker can be narrowed
-- WITHOUT handing the catalog over.
--
-- Deliberately absent from the payload: any price, any cost, the source order,
-- the supplier's contact details, every other warehouse. A warehouse sees what
-- it must count and nothing else.
create or replace function public.warehouse_incoming_pos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wh_id uuid;
  v_out   jsonb;
begin
  if public.app_role() <> 'warehouse' then
    raise exception 'forbidden: warehouse role required'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse'
      using errcode = '42501', detail = 'no_warehouse';
  end if;

  select jsonb_build_object(
    'warehouse', (select jsonb_build_object('id', w.id, 'name', w.name)
                    from warehouses w where w.id = v_wh_id),
    'pos', coalesce((
      select jsonb_agg(p order by p->>'po_id')
        from (
          select jsonb_build_object(
            'po_id',         po.id,
            'supplier_name', s.name,
            'eta_date',      po.eta_date,
            'sup_status',    po.sup_status,
            'lines', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id',             pol.id,
                       'sku',            pol.sku,
                       'qty',            pol.qty,
                       'received_qty',   pol.received_qty,
                       'damaged_qty',    pol.damaged_qty,
                       'wrong_item_qty', pol.wrong_item_qty,
                       'category',       public.claim_product_category(pol.sku)
                     ) order by pol.sku)
                from purchase_order_lines pol where pol.po_id = po.id
            ), '[]'::jsonb),
            -- A PO whose receipt is waiting must not offer a second form.
            'open_receipt_id', (
              select wr.id from warehouse_receipts wr
               where wr.po_id = po.id and wr.status = 'submitted' limit 1
            )
          ) as p
          from purchase_orders po
          join suppliers s on s.id = po.supplier_id
         where po.warehouse_id = v_wh_id
           and po.status = 'open'
        ) q
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$fn$;

-- What this warehouse has filed, and what became of it. The card's third
-- bullet — "their own open issues (R2 cases they reported)" — is answered
-- through the receipt link added in section 5, so a warehouse never needs read
-- access to supplier_claims itself.
create or replace function public.warehouse_my_receipts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wh_id uuid;
begin
  if public.app_role() <> 'warehouse' then
    raise exception 'forbidden: warehouse role required'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse'
      using errcode = '42501', detail = 'no_warehouse';
  end if;

  return coalesce((
    select jsonb_agg(r order by r->>'submitted_at' desc)
      from (
        select jsonb_build_object(
          'id',            wr.id,
          'po_id',         wr.po_id,
          'supplier_name', s.name,
          'do_number',     wr.do_number,
          'status',        wr.status,
          'lines',         wr.lines,
          'note',          wr.note,
          'submitted_at',  wr.submitted_at,
          'reviewed_at',   wr.reviewed_at,
          'return_reason', wr.return_reason,
          -- The issues this receipt raised, once ops checked it in. Only the
          -- three things the warehouse needs: what it was, how many, is it
          -- settled. No supplier correspondence, no money, no internal notes.
          'claims', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'claim_no',   sc.claim_no,
                     'claim_type', sc.claim_type,
                     'sku',        sc.sku,
                     'qty',        sc.qty,
                     'status',     sc.status
                   ) order by sc.claim_no)
              from supplier_claims sc where sc.warehouse_receipt_id = wr.id
          ), '[]'::jsonb)
        ) as r
        from warehouse_receipts wr
        join purchase_orders po on po.id = wr.po_id
        join suppliers s on s.id = po.supplier_id
       where wr.warehouse_id = v_wh_id
       order by wr.submitted_at desc
       limit 200
      ) q
  ), '[]'::jsonb);
end;
$fn$;

-- ── 8 · the warehouse files a receiving ──────────────────────────────────────
--
-- Validation mirrors `warehouseReceiptProblems` (packages/shared) and reuses
-- 0288's own helpers for the claim rules, so there is no third copy of the
-- evidence law anywhere.
create or replace function public.warehouse_submit_receipt(
  p_po_id        text,
  p_do_number    text,
  p_do_file_path text,
  p_note         text,
  p_lines        jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wh_id       uuid;
  v_uid         uuid;
  v_po          purchase_orders;
  v_line        jsonb;
  v_line_id     uuid;
  v_recv        int;
  v_damaged     int;
  v_wrong       int;
  v_type        text;
  v_pol         purchase_order_lines;
  v_reportable  int;
  v_counted     int := 0;
  v_clean       jsonb := '[]'::jsonb;
  v_receipt_id  uuid;
begin
  v_uid   := auth.uid();
  if public.app_role() <> 'warehouse' then
    raise exception 'forbidden: warehouse role required'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse'
      using errcode = '42501', detail = 'no_warehouse';
  end if;

  if length(btrim(coalesce(p_do_number, ''))) < 3 then
    raise exception 'a DO number is required'
      using errcode = '22023', detail = 'do_number_required';
  end if;
  if length(btrim(coalesce(p_do_file_path, ''))) = 0 then
    raise exception 'a photo of the signed DO is required'
      using errcode = '22023', detail = 'do_file_required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines required (at least one line)'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  -- The scope check and the "is it still open" check in one lookup: a PO for
  -- another warehouse is not found, exactly as if it did not exist.
  select * into v_po from purchase_orders
   where id = p_po_id and warehouse_id = v_wh_id
   for update;
  if not found then
    raise exception 'PO not found for this warehouse'
      using errcode = '42501', detail = 'po_not_found_or_cross_tenant';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', p_po_id
      using errcode = '22023', detail = 'po_not_open';
  end if;

  if exists (select 1 from warehouse_receipts
              where po_id = p_po_id and status = 'submitted') then
    raise exception 'a receiving for % is already waiting for Carres', p_po_id
      using errcode = 'P0001', detail = 'receipt_already_open';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_recv    := coalesce(nullif(v_line->>'received_now', '')::int, 0);
    v_damaged := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);

    if v_line_id is null then
      raise exception 'invalid line: missing id'
        using errcode = '22023', detail = 'invalid_line';
    end if;
    if v_recv < 0 or v_damaged < 0 or v_wrong < 0 then
      raise exception 'invalid line: negative quantity'
        using errcode = '22023', detail = 'invalid_line';
    end if;

    select * into v_pol from purchase_order_lines
     where id = v_line_id and po_id = p_po_id;
    if not found then
      raise exception 'PO line not found for id=%', v_line_id
        using errcode = '42P01', detail = 'po_line_not_found';
    end if;

    -- R1's per-delivery cap, asked here so the warehouse is told at the door
    -- rather than at ops's check-in an hour later.
    v_reportable := greatest(0, v_pol.qty - least(v_pol.qty, v_pol.received_qty));
    if v_recv + v_damaged + v_wrong > v_reportable then
      raise exception 'line % counts % units but the PO still owes %',
                      v_pol.sku, v_recv + v_damaged + v_wrong, v_reportable
        using errcode = 'P0001', detail = 'line_over_reported';
    end if;

    -- R2's evidence law, through 0288's own helpers.
    if v_damaged > 0 then
      if jsonb_array_length(public.supplier_claim_photo_entries(v_line->'damaged_photos', v_uid)) = 0 then
        raise exception 'damaged units on % need at least one photo', v_pol.sku
          using errcode = 'P0001', detail = 'damaged_photo_required';
      end if;
    end if;
    if v_wrong > 0 then
      v_type := nullif(btrim(coalesce(v_line->>'wrong_item_claim_type', '')), '');
      if v_type is null then
        raise exception 'wrong-item units on % need a claim type', v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_type_required';
      end if;
      if not public.supplier_claim_type_allowed(
                public.claim_product_category(v_pol.sku), v_type) then
        raise exception 'claim type % is not offered for %', v_type, v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_type_invalid';
      end if;
      if jsonb_array_length(public.supplier_claim_photo_entries(v_line->'wrong_item_photos', v_uid)) = 0 then
        raise exception 'wrong-item units on % need at least one photo', v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_photo_required';
      end if;
    end if;

    v_counted := v_counted + v_recv + v_damaged + v_wrong;

    -- Rebuild the payload from what the DATABASE read, never from what the
    -- client sent: the stored receipt is replayed later with elevated rights,
    -- so nothing unvalidated may survive into it.
    if v_recv + v_damaged + v_wrong > 0 then
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'id',                    v_line_id,
        'sku',                   v_pol.sku,
        'received_now',          v_recv,
        'damaged_qty',           v_damaged,
        'wrong_item_qty',        v_wrong,
        'wrong_item_claim_type', case when v_wrong > 0 then v_type else null end,
        'damaged_photos',        coalesce(v_line->'damaged_photos', '[]'::jsonb),
        'wrong_item_photos',     coalesce(v_line->'wrong_item_photos', '[]'::jsonb)
      ));
    end if;
  end loop;

  if v_counted = 0 then
    raise exception 'count at least one unit before sending this'
      using errcode = 'P0001', detail = 'nothing_counted';
  end if;

  insert into warehouse_receipts (
    po_id, warehouse_id, do_number, do_file_path, note, lines, submitted_by
  ) values (
    p_po_id, v_wh_id, btrim(p_do_number), btrim(p_do_file_path),
    nullif(btrim(coalesce(p_note, '')), ''), v_clean, v_uid
  ) returning id into v_receipt_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('%s filed a receiving with DO %s — waiting Carres check',
                 coalesce((select name from warehouses where id = v_wh_id), 'The warehouse'),
                 btrim(p_do_number)),
          'warehouse', v_uid);

  return jsonb_build_object('id', v_receipt_id, 'po_id', p_po_id, 'status', 'submitted');
end;
$fn$;

-- ── 9 · ops checks it in ─────────────────────────────────────────────────────
--
-- The ONE place the stored payload becomes stock. Note what this function does
-- NOT do: it does not touch purchase_order_lines, stock_balances,
-- ops_stock_items, order_supplier_threads or supplier_claims' business columns.
-- It reshapes and delegates. The only column it writes on a claim is the
-- receipt back-pointer, on rows the receive RPC created moments earlier in
-- this same transaction.
create or replace function public.warehouse_receipt_check_in(
  p_receipt_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_receipt   warehouse_receipts;
  v_uid       uuid;
  v_line      jsonb;
  v_pol       purchase_order_lines;
  v_payload   jsonb := '[]'::jsonb;
  v_before    uuid[];
  v_result    jsonb;
  v_linked    int;
begin
  v_uid := auth.uid();
  if not public.is_operation() then
    raise exception 'forbidden: operation or principal required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'submitted' then
    raise exception 'this receiving has already been reviewed'
      using errcode = '22023', detail = 'receipt_not_open';
  end if;

  -- Rebuild the receive payload. `received_now` is a DELTA, so the running
  -- total the RPC wants is computed HERE, against the line as it stands NOW —
  -- which is the whole reason the delta is what gets stored.
  for v_line in select * from jsonb_array_elements(v_receipt.lines) loop
    select * into v_pol from purchase_order_lines
     where id = (v_line->>'id')::uuid and po_id = v_receipt.po_id;
    if not found then
      raise exception 'PO line % is gone — send this receiving back and ask for a fresh count',
                      v_line->>'sku'
        using errcode = 'P0001', detail = 'po_line_not_found';
    end if;
    v_payload := v_payload || jsonb_build_array(jsonb_build_object(
      'id',                    v_line->>'id',
      'received_qty',          v_pol.received_qty + coalesce((v_line->>'received_now')::int, 0),
      'damaged_qty',           coalesce((v_line->>'damaged_qty')::int, 0),
      'wrong_item_qty',        coalesce((v_line->>'wrong_item_qty')::int, 0),
      'wrong_item_claim_type', v_line->>'wrong_item_claim_type',
      'damaged_photos',        coalesce(v_line->'damaged_photos', '[]'::jsonb),
      'wrong_item_photos',     coalesce(v_line->'wrong_item_photos', '[]'::jsonb)
    ));
  end loop;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_before
    from supplier_claims where po_id = v_receipt.po_id;

  -- THE receive engine. Everything R1-R4 built happens inside this one call.
  v_result := public.operation_receive_po_with_do(
    v_receipt.po_id, v_receipt.do_file_path, v_receipt.do_number, v_payload
  );

  update supplier_claims
     set warehouse_receipt_id = v_receipt.id
   where po_id = v_receipt.po_id
     and not (id = any(v_before))
     and warehouse_receipt_id is null;
  get diagnostics v_linked = row_count;

  update warehouse_receipts
     set status      = 'checked_in',
         reviewed_by = v_uid,
         reviewed_at = now(),
         updated_at  = now()
   where id = p_receipt_id;

  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Checked in %s from %s (DO %s)',
                 v_receipt.po_id,
                 coalesce((select name from warehouses where id = v_receipt.warehouse_id), 'the warehouse'),
                 v_receipt.do_number),
          v_receipt.po_id);

  return jsonb_build_object(
    'receipt_id',      p_receipt_id,
    'po_id',           v_receipt.po_id,
    'status',          'checked_in',
    'claims_linked',   v_linked,
    'receive',         v_result
  );
end;
$fn$;

-- ── 10 · ops sends it back ───────────────────────────────────────────────────
--
-- The reason is mandatory (CHECK + here). A review that can only approve is not
-- a review, and a rejection with no reason cannot be acted on by the person who
-- has to recount the pallet.
create or replace function public.warehouse_receipt_return(
  p_receipt_id uuid,
  p_reason     text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_receipt warehouse_receipts;
  v_uid     uuid;
begin
  v_uid := auth.uid();
  if not public.is_operation() then
    raise exception 'forbidden: operation or principal required'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'say what the warehouse must fix'
      using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'submitted' then
    raise exception 'this receiving has already been reviewed'
      using errcode = '22023', detail = 'receipt_not_open';
  end if;

  update warehouse_receipts
     set status        = 'returned',
         return_reason = btrim(p_reason),
         reviewed_by   = v_uid,
         reviewed_at   = now(),
         updated_at    = now()
   where id = p_receipt_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving with DO %s sent back to %s — %s',
                 v_receipt.do_number,
                 coalesce((select name from warehouses where id = v_receipt.warehouse_id), 'the warehouse'),
                 btrim(p_reason)),
          public.app_role(), v_uid);

  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'returned');
end;
$fn$;

-- ── 11 · grants ──────────────────────────────────────────────────────────────
--
-- `from public` and `from anon` are BOTH needed and neither alone does
-- anything (the lesson 0268 measured), and the grant back to `authenticated`
-- is what actually lets a signed-in caller through — the role gate inside each
-- body is the real boundary.

revoke execute on function public.warehouse_incoming_pos() from public, anon;
revoke execute on function public.warehouse_my_receipts() from public, anon;
revoke execute on function public.warehouse_submit_receipt(text, text, text, text, jsonb) from public, anon;
revoke execute on function public.warehouse_receipt_check_in(uuid) from public, anon;
revoke execute on function public.warehouse_receipt_return(uuid, text) from public, anon;

grant execute on function public.warehouse_incoming_pos() to authenticated;
grant execute on function public.warehouse_my_receipts() to authenticated;
grant execute on function public.warehouse_submit_receipt(text, text, text, text, jsonb) to authenticated;
grant execute on function public.warehouse_receipt_check_in(uuid) to authenticated;
grant execute on function public.warehouse_receipt_return(uuid, text) to authenticated;
grant execute on function public.app_warehouse_id() to authenticated;

-- ── 12 · sanity ──────────────────────────────────────────────────────────────

do $$
declare
  v_n int;
  v_pol_names text[];
begin
  -- exactly one copy of each new function (no ghost overload)
  select count(*) into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('warehouse_incoming_pos','warehouse_my_receipts',
                       'warehouse_submit_receipt','warehouse_receipt_check_in',
                       'warehouse_receipt_return','app_warehouse_id');
  if v_n <> 6 then raise exception 'sanity: expected 6 R6 functions, found %', v_n; end if;

  -- the receive engine is still a single implementation
  select count(*) into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'operation_receive_po_with_do';
  if v_n <> 1 then raise exception 'sanity: % copies of the receive RPC', v_n; end if;

  -- R2's guard is untouched
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'purchase_order_lines' and t.tgname = 'po_line_issue_requires_claim'
  ) then raise exception 'sanity: R2 claim guard is missing'; end if;

  -- anon may not execute any of them
  if has_function_privilege('anon', 'public.warehouse_submit_receipt(text, text, text, text, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.warehouse_receipt_check_in(uuid)', 'execute') then
    raise exception 'sanity: anon can execute an R6 function';
  end if;
  if not has_function_privilege('authenticated', 'public.warehouse_submit_receipt(text, text, text, text, jsonb)', 'execute') then
    raise exception 'sanity: authenticated lost execute on warehouse_submit_receipt';
  end if;

  -- THE claim of this card: no table policy anywhere names the warehouse role,
  -- so a warehouse login reaches nothing except the five RPCs above.
  select coalesce(array_agg(schemaname || '.' || tablename || '.' || policyname), '{}')
    into v_pol_names
    from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') like '%''warehouse''%'
          or coalesce(with_check, '') like '%''warehouse''%');
  if array_length(v_pol_names, 1) is not null then
    raise exception 'sanity: warehouse role appears in table policies: %', v_pol_names;
  end if;

  -- and the storage branch it DOES have is scoped, never blanket
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'delivery_orders_write'
       and with_check like '%app_warehouse_id%'
  ) then raise exception 'sanity: warehouse storage write branch missing or unscoped'; end if;

  -- the JWT hook really carries the new claim
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'custom_access_token_hook'
       and p.prosrc like '%warehouse_id%'
  ) then raise exception 'sanity: auth hook does not mint warehouse_id'; end if;
end $$;
