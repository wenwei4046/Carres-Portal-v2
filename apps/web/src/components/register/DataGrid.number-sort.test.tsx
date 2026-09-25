/**
 * A column with `numberValue` sorts by the number, not the cell text. The
 * Trial Balance's Debit read "RM 2,400.00", so 900 sorted after 6,334
 * (25 Sep 2026). A blank goes last in both directions; a `sortFn` still wins.
 */
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

interface Row { id: string; amount: number | null }
const ROWS: Row[] = [
  { id: "a", amount: 2400 },
  { id: "b", amount: null },
  { id: "c", amount: 6334 },
  { id: "d", amount: 900 },
];
const rm = (n: number | null) => (n === null ? "Not recorded" : `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`);

function mount(column: Partial<DataGridColumn<Row>> = {}) {
  const columns: DataGridColumn<Row>[] = [
    { key: "id", label: "Id", width: 80, accessor: (r) => r.id },
    { key: "amount", label: "Amount", width: 120, accessor: (r) => rm(r.amount), numberValue: (r) => r.amount, ...column },
  ];
  return render(<DataGrid<Row> rows={ROWS} columns={columns} storageKey="test.number-sort" rowKey={(r) => r.id} />);
}
const order = (c: HTMLElement) => [...c.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent);
const sortAmount = () => fireEvent.click(screen.getByRole("button", { name: /^Amount/ }));

afterEach(() => window.localStorage.clear());

describe("DataGrid · a number column sorts by its number", () => {
  it("sorts up and down by the amount, with the blank last both ways", () => {
    const { container } = mount();
    sortAmount();
    expect(order(container)).toEqual(["d", "a", "c", "b"]);
    sortAmount();
    expect(order(container)).toEqual(["c", "a", "d", "b"]);
  });

  it("keeps a column's own sortFn", () => {
    const { container } = mount({ sortFn: (x, y) => x.id.localeCompare(y.id) });
    sortAmount();
    expect(order(container)).toEqual(["a", "b", "c", "d"]);
  });
});
