-- 0016_approval_decide_safe_uuid_cast.sql
-- Phase 3 /review caught it: when approving a new_dealer application whose
-- `refers_to` is not a valid UUID (e.g. seed row "dlr-pendng-1" for Sleep
-- Studio KK), `approval_decide` (from 0014) crashed with `invalid input
-- syntax for type uuid` on the v_app.refers_to::uuid cast. Whole RPC tx
-- rolled back — approval not even marked decided.
--
-- Fix: gate the dealer UPDATE on a UUID-format regex check. If refers_to
-- isn't a UUID (legacy/seed data), the approval still records the decision
-- but we skip the dealer mutation. Same idea for the existing refund branch:
-- if the orders dl-lookup returns no rows the existing UPDATE is a silent
-- no-op, so the symmetric "approve gracefully even if downstream link is
-- bad" behaviour is preserved.
--
-- Future inserts via `dealer_invite` (0013) always set refers_to to a real
-- dealer UUID, so this only matters for legacy seed rows.

create or replace function approval_decide(
  p_id      uuid,
  p_status  approval_status,
  p_note    text
) returns approvals
language plpgsql security definer as $$
declare
  v_app approvals;
  v_uuid_regex text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if not public.is_principal() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update approvals set
    status = p_status,
    decided_at = now(),
    decided_by = auth.uid(),
    decision_note = p_note
    where id = p_id
    returning * into v_app;

  if not found then
    raise exception 'approval not found' using errcode = '42P01';
  end if;

  -- Refund side-effect (unchanged from 0003/0014).
  if v_app.kind = 'refund' and v_app.refers_to is not null then
    update refunds set
      status = case when p_status = 'approved' then 'approved'::refund_status else 'rejected'::refund_status end,
      approval_id = v_app.id,
      approved_at = case when p_status = 'approved' then now() end
      where order_id = (select id from orders where dl::text = replace(v_app.refers_to,'DL-',''));
  end if;

  -- new_dealer side-effect: only if refers_to is a valid UUID (avoids crash
  -- on legacy/seed rows like 'dlr-pendng-1'). If invalid, decision is still
  -- recorded but no dealer row is touched.
  if v_app.kind = 'new_dealer'
     and v_app.refers_to is not null
     and v_app.refers_to ~ v_uuid_regex
  then
    update dealers
       set status = case when p_status = 'approved' then 'active'::dealer_status
                         else 'rejected'::dealer_status end,
           joined_date = case when p_status = 'approved' then current_date else null end,
           updated_at = now()
     where id = v_app.refers_to::uuid;
  end if;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('principal',
          (select name from app_users where id = auth.uid()),
          format('%s approval · %s', p_status, v_app.title),
          v_app.dealer_id,
          v_app.refers_to);

  return v_app;
end;
$$;
