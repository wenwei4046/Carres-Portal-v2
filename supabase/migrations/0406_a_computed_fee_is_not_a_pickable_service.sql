-- 0406_a_computed_fee_is_not_a_pickable_service.sql
--
-- A COMPUTED FEE IS NOT A PICKABLE SERVICE — closing a live money defect.
--
-- THE BUG. `0393` created a FOURTH server-computed add-on, `STAIR_CARRY`, and
-- joined it to the three delivery keys that `0184` had already made
-- system-owned. It never added itself to `0258`'s refusal list. So today, on any
-- place-lane order carrying a stair carry:
--
--     Stair carry · ×1 · RM 250.00        [ Add one more ]
--
-- one click sends qty 2, passes every gate in `edit_order_addon` (qty >= 1, not
-- a decrease, no size options to validate) and the customer owes RM 500 for a
-- carry nobody quoted. `restampStairCarry` is not called by the edit route, so
-- the doubled row SURVIVES until somebody next moves the floor, the lift or the
-- item count — and if nobody does, it reaches the document and the payment cap.
--
-- ⛔ THE UI WAS ONLY HALF THE FIX. `SalesOrderAddons.tsx` now hides the control
-- for these four keys, but a hidden button is not a rule. `0395` learned the
-- same lesson from the other side: it refuses the four keys in the DATABASE and
-- the screen merely declines to offer a door that would 422. This migration
-- gives the EDIT door the refusal the REMOVE door already has, so the two
-- siblings finally state one rule.
--
-- ⭐ ONE LIST, ONE PLACE. `0258` spells the three keys out THREE times, in three
-- functions, and that duplication is exactly why the fourth key was added to
-- none of them. The list becomes a function here; every future server-computed
-- fee is added in one line and every door inherits it. That is ownership Law D
-- applied to a predicate rather than to a number.
--
-- WRAPPER, NOT A REWRITE — the 0385/0391/0395 pattern. Both mature bodies are
-- renamed and kept BYTE-FOR-BYTE behind a guard that runs first. No lane, role,
-- size, up-sell or change-request behaviour is touched.
--
-- SCOPE, stated honestly. Two of `0258`'s three sites are wrapped:
--   · edit_order_addon            — the door the office Services panel reaches
--   · submit_order_change_request — the door the POS reaches (kind='edit_addon')
-- The third, `update_order_change_request`, edits a request that ALREADY exists;
-- it cannot introduce a STAIR_CARRY request that the submit door now refuses to
-- create, so it is left alone rather than wrapped for symmetry. If a legacy
-- pending request already names a computed key, the decide path applies through
-- `edit_order_addon`, which this migration guards.
--
-- Schema only; no rows are read, rewritten, backfilled or deleted.

begin;

-- ---------------------------------------------------------------------------
-- 1 · THE LIST, ONCE
-- ---------------------------------------------------------------------------

create function public.addon_is_server_computed(p_addon_key text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  /* The four keys whose PRICE is computed per order and written by a server
     recompute, never picked by a human: the delivery trio (0184) and the stair
     carry (0393). `addons.price` carries 0 for all four precisely because the
     real figure lives on the order_addons row. */
  select p_addon_key in ('DELIVERY', 'DELIVERY_CROSS', 'DELIVERY_ADD', 'STAIR_CARRY');
$$;

comment on function public.addon_is_server_computed(text) is
  '0406: the one list of server-computed add-on keys. Add a new computed fee here and every door inherits the refusal.';

-- ---------------------------------------------------------------------------
-- 2 · THE EDIT DOOR — the one the office Services panel reaches
-- ---------------------------------------------------------------------------

alter function public.edit_order_addon(uuid, uuid, int, jsonb, text, uuid)
  rename to edit_order_addon_unchecked_0258;

create function public.edit_order_addon(
  p_order_id          uuid,
  p_addon_id          uuid,
  p_qty               int,
  p_attrs             jsonb default null,
  p_source            text default 'direct',
  p_change_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  select addon_key into v_key
    from public.order_addons
   where id = p_addon_id and order_id = p_order_id;

  /* Not found is NOT decided here — the 0258 body raises `addon_not_found`
     with its own sentence, and duplicating that would put one refusal in two
     places. This guard speaks only when it has a key to judge. */
  if v_key is not null and public.addon_is_server_computed(v_key) then
    raise exception 'delivery fees are computed by the system and cannot be edited'
      using errcode = '22023', detail = 'addon_not_editable';
  end if;

  return public.edit_order_addon_unchecked_0258(
    p_order_id, p_addon_id, p_qty, p_attrs, p_source, p_change_request_id
  );
end;
$$;

revoke all on function public.edit_order_addon_unchecked_0258(uuid, uuid, int, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.edit_order_addon(uuid, uuid, int, jsonb, text, uuid) from public, anon;
grant execute on function public.edit_order_addon(uuid, uuid, int, jsonb, text, uuid)
  to authenticated, service_role;

comment on function public.edit_order_addon(uuid, uuid, int, jsonb, text, uuid) is
  '0406: refuses every server-computed add-on key, not only the delivery trio. The 0258 implementation remains behind this guard.';

-- ---------------------------------------------------------------------------
-- 3 · THE CHANGE-REQUEST DOOR — the one the POS reaches
-- ---------------------------------------------------------------------------

alter function public.submit_order_change_request(uuid, jsonb, text)
  rename to submit_order_change_request_unchecked_0258;

create function public.submit_order_change_request(
  p_order_id uuid,
  p_payload  jsonb,
  p_kind     text default 'add_lines'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  /* Only an `edit_addon` request names an existing add-on row. Every other
     kind is left entirely alone. */
  if p_kind = 'edit_addon' and nullif(p_payload->>'targetAddonId', '') is not null then
    select addon_key into v_key
      from public.order_addons
     where id = (p_payload->>'targetAddonId')::uuid and order_id = p_order_id;

    if v_key is not null and public.addon_is_server_computed(v_key) then
      raise exception 'delivery fees are computed by the system and cannot be edited'
        using errcode = '22023', detail = 'addon_not_editable';
    end if;
  end if;

  return public.submit_order_change_request_unchecked_0258(p_order_id, p_payload, p_kind);
end;
$$;

revoke all on function public.submit_order_change_request_unchecked_0258(uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.submit_order_change_request(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_order_change_request(uuid, jsonb, text)
  to authenticated, service_role;

comment on function public.submit_order_change_request(uuid, jsonb, text) is
  '0406: an edit_addon request may not name a server-computed key. The 0258 implementation remains behind this guard.';

commit;

-- ===========================================================================
-- VERIFICATION — run against a scratch order, never production.
--
-- 1 · THE LIST answers for all four, and for nothing else
--     select public.addon_is_server_computed('STAIR_CARRY');   -- expect true
--     select public.addon_is_server_computed('DELIVERY');      -- expect true
--     select public.addon_is_server_computed('dispose-mattress'); -- expect false
--
-- 2 · THE BUG IS SHUT — the exact call the Add one more button makes
--     -- on a place-lane order carrying a stair carry at qty 1
--     select public.edit_order_addon('<order>', '<stair_addon_id>', 2, null, 'direct', null);
--     -- expect ERROR 22023 detail addon_not_editable
--
-- 3 · NEGATIVE CONTROL — an ordinary service still edits, and still up-sells
--     select public.edit_order_addon('<order>', '<dispose_addon_id>', 2, null, 'direct', null);
--     -- expect success, qty now 2
--     select public.edit_order_addon('<order>', '<dispose_addon_id>', 1, null, 'direct', null);
--     -- expect ERROR 22023 detail downsell_blocked  (the up-sell law is untouched)
--
-- 4 · THE POS DOOR refuses the same key
--     select public.submit_order_change_request('<order>',
--       jsonb_build_object('targetAddonId','<stair_addon_id>','qty',2), 'edit_addon');
--     -- expect ERROR 22023 detail addon_not_editable
--
-- 5 · NEGATIVE CONTROL — every other request kind is untouched
--     select public.submit_order_change_request('<order>',
--       jsonb_build_object('lines', '[]'::jsonb), 'add_lines');
--     -- expect the 0258 body's own behaviour, unchanged
-- ===========================================================================
