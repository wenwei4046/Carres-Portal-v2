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
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "neq", "order", "limit", "in"]) chain[m] = vi.fn((...a: unknown[]) => { calls.push([m, ...a]); return chain; });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: ROWS, error: null });
  const rpc = vi.fn(async () => ({ data: [{ id: SUBMITTER, name: "Aini" }, { id: PRINCIPAL, name: "Mr Lim" }], error: null }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ from: vi.fn(() => chain), rpc } as any);
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
    expect(calls).toContainEqual(["neq", "status", "draft"]);
  });

  it("is not open to a role outside Operation and Principal", async () => {
    mockDb();
    expect((await get("finance")).status).toBe(403);
  });
});
