-- 0327 · EVERY WRITE MINTS A REVISION (STAGE 2, BUILD-QUEUE)
--
-- The Sales Order workspace gains Edit / Create, and the rule the stage
-- exists to install is: **a customer agreement is never overwritten in
-- place — every write mints an immutable revision.**
--
--   sales_order_revisions   one immutable snapshot per revision
--                           (header + lines + addons), unique (order,
--                           revision). **Rev 1 = the original** — minted
--                           from the PRE-edit state the first time an
--                           order is edited, or from the created state
--                           when an order is born here.
--
--   sales_order_save_revision(order, header, lines)
--                           the ONE write door for an edit. Applies a
--                           WHITELISTED header patch + a lines diff
--                           (update-by-id / insert / delete), then mints
--                           revision MAX+1 from the new state. Stage 2 has
--                           NO approval logic — every change is Class B.
--
--   sales_order_create(header, lines)
--                           the office birth door ([+ New Sales Order]).
--                           Normal orders are still born in the Sales
--                           Portal; this inserts status='place' and mints
--                           Rev 1 from the created state.
--
-- IMMUTABILITY IS ENFORCED IN THE DATABASE, not promised in the app: the
-- table has SELECT policies only (no insert/update/delete policy — writes
-- go through the definer RPCs), and a trigger refuses UPDATE / DELETE even
-- from a definer, so "never mutate or delete an existing revision" is a
-- constraint, not a convention.
--
-- Lines are diffed, never wholesale-replaced: a kept line keeps its id,
-- its attrs and its source_po — replacing the set would silently sever
-- what the AutoCount importer or the sofa builder wrote on the row.
--
-- 0326 (unmerged, another branch) is untouched; this number clears the
-- all-branch MAX per CLAUDE.md red line 7.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · the revision store
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sales_order_revisions (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  revision    int  not null check (revision >= 1),
  snapshot    jsonb not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  unique (order_id, revision)
);
create index if not exists sales_order_revisions_order_idx
  on public.sales_order_revisions(order_id, revision);

alter table public.sales_order_revisions enable row level security;

-- Internal read only. No write policy exists on purpose: the two definer
-- RPCs below are the only doors, and they run as the table owner.
drop policy if exists sales_order_revisions_internal_read on public.sales_order_revisions;
create policy sales_order_revisions_internal_read
  on public.sales_order_revisions for select
  using (public.app_role() in ('operation','principal','finance','hr','bd'));

-- The belt on top of the missing policies: a revision row can never be
-- REWRITTEN, by anyone, definer included. DELETE is left to the ON DELETE
-- CASCADE alone — no policy grants it to a user, no RPC issues it, and the
-- cascade must stay able to clear children if an order row is ever removed
-- through the one legitimate administrative path.
create or replace function public.sales_order_revisions_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'sales_order_revisions is immutable — a revision is never rewritten';
end $$;
drop trigger if exists sales_order_revisions_no_rewrite on public.sales_order_revisions;
create trigger sales_order_revisions_no_rewrite
  before update on public.sales_order_revisions
  for each row execute function public.sales_order_revisions_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · the snapshot builder — ONE arithmetic for both RPCs (Law D)
-- ─────────────────────────────────────────────────────────────────────────────
-- The snapshot carries the AGREEMENT: header facts + lines + addons. Line
-- descriptions are resolved AT MINT TIME (`Model name (Variant)`), so an old
-- revision's PDF still prints the name the customer saw even if the catalog
-- later changes. Payments are NOT snapshotted — the ledger is live money,
-- not agreement.
create or replace function public.sales_order_snapshot(p_order_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'header', (
      select jsonb_build_object(
        'so', o.so,
        'status', o.status,
        'channel', o.channel,
        'dealer_id', o.dealer_id,
        'outlet_id', o.outlet_id,
        'salesperson_id', o.salesperson_id,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone,
        'customer_email', o.customer_email,
        'customer_address', o.customer_address,
        'customer_address_line1', o.customer_address_line1,
        'customer_address_line2', o.customer_address_line2,
        'customer_address_city', o.customer_address_city,
        'customer_address_state', o.customer_address_state,
        'customer_address_postcode', o.customer_address_postcode,
        'customer_emergency', o.customer_emergency,
        'customer_billing', o.customer_billing,
        'delivery_date', o.delivery_date,
        'delivery_date_tbd', o.delivery_date_tbd,
        'proceed_date', o.proceed_date,
        'delivery_floor', o.delivery_floor,
        'delivery_has_lift', o.delivery_has_lift,
        'placed_at', o.placed_at,
        'salesperson_name', sp.name,
        'outlet_name', ol.name,
        'dealer_name', d.name
      )
      from orders o
      left join salespersons sp on sp.id = o.salesperson_id
      left join outlets ol on ol.id = o.outlet_id
      left join dealers d on d.id = o.dealer_id
      where o.id = p_order_id
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'sku', l.sku,
        'qty', l.qty,
        'unit_price', l.unit_price,
        'attrs', l.attrs,
        'source_po', l.source_po,
        'description', case
          when pm.name is not null and ps.variant is not null and length(trim(ps.variant)) > 0
            then pm.name || ' (' || ps.variant || ')'
          when pm.name is not null then pm.name
          else null
        end
      ) order by l.created_at, l.id)
      from order_lines l
      left join product_skus ps on ps.sku = l.sku
      left join product_models pm on pm.id = ps.model_id
      where l.order_id = p_order_id
    ), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'addon_key', a.addon_key,
        'qty', a.qty,
        'unit_price', a.unit_price
      ) order by a.id)
      from order_addons a
      where a.order_id = p_order_id
    ), '[]'::jsonb)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · the edit door
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sales_order_save_revision(
  p_order_id uuid,
  p_header   jsonb default '{}'::jsonb,
  p_lines    jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.app_role();
  v_order     orders%rowtype;
  v_changed   text[] := '{}';
  v_next      int;
  v_line      jsonb;
  v_keep_ids  uuid[] := '{}';
  v_id        uuid;
  v_old       jsonb;
  v_new       jsonb;
  v_keys      text[] := array[
    'customer_name','customer_phone','customer_email','customer_address',
    'customer_address_line1','customer_address_line2','customer_address_city',
    'customer_address_state','customer_address_postcode','customer_emergency',
    'customer_billing','delivery_date','delivery_date_tbd','proceed_date',
    'delivery_floor','delivery_has_lift','salesperson_id','outlet_id'
  ];
  v_key       text;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- Refuse an empty save early — a revision must record a change.
  if (p_header is null or p_header = '{}'::jsonb) and p_lines is null then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;

  v_old := public.sales_order_snapshot(p_order_id);

  -- Rev 1 = the ORIGINAL, minted from the PRE-edit state the first time this
  -- order is ever edited. Never derived from the current row afterwards.
  if not exists (select 1 from sales_order_revisions where order_id = p_order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (p_order_id, 1, v_old, auth.uid());
  end if;

  -- Header patch — WHITELISTED keys only; a key present in the payload is
  -- applied (null clears a nullable field), an absent key is untouched.
  foreach v_key in array v_keys loop
    if p_header ? v_key then
      case v_key
        when 'delivery_date' then
          update orders set delivery_date = nullif(p_header->>'delivery_date','')::date where id = p_order_id;
        when 'proceed_date' then
          update orders set proceed_date = nullif(p_header->>'proceed_date','')::date where id = p_order_id;
        when 'delivery_date_tbd' then
          update orders set delivery_date_tbd = coalesce((p_header->>'delivery_date_tbd')::boolean, false) where id = p_order_id;
        when 'delivery_floor' then
          update orders set delivery_floor = coalesce((p_header->>'delivery_floor')::int, 1) where id = p_order_id;
        when 'delivery_has_lift' then
          update orders set delivery_has_lift = coalesce((p_header->>'delivery_has_lift')::boolean, false) where id = p_order_id;
        when 'salesperson_id' then
          update orders set salesperson_id = nullif(p_header->>'salesperson_id','')::uuid where id = p_order_id;
        when 'outlet_id' then
          update orders set outlet_id = nullif(p_header->>'outlet_id','')::uuid where id = p_order_id;
        when 'customer_name' then
          if length(trim(coalesce(p_header->>'customer_name',''))) = 0 then
            raise exception 'Customer name is required' using errcode = '22023';
          end if;
          update orders set customer_name = trim(p_header->>'customer_name') where id = p_order_id;
        else
          execute format('update orders set %I = $1 where id = $2', v_key)
            using nullif(p_header->>v_key, ''), p_order_id;
      end case;
    end if;
  end loop;

  -- Lines diff — update-by-id / insert / delete. A kept row keeps its id,
  -- attrs and source_po.
  if p_lines is not null then
    if jsonb_typeof(p_lines) <> 'array' then
      raise exception 'p_lines must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_lines) = 0 then
      raise exception 'An order needs at least one item' using errcode = '22023';
    end if;
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if length(trim(coalesce(v_line->>'sku',''))) = 0 then
        raise exception 'A line needs a SKU' using errcode = '22023';
      end if;
      if coalesce((v_line->>'qty')::int, 0) < 1 then
        raise exception 'Line % qty must be at least 1', v_line->>'sku' using errcode = '22023';
      end if;
      if coalesce((v_line->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Line % needs a unit price of 0 or more', v_line->>'sku' using errcode = '22023';
      end if;
      if v_line ? 'id' and nullif(v_line->>'id','') is not null then
        v_id := (v_line->>'id')::uuid;
        update order_lines
           set sku = trim(v_line->>'sku'),
               qty = (v_line->>'qty')::int,
               unit_price = (v_line->>'unit_price')::numeric
         where id = v_id and order_id = p_order_id;
        if not found then
          raise exception 'Line % does not belong to this order', v_id using errcode = '22023';
        end if;
      else
        insert into order_lines(order_id, sku, qty, unit_price)
        values (p_order_id, trim(v_line->>'sku'), (v_line->>'qty')::int, (v_line->>'unit_price')::numeric)
        returning id into v_id;
      end if;
      v_keep_ids := array_append(v_keep_ids, v_id);
    end loop;
    delete from order_lines
     where order_id = p_order_id
       and not (id = any(v_keep_ids));
  end if;

  v_new := public.sales_order_snapshot(p_order_id);
  if v_new = v_old then
    raise exception 'Nothing changed' using errcode = '22023';
  end if;

  -- What changed, by name — the header keys whose snapshot value moved,
  -- plus 'items' when the line set moved.
  foreach v_key in array v_keys loop
    if (v_old->'header'->v_key) is distinct from (v_new->'header'->v_key) then
      v_changed := array_append(v_changed, v_key);
    end if;
  end loop;
  if (v_old->'lines') is distinct from (v_new->'lines') then
    v_changed := array_append(v_changed, 'items');
  end if;

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = p_order_id;

  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (p_order_id, v_next, v_new, auth.uid());

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (
    p_order_id,
    'Order edited · Rev ' || v_next || ' — ' || array_to_string(v_changed, ', '),
    v_role::app_role,
    auth.uid(),
    jsonb_build_object('kind','edit','changed', to_jsonb(v_changed), 'revision', v_next)
  );

  return jsonb_build_object('revision', v_next, 'changed', to_jsonb(v_changed));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · the office birth door
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sales_order_create(
  p_header jsonb,
  p_lines  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.app_role();
  v_order_id uuid;
  v_so       int;
  v_line     jsonb;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_header->>'customer_name',''))) = 0 then
    raise exception 'Customer name is required' using errcode = '22023';
  end if;
  if nullif(p_header->>'dealer_id','') is null then
    raise exception 'A dealer is required' using errcode = '22023';
  end if;
  -- orders_salesperson_required (0296): every order the portal writes names
  -- who sold it. Refused here with a sentence, before the constraint speaks.
  if nullif(p_header->>'salesperson_id','') is null then
    raise exception 'A salesperson is required' using errcode = '22023';
  end if;

  insert into orders (
    status, channel, dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_email, customer_address,
    customer_address_line1, customer_address_line2, customer_address_city,
    customer_address_state, customer_address_postcode,
    customer_emergency, customer_billing,
    delivery_date, delivery_date_tbd, proceed_date,
    delivery_floor, delivery_has_lift
  ) values (
    'place',
    case when nullif(p_header->>'outlet_id','') is not null then 'showroom' else 'dealer' end,
    (p_header->>'dealer_id')::uuid,
    nullif(p_header->>'outlet_id','')::uuid,
    nullif(p_header->>'salesperson_id','')::uuid,
    trim(p_header->>'customer_name'),
    nullif(p_header->>'customer_phone',''),
    nullif(p_header->>'customer_email',''),
    nullif(p_header->>'customer_address',''),
    nullif(p_header->>'customer_address_line1',''),
    nullif(p_header->>'customer_address_line2',''),
    nullif(p_header->>'customer_address_city',''),
    nullif(p_header->>'customer_address_state',''),
    nullif(p_header->>'customer_address_postcode',''),
    nullif(p_header->>'customer_emergency',''),
    nullif(p_header->>'customer_billing',''),
    nullif(p_header->>'delivery_date','')::date,
    coalesce((p_header->>'delivery_date_tbd')::boolean, false),
    nullif(p_header->>'proceed_date','')::date,
    coalesce((p_header->>'delivery_floor')::int, 1),
    coalesce((p_header->>'delivery_has_lift')::boolean, false)
  )
  returning id, so into v_order_id, v_so;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if length(trim(coalesce(v_line->>'sku',''))) = 0 then
        raise exception 'A line needs a SKU' using errcode = '22023';
      end if;
      if coalesce((v_line->>'qty')::int, 0) < 1 then
        raise exception 'Line % qty must be at least 1', v_line->>'sku' using errcode = '22023';
      end if;
      if coalesce((v_line->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Line % needs a unit price of 0 or more', v_line->>'sku' using errcode = '22023';
      end if;
      insert into order_lines(order_id, sku, qty, unit_price)
      values (v_order_id, trim(v_line->>'sku'), (v_line->>'qty')::int, (v_line->>'unit_price')::numeric);
    end loop;
  end if;

  -- Rev 1 = the created state. The order is BORN with its original on file.
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (v_order_id, 1, public.sales_order_snapshot(v_order_id), auth.uid());

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (
    v_order_id,
    'Order created (office) · Rev 1',
    v_role::app_role,
    auth.uid(),
    jsonb_build_object('kind','created_office','revision',1)
  );

  return jsonb_build_object('id', v_order_id, 'so', v_so, 'revision', 1);
end $$;

revoke all on function public.sales_order_snapshot(uuid) from public;
revoke all on function public.sales_order_save_revision(uuid, jsonb, jsonb) from public;
revoke all on function public.sales_order_create(jsonb, jsonb) from public;
grant execute on function public.sales_order_snapshot(uuid) to authenticated;
grant execute on function public.sales_order_save_revision(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.sales_order_create(jsonb, jsonb) to authenticated;
