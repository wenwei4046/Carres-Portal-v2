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
  /** The line's own requested quantity — the approved-quantity ceiling. */
  qty?: number | null;
  /** 0422 — the Delivery Date asked for, and the earliest date the items can
   *  arrive. Both arrive already formatted for the surface printing them. */
  date?: string | null;
  earliest?: string | null;
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
  /* The same fact for the five lines that OPEN a sentence with it. A real name
     already carries its own capital, so this differs from `supplier` only when
     no name was passed — and there it is the difference between "The supplier
     must be collected to Carres Klang." and the same sentence starting
     lowercase in the middle of a screen. `supplier` stays as it is because it
     also lands mid-sentence ("...the price of B1201S-K for Hooka."), and one
     constant cannot be right in both places. */
  const supplierOpening = some(facts.supplier, "The supplier");
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

    // ── THE DECISION (0360 · Card 05) — the Manual Purchase approval door ─
    case "no_purchase_approver":
      return {
        wrong: "No purchase approver is set.",
        todo: "Ask management to set the purchase approver.",
      };
    case "already_decided":
      return {
        wrong: "This purchase was already decided.",
        todo: "Reload the Manual Purchase to see the decision.",
      };
    case "reason_required":
      return {
        wrong: "The decision reason is missing.",
        todo: "Type why this purchase is not going ahead.",
      };
    case "invalid_cut_qty":
      return {
        wrong: "The approved quantity is not valid.",
        todo: `Enter a whole number from 0 to ${some(
          facts.qty == null ? null : String(facts.qty),
          "the requested quantity",
        )}.`,
      };
    case "decision_not_recorded":
      return {
        wrong: "The decision was not recorded.",
        todo: "Reload the Manual Purchase and try once more. Tell IT if it happens again.",
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
    case "sofa_merge":
      return {
        wrong: "One sofa purchase order carries one customer order.",
        todo: "Split the sofas by customer order, then issue again.",
      };
    /* ── THE MANUAL PURCHASE ISSUE PATH ───────────────────────────────────
       Three codes the route has always raised and this file has never
       answered, so each one reached the operator as the fallback: "The Portal
       refused this purchase order. Tell IT the message on screen." Two of them
       are the COMMONEST refusals on that door — somebody else issued the
       request, or it is simply not approved yet — so the ordinary working day
       read as a system fault, which is the exact thing this file exists to
       stop.
       `not_ready_to_order` USED TO CARRY BOTH facts: not-yet-approved AND
       refused. One code cannot say two things, so the route now separates them
       and each gets its own sentence — fact first, in the operator's words. */
    case "unknown_request":
      return {
        wrong: "One Manual Purchase on this list is no longer there.",
        todo: "Reload the page, then tick the ones that are left and issue again.",
      };
    case "not_ready_to_order":
      return {
        wrong: "One Manual Purchase has not been approved yet.",
        todo: "Ask its approver to Approve it, then issue again.",
      };
    case "request_refused":
      return {
        wrong: "One Manual Purchase was refused.",
        todo: "Go back and untick the refused one, then issue again.",
      };
    /* The Deliver To door on an existing request (0421). A request whose line
       is already on a PO keeps its place: the PO names its own destination and
       changes through Revise. A request with nothing left to deliver has no
       place to move. */
    case "request_ordered":
      return {
        wrong: "This request is already ordered. Deliver To cannot move.",
        todo: "Revise the purchase order instead.",
      };
    case "request_closed":
      return {
        wrong: "This request is not going ahead.",
        todo: "Raise a new request.",
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
        wrong: `${supplierOpening} has no production days set.`,
        todo: `Ask Purchasing to set production days for ${supplier} in Settings.`,
      };
    case "unresolved_supplier":
      return {
        wrong: `${sku} has no approved supplier in Catalog.`,
        todo: `Ask Catalog to set the supplier of ${sku}, then issue again.`,
      };
    case "pickup_partner_required":
    case "supplier_collection_not_configured":
      return {
        wrong: `${supplierOpening} collection is not configured.`,
        todo: "Set its collector and destination in Purchasing Settings, then issue again.",
      };
    case "supplier_collection_mismatch":
      return {
        wrong: `${supplierOpening} has a different collector in Purchasing Settings.`,
        todo: "Reload the purchase, then issue it with the configured collector.",
      };
    /* YH, 2026-09-02, meeting this on the issue screen: "????". Both lines
       earned it. The first said `the supplier` — the fallback, because two of
       the three callers passed no name — so on a batch spanning suppliers it
       named none of them. The second, `Reload the purchase, then issue it to
       the destination in Purchasing Settings`, asked for a refresh (not an
       act, and not the problem) and never said WHICH destination or WHICH of
       the two Deliver To settings to move. Its own neighbour eight lines down
       has always got this right: `Remove the collector, then issue again.`
       Named, and one act. */
    case "supplier_collection_destination_mismatch":
      return {
        wrong: `${supplierOpening} must be collected to ${some(
          facts.destination,
          "its configured destination",
        )}.`,
        /* TWO Deliver To values disagree — this purchase's and the supplier's
           in Settings — and naming both acts costs 17 words, past the 14 this
           file is held to. So the act names the one that is normally wrong:
           Settings holds the collection CONTRACT and changes rarely; the
           purchase is today's transaction. An operator who really means to move
           the contract still has the destination's name from line 1. */
        todo: `Set Deliver To to ${some(facts.destination, "that destination")}, then issue again.`,
      };
    case "pickup_partner_not_allowed":
      return {
        wrong: `${supplierOpening} delivers the goods itself.`,
        todo: "Remove the collector, then issue again.",
      };
    /* 0422 — the Purchasing Settings switch is on and the asked-for Delivery
       Date is before the earliest date the picked items can arrive (their
       production + transit working days, the same arithmetic that proposed
       the date). The act names the one fix: move the date. */
    case "delivery_date_before_earliest":
      return {
        wrong: `Delivery Date ${some(facts.date, "asked for")} is earlier than the earliest date ${some(
          facts.earliest,
          "the items can arrive",
        )}.`,
        todo: `Set Delivery Date to ${some(facts.earliest, "the earliest date")} or later, then send again.`,
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
  "no_purchase_approver",
  "already_decided",
  "reason_required",
  "invalid_cut_qty",
  "decision_not_recorded",
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
  "sofa_merge",
  "unknown_request",
  "not_ready_to_order",
  "request_refused",
  "request_ordered",
  "request_closed",
  "nothing_to_issue",
  "blocked_delivery_date",
  "production_days_required",
  "unresolved_supplier",
  "pickup_partner_required",
  "supplier_collection_not_configured",
  "supplier_collection_mismatch",
  "supplier_collection_destination_mismatch",
  "pickup_partner_not_allowed",
  "delivery_date_before_earliest",
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
