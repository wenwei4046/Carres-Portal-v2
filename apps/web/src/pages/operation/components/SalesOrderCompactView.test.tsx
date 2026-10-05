import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import SalesOrderCompactView, { originalRequestDays } from "./SalesOrderCompactView";
import { buildRegisterRow } from "../sales-order-columns";
import type { operationOrderListRow } from "@/lib/queries";
import type { PaymentTemplateRow } from "@carres/shared/payment-templates";
import type { DeliveryTemplateRow } from "@carres/shared/delivery-settings";
import type { DeliveryMonitorCard } from "../delivery-monitor";
const state = vi.hoisted(() => ({ templates: [] as DeliveryTemplateRow[], paymentTemplates: [] as PaymentTemplateRow[], role: "operation", failed: false, loading: false, card: null as unknown as DeliveryMonitorCard | null, leg: 0 }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { templates: state.paymentTemplates } }) }));
vi.mock("@/lib/auth", () => ({ useAuth: (select: (s: { role: string }) => unknown) => select({ role: state.role }) }));
vi.mock("../delivery-scope-card", () => ({ useDeliveryScopeCard: (_id: string, leg: number) => { state.leg = leg; return state; } }));
vi.mock("@/lib/queries", () => ({ useSalesOrderRevisions: () => ({ data: { revisions: [{ revision: 1, snapshot: { header: { delivery_date: "2026-10-31" } } }] } }), useCatalog: () => ({ data: { models: [], skus: [] } }), useDeliverySettings: () => ({ data: { templates: state.templates } }), useDeliveryPartners: () => ({ data: { partners: [] } }), useOrderTimeline: () => ({ data: [{ id: "event", actor_name: "Recorder", kind: "annotation", content: "Saved note", occurred_at: "2026-09-30T08:08:32Z" }] }) }));
vi.mock("./SalesOrderCardDocument", () => ({ default: () => <div>Saved document</div> }));
vi.mock("./DeliveryBrief", () => ({ DeliveryDatesEdit: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Date editor</button>, LogisticsDetailsEdit: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Logistics editor</button> }));
const row = buildRegisterRow({ id: "o", so: 1303, customer_name: "Kimmy", customer_phone: "0191234567", customer_email: "a@example.com", customer_address: "Recorded address", placed_at: "2026-09-30T08:00:00Z", delivery_date: "2026-10-31", proceeded_at: "2026-10-01T08:00:00Z", proceed_date: "2026-10-02", dealers: { name: "Recorded dealer" }, order_lines: [{ sku: "M", qty: 1, unit_price: 2499 }], paid: 1250 } as operationOrderListRow);
function mount(source = row) { return render(<SalesOrderCompactView row={source} salesLocation="Recorded location" items={<div>Actual Items</div>} onOpen={vi.fn()} onClose={vi.fn()} />); }
beforeEach(() => { state.templates = []; state.paymentTemplates = []; state.role = "operation"; state.failed = false; state.loading = false; state.card = { leg: 0, items: [{ qty: 1 }], extras: [{ kind: "service", qty: 4 }], readiness: { shortQty: 0, ready: true }, confirmedDate: "2026-10-31", confirmedTime: null, logisticsPartnerId: "nets", logisticsPartnerName: "NETS", payment: { line1: "Paid" }, settled: false, doNumber: null } as unknown as DeliveryMonitorCard; });
afterEach(cleanup);
describe("real SO card", () => {
  it("keeps documents lazy and the confirmed lean Info template", () => {
    mount(); expect(screen.getByText("Recorded address")).toBeVisible(); expect(screen.getByText("Recorded location")).toBeVisible(); expect(screen.queryByText("Saved document")).toBeNull(); expect(screen.queryByText("Actual Items")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sales Order SO-1303" })); expect(screen.getByText("Saved document")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Items" })); expect(screen.getByText("Actual Items")).toBeVisible(); expect(screen.queryByText("a@example.com")).toBeNull(); expect(screen.queryByRole("button", { name: "Info · Order details" })).toBeNull(); expect(screen.queryByText("Recorded dealer")).toBeNull(); expect(screen.queryByText("Related documents")).toBeNull(); expect(screen.getByText("Total payable")).toBeVisible(); expect(screen.getByText("Paid to date")).toBeVisible(); expect(screen.getByText("Fri, 2 Oct")).toBeVisible();
  });
  it("orders address before sales facts and uses the planned Proceed date, not the handoff stamp", () => {
    mount();
    const address = screen.getByText("Recorded address");
    const docDate = screen.getByText("SO Doc Date");
    const proceed = screen.getByText("Proceed date");
    const location = screen.getByText("Sales Location");
    expect(address.compareDocumentPosition(docDate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(docDate.compareDocumentPosition(proceed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(proceed.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Fri, 2 Oct")).toBeVisible();
    expect(screen.queryByText("Thu, 1 Oct")).toBeNull();
    expect(screen.queryByText("Stock Status")).toBeNull();
    expect(screen.queryByText("Payment Status")).toBeNull();
    expect(screen.queryByText("Delivery Status")).toBeNull();
  });
  it("uses real goods only, date-only precision, one formal editor and read-only DO", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Delivery" })); expect(screen.queryByText("Recorded address")).toBeNull(); expect(screen.getByText("1/1")).toBeVisible(); expect(screen.getAllByText("31 Oct")).toHaveLength(2); expect(screen.getByText("Date confirmed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Logistics/ })); expect(screen.getByText("Logistics editor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Customer/ })); expect(screen.queryByText("Logistics editor")).toBeNull(); expect(screen.getByText("Date editor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^DO/ })); expect(screen.queryByText("Date editor")).toBeNull(); expect(screen.getByLabelText("Delivery Order")).toBeVisible(); expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("never turns failed reads into stock readiness or absence, and hides writers for other roles", () => {
    state.failed = true; mount(); fireEvent.click(screen.getByRole("button", { name: "Delivery" })); expect(screen.queryByText("1/1")).toBeNull(); expect(screen.queryByText("Date not confirmed")).toBeNull(); expect(screen.getAllByText("Unavailable").length).toBe(4); expect(screen.queryByRole("button", { name: /^Customer/ })).toBeNull();
    cleanup(); state.failed = false; state.role = "finance"; mount(); fireEvent.click(screen.getByRole("button", { name: "Delivery" })); expect(screen.queryByRole("button", { name: /^Customer/ })).toBeNull();
  });
  it("uses the final journey receiver and does not mistake the first leg for it", () => {
    state.card!.leg = 1; mount({ ...row, o: { ...row.o, delivery_stops: [{ leg: 1 }, { leg: 2 }] as operationOrderListRow["delivery_stops"] } }); fireEvent.click(screen.getByRole("button", { name: "Delivery" })); expect(state.leg).toBe(2); expect(screen.queryByText("Date confirmed")).toBeNull();
  });
  it("shows completed delivery facts without opening a writer even if the source card is stale", () => {
    mount({ ...row, o: { ...row.o, status: "delivered", delivered_at: "2026-09-30T08:00:00Z" } });
    fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
    expect(screen.getByText("NETS")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Customer/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Logistics/ })).toBeNull();
  });
  it("counts from Proceed date independently of today and keeps the phone pair together", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T17:00:00Z"));
    try { mount(); expect(screen.getByText("29d")).toBeVisible(); const phone = screen.getByText("0191234567"); expect(phone.querySelector("svg")).not.toBeNull(); } finally { vi.useRealTimers(); }
  });
  it("preserves the original date despite a changed current request and omits empty stair carry", () => {
    mount({ ...row, customerDelivery: "2026-12-31", o: { ...row.o, delivery_stair_items: 0 } });
    expect(screen.getByText("31 Oct")).toBeVisible(); expect(screen.getByText("29d")).toBeVisible();
    expect(screen.queryByText(/Stair carry:/)).toBeNull(); expect(screen.queryByRole("button", { name: "Delivery address" })).toBeNull();
  });
  it("groups four populated access facts into two lines", () => {
    mount({ ...row, o: { ...row.o, building_type: "Condo", delivery_floor: 1, delivery_has_lift: false, delivery_stair_items: 4 } });
    expect(screen.getByText("Condo · Floor 1")).toBeVisible(); expect(screen.getByText("No lift · Stair carry: 4 items")).toBeVisible();
  });
  it("uses the Payment library's current Default and excludes superseded versions", () => {
    state.paymentTemplates = [
      { id: "latest", name: "Current payment reminder", body: "Hi {customer}, {ref}, RM {outstanding}", purpose: "gentle_reminder", active: true, is_head: true, is_default: true },
      { id: "old", name: "Old payment reminder", body: "Old", purpose: "gentle_reminder", active: true, is_head: false },
    ] as PaymentTemplateRow[];
    mount(); fireEvent.click(screen.getByRole("button", { name: "Communication" })); fireEvent.click(screen.getByRole("button", { name: "Message options" })); fireEvent.click(screen.getByRole("button", { name: "Find template…" }));
    expect(screen.getByRole("option", { name: "Current payment reminder" })).toBeVisible(); expect(screen.queryByRole("option", { name: "Old payment reminder" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Message template" }), { target: { value: "latest" } }); expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Hi Kimmy, SO-1303, RM 1,249.00");
  });
  it("does not offer cached payment reminders on an order already paid in full", () => {
    state.paymentTemplates = [{ id: "latest", name: "Current payment reminder", body: "Pay", purpose: "gentle_reminder", active: true, is_head: true, is_default: true }] as PaymentTemplateRow[];
    mount({ ...row, balance: { kind: "settled" } }); fireEvent.click(screen.getByRole("button", { name: "Communication" })); fireEvent.click(screen.getByRole("button", { name: "Message options" })); fireEvent.click(screen.getByRole("button", { name: "Find template…" })); expect(screen.queryByRole("option", { name: "Current payment reminder" })).toBeNull();
  });
  it("loads only active current Delivery templates, never retired wording or a customer recipient", () => {
    state.templates = [
      { id: "current", name: "Current date request", body: "Hi {partner}, {customer}: {requested_date}", purpose: "ask_partner_for_date", channel: "whatsapp", active: true, is_head: true, is_default: true },
      { id: "retired", name: "Retired date request", body: "Old", purpose: "ask_partner_for_date", channel: "whatsapp", active: false, is_head: true },
    ] as DeliveryTemplateRow[];
    mount(); fireEvent.click(screen.getByRole("button", { name: "Delivery" })); fireEvent.click(screen.getByRole("button", { name: "Communication" })); fireEvent.click(screen.getByRole("button", { name: "Message options" })); fireEvent.click(screen.getByRole("button", { name: "Find template…" }));
    expect(screen.getByRole("option", { name: "Current date request" })).toBeVisible(); expect(screen.queryByRole("option", { name: "Retired date request" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Message template" }), { target: { value: "current" } }); expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Hi NETS, Kimmy: Sat, 31 Oct");
  });
  it("keeps the complete timestamp and actor only on the avatar", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Show timeline" })); const event = screen.getByText("Saved note").closest("li")!; expect(within(event).getByLabelText("Recorded by Recorder")).toBeVisible(); expect(event.querySelector("time")).toHaveAttribute("dateTime", "2026-09-30T08:08:32Z"); expect(event).toHaveTextContent("30 Sep · 4:08 PM"); expect(event).not.toHaveTextContent("MYT");
  });
});

describe("original requested duration", () => { it("uses calendar dates and omits absent, invalid or negative spans", () => { expect(originalRequestDays("2026-09-30", "2026-10-31")).toBe(31); expect(originalRequestDays("2026-10-31", "2026-10-31")).toBe(0); expect(originalRequestDays(null, "2026-10-31")).toBeNull(); expect(originalRequestDays("2026-11-01", "2026-10-31")).toBeNull(); expect(originalRequestDays("2026-02-30", "2026-10-31")).toBeNull(); }); });
