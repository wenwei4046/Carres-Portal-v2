/**
 * PrincipalNewOrder — the single-page RAW key-in form (Loo 2026-07-18, the
 * 2990s Backend "New Sales Order" shape — NOT the POS wizard).
 *
 * What matters here:
 *  1. Line rows are pick-or-type comboboxes: picking an item fills the row
 *     DIRECTLY — it NEVER jumps into the product-option page (Loo
 *     2026-07-18). Specs stay optional via the row's ✎; free text stays a
 *     custom "OTHERS" line; prices stay editable.
 *  2. Nothing gates: dealer + customer name + ≥1 keyed line is ALL the form
 *     requires — dates optional (past OK, empty = TBD), payment optional.
 *  3. Submit maps the whole form onto RawCreateOrderInput (attrs, structured
 *     address, custom fields) for POST /api/orders/raw.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse, Order } from "@carres/shared";
import PrincipalNewOrder from "./PrincipalNewOrder";

const DEALER_ID = "00000000-0000-0000-0000-0000000000d1";

const { mockRawCreate, mockHooks } = vi.hoisted(() => {
  const mockRawCreate = vi.fn();
  return {
    mockRawCreate,
    mockHooks: {
      usePrincipalDealers: vi.fn(),
      useOutlets: vi.fn(),
      useSalespersons: vi.fn(),
      useCatalog: vi.fn(),
      useRawCreateOrder: vi.fn(() => ({ mutateAsync: mockRawCreate, isPending: false })),
    },
  };
});

vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  ...mockHooks,
}));

function catalog(): CatalogResponse {
  return {
    models: [
      {
        id: "m-mat",
        category: "mattress",
        modelKey: "cloud",
        name: "Carres Cloud",
        blurb: null,
        colors: null,
        gaps: null,
        sofaMode: null,
      },
      {
        id: "m-svc",
        category: "service",
        modelKey: "service-addons",
        name: "Services",
        blurb: null,
        colors: null,
        gaps: null,
        sofaMode: null,
      },
      {
        id: "m-sofa",
        category: "sofa",
        modelKey: "booqit",
        name: "Booqit",
        blurb: null,
        colors: null,
        gaps: null,
        sofaMode: "preset",
        allowedOptions: { fabrics: ["CG-001"] },
      },
    ],
    skus: [
      {
        id: "s1",
        modelId: "m-mat",
        sku: "CLOUD-QUEEN",
        variant: "Queen",
        variantKind: "size",
        price: 2890,
        cost: null,
        supplierId: null,
      },
      {
        id: "s2",
        modelId: "m-mat",
        sku: "CLOUD-KING",
        variant: "King",
        variantKind: "size",
        price: 3490,
        cost: null,
        supplierId: null,
        posActive: false,
      },
      {
        id: "s3",
        modelId: "m-svc",
        sku: "SVC-ASSEMBLY",
        variant: "Assembly",
        variantKind: "size",
        price: 120,
        cost: null,
        supplierId: null,
      },
      {
        id: "s4",
        modelId: "m-sofa",
        sku: "5539-L(RHF)",
        variant: "L(RHF)",
        variantKind: "preset",
        price: 2000,
        cost: null,
        supplierId: null,
        pricesBySize: { '24"': 2000, '26"': 2100 },
      },
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    // Maintenance pools + master fabrics — the inline row-variants sources.
    optionPools: [
      { id: "p1", pool: "sofa_size", value: '24"', active: true, sortOrder: 1 },
      { id: "p2", pool: "sofa_size", value: '26"', active: true, sortOrder: 2 },
      { id: "p3", pool: "sofa_leg_height", value: '6"', surcharge: 30, active: true, sortOrder: 1 },
    ],
    fabrics: [
      {
        id: "f1",
        fabricCode: "CG-001",
        description: "CG-001 Pearl",
        series: "CG",
        active: true,
        sofaTier: "PRICE_1",
        bedframeTier: "PRICE_1",
      },
    ],
  } as unknown as CatalogResponse;
}

function setHookDefaults() {
  mockHooks.usePrincipalDealers.mockReturnValue({
    data: { dealers: [{ id: DEALER_ID, name: "Dealer One", status: "active" }] },
    isLoading: false,
  });
  mockHooks.useOutlets.mockReturnValue({
    data: { outlets: [{ id: "o1", dealerId: DEALER_ID, name: "Outlet One" }] },
  });
  mockHooks.useSalespersons.mockReturnValue({
    data: {
      salespersons: [{ id: "sp1", dealerId: DEALER_ID, outletId: "o1", name: "SP One" }],
    },
  });
  mockHooks.useCatalog.mockReturnValue({ data: catalog(), error: null });
  mockHooks.useRawCreateOrder.mockReturnValue({
    mutateAsync: mockRawCreate,
    isPending: false,
  });
}

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PrincipalNewOrder />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The first (auto-seeded) row's sku combobox input. */
function firstSkuInput() {
  return screen.getAllByLabelText("Product SKU or description")[0]!;
}

beforeEach(() => {
  sessionStorage.clear();
  setHookDefaults();
});
afterEach(() => {
  cleanup();
  mockRawCreate.mockReset();
});

describe("PrincipalNewOrder — single-page raw form", () => {
  it("renders every section on ONE page (no wizard steps)", () => {
    wrap();
    expect(screen.getByText("Sale info")).toBeTruthy();
    expect(screen.getByText("Customer")).toBeTruthy();
    expect(screen.getByText("Order info")).toBeTruthy();
    expect(screen.getByText("Emergency contact")).toBeTruthy();
    expect(screen.getByText("Delivery address")).toBeTruthy();
    expect(screen.getByText(/^Line items/)).toBeTruthy();
    expect(screen.getByText("Payment")).toBeTruthy();
    expect(screen.getByTestId("raw-submit")).toBeTruthy();
  });

  it("row combobox: picking an item fills the row DIRECTLY — never jumps into the product-option page", () => {
    wrap();
    fireEvent.focus(firstSkuInput());
    fireEvent.change(firstSkuInput(), { target: { value: "cloud" } });
    // Deactivated skus surface too (raw path reaches the full admin bundle).
    expect(screen.getByTestId("raw-pick-CLOUD-KING").textContent).toContain("POS off");

    fireEvent.mouseDown(screen.getByTestId("raw-pick-CLOUD-QUEEN"));
    // NO configurator opened — the row is filled in place at catalog price.
    expect(screen.queryByTestId("pos-configure-page")).toBeNull();
    expect((firstSkuInput() as HTMLInputElement).value).toBe("CLOUD-QUEEN");
    expect(screen.getByText("Carres Cloud · Queen")).toBeTruthy();
    expect(screen.getAllByText("RM 2,890.00").length).toBeGreaterThan(0);
  });

  it("specs stay OPTIONAL: the row's ✎ opens the product configurator prefilled and writes back", () => {
    wrap();
    fireEvent.focus(firstSkuInput());
    fireEvent.change(firstSkuInput(), { target: { value: "queen" } });
    fireEvent.mouseDown(screen.getByTestId("raw-pick-CLOUD-QUEEN"));

    // ✎ is there (bed/mattress line) but nothing opened on its own.
    expect(screen.queryByTestId("pos-configure-page")).toBeNull();
    fireEvent.click(screen.getAllByLabelText("Edit specs")[0]!);
    // The configurator opens PREFILLED from the row (Queen · RM 2,890).
    expect(screen.getByTestId("pos-configure-page")).toBeTruthy();
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("2,890");
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    expect(screen.queryByTestId("pos-configure-page")).toBeNull();
    expect((firstSkuInput() as HTMLInputElement).value).toBe("CLOUD-QUEEN");
  });

  it("a sofa pick brings its VARIANTS out under the row — seat height / fabric / leg height reprice inline", () => {
    wrap();
    fireEvent.focus(firstSkuInput());
    fireEvent.change(firstSkuInput(), { target: { value: "5539" } });
    fireEvent.mouseDown(screen.getByTestId("raw-pick-5539-L(RHF)"));
    // No page jump — the options came OUT under the row instead.
    expect(screen.queryByTestId("pos-configure-page")).toBeNull();
    const seat = screen.getByLabelText("Seat height");
    const fabric = screen.getByLabelText("Fabric");
    const leg = screen.getByLabelText("Leg height");
    expect(seat).toBeTruthy();
    expect(fabric).toBeTruthy();
    expect(leg).toBeTruthy();

    // Leg 6" carries a +RM30 pool surcharge → suggested price re-derives.
    fireEvent.change(leg, { target: { value: '6"' } });
    expect(screen.getAllByText("RM 2,030.00").length).toBeGreaterThan(0);
    // Seat height 26" reads the sku's per-size price (2100) + leg 30.
    fireEvent.change(seat, { target: { value: '26"' } });
    expect(screen.getAllByText("RM 2,130.00").length).toBeGreaterThan(0);
    // Modular-ticked master fabric is offered; PRICE_1 adds nothing.
    fireEvent.change(fabric, { target: { value: "cf:CG-001" } });
    expect((fabric as HTMLSelectElement).value).toBe("cf:CG-001");
    expect(screen.getAllByText("RM 2,130.00").length).toBeGreaterThan(0);
  });

  it("prices stay editable after a pick (raw override)", () => {
    wrap();
    fireEvent.focus(firstSkuInput());
    fireEvent.change(firstSkuInput(), { target: { value: "queen" } });
    fireEvent.mouseDown(screen.getByTestId("raw-pick-CLOUD-QUEEN"));

    fireEvent.change(screen.getAllByLabelText("Unit price (RM)")[0]!, {
      target: { value: "1000" },
    });
    // Line total + Subtotal + footer Total all show the overridden figure.
    expect(screen.getAllByText("RM 1,000.00").length).toBeGreaterThan(0);
  });

  it("a service sku fills the row directly — no configurator hop", () => {
    wrap();
    fireEvent.focus(firstSkuInput());
    fireEvent.change(firstSkuInput(), { target: { value: "svc" } });
    fireEvent.mouseDown(screen.getByTestId("raw-pick-SVC-ASSEMBLY"));
    expect(screen.queryByTestId("pos-configure-page")).toBeNull();
    expect((firstSkuInput() as HTMLInputElement).value).toBe("SVC-ASSEMBLY");
    expect(screen.getByText("Services · Assembly")).toBeTruthy();
  });

  it("free text stays a custom OTHERS line and can submit", async () => {
    mockRawCreate.mockResolvedValue({
      id: "o-raw-1",
      so: 1301,
      customer: { name: "Raw Customer" },
      lines: [{ id: "ol1" }],
    } as unknown as Order);
    wrap();
    fireEvent.change(screen.getByTestId("raw-dealer"), { target: { value: DEALER_ID } });
    fireEvent.change(screen.getByTestId("raw-customer-name"), {
      target: { value: "Raw Customer" },
    });
    fireEvent.change(firstSkuInput(), { target: { value: "CUSTOM DELIVERY SURCHARGE" } });
    expect(screen.getByText(/OTHERS · custom line/)).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText("Unit price (RM)")[0]!, {
      target: { value: "150.5" },
    });

    fireEvent.click(screen.getByTestId("raw-submit"));
    await screen.findByText("Order SO-1301 created");
    const input = mockRawCreate.mock.calls[0][0];
    expect(input.lines).toEqual([
      { sku: "CUSTOM DELIVERY SURCHARGE", qty: 1, unitPrice: 150.5, attrs: null },
    ]);
  });

  it("nothing gates beyond dealer + name + one line: dates/payment empty submit as TBD/nulls; remarks + attrs ride", async () => {
    mockRawCreate.mockResolvedValue({
      id: "o-raw-2",
      so: 1302,
      customer: { name: "Raw Customer" },
      lines: [{ id: "ol1" }],
    } as unknown as Order);
    wrap();

    // Submit disabled until the three raw floors are met.
    expect(screen.getByTestId("raw-submit")).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByTestId("raw-dealer"), { target: { value: DEALER_ID } });
    fireEvent.change(screen.getByTestId("raw-customer-name"), {
      target: { value: "Raw Customer" },
    });
    // Pick a catalog line — fills in place, no configurator.
    fireEvent.focus(firstSkuInput());
    fireEvent.change(firstSkuInput(), { target: { value: "queen" } });
    fireEvent.mouseDown(screen.getByTestId("raw-pick-CLOUD-QUEEN"));
    // Row remark → attrs.remark.
    fireEvent.change(screen.getAllByLabelText("Line remarks")[0]!, {
      target: { value: "backfill from AutoCount" },
    });
    // A PAST delivery date — the raw path accepts it untouched.
    fireEvent.change(screen.getByTestId("raw-delivery-date"), {
      target: { value: "2024-01-15" },
    });
    fireEvent.change(screen.getByTestId("raw-paid"), { target: { value: "500" } });

    expect(screen.getByTestId("raw-submit")).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByTestId("raw-submit"));
    await screen.findByText("Order SO-1302 created");

    const input = mockRawCreate.mock.calls[0][0];
    expect(input.dealerId).toBe(DEALER_ID);
    expect(input.customer.name).toBe("Raw Customer");
    expect(input.deliveryDate).toBe("2024-01-15"); // past date, saved as entered
    expect(input.proceedDate).toBeNull();
    expect(input.paymentMethod).toBeNull(); // payment optional
    expect(input.paid).toBe(500);
    expect(input.lines).toEqual([
      {
        sku: "CLOUD-QUEEN",
        qty: 1,
        unitPrice: 2890,
        attrs: { remark: "backfill from AutoCount" },
      },
    ]);
  });
});
