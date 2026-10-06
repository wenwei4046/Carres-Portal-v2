/**
 * `pinnedPrefix` — a page's OWN leading columns lead, cannot be hidden or
 * dragged away, and pin at a canvas ≥768px; below it only the `narrow` set
 * pins (Purchasing §9.5 · UI MASTER §6.7 rule 2, the Supplier Claims
 * exception). Asserted through the inline offsets the engine writes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useContext } from "react";
import { DataGrid, DataGridRowExpansionContext, type DataGridColumn } from "./DataGrid";

interface Row { id: string; status: string; no: string; date: string; supplier: string }
const ROWS: Row[] = [{ id: "a", status: "In progress", no: "SC-1019", date: "Fri, 4 Sep", supplier: "Hooka" }];
function UnitsLink({ id }: { id: string }) {
  const x = useContext(DataGridRowExpansionContext);
  return <button type="button" aria-expanded={x?.isExpanded(id) ?? false} onClick={() => x?.toggle(id)}>2 Units</button>;
}
const COLUMNS: DataGridColumn<Row>[] = [
  { key: "date", label: "Claim Reported", width: 100, accessor: (r) => r.date },
  { key: "no", label: "Supplier Claim No", width: 150, accessor: (r) => r.no },
  { key: "supplier", label: "Supplier", width: 140, accessor: (r) => <><span>{r.supplier}</span><UnitsLink id={r.id} /></> },
  { key: "status", label: "Claim status", width: 112, accessor: (r) => r.status },
];

function stubCanvas(width: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
}
function mount(storageKey: string) {
  return render(
    <DataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      storageKey={storageKey}
      rowKey={(r) => r.id}
      pinnedPrefix={{ columns: ["status", "no"], narrow: ["no"] }}
      rowHeight={51}
      selectable={{ selectedKeys: new Set(), onToggle: () => {}, onToggleAll: () => {} }}
      expandable={{ renderExpansion: () => <div>the Units</div> }}
    />,
  );
}
const headerLabels = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("thead th")].slice(2).map((th) => th.getAttribute("title"));
const headerLefts = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("thead th")].map((th) => th.style.left);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("DataGrid · pinnedPrefix", () => {
  it("leads with the page's own columns and pins the controls + Claim status + Supplier Claim No at ≥768px; the date never pins", () => {
    stubCanvas(1140);
    const { container } = mount("test.prefix.wide");
    expect(headerLabels(container)).toEqual(["Claim status", "Supplier Claim No", "Claim Reported", "Supplier"]);
    // 30 (☐) + 32 (▸) = 62 for Claim status; 62 + 112 = 174 for the number.
    expect(headerLefts(container)).toEqual(["0px", "30px", "62px", "174px", "", ""]);
  });

  it("pins Supplier Claim No ALONE below 768px; Claim status scrolls", () => {
    stubCanvas(600);
    const { container } = mount("test.prefix.narrow");
    expect(headerLefts(container)).toEqual(["0px", "40px", "", "72px", "", ""]);
  });

  it("a saved layout can neither reorder nor hide the prefix", () => {
    stubCanvas(1140);
    window.localStorage.setItem("test.prefix.saved", JSON.stringify({ order: ["supplier", "date", "no", "status"], hidden: ["status"], widths: {}, groupBy: [], pinned: [], sort: null }));
    const { container } = mount("test.prefix.saved");
    expect(headerLabels(container)).toEqual(["Claim status", "Supplier Claim No", "Supplier", "Claim Reported"]);
  });

  it("draws the shared 51px two-line row", () => {
    stubCanvas(1140);
    const { container } = mount("test.prefix.row");
    expect(container.querySelector("[data-row-height]")?.getAttribute("data-row-height")).toBe("51");
  });

  it("an in-cell disclosure opens the SAME expansion the leading ▸ does", () => {
    stubCanvas(1140);
    mount("test.prefix.expand");
    const link = screen.getByRole("button", { name: "2 Units" });
    expect(screen.queryByText("the Units")).not.toBeInTheDocument();
    fireEvent.click(link);
    expect(screen.getByText("the Units")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 Units" })).toHaveAttribute("aria-expanded", "true");
  });
});
