/**
 * ⭐ §6.9 — THE EXPANSION CONNECTOR IS ANCHORED TO THE CARET CELL (Card 12
 * review, 2026-09-21).
 *
 * The line used to start inside the expansion cell at a fixed 10px, which is
 * 26px right of the `▸` on every listing. Now the grid draws the drop in the
 * caret's own cell and the curve in the expansion cell under it, and the
 * section stack carries the line flat to its first child. Positions are CSS
 * (50% of the caret cell), so jsdom asserts the STRUCTURE; the geometry was
 * measured in the rendered portal and is recorded in ui MASTER §6.9.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ConnectedSections, { CONNECT_AT_TABLE_HEADER } from "./ConnectedSections";

interface Row {
  id: string;
  so: string;
}
const ROWS: Row[] = [
  { id: "a", so: "SO-1" },
  { id: "b", so: "SO-2" },
];
const COLUMNS: DataGridColumn<Row>[] = [{ key: "so", label: "SO No", width: 90, accessor: (r) => r.so }];

function mountGrid(expansion: (r: Row) => JSX.Element, flush = true) {
  return render(
    <DataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      storageKey={`cs-${Math.random()}`}
      rowKey={(r) => r.id}
      expandable={{ flush, renderExpansion: expansion }}
    />,
  );
}

const sections = (key: string) => [
  { key, connectAt: CONNECT_AT_TABLE_HEADER, node: <table aria-label={`goods ${key}`} /> },
];

describe("the connector starts at the caret", () => {
  it("draws the drop in the caret cell and the curve in the gutter beneath it", () => {
    mountGrid((r) => <ConnectedSections sections={sections(r.id)} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]!);
    const caretCell = screen.getByRole("button", { name: "Collapse row" }).closest("td")!;
    expect(within(caretCell).getByTestId("expansion-connector-drop")).toBeInTheDocument();
    const gutter = screen.getByTestId("grid-expansion-gutter-__expand__");
    expect(within(gutter).getByTestId("expansion-connector-elbow")).toBeInTheDocument();
    /* Only the open row carries a drop. */
    expect(screen.getAllByTestId("expansion-connector-drop")).toHaveLength(1);
  });

  it("hands over at the expansion edge: a flat run to the first child, no second elbow", () => {
    mountGrid((r) => <ConnectedSections sections={sections(r.id)} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]!);
    const stack = document.querySelector("[data-connected-sections]")!;
    expect(stack).not.toBeNull();
    expect(within(stack as HTMLElement).getByTestId("section-run-a")).toBeInTheDocument();
    expect(within(stack as HTMLElement).queryByTestId("section-elbow-a")).toBeNull();
  });

  it("keeps later sections on the stack's own trunk", () => {
    mountGrid(() => (
      <ConnectedSections
        sections={[
          { key: "goods", connectAt: CONNECT_AT_TABLE_HEADER, node: <div /> },
          { key: "po", connectAt: "18px", node: <div /> },
        ]}
      />
    ));
    fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]!);
    expect(screen.getByTestId("section-run-goods")).toBeInTheDocument();
    expect(screen.getByTestId("section-trunk-goods")).toBeInTheDocument();
    expect(screen.getByTestId("section-elbow-po")).toBeInTheDocument();
  });
});

describe("outside a grid expansion nothing changes", () => {
  it("draws its own first elbow and does not mark itself for the grid", () => {
    render(<ConnectedSections sections={sections("x")} />);
    expect(screen.getByTestId("section-elbow-x")).toBeInTheDocument();
    expect(screen.queryByTestId("section-run-x")).toBeNull();
    expect(document.querySelector("[data-connected-sections]")).toBeNull();
  });

  it("a padded (non-flush) expansion keeps the stack's own first elbow", () => {
    mountGrid((r) => <ConnectedSections sections={sections(r.id)} />, false);
    fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]!);
    expect(screen.getByTestId("section-elbow-a")).toBeInTheDocument();
    expect(document.querySelector("[data-connected-sections]")).toBeNull();
  });

  it("a grid whose expansion is a plain table gets no connector marker", () => {
    mountGrid(() => <table aria-label="plain" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]!);
    /* The pieces exist but stay hidden: CSS shows them only beside
       `[data-connected-sections]`, which a plain expansion never renders. */
    expect(document.querySelector("[data-connected-sections]")).toBeNull();
  });
});
