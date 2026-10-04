-- Owner-approved 2026-10-01, Orders/Workspace MASTER; scoped BUILD commission.
-- Catalogue/qualification only. No live assignments, bootstrap or approval bypass.
create or replace function public.workspace_duty_holder_roles(p_duty_key text)
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select case p_duty_key
    when 'finance_approver' then array['finance']
    when 'purchasing_approver' then array['principal']
    when 'sales_approver' then array['principal']
  end
$$;
