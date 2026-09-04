-- 0424 · A Manual Purchase has no number — only its PO does
-- (PURCHASING CARD 08, owner-approved 2026-09-04)
--
-- THE CORRECTION. Manual Purchase is an internal way to prepare and approve
-- a purchase. It is not a second supplier document, so it carries no second
-- operator-facing document number. Both buying doors produce the same formal
-- Purchase Order:
--
--     SO Batch Purchase ─┐
--                        ├─ Issue PO → PO-YYYYMMDD-RRRR
--     Manual Purchase ───┘
--
-- Before `Issue PO` a Manual Purchase has NO visible document number; after
-- it, the only visible purchasing identity is the actual `PO No`. The
-- canonical invisible identity is `purchase_requests.id` (the UUID), which
-- is never printed.
--
-- WHAT THIS MIGRATION DOES — non-destructive, schema only:
--   1 · `purchase_requests.req_no` loses its MPR allocator default and its
--       NOT NULL: a NEW Manual Purchase is born without any request number.
--   2 · Every existing stored `REQ-…` / `MPR-…` value stays EXACTLY as it
--       is — legacy compatibility data, never displayed, never renumbered.
--   3 · `purchasing_decide_request` and `purchasing_move_request_destination`
--       stop writing MPR into new audit rows: new audit actions use plain
--       business wording and reference the request UUID internally.
--       Historical audit rows are untouched.
--   4 · `purchasing_create_request` / `_with_lines` need no body change:
--       they only RETURN `req_no`, which is simply null once the default is
--       gone; the API tolerates both shapes.
--
-- WHAT IT MUST NEVER DO: delete/update/renumber a transaction, drop
-- `purchase_requests`, change purpose/quantity/approval/price/destination/
-- PO rules, alter the formal PO allocator, or expose a UUID as a
-- replacement document number.

-- 1 · The number series retires for NEW rows; history keeps its values.
alter table public.purchase_requests
  alter column req_no drop default;
alter table public.purchase_requests
  alter column req_no drop not null;
comment on column public.purchase_requests.req_no is
  'LEGACY COMPATIBILITY ONLY (Card 08, 2026-09-04). Historical rows keep their stored REQ-####/MPR-YYYYMMDD-RRRR value exactly as minted (0359/0381/0401); new rows are NULL — a Manual Purchase has no visible document number, before Issue PO nothing shows and after it only the actual PO No does. The canonical identity is purchase_requests.id. No operator-facing surface may consume this column.';

-- 2 · The decision door — same gates, same atomicity, plain audit words.
--     Byte-for-byte the production body except the two audit inserts and
--     the returned `req_no` (kept as a key for the compatible app; null on
--     new rows).
create or replace function public.purchasing_decide_request(
  p_id uuid, p_decision text, p_reason text default null, p_cuts jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_req  purchase_requests%rowtype;
  v_cut  jsonb;
  v_line purchase_demands%rowtype;
  v_qty  int;
begin
  if p_decision is null or p_decision not in ('approve', 'refuse') then
    raise exception 'decision must be approve or refuse'
      using errcode = '22023', detail = 'invalid_decision';
  end if;

  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;

  if p_decision = 'refuse' then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'a refusal needs a reason'
        using errcode = '22023', detail = 'reason_required';
    end if;
    if p_cuts is not null then
      -- Cutting is deciding what goes FORWARD; a refusal forwards nothing.
      raise exception 'a refusal carries no cuts'
        using errcode = '22023', detail = 'cuts_on_refusal';
    end if;

    update purchase_requests
       set refused_at = now(), refused_by = auth.uid(),
           refuse_reason = btrim(p_reason)
     where id = p_id;

    -- Card 08 §3.7 — plain business wording; the internal reference is the
    -- request UUID, never a request number, and it is never printed.
    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase refused: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                              'decision', 'refused');
  end if;

  -- APPROVE. Cuts first, so a bad cut refuses the whole act atomically.
  if p_cuts is not null then
    if jsonb_typeof(p_cuts) <> 'array' then
      raise exception 'cuts must be an array'
        using errcode = '22023', detail = 'invalid_cuts';
    end if;
    for v_cut in select * from jsonb_array_elements(p_cuts) loop
      select * into v_line from purchase_demands
       where id = (v_cut ->> 'id')::uuid and request_id = p_id
       for update;
      if not found then
        raise exception 'cut names a line this request does not have'
          using errcode = '22023', detail = 'unknown_line';
      end if;
      v_qty := (v_cut ->> 'qty')::int;
      if v_qty is null or v_qty < 0 or v_qty > v_line.qty then
        raise exception 'cut for % must be between 0 and %', v_line.sku, v_line.qty
          using errcode = '22023', detail = 'invalid_cut_qty';
      end if;
      update purchase_demands set approved_qty = v_qty where id = v_line.id;
    end loop;
  end if;

  update purchase_requests
     set approved_at = now(), approved_by = auth.uid()
   where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          'Purchase approved',
          p_id::text);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                            'decision', 'approved');
end;
$$;

-- 3 · The Deliver To door (0421) — same locks, same refusals, plain words.
create or replace function public.purchasing_move_request_destination(
  p_id uuid, p_destination_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role     app_role;
  v_req      purchase_requests%rowtype;
  v_old_name text;
  v_new_name text;
  v_live     int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_destination_id is null then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.refused_at is not null then
    raise exception 'request is refused' using errcode = '22023', detail = 'request_refused';
  end if;

  -- Lock the lines too: an issue running at the same moment must see either
  -- the old destination on every row or the new one on every row.
  perform 1 from purchase_demands where request_id = p_id for update;

  if exists (
    select 1 from purchase_demands where request_id = p_id and po_id is not null
  ) then
    raise exception 'request is already ordered' using errcode = '22023', detail = 'request_ordered';
  end if;

  select count(*) into v_live
    from purchase_demands where request_id = p_id and cancelled_at is null;
  if v_live = 0 and exists (select 1 from purchase_demands where request_id = p_id) then
    raise exception 'request is not going ahead' using errcode = '22023', detail = 'request_closed';
  end if;

  select name into v_new_name
    from purchasing_destinations where id = p_destination_id and active;
  if not found then
    if exists (select 1 from purchasing_destinations where id = p_destination_id) then
      raise exception 'destination is closed' using errcode = '22023', detail = 'inactive_destination';
    end if;
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  if v_req.destination_id = p_destination_id then
    -- Nothing moves; nothing is written. Not a refusal.
    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                              'destination_id', p_destination_id, 'moved', false);
  end if;

  select name into v_old_name from purchasing_destinations where id = v_req.destination_id;

  update purchase_requests set destination_id = p_destination_id where id = p_id;
  update purchase_demands
     set destination_id = p_destination_id
   where request_id = p_id and cancelled_at is null;

  -- Card 08 §3.7 — the act in plain words, the UUID as the internal ref.
  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          format('Deliver To changed from %s to %s',
                 coalesce(v_old_name, v_req.destination_id::text), v_new_name),
          p_id::text);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                            'destination_id', p_destination_id, 'moved', true,
                            'previous_destination_id', v_req.destination_id);
end;
$$;

-- ─── VERIFY (read-only; run after apply) ────────────────────────────────────
--   select column_default, is_nullable
--     from information_schema.columns
--    where table_name = 'purchase_requests' and column_name = 'req_no';
--   -- EXPECT: column_default null · is_nullable YES
--
--   select prosrc ~ 'req_no' from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'purchasing_decide_request';
--   -- EXPECT: true only through the returned compatibility key; the audit
--   --         inserts write 'Purchase approved' / 'Purchase refused: …'
--   --         with ref = the request UUID.
--
--   -- Historical rows are untouched:
--   select count(*) = 0 from purchase_requests
--    where req_no is not null and req_no !~ '^(REQ|MPR)-';
--   -- EXPECT: true (every stored number is still a stored number)
