/**
 * The grouping a register OPENS with (`initialGroupBy`) — tested at the engine.
 *
 * Three things hold: the seed groups a grid this browser has never laid out;
 * a layout the operator saved always wins over the seed; and a grid that does
 * not ask for it is not grouped (an unwired power's absence is asserted, per
 * `docs/ui/MASTER.md` §4).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

interface Row {
  id: string;
  code: string;
  kind: string;
}

const ROWS: Row[] = [
  { id: "a", code: "1120", kind: "Asset" },
  { id: "b", code: "1210", kind: "Asset" },
  { id: "c", code: "2110", kind: "Liability" },
];

const COLUMNS: DataGridColumn<Row>[] = [
  { key: "code", label: "Code", width: 80, accessor: (r) => r.code },
  { key: "kind", label: "Kind", width: 120, accessor: (r) => r.kind },
];

function mount(key: string, initialGroupBy?: string[]) {
  return render(
    <DataGrid<Row> rows={ROWS} columns={COLUMNS} storageKey={key} rowKey={(r) => r.id} initialGroupBy={initialGroupBy} />,
  );
}

beforeEach(() => localStorage.clear());

describe("DataGrid · initialGroupBy", () => {
  it("opens grouped when this browser has no saved layout", () => {
    mount("t.initial-group.a", ["kind"]);
    expect(screen.getByText("Kind: Asset")).toBeInTheDocument();
    expect(screen.getByText("Kind: Liability")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("never overrides a layout the operator saved", () => {
    localStorage.setItem("t.initial-group.b", JSON.stringify({ groupBy: [] }));
    mount("t.initial-group.b", ["kind"]);
    expect(screen.queryByText("Kind: Asset")).not.toBeInTheDocument();
    expect(screen.getByText("1210")).toBeInTheDocument();
  });

  it("is absent unless a register asks for it", () => {
    mount("t.initial-group.c");
    expect(screen.queryByText("Kind: Asset")).not.toBeInTheDocument();
  });
});
