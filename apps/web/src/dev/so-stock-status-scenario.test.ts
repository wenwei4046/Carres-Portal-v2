/**
 * The local walk's SIMULATED world answers through the REAL shared Stock
 * Status function and the existing door's rules — proven here so the owner's
 * walk shows the product's behaviour, not the fixture's.
 */
import { beforeAll, describe, expect, it } from "vitest";

const base = "http://127.0.0.1:8888";
type Facts = { facts: Record<string, { stock: { status: string | null; issueQty: number } | null }>; failed: { stock: boolean } };
let mod: typeof import("./so-stock-status-scenario");

beforeAll(async () => {
  window.fetch = async () => new Response(JSON.stringify({ message: "nothing here" }), { status: 404 });
  mod = await import("./so-stock-status-scenario");
}, 180_000);

const idOf = (so: number) => `00000000-0000-4901-8000-${String(so).padStart(12, "0")}`;
const lineOf = (so: number, k = 1) => `00000000-0000-4902-8000-${String(so * 10 + k).padStart(12, "0")}`;
const facts = async () => (await (await window.fetch(`${base}/api/operation/orders/register-facts`)).json()) as Facts;
const statusOf = async (so: number) => (await facts()).facts[idOf(so)]!.stock;
const ready = async (so: number) =>
  (await (await window.fetch(`${base}/api/operation/purchase/demands/${idOf(so)}/ready-stock`)).json()) as {
    lines: Array<{ orderLineId: string; remainingQty: number }>;
    units: Array<{ itemId: string; sku: string; reservedForLineId: string | null; blocked: string | null; matchingLineIds: string[] }>;
  };
const save = (so: number, itemIds: string[], k = 1) =>
  window.fetch(`${base}/api/operation/purchase/demands/ready-stock/save`, {
    method: "POST",
    body: JSON.stringify({ orderId: idOf(so), orderLineId: lineOf(so, k), itemIds }),
  });
const freeFor = async (so: number, k: number) =>
  (await ready(so)).units.filter((u) => !u.reservedForLineId && u.matchingLineIds.includes(lineOf(so, k))).map((u) => u.itemId);

describe("the Stock Status local walk (simulated)", () => {
  it("opens on the four approved states, the damaged issue and a goods list without the cancelled order", async () => {
    expect((await statusOf(1319))!.status).toBe("awaiting_goods");
    expect((await statusOf(2901))!.status).toBe("to_purchase");
    expect((await statusOf(2903))!.status).toBe("partially_ready");
    expect((await statusOf(2904))!.status).toBe("ready");
    expect(await statusOf(2905)).toMatchObject({ status: "awaiting_goods", issueQty: 1 });
    const list = (await (await window.fetch(`${base}/api/operation/orders?stage=proceeded`)).json()) as { orders: Array<{ so: number }> };
    expect(list.orders.map((o) => o.so)).not.toContain(2910);
  });

  it("Reserve stock follows the UNCOVERED quantity — the door's own remainder, Purchasing's one arithmetic", async () => {
    expect((await statusOf(2901))!.status).toBe("to_purchase");
    /* none covered 3 · PO covers 2 of 3 → 1 · PO covers all → 0 (no action) */
    expect((await ready(2901)).lines.map((l) => l.remainingQty)).toEqual([3, 1, 0]);
    expect(await freeFor(2901, 3)).toEqual([]);
    const line1 = await freeFor(2901, 1);
    expect(line1.length).toBeGreaterThanOrEqual(4);
    /* The door rechecks: a 4th Unit on a line that needs 3 is refused, all or none. */
    const four = await save(2901, line1.slice(0, 4), 1);
    expect(four.status).toBe(422);
    expect(((await four.json()) as { code: string }).code).toBe("line_already_covered");
    expect((await save(2901, line1.slice(0, 3), 1)).status).toBe(200);
    const line2 = await freeFor(2901, 2);
    expect((await save(2901, line2.slice(0, 2), 2)).status).toBe(422);
    expect((await save(2901, line2.slice(0, 1), 2)).status).toBe(200);
    const fact = (await statusOf(2901))!;
    expect(fact.status).toBe("partially_ready");
    expect((await ready(2901)).lines.map((l) => l.remainingQty)).toEqual([0, 0, 0]);
  });

  it("a partly reserved line is offered the rest, and a confirmed save makes it Ready", async () => {
    expect((await statusOf(2903))!.status).toBe("partially_ready");
    const free = await freeFor(2903, 1);
    expect((await save(2903, [...((await ready(2903)).units.filter((u) => u.reservedForLineId).map((u) => u.itemId)), free[0]!], 1)).status).toBe(200);
    expect((await statusOf(2903))!.status).toBe("ready");
  });

  it("the simulated receipt auto-reserves to the explicit lines in lineage order, and forces nothing else", async () => {
    const walk = Object.fromEntries(mod.STOCK_STATUS_WALK.map((w) => [w.so, w]));
    const receive = (so: number, i = 0) => {
      const r = walk[so]!.receipts![i]!;
      mod.simulateReceipt(r.poLineId, r.good, r.damaged, r.wrong);
    };
    receive(1319);
    expect((await statusOf(1319))!.status).toBe("ready");
    receive(2906);
    expect([(await statusOf(2906))!.status, (await statusOf(2907))!.status]).toEqual(["ready", "awaiting_goods"]);
    receive(2906);
    expect((await statusOf(2907))!.status).toBe("ready");
    receive(2908, 0);
    expect(await statusOf(2908)).toMatchObject({ status: "awaiting_goods", issueQty: 2 });
    receive(2908, 1);
    expect((await statusOf(2908))!.status).toBe("ready");
    receive(2909);
    expect((await statusOf(2909))!.status).toBe("ready");
  });
});
