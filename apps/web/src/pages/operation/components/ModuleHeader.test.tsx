/**
 * ⭐ THE DESTINATION HEADER'S NARROW-CANVAS LAW — measured defect, 2026-09-18.
 *
 * At a 390px canvas EVERY destination page scrolled sideways by 30px, which
 * §6.7 rule 8 forbids by name. The cause was here: the identity span was
 * `shrink-0` at the governed 24px, so on a phone `SO Batch Purchase` demanded
 * 260px beside a 144px utility cluster inside 366px of usable width.
 * `Jump to…` already collapsed its label under `sm`; the WORD had no
 * narrow-canvas rule at all.
 *
 * The fix is in this one shared component, so all 28 destination pages get it:
 * the word may WRAP and the row's 50px becomes a FLOOR. jsdom computes no
 * layout, so what is held here is the CONTRACT that makes the wrap possible —
 * the pixel behaviour is measured in a real browser, and recorded in
 * `docs/ui/MASTER.md` §6.7.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ModuleHeader from "./ModuleHeader";

function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ModuleHeader · the Destination Header", () => {
  it("makes 50px a FLOOR, so a wrapped identity is never clipped", () => {
    mount(<ModuleHeader testId="dh" word="SO Batch Purchase" docTitle="x" destinationHeader />);
    const row = screen.getByTestId("dh");
    expect(row).toHaveClass("min-h-[50px]");
    /* ⛔ A fixed height would clip the second line instead of growing. */
    expect(row.className.split(/\s+/)).not.toContain("h-[50px]");
  });

  it("lets the identity shrink and wrap, and never truncates it", () => {
    mount(<ModuleHeader testId="dh" word="SO Batch Purchase" docTitle="x" destinationHeader />);
    const word = screen.getByTestId("dh-module-word");
    /* `min-w-0` is what lets a flex item shrink below its content at all — the
       single missing rule that caused the overflow. */
    expect(word).toHaveClass("min-w-0");
    expect(word).toHaveClass("break-words");
    /* A governed label is never cut and never hidden behind a tooltip. */
    expect(word.className).not.toContain("truncate");
    expect(word.className.split(/\s+/)).not.toContain("shrink-0");
    expect(word).not.toHaveAttribute("title");
    /* And the governed 24px is kept — no phone type step was invented. */
    expect(word).toHaveClass("text-page");
    expect(word).toHaveTextContent("SO Batch Purchase");
  });

  it("leaves the tab-strip module header exactly as it was", () => {
    mount(<ModuleHeader testId="mh" word="Warehouse" docTitle="x" />);
    const row = screen.getByTestId("mh");
    const word = screen.getByTestId("mh-module-word");
    /* Its fixed 44px row, its 13px word and its `shrink-0` are untouched. */
    expect(row.className).not.toContain("min-h-[50px]");
    expect(word).toHaveClass("shrink-0");
    expect(word).toHaveClass("text-body");
    expect(word).not.toHaveClass("min-w-0");
  });

  it("keeps every global utility on the row rather than dropping one", () => {
    mount(<ModuleHeader testId="dh" word="Unpaid by Supplier" docTitle="x" destinationHeader />);
    /* The four §6.7 utilities. `Jump to…` collapses its LABEL under `sm`
       (JumpTo.tsx) and keeps its accessible name; nothing is removed. */
    for (const name of ["Search", "Alerts", "Help", "Settings"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
