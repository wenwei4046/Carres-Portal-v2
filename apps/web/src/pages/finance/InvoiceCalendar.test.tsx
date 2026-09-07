import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import InvoiceCalendar, { calendarEntriesOf, weekMondayOf } from "./InvoiceCalendar";

function row(over: {
  id?: string; so?: number; customer?: string; order_id?: string;
  kind?: "sales" | "storage" | "additional_storage";
  status?: "draft" | "issued" | "voided";
  delivery?: string | null; confirmed?: string | null;
  etas?: Record<string, string> | null; stock?: Record<string, string> | null;
}): InvoiceRegisterRow {
  return {
    id: over.id ?? "i1", invoice_no: "INV-1", status: over.status ?? "issued",
    kind: over.kind ?? "sales",
    amount: 1000, tax_amount: 0, issued_at: "2026-09-06", voided_at: null,
    void_reason: null, replaces_invoice_id: null, created_at: "2026-09-06T00:00:00Z",
    order_id: over.order_id ?? "o1",
    orders: {
      id: over.order_id ?? "o1", so: over.so ?? 1300,
      customer_name: over.customer ?? "LIM KUAN YANG",
      status: "proceed_order", paid: 400,
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
  it("an SO with Sales, Storage and Additional Storage invoices appears ONCE per date and type", () => {
    const shared = { confirmed: "2026-09-16", stock: { A: "awaiting" }, etas: { A: "2026-09-09" } };
    const entries = calendarEntriesOf([
      row({ id: "i-storage", kind: "storage", ...shared }),
      row({ id: "i-sales", kind: "sales", ...shared }),
      row({ id: "i-extra", kind: "additional_storage", ...shared }),
    ]);
    // One delivery + one arrival — never three of each.
    expect(entries).toHaveLength(2);
    // The Sales invoice is the door into the details.
    for (const e of entries) expect(e.row.id).toBe("i-sales");
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
    const onOpen = vi.fn(); const onPick = vi.fn(); const onBack = vi.fn(); const onFilter = vi.fn();
    render(<InvoiceCalendar rows={rows} selectedDateIso="2026-09-16"
      highlightOrderId="o1" highlightKind="delivery" filter="all"
      onPickDate={onPick} onFilter={onFilter} onOpenInvoice={onOpen} onBack={onBack}
      {...over} />);
    return { onOpen, onPick, onBack, onFilter };
  }
  it("the approved month layout: Sunday-first with three-letter headings, the kit primitive", () => {
    show();
    const month = screen.getByTestId("calendar-month");
    const headings = [...month.querySelectorAll("th")].map((th) => th.textContent?.trim());
    expect(headings).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(within(month).getByText("SEPTEMBER 2026")).toBeInTheDocument();
  });
  it("shows one fixed workweek with the highlighted SO", () => {
    show();
    expect(screen.getByTestId("calendar-week-word")).toHaveTextContent("Mon, 14 Sep – Sun, 20 Sep");
    const highlight = screen.getByTestId("calendar-highlight");
    expect(highlight).toHaveTextContent("SO-1319");
    expect(highlight).toHaveTextContent("Customer Delivery · selected");
  });
  it("Previous week / Next week move exactly one fixed workweek", () => {
    const { onPick } = show();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(onPick).toHaveBeenCalledWith("2026-09-07");
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(onPick).toHaveBeenCalledWith("2026-09-21");
  });
  it("a business filter opens its listing while the month stays visible", () => {
    show({ filter: "delivery" });
    expect(screen.getByTestId("calendar-listing")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-week")).not.toBeInTheDocument();
    expect(screen.getByTestId("calendar-month")).toBeInTheDocument();
    const listing = screen.getByTestId("calendar-listing");
    expect(listing).toHaveTextContent("Customer Delivery dates");
    expect(listing).toHaveTextContent("SO-1319");
    expect(listing).toHaveTextContent("SO-1204");
    expect(listing).not.toHaveTextContent("Expected arrival");
  });
  it("choosing a month date returns to Calendar", () => {
    const { onFilter, onPick } = show({ filter: "arrival" });
    fireEvent.click(screen.getByTestId("month-day-2026-09-10"));
    expect(onFilter).toHaveBeenCalledWith("all");
    expect(onPick).toHaveBeenCalledWith("2026-09-10");
  });
  it("an Expected arrival entry says its label and never a deadline", () => {
    show({ highlightOrderId: "o2", highlightKind: "arrival" });
    const highlight = screen.getByTestId("calendar-highlight");
    expect(highlight).toHaveTextContent("Expected arrival");
    expect(highlight).toHaveTextContent("SO-1204");
    expect(screen.getByTestId("calendar-week")).not.toHaveTextContent("Due");
    expect(screen.getByTestId("calendar-week")).not.toHaveTextContent("Should have been paid");
  });
  it("Sunday stays visible in the week and is muted as not a working day", () => {
    show();
    const week = screen.getByTestId("calendar-week");
    expect(within(week).getByText(/Sun, 20/)).toBeInTheDocument();
    expect(within(week).getAllByText("· not a working day").length).toBeGreaterThan(0);
  });
  it("entries open the collection object", () => {
    const { onOpen } = show();
    fireEvent.click(screen.getByTestId("calendar-highlight"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "i1" }));
  });
});
