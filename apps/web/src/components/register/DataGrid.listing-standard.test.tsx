/**
 * LISTING STANDARD — owner approved 2026-09-16, the shared engine half.
 *
 * Every capability here is default-safe or opt-in, and each is asserted at the
 * engine so every register that runs it inherits the same behaviour:
 *   · `Reset columns` names the act
 *   · a grid is ONE Tab stop; ↑/↓ move row to row; Shift+F10 / Menu key open
 *     the row menu, which takes focus and gives it back
 *   · a governed group heading is reachable by Tab
 *   · a load failure keeps the toolbar
 *   · a cut value opens whole by click or keyboard (`overflowText`)
 *   · below a 768px canvas the row checkbox has a 40×40 target
 *   · with the governed search, the query is a condition and `Clear filters`
 *     clears it — and a no-match state never shows the button twice
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";
import styles from "./DataGrid.module.css";

interface Row {
  id: string;
  so: string;
  customer: string;
}

const ROWS: Row[] = [
  { id: "a", so: "SO-1301", customer: "Tan Sri Dato' Seri Muhammad Hafizuddin" },
  { id: "b", so: "SO-1302", customer: "Lim Wei" },
  { id: "c", so: "SO-1303", customer: "Wong Mei Ling" },
];

const COLUMNS: DataGridColumn<Row>[] = [
  {
    key: "so",
    label: "SO No",
    width: 85,
    accessor: (r) => (
      <button type="button" data-testid={`link-${r.id}`}>
        {r.so}
      </button>
    ),
    searchValue: (r) => r.so,
  },
  { key: "customer", label: "Customer", width: 190, accessor: (r) => r.customer, overflowText: (r) => r.customer },
];

const menu = (onCancel = vi.fn()) => () => [
  { label: "View", onClick: vi.fn() },
  { divider: true },
  { label: "Cancel SO", danger: true, onClick: onCancel },
];

function mount(extra: Partial<Parameters<typeof DataGrid<Row>>[0]> = {}) {
  return render(
    <DataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      storageKey={`ls-${Math.random()}`}
      rowKey={(r) => r.id}
      contextMenu={menu()}
      {...extra}
    />,
  );
}

const parentRows = () =>
  [...document.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row-nav]")];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Columns · Reset columns", () => {
  it("names the reset act `Reset columns`, not a bare `Reset`", () => {
    mount({ appearance: "reference", labelledToolbar: true });
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    expect(screen.getByRole("button", { name: "Reset columns" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });
});

describe("keyboard rows", () => {
  it("makes the grid ONE Tab stop and moves row to row with the arrows", () => {
    mount();
    const rows = parentRows();
    expect(rows.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    act(() => rows[0]!.focus());
    fireEvent.keyDown(rows[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    /* The Tab stop follows the operator, so Tab-away-and-back returns here. */
    expect(parentRows().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(rows[1]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
  });

  it("Enter opens what a double-click opens; Space ticks the row", () => {
    const open = vi.fn();
    const onToggle = vi.fn();
    mount({ onRowDoubleClick: open, selectable: { selectedKeys: new Set(), onToggle, onToggleAll: vi.fn() } });
    const row = parentRows()[1]!;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(open).toHaveBeenCalledWith(ROWS[1]);
    fireEvent.keyDown(row, { key: " " });
    expect(onToggle).toHaveBeenCalledWith("b");
  });

  it("Shift+F10 opens the row menu with focus on its first act; Escape gives focus back", () => {
    const onCancel = vi.fn();
    mount({ contextMenu: menu(onCancel) });
    const row = parentRows()[0]!;
    act(() => row.focus());
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["View", "Cancel SO"]);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("the Menu key opens the same menu from a control INSIDE the row", () => {
    mount();
    const link = screen.getByTestId("link-b");
    act(() => link.focus());
    fireEvent.keyDown(link, { key: "ContextMenu" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(link);
  });

  it("controls inside a row keep their own arrow keys", () => {
    mount();
    const link = screen.getByTestId("link-a");
    act(() => link.focus());
    fireEvent.keyDown(link, { key: "ArrowDown" });
    expect(document.activeElement).toBe(link);
  });

  it("a governed group heading is reachable by Tab", () => {
    mount({
      fixedGroups: {
        groups: [{ key: "open", label: "To buy", alwaysOpen: true }, { key: "rest", label: "Other" }],
        groupOf: (r) => (r.id === "a" ? "open" : "rest"),
      },
    });
    expect(screen.getByRole("heading", { name: /To buy/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("grid-group-toggle-rest").tagName).toBe("BUTTON");
  });
});

describe("load failure keeps the toolbar", () => {
  it("draws the page's error inside the work surface, with the toolbar and its create action still there", () => {
    mount({
      appearance: "reference",
      labelledToolbar: true,
      toolbarStart: <button type="button">New Sales Order</button>,
      errorState: <div role="alert">Sales orders could not be loaded</div>,
      statusSummary: (rows) => <span>{`${rows.length} sales orders`}</span>,
    });
    expect(within(screen.getByTestId("work-toolbar")).getByRole("button", { name: "New Sales Order" })).toBeInTheDocument();
    expect(within(screen.getByTestId("grid-error")).getByRole("alert")).toHaveTextContent("Sales orders could not be loaded");
    expect(parentRows()).toHaveLength(0);
    /* A failed read is not `0 sales orders`. */
    expect(screen.getByTestId("grid-footer")).not.toHaveTextContent("sales orders");
  });
});

describe("a cut value opens whole", () => {
  it("turns ONLY a cut cell into a Popover trigger that opens the full value", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
      return (this.textContent ?? "").length > 20 ? 400 : 50;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(180);
    mount();
    const triggers = screen.getAllByTestId("cell-overflow");
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toHaveAccessibleName("Customer: Tan Sri Dato' Seri Muhammad Hafizuddin");
    fireEvent.click(triggers[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Tan Sri Dato' Seri Muhammad Hafizuddin");
    /* Opening the value never selects or opens the row. */
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("prints a value that fits as plain text — no extra control per cell", () => {
    mount();
    expect(screen.queryAllByTestId("cell-overflow")).toHaveLength(0);
    expect(screen.getByText("Lim Wei").closest("button")).toBeNull();
  });
});

describe("touch target below a 768px canvas", () => {
  function stubViewport(width: number) {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  }
  const selectable = { selectedKeys: new Set<string>(), onToggle: vi.fn(), onToggleAll: vi.fn() };

  it("wraps the row checkbox in a 40×40 target and widens its column to 40", () => {
    stubViewport(600);
    mount({ selectable });
    const box = screen.getAllByRole("checkbox", { name: "Select row" })[0]!;
    expect(box.parentElement).toHaveClass(styles.checkHitNarrow);
    expect(box.closest("td")!.style.width).toBe("40px");
  });

  it("keeps the dense 30px gutter on a wide canvas", () => {
    stubViewport(1140);
    mount({ selectable });
    const box = screen.getAllByRole("checkbox", { name: "Select row" })[0]!;
    expect(box.parentElement).not.toHaveClass(styles.checkHitNarrow);
    expect(box.closest("td")!.style.width).toBe("30px");
  });
});

describe("the governed search is a condition", () => {
  it("lists the query and `Clear filters` clears it, which re-asks the server for everything", async () => {
    const onSearchChange = vi.fn();
    mount({ searchPresentation: "responsive", onSearchChange });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "SO-1302" } });
    await waitFor(() => expect(onSearchChange).toHaveBeenLastCalledWith("SO-1302"));
    expect(screen.getByTestId("active-conditions")).toHaveTextContent("Search: SO-1302");
    fireEvent.click(screen.getByTestId("clear-filters"));
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
    await waitFor(() => expect(onSearchChange).toHaveBeenLastCalledWith(""));
    expect(screen.queryByTestId("active-conditions")).toBeNull();
  });

  it("shows ONE `Clear filters` when nothing matches", async () => {
    mount({ searchPresentation: "responsive", noMatchMessage: "No sales orders match these filters" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "nothing-like-this" } });
    await screen.findByText("No sales orders match these filters");
    expect(screen.getAllByRole("button", { name: "Clear filters" })).toHaveLength(1);
    expect(screen.getByTestId("active-conditions")).toHaveTextContent("Search: nothing-like-this");
  });

  it("leaves a grid without the governed search exactly as it was", async () => {
    mount();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "SO-1302" } });
    await waitFor(() => expect(screen.queryByTestId("link-a")).toBeNull());
    expect(screen.getByTestId("link-b")).toBeInTheDocument();
    expect(screen.queryByTestId("active-conditions")).toBeNull();
  });
});
