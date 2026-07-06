/**
 * CartDrawer — "Clear cart" empties every item (lines + add-ons) in one tap,
 * keeping the customer/delivery details (Loo 2026-07-06).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { emptyDraft, type WizardDraft } from "../new-order/draft";
import CartDrawer from "./CartDrawer";

function draftWith(over: Partial<WizardDraft>): WizardDraft {
  return {
    ...emptyDraft(),
    lines: [{ localId: "L1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200, label: "Matt X" }],
    customer: { ...emptyDraft().customer, name: "Jane", phone: "0123" },
    ...over,
  };
}

const noop = () => {};

describe("CartDrawer — Clear cart", () => {
  it("clears lines + add-ons but keeps the customer details", () => {
    const onChange = vi.fn();
    render(<CartDrawer draft={draftWith({})} onChange={onChange} onProceed={noop} onClose={noop} />);
    fireEvent.click(screen.getByTestId("pos-clear-cart"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as WizardDraft;
    expect(next.lines).toEqual([]);
    expect(next.addons).toEqual([]);
    // Customer info is preserved — Clear cart only empties the items.
    expect(next.customer.name).toBe("Jane");
  });

  it("is disabled when the cart is already empty", () => {
    render(<CartDrawer draft={draftWith({ lines: [] })} onChange={noop} onProceed={noop} onClose={noop} />);
    expect(screen.getByTestId("pos-clear-cart")).toBeDisabled();
  });
});
