/**
 * THE LOGISTICS CARD'S DELIVERY DOORS (0581) — held as tests.
 *
 * One active link per delivery; a portal company (NETS) never gets one; a
 * link needs a company; Revoke with nothing active says so; only Operation or
 * the Principal reaches any of it.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { newLinkToken } from "./delivery-links";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const ORDER = "00000000-0000-0000-0000-0000000a0001";
const AL = "00000000-0000-0000-0000-0000000b0002";
const NETS = "00000000-0000-0000-0000-0000000b0001";

type Res = { data?: unknown; error?: unknown };
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

async function call(path: string, role: string, init?: RequestInit) {
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
  return app.fetch(
    new Request(`http://t/api/operation/delivery-arrangements/${ORDER}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${jwt}` },
    }),
    env as never,
  );
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(adminClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("Create link", () => {
  it("is a 43-character random token", () => {
    const a = newLinkToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newLinkToken()).not.toBe(a);
  });

  it("only Operation or the Principal may create one", async () => {
    mockSb({});
    expect([401, 403]).toContain((await call("/link", "finance", { method: "POST" })).status);
  });

  it("needs a company first", async () => {
    mockSb({ ops_delivery_arrangements: [{ data: { partner_id: null } }], orders: [{ data: { delivery_partner_id: null } }] });
    const res = await call("/link", "operation", { method: "POST" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("no_logistics");
  });

  it("a portal company answers in its portal, never through a link", async () => {
    mockSb({
      ops_delivery_arrangements: [{ data: { partner_id: NETS } }],
      delivery_partners: [{ data: { id: NETS, name: "NETS Logistics", kv_default: true } }],
      app_users: [{ data: [{ id: "u1" }] }],
    });
    const res = await call("/link", "operation", { method: "POST" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("NETS Logistics answers in its own portal.");
  });

  it("refuses a second active link", async () => {
    const { writes } = mockSb({
      ops_delivery_arrangements: [{ data: { partner_id: AL } }],
      delivery_partners: [{ data: { id: AL, name: "AL Logistics", kv_default: false } }],
      app_users: [{ data: [] }],
      ops_delivery_partner_links: [{ data: { id: "existing" } }],
    });
    const res = await call("/link", "operation", { method: "POST" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("link_active");
    expect(writes).toEqual([]);
  });

  it("creates one for a no-portal company", async () => {
    const { writes } = mockSb({
      ops_delivery_arrangements: [{ data: { partner_id: AL } }],
      delivery_partners: [{ data: { id: AL, name: "AL Logistics", kv_default: false } }],
      app_users: [{ data: [] }],
      ops_delivery_partner_links: [{ data: null }, { data: { id: "new", token: "t", created_at: "2026-10-19T02:00:00Z" } }],
    });
    const res = await call("/link", "operation", { method: "POST" });
    expect(res.status).toBe(201);
    const insert = writes.find((w) => w.op === "insert")?.rows as { partner_id: string; token: string; leg: number };
    expect(insert.partner_id).toBe(AL);
    expect(insert.leg).toBe(0);
    expect(insert.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("Revoke link", () => {
  it("says so when nothing is active", async () => {
    mockSb({ ops_delivery_partner_links: [{ data: [] }] });
    const res = await call("/link/revoke", "operation", { method: "POST" });
    expect(res.status).toBe(409);
  });

  it("revokes the active link with its reason", async () => {
    const { writes } = mockSb({ ops_delivery_partner_links: [{ data: [{ id: "l1" }] }] });
    const res = await call("/link/revoke", "principal", { method: "POST" });
    expect(res.status).toBe(200);
    expect(writes[0]).toMatchObject({ table: "ops_delivery_partner_links", op: "update" });
    expect((writes[0].rows as { revoke_reason: string }).revoke_reason).toBe("revoked");
  });
});

describe("the card's facts", () => {
  it("name the external-link actor as the company, never a person", async () => {
    mockSb({
      ops_delivery_arrangements: [{ data: { partner_id: AL } }],
      orders: [{ data: { delivery_partner_id: null } }, { data: { id: ORDER, so: 1362 } }],
      delivery_partners: [{ data: { id: AL, name: "AL Logistics", kv_default: false } }, { data: [{ id: AL, name: "AL Logistics" }] }],
      app_users: [{ data: [] }],
      ops_delivery_partner_links: [{ data: [{ id: "l1", token: "tok", partner_id: AL, created_at: "2026-10-19T02:00:00Z", created_by: null, revoked_at: null, first_opened_at: "2026-10-19T03:00:00Z", last_opened_at: "2026-10-19T03:00:00Z" }] }],
      ops_delivery_arrangement_events: [{ data: [{ event: "another_date_requested", source: "external_link", recorded_at: "2026-10-20T02:00:00Z", recorded_by: null, from_partner_id: AL, to_partner_id: null, reason_key: "no_capacity", proposed_date: "2026-10-29", note: null }] }],
      ops_delivery_contacts: [{ data: [] }],
    });
    const res = await call("/logistics-card", "operation");
    expect(res.status).toBe(200);
    const facts = (await res.json()) as {
      partner: { hasPortal: boolean };
      link: { token: string } | null;
      detailsReceivedAt: string | null;
      answer: { kind: string; proposedDate: string } | null;
      history: Array<{ who: string; detail: string }>;
    };
    expect(facts.partner.hasPortal).toBe(false);
    expect(facts.link?.token).toBe("tok");
    expect(facts.detailsReceivedAt).toBe("2026-10-19T03:00:00Z");
    expect(facts.answer).toMatchObject({ kind: "another_date", proposedDate: "2026-10-29" });
    expect(facts.history[0].who).toBe("AL Logistics via external link");
    expect(facts.history[0].detail).toBe("2026-10-29 · We are full on that date");
  });
  it("a portal company has the details from its assignment, even with no event recorded", async () => {
    mockSb({
      ops_delivery_arrangements: [{ data: null }],
      orders: [{ data: { delivery_partner_id: NETS, ops_assigned_logistic: null } }, { data: { id: ORDER, so: 1362 } }],
      delivery_partners: [{ data: { id: NETS, name: "NETS Logistics", kv_default: true } }],
      app_users: [{ data: [{ id: "u1" }] }],
      ops_delivery_partner_links: [{ data: [] }],
      ops_delivery_arrangement_events: [{ data: [] }],
      ops_delivery_contacts: [{ data: [] }],
    });
    const res = await call("/logistics-card", "operation");
    const facts = (await res.json()) as { partner: { hasPortal: boolean }; detailsReceivedAt: string | null };
    expect(facts.partner.hasPortal).toBe(true);
    expect(facts.detailsReceivedAt).not.toBeNull();
  });
});

