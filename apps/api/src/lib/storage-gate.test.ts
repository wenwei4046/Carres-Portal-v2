import { describe, it, expect } from "vitest";
import { storageBlock } from "./storage-gate";

/**
 * Collect-before-delivery gate (0184). Verifies the gate fires ONLY when a
 * storage fee is genuinely owed and neither collected nor principal-waived, and
 * fails OPEN on a lookup error (must not block the 158 live dispatches).
 */
interface GateData {
  control: Record<string, unknown> | null;
  order: Record<string, unknown> | null;
  lines: Array<{ sku: string }>;
  throws?: boolean;
}
function gateSb(d: GateData) {
  const from = (table: string) => {
    const res =
      table === "ops_order_control"
        ? { data: d.control, error: null }
        : table === "orders"
          ? { data: d.order, error: null }
          : { data: d.lines, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: () => (d.throws ? Promise.reject(new Error("boom")) : Promise.resolve(res)),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        (d.throws ? Promise.reject(new Error("boom")) : Promise.resolve(res)).then(resolve, reject),
    };
    return b;
  };
  return { from };
}

const ORDER_ID = "00000000-0000-0000-0000-00000000010a";
const PAST = "2020-01-01"; // far enough back that any fee has accrued

describe("storageBlock", () => {
  it("opens the gate once storage is collected", async () => {
    const sb = gateSb({
      control: { storage_from: PAST, storage_collected_at: "2026-06-26T00:00:00Z", storage_waiver_status: "none" },
      order: { delivery_date: PAST },
      lines: [{ sku: "MS1001" }],
    });
    expect(await storageBlock(sb, ORDER_ID)).toBeNull();
  });

  it("opens the gate once a principal approves a waiver", async () => {
    const sb = gateSb({
      control: { storage_from: PAST, storage_collected_at: null, storage_waiver_status: "approved" },
      order: { delivery_date: PAST },
      lines: [{ sku: "MS1001" }],
    });
    expect(await storageBlock(sb, ORDER_ID)).toBeNull();
  });

  it("BLOCKS when a fee is owed and neither collected nor approved", async () => {
    const sb = gateSb({
      control: { storage_from: PAST, storage_collected_at: null, storage_waiver_status: "none", storage_fee_override: null },
      order: { delivery_date: PAST },
      lines: [{ sku: "MS1001" }],
    });
    const block = await storageBlock(sb, ORDER_ID);
    expect(block).not.toBeNull();
    expect(block?.amount).toBeGreaterThan(0);
    expect(block?.message).toContain("Storage fee");
  });

  it("does not block an order with no MS/BF or sofa line", async () => {
    const sb = gateSb({
      control: { storage_from: PAST, storage_collected_at: null, storage_waiver_status: "none" },
      order: { delivery_date: PAST },
      lines: [{ sku: "PILLOW-01" }],
    });
    expect(await storageBlock(sb, ORDER_ID)).toBeNull();
  });

  it("does not block when no storage start nor ETA exists (fee 0)", async () => {
    const sb = gateSb({
      control: { storage_from: null, storage_collected_at: null, storage_waiver_status: "none" },
      order: { delivery_date: null },
      lines: [{ sku: "MS1001" }],
    });
    expect(await storageBlock(sb, ORDER_ID)).toBeNull();
  });

  it("a manual override of 0 clears the gate even past the ETA", async () => {
    const sb = gateSb({
      control: { storage_from: PAST, storage_collected_at: null, storage_waiver_status: "none", storage_fee_override: 0 },
      order: { delivery_date: PAST },
      lines: [{ sku: "MS1001" }],
    });
    expect(await storageBlock(sb, ORDER_ID)).toBeNull();
  });

  it("fails OPEN on a lookup error (never blocks on infra hiccup)", async () => {
    const sb = gateSb({ control: null, order: null, lines: [], throws: true });
    expect(await storageBlock(sb, ORDER_ID)).toBeNull();
  });
});
