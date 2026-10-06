-- 0651 · A COMMIT CARRIES THE ORDER THE EDITOR OPENED
-- Numbered from the MAX of: production tracker tail 0650 · origin/main tail 0650
-- (32c331e0c) · every remote branch tail 0650 (measured 2026-10-06). 0629/0630/0632
-- stay reserved by the open review PR #1834. An ordinary engineering fix of an
-- approved capability (owner ruling 2026-10-06: a database change in such a fix
-- is not a business approval).
--
-- ═══ CONCURRENT EDITING — owner-approved 2026-10-01 ═══════════════════════════
-- Orders MASTER §0.0 "Approved handoff scopes": "IMPROVE save/submit with the
-- editor's original baseline, in addition to approval-time stale checks ·
-- Two editors cannot silently overwrite one another; conflict keeps the draft
-- and exposes what changed; same amendment entry, no new draft engine."
--
-- The whole-page edit (POST /api/operation/orders/:id/changes) sends back every
-- field it shows. Until now the server classified that draft against whatever
-- the order says AT COMMIT TIME, so a field a colleague changed after this
-- editor opened the page came back as "this editor's change" and was quietly
-- written over. The commit now carries the order exactly as the editor opened
-- it; this ONE door compares it with the order under the order's own lock and
-- refuses with `order_edit_stale` before anything is written.
--
-- WHAT THIS ADDS — and nothing else:
--   _sales_order_edit_baseline(uuid)            the order as the edit page opens it
--   _sales_order_edit_baseline_canonical(jsonb) the editor's copy, ordered the same way
--   sales_order_commit_staff_change(...)        lock → compare → the EXISTING writer
--
-- WHAT IT DOES NOT CHANGE: no table, column, policy or RLS. No existing function
-- body. `sales_order_save_revision`, `sales_order_submit_amendment`,
-- `sales_order_withdraw_amendment` and `sales_order_record_amendment_agreement`
-- are called exactly as the API calls them today, with the same arguments, so
-- who may save or submit, the proceed/promise/delivery locks, the floors, the
-- evidence gate and the 0564 approval are untouched. The direct doors stay
-- granted (other routes still use them).
--
-- Converges with review PR #1834 (0632): same function names and the same
-- nine-argument commit signature, the same `order_edit_stale` refusal and the
-- same words. #1834's other scope (Sales Approver, PO Duty, stair quote,
-- submit_staff_amendment) is NOT here; when #1834 is renumbered its
-- `create or replace` supersedes these bodies.
--
-- RECOVERY (additive only — no earlier body is replaced, so none needs restoring):
--   1. revert the API/web change (the route goes back to calling the direct
--      writers); that alone removes every caller of these functions;
--   2. optionally a FOLLOW-UP migration (never an edit of this file) that
--      drops the three functions:
--      drop function public.sales_order_commit_staff_change(uuid,jsonb,text,jsonb,jsonb,text,date,jsonb,uuid);
--      drop function public._sales_order_edit_baseline_canonical(jsonb);
--      drop function public._sales_order_edit_baseline(uuid);
--   Leaving them in place is harmless: nothing else calls them.

begin;

-- ── 1 · The order exactly as the edit page opens it ─────────────────────────
-- Key for key the shape of `salesOrderEditBaseline` (packages/shared
-- sales-order-change.ts): the 23 edit header facts (SALES_ORDER_EDIT_HEADER_KEYS),
-- `entry_fields` always an object, lines and services ordered by id in byte
-- order with exactly id · sku/addon_key · qty · unit_price · attrs (an object
-- or null), the instalment plan and the status the classification reads.
create or replace function public._sales_order_edit_baseline(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status', o.status,
    'header', jsonb_build_object(
      'customer_name', o.customer_name,
      'customer_phone', o.customer_phone,
      'customer_email', o.customer_email,
      'customer_race', o.customer_race,
      'customer_gender', o.customer_gender,
      'customer_birthday', o.customer_birthday,
      'customer_address', o.customer_address,
      'customer_address_line1', o.customer_address_line1,
      'customer_address_line2', o.customer_address_line2,
      'customer_address_city', o.customer_address_city,
      'customer_address_state', o.customer_address_state,
      'customer_address_postcode', o.customer_address_postcode,
      'customer_address_unknown', o.customer_address_unknown,
      'customer_emergency', o.customer_emergency,
      'customer_billing', o.customer_billing,
      'customer_billing_same', o.customer_billing_same,
      'entry_fields', case when jsonb_typeof(o.entry_data->'fields') = 'object'
                           then o.entry_data->'fields' else '{}'::jsonb end,
      'delivery_floor', o.delivery_floor,
      'delivery_has_lift', o.delivery_has_lift,
      'delivery_stair_items', o.delivery_stair_items,
      'proceed_date', o.proceed_date,
      'delivery_date', o.delivery_date,
      'delivery_date_tbd', o.delivery_date_tbd),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'sku', l.sku, 'qty', l.qty, 'unit_price', l.unit_price,
               'attrs', case when jsonb_typeof(l.attrs) = 'object' then l.attrs end)
             order by l.id::text collate "C")
        from order_lines l where l.order_id = o.id), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'addon_key', a.addon_key, 'qty', a.qty, 'unit_price', a.unit_price,
               'attrs', case when jsonb_typeof(a.attrs) = 'object' then a.attrs end)
             order by a.id::text collate "C")
        from order_addons a where a.order_id = o.id), '[]'::jsonb),
    'installment_months', o.installment_months)
  from orders o
  where o.id = p_order_id;
$$;

-- ── 2 · The editor's copy, read the same way ────────────────────────────────
-- Only the array order is normalised (byte order of id, like §1). Values are
-- compared exactly: jsonb equality already ignores object key order and
-- compares numbers by value (2749 = 2749.00).
create or replace function public._sales_order_edit_baseline_canonical(p_expected jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status', p_expected->'status',
    'header', p_expected->'header',
    'lines', case when jsonb_typeof(p_expected->'lines') = 'array' then coalesce((
      select jsonb_agg(x order by x->>'id' collate "C")
        from jsonb_array_elements(p_expected->'lines') x), '[]'::jsonb) end,
    'addons', case when jsonb_typeof(p_expected->'addons') = 'array' then coalesce((
      select jsonb_agg(x order by x->>'id' collate "C")
        from jsonb_array_elements(p_expected->'addons') x), '[]'::jsonb) end,
    'installment_months', p_expected->'installment_months');
$$;

revoke all on function public._sales_order_edit_baseline(uuid) from public, anon, authenticated;
revoke all on function public._sales_order_edit_baseline_canonical(jsonb) from public, anon, authenticated;

-- ── 3 · The one commit: lock, compare, then the EXISTING writer ─────────────
create or replace function public.sales_order_commit_staff_change(
  p_order_id          uuid,
  p_expected          jsonb,
  p_action            text,
  p_header            jsonb,
  p_proposed          jsonb,
  p_reason            text,
  p_customer_asked_on date,
  p_agreement         jsonb,
  p_replace           uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role   text := public.app_role();
  v_live   jsonb;
  v_result jsonb;
  v_agreed boolean := false;
begin
  -- The same gate both writers already hold; it is repeated so this door says
  -- nothing about an order to anyone the writers would refuse.
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('save','submit') then
    raise exception 'Invalid action' using errcode = '22023', detail = 'invalid_param';
  end if;

  -- The order row first — the same lock `sales_order_save_revision` takes —
  -- then its lines in id order: the Order → exact line order of 0633. Every
  -- writer that changes the edit facts takes the order row first, so from here
  -- to commit nobody can move what is compared below. Services are not locked:
  -- the stair-carry stamp deletes its row before it inserts, and locking that
  -- row after the order would invite a deadlock for no gain (this door never
  -- writes services directly).
  perform 1 from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  perform 1 from order_lines where order_id = p_order_id order by id for no key update;

  -- ⛔ THE CHECK. Compared AFTER the lock, so a colleague's commit that won the
  -- race is already visible here. Missing or malformed counts as changed.
  if p_expected is null or jsonb_typeof(p_expected) <> 'object'
     or public._sales_order_edit_baseline(p_order_id)
        is distinct from public._sales_order_edit_baseline_canonical(p_expected) then
    raise exception 'Action changed · Review again'
      using errcode = '22023', detail = 'order_edit_stale';
  end if;

  if p_action = 'save' then
    -- Exactly today's call from the route (0562): header only, a staff correction.
    return public.sales_order_save_revision(
      p_order_id, coalesce(p_header, '{}'::jsonb), null,
      jsonb_build_object('change_type', 'staff_correction', 'note', p_reason));
  end if;

  -- Proposing again over an OUT-OF-DATE request withdraws it first — today's
  -- route rule, unchanged: only when the live request is that one AND stale.
  if p_replace is not null then
    v_live := public.sales_order_amendment_live(p_order_id)->'amendment';
    if (v_live->>'id') = p_replace::text and coalesce((v_live->>'stale')::boolean, false) then
      perform public.sales_order_withdraw_amendment(
        p_replace, 'Out of date - proposed again on the current order');
    end if;
  end if;

  v_result := public.sales_order_submit_amendment(
    p_order_id, p_proposed, p_reason, p_customer_asked_on);

  -- 0564 · "The request may remain recorded while evidence is incomplete; it
  -- cannot take effect." A refused agreement rolls back only itself, exactly as
  -- the route's separate call did; the page is told which it got.
  if p_agreement is not null and jsonb_typeof(p_agreement) = 'object' then
    begin
      perform public.sales_order_record_amendment_agreement(
        (v_result->>'id')::uuid, p_agreement->>'kind', p_agreement->>'reference', p_agreement->>'detail');
      v_agreed := true;
    exception when others then
      v_agreed := false;
    end;
  end if;

  return v_result || jsonb_build_object('agreement_recorded', v_agreed);
end $$;

comment on function public.sales_order_commit_staff_change(uuid,jsonb,text,jsonb,jsonb,text,date,jsonb,uuid) is
  '0651 - the whole-page Sales Order commit. Locks the order (then its lines), compares the order with the baseline the editor opened, refuses order_edit_stale when they differ, then calls the existing save / withdraw / submit / agreement writers unchanged. Owner-approved 2026-10-01 concurrent-editing scope (orders/MASTER 0.0).';

revoke all on function public.sales_order_commit_staff_change(uuid,jsonb,text,jsonb,jsonb,text,date,jsonb,uuid) from public, anon;
grant execute on function public.sales_order_commit_staff_change(uuid,jsonb,text,jsonb,jsonb,text,date,jsonb,uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select p.proname, p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in
--      ('_sales_order_edit_baseline','_sales_order_edit_baseline_canonical','sales_order_commit_staff_change')
--    order by 1;
--   -- EXPECT: three rows; the baseline and commit functions SECURITY DEFINER.
--
--   -- A baseline is equal to itself after the canonical read (any order id):
--   select public._sales_order_edit_baseline(id)
--          = public._sales_order_edit_baseline_canonical(public._sales_order_edit_baseline(id))
--     from orders limit 1;
--   -- EXPECT: true.
