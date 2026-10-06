/**
 * 3.1 · WRITABLE-COLUMN SNAPSHOT for the GATE 1 exhaustiveness test.
 *
 * Captured from the LIVE Carres Supabase on 2026-08-10 with:
 * ```sql
 * select table_name, column_name from information_schema.columns
 * where table_schema='public'
 *   and table_name in ('orders','order_lines','order_addons')
 * order by table_name, ordinal_position;
 * ```
 *
 * **The migration that adds a column MUST re-run that query and update this
 * list in the same PR** — the exhaustiveness test then fails until the new
 * column is placed in CLASS_A_FIELDS, CLASS_B_FIELDS or EXECUTION_FIELDS.
 * (CI holds no database connection, so the snapshot is the test's
 * information_schema; the freshness duty rides the migration PR. Build
 * decision, logged in the 3.5 wall report.)
 */
export const SALES_ORDER_WRITABLE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  orders: [
    "id", "so", "status", "channel", "dealer_id", "outlet_id", "salesperson_id",
    "customer_name", "customer_phone", "customer_address", "customer_address_unknown",
    "customer_billing", "customer_billing_same", "customer_emergency",
    "delivery_date", "delivery_date_tbd", "delivery_floor", "delivery_has_lift",
    "paid", "signature_url", "terms_accepted", "operation_stage", "warehouse_id",
    "delivery_partner_id", "partner_stage", "partner_picked_at", "partner_eta",
    "do_number", "do_note", "invoice_no", "invoiced_at", "placed_at", "created_at",
    "updated_at", "payment_slip_url", "payment_method", "approval_code",
    "installment_months", "dispatched_at", "delivered_at", "do_file_path",
    "do_uploaded_at", "do_uploaded_by", "delivery_stair_items", "source_system",
    "source_ref", "items_edited", "ops_assigned_logistic", "request_for_delivery_at",
    "partner_accepted_at", "partner_rejected_at", "partner_rejected_reason",
    "pod_signature_url", "pod_signed_by", "pod_signed_at", "delivery_stops",
    "proceed_date", "customer_email", "customer_race", "customer_gender",
    "customer_birthday", "entry_data", "customer_address_line1",
    "customer_address_line2", "customer_address_state", "customer_address_city",
    "customer_address_postcode", "proceeded_at", "sales_final_submitted_at",
  ],
  order_lines: [
    "id", "order_id", "sku", "qty", "attrs", "unit_price", "created_at",
    "source_po", "excluded_from_plan", "exclude_from_plan_until",
  ],
  order_addons: ["id", "order_id", "addon_key", "qty", "unit_price", "attrs"],
};

/**
 * 3.3/3.5 · `order_change_requests` — the amendment-request table's columns.
 *
 * Captured from the LIVE Carres Supabase on 2026-08-10 with the same query as
 * above. Separate from `SALES_ORDER_WRITABLE_COLUMNS` on purpose: that list
 * feeds GATE 1's exhaustiveness test, which demands every column it names be
 * classified A / B / EXECUTION. These columns are the REQUEST's own plumbing,
 * not fields of the sales order, so classifying them would be a category error.
 *
 * What this list is for: `sales-order-request-columns.test.ts` checks that the
 * Stage 3 functions only read columns that exist. It was written after
 * `sales_order_attribution_live` shipped reading `created_at` — a column this
 * table has never had — and 500'd on every real order while its API test,
 * which mocks the RPC, stayed green.
 */
export const ORDER_CHANGE_REQUEST_COLUMNS: readonly string[] = [
  "id",
  "order_id",
  "kind",
  "payload",
  "status",
  "requested_by",
  "requested_at",
  "decided_by",
  "decided_at",
  "decision_note",
  "applied_at",
];
