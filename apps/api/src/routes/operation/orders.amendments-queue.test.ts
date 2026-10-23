// Weisiang's decision (Mr Lim, WhatsApp 2026-10-22; Jess was not part of this
// decision): every Sales Order amendment waits in an approve/reject queue, the
// Houzs way. This is the one check for the queue read.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "u" };
const SUBMITTER = "11111111-1111-1111-1111-000000000001";
const PRINCIPAL = "11111111-1111-1111-1111-000000000002";

const ROWS = [
  { id: "a-applied", order_id: "o1", status: "applied", reason: "Colour", submitted_by: SUBMITTER, submitted_at: "2026-10-22T03:00:00Z",
    decided_by: PRINCIPAL, decided_at: "2026-10-22T04:00:00Z", decision_note: "ok", customer_agreement_kind: "signed_document",
    orders: { so: 1201, customer_name: "Tan" } },
  { id: "a-waiting", order_id: "o2", status: "submitted", reason: "Add pillow", submitted_by: SUBMITTER, submitted_at: "2026-10-21T03:00:00Z",
    decided_by: null, decided_at: null, decision_note: null, customer_agreement_kind: null, orders: { so: 1188, customer_name: "Lee" } },
];

function mockDb() {
  const calls: Array<[string, ...unknown[]]> = [];
  // One chain per query; it answers with the rows whose status the query asked for.
  const from = vi.fn(() => {
    let statuses: string[] | null = null;
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "in"]) chain[m] = vi.fn((...a: unknown[]) => {
      calls.push([m, ...a]);
      if (m === "in" && a[0] === "status") statuses = a[1] as string[];
      return chain;
    });
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: statuses ? ROWS.filter((r) => statuses!.includes(r.status)) : [], error: null });
    return chain;
  });
  const rpc = vi.fn(async () => ({ data: [{ id: SUBMITTER, name: "Aini" }, { id: PRINCIPAL, name: "Mr Lim" }], error: null }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ from, rpc } as any);
  return calls;
}

async function get(role = "principal") {
  const jwt = await signTestJwt(PRINCIPAL, { email: `${role}@carres.com`, app_metadata: { role } });
  return app.fetch(new Request("http://t/api/operation/orders/amendments", { headers: { Authorization: `Bearer ${jwt}` } }), env);
}

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/orders/amendments — the approver's queue", () => {
  it("lists every amendment, waiting first, never a draft, with people named", async () => {
    const calls = mockDb();
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { amendments: Array<Record<string, unknown>> };
    expect(body.amendments.map((a) => [a.id, a.status])).toEqual([["a-waiting", "waiting"], ["a-applied", "applied"]]);
    expect(body.amendments[0]).toMatchObject({ so: 1188, customerName: "Lee", submittedBy: "Aini", agreementRecorded: false });
    expect(body.amendments[1]).toMatchObject({ decidedBy: "Mr Lim", agreementRecorded: true });
    const statusReads = calls.filter((c) => c[0] === "in" && c[1] === "status").map((c) => c[2] as string[]);
    expect(statusReads.flat()).not.toContain("draft");
    // The waiting read has no cap, so an old waiting amendment is never cut off.
    expect(calls.filter((c) => c[0] === "limit")).toEqual([["limit", 1000]]);
  });

  it("is not open to a role outside Operation and Principal", async () => {
    mockDb();
    expect((await get("finance")).status).toBe(403);
  });
});
