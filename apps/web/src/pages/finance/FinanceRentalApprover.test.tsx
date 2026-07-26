import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FinanceRentalApprover from "./FinanceRentalApprover";

/**
 * FinanceRentalApprover (0268) — the credit gate's desk.
 *
 * What is worth asserting here is what a human relies on: that the queue's
 * empty state is a real answer, that the money on screen is the FULL credit
 * being extended (not the monthly fee), that a rejection cannot be filed
 * without a reason, and — the one that matters most — that an unsigned
 * application says so out loud instead of letting a blank imply a signature.
 */

interface HookState {
  data: unknown;
  isLoading: boolean;
  error: unknown;
}

let approvalsState: HookState = { data: undefined, isLoading: false, error: null };
const mutate = vi.fn();
let isPending = false;

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/queries", () => ({
  useRentalApprovals: () => approvalsState,
  useDecideRentalAgreement: () => ({ mutate, isPending }),
}));

const ROW = {
  id: "ag-1",
  agreementNo: "RA-1001",
  status: "pending_approval",
  sku: "CLOUD-K",
  termMonths: 84,
  monthlyFee: 59,
  oneOffTotal: 0,
  termTotal: 4956,
  startDate: "2026-08-01",
  createdAt: "2026-07-26T00:00:00Z",
  notes: null,
  signedAt: null,
  signedName: null,
  signedNric: null,
  signaturePath: null,
  signedDocPath: null,
  templateVersion: null,
  creditCheckedAt: null,
  creditReference: null,
  orderId: null,
  orderSo: null,
  customer: {
    id: "cus-1",
    name: "Tan Mei Ling",
    phone: "0123456789",
    email: null,
    address: null,
  },
  dealer: { id: "d1", name: "Carres Setia Alam", channel: "showroom" },
  salesperson: { id: "s1", name: "Aisyah" },
};

beforeEach(() => {
  approvalsState = { data: undefined, isLoading: false, error: null };
  mutate.mockReset();
  isPending = false;
});

describe("FinanceRentalApprover", () => {
  it("says nothing is waiting, rather than showing a blank page", () => {
    approvalsState = { data: { approvals: [] }, isLoading: false, error: null };
    render(<FinanceRentalApprover />);
    expect(screen.getByTestId("approver-empty")).toBeInTheDocument();
    expect(screen.getByText(/Nothing waiting/i)).toBeInTheDocument();
  });

  it("shows the FULL credit at stake, not just the monthly fee", () => {
    approvalsState = { data: { approvals: [ROW] }, isLoading: false, error: null };
    const { container } = render(<FinanceRentalApprover />);
    // RM 4,956 = 59 × 84 — the number the decision is actually about
    expect(screen.getAllByText(/4,956/).length).toBeGreaterThan(0);
    // the fee line is interpolated across text nodes, so read the whole card
    expect(container.textContent).toMatch(/59\.00\s*\/\s*mo\s*×\s*84 months/);
  });

  it("names the customer, the store and the salesperson", () => {
    approvalsState = { data: { approvals: [ROW] }, isLoading: false, error: null };
    render(<FinanceRentalApprover />);
    expect(screen.getByText(/Tan Mei Ling/)).toBeInTheDocument();
    expect(screen.getByText(/Carres Setia Alam/)).toBeInTheDocument();
    expect(screen.getByText(/Aisyah/)).toBeInTheDocument();
  });

  it("says NOT SIGNED out loud when no signature is on file", () => {
    approvalsState = { data: { approvals: [ROW] }, isLoading: false, error: null };
    render(<FinanceRentalApprover />);
    expect(screen.getByText(/Not signed yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Signed$/)).not.toBeInTheDocument();
  });

  it("shows Signed once a signature exists", () => {
    approvalsState = {
      data: { approvals: [{ ...ROW, signedAt: "2026-07-26T01:00:00Z", signedName: "Tan Mei Ling" }] },
      isLoading: false,
      error: null,
    };
    render(<FinanceRentalApprover />);
    expect(screen.getByText("Signed")).toBeInTheDocument();
    expect(screen.queryByText(/Not signed yet/i)).not.toBeInTheDocument();
  });

  it("approve fires the mutation with approve:true and no note", () => {
    approvalsState = { data: { approvals: [ROW] }, isLoading: false, error: null };
    render(<FinanceRentalApprover />);
    fireEvent.click(screen.getByTestId("approver-approve"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({ id: "ag-1", approve: true });
  });

  it("reject asks for a reason first and refuses to file a blank one", () => {
    approvalsState = { data: { approvals: [ROW] }, isLoading: false, error: null };
    render(<FinanceRentalApprover />);
    fireEvent.click(screen.getByTestId("approver-reject"));

    const confirm = screen.getByTestId("approver-reject-confirm");
    expect(confirm).toBeDisabled();

    // whitespace is not a reason
    fireEvent.change(screen.getByTestId("approver-reason"), { target: { value: "   " } });
    expect(confirm).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("approver-reason"), {
      target: { value: "adverse credit record" },
    });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    expect(mutate.mock.calls[0][0]).toMatchObject({
      id: "ag-1",
      approve: false,
      note: "adverse credit record",
    });
  });

  it("admits the CBM check is not wired rather than implying it ran", () => {
    approvalsState = { data: { approvals: [ROW] }, isLoading: false, error: null };
    render(<FinanceRentalApprover />);
    expect(screen.getByText(/not wired yet/i)).toBeInTheDocument();
  });

  it("surfaces a load failure instead of showing an empty queue", () => {
    approvalsState = { data: undefined, isLoading: false, error: new Error("boom") };
    render(<FinanceRentalApprover />);
    expect(screen.getByText(/Failed to load the approval queue/i)).toBeInTheDocument();
    expect(screen.queryByTestId("approver-empty")).not.toBeInTheDocument();
  });

  it("never leaks a raw underscored DB word to the screen", () => {
    approvalsState = { data: { approvals: [ROW] }, isLoading: false, error: null };
    const { container } = render(<FinanceRentalApprover />);
    expect(container.textContent).not.toMatch(/pending_approval/);
  });
});
