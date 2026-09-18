/**
 * ⭐ GROUP-LOCAL HEADERS — owner ruling, Jess 2026-09-18.
 *
 * This ruling SUPERSEDES the single global header above all groups. A governed
 * grouped listing reads, per group:
 *
 * ```
 * collapsed   heading + count
 * expanded    heading → column header → records
 * ```
 *
 * It is the ENGINE's behaviour, so every register handing the grid governed
 * `fixedGroups` gets it and none of them gains or loses a group, a default
 * expansion or a business rule by it. What the groups SHARE is the point: one
 * `<colgroup>`-equivalent width set, one visibility set, one sort, one resize —
 * four headers that could disagree would be four tables.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

interface Row { id: string; po: string; date: string; supplier: string; group: string }
const ROWS: Row[] = [
  { id: "a", po: "PO-20260901-1001", date: "1 Sep", supplier: "Hooka", group: "waiting" },
  { id: "b", po: "PO-20260902-1002", date: "2 Sep", supplier: "Nice Future", group: "waiting" },
  { id: "c", po: "PO-20260903-1003", date: "3 Sep", supplier: "Ohana", group: "completed" },
];
const COLUMNS: DataGridColumn<Row>[] = [
  { key: "date", label: "PO Date", width: 118, accessor: (r) => r.date },
  { key: "po", label: "PO No", width: 170, accessor: (r) => r.po },
  { key: "supplier", label: "Supplier", width: 136, sortable: true, accessor: (r) => r.supplier },
];

function mount(key = "test.group-headers") {
  return render(
    <DataGrid<Row>
      appearance="reference"
      rows={ROWS}
      columns={COLUMNS}
      storageKey={key}
      rowKey={(r) => r.id}
      leadingColumns={{ date: "date", identity: "po" }}
      fixedGroups={{
        groups: [
          { key: "waiting", label: "Waiting for goods from supplier", alwaysOpen: true },
          { key: "completed", label: "Completed", initiallyCollapsed: true },
        ],
        groupOf: (r) => r.group,
      }}
    />,
  );
}

const headerRows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('tr[data-testid^="grid-header-"]')];
const labelsOf = (row: HTMLElement) =>
  [...row.querySelectorAll<HTMLElement>("th")].map((th) => th.title).filter(Boolean);
const widthsOf = (row: HTMLElement) =>
  [...row.querySelectorAll<HTMLElement>("th")].map((th) => th.style.width);

describe("DataGrid · group-local headers", () => {
  it("draws no header above all groups", () => {
    const { container } = mount();
    expect(container.querySelector("thead")).toBeNull();
    expect(screen.queryByTestId("grid-header")).toBeNull();
  });

  it("an OPEN group reads heading → column header → records", () => {
    const { container } = mount("k.open");
    const section = screen.getByTestId("grid-section-waiting");
    const order = [...section.children].map((el) => el.getAttribute("data-testid") ?? el.className);
    expect(order[0]).toBe("grid-group-waiting");
    expect(order[1]).toBe("grid-header-waiting");
    expect(within(section).getByText("PO-20260901-1001")).toBeInTheDocument();
    expect(labelsOf(headerRows(container)[0]!)).toEqual(["PO Date", "PO No", "Supplier"]);
  });

  it("a COLLAPSED group is its heading and its count, and nothing else", () => {
    mount("k.collapsed");
    const section = screen.getByTestId("grid-section-completed");
    expect(within(section).queryByTestId("grid-header-completed")).toBeNull();
    expect(within(section).queryByText("PO-20260903-1003")).toBeNull();
    expect(within(section).getByTestId("grid-group-toggle-completed")).toHaveTextContent("Completed");
    expect(within(section).getByTestId("grid-group-toggle-completed")).toHaveTextContent("1");
  });

  it("opening the collapsed group gives it its own header", () => {
    const { container } = mount("k.toggle");
    fireEvent.click(screen.getByTestId("grid-group-toggle-completed"));
    const rows = headerRows(container);
    expect(rows).toHaveLength(2);
    expect(labelsOf(rows[0]!)).toEqual(labelsOf(rows[1]!));
    expect(widthsOf(rows[0]!)).toEqual(widthsOf(rows[1]!));
  });

  it("every group shares one width, one visibility and one sort", () => {
    const { container } = mount("k.shared");
    fireEvent.click(screen.getByTestId("grid-group-toggle-completed"));
    // Hide a column from ONE header; every group loses it.
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Supplier" }));
    for (const row of headerRows(container)) expect(labelsOf(row)).toEqual(["PO Date", "PO No"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Supplier" }));
    // Sorting from one group's header sorts the whole register, once.
    const sorters = screen.getAllByRole("button", { name: "Supplier" });
    fireEvent.click(sorters[sorters.length - 1]!);
    const saved = JSON.parse(window.localStorage.getItem("k.shared")!);
    expect(saved.sort).toEqual({ key: "supplier", dir: "asc" });
  });

  it("keeps the leading date + identity pinned inside every group's header", () => {
    const { container } = mount("k.pinned");
    fireEvent.click(screen.getByTestId("grid-group-toggle-completed"));
    for (const row of headerRows(container)) {
      const cells = [...row.querySelectorAll<HTMLElement>("th")];
      expect(cells[0]!.style.left).toBe("0px");
      expect(cells[1]!.style.left).toBe("118px");
      expect(cells[2]!.style.left).toBe("");
    }
  });

  it("a register with no governed groups keeps the one header it always had", () => {
    const { container } = render(
      <DataGrid<Row>
        appearance="reference"
        rows={ROWS}
        columns={COLUMNS}
        storageKey="k.flat"
        rowKey={(r) => r.id}
      />,
    );
    expect(container.querySelector("thead")).not.toBeNull();
    expect(screen.getByTestId("grid-header")).toBeInTheDocument();
    expect(headerRows(container)).toHaveLength(0);
  });
});
