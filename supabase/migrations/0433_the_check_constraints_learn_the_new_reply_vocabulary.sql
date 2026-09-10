-- 0433 · widen po_supplier_promises CHECK constraints to the 0432 reply
-- vocabulary (confirmed / earlier / reported join shipping / delayed).
-- Rolled-back production probe 2026-09-06 found the old checks refusing the
-- server's truthful classification. The new checks are a strict SUPERSET of
-- the old, so every existing row still passes; new `shipping` inserts stay
-- refused by the 0432 trigger, not by these checks.

alter table public.po_supplier_promises
  drop constraint po_promise_answer_allowed;
alter table public.po_supplier_promises
  add constraint po_promise_answer_allowed check (
    answer = any (array['shipping','delayed','confirmed','earlier','reported','balance_date','ready_date']));

alter table public.po_supplier_promises
  drop constraint po_promise_kind_answer;
alter table public.po_supplier_promises
  add constraint po_promise_kind_answer check (
    (kind = 'tomorrow_delivery' and answer = any (array['shipping','delayed','confirmed','earlier','reported']))
    or (kind = 'balance_delivery' and answer = 'balance_date')
    or (kind = 'ready_date' and answer = 'ready_date'));

alter table public.po_supplier_promises
  drop constraint po_promise_scope;
alter table public.po_supplier_promises
  add constraint po_promise_scope check (
    (kind = 'tomorrow_delivery' and po_line_id is null and about_qty is null
      and (about_date is not null or answer = 'reported'))
    or (kind = 'balance_delivery' and po_line_id is not null and about_qty is not null)
    or (kind = 'ready_date' and po_line_id is null and about_qty is null));
