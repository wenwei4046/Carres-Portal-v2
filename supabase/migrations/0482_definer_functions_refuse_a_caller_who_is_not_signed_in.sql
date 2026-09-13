-- =============================================================================
-- 0482_definer_functions_refuse_a_caller_who_is_not_signed_in.sql
-- =============================================================================
-- WHAT WAS WRONG, MEASURED
--   Supabase grants the anon role (a caller who is not signed in) EXECUTE on
--   every public function by default, and PostgREST exposes every function a
--   role may execute. After 0481, 193 SECURITY DEFINER functions were still
--   executable by anon. A definer function runs as its owner and skips row
--   security, so its only guard is its own role check -- and many of those
--   read app_role() into `role not in (...)`, which is NULL for anon and lets
--   the caller straight through. Proven locally as anon, in rolled-back
--   transactions: an outsider could read dealer ids and customer name/phone
--   and drive order / PO / deposit writes through these functions.
--   No anon path is legitimate: apps/web makes no supabase.rpc/.from calls
--   (only supabase.auth + storage); every /api route runs authMiddleware with
--   a user or service_role client; /health touches no DB; /stripe uses the
--   service_role client behind a verified signature.
--
-- WHAT THIS CHANGES (grants only -- no RLS, no function body)
--   - Revokes EXECUTE from public and anon on the 190 SECURITY DEFINER
--     functions listed below. authenticated is left exactly as it was: signed-in
--     staff keep what they had, and the few functions earlier migrations
--     already closed to authenticated (po_receive, purchase_request_create/
--     cancel, operation_receive_po_line, _v3_claim_threads_for_po) stay closed.
--     The sanity block proves authenticated's access did not change.
--   - Also revokes EXECUTE on gl_next_doc_no(text,date) from authenticated: it
--     is called only from inside SECURITY DEFINER ledger functions (0462/0468/
--     0478), so it needs no direct grant, and any signed-in user could
--     otherwise burn JE/MJ ledger numbers (proven -- JE-202609-0001/0002).
--   - Revokes anon table grants on purchase_order_lines, purchase_requests and
--     formal_document_codes. Their RLS is meant to lock anon out (0359/0381);
--     this makes the anon lock explicit and independent of Supabase's
--     auto-enable of RLS.
--   - KEEPS anon EXECUTE on the identity helpers a public-role RLS policy,
--     constraint or default calls (they return null/false for anon, so they
--     are safe and are needed for policies to evaluate): app_dealer_id, app_partner_id, app_role, app_supplier_id, gl_may_read, is_internal, is_operation, is_principal.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - Rewrites no function body. The NULL-blind role gates are fixed in 0499.
--   - Does not touch the eleven finance functions 0481 owns.
--   - Does not ENABLE RLS or change any view's security_invoker.
--
-- Each revoke is guarded by to_regprocedure, so a signature that is absent in
-- a given database is skipped rather than aborting the migration.
--
-- RLS: no policy changes. GRANTS: EXECUTE revoked from public+anon on the
--   functions below and from authenticated on gl_next_doc_no; anon table
--   grants revoked on 3 tables; authenticated otherwise unchanged. DR/CR: none.
-- =============================================================================

begin;

-- Remember which functions authenticated can run before the revoke, so the
-- sanity block can prove this migration did not change that. (Some, such as
-- po_receive, were already closed to authenticated by 0307/0359; that stays.)
create temp table _auth_before (fn regprocedure primary key) on commit drop;

do $revoke$
declare s text; p regprocedure;
begin
  for s in select unnest(array[
    'public._activity_log_order_id_from_ref(text)',
    'public._commission_assert_order_month_open(uuid)',
    'public._import_autocount_order(jsonb)',
    'public._ola_field_changed(uuid, uuid, text, text, text)',
    'public._operation_auto_dispatch_if_ready(uuid)',
    'public._operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid)',
    'public._operation_release_order_reserve(uuid)',
    'public._operation_reserve_order(uuid)',
    'public._raise_correction_work(uuid, text[], integer, text)',
    'public._staff_code_cross_check()',
    'public._v3_claim_threads_for_po(text)',
    'public.allocate_formal_document_code(text, text, date)',
    'public.app_warehouse_id()',
    'public.approval_decide(uuid, approval_status, text)',
    'public.bd_convert_inquiry(uuid)',
    'public.commission_add_adjustment(integer, integer, text, text, uuid, numeric, text, integer, integer, uuid, text)',
    'public.commission_approve_run(uuid)',
    'public.commission_close_month(integer, integer, text, jsonb, text)',
    'public.commission_mark_paid(uuid)',
    'public.commission_reopen_run(uuid, text)',
    'public.commission_run_detail(uuid)',
    'public.commission_run_state(integer, integer, text)',
    'public.commission_runs_list(integer)',
    'public.commission_void_run(uuid, text)',
    'public.correction_work_close(uuid, text)',
    'public.dealer_invite(text, text, text)',
    'public.dealer_set_status(uuid, dealer_status, text)',
    'public.dealer_set_terms(uuid, numeric, text)',
    'public.dealer_topup(uuid, numeric, payment_method, text, text)',
    'public.dealer_with_stats(uuid)',
    'public.dealers_with_stats_list()',
    'public.delivery_arrangement_message_prepared(uuid, smallint, uuid)',
    'public.enforce_partner_orders_column_whitelist()',
    'public.enforce_partner_po_column_whitelist()',
    'public.enforce_sku_price_cost_principal_only()',
    'public.enforce_sofa_fabric_tier_principal_only()',
    'public.gen_guarantee_id()',
    'public.gl_account_ledger(text, date, date)',
    'public.gl_balance_sheet(date)',
    'public.gl_ledger_health()',
    'public.gl_party_statement(text, uuid, date, date)',
    'public.gl_profit_and_loss(date, date)',
    'public.gl_report_guard()',
    'public.gl_trial_balance(date)',
    'public.guarantee_attach(uuid, uuid)',
    'public.guarantee_claim(uuid, uuid, text, text)',
    'public.guarantee_mint_from_line()',
    'public.guarantee_snapshot_kind()',
    'public.guarantee_sync_from_order()',
    'public.guarantee_void_from_line_delete()',
    'public.hr_add_employee(text, uuid)',
    'public.hr_assign_dealer_bd(uuid, uuid)',
    'public.hr_commission_source(integer, integer)',
    'public.hr_employee_detail(uuid)',
    'public.hr_people_source()',
    'public.hr_record_exit(uuid, date, text, text)',
    'public.hr_reveal_employee_field(uuid, text)',
    'public.hr_set_checklist_item(uuid, text, text, boolean)',
    'public.hr_set_position(uuid, uuid)',
    'public.hr_set_position_duty(uuid, text, boolean)',
    'public.hr_set_reports_to(uuid, uuid)',
    'public.hr_set_staff_code(text, uuid, text)',
    'public.hr_team_source()',
    'public.hr_upsert_employee(uuid, jsonb)',
    'public.import_autocount_order(jsonb)',
    'public.import_autocount_orders(jsonb)',
    'public.invoices_reverse_ledger_on_void()',
    'public.issue_timeline_on_insert()',
    'public.lp_accept_inbound_delivery(text)',
    'public.lp_reject_order(uuid, text)',
    'public.mark_badge_seen(text)',
    'public.my_org_duties()',
    'public.next_case_no()',
    'public.next_sn_no()',
    'public.operation_abandon_order(uuid, text)',
    'public.operation_add_annotation(uuid, text, text)',
    'public.operation_adjust_stock(text, uuid, integer, text)',
    'public.operation_assign_partner(uuid, uuid)',
    'public.operation_assign_partner_and_dispatch(text, uuid, text, text, text, uuid)',
    'public.operation_attach_do_and_deliver(uuid, text, text, boolean, text, text, text)',
    'public.operation_calc_shortages(uuid, uuid)',
    'public.operation_cancel_po(text, text)',
    'public.operation_confirm_proceed_request_v3(uuid, uuid)',
    'public.operation_create_po(uuid, uuid, jsonb, integer, integer[], uuid)',
    'public.operation_create_pos_batch(jsonb)',
    'public.operation_dashboard_summary()',
    'public.operation_dispatch_customer_leg(uuid, uuid, date, boolean)',
    'public.operation_get_timeline(uuid)',
    'public.operation_partner_accept_rfd(uuid)',
    'public.operation_partner_reject_rfd(uuid, text)',
    'public.operation_partner_rfd_pending()',
    'public.operation_pick_warehouse(uuid)',
    'public.operation_reassign_po_warehouse(text, uuid)',
    'public.operation_receive_po_line(text, text, integer)',
    'public.operation_receive_po_with_do(text, text, text, jsonb)',
    'public.operation_receive_po_with_do(text, text, text, jsonb, uuid)',
    'public.operation_receive_threads(text, uuid[], text, text, text)',
    'public.operation_relocate_warehouse(text, uuid)',
    'public.operation_request_order_change(uuid, text, jsonb)',
    'public.operation_resume_dispatch_from_waiting(uuid)',
    'public.operation_revert_order_dispatched_to_ready(uuid)',
    'public.operation_revert_order_proceed_to_placed(uuid)',
    'public.operation_stock_alerts()',
    'public.operation_supplier_ready_confirm(text)',
    'public.operation_warehouse_pick(uuid, uuid)',
    'public.ops_bulk_complete_orders(uuid[])',
    'public.ops_delivery_orders_money_gate()',
    'public.ops_set_reorder_point(text, integer, integer, text)',
    'public.ops_stock_flag_repair(uuid, boolean)',
    'public.ops_stock_reassign(uuid, text)',
    'public.ops_stock_release(uuid)',
    'public.ops_stock_reserve(text, text, text, uuid)',
    'public.ops_tasks_feed()',
    'public.ops_tasks_overdue_count()',
    'public.ops_team_members()',
    'public.order_create(jsonb)',
    'public.order_dispatch(uuid, uuid, uuid)',
    'public.order_partner_advance(uuid, partner_delivery_stage, text)',
    'public.order_proceed(uuid)',
    'public.order_record_payment(uuid, numeric, payment_method, text, text, text)',
    'public.orders_auto_issue_on_dispatched()',
    'public.orders_auto_status_delivered()',
    'public.orders_rollup_stage_trigger()',
    'public.org_duty_holders()',
    'public.partner_attach_pod(uuid, text, text, text, boolean, text, text)',
    'public.partner_confirm_receive(text)',
    'public.partner_mark_pickup_collected(uuid)',
    'public.partner_orders_for_threads(uuid[])',
    'public.partner_pickup_threads(text, uuid[], text, text, text)',
    'public.partner_reject_customer(text, text)',
    'public.partner_threads_to_deliver()',
    'public.patch_delivery_stop(uuid, integer, jsonb)',
    'public.pickup_event_render_payload(uuid)',
    'public.po_advance(text, po_sup_status, text)',
    'public.po_line_issue_requires_claim()',
    'public.po_receive(text, text, text, integer, text)',
    'public.principal_dashboard_summary()',
    'public.purchase_request_cancel(uuid, text)',
    'public.purchase_request_create(uuid, integer, jsonb, date, text)',
    'public.purchasing_supplier_call_gate()',
    'public.pwp_claim_available_code(text, uuid, uuid, text, text, text)',
    'public.pwp_claim_code(text, uuid, uuid, text)',
    'public.pwp_codes_on_order_cancel()',
    'public.pwp_discover_available(text, text, text)',
    'public.pwp_reap_orphans(integer)',
    'public.pwp_release_available_code(text[], uuid)',
    'public.pwp_release_codes(text[])',
    'public.pwp_restamp_orphans()',
    'public.pwp_stamp_redeemed(text[], uuid, uuid)',
    'public.remove_order_addon(uuid, uuid)',
    'public.sales_order_amendment_live(uuid)',
    'public.sales_order_apply_amendment(uuid)',
    'public.sales_order_apply_attribution(uuid)',
    'public.sales_order_attribution_live(uuid)',
    'public.sales_order_commitment_bundle(uuid)',
    'public.sales_order_contractual_hash(uuid)',
    'public.sales_order_create(jsonb, jsonb)',
    'public.sales_order_create_unchecked_0374(jsonb, jsonb)',
    'public.sales_order_decide_attribution(uuid, text, text)',
    'public.sales_order_floors(uuid, text[], jsonb)',
    'public.sales_order_floors_unchecked_0328(uuid, text[], jsonb)',
    'public.sales_order_mint_original_at_birth()',
    'public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb)',
    'public.sales_order_save_revision_unchecked_0354(uuid, jsonb, jsonb, jsonb)',
    'public.sales_order_snapshot(uuid)',
    'public.sales_order_submit_amendment(uuid, jsonb, text, date)',
    'public.sales_order_submit_attribution(uuid, jsonb, text)',
    'public.sales_order_withdraw_attribution(uuid, text)',
    'public.set_delivery_chain(uuid, jsonb)',
    'public.set_partner_journey_calendar(uuid, smallint[], jsonb, text[])',
    'public.set_sales_order_grid_config(jsonb, jsonb)',
    'public.supplier_acknowledge(text)',
    'public.supplier_claim_gate()',
    'public.supplier_mark_delivered(text, text, text, text)',
    'public.supplier_mark_thread_ready(uuid)',
    'public.supplier_orders_for_threads(uuid[])',
    'public.supplier_start_production(text)',
    'public.supplier_threads_for_po(text)',
    'public.supplier_unmark_thread_ready(uuid)',
    'public.trg_log_ops_control_change()',
    'public.trg_log_order_change()',
    'public.trg_po_supplier_collection_guard()',
    'public.trg_stamp_delay_detected()',
    'public.trg_stamp_po_line_short_since()',
    'public.warehouse_grant_capability(text, uuid)',
    'public.warehouse_holds_capability(text, uuid)',
    'public.warehouse_import_holiday_calendar(text, text, text, text, timestamp with time zone, jsonb)',
    'public.warehouse_revoke_capability(text, uuid)',
    'public.warehouse_set_holiday_policy(uuid, boolean, text, text, boolean, text, time without time zone, time without time zone)',
    'public.warehouse_settings_gate()'
  ]) loop
    p := to_regprocedure(s);
    if p is null then continue; end if;
    if has_function_privilege('authenticated', p, 'execute') then insert into _auth_before values (p); end if;
    execute format('revoke all on function %s from public, anon', p);
  end loop;
  -- gl_next_doc_no: only definer ledger functions call it; revoke authenticated too
  p := to_regprocedure('public.gl_next_doc_no(text, date)');
  if p is not null then execute format('revoke all on function %s from public, anon, authenticated', p); end if;
end
$revoke$;

revoke all on table public.purchase_order_lines from anon;
revoke all on table public.purchase_requests from anon;
revoke all on table public.formal_document_codes from anon;

do $sanity$
declare s text; p regprocedure;
begin
  for s in select unnest(array[
    'public._activity_log_order_id_from_ref(text)',
    'public._commission_assert_order_month_open(uuid)',
    'public._import_autocount_order(jsonb)',
    'public._ola_field_changed(uuid, uuid, text, text, text)',
    'public._operation_auto_dispatch_if_ready(uuid)',
    'public._operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid)',
    'public._operation_release_order_reserve(uuid)',
    'public._operation_reserve_order(uuid)',
    'public._raise_correction_work(uuid, text[], integer, text)',
    'public._staff_code_cross_check()',
    'public._v3_claim_threads_for_po(text)',
    'public.allocate_formal_document_code(text, text, date)',
    'public.app_warehouse_id()',
    'public.approval_decide(uuid, approval_status, text)',
    'public.bd_convert_inquiry(uuid)',
    'public.commission_add_adjustment(integer, integer, text, text, uuid, numeric, text, integer, integer, uuid, text)',
    'public.commission_approve_run(uuid)',
    'public.commission_close_month(integer, integer, text, jsonb, text)',
    'public.commission_mark_paid(uuid)',
    'public.commission_reopen_run(uuid, text)',
    'public.commission_run_detail(uuid)',
    'public.commission_run_state(integer, integer, text)',
    'public.commission_runs_list(integer)',
    'public.commission_void_run(uuid, text)',
    'public.correction_work_close(uuid, text)',
    'public.dealer_invite(text, text, text)',
    'public.dealer_set_status(uuid, dealer_status, text)',
    'public.dealer_set_terms(uuid, numeric, text)',
    'public.dealer_topup(uuid, numeric, payment_method, text, text)',
    'public.dealer_with_stats(uuid)',
    'public.dealers_with_stats_list()',
    'public.delivery_arrangement_message_prepared(uuid, smallint, uuid)',
    'public.enforce_partner_orders_column_whitelist()',
    'public.enforce_partner_po_column_whitelist()',
    'public.enforce_sku_price_cost_principal_only()',
    'public.enforce_sofa_fabric_tier_principal_only()',
    'public.gen_guarantee_id()',
    'public.gl_account_ledger(text, date, date)',
    'public.gl_balance_sheet(date)',
    'public.gl_ledger_health()',
    'public.gl_party_statement(text, uuid, date, date)',
    'public.gl_profit_and_loss(date, date)',
    'public.gl_report_guard()',
    'public.gl_trial_balance(date)',
    'public.guarantee_attach(uuid, uuid)',
    'public.guarantee_claim(uuid, uuid, text, text)',
    'public.guarantee_mint_from_line()',
    'public.guarantee_snapshot_kind()',
    'public.guarantee_sync_from_order()',
    'public.guarantee_void_from_line_delete()',
    'public.hr_add_employee(text, uuid)',
    'public.hr_assign_dealer_bd(uuid, uuid)',
    'public.hr_commission_source(integer, integer)',
    'public.hr_employee_detail(uuid)',
    'public.hr_people_source()',
    'public.hr_record_exit(uuid, date, text, text)',
    'public.hr_reveal_employee_field(uuid, text)',
    'public.hr_set_checklist_item(uuid, text, text, boolean)',
    'public.hr_set_position(uuid, uuid)',
    'public.hr_set_position_duty(uuid, text, boolean)',
    'public.hr_set_reports_to(uuid, uuid)',
    'public.hr_set_staff_code(text, uuid, text)',
    'public.hr_team_source()',
    'public.hr_upsert_employee(uuid, jsonb)',
    'public.import_autocount_order(jsonb)',
    'public.import_autocount_orders(jsonb)',
    'public.invoices_reverse_ledger_on_void()',
    'public.issue_timeline_on_insert()',
    'public.lp_accept_inbound_delivery(text)',
    'public.lp_reject_order(uuid, text)',
    'public.mark_badge_seen(text)',
    'public.my_org_duties()',
    'public.next_case_no()',
    'public.next_sn_no()',
    'public.operation_abandon_order(uuid, text)',
    'public.operation_add_annotation(uuid, text, text)',
    'public.operation_adjust_stock(text, uuid, integer, text)',
    'public.operation_assign_partner(uuid, uuid)',
    'public.operation_assign_partner_and_dispatch(text, uuid, text, text, text, uuid)',
    'public.operation_attach_do_and_deliver(uuid, text, text, boolean, text, text, text)',
    'public.operation_calc_shortages(uuid, uuid)',
    'public.operation_cancel_po(text, text)',
    'public.operation_confirm_proceed_request_v3(uuid, uuid)',
    'public.operation_create_po(uuid, uuid, jsonb, integer, integer[], uuid)',
    'public.operation_create_pos_batch(jsonb)',
    'public.operation_dashboard_summary()',
    'public.operation_dispatch_customer_leg(uuid, uuid, date, boolean)',
    'public.operation_get_timeline(uuid)',
    'public.operation_partner_accept_rfd(uuid)',
    'public.operation_partner_reject_rfd(uuid, text)',
    'public.operation_partner_rfd_pending()',
    'public.operation_pick_warehouse(uuid)',
    'public.operation_reassign_po_warehouse(text, uuid)',
    'public.operation_receive_po_line(text, text, integer)',
    'public.operation_receive_po_with_do(text, text, text, jsonb)',
    'public.operation_receive_po_with_do(text, text, text, jsonb, uuid)',
    'public.operation_receive_threads(text, uuid[], text, text, text)',
    'public.operation_relocate_warehouse(text, uuid)',
    'public.operation_request_order_change(uuid, text, jsonb)',
    'public.operation_resume_dispatch_from_waiting(uuid)',
    'public.operation_revert_order_dispatched_to_ready(uuid)',
    'public.operation_revert_order_proceed_to_placed(uuid)',
    'public.operation_stock_alerts()',
    'public.operation_supplier_ready_confirm(text)',
    'public.operation_warehouse_pick(uuid, uuid)',
    'public.ops_bulk_complete_orders(uuid[])',
    'public.ops_delivery_orders_money_gate()',
    'public.ops_set_reorder_point(text, integer, integer, text)',
    'public.ops_stock_flag_repair(uuid, boolean)',
    'public.ops_stock_reassign(uuid, text)',
    'public.ops_stock_release(uuid)',
    'public.ops_stock_reserve(text, text, text, uuid)',
    'public.ops_tasks_feed()',
    'public.ops_tasks_overdue_count()',
    'public.ops_team_members()',
    'public.order_create(jsonb)',
    'public.order_dispatch(uuid, uuid, uuid)',
    'public.order_partner_advance(uuid, partner_delivery_stage, text)',
    'public.order_proceed(uuid)',
    'public.order_record_payment(uuid, numeric, payment_method, text, text, text)',
    'public.orders_auto_issue_on_dispatched()',
    'public.orders_auto_status_delivered()',
    'public.orders_rollup_stage_trigger()',
    'public.org_duty_holders()',
    'public.partner_attach_pod(uuid, text, text, text, boolean, text, text)',
    'public.partner_confirm_receive(text)',
    'public.partner_mark_pickup_collected(uuid)',
    'public.partner_orders_for_threads(uuid[])',
    'public.partner_pickup_threads(text, uuid[], text, text, text)',
    'public.partner_reject_customer(text, text)',
    'public.partner_threads_to_deliver()',
    'public.patch_delivery_stop(uuid, integer, jsonb)',
    'public.pickup_event_render_payload(uuid)',
    'public.po_advance(text, po_sup_status, text)',
    'public.po_line_issue_requires_claim()',
    'public.po_receive(text, text, text, integer, text)',
    'public.principal_dashboard_summary()',
    'public.purchase_request_cancel(uuid, text)',
    'public.purchase_request_create(uuid, integer, jsonb, date, text)',
    'public.purchasing_supplier_call_gate()',
    'public.pwp_claim_available_code(text, uuid, uuid, text, text, text)',
    'public.pwp_claim_code(text, uuid, uuid, text)',
    'public.pwp_codes_on_order_cancel()',
    'public.pwp_discover_available(text, text, text)',
    'public.pwp_reap_orphans(integer)',
    'public.pwp_release_available_code(text[], uuid)',
    'public.pwp_release_codes(text[])',
    'public.pwp_restamp_orphans()',
    'public.pwp_stamp_redeemed(text[], uuid, uuid)',
    'public.remove_order_addon(uuid, uuid)',
    'public.sales_order_amendment_live(uuid)',
    'public.sales_order_apply_amendment(uuid)',
    'public.sales_order_apply_attribution(uuid)',
    'public.sales_order_attribution_live(uuid)',
    'public.sales_order_commitment_bundle(uuid)',
    'public.sales_order_contractual_hash(uuid)',
    'public.sales_order_create(jsonb, jsonb)',
    'public.sales_order_create_unchecked_0374(jsonb, jsonb)',
    'public.sales_order_decide_attribution(uuid, text, text)',
    'public.sales_order_floors(uuid, text[], jsonb)',
    'public.sales_order_floors_unchecked_0328(uuid, text[], jsonb)',
    'public.sales_order_mint_original_at_birth()',
    'public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb)',
    'public.sales_order_save_revision_unchecked_0354(uuid, jsonb, jsonb, jsonb)',
    'public.sales_order_snapshot(uuid)',
    'public.sales_order_submit_amendment(uuid, jsonb, text, date)',
    'public.sales_order_submit_attribution(uuid, jsonb, text)',
    'public.sales_order_withdraw_attribution(uuid, text)',
    'public.set_delivery_chain(uuid, jsonb)',
    'public.set_partner_journey_calendar(uuid, smallint[], jsonb, text[])',
    'public.set_sales_order_grid_config(jsonb, jsonb)',
    'public.supplier_acknowledge(text)',
    'public.supplier_claim_gate()',
    'public.supplier_mark_delivered(text, text, text, text)',
    'public.supplier_mark_thread_ready(uuid)',
    'public.supplier_orders_for_threads(uuid[])',
    'public.supplier_start_production(text)',
    'public.supplier_threads_for_po(text)',
    'public.supplier_unmark_thread_ready(uuid)',
    'public.trg_log_ops_control_change()',
    'public.trg_log_order_change()',
    'public.trg_po_supplier_collection_guard()',
    'public.trg_stamp_delay_detected()',
    'public.trg_stamp_po_line_short_since()',
    'public.warehouse_grant_capability(text, uuid)',
    'public.warehouse_holds_capability(text, uuid)',
    'public.warehouse_import_holiday_calendar(text, text, text, text, timestamp with time zone, jsonb)',
    'public.warehouse_revoke_capability(text, uuid)',
    'public.warehouse_set_holiday_policy(uuid, boolean, text, text, boolean, text, time without time zone, time without time zone)',
    'public.warehouse_settings_gate()'
  ]) loop
    p := to_regprocedure(s);
    if p is null then continue; end if;
    if has_function_privilege('anon', p, 'execute') then
      raise exception 'anon still executes %', p; end if;
    if has_function_privilege('authenticated', p, 'execute') <> exists (select 1 from _auth_before b where b.fn = p) then
      raise exception 'authenticated execute changed on %', p; end if;
  end loop;
  p := to_regprocedure('public.gl_next_doc_no(text, date)');
  if p is not null then
    if has_function_privilege('anon', p, 'execute') then raise exception 'anon still executes gl_next_doc_no'; end if;
    if has_function_privilege('authenticated', p, 'execute') then raise exception 'authenticated still executes gl_next_doc_no'; end if;
  end if;
  if has_table_privilege('anon', 'public.purchase_order_lines', 'select') then raise exception 'anon still reads purchase_order_lines'; end if;
  if has_table_privilege('anon', 'public.purchase_requests', 'select') then raise exception 'anon still reads purchase_requests'; end if;
  if has_table_privilege('anon', 'public.formal_document_codes', 'select') then raise exception 'anon still reads formal_document_codes'; end if;
end
$sanity$;

commit;
