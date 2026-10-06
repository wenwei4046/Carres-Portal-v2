import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DataGrid } from "./DataGrid";

const rows = [{ id: "a" }, { id: "b" }];
function Grid({ data = rows, target }: { data?: typeof rows; target?: string }) {
  return <DataGrid rows={data} columns={[{ key: "id", label: "SO No", accessor: row => row.id }]}
    rowKey={row => row.id} storageKey="test.delivery.reveal" appearance="reference"
    expandable={{ revealExpandedKey: target, renderExpansion: row => <div>Brief {row.id}</div> }} />;
}

afterEach(() => vi.restoreAllMocks());

describe("a card link reveals its exact register row", () => {
  it("waits for loaded rows, clears the sticky header and does not undo subsequent operator scrolling", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.gridExpansionKey === "b" ? 420 : 100;
      return { top, bottom: top + 36, left: 0, right: 600, width: 600, height: 36,
        x: 0, y: top, toJSON: () => ({}) };
    });
    const view = render(<Grid data={[]} target="b" />);
    view.rerender(<Grid target="b" />);
    expect(screen.getByText("Brief b")).toBeVisible();
    const viewport = screen.getByTestId("grid-scroll");
    expect(viewport.scrollTop).toBe(284);
    const targetRow = document.querySelector<HTMLTableRowElement>('[data-grid-expansion-key="b"]')!;
    expect(within(targetRow).getByRole("button", { name: "Collapse row" })).toHaveFocus();
    viewport.scrollTop = 80;
    view.rerender(<Grid data={[...rows]} target="b" />);
    expect(viewport.scrollTop).toBe(80);
  });

  it("does not expand or move an ordinary register without a card-link target", () => {
    render(<Grid />);
    expect(screen.queryByText("Brief a")).toBeNull();
    expect(screen.queryByText("Brief b")).toBeNull();
    expect(screen.getByTestId("grid-scroll").scrollTop).toBe(0);
  });
});
