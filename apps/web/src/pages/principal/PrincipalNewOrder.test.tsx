/**
 * PrincipalNewOrder — the POS-structure-parity raw creator (Loo 2026-07-18).
 *
 * What matters here:
 *  1. SKU-search-first product entry: a search hit opens the SAME configure
 *     surface the POS card would, with the variant PRESELECTED, and the
 *     emitted DraftLine (attrs included) lands as an editable Items row.
 *  2. The raw contract survives the new flow: prices stay editable, custom
 *     lines allowed, and the submit maps the full draft (attrs, customer
 *     block, dealer) onto RawCreateOrderInput for POST /api/orders/raw.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse, Order } from "@carres/shared";
import {
  RAW_DRAFT_STORAGE_KEY,
  emptyDraft,
  type WizardDraft,
} from "../dealer/new-order/draft";
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
      useCustomerSearch: vi.fn(() => ({ data: undefined })),
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
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
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
  mockHooks.useCustomerSearch.mockReturnValue({ data: undefined });
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

beforeEach(() => {
  sessionStorage.clear();
  setHookDefaults();
});
afterEach(() => {
  cleanup();
  mockRawCreate.mockReset();
});

describe("PrincipalNewOrder — SKU-search-first Items step", () => {
  it("search hit opens the POS configure page with the variant PRESELECTED; adding lands an editable row", () => {
    wrap();

    fireEvent.change(screen.getByTestId("raw-picker"), { target: { value: "cloud" } });
    // Deactivated skus surface too (raw path reaches the full admin bundle).
    expect(screen.getByTestId("raw-pick-CLOUD-KING").textContent).toContain("POS off");

    fireEvent.click(screen.getByTestId("raw-pick-CLOUD-QUEEN"));
    // The POS full-page configurator opens ALREADY configured to Queen — the
    // live total shows its price without another click.
    expect(screen.getByTestId("pos-configure-page")).toBeTruthy();
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("2,890");

    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    // Back on Items with the line staged; Next unlocks.
    expect(screen.queryByTestId("pos-configure-page")).toBeNull();
    expect(screen.getByText("Carres Cloud · Queen")).toBeTruthy();
    expect(screen.getByTestId("raw-items-next")).toHaveProperty("disabled", false);
  });

  it("prices stay editable after configuration (raw override)", () => {
    wrap();
    fireEvent.change(screen.getByTestId("raw-picker"), { target: { value: "queen" } });
    fireEvent.click(screen.getByTestId("raw-pick-CLOUD-QUEEN"));
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));

    fireEvent.change(screen.getByLabelText("Unit price (RM)"), { target: { value: "1000" } });
    // Topbar count reflects the overridden total.
    expect(screen.getByTestId("raw-topbar-count").textContent).toContain("1,000.00");
  });

  it("a service sku adds a plain line directly — no configurator hop", () => {
    wrap();
    fireEvent.change(screen.getByTestId("raw-picker"), { target: { value: "svc" } });
    fireEvent.click(screen.getByTestId("raw-pick-SVC-ASSEMBLY"));
    expect(screen.queryByTestId("pos-configure-page")).toBeNull();
    expect(screen.getByText("Services · Assembly")).toBeTruthy();
  });

  it("custom line stays supported (free-text sku + price)", () => {
    wrap();
    expect(screen.getByTestId("raw-items-next")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByText("Custom line"));
    // Empty sku keeps Next gated until typed.
    expect(screen.getByTestId("raw-items-next")).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Custom line description"), {
      target: { value: "CUSTOM DELIVERY SURCHARGE" },
    });
    expect(screen.getByTestId("raw-items-next")).toHaveProperty("disabled", false);
  });

  it("Next lands on the POS CustomerStep with the in-flow dealer card", () => {
    wrap();
    fireEvent.change(screen.getByTestId("raw-picker"), { target: { value: "queen" } });
    fireEvent.click(screen.getByTestId("raw-pick-CLOUD-QUEEN"));
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    fireEvent.click(screen.getByTestId("raw-items-next"));
    // The POS customer step (dealer pick card + step pills) is mounted.
    expect(screen.getByTestId("pos-dealer-pick")).toBeTruthy();
    expect(screen.getByTestId("pos-customer-chip-1")).toBeTruthy();
  });
});

describe("PrincipalNewOrder — raw submit mapping", () => {
  /** A COMPLETE restored draft so the CustomerStep gates pass without UI
   *  keystrokes — the test walks Next×4 → Confirm → Create. */
  function completeDraft(): WizardDraft {
    const d = emptyDraft();
    return {
      ...d,
      actingDealerId: DEALER_ID,
      actingDealerName: "Dealer One",
      outletId: "o1",
      salespersonId: "sp1",
      customer: {
        ...d.customer,
        name: "Raw Customer",
        phone: "0123456789",
        email: "raw@example.com",
        race: "Chinese",
        gender: "Female",
        birthday: "1990-04-01",
        addressLine1: "12 Jalan A",
        addressState: "Kuala Lumpur",
        addressCity: "Kuala Lumpur",
        addressPostcode: "50000",
        emergencyName: "Alice",
        emergencyPhone: "0129988776",
        emergencyRelationship: "Spouse",
      },
      // Raw dates: TBD off + EMPTY dates would fail the POS gate — here the
      // rawDates prop lets it pass (no date rules on this path).
      delivery: { ...d.delivery, dateTbd: false, date: "", proceedDate: "" },
      lines: [
        {
          localId: "l1",
          sku: "CLOUD-QUEEN",
          qty: 1,
          attrs: { options: [{ kind: "bedframe_leg_height", value: "15cm" }] },
          unitPrice: 2890,
          label: "Carres Cloud · Queen",
        },
      ],
      payment: { ...d.payment, method: "" },
      paid: 500,
    };
  }

  it("Create maps the draft onto RawCreateOrderInput — attrs, customer block, dealer, no payment", async () => {
    sessionStorage.setItem(RAW_DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));
    mockRawCreate.mockResolvedValue({
      id: "o-raw-1",
      so: 1301,
      customer: { name: "Raw Customer" },
      lines: [{ id: "ol1" }],
    } as unknown as Order);

    wrap();
    fireEvent.click(screen.getByTestId("raw-items-next"));
    // CustomerStep sub-steps: Customer → Address → Emergency → Target date.
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId("pos-customer-next"));
    }
    // Confirm — everything optional; Create fires the raw door.
    fireEvent.click(screen.getByTestId("raw-submit"));
    await screen.findByText("Order SO-1301 created");

    expect(mockRawCreate).toHaveBeenCalledTimes(1);
    const input = mockRawCreate.mock.calls[0][0];
    expect(input.dealerId).toBe(DEALER_ID);
    expect(input.outletId).toBe("o1");
    expect(input.salespersonId).toBe("sp1");
    expect(input.customer).toMatchObject({
      name: "Raw Customer",
      phone: "0123456789",
      email: "raw@example.com",
      race: "Chinese",
      gender: "Female",
      birthday: "1990-04-01",
      addressUnknown: false,
      billingSame: true,
      emergency: "Alice · 0129988776 · Spouse",
      // 0230 — structured parts ride alongside the composed string.
      addressLine1: "12 Jalan A",
      addressState: "Kuala Lumpur",
      addressCity: "Kuala Lumpur",
      addressPostcode: "50000",
    });
    expect(input.customer.address).toContain("12 Jalan A");
    // Raw dates: empty (not TBD-ticked) still submits as no-date (TBD).
    expect(input.deliveryDate).toBeNull();
    expect(input.proceedDate).toBeNull();
    // The configured spec attrs ride the line.
    expect(input.lines).toEqual([
      {
        sku: "CLOUD-QUEEN",
        qty: 1,
        unitPrice: 2890,
        attrs: { options: [{ kind: "bedframe_leg_height", value: "15cm" }] },
      },
    ]);
    expect(input.paid).toBe(500);
    // No payment recorded → nulls (optional on this path).
    expect(input.paymentMethod).toBeNull();
    expect(input.signaturePath).toBeNull();
    expect(input.termsAccepted).toBe(false);
  });
});
