import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, partnerId?: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role, partner_id: partnerId } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000001")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/partner/pickups", () => {
  it("returns LP's POs", async () => {
    /* The chain is `select → order`, with NO `.eq`. Migration 0090 let a
     * partner own a PO through either procurement_partner_id OR the
     * warehouse's owning_partner_id, so the route deliberately dropped the
     * narrow `.eq("procurement_partner_id", …)` and leans on the RLS policy
     * `partner_sees_own_po`, which admits both paths (pickups.ts:48-53). The
     * mock kept the old level, so `.order` was undefined and this route 500'd
     * inside the test — a stale fixture reporting a bug the route does not
     * have. */
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              { id: "po1", so: 1, sup_status: "pickup_assigned" },
              { id: "po2", so: 2, sup_status: "delivered" },
            ],
            error: null,
          }),
        }),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(2);
  });

  it("rejects non-partner with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // Regression 2026-05-11 (Loo a-to-z run): SELECT was missing the bare `status`
  // column (only `sup_status` was selected). PartnerFactoryPickupsPage.stageOf()
  // returns null when status !== 'open', so all rows fell out of the kanban
  // even though they sat in `rows` — header showed "1 job · 0 awaiting accept".
  it("SELECT includes both status and sup_status (regression for empty kanban)", async () => {
    const selectFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const sb = { from: vi.fn(() => ({ select: selectFn })) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    await app.fetch(
      new Request("http://t/api/partner/pickups", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );

    const sql = (selectFn.mock.calls[0]?.[0] ?? "") as string;
    // bare `status` (preceded by comma+space or whitespace, NOT `_`)
    expect(sql).toMatch(/(?<!_)status\s*,/);
    expect(sql).toMatch(/sup_status\s*,/);
  });

  // Task 6 (2026-05-15) — mirror supplier/pos enrichment on partner pickups.
  // Same 4 computed fields per PO row.
  it("returns urgency + sku_summary + customer_eta_min + behind_schedule per PO row", async () => {
    // 2026-05-16 (migration 0115) — orders now fetched via RPC, not nested.
    const orderFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: "PO-9999",
          so: 1001,
          sup_status: "pickup_assigned",
          status: "open",
          eta_date: "2026-05-22",
          lines: [{ sku: "mattress:carres-original:King", qty: 5 }],
          threads: [
            { id: "t1", order_id: "o1", supplier_ready_at: null, pickup_event_id: null },
            { id: "t2", order_id: "o2", supplier_ready_at: null, pickup_event_id: null },
          ],
        },
      ],
      error: null,
    });
    const rpcFn = vi.fn().mockResolvedValue({
      data: [
        { id: "o1", so: 1001, customer_name: "A", delivery_date: "2026-05-20" },
        { id: "o2", so: 1002, customer_name: "B", delivery_date: "2026-05-28" },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      })),
      rpc: rpcFn,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].customer_eta_min).toBe("2026-05-20");
    expect(rows[0].urgency).toMatch(/critical|urgent|normal/);
    expect(rows[0].behind_schedule).toBe(true);
    expect(rows[0].sku_summary).toEqual([
      { sku: "mattress:carres-original:King", qty: 5 },
    ]);
    expect(rpcFn).toHaveBeenCalledWith("partner_orders_for_threads", {
      p_order_ids: ["o1", "o2"],
    });
  });

  it("defaults enrichment fields safely when threads + lines absent", async () => {
    const orderFn = vi.fn().mockResolvedValue({
      data: [{ id: "PO-9000", so: 1, sup_status: "pickup_assigned", status: "open" }],
      error: null,
    });
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows[0].customer_eta_min).toBeNull();
    expect(rows[0].urgency).toBeNull();
    expect(rows[0].behind_schedule).toBe(false);
    expect(rows[0].sku_summary).toEqual([]);
  });
});

describe("GET /api/partner/pickups/rfd-pending", () => {
  it("calls operation_partner_rfd_pending RPC and returns rows", async () => {
    const rows = [
      {
        thread_id: "00000000-0000-0000-0000-0000000200a1",
        order_id: "00000000-0000-0000-0000-0000000300a1",
        po_id: "PO-001",
        customer_name: "Loo's Living Room",
        request_for_delivery_at: "2026-05-08T08:00:00Z",
        confirm_delivery_date: "2026-05-15",
      },
    ];
    const sb = { rpc: vi.fn().mockResolvedValue({ data: rows, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/rfd-pending", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_partner_rfd_pending");
    expect(await res.json()).toEqual(rows);
  });

  it("returns empty array when no RFD-pending threads", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/rfd-pending", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/rfd-pending", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects partner without partner_id with 403", async () => {
    const jwt = await makeJwt("partner"); // no partnerId
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/rfd-pending", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

const THREAD_ID = "00000000-0000-0000-0000-00000000beef";

describe("POST /api/partner/pickups/accept-rfd", () => {
  it("calls operation_partner_accept_rfd RPC with p_thread_id", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { thread_id: THREAD_ID, partner_accepted_at: "2026-05-15T00:00:00Z", operation_stage: "dispatched" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_partner_accept_rfd", {
      p_thread_id: THREAD_ID,
    });
  });

  it("maps SQLSTATE 22023 to 422", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "RFD not pending" } }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects non-uuid threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: "PO-001" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects missing threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("maps SQLSTATE 42501 (LP not assigned) to 403", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "partner not assigned to this thread" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb.rpc).toHaveBeenCalledWith("operation_partner_accept_rfd", {
      p_thread_id: THREAD_ID,
    });
  });
});

describe("POST /api/partner/pickups/reject-rfd", () => {
  it("calls operation_partner_reject_rfd RPC with p_thread_id + p_reason", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { thread_id: THREAD_ID, rfd_cleared: true, lp_kept_assigned: true },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, reason: "capacity full" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_partner_reject_rfd", {
      p_thread_id: THREAD_ID,
      p_reason: "capacity full",
    });
  });

  it("defaults p_reason to empty string when omitted", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { thread_id: THREAD_ID, rfd_cleared: true, lp_kept_assigned: true },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_partner_reject_rfd", {
      p_thread_id: THREAD_ID,
      p_reason: "",
    });
  });

  it("rejects non-uuid threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: "PO-001", reason: "x" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects missing threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "capacity full" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects reason exceeding 500 chars with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, reason: "x".repeat(501) }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects non-partner role with 403", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, reason: "x" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/partner/pickups/:id/receive — Loo 2026-05-11 collapse arrived+receive", () => {
  const VALID_BODY = {
    doNumber: "DO-9001",
    doFilePath: "delivery-orders/PO-9001/2026-05-11/DO-9001.pdf",
    lines: [
      { id: "00000000-0000-4000-8000-0000000000a1", receivedQty: 6 },
    ],
  };

  it("calls operation_receive_po_with_do RPC and returns the result", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { po_id: "PO-9001", po_status: "received", sup_status: "delivered" },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/PO-9001/receive", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_receive_po_with_do", {
      p_po_id: "PO-9001",
      p_do_file_path: VALID_BODY.doFilePath,
      p_do_number: VALID_BODY.doNumber,
      p_lines: [{ id: VALID_BODY.lines[0].id, received_qty: 6 }],
    });
  });

  it("422 on invalid body shape (missing doNumber)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/PO-9001/receive", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_BODY, doNumber: undefined }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("403 for non-partner role", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/PO-9001/receive", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("403 for partner without partner_id in JWT", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("partner"); // no partnerId
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/PO-9001/receive", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps RPC 42501 (cross-partner) to 403", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "forbidden: cross-partner receive", details: "forbidden" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/PO-9001/receive", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
