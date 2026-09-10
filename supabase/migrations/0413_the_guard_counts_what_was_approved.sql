-- ---------------------------------------------------------------------------
-- 0413 · THE OVER-ISSUE GUARD COUNTS WHAT WAS APPROVED, NOT WHAT WAS ASKED
--
-- Owner: YH, 2026-09-01. Field-guide defect 37.
--
-- `purchasing_demand_record_issue` (0320) is the ONLY door a demand's
-- `issued_qty` can move through — `purchase_demands` has no write policy at
-- all, so PostgREST cannot reach it. That makes this function the real
-- protection against ordering more than was agreed.
--
-- It was not protecting that. The guard read:
--
--     if v_d.issued_qty + p_qty > v_d.qty then
--
-- `qty` is the ORIGINAL ASK. The approver's decision lives in `approved_qty`,
-- and 0359 already wrote the law into the column's own comment:
--
--     "The approver's cut. NULL = approved as asked. Issue acts on
--      coalesce(approved_qty, qty); the original ask stays in qty."
--
-- So the guard contradicted the documented rule it was meant to enforce.
-- Approve 2 as 1 and the database would happily let a caller issue both units:
-- the cut existed in the record, and nothing at the boundary encoded it.
--
-- ⛔ NO MONEY HAS MOVED WRONGLY, AND THAT IS NOT THE POINT. Today the API is
-- the only caller and it respects the cut (`purchasing_issue_pos_batch` filters
-- on the approved number), so the hole has never been walked through. A guard
-- that is correct only because the layer above it happens to be correct is not
-- a guard — it is a comment. 0316's ruling that these quantities are RPC-only
-- exists precisely so the arithmetic and the claim live together HERE.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
--
-- One comparison and the number in its message. Everything else in the
-- function is reproduced verbatim from 0320: the role gate, the FOR UPDATE
-- that makes two simultaneous Issue presses queue rather than both reading
-- `issued_qty = 0`, the cancelled check, the first-PO-keeps-the-link rule,
-- and the returned shape.
--
-- ⭐ THE MESSAGE REPORTS THE SAME FIGURE IT JUDGED BY. The refusal already
-- carried "how many are actually left" rather than a bare failure — that only
-- stays true if the remainder it prints is measured against the same ceiling
-- the test used. Printing `qty - issued_qty` under a check against
-- `approved_qty` would tell an operator there are units left that the door
-- will refuse a second time.
--
-- ⭐ A LINE CUT TO ZERO REFUSES EVERY TAKE. `approved_qty = 0` is a real
-- decision — 0359's CHECK admits it and 0287 states that 0 means cut — so the
-- ceiling becomes 0 and any `p_qty >= 1` is over-issue. That is the intent:
-- there is nothing to buy on that line. The browser already treats such a line
-- as satisfied rather than outstanding (the status arithmetic in
-- `packages/shared/src/manual-purchase.ts`), so the two layers now agree.
--
-- `remaining_qty` — the GENERATED column, `qty - issued_qty` — is deliberately
-- left alone. It is indexed, it is read as a column, and changing a stored
-- generated expression rewrites the table. The governed remainder that honours
-- the cut is `manualPurchaseLineRemainingOf`, and every surface that shows a
-- number to a human already calls it.
-- ---------------------------------------------------------------------------

create or replace function public.purchasing_demand_record_issue(
  p_id    uuid,
  p_qty   int,
  p_po_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_d    purchase_demands;
  -- The ceiling this act is judged against: the approver's number, falling
  -- back to the ask while nobody has decided. Named once, used twice, so the
  -- test and the message can never drift apart.
  v_ceiling int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  -- FOR UPDATE, so two operators pressing Issue in the same second queue rather
  -- than both reading `issued_qty = 0` and both writing 2.
  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'demand is cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  v_ceiling := coalesce(v_d.approved_qty, v_d.qty);

  if v_d.issued_qty + p_qty > v_ceiling then
    -- NAMED, and it carries both numbers: "taking twice cannot over-draw" is
    -- the property, and an operator who meets it must be told what is actually
    -- left rather than that something went wrong.
    raise exception 'demand % has only % left, cannot take %',
      p_id, greatest(0, v_ceiling - v_d.issued_qty), p_qty
      using errcode = 'P0001', detail = 'over_issue';
  end if;

  update purchase_demands
     set issued_qty = issued_qty + p_qty,
         -- The FIRST purchase order to take part of this demand keeps the link;
         -- a second one does not overwrite it. The link is a pointer to where
         -- the goods went first, and `purchase_order_lines` is the full record.
         po_id      = coalesce(po_id, p_po_id),
         ordered_at = case
                        when po_id is null and p_po_id is not null then now()
                        else ordered_at
                      end
   where id = p_id;

  select * into v_d from purchase_demands where id = p_id;
  return jsonb_build_object(
    'id',        p_id,
    'issued',    v_d.issued_qty,
    'remaining', v_d.remaining_qty
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Grants — both directions, or they prove nothing. `create or replace` keeps
-- the existing ACL, but 0320 states them explicitly and a replacement that
-- goes quiet about them reads as a narrowing that did not happen.
-- ---------------------------------------------------------------------------
revoke all on function public.purchasing_demand_record_issue(uuid, int, text) from public;
revoke all on function public.purchasing_demand_record_issue(uuid, int, text) from anon;
grant execute on function public.purchasing_demand_record_issue(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sanity — aborts the migration rather than shipping a lie.
--
-- NOTHING HERE WRITES A ROW (0319's discipline). Both assertions read the
-- CATALOGUE, so the proof costs nothing and depends on no rollback. The
-- ARITHMETIC is proved by the API's own suite, against the door.
-- ---------------------------------------------------------------------------
do $$
begin
  -- The column the guard now reads must exist, or the function would fail at
  -- run time on the one path nobody exercises until it matters.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'purchase_demands'
       and column_name  = 'approved_qty'
  ) then
    raise exception '0413: purchase_demands.approved_qty is missing — apply 0359 first';
  end if;

  -- And the replacement must actually be the one now installed.
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'purchasing_demand_record_issue'
       and pg_get_functiondef(p.oid) like '%coalesce(v_d.approved_qty, v_d.qty)%'
  ) then
    raise exception '0413: the over-issue guard was not replaced';
  end if;
end $$;
