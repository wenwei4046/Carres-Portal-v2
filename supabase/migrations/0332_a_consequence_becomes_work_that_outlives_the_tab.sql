-- 0332 · A CONSEQUENCE BECOMES WORK THAT OUTLIVES THE TAB
-- (STAGE 3 · card 3.4 — DOWNSTREAM)
--
--   DOWNSTREAM = PERSISTED correction work, owned by the RECEIVING module,
--                with a state and an owner, that survives until someone
--                closes it.
--   NOT a toast. NOT an email. NOT a fire-and-forget event.
--   NOT an automatic rewrite of the other module's fact.
--
-- `LINEAGE IS NOT PERMISSION.` This migration writes ONE table and no other.
-- It never touches purchase_orders, purchase_order_lines, po_receipts,
-- invoices, payments or any delivery record — it records that a human must
-- look, and names exactly what to look at.
--
-- ── WHERE THE RAISE HAPPENS, AND WHY NOT WHERE THE CARD SAYS ──
--
-- Card 3.4's DONE WHEN reads: "apply a 3.3 attribution change on an order
-- with a live shared PO". MEASURED 2026-08-10, that scenario raises nothing,
-- and it cannot:
--
--   sales_order_floors(SO-1206, ['salesperson_id'])  → 1 finding, commission,
--                                                      BLOCK. No WORK.
--   sales_order_floors(SO-1206, ['order_lines'])     → 2 findings, both
--                                                      purchase_orders, WORK,
--                                                      both SHARED.
--
-- GATE 6 (frozen) gives attribution exactly ONE consequence — the commission
-- month lock — and that consequence is a floor, never work. An attribution
-- change moves who gets paid; it does not move what the factory was asked to
-- build. So the demo in the card is impossible by construction, not unbuilt.
--
-- The mechanism is therefore hung where consequences actually appear: AT
-- REVISION-MINT TIME. `_raise_correction_work` is called by every door that
-- mints a revision — Stage 2's SAVE and 3.3's attribution APPLY today, and
-- 3.8's Class-A APPLY for free when it lands. Attribution calls it and raises
-- nothing, correctly; an items change raises the purchasing work the card's
-- negative controls were written about.
--
-- ── NOT CLOSABLE BY THE MODULE THAT RAISED IT ──
--
-- Carres has ONE `operation` role covering both the Sales Orders desk and
-- Purchasing, so a role check cannot tell the two modules apart. The two
-- lines that CAN be drawn, and both are:
--   · no Sales Order door closes work — `correction_work_close` is a separate
--     function on the owning module's surface, and nothing in the SO lane
--     calls it;
--   · the person whose change raised the work may not tick it off. Someone
--     else must look. That is the point of durable work.

create table if not exists public.sales_order_correction_work (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  -- The revision that raised it: the work is about a specific version of the
  -- document, and "which change caused this" must survive later changes.
  revision             int  not null,
  -- The RECEIVING module — who owns the correction, not who caused it.
  module               text not null check (module in ('purchasing','operation','delivery','finance')),
  -- The floor evaluator's own consequence key, carried through unchanged so
  -- there is one vocabulary (Law D) rather than a second naming here.
  consequence          text not null,
  fields_changed       text[] not null default '{}',
  classification       text not null check (classification in ('A','B')),
  -- POINTERS, never an allocation truth: which PO / which other sales orders
  -- may be affected. BUILD-QUEUE PO LINEAGE — never used to auto-adjust a
  -- purchase order's quantity.
  potentially_affected jsonb not null default '{}'::jsonb,
  shared               boolean not null default false,
  -- The evaluator's sentence, stored as raised. The operator reads the same
  -- words the gate said.
  evidence             text not null,
  state                text not null default 'open' check (state in ('open','closed')),
  raised_by            uuid,
  raised_at            timestamptz not null default now(),
  closed_by            uuid,
  closed_at            timestamptz,
  closed_note          text,
  -- A closed row states who and when. An open row states neither.
  constraint correction_work_closed_is_complete check (
    (state = 'open'  and closed_by is null and closed_at is null)
    or (state = 'closed' and closed_at is not null)
  )
);

comment on table public.sales_order_correction_work is
  'STAGE 3 card 3.4 — durable correction work raised BY a sales order change FOR a downstream module. Never a rewrite of that module''s facts.';

-- One OPEN row per order + consequence + target. Saving twice while the work
-- is still open must not breed a second copy of the same instruction; once it
-- is closed, a NEW change may legitimately raise it again.
-- `coalesce(..., '')` is load-bearing: NULLs are DISTINCT in a unique index,
-- so a bare `->>'po_id'` would let the operation and delivery findings — which
-- name no PO — duplicate on every save.
create unique index if not exists correction_work_one_open_per_target
  on public.sales_order_correction_work
     (order_id, consequence, (coalesce(potentially_affected->>'po_id', '')))
  where state = 'open';

create index if not exists correction_work_open_by_module
  on public.sales_order_correction_work (module, state, raised_at desc);

alter table public.sales_order_correction_work enable row level security;

-- READ for internal roles. There is deliberately NO write policy: every write
-- goes through the definer functions below, so the GRANT is a door number
-- with no door — the same floor 3.0-EXTEND proved on sales_order_revisions.
drop policy if exists correction_work_select_internal on public.sales_order_correction_work;
create policy correction_work_select_internal
  on public.sales_order_correction_work for select
  using ((select public.is_internal()));

revoke all on public.sales_order_correction_work from anon, authenticated;
grant select on public.sales_order_correction_work to authenticated;

-- ── THE RAISE · called at revision-mint time, writes ONE table ──────────────
--
-- Reads the SAME evaluator the floors use (Law D — not a second reading of
-- what "affected" means) and turns every WORK finding into a row. BLOCK is
-- not its business: a BLOCK already failed the write. NONE is not its
-- business either: nothing to correct.
create or replace function public._raise_correction_work(
  p_order_id  uuid,
  p_changed   text[],
  p_revision  int,
  p_class     text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f       jsonb;
  v_raised  int := 0;
  v_po      text;
  v_module  text;
begin
  for v_f in
    select f from jsonb_array_elements(
      public.sales_order_floors(p_order_id, p_changed)->'findings') f
    where f->>'severity' = 'WORK'
  loop
    v_module := case v_f->>'consequence'
                  when 'purchase_orders' then 'purchasing'
                  when 'operation_stage' then 'operation'
                  when 'logistics'       then 'delivery'
                  when 'invoices'        then 'finance'
                  else 'operation'
                end;
    -- The PO the evidence names, pulled out so the unique index can keep one
    -- open row per purchase order rather than one per change.
    v_po := substring(v_f->>'evidence' from 'PO ([A-Za-z0-9-]+)');

    insert into sales_order_correction_work (
      order_id, revision, module, consequence, fields_changed, classification,
      potentially_affected, shared, evidence, raised_by)
    values (
      p_order_id, p_revision, v_module, v_f->>'consequence',
      string_to_array(coalesce(v_f->>'field',''), ','), p_class,
      jsonb_strip_nulls(jsonb_build_object('po_id', v_po, 'state', v_f->>'state')),
      coalesce((v_f->>'shared')::boolean, false),
      v_f->>'evidence', auth.uid())
    on conflict do nothing;

    if found then v_raised := v_raised + 1; end if;
  end loop;
  return v_raised;
end $$;

-- ── THE CLOSE · the owning module's own door ────────────────────────────────
create or replace function public.correction_work_close(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_row  sales_order_correction_work%rowtype;
begin
  if v_role not in ('operation','finance','principal') then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  select * into v_row from sales_order_correction_work where id = p_id for update;
  if not found then
    raise exception 'Correction work not found' using errcode = 'P0002';
  end if;
  if v_row.state = 'closed' then
    return jsonb_build_object('id', p_id, 'already_closed', true);
  end if;
  -- Someone else must look. The person whose change raised the work has
  -- already decided it was fine; letting them close it makes the row a
  -- formality instead of a handover.
  if v_row.raised_by is not null and v_row.raised_by = auth.uid() then
    raise exception 'This correction work is closed by the module that receives it, not the one that raised it'
      using errcode = '42501', detail = 'closed_by_raiser';
  end if;

  update sales_order_correction_work
     set state = 'closed', closed_by = auth.uid(), closed_at = now(),
         closed_note = nullif(trim(coalesce(p_note,'')), '')
   where id = p_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_row.order_id,
          'Correction work closed · ' || v_row.module || ' — ' || v_row.consequence,
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','correction_work_closed','work_id',p_id,
                             'module',v_row.module));
  return jsonb_build_object('id', p_id, 'state', 'closed');
end $$;

revoke all on function public.correction_work_close(uuid, text) from public;
grant execute on function public.correction_work_close(uuid, text) to authenticated;
