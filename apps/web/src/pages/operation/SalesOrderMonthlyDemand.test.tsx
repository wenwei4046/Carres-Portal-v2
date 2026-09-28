/**
 * MONTHLY DEMAND — the view (Orders MASTER, Monthly demand). Two blocks,
 * dictionary words only, no dash printed as a value.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { monthlyDemandOf, type MonthlyDemandOrder, type MonthlyDemandView } from "@carres/shared";
import SalesOrderMonthlyDemand from "./SalesOrderMonthlyDemand";

const order = (id: string, over: Partial<MonthlyDemandOrder>): MonthlyDemandOrder => ({
  id,
  deliveryDate: "2026-11-10",
  deliveryDateTbd: false,
  salesLocation: "{dealer 1}",
  state: "{state 1}",
  city: "{city 1}",
  lines: [{ id: `${id}-L1`, sku: "B1201S-K", qty: 2, category: "mattress" }],
  delivered: [],
  ...over,
});

const ORDERS: MonthlyDemandOrder[] = [
  order("o1", { deliveryDate: "2026-11-10", lines: [{ id: "o1-L1", sku: "B1201S-K", qty: 5, category: "mattress" }], delivered: [{ orderLineId: "o1-L1", sku: "B1201S-K", qty: 2 }] }),
  order("o2", { deliveryDate: "2026-12-03", lines: [{ id: "o2-L1", sku: "SOFA-1", qty: 1, category: "sofa" }] }),
  order("o3", { deliveryDate: "2027-01-20", lines: [{ id: "o3-L1", sku: "BED-1", qty: 3, category: "bedframe" }] }),
  order("o4", { deliveryDate: "2026-09-02", lines: [{ id: "o4-L1", sku: "B1201S-K", qty: 1, category: "mattress" }] }),
  order("o5", { deliveryDate: "2027-06-01", lines: [{ id: "o5-L1", sku: "B1201S-K", qty: 4, category: "mattress" }] }),
  order("o6", { deliveryDate: null, deliveryDateTbd: true, lines: [{ id: "o6-L1", sku: "B1201S-K", qty: 7, category: "mattress" }] }),
];

const viewOf = (over: Partial<Parameters<typeof monthlyDemandOf>[0]> = {}): MonthlyDemandView =>
  monthlyDemandOf({
    orders: ORDERS,
    startMonth: "2026-11",
    months: 3,
    toBuyByLine: new Map([["o1-L1", 3], ["o3-L1", 0]]),
    focusMonth: "2026-11",
    ...over,
  });

function mount(props: Partial<Parameters<typeof SalesOrderMonthlyDemand>[0]> = {}) {
  const onOpenMonth = vi.fn();
  const onRetry = vi.fn();
  const utils = render(
    <MemoryRouter>
      <SalesOrderMonthlyDemand
        view={viewOf()}
        focusMonth="2026-11"
        onOpenMonth={onOpenMonth}
        onRetry={onRetry}
        {...props}
      />
    </MemoryRouter>,
  );
  return { ...utils, onOpenMonth, onRetry };
}

const rowTexts = () =>
  within(screen.getByRole("table")).getAllByRole("row").slice(1).map((row) =>
    within(row).getAllByRole("cell").map((cell) => cell.textContent),
  );

describe("Monthly demand", () => {
  it("prints three numbers for ONE month under `This month · {Mon YYYY}`", () => {
    const { container } = mount();
    const heading = screen.getByRole("heading", { name: "This month · Nov 2026" });
    expect(heading.className).toContain("text-strong");
    expect(heading.className).toContain("text-kit-slate-12");
    expect(heading.className).not.toContain("blue");
    const list = container.querySelector("dl")!;
    expect([...list.querySelectorAll("dt")].map((n) => n.textContent)).toEqual(["Total Qty", "Delivered", "Not delivered"]);
    expect([...list.querySelectorAll("dd")].map((n) => n.textContent)).toEqual(["5", "2", "3"]);
  });

  it("prints the governed columns, in order, with no `Not in catalog` when every line is in the catalog", () => {
    mount();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Month", "Mattress", "Bedframe", "Sofa", "Accessory", "Total Qty", "Delivered", "Not delivered", "To buy",
    ]);
    expect(screen.queryByText("Reserved")).toBeNull();
    expect(screen.queryByText("Pending Delivery Qty")).toBeNull();
  });

  it("adds `Not in catalog` only when a line has no catalog row", () => {
    const orders = [...ORDERS, order("o7", { lines: [{ id: "o7-L1", sku: "ZZ-UNKNOWN-9", qty: 2, category: null }] })];
    const view = viewOf({ orders });
    expect(view.hasNotInCatalog).toBe(true);
    mount({ view });
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Month", "Mattress", "Bedframe", "Sofa", "Accessory", "Not in catalog", "Total Qty", "Delivered", "Not delivered", "To buy",
    ]);
  });

  it("names one row per month across a year boundary, then the edges, the undated and the total", () => {
    mount();
    expect(screen.getByRole("heading", {
      name: "By month · Customer Requested Delivery Date · Nov 2026 to Jan 2027",
    })).toBeInTheDocument();
    expect(rowTexts().map((cells) => cells[0])).toEqual([
      "Before Nov 2026", "Nov 2026", "Dec 2026", "Jan 2027", "After Jan 2027", "No delivery date", "Total",
    ]);
  });

  it("prints zero as 0 and SO Batch Purchase's number under To buy", () => {
    mount();
    const rows = rowTexts();
    /* Nov 2026: 5 ordered, 2 delivered, 3 owed, 3 to buy. */
    expect(rows[1]).toEqual(["Nov 2026", "3", "0", "0", "0", "5", "2", "3", "3"]);
    /* Dec 2026: nothing to buy is a zero, never a blank. */
    expect(rows[2]).toEqual(["Dec 2026", "0", "0", "1", "0", "1", "0", "1", "0"]);
  });

  it("prints `Unavailable` under To buy when SO Batch Purchase could not be read", () => {
    mount({ view: viewOf({ toBuyByLine: null }) });
    for (const cells of rowTexts()) expect(cells[cells.length - 1]).toBe("Unavailable");
  });

  it("a month is a door that hands its row back", () => {
    const { onOpenMonth } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Open Sales Orders for Dec 2026" }));
    expect(onOpenMonth).toHaveBeenCalledTimes(1);
    expect(onOpenMonth.mock.calls[0]![0]).toMatchObject({ kind: "month", key: "2026-12", month: "2026-12" });
    fireEvent.click(screen.getByRole("button", { name: "Open Sales Orders for Before Nov 2026" }));
    expect(onOpenMonth.mock.calls[1]![0]).toMatchObject({ kind: "before", month: "2026-11" });
    fireEvent.click(screen.getByRole("button", { name: "Open Sales Orders for After Jan 2027" }));
    expect(onOpenMonth.mock.calls[2]![0]).toMatchObject({ kind: "after", month: "2027-01" });
  });

  it("`Total` and `No delivery date` are not doors", () => {
    mount();
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Open Sales Orders for Before Nov 2026",
      "Open Sales Orders for Nov 2026",
      "Open Sales Orders for Dec 2026",
      "Open Sales Orders for Jan 2027",
      "Open Sales Orders for After Jan 2027",
    ]);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[rows.length - 1]!.className).toContain("font-semibold");
  });

  it("says how to open a month and carries the one door to SO Batch Purchase", () => {
    mount();
    expect(screen.getByText("Click a month to open its Sales Orders")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open SO Batch Purchase →" })).toHaveAttribute("href", "/operation?tab=purchase");
  });

  it("a filtered view with nothing in it says so and still shows every row", () => {
    mount({ view: viewOf({ filters: { salesLocation: "{dealer 9}" } }) });
    expect(screen.getByText("No Sales Orders in these months")).toBeInTheDocument();
    expect(rowTexts().map((cells) => cells[0])).toContain("No delivery date");
  });

  it("does not say it is empty when it is not", () => {
    mount();
    expect(screen.queryByText("No Sales Orders in these months")).toBeNull();
  });

  it("a failed read says so with Try again and no transport message", () => {
    const { onRetry } = mount({ view: null, error: { status: 500, message: "PGRST301 secret detail" } });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Monthly demand could not be loaded");
    expect(alert).not.toHaveTextContent("PGRST301");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("a permission refusal prints the permission words and offers no Try again", () => {
    mount({ view: null, error: { status: 403, message: "JWT role forbidden" } });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("You cannot view sales orders");
    expect(alert).toHaveTextContent("Ask an authorised operation user for access.");
    expect(alert).not.toHaveTextContent("JWT");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("holds its space while opening", () => {
    mount({ view: null, loading: true });
    expect(screen.getByTestId("monthly-demand")).toHaveAttribute("data-state", "loading");
    expect(screen.getAllByText("Opening monthly demand").length).toBeGreaterThan(0);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("prints no dash anywhere, except the one inside the governed heading", () => {
    for (const view of [viewOf(), viewOf({ toBuyByLine: null }), viewOf({ filters: { salesLocation: "{dealer 9}" } })]) {
      const { container, unmount } = mount({ view });
      const text = container.textContent ?? "";
      expect(text).not.toContain("—");
      const heading = "By month · Customer Requested Delivery Date · Nov 2026 to Jan 2027";
      expect(text.replace(heading, "")).not.toContain("–");
      unmount();
    }
  });
});
