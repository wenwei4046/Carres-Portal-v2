/**
 * ⭐ DATE FIRST, THEN IDENTITY — ui MASTER §6.7 rule 2 (Jess, 2026-09-17).
 *
 * `leadingColumns` is an ENGINE guarantee: the listing's record date and its
 * identity lead in that order, cannot be hidden or dragged away, and pin both
 * at a canvas ≥768px but only the identity below it. Asserted through the
 * inline offsets the engine writes (jsdom computes no layout).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

interface Row { id: string; so: string; date: string; customer: string }
const ROWS: Row[] = [
  { id: "a", so: "SO-1301", date: "Wed, 12 Aug", customer: "Tan Mei Ling" },
  { id: "b", so: "SO-1302", date: "Thu, 13 Aug", customer: "Lim Wei" },
];
/* The page's catalog deliberately puts identity first and date later: the
   engine, not the page's array order, must decide the leading pair. */
const COLUMNS: DataGridColumn<Row>[] = [
  { key: "so", label: "SO No", width: 80, accessor: (r) => r.so },
  { key: "customer", label: "Customer", width: 190, accessor: (r) => r.customer },
  { key: "date", label: "SO Date", width: 100, accessor: (r) => r.date },
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
      leadingColumns={{ date: "date", identity: "so" }}
      selectable={{ selectedKeys: new Set(), onToggle: () => {}, onToggleAll: () => {} }}
      expandable={{ renderExpansion: () => <div>goods</div> }}
    />,
  );
}

const headerLabels = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>("thead th")].slice(2).map((th) => th.getAttribute("title"));
const headerLefts = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>("thead th")].map((th) => th.style.left);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("DataGrid · leadingColumns", () => {
  it("puts date then identity first and pins BOTH on a canvas ≥768px", () => {
    stubCanvas(1140);
    const { container } = mount("test.leading.wide");
    expect(headerLabels(container)).toEqual(["SO Date", "SO No", "Customer"]);
    // 30 (☐) + 32 (▸) = 62 for the date; 62 + 100 = 162 for the identity.
    expect(headerLefts(container)).toEqual(["0px", "30px", "62px", "162px", ""]);
    expect([...container.querySelectorAll<HTMLElement>("tbody tr:first-child td")].map((td) => td.style.left))
      .toEqual(["0px", "30px", "62px", "162px", ""]);
  });

  it("pins the identity ALONE below a 768px canvas; the date scrolls under it", () => {
    stubCanvas(600);
    const { container } = mount("test.leading.narrow");
    expect(headerLabels(container)).toEqual(["SO Date", "SO No", "Customer"]);
    // Narrow gutter: the ☐ column is 40 wide, so the identity pins at 72.
    expect(headerLefts(container)).toEqual(["0px", "40px", "", "72px", ""]);
  });

  it("a saved layout from before the ruling can neither reorder nor hide the pair", () => {
    stubCanvas(1140);
    window.localStorage.setItem(
      "test.leading.saved",
      JSON.stringify({ order: ["customer", "so", "date"], hidden: ["date"], widths: {}, groupBy: [], pinned: [], sort: null }),
    );
    const { container } = mount("test.leading.saved");
    expect(headerLabels(container)).toEqual(["SO Date", "SO No", "Customer"]);
  });

  it("offers no hide for the pair: chooser boxes are disabled and the header menu omits Hide / Pin", () => {
    stubCanvas(1140);
    const { container } = mount("test.leading.chooser");
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    const menu = container.querySelector<HTMLElement>("header")!.parentElement!;
    expect(within(menu).getByRole("checkbox", { name: "SO Date" })).toBeDisabled();
    expect(within(menu).getByRole("checkbox", { name: "SO No" })).toBeDisabled();
    expect(within(menu).getByRole("checkbox", { name: "Customer" })).not.toBeDisabled();
    fireEvent.click(within(menu).getByRole("checkbox", { name: "SO Date" }));
    expect(headerLabels(container)).toEqual(["SO Date", "SO No", "Customer"]);

    const th = [...container.querySelectorAll<HTMLElement>("thead th")].find((el) => el.title === "SO Date")!;
    expect(th.draggable).toBe(false);
    fireEvent.contextMenu(th);
    expect(screen.queryByRole("button", { name: "Hide column" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pin left" })).toBeNull();
    const other = [...container.querySelectorAll<HTMLElement>("thead th")].find((el) => el.title === "Customer")!;
    fireEvent.contextMenu(other);
    expect(screen.getByRole("button", { name: "Hide column" })).toBeInTheDocument();
  });

  it("is OFF by default — the catalog order stands and nothing pins", () => {
    stubCanvas(1140);
    const { container } = render(
      <DataGrid<Row> rows={ROWS} columns={COLUMNS} storageKey="test.leading.off" rowKey={(r) => r.id} />,
    );
    expect([...container.querySelectorAll<HTMLElement>("thead th")].map((th) => th.title))
      .toEqual(["SO No", "Customer", "SO Date"]);
    expect(headerLefts(container).every((l) => l === "")).toBe(true);
  });
});

/**
 * ⭐ `before` — A COLUMN THE OWNER PUT AHEAD OF THE PAIR (Jess 2026-09-18).
 *
 * §6.7 rule 2 fixes the ORDER of the record date and the identity; it does not
 * make them the first two columns of every page. SO Batch Purchase's approved
 * order opens with `Status`, and an exact owner-approved page order may not be
 * rearranged by a general ordering heuristic.
 */
describe("DataGrid · leadingColumns.before", () => {
  const WITH_STATUS: DataGridColumn<Row>[] = [
    ...COLUMNS,
    { key: "status", label: "Status", width: 110, accessor: () => "Need PO" },
  ];

  function mountWithStatus(storageKey: string) {
    return render(
      <DataGrid<Row>
        rows={ROWS}
        columns={WITH_STATUS}
        storageKey={storageKey}
        rowKey={(r) => r.id}
        leadingColumns={{ date: "date", identity: "so", before: ["status"] }}
        selectable={{ selectedKeys: new Set(), onToggle: () => {}, onToggleAll: () => {} }}
        expandable={{ renderExpansion: () => <div>goods</div> }}
      />,
    );
  }

  it("leads the named column, then the date, then the identity", () => {
    stubCanvas(1140);
    const { container } = mountWithStatus("test.before.order");
    expect(headerLabels(container)).toEqual(["Status", "SO Date", "SO No", "Customer"]);
  });

  /** ⛔ THE PINNING RULE DOES NOT MOVE: only the PAIR pins. */
  it("pins the date and the identity, and not the column ahead of them", () => {
    stubCanvas(1140);
    const { container } = mountWithStatus("test.before.pins");
    const lefts = headerLefts(container);
    /* [☐, ▸, Status, SO Date, SO No, Customer] */
    expect(lefts[2]).toBe("");
    expect(lefts[3]).not.toBe("");
    expect(lefts[4]).not.toBe("");
    expect(lefts[5]).toBe("");
  });

  it("protects it from the Columns chooser exactly as it protects the pair", () => {
    stubCanvas(1140);
    const { container } = mountWithStatus("test.before.hide");
    window.localStorage.setItem(
      "test.before.hide",
      JSON.stringify({ order: ["customer", "so", "date", "status"], hidden: ["status", "date"], widths: {} }),
    );
    const again = mountWithStatus("test.before.hide");
    expect(headerLabels(again.container)).toEqual(["Status", "SO Date", "SO No", "Customer"]);
    expect(container).toBeTruthy();
  });

  it("changes nothing for a listing that names none", () => {
    stubCanvas(1140);
    const { container } = mount("test.before.absent");
    expect(headerLabels(container)).toEqual(["SO Date", "SO No", "Customer"]);
  });
});

/**
 * ⭐ THE MAIN HEADER'S FILL — UI §6.8 (Jess 2026-09-18). Opt-in, and
 * explicitly not a new global blue-header ruling.
 */
describe("DataGrid · headerTone", () => {
  it("marks the root so the main header band can read pale blue", () => {
    stubCanvas(1140);
    const { container } = render(
      <DataGrid<Row>
        rows={ROWS}
        columns={COLUMNS}
        storageKey="test.tone.on"
        rowKey={(r) => r.id}
        headerTone="paleBlue"
      />,
    );
    expect(container.querySelector('[class*="rootHeaderPaleBlue"]')).not.toBeNull();
  });

  it("leaves every other Register's header exactly as it was", () => {
    stubCanvas(1140);
    const { container } = render(
      <DataGrid<Row>
        rows={ROWS}
        columns={COLUMNS}
        storageKey="test.tone.off"
        rowKey={(r) => r.id}
      />,
    );
    expect(container.querySelector('[class*="rootHeaderPaleBlue"]')).toBeNull();
  });
});
