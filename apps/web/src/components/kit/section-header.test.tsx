/**
 * SectionHeader — the region label every page region shares.
 *
 * The constraint blocks pass by FAILING TO COMPILE, so they are checked by
 * `tsc -p tsconfig.app.json`, not by this runner. Delete the union that splits
 * collapsible from permanent and typecheck goes red.
 *
 * NEGATIVE CONTROLS (run by hand when touching this file):
 *   · give the permanent branch a chevron → exactly the "draws no chevron" test
 *     goes red.
 *   · collapse the union into one optional `collapsible?: boolean` → both
 *     `@ts-expect-error` blocks report as unused.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SectionHeader from "./SectionHeader";

describe("SectionHeader", () => {
  it("says what the region is, in the caller's word", () => {
    render(<SectionHeader title="Items" testId="s" />);
    expect(screen.getByTestId("s")).toHaveTextContent("Items");
  });

  /**
   * A permanent region — Items — has nothing to press. A disabled chevron would
   * cost a reader a moment to find out it does nothing, so there is no chevron
   * and no button at all.
   */
  it("draws no chevron and no button when the region is permanent", () => {
    render(<SectionHeader title="Items" testId="s" />);
    expect(screen.getByTestId("s").querySelector("button")).toBeNull();
    expect(screen.getByTestId("s").querySelector("svg")).toBeNull();
  });

  it("a collapsible region reports whether it is open, and toggles", () => {
    const onToggle = vi.fn();
    render(
      <SectionHeader title="Supplier information" testId="s" collapsible open={false} onToggle={onToggle} />,
    );
    const btn = screen.getByTestId("s-toggle");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders the meta slot the caller passes, and composes nothing itself", () => {
    render(<SectionHeader title="Items" testId="s" meta={<span>13 lines · 14 units</span>} />);
    expect(screen.getByTestId("s")).toHaveTextContent("13 lines · 14 units");
  });

  it("renders no meta container when there is no meta", () => {
    render(<SectionHeader title="Notes" testId="s" />);
    // One child — the label. An empty right-hand span would take height for a
    // fact that does not exist.
    expect(screen.getByTestId("s").children).toHaveLength(1);
  });

  it("is not open and not closed when it does not collapse", () => {
    render(<SectionHeader title="Items" testId="s" />);
    expect(screen.getByTestId("s").querySelector("[aria-expanded]")).toBeNull();
  });

  it("takes no purchase-order word — every string is the caller's", () => {
    render(<SectionHeader title="Anything At All" testId="s" />);
    const html = screen.getByTestId("s").innerHTML;
    for (const w of ["Purchase", "Supplier", "Items", "Order"]) {
      expect(html.replace("Anything At All", "")).not.toContain(w);
    }
  });
});

/** Checked by `tsc`, never by the runner. */
export function constraints() {
  return (
    <>
      {/* @ts-expect-error — a permanent region may not be told whether it is open */}
      <SectionHeader title="Items" open={false} />
      {/* @ts-expect-error — collapsible without `open` is a region nobody can draw */}
      <SectionHeader title="Header" collapsible onToggle={() => {}} />
    </>
  );
}
