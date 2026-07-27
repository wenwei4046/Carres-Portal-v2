-- =============================================================================
-- 0291_supplier_claim_lifecycle.sql — R3 of the receiving & claim queue
-- =============================================================================
-- Card R3 (docs/receiving-claim-execution-queue.md, locked with Jess 2026-07-27):
-- "the case carries what WE ask (Replace · Deliver missing parts · Deliver
--  correct item · Repair · Return for inspection) and what the SUPPLIER answered
--  (Replacement · Deliver remaining · Repair · Return & replace · Reject ·
--  Other agreement) — two separate fields, so 'what we wanted vs what we got'
--  is analysable."
-- Done when: **every open claim shows who owes the next move; closed claims
-- keep both sides.**
--
-- R2 (0288) made the problem impossible to hide. It stopped there on purpose:
-- `status` was two-valued and nothing could close a claim, so the queue stated
-- facts and offered nothing to click. This migration gives the claim its
-- lifecycle — and makes every rule above a property of the table, not a habit
-- of one screen.
--
-- What this does:
--   1. TWO SIDES, never one field. `requested_action` (what we asked) and
--      `supplier_response` (what they answered), each with its own stamp and
--      author. A single "resolution" column would collapse the card's whole
--      point: R5 could then count that a claim ended, but never that Ohana
--      answers "repair" every time we ask for "replace".
--   2. `supplier_claim_request_allowed(claim_type, action)` — the SQL mirror of
--      `requestedActionsFor` / `isRequestedActionFor` in
--      packages/shared/src/supplier-claim.ts (the database cannot import
--      TypeScript — same law as 0288's vocabulary and 0285's priority rule).
--   3. CHECK constraints that make the card's sentences unbreakable:
--        · an answer cannot exist without a question  (both-sides integrity)
--        · a closed claim carries BOTH sides + a close stamp  (the done-when)
--        · `Reject` and `Other agreement` must carry a note  (see below)
--   4. Three RPCs — record the ask · record the answer · close — because
--      `supplier_claims` has no write policy at all (0288's design: every write
--      goes through a SECURITY DEFINER function, so PostgREST offers no door).
--   5. `supplier_claim_sweep_overdue()` re-issued: a late claim is now BORN
--      with its ask already stamped.
--
-- Deliberate design decisions (each one is load-bearing):
--
--   * **A late claim's ask is stamped at birth, not picked.** Jess's ask list
--     covers the five things you do about goods you are HOLDING — every one of
--     them is meaningless when nothing arrived. `late_delivery` claims are
--     minted automatically by the nightly sweep, so a late claim with no legal
--     ask would jam in the queue forever with nothing anyone could pick. There
--     is exactly one thing to ask a late supplier ("send what you owe us"), so
--     the system stamps it and no human decides. The word reused is the
--     supplier answer list's own `deliver_remaining`, not a sixth invented one.
--     THIS IS A GAP IN THE CARD'S LIST AND IS REPORTED TO JESS, not quietly
--     patched: if she wants a different word, one constant changes.
--   * **The supplier's answer list is NOT narrowed by what we asked.** They may
--     offer something else, or refuse — that mismatch is precisely what R5 will
--     want to count. Only OUR side is narrowed, and only by the one physical
--     fact the system actually knows: did the goods arrive?
--   * **`Reject` and `Other agreement` must carry a note.** A refusal with no
--     reason and an agreement with no agreement are records that say nothing.
--     Every other answer names itself, so no note is demanded for it (a
--     mandatory box people must fill to proceed gets filled with ".").
--   * **A claim cannot close with one side blank, and there is NO escape hatch
--     for a supplier who never answers.** That claim stays open and keeps
--     naming them — which is exactly what R5's "avg claim-resolution days"
--     must see. A "close as unanswered" button would let the queue lie clean.
--   * **The ask FREEZES once answered.** Editing what we asked after seeing
--     their reply would rewrite history into agreement, and the two-field
--     design exists to preserve the disagreement.
--   * **Who owes the next move is DERIVED, never stored** (`claimNextMove` in
--     the shared module). A stored owner is a second copy of the ask/answer
--     pair and drifts from it on the first write nobody remembered to mirror.
--   * **Nothing here speaks money** (Jess, locked): a supplier claim never
--     produces a credit note. Every resolution word is a goods action.
--
-- Live state when this was written: **0 supplier claims, 0 purchase orders and
-- 0 PO lines** in production, so the backfill is a no-op and no existing row
-- can violate the new constraints. Verified in a rolled-back transaction
-- against live before apply.
-- =============================================================================

set search_path = public;

-- ── 1 · the two sides ────────────────────────────────────────────────────────

alter table public.supplier_claims
  add column if not exists requested_action       text,
  add column if not exists requested_at           timestamptz,
  add column if not exists requested_by           uuid references public.app_users(id) on delete set null,
  add column if not exists supplier_response      text,
  add column if not exists supplier_response_note text,
  add column if not exists responded_at           timestamptz,
  add column if not exists responded_by           uuid references public.app_users(id) on delete set null,
  add column if not exists closed_at              timestamptz,
  add column if not exists closed_by              uuid references public.app_users(id) on delete set null,
  add column if not exists close_note             text;

comment on column public.supplier_claims.requested_action is
  'R3 (0291): what WE asked the supplier to do — replace · deliver_missing_parts · deliver_correct_item · repair · return_for_inspection, or deliver_remaining for a late claim (stamped at birth, never picked). Frozen once the supplier has answered.';
comment on column public.supplier_claims.supplier_response is
  'R3 (0291): what the SUPPLIER answered — replacement · deliver_remaining · repair · return_and_replace · reject · other_agreement. Deliberately NOT narrowed by requested_action: the mismatch between what we asked and what we got is the thing R5 counts.';
comment on column public.supplier_claims.closed_at is
  'R3 (0291): when the claim was settled. R5 measures avg claim-resolution days from reported_at to here.';

-- ── 2 · the vocabulary, mirrored in SQL ──────────────────────────────────────

-- May this ask be filed for a claim of this type?
-- Mirrors `isRequestedActionFor` in packages/shared/src/supplier-claim.ts.
--
-- TWO buckets, split by one physical fact: did the goods arrive?
--   · late_delivery → nothing arrived. The ONLY legal ask is deliver_remaining,
--     and it is stamped at birth rather than picked.
--   · everything else → the goods are in our warehouse; all five of Jess's asks
--     are live, and `deliver_remaining` is refused (they already delivered).
-- No finer than that on purpose: narrowing `damaged` to replace|repair would be
-- the system guessing furniture policy, and R2 already learned what an
-- over-narrow list costs.
create or replace function public.supplier_claim_request_allowed(
  p_claim_type text,
  p_requested_action text
) returns boolean
language sql
immutable
as $$
  select case
    when p_claim_type is null or p_requested_action is null then false
    when p_claim_type = 'late_delivery' then p_requested_action = 'deliver_remaining'
    else p_requested_action in ('replace','deliver_missing_parts',
                                'deliver_correct_item','repair',
                                'return_for_inspection')
  end;
$$;

comment on function public.supplier_claim_request_allowed(text, text) is
  'R3 (0291): the SQL mirror of requestedActionsFor/isRequestedActionFor in packages/shared/src/supplier-claim.ts. A late claim may only ask for deliver_remaining (nothing arrived to replace, repair or return); every other claim type may ask for any of Jess''s five and may NOT ask for deliver_remaining.';

-- ── 3 · backfill, then the constraints ───────────────────────────────────────

-- A late claim is born with its ask. Live count is 0, so this is a no-op today
-- — but it must run BEFORE the constraint below, because that constraint is
-- what makes "a late claim always has its ask" true from here on.
update public.supplier_claims
   set requested_action = 'deliver_remaining',
       requested_at     = coalesce(requested_at, reported_at)
 where claim_type = 'late_delivery'
   and requested_action is null;

alter table public.supplier_claims
  drop constraint if exists supplier_claims_requested_action_valid,
  drop constraint if exists supplier_claims_response_valid,
  drop constraint if exists supplier_claims_request_stamped,
  drop constraint if exists supplier_claims_response_needs_request,
  drop constraint if exists supplier_claims_response_stamped,
  drop constraint if exists supplier_claims_response_note_required,
  drop constraint if exists supplier_claims_closed_keeps_both_sides;

alter table public.supplier_claims
  -- The two closed vocabularies.
  add constraint supplier_claims_requested_action_valid
    check (requested_action is null
           or public.supplier_claim_request_allowed(claim_type, requested_action)),
  add constraint supplier_claims_response_valid
    check (supplier_response is null
           or supplier_response in ('replacement','deliver_remaining','repair',
                                    'return_and_replace','reject','other_agreement')),
  -- A recorded side always carries its stamp: an ask nobody dated cannot be
  -- placed in the story of the claim.
  add constraint supplier_claims_request_stamped
    check ((requested_action is null) = (requested_at is null)),
  add constraint supplier_claims_response_stamped
    check ((supplier_response is null) = (responded_at is null)),
  -- You cannot answer a question nobody asked. This is the both-sides
  -- integrity rule at its earliest possible point.
  add constraint supplier_claims_response_needs_request
    check (supplier_response is null or requested_action is not null),
  -- A refusal with no reason, and an "other agreement" with no agreement, are
  -- records that say nothing.
  add constraint supplier_claims_response_note_required
    check (supplier_response not in ('reject','other_agreement')
           or length(btrim(coalesce(supplier_response_note, ''))) > 0),
  -- THE DONE-WHEN, as a thing the table will not store otherwise.
  add constraint supplier_claims_closed_keeps_both_sides
    check (status <> 'closed'
           or (requested_action is not null
               and supplier_response is not null
               and closed_at is not null));

create index if not exists supplier_claims_unanswered_idx
  on public.supplier_claims (supplier_id)
  where status = 'open' and supplier_response is null;

-- ── 4 · the three moves ──────────────────────────────────────────────────────

-- Who may move a claim: operation + principal. Narrower than 0288's read
-- policy (which admits every internal role) on purpose — the claim desk is an
-- operations surface, and finance has no move to make on a claim, because a
-- claim never produces a credit note. Same gate as the route.
create or replace function public.supplier_claim_gate()
returns app_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
begin
  v_role := public.app_role();
  -- 0266's lesson: a NULL role must never fall through a gate. `not in` on a
  -- NULL is NULL, so the comparison is written to fail closed.
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can move a supplier claim'
      using errcode = '42501', detail = 'forbidden';
  end if;
  return v_role;
end;
$fn$;

-- ---- 4a · what WE ask ------------------------------------------------------
--
-- Recording the ask is what flips the next move from Carres to the supplier.
-- Re-recording is allowed while they have not answered (the operator picked
-- "Repair" and meant "Replace") and REFUSED once they have — the two-field
-- design exists to preserve a disagreement, and an editable ask would let
-- history be rewritten into agreement.
create or replace function public.supplier_claim_record_request(
  p_claim_id uuid,
  p_requested_action text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   app_role;
  v_uid    uuid;
  v_actor  text;
  v_claim  supplier_claims;
  v_action text;
begin
  v_role := public.supplier_claim_gate();
  v_uid  := auth.uid();

  v_action := nullif(btrim(coalesce(p_requested_action, '')), '');
  if p_claim_id is null or v_action is null then
    raise exception 'p_claim_id and p_requested_action are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_claim from supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'claim not found' using errcode = '42P01', detail = 'claim_not_found';
  end if;

  if v_claim.status = 'closed' then
    raise exception 'claim % is already closed', v_claim.claim_no
      using errcode = 'P0001', detail = 'claim_closed';
  end if;
  if v_claim.supplier_response is not null then
    raise exception 'claim % already carries the supplier''s answer', v_claim.claim_no
      using errcode = 'P0001', detail = 'request_frozen';
  end if;
  if not public.supplier_claim_request_allowed(v_claim.claim_type, v_action) then
    raise exception '% is not something we can ask for a % claim', v_action, v_claim.claim_type
      using errcode = 'P0001', detail = 'request_invalid';
  end if;

  update supplier_claims
     set requested_action = v_action,
         requested_at     = now(),
         requested_by     = v_uid,
         note             = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
         updated_at       = now()
   where id = p_claim_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_claim.po_id,
          format('Claim %s — asked %s to: %s', v_claim.claim_no,
                 coalesce((select name from suppliers where id = v_claim.supplier_id), 'supplier'),
                 v_action),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Supplier claim %s — asked for %s', v_claim.claim_no, v_action),
          v_claim.claim_no);

  return jsonb_build_object(
    'claim_no',         v_claim.claim_no,
    'requested_action', v_action,
    'status',           v_claim.status
  );
end;
$fn$;

-- ---- 4b · what the SUPPLIER answered ---------------------------------------
--
-- Recording the answer does NOT close the claim: the answer is a promise, and
-- the goods usually arrive days later. Closing is its own move (4c), which is
-- why "avg claim-resolution days" measures the real world rather than how fast
-- somebody typed.
create or replace function public.supplier_claim_record_response(
  p_claim_id uuid,
  p_response text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_uid      uuid;
  v_actor    text;
  v_claim    supplier_claims;
  v_response text;
  v_note     text;
begin
  v_role := public.supplier_claim_gate();
  v_uid  := auth.uid();

  v_response := nullif(btrim(coalesce(p_response, '')), '');
  v_note     := nullif(btrim(coalesce(p_note, '')), '');
  if p_claim_id is null or v_response is null then
    raise exception 'p_claim_id and p_response are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if v_response not in ('replacement','deliver_remaining','repair',
                        'return_and_replace','reject','other_agreement') then
    raise exception '% is not one of the supplier''s answers', v_response
      using errcode = 'P0001', detail = 'response_invalid';
  end if;
  -- Mirrors `responseNeedsNote` in the shared module.
  if v_response in ('reject','other_agreement') and v_note is null then
    raise exception 'a % answer must say what was agreed or why', v_response
      using errcode = 'P0001', detail = 'response_note_required';
  end if;

  select * into v_claim from supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'claim not found' using errcode = '42P01', detail = 'claim_not_found';
  end if;

  if v_claim.status = 'closed' then
    raise exception 'claim % is already closed', v_claim.claim_no
      using errcode = 'P0001', detail = 'claim_closed';
  end if;
  -- You cannot answer a question nobody asked.
  if v_claim.requested_action is null then
    raise exception 'claim % has no ask on file yet', v_claim.claim_no
      using errcode = 'P0001', detail = 'request_required';
  end if;

  update supplier_claims
     set supplier_response      = v_response,
         supplier_response_note = v_note,
         responded_at           = now(),
         responded_by           = v_uid,
         updated_at             = now()
   where id = p_claim_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_claim.po_id,
          format('Claim %s — %s answered: %s%s', v_claim.claim_no,
                 coalesce((select name from suppliers where id = v_claim.supplier_id), 'supplier'),
                 v_response,
                 case when v_note is null then '' else format(' (%s)', v_note) end),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Supplier claim %s — supplier answered %s', v_claim.claim_no, v_response),
          v_claim.claim_no);

  return jsonb_build_object(
    'claim_no',          v_claim.claim_no,
    'supplier_response', v_response,
    'status',            v_claim.status
  );
end;
$fn$;

-- ---- 4c · the close --------------------------------------------------------
--
-- Refuses unless BOTH sides are on file — the card's done-when, enforced here
-- as well as by the CHECK, so the operator gets a sentence naming what is
-- missing instead of a constraint-violation code.
create or replace function public.supplier_claim_close(
  p_claim_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  app_role;
  v_uid   uuid;
  v_actor text;
  v_claim supplier_claims;
begin
  v_role := public.supplier_claim_gate();
  v_uid  := auth.uid();

  if p_claim_id is null then
    raise exception 'p_claim_id required' using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_claim from supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'claim not found' using errcode = '42P01', detail = 'claim_not_found';
  end if;

  if v_claim.status = 'closed' then
    raise exception 'claim % is already closed', v_claim.claim_no
      using errcode = 'P0001', detail = 'claim_closed';
  end if;
  if v_claim.requested_action is null then
    raise exception 'claim % cannot close: nothing on file about what we asked for',
                    v_claim.claim_no
      using errcode = 'P0001', detail = 'request_required';
  end if;
  if v_claim.supplier_response is null then
    raise exception 'claim % cannot close: the supplier''s answer is not recorded',
                    v_claim.claim_no
      using errcode = 'P0001', detail = 'response_required';
  end if;

  update supplier_claims
     set status     = 'closed',
         closed_at  = now(),
         closed_by  = v_uid,
         close_note = nullif(btrim(coalesce(p_note, '')), ''),
         updated_at = now()
   where id = p_claim_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_claim.po_id,
          format('Claim %s closed — asked %s, %s answered %s', v_claim.claim_no,
                 v_claim.requested_action,
                 coalesce((select name from suppliers where id = v_claim.supplier_id), 'supplier'),
                 v_claim.supplier_response),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Supplier claim %s closed', v_claim.claim_no), v_claim.claim_no);

  return jsonb_build_object(
    'claim_no', v_claim.claim_no,
    'status',   'closed'
  );
end;
$fn$;

revoke execute on function public.supplier_claim_record_request(uuid, text, text) from public;
revoke execute on function public.supplier_claim_record_response(uuid, text, text) from public;
revoke execute on function public.supplier_claim_close(uuid, text) from public;
revoke execute on function public.supplier_claim_record_request(uuid, text, text) from anon;
revoke execute on function public.supplier_claim_record_response(uuid, text, text) from anon;
revoke execute on function public.supplier_claim_close(uuid, text) from anon;
grant execute on function public.supplier_claim_record_request(uuid, text, text) to authenticated;
grant execute on function public.supplier_claim_record_response(uuid, text, text) to authenticated;
grant execute on function public.supplier_claim_close(uuid, text) to authenticated;

-- ── 5 · a late claim is born with its ask ────────────────────────────────────
--
-- Unchanged from 0288 except for the two stamped columns — see the design note
-- at the top of this file for why a late claim does not ask a human what to
-- request.
create or replace function public.supplier_claim_sweep_overdue()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row     record;
  v_created int := 0;
begin
  for v_row in
    select pol.id as line_id,
           pol.sku as sku,
           pol.qty - pol.received_qty as pending,
           po.id as po_id,
           po.supplier_id as supplier_id,
           po.eta_date as eta_date
      from purchase_order_lines pol
      join purchase_orders po on po.id = pol.po_id
     where po.status = 'open'
       and po.eta_date is not null
       and po.eta_date < current_date
       and pol.qty > pol.received_qty
       and not exists (
         select 1 from supplier_claims sc
          where sc.po_line_id = pol.id
            and sc.claim_type = 'late_delivery'
            and sc.status = 'open'
       )
     order by po.eta_date
  loop
    insert into supplier_claims (
      po_id, po_line_id, supplier_id, sku, product_category,
      claim_type, qty, note, requested_action, requested_at
    ) values (
      v_row.po_id, v_row.line_id, v_row.supplier_id, v_row.sku,
      public.claim_product_category(v_row.sku),
      'late_delivery', v_row.pending,
      format('Promised %s — still pending delivery.', to_char(v_row.eta_date, 'DD Mon YY')),
      -- The only thing there is to ask a late supplier. Nobody picks it.
      'deliver_remaining', now()
    );
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('claims_created', v_created);
end;
$fn$;

revoke execute on function public.supplier_claim_sweep_overdue() from public;
revoke execute on function public.supplier_claim_sweep_overdue() from anon;
revoke execute on function public.supplier_claim_sweep_overdue() from authenticated;
grant execute on function public.supplier_claim_sweep_overdue() to service_role;

-- ── sanity ───────────────────────────────────────────────────────────────────

do $$
declare
  v_copies int;
  v_ok     boolean;
  v_name   text;
begin
  -- EXACTLY one copy of every function we touched. Checked per NAME, not with a
  -- GROUP BY: a function that failed to create produces no group at all, and a
  -- loop over groups would sail straight past the one thing worth catching.
  foreach v_name in array array['supplier_claim_sweep_overdue',
                                'supplier_claim_record_request',
                                'supplier_claim_record_response',
                                'supplier_claim_close',
                                'supplier_claim_request_allowed',
                                'supplier_claim_gate']
  loop
    select count(*) into v_copies
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;
    if v_copies <> 1 then
      raise exception 'sanity: % copies of %', v_copies, v_name;
    end if;
  end loop;

  -- the vocabulary mirrors packages/shared/src/supplier-claim.ts
  if not public.supplier_claim_request_allowed('damaged','replace')
     or not public.supplier_claim_request_allowed('wrong_sku','return_for_inspection') then
    raise exception 'sanity: an arrived-goods claim must accept Jess''s asks';
  end if;
  if public.supplier_claim_request_allowed('damaged','deliver_remaining') then
    raise exception 'sanity: goods already here cannot ask for the remainder';
  end if;
  if not public.supplier_claim_request_allowed('late_delivery','deliver_remaining') then
    raise exception 'sanity: a late claim must be able to ask for the remainder';
  end if;
  if public.supplier_claim_request_allowed('late_delivery','repair')
     or public.supplier_claim_request_allowed('late_delivery','replace') then
    raise exception 'sanity: nothing arrived, so nothing can be repaired or replaced';
  end if;
  if public.supplier_claim_request_allowed(null,'replace')
     or public.supplier_claim_request_allowed('damaged',null) then
    raise exception 'sanity: a null must never be allowed through';
  end if;

  -- every late claim on file carries its ask (the backfill ran)
  if exists (select 1 from public.supplier_claims
              where claim_type = 'late_delivery' and requested_action is null) then
    raise exception 'sanity: a late claim exists with no ask on file';
  end if;

  -- the constraints are installed
  select count(*) into v_copies
    from pg_constraint
   where conrelid = 'public.supplier_claims'::regclass
     and conname in ('supplier_claims_requested_action_valid',
                     'supplier_claims_response_valid',
                     'supplier_claims_request_stamped',
                     'supplier_claims_response_stamped',
                     'supplier_claims_response_needs_request',
                     'supplier_claims_response_note_required',
                     'supplier_claims_closed_keeps_both_sides');
  if v_copies <> 7 then
    raise exception 'sanity: expected 7 lifecycle constraints, found %', v_copies;
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
  if has_function_privilege('anon', 'public.supplier_claim_record_request(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.supplier_claim_record_response(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.supplier_claim_close(uuid, text)', 'execute') then
    raise exception 'sanity: anon can move a supplier claim';
  end if;
  if not has_function_privilege('authenticated', 'public.supplier_claim_record_request(uuid, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.supplier_claim_record_response(uuid, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.supplier_claim_close(uuid, text)', 'execute') then
    raise exception 'sanity: authenticated lost execute on a claim move';
  end if;
  if has_function_privilege('authenticated', 'public.supplier_claim_sweep_overdue()', 'execute')
     or has_function_privilege('anon', 'public.supplier_claim_sweep_overdue()', 'execute') then
    raise exception 'sanity: the sweep is no longer service_role-only';
  end if;
  if not has_function_privilege('service_role', 'public.supplier_claim_sweep_overdue()', 'execute') then
    raise exception 'sanity: service_role lost execute on the sweep';
  end if;

  -- R2's guard is still armed — R3 must not have disturbed it
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.purchase_order_lines'::regclass
                    and tgname = 'po_line_issue_requires_claim'
                    and not tgisinternal) then
    raise exception 'sanity: R2''s claim guard trigger is gone';
  end if;
end $$;
