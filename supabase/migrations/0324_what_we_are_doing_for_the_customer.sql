-- =============================================================================
-- 0324_what_we_are_doing_for_the_customer.sql — the claim's THIRD layer
-- =============================================================================
-- Loo's claim model, ruled 2026-08-05 (docs/purchasing/MASTER.md §6). A claim
-- carries FOUR layers and they may never be collapsed:
--
--   Customer Problem → Supplier Response → Carres Resolution → Carres Execution
--
-- 0288 gave the table layer ① (`claim_type`). 0291 gave it layer ② (what we
-- asked · what the supplier answered). 0299 gave the ITEM its outcome, on the
-- stock register. **Nothing anywhere answered the question the customer is
-- actually waiting on: what are we doing for THEM?**
--
-- ── Why this is a SECOND decision and not a longer list ─────────────────────
-- Loo's test: *can both be true at the same time?* **If yes, they are two
-- fields, not one list.** The customer cancelled AND the mattress is destroyed
-- — under one list the operator must choose which truth to record, i.e. must
-- lie. So `customer_resolution` sits beside the item's outcome, and neither
-- constrains the other in this migration or in any screen.
--
-- ── The four, and what is deliberately absent ───────────────────────────────
--   `replace` · `repair` · `accept_as_is` · `no_replacement_required`
--
--   · `return_to_supplier` and `write_off` are NOT here. They answer what
--     happened to the ITEM, they already exist in 0299's `ops_stock_resolve_hold`,
--     and `Return to Supplier` loops back rather than resolving anything for
--     the customer — it is an EXECUTION move.
--   · `cancel_outstanding` is NOT here: `no_replacement_required` replaced it,
--     and the rename changed what the option DOES. SC-1014 is 3 ordered / 3
--     received, so its outstanding is 0 and `Cancel Outstanding` could not have
--     been pressed at all, while `No Replacement Required` is the true answer.
--   · `reject` · `deliver_remaining` · `replacement` · `return_and_replace` are
--     SUPPLIER answers, not Carres decisions. They stay in `supplier_response`.
--   · **`refund` is NOT built and NOT deleted.** Supplier credit note? cash?
--     offset against future purchases? The business meaning is not frozen and
--     nobody may guess it. No column here mentions money.
--
-- ── Three decisions this migration makes, each one load-bearing ─────────────
--
--   1. **NOT gated on the supplier's answer.** A customer who cancels does not
--      wait for Ohana to reply, and a claim can carry a resolution the day it is
--      raised. This is 0299's own reasoning applied to the third layer: the
--      goods, the paperwork and the customer move on different days, and tying
--      them teaches people to record a false step to unlock a real one.
--   2. **Re-recordable while the claim is OPEN, refused once it is CLOSED.**
--      The ASK freezes when the supplier answers, because the two-field design
--      exists to preserve a disagreement. A resolution has no counterpart to
--      disagree with, and Loo's business law 2 explicitly contemplates Carres
--      changing it ("unless Carres decides the customer cannot wait, in which
--      case the customer gets a replacement first"). Every change is written to
--      `po_history` and `audit_log`, so nothing is lost by allowing it.
--   3. **Closing is NOT gated on a resolution.** The close gate is "both sides
--      on file" (0291) and it stays exactly that. Adding a third condition is a
--      new business rule, and this card was ruled to build layer ③, not to
--      re-rule the close.
--
-- **No consequence is derived here.** Loo's law 5: consequences are
-- `f(Resolution, Execution)`, never `f(Resolution)`, and Carres Execution is
-- frozen-but-unbuilt. This migration stores a decision; it moves no stock, it
-- touches no quantity, and it writes nothing into `purchase_order_lines`.
--
-- Live state when this was written: **1 supplier claim** (`SC-1014`, closed).
-- Every column added is NULLable with no backfill, so that row is carried
-- unchanged and no existing row can violate the new constraints.
-- =============================================================================

set search_path = public;

-- ── 1 · the third layer ──────────────────────────────────────────────────────

alter table public.supplier_claims
  add column if not exists customer_resolution      text,
  add column if not exists customer_resolution_note text,
  add column if not exists customer_resolution_at   timestamptz,
  add column if not exists customer_resolution_by   uuid references public.app_users(id) on delete set null;

comment on column public.supplier_claims.customer_resolution is
  'Layer 3 (0324): what Carres is doing for the CUSTOMER — replace · repair · accept_as_is · no_replacement_required. A SECOND decision beside the ITEM''s outcome (ops_stock_items, 0299), never a replacement for it: the customer can cancel AND the item be destroyed, and both must be recordable. Never derives a stock, finance or demand consequence — those are f(Resolution, Execution) and Execution is unbuilt.';
comment on column public.supplier_claims.customer_resolution_at is
  'Layer 3 (0324): when the resolution was last recorded. Re-recordable while the claim is open (Loo''s law 2: Carres may switch a repair to a replacement when the customer cannot wait); refused once closed.';

-- ── 2 · the vocabulary, mirrored in SQL ──────────────────────────────────────
--
-- The database cannot import TypeScript, so the closed list is written twice —
-- here and in `CUSTOMER_RESOLUTIONS` (packages/shared/src/supplier-claim.ts).
-- Same law as 0288's vocabulary and 0291's ask list.
create or replace function public.supplier_claim_customer_resolution_allowed(
  p_resolution text
) returns boolean
language sql
immutable
as $$
  select p_resolution is not null
     and p_resolution in ('replace','repair','accept_as_is','no_replacement_required');
$$;

comment on function public.supplier_claim_customer_resolution_allowed(text) is
  'Layer 3 (0324): the SQL mirror of CUSTOMER_RESOLUTIONS in packages/shared/src/supplier-claim.ts. Deliberately excludes return_to_supplier / write_off (they are ITEM outcomes), cancel_outstanding (renamed no_replacement_required), every supplier answer, and refund (business meaning not frozen).';

alter table public.supplier_claims
  drop constraint if exists supplier_claims_customer_resolution_valid,
  drop constraint if exists supplier_claims_customer_resolution_stamped;

alter table public.supplier_claims
  add constraint supplier_claims_customer_resolution_valid
    check (customer_resolution is null
           or public.supplier_claim_customer_resolution_allowed(customer_resolution)),
  -- A decision nobody dated cannot be placed in the story of the claim — the
  -- same rule 0291 wrote for the ask and the answer.
  add constraint supplier_claims_customer_resolution_stamped
    check ((customer_resolution is null) = (customer_resolution_at is null));

-- ── 3 · the move ─────────────────────────────────────────────────────────────
--
-- `supplier_claims` has no write policy at all (0288's design), so this is the
-- only door. Gate is 0291's: operation + principal, failing closed on a NULL
-- role.
create or replace function public.supplier_claim_record_customer_resolution(
  p_claim_id uuid,
  p_resolution text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role       app_role;
  v_uid        uuid;
  v_actor      text;
  v_claim      supplier_claims;
  v_resolution text;
  v_note       text;
begin
  v_role := public.supplier_claim_gate();
  v_uid  := auth.uid();

  v_resolution := nullif(btrim(coalesce(p_resolution, '')), '');
  v_note       := nullif(btrim(coalesce(p_note, '')), '');
  if p_claim_id is null or v_resolution is null then
    raise exception 'p_claim_id and p_resolution are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if not public.supplier_claim_customer_resolution_allowed(v_resolution) then
    raise exception '% is not one of the four customer resolutions', v_resolution
      using errcode = 'P0001', detail = 'resolution_invalid';
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
     set customer_resolution      = v_resolution,
         customer_resolution_note = v_note,
         customer_resolution_at   = now(),
         customer_resolution_by   = v_uid,
         updated_at               = now()
   where id = p_claim_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_claim.po_id,
          format('Claim %s — for the customer: %s%s', v_claim.claim_no, v_resolution,
                 case when v_note is null then '' else format(' (%s)', v_note) end),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Supplier claim %s — customer resolution %s', v_claim.claim_no, v_resolution),
          v_claim.claim_no);

  return jsonb_build_object(
    'claim_no',            v_claim.claim_no,
    'customer_resolution', v_resolution,
    'status',              v_claim.status
  );
end;
$fn$;

revoke execute on function public.supplier_claim_record_customer_resolution(uuid, text, text) from public;
revoke execute on function public.supplier_claim_record_customer_resolution(uuid, text, text) from anon;
grant  execute on function public.supplier_claim_record_customer_resolution(uuid, text, text) to authenticated;

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
  foreach v_name in array array['supplier_claim_customer_resolution_allowed',
                                'supplier_claim_record_customer_resolution']
  loop
    select count(*) into v_copies
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;
    if v_copies <> 1 then
      raise exception 'sanity: % copies of %', v_copies, v_name;
    end if;
  end loop;

  -- the vocabulary mirrors packages/shared/src/supplier-claim.ts
  if not (public.supplier_claim_customer_resolution_allowed('replace')
          and public.supplier_claim_customer_resolution_allowed('repair')
          and public.supplier_claim_customer_resolution_allowed('accept_as_is')
          and public.supplier_claim_customer_resolution_allowed('no_replacement_required')) then
    raise exception 'sanity: one of Loo''s four resolutions is refused';
  end if;
  -- the ones §6 names and removes, each asserted BY NAME so a future chat that
  -- puts one back breaks this migration's own record of why it is not there
  if public.supplier_claim_customer_resolution_allowed('return_to_supplier')
     or public.supplier_claim_customer_resolution_allowed('write_off')
     or public.supplier_claim_customer_resolution_allowed('cancel_outstanding')
     or public.supplier_claim_customer_resolution_allowed('reject')
     or public.supplier_claim_customer_resolution_allowed('deliver_remaining')
     or public.supplier_claim_customer_resolution_allowed('replacement')
     or public.supplier_claim_customer_resolution_allowed('return_and_replace')
     or public.supplier_claim_customer_resolution_allowed('refund') then
    raise exception 'sanity: a removed option is admitted as a customer resolution';
  end if;
  if public.supplier_claim_customer_resolution_allowed(null) then
    raise exception 'sanity: a null must never be allowed through';
  end if;

  -- the constraints are installed
  select count(*) into v_copies
    from pg_constraint
   where conrelid = 'public.supplier_claims'::regclass
     and conname in ('supplier_claims_customer_resolution_valid',
                     'supplier_claims_customer_resolution_stamped');
  if v_copies <> 2 then
    raise exception 'sanity: expected 2 resolution constraints, found %', v_copies;
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
  if has_function_privilege('anon', 'public.supplier_claim_record_customer_resolution(uuid, text, text)', 'execute') then
    raise exception 'sanity: anon can record a customer resolution';
  end if;
  if not has_function_privilege('authenticated', 'public.supplier_claim_record_customer_resolution(uuid, text, text)', 'execute') then
    raise exception 'sanity: authenticated cannot record a customer resolution';
  end if;

  -- 0299's quarantine door is untouched: the ITEM outcome keeps its own home,
  -- and removing it would leave held goods with no way out of quarantine
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'ops_stock_resolve_hold') then
    raise exception 'sanity: the item-outcome door is gone';
  end if;
end $$;
