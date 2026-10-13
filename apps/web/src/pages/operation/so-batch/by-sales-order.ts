import {
  soBatchPurchaseStatus,
  type PurchaseDemandRow,
  type SoBatchOrderRow,
} from "@carres/shared";
import { BY_SUPPLIER, type SupplierShow } from "./by-supplier";

/**
 * SO BATCH PURCHASE · BY SALES ORDER (owner 13 Oct 2026, round 3; 01 §5;
 * Purchasing MASTER §9.1). One row per Sales Order on the same list the other
 * three groupings use, so nothing scrolls sideways.
 *
 * Pure: it only counts and words what the SO Batch read already carries.
 * Whether a line still needs buying is `soBatchPurchaseStatus`, the page's one
 * arithmetic; every date is the server's. Nothing is recalculated here.
 */
export type OrderRowStatus = "to_buy" | "cut_off_passed" | "late_to_order" | "partly_ordered" | "ordered" | "from_ready_stock" | "blocked";

export interface OrderRowFacts {
  /** The customer's quantity over every item line. */
  pieces: number;
  /** One category on every line, so its own unit counts them; else `null`. */
  unit: PurchaseDemandRow["category"];
  /** Item lines with something still to buy. */
  toBuy: number;
  /** Item lines with a quantity on a PO. */
  ordered: number;
  /** Item lines Ready Stock answers. */
  stock: number;
  status: OrderRowStatus;
  /** The earliest Order By date among the lines that can be bought. */
  orderBy: string | null;
  /** Every PO this order's lines are on. */
  poIds: string[];
}

const lineStatus = (order: SoBatchOrderRow, line: SoBatchOrderRow["lines"][number], leaf: PurchaseDemandRow | undefined) =>
  soBatchPurchaseStatus({ ...order, lines: [line] }, leaf ? [leaf] : []);

/**
 * What one Sales Order row says. `canBuy` is the page's own tick rule, passed
 * in so this file cannot hold a second one; `nowKey` is Malaysia's wall clock
 * as `YYYY-MM-DDTHH:MM`, the spelling of a line's `poWindow`.
 */
export function orderRowFacts(
  order: SoBatchOrderRow,
  leaves: readonly PurchaseDemandRow[],
  canBuy: (leaf: PurchaseDemandRow) => boolean,
  nowKey: string,
  today: string = nowKey.slice(0, 10),
): OrderRowFacts {
  const leafOf = (lineId: string) => leaves.find((leaf) => leaf.lineIds.includes(lineId));
  let toBuy = 0, ordered = 0, stock = 0;
  for (const line of order.lines) {
    if (lineStatus(order, line, leafOf(line.orderLineId)) !== "Done") toBuy += 1;
    if (line.pos.some((po) => po.qty > 0) || (line.poReserved ?? []).some((po) => po.qty > 0)) ordered += 1;
    if (line.stockTaken > 0) stock += 1;
  }
  const categories = new Set(order.lines.map((line) => line.category));
  const buyable = leaves.filter(canBuy);
  const orderBy = buyable.map((leaf) => leaf.orderBy).filter((date): date is string => !!date).sort()[0] ?? null;
  const poIds = [...new Set(order.lines.flatMap((line) => [...line.pos, ...(line.poReserved ?? [])].filter((po) => po.qty > 0).map((po) => po.poId)))].sort();
  const whole = soBatchPurchaseStatus(order, leaves);
  const status: OrderRowStatus =
    whole === "Done" ? (poIds.length > 0 ? "ordered" : "from_ready_stock")
      : buyable.length === 0 ? "blocked"
        : orderBy != null && orderBy < today ? "late_to_order"
          : buyable.some((leaf) => !!leaf.poWindow && leaf.poWindow < nowKey) ? "cut_off_passed"
            : whole === "Partial" ? "partly_ordered"
              : "to_buy";
  return {
    pieces: order.lines.reduce((sum, line) => sum + line.qty, 0),
    unit: categories.size === 1 ? ((order.lines[0]?.category ?? null) as PurchaseDemandRow["category"]) : null,
    toBuy, ordered, stock, status, orderBy, poIds,
  };
}

/** `To buy` · `Ordered` · `All`, read for a Sales Order the way the other
 *  groupings read them: something still to buy, something on a PO, or every
 *  order the rail is showing. */
export function orderShownIn(show: SupplierShow, facts: OrderRowFacts): boolean {
  if (show === "all") return true;
  if (show === "ordered") return facts.poIds.length > 0;
  return facts.toBuy > 0;
}

/** The words. COPY-STANDARD "SO Batch Purchase · By sales order". */
export const BY_SALES_ORDER = {
  colSoNo: "SO no.",
  colItems: "Items",
  colProceedDate: "Proceed date",
  colRequestedDelivery: "Customer’s original requested delivery",
  colStatus: "Status",
  lineItem: "Item",
  lineQty: "Qty",
  lineStock: "Stock you can use",
  lineSupplier: "Supplier",
  lineDeliverTo: "Supplier delivers to",
  linePoNo: "PO No",
  notRecorded: "Not recorded",
  noItems: "No items on this order",
  partOfSet: "Part of the set above",
  fromReadyStock: "From ready stock",
  noPoNeeded: "No PO needed",
  /** `2 to buy · 1 ordered · 1 stock`: item lines, never pieces. */
  itemsLine: (facts: Pick<OrderRowFacts, "toBuy" | "ordered" | "stock">) =>
    [facts.toBuy ? `${facts.toBuy} to buy` : "", facts.ordered ? `${facts.ordered} ordered` : "", facts.stock ? `${facts.stock} stock` : ""]
      .filter(Boolean).join(" · "),
  status: (status: OrderRowStatus) =>
    status === "ordered" ? BY_SUPPLIER.ordered
      : status === "from_ready_stock" ? BY_SALES_ORDER.fromReadyStock
        : status === "partly_ordered" ? BY_SUPPLIER.partlyOrdered
          : status === "late_to_order" ? BY_SUPPLIER.lateToOrder
            : status === "cut_off_passed" ? BY_SUPPLIER.cutOffPassed
              : BY_SUPPLIER.toBuy,
  footer: (orders: number) => `${orders} ${orders === 1 ? "sales order" : "sales orders"}`,
  nothingToBuy: BY_SUPPLIER.nothingToBuy,
  nothingOrdered: BY_SUPPLIER.nothingOrdered,
  /* `Use stock` on the selection bar (owner 13 Oct 2026, round 3). */
  useStock: (lines: number) => `Use stock · ${lines}`,
  useStockWhy: "Reserves the suggested free Unit for each ticked item that has stock. The rest stay to buy.",
  useStockDone: (units: number) => `${units} ${units === 1 ? "Unit" : "Units"} reserved from stock`,
  useStockFailed: "Not confirmed · Try again",
} as const;
