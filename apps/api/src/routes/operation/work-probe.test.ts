/**
 * ONE ORDER, ONE PROJECTOR (owner correction 2026-09-24): the one-order probe
 * feeds the SAME projector with this order's row and its own SKUs' stock and
 * no owner facts. Whether an occurrence exists, its identity, Work date and
 * document must equal what the whole Work feed says for that order.
 */
import { describe, expect, it } from "vitest";
import { projectSalesOrdersFromModuleFacts } from "./work";

type Row = Parameters<typeof projectSalesOrdersFromModuleFacts>[0]["orders"][number];

function order(id: string, so: number, sku: string, extra: Partial<Row> = {}): Row {
  return {
    id, so,
    status: "proceed_order",
    operation_stage: "in_production",
    customer_name: "Tan Qu Qu",
    delivery_date: "2026-10-30",
    delivery_date_tbd: false,
    placed_at: "2026-09-01",
    do_number: null,
    paid: 0,
    ops_assigned_logistic: null,
    delivery_partner_id: null,
    salesperson_id: "sales-1",
    salespersons: { name: "Shasha" },
    po_skus: [],
    order_lines: [{ sku, qty: 1, unit_price: 1000 }],
    order_addons: [],
    order_supplier_threads: [],
    order_finance_exceptions: [],
    ops_sofa_loans: [],
    ops_order_control: {
      assigned_staff: "pic-1", booking_stage: null, confirmed_date: null,
      delivery_photos: [], line_etas: null, line_stock_status: null,
    },
    ...extra,
  } as Row;
}

const ORDERS: Row[] = [
  // Never asked for a date, goods unordered → ask_delivery_date + issue_po.
  order("order-1", 1301, "SOFA-1", { delivery_date: null }),
  // The supplier's date overshoots the promise, nobody decided → delay_planning.
  order("order-2", 1302, "BED-2", {
    po_skus: ["BED-2"],
    ops_order_control: {
      assigned_staff: "pic-1", booking_stage: null, confirmed_date: null,
      delivery_photos: [], line_etas: { "BED-2": "2026-11-20" }, line_stock_status: null,
      stock_eta: "2026-11-20", delay_detected_at: "2026-09-15T02:00:00Z",
    },
  } as Partial<Row>),
  // Goods in stock → no goods work at all.
  order("order-3", 1303, "PILLOW-3"),
];
const STOCK = [
  { sku: "SOFA-1", available: 0 },
  { sku: "BED-2", available: 0 },
  { sku: "PILLOW-3", available: 4 },
];
const RULES = new Set(["ask_delivery_date", "delay_planning", "issue_po", "confirm_ready_date"]);
const shape = (items: ReturnType<typeof projectSalesOrdersFromModuleFacts>) =>
  items
    .filter((item) => RULES.has(item.ruleKey))
    .map((item) => ({ id: item.id, ruleKey: item.ruleKey, actionOn: item.timing.actionOn, label: item.object.label }))
    .sort((a, b) => a.id.localeCompare(b.id));

describe("the one-order Work probe", () => {
  it.each(ORDERS.map((o) => [o.id, o] as const))("%s: the same occurrences, identity, Work date and document as the whole feed", (id, row) => {
    const whole = projectSalesOrdersFromModuleFacts({
      orders: ORDERS,
      stock: STOCK,
      staff: [{ user_id: "pic-1", name: "Order PIC", email: "pic@carres.test" }],
      dutyResolutions: {},
      today: "2026-09-17",
      safetyDays: 7,
    }).filter((item) => item.object.id === id);
    const skus = new Set((row.order_lines ?? []).map((line) => line.sku));
    const probe = projectSalesOrdersFromModuleFacts({
      orders: [row],
      stock: STOCK.filter((s) => skus.has(s.sku)),
      staff: [],
      dutyResolutions: {},
      today: "2026-09-17",
      safetyDays: 7,
    });
    expect(shape(probe)).toEqual(shape(whole));
  });

  it("the fixture really exercises the rules (a vacuous equality proves nothing)", () => {
    const all = shape(projectSalesOrdersFromModuleFacts({
      orders: ORDERS, stock: STOCK, staff: [], dutyResolutions: {}, today: "2026-09-17", safetyDays: 7,
    })).map((i) => `${i.label}:${i.ruleKey}`);
    expect(all).toEqual(expect.arrayContaining(["SO-1301:ask_delivery_date", "SO-1301:issue_po"]));
    expect(all.some((key) => key.endsWith(":delay_planning"))).toBe(true);
    expect(all.some((key) => key.startsWith("SO-1303:"))).toBe(false);
  });
});
