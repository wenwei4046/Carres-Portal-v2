import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

describe("CustomerStep — in-flow dealer pick (internal operator)", () => {
  it("blocks the form behind the dealer card until a dealer is picked, then fires onPick with id+name", () => {
    const onPick = vi.fn();
    render(
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
    expect(screen.queryByText(/Sale info/i)).toBeTruthy(); // the card's own eyebrow

    fireEvent.change(screen.getByTestId("pos-dealer-pick"), { target: { value: "d2" } });
    expect(onPick).toHaveBeenCalledWith("d2", "Dealer Two");
  });

  it("renders the full form once a dealer is picked", () => {
    render(
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
    // The legacy Step1Customer form is mounted (its no-outlets notice shows
    // because we passed empty lists — presence proves the gate opened).
    expect(screen.getByText(/No outlets yet/i)).toBeTruthy();
  });

  it("dealer-side path (no dealerPick): no dealer card, form renders directly", () => {
    render(
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
    expect(screen.getByText(/No outlets yet/i)).toBeTruthy();
  });
});
