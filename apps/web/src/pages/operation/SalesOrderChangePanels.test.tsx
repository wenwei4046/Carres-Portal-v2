import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WaitingRequest } from "./SalesOrderChangePanels";
import type { AmendmentGates, SalesOrderAmendment } from "@/lib/queries";
vi.mock("@/lib/auth", () => ({ useAuth: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "principal" } }) }));
vi.mock("@/lib/queries", () => ({ useRecordAmendmentSupplier: () => ({ mutate: vi.fn(), isPending: false }) }));
const gates: AmendmentGates = {
  supplier_scope: [{ po_id: "PO-1", po_line_id: "pl1", order_line_id: "l1" }],
  supplier_waiting: [{ po_id: "PO-1", po_line_id: "pl1", order_line_id: "l1" }],
  sales_approval_required: false, sales_approval_recorded: false, legacy_review_required: false,
  sales_approver: { actor_user_id: "principal", acting_user_name: "Reviewer" },
  po_duty: { actor_user_id: "operator", acting_user_name: "Buyer" },
};
function show(price = false, submitter = "operator", overrides: Partial<AmendmentGates> = {}) {
  const decide = vi.fn();
  const amendment = { id: "a1", status: "submitted", submitted_by: submitter, submitted_at: "2026-10-01T00:00:00Z",
    reason: "Customer request", base_revision: 1, stale: false, customer_agreement_kind: null,
    gates: { ...gates, sales_approval_required: price, ...overrides } } as SalesOrderAmendment;
  render(<WaitingRequest orderId="o1" amendment={amendment} rows={[]} consequences={[]} canDecide busy={false}
    onRecordAgreement={vi.fn()} onDecide={decide} onProposeAgain={vi.fn()} />);
  return decide;
}
it("ordinary supplier feasibility is not offered as an owner approval", () => {
  show(); expect(screen.queryByTestId("decide-approve")).not.toBeInTheDocument();
  expect(screen.getByText(/PO Duty · Buyer/)).toBeInTheDocument();
});
it("the assigned price reviewer can record a parallel approval while evidence and supplier reply wait", () => {
  const decide = show(true);
  fireEvent.change(screen.getByLabelText("Management decision reason"), { target: { value: "Price agreed" } });
  expect(screen.getByTestId("decide-approve")).toBeEnabled();
  fireEvent.click(screen.getByTestId("decide-approve"));
  expect(decide).toHaveBeenCalledWith("approve", "Price agreed");
});
it("offers the owner-approved self-decision to the resolved Sales Approver", () => {
  show(true, "principal"); expect(screen.getByTestId("decide-approve")).toBeInTheDocument();
});

it("legacy review does not expose a price approval to an unassigned Principal", () => {
  show(true, "operator", { legacy_review_required: true, sales_approver: { actor_user_id: "someone-else", acting_user_name: "Other reviewer" } });
  expect(screen.queryByTestId("decide-approve")).not.toBeInTheDocument();
});
it("a recorded price approval does not bypass evidence for the remaining legacy review", () => {
  show(true, "operator", { legacy_review_required: true, sales_approval_recorded: true });
  fireEvent.change(screen.getByLabelText("Management decision reason"), { target: { value: "Check remaining change" } });
  expect(screen.getByTestId("decide-approve")).toHaveTextContent("Approve and apply");
  expect(screen.getByTestId("decide-approve")).toBeDisabled();
});

it("a legacy reviewer cannot reject another Duty's recorded price decision", () => {
  show(true, "operator", { legacy_review_required: true, sales_approval_recorded: true,
    sales_approver: { actor_user_id: "someone-else", acting_user_name: "Price reviewer" } });
  expect(screen.getByTestId("decide-approve")).toBeInTheDocument();
  expect(screen.queryByTestId("decide-reject")).not.toBeInTheDocument();
});
