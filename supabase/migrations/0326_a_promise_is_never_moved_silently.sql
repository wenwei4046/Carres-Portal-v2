-- 0326 · A PROMISE IS NEVER MOVED SILENTLY (SO-3, Loo 2026-08-09)
--
-- The Sales Order panel has three permission levels, and the middle one is the
-- reason this migration exists:
--
--   LEVEL 1  direct edit          phone · address · internal note
--   LEVEL 2  REQUEST, never a     the customer's postpone · an item change
--            silent overwrite
--   LEVEL 3  never editable       items · prices · discount · salesperson ·
--                                 Ordered · the ORIGINAL promised date
--
-- `order_change_requests` is already the portal's record of "somebody asked for
-- this and it has not been decided" (0129 · 0258). It carried three PRODUCT
-- kinds, all raised from the dealer's POS. This adds the two the operator's own
-- panel raises, and it adds NO table: a second request table would be a second
-- answer to "what is waiting on this order".
--
--   promise_date   the customer asked for a different delivery date.
--                  payload { from, to, reason }. `orders.delivery_date` is NOT
--                  touched — that is the whole point. The register keeps
--                  printing the promise that was made until somebody with the
--                  authority decides, and the panel's PROMISED cell stacks
--                  `Original {date} · changed ×N` off these rows.
--   item_change    the customer wants something else. Free text, because the
--                  operator is recording a PHONE CALL, not composing a cart —
--                  the structured line editor is the POS's `replace_lines`,
--                  which is a different act by a different person.
--
-- WHY THE ORIGINAL DATE CANNOT BE BACKFILLED, measured 2026-08-09: exactly ONE
-- live `order_history` row records a `delivery_date` edit, and `update_order`
-- writes only the NEW value into its metadata. There is no stored "from" for
-- any order in this database. So `Original` is derived from these rows and
-- these rows only, and an order with none shows no second line at all — never
-- `changed ×0`, and never the current value dressed up as the original.
--
-- THE ONE-PENDING INDEX IS SPLIT RATHER THAN WIDENED, and that is the careful
-- part. `order_change_requests_one_pending` (0129) is UNIQUE per order while
-- pending, and the dealer's POS surfaces the violation as *"This order already
-- has a pending product change"*. Leaving it as-is would let an operator's
-- postpone request BLOCK a dealer's product change on a frozen surface. The
-- index is therefore rebuilt to bind the three PRODUCT kinds exactly as before,
-- and the two new kinds get their own per-kind index. No existing behaviour
-- moves: for add_lines / replace_lines / edit_addon the predicate is the same
-- set of rows it always was.

begin;

alter table order_change_requests
  drop constraint order_change_requests_kind_check;

alter table order_change_requests
  add constraint order_change_requests_kind_check
  check (kind = any (array[
    'add_lines'::text,
    'replace_lines'::text,
    'edit_addon'::text,
    'promise_date'::text,
    'item_change'::text
  ]));

drop index if exists order_change_requests_one_pending;

-- The dealer's rule, unchanged in meaning: ONE pending product change per order.
create unique index order_change_requests_one_pending
  on order_change_requests (order_id)
  where status = 'pending'
    and kind in ('add_lines', 'replace_lines', 'edit_addon');

-- The operator's two, kept apart from the dealer's and from each other: a
-- pending postpone must not block a pending item change, and vice versa.
create unique index order_change_requests_one_pending_ops
  on order_change_requests (order_id, kind)
  where status = 'pending'
    and kind in ('promise_date', 'item_change');

-- ─────────────────────────────────────────────────────────────────────────────
-- The door. SECURITY DEFINER because `order_change_requests` has a SELECT
-- policy and no INSERT policy — every writer of this table is an RPC, and this
-- one follows `submit_order_change_request`'s shape rather than inventing a
-- second one.
--
-- It deliberately does NOT reuse that function. Its gates are about product
-- lines and it REFUSES a place-lane order outright (*"This order can still be
-- edited directly"*) — and 75 of the 77 live orders are exactly that. A
-- postpone is not a product change and does not become one by sharing a body.
create or replace function public.operation_request_order_change(
  p_order_id uuid,
  p_kind     text,
  p_payload  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order  orders;
  v_role   app_role;
  v_id     uuid;
  v_reason text;
  v_from   date;
  v_to     date;
  v_note   text;
begin
  v_role := public.app_role();
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;
  -- The panel is an INTERNAL surface. A dealer changing their own order goes
  -- through the POS door, which has its own gates and its own approval queue.
  if v_role not in ('principal', 'operation') then
    raise exception 'forbidden: internal roles only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'This order is no longer open'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_kind not in ('promise_date', 'item_change') then
    raise exception 'unsupported change request kind'
      using errcode = '22023', detail = 'invalid_kind';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or pg_column_size(p_payload) > 8192 then
    raise exception 'payload must be an object (<=8KB)'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  -- THE REASON IS REQUIRED, and it is required HERE rather than only in the
  -- form: a record of a customer's postpone with no reason on it is the thing
  -- the next person cannot act on.
  v_reason := nullif(trim(p_payload->>'reason'), '');
  if v_reason is null then
    raise exception 'A reason is required'
      using errcode = '22023', detail = 'reason_required';
  end if;

  if p_kind = 'promise_date' then
    v_to := nullif(p_payload->>'to', '')::date;
    if v_to is null then
      raise exception 'A new date is required'
        using errcode = '22023', detail = 'date_required';
    end if;
    -- The FROM is read from the ORDER, never from the client: it is what the
    -- customer was actually promised, and a client that could name it could
    -- rewrite history by naming it wrongly.
    v_from := v_order.delivery_date;
    if v_from is not null and v_to = v_from then
      raise exception 'That is the date already promised'
        using errcode = '22023', detail = 'same_date';
    end if;
    p_payload := jsonb_build_object(
      'from', v_from, 'to', v_to, 'reason', v_reason);
  else
    v_note := nullif(trim(p_payload->>'note'), '');
    if v_note is null then
      raise exception 'Say what should change'
        using errcode = '22023', detail = 'note_required';
    end if;
    p_payload := jsonb_build_object('note', v_note, 'reason', v_reason);
  end if;

  begin
    insert into order_change_requests (order_id, kind, payload, requested_by)
    values (p_order_id, p_kind, p_payload, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This order already has a change waiting'
      using errcode = '22023', detail = 'pending_exists';
  end;

  -- The history entry is not a duplicate of the request. The request is what is
  -- WAITING; the history is what HAPPENED, and it stays readable after the
  -- request is decided, cancelled or deleted.
  insert into order_history (order_id, text, by_role, by_user_id, metadata)
  values (
    p_order_id,
    case when p_kind = 'promise_date'
         then case when v_from is null
                   then format('Customer asked for %s · %s', v_to, v_reason)
                   else format('Customer asked to move %s to %s · %s',
                               v_from, v_to, v_reason) end
         else format('Customer asked to change the items · %s', v_note) end,
    v_role,
    auth.uid(),
    jsonb_build_object(
      'kind', case when p_kind = 'promise_date'
                   then 'promise_change_requested'
                   else 'item_change_requested' end,
      'change_request_id', v_id,
      'from', v_from,
      'to', v_to,
      'reason', v_reason)
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.' || p_kind || '_requested', v_order.dealer_id,
          'SO-' || v_order.so::text);

  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.operation_request_order_change(uuid, text, jsonb) from public;
grant execute on function public.operation_request_order_change(uuid, text, jsonb) to authenticated;

commit;
