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
import { RAW_DRAFT_STORAGE_KEY, emptyDraft } from "../dealer/new-order/draft";
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
      // Pay online (Stripe) — the modal mints a checkout link on mount; keep it
      // inert in tests (never resolves a session; status query idle).
      useCancelOrder: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      useCreateStripeCheckout: vi.fn(() => ({
        mutateAsync: vi.fn(() => new Promise(() => {})),
        isPending: false,
      })),
      useStripeCheckoutStatus: vi.fn(() => ({ data: undefined })),
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
    // 0219 Order Entry config — the Payment section renders the SAME methods
    // + follow-ups the POS gets (here: Credit/Debit with a Bank follow-up).
    orderEntryConfig: {
      paymentMethods: [
        {
          key: "credit",
          label: "Credit / Debit",
          sublabel: "Full payment",
          active: true,
          approvalCodeRequired: true,
          followUps: [
            { key: "bank", label: "Bank", required: true, options: ["Maybank", "CIMB Bank"] },
          ],
        },
      ],
    },
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

  it("a sofa pick brings its VARIANTS out under the row — specs only, NO money shown or written", async () => {
    mockRawCreate.mockResolvedValue({
      id: "o-raw-3",
      so: 1303,
      customer: { name: "Raw Customer" },
      lines: [{ id: "ol1" }],
    } as unknown as Order);
    wrap();
    fireEvent.focus(firstSkuInput());
    fireEvent.change(firstSkuInput(), { target: { value: "5539" } });
    fireEvent.mouseDown(screen.getByTestId("raw-pick-5539-L(RHF)"));
    // No page jump — the options came OUT under the row instead.
    expect(screen.queryByTestId("pos-configure-page")).toBeNull();
    const seat = screen.getByLabelText("Seat height") as HTMLSelectElement;
    const fabric = screen.getByLabelText("Fabric") as HTMLSelectElement;
    const leg = screen.getByLabelText("Leg height") as HTMLSelectElement;

    // The dropdowns carry NO price hints (Loo: 不应该出现那个价钱).
    expect(seat.textContent).not.toMatch(/RM/);
    expect(fabric.textContent).not.toMatch(/RM/);
    expect(leg.textContent).not.toMatch(/RM/);

    // Selections record specs but NEVER touch the operator's price.
    fireEvent.change(leg, { target: { value: '6"' } });
    fireEvent.change(seat, { target: { value: '26"' } });
    fireEvent.change(fabric, { target: { value: "cf:CG-001" } });
    expect(screen.getAllByText("RM 2,000.00").length).toBeGreaterThan(0);

    // Submit: attrs carry the SPEC choices only — no surcharge / total money.
    fireEvent.change(screen.getByTestId("raw-dealer"), { target: { value: DEALER_ID } });
    fireEvent.change(screen.getByTestId("raw-customer-name"), {
      target: { value: "Raw Customer" },
    });
    fireEvent.click(screen.getByTestId("raw-submit"));
    await screen.findByText("Order SO-1303 created");
    const input = mockRawCreate.mock.calls[0][0];
    expect(input.lines[0].unitPrice).toBe(2000);
    expect(input.lines[0].attrs).toEqual({
      seat_height: '26"',
      fabric_code: "CG-001",
      fabric_name: "CG-001 Pearl",
      options: [{ kind: "sofa_leg_height", value: '6"' }],
    });
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

  it("payment follows the Order Entry config: follow-ups render here and ride entry_data.payment", async () => {
    mockRawCreate.mockResolvedValue({
      id: "o-raw-4",
      so: 1304,
      customer: { name: "Raw Customer" },
      lines: [{ id: "ol1" }],
    } as unknown as Order);
    wrap();
    fireEvent.change(screen.getByTestId("raw-dealer"), { target: { value: DEALER_ID } });
    fireEvent.change(screen.getByTestId("raw-customer-name"), {
      target: { value: "Raw Customer" },
    });
    fireEvent.change(firstSkuInput(), { target: { value: "CUSTOM LINE" } });

    // Pick the configured method → its Bank follow-up appears (POS parity).
    fireEvent.change(screen.getByTestId("raw-payment-method"), { target: { value: "credit" } });
    fireEvent.change(screen.getByTestId("raw-pay-followup-bank"), {
      target: { value: "Maybank" },
    });
    fireEvent.change(screen.getByTestId("raw-paid"), { target: { value: "2000" } });

    fireEvent.click(screen.getByTestId("raw-submit"));
    await screen.findByText("Order SO-1304 created");
    const input = mockRawCreate.mock.calls[0][0];
    expect(input.paid).toBe(2000);
    expect(input.paymentMethod).toBe("credit");
    expect(input.entryData).toEqual({ payment: { bank: "Maybank" } });
  });

  it("billing address keys in with the SAME MY cascade as delivery and composes at submit", async () => {
    // Prefill a draft with structured billing parts (billingSame OFF) so the
    // submit mapping is exercised without walking the real postcode data.
    const d = emptyDraft();
    sessionStorage.setItem(
      RAW_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...d,
        actingDealerId: DEALER_ID,
        actingDealerName: "Dealer One",
        customer: {
          ...d.customer,
          name: "Raw Customer",
          billingSame: false,
          billingLine1: "88 Jalan B",
          billingState: "Penang",
          billingCity: "George Town",
          billingPostcode: "10000",
        },
        lines: [
          { localId: "l1", sku: "CUSTOM LINE", qty: 1, attrs: null, unitPrice: 100, label: "" },
        ],
      }),
    );
    mockRawCreate.mockResolvedValue({
      id: "o-raw-6",
      so: 1306,
      customer: { name: "Raw Customer" },
      lines: [{ id: "ol1" }],
    } as unknown as Order);
    wrap();

    // The billing block renders the SAME cascading picker (not one textarea):
    // a second State/City/Postcode set appears when billingSame is off.
    expect(screen.getByTestId("raw-billing-fields")).toBeTruthy();
    expect(screen.getAllByText("State *").length).toBe(2);
    expect(screen.getAllByText("Postcode *").length).toBe(2);

    fireEvent.click(screen.getByTestId("raw-submit"));
    await screen.findByText("Order SO-1306 created");
    const input = mockRawCreate.mock.calls[0][0];
    expect(input.customer.billingSame).toBe(false);
    expect(input.customer.billing).toContain("88 Jalan B");
    expect(input.customer.billing).toContain("Penang");
    expect(input.customer.billing).toContain("10000");
  });

  it("Pay online (Stripe) is offered: creates the order UNPAID and opens the QR / link modal", async () => {
    mockRawCreate.mockResolvedValue({
      id: "o-raw-5",
      so: 1305,
      customer: { name: "Raw Customer" },
      lines: [{ id: "ol1" }],
    } as unknown as Order);
    wrap();
    fireEvent.change(screen.getByTestId("raw-dealer"), { target: { value: DEALER_ID } });
    fireEvent.change(screen.getByTestId("raw-customer-name"), {
      target: { value: "Raw Customer" },
    });
    fireEvent.change(firstSkuInput(), { target: { value: "CUSTOM LINE" } });

    // The built-in Pay online method rides after the configured list.
    fireEvent.change(screen.getByTestId("raw-payment-method"), { target: { value: "stripe" } });
    // Stripe needs no manual proof — the approval/reference field hides.
    expect(screen.queryByText("Approval / reference code")).toBeNull();
    expect(screen.getByTestId("raw-stripe-note")).toBeTruthy();
    fireEvent.change(screen.getByTestId("raw-paid"), { target: { value: "500" } });

    fireEvent.click(screen.getByTestId("raw-submit"));
    // The order creates with paid 0 (money moves only when Stripe confirms)…
    await vi.waitFor(() => expect(mockRawCreate).toHaveBeenCalledTimes(1));
    const input = mockRawCreate.mock.calls[0][0];
    expect(input.paid).toBe(0);
    expect(input.paymentMethod).toBe("stripe");
    expect(input.approvalCode).toBeNull();
    // …and the QR / link modal opens instead of the done card.
    await screen.findByTestId("pos-stripe-modal");
    expect(screen.queryByText("Order SO-1305 created")).toBeNull();
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
