/**
 * ⭐ GROUP-LOCAL HEADERS — owner ruling 2026-09-18 (`docs/ui/MASTER.md` §6.7).
 *
 * A grouped Register carried ONE header above every group. By the third group
 * the words were off the top of the screen and the operator was matching a
 * date to a heading four groups up — on the page whose whole job is telling
 * them which number is which.
 *
 * ```
 * Need approval  3
 *   Status │ Proceed Date │ MPR No │ …      ← its own header, sticky in ITS group
 *   …rows…
 *
 * Need PO  2
 *   Status │ Proceed Date │ MPR No │ …      ← the SAME header, drawn again
 *   …rows…
 *
 * No PO needed  8                           ← collapsed: heading and count only
 * ```
 *
 * Each test below FAILS on the pre-ruling engine, and each failure is one
 * sentence of the ruling.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

interface Row {
  id: string;
  no: string;
  date: string;
  group: string;
}
const ROWS: Row[] = [
  { id: "a", no: "MPR-1", date: "1 Sep", group: "open" },
  { id: "b", no: "MPR-2", date: "2 Sep", group: "open" },
  { id: "c", no: "MPR-3", date: "3 Sep", group: "done" },
];
const COLUMNS: DataGridColumn<Row>[] = [
  { key: "date", label: "Proceed Date", width: 100, accessor: (r) => r.date },
  { key: "no", label: "MPR No", width: 140, accessor: (r) => r.no },
  { key: "extra", label: "Purpose", width: 120, accessor: () => "Ready Stock" },
];

function grouped(initiallyCollapsed = false) {
  return render(
    <DataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      storageKey={`group-headers.${Math.random()}`}
      rowKey={(r) => r.id}
      leadingColumns={{ date: "date", identity: "no" }}
      fixedGroups={{
        groups: [
          { key: "open", label: "Need PO", alwaysOpen: true },
          { key: "done", label: "No PO needed", initiallyCollapsed },
        ],
        groupOf: (r) => r.group,
      }}
    />,
  );
}

function ungrouped() {
  return render(
    <DataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      storageKey={`group-headers.flat.${Math.random()}`}
      rowKey={(r) => r.id}
    />,
  );
}

const headerRows = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('[data-testid^="grid-group-header-"]')];

describe("DataGrid · group-local headers", () => {
  it("an EXPANDED group states its columns immediately below its own heading", () => {
    const { container } = grouped();
    const body = container.querySelector<HTMLElement>('[data-testid="grid-group-body-open"]')!;
    const rows = [...body.children];
    /* Heading first, header second, records after — read in that order. */
    expect(rows[0]!.getAttribute("data-testid")).toBe("grid-group-open");
    expect(rows[1]!.getAttribute("data-testid")).toBe("grid-group-header-open");
    expect(within(body).getByText("MPR-1")).toBeInTheDocument();
  });

  it("the ONE header above the groups is GONE — no second copy to disagree with", () => {
    const { container } = grouped();
    expect(container.querySelectorAll("thead th")).toHaveLength(0);
  });

  it("every group draws the SAME header — one definition, one set of widths", () => {
    const { container } = grouped();
    const rows = headerRows(container);
    expect(rows.length).toBeGreaterThan(1);
    const shape = rows.map((r) =>
      [...r.querySelectorAll<HTMLElement>("th")].map((th) => `${th.title}:${th.style.width}`),
    );
    for (const s of shape.slice(1)) expect(s).toEqual(shape[0]);
  });

  it("a COLLAPSED group is its heading and its count, and draws no header", () => {
    const { container } = grouped(true);
    expect(container.querySelector('[data-testid="grid-group-done"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="grid-group-header-done"]')).toBeNull();
    /* Expanding it gives it the header, in the same place as its sibling's. */
    fireEvent.click(screen.getByTestId("grid-group-toggle-done"));
    expect(container.querySelector('[data-testid="grid-group-header-done"]')).not.toBeNull();
  });

  it("⭐ EACH GROUP IS ITS OWN `<tbody>` — which is what STOPS the sticky header at the boundary", () => {
    const { container } = grouped();
    /* A `position: sticky` row is held by its scroll container AND by its own
       containing block. Inside ONE tbody every group's header would stick at
       the same offset and stack; giving each group its own tbody makes the
       GROUP the containing block, so its header slides away at its last row
       and can never run on over the next group's heading. */
    const bodies = [...container.querySelectorAll("tbody[data-testid^='grid-group-body-']")];
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      const header = body.querySelector("[data-testid^='grid-group-header-']");
      /* A group's header belongs to that group's body and to no other. */
      if (header) expect(header.closest("tbody")).toBe(body);
    }
    /* And a row's group is simply the body it is in. */
    expect(screen.getByText("MPR-3").closest("tbody")!.getAttribute("data-testid")).toBe(
      "grid-group-body-done",
    );
  });

  it("the PINNED date and identity keep pinning inside a group header", () => {
    const { container } = grouped();
    const cells = [...headerRows(container)[0]!.querySelectorAll<HTMLElement>("th")];
    const date = cells.find((th) => th.title === "Proceed Date")!;
    const identity = cells.find((th) => th.title === "MPR No")!;
    const other = cells.find((th) => th.title === "Purpose")!;
    expect(date.style.left).not.toBe("");
    expect(identity.style.left).not.toBe("");
    /* The run stops at the identity; everything after it scrolls beneath. */
    expect(other.style.left).toBe("");
  });

  it("an UNGROUPED Register is unchanged — one sticky header at the top", () => {
    const { container } = ungrouped();
    expect(headerRows(container)).toHaveLength(0);
    expect(container.querySelectorAll("thead th").length).toBeGreaterThan(0);
  });

  it("sorting from a group header sorts the WHOLE Register, not that group", () => {
    const { container } = grouped();
    const openHeader = container.querySelector<HTMLElement>(
      '[data-testid="grid-group-header-open"]',
    )!;
    fireEvent.click(
      within(openHeader).getAllByRole("button", { name: /MPR No/ })[0]!,
    );
    /* One sort state, shared: the other group's header shows the same mark. */
    const doneHeader = container.querySelector<HTMLElement>(
      '[data-testid="grid-group-header-done"]',
    )!;
    expect(openHeader.textContent).toEqual(doneHeader.textContent);
  });
});
