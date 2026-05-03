import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ApprovalDrawer from "./ApprovalDrawer";

/**
 * Mock the hook so the test renders synchronously without a real network or
 * QueryClient cache. We still wrap in a QueryClientProvider because
 * `useDecideApproval` calls `useQueryClient()` internally — tests crash with
 * "No QueryClient set" otherwise. The mock returns a no-op mutation that
 * mimics the success path.
 */
vi.mock("@/lib/queries", () => ({
  useDecideApproval: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ approval: { status: "approved" } }),
    isPending: false,
  }),
}));

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
            refers_to: "DL-1",
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
