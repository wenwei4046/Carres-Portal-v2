/**
 * THE EXTERNAL LOGISTICS LINK — the boundary, held as tests (0581).
 *
 * What matters is what the link CANNOT do and CANNOT show: a dead, revoked or
 * re-assigned link answers one sentence; the view never carries the internal
 * SO number or money; a save names the company and `external_link`, never a
 * person; a Sunday, a holiday or a past day is refused; `other` needs words.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../index";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
vi.mock("../../lib/today", () => ({ todayIsoMYT: () => "2026-10-19" }));
import { adminClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };

const TOKEN = "A".repeat(43);
const ORDER = "00000000-0000-0000-0000-0000000a0001";
const AL = "00000000-0000-0000-0000-0000000b0002";
const NETS = "00000000-0000-0000-0000-0000000b0001";

type Res = { data?: unknown; error?: unknown };

/** Table-keyed mock: each table answers from its own queue (last answer repeats). */
function mockSb(byTable: Record<string, Res[]>) {
  const writes: Array<{ table: string; op: string; rows: unknown }> = [];
  const from = vi.fn().mockImplementation((table: string) => {
    const queue = byTable[table] ?? [];
    const res = (queue.length > 1 ? queue.shift() : queue[0]) ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "neq", "is", "in", "ilike", "order", "limit", "maybeSingle", "single"]) {
      chain[m] = vi.fn().mockImplementation(self);
    }
    for (const op of ["insert", "upsert", "update"]) {
      chain[op] = vi.fn().mockImplementation((rows: unknown) => {
        writes.push({ table, op, rows });
        return chain;
      });
    }
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(resolve, reject);
    return chain;
  });
  vi.mocked(adminClient).mockReturnValue({ from } as never);
  return { writes };
}

const liveOrder = {
  id: ORDER,
  so: 1362,
  status: "proceed_order",
  delivered_at: null,
  customer_name: "LIM KUAN YANG",
  customer_phone: "0123456789",
  customer_address: "12 Jalan Test, Klang",
  building_type: "Condo",
  delivery_date: "2026-10-27",
  delivery_date_tbd: false,
  source_ref: ["TCF0541"],
  order_lines: [{ sku: "B1201S-K", qty: 1 }],
};

function live(extra: Record<string, Res[]> = {}) {
  return mockSb({
    ops_delivery_partner_links: [{ data: { id: "link-1", order_id: ORDER, leg: 0, partner_id: AL } }],
    orders: [{ data: liveOrder }],
    ops_delivery_arrangements: [{ data: { partner_id: AL, confirmed_date: null, confirmed_time: null } }],
    delivery_partners: [{ data: { id: AL, name: "AL Logistics", kv_default: false } }],
    app_users: [{ data: [] }],
    product_skus: [{ data: [{ sku: "B1201S-K", variant: "King Mattress" }] }],
    ...extra,
  });
}

function call(path: string, init?: RequestInit) {
  return app.fetch(
    new Request(`http://t/public/delivery-link/${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : {},
    }),
    env as never,
  );
}

beforeEach(() => vi.mocked(adminClient).mockReset());

describe("a link that does not work says one sentence", () => {
  it("a malformed token never reaches the database", async () => {
    const { writes } = mockSb({});
    const res = await call("short");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { message: string }).message).toBe("This link no longer works. Ask Carres for a new link.");
    expect(writes).toEqual([]);
  });

  it("an unknown or revoked token", async () => {
    mockSb({ ops_delivery_partner_links: [{ data: null }] });
    expect((await call(TOKEN)).status).toBe(404);
  });

  it("the delivery's company changed — the old company's link is dead", async () => {
    live({ ops_delivery_arrangements: [{ data: { partner_id: NETS } }], delivery_partners: [{ data: { id: NETS, name: "NETS Logistics", kv_default: true } }] });
    expect((await call(TOKEN)).status).toBe(404);
  });

  it("a delivered order", async () => {
    live({ orders: [{ data: { ...liveOrder, delivered_at: "2026-10-27T08:00:00Z" } }] });
    expect((await call(TOKEN)).status).toBe(404);
  });
});

describe("the view is the governed minimum", () => {
  it("names the customer's own reference and never the SO number or money", async () => {
    live();
    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    const text = await res.text();
    const view = JSON.parse(text) as Record<string, unknown>;
    expect(view.company).toBe("AL Logistics");
    expect(view.reference).toBe("TCF0541");
    expect(view.goods).toEqual([{ name: "King Mattress", qty: 1 }]);
    expect(text).not.toMatch(/SO-?1362|"so"|1362/);
    expect(text).not.toMatch(/price|outstanding|RM /i);
  });
});

describe("the company's answers", () => {
  it("Save scheduled delivery: date required, time optional, the company is the actor", async () => {
    const { writes } = live();
    const res = await call(`${TOKEN}/arrangement`, { method: "PUT", body: JSON.stringify({ scheduledDate: "2026-10-27" }) });
    expect(res.status).toBe(200);
    const upsert = writes.find((w) => w.table === "ops_delivery_arrangements" && w.op === "upsert")?.rows as Record<string, unknown>;
    expect(upsert).toMatchObject({ confirmed_date: "2026-10-27", confirmed_time: null, updated_by: null, updated_via: "external_link", partner_id: AL });
    const event = writes.find((w) => w.table === "ops_delivery_arrangement_events")?.rows as Record<string, unknown>;
    expect(event).toMatchObject({ event: "arrangement_saved", source: "external_link", link_id: "link-1", recorded_by: null });
    const history = writes.find((w) => w.table === "order_history")?.rows as { text: string };
    expect(history.text).toMatch(/^AL Logistics via external link scheduled the delivery/);
  });

  it("refuses a Sunday and a past day before touching anything", async () => {
    const { writes } = live();
    expect((await call(`${TOKEN}/arrangement`, { method: "PUT", body: JSON.stringify({ scheduledDate: "2026-10-25" }) })).status).toBe(422);
    expect((await call(`${TOKEN}/arrangement`, { method: "PUT", body: JSON.stringify({ scheduledDate: "2026-10-01" }) })).status).toBe(422);
    expect(writes).toEqual([]);
  });

  it("Ask for another date carries the date and a governed reason", async () => {
    const { writes } = live();
    expect((await call(`${TOKEN}/another-date`, { method: "POST", body: JSON.stringify({ proposedDate: "2026-10-29" }) })).status).toBe(422);
    const res = await call(`${TOKEN}/another-date`, { method: "POST", body: JSON.stringify({ proposedDate: "2026-10-29", reason: "no_capacity" }) });
    expect(res.status).toBe(200);
    const event = writes.find((w) => w.table === "ops_delivery_arrangement_events")?.rows as Record<string, unknown>;
    expect(event).toMatchObject({ event: "another_date_requested", proposed_date: "2026-10-29", reason_key: "no_capacity", source: "external_link" });
  });

  it("Cannot deliver with `other` needs its words", async () => {
    live();
    expect((await call(`${TOKEN}/cannot-deliver`, { method: "POST", body: JSON.stringify({ reason: "other" }) })).status).toBe(422);
    const { writes } = live();
    const res = await call(`${TOKEN}/cannot-deliver`, { method: "POST", body: JSON.stringify({ reason: "wrong_area" }) });
    expect(res.status).toBe(200);
    const event = writes.find((w) => w.table === "ops_delivery_arrangement_events")?.rows as Record<string, unknown>;
    expect(event).toMatchObject({ event: "cannot_deliver", reason_key: "wrong_area", from_partner_id: AL, source: "external_link" });
  });

  it("opening the page is a POST from the rendered page, and stamps the link", async () => {
    const { writes } = live();
    const res = await call(`${TOKEN}/opened`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(writes.filter((w) => w.table === "ops_delivery_partner_links" && w.op === "update").length).toBe(2);
  });
});
