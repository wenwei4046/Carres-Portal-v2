/**
 * The three shells — `PageShell` · `DataTable` · `DetailShell` (card D0.5c).
 *
 * `DetailShell`'s seven `@ts-expect-error` blocks are the point of the card:
 * they pass by FAILING TO COMPILE, so they are checked by `tsc -p
 * tsconfig.app.json` rather than by the runner. Delete the constraint each one
 * guards and typecheck goes red.
 *
 * NEGATIVE CONTROLS (run by hand when touching this file):
 *   · make `currentIssues: []` render a container → exactly the "renders
 *     nothing" test goes red, nothing else moves.
 *   · give `PageShell`'s list variant a `kpi` slot → exactly the variant test's
 *     `@ts-expect-error` reports as unused.
 *   · let `DataTable`'s row click fire from the checkbox cell → exactly the
 *     stopPropagation test goes red.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DataTable, { type Column } from "./DataTable";
import DetailShell, { type DetailShellProps } from "./DetailShell";
import PageShell, { BAND_HEIGHT, CHROME_BUDGET } from "./PageShell";

/* ───────────────────────────────────────────────────────────────────────────
 * DetailShell — L4's seven constraints, as types
 * ────────────────────────────────────────────────────────────────────────── */

const BASE: DetailShellProps = {
  identity: {
    primary: "SO-1256 · Tan Wei Ming",
    persistentFacts: [
      { label: "Customer", value: "Tan Wei Ming" },
      { label: "Ref", value: "SO-1256" },
      { label: "Promised", value: "Sun, 27 Jul 26" },
      { label: "Outstanding", value: "RM 2,000" },
    ],
  },
  currentAction: { answer: "Call NETS — confirm delivery date" },
  currentIssues: [],
  progress: {
    steps: [
      { id: "placed", label: "Placed", state: "done" },
      { id: "proceed", label: "Proceed", state: "current" },
      { id: "deliver", label: "Deliver", state: "todo" },
    ],
  },
  sections: [],
};

describe("DetailShell — the types L4 demands", () => {
  it("refuses everything L4 says must be impossible", () => {
    // 1 — the reason the record is open cannot be hidden
    // @ts-expect-error — currentAction has no `collapsible`
    void <DetailShell {...BASE} currentAction={{ answer: "x", collapsible: true }} />;
    // @ts-expect-error — currentAction has no `hidden`
    void <DetailShell {...BASE} currentAction={{ answer: "x", hidden: true }} />;
    /* 2 — "✓ None" is not expressible.
     *
     * Written WITHOUT a spread on purpose: TypeScript switches excess-property
     * checking off for a JSX element that carries a `{...spread}`, so
     * `<DetailShell {...BASE} emptyLabel="None" />` compiles happily and the
     * directive reports as unused. Measured, not guessed — that is exactly how
     * this line first failed. */
    void (
      <DetailShell
        identity={BASE.identity}
        currentAction={BASE.currentAction}
        currentIssues={[]}
        progress={BASE.progress}
        sections={[]}
        // @ts-expect-error — there is no emptyLabel for an empty issue list
        emptyLabel="None"
      />
    );
    // 3 — named ordered slots, never children (again: no spread, same reason)
    void (
      // @ts-expect-error — the shell takes no children
      <DetailShell
        identity={BASE.identity}
        currentAction={BASE.currentAction}
        currentIssues={[]}
        progress={BASE.progress}
        sections={[]}
      >
        anything
      </DetailShell>
    );
    // 4 — Progress is not a second timeline, and grows no buttons
    // @ts-expect-error — progress has no events
    void <DetailShell {...BASE} progress={{ steps: [], events: [] }} />;
    // @ts-expect-error — progress has no actor
    void <DetailShell {...BASE} progress={{ steps: [], actor: "Jess" }} />;
    // @ts-expect-error — progress has no timestamp
    void <DetailShell {...BASE} progress={{ steps: [], timestamp: "2026-07-28" }} />;
    // @ts-expect-error — progress has no kpi
    void <DetailShell {...BASE} progress={{ steps: [], kpi: 1 }} />;
    // @ts-expect-error — progress has no actions
    void <DetailShell {...BASE} progress={{ steps: [], actions: [] }} />;
    // 5 — Header Everything has nowhere to start
    void (
      <DetailShell
        {...BASE}
        identity={{
          primary: "x",
          // @ts-expect-error — the set is FULL at four; a fifth means removing one
          persistentFacts: [
            { label: "a", value: 1 },
            { label: "b", value: 2 },
            { label: "c", value: 3 },
            { label: "d", value: 4 },
            { label: "e", value: 5 },
          ],
        }}
      />
    );
    // @ts-expect-error — identity takes values only, never a door
    void <DetailShell {...BASE} identity={{ ...BASE.identity, onAction: () => {} }} />;
    // 6 — a fourth business category does not compile
    void (
      <DetailShell
        {...BASE}
        // @ts-expect-error — "finance" is not an OrderActionTrack
        sections={[{ id: "s", label: "Payment", track: "finance", children: null }]}
      />
    );
    // 7 — Detail is a route, never a render prop
    void (
      <DetailShell
        {...BASE}
        sections={[
          // @ts-expect-error — there is no Detail render prop
          { id: "s", label: "Items", track: "goods", children: null, detail: () => null },
        ]}
      />
    );
    expect(true).toBe(true);
  });

  it("renders the blocks in §1.4's order, and only those", () => {
    render(
      <DetailShell
        {...BASE}
        currentIssues={[{ id: "i1", track: "money", text: "RM 2,000 is holding the delivery", holding: true }]}
        sections={[{ id: "items", label: "Items", track: "goods", children: <p>lines</p> }]}
        activity={{ children: <p>history</p> }}
      />,
    );
    const order = Array.from(document.querySelectorAll("[data-kit^='detail-']"))
      .map((n) => n.getAttribute("data-kit"))
      .filter((k) =>
        [
          "detail-identity",
          "detail-current-action",
          "detail-current-issues",
          "detail-progress",
          "detail-sections",
          "detail-activity",
        ].includes(k ?? ""),
      );
    expect(order).toEqual([
      "detail-identity",
      "detail-current-action",
      "detail-current-issues",
      "detail-progress",
      "detail-sections",
      "detail-activity",
    ]);
  });

  it("renders NO issues container when there are none — absent, not empty", () => {
    render(<DetailShell {...BASE} />);
    expect(document.querySelector('[data-kit="detail-current-issues"]')).not.toBeInTheDocument();
    // and nothing reassuring is said in its place
    expect(screen.queryByText(/none/i)).not.toBeInTheDocument();
    expect(screen.queryByText("✓")).not.toBeInTheDocument();
  });

  it("always renders the current action — there is no branch that hides it", () => {
    render(<DetailShell {...BASE} currentAction={{ answer: "Nothing to do" }} />);
    expect(screen.getByText("Nothing to do")).toBeInTheDocument();
  });

  it("carries exactly four persistent facts and no fifth", () => {
    render(<DetailShell {...BASE} />);
    expect(document.querySelectorAll('[data-kit="detail-fact"]')).toHaveLength(4);
  });

  it("prints no state word of its own in any of the four states", () => {
    const { rerender } = render(<DetailShell {...BASE} />);
    for (const word of ["Working", "Blocked", "Waiting", "Completed"]) {
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    }
    rerender(
      <DetailShell
        {...BASE}
        currentIssues={[{ id: "i", track: "goods", text: "no PO", holding: true }]}
      />,
    );
    for (const word of ["Working", "Blocked", "Waiting", "Completed"]) {
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    }
  });

  it("groups issues by the SAME three tracks the list row uses", () => {
    render(
      <DetailShell
        {...BASE}
        currentIssues={[
          { id: "a", track: "goods", text: "g" },
          { id: "b", track: "delivery", text: "d" },
          { id: "c", track: "money", text: "m" },
        ]}
      />,
    );
    const tracks = Array.from(document.querySelectorAll('[data-kit="detail-issue"]')).map((n) =>
      n.getAttribute("data-track"),
    );
    expect(tracks).toEqual(["goods", "delivery", "money"]);
  });

  it("opens the first section by default and switches on request", () => {
    const onSectionChange = vi.fn();
    render(
      <DetailShell
        {...BASE}
        sections={[
          { id: "items", label: "Items", track: "goods", children: <p>lines</p> },
          { id: "payment", label: "Payment", track: "money", children: <p>money</p> },
        ]}
        onSectionChange={onSectionChange}
      />,
    );
    expect(screen.getByText("lines")).toBeInTheDocument();
    expect(screen.queryByText("money")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Payment/ }));
    expect(onSectionChange).toHaveBeenCalledWith("payment");
  });

  it("renders Detail as a LINK, so it can never absorb a page", () => {
    render(
      <DetailShell
        {...BASE}
        sections={[{ id: "items", label: "Items", track: "goods", detailHref: "/orders/1/items", children: null }]}
      />,
    );
    expect(document.querySelector('[data-kit="detail-href"]')).toHaveAttribute("href", "/orders/1/items");
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * PageShell — §1.3's budget as a type
 * ────────────────────────────────────────────────────────────────────────── */

describe("PageShell", () => {
  it("gives a dashboard a KPI band and refuses one to a list", () => {
    void <PageShell variant="dashboard" kpi={<span>hero</span>}>rows</PageShell>;
    // @ts-expect-error — §1.3: variant="list" has no kpi slot at all
    void <PageShell variant="list" kpi={<span>hero</span>}>rows</PageShell>;
    // @ts-expect-error — there is no extra band, on any variant
    void <PageShell variant="list" extraBand={<span>x</span>}>rows</PageShell>;
    // @ts-expect-error — a kit component cannot be restyled by its caller
    void <PageShell variant="list" className="p-10">rows</PageShell>;
    expect(true).toBe(true);
  });

  it("renders the dashboard's KPI band and nothing like it on a list", () => {
    const { rerender } = render(
      <PageShell variant="dashboard" kpi={<span>RM 56,859</span>}>
        <p>body</p>
      </PageShell>,
    );
    expect(document.querySelector('[data-kit="page-kpi"]')).toBeInTheDocument();
    rerender(
      <PageShell variant="list">
        <p>body</p>
      </PageShell>,
    );
    expect(document.querySelector('[data-kit="page-kpi"]')).not.toBeInTheDocument();
  });

  it("hides the chip row entirely when no filter is on — height 0, not an empty band", () => {
    const { rerender } = render(
      <PageShell variant="list" chips={[]}>
        <p>body</p>
      </PageShell>,
    );
    expect(document.querySelector('[data-kit="page-chips"]')).not.toBeInTheDocument();
    rerender(
      <PageShell variant="list" chips={[{ label: "Region: KV", onClear: () => {} }]}>
        <p>body</p>
      </PageShell>,
    );
    expect(screen.getByText("Region: KV")).toBeInTheDocument();
  });

  it("lets the bulk bar REPLACE the toolbar in place, so nothing jumps", () => {
    render(
      <PageShell variant="list" toolbar={<span>tabs</span>} bulkBar={<span>3 selected</span>}>
        <p>body</p>
      </PageShell>,
    );
    expect(document.querySelector('[data-kit="page-bulkbar"]')).toBeInTheDocument();
    expect(document.querySelector('[data-kit="page-toolbar"]')).not.toBeInTheDocument();
  });

  it("skips the title band on a module-tabbed page (§8.3)", () => {
    const { rerender } = render(
      <PageShell variant="list">
        <p>body</p>
      </PageShell>,
    );
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    rerender(
      <PageShell variant="list" title="Orders">
        <p>body</p>
      </PageShell>,
    );
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });

  it("keeps §1.3's budget and §8.1's band table in ONE place", () => {
    expect(CHROME_BUDGET.list).toBe(200);
    expect(CHROME_BUDGET.dashboard).toBe(280);
    expect(CHROME_BUDGET.detail).toBeNull();
  });

  /**
   * A REPORTED CONTRADICTION, pinned as a number rather than argued about.
   *
   * §1.3 budgets a list page at **200px** of fixed chrome. §8.1's own band
   * table — the one this component implements — sums to **208px** when every
   * band draws. The two sentences are in the same document and cannot both
   * hold, so this test states the arithmetic instead of asserting a pass, and
   * the finding goes back to the kit.
   *
   * The budget IS met in the two shapes the law actually describes: with no
   * filter on (the chip row is height 0) it is 180, and §1.3's own D6
   * projection — where the toolbar folds into the title band — is 168.
   */
  it("records that every band drawing at once exceeds the list budget by 8px", () => {
    const everyBand =
      BAND_HEIGHT.title + BAND_HEIGHT.toolbar + BAND_HEIGHT.chips + BAND_HEIGHT.tableHeader +
      BAND_HEIGHT.footer + BAND_HEIGHT.padding;
    expect(everyBand).toBe(208);
    expect(everyBand).toBeGreaterThan(CHROME_BUDGET.list!);

    const noFilterOn = everyBand - BAND_HEIGHT.chips;
    expect(noFilterOn).toBe(180);
    expect(noFilterOn).toBeLessThanOrEqual(CHROME_BUDGET.list!);

    // §1.3's D6 projection: the toolbar folds into the title band.
    const d6 = everyBand - BAND_HEIGHT.toolbar;
    expect(d6).toBe(168);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * DataTable — the Orders table's own properties
 * ────────────────────────────────────────────────────────────────────────── */

interface Row {
  id: string;
  ref: string;
  amount: string;
}

const ROWS: Row[] = [
  { id: "1", ref: "SO-1256", amount: "2,000" },
  { id: "2", ref: "SO-1257", amount: "480" },
];

const COLUMNS: Column<Row>[] = [
  { key: "ref", label: "Order", width: 60, cell: (r) => r.ref },
  { key: "amount", label: "Outstanding", width: 40, align: "right", numeric: true, cell: (r) => r.amount },
];

describe("DataTable", () => {
  it("takes its header word from the column def — one place it can be typed", () => {
    render(<DataTable label="Orders" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="none" />);
    expect(screen.getByRole("columnheader", { name: "Order" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Outstanding" })).toBeInTheDocument();
  });

  it("never scrolls sideways — table-fixed with percentage widths", () => {
    render(<DataTable label="Orders" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="none" />);
    const table = screen.getByRole("table");
    expect(table).toHaveClass("table-fixed");
    const widths = Array.from(table.querySelectorAll("col")).map((c) => (c as HTMLElement).style.width);
    expect(widths).toEqual(["60%", "40%"]);
  });

  it("opens the record on a row click, and NOT from the checkbox that ticks it", () => {
    const onRowOpen = vi.fn();
    const onToggleRow = vi.fn();
    render(
      <DataTable
        label="Orders"
        rows={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        onRowOpen={onRowOpen}
        selection={{ selected: new Set(), onToggleRow, onToggleAll: () => {}, label: "Select all" }}
        empty="none"
      />,
    );
    fireEvent.click(screen.getByText("SO-1256"));
    expect(onRowOpen).toHaveBeenCalledTimes(1);

    onRowOpen.mockClear();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 1" }));
    expect(onToggleRow).toHaveBeenCalledWith("1");
    expect(onRowOpen).not.toHaveBeenCalled();
  });

  it("shows the select-all as SOME when only part of the page is picked", () => {
    render(
      <DataTable
        label="Orders"
        rows={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        selection={{ selected: new Set(["1"]), onToggleRow: () => {}, onToggleAll: () => {}, label: "Select all" }}
        empty="none"
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveAttribute(
      "data-state",
      "indeterminate",
    );
  });

  it("has no checkbox column at all when the table is not selectable", () => {
    render(<DataTable label="Orders" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="none" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("says why it is empty instead of drawing a blank body", () => {
    render(<DataTable label="Orders" rows={[]} columns={COLUMNS} rowId={(r) => r.id} empty="No orders match this filter" />);
    expect(screen.getByText("No orders match this filter")).toBeInTheDocument();
  });

  it("shows shape, not words, while it is loading", () => {
    render(<DataTable label="Orders" rows={[]} columns={COLUMNS} rowId={(r) => r.id} loading empty="none" />);
    expect(document.querySelector('[data-testid="kit-loading-skeleton"]')).toBeInTheDocument();
    expect(screen.queryByText("none")).not.toBeInTheDocument();
  });

  it("washes a selected row blue and never grey (§3.5)", () => {
    render(
      <DataTable
        label="Orders"
        rows={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        selection={{ selected: new Set(["1"]), onToggleRow: () => {}, onToggleAll: () => {}, label: "Select all" }}
        empty="none"
      />,
    );
    const rows = document.querySelectorAll('[data-kit="data-row"]');
    expect(rows[0]).toHaveClass("bg-kit-blue-3");
    expect(rows[1]).toHaveClass("hover:bg-kit-blue-3");
  });
});
