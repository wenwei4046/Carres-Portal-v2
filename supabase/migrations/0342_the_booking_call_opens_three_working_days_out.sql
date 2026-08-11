-- =============================================================================
-- 0342_the_booking_call_opens_three_working_days_out.sql
-- SALES ORDER V2 · CARD 3 — EARLY LOGISTICS ASSIGNMENT + CUSTOMER BOOKING
-- (owner ruling 2026-08-11, docs/orders/MASTER.md).
--
-- The Card 3 trace (2026-08-11) measured the approved flow ALREADY unblocked:
-- `assign_logistics` opens from order birth with NO stock gate
-- (order-actions.ts deliveryAction — "runs whether or not the goods are in"),
-- the booking call opens the moment a company is assigned, and the three facts
-- are stored independently (`ops_assigned_logistic` / `delivery_partners` ·
-- `ops_order_control.line_etas` · 0277's confirmed date + slot with evidence).
--
-- What the ruling changes is ONE number: *"the target call window is three
-- actual working days before delivery, calculated with the applicable working
-- calendar and public holidays."* The call window has been a setting since
-- 0303 (`logistics_call_working_days`, seeded 1); this migration moves it to
-- the ruled 3 and records the change exactly as the Settings door would —
-- the change ledger row plus the audit sentence. The working calendar and the
-- Malaysian public holidays were verified already injected at both due call
-- sites (OperationOrdersControl + OperationDelivery via `myHolidaySet()`);
-- the one drift found — the Delivery page never passing the settings-read
-- lead to the due arithmetic — is fixed in the same PR, page-side.
-- =============================================================================

do $card3$
declare
  v_old int;
begin
  select logistics_call_working_days into v_old from purchasing_settings;

  update purchasing_settings
     set logistics_call_working_days = 3,
         updated_at = now();

  insert into purchasing_setting_changes
    (setting_key, supplier_id, category, old_value, new_value, changed_by)
  values
    ('logistics_call_working_days', null, null, v_old::text, '3', null);

  insert into audit_log (role, actor_text, action, ref)
  values ('operation'::public.app_role,
          'Owner ruling 2026-08-11 · Sales Order V2 Card 3',
          format('Confirm delivery date call window: %s -> 3 working days before the promised date', v_old),
          'logistics_call_working_days');
end $card3$;

-- Sanity
do $sanity$
declare
  v int;
begin
  select logistics_call_working_days into v from purchasing_settings;
  if v <> 3 then
    raise exception '0342 sanity: logistics_call_working_days is %, expected 3', v;
  end if;
  if not exists (
    select 1 from purchasing_setting_changes
     where setting_key = 'logistics_call_working_days' and new_value = '3'
  ) then
    raise exception '0342 sanity: the setting change was not recorded in the ledger';
  end if;
  raise notice '0342 OK: the booking call opens three working days out';
end $sanity$;
