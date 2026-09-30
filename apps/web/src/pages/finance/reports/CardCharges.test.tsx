import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CardCharges, { cardChargesReport, feePercent, type CardChargeSlice } from "./CardCharges";

const net = vi.hoisted(() => ({ data: [] as unknown }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path.startsWith("/api/finance/card-settlement/charges?")) return net.data;
    if (path === "/api/finance/ledger/departments") return { rows: [] };
    throw new Error(`unmocked ${path}`);
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const OUTLET = "11111111-1111-4111-8111-111111111111";
const DEALER = "22222222-2222-4222-8222-222222222222";
const slice = (s: Partial<CardChargeSlice>): CardChargeSlice => ({
  move_date: "2026-09-02", acquirer: "PBB", department_type: "SHOWROOM", department_id: OUTLET,
  gross: 1000, fee: 15, ...s,
});

/** Two Public Bank payouts in September (one split across two departments),
 *  one GHL payout in September, one Public Bank payout in August. */
const SLICES: CardChargeSlice[] = [
  slice({ gross: "1000.00", fee: "15.00" }),
  slice({ move_date: "2026-09-20", gross: "300.00", fee: "4.50" }),
  slice({ move_date: "2026-09-20", department_type: "DEALER", department_id: DEALER, gross: "200.00", fee: "3.00" }),
  slice({ acquirer: "GHL", gross: "300.00", fee: "3.90" }),
  slice({ move_date: "2026-08-31", gross: "500.00", fee: "7.50" }),
];

describe("cardChargesReport", () => {
  it("groups by month and card company, newest month first", () => {
    const rows = cardChargesReport(SLICES);
    expect(rows.map((r) => `${r.month} ${r.acquirer}`)).toEqual(["2026-09 PBB", "2026-09 GHL", "2026-08 PBB"]);
    expect(rows[0]).toMatchObject({ gross: 1500, fee: 22.5, net: 1477.5 });
  });

  it("Paid into bank plus Fee is the Sales total", () => {
    for (const r of cardChargesReport(SLICES)) expect(r.net + r.fee).toBeCloseTo(r.gross, 10);
    expect(cardChargesReport(SLICES)[1]).toMatchObject({ gross: 300, fee: 3.9, net: 296.1 });
  });

  it("Fee % is fee over sales, to two places", () => {
    expect(feePercent(22.5, 1500)).toBe(1.5);
    expect(feePercent(3.9, 300)).toBe(1.3);
    expect(feePercent(1, 3)).toBe(33.33);
    expect(feePercent(2, 3)).toBe(66.67);
    expect(feePercent(0, 0)).toBe(0);
    expect(cardChargesReport(SLICES)[1]!.feePct).toBe(1.3);
  });

  it("a department picks only its own slices; a type picks every one of that type", () => {
    const dealer = cardChargesReport(SLICES, `DEALER:${DEALER}`);
    expect(dealer).toEqual([{ month: "2026-09", acquirer: "PBB", gross: 200, fee: 3, net: 197, feePct: 1.5 }]);
    expect(cardChargesReport(SLICES, "DEALER")).toEqual(dealer);
    expect(cardChargesReport(SLICES, `SHOWROOM:${OUTLET}`)[0]).toMatchObject({ gross: 1300, fee: 19.5 });
    expect(cardChargesReport(SLICES, "OFFICE")).toEqual([]);
  });

  it("a sale with no department counts only when no department is picked", () => {
    const loose = [slice({ department_type: null, department_id: null })];
    expect(cardChargesReport(loose)).toHaveLength(1);
    expect(cardChargesReport(loose, "SHOWROOM")).toEqual([]);
  });

  it("a Maybank share split by sales adds back to the cent", () => {
    // RM 12.34 fee over RM 1,234 of sales, split 1/3 and 2/3 by the database, unrounded.
    const rows = cardChargesReport([
      slice({ acquirer: "MAYBANK", gross: "411.33", fee: "4.113300000000000000" }),
      slice({ acquirer: "MAYBANK", department_id: DEALER, gross: "822.67", fee: "8.226700000000000000" }),
    ]);
    expect(rows[0]).toMatchObject({ gross: 1234, fee: 12.34, net: 1221.66, feePct: 1 });
  });

  it("nothing approved is an empty report", () => {
    expect(cardChargesReport([])).toEqual([]);
  });
});

describe("Card charges page", () => {
  beforeEach(() => { localStorage.clear(); });

  function renderPage() {
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><CardCharges /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("reports through the Register shell with its totals", async () => {
    net.data = SLICES;
    renderPage();
    await screen.findByText("GHL");
    expect(screen.getByText("RM 1,500.00")).toBeTruthy();
    expect(screen.getByText("RM 1,477.50")).toBeTruthy();
    expect(screen.getAllByText("1.50%").length).toBeGreaterThan(0);
    expect(screen.getByTestId("card-charges-summary")).toHaveTextContent(
      "3 of 3 rows · Only card settlement days whose payout is approved are counted.",
    );
    expect(screen.getByTestId("footer-totals")).toHaveTextContent("RM 2,300.00");
  });

  it("says plainly why the report is empty", async () => {
    net.data = [];
    renderPage();
    expect(await screen.findByText(
      "No approved card payout in these months. Only card settlement days whose payout is approved are counted.",
    )).toBeTruthy();
  });
});
