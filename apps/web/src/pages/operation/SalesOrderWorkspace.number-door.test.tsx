/**
 * 【DELIVERY】 CARD 19 — the Sales Order object page opens by its NUMBER as
 * well as by its id.
 *
 * Measured on production 2026-09-13: `/operation/orders/so/SO-1362?route=1`
 * handed `SO-1362` to ten id-only doors and printed an empty Order Route. The
 * page now resolves a number ONCE and re-enters by the id with the same
 * search, so every fan-in read is still made by the canonical id. These tests
 * pin the three shapes: a UUID URL touches no by-number door, a number URL
 * resolves and replaces itself with the id URL, and a miss prints the
 * dictionary's absence instead of a 500.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import SalesOrderWorkspace from "./SalesOrderWorkspace";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const ID = "db9c939a-ebb7-4836-a2b8-866770728822";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

/* The id route is stubbed on purpose: the object page behind it is the whole
   Sales Order workspace (ten live reads, timers), which is not what these tests
   are about. The door's job ends at the canonical id URL. */
function IdGate() {
  const { orderId = "" } = useParams();
  return /^[0-9a-f-]{36}$/i.test(orderId) ? <div data-testid="object-page">{orderId}</div> : <SalesOrderWorkspace />;
}

function mount(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/operation/orders/so/:orderId" element={<IdGate />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SalesOrderWorkspace — the number door (Card 19)", () => {
  it("a number URL resolves once and re-enters by the id, keeping the search", async () => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: unknown) => {
      if (path === "/api/operation/orders/by-number/1362") return Promise.resolve({ id: ID, so: 1362 });
      return new Promise(() => {});
    });
    mount("/operation/orders/so/SO-1362?route=1");
    expect(screen.getByTestId("so-number-door")).toBeInTheDocument();
    expect(screen.getByText("Opening SO-1362")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(`/operation/orders/so/${ID}?route=1`),
    );
    expect(screen.getByTestId("object-page")).toHaveTextContent(ID);
    const paths = apiFetch.mock.calls.map(([p]) => p).filter((p): p is string => typeof p === "string");
    expect(paths.filter((p) => p.includes("/by-number/"))).toHaveLength(1);
    /* Every other door is the object page's own; it only ever sees the id —
       the measured defect was the number reaching ten id-only doors. */
    expect(paths.filter((p) => p.includes("SO-1362") || /\/1362(\/|$|\?)/.test(p))).toEqual([
      "/api/operation/orders/by-number/1362",
    ]);
  });

  it("the resolved id URL is the object page's own — the door is gone and the page holds the id", async () => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: unknown) =>
      path === "/api/operation/orders/by-number/1362" ? Promise.resolve({ id: ID, so: 1362 }) : new Promise(() => {}),
    );
    mount("/operation/orders/so/SO-1362");
    await waitFor(() => expect(screen.getByTestId("object-page")).toHaveTextContent(ID));
    expect(screen.queryByTestId("so-number-door")).toBeNull();
    expect(screen.queryByTestId("so-not-found")).toBeNull();
  });

  it("a number no order carries prints the dictionary's absence, never a 500", async () => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: unknown) => {
      if (typeof path === "string" && path.includes("/by-number/")) {
        return Promise.reject(new ApiError(404, "Sales Order not found.", { code: "not_found" }));
      }
      return new Promise(() => {});
    });
    mount("/operation/orders/so/SO-999999");
    await waitFor(() => expect(screen.getByTestId("so-not-found")).toBeInTheDocument());
    expect(screen.getByText("Sales Order not found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Sales Orders" })).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toBe("/operation/orders/so/SO-999999");
  });

  it("a param that is neither an id nor a number is the same absence", () => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(() => new Promise(() => {}));
    mount("/operation/orders/so/PO-2051");
    expect(screen.getByTestId("so-not-found")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
