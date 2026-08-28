/**
 * 3.1 · THE CLASSIFICATION REGISTRY — GATE 1 (docs/STAGE-3-GATES.md, FROZEN
 * owner 我同意 2026-08-09): **two explicit allowlists, no residue.**
 *
 * ```
 * A        = explicit allowlist   (contractual — amendment, ALWAYS customer-accepted)
 * B        = explicit allowlist   (correction — direct edit + revision, NEVER accepted)
 * UNKNOWN  = BLOCK. Classify before it ships.
 * ```
 *
 * The A and B lists below are GATE 1's, copied verbatim and resolved to the
 * live columns. **The registry additionally names, column by column, the
 * EXECUTION facts that live on these same tables** (the GATE 5 trap:
 * logistics and invoicing live ON the orders row). Execution columns are not
 * a third class of *edit* — they are the explicit statement that NO edit door
 * (SAVE or amendment) may ever write them; they belong to their workflow
 * RPCs. `classify()` reports any attempt as `unknown` → the caller BLOCKS.
 * Without this list the exhaustiveness test could not hold "no residue"
 * while keeping `do_number` out of a direct-edit class. (Build decision,
 * logged in the 3.5 wall report.)
 *
 * NO FALLBACK, ANYWHERE: nothing here classifies by name, prefix or analogy.
 * A column is in a list or it is UNKNOWN.
 */

/** CLASS A — CONTRACTUAL. Amendment lane; always customer-accepted (GATE 2). */
export const CLASS_A_FIELDS: ReadonlySet<string> = new Set([
  // order_lines — add · remove · sku · qty · unit_price · attrs (GATE 1)
  "order_lines.sku",
  "order_lines.qty",
  "order_lines.unit_price",
  "order_lines.attrs",
  // order_addons — add · remove · price (GATE 1). `attrs` carries what the
  // service IS (disposal size, follow-up target) — part of what was bought.
  "order_addons.addon_key",
  "order_addons.qty",
  "order_addons.unit_price",
  "order_addons.attrs",
  // "what was promised to me" (GATE 1, verbatim)
  "orders.delivery_date",
  "orders.delivery_date_tbd",
  // "money — any term the customer signed": the instalment plan is a signed
  // term. (payment_method / approval_code / paid are CAPTURE facts — see
  // EXECUTION.) Build decision, logged.
  "orders.installment_months",
]);

/** CLASS B — CORRECTION. Direct edit + revision; never customer-accepted. */
export const CLASS_B_FIELDS: ReadonlySet<string> = new Set([
  "orders.customer_name",
  "orders.customer_phone",
  "orders.customer_email",
  "orders.customer_emergency",
  "orders.customer_address",
  "orders.customer_billing",
  // structured address (0230:31-35)
  "orders.customer_address_line1",
  "orders.customer_address_line2",
  "orders.customer_address_city",
  "orders.customer_address_state",
  "orders.customer_address_postcode",
  "orders.customer_address_unknown",
  "orders.customer_billing_same",
  // customer demographics (0200) — the customer's own facts
  "orders.customer_race",
  "orders.customer_gender",
  "orders.customer_birthday",
  "orders.delivery_floor",
  "orders.delivery_has_lift",
  "orders.delivery_stair_items",
  // 0165:19 planned production start — BUILD-QUEUE ruling: direct-edit
  // boundary only, never an amendment trigger
  "orders.proceed_date",
  // GATE 1's `notes` lives in order_annotations (its own table, own door) —
  // no orders column carries it.
  // CLASS B + TEST 3 (stays B — never promoted to A):
  "orders.salesperson_id",
  "orders.dealer_id",
  "orders.outlet_id",
  "orders.channel",
]);

/** The TEST-3 subset of B: the value moves money · commission · entitlement ·
 *  ownership · visibility between parties → INTERNAL approval (GATE 2b). */
export const TEST3_FIELDS: ReadonlySet<string> = new Set([
  "orders.salesperson_id",
  "orders.dealer_id",
  "orders.outlet_id",
  "orders.channel",
]);

/**
 * EXECUTION — facts other modules own, living on these tables (GATE 5 trap).
 * NEVER writable through any edit door; each names its owner. `classify()`
 * returns them as `unknown` so every caller blocks.
 */
export const EXECUTION_FIELDS: ReadonlyMap<string, string> = new Map([
  // identity / bookkeeping
  ["orders.id", "identity"],
  ["orders.so", "identity — sequence"],
  ["orders.placed_at", "birth stamp"],
  ["orders.created_at", "bookkeeping"],
  ["orders.updated_at", "bookkeeping"],
  ["orders.proceeded_at", "Sales → Operations handoff stamp (0395)"],
  ["orders.sales_final_submitted_at", "Sales Portal final-submit / exact recovery stamp (0395)"],
  ["orders.entry_data", "POS wizard capture"],
  ["orders.source_system", "import provenance"],
  ["orders.source_ref", "import provenance"],
  ["orders.items_edited", "POS edit marker"],
  // lifecycle / logistics — Delivery & pipeline RPCs
  ["orders.status", "pipeline RPCs (0008/0011/0222)"],
  ["orders.operation_stage", "pipeline RPCs"],
  ["orders.warehouse_id", "warehouse pick RPC"],
  ["orders.delivery_partner_id", "logistics RPCs"],
  ["orders.partner_stage", "partner RPCs"],
  ["orders.partner_picked_at", "partner RPCs"],
  ["orders.partner_eta", "partner RPCs"],
  ["orders.ops_assigned_logistic", "inbox triage"],
  ["orders.request_for_delivery_at", "logistics RPCs"],
  ["orders.partner_accepted_at", "partner RPCs"],
  ["orders.partner_rejected_at", "partner RPCs"],
  ["orders.partner_rejected_reason", "partner RPCs"],
  ["orders.delivery_stops", "multi-leg chain (0156)"],
  ["orders.dispatched_at", "dispatch RPC"],
  ["orders.delivered_at", "delivery RPC"],
  // documents — their own lifecycles
  ["orders.do_number", "DO issue"],
  ["orders.do_note", "DO issue"],
  ["orders.do_file_path", "DO attach"],
  ["orders.do_uploaded_at", "DO attach"],
  ["orders.do_uploaded_by", "DO attach"],
  ["orders.pod_signature_url", "POD capture"],
  ["orders.pod_signed_by", "POD capture"],
  ["orders.pod_signed_at", "POD capture"],
  ["orders.invoice_no", "invoice issue (0098/0229)"],
  ["orders.invoiced_at", "invoice issue"],
  // money CAPTURE — Payment lane (GATE 7: settlement via order_payments)
  ["orders.paid", "payment recording"],
  ["orders.payment_method", "at-sale capture"],
  ["orders.approval_code", "at-sale capture"],
  ["orders.payment_slip_url", "at-sale capture"],
  // acceptance capture
  ["orders.signature_url", "POS eSign capture"],
  ["orders.terms_accepted", "POS acceptance"],
  // order_lines / order_addons bookkeeping + planner marks
  ["order_lines.id", "identity"],
  ["order_lines.order_id", "identity"],
  ["order_lines.created_at", "bookkeeping"],
  ["order_lines.source_po", "AutoCount importer"],
  ["order_lines.excluded_from_plan", "purchasing planner (0243)"],
  ["order_lines.exclude_from_plan_until", "purchasing planner (0243)"],
  ["order_addons.id", "identity"],
  ["order_addons.order_id", "identity"],
]);

export interface Classification {
  class: "A" | "B";
  fields: string[];
  requiresTest3: boolean;
  unknown: string[];
}

/**
 * Normalize a caller token to registry form. Callers speak in orders-column
 * names (`delivery_date`) plus the two set-tokens (`order_lines`,
 * `order_addons`, meaning "the line/addon SET changed" — add/remove/edit).
 */
function normalize(token: string): string[] {
  if (token === "order_lines" || token === "items") {
    return ["order_lines.sku", "order_lines.qty", "order_lines.unit_price", "order_lines.attrs"];
  }
  if (token === "order_addons" || token === "addons") {
    return ["order_addons.addon_key", "order_addons.qty", "order_addons.unit_price", "order_addons.attrs"];
  }
  return [token.includes(".") ? token : `orders.${token}`];
}

/**
 * `classify(changedFields)` — GATE 1, mechanically. ANY Class-A field in the
 * set makes the change Class A (a mixed change is an amendment). `unknown`
 * carries every token in neither allowlist — including EXECUTION columns —
 * and a non-empty `unknown` means the caller MUST block.
 */
export function classify(changedFields: readonly string[]): Classification {
  const resolved = [...new Set(changedFields.flatMap(normalize))];
  const a: string[] = [];
  const b: string[] = [];
  const unknown: string[] = [];
  for (const f of resolved) {
    if (CLASS_A_FIELDS.has(f)) a.push(f);
    else if (CLASS_B_FIELDS.has(f)) b.push(f);
    else unknown.push(f);
  }
  return {
    class: a.length > 0 ? "A" : "B",
    fields: [...a, ...b],
    requiresTest3: resolved.some((f) => TEST3_FIELDS.has(f)),
    unknown,
  };
}
