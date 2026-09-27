/**
 * DocumentTable and TotalsSummary — table recipes 3 and 4 (UI MASTER, owner
 * ruling 2026-09-27).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import DocumentTable from "./DocumentTable";
import TotalsSummary from "./TotalsSummary";

const COLUMNS = [
  { key: "month", label: "Month" },
  { key: "sofa", label: "Sofa", numeric: true },
  { key: "total", label: "Total Qty", numeric: true },
];

describe("DocumentTable", () => {
  it("is one named table with its column headers in order", () => {
    render(<DocumentTable label="By month" columns={COLUMNS} rows={[]} />);
    const table = screen.getByRole("table", { name: "By month" });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Month", "Sofa", "Total Qty",
    ]);
  });

  it("right-aligns number columns, tabular and unwrapped, and leaves words left", () => {
    render(
      <DocumentTable label="t" columns={COLUMNS} rows={[{ key: "a", cells: { month: "Oct 2026", sofa: 2, total: 2 } }]} />,
    );
    const [word, number] = screen.getAllByRole("cell");
    expect(number!.className).toContain("text-right");
    expect(number!.className).toContain("tabular-nums");
    expect(number!.className).toContain("whitespace-nowrap");
    expect(word!.className).toContain("text-left");
    expect(word!.className).not.toContain("text-right");
    const headers = screen.getAllByRole("columnheader");
    expect(headers[1]!.className).toContain("text-right");
  });

  it("draws row lines and no column lines", () => {
    render(
      <DocumentTable label="t" columns={COLUMNS} rows={[{ key: "a", cells: { month: "Oct 2026", sofa: 2, total: 2 } }]} />,
    );
    const row = screen.getAllByRole("row")[1]!;
    expect(row.className).toContain("border-b");
    for (const cell of screen.getAllByRole("cell")) {
      expect(cell.className).not.toMatch(/border-[lrx]\b|border-[lrx]-/);
    }
  });

  it("a door row opens from a focusable control in its first cell", () => {
    const onOpen = vi.fn();
    render(
      <DocumentTable
        label="t"
        columns={COLUMNS}
        rows={[{ key: "a", cells: { month: "Oct 2026", sofa: 2, total: 2 }, onOpen, openLabel: "Open Sales Orders for Oct 2026" }]}
      />,
    );
    const door = screen.getByRole("button", { name: "Open Sales Orders for Oct 2026" });
    expect(door.tagName).toBe("BUTTON");
    expect(door).toHaveTextContent("Oct 2026");
    expect(screen.getAllByRole("cell")[0]).toContainElement(door);
    door.focus();
    expect(door).toHaveFocus();
    expect(door.className).toContain("max-md:min-h-10");
    fireEvent.click(door);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("row")[1]!.className).toContain("hover:bg-kit-slate-3");
  });

  it("a row with no door has no control and no hover", () => {
    render(
      <DocumentTable label="t" columns={COLUMNS} rows={[{ key: "a", cells: { month: "Total", sofa: 2, total: 2 }, total: true }]} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    const row = screen.getAllByRole("row")[1]!;
    expect(row.className).not.toContain("hover:");
    expect(row.className).toContain("font-semibold");
  });

  it("only the closing total is weight 600", () => {
    render(
      <DocumentTable
        label="t"
        columns={COLUMNS}
        rows={[
          { key: "a", cells: { month: "Oct 2026", sofa: 2, total: 2 } },
          { key: "t", cells: { month: "Total", sofa: 2, total: 2 }, total: true },
        ]}
      />,
    );
    const [, plain, total] = screen.getAllByRole("row");
    expect(plain!.className).not.toContain("font-semibold");
    expect(total!.className).toContain("font-semibold");
  });

  it("prints zero, and prints nothing at all for an empty cell", () => {
    const { container } = render(
      <DocumentTable
        label="t"
        columns={COLUMNS}
        rows={[{ key: "a", cells: { month: "Oct 2026", sofa: 0, total: null } }]}
      />,
    );
    const cells = screen.getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("0");
    expect(cells[2]!.textContent).toBe("");
    expect(container.textContent).not.toMatch(/[—–]/);
  });

  it("scrolls sideways inside its own wrapper", () => {
    const { container } = render(<DocumentTable label="t" columns={COLUMNS} rows={[]} />);
    expect(container.querySelector('[data-kit="document-table"]')!.className).toContain("overflow-x-auto");
  });
});

describe("TotalsSummary", () => {
  const ROWS = [
    { key: "total", label: "Total Qty", value: 8 },
    { key: "delivered", label: "Delivered", value: 0 },
    { key: "owed", label: "Not delivered", value: 8, strong: true },
  ];

  it("is one named description list of label and value pairs", () => {
    const { container } = render(<TotalsSummary label="This month" rows={ROWS} />);
    const list = container.querySelector("dl")!;
    expect(list).toHaveAttribute("aria-label", "This month");
    expect([...list.querySelectorAll("dt")].map((n) => n.textContent)).toEqual(["Total Qty", "Delivered", "Not delivered"]);
    expect([...list.querySelectorAll("dd")].map((n) => n.textContent)).toEqual(["8", "0", "8"]);
  });

  it("puts the label left in slate-11 and the value right, tabular, in slate-12", () => {
    const { container } = render(<TotalsSummary label="t" rows={ROWS} />);
    expect(container.querySelector("dt")!.className).toContain("text-kit-slate-11");
    const value = container.querySelector("dd")!;
    expect(value.className).toContain("text-kit-slate-12");
    expect(value.className).toContain("text-right");
    expect(value.className).toContain("tabular-nums");
  });

  it("draws a line between rows and no outer frame", () => {
    const { container } = render(<TotalsSummary label="t" rows={ROWS} />);
    const list = container.querySelector("dl")!;
    expect(list.className).not.toContain("border");
    const rows = [...list.children] as HTMLElement[];
    expect(rows[0]!.className).not.toContain("border-t");
    expect(rows[1]!.className).toContain("border-t");
    expect(rows[2]!.className).toContain("border-t");
  });

  it("only a row marked strong is weight 600", () => {
    const { container } = render(<TotalsSummary label="t" rows={ROWS} />);
    const rows = [...container.querySelector("dl")!.children] as HTMLElement[];
    expect(rows[0]!.className).not.toContain("font-semibold");
    expect(rows[2]!.className).toContain("font-semibold");
  });
});
