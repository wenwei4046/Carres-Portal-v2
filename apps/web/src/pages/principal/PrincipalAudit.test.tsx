import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PrincipalAudit from "./PrincipalAudit";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api";

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PrincipalAudit />
    </QueryClientProvider>,
  );
}

describe("PrincipalAudit failed read", () => {
  it("shows Could not be loaded, not 'No entries.', and Try again reads again", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("boom"));
    show();
    await waitFor(() => expect(screen.getByText("Could not be loaded")).toBeInTheDocument());
    expect(screen.queryByText("No entries.")).toBeNull();

    vi.mocked(apiFetch).mockResolvedValueOnce({
      rows: [{ id: "a1", role: "principal", actor: "Sara", action: "Approved order", dealerId: null, ref: null, occurredAt: "2026-10-29T08:00:00Z" }],
    });
    screen.getByRole("button", { name: /try again/i }).click();
    await waitFor(() => expect(screen.getByText("Approved order")).toBeInTheDocument());
  });
});
