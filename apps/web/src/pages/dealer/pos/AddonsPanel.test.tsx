/**
 * AddonsPanel — per-unit disposal sizes (Loo 2026-07-21).
 *
 * A disposal add-on at qty N renders N size dropdowns (one per old item —
 * qty 2 can be one Queen + one Single). Picks write attrs.sizes (per-unit
 * truth) AND attrs.size (composed summary every downstream reader renders).
 * The qty stepper resizes the per-unit list.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AddonDto } from "@carres/shared";
import AddonsPanel from "./AddonsPanel";
import { emptyDraft, type WizardDraft } from "../new-order/draft";

const ADDONS: AddonDto[] = [
  { key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true },
  { key: "dispose-sofa", name: "Dispose old sofa", price: 50, active: true },
];

function draftWith(addons: WizardDraft["addons"]): WizardDraft {
  return { ...emptyDraft(), addons };
}

describe("AddonsPanel — per-unit disposal sizes", () => {
  it("qty 1 renders ONE size dropdown; qty 2 renders TWO (one per old item)", () => {
    const { rerender } = render(
      <AddonsPanel
        addons={ADDONS}
        draft={draftWith([
          { key: "dispose-mattress", qty: 1, unitPrice: 80, name: "Dispose old mattress", attrs: {} },
        ])}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Dispose old mattress size")).toBeInTheDocument();
    rerender(
      <AddonsPanel
        addons={ADDONS}
        draft={draftWith([
          { key: "dispose-mattress", qty: 2, unitPrice: 80, name: "Dispose old mattress", attrs: {} },
        ])}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Dispose old mattress size (item 1)")).toBeInTheDocument();
    expect(screen.getByLabelText("Dispose old mattress size (item 2)")).toBeInTheDocument();
  });

  it("picking different sizes per unit writes attrs.sizes + the composed attrs.size summary", () => {
    const onChange = vi.fn();
    render(
      <AddonsPanel
        addons={ADDONS}
        draft={draftWith([
          {
            key: "dispose-mattress",
            qty: 2,
            unitPrice: 80,
            name: "Dispose old mattress",
            attrs: { sizes: ["Queen", ""] },
          },
        ])}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Dispose old mattress size (item 2)"), {
      target: { value: "Single" },
    });
    const next = onChange.mock.calls[0][0] as WizardDraft;
    expect(next.addons[0].attrs).toEqual({ sizes: ["Queen", "Single"], size: "Queen + Single" });
  });

  it("qty + adds an unpicked size slot; qty − drops the tail and recomposes the summary", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AddonsPanel
        addons={ADDONS}
        draft={draftWith([
          {
            key: "dispose-mattress",
            qty: 1,
            unitPrice: 80,
            name: "Dispose old mattress",
            attrs: { sizes: ["Queen"], size: "Queen" },
          },
        ])}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Increase Dispose old mattress quantity"));
    let next = onChange.mock.calls[0][0] as WizardDraft;
    expect(next.addons[0].qty).toBe(2);
    expect(next.addons[0].attrs).toEqual({ sizes: ["Queen", ""], size: "Queen" });

    onChange.mockClear();
    rerender(
      <AddonsPanel addons={ADDONS} draft={draftWith(next.addons)} onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText("Decrease Dispose old mattress quantity"));
    next = onChange.mock.calls[0][0] as WizardDraft;
    expect(next.addons[0].qty).toBe(1);
    expect(next.addons[0].attrs).toEqual({ sizes: ["Queen"], size: "Queen" });
  });

  it("legacy draft with a single attrs.size on qty 2 seeds unit 1 and leaves unit 2 unpicked", () => {
    render(
      <AddonsPanel
        addons={ADDONS}
        draft={draftWith([
          {
            key: "dispose-mattress",
            qty: 2,
            unitPrice: 80,
            name: "Dispose old mattress",
            attrs: { size: "Queen" },
          },
        ])}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Dispose old mattress size (item 1)")).toHaveValue("Queen");
    expect(screen.getByLabelText("Dispose old mattress size (item 2)")).toHaveValue("");
  });

  it("size-less disposal (sofa) renders NO size dropdown regardless of qty", () => {
    render(
      <AddonsPanel
        addons={ADDONS}
        draft={draftWith([
          { key: "dispose-sofa", qty: 2, unitPrice: 50, name: "Dispose old sofa" },
        ])}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Dispose old sofa size/)).not.toBeInTheDocument();
  });
});
