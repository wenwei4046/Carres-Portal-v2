-- =============================================================================
-- 0066_supplier_phase6_rpcs.sql — Phase 6 Supplier portal
-- =============================================================================
-- Three SECURITY DEFINER RPCs for supplier-callable PO state transitions:
--
--   supplier_acknowledge(p_po_id text)
--     pending → acknowledged. own_logistics suppliers only (factory_pickup
--     skips ack and goes pending → in_production directly per proto).
--
--   supplier_start_production(p_po_id text)
--     pending|acknowledged → in_production. pending→ valid for factory_pickup;
--     acknowledged→ valid for own_logistics (proto:supplier-pages:296-307).
--
--   supplier_mark_delivered(p_po_id text, p_do_number text, p_do_note text)
--     pickup_accepted|shipped → delivered. Writes p_do_number to
--     purchase_orders.do_number (column added in 0035). DO upload is
--     text-only for V1 per phase-6 spec Q2=A; real Storage upload deferred
--     to Phase 7 partner POD work.
--
-- All three:
--   - role-gate: app_role() = 'supplier'
--   - cross-supplier guard: po.supplier_id = app_supplier_id()
--   - state guard: only valid sup_status sources accepted
--   - po_history insert (by_role='supplier', by_user_id=auth.uid())
--   - audit_log insert (role='supplier', actor_text=app_user.name)
--
-- Reuses existing logistics_supplier_ready_confirm (0034:274) for the
-- in_production → ready_for_pickup transition — that RPC already supports
-- supplier self-press with cross-supplier guard.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. supplier_acknowledge(p_po_id)
-- -----------------------------------------------------------------------------
create or replace function public.supplier_acknowledge(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po           purchase_orders;
  v_role         app_role;
  v_supplier_id  uuid;
  v_supplier_kind supplier_kind;
  v_actor        text;
begin
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();

  if v_role <> 'supplier' then
    raise exception 'forbidden: supplier role only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_supplier_id is null or v_po.supplier_id is distinct from v_supplier_id then
    raise exception 'forbidden: cross-supplier acknowledge'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_po.sup_status <> 'pending' then
    raise exception 'PO not in pending state (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  -- own_logistics-only gate. factory_pickup uses supplier_start_production
  -- to jump directly from pending → in_production.
  select kind into v_supplier_kind from suppliers where id = v_supplier_id;
  if v_supplier_kind <> 'own_logistics' then
    raise exception 'PO acknowledge only valid for own_logistics suppliers (kind %)', v_supplier_kind
      using errcode = '22023', detail = 'wrong_supplier_kind';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Supplier');

  update purchase_orders
     set sup_status = 'acknowledged',
         updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, 'Acknowledged · production scheduled', 'supplier', (select auth.uid()));

  insert into audit_log (role, actor_text, action, ref)
  values ('supplier', v_actor, format('Acknowledged PO %s', p_po_id), p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'sup_status', 'acknowledged');
end;
$$;

revoke all on function public.supplier_acknowledge(text) from public;
grant execute on function public.supplier_acknowledge(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. supplier_start_production(p_po_id)
-- -----------------------------------------------------------------------------
create or replace function public.supplier_start_production(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po           purchase_orders;
  v_role         app_role;
  v_supplier_id  uuid;
  v_supplier_kind supplier_kind;
  v_actor        text;
begin
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();

  if v_role <> 'supplier' then
    raise exception 'forbidden: supplier role only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_supplier_id is null or v_po.supplier_id is distinct from v_supplier_id then
    raise exception 'forbidden: cross-supplier start-production'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- factory_pickup: pending → in_production (skip ack)
  -- own_logistics: acknowledged → in_production (after ack)
  select kind into v_supplier_kind from suppliers where id = v_supplier_id;

  if v_supplier_kind = 'factory_pickup' then
    if v_po.sup_status not in ('pending', 'acknowledged') then
      raise exception 'PO not in pending/acknowledged state (got %)', v_po.sup_status
        using errcode = '22023', detail = 'wrong_sup_status';
    end if;
  else
    -- own_logistics: must be acknowledged first
    if v_po.sup_status <> 'acknowledged' then
      raise exception 'PO not in acknowledged state (got %)', v_po.sup_status
        using errcode = '22023', detail = 'wrong_sup_status';
    end if;
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Supplier');

  update purchase_orders
     set sup_status = 'in_production',
         updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, 'Production started', 'supplier', (select auth.uid()));

  insert into audit_log (role, actor_text, action, ref)
  values ('supplier', v_actor, format('Started production on PO %s', p_po_id), p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'sup_status', 'in_production');
end;
$$;

revoke all on function public.supplier_start_production(text) from public;
grant execute on function public.supplier_start_production(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. supplier_mark_delivered(p_po_id, p_do_number, p_do_note)
-- -----------------------------------------------------------------------------
create or replace function public.supplier_mark_delivered(
  p_po_id     text,
  p_do_number text,
  p_do_note   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po          purchase_orders;
  v_role        app_role;
  v_supplier_id uuid;
  v_actor       text;
begin
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();

  if v_role <> 'supplier' then
    raise exception 'forbidden: supplier role only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_do_number is null or btrim(p_do_number) = '' then
    raise exception 'DO number is required'
      using errcode = '22023', detail = 'missing_do_number';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_supplier_id is null or v_po.supplier_id is distinct from v_supplier_id then
    raise exception 'forbidden: cross-supplier mark-delivered'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- Valid sources: pickup_accepted (own_logistics + factory_pickup pickup flow)
  -- or shipped (own_logistics direct ship variant).
  if v_po.sup_status not in ('pickup_accepted', 'shipped') then
    raise exception 'PO not in pickup_accepted/shipped state (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Supplier');

  update purchase_orders
     set sup_status = 'delivered',
         do_number  = btrim(p_do_number),
         updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (
    p_po_id,
    format('DO uploaded · %s%s',
           btrim(p_do_number),
           case when p_do_note is not null and btrim(p_do_note) <> ''
                then ' · ' || btrim(p_do_note)
                else '' end),
    'supplier',
    (select auth.uid())
  );

  insert into audit_log (role, actor_text, action, ref)
  values (
    'supplier',
    v_actor,
    format('Marked PO %s delivered (DO %s)', p_po_id, btrim(p_do_number)),
    p_po_id
  );

  return jsonb_build_object(
    'po_id',     p_po_id,
    'sup_status','delivered',
    'do_number', btrim(p_do_number)
  );
end;
$$;

revoke all on function public.supplier_mark_delivered(text, text, text) from public;
grant execute on function public.supplier_mark_delivered(text, text, text) to authenticated;
