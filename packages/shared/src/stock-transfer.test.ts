import { describe, expect, it } from "vitest";
import {
  IN_TRANSIT_STOCK_STATUS,
  STOCK_TRANSFER_PURPOSES,
  STOCK_TRANSFER_STATE_LABEL,
  isInTransitStockStatus,
  stockTransferPurposeLabel,
  stockTransferStateLabel,
  stockTransferStateOf,
  type StockTransferEventFact,
} from "./stock-transfer";
import {
  OPS_STOCK_STATUS_LABEL,
  SELLABLE_STOCK_STATUSES,
  isSellableStockStatus,
} from "./stock-hold";
import { aggregateStockUnits } from "./ready-stock-plan";

const ev = (...kinds: StockTransferEventFact["kind"][]): StockTransferEventFact[] =>
  kinds.map((kind) => ({ kind }));

describe("stockTransferStateOf — the state is DERIVED, never stored", () => {
  it("a transfer nobody has acted on is Requested", () => {
    expect(stockTransferStateOf(ev("requested"))).toBe("requested");
  });

  it("collection alone derives In transit — NEVER Received", () => {
    // The whole point of two events: one confirmation may not pretend the
    // goods both left and arrived (card §1, blueprint item 8).
    expect(stockTransferStateOf(ev("requested", "collected"))).toBe("in_transit");
    expect(stockTransferStateOf(ev("requested", "collected"))).not.toBe("received");
  });

  it("only an arrival derives Received", () => {
    expect(stockTransferStateOf(ev("requested", "collected", "arrived"))).toBe(
      "received",
    );
  });

  it("an arrival outranks everything else that was logged", () => {
    expect(stockTransferStateOf(ev("arrived", "collected", "requested"))).toBe(
      "received",
    );
  });

  it("a cancelled transfer that never left is Cancelled", () => {
    expect(stockTransferStateOf(ev("requested", "cancelled"))).toBe("cancelled");
  });

  it("goods that were collected are never shown as Cancelled", () => {
    // The database refuses cancel-after-collection; the arithmetic agrees, so
    // the two can never print different answers for one transfer.
    expect(stockTransferStateOf(ev("requested", "collected", "cancelled"))).toBe(
      "in_transit",
    );
  });

  it("the order events arrive in does not change the answer", () => {
    expect(stockTransferStateOf(ev("collected", "requested"))).toBe("in_transit");
    expect(stockTransferStateOf(ev("arrived", "requested", "collected"))).toBe(
      "received",
    );
  });

  it("every state has its own word", () => {
    const labels = Object.values(STOCK_TRANSFER_STATE_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
    expect(stockTransferStateLabel(ev("requested", "collected"))).toBe("In transit");
  });
});

describe("a unit in transit is absent from every availability figure", () => {
  it("In transit is the `transferred` status, and it is not sellable", () => {
    expect(IN_TRANSIT_STOCK_STATUS).toBe("transferred");
    expect(isInTransitStockStatus("transferred")).toBe(true);
    expect(isSellableStockStatus(IN_TRANSIT_STOCK_STATUS)).toBe(false);
    expect(SELLABLE_STOCK_STATUSES).not.toContain(IN_TRANSIT_STOCK_STATUS);
  });

  it("it renders honestly as `In transit`, never as free", () => {
    // Card §2: "an in-transit unit renders its state honestly (In transit, not
    // free)". `transferred` had no writer and no rows before 0365, so this is
    // the word being FIXED, not a word being changed under anyone.
    expect(OPS_STOCK_STATUS_LABEL[IN_TRANSIT_STOCK_STATUS]).toBe("In transit");
  });

  it("the ready-stock aggregate counts it as neither free, reserved nor incoming", () => {
    const counts = aggregateStockUnits([
      { sku: "SKU-A", status: "free" },
      { sku: "SKU-A", status: IN_TRANSIT_STOCK_STATUS },
      { sku: "SKU-A", status: IN_TRANSIT_STOCK_STATUS },
    ]);
    const a = counts.get("SKU-A");
    expect(a?.free).toBe(1);
    expect(a?.reserved).toBe(0);
    expect(a?.incoming).toBe(0);
  });
});

describe("why goods move", () => {
  it("sales_order is a purpose — it is the only one that may take a reserved unit", () => {
    expect(STOCK_TRANSFER_PURPOSES.map((p) => p.key)).toContain("sales_order");
  });

  it("every purpose carries a human word, and they are all distinct", () => {
    const labels = STOCK_TRANSFER_PURPOSES.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(stockTransferPurposeLabel("display")).toBe("For display");
  });

  it("an unknown purpose prints itself rather than an empty cell", () => {
    expect(stockTransferPurposeLabel("something_else")).toBe("something_else");
    expect(stockTransferPurposeLabel(null)).toBe("—");
  });
});
