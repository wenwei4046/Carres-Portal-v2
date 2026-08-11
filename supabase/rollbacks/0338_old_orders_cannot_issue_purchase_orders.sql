-- Deployment rollback for 0338. The matching application rollback restores
-- the removed route and UI; this restores its former authenticated RPC grant.

begin;

grant execute on function public.operation_issue_pos_for_order(uuid)
  to authenticated;

commit;
