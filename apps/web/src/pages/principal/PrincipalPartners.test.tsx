import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import PrincipalPartners from "./PrincipalPartners";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
      this.name = "ApiError";
    }
  },
}));
import { apiFetch } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("PrincipalPartners page", () => {
  it("renders LP list from API", async () => {
    vi.mocked(apiFetch).mockResolvedValue([
      { id: "p1", name: "LP-Alpha", contact: "0123 · 1 Demo St", zones: "north" },
    ]);
    render(wrap(<PrincipalPartners />));
    await waitFor(() => expect(screen.getByText("LP-Alpha")).toBeInTheDocument());
  });

  it("shows empty state when no LPs exist", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    render(wrap(<PrincipalPartners />));
    await waitFor(() => expect(screen.getByText(/no operation partners/i)).toBeInTheDocument());
  });

  it("a failed read says so (never the empty line) and Try again reads again", async () => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("boom"));
    render(wrap(<PrincipalPartners />));
    await waitFor(() => expect(screen.getByText("Could not be loaded")).toBeInTheDocument());
    expect(screen.queryByText(/no operation partners/i)).toBeNull();
    vi.mocked(apiFetch).mockResolvedValue([
      { id: "p1", name: "LP-Alpha", contact: null, address: null, zones: null },
    ]);
    screen.getByRole("button", { name: /try again/i }).click();
    await waitFor(() => expect(screen.getByText("LP-Alpha")).toBeInTheDocument());
  });
});
