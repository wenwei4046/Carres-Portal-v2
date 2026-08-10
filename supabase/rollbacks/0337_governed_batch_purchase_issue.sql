-- Real deployment rollback for 0337. Execute as one transaction.
-- Old Orders continues on its unchanged operation_create_* boundary.

begin;

drop function if exists public.purchasing_issue_pos_batch(jsonb);

alter table public.purchase_order_lines
  drop constraint if exists purchase_order_lines_commercial_treatment_complete,
  drop constraint if exists purchase_order_lines_commercial_treatment_allowed,
  drop column if exists commercial_reason,
  drop column if exists commercial_treatment;

commit;
