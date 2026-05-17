import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
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

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000006")
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

const PO_ID = "PO-2046";

describe("GET /api/supplier/pos", () => {
  it("lists supplier POs ordered by placed_at desc", async () => {
    const orderFn = vi.fn().mockResolvedValue({
      data: [
        { id: "PO-2050", sup_status: "pending", supplier_id: "e1" },
        { id: "PO-2049", sup_status: "in_production", supplier_id: "e1" },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("purchase_orders");
    expect(orderFn).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(((await res.json()) as unknown[]).length).toBe(2);
  });

  it("filters by bucket=po — keeps POs with producing threads + stockpile in/ack/prod", async () => {
    // Post-0114 bucket logic: thread-state-aware for linked POs, sup_status
    // fallback for stockpile (no threads). Same PO can land in both `po` and
    // `ready` columns when partial.
    const orderFn = vi.fn().mockResolvedValue({
      data: [
        // Partial-ready PO: 1 thread ready, 2 threads still producing → in `po`
        {
          id: "PO-A",
          sup_status: "in_production",
          supplier_id: "e1",
          threads: [
            { id: "t1", supplier_ready_at: "2026-05-16T00:00:00Z", pickup_event_id: null, orders: null },
            { id: "t2", supplier_ready_at: null, pickup_event_id: null, orders: null },
            { id: "t3", supplier_ready_at: null, pickup_event_id: null, orders: null },
          ],
        },
        // All-ready PO: 2 threads ready, 0 producing → NOT in `po`
        {
          id: "PO-B",
          sup_status: "in_production",
          supplier_id: "e1",
          threads: [
            { id: "t4", supplier_ready_at: "2026-05-16T00:00:00Z", pickup_event_id: null, orders: null },
            { id: "t5", supplier_ready_at: "2026-05-16T00:00:00Z", pickup_event_id: null, orders: null },
          ],
        },
        // Stockpile PO with sup_status=pending → in `po` via fallback
        { id: "PO-C", sup_status: "pending", supplier_id: "e1", threads: [] },
        // Stockpile PO with sup_status=delivered → NOT in `po`
        { id: "PO-D", sup_status: "delivered", supplier_id: "e1", threads: [] },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos?bucket=po", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = ((await res.json()) as Array<{ id: string }>).map((r) => r.id);
    expect(rows).toEqual(["PO-A", "PO-C"]);
  });

  it("filters by bucket=ready — keeps POs with any ready threads + stockpile fallback", async () => {
    const orderFn = vi.fn().mockResolvedValue({
      data: [
        // Partial-ready PO → in `po` AND `ready`
        {
          id: "PO-A",
          sup_status: "in_production",
          supplier_id: "e1",
          threads: [
            { id: "t1", supplier_ready_at: "2026-05-16T00:00:00Z", pickup_event_id: null, orders: null },
            { id: "t2", supplier_ready_at: null, pickup_event_id: null, orders: null },
          ],
        },
        // No ready threads, only producing → NOT in `ready`
        {
          id: "PO-X",
          sup_status: "in_production",
          supplier_id: "e1",
          threads: [
            { id: "tx", supplier_ready_at: null, pickup_event_id: null, orders: null },
          ],
        },
        // Stockpile PO with sup_status=ready_for_pickup → in `ready` via fallback
        { id: "PO-S", sup_status: "ready_for_pickup", supplier_id: "e1", threads: [] },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos?bucket=ready", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = ((await res.json()) as Array<{ id: string }>).map((r) => r.id);
    expect(rows).toEqual(["PO-A", "PO-S"]);
  });

  it("filters by bucket=delivered — keeps all-picked POs + sup_status=delivered fallback", async () => {
    const orderFn = vi.fn().mockResolvedValue({
      data: [
        // All threads picked → in `delivered`
        {
          id: "PO-A",
          sup_status: "shipped",
          supplier_id: "e1",
          threads: [
            { id: "t1", supplier_ready_at: "x", pickup_event_id: "p1", orders: null },
            { id: "t2", supplier_ready_at: "x", pickup_event_id: "p1", orders: null },
          ],
        },
        // Partial pickup → NOT in `delivered`
        {
          id: "PO-B",
          sup_status: "partially_shipped",
          supplier_id: "e1",
          threads: [
            { id: "t3", supplier_ready_at: "x", pickup_event_id: "p2", orders: null },
            { id: "t4", supplier_ready_at: null, pickup_event_id: null, orders: null },
          ],
        },
        // Stockpile delivered → in `delivered` via fallback
        { id: "PO-C", sup_status: "delivered", supplier_id: "e1", threads: [] },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos?bucket=delivered", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = ((await res.json()) as Array<{ id: string }>).map((r) => r.id);
    expect(rows).toEqual(["PO-A", "PO-C"]);
  });

  it("rejects invalid bucket with 422", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos?bucket=garbage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects operation with 403 (supplier-only guard)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // Task 6 (2026-05-15) — every PO row enriched with computed fields:
  //   customer_eta_min, urgency, behind_schedule, sku_summary.
  // Urgency value depends on today's date relative to customer ETA, so we
  // assert it's one of the valid enum values rather than a specific bucket.
  it("returns urgency + sku_summary + customer_eta_min + behind_schedule per PO row", async () => {
    // 2026-05-16 (migration 0116) — orders are now fetched via RPC, not
    // nested under threads. Mock both the main SELECT and the rpc call.
    const orderFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: "PO-9999",
          sup_status: "in_production",
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
        { id: "o1", dl: 1001, customer_name: "A", delivery_date: "2026-05-20" },
        { id: "o2", dl: 1002, customer_name: "B", delivery_date: "2026-05-28" },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      }),
      rpc: rpcFn,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos", {
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
    expect(rpcFn).toHaveBeenCalledWith("supplier_orders_for_threads", {
      p_order_ids: ["o1", "o2"],
    });
  });

  it("defaults enrichment fields safely when threads + lines absent", async () => {
    // Existing list-test mock returns rows with no threads/lines/eta_date —
    // the additive fields must default to safe values so prior assertions
    // continue to pass (sku_summary=[], customer_eta_min=null, urgency=null,
    // behind_schedule=false).
    const orderFn = vi.fn().mockResolvedValue({
      data: [{ id: "PO-9000", sup_status: "pending", supplier_id: "e1" }],
      error: null,
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos", {
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

describe("GET /api/supplier/pos/:id", () => {
  it("returns PO row when found (RLS-scoped)", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: PO_ID, sup_status: "pending" },
              error: null,
            }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toMatchObject({ id: PO_ID });
  });

  it("returns 404 when RLS hides the PO", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/PO-DOES-NOT-EXIST`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/supplier/pos/:id/acknowledge", () => {
  it("calls supplier_acknowledge RPC with po_id", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { po_id: PO_ID, sup_status: "acknowledged" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/acknowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_acknowledge", {
      p_po_id: PO_ID,
    });
  });

  it("forwards 422 wrong_sup_status from RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "PO not in pending state" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/acknowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("forwards 403 forbidden (cross-supplier) from RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "forbidden" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/acknowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/supplier/pos/:id/start-production", () => {
  it("calls supplier_start_production RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { po_id: PO_ID, sup_status: "in_production" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/start-production`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_start_production", {
      p_po_id: PO_ID,
    });
  });
});

describe("POST /api/supplier/pos/:id/ready-for-pickup", () => {
  it("calls existing operation_supplier_ready_confirm RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { po_id: PO_ID, sup_status: "ready_confirm_sent" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/ready-for-pickup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_supplier_ready_confirm", {
      p_po_id: PO_ID,
    });
  });
});

describe("POST /api/supplier/pos/:id/mark-delivered", () => {
  // Migration 0094 widens the RPC signature to require p_do_file_path; the
  // frontend captures the path from /api/storage/dos/sign-upload before
  // submitting. Every passing case below sends doFilePath, and the rejection
  // case asserts the schema 422s when it's missing.
  const SAMPLE_PATH = `${PO_ID}/abc-DO-9999.pdf`;

  it("calls supplier_mark_delivered with all 4 args (number + file_path + note)", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          po_id: PO_ID,
          sup_status: "delivered",
          do_number: "DO-9999",
          do_file_path: SAMPLE_PATH,
        },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          doNumber: "DO-9999",
          doFilePath: SAMPLE_PATH,
          doNote: "partial",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_mark_delivered", {
      p_po_id: PO_ID,
      p_do_number: "DO-9999",
      p_do_file_path: SAMPLE_PATH,
      p_do_note: "partial",
    });
  });

  it("nulls do_note when omitted", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: { po_id: PO_ID }, error: null }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ doNumber: "DO-9999", doFilePath: SAMPLE_PATH }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_mark_delivered", {
      p_po_id: PO_ID,
      p_do_number: "DO-9999",
      p_do_file_path: SAMPLE_PATH,
      p_do_note: null,
    });
  });

  it("rejects empty do_number with 422", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ doNumber: "  ", doFilePath: SAMPLE_PATH }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects missing doFilePath with 422 (migration 0094 closes phase-6-storage-do-upload)", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ doNumber: "DO-9999" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects empty doFilePath with 422", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ doNumber: "DO-9999", doFilePath: "   " }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

// Task 13 (2026-05-15) — pickup history for a single PO. Powers the Pickup
// history section in the supplier PODrawer + the Reprint DO button per row.
describe("GET /api/supplier/pos/:poId/pickup-events", () => {
  it("rejects operation with 403 (supplier-only guard)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/pickup-events`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns events newest-first with thread_count per row", async () => {
    // Two events on this PO. The first has 2 threads, the second has 1.
    const orderFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: "evt-1",
          do_number: "DO-9001",
          picked_up_at: "2026-05-15T11:00:00Z",
          ack_role: "partner",
        },
        {
          id: "evt-2",
          do_number: "DO-9000",
          picked_up_at: "2026-05-14T10:00:00Z",
          ack_role: "operation",
        },
      ],
      error: null,
    });
    const inFn = vi.fn().mockResolvedValue({
      data: [
        { pickup_event_id: "evt-1" },
        { pickup_event_id: "evt-1" },
        { pickup_event_id: "evt-2" },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "po_pickup_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ order: orderFn }),
            }),
          };
        }
        if (table === "order_supplier_threads") {
          return { select: vi.fn().mockReturnValue({ in: inFn }) };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/pickup-events`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(orderFn).toHaveBeenCalledWith("picked_up_at", { ascending: false });
    expect(inFn).toHaveBeenCalledWith("pickup_event_id", ["evt-1", "evt-2"]);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      {
        id: "evt-1",
        do_number: "DO-9001",
        picked_up_at: "2026-05-15T11:00:00Z",
        ack_role: "partner",
        thread_count: 2,
      },
      {
        id: "evt-2",
        do_number: "DO-9000",
        picked_up_at: "2026-05-14T10:00:00Z",
        ack_role: "operation",
        thread_count: 1,
      },
    ]);
  });

  it("returns empty array (no second query) when PO has no events", async () => {
    const orderFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const inFn = vi.fn();
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "po_pickup_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ order: orderFn }),
            }),
          };
        }
        if (table === "order_supplier_threads") {
          return { select: vi.fn().mockReturnValue({ in: inFn }) };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/pickup-events`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as unknown[]).length).toBe(0);
    // No event_ids → skip the second query entirely.
    expect(inFn).not.toHaveBeenCalled();
  });
});

// Task 10 (2026-05-15) — per-thread checklist source for the supplier
// PODrawer. Returns one row per `order_supplier_threads` linked to this PO,
// each row carrying its parent order's customer + delivery date + SKU lines.
describe("GET /api/supplier/pos/:poId/threads", () => {
  it("rejects operation with 403 (supplier-only guard)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/threads`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns threads with per-order sku_lines flattened", async () => {
    // Two threads on this PO — one with pending readiness, one already
    // marked ready. Each thread's parent order has its own line items
    // pulled in a separate query and re-joined by order_id.
    const eqFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: "t1",
          order_id: "o1",
          supplier_ready_at: null,
          pickup_event_id: null,
          orders: { dl: 1001, customer_name: "Tan", delivery_date: "2026-05-20" },
        },
        {
          id: "t2",
          order_id: "o2",
          supplier_ready_at: "2026-05-15T10:00:00Z",
          pickup_event_id: null,
          orders: { dl: 1002, customer_name: "Lim", delivery_date: "2026-05-28" },
        },
      ],
      error: null,
    });
    const inFn = vi.fn().mockResolvedValue({
      data: [
        { order_id: "o1", sku: "mattress:King", qty: 2 },
        { order_id: "o2", sku: "mattress:Queen", qty: 1 },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "order_supplier_threads") {
          return { select: vi.fn().mockReturnValue({ eq: eqFn }) };
        }
        if (table === "order_lines") {
          return { select: vi.fn().mockReturnValue({ in: inFn }) };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/threads`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(eqFn).toHaveBeenCalledWith("po_id", PO_ID);
    expect(inFn).toHaveBeenCalledWith("order_id", ["o1", "o2"]);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      {
        id: "t1",
        order_id: "o1",
        order_dl: 1001,
        customer_name: "Tan",
        customer_delivery_date: "2026-05-20",
        supplier_ready_at: null,
        pickup_event_id: null,
        sku_lines: [{ sku: "mattress:King", qty: 2 }],
      },
      {
        id: "t2",
        order_id: "o2",
        order_dl: 1002,
        customer_name: "Lim",
        customer_delivery_date: "2026-05-28",
        supplier_ready_at: "2026-05-15T10:00:00Z",
        pickup_event_id: null,
        sku_lines: [{ sku: "mattress:Queen", qty: 1 }],
      },
    ]);
  });

  it("returns empty array (no second query) when PO has no threads", async () => {
    const eqFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const inFn = vi.fn();
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "order_supplier_threads") {
          return { select: vi.fn().mockReturnValue({ eq: eqFn }) };
        }
        if (table === "order_lines") {
          return { select: vi.fn().mockReturnValue({ in: inFn }) };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/threads`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as unknown[]).length).toBe(0);
    // No order_ids → skip the second query entirely.
    expect(inFn).not.toHaveBeenCalled();
  });
});
