-- =============================================================================
-- 0006 — Atomic order creation RPC + Storage bucket policies.
-- Phase 2B eng-review D3 (RPC) + D1 (Storage).
--
-- Why RPC: PostgREST cannot span multiple table inserts in one transaction
-- via the REST API. Without this RPC, a network glitch mid-submit could leave
-- an `orders` row with no `order_lines`. Real risk on Malaysia 4G.
--
-- Why SECURITY DEFINER: the function bypasses RLS so we can also write to
-- `audit_log` (which has a permissive INSERT policy but reading the actor
-- correctly inside a function is awkward). We re-implement the cross-dealer
-- check manually at the top.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_order(payload jsonb) → jsonb { id, dl, placed_at }
-- -----------------------------------------------------------------------------
create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer_id        uuid;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_order_id         uuid;
  v_dl               int;
  v_placed_at        timestamptz;
  v_deposit_pct      int;
  v_line             jsonb;
  v_addon            jsonb;
begin
  v_dealer_id := (payload->>'dealer_id')::uuid;
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- Manual RLS gate: only the dealer themselves, or internal roles
  -- (principal/logistics/finance/bd), can insert. We re-check here because
  -- SECURITY DEFINER bypasses the orders_dealer_insert policy.
  if v_role not in ('principal','logistics','finance','bd')
     and v_dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer insert' using errcode = '42501';
  end if;

  if v_dealer_id is null then
    raise exception 'dealer_id is required' using errcode = '22023';
  end if;

  -- 1. Insert orders row
  insert into orders (
    dealer_id,
    outlet_id,
    salesperson_id,
    customer_name,
    customer_phone,
    customer_address,
    customer_address_unknown,
    customer_billing,
    customer_billing_same,
    customer_emergency,
    delivery_date,
    delivery_date_tbd,
    delivery_floor,
    delivery_has_lift,
    paid,
    signature_url,
    payment_slip_url,
    terms_accepted
  ) values (
    v_dealer_id,
    nullif(payload->>'outlet_id', '')::uuid,
    nullif(payload->>'salesperson_id', '')::uuid,
    payload->>'customer_name',
    nullif(payload->>'customer_phone', ''),
    nullif(payload->>'customer_address', ''),
    coalesce((payload->>'customer_address_unknown')::boolean, false),
    nullif(payload->>'customer_billing', ''),
    coalesce((payload->>'customer_billing_same')::boolean, true),
    nullif(payload->>'customer_emergency', ''),
    nullif(payload->>'delivery_date', '')::date,
    coalesce((payload->>'delivery_date_tbd')::boolean, false),
    coalesce((payload->>'delivery_floor')::int, 1),
    coalesce((payload->>'delivery_has_lift')::boolean, false),
    coalesce((payload->>'paid')::numeric, 0),
    payload->>'signature_url',
    nullif(payload->>'payment_slip_url', ''),
    coalesce((payload->>'terms_accepted')::boolean, false)
  )
  returning id, dl, placed_at into v_order_id, v_dl, v_placed_at;

  -- 2. Insert order_lines (must have at least one line — caller must enforce
  -- via zod, but we double-check by raising if the array is empty)
  if jsonb_array_length(coalesce(payload->'lines', '[]'::jsonb)) = 0 then
    raise exception 'order must have at least one line' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(payload->'lines') loop
    insert into order_lines (order_id, sku, qty, attrs, unit_price)
    values (
      v_order_id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
  end loop;

  -- 3. Insert order_addons (optional)
  if payload ? 'addons' then
    for v_addon in select * from jsonb_array_elements(payload->'addons') loop
      insert into order_addons (order_id, addon_key, qty, unit_price)
      values (
        v_order_id,
        v_addon->>'addon_key',
        coalesce((v_addon->>'qty')::int, 1),
        (v_addon->>'unit_price')::numeric
      );
    end loop;
  end if;

  -- 4. Insert initial order_history row (dealer-visible timeline)
  v_deposit_pct := coalesce((payload->>'deposit_pct')::int, 0);
  insert into order_history (order_id, text, by_role)
  values (
    v_order_id,
    format('Order created · %s%% deposit', v_deposit_pct),
    v_role
  );

  -- 5. Insert audit_log row (internal trail)
  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.created',
    v_dealer_id,
    'DL-' || v_dl::text
  );

  return jsonb_build_object(
    'id', v_order_id,
    'dl', v_dl,
    'placed_at', v_placed_at
  );
end;
$$;

-- Lock down — only authenticated callers can execute.
revoke all on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to authenticated;

-- =============================================================================
-- Storage bucket: orders-attachments
-- Path convention: {dealer_id}/{wizard_session_uuid}/{kind}.{ext}
--   kind ∈ {signature, payment-slip}
--   ext  ∈ {png, jpg, jpeg, webp}
--
-- Browser uploads directly to Storage with the user JWT before submitting the
-- order. RLS policies on `storage.objects` ensure dealers can only write to
-- their own folder + read their own attachments. Internal roles (principal /
-- logistics / finance / bd) can read all.
-- =============================================================================

-- Idempotent bucket create. `private = true` (default for created buckets).
insert into storage.buckets (id, name, public)
values ('orders-attachments', 'orders-attachments', false)
on conflict (id) do nothing;

-- Drop old policies if they exist (safe to re-run this migration in dev).
drop policy if exists "orders_attachments_dealer_insert" on storage.objects;
drop policy if exists "orders_attachments_dealer_read"   on storage.objects;
drop policy if exists "orders_attachments_internal_read" on storage.objects;
drop policy if exists "orders_attachments_dealer_update" on storage.objects;

-- Dealer can INSERT into their own folder. `storage.foldername(name)[1]` is
-- the first path segment, which by convention is the dealer_id (UUID stringified).
create policy "orders_attachments_dealer_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'orders-attachments'
  and (storage.foldername(name))[1] = (select public.app_dealer_id())::text
);

-- Dealer can READ files inside their own folder.
create policy "orders_attachments_dealer_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'orders-attachments'
  and (storage.foldername(name))[1] = (select public.app_dealer_id())::text
);

-- Internal roles (principal/logistics/finance/bd) read all — needed once
-- logistics + finance start viewing orders for delivery + reconciliation.
create policy "orders_attachments_internal_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'orders-attachments'
  and (select public.is_internal())
);

-- Dealer can UPDATE their own (used by `replace` flow in the slip uploader).
create policy "orders_attachments_dealer_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'orders-attachments'
  and (storage.foldername(name))[1] = (select public.app_dealer_id())::text
)
with check (
  bucket_id = 'orders-attachments'
  and (storage.foldername(name))[1] = (select public.app_dealer_id())::text
);

-- No DELETE policy by design — once an order is submitted, the attachments
-- are evidence and should not be deletable client-side. Future GDPR / hard
-- deletes go through a service-role admin route.
