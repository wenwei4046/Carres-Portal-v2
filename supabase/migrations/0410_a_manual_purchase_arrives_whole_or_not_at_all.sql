-- 0410_a_manual_purchase_arrives_whole_or_not_at_all.sql
--
-- A MANUAL PURCHASE ARRIVES WHOLE, OR NOT AT ALL.
--
-- THE BUG. Typing a Manual Purchase with five lines is SIX separate saves from
-- the browser: one `POST /purchasing/requests` for the header, then one
-- `POST /purchasing/requests/:id/lines` per line, in a loop
-- (`OperationManualPurchase.tsx`). Each is its own transaction.
--
-- Line 3 fails — an unknown SKU, a supplier the catalog does not hold, a
-- dropped connection — and the loop stops. The header is already committed.
-- Lines 1 and 2 are already committed. What is left in `purchase_requests` is
-- a Manual Purchase that says five items were asked for and holds two, with
-- nothing on any screen saying so and no door to finish it or void it. The
-- operator saw an error on a form and has no way to know a half-record exists.
--
-- It then travels: the Register lists it, an approver can Approve it, and the
-- issue door will raise a Purchase Order for the two lines that landed.
--
-- THE BROWSER CANNOT FIX THIS. A retry loop, a cleanup call on failure, a
-- confirmation dialog — each is a second client-side transaction that can
-- itself fail, and the window it leaves open is the same window. The only
-- place a group of writes can be made all-or-nothing is inside one database
-- transaction, which is what a plpgsql function body is.
--
-- SO Batch Purchase — the same act, one door over — has been one transaction
-- since it was written (`purchasing_issue_pos_batch`). This gives the manual
-- lane the same guarantee, in the same shape.
--
-- ---- WHAT THIS DOES NOT DO -------------------------------------------------
--
-- It writes NO new rule. `purchasing_create_request` (0401) and
-- `purchasing_create_demand` (0401) are CALLED, unchanged and unread — every
-- purpose gate, every structured-For check, the derived supplier, the
-- destination check and the per-line refusals all still run, in their own
-- bodies, in the order they already ran. This function only decides that they
-- share one transaction.
--
-- That is deliberate, and it is the lane's own pattern: to change what a
-- mature function guarantees, wrap it — never re-type its body, because a copy
-- is a second truth that drifts. Nothing here is a re-implementation, so there
-- is nothing here to drift.
--
-- It grants NO new authority. Both inner functions are SECURITY DEFINER and
-- both open by asking `app_role()`; a caller who could not create a request
-- before still cannot create one now, and is refused by the same line of the
-- same function with the same 42501.
--
-- ---- AND THE EMPTY REQUEST IS REFUSED --------------------------------------
--
-- A Manual Purchase with no lines is the orphan this migration exists to
-- delete. It is refused here rather than tolerated, so the record cannot be
-- created empty by any caller. The browser refuses it too, which is where the
-- operator reads about it — but a screen is not a rule.

-- ---------------------------------------------------------------------
-- 1. The whole-request door
-- ---------------------------------------------------------------------

create or replace function public.purchasing_create_request_with_lines(
  p_purpose             text,
  p_destination_id      uuid,
  p_why                 text default null,
  p_required_by         date default null,
  p_for_service_case_id uuid default null,
  p_for_staff_user_id   uuid default null,
  p_for_subsidiary_name text default null,
  p_lines               jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_header   jsonb;
  v_id       uuid;
  v_line     jsonb;
  v_one      jsonb;
  v_line_ids jsonb := '[]'::jsonb;
begin
  -- A request with no lines is the half-record this door exists to prevent.
  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'a manual purchase needs at least one line'
      using errcode = '22023', detail = 'lines_required';
  end if;

  -- THE HEADER, through its own door. Every purpose rule, the `why` rule and
  -- the three structured-For rules run inside `purchasing_create_request`.
  v_header := public.purchasing_create_request(
    p_purpose, p_destination_id, p_why, p_required_by,
    p_for_service_case_id, p_for_staff_user_id, p_for_subsidiary_name
  );
  v_id := (v_header ->> 'id')::uuid;

  -- THE LINES, through their own door, in the order they were typed. Any
  -- refusal raised in here aborts this function, and the header inserted above
  -- goes with it — that is the whole point of this file.
  --
  -- The destination and the purpose come from the HEADER, never from the line
  -- payload. `purchasing_create_demand` refuses a line that contradicts its
  -- request (`destination_mismatch` / `purpose_mismatch`), so passing the
  -- header's own values removes a way to be refused for a fact nobody was
  -- asked about twice.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_one := public.purchasing_create_demand(
      v_line ->> 'sku',
      (v_line ->> 'qty')::int,
      p_destination_id,
      nullif(v_line ->> 'required_by', '')::date,
      v_line ->> 'remark',
      p_purpose,
      v_id
    );
    v_line_ids := v_line_ids || jsonb_build_array(v_one ->> 'id');
  end loop;

  -- The header door's own answer, plus what was written under it. The browser
  -- reads `id` and `req_no` exactly as it did from the header-only call.
  return v_header || jsonb_build_object('line_ids', v_line_ids);
end;
$fn$;

revoke execute on function
  public.purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function
  public.purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb)
  to authenticated;

comment on function
  public.purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb) is
  '0410: one transaction for a whole Manual Purchase. Calls 0401 purchasing_create_request and purchasing_create_demand unchanged, so every gate still runs in its own body; this function only makes them all-or-nothing. Refuses a request with no lines. Grants no authority the two inner doors do not already grant.';

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'purchasing_create_request_with_lines';
--   -- EXPECT: one row. Absent = this migration never ran.
--
--   -- The two inner doors are untouched by this file:
--   select p.proname, p.prosecdef from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('purchasing_create_request', 'purchasing_create_demand')
--    order by 1;
--   -- EXPECT: both present, both prosecdef = true
--
--   -- NEGATIVE CONTROL — no lines is refused, and nothing is written:
--   --   select purchasing_create_request_with_lines('ready_stock', '<dest>');
--   --   EXPECT: ERROR (lines_required)
--
--   -- NEGATIVE CONTROL — THE WHOLE POINT. A good line followed by a bad one
--   -- must leave NOTHING behind. Run it inside an explicit transaction and
--   -- roll back; compare the count before and after the failed call:
--   --   begin;
--   --   select count(*) from purchase_requests;            -- note it
--   --   select purchasing_create_request_with_lines('ready_stock', '<dest>',
--   --     p_lines := '[{"sku":"<a real sku>","qty":1},
--   --                  {"sku":"NO-SUCH-SKU","qty":1}]'::jsonb);
--   --   -- EXPECT: ERROR (unknown_sku)
--   --   select count(*) from purchase_requests;            -- EXPECT: unchanged
--   --   rollback;
