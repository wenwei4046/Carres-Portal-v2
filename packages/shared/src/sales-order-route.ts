/**
 * Sales Order Route — a read-only projection of facts owned elsewhere.
 *
 * This module deliberately has no workflow state and no writer. It keeps each
 * applicable obligation independent, permits simultaneous goods positions,
 * and emits owner links for every document/fact it names.
 */

import type { SalesOrderAllocation } from "./sales-order-allocation";
import { normalizeSkuKey } from "./sku-code";

export type SalesOrderRouteLaneKey = "goods" | "delivery" | "money" | "loan" | "other";
export type SalesOrderRouteFactState = "complete" | "current" | "attention" | "clear";

export interface SalesOrderRouteDocument {
  id: string;
  kind: "Sales Order" | "Revision" | "Purchase Order" | "Supplier DO" | "Receiving Record" | "Delivery Order" | "Invoice" | "Loan Note" | "Supplier Claim" | "Service Case";
  number: string;
  href: string;
  detail?: string | null;
}

export interface SalesOrderRouteFact {
  id: string;
  title: string;
  detail: string | null;
  state: SalesOrderRouteFactState;
  owner: string;
  href: string | null;
  occurredAt: string | null;
}

export interface SalesOrderRouteGroup {
  id: string;
  title: string;
  facts: SalesOrderRouteFact[];
}

export interface SalesOrderRouteLane {
  key: SalesOrderRouteLaneKey;
  title: "Goods" | "Delivery" | "Money" | "Loan" | "Other Commitments";
  groups: SalesOrderRouteGroup[];
}

export interface RoutePurchaseOrder {
  id: string;
  /** An owner-derived phrase such as "In production at supplier". */
  currentFact: string;
  etaDate: string | null;
  supplierDoNumber: string | null;
  lines: ReadonlyArray<{ sku: string; qty: number; receivedQty: number }>;
}

export interface RouteDeliveryAttempt {
  id: string;
  attemptNo: number;
  result: "delivered" | "partial" | "failed";
  reason: string | null;
  doNumber: string | null;
  scheduledDate: string | null;
  recordedAt: string | null;
}

export interface RouteLoan {
  id: string;
  label: string;
  status: "on_loan" | "returned";
  source: "warehouse" | "supplier";
  loanNoteNo: string | null;
  loanedAt: string | null;
  returnedAt: string | null;
  returnedToSupplierAt: string | null;
}

export interface SalesOrderRouteInput {
  order: {
    id: string;
    so: number;
    placedAt: string;
    deliveryDate: string | null;
    doNumber: string | null;
    dispatchedAt: string | null;
    deliveredAt: string | null;
    invoiceNo: string | null;
  };
  revisions: ReadonlyArray<number>;
  /** Friendly product names keyed by the committed SKU. The SKU remains the
   * matching identity; the route speaks the customer-facing product name. */
  lineLabels?: Readonly<Record<string, string>>;
  allocation: SalesOrderAllocation;
  purchaseOrders: ReadonlyArray<RoutePurchaseOrder>;
  receivingRecords: ReadonlyArray<{
    id: string;
    recordNo: string;
    poId: string;
    supplierDoNumber: string | null;
    status: string;
    receivedAt: string | null;
  }>;
  delivery: {
    booking: { date: string | null; slot: string | null; partnerName: string | null } | null;
    attempts: ReadonlyArray<RouteDeliveryAttempt>;
  };
  money: { known: boolean; total: number | null; paid: number; outstanding: number };
  refunds: ReadonlyArray<{
    id: string;
    amount: number;
    status: "requested" | "approved" | "rejected" | "paid";
    requestedAt: string | null;
  }>;
  loans: ReadonlyArray<RouteLoan>;
  cases: ReadonlyArray<{
    id: string;
    caseNo: string;
    closed: boolean;
    openedAt: string | null;
  }>;
  claims: ReadonlyArray<{
    id: string;
    claimNo: string;
    poId: string;
    status: string;
    reportedAt: string | null;
  }>;
  work: ReadonlyArray<{
    id: string;
    module: string;
    title: string;
    state: "open" | "closed";
    createdAt: string | null;
  }>;
}

export interface SalesOrderRoute {
  orderId: string;
  soNumber: string;
  documents: SalesOrderRouteDocument[];
  lanes: SalesOrderRouteLane[];
  currentPositions: string[];
  noActionRequired: boolean;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const fact = (
  id: string,
  title: string,
  state: SalesOrderRouteFactState,
  owner: string,
  href: string | null,
  detail: string | null = null,
  occurredAt: string | null = null,
): SalesOrderRouteFact => ({ id, title, detail, state, owner, href, occurredAt });

function poMatchesSku(po: RoutePurchaseOrder, sku: string) {
  const key = normalizeSkuKey(sku) || sku;
  return po.lines.filter((line) => (normalizeSkuKey(line.sku) || line.sku) === key);
}

function goodsLane(input: SalesOrderRouteInput): { lane: SalesOrderRouteLane; positions: string[]; clear: boolean } {
  const positions: string[] = [];
  let clear = true;
  const groups = input.allocation.lines.map((line) => {
    const label = input.lineLabels?.[line.sku]?.trim() || line.sku;
    const facts: SalesOrderRouteFact[] = [];
    const words: string[] = [];

    for (const unit of line.soldUnits) {
      const unitName = unit.unitCode ?? unit.id;
      facts.push(fact(
        `sold:${unit.id}`,
        `Delivered · Unit ${unitName}`,
        "complete",
        "Stock",
        "/operation?tab=stock-onhand",
        unit.poNo ? `From ${unit.poNo}` : null,
        unit.soldAt ?? null,
      ));
    }
    if (line.soldQty > 0) words.push("Delivered");

    for (const unit of line.reservedUnits) {
      const unitName = unit.unitCode ?? unit.id;
      facts.push(fact(
        `reserved:${unit.id}`,
        `At Carres · Unit ${unitName}`,
        "current",
        "Stock",
        "/operation?tab=stock-onhand",
        unit.poNo ? `From ${unit.poNo}` : null,
        unit.dateIn,
      ));
    }
    if (line.reservedQty > 0) {
      words.push("At Carres");
      clear = false;
    }

    let remaining = line.outstandingQty;
    for (const po of input.purchaseOrders) {
      if (remaining <= 0) break;
      const matching = poMatchesSku(po, line.sku);
      const openOnPo = matching.reduce(
        (sum, row) => sum + Math.max(0, Number(row.qty) - Number(row.receivedQty)),
        0,
      );
      if (openOnPo <= 0) continue;
      const qty = Math.min(remaining, openOnPo);
      facts.push(fact(
        `po:${po.id}:${line.sku}`,
        `${po.currentFact} · ${po.id}`,
        "current",
        "Purchasing",
        `/operation/procurement?po=${encodeURIComponent(po.id)}`,
        `${qty} ${qty === 1 ? "item" : "items"}${po.etaDate ? ` · Expected ${po.etaDate}` : ""}`,
      ));
      if (!words.includes(po.currentFact)) words.push(po.currentFact);
      remaining -= qty;
      clear = false;
    }

    if (remaining > 0) {
      facts.push(fact(
        `unassigned:${line.sku}`,
        `Waiting for Purchasing · ${remaining} ${remaining === 1 ? "item" : "items"}`,
        "attention",
        "Purchasing",
        "/operation?tab=purchase",
      ));
      words.push("Waiting for Purchasing");
      clear = false;
    }

    positions.push(`${label} · ${words.join(" / ") || "No recorded position"}`);
    return { id: line.sku, title: `${label} · ${line.committedQty}`, facts };
  });

  if (input.allocation.unmatchedUnits.length > 0) {
    clear = false;
    groups.push({
      id: "unmatched",
      title: "Units outside the current order lines",
      facts: input.allocation.unmatchedUnits.map((unit) => fact(
        `unmatched:${unit.id}`,
        `Unit ${unit.unitCode ?? unit.id} · ${unit.status === "sold" ? "Delivered" : "Reserved"}`,
        "attention",
        "Stock",
        "/operation?tab=stock-onhand",
        unit.sku,
      )),
    });
  }

  return { lane: { key: "goods", title: "Goods", groups }, positions, clear };
}

function deliveryLane(input: SalesOrderRouteInput): { lane: SalesOrderRouteLane; clear: boolean } {
  const deliveryHref = `/operation?tab=delivery&order=${encodeURIComponent(input.order.id)}`;
  const attempts = input.delivery.attempts.map((attempt) => {
    const word = attempt.result === "delivered" ? "Delivered" : "Not Delivered";
    const detail = [attempt.doNumber, attempt.scheduledDate, attempt.reason].filter(Boolean).join(" · ") || null;
    return fact(
      `delivery:${attempt.id}`,
      `Delivery ${attempt.attemptNo} · ${word}`,
      attempt.result === "delivered" ? "complete" : "attention",
      "Delivery",
      deliveryHref,
      detail,
      attempt.recordedAt,
    );
  });
  const lastAttempt = input.delivery.attempts[input.delivery.attempts.length - 1];
  if (input.delivery.booking && lastAttempt?.result !== "delivered") {
    const booking = input.delivery.booking;
    attempts.push(fact(
      "delivery:booking",
      `${booking.partnerName?.trim() || "Logistics Partner"} · Confirmed`,
      "current",
      "Delivery",
      deliveryHref,
      [booking.date, booking.slot, booking.partnerName].filter(Boolean).join(" · ") || null,
      booking.date,
    ));
  }
  if (attempts.length === 0) {
    attempts.push(fact(
      "delivery:unassigned",
      "Promised this day, no date yet",
      "attention",
      "Delivery",
      deliveryHref,
      input.order.deliveryDate ? `Customer Delivery · ${input.order.deliveryDate}` : null,
    ));
  }
  const clear = input.delivery.attempts.some((attempt) => attempt.result === "delivered") || !!input.order.deliveredAt;
  return { lane: { key: "delivery", title: "Delivery", groups: [{ id: "delivery", title: "Delivery", facts: attempts }] }, clear };
}

function moneyLane(input: SalesOrderRouteInput): { lane: SalesOrderRouteLane; clear: boolean } {
  const incoming = input.money.known && input.money.outstanding > 0
    ? fact("money:in", `RM ${money(input.money.outstanding)} owed by customer`, "attention", "Finance", "/finance/ar", `Paid RM ${money(input.money.paid)}`)
    : fact("money:in", input.money.known ? "Customer payment clear" : "Customer balance not recorded", input.money.known ? "clear" : "current", "Finance", "/finance/ar");
  const refundFacts = input.refunds.map((refund) => fact(
    `refund:${refund.id}`,
    refund.status === "approved"
      ? `RM ${money(refund.amount)} approved refund not paid`
      : `RM ${money(refund.amount)} refund · ${refund.status[0]!.toUpperCase()}${refund.status.slice(1)}`,
    refund.status === "requested" || refund.status === "approved" ? "attention" : "complete",
    "Finance",
    "/finance/ar",
    null,
    refund.requestedAt,
  ));
  const refundOpen = input.refunds.some((refund) => refund.status === "requested" || refund.status === "approved");
  return {
    lane: {
      key: "money",
      title: "Money",
      groups: [
        { id: "money-in", title: "Customer to Carres", facts: [incoming] },
        { id: "money-out", title: "Carres to customer", facts: refundFacts.length > 0 ? refundFacts : [fact("refund:none", "No refund obligation", "clear", "Finance", "/finance/ar")] },
      ],
    },
    clear: (!input.money.known || input.money.outstanding <= 0) && !refundOpen,
  };
}

function loanLane(input: SalesOrderRouteInput): { lane: SalesOrderRouteLane; clear: boolean } {
  const facts = input.loans.map((loan) => {
    const supplierReturnOpen = loan.source === "supplier" && !loan.returnedToSupplierAt;
    const title = loan.status === "on_loan"
      ? "With customer"
      : supplierReturnOpen ? "Returned by customer · supplier return open" : "Returned";
    return fact(
      `loan:${loan.id}`,
      title,
      loan.status === "on_loan" || supplierReturnOpen ? "attention" : "complete",
      "Loan",
      `/operation/orders/so/${encodeURIComponent(input.order.id)}?route=1#loan`,
      [loan.label, loan.loanNoteNo].filter(Boolean).join(" · ") || null,
      loan.returnedAt ?? loan.loanedAt,
    );
  });
  const clear = input.loans.every((loan) => loan.status === "returned" && (loan.source !== "supplier" || !!loan.returnedToSupplierAt));
  return {
    lane: { key: "loan", title: "Loan", groups: [{ id: "loan", title: "Loan", facts: facts.length > 0 ? facts : [fact("loan:none", "No loan obligation", "clear", "Loan", null)] }] },
    clear,
  };
}

function otherLane(input: SalesOrderRouteInput): { lane: SalesOrderRouteLane; clear: boolean } {
  const claimFacts = input.claims.map((item) => fact(
    `claim:${item.id}`,
    `${item.claimNo} · ${item.status === "closed" ? "Closed" : "Open"}`,
    item.status === "closed" ? "complete" : "attention",
    "Claims",
    `/operation?tab=claims&claim=${encodeURIComponent(item.id)}`,
    item.poId,
    item.reportedAt,
  ));
  const caseFacts = input.cases.map((item) => fact(
    `case:${item.id}`,
    `${item.caseNo} · ${item.closed ? "Closed" : "Open"}`,
    item.closed ? "complete" : "attention",
    "Service Cases",
    `/operation?tab=service-notes&case=${encodeURIComponent(item.id)}`,
    null,
    item.openedAt,
  ));
  const workFacts = input.work.map((item) => fact(
    `work:${item.id}`,
    `${item.title} · ${item.state === "closed" ? "Closed" : "Open"}`,
    item.state === "closed" ? "complete" : "attention",
    item.module,
    "/operation?tab=work",
    null,
    item.createdAt,
  ));
  return {
    lane: {
      key: "other",
      title: "Other Commitments",
      groups: [
        { id: "claims", title: "Claims", facts: claimFacts.length > 0 ? claimFacts : [fact("claim:none", "No supplier claim", "clear", "Claims", "/operation?tab=claims")] },
        { id: "cases", title: "Cases", facts: caseFacts.length > 0 ? caseFacts : [fact("case:none", "No service case", "clear", "Service Cases", "/operation?tab=service-notes")] },
        { id: "work", title: "Work", facts: workFacts.length > 0 ? workFacts : [fact("work:none", "No open owner work", "clear", "Work", "/operation?tab=work")] },
      ],
    },
    clear: input.claims.every((item) => item.status === "closed") && input.cases.every((item) => item.closed) && input.work.every((item) => item.state === "closed"),
  };
}

function documents(input: SalesOrderRouteInput): SalesOrderRouteDocument[] {
  const orderHref = `/operation/orders/so/${encodeURIComponent(input.order.id)}`;
  const docs: SalesOrderRouteDocument[] = [{ id: "so", kind: "Sales Order", number: `SO-${input.order.so}`, href: orderHref }];
  for (const revision of input.revisions) docs.push({ id: `rev:${revision}`, kind: "Revision", number: `Rev ${revision}`, href: `${orderHref}?revision=${revision}` });
  for (const po of input.purchaseOrders) {
    const href = `/operation/procurement?po=${encodeURIComponent(po.id)}`;
    docs.push({ id: `po:${po.id}`, kind: "Purchase Order", number: po.id, href, detail: po.currentFact });
    if (po.supplierDoNumber) docs.push({ id: `supplier-do:${po.id}`, kind: "Supplier DO", number: po.supplierDoNumber, href });
    for (const record of input.receivingRecords.filter((item) => item.poId === po.id)) {
      const receivingHref = `/operation?tab=receiving&receipt=${encodeURIComponent(record.id)}`;
      if (record.supplierDoNumber && record.supplierDoNumber !== po.supplierDoNumber)
        docs.push({ id: `supplier-do:${record.id}`, kind: "Supplier DO", number: record.supplierDoNumber, href: receivingHref });
      docs.push({ id: `grn:${record.id}`, kind: "Receiving Record", number: record.recordNo, href: receivingHref, detail: record.status });
    }
  }
  if (input.order.doNumber) docs.push({ id: "delivery-order", kind: "Delivery Order", number: input.order.doNumber, href: `/operation?tab=delivery&order=${encodeURIComponent(input.order.id)}` });
  if (input.order.invoiceNo) docs.push({ id: "invoice", kind: "Invoice", number: input.order.invoiceNo, href: `/finance/invoices?order=${encodeURIComponent(input.order.id)}` });
  for (const loan of input.loans) if (loan.loanNoteNo) docs.push({ id: `loan-note:${loan.id}`, kind: "Loan Note", number: loan.loanNoteNo, href: `${orderHref}?route=1#loan` });
  for (const item of input.claims) docs.push({ id: `claim:${item.id}`, kind: "Supplier Claim", number: item.claimNo, href: `/operation?tab=claims&claim=${encodeURIComponent(item.id)}` });
  for (const item of input.cases) docs.push({ id: `case:${item.id}`, kind: "Service Case", number: item.caseNo, href: `/operation?tab=service-notes&case=${encodeURIComponent(item.id)}` });
  return docs;
}

export function resolveSalesOrderRoute(input: SalesOrderRouteInput): SalesOrderRoute {
  const goods = goodsLane(input);
  const delivery = deliveryLane(input);
  const moneyResult = moneyLane(input);
  const loan = loanLane(input);
  const other = otherLane(input);
  return {
    orderId: input.order.id,
    soNumber: `SO-${input.order.so}`,
    documents: documents(input),
    lanes: [goods.lane, delivery.lane, moneyResult.lane, loan.lane, other.lane],
    currentPositions: goods.positions,
    noActionRequired: goods.clear && delivery.clear && moneyResult.clear && loan.clear && other.clear,
  };
}
