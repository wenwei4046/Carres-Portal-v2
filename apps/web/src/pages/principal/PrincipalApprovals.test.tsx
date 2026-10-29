import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PrincipalApprovals from "./PrincipalApprovals";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api";

describe("PrincipalApprovals tab counts", () => {
  it("shows a dash, not zeros, when only the counts query fails", async () => {
    vi.mocked(apiFetch).mockImplementation((url: string) =>
      String(url).includes("status=all") ? Promise.reject(new Error("boom")) : Promise.resolve({ approvals: [] }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PrincipalApprovals />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /^pending · –$/ })).toBeInTheDocument());
    expect(screen.queryByText(/· 0/)).toBeNull();
  });
});

describe("PrincipalApprovals stale data", () => {
  it("keeps cached rows and counts when a background refetch fails", async () => {
    const row = { id: "x1", status: "pending", kind: "order", title: "Order 1", createdAt: "2026-10-29T08:00:00Z" };
    vi.mocked(apiFetch).mockResolvedValue({ approvals: [row] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PrincipalApprovals />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /^pending · 1$/ })).toBeInTheDocument());
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    await qc.refetchQueries();
    await waitFor(() => expect(qc.getQueryCache().getAll().some((q) => q.state.status === "error")).toBe(true));
    expect(screen.queryByText("Could not be loaded")).toBeNull();
    expect(screen.getByRole("button", { name: /^pending · 1$/ })).toBeInTheDocument();
  });
});
