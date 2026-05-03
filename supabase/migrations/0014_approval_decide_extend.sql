-- 0014_approval_decide_extend.sql
-- Extends approval_decide RPC (from 0003) to handle 'new_dealer' approvals.
-- On approve: dealer.status pending -> active, joined_date = today
-- On reject:  dealer.status pending -> rejected (uses enum value from 0012)
-- Refund logic from 0003 unchanged.

create or replace function approval_decide(
  p_id      uuid,
  p_status  approval_status,
  p_note    text
) returns approvals
language plpgsql security definer as $$
declare v_app approvals;
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

  if v_app.kind = 'refund' and v_app.refers_to is not null then
    update refunds set
      status = case when p_status = 'approved' then 'approved'::refund_status else 'rejected'::refund_status end,
      approval_id = v_app.id,
      approved_at = case when p_status = 'approved' then now() end
      where order_id = (select id from orders where dl::text = replace(v_app.refers_to,'DL-',''));
  end if;

  if v_app.kind = 'new_dealer' and v_app.refers_to is not null then
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
