import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InviteDealerModal from "./InviteDealerModal";

/**
 * Mock the hook so the test renders synchronously without a real network or
 * QueryClient cache. We still wrap in a QueryClientProvider because
 * `useInviteDealer` calls `useQueryClient()` internally — tests crash with
 * "No QueryClient set" otherwise. Mirrors ApprovalDrawer.test.tsx setup.
 */
vi.mock("@/lib/queries", () => ({
  useInviteDealer: () => ({
    mutateAsync: vi.fn().mockResolvedValue({
      dealer: { id: "d1", name: "ComfortBeds" },
      approval: { id: "a1" },
      idempotent: false,
    }),
    isPending: false,
  }),
}));

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe("InviteDealerModal", () => {
  it("disables Send invite when fields are empty", () => {
    render(wrap(<InviteDealerModal onClose={() => {}} />));
    const btn = screen.getByRole("button", { name: /Send invite/ });
    expect(btn).toBeDisabled();
  });

  it("enables Send invite when all 3 fields are filled with min lengths", () => {
    render(wrap(<InviteDealerModal onClose={() => {}} />));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "ComfortBeds" } });
    fireEvent.change(inputs[1], { target: { value: "KL" } });
    fireEvent.change(inputs[2], { target: { value: "Loo · 012" } });
    expect(screen.getByRole("button", { name: /Send invite/ })).not.toBeDisabled();
  });
});
