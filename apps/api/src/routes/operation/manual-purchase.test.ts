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
  dutyHolders: vi.fn().mockResolvedValue({}),
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

function makeSb(rpc: ReturnType<typeof vi.fn>, mayIssue = true) {
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
    rpc: vi.fn((fn: string, args: unknown) => {
      if (fn === "purchasing_actor_may_issue") {
        return Promise.resolve({ data: mayIssue, error: null });
      }
      return rpc(fn, args);
    }),
  } as unknown as ReturnType<typeof userClient>;
}

/** ⭐ THE PRICES THE OPERATOR REVIEWED (0380). Every issue declares them now;
 *  there is no "let the server read Catalog" path left. */
const REVIEWED = { "5539-2NA": 850, "5539-CNR": 400 };

async function issue(
  body: unknown,
  rpc: ReturnType<typeof vi.fn>,
  options: { mayIssue?: boolean; role?: "operation" | "principal" } = {},
) {
  vi.mocked(userClient).mockReturnValue(makeSb(rpc, options.mayIssue ?? true));
  const jwt = await makeJwt(options.role ?? "operation");
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
  it("refuses an ordinary non-duty operation user before the creation RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue(
      { requestIds: [REQ_A], together: false, expectedCosts: REVIEWED },
      rpc,
      { mayIssue: false },
    );

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("not_po_duty");
    expect(rpc).not.toHaveBeenCalledWith("purchasing_issue_pos_batch", expect.anything());
  });

  it("accepts Jess through the same governed capability", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue(
      { requestIds: [REQ_A], together: false, expectedCosts: REVIEWED },
      rpc,
      { role: "principal", mayIssue: true },
    );

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_issue_pos_batch", expect.anything());
  });

  it("together: one document per supplier×category wall, carrying purpose and demand links", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue({ requestIds: [REQ_A, REQ_B], together: true, expectedCosts: REVIEWED }, rpc);
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
    const res = await issue({ requestIds: [REQ_A, REQ_B], together: false, expectedCosts: REVIEWED }, rpc);
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
      const res = await issue({ requestIds: [REQ_A], together: false, expectedCosts: REVIEWED }, rpc);
      expect(res.status).toBe(409);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      REQUESTS[0].approved_at = "2026-08-19T03:00:00Z";
    }
  });
});

/**
 * ⭐ THE SAME COMMERCIAL AND ACTOR LAW ON THE MANUAL LANE
 * (closure §1 · §2; 0379 · 0380).
 *
 * This lane called the creation authority with NO duty check at all, and it
 * re-read the Catalog price itself and sent it back as `cost_source: catalog` —
 * so the database compared its own live value against itself.
 */
describe("closure §2 · the manual lane declares the price it reviewed", () => {
  it("sends the reviewed cost beside the server's own read", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue(
      { requestIds: [REQ_A, REQ_B], together: true, expectedCosts: REVIEWED },
      rpc,
    );
    expect(res.status).toBe(200);
    const pos = rpc.mock.calls[0][1].p_pos as Array<Record<string, unknown>>;
    const lines = pos[0].lines as Array<Record<string, unknown>>;
    for (const l of lines) {
      /* The stored number is the server's; the declaration is what makes the
         comparison possible. Here they agree, which is the ordinary case. */
      expect(l.expected_catalog_cost).toBe(l.cost);
    }
  });

  it("refuses a SKU whose price was never reviewed", async () => {
    const rpc = vi.fn();
    const res = await issue(
      { requestIds: [REQ_A, REQ_B], together: true, expectedCosts: { "5539-2NA": 850 } },
      rpc,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; message?: string; action?: string };
    expect(body.code).toBe("expected_cost_required");
    expect(body.message).toBe("5539-CNR has no checked transaction cost.");
    expect(body.action?.length).toBeGreaterThan(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a price that moved between the review and Issue", async () => {
    const rpc = vi.fn();
    const res = await issue(
      {
        requestIds: [REQ_A, REQ_B],
        together: true,
        /* Catalog says 400 now; the operator looked at 380. */
        expectedCosts: { "5539-2NA": 850, "5539-CNR": 380 },
      },
      rpc,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string; action?: string };
    expect(body.code).toBe("supplier_price_changed");
    expect(body.action).toBe("Go back to buying and check the new price before you issue.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("turns the database's duty refusal into the approved two lines", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "only Current PO Duty…", details: "not_po_duty", code: "42501" },
    });
    const res = await issue(
      { requestIds: [REQ_A, REQ_B], together: true, expectedCosts: REVIEWED },
      rpc,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string; message?: string; action?: string };
    expect(body.code).toBe("not_po_duty");
    expect(body.message).toBe("You do not hold PO duty today.");
    expect(body.action?.length).toBeGreaterThan(0);
  });
});

/**
 * ⭐ CARD 03 — the register read carries the rail's facts, and the doors
 * speak the approved purpose vocabulary (owner ruling 2026-08-28).
 */
describe("Card 03 · GET /purchasing/requests — the CATALOG's category rides each line", () => {
  const REG_LINES = [
    { id: "dddddddd-0000-0000-0000-000000000001", request_id: REQ_A, sku: "5539-2NA",
      supplier_id: SUP, qty: 3, approved_qty: 2, issued_qty: 0, remaining_qty: 2,
      required_by: null, remark: null, po_id: null, cancelled_at: null, cancel_reason: null },
    // A SKU whose TEXT screams mattress but whose Catalog category is absent:
    // the line says `category: null` — never a SKU-text inference.
    { id: "dddddddd-0000-0000-0000-000000000009", request_id: REQ_B, sku: "MATTRESS-TEXT-9",
      supplier_id: SUP, qty: 1, approved_qty: null, issued_qty: 0, remaining_qty: 1,
      required_by: null, remark: null, po_id: null, cancelled_at: null, cancel_reason: null },
  ];

  function makeRegisterSb() {
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case "purchase_requests":
            return tableStub(REQUESTS);
          case "purchase_demands":
            return tableStub(REG_LINES, { filterInBy: "request_id" });
          case "product_skus":
            return tableStub([
              { sku: "5539-2NA", product_models: { category: "sofa" } },
              { sku: "MATTRESS-TEXT-9", product_models: null },
            ]);
          case "suppliers":
            return tableStub([{ id: SUP, name: "Hooka", kind: "own_logistics" }]);
          default:
            return tableStub([]);
        }
      }),
      rpc: vi.fn(),
    } as unknown as ReturnType<typeof userClient>;
  }

  it("stamps the Catalog category on each line — null when Catalog has none", async () => {
    vi.mocked(userClient).mockReturnValue(makeRegisterSb());
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lines: Array<{ sku: string; category: string | null }>;
    };
    const bySku = new Map(body.lines.map((l) => [l.sku, l.category]));
    expect(bySku.get("5539-2NA")).toBe("sofa");
    expect(bySku.get("MATTRESS-TEXT-9")).toBeNull();
  });
});

describe("Card 03 · the doors speak the approved purpose vocabulary", () => {
  async function createHeader(
    purpose: string,
    extra: Record<string, unknown> = {},
    rpc = vi.fn().mockResolvedValue({
      data: { id: REQ_A, req_no: "MPR-20260829-0009", approval_required: true },
      error: null,
    }),
  ) {
    vi.mocked(userClient).mockReturnValue(makeSb(rpc));
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, destinationId: DEST, ...extra }),
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
    return { res, rpc };
  }

  /** Card 04 — each exceptional purpose ships its own structured For fact. */
  const FOR_FACT: Record<string, Record<string, unknown>> = {
    ready_stock: {},
    showroom_display: {},
    service_case: { serviceCaseId: "cccccccc-0000-0000-0000-000000000001" },
    internal_staff_purchase: { staffUserId: "dddddddd-0000-0000-0000-000000000001" },
    subsidiary_purchase: { subsidiaryName: "Carres Living Sdn Bhd" },
    other_purchase: { why: "spare parts for the van" },
  };

  it("admits every approved purpose — six of them — and hands it to the governed door", async () => {
    for (const purpose of [
      "ready_stock",
      "showroom_display",
      "service_case",
      "internal_staff_purchase",
      "subsidiary_purchase",
      "other_purchase",
    ]) {
      const { res, rpc } = await createHeader(purpose, FOR_FACT[purpose]);
      expect(res.status).toBe(200);
      expect(rpc).toHaveBeenCalledWith(
        "purchasing_create_request",
        expect.objectContaining({ p_purpose: purpose }),
      );
    }
  });

  it("Card 04 · only Other Purchase requires `What is this for?`", async () => {
    // Routine purposes send with NO why at all…
    const ok = await createHeader("ready_stock", {});
    expect(ok.res.status).toBe(200);
    expect(ok.rpc).toHaveBeenCalledWith(
      "purchasing_create_request",
      expect.objectContaining({ p_purpose: "ready_stock", p_why: null }),
    );
    // …and Other Purchase without its answer is refused before the RPC.
    const bad = await createHeader("other_purchase", {});
    expect(bad.res.status).toBe(400);
    expect(bad.rpc).not.toHaveBeenCalled();
  });

  it("Card 04 · each exceptional purpose must name its structured For object", async () => {
    for (const purpose of [
      "service_case",
      "internal_staff_purchase",
      "subsidiary_purchase",
    ]) {
      const { res, rpc } = await createHeader(purpose, {});
      expect(res.status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("refuses a retired value before the RPC — history is readable, not creatable", async () => {
    for (const retired of ["display", "warranty", "office", "spare_parts"]) {
      const { res, rpc } = await createHeader(retired);
      expect(res.status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("refuses an invented value — Management folds under Internal Staff Purchase", async () => {
    const { res, rpc } = await createHeader("management_purchase");
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

/**
 * ⭐ THE PRICES THE OPERATOR IS ABOUT TO COMMIT TO (closure §2).
 *
 * `Issue as one PO` pulls in sibling requests whose lines are not on screen, so
 * the surface could not otherwise SHOW — or honestly declare — the price it was
 * buying at.
 */
describe("GET /purchasing/requests/issue-costs", () => {
  async function ask(query: string, rpc = vi.fn()) {
    vi.mocked(userClient).mockReturnValue(makeSb(rpc));
    const jwt = await makeJwt("operation");
    return app.fetch(
      new Request(
        `https://api.test/api/operation/purchasing/requests/issue-costs${query}`,
        { headers: { Authorization: `Bearer ${jwt}` } },
      ),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
  }

  it("401 without Authorization", async () => {
    const res = await app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests/issue-costs"),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
    expect(res.status).toBe(401);
  });

  it("asks for at least one request, in words", async () => {
    const res = await ask("");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string; action?: string };
    expect(body.code).toBe("invalid_param");
    expect(body.action?.length).toBeGreaterThan(0);
  });

  it("returns the catalog cost of every SKU still to buy", async () => {
    const res = await ask(`?requestIds=${REQ_A},${REQ_B}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { costs: { sku: string; unitCost: number | null }[] };
    expect(body.costs).toEqual([
      { sku: "5539-2NA", unitCost: 850 },
      { sku: "5539-CNR", unitCost: 400 },
    ]);
  });

  it("writes nothing — it is a read, which is why /issue compares again", async () => {
    const rpc = vi.fn();
    await ask(`?requestIds=${REQ_A}`, rpc);
    expect(rpc).not.toHaveBeenCalled();
  });
});

/**
 * ⭐ CARD 03 §3 — THE REGISTER NAMES THE REAL APPROVAL OWNER (2026-08-28).
 *
 * The rail says `Need approval`; the payload names who actually decides: the
 * resolved `ops_manager` duty holder(s), the governed legacy list as the
 * empty-seat fallback — and a robot or shared-password account never prints
 * while a named person also holds the gate.
 */
import { dutyHolders } from "../../lib/duties";

describe("Card 03 §3 · GET /purchasing/requests — the approval owner's name", () => {
  const U_JESS = "11111111-1111-1111-1111-00000000000a";
  const U_SHARED = "11111111-1111-1111-1111-00000000000b";

  function makeApproverSb() {
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case "purchase_requests":
            return tableStub(REQUESTS);
          case "purchase_demands":
            return tableStub([], { filterInBy: "request_id" });
          case "app_users":
            return tableStub([
              { id: U_JESS, name: "Jess", email: "jess@carres.com" },
              { id: U_SHARED, name: "Operation", email: "operation@carres.com" },
            ]);
          default:
            return tableStub([]);
        }
      }),
      rpc: vi.fn(),
    } as unknown as ReturnType<typeof userClient>;
  }

  async function readRegister() {
    vi.mocked(userClient).mockReturnValue(makeApproverSb());
    const jwt = await makeJwt("operation");
    return app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
  }

  it("names the resolved ops_manager duty holder — the shared login excluded beside a named person", async () => {
    vi.mocked(dutyHolders).mockResolvedValueOnce({
      [U_JESS]: ["ops_manager"],
      [U_SHARED]: ["ops_manager"],
    });
    const res = await readRegister();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approvers: Array<{ id: string; name: string | null }> };
    expect(body.approvers).toEqual([{ id: U_JESS, name: "Jess" }]);
  });

  it("falls back to the governed legacy list while the duty seat is empty", async () => {
    // dutyHolders resolves {} (the file-level mock): the legacy emails hold
    // the gate, and the shared login is still excluded beside a named one.
    const res = await readRegister();
    const body = (await res.json()) as { approvers: Array<{ id: string; name: string | null }> };
    expect(body.approvers).toEqual([{ id: U_JESS, name: "Jess" }]);
  });
});

/**
 * PURCHASING CARD 04 — the permanent Register's read: real PO lineage, the
 * Catalog's item words, and PO duty resolved by the one actor authority.
 */
describe("Card 04 · GET /purchasing/requests — lineage, item words, PO duty", () => {
  const ME = "11111111-1111-1111-1111-000000000999"; // makeJwt's subject
  const PO_1 = "eeeeeeee-0000-0000-0000-0000000000a1";
  const PO_2 = "eeeeeeee-0000-0000-0000-0000000000a2";
  const LINE_1 = "dddddddd-0000-0000-0000-000000000001";
  const REG_LINES = [
    { id: LINE_1, request_id: REQ_A, sku: "5539-2NA",
      supplier_id: SUP, destination_id: DEST, qty: 3, approved_qty: 2, issued_qty: 2,
      remaining_qty: 0, required_by: null, remark: null, po_id: PO_1,
      cancelled_at: null, cancel_reason: null },
  ];

  function makeSbCard04() {
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case "purchase_requests":
            return tableStub(REQUESTS);
          case "purchase_demands":
            return tableStub(REG_LINES, { filterInBy: "request_id" });
          case "product_skus":
            return tableStub([
              { sku: "5539-2NA", variant: "Queen", variant_kind: "size",
                product_models: { category: "sofa", name: "Sonic" } },
            ]);
          case "purchase_order_lines":
            // The 0361 lineage: this demand was issued onto TWO documents;
            // the demand's own po_id remembers only the last.
            return tableStub([
              { po_id: PO_1, sku: "5539-2NA", qty: 1, received_qty: 0, demand_id: LINE_1 },
              { po_id: PO_2, sku: "5539-2NA", qty: 1, received_qty: 0, demand_id: LINE_1 },
            ]);
          case "purchase_orders":
            return tableStub([
              { id: PO_1, po_no: "PO-20260829-1111" },
              { id: PO_2, po_no: "PO-20260829-2222" },
            ]);
          case "suppliers":
            return tableStub([{ id: SUP, name: "Hooka", kind: "own_logistics" }]);
          case "app_users":
            return tableStub([
              { id: ME, name: "Shasha", email: "shasha@carres.com" },
            ]);
          default:
            return tableStub([]);
        }
      }),
      rpc: vi.fn().mockResolvedValue({
        data: { normal_user_id: ME, acting_user_id: null, actor_user_id: ME },
        error: null,
      }),
    } as unknown as ReturnType<typeof userClient>;
  }

  it("PO No comes ONLY from real lineage — both documents, actual numbers, no UUID", async () => {
    vi.mocked(userClient).mockReturnValue(makeSbCard04());
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lines: Array<{ sku: string; po_ids: string[]; item_label: string }>;
      pos: Array<{ id: string; po_no: string }>;
      currentPoDuty: { userId: string; name: string } | null;
      mayIssue: boolean;
      poDutyUnavailable: boolean;
    };
    const line = body.lines.find((l) => l.sku === "5539-2NA")!;
    expect(new Set(line.po_ids)).toEqual(new Set([PO_1, PO_2]));
    expect(new Set(body.pos.map((p) => p.po_no))).toEqual(
      new Set(["PO-20260829-1111", "PO-20260829-2222"]),
    );
    // The Catalog's human words ride the line (`railItemLabel`: Sonic Q).
    expect(line.item_label).toBe("Sonic Q");
    // PO duty resolved by the one actor authority; this login IS the actor.
    expect(body.poDutyUnavailable).toBe(false);
    expect(body.currentPoDuty).toEqual({ userId: ME, name: "Shasha" });
    expect(body.mayIssue).toBe(true);
  });
});

/**
 * ⭐ THE RENDER GATE AND THE SQL GATE ARE ONE GATE (2026-08-29).
 *
 * `purchasing_decide_request`'s SQL gate (`purchasing_settings_gate`) passes
 * the `principal` role or a real `ops_manager` POSITION duty — no legacy
 * email pass. `canApprove` used to answer through `isOpsManager`, whose
 * legacy fallback admits the shared operation@ login — so the shared login
 * was offered Approve/Refuse the door then refused with a raw `forbidden`
 * (measured on production, MPR-20260829-2779). Both defects are pinned here.
 */
import { myDuties } from "../../lib/duties";

describe("the decision gate — render asks what the door asks", () => {
  const U_JESS = "11111111-1111-1111-1111-00000000000a";
  const U_SHARED = "11111111-1111-1111-1111-00000000000b";

  function makeGateSb(rpc: ReturnType<typeof vi.fn>) {
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case "purchase_requests":
            return tableStub(REQUESTS);
          case "purchase_demands":
            return tableStub([], { filterInBy: "request_id" });
          case "app_users":
            return tableStub([
              { id: U_JESS, name: "Jess", email: "jess@carres.com" },
              { id: U_SHARED, name: "Operation", email: "operation@carres.com" },
            ]);
          default:
            return tableStub([]);
        }
      }),
      rpc,
    } as unknown as ReturnType<typeof userClient>;
  }

  async function readRegister(role: string) {
    vi.mocked(userClient).mockReturnValue(makeGateSb(vi.fn()));
    const jwt = await makeJwt(role);
    return app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
  }

  it("the shared operation@ login is NOT offered the decision — the door would refuse it", async () => {
    // makeJwt("operation") is operation@carres.com: the legacy list's first
    // entry. Without the ops_manager position duty, canApprove must say no.
    const res = await readRegister("operation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { canApprove: boolean };
    expect(body.canApprove).toBe(false);
  });

  it("a real ops_manager duty holder IS offered the decision", async () => {
    vi.mocked(myDuties).mockResolvedValueOnce(["ops_manager"]);
    const res = await readRegister("operation");
    const body = (await res.json()) as { canApprove: boolean };
    expect(body.canApprove).toBe(true);
  });

  it("the principal role passes, as it does at the SQL gate", async () => {
    const res = await readRegister("principal");
    const body = (await res.json()) as { canApprove: boolean };
    expect(body.canApprove).toBe(true);
  });

  it("the door's 42501 leaves as the approved two lines, naming the real approver", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "forbidden" },
    });
    vi.mocked(userClient).mockReturnValue(makeGateSb(rpc));
    vi.mocked(dutyHolders).mockResolvedValueOnce({ [U_JESS]: ["ops_manager"] });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(
        `https://api.test/api/operation/purchasing/requests/${REQ_A}/decide`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approve" }),
        },
      ),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      code: string;
      message: string;
      action: string;
    };
    expect(body.code).toBe("not_purchase_approver");
    // Never the raw word: the fact, then the act, naming who decides.
    expect(body.message).toBe("Only the approver may decide this purchase.");
    expect(body.action).toBe("Ask Jess to approve or refuse it.");
  });

  it("any other door refusal still maps through the ordinary pg contract", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "request is already decided", details: "already_decided" },
    });
    vi.mocked(userClient).mockReturnValue(makeGateSb(rpc));
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(
        `https://api.test/api/operation/purchasing/requests/${REQ_A}/decide`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approve" }),
        },
      ),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("request is already decided");
  });
});
