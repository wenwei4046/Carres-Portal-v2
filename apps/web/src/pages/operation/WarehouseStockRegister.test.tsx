import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import WarehouseStockRegister from "./WarehouseStockRegister";
import type { StockRegisterUnit } from "@carres/shared";

/**
 * INVENTORY — Stock MASTER §7, owner rulings 2026-09-25.
 *
 * The default list is what Carres physically holds; Incoming is a rail row and
 * a footer fact. Eleven single-line columns carry dictionary words only; the
 * retired words (`Who has it` · `Where` · `Stock use` · `Not available` ·
 * `Reserved / sold` · `In transit` · `With NETS Delivery`) never reach the
 * operator. Every count derives from the Unit authority.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

function unit(p: Partial<StockRegisterUnit> & { id: string; unitCode: string }): StockRegisterUnit {
  return {
    identityScope: "unit",
    sku: "CODY-K",
    category: "bedframe",
    productName: "Cody · King",
    warehouseId: "wh-klang",
    siteName: "Carres Klang",
    holderPartyId: null,
    holderName: null,
    ownership: "carres_owned",
    supplier: "Hookka Industries",
    poNo: "PO260924-4827",
    status: "free",
    condition: "new",
    needsRepair: false,
    holdReason: null,
    reservedRef: null,
    soldOrderId: null,
    qty: 1,
    dateIn: "2026-09-25",
    goodsReceivedDate: "2026-09-25",
    lastVerifiedAt: null,
    availability: "available",
    lifecycleOutcome: "active",
    lastEventAt: null,
    lastEvent: null,
    ...p,
  };
}

/** available ×2 (one a 319-piece counted row) · reserved ×1 · cannot sell ×1 ·
 *  on the road ×1 · incoming ×1 · ended ×1. */
const UNITS: StockRegisterUnit[] = [
  unit({ id: "1", unitCode: "U1-000-084" }),
  unit({ id: "2", unitCode: "QTY-000000001", identityScope: "quantity", sku: "MATTRESS-PROTECTOR-Q", productName: "Mattress Protector · Q", category: "accessory", qty: 319, poNo: null }),
  unit({ id: "3", unitCode: "U1-000-082", sku: "JAGER-SS", productName: "Jager · Super Single", availability: "reserved", status: "reserved", reservedRef: "SO2609-4827", soldOrderId: "order-1", soDate: "2026-09-22" }),
  unit({ id: "4", unitCode: "U1-000-065", sku: "FENRIR-Q", productName: "Fenrir · Queen", availability: "not_available", status: "free", condition: "damaged" }),
  unit({ id: "5", unitCode: "U1-000-071", sku: "5539-2A(RHF)", productName: "Booqit · 2A(RHF)", category: "sofa", availability: "in_transit", status: "transferred", shipDate: "2026-09-26", pickupBy: "AL", deliveryLocation: "AL Sungai Buloh" }),
  unit({ id: "6", unitCode: "U1-000-091", sku: "B1201S-K", productName: "Breeze SoftCloud · King", category: "mattress", availability: "incoming", status: "incoming", goodsReceivedDate: null }),
  unit({ id: "7", unitCode: "U1-000-010", availability: "ended", status: "sold", lifecycleOutcome: "delivered" }),
];

async function renderLoaded() {
  const r = renderRegister();
  await screen.findByText("U1-000-084");
  return r;
}

function renderRegister(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=stock-onhand"]}>
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
    expect(screen.queryByText(/No stock in Carres control/)).not.toBeInTheDocument();
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

  it("shows the failure and retries into real counts", async () => {
    apiFetchMock.mockImplementation((path: string) => path.startsWith("/api/ops/stock/register")
      ? Promise.reject(new Error("boom")) : Promise.resolve({}));
    renderRegister();
    await screen.findByText("Stock could not be loaded");
    apiFetchMock.mockImplementation(() => Promise.resolve({ units: UNITS, total: UNITS.length }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("U1-000-084");
    expect(within(screen.getByTestId("rail-all-stock")).getByText("5")).toBeInTheDocument();
  });
});

describe("the default list is what Carres holds", () => {
  it("names the page Inventory and keeps the Request Transfer door", async () => {
    await renderLoaded();
    expect(screen.getByTestId("stock-register-destination-header")).toHaveTextContent("Inventory");
    expect(screen.getByRole("link", { name: "Request Transfer" })).toBeInTheDocument();
  });

  it("reads the Unit authority endpoint, never a stored total", async () => {
    await renderLoaded();
    const paths = apiFetchMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/api/ops/stock/register");
    expect(paths.some((p: string) => /balances|onhand|stock-summary/.test(p))).toBe(false);
  });

  it("leaves Incoming and delivered Units out, and counts the goods still to arrive in the footer", async () => {
    await renderLoaded();
    expect(screen.queryByText("U1-000-091")).not.toBeInTheDocument();
    expect(screen.queryByText("U1-000-010")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("rail-all-stock")).getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/1 still to arrive · see Inbound/)).toBeInTheDocument();
    expect(screen.getByText(/5 records · 1 you can promise · 319 pieces you cannot/)).toBeInTheDocument();
  });

  it("Incoming is its own rail row that lists the goods not yet received", async () => {
    await renderLoaded();
    const row = screen.getByTestId("rail-status-incoming");
    expect(within(row).getByText("1")).toBeInTheDocument();
    fireEvent.click(row);
    await screen.findByText("U1-000-091");
    expect(screen.queryByText("U1-000-084")).not.toBeInTheDocument();
    expect(screen.queryByText(/still to arrive/)).not.toBeInTheDocument();
  });

  it("History is the Control group's own row with a truthful count", async () => {
    await renderLoaded();
    const row = screen.getByTestId("rail-history");
    expect(within(row).getByText("1")).toBeInTheDocument();
    fireEvent.click(row);
    await screen.findByText("U1-000-010");
    expect(within(screen.getByText("U1-000-010").closest("tr")!).getByText("Delivered")).toBeInTheDocument();
  });
});

describe("one row is one Unit, one cell is one fact", () => {
  it("prints the eleven heads in the owner's order and no retired head", async () => {
    await renderLoaded();
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim() ?? "");
    const order = ["Goods Received Date", "Ship Date", "SO No", "Inventory Status", "Stock Condition", "PO No / Ref No", "Unit ID", "Item", "Pickup By", "Stock Location", "Delivery Location"];
    const seen = heads.filter((h) => order.includes(h));
    expect(seen).toEqual(order);
    for (const retired of ["Who has it", "Site / stock use", "Stock use", "Orders / dates", "Product", "Where", "Handed over"]) {
      expect(heads).not.toContain(retired);
    }
  });

  it("prints Inventory Status and Stock Condition with the ruled words only", async () => {
    await renderLoaded();
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reserved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cannot sell").length).toBeGreaterThan(0);
    expect(screen.getByText("Damaged")).toBeInTheDocument();
    expect(screen.queryByText(/Reserved \/ sold/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not available/)).not.toBeInTheDocument();
    expect(screen.queryByText(/In transit/)).not.toBeInTheDocument();
    expect(screen.queryByText(/With NETS Delivery/)).not.toBeInTheDocument();
  });

  it("shows the road as Ship Date · Pickup By · Delivery Location while Stock Location stays the Site", async () => {
    await renderLoaded();
    const row = screen.getByText("U1-000-071").closest("tr")!;
    expect(within(row).getByText("AL")).toBeInTheDocument();
    expect(within(row).getByText("AL Sungai Buloh")).toBeInTheDocument();
    expect(within(row).getByText("Carres Klang")).toBeInTheDocument();
    expect(within(row).getByText("Available")).toBeInTheDocument();
  });

  it("a counted row prints — for Unit ID and ×{qty} on the item, and no arrow to expand", async () => {
    await renderLoaded();
    const row = screen.getByText(/Mattress Protector · Q · MATTRESS-PROTECTOR-Q ×319/).closest("tr")!;
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show every product/ })).not.toBeInTheDocument();
  });

  it("stands the newest Goods Received Date first at rest, whatever order the source sent", async () => {
    // Production 2026-09-26: the source answers in Unit ID order, so the owner's
    // fresh 25 Sep goods sat behind 300 older rows. The date leads, newest first.
    apiFetchMock.mockImplementation(() =>
      Promise.resolve({
        units: [
          unit({ id: "old", unitCode: "U1-000-001", goodsReceivedDate: "2026-06-08" }),
          unit({ id: "new", unitCode: "U1-000-300", goodsReceivedDate: "2026-09-25" }),
          unit({ id: "mid", unitCode: "U1-000-200", goodsReceivedDate: "2026-08-20" }),
        ],
        total: 3,
      }),
    );
    renderRegister();
    await screen.findByText("U1-000-300");
    const codes = screen.getAllByText(/^U1-000-\d{3}$/).map((el) => el.textContent);
    expect(codes).toEqual(["U1-000-300", "U1-000-200", "U1-000-001"]);
  });

  it("uses the ruled absence words: No SO · Not received · Not recorded", async () => {
    await renderLoaded();
    expect(screen.getAllByText("No SO").length).toBeGreaterThan(0);
    const counted = screen.getByText(/MATTRESS-PROTECTOR-Q ×319/).closest("tr")!;
    expect(within(counted).getByText("Not recorded")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rail-status-incoming"));
    const incoming = (await screen.findByText("U1-000-091")).closest("tr")!;
    expect(within(incoming).getByText("Not received")).toBeInTheDocument();
  });

  it("an SO No opens the Sales Order only when the order exists in this portal", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: "SO2609-4827" })).toBeInTheDocument();
  });
});

describe("the rail is STOCK · CATEGORY · OWNERSHIP · CONTROL", () => {
  it("has no Who has it, Site or Coming soon rows", async () => {
    await renderLoaded();
    const rail = screen.getByTestId("stock-rail");
    expect(within(rail).queryByText(/Who has it/)).not.toBeInTheDocument();
    expect(within(rail).queryByText(/Coming soon/)).not.toBeInTheDocument();
    expect(within(rail).queryByText(/Needs checking/)).not.toBeInTheDocument();
    expect(within(rail).getByText("Category")).toBeInTheDocument();
    expect(within(rail).getByText("Ownership")).toBeInTheDocument();
    expect(within(rail).getByText("Control")).toBeInTheDocument();
  });

  it("Category counts the held goods from the Catalog's answer", async () => {
    await renderLoaded();
    expect(within(screen.getByTestId("rail-category-bedframe")).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByTestId("rail-category-sofa")).getByText("1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rail-category-sofa"));
    await waitFor(() => expect(screen.queryByText("U1-000-084")).not.toBeInTheDocument());
    expect(screen.getByText("U1-000-071")).toBeInTheDocument();
  });

  it("Ready Stock lists exact Available Units and excludes the counted row", async () => {
    await renderLoaded();
    expect(within(screen.getByTestId("rail-ready")).getByText("1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rail-ready"));
    await waitFor(() => expect(screen.queryByText(/MATTRESS-PROTECTOR-Q/)).not.toBeInTheDocument());
    expect(screen.getByText("U1-000-084")).toBeInTheDocument();
  });

  it("All stock clears every filter", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId("rail-status-cannot-sell"));
    await waitFor(() => expect(screen.queryByText("U1-000-084")).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId("rail-all-stock"));
    await screen.findByText("U1-000-084");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("has no reservation, edit, delete, add-stock or status control anywhere", async () => {
    await renderLoaded();
    for (const word of [/^reserve$/i, /^release$/i, /^edit$/i, /^delete$/i, /add stock/i, /mark done/i, /make available/i]) {
      expect(screen.queryByRole("button", { name: word })).not.toBeInTheDocument();
    }
  });
});

it("returns from a Unit without losing the register, search, rail or scroll", async () => {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/ops/stock/register/")) {
      return Promise.resolve({ unit: UNITS[0], events: [] });
    }
    if (path.startsWith("/api/ops/stock/register")) return Promise.resolve({ units: UNITS, total: UNITS.length });
    return Promise.resolve({ evidence: [] });
  });
  await renderLoaded();
  fireEvent.click(screen.getByTestId("rail-category-bedframe"));
  fireEvent.click(screen.getByRole("link", { name: "U1-000-084" }));
  await screen.findByTestId("stock-unit-detail");
  fireEvent.click(screen.getByRole("button", { name: "← Inventory" }));
  await waitFor(() => expect(screen.queryByTestId("stock-unit-detail")).not.toBeInTheDocument());
  expect(screen.getByText("U1-000-084")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
});
