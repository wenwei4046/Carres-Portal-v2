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
            { id: "d1", name: "Dealer One", channel: "dealer" },
            { id: "d2", name: "Dealer Two", channel: "dealer" },
          ],
          loading: false,
          value: null,
          onPick,
        }}
      />,
    );

    // Form gated — only the store card + hint render.
    expect(screen.getByTestId("pos-dealer-pick")).toBeTruthy();
    expect(screen.getByText(/Pick a store to continue/)).toBeTruthy();

    fireEvent.change(screen.getByTestId("pos-dealer-pick"), { target: { value: "d2" } });
    expect(onPick).toHaveBeenCalledWith("d2", "Dealer Two");
  });

  // Loo 2026-07-19 — our own showrooms used to sit in the same flat list as
  // external dealers, so there was no way to tell whose store you were
  // selling under.
  it("groups the store picker into 'Our showrooms' and 'Dealers'", () => {
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
            { id: "d1", name: "Dealer One", channel: "dealer" },
            { id: "s1", name: "Kelana Jaya", channel: "showroom" },
          ],
          loading: false,
          value: null,
          onPick: () => {},
        }}
      />,
    );
    const groups = Array.from(
      screen.getByTestId("pos-dealer-pick").querySelectorAll("optgroup"),
    ).map((g) => g.getAttribute("label"));
    expect(groups).toEqual(["Our showrooms", "Dealers"]);
  });

  it("names the branch field Showroom for a showroom and Outlet for a dealer", () => {
    const pick = (channel: "dealer" | "showroom") => ({
      dealers: [{ id: "x", name: "Store", channel }],
      loading: false,
      value: "x",
      onPick: () => {},
    });
    const draft = { ...emptyDraft(), actingDealerId: "x", actingDealerName: "Store" };

    const { unmount } = wrap(
      <CustomerStep
        draft={draft}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
        dealerPick={pick("showroom")}
      />,
    );
    expect(screen.getByText("Showroom *")).toBeTruthy();
    unmount();

    wrap(
      <CustomerStep
        draft={draft}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
        dealerPick={pick("dealer")}
      />,
    );
    expect(screen.getByText("Outlet *")).toBeTruthy();
  });

  // The AutoCount Archive account has zero outlets — Loo picked it and the
  // dropdown just sat empty with no explanation (2026-07-19).
  it("explains an empty branch list instead of showing a blank dropdown", () => {
    wrap(
      <CustomerStep
        draft={{ ...emptyDraft(), actingDealerId: "d1", actingDealerName: "Dealer One" }}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
        dealerPick={{
          dealers: [{ id: "d1", name: "Dealer One", channel: "dealer" }],
          loading: false,
          value: "d1",
          onPick: () => {},
        }}
      />,
    );
    expect(screen.getByTestId("pos-outlet-empty").textContent).toContain("no outlet yet");
    expect(screen.getByTestId("pos-outlet-select")).toHaveProperty("disabled", true);
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
          dealers: [{ id: "d1", name: "Dealer One", channel: "dealer" }],
          loading: false,
          value: "d1",
          onPick: () => {},
        }}
      />,
    );
    expect(screen.queryByText(/Pick a store to continue/)).toBeNull();
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

  it("Address sub-step (2026-07-19): structured billing cascade + building type", () => {
    const d = emptyDraft();
    d.customer.billingSame = false;
    const onChange = vi.fn();
    wrap(
      <CustomerStep
        draft={d}
        onChange={onChange}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
        initialSubStep={1}
      />,
    );

    // Billing renders the SAME MY cascade as delivery (state/city/postcode
    // selects), not the old free-text textarea.
    const billing = screen.getByTestId("pos-billing-fields");
    expect(billing.querySelectorAll("select").length).toBe(3);
    expect(billing.querySelector("textarea")).toBeNull();

    // Typing billing Line 1 keeps the composed `billing` string in step.
    const line1 = billing.querySelector("input")!;
    fireEvent.change(line1, { target: { value: "88 Jalan Invoice" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({
          billingLine1: "88 Jalan Invoice",
          billing: "88 Jalan Invoice",
        }),
      }),
    );

    // Building type select sits in the delivery-address block.
    fireEvent.change(screen.getByTestId("pos-building-type"), { target: { value: "Condo" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({ buildingType: "Condo" }),
      }),
    );
  });

  /* THE ASTERISK MUST REFUSE (found by YH on production, 2026-08-28).
     `canAdvanceAt` is documented as mirroring `draft.ts step1FirstIssue`.
     Jess added Building type to that validator on 2026-08-21; this mirror
     did not follow, so Next stayed enabled on an address sub-step with an
     empty required field. The pin is the INVARIANT — every field the address
     sub-step marks required also gates Next — not this one field’s name. */
  it("Next refuses while a required address field is empty, and allows once filled", () => {
    const d = emptyDraft();
    d.customer.addressLine1 = "12 Jalan Besar";
    d.customer.addressState = "Selangor";
    d.customer.addressCity = "Petaling Jaya";
    d.customer.addressPostcode = "46200";
    d.customer.billingSame = true;
    d.customer.buildingType = "";
    const first = wrap(
      <CustomerStep
        draft={d}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
        initialSubStep={1}
      />,
    );
    // Everything else on the sub-step is complete — only Building type is empty.
    expect(screen.getByTestId("pos-customer-next")).toBeDisabled();
    first.unmount();

    const filled = emptyDraft();
    filled.customer = { ...d.customer, buildingType: "Condo" };
    wrap(
      <CustomerStep
        draft={filled}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
        initialSubStep={1}
      />,
    );
    expect(screen.getByTestId("pos-customer-next")).toBeEnabled();
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

// Loo 2026-07-26 — the step pills are buttons now: jump straight to a
// sub-step. Backward is always free; forward walks the same per-step gates
// Next enforces.
describe("CustomerStep — clickable step pills", () => {
  it("clicking an earlier pill jumps straight back (Emergency → Customer)", () => {
    wrap(
      <CustomerStep
        draft={emptyDraft()}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
        initialSubStep={2}
      />,
    );
    expect(screen.getByTestId("pos-customer-chip-3").className).toContain("is-active");
    fireEvent.click(screen.getByTestId("pos-customer-chip-1"));
    expect(screen.getByTestId("pos-customer-chip-1").className).toContain("is-active");
    // The Customer form really is up.
    expect(screen.getByTestId("pos-customer-name")).toBeTruthy();
  });

  it("a forward pill stays disabled while the gates in between fail", () => {
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
    const chip4 = screen.getByTestId("pos-customer-chip-4") as HTMLButtonElement;
    expect(chip4.disabled).toBe(true);
    fireEvent.click(chip4);
    expect(screen.getByTestId("pos-customer-chip-1").className).toContain("is-active");
  });

  it("a forward pill is clickable once every gate before it passes", () => {
    const d = emptyDraft();
    d.outletId = "o1";
    d.salespersonId = "s1";
    d.customer.name = "Tan Mei";
    d.customer.phone = "0123456789";
    d.customer.email = "tan@example.com";
    d.customer.race = "Chinese";
    d.customer.gender = "Female";
    d.customer.birthday = "1990-01-01";
    d.customer.addressUnknown = true; // address gate satisfied
    wrap(
      <CustomerStep
        draft={d}
        onChange={() => {}}
        outlets={[]}
        salespersons={[]}
        catalog={catalog()}
        minLeadDays={14}
      />,
    );
    // Customer + Address gates pass → Emergency (chip 3) is reachable.
    const chip3 = screen.getByTestId("pos-customer-chip-3") as HTMLButtonElement;
    expect(chip3.disabled).toBe(false);
    fireEvent.click(chip3);
    expect(screen.getByTestId("pos-customer-chip-3").className).toContain("is-active");
  });
});
