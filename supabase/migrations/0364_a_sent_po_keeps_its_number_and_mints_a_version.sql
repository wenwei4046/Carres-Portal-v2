-- ============================================================================
-- 0364 — a sent PO keeps its number and mints a version  (Jess, 2026-08-18)
--
-- THE RULING (purchasing/MASTER.md §4 FROZEN RULES, approved 2026-08-18,
-- overturning "a sent PO is never edited · there are no revisions to keep"):
--
--   A sent PO is not overwritten — it is REVISED. Cancel-and-reissue puts TWO
--   numbers for ONE job in the factory's hands, and a factory reads two
--   numbers as two jobs. A change KEEPS the number and mints
--   `PO-2041 · Version 2`: the prior version is snapshotted, the reason and
--   the author are stored, and the PO drops back to `Issued` until the new
--   version's share is confirmed. THE FLOOR — no line may be revised BELOW
--   what has already been received; the excess goes back through a Purchase
--   Return first. Adding items is still a NEW PO; stopping is still the whole
--   PO (Cancel).
--
-- 2990s proves both halves in production: `PurchaseOrderDetail.tsx:621`
-- snapshots the prior version into `po_revisions`, and approve-po 409s
-- `received_floor` (`so-revision.ts` · `ReceivedFloorError`). The POWER is
-- copied — snapshot-then-apply, floor-before-anything — never the assumptions
-- (their revision rides an SO-amendment engine; ours is the buyer's own act).
--
-- WHAT THIS FILE DOES
--   1 · `purchase_orders.version` (default 1) — the version the factory holds.
--       `revised_at` — when the current version was minted; NULL = never
--       revised. "Version N not yet shared" is DERIVED: `revised_at` newer
--       than the latest `po_sends.sent_at`. No status enum moves — `Issued`
--       is a work-state word, and communication is never a STATUS (0317).
--   2 · `po_revisions.reason` — why the document changed. NULL on 0312's
--       share-minted snapshots, REQUIRED on a revise mint. The store is the
--       0312 table on purpose: one version history, not two.
--   3 · `purchasing_revise_po(p_po_id, p_reason, p_lines)` — the ONE door.
--       Reason required IN SQL. Author from `auth.uid()`. Existing lines
--       only: qty (floored at `received_qty`) and line destination. Snapshots
--       the PRIOR version in 0312's exact snapshot shape, so
--       `purchasing_record_send`'s changed-since-last-send comparison keeps
--       working unmodified. Appends `po_history`, writes `audit_log`.
--   4 · The silent doors close on a SHARED PO: a row trigger refuses a direct
--       qty / line-destination change once any `po_sends` row exists, unless
--       the revise door set its transaction-local flag. This is the Deliver To
--       after-send rule (owner-locked 2026-08-14) made structural — "a plain
--       overwrite is not an accepted completion." Before any send, the 0311
--       doors behave exactly as today. (KNOWN, REPORTED LIMIT: the guard also
--       refuses a SPLIT on a shared PO — revise edits whole existing lines and
--       cannot split; teaching it to split is its own card.)
--
-- PO-line quantities stay RPC-only (0316): this door is a SECURITY DEFINER
-- function owned by postgres, like every legitimate writer 0316 counted.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · the version fact
-- ---------------------------------------------------------------------------
alter table public.purchase_orders
  add column if not exists version integer not null default 1;
comment on column public.purchase_orders.version is
  '0364: which version of this document the factory holds. 1 at issue; a revise mints the next. The panel prints `PO-2041 · Version 2` from version > 1; the number NEVER changes — that is the whole ruling.';

alter table public.purchase_orders
  add column if not exists revised_at timestamptz;
comment on column public.purchase_orders.revised_at is
  '0364: when the CURRENT version was minted; NULL = never revised. "Version N has not reached the supplier" is DERIVED — revised_at newer than the latest po_sends.sent_at — never stored.';

alter table public.po_revisions
  add column if not exists reason text;
comment on column public.po_revisions.reason is
  '0364: why the document changed. REQUIRED on a revise mint (the ruling: the reason and the author are stored); NULL on 0312''s share-minted snapshots, which record a hand-over, not a change.';

-- ---------------------------------------------------------------------------
-- 2 · the one door
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_revise_po(
  p_po_id  text,
  p_reason text,
  p_lines  jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role      app_role;
  v_uid       uuid;
  v_actor     text;
  v_reason    text;
  v_po        purchase_orders;
  v_el        jsonb;
  v_line_id   uuid;
  v_qty       integer;
  v_dest      uuid;
  v_has_dest  boolean;
  v_line      purchase_order_lines;
  v_changes   text[] := '{}';
  v_updates   jsonb  := '[]'::jsonb;
  v_snap      jsonb;
  v_last_rev  integer;
  v_rev       po_revisions;
  v_version   integer;
  v_dest_name text;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  -- Reason is required IN SQL — a version without a why is a version nobody
  -- can answer for (the ruling stores the reason and the author).
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A revision must say why'
      using errcode = '22023', detail = 'reason_required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %, not open', p_po_id, v_po.status
      using errcode = '22023', detail = 'po_not_open';
  end if;

  -- ── PASS 1 · validate everything and collect the intended updates.
  --    THE FLOOR SPEAKS BEFORE ANY WRITE (2990s' discipline): a violation on
  --    line 3 must leave lines 1 and 2 untouched.
  for v_el in select * from jsonb_array_elements(p_lines) loop
    begin
      v_line_id := (v_el ->> 'line_id')::uuid;
    exception when others then
      raise exception 'line_id must be a uuid'
        using errcode = '22023', detail = 'invalid_input';
    end;

    if v_el -> 'qty' is null or jsonb_typeof(v_el -> 'qty') <> 'number' then
      raise exception 'qty is required per line'
        using errcode = '22023', detail = 'invalid_input';
    end if;
    v_qty := (v_el ->> 'qty')::integer;

    v_has_dest := v_el ? 'destination_id';
    v_dest := null;
    if v_has_dest and jsonb_typeof(v_el -> 'destination_id') <> 'null' then
      begin
        v_dest := (v_el ->> 'destination_id')::uuid;
      exception when others then
        raise exception 'destination_id must be a uuid or null'
          using errcode = '22023', detail = 'invalid_input';
      end;
      if not exists (select 1 from purchasing_destinations d where d.id = v_dest) then
        raise exception 'destination % is not in the registry', v_dest
          using errcode = '22023', detail = 'invalid_input';
      end if;
    end if;

    select * into v_line from purchase_order_lines
     where id = v_line_id and po_id = p_po_id
     for update;
    if not found then
      -- Existing lines ONLY: adding items is a NEW PO (the ruling), so an
      -- unknown line id is refused, never inserted.
      raise exception 'PO line % is not on %', v_line_id, p_po_id
        using errcode = '22023', detail = 'po_line_not_found';
    end if;

    if v_qty is null or v_qty < 1 then
      -- Stopping is still the whole PO (Cancel) — a zero is a line silently
      -- stopped, and the ruling closed that door.
      raise exception 'qty must be at least 1'
        using errcode = '22023', detail = 'invalid_input';
    end if;

    -- THE FLOOR. Goods already received cannot be un-ordered by editing a
    -- document; the excess goes back through a Purchase Return first.
    if v_qty < v_line.received_qty then
      raise exception '% cannot go below the % already received (asked for %)',
          v_line.sku, v_line.received_qty, v_qty
        using errcode = 'P0001', detail = 'received_floor';
    end if;

    if v_qty is distinct from v_line.qty then
      v_changes := v_changes
        || format('%s qty %s → %s', v_line.sku, v_line.qty, v_qty);
    end if;
    if v_has_dest and (v_dest is distinct from v_line.destination_id) then
      v_dest_name := coalesce(
        (select d.name from purchasing_destinations d where d.id = v_dest),
        'PO default');
      v_changes := v_changes
        || format('%s → %s', v_line.sku, v_dest_name);
    end if;

    v_updates := v_updates || jsonb_build_array(jsonb_build_object(
      'line_id', v_line_id,
      'qty', v_qty,
      'has_dest', v_has_dest,
      'destination_id', v_dest
    ));
  end loop;

  if coalesce(array_length(v_changes, 1), 0) = 0 then
    -- An identical document is not a new version: minting one would hand the
    -- factory a Version 2 that asks them to change nothing.
    raise exception 'Nothing changed'
      using errcode = '22023', detail = 'nothing_changed';
  end if;

  -- ── PASS 2 · snapshot the PRIOR version, before any write.
  --    0312's EXACT shape — eta_date · destination_id · every line — so
  --    purchasing_record_send's "changed since the last snapshot" comparison
  --    keeps working with no second spelling of the document (Law D).
  select jsonb_build_object(
           'eta_date',       v_po.eta_date,
           'destination_id', v_po.destination_id,
           'lines', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'sku', l.sku, 'qty', l.qty, 'destination_id', l.destination_id
                    ) order by l.sku, l.id)
               from purchase_order_lines l where l.po_id = p_po_id), '[]'::jsonb)
         ) into v_snap;

  select coalesce(max(rev_no), 0) into v_last_rev
    from po_revisions where po_id = p_po_id;

  insert into po_revisions (po_id, rev_no, snapshot, reason, created_by)
  values (p_po_id, v_last_rev + 1, v_snap, v_reason, v_uid)
  returning * into v_rev;

  -- ── PASS 3 · apply. The transaction-local flag lets these writes through
  --    the shared-PO guard below; nothing else ever sets it.
  perform set_config('carres.po_revise', 'true', true);

  for v_el in select * from jsonb_array_elements(v_updates) loop
    if (v_el ->> 'has_dest')::boolean then
      update purchase_order_lines
         set qty = (v_el ->> 'qty')::integer,
             destination_id = (v_el ->> 'destination_id')::uuid
       where id = (v_el ->> 'line_id')::uuid;
    else
      update purchase_order_lines
         set qty = (v_el ->> 'qty')::integer
       where id = (v_el ->> 'line_id')::uuid;
    end if;
  end loop;

  v_version := coalesce(v_po.version, 1) + 1;
  update purchase_orders
     set version = v_version,
         revised_at = now(),
         updated_at = now()
   where id = p_po_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  -- Old → new, in the record (0325's discipline). The ruling's word is
  -- `Revised`; `Version` here is the DOCUMENT changing, which is exactly what
  -- 0317 reserved the word for.
  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Revised to Version %s — %s — %s',
                 v_version, array_to_string(v_changes, ' · '), v_reason),
          v_role, v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — revised to Version %s', p_po_id, v_version),
          p_po_id);

  return jsonb_build_object(
    'po_id', p_po_id,
    'version', v_version,
    'rev_no', v_rev.rev_no,
    'changes', to_jsonb(v_changes)
  );
end;
$function$;

revoke all on function public.purchasing_revise_po(text, text, jsonb) from public, anon;
grant execute on function public.purchasing_revise_po(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3 · the silent doors close on a SHARED PO
-- ---------------------------------------------------------------------------
-- The Deliver To after-send rule (owner-locked 2026-08-14): after any supplier
-- send a change is still possible, but never silently — it routes through the
-- revision mint. The guard fires only when a po_sends row exists, so every
-- pre-share flow (issue, 0311's pickers, splits before a share) is untouched.
create or replace function public.po_line_change_needs_revision()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if (new.qty is distinct from old.qty
      or new.destination_id is distinct from old.destination_id)
     and coalesce(current_setting('carres.po_revise', true), '') <> 'true'
     and exists (select 1 from po_sends s where s.po_id = new.po_id)
  then
    raise exception 'A shared PO changes through Revise.'
      using errcode = '22023', detail = 'sent_po_needs_revision';
  end if;
  return new;
end;
$function$;

drop trigger if exists purchase_order_lines_sent_guard on public.purchase_order_lines;
create trigger purchase_order_lines_sent_guard
  before update of qty, destination_id on public.purchase_order_lines
  for each row execute function public.po_line_change_needs_revision();

-- ---------------------------------------------------------------------------
-- 4 · sanity — the door is one door and the locks all held
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_revise_po') <> 1 then
    raise exception '0364: purchasing_revise_po must have exactly ONE signature';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'purchase_orders'
       and column_name = 'version'
  ) then
    raise exception '0364: purchase_orders.version is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'po_revisions'
       and column_name = 'reason'
  ) then
    raise exception '0364: po_revisions.reason is missing';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'purchase_order_lines' and t.tgname = 'purchase_order_lines_sent_guard'
  ) then
    raise exception '0364: the shared-PO guard trigger is missing';
  end if;
  -- 0312's locks must survive this file: SELECT-only policies, no write grant.
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname in ('po_sends', 'po_revisions') and p.polcmd <> 'r'
  ) then
    raise exception '0364: po_sends/po_revisions must carry SELECT policies only';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_name in ('po_sends', 'po_revisions')
       and grantee in ('anon', 'authenticated')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception '0364: anon/authenticated must hold no write grant on po_sends/po_revisions';
  end if;
end $$;
