import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import WarehouseStockRegister from "./WarehouseStockRegister";
import type { StockRegisterUnit } from "@carres/shared";

/**
 * THE STOCK REGISTER — CARD-2026-08-20-stock-register §6.
 *
 * These tests are the card's verification list, not a coverage exercise: the
 * destination says Inventory, every count derives from the Unit authority, the rail
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

function renderRegister(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
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

describe("an unavailable source is never zero stock", () => {
  function expectNoStockClaims() {
    expect(within(screen.getByTestId("rail-all-stock")).queryByText(/^\d+$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing needs checking")).not.toBeInTheDocument();
    expect(screen.queryByText(/No Unit has moved yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No Units yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/you can promise/)).not.toBeInTheDocument();
  }

  it("waits for the source before showing counts or empty claims", () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}));
    renderRegister();
    expectNoStockClaims();
  });

  it("does not call an initial offline request empty stock", () => {
    onlineManager.setOnline(false);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderRegister(qc);
    try {
      expectNoStockClaims();
    } finally {
      view.unmount();
      qc.clear();
      onlineManager.setOnline(true);
    }
  });

  it("shows the failure and retries into real Unit counts", async () => {
    apiFetchMock.mockImplementation((path: string) => path.startsWith("/api/ops/stock/register")
      ? Promise.reject(new Error("column stock_unit_register_v.site_name does not exist"))
      : Promise.resolve({}));
    renderRegister();
    await screen.findByText("Stock could not be loaded");
    expectNoStockClaims();
    apiFetchMock.mockImplementation((path: string) => Promise.resolve(path.startsWith("/api/ops/stock/register")
      ? { units: UNITS, total: UNITS.length } : {}));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("id-aaa111111");
    expect(within(screen.getByTestId("rail-all-stock")).getByText("4")).toBeInTheDocument();
  });

  it("withdraws cached counts when a refresh fails", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderRegister(qc);
    await screen.findByText("id-aaa111111");
    apiFetchMock.mockRejectedValue(new Error("Stock request failed"));
    await qc.invalidateQueries({ queryKey: ["operation", "stock-register"] });
    await screen.findByText("Stock could not be loaded");
    expectNoStockClaims();
    expect(screen.queryByText("id-aaa111111")).not.toBeInTheDocument();
  });

  it("shows zero only after a successful empty response", async () => {
    apiFetchMock.mockResolvedValue({ units: [], total: 0 });
    renderRegister();
    await screen.findByText(/No Units yet/);
    expect(within(screen.getByTestId("rail-all-stock")).getByText("0")).toBeInTheDocument();
    expect(within(screen.getByTestId("rail-checking")).getByText("0")).toBeInTheDocument();
  });
});

describe("the destination is Inventory", () => {
  /* Owner-approved Blueprint 2026-09-01 (Stock MASTER §2): the Warehouse
   * master Register is `Inventory`; `Stock` and `On hand` are gone as the
   * page word. CARD-2026-09-01-warehouse-01-sidebar. */
  it("names the page Inventory, and the old Stock / On hand wording is gone", async () => {
    renderRegister();
    const header = await screen.findByTestId("stock-register-destination-header");
    expect(within(header).getByText("Inventory")).toBeInTheDocument();
    expect(within(header).queryByText(/^Stock$/)).not.toBeInTheDocument();
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

  it("uses the approved 240px rail without a Calendar or date strip", async () => {
    await renderLoaded();
    const rail = screen.getByTestId("stock-rail");
    expect(rail.className).toContain("w-[240px]");
    expect(screen.queryByTestId("warehouse-date-strip")).not.toBeInTheDocument();
  });

  it("names holders, ownership and Sites from the governed records", async () => {
    await renderLoaded();
    const rail = screen.getByTestId("stock-rail");
    expect(within(rail).getByText("Who has it")).toBeInTheDocument();
    expect(within(rail).getByText("Ownership")).toBeInTheDocument();
    expect(within(rail).getByText("Carres Klang Warehouse")).toBeInTheDocument();
    expect(within(rail).queryByText("NETS Warehouse")).not.toBeInTheDocument();
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


describe("Inventory saved views", () => {
  it("Service Case uses purchase purpose, independently of product category", async () => {
    apiFetchMock.mockResolvedValue({ units: [
      unit({ id: "service", unitCode: "id-service", purchasePurpose: "service_case", category: "sofa" }),
      unit({ id: "catalog", unitCode: "id-catalog", category: "service", purchasePurpose: "ready_stock" }),
    ], total: 2 });
    renderRegister();
    await screen.findByText("id-service");
    fireEvent.click(screen.getByTestId("rail-service"));
    expect(screen.getByText("id-service")).toBeInTheDocument();
    expect(screen.queryByText("id-catalog")).not.toBeInTheDocument();
  });
  it("finds a product by its human name after the rail filters the same Units", async () => {
    apiFetchMock.mockResolvedValue({ units: [
      unit({ id: "dream", unitCode: "id-dream", productName: "Dream · King" }),
      unit({ id: "other", unitCode: "id-other", productName: "Cloud · Queen" }),
    ], total: 2 });
    renderRegister();
    await screen.findByText("Dream · King");
    fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
    fireEvent.change(screen.getByPlaceholderText("Unit ID, product, PO, SO or supplier…"), { target: { value: "dream" } });
    await waitFor(() => expect(screen.queryByText("id-other")).not.toBeInTheDocument());
    expect(screen.getByText("id-dream")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("id-other")).toBeInTheDocument();
  });
  it("Ready Stock lists exact eligible Units and excludes the bulk record", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId("rail-ready"));
    expect(screen.getByText("id-aaa111111")).toBeInTheDocument();
    expect(screen.queryByText("id-bbb222222")).not.toBeInTheDocument();
    expect(screen.queryByText("id-ccc333333")).not.toBeInTheDocument();
  });
  it("Reserved for Sales Orders shows the bound Unit", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId("rail-reserved"));
    expect(screen.getByText("id-ccc333333")).toBeInTheDocument();
    expect(screen.queryByText("id-aaa111111")).not.toBeInTheDocument();
  });
  it("can hide and restore the filters without losing the selected view", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId("rail-ready"));
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("stock-rail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    expect(screen.getByTestId("rail-ready")).toHaveAttribute("aria-pressed", "true");
  });
  it("shows source dates and human product names supplied by their owners", async () => {
    apiFetchMock.mockImplementation((path: string) => Promise.resolve(path.startsWith("/api/ops/stock/register")
      ? { units: [unit({ id: "source", unitCode: "id-source", productName: "Dream · King", poDate: "2026-08-01", soDate: "2026-08-02", expectedArrival: "2026-09-09" })], total: 1 } : {}));
    renderRegister();
    expect(await screen.findByText("Dream · King")).toBeInTheDocument();
    for (const label of ["Stock use", "Site", "Condition", "SO No", "SO date", "PO No", "PO date", "Expected arrival", "Last verified"]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });
});
