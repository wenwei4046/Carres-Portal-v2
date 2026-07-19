import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import PrincipalDealers from "./PrincipalDealers";

/**
 * The Dealers / Showrooms split (Loo 2026-07-19). Our own Kelana Jaya showroom
 * used to sit in the HQ "Dealers" list looking like somebody else's
 * dealership; the two are now separate pages off the same `dealers.channel`.
 */

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

function row(over: Partial<Record<string, unknown>>) {
  return {
    id: "x",
    name: "Store",
    region: "KL",
    contact: null,
    status: "active",
    joinedDate: "2026-01-01",
    creditLimit: 0,
    paymentTerms: "NET 30",
    depositBalance: 0,
    orderCount: 0,
    gmv: 0,
    outstanding: 0,
    channel: "dealer",
    outletCount: 1,
    ...over,
  };
}

const ROSTER = {
  dealers: [
    row({ id: "d1", name: "litte mattress sdn bhd", channel: "dealer", outletCount: 2 }),
    row({ id: "s1", name: "Kelana Jaya", channel: "showroom", outletCount: 1 }),
  ],
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("PrincipalDealers — dealer vs showroom split", () => {
  it("the Dealers page lists dealers only", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ROSTER);
    render(wrap(<PrincipalDealers channel="dealer" />));
    await waitFor(() =>
      expect(screen.getByText("litte mattress sdn bhd")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Kelana Jaya")).toBeNull();
    expect(screen.getByRole("heading", { name: "Dealers" })).toBeInTheDocument();
  });

  it("the Showrooms page lists our own stores only", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ROSTER);
    render(wrap(<PrincipalDealers channel="showroom" />));
    await waitFor(() => expect(screen.getByText("Kelana Jaya")).toBeInTheDocument());
    expect(screen.queryByText("litte mattress sdn bhd")).toBeNull();
    expect(screen.getByRole("heading", { name: "Showrooms" })).toBeInTheDocument();
  });

  it("counts only this channel's stores in the header", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      dealers: [
        row({ id: "d1", channel: "dealer", status: "active" }),
        row({ id: "d2", channel: "dealer", status: "pending" }),
        row({ id: "s1", channel: "showroom", status: "active" }),
      ],
    });
    render(wrap(<PrincipalDealers channel="dealer" />));
    await waitFor(() =>
      expect(screen.getByText(/1 active · 1 pending · 0 suspended/)).toBeInTheDocument(),
    );
  });

  it("shows an Outlets column on Dealers but not on Showrooms", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ROSTER);
    const { unmount } = render(wrap(<PrincipalDealers channel="dealer" />));
    await waitFor(() =>
      expect(screen.getByRole("columnheader", { name: "Outlets" })).toBeInTheDocument(),
    );
    // The dealer's two branches are rolled up in that column.
    expect(screen.getByText("2")).toBeInTheDocument();
    unmount();

    render(wrap(<PrincipalDealers channel="showroom" />));
    await waitFor(() => expect(screen.getByText("Kelana Jaya")).toBeInTheDocument());
    expect(screen.queryByRole("columnheader", { name: "Outlets" })).toBeNull();
  });

  it("a dealer is invited; a showroom is opened from Accounts", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ROSTER);
    const { unmount } = render(wrap(<PrincipalDealers channel="dealer" />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "+ Invite dealer" })).toBeInTheDocument(),
    );
    unmount();

    render(wrap(<PrincipalDealers channel="showroom" />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "+ New showroom" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "+ Invite dealer" })).toBeNull();
  });
});
