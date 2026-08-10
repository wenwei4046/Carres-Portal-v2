-- 0334 · THE AMENDMENT BINDS THE CONTRACT IT WAS COMPUTED FROM
-- (STAGE 3 · card 3.5 — the spine, built without the two undecided things)
--
-- Card 3.5, verbatim: "do NOT build ISSUE. Do NOT build ACCEPT. Do NOT build
-- Class-A APPLY. Class-A APPLY must exist ONLY as a hard refusal — that
-- refusal IS the deliverable. It proves the boundary holds."
--
-- So this migration ships:
--   · the amendment record, with `base_contractual_hash`
--   · SUBMIT
--   · the staleness rule
--   · an APPLY that always refuses
-- and nothing else. No signing form. No document. No visual amendment.
--
-- ── WHY THE HASH IS OVER CLASS A ONLY ──
--
-- GATE 4's new floor: time passes between ISSUE and ACCEPT, and the order can
-- move inside it. Blocking Class B during that window would be wrong — a phone
-- number fix must not be held hostage to a customer who has not replied
-- (`LOCK THE CONSEQUENCE`). Because GATE 1 is two EXPLICIT allowlists, a hash
-- over the Class A fields alone gives exactly the right behaviour, by
-- definition of the list:
--
--   Class B lands in the window    → hash unchanged → the amendment stands
--   another Class A lands first    → hash changed   → the amendment is STALE
--
-- ── ONE LIST, TWO RUNTIMES ──
--
-- The field list below is `CLASS_A_FIELDS` from
-- packages/shared/src/sales-order-classification.ts, resolved to columns. The
-- database needs it because staleness must be decided atomically at APPLY,
-- where the row is locked; TypeScript needs it because 3.1's build-time
-- exhaustiveness test does. Two runtimes genuinely need the same constant, so
-- the registry stays the AUTHORITY and this function is held to it
-- mechanically: `sales_order_contractual_fields()` returns its own list, and
-- a test in packages/shared asserts it equals CLASS_A_FIELDS. Drift fails the
-- build rather than silently changing what "the contract" means.

create or replace function public.sales_order_contractual_fields()
returns text[]
language sql
immutable
as $$
  select array[
    'orders.delivery_date',
    'orders.delivery_date_tbd',
    'orders.installment_months',
    'order_lines.sku',
    'order_lines.qty',
    'order_lines.unit_price',
    'order_lines.attrs',
    'order_addons.addon_key',
    'order_addons.qty',
    'order_addons.unit_price',
    'order_addons.attrs'
  ]
$$;

-- The contractual state, canonically ordered so the same contract always
-- hashes the same. Lines are ordered by (sku, qty, unit_price) rather than by
-- id: re-typing an identical line under a new id is the SAME contract, and a
-- hash that disagreed would call a document stale for no business reason.
create or replace function public.sales_order_contractual_hash(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce((
      select jsonb_build_object(
        'delivery_date',       o.delivery_date,
        'delivery_date_tbd',   o.delivery_date_tbd,
        'installment_months',  o.installment_months
      )::text from orders o where o.id = p_order_id), '')
    || coalesce((
      select jsonb_agg(jsonb_build_object(
               'sku', l.sku, 'qty', l.qty,
               'unit_price', l.unit_price, 'attrs', l.attrs)
             order by l.sku, l.qty, l.unit_price)::text
        from order_lines l where l.order_id = p_order_id), '[]')
    || coalesce((
      select jsonb_agg(jsonb_build_object(
               'addon_key', a.addon_key, 'qty', a.qty,
               'unit_price', a.unit_price, 'attrs', a.attrs)
             order by a.addon_key, a.qty, a.unit_price)::text
        from order_addons a where a.order_id = p_order_id), '[]')
  )
$$;

create table if not exists public.sales_order_amendments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  -- The revision this document was computed FROM.
  base_revision         int not null,
  -- The Class-A-only hash at that moment. The concurrency guard.
  base_contractual_hash text not null,
  -- What the sales order BECOMES if the customer accepts. A proposal, never
  -- a fact: nothing reads this as the order's state.
  proposed_snapshot     jsonb not null,
  reason                text,
  -- draft → submitted → (issued → accepted → applied). The three states in
  -- brackets are NOT reachable in Stage 3 and no code here writes them; they
  -- are named so 3.6/3.7/3.8 extend this column instead of inventing a
  -- second one.
  status                text not null default 'submitted'
                        check (status in ('draft','submitted','issued','accepted','applied','withdrawn')),
  submitted_by          uuid,
  submitted_at          timestamptz not null default now(),
  applied_at            timestamptz,
  created_at            timestamptz not null default now()
);

comment on table public.sales_order_amendments is
  'STAGE 3 card 3.5 - the amendment spine. ISSUE, ACCEPT and Class-A APPLY are NOT built (owner wall).';

-- One live amendment per order. A second proposal while one is open is two
-- documents claiming to be the contract.
create unique index if not exists amendments_one_live_per_order
  on public.sales_order_amendments (order_id)
  where status in ('draft','submitted','issued','accepted');

alter table public.sales_order_amendments enable row level security;

drop policy if exists amendments_select_internal on public.sales_order_amendments;
create policy amendments_select_internal
  on public.sales_order_amendments for select
  using ((select public.is_internal()));

revoke all on public.sales_order_amendments from anon, authenticated;
grant select on public.sales_order_amendments to authenticated;

-- ── SUBMIT ─────────────────────────────────────────────────────────────────
-- Records a proposal. Writes NOTHING on the order — and in particular does
-- NOT freeze it: an open amendment must not lock phone, address or notes.
-- There is no lock here to remove; the absence is the feature.
create or replace function public.sales_order_submit_amendment(
  p_order_id uuid,
  p_proposed jsonb,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_rev  int;
  v_hash text;
  v_id   uuid;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_proposed is null or jsonb_typeof(p_proposed) <> 'object' then
    raise exception 'A proposal is required' using errcode = '22023';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- The document is computed FROM the current revision. Mint Rev 1 first if
  -- the order has never been touched, so `base_revision` always points at a
  -- snapshot that exists (0327's pattern).
  if not exists (select 1 from sales_order_revisions where order_id = p_order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (p_order_id, 1, public.sales_order_snapshot(p_order_id), auth.uid());
  end if;
  select max(revision) into v_rev from sales_order_revisions where order_id = p_order_id;
  v_hash := public.sales_order_contractual_hash(p_order_id);

  begin
    insert into sales_order_amendments(
      order_id, base_revision, base_contractual_hash, proposed_snapshot, reason,
      status, submitted_by)
    values (p_order_id, v_rev, v_hash, p_proposed, nullif(trim(coalesce(p_reason,'')),''),
            'submitted', auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'An amendment is already open on this sales order'
      using errcode = '22023', detail = 'amendment_exists';
  end;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          'Amendment submitted - from Rev ' || v_rev,
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','amendment_submitted','amendment_id',v_id,
                             'base_revision',v_rev));
  return jsonb_build_object('id', v_id, 'base_revision', v_rev,
                            'base_contractual_hash', v_hash, 'status', 'submitted');
end $$;

-- ── THE LIVE AMENDMENT, AND WHETHER IT IS STILL TRUE ───────────────────────
-- STALE is DERIVED, never stored: storing it would need something to notice
-- the change and write it, and whatever failed to run would leave a stale
-- document reading as valid. Comparing the hash on every read cannot drift.
create or replace function public.sales_order_amendment_live(p_order_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a    sales_order_amendments%rowtype;
  v_now  text;
begin
  if v_role not in ('operation','principal','finance','hr','bd') then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  select * into v_a from sales_order_amendments
   where order_id = p_order_id
     and status in ('draft','submitted','issued','accepted')
   order by submitted_at desc limit 1;
  if not found then
    return jsonb_build_object('amendment', null);
  end if;
  v_now := public.sales_order_contractual_hash(p_order_id);
  return jsonb_build_object('amendment', jsonb_build_object(
    'id', v_a.id,
    'status', v_a.status,
    'reason', v_a.reason,
    'base_revision', v_a.base_revision,
    'base_contractual_hash', v_a.base_contractual_hash,
    'current_contractual_hash', v_now,
    'stale', v_now is distinct from v_a.base_contractual_hash,
    'proposed_snapshot', v_a.proposed_snapshot,
    'submitted_at', v_a.submitted_at));
end $$;

-- ── APPLY · THE REFUSAL THAT IS THE DELIVERABLE ────────────────────────────
-- Card 3.5: "Class-A APPLY must exist ONLY as a hard refusal. That refusal IS
-- the deliverable. It proves the boundary holds."
--
-- It refuses UNCONDITIONALLY — before reading status, before comparing the
-- hash, before looking at a floor. A refusal that only fires when some other
-- check passes is a door with a lock on the inside: the day ACCEPT lands,
-- whatever path avoided those checks would apply an unaccepted amendment.
-- The customer's agreement does not exist yet, so nothing may be applied yet,
-- and this function knows only that.
create or replace function public.sales_order_apply_amendment(p_amendment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Class A amendment cannot be applied - ACCEPT is not built yet'
    using errcode = '22023', detail = 'accept_not_built';
end $$;

revoke all on function public.sales_order_submit_amendment(uuid, jsonb, text) from public;
revoke all on function public.sales_order_amendment_live(uuid) from public;
revoke all on function public.sales_order_apply_amendment(uuid) from public;
grant execute on function public.sales_order_submit_amendment(uuid, jsonb, text) to authenticated;
grant execute on function public.sales_order_amendment_live(uuid) to authenticated;
grant execute on function public.sales_order_apply_amendment(uuid) to authenticated;
grant execute on function public.sales_order_contractual_hash(uuid) to authenticated;
grant execute on function public.sales_order_contractual_fields() to authenticated;
