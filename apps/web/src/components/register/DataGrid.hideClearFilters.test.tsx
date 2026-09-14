import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

/**
 * `hideClearFilters` (Receiving, owner instruction 2026-09-13): the
 * active-condition strip still lists every live condition as its own
 * removable chip, but the one-click `Clear filters` button is not drawn.
 * Absent = byte-identical to before.
 */
type Row = { id: string; name: string };
const columns: DataGridColumn<Row>[] = [
  { key: "name", label: "Name", accessor: (r) => r.name, searchValue: (r) => r.name },
];
const rows: Row[] = [{ id: "1", name: "one" }];

describe("DataGrid · hideClearFilters", () => {
  it("draws the strip and its chips without the Clear filters button", () => {
    render(
      <DataGrid<Row>
        appearance="reference"
        rows={rows}
        columns={columns}
        storageKey="test.hide-clear"
        rowKey={(r) => r.id}
        hideClearFilters
        activeConditions={[{ key: "cat", label: "Category: Sofa", onClear: () => {} }]}
      />,
    );
    const strip = screen.getByTestId("active-conditions");
    expect(within(strip).getByText("Category: Sofa")).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "Remove Category: Sofa" })).toBeInTheDocument();
    expect(screen.queryByTestId("clear-filters")).not.toBeInTheDocument();
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it("keeps the button for every register that does not ask", () => {
    render(
      <DataGrid<Row>
        appearance="reference"
        rows={rows}
        columns={columns}
        storageKey="test.keep-clear"
        rowKey={(r) => r.id}
        activeConditions={[{ key: "cat", label: "Category: Sofa", onClear: () => {} }]}
      />,
    );
    expect(screen.getByTestId("clear-filters")).toHaveTextContent("Clear filters");
  });
});
