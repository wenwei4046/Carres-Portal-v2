import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse } from "@carres/shared";
import { emptyDraft } from "../new-order/draft";
import CustomerStep from "./CustomerStep";

// Full-name autocomplete — stub only useCustomerSearch (keeps the real
// useCustomerTypeProbe, which stays idle below 8 phone chars).
const { mockCustomerSearch } = vi.hoisted(() => ({
  mockCustomerSearch: vi.fn((): { data?: { customers: unknown[] } } => ({ data: undefined })),
}));
vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  useCustomerSearch: mockCustomerSearch,
}));

afterEach(cleanup);
afterEach(() => {
  mockCustomerSearch.mockReset();
  mockCustomerSearch.mockReturnValue({ data: undefined });
});

function catalog(): CatalogResponse {
  return {
    models: [],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  } as unknown as CatalogResponse;
}

/** The customer-type probe runs on react-query — wrap with a quiet client. */
function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("CustomerStep — in-flow dealer pick (internal operator)", () => {
  it("blocks the form behind the dealer card until a dealer is picked, then fires onPick with id+name", () => {
    const onPick = vi.fn();
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
        dealerPick={{
          dealers: [
            { id: "d1", name: "Dealer One" },
            { id: "d2", name: "Dealer Two" },
          ],
          loading: false,
          value: null,
          onPick,
        }}
      />,
    );

    // Form gated — only the dealer card + hint render.
    expect(screen.getByTestId("pos-dealer-pick")).toBeTruthy();
    expect(screen.getByText(/Pick a dealer to continue/)).toBeTruthy();

    fireEvent.change(screen.getByTestId("pos-dealer-pick"), { target: { value: "d2" } });
    expect(onPick).toHaveBeenCalledWith("d2", "Dealer Two");
  });

  it("renders the full form once a dealer is picked", () => {
    wrap(
      <CustomerStep
        draft={{ ...emptyDraft(), actingDealerId: "d1", actingDealerName: "Dealer One" }}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
        dealerPick={{
          dealers: [{ id: "d1", name: "Dealer One" }],
          loading: false,
          value: "d1",
          onPick: () => {},
        }}
      />,
    );
    expect(screen.queryByText(/Pick a dealer to continue/)).toBeNull();
    // The Customer sub-step form is mounted — demographics fields prove the
    // gate opened.
    expect(screen.getByTestId("pos-customer-race")).toBeTruthy();
  });

  it("dealer-side path (no dealerPick): no dealer card, form renders directly", () => {
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
      />,
    );
    expect(screen.queryByTestId("pos-dealer-pick")).toBeNull();
    expect(screen.getByTestId("pos-customer-race")).toBeTruthy();
  });
});

describe("CustomerStep — 2990s Image-#4 parity", () => {
  it("renders the 4 section chips, demographics fields, customer-type (auto) and the Order-summary rail", () => {
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
      />,
    );
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`pos-customer-chip-${n}`)).toBeTruthy();
    }
    expect(screen.getByTestId("pos-customer-race")).toBeTruthy();
    expect(screen.getByTestId("pos-customer-gender")).toBeTruthy();
    expect(screen.getByTestId("pos-customer-birthday")).toBeTruthy();
    // Probe idle (no phone) → em-dash placeholder.
    expect((screen.getByTestId("pos-customer-type") as HTMLInputElement).value).toBe("—");
    expect(screen.getByTestId("pos-order-summary")).toBeTruthy();
    expect(screen.getByText(/Phase 1 of 2/i)).toBeTruthy();
  });

  it("demographics edits flow through onChange", () => {
    const onChange = vi.fn();
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={onChange}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
      />,
    );
    fireEvent.change(screen.getByTestId("pos-customer-race"), { target: { value: "Chinese" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({ race: "Chinese" }),
      }),
    );
  });
});

describe("CustomerStep — 0219 config-driven form fields", () => {
  function catalogWithFormCfg(): CatalogResponse {
    return {
      ...catalog(),
      orderEntryConfig: {
        paymentMethods: [],
        formFields: {
          customer: {
            builtins: {
              race: { enabled: false }, // hidden entirely
              birthday: { enabled: true, required: false }, // optional now
            },
            custom: [
              {
                key: "occupation",
                label: "Occupation",
                type: "select",
                required: true,
                options: ["Engineer", "Teacher"],
              },
            ],
          },
        },
      },
    } as unknown as CatalogResponse;
  }

  it("hides a disabled builtin, renders the custom field, and writes its value to customer.custom", () => {
    const onChange = vi.fn();
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={onChange}
        outlets={[]}
        salespersons={[]}
        catalog={catalogWithFormCfg()}
        minLeadDays={14}
      />,
    );
    // race disabled → gone; gender untouched → still there.
    expect(screen.queryByTestId("pos-customer-race")).toBeNull();
    expect(screen.getByTestId("pos-customer-gender")).toBeTruthy();
    // The operator-defined custom select renders on the Customer tab.
    const field = screen.getByTestId("pos-custom-customer-occupation");
    const select = field.querySelector("select")!;
    fireEvent.change(select, { target: { value: "Engineer" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({ custom: { occupation: "Engineer" } }),
      }),
    );
  });
});

describe("CustomerStep — Full-name autocomplete (existing customers)", () => {
  const HIT = {
    name: "Jamie Tan",
    phone: "012-3456789",
    email: "jamie@example.com",
    address: "12 Jalan Besar, Petaling Jaya 46200, Selangor",
    addressUnknown: false,
    billing: null,
    billingSame: true,
    emergency: "Mei Tan · 012-9988776 · Spouse",
    race: "Chinese",
    gender: "Female",
    birthday: "1990-04-01",
  };

  it("dropdown hidden until typing; a pick prefills the whole customer block and closes it", () => {
    mockCustomerSearch.mockReturnValue({ data: { customers: [HIT] } });
    const onChange = vi.fn();
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={onChange}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
      />,
    );

    expect(screen.queryByTestId("pos-customer-suggest")).toBeNull();
    fireEvent.change(screen.getByTestId("pos-customer-name"), { target: { value: "jam" } });
    const item = screen.getByTestId("pos-customer-suggest-0");
    expect(item.textContent).toContain("Jamie Tan");
    expect(item.textContent).toContain("012-3456789");

    fireEvent.mouseDown(item);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({
          name: "Jamie Tan",
          phone: "012-3456789",
          email: "jamie@example.com",
          race: "Chinese",
          gender: "Female",
          birthday: "1990-04-01",
          addressLine1: "12 Jalan Besar",
          addressState: "Selangor",
          addressCity: "Petaling Jaya",
          addressPostcode: "46200",
          billingSame: true,
          emergencyName: "Mei Tan",
          emergencyPhone: "012-9988776",
          emergencyRelationship: "Spouse",
        }),
      }),
    );
    // Pick closes the dropdown.
    expect(screen.queryByTestId("pos-customer-suggest")).toBeNull();
  });

  it("no dropdown when the search returns no matches", () => {
    mockCustomerSearch.mockReturnValue({ data: { customers: [] } });
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
      />,
    );
    fireEvent.change(screen.getByTestId("pos-customer-name"), { target: { value: "zzz" } });
    expect(screen.queryByTestId("pos-customer-suggest")).toBeNull();
  });

  it("blur closes the dropdown", () => {
    mockCustomerSearch.mockReturnValue({ data: { customers: [HIT] } });
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
      />,
    );
    const input = screen.getByTestId("pos-customer-name");
    fireEvent.change(input, { target: { value: "jam" } });
    expect(screen.getByTestId("pos-customer-suggest")).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.queryByTestId("pos-customer-suggest")).toBeNull();
  });
});

describe("CustomerStep — Target-date sub-step (Loo 2026-07-12)", () => {
  function catalogWithAddons(): CatalogResponse {
    return {
      ...catalog(),
      addons: [
        { key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true },
        { key: "dispose-sofa", name: "Dispose old sofa", price: 120, active: false },
        // Server-exclusive delivery-fee keys — must NEVER be pickable.
        { key: "DELIVERY", name: "Delivery fee", price: 0, active: true },
        { key: "DELIVERY_CROSS", name: "Cross-category delivery fee", price: 0, active: true },
        { key: "DELIVERY_ADD", name: "Additional delivery fee", price: 0, active: true },
      ],
    } as unknown as CatalogResponse;
  }

  it("initialSubStep=3 opens directly on Target date (Back from CONFIRM lands here, not on the Customer form)", () => {
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalogWithAddons()}
        minLeadDays={14}
        initialSubStep={3}
      />,
    );
    // Target-date content is up; the Customer form is not.
    expect(screen.getAllByText(/Delivery date/i).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("pos-customer-race")).toBeNull();
    // No ASAP pill anymore.
    expect(screen.queryByTestId("delivery-asap-pill")).toBeNull();
  });

  it("shows the order add-ons inline under Target date — active only, DELIVERY* filtered out", () => {
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalogWithAddons()}
        minLeadDays={14}
        initialSubStep={3}
      />,
    );
    const section = screen.getByTestId("pos-target-date-addons");
    expect(section.textContent).toContain("Dispose old mattress");
    expect(section.textContent).not.toContain("Dispose old sofa"); // inactive
    expect(section.textContent).not.toContain("Delivery fee"); // server-exclusive
  });

  it("adding an add-on flows through onChange with qty 1", () => {
    const onChange = vi.fn();
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={onChange}
        outlets={[]}
        salespersons={[]}
        catalog={catalogWithAddons()}
        minLeadDays={14}
        initialSubStep={3}
      />,
    );
    fireEvent.click(screen.getByText("Dispose old mattress"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        addons: [expect.objectContaining({ key: "dispose-mattress", qty: 1, unitPrice: 80 })],
      }),
    );
  });
});
