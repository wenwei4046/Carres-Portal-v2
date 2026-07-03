import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse } from "@carres/shared";
import { emptyDraft } from "../new-order/draft";
import CustomerStep from "./CustomerStep";

afterEach(cleanup);

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
