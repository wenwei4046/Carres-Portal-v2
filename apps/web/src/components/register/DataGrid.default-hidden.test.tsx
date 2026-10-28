/**
 * ⭐ A DEFAULT-HIDDEN COLUMN STAYS HIDDEN UNTIL THE PERSON CHOOSES IT.
 *
 * A layout with no saved order and no saved hidden is PRISTINE: it shows the
 * column spec's own defaults (`defaultHidden: true` columns hidden). The first
 * act that arranges the columns — pin, drag, hide, show, load — turns it into
 * the person's own layout, and that layout must START from what they were
 * looking at. Before this rule only the Columns checkbox wrote the defaults
 * out first; Pin left, a header drag and the header menu's Hide made the
 * layout non-pristine with an empty `hidden`, so every default-hidden column
 * appeared at once (measured by Purchasing on every page).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DataGrid, type DataGridColumn, type DataGridPersonalLayouts, type DataGridSavedLayout } from "./DataGrid";

interface Row { id: string; po: string; date: string; supplier: string; phone: string; note: string }
const ROWS: Row[] = [
  { id: "a", po: "PO-1001", date: "1 Sep", supplier: "Hooka", phone: "012-3456789", note: "Fragile" },
  { id: "b", po: "PO-1002", date: "2 Sep", supplier: "Nice Future", phone: "019-8765432", note: "" },
];
const COLUMNS: DataGridColumn<Row>[] = [
  { key: "date", label: "PO Date", width: 100, accessor: (r) => r.date },
  { key: "po", label: "PO No", width: 120, accessor: (r) => r.po },
  { key: "supplier", label: "Supplier", width: 150, accessor: (r) => r.supplier },
  { key: "phone", label: "Phone", width: 120, defaultHidden: true, accessor: (r) => r.phone },
  { key: "grn", label: "GRN No", width: 120, accessor: () => "GRN-1" },
  { key: "note", label: "Note", width: 160, defaultHidden: true, accessor: (r) => r.note },
];

function mount(key: string, extra: { personalLayouts?: DataGridPersonalLayouts; leading?: boolean } = {}) {
  return render(
    <DataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      storageKey={key}
      rowKey={(r) => r.id}
      leadingColumns={extra.leading ? { date: "date", identity: "po" } : undefined}
      personalLayouts={extra.personalLayouts}
    />,
  );
}

const headerCells = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("thead th")].filter((th) => th.title);
const heads = (c: HTMLElement) => headerCells(c).map((th) => th.title);
const th = (c: HTMLElement, label: string) => headerCells(c).find((el) => el.title === label)!;
const headerMenu = (c: HTMLElement, label: string, item: string) => {
  fireEvent.contextMenu(th(c, label));
  fireEvent.click(screen.getByRole("button", { name: item }));
};
const drag = (c: HTMLElement, from: string, to: string) => {
  const key = COLUMNS.find((col) => col.label === from)!.key;
  fireEvent.drop(th(c, to), { dataTransfer: { getData: () => key, setData: () => {} } });
};
const openColumns = () => fireEvent.click(screen.getByRole("button", { name: "Columns" }));
const stored = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? "null");

/** The register a new person first sees: Phone and Note held back. */
const AT_REST = ["PO Date", "PO No", "Supplier", "GRN No"];

afterEach(() => window.localStorage.clear());

describe("DataGrid · default-hidden columns on a pristine layout", () => {
  it("opens with the default-hidden columns held back", () => {
    const { container } = mount("dh.rest");
    expect(heads(container)).toEqual(AT_REST);
  });

  it("Pin left moves only that column — Phone and Note stay hidden", () => {
    const { container } = mount("dh.pin");
    headerMenu(container, "Supplier", "Pin left");
    expect(heads(container)).toEqual(["Supplier", "PO Date", "PO No", "GRN No"]);
  });

  it("a header drag moves only that column — Phone and Note stay hidden", () => {
    const { container } = mount("dh.drag");
    drag(container, "GRN No", "PO No");
    expect(heads(container)).toEqual(["PO Date", "GRN No", "PO No", "Supplier"]);
  });

  it("the header menu's Hide column hides only that column — Phone and Note stay hidden", () => {
    const { container } = mount("dh.hide");
    headerMenu(container, "Supplier", "Hide column");
    expect(heads(container)).toEqual(["PO Date", "PO No", "GRN No"]);
  });

  it("the header menu's Show {column} shows only that column", () => {
    const { container } = mount("dh.show");
    headerMenu(container, "Supplier", "Show Phone");
    expect(heads(container)).toEqual(["PO Date", "PO No", "Supplier", "Phone", "GRN No"]);
  });

  it("Columns can show every default-hidden column, one by one, and each one stays", () => {
    const { container } = mount("dh.chooser");
    openColumns();
    fireEvent.click(screen.getByRole("checkbox", { name: "Phone" }));
    expect(heads(container)).toEqual(["PO Date", "PO No", "Supplier", "Phone", "GRN No"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Note" }));
    expect(heads(container)).toEqual(["PO Date", "PO No", "Supplier", "Phone", "GRN No", "Note"]);
    expect(screen.getByRole("checkbox", { name: "Note" })).toBeChecked();
  });

  it("a header sort and Auto-fit width leave the layout pristine", () => {
    const { container } = mount("dh.sort");
    fireEvent.click(screen.getByRole("button", { name: "Supplier" }));
    headerMenu(container, "PO No", "Auto-fit width");
    expect(heads(container)).toEqual(AT_REST);
    expect(stored("dh.sort")).toMatchObject({ order: [], hidden: [], sort: { key: "supplier", dir: "asc" } });
  });

  it("the arrangement survives a remount", () => {
    const first = mount("dh.remount");
    headerMenu(first.container, "Supplier", "Pin left");
    first.unmount();
    const { container } = mount("dh.remount");
    expect(heads(container)).toEqual(["Supplier", "PO Date", "PO No", "GRN No"]);
  });

  it("Reset columns returns the pristine defaults after a pin, a hide and showing every default", () => {
    const { container } = mount("dh.reset");
    headerMenu(container, "Supplier", "Pin left");
    headerMenu(container, "GRN No", "Hide column");
    openColumns();
    fireEvent.click(screen.getByRole("checkbox", { name: "Phone" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Note" }));
    expect(heads(container)).toEqual(["Supplier", "PO Date", "PO No", "Phone", "Note"]);
    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
    expect(heads(container)).toEqual(AT_REST);
    // Pristine again: the next pin starts from the defaults, not from "show all".
    headerMenu(container, "GRN No", "Pin left");
    expect(heads(container)).toEqual(["GRN No", "PO Date", "PO No", "Supplier"]);
  });

  it("leading date + identity still lead after a pin on a pristine layout", () => {
    const { container } = mount("dh.leading", { leading: true });
    headerMenu(container, "GRN No", "Pin left");
    expect(heads(container)).toEqual(["PO Date", "PO No", "GRN No", "Supplier"]);
  });
});

describe("DataGrid · default-hidden columns with personal layouts", () => {
  const personal = (layouts: DataGridPersonalLayouts["layouts"] = []): DataGridPersonalLayouts => ({
    layouts,
    limit: 10,
    onSave: vi.fn(async () => {}),
    onSetDefault: vi.fn(async () => {}),
  });

  it("a layout saved after a pin keeps the default-hidden columns hidden", async () => {
    const props = personal();
    const { container } = mount("dh.save", { personalLayouts: props });
    headerMenu(container, "Supplier", "Pin left");
    openColumns();
    fireEvent.click(screen.getByRole("button", { name: "Save layout as…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Layout name" }), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));
    const [, saved] = vi.mocked(props.onSave).mock.calls[0]!;
    expect(saved.hidden).toEqual(["phone", "note"]);
  });

  it("a loaded layout keeps its own saved hidden, and a later pin does not change it", () => {
    const showsNote: DataGridSavedLayout = { order: ["date", "po", "supplier", "phone", "grn", "note"], hidden: ["phone"], widths: {}, sort: null };
    const { container } = mount("dh.load", { personalLayouts: personal([{ id: "l1", name: "Notes", layout: showsNote, isDefault: true }]) });
    expect(heads(container)).toEqual(["PO Date", "PO No", "Supplier", "GRN No", "Note"]);
    headerMenu(container, "Note", "Pin left");
    expect(heads(container)).toEqual(["Note", "PO Date", "PO No", "Supplier", "GRN No"]);
  });

  it("a loaded layout that hides nothing shows every column", () => {
    const showsAll: DataGridSavedLayout = { order: ["date", "po", "supplier", "phone", "grn", "note"], hidden: [], widths: {}, sort: null };
    const { container } = mount("dh.all", { personalLayouts: personal([{ id: "l1", name: "All", layout: showsAll, isDefault: true }]) });
    expect(heads(container)).toEqual(["PO Date", "PO No", "Supplier", "Phone", "GRN No", "Note"]);
  });
});
