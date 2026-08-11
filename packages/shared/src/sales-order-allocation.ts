/**
 * CARD 2 — UNIT / STOCK ALLOCATION TRUTH · the one arithmetic.
 *
 * `resolveUnitAllocation(input)` answers, for any Sales Order, the unit half
 * of "how much is physically allocated / fulfilled" — the question Card 1
 * deliberately could not answer:
 *
 *   1. Which real Units are RESERVED to this SO right now?
 *   2. Which real Units were SOLD (delivered) to this SO?
 *   3. Per committed line: how many units are still unallocated?
 *
 * AUTHORITY FLOWS DOWN (Card 1 §1, applied here): the committed quantities
 * come from the Card 1 commitment resolver (`resolveCurrentCustomerCommitment`
 * — live order_lines via the snapshot arithmetic); the physical side comes
 * from the per-unit register (`ops_stock_items` — the register is the
 * authority, Stock MASTER §2). This resolver may NEVER read operation_stage,
 * booking state, orders.status, line_stock_status or any legacy summary word
 * — the types below simply do not carry them.
 *
 * MATCHING: the catalog is empty, so order_lines.sku ↔ ops_stock_items.sku
 * match only under `normalizeSkuKey` (project-catalog-empty-sku-naming) —
 * the SAME rule the drawer's Ready picker and the post-receive labelling use.
 * A bulk register row counts its `qty` (0218); a unit row counts 1.
 *
 * A reserved/sold unit that matches NO committed line is NOT dropped — it is
 * reported in `unmatchedUnits`. A register that silently hides a unit is the
 * defect this card exists to end.
 */

import { normalizeSkuKey } from "./sku-code";

/** One register row, as the allocation read carries it. */
export interface AllocationUnit {
  id: string;
  /** 0153 — the identity born at PO placement (`id-abc123456`). */
  unitCode: string | null;
  sku: string;
  status: "reserved" | "sold";
  condition: string;
  warehouseId: string | null;
  /** The PO this unit came from — birth lineage (0153). */
  poNo: string | null;
  /** Bulk record (0218): one row = `qty` physical units. */
  qty: number;
  dateIn: string | null;
  soldAt?: string | null;
}

export interface AllocationLine {
  sku: string;
  committedQty: number;
  reservedUnits: AllocationUnit[];
  soldUnits: AllocationUnit[];
  reservedQty: number;
  soldQty: number;
  /** max(0, committed − reserved − sold): units the SO is still owed
   *  from stock's point of view. Purchasing may already cover it — that is
   *  Purchasing's summary, not this one. */
  outstandingQty: number;
}

export interface SalesOrderAllocation {
  orderId: string;
  soRef: string;
  lines: AllocationLine[];
  /** Units reserved/sold to this SO whose SKU matches no committed line —
   *  surfaced, never hidden. */
  unmatchedUnits: AllocationUnit[];
  totals: {
    committedQty: number;
    reservedQty: number;
    soldQty: number;
    outstandingQty: number;
  };
}

export interface UnitAllocationInput {
  orderId: string;
  /** `SO-{so}` — the exact reservation ref. A loan ref (`LOAN SO-{so}`) is a
   *  different obligation and must already be excluded by the exact match. */
  soRef: string;
  /** The CURRENT committed goods — Card 1's resolver output (`lines`). */
  commitmentLines: ReadonlyArray<{ sku: string; qty: number }>;
  /** Register rows already scoped to this SO: status='reserved' with
   *  reserved_ref = soRef (exact), or sold_order_id = orderId. */
  units: ReadonlyArray<AllocationUnit>;
}

const unitQty = (u: AllocationUnit): number =>
  Number.isFinite(u.qty) && u.qty > 0 ? Math.floor(u.qty) : 1;

export function resolveUnitAllocation(
  input: UnitAllocationInput,
): SalesOrderAllocation {
  // Committed quantities per normalized product key; duplicate lines combine,
  // but the ANSWER keeps one entry per distinct committed sku string so the
  // reader sees the words the customer agreed to.
  const lineOrder: string[] = [];
  const committedBySku = new Map<string, number>();
  for (const l of input.commitmentLines) {
    const sku = String(l.sku ?? "").trim();
    if (!sku) continue;
    if (!committedBySku.has(sku)) lineOrder.push(sku);
    committedBySku.set(sku, (committedBySku.get(sku) ?? 0) + Math.max(0, Number(l.qty) || 0));
  }

  const keyOf = (sku: string) => normalizeSkuKey(sku) || sku;
  const skusByKey = new Map<string, string[]>();
  for (const sku of lineOrder) {
    const k = keyOf(sku);
    const arr = skusByKey.get(k) ?? skusByKey.set(k, []).get(k)!;
    arr.push(sku);
  }

  // Units attach to the FIRST committed sku sharing their normalized key —
  // deterministic, and a duplicate-sku order still totals correctly because
  // outstanding is computed per sku after attachment.
  const reservedBySku = new Map<string, AllocationUnit[]>();
  const soldBySku = new Map<string, AllocationUnit[]>();
  const unmatchedUnits: AllocationUnit[] = [];
  for (const u of input.units) {
    const home = skusByKey.get(keyOf(u.sku))?.[0];
    if (!home) {
      unmatchedUnits.push(u);
      continue;
    }
    const map = u.status === "sold" ? soldBySku : reservedBySku;
    const arr = map.get(home) ?? map.set(home, []).get(home)!;
    arr.push(u);
  }

  const lines: AllocationLine[] = lineOrder.map((sku) => {
    const reservedUnits = reservedBySku.get(sku) ?? [];
    const soldUnits = soldBySku.get(sku) ?? [];
    const committedQty = committedBySku.get(sku) ?? 0;
    const reservedQty = reservedUnits.reduce((s, u) => s + unitQty(u), 0);
    const soldQty = soldUnits.reduce((s, u) => s + unitQty(u), 0);
    return {
      sku,
      committedQty,
      reservedUnits,
      soldUnits,
      reservedQty,
      soldQty,
      outstandingQty: Math.max(0, committedQty - reservedQty - soldQty),
    };
  });

  const sum = (pick: (l: AllocationLine) => number) =>
    lines.reduce((s, l) => s + pick(l), 0);

  return {
    orderId: input.orderId,
    soRef: input.soRef,
    lines,
    unmatchedUnits,
    totals: {
      committedQty: sum((l) => l.committedQty),
      reservedQty:
        sum((l) => l.reservedQty) +
        unmatchedUnits.filter((u) => u.status === "reserved").reduce((s, u) => s + unitQty(u), 0),
      soldQty:
        sum((l) => l.soldQty) +
        unmatchedUnits.filter((u) => u.status === "sold").reduce((s, u) => s + unitQty(u), 0),
      outstandingQty: sum((l) => l.outstandingQty),
    },
  };
}
