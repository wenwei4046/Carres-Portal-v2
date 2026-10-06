import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ApprovalDrawer from "./ApprovalDrawer";

/**
 * Mock the hooks so the test renders synchronously without a real network or
 * QueryClient cache. We still wrap in a QueryClientProvider because
 * the hooks call `useQueryClient()` internally — tests crash with
 * "No QueryClient set" otherwise. Hoisted spies let each test assert which
 * hook was called (decide vs. topup wrap RPC).
 */
const mocks = vi.hoisted(() => ({
  decideAsync: vi.fn(),
  topupAsync:  vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  useDecideApproval: () => ({
    mutateAsync: mocks.decideAsync,
    isPending: false,
  }),
  useTopupApprove: () => ({
    mutateAsync: mocks.topupAsync,
    isPending: false,
  }),
}));

beforeEach(() => {
  mocks.decideAsync.mockReset().mockResolvedValue({ approval: { status: "approved" } });
  mocks.topupAsync.mockReset().mockResolvedValue({ id: "pay-1" });
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe("ApprovalDrawer", () => {
  it("renders Approve + Reject buttons for pending status", () => {
    render(
      wrap(
        <ApprovalDrawer
          approval={{
            id: "a1",
            kind: "refund",
            title: "Refund · RM 100",
            status: "pending",
            actor: "Finance",
            created_at: "2026-05-03T00:00:00Z",
            refers_to: "SO-1",
            amount: 100,
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("hides action buttons for approved status", () => {
    render(
      wrap(
        <ApprovalDrawer
          approval={{
            id: "a2",
            kind: "refund",
            title: "Refund",
            status: "approved",
            actor: "Finance",
            created_at: "2026-05-03T00:00:00Z",
            refers_to: null,
            amount: null,
            decided_at: "2026-05-03T01:00:00Z",
            decided_by: "Sara",
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("top_up: renders method dropdown + reference input (not shown for refund)", () => {
    const { rerender } = render(
      wrap(
        <ApprovalDrawer
          approval={{
            id: "a-tu",
            kind: "top_up",
            title: "Top-up · RM 3000",
            status: "pending",
            actor: "Dealer",
            created_at: "2026-05-03T00:00:00Z",
            refers_to: null,
            amount: 3000,
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId("topup-method")).toBeInTheDocument();
    expect(screen.getByTestId("topup-reference")).toBeInTheDocument();

    rerender(
      wrap(
        <ApprovalDrawer
          approval={{
            id: "a-rf",
            kind: "refund",
            title: "Refund · RM 100",
            status: "pending",
            actor: "Finance",
            created_at: "2026-05-03T00:00:00Z",
            refers_to: "SO-1",
            amount: 100,
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId("topup-method")).toBeNull();
    expect(screen.queryByTestId("topup-reference")).toBeNull();
  });

  it("top_up Approve → calls useTopupApprove with method+reference (NOT generic decide)", async () => {
    render(
      wrap(
        <ApprovalDrawer
          approval={{
            id: "appr-99",
            kind: "top_up",
            title: "Top-up · RM 3000",
            status: "pending",
            actor: "Dealer",
            created_at: "2026-05-03T00:00:00Z",
            refers_to: null,
            amount: 3000,
          }}
          onClose={() => {}}
        />,
      ),
    );

    fireEvent.change(screen.getByTestId("topup-method"), { target: { value: "cash" } });
    fireEvent.change(screen.getByTestId("topup-reference"), { target: { value: "RCPT-001" } });
    fireEvent.click(screen.getByTestId("approval-approve"));

    // Drain the microtask queue so submit()'s await resolves.
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.topupAsync).toHaveBeenCalledWith({
      approvalId: "appr-99",
      method:     "cash",
      reference:  "RCPT-001",
    });
    expect(mocks.decideAsync).not.toHaveBeenCalled();
  });

  // 0551 §16 — bank transfer / cheque / DuitNow QR are matched by their
  // reference. `finance_topup_approve` writes `payments` itself, so no
  // database guard stands behind this one: the form is the whole gate.
  it("top_up Approve refuses a blank reference, then goes through once it is typed", async () => {
    render(
      wrap(
        <ApprovalDrawer
          approval={{
            id: "appr-77",
            kind: "top_up",
            title: "Top-up · RM 3000",
            status: "pending",
            actor: "Dealer",
            created_at: "2026-05-03T00:00:00Z",
            refers_to: null,
            amount: 3000,
          }}
          onClose={() => {}}
        />,
      ),
    );

    // The form opens on bank_transfer, whose reference is required.
    expect(screen.getByTestId("topup-method")).toHaveValue("bank_transfer");
    fireEvent.click(screen.getByTestId("approval-approve"));
    await Promise.resolve();
    expect(mocks.topupAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("topup-reference"), { target: { value: "MBB-778812" } });
    fireEvent.click(screen.getByTestId("approval-approve"));
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.topupAsync).toHaveBeenCalledWith({
      approvalId: "appr-77",
      method:     "bank_transfer",
      reference:  "MBB-778812",
    });
  });

  it("top_up Reject → calls generic decide (not the wrap RPC)", async () => {
    render(
      wrap(
        <ApprovalDrawer
          approval={{
            id: "appr-99",
            kind: "top_up",
            title: "Top-up · RM 3000",
            status: "pending",
            actor: "Dealer",
            created_at: "2026-05-03T00:00:00Z",
            refers_to: null,
            amount: 3000,
          }}
          onClose={() => {}}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.decideAsync).toHaveBeenCalledWith({ status: "rejected", note: undefined });
    expect(mocks.topupAsync).not.toHaveBeenCalled();
  });

  it("shows decision block when decided", () => {
    render(
      wrap(
        <ApprovalDrawer
          approval={{
            id: "a3",
            kind: "refund",
            title: "Refund",
            status: "approved",
            actor: "Finance",
            created_at: "2026-05-03T00:00:00Z",
            refers_to: null,
            amount: null,
            decided_at: "2026-05-03T01:00:00Z",
            decided_by: "Sara",
            decision_note: "looks fine",
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText("Decision")).toBeInTheDocument();
    expect(screen.getByText("looks fine")).toBeInTheDocument();
  });
});
