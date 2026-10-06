/**
 * MANUAL PURCHASE ROUND 2 — two opt-in engine capabilities (2026-09-17):
 *   · `warning` — message kind ② (UI MASTER §6.7): a band between the toolbar
 *     and the table, zero height while absent;
 *   · `fixedGroups[].emptyLabel` — an always-open group with no rows says so
 *     beside its zero.
 * Both are absent on every existing caller, so nothing else changes.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

interface Row { id: string; name: string; done: boolean }
const ROWS: Row[] = [{ id: "a", name: "Alpha", done: true }];
const COLUMNS: DataGridColumn<Row>[] = [{ key: "name", label: "Name", width: 120, accessor: (r) => r.name }];

function mount(extra: Partial<Parameters<typeof DataGrid<Row>>[0]> = {}) {
  return render(
    <DataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      storageKey={`r2-${Math.random()}`}
      rowKey={(r) => r.id}
      appearance="reference"
      {...extra}
    />,
  );
}

describe("DataGrid · round 2 engine capabilities", () => {
  it("draws no warning band unless the page hands one in", () => {
    mount();
    expect(screen.queryByTestId("grid-warning")).toBeNull();
  });

  it("the warning band sits between the toolbar and the table, as an alert", () => {
    const { container } = mount({ warning: <span>Office Co must be collected to Ohana.</span> });
    const band = screen.getByTestId("grid-warning");
    expect(band).toHaveAttribute("role", "alert");
    expect(band).toHaveTextContent("Office Co must be collected to Ohana.");
    const table = container.querySelector("table")!;
    expect(band.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("an empty always-open group states its emptyLabel beside the zero", () => {
    mount({
      fixedGroups: {
        groups: [
          { key: "waiting", label: "Need approval", alwaysOpen: true, emptyLabel: "Nothing waiting for approval" },
          { key: "done", label: "No purchase needed", initiallyCollapsed: true },
        ],
        groupOf: (r) => (r.done ? "done" : "waiting"),
      },
    });
    expect(screen.getByTestId("grid-group-waiting")).toHaveTextContent("Need approval0");
    expect(screen.getByTestId("grid-group-empty-waiting")).toHaveTextContent("Nothing waiting for approval");
  });

  /**
   * ⭐ AN EMPTY GROUP DRAWS NO COLUMN HEADER (measured on Manual Purchase,
   * 2026-09-22).
   *
   * `Need PO 0` printed fifteen column heads over nothing, so the operator
   * read a table that had no rows in it and looked for the missing data. The
   * engine already refused the header for a COLLAPSED group, for exactly this
   * reason — a header over no records names columns nobody is reading.
   */
  it("an empty group draws its heading and its count, and NO column header", () => {
    mount({
      fixedGroups: {
        groups: [
          { key: "waiting", label: "Need approval", alwaysOpen: true, emptyLabel: "Nothing waiting for approval" },
          { key: "done", label: "No purchase needed", alwaysOpen: true },
        ],
        groupOf: (r) => (r.done ? "done" : "waiting"),
      },
    });
    /* The empty group has its heading — and no header row under it. */
    expect(screen.getByTestId("grid-group-waiting")).toBeTruthy();
    expect(screen.queryByTestId("grid-header-waiting")).toBeNull();
    /* The group that HAS rows still carries its own header, so the columns are
       named exactly where they are being read. */
    expect(screen.getByTestId("grid-header-done")).toBeTruthy();
  });
});
