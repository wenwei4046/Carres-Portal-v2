/**
 * WHAT IS WRONG, AND WHAT TO DO — every purchase-order refusal, in words an
 * operator can act on (`docs/COPY-STANDARD.md` — the two-line law and the
 * 2026-08-14 Primary School Standard English ruling;
 * CARD-2026-08-22-purchasing-02 closure §9).
 *
 * ── WHY THIS IS ONE FILE AND NOT A STRING AT EACH THROW SITE ────────────────
 *
 * The same refusal is raised in SQL, mapped in a route and rendered on two
 * surfaces. Written three times it becomes three sentences, and the operator
 * learns that the message is unreliable rather than that the document is
 * blocked. The server sends a CODE; this file is the only place that turns a
 * code into words.
 *
 * ── THE SHAPE IS FIXED ──────────────────────────────────────────────────────
 *
 *   LINE 1  the FACT — what is wrong, naming the document, supplier or SKU
 *   LINE 2  the ACT — the verb, its object, who is asked, and what completes it
 *
 * `Needs attention`, `Next action`, `Something went wrong`, `Pending`,
 * `Waiting` and a bare `Follow up` are banned by the same standard, so no line
 * below may contain one. `purchasing-refusals.test.ts` proves it for every code
 * rather than trusting a reader to notice.
 */

export interface PurchasingRefusal {
  /** LINE 1 — the fact. */
  wrong: string;
  /** LINE 2 — the act, its object, its recipient and what completes it. */
  todo: string;
}

/** The facts a message may name. Anything absent falls back to a plain noun. */
export interface PurchasingRefusalFacts {
  sku?: string | null;
  supplier?: string | null;
  destination?: string | null;
  po?: string | null;
  so?: number | null;
  arranged?: number | null;
  toBuy?: number | null;
  version?: number | null;
  actor?: string | null;
}

const some = (v: string | null | undefined, fallback: string) =>
  v != null && String(v).trim() !== "" ? String(v).trim() : fallback;

/**
 * The whole refusal dictionary. A code that is not here returns the honest
 * fallback: it still names a next act, because a message with no act is the
 * defect this file exists to remove.
 */
export function purchasingRefusal(
  code: string | null | undefined,
  facts: PurchasingRefusalFacts = {},
): PurchasingRefusal {
  const sku = some(facts.sku, "This item");
  const supplier = some(facts.supplier, "the supplier");
  const po = some(facts.po, "This purchase order");
  const dest = some(facts.destination, "that place");

  switch (code) {
    // ── WHO MAY ACT (0379) ────────────────────────────────────────────────
    case "not_po_duty":
      return {
        wrong: "You do not hold PO duty today.",
        todo: `Ask ${some(facts.actor, "today's PO duty holder")} to issue this purchase order.`,
      };
    case "no_po_duty_holder":
      return {
        wrong: "Nobody holds PO duty this month.",
        todo: "Ask management to set this month's PO duty holder.",
      };
    case "not_purchase_approver":
      return {
        wrong: "Only the approver may decide this purchase.",
        todo: `Ask ${some(facts.actor, "a manager")} to approve or refuse it.`,
      };

    // ── THE MONEY (0380) ──────────────────────────────────────────────────
    case "supplier_price_changed":
    case "stale_catalog_cost":
      return {
        wrong: `${sku} costs a different price now.`,
        todo: "Go back to buying and check the new price before you issue.",
      };
    case "expected_cost_required":
    case "cost_review_required":
      return {
        wrong: `${sku} has no checked transaction cost.`,
        todo: `Check the cost of ${sku} on this page, then issue again.`,
      };
    case "commercial_approval_required":
      return {
        wrong: `Nobody approved this price for ${sku}.`,
        todo: `Ask a manager to approve the price of ${sku} for ${supplier}.`,
      };
    case "cost_required":
      return {
        wrong: `${sku} has no transaction cost.`,
        todo: `Type the agreed cost of ${sku}, or mark it Free of Charge.`,
      };
    case "free_of_charge_reason_required":
      return {
        wrong: `${sku} is Free of Charge with no reason.`,
        todo: `Type why ${sku} is free, then ask a manager to approve it.`,
      };
    case "self_approval_refused":
      return {
        wrong: "You cannot approve a price you will use yourself.",
        todo: "Ask another manager to approve this price.",
      };
    case "not_commercial_approver":
      return {
        wrong: "Only a manager may approve a price.",
        todo: "Ask a manager to approve this price.",
      };

    // ── THE DOCUMENT PARTITION (closure §4) ───────────────────────────────
    case "duplicate_decision":
    case "duplicate_cost_decision":
      return {
        wrong: "One item was priced twice.",
        todo: "Go back to buying, then open Review Purchase Orders again.",
      };
    case "foreign_decision":
    case "stale_cost_decision":
    case "missing_decision":
      return {
        wrong: "The purchase orders on screen are out of date.",
        todo: "Go back to buying, then open Review Purchase Orders again.",
      };

    // ── THE ARRANGEMENT ───────────────────────────────────────────────────
    case "allocation_mismatch":
      return {
        wrong:
          facts.arranged != null && facts.toBuy != null
            ? `You arranged ${facts.arranged} units and must buy ${facts.toBuy}.`
            : "The arranged quantity does not match the quantity to buy.",
        todo: "Change the Deliver To split so the units add up, then issue again.",
      };
    case "partial_split_not_allowed":
      return {
        wrong: "A sofa set cannot go to two places.",
        todo: "Send the whole set to one place, then issue again.",
      };
    case "unknown_destination":
      return {
        wrong: "That Deliver To place is not on the list.",
        todo: "Choose a Deliver To place from the list, then issue again.",
      };
    case "inactive_destination":
      return {
        wrong: `${dest} is closed.`,
        todo: "Choose another Deliver To place, then issue again.",
      };
    case "destination_address_missing":
      return {
        wrong: `${dest} has no address on file.`,
        todo: `Ask Purchasing to add the address of ${dest} in Settings.`,
      };

    // ── THE DEMAND ────────────────────────────────────────────────────────
    case "unknown_demand":
    case "unknown_build":
      return {
        wrong: "One buying line changed while you were checking.",
        todo: "Go back to buying and tick the lines again.",
      };
    case "duplicate_demand":
    case "duplicate_build":
      return {
        wrong: "The same buying line is on two purchase orders.",
        todo: "Go back to buying and tick the line once.",
      };
    case "already_on_po":
      return {
        wrong: "One line is already on an open purchase order.",
        todo: "Go back to buying and untick that line.",
      };
    case "sofa_merge":
      return {
        wrong: "One sofa purchase order carries one customer order.",
        todo: "Split the sofas by customer order, then issue again.",
      };
    case "nothing_to_issue":
      return {
        wrong: "There is nothing left to buy on these lines.",
        todo: "Go back to buying and tick a line with a Buy quantity.",
      };
    case "blocked_delivery_date":
      return {
        wrong: "The customer order has no delivery date.",
        todo: "Ask the salesperson for the customer delivery date, then issue again.",
      };
    case "production_days_required":
      return {
        wrong: `${supplier} has no production days set.`,
        todo: `Ask Purchasing to set production days for ${supplier} in Settings.`,
      };
    case "unresolved_supplier":
      return {
        wrong: `${sku} has no approved supplier in Catalog.`,
        todo: `Ask Catalog to set the supplier of ${sku}, then issue again.`,
      };
    case "pickup_partner_required":
      return {
        wrong: `${supplier} does not deliver. Nobody is collecting.`,
        todo: "Choose who collects the goods, then issue again.",
      };
    case "pickup_partner_not_allowed":
      return {
        wrong: `${supplier} delivers the goods itself.`,
        todo: "Remove the collector, then issue again.",
      };
    case "no_warehouse":
      return {
        wrong: "No Carres warehouse is set up.",
        todo: "Ask Purchasing to add the Klang warehouse in Settings.",
      };

    // ── THE LINEAGE (0382) ────────────────────────────────────────────────
    case "unknown_source_order":
    case "source_line_mismatch":
    case "source_allocation_mismatch":
      return {
        wrong: "The customer order behind one line changed.",
        todo: "Go back to buying and tick the lines again.",
      };

    // ── THE IDENTITIES (0381) ─────────────────────────────────────────────
    case "document_code_pool_exhausted":
      return {
        wrong: "Today has no purchase order number left.",
        todo: "Tell IT today. Issue this purchase order tomorrow.",
      };

    // ── THE DOCUMENT AND ITS EVIDENCE (0377 · 0378 · 0379) ────────────────
    case "stale_po_version":
      return {
        wrong: `${po} changed after you opened it.`,
        todo: "Open the new PDF, send it, then record it as sent.",
      };
    case "po_not_printable":
      return {
        wrong: `${po} is cancelled.`,
        todo: "Open Purchase Orders and check the live purchase order.",
      };
    case "po_not_found":
      return {
        wrong: "That purchase order is not in the Portal.",
        todo: "Open Purchase Orders and find the purchase order again.",
      };
    case "recipient_required":
      return {
        wrong: "Nobody is named as the receiver.",
        todo: `Type who at ${supplier} received the PDF, then record it as sent.`,
      };
    case "invalid_channel":
      return {
        wrong: "The way this PDF was sent is not on the list.",
        todo: "Choose WhatsApp, Email or Printed, then record it as sent.",
      };
    case "expected_version_required":
      return {
        wrong: "The PDF is still opening.",
        todo: "Wait for the PDF, then record it as sent.",
      };

    // ── THE REQUEST ITSELF ────────────────────────────────────────────────
    case "invalid_body":
    case "invalid_param":
    case "invalid_json":
      return {
        wrong: "The Portal could not read this request.",
        todo: "Reload the page and try once more. Tell IT if it happens again.",
      };
    case "po_not_created":
      return {
        wrong: "No purchase order was created.",
        todo: "Nothing was sent. Tell IT, then issue again.",
      };
    default:
      return {
        wrong: "The Portal refused this purchase order.",
        todo: "Nothing was created. Tell IT the message on screen.",
      };
  }
}

/** The two lines as one string, for a place that has room for only one. */
export function purchasingRefusalLine(
  code: string | null | undefined,
  facts?: PurchasingRefusalFacts,
): string {
  const r = purchasingRefusal(code, facts);
  return `${r.wrong} ${r.todo}`;
}

/**
 * Every code this file answers by name. The API asserts against it so a new
 * refusal cannot be raised without words to explain it.
 */
export const PURCHASING_REFUSAL_CODES = [
  "not_po_duty",
  "no_po_duty_holder",
  "not_purchase_approver",
  "supplier_price_changed",
  "stale_catalog_cost",
  "expected_cost_required",
  "cost_review_required",
  "commercial_approval_required",
  "cost_required",
  "free_of_charge_reason_required",
  "self_approval_refused",
  "not_commercial_approver",
  "duplicate_decision",
  "duplicate_cost_decision",
  "foreign_decision",
  "stale_cost_decision",
  "missing_decision",
  "allocation_mismatch",
  "partial_split_not_allowed",
  "unknown_destination",
  "inactive_destination",
  "destination_address_missing",
  "unknown_demand",
  "unknown_build",
  "duplicate_demand",
  "duplicate_build",
  "already_on_po",
  "sofa_merge",
  "nothing_to_issue",
  "blocked_delivery_date",
  "production_days_required",
  "unresolved_supplier",
  "pickup_partner_required",
  "pickup_partner_not_allowed",
  "no_warehouse",
  "unknown_source_order",
  "source_line_mismatch",
  "source_allocation_mismatch",
  "document_code_pool_exhausted",
  "stale_po_version",
  "po_not_printable",
  "po_not_found",
  "recipient_required",
  "invalid_channel",
  "expected_version_required",
  "invalid_body",
  "invalid_param",
  "invalid_json",
  "po_not_created",
] as const;

export type PurchasingRefusalCode = (typeof PURCHASING_REFUSAL_CODES)[number];
