import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { emptyDraft, type DraftLine, type WizardDraft } from "../new-order/draft";
import CartDrawer from "./CartDrawer";

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    localId: "L1",
    sku: "CLOUD-QUEEN",
    qty: 1,
    attrs: null,
    unitPrice: 2890,
    label: "Carres Cloud · Queen",
    ...over,
  };
}

/** A draft with 2 combo lines (sharing combo_key) + 1 standalone line. */
function draftWithCombo(): WizardDraft {
  return {
    ...emptyDraft(),
    lines: [
      line({ localId: "c1", sku: "MAT-Q", unitPrice: 3000, attrs: { combo_key: "bedroom-set", combo_label: "Bedroom Set" }, label: "Cloud · Queen" }),
      line({ localId: "c2", sku: "FRAME-Q", unitPrice: 2000, attrs: { combo_key: "bedroom-set", combo_label: "Bedroom Set" }, label: "Oak Frame · Queen" }),
      line({ localId: "s1", sku: "PILLOW", unitPrice: 120, attrs: null, label: "Memory Pillow" }),
    ],
  };
}

describe("CartDrawer — combo grouping", () => {
  it("renders one combo group header for the shared combo_key + a standalone line", () => {
    render(
      <CartDrawer draft={draftWithCombo()} onChange={() => {}} onProceed={() => {}} onClose={() => {}} />,
    );

    // One combo group block (not two separate line cards for the combo lines).
    const group = screen.getByTestId("pos-cart-combo-bedroom-set");
    expect(group).toBeTruthy();
    // Combo label appears once as the group header.
    expect(within(group).getByText("Bedroom Set")).toBeTruthy();
    // Component lines listed read-only inside the group.
    expect(within(group).getByText(/Cloud · Queen/)).toBeTruthy();
    expect(within(group).getByText(/Oak Frame · Queen/)).toBeTruthy();
    // Group total = 3000 + 2000 = 5000.
    expect(within(group).getByText("5,000")).toBeTruthy();

    // The standalone line keeps its own card with a qty stepper.
    expect(screen.getByText("Memory Pillow")).toBeTruthy();
    expect(screen.getByLabelText("Increase quantity")).toBeTruthy();
  });

  it("combo lines have NO per-line qty stepper (only the standalone line does)", () => {
    render(
      <CartDrawer draft={draftWithCombo()} onChange={() => {}} onProceed={() => {}} onClose={() => {}} />,
    );
    // Exactly one stepper pair → only the standalone line is steppable.
    expect(screen.getAllByLabelText("Increase quantity")).toHaveLength(1);
  });

  it("Remove combo drops every line sharing the combo_key, keeps the standalone", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer draft={draftWithCombo()} onChange={onChange} onProceed={() => {}} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText("Remove combo Bedroom Set"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].sku).toBe("PILLOW");
  });

  it("the standalone line's qty stepper still works", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer draft={draftWithCombo()} onChange={onChange} onProceed={() => {}} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText("Increase quantity"));
    const next = onChange.mock.calls[0][0];
    const pillow = next.lines.find((l: DraftLine) => l.sku === "PILLOW");
    expect(pillow.qty).toBe(2);
    // Combo lines untouched.
    expect(next.lines.filter((l: DraftLine) => (l.attrs as Record<string, unknown>)?.combo_key)).toHaveLength(2);
  });

  it("subtotal includes both combo lines + the standalone line", () => {
    render(
      <CartDrawer draft={draftWithCombo()} onChange={() => {}} onProceed={() => {}} onClose={() => {}} />,
    );
    // 3000 + 2000 + 120 = 5120.
    expect(screen.getByText("5,120")).toBeTruthy();
  });
});
