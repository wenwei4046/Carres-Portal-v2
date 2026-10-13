/**
 * Three list options from the Forecast Purchase handoff (owner 13 Oct 2026;
 * 01 §5), tested at the engine: the sort a list opens with (`sortDefault`),
 * the grey second header line (`headerSub`) and the neutral column band
 * (`band`). Each is absent unless a list asks for it (ui MASTER §4).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";
import RowTick from "./RowTick";

interface Row {
  id: string;
  model: string;
  sold: number;
}

const ROWS: Row[] = [
  { id: "a", model: "Alpha", sold: 2 },
  { id: "b", model: "Bravo", sold: 9 },
  { id: "c", model: "Charlie", sold: 5 },
];

const columns = (extra: Partial<DataGridColumn<Row>> = {}): DataGridColumn<Row>[] => [
  { key: "model", label: "Model", width: 160, accessor: (r) => r.model },
  { key: "sold", label: "12 Oct", width: 80, align: "right", accessor: (r) => String(r.sold), numberValue: (r) => r.sold, ...extra },
];

const models = () => screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0]!.textContent);

beforeEach(() => localStorage.clear());

describe("DataGrid · sortDefault", () => {
  it("opens sorted when this browser has no saved layout", () => {
    render(<DataGrid<Row> rows={ROWS} columns={columns()} storageKey="t.sort-default.a" rowKey={(r) => r.id} sortDefault={{ key: "sold", dir: "desc" }} />);
    expect(models()).toEqual(["Bravo", "Charlie", "Alpha"]);
    expect(screen.getByTestId("sort-desc")).toBeInTheDocument();
  });

  it("never overrides a layout the person saved, a saved choice of no sort included", () => {
    localStorage.setItem("t.sort-default.b", JSON.stringify({ sort: null }));
    render(<DataGrid<Row> rows={ROWS} columns={columns()} storageKey="t.sort-default.b" rowKey={(r) => r.id} sortDefault={{ key: "sold", dir: "desc" }} />);
    expect(models()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("is absent unless a list asks for it", () => {
    render(<DataGrid<Row> rows={ROWS} columns={columns()} storageKey="t.sort-default.c" rowKey={(r) => r.id} />);
    expect(models()).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(screen.queryByTestId("sort-desc")).not.toBeInTheDocument();
  });
});

describe("DataGrid · headerSub", () => {
  it("prints the grey second line under the label, and the label stays the column's name", () => {
    render(<DataGrid<Row> rows={ROWS} columns={columns({ headerSub: "Mon" })} storageKey="t.header-sub.a" rowKey={(r) => r.id} />);
    const header = screen.getByRole("columnheader", { name: /12 Oct/ });
    expect(within(header).getByText("Mon").className).toMatch(/headerSub/);
    expect(header.className).toMatch(/thTwoLine/);
    expect(screen.getByRole("button", { name: "Filter 12 Oct" })).toBeInTheDocument();
  });

  it("is absent unless a column asks for it", () => {
    render(<DataGrid<Row> rows={ROWS} columns={columns()} storageKey="t.header-sub.b" rowKey={(r) => r.id} />);
    expect(screen.getByRole("columnheader", { name: /12 Oct/ }).className).not.toMatch(/thTwoLine/);
  });
});

describe("DataGrid · band", () => {
  it("marks the column's header and every cell of it, and no other column", () => {
    render(<DataGrid<Row> rows={ROWS} columns={columns({ band: true })} storageKey="t.band.a" rowKey={(r) => r.id} />);
    expect(screen.getByRole("columnheader", { name: /12 Oct/ }).className).toMatch(/thBand/);
    expect(screen.getByRole("columnheader", { name: /Model/ }).className).not.toMatch(/thBand/);
    for (const row of screen.getAllByRole("row").slice(1)) {
      const [model, sold] = within(row).getAllByRole("cell");
      expect(sold!.className).toMatch(/tdBand/);
      expect(model!.className).not.toMatch(/tdBand/);
    }
  });

  it("is absent unless a column asks for it", () => {
    const { container } = render(<DataGrid<Row> rows={ROWS} columns={columns()} storageKey="t.band.b" rowKey={(r) => r.id} />);
    expect(container.querySelector('[class*="Band"]')).toBeNull();
  });
});

describe("RowTick · a tick that cannot be taken", () => {
  it("is greyed and says why on hover and to a screen reader", () => {
    render(<RowTick checked={false} disabled onChange={() => {}} label="Select Queen" why="Enough stock · nothing to buy" />);
    const box = screen.getByRole("checkbox", { name: "Select Queen. Enough stock · nothing to buy" });
    expect(box).toBeDisabled();
    expect(box.closest("label")!.className).toMatch(/checkRefused/);
    expect(box.closest("label")).toHaveAttribute("title", "Enough stock · nothing to buy");
  });

  it("a tick that can be taken is not greyed", () => {
    render(<RowTick checked={false} onChange={() => {}} label="Select Queen" />);
    expect(screen.getByRole("checkbox", { name: "Select Queen" }).closest("label")!.className).not.toMatch(/checkRefused/);
  });
});
