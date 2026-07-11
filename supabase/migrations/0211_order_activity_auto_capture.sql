-- =============================================================================
-- 0211_order_activity_auto_capture.sql
-- Order activity history (P1) — auto-record the "silent" edits.
-- Jess authorised 2026-07-10 (order-activity-history plan).
--
-- WHAT: two AFTER-UPDATE triggers that append a row to the EXISTING
-- ops_activity_log whenever an order's key fields change, so the per-order
-- Activity timeline records who changed what (today these edits only bump
-- updated_at — no trace). `action` = the canonical event_type so the timeline
-- renders a human label ("Delivery date changed", "Balance 0 → 500").
--
-- SAFETY (shared production DB):
--   * ADDITIVE — writes ONLY into ops_activity_log (append-only). Never touches
--     order data. No existing column/row/policy changed.
--   * FAIL-SAFE — each trigger body is wrapped so ANY error is swallowed
--     (EXCEPTION WHEN OTHERS → do nothing). A bad audit row can NEVER block or
--     roll back the underlying order INSERT/UPDATE.
--   * SECURITY DEFINER — inserts bypass the ops_activity_log RLS the same way
--     operation_add_annotation (0138) already does; actor = auth.uid().
--   * KILL SWITCH — `drop trigger trg_log_order_change on orders;` and
--     `drop trigger trg_log_ops_control_change on ops_order_control;` remove all
--     capture instantly, with zero effect on any order.
-- =============================================================================

set search_path = public;

-- ── small helper: append one "field changed" event ───────────────────────────
create or replace function public._ola_field_changed(
  p_order uuid, p_actor uuid, p_field text, p_from text, p_to text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (
    p_order, 'order.field_changed', p_actor,
    jsonb_build_object('field', p_field, 'from', p_from, 'to', p_to)
  );
$$;

-- ── orders: delivery-date change + status milestones ─────────────────────────
create or replace function public.trg_log_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.delivery_date is distinct from old.delivery_date then
      perform public._ola_field_changed(
        new.id, auth.uid(), 'delivery_date',
        old.delivery_date::text, new.delivery_date::text);
    end if;

    if new.status is distinct from old.status then
      insert into ops_activity_log (order_id, action, actor_id, detail)
      values (
        new.id,
        case new.status
          when 'proceed_order' then 'order.confirmed'
          when 'delivered'     then 'order.delivered'
          when 'cancelled'     then 'order.cancelled'
          else 'order.field_changed'
        end,
        auth.uid(),
        jsonb_build_object('field', 'status', 'from', old.status, 'to', new.status)
      );
    end if;
  exception when others then
    null;  -- audit must never break the order write
  end;
  return new;
end;
$$;

drop trigger if exists trg_log_order_change on orders;
create trigger trg_log_order_change
  after update on orders
  for each row execute function public.trg_log_order_change();

-- ── ops_order_control: the silent-edit fix ───────────────────────────────────
create or replace function public.trg_log_ops_control_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.updated_by);
begin
  begin
    if new.balance is distinct from old.balance then
      perform public._ola_field_changed(new.order_id, v_actor, 'balance',
        old.balance::text, new.balance::text);
    end if;
    if new.payment_status is distinct from old.payment_status then
      perform public._ola_field_changed(new.order_id, v_actor, 'payment_status',
        old.payment_status, new.payment_status);
    end if;
    if new.logistic_eta is distinct from old.logistic_eta then
      perform public._ola_field_changed(new.order_id, v_actor, 'logistic_eta',
        old.logistic_eta::text, new.logistic_eta::text);
    end if;
    if new.stock_eta is distinct from old.stock_eta then
      perform public._ola_field_changed(new.order_id, v_actor, 'stock_eta',
        old.stock_eta::text, new.stock_eta::text);
    end if;
    if new.balance_due_date is distinct from old.balance_due_date then
      perform public._ola_field_changed(new.order_id, v_actor, 'balance_due_date',
        old.balance_due_date::text, new.balance_due_date::text);
    end if;
    if new.called_customer is distinct from old.called_customer then
      perform public._ola_field_changed(new.order_id, v_actor, 'called_customer',
        old.called_customer::text, new.called_customer::text);
    end if;
    if new.delivery_time_slot is distinct from old.delivery_time_slot then
      perform public._ola_field_changed(new.order_id, v_actor, 'delivery_time_slot',
        old.delivery_time_slot, new.delivery_time_slot);
    end if;
    -- free-text remarks: preview only (avoid dumping long text / PII)
    if new.customer_request is distinct from old.customer_request then
      perform public._ola_field_changed(new.order_id, v_actor, 'customer_request',
        left(old.customer_request, 120), left(new.customer_request, 120));
    end if;
    if new.carres_remark is distinct from old.carres_remark then
      perform public._ola_field_changed(new.order_id, v_actor, 'carres_remark',
        left(old.carres_remark, 120), left(new.carres_remark, 120));
    end if;
    if new.warehouse_remark is distinct from old.warehouse_remark then
      perform public._ola_field_changed(new.order_id, v_actor, 'warehouse_remark',
        left(old.warehouse_remark, 120), left(new.warehouse_remark, 120));
    end if;
    -- storage waiver has its own lifecycle events
    if new.storage_waiver_status is distinct from old.storage_waiver_status then
      insert into ops_activity_log (order_id, action, actor_id, detail)
      values (
        new.order_id,
        case new.storage_waiver_status
          when 'requested' then 'waiver.requested'
          when 'approved'  then 'waiver.approved'
          when 'rejected'  then 'waiver.rejected'
          else 'order.field_changed'
        end,
        v_actor,
        jsonb_build_object('field', 'storage_waiver_status',
          'from', old.storage_waiver_status, 'to', new.storage_waiver_status)
      );
    end if;
  exception when others then
    null;  -- audit must never break the control-row write
  end;
  return new;
end;
$$;

drop trigger if exists trg_log_ops_control_change on ops_order_control;
create trigger trg_log_ops_control_change
  after update on ops_order_control
  for each row execute function public.trg_log_ops_control_change();

-- ── sanity ───────────────────────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from pg_trigger
          where tgname in ('trg_log_order_change','trg_log_ops_control_change')) = 2,
    'auto-capture triggers missing';
  raise notice 'migration 0211 sanity OK';
end;
$$;
