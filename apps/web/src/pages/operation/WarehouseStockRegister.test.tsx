import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import WarehouseStockRegister from "./WarehouseStockRegister";
import type { StockRegisterUnit } from "@carres/shared";

/**
 * THE STOCK REGISTER — CARD-2026-08-20-stock-register §6.
 *
 * These tests are the card's verification list, not a coverage exercise: the
 * destination says Stock, every count derives from the Unit authority, the rail
 * sections combine and clear, ended Units stay out of the default view, and the
 * old `On hand` wording is gone from the operator surface.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

function unit(p: Partial<StockRegisterUnit> & { id: string; unitCode: string }): StockRegisterUnit {
  return {
    sku: "BF03-Jager-K",
    category: "bedframe",
    warehouseId: "wh-klang",
    siteName: "Carres Klang Warehouse",
    holderPartyId: null,
    holderName: null,
    ownership: "carres_owned",
    supplier: "Ohana",
    poNo: "PO/2508-116",
    status: "free",
    condition: "new",
    needsRepair: false,
    holdReason: null,
    reservedRef: null,
    soldOrderId: null,
    qty: 1,
    dateIn: "2026-08-01",
    lastVerifiedAt: null,
    availability: "available",
    lifecycleOutcome: "active",
    lastEventAt: null,
    lastEvent: null,
    ...p,
  };
}

/** available ×2 (one of them a 555-piece bulk record) · reserved ×1 ·
 *  incoming ×1 · ended ×1 · one with no PO. */
const UNITS: StockRegisterUnit[] = [
  unit({ id: "1", unitCode: "id-aaa111111" }),
  unit({ id: "2", unitCode: "id-bbb222222", sku: "Essential Memory Pillow(L)", qty: 555, category: null }),
  unit({ id: "3", unitCode: "id-ccc333333", availability: "reserved", status: "reserved", reservedRef: "SO-1319" }),
  unit({ id: "4", unitCode: "id-ddd444444", availability: "incoming", status: "incoming", poNo: null }),
  unit({ id: "5", unitCode: "id-eee555555", availability: "ended", status: "sold", lifecycleOutcome: "delivered" }),
];

/** The rail is page furniture and paints before the query settles, so every
 *  assertion about a COUNT has to wait for the Units it is counting. */
async function renderLoaded() {
  const r = renderRegister();
  await screen.findByText("id-aaa111111");
  return r;
}

function renderRegister() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation/stock"]}>
        <WarehouseStockRegister />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.startsWith("/api/ops/stock/register")) {
      return Promise.resolve({ units: UNITS, total: UNITS.length });
    }
    return Promise.resolve({});
  });
  window.localStorage.clear();
});

describe("the destination is Stock", () => {
  it("names the page Stock, and the old On hand wording is gone", async () => {
    renderRegister();
    const header = await screen.findByTestId("stock-register-destination-header");
    expect(within(header).getByText("Stock")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Jump to" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Alerts" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Help" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Settings" })).toHaveLength(1);
    expect(screen.queryByText(/On hand/i)).not.toBeInTheDocument();
  });

  it("reads the Unit authority endpoint, never a stored total", async () => {
    renderRegister();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const paths = apiFetchMock.mock.calls.map((c) => String(c[0]));
    expect(paths.some((p) => p.startsWith("/api/ops/stock/register"))).toBe(true);
    // stock_balances is a non-authoritative cache since 0366 and must not be
    // reachable from this page by any route.
    expect(paths.some((p) => p.includes("balance"))).toBe(false);
  });
});

describe("the default view is current Units (Card §1)", () => {
  it("lists current Units and leaves the delivered one out", async () => {
    renderRegister();
    expect(await screen.findByText("id-aaa111111")).toBeInTheDocument();
    expect(screen.queryByText("id-eee555555")).not.toBeInTheDocument();
  });

  it("offers Delivered / history as its own destination, with a truthful count", async () => {
    await renderLoaded();
    const history = screen.getByTestId("rail-history");
    expect(within(history).getByText("Delivered / history")).toBeInTheDocument();
    expect(within(history).getByText("1")).toBeInTheDocument();
  });
});

describe("every number derives from the Unit authority (Card §6)", () => {
  it("the footer separates what can be promised from what cannot", async () => {
    renderRegister();
    // 4 current Units; 1 bindable exact Unit; 555 bulk pieces that no Sales
    // Order can name, because 0366 forbids a qty > 1 record being reserved.
    expect(
      await screen.findByText("4 Units · 1 you can promise · 555 pieces you cannot"),
    ).toBeInTheDocument();
  });

  it("warns on the row itself that a bulk record is not one promisable Unit", async () => {
    renderRegister();
    expect(
      await screen.findByText(/555 pieces in one record — cannot be promised individually/),
    ).toBeInTheDocument();
  });

  it("shows Reserved / sold as the operator's word for a bound Unit", async () => {
    renderRegister();
    await screen.findByText("id-ccc333333");
    expect(screen.getAllByText("Reserved / sold").length).toBeGreaterThan(0);
  });
});

describe("the rail filters the same authority (Card §3)", () => {
  it("uses the shared readable rail and can give its width back to the register", async () => {
    await renderLoaded();
    const rail = screen.getByTestId("stock-rail");
    expect(rail).toHaveClass("w-[240px]", "shrink-0", "border-r", "p-3");
    expect(screen.getByTestId("register-column")).toHaveClass("min-w-0");

    fireEvent.click(within(rail).getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("stock-rail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    expect(screen.getByTestId("stock-rail")).toBeInTheDocument();
  });

  it("narrows to one availability and the footer follows", async () => {
    await renderLoaded();
    const rail = screen.getByTestId("stock-rail");
    fireEvent.click(within(rail).getByRole("button", { name: /^Incoming/ }));
    await waitFor(() => expect(screen.queryByText("id-aaa111111")).not.toBeInTheDocument());
    expect(screen.getByText("id-ddd444444")).toBeInTheDocument();
  });

  it("All stock clears every filter", async () => {
    await renderLoaded();
    const rail = screen.getByTestId("stock-rail");
    fireEvent.click(within(rail).getByRole("button", { name: /^Incoming/ }));
    await waitFor(() => expect(screen.queryByText("id-aaa111111")).not.toBeInTheDocument());
    fireEvent.click(within(rail).getByTestId("rail-all-stock"));
    expect(await screen.findByText("id-aaa111111")).toBeInTheDocument();
  });

  it("keeps an honest Not in catalog bucket, and never calls it Accessory", async () => {
    await renderLoaded();
    const rail = screen.getByTestId("stock-rail");
    expect(within(rail).getByRole("button", { name: /Not in catalog/ })).toBeInTheDocument();
    expect(within(rail).queryByRole("button", { name: /^Accessory/ })).not.toBeInTheDocument();
  });

  it("says plainly that nothing has moved yet rather than showing a broken filter", async () => {
    await renderLoaded();
    const rail = screen.getByTestId("stock-rail");
    expect(within(rail).getByText(/No Unit has moved yet/)).toBeInTheDocument();
  });

  it("draws no Where or Ownership section when there is only one value to choose", async () => {
    await renderLoaded();
    const rail = screen.getByTestId("stock-rail");
    // A filter offering one choice is not a filter (03-page-patterns.md:149).
    expect(within(rail).queryByText("Where")).not.toBeInTheDocument();
    expect(within(rail).queryByText("Ownership")).not.toBeInTheDocument();
  });
});

describe("a failed authority read never becomes stock facts", () => {
  it("shows one problem action and suppresses every zero-derived rail claim", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/ops/stock/register")) {
        return Promise.reject(new Error("missing site_name"));
      }
      return Promise.resolve({});
    });
    renderRegister();

    expect(await screen.findByText("Stock could not be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByTestId("stock-rail")).not.toBeInTheDocument();
    expect(screen.queryByText(/All stock\s*0/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing needs attention")).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-toolbar")).not.toBeInTheDocument();
  });
});

describe("Stock exposes no second door onto the register (Card §2, Stock MASTER §4)", () => {
  it("has no reservation, edit, delete, add-stock or status control anywhere", async () => {
    renderRegister();
    await screen.findByText("id-aaa111111");
    for (const banned of [
      /^Reserve$/i, /^Release$/i, /^Edit$/i, /^Delete$/i,
      /Add stock/i, /Remove stock/i, /Adjust/i, /Mark done/i,
      /Review/i, /Follow up/i, /Next Action/i,
    ]) {
      expect(screen.queryByRole("button", { name: banned })).not.toBeInTheDocument();
    }
  });
});
