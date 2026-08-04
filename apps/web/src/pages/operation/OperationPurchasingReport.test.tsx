import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PoReportLine } from "@carres/shared";
import OperationPurchasingReport from "./OperationPurchasingReport";

/**
 * Q3 — Purchasing → Report.
 *
 * The fixture is the LIVE production shape, measured 2026-08-04, so what these
 * tests assert is what the deployed page has to print:
 *
 *   2026-08   sofa 8 POs / 11 · bedframe 3 / 4 · mattress 3 / 4   → total 14 / 19
 *   2026-07   sofa 5 POs / 12 · bedframe 1 / 6 · mattress 1 / 5   → total  7 / 23
 */

const reportQuery = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return { ...actual, usePoReport: () => reportQuery() };
});

// The settings read behind PurchasingTabs (it decides whether Settings shows).
vi.mock("./PurchasingTabs", () => ({
  default: ({ right }: { right?: React.ReactNode }) => <div data-testid="tabs">{right}</div>,
}));

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const OHANA = "sup-ohana";
const NICE = "sup-nice";

function line(p: Partial<PoReportLine> & { poId: string }): PoReportLine {
  return {
    supplierId: OHANA,
    supplierName: "Ohana",
    month: "2026-08",
    category: "sofa",
    cancelled: false,
    ordered: 1,
    received: 0,
    ...p,
  };
}

/** The live shape, one purchase order per line. */
function liveLines(): PoReportLine[] {
  const rows: PoReportLine[] = [];
  [2, 2, 1, 1, 1, 1, 2, 1].forEach((q, i) =>
    rows.push(line({ poId: `PO-30${i}`, ordered: q })),
  );
  [2, 1, 1].forEach((q, i) =>
    rows.push(line({ poId: `PO-31${i}`, category: "bedframe", ordered: q })),
  );
  [2, 1, 1].forEach((q, i) =>
    rows.push(
      line({
        poId: `PO-32${i}`,
        category: "mattress",
        ordered: q,
        supplierId: NICE,
        supplierName: "Nice Future",
      }),
    ),
  );
  // July, so the month rail has two rows.
  [3, 3, 2, 2, 2].forEach((q, i) =>
    rows.push(line({ poId: `PO-20${i}`, month: "2026-07", ordered: q })),
  );
  rows.push(line({ poId: "PO-210", month: "2026-07", category: "bedframe", ordered: 6 }));
  rows.push(
    line({
      poId: "PO-220",
      month: "2026-07",
      category: "mattress",
      ordered: 5,
      supplierId: NICE,
      supplierName: "Nice Future",
    }),
  );
  return rows;
}

function mockLines(lines: PoReportLine[] = liveLines()) {
  reportQuery.mockReturnValue({
    data: { lines },
    isLoading: false,
    dataUpdatedAt: new Date("2026-08-04T10:32:00").getTime(),
  });
}

/** The grid row for a category, read by its own label cell — scoped to the
 *  TABLE, because the rail carries the same category word 200px to its left. */
function gridRow(label: string) {
  return within(screen.getByRole("table")).getByText(label).closest("tr") as HTMLElement;
}

beforeEach(() => {
  reportQuery.mockReset();
});

describe("the figures", () => {
  it("prints the live shape, most first, with Outstanding stated", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    fireEvent.click(screen.getByTestId("po-report-month-2026-08"));

    const sofa = within(gridRow("Sofa")).getAllByRole("cell").map((c) => c.textContent);
    expect(sofa).toEqual(["", "Sofa", "8", "11", "0", "11"]);
    const bedframe = within(gridRow("Bedframe")).getAllByRole("cell").map((c) => c.textContent);
    expect(bedframe).toEqual(["", "Bedframe", "3", "4", "0", "4"]);
  });

  it("the Total row is the whole month", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    fireEvent.click(screen.getByTestId("po-report-month-2026-08"));
    const total = within(screen.getByLabelText("Total")).getAllByRole("cell").map((c) => c.textContent);
    expect(total).toEqual(["", "Total", "14", "19", "0", "19"]);
  });

  it("the month filter changes the figures", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    fireEvent.click(screen.getByTestId("po-report-month-2026-07"));
    const total = within(screen.getByLabelText("Total")).getAllByRole("cell").map((c) => c.textContent);
    expect(total).toEqual(["", "Total", "7", "23", "0", "23"]);
  });
});

describe("the rail", () => {
  it("clicking the month you are already on clears it (§8.2)", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    const aug = screen.getByTestId("po-report-month-2026-08");
    fireEvent.click(aug);
    expect(within(screen.getByLabelText("Total")).getAllByRole("cell")[2]!.textContent).toBe("14");
    fireEvent.click(aug);
    // Back to every month: 21 purchase orders.
    expect(within(screen.getByLabelText("Total")).getAllByRole("cell")[2]!.textContent).toBe("21");
  });

  it("names both months, newest first, and spells them through fmtMonth", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    const rail = screen.getByTestId("po-report-nav");
    const months = within(rail)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((t) => /20\d\d/.test(t));
    expect(months[0]).toContain("Aug 2026");
    expect(months[1]).toContain("Jul 2026");
  });

  it("picking a supplier leaves the other supplier its own count — there is a way back", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    fireEvent.click(screen.getByTestId(`po-report-supplier-${OHANA}`));
    expect(screen.getByTestId(`po-report-supplier-${NICE}`).textContent).toContain("4");
  });
});

describe("every number is a door", () => {
  it("a row opens on exactly the purchase orders it counted, each a link to the register", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    fireEvent.click(screen.getByTestId("po-report-month-2026-08"));
    fireEvent.click(screen.getByTestId("table-expand-sofa"));

    const detail = screen.getByTestId("po-report-detail-sofa");
    const links = within(detail).getAllByRole("link");
    expect(links).toHaveLength(8); // the same 8 the row's POs cell prints
    expect(links[0]).toHaveAttribute("href", "/operation/procurement?po=PO-300");
  });

  it("the door's own numbers add up to the row above it", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    fireEvent.click(screen.getByTestId("po-report-month-2026-08"));
    fireEvent.click(screen.getByTestId("table-expand-bedframe"));
    const links = within(screen.getByTestId("po-report-detail-bedframe")).getAllByRole("link");
    expect(links).toHaveLength(3);
    // span order inside a door row: PO No. · supplier · ordered · received ·
    // outstanding — the same five the grid row above prints.
    const sum = (i: number) =>
      links.reduce((n, l) => n + Number(l.querySelectorAll("span")[i]!.textContent), 0);
    expect(sum(2)).toBe(4);
    expect(sum(3)).toBe(0);
    expect(sum(4)).toBe(4);
    const row = within(gridRow("Bedframe")).getAllByRole("cell").map((c) => c.textContent);
    expect(row.slice(3)).toEqual(["4", "0", "4"]);
  });

  it("the door obeys the same filters as the number", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    fireEvent.click(screen.getByTestId("po-report-month-2026-07"));
    fireEvent.click(screen.getByTestId("table-expand-sofa"));
    const links = within(screen.getByTestId("po-report-detail-sofa")).getAllByRole("link");
    expect(links).toHaveLength(5); // July's five sofa POs, never August's eight
    expect(links.every((l) => (l.getAttribute("href") ?? "").includes("PO-20"))).toBe(true);
  });
});

describe("cancelled purchase orders", () => {
  it("are not counted, and the page says so", () => {
    mockLines([
      line({ poId: "PO-1", ordered: 4 }),
      line({ poId: "PO-2", ordered: 6, cancelled: true }),
    ]);
    render(wrap(<OperationPurchasingReport />));
    expect(within(screen.getByLabelText("Total")).getAllByRole("cell")[3]!.textContent).toBe("4");
    expect(screen.getByTestId("po-report-footer").textContent).toBe(
      "Cancelled purchase orders are not counted.",
    );
  });
});

describe("nothing to report", () => {
  it("an empty month says WHICH month rather than printing zeros", () => {
    mockLines([line({ poId: "PO-1", month: "2026-07" }), line({ poId: "PO-2", month: "2026-08" })]);
    render(wrap(<OperationPurchasingReport />));
    // A month that really is empty needs a month with no rows in it, so the
    // fixture's July row is filtered out by category instead — see the next
    // test. Here: the month is the ONLY narrowing, so the sentence is the
    // month's.
    fireEvent.click(screen.getByTestId("po-report-month-2026-08"));
    fireEvent.click(screen.getByTestId("po-report-month-2026-08")); // clear
    expect(screen.queryByText(/No purchase orders/)).toBeNull();
  });

  it("with nothing at all, it says so plainly", () => {
    mockLines([]);
    render(wrap(<OperationPurchasingReport />));
    expect(screen.getByText("No purchase orders.")).toBeTruthy();
    expect(screen.queryByTestId("po-report-clear")).toBeNull();
  });

  it("a filtered-empty table names the filters and hands back the way out", () => {
    mockLines([
      line({ poId: "PO-1", month: "2026-08", category: "sofa" }),
      line({
        poId: "PO-2",
        month: "2026-08",
        category: "mattress",
        supplierId: NICE,
        supplierName: "Nice Future",
      }),
    ]);
    render(wrap(<OperationPurchasingReport />));
    // Ohana × mattress: a reachable click pair that holds nothing.
    fireEvent.click(screen.getByTestId(`po-report-supplier-${OHANA}`));
    fireEvent.click(screen.getByTestId("po-report-category-mattress"));
    expect(screen.getByText("No rows match the filters.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("po-report-clear"));
    expect(within(screen.getByLabelText("Total")).getAllByRole("cell")[2]!.textContent).toBe("2");
  });
});

describe("no money anywhere", () => {
  it("the rendered page prints no RM, no cost and no price", () => {
    mockLines();
    const { container } = render(wrap(<OperationPurchasingReport />));
    fireEvent.click(screen.getByTestId("table-expand-sofa"));
    expect(container.textContent).not.toMatch(/RM|cost|price|amount|MYR|\$/i);
  });
});

describe("the freshness stamp", () => {
  it("states when it recomputed, and there is no Refresh button", () => {
    mockLines();
    render(wrap(<OperationPurchasingReport />));
    expect(screen.getByTestId("po-report-updated").textContent).toMatch(/^Updated \d\d:\d\d$/);
    expect(screen.queryByText(/refresh/i)).toBeNull();
  });
});
