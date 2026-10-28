import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import COrderLines from "./COrderLines";

describe("COrderLines — the order-line table in a card (01 §5.1)", () => {
  const lines = [
    { key: "a", model: "TEST · Mattress model A", spec: "Queen · TEST-MS-A", qty: 2, unitPrice: "RM 1,890.00", amount: "RM 3,780.00", testId: "line-a" },
    { key: "b", model: "TEST · Pillow", qty: 1, unitPrice: "RM 0.00", amount: "RM 0.00", struck: true,
      notes: <span>Cancelled when approved · Restore to keep it</span>, below: <div>TEST editor</div>, data: { "data-pos-field": "orderAddons" } as const },
  ];

  it("is the kit's marked table, scrolling sideways in its own box, with the five kit columns", () => {
    render(<COrderLines label="Items" lines={lines} data-testid="goods" />);
    const table = screen.getByRole("table", { name: "Items" });
    expect(table).toHaveAttribute("data-testid", "goods");
    const box = table.parentElement!;
    expect(box).toHaveAttribute("data-carres-table", "order-lines");
    expect(box).toHaveAttribute("data-list-scroll");
    expect(box.className).toContain("overflow-x-auto");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["#", "Item", "Qty", "Unit price", "Amount"]);
  });

  it("prints the model and the spec on two lines that never wrap, and numbers the lines", () => {
    render(<COrderLines label="Items" lines={lines} />);
    const model = screen.getByText("TEST · Mattress model A");
    const spec = screen.getByText("Queen · TEST-MS-A");
    expect(model.className).toContain("block");
    expect(spec.className).toContain("text-[12px]");
    expect(model.closest("td")!.className).toContain("whitespace-nowrap");
    expect(model.closest("tr")).toHaveStyle({ height: "44px" });
    expect(within(screen.getByTestId("line-a")).getByText("1")).toBeInTheDocument();
  });

  it("strikes a cancelled line but not its note, keeps the line's data attributes, and opens its editor under it", () => {
    const { container } = render(<COrderLines label="Items" lines={lines} />);
    expect(screen.getByText("TEST · Pillow").className).toContain("line-through");
    expect(screen.getByText("Cancelled when approved · Restore to keep it").closest("span[class*='min-w-full']")!.className).not.toContain("line-through");
    expect(container.querySelector('tbody[data-pos-field="orderAddons"]')).toContainElement(screen.getByText("TEST editor"));
    expect(screen.getByText("TEST editor").closest("td")).toHaveAttribute("colspan", "5");
  });

  it("closes with the totals on the same columns, amber only where something is owed", () => {
    render(
      <COrderLines label="Items" lines={lines}
        totals={[
          { key: "t", label: "Total", strong: true, qty: 3, amount: "RM 3,780.00" },
          { key: "b", label: "Balance due", strong: true, warn: true, amount: "RM 780.00" },
        ]} />,
    );
    const owed = screen.getByText("RM 780.00");
    expect(owed.className).toContain("text-c-warn-fg");
    expect(owed.className).toContain("bg-c-warn-bg");
    expect(screen.getByText("RM 3,780.00", { selector: "td.font-medium" }).className).not.toContain("warn");
  });
});
