/**
 * The Workspace duty catalogue — the ONE list of duties `Workspace → Staff &
 * Duties` manages (workspace/MASTER.md §4, ERP-ARCHITECTURE Law F.1).
 *
 * The API route serves it with each duty's resolution; the web prints the same
 * word wherever an unresolved duty stands in for a person (Team Work's duty
 * groups, the `Nobody holds {Duty}.` failure). A new duty joins by adding a
 * row here AND its consumer module — never by a module keeping its own list.
 */
export const WORKSPACE_DUTIES = [
  { key: "po_duty", label: "PO Duty" },
  { key: "grn_duty", label: "GRN Duty" },
  // `payment_duty` is RETIRED (owner ruling 2026-09-13, 0489): ordinary
  // customer-balance collection is owned by the Responsible Delivery
  // Operation, established from Delivery Duty. No caller remains, so the
  // catalogue no longer offers the assignment.
  { key: "storage_waiver_approver", label: "Storage Waiver Approver" },
  { key: "purchasing_approver", label: "Purchasing Approver" },
  { key: "delivery_charge_approver", label: "Delivery Charge Approver" },
  { key: "payment_approver", label: "Payment Approver" },
  // 0508: releases money on the Finance side (payment vouchers, cancelling a
  // confirmed bill or an issued invoice, voiding a receipt). Resolved in SQL by
  // has_finance_approver; the holder must also be a Finance user, so the
  // holder and cover pickers offer Finance users only (`roles`).
  { key: "finance_approver", label: "Finance Approver", roles: ["finance"] },
  { key: "stock_adjustment_approver", label: "Stock Adjustment Approver" },
  { key: "service_case_approver", label: "Service Case Approver" },
  { key: "issue_triage_duty", label: "Issue Triage Duty" },
  { key: "issue_review_approver", label: "Issue Review Approver" },
  // Delivery Duty (Delivery MASTER §13.1, workspace/MASTER §4, 2026-09-13):
  // the Work engine's existing `delivery_duty` owner rule given its key.
  { key: "delivery_duty", label: "Delivery Duty" },
] as const;

export type WorkspaceDutyKey = (typeof WORKSPACE_DUTIES)[number]["key"];

/** Which account roles a duty's holder and cover pickers offer. A duty with
 *  no `roles` offers operation accounts, the list every duty used before. */
export function workspaceDutyRolesOf(key: string): readonly string[] {
  const d = WORKSPACE_DUTIES.find((x) => x.key === key);
  return d && "roles" in d ? d.roles : ["operation"];
}

/** The governed duty word for a key; an unknown key prints as itself so a
 *  wiring gap is visible, never silently blank. */
export function workspaceDutyLabelOf(key: string): string {
  return WORKSPACE_DUTIES.find((d) => d.key === key)?.label ?? key;
}
