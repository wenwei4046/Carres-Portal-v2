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
function gateSb(d: GateData & { catalog?: Record<string, string> }) {
  const from = (table: string) => {
    const res =
      table === "ops_order_control"
        ? { data: d.control, error: null }
        : table === "orders"
          ? { data: d.order, error: null }
          : table === "product_skus"
            ? {
                data: Object.entries(d.catalog ?? {}).map(([sku, category]) => ({
                  sku,
                  product_models: { category },
                })),
                error: null,
              }
            : { data: d.lines, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      // The catalog read uses `.in(...)`. A fixture WITHOUT `catalog` leaves it
      // undefined on purpose, which is how "the catalog read blew up" is
      // modelled below.
      ...(d.catalog ? { in: () => b } : {}),
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

  it("opens the gate once the manager releases the delivery", async () => {
    const sb = gateSb({
      control: { storage_from: PAST, storage_collected_at: null, storage_waiver_status: "approved" },
      order: { delivery_date: PAST },
      lines: [{ sku: "MS1001" }],
    });
    expect(await storageBlock(sb, ORDER_ID)).toBeNull();
  });

  it("a REQUESTED release is not a release — the goods stay", async () => {
    const sb = gateSb({
      control: { storage_from: PAST, storage_collected_at: null, storage_waiver_status: "requested" },
      order: { delivery_date: PAST },
      lines: [{ sku: "MS1001" }],
    });
    expect(await storageBlock(sb, ORDER_ID)).not.toBeNull();
  });

  it("C9 — the Master-imported fee blocks too (this gate used to ignore it)", async () => {
    // The hole: `storage_fee_msbf` / `_sof` (0207) carry Jess's own keyed
    // figure. The Orders row counted them and this gate did not, so an order
    // with a Master fee and no storage_from dispatched with the money unpaid.
    const sb = gateSb({
      control: {
        storage_from: null,
        storage_collected_at: null,
        storage_waiver_status: "none",
        storage_fee_msbf: 150,
      },
      order: { delivery_date: PAST },
      lines: [{ sku: "MS1001" }],
    });
    const block = await storageBlock(sb, ORDER_ID);
    expect(block?.amount).toBe(150);
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

  it("does NOT block a past-ETA mattress when storage was never turned on (over-block guard)", async () => {
    // The single most important guard: a late order whose operator never set
    // storageFrom must dispatch freely — the gate keys off storageFrom, NEVER
    // the ETA, so normal late deliveries aren't halted.
    const sb = gateSb({
      control: { storage_from: null, storage_collected_at: null, storage_waiver_status: "none" },
      order: { delivery_date: PAST }, // long past the ETA — irrelevant to the gate
      lines: [{ sku: "MS1001" }],
    });
    expect(await storageBlock(sb, ORDER_ID)).toBeNull();
  });

  it("does not block when the order has no overlay row at all", async () => {
    const sb = gateSb({ control: null, order: { delivery_date: PAST }, lines: [{ sku: "MS1001" }] });
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

  /**
   * CARD-2026-08-28 - THE RATE ASKS THE CATALOG, AND THE GATE STILL HOLDS.
   *
   * `B1201S-K` is a real production mattress SKU. The prefix parser calls it
   * "other", so before this Card it pulled in NO rate and an unpaid storage fee
   * could not hold anything. With the catalog asked, it is `msbf` and the gate
   * has something to hold on.
   */
  it("a real catalogued mattress SKU now blocks — the parser called it `other`", async () => {
    const sb = gateSb({
      control: {
        storage_from: PAST,
        storage_collected_at: null,
        storage_waiver_status: "none",
      },
      order: null,
      lines: [{ sku: "B1201S-K" }],
      catalog: { "B1201S-K": "mattress" },
    });
    const block = await storageBlock(sb, ORDER_ID);
    expect(block).not.toBeNull();
    expect(block?.amount).toBeGreaterThan(0);
  });

  /**
   * ⛔ THE ONE THAT MATTERS. `storageBlock` fails OPEN by design, so a throw
   * anywhere inside it RELEASES goods whose fee is unpaid. Asking the catalog
   * added a new call inside that try, and this fixture serves no `product_skus`
   * (no `.in`), so the read blows up exactly as an outage would.
   *
   * The gate must still block, by degrading to the SKU-string parser — a
   * catalog outage costs the fee its accuracy, never the gate its authority.
   */
  it("a catalog read that blows up degrades to the parser and STILL blocks", async () => {
    const sb = gateSb({
      control: {
        storage_from: PAST,
        storage_collected_at: null,
        storage_waiver_status: "none",
      },
      order: null,
      lines: [{ sku: "MS1001" }],
      // no `catalog` — the read throws
    });
    const block = await storageBlock(sb, ORDER_ID);
    expect(block, "a catalog outage must never open a money gate").not.toBeNull();
    expect(block?.amount).toBeGreaterThan(0);
  });
});
