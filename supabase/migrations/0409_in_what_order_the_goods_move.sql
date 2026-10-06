-- =============================================================================
-- 0409 · LAYER ④ — CARRES EXECUTION: in what ORDER the goods actually move
--
-- Loo's claim model, ruled 2026-08-05, carries FOUR layers that may never be
-- collapsed:
--
--     Customer Problem → Supplier Response → Carres Resolution → Carres Execution
--
-- Three have been built: the problem (`claim_type`, 0288), the supplier's
-- answer (`supplier_response`, 0291), and what the customer gets
-- (`customer_resolution`, 0324). **This is the fourth and last.** It was ruled
-- on the same day as layer ③ and left frozen-but-unbuilt, and every downstream
-- document has been waiting on it: `docs/purchasing/MASTER.md` §9.6 refuses to
-- create a Purchase Return except "after approved claim/outcome", §9.7 says the
-- same for a Repair Order, and both are still `soon: true` in the sidebar.
--
-- ── WHAT IT DECIDES, AND WHY IT IS NOT LAYER ③ ──────────────────────────────
--
-- Layer ③ says what the customer GETS. This says how the goods GET there, and
-- Loo's own test keeps them apart: *can both be true at the same time?* Yes —
-- `replace` is a promise, and `Replace First` and `Collect First` are two ways
-- of keeping it. They differ in nothing the customer sees and in something
-- Carres cannot ignore: under `Replace First` two units are committed to one
-- customer for as long as the collection takes.
--
--     Return to Supplier       the item goes back; no customer leg at all
--     Collect Defective Item   Carres collects; nothing goes out
--     Replace First            the new item goes out BEFORE the old is collected
--     Collect First            the old comes back BEFORE the new goes out
--     Exchange on Collection   both change hands in one visit
--
-- ── `Return to Supplier` IS ALSO AN ITEM OUTCOME, AND THAT IS NOT A BUG ─────
--
-- `ops_stock_items.hold_outcome` (0299) already admits `returned_to_supplier`.
-- The two do not collide for the same reason `Repair` sits on both the
-- supplier's answer list and the customer's resolution list, which
-- COPY-STANDARD settles explicitly. The Item Outcome is a fact about the UNIT —
-- where it physically ended up. This is a fact about the CHOREOGRAPHY — that
-- there is no customer leg, which is what makes it the fifth option rather than
-- four. They may disagree: a claim can execute `Collect First` and still end
-- with the unit written off.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ────────────────────────────
--
--  1. **It derives no consequence.** `f(Resolution, Execution)` is computable
--     for the first time — both arguments finally exist — but WHICH stock,
--     finance and demand moves each pair produces has never been ruled. The
--     freeze was on the missing argument; lifting it does not license guessing
--     the function. That is the consequence card's, and it now has one.
--  2. **It does not cross-validate against layer ③.** `Replace First` with
--     `no_replacement_required` is incoherent and this migration still admits
--     it. A CHECK across the two would COLLAPSE two layers the model keeps
--     apart, and it would refuse a legitimate order of work: an operator
--     records the choreography the warehouse is already running before the
--     customer's resolution is final. 0324 set that precedent for layer ③.
--     **The coherence question is real and is flagged, not silently decided.**
--  3. **It does not gate the close.** `supplier_claims_closed_keeps_both_sides`
--     (0291) still asks for the ask and the answer and nothing more. A fourth
--     condition would be a new business rule and this is not the card that
--     rules it.
--  4. **It creates no Purchase Return and no Repair Order.** Those are two
--     registers with their own numbering, PDFs, handover proof and custody
--     moves (§9.6, §9.7). This unblocks them; it does not build them.
--
-- ── SHAPE ───────────────────────────────────────────────────────────────────
--
-- Every column added is NULLable with no backfill, so no existing claim can
-- violate the new constraints and nothing is rewritten. Schema is what this
-- migration owns; DATA is what it walks past — nothing below asserts a
-- production row count.
-- =============================================================================

set search_path = public;

-- ── 1 · the fourth layer ─────────────────────────────────────────────────────

alter table public.supplier_claims
  add column if not exists carres_execution      text,
  add column if not exists carres_execution_note text,
  add column if not exists carres_execution_at   timestamptz,
  add column if not exists carres_execution_by   uuid references public.app_users(id) on delete set null;

comment on column public.supplier_claims.carres_execution is
  'Layer 4 (0409): in what ORDER the goods move — return_to_supplier · collect_defective_item · replace_first · collect_first · exchange_on_collection. Loo''s fourth layer, ruled 2026-08-05. A SEPARATE axis from customer_resolution (0324), never a narrowing of it: `replace` is a promise and Replace First / Collect First are two ways of keeping it that leave Carres holding a different number of units. Derives no stock, finance or demand consequence — f(Resolution, Execution) is now computable but the function itself is unruled.';
comment on column public.supplier_claims.carres_execution_at is
  'Layer 4 (0409): when the execution was last recorded. Re-recordable while the claim is open — the same allowance layer 3 carries, and for the same reason: the plan changes when the customer cannot wait. Refused once closed.';

-- ── 2 · the vocabulary, mirrored in SQL ──────────────────────────────────────
--
-- The database cannot import TypeScript, so the closed list is written twice —
-- here and in `CARRES_EXECUTIONS` (packages/shared/src/supplier-claim.ts). Same
-- law as 0288's vocabulary, 0291's ask list and 0324's resolution list.
create or replace function public.supplier_claim_carres_execution_allowed(
  p_execution text
) returns boolean
language sql
immutable
as $$
  select p_execution is not null
     and p_execution in ('return_to_supplier','collect_defective_item',
                         'replace_first','collect_first','exchange_on_collection');
$$;

comment on function public.supplier_claim_carres_execution_allowed(text) is
  'Layer 4 (0409): the SQL mirror of CARRES_EXECUTIONS in packages/shared/src/supplier-claim.ts. Deliberately excludes every CUSTOMER resolution (replace/repair/accept_as_is/no_replacement_required — they answer what the customer gets, not the order the goods move in), every SUPPLIER answer, and write_off / put_back_in_stock (they are ITEM outcomes and live on ops_stock_items). return_to_supplier appears here AND as an item outcome on purpose: one is the choreography, the other is where the unit ended up.';

alter table public.supplier_claims
  drop constraint if exists supplier_claims_carres_execution_valid,
  drop constraint if exists supplier_claims_carres_execution_stamped;

alter table public.supplier_claims
  add constraint supplier_claims_carres_execution_valid
    check (carres_execution is null
           or public.supplier_claim_carres_execution_allowed(carres_execution)),
  -- A decision nobody dated cannot be placed in the story of the claim — the
  -- rule 0291 wrote for the ask and the answer, and 0324 for the resolution.
  add constraint supplier_claims_carres_execution_stamped
    check ((carres_execution is null) = (carres_execution_at is null));

-- ── 3 · the door ─────────────────────────────────────────────────────────────
--
-- `supplier_claims` has no write policy at all (0288's design), so an RPC is
-- the only way in. Same gate, same locking, same history and audit writes as
-- 0324's — deliberately, so the two layers cannot drift apart in who may record
-- them or in what a recording leaves behind.
create or replace function public.supplier_claim_record_carres_execution(
  p_claim_id uuid,
  p_execution text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role      app_role;
  v_uid       uuid;
  v_actor     text;
  v_claim     supplier_claims;
  v_execution text;
  v_note      text;
begin
  v_role := public.supplier_claim_gate();
  v_uid  := auth.uid();

  v_execution := nullif(btrim(coalesce(p_execution, '')), '');
  v_note      := nullif(btrim(coalesce(p_note, '')), '');
  if p_claim_id is null or v_execution is null then
    raise exception 'p_claim_id and p_execution are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if not public.supplier_claim_carres_execution_allowed(v_execution) then
    raise exception '% is not one of the five Carres executions', v_execution
      using errcode = 'P0001', detail = 'execution_invalid';
  end if;

  select * into v_claim from supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'claim not found' using errcode = '42P01', detail = 'claim_not_found';
  end if;

  -- Re-recording while open is ALLOWED on purpose (see the header). A closed
  -- claim is a finished record and is not edited.
  if v_claim.status = 'closed' then
    raise exception 'claim % is already closed', v_claim.claim_no
      using errcode = 'P0001', detail = 'claim_closed';
  end if;

  update supplier_claims
     set carres_execution      = v_execution,
         carres_execution_note = v_note,
         carres_execution_at   = now(),
         carres_execution_by   = v_uid,
         updated_at            = now()
   where id = p_claim_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_claim.po_id,
          format('Claim %s — how the goods move: %s%s', v_claim.claim_no, v_execution,
                 case when v_note is null then '' else format(' (%s)', v_note) end),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Supplier claim %s — Carres execution %s', v_claim.claim_no, v_execution),
          v_claim.claim_no);

  return jsonb_build_object(
    'claim_no',         v_claim.claim_no,
    'carres_execution', v_execution,
    'status',           v_claim.status
  );
end;
$fn$;

revoke execute on function public.supplier_claim_record_carres_execution(uuid, text, text) from public;
revoke execute on function public.supplier_claim_record_carres_execution(uuid, text, text) from anon;
grant  execute on function public.supplier_claim_record_carres_execution(uuid, text, text) to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
--
-- Schema is what this migration owns; DATA is what it walks past. Nothing below
-- asserts a production row count.
do $$
declare
  v_copies int;
  v_ok     boolean;
  v_name   text;
begin
  foreach v_name in array array['supplier_claim_carres_execution_allowed',
                                'supplier_claim_record_carres_execution']
  loop
    select count(*) into v_copies
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;
    if v_copies <> 1 then
      raise exception 'sanity: % copies of %', v_copies, v_name;
    end if;
  end loop;

  -- the vocabulary mirrors packages/shared/src/supplier-claim.ts
  if not (public.supplier_claim_carres_execution_allowed('return_to_supplier')
          and public.supplier_claim_carres_execution_allowed('collect_defective_item')
          and public.supplier_claim_carres_execution_allowed('replace_first')
          and public.supplier_claim_carres_execution_allowed('collect_first')
          and public.supplier_claim_carres_execution_allowed('exchange_on_collection')) then
    raise exception 'sanity: one of Loo''s five executions is refused';
  end if;
  -- The other three layers' words are asserted BY NAME so a future chat that
  -- collapses two layers into one list breaks this migration's own record of
  -- why they are apart.
  if public.supplier_claim_carres_execution_allowed('replace')
     or public.supplier_claim_carres_execution_allowed('repair')
     or public.supplier_claim_carres_execution_allowed('accept_as_is')
     or public.supplier_claim_carres_execution_allowed('no_replacement_required')
     or public.supplier_claim_carres_execution_allowed('write_off')
     or public.supplier_claim_carres_execution_allowed('put_back_in_stock')
     or public.supplier_claim_carres_execution_allowed('reject')
     or public.supplier_claim_carres_execution_allowed('deliver_remaining') then
    raise exception 'sanity: another layer''s word is admitted as an execution';
  end if;
  if public.supplier_claim_carres_execution_allowed(null) then
    raise exception 'sanity: a null must never be allowed through';
  end if;

  -- the constraints are installed
  select count(*) into v_copies
    from pg_constraint
   where conrelid = 'public.supplier_claims'::regclass
     and conname in ('supplier_claims_carres_execution_valid',
                     'supplier_claims_carres_execution_stamped');
  if v_copies <> 2 then
    raise exception 'sanity: expected 2 execution constraints, found %', v_copies;
  end if;

  -- 0324's layer ③ is UNTOUCHED. This layer sits BESIDE it, never over it, and
  -- a card that quietly replaced the resolution with the execution would be the
  -- collapse Loo's model exists to prevent.
  select count(*) into v_copies
    from pg_constraint
   where conrelid = 'public.supplier_claims'::regclass
     and conname in ('supplier_claims_customer_resolution_valid',
                     'supplier_claims_customer_resolution_stamped');
  if v_copies <> 2 then
    raise exception 'sanity: 0324''s resolution constraints are gone';
  end if;

  -- 0291's close gate is UNCHANGED — this card does not re-rule the close
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.supplier_claims'::regclass
                    and conname = 'supplier_claims_closed_keeps_both_sides') then
    raise exception 'sanity: 0291''s both-sides close gate is gone';
  end if;

  -- the table still has no write policy: every write goes through an RPC
  select relrowsecurity into v_ok from pg_class where oid = 'public.supplier_claims'::regclass;
  if not v_ok then raise exception 'sanity: RLS off on supplier_claims'; end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'supplier_claims'
                and cmd <> 'SELECT') then
    raise exception 'sanity: supplier_claims gained a non-SELECT policy';
  end if;

  -- grants, asserted BOTH directions (0281's rule: a revoke alone proves nothing)
  if has_function_privilege('anon', 'public.supplier_claim_record_carres_execution(uuid, text, text)', 'execute') then
    raise exception 'sanity: anon can record a Carres execution';
  end if;
  if not has_function_privilege('authenticated', 'public.supplier_claim_record_carres_execution(uuid, text, text)', 'execute') then
    raise exception 'sanity: authenticated cannot record a Carres execution';
  end if;

  -- 0299's quarantine door is untouched: the ITEM outcome keeps its own home,
  -- and `return_to_supplier` living on BOTH lists is the point, not an error
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'ops_stock_resolve_hold') then
    raise exception 'sanity: the item-outcome door is gone';
  end if;
end $$;
