import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse, PosRentalPlan, ProductModelDto } from "@carres/shared";
import RentalConfigurePage, { type RentalOfferCard } from "./RentalConfigurePage";
import { rentalOf } from "./rental-cart";

/**
 * The rent-to-own configure surface.
 *
 * The bar: an operator must never be able to add a rental without having seen
 * BOTH numbers — the monthly fee and what the whole contract comes to. "RM59"
 * on its own is how people mis-sell 84 months of credit.
 */

const model = {
  id: "m-1",
  category: "mattress",
  modelKey: "CLOUD",
  name: "Cloud Mattress",
} as unknown as ProductModelDto;

const catalog = {
  skus: [
    { sku: "CLOUD-Q", modelId: "m-1", variant: "Queen", price: 1999 },
    { sku: "CLOUD-K", modelId: "m-1", variant: "King", price: 2499 },
    { sku: "OTHER-1", modelId: "m-2", variant: "Queen", price: 900 },
  ],
} as unknown as CatalogResponse;

const plan = (id: string, sku: string, termMonths: number, monthlyFee: number): PosRentalPlan =>
  ({
    id,
    sku,
    termMonths,
    monthlyFee,
    includedPackageId: null,
    packageName: null,
    packageServiceType: null,
    packageVisitsPerYear: null,
    stripeReady: true,
  }) as PosRentalPlan;

function card(): RentalOfferCard {
  const plansBySku = new Map<string, PosRentalPlan[]>();
  plansBySku.set("CLOUD-Q", [plan("p-q60", "CLOUD-Q", 60, 69), plan("p-q84", "CLOUD-Q", 84, 59)]);
  plansBySku.set("CLOUD-K", [plan("p-k84", "CLOUD-K", 84, 79)]);
  return { model, plansBySku };
}

function setup(onAdd = vi.fn()) {
  render(
    <RentalConfigurePage card={card()} catalog={catalog} onAdd={onAdd} onClose={() => {}} />,
  );
  return onAdd;
}

describe("RentalConfigurePage", () => {
  it("offers only the sizes that are actually on rental offer", () => {
    setup();
    expect(screen.getByTestId("rental-size-CLOUD-Q")).toBeInTheDocument();
    expect(screen.getByTestId("rental-size-CLOUD-K")).toBeInTheDocument();
    // a SKU of a different model must never leak onto this card
    expect(screen.queryByTestId("rental-size-OTHER-1")).not.toBeInTheDocument();
  });

  it("will not let you add before a size AND a term are chosen", () => {
    setup();
    const add = screen.getByTestId("rental-cfg-add");
    expect(add).toBeDisabled();

    fireEvent.click(screen.getByTestId("rental-size-CLOUD-Q"));
    expect(add).toBeDisabled(); // size alone is not enough

    fireEvent.click(screen.getByTestId("rental-term-84"));
    expect(add).not.toBeDisabled();
  });

  it("asks for the size first rather than showing meaningless terms", () => {
    setup();
    expect(screen.getByText(/Pick a size first/i)).toBeInTheDocument();
  });

  it("shows the monthly fee AND the whole-contract figure together", () => {
    setup();
    fireEvent.click(screen.getByTestId("rental-size-CLOUD-Q"));
    fireEvent.click(screen.getByTestId("rental-term-84"));

    expect(screen.getByTestId("rental-cfg-monthly").textContent).toContain("59");
    // 59 × 84 = 4,956 — the number that makes it a credit decision
    expect(screen.getByTestId("rental-cfg-contract").textContent).toMatch(/4,956/);
  });

  it("re-asks for the term when the size changes — a term never carries across", () => {
    setup();
    fireEvent.click(screen.getByTestId("rental-size-CLOUD-Q"));
    fireEvent.click(screen.getByTestId("rental-term-60"));
    expect(screen.getByTestId("rental-cfg-add")).not.toBeDisabled();

    // King has no 60-month plan; silently keeping it would price the wrong term
    fireEvent.click(screen.getByTestId("rental-size-CLOUD-K"));
    expect(screen.getByTestId("rental-cfg-add")).toBeDisabled();
    expect(screen.queryByTestId("rental-term-60")).not.toBeInTheDocument();
    expect(screen.getByTestId("rental-term-84")).toBeInTheDocument();
  });

  it("emits a line the cart can recognise as a rental", () => {
    const onAdd = setup();
    fireEvent.click(screen.getByTestId("rental-size-CLOUD-Q"));
    fireEvent.click(screen.getByTestId("rental-term-84"));
    fireEvent.click(screen.getByTestId("rental-cfg-add"));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const line = onAdd.mock.calls[0][0];
    expect(line.sku).toBe("CLOUD-Q");
    // one rented item = one agreement; qty is never a multiplier here
    expect(line.qty).toBe(1);
    expect(line.unitPrice).toBe(59);

    const r = rentalOf(line);
    expect(r).not.toBeNull();
    expect(r?.planId).toBe("p-q84");
    expect(r?.termMonths).toBe(84);
    expect(r?.contractTotal).toBe(4956);
    expect(r?.variantLabel).toBe("Queen");
  });

  it("tells the store the three things they must be able to say out loud", () => {
    setup();
    const explainer = screen.getByTestId("rental-explainer").textContent ?? "";
    expect(explainer).toMatch(/one agreement/i);
    expect(explainer).toMatch(/cannot share an order/i);
    expect(explainer).toMatch(/no card is charged/i);
  });

  it("says so plainly when a model has no rental sizes left", () => {
    render(
      <RentalConfigurePage
        card={{ model, plansBySku: new Map() }}
        catalog={catalog}
        onAdd={vi.fn()}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/No size of this model is on rental offer yet/i)).toBeInTheDocument();
  });
});
