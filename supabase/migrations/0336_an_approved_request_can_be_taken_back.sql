-- 0336 · AN APPROVED REQUEST CAN BE TAKEN BACK
-- (STAGE 3 · card WITHDRAW — the missing door, owner-named 2026-08-10)
--
-- `'cancelled'` has been a legal value of `order_change_requests.status` since
-- 0231. It was never a missing STATE. It was a missing DOOR: every function
-- that writes that column gates on `pending`, so nothing could reach
-- `cancelled` from `approved`. PROVEN BY ATTEMPT, not by reading —
-- `cancel_order_change_request(c42b07f6)` answered
-- "Only a pending change can be cancelled".
--
-- The consequence was that a wrong approval could only be cleared by carrying
-- it out, which inverts GATE 4's own sentence: *"Approval is permission to
-- try … neither is a completed fact."*
--
-- ── THE FOUR RULINGS THIS OBEYS, VERBATIM ──
--
--   ONE VERB, WITHDRAW. Not two. Who withdrew it is recorded in `decided_by`;
--   two verb names for one state transition is a fork.
--
--   approved -> cancelled, one history line, and a REQUIRED reason — the same
--   rule as SUBMIT: no reason, no action.
--
--   WHO MAY WITHDRAW = WHOEVER MAY APPROVE, per GATE 3. The bar to take back
--   must never be higher than the bar to grant. The role check below is
--   `sales_order_decide_attribution`'s, character for character.
--
--   NO AUTO-EXPIRY. Nothing in this architecture happens without a named
--   actor, and a clock is not an actor. An abandoned request sits there and
--   looks wrong, which is the correct behaviour: someone must come and say so.
--
-- ── TWO BOUNDARIES THIS CARD DECIDED, AND WHY ──
--
-- APPROVED ONLY. `pending` already has a door (`cancel_order_change_request`,
-- 0233) that the submitter's own role can open. Accepting `pending` here would
-- either duplicate that door or RAISE the bar for it to GATE 3's approvers —
-- and raising the bar to take back is the one thing the ruling forbids. This
-- function is exactly the transition that was missing.
--
-- APPLIED IS NOT WITHDRAWABLE. `applied_at is not null` means the order
-- already moved and a revision was minted. That is a completed fact, and the
-- way back from a completed fact is a new request, not an undo. Refused by
-- name so nobody mistakes it for a bug.
--
-- `decided_by` now names the WITHDRAWER, per the ruling. The approval is not
-- lost: `order_history` already carries "Attribution change approved — …" with
-- its own actor and timestamp. The request row says what is true now; the
-- ledger says what happened.

create or replace function public.sales_order_withdraw_attribution(
  p_request_id uuid,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text := public.app_role();
  v_req    order_change_requests%rowtype;
  v_fields text[];
begin
  if length(trim(coalesce(p_reason,''))) = 0 then
    raise exception 'A reason is required' using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found or v_req.kind <> 'attribution' then
    raise exception 'Attribution request not found' using errcode = 'P0002';
  end if;

  if v_req.applied_at is not null then
    raise exception 'This change was already applied — it is history now, not a decision to take back'
      using errcode = '22023', detail = 'already_applied';
  end if;
  if v_req.status <> 'approved' then
    raise exception 'Only an approved request can be withdrawn'
      using errcode = '22023', detail = 'not_approved';
  end if;

  v_fields := array(select jsonb_object_keys(v_req.payload->'changes'));

  -- GATE 3, the SAME routing as the approval it takes back.
  if (v_fields && array['dealer_id','channel']) then
    if v_role <> 'principal' then
      raise exception 'Dealer/channel attribution is approved by the principal only'
        using errcode = '42501', detail = 'approver_principal_only';
    end if;
  else
    if v_role not in ('hr','principal') then
      raise exception 'Salesperson/showroom attribution is approved by HR or the principal'
        using errcode = '42501', detail = 'approver_hr_or_principal';
    end if;
  end if;

  update order_change_requests
     set status = 'cancelled',
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = trim(p_reason)
   where id = p_request_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_req.order_id,
          'Attribution change withdrawn — ' || array_to_string(v_fields, ', ')
            || ' — ' || trim(p_reason),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_withdrawn','fields',to_jsonb(v_fields)));

  return jsonb_build_object('id', p_request_id, 'status', 'cancelled');
end $$;

revoke all on function public.sales_order_withdraw_attribution(uuid, text) from public;
grant execute on function public.sales_order_withdraw_attribution(uuid, text) to authenticated;
