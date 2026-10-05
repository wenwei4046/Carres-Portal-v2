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
const lineOf = (so: number) => `00000000-0000-4902-8000-${String(so * 10 + 1).padStart(12, "0")}`;
const facts = async () => (await (await window.fetch(`${base}/api/operation/orders/register-facts`)).json()) as Facts;
const statusOf = async (so: number) => (await facts()).facts[idOf(so)]!.stock;
const ready = async (so: number) =>
  (await (await window.fetch(`${base}/api/operation/purchase/demands/${idOf(so)}/ready-stock`)).json()) as {
    units: Array<{ itemId: string; reservedForLineId: string | null; blocked: string | null }>;
  };
const save = (so: number, itemIds: string[]) =>
  window.fetch(`${base}/api/operation/purchase/demands/ready-stock/save`, {
    method: "POST",
    body: JSON.stringify({ orderId: idOf(so), orderLineId: lineOf(so), itemIds }),
  });

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

  it("Reserve stock through the existing door: a confirmed save moves To purchase to Ready", async () => {
    const free = (await ready(2901)).units.filter((u) => !u.reservedForLineId && !u.blocked).map((u) => u.itemId);
    expect(free.length).toBeGreaterThanOrEqual(2);
    expect((await save(2901, free.slice(0, 2))).status).toBe(200);
    expect((await statusOf(2901))!.status).toBe("ready");
  });

  it("OPEN DECISION: on a line its PO already covers, the door refuses with its own code", async () => {
    const shelf = (await ready(2902)).units.filter((u) => !u.reservedForLineId);
    expect(shelf.every((u) => u.blocked === "no_line_needs_it")).toBe(true);
    const res = await save(2902, [shelf[0]!.itemId]);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("line_already_covered");
    expect((await statusOf(2902))!.status).toBe("awaiting_goods");
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
