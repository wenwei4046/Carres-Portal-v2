import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import InvoiceCalendar, { calendarEntriesOf, weekMondayOf } from "./InvoiceCalendar";

function row(over: {
  id?: string; so?: number; customer?: string; order_id?: string;
  status?: "draft" | "issued" | "voided";
  delivery?: string | null; confirmed?: string | null;
  etas?: Record<string, string> | null; stock?: Record<string, string> | null;
}): InvoiceRegisterRow {
  return {
    id: over.id ?? "i1", invoice_no: "INV-1", status: over.status ?? "issued", kind: "sales",
    amount: 1000, tax_amount: 0, issued_at: "2026-09-06", voided_at: null,
    void_reason: null, replaces_invoice_id: null, created_at: "2026-09-06T00:00:00Z",
    order_id: over.order_id ?? "o1",
    orders: {
      id: over.order_id ?? "o1", so: over.so ?? 1300,
      customer_name: over.customer ?? "LIM KUAN YANG",
      status: "proceed_order", paid: 0,
      delivery_date: over.delivery ?? null, delivery_date_tbd: false, delivered_at: null,
      order_lines: [{ qty: 1, unit_price: 1000 }], order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: over.confirmed ?? null,
        line_etas: over.etas ?? null, line_stock_status: over.stock ?? null }],
    },
  };
}

describe("calendar derivations (§17)", () => {
  it("Monday anchors the fixed workweek", () => {
    expect(weekMondayOf("2026-09-16")).toBe("2026-09-14"); // Wed → Mon
    expect(weekMondayOf("2026-09-14")).toBe("2026-09-14"); // Mon stays
    expect(weekMondayOf("2026-09-20")).toBe("2026-09-14"); // Sun belongs to its week
  });
  it("a record without a usable date has no calendar position", () => {
    expect(calendarEntriesOf([row({})])).toEqual([]);
  });
  it("the two date types are two distinct entries for one SO, never merged", () => {
    const entries = calendarEntriesOf([row({
      confirmed: "2026-09-16",
      stock: { A: "awaiting" }, etas: { A: "2026-09-09" },
    })]);
    expect(entries.map((e) => e.kind).sort()).toEqual(["arrival", "delivery"]);
  });
  it("a voided invoice puts nothing on the calendar", () => {
    expect(calendarEntriesOf([row({ status: "voided", confirmed: "2026-09-16" })])).toEqual([]);
  });
});

describe("InvoiceCalendar view", () => {
  const rows = [
    row({ id: "i1", so: 1319, order_id: "o1", confirmed: "2026-09-16" }),
    row({ id: "i2", so: 1204, order_id: "o2", customer: "NURUL AIN",
      delivery: "2026-09-18", stock: { A: "awaiting" }, etas: { A: "2026-09-16" } }),
  ];
  function show(over: Partial<Parameters<typeof InvoiceCalendar>[0]> = {}) {
    const onOpen = vi.fn(); const onPick = vi.fn(); const onBack = vi.fn();
    render(<InvoiceCalendar rows={rows} selectedDateIso="2026-09-16"
      highlightOrderId="o1" highlightKind="delivery" filter="all"
      onPickDate={onPick} onFilter={vi.fn()} onOpenInvoice={onOpen} onBack={onBack}
      {...over} />);
    return { onOpen, onPick, onBack };
  }
  it("shows the complete month, one fixed workweek and the highlighted SO", () => {
    show();
    expect(screen.getByTestId("calendar-month")).toHaveTextContent("September 2026");
    expect(screen.getByTestId("calendar-week-word")).toHaveTextContent("Week of Mon, 14 Sep");
    const highlight = screen.getByTestId("calendar-highlight");
    expect(highlight).toHaveTextContent("SO-1319");
    expect(highlight).toHaveTextContent("Customer Delivery · selected");
  });
  it("an Expected arrival entry says its label and never a deadline", () => {
    show({ highlightOrderId: "o2", highlightKind: "arrival" });
    const highlight = screen.getByTestId("calendar-highlight");
    expect(highlight).toHaveTextContent("Expected arrival");
    expect(highlight).toHaveTextContent("SO-1204");
    expect(screen.getByTestId("calendar-week")).not.toHaveTextContent("Due");
    expect(screen.getByTestId("calendar-week")).not.toHaveTextContent("Should have been paid");
  });
  it("Sunday stays visible and is muted as not a working day", () => {
    show();
    const week = screen.getByTestId("calendar-week");
    expect(within(week).getByText(/Sun, 20/)).toBeInTheDocument();
    expect(within(week).getAllByText("· not a working day").length).toBeGreaterThan(0);
  });
  it("a month date moves the week; entries open the collection object", () => {
    const { onPick, onOpen } = show();
    fireEvent.click(within(screen.getByTestId("calendar-month")).getByRole("button", { name: /1 Sep 26|Tue, 1 Sep/ }));
    expect(onPick).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("calendar-highlight"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "i1" }));
  });
  it("month arrows move exactly one month", () => {
    const { onPick } = show();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(onPick).toHaveBeenCalledWith("2026-08-01");
  });
});
