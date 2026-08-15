/**
 * ⭐ STICKY IDENTITY — the engine capability, tested at the engine.
 *
 * Owner ruling 2026-08-15 (Chai): when optional columns widen the sheet, the
 * row must never stop saying WHICH record it is. The control gutter and the
 * FIRST data column pin to the left edge.
 *
 * Two things are asserted, and the second is the one that matters most:
 *   1 · with the capability ON, exactly the gutter + the first data column
 *       pin, at cumulative offsets read from the SAME width source the cells
 *       use — a wrong offset leaves a gap the rows slide through;
 *   2 · with it OFF, NOTHING is sticky. `docs/ui/MASTER.md` §4: every optional
 *       power is optional, and an unwired power's ABSENCE is asserted by a
 *       test, because a power that quietly appears later is the failure the
 *       rule exists to stop.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

interface Row {
  id: string;
  so: string;
  customer: string;
}

const ROWS: Row[] = [
  { id: "a", so: "SO-1301", customer: "Tan Mei Ling" },
  { id: "b", so: "SO-1302", customer: "Lim Wei" },
];

const COLUMNS: DataGridColumn<Row>[] = [
  { key: "so", label: "SO No", width: 85, accessor: (r) => r.so },
  { key: "customer", label: "Customer", width: 190, accessor: (r) => r.customer },
];

/** The grid WITHOUT the capability — the default every other register runs. */
function mountPlain(key: string) {
  return render(
    <DataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      storageKey={key}
      rowKey={(r) => r.id}
      selectable={{ selectedKeys: new Set(), onToggle: () => {}, onToggleAll: () => {} }}
      expandable={{ renderExpansion: () => <div>goods</div> }}
    />,
  );
}

/** Every `<th>`/`<td>` that the engine actually pinned, in DOM order. */
function pinnedCells(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("th, td")].filter(
    (el) => el.style.position === "sticky" || el.style.left !== "",
  );
}

describe("DataGrid · stickyIdentity", () => {
  it("pins NOTHING by default — an unwired power must stay invisible", () => {
    mountPlain("test.sticky.off");
    expect(pinnedCells()).toHaveLength(0);
    // The grid still renders normally.
    expect(screen.getAllByText("SO-1301").length).toBeGreaterThan(0);
  });
});

/* The ON case is asserted through the class + inline offset the engine writes,
   because jsdom computes no layout: `position: sticky` never resolves and a
   getComputedStyle assertion would pass on a broken grid. The offsets ARE the
   contract — 30 (selection) + 32 (expand) = 62 for the first data column. */
describe("DataGrid · stickyIdentity offsets", () => {
  it("pins the gutter and the FIRST data column at cumulative offsets", () => {
    const { container } = render(
      <DataGrid<Row>
        rows={ROWS}
        columns={COLUMNS}
        storageKey="test.sticky.on"
        rowKey={(r) => r.id}
        stickyIdentity
        selectable={{ selectedKeys: new Set(), onToggle: () => {}, onToggleAll: () => {} }}
        expandable={{ renderExpansion: () => <div>goods</div> }}
      />,
    );
    const headCells = [...container.querySelectorAll<HTMLElement>("thead th")];
    expect(headCells.map((el) => el.style.left)).toEqual(["0px", "30px", "62px", ""]);
    // …and the LAST data column is emphatically not pinned.
    expect(headCells[3]!.style.left).toBe("");

    const firstRowCells = [...container.querySelectorAll<HTMLElement>("tbody tr:first-child td")];
    expect(firstRowCells.map((el) => el.style.left)).toEqual(["0px", "30px", "62px", ""]);
  });
});
