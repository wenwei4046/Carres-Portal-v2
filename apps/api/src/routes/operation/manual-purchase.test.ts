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

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));
vi.mock("../../lib/duties", () => ({
  myDuties: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../lib/purchasing-settings", () => ({
  // The frozen ETA arithmetic is the SHARED function; the loader is mocked to
  // a minimal settings shape whose arithmetic degrades to `today` — this test
  // is about the PAYLOAD (purpose + demand link), not the calendar.
  loadPurchasingSettings: vi.fn().mockResolvedValue({
    orderByBufferDays: 7,
    earliestSellDays: 21,
    logisticsCallWorkingDays: 1,
    poDays: [1, 3, 5],
    suppliers: [],
    productionDays: [],
    lastChanges: [],
  }),
}));

import { userClient } from "../../lib/supabase";

/**
 * MANUAL PURCHASE — POST /issue (card §6, slice 3).
 *
 * The card's own test lines, at the API boundary:
 *   · "Issued POs carry their reason; the reason survives a round trip" —
 *     the governed payload names the request's purpose per document and the
 *     demand per line.
 *   · "Approved requests are issuable the same day; no PO-day gate" — the
 *     route never reads PO days (the mocked loader would throw if the route
 *     tried to batch by them; the payload goes straight to the authority).
 *   · "`Issue as one PO?` is declinable" — together:false yields one
 *     document per request even for one supplier.
 */

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@carres.com`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
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

const REQ_A = "aaaaaaaa-0000-0000-0000-00000000000a";
const REQ_B = "aaaaaaaa-0000-0000-0000-00000000000b";
const SUP = "bbbbbbbb-0000-0000-0000-000000000001";
const DEST = "cccccccc-0000-0000-0000-000000000001";

const REQUESTS = [
  {
    id: REQ_A, req_no: "REQ-0001", purpose: "display", destination_id: DEST,
    approval_required: true, approved_at: "2026-08-19T03:00:00Z", refused_at: null,
  },
  {
    id: REQ_B, req_no: "REQ-0002", purpose: "display", destination_id: DEST,
    approval_required: false, approved_at: null, refused_at: null,
  },
];

const LINES = [
  { id: "dddddddd-0000-0000-0000-000000000001", request_id: REQ_A, sku: "5539-2NA",
    supplier_id: SUP, qty: 3, approved_qty: 2, issued_qty: 0, cancelled_at: null },
  { id: "dddddddd-0000-0000-0000-000000000002", request_id: REQ_B, sku: "5539-CNR",
    supplier_id: SUP, qty: 1, approved_qty: null, issued_qty: 0, cancelled_at: null },
];

/** A chainable query stub: every builder method returns itself; awaiting it
 *  resolves to the canned result for its table. */
function tableStub(result: unknown, opts?: { filterInBy?: string }) {
  const q: Record<string, unknown> = {};
  let rows = result;
  const chain = () => q;
  for (const m of ["select", "eq", "order", "limit", "not", "gt", "is", "maybeSingle"]) {
    q[m] = vi.fn(chain);
  }
  // `.in()` honours the id filter when asked to — the route compares the
  // returned count against what it asked for.
  q.in = vi.fn((col: string, vals: string[]) => {
    if (opts?.filterInBy && col === opts.filterInBy && Array.isArray(rows)) {
      rows = (rows as Array<Record<string, unknown>>).filter((r) =>
        vals.includes(r[opts.filterInBy!] as string),
      );
    }
    return q;
  });
  (q as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: rows, error: null });
  return q;
}

function makeSb(rpc: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn((table: string) => {
      switch (table) {
        case "purchase_requests":
          return tableStub(REQUESTS, { filterInBy: "id" });
        case "purchase_demands":
          return tableStub(LINES, { filterInBy: "request_id" });
        case "product_skus":
          return tableStub([
            { sku: "5539-2NA", supplier_id: SUP, cost: 850, product_models: { category: "sofa" } },
            { sku: "5539-CNR", supplier_id: SUP, cost: 400, product_models: { category: "sofa" } },
          ]);
        case "suppliers":
          return tableStub([{ id: SUP, kind: "own_logistics" }]);
        case "warehouses":
          return tableStub([{ id: "eeeeeeee-0000-0000-0000-000000000001", name: "Carres Klang", kind: "own" }]);
        default:
          return tableStub([]);
      }
    }),
    rpc,
  } as unknown as ReturnType<typeof userClient>;
}

async function issue(body: unknown, rpc: ReturnType<typeof vi.fn>) {
  vi.mocked(userClient).mockReturnValue(makeSb(rpc));
  const jwt = await makeJwt("operation");
  return app.fetch(
    new Request("https://api.test/api/operation/purchasing/requests/issue", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env as never,
    { waitUntil() {}, passThroughException() {} } as never,
  );
}

describe("POST /purchasing/requests/issue — the reason rides to the authority", () => {
  it("together: one document per supplier×category wall, carrying purpose and demand links", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue({ requestIds: [REQ_A, REQ_B], together: true }, rpc);
    expect(res.status).toBe(200);

    expect(rpc).toHaveBeenCalledWith("purchasing_issue_pos_batch", expect.anything());
    const pos = rpc.mock.calls[0][1].p_pos as Array<Record<string, unknown>>;
    expect(pos).toHaveLength(1);
    // The REASON survives the round trip (card §6).
    expect(pos[0].purpose).toBe("display");
    // No so_refs — this document was not born from a customer order.
    expect(pos[0].so_refs).toBeNull();
    const lines = pos[0].lines as Array<Record<string, unknown>>;
    // The approver's cut (2 of 3), never the original ask; each line names
    // its demand.
    expect(lines).toEqual([
      expect.objectContaining({ sku: "5539-2NA", qty: 2, demand_id: LINES[0].id }),
      expect.objectContaining({ sku: "5539-CNR", qty: 1, demand_id: LINES[1].id }),
    ]);
  });

  it("declined: one document per request — the offer is an offer, not a gate", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001", "PO-9002"] }, error: null });
    const res = await issue({ requestIds: [REQ_A, REQ_B], together: false }, rpc);
    expect(res.status).toBe(200);
    const pos = rpc.mock.calls[0][1].p_pos as Array<Record<string, unknown>>;
    expect(pos).toHaveLength(2);
  });

  it("an undecided approval-required request is refused before anything is built", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue(
      makeSb(rpc),
    );
    // REQ_A undecided this time.
    REQUESTS[0].approved_at = null;
    try {
      const res = await issue({ requestIds: [REQ_A], together: false }, rpc);
      expect(res.status).toBe(409);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      REQUESTS[0].approved_at = "2026-08-19T03:00:00Z";
    }
  });
});
