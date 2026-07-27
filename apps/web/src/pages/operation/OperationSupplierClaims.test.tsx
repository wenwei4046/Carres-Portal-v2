import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationSupplierClaims from "./OperationSupplierClaims";
import type { SupplierClaimsResponse } from "@/lib/queries";

/**
 * R2 — the Claims queue. What the supplier still owes us, one row per problem.
 *
 * The tests pin the two things that make the page useful rather than decorative:
 * the row states FACTS (who, what, how many, off which PO) and the empty state
 * is a real answer, not a shrug. Resolution is R3's card and is deliberately
 * absent here.
 */
const claimsQuery = vi.fn();
const photosQuery = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationSupplierClaims: (status: string) => claimsQuery(status),
    useOperationSupplierClaimPhotos: (id: string | null) => photosQuery(id),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const DAMAGED = {
  id: "c1",
  claim_no: "SC-1001",
  po_id: "PO-2050",
  po_line_id: "l1",
  supplier_id: "s1",
  supplier_name: "Ohana",
  sku: "mattress:carres-cloud:King",
  product_category: "mattress",
  claim_type: "damaged",
  qty: 2,
  status: "open",
  do_number: "DO-5231",
  note: null,
  reported_by_name: "Shasha",
  reported_at: "2026-07-27T02:00:00Z",
  photo_count: 2,
};

const LATE = {
  ...DAMAGED,
  id: "c2",
  claim_no: "SC-1002",
  claim_type: "late_delivery",
  qty: 3,
  note: "Promised 20 Jul 26 — still pending delivery.",
  reported_by_name: null,
  photo_count: 0,
};

function ok(data: SupplierClaimsResponse) {
  return { data, isLoading: false, isError: false, error: null, refetch: vi.fn() };
}

beforeEach(() => {
  claimsQuery.mockReset();
  photosQuery.mockReset();
  photosQuery.mockReturnValue({ data: { photos: [] }, isLoading: false, isError: false });
});

describe("OperationSupplierClaims", () => {
  it("states the facts of each claim — supplier, item, problem, PO, reporter", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [DAMAGED], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(screen.getByText("SC-1001")).toBeInTheDocument();
    expect(screen.getByText("Ohana")).toBeInTheDocument();
    expect(screen.getByText("2 units")).toBeInTheDocument();
    expect(screen.getByTestId("claim-type-SC-1001")).toHaveTextContent("Damaged");
    expect(screen.getByText("PO-2050")).toBeInTheDocument();
    expect(screen.getByText("DO DO-5231")).toBeInTheDocument();
    expect(screen.getByText("Shasha")).toBeInTheDocument();
  });

  it("names the nightly sweep as the reporter of a late delivery instead of printing a blank", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [LATE], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(screen.getByTestId("claim-type-SC-1002")).toHaveTextContent(
      "Late delivery",
    );
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(
      screen.getByText(/Promised 20 Jul 26 — still pending delivery\./),
    ).toBeInTheDocument();
  });

  it("opens on the OPEN queue and switches status on the tabs", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [], counts: { open: 4, closed: 9, all: 13 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(claimsQuery).toHaveBeenCalledWith("open");
    fireEvent.click(screen.getByRole("tab", { name: /Closed/ }));
    expect(claimsQuery).toHaveBeenLastCalledWith("closed");
  });

  it("an empty open queue answers the question instead of shrugging", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [], counts: { open: 0, closed: 0, all: 0 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(
      screen.getByText(/every delivery so far arrived complete and on time/i),
    ).toBeInTheDocument();
  });

  it("fetches the evidence only when the row is opened", async () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [DAMAGED], counts: { open: 1, closed: 0, all: 1 } }),
    );
    photosQuery.mockImplementation((id: string | null) => ({
      data: id
        ? { photos: [{ path: "PO-2050/a.jpg", url: "https://x/a.jpg" }] }
        : { photos: [] },
      isLoading: false,
      isError: false,
    }));
    render(wrap(<OperationSupplierClaims />));
    expect(photosQuery).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByTestId("claim-photos-SC-1001"));
    await waitFor(() => expect(photosQuery).toHaveBeenLastCalledWith("c1"));
    expect(screen.getByAltText(/Claim evidence/)).toBeInTheDocument();
  });

  it("offers nothing to click on a claim with no photos", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [LATE], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(screen.queryByTestId("claim-photos-SC-1002")).not.toBeInTheDocument();
  });

  it("has no resolve / close control — that is R3's card, not this one", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [DAMAGED], counts: { open: 1, closed: 0, all: 1 } }),
    );
    render(wrap(<OperationSupplierClaims />));
    expect(
      screen.queryByRole("button", { name: /close|resolve|reply/i }),
    ).not.toBeInTheDocument();
  });

  it("never says credit note — claim resolutions are goods actions", () => {
    claimsQuery.mockReturnValue(
      ok({ claims: [DAMAGED, LATE], counts: { open: 2, closed: 0, all: 2 } }),
    );
    const { container } = render(wrap(<OperationSupplierClaims />));
    expect(container.textContent).not.toMatch(/credit note/i);
  });
});
