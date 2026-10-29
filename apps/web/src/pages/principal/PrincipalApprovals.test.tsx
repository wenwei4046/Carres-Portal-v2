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
