import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import { purchasingRefusal } from "@carres/shared";
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
describe("closure §2 · Catalog is the manual lane's normal price authority", () => {
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

  it("does not require a browser price declaration", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue(
      { requestIds: [REQ_A, REQ_B], together: true, expectedCosts: { "5539-2NA": 850 } },
      rpc,
    );
    expect(res.status).toBe(200);
    const pos = rpc.mock.calls[0][1].p_pos as Array<Record<string, unknown>>;
    expect((pos[0].lines as Array<Record<string, unknown>>)[1].cost).toBe(400);
  });

  it("ignores a stale browser price and uses Catalog", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue(
      {
        requestIds: [REQ_A, REQ_B],
        together: true,
        /* Catalog says 400 now; the operator looked at 380. */
        expectedCosts: { "5539-2NA": 850, "5539-CNR": 380 },
      },
      rpc,
    );
    expect(res.status).toBe(200);
    const pos = rpc.mock.calls[0][1].p_pos as Array<Record<string, unknown>>;
    expect((pos[0].lines as Array<Record<string, unknown>>)[1].cost).toBe(400);
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
        /* Card 06 — a new request always carries its Delivery Date. */
        body: JSON.stringify({
          purpose,
          destinationId: DEST,
          requiredBy: "2026-09-15",
          ...extra,
        }),
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

  it("Card 06 · a new request without its Delivery Date is refused before the RPC", async () => {
    const { res, rpc } = await createHeader("ready_stock", { requiredBy: undefined });
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
  /* ⭐ The PO's id IS its number (`purchase_orders.id` is the `PO-…` text;
     no `po_no` column exists on the live schema — Card 05's authority read). */
  const PO_1 = "PO-20260829-1111";
  const PO_2 = "PO-20260829-2222";
  const LINE_1 = "dddddddd-0000-0000-0000-000000000001";
  const REG_LINES = [
    { id: LINE_1, request_id: REQ_A, sku: "5539-2NA",
      supplier_id: SUP, destination_id: DEST, qty: 3, approved_qty: 2, issued_qty: 2,
      remaining_qty: 0, required_by: null, remark: null, po_id: PO_1,
      cancelled_at: null, cancel_reason: null },
  ];

  function makeSbCard04(options: { actorUserId?: string; mayIssue?: boolean } = {}) {
    const actorUserId = options.actorUserId ?? ME;
    const mayIssue = options.mayIssue ?? true;
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
            return tableStub([{ id: PO_1 }, { id: PO_2 }]);
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
      rpc: vi.fn((fn: string) => {
        if (fn === "purchasing_actor_may_issue") {
          return Promise.resolve({ data: mayIssue, error: null });
        }
        return Promise.resolve({
          data: { normal_user_id: actorUserId, acting_user_id: null, actor_user_id: actorUserId },
          error: null,
        });
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

  it("offers Issue PO to the governed Operations Superuser while another person holds PO duty", async () => {
    vi.mocked(userClient).mockReturnValue(
      makeSbCard04({
        actorUserId: "11111111-1111-1111-1111-000000000888",
        mayIssue: true,
      }),
    );
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );

    expect(res.status).toBe(200);
    expect(((await res.json()) as { mayIssue: boolean }).mayIssue).toBe(true);
  });

  it("does not offer Issue PO to an ordinary non-duty user", async () => {
    vi.mocked(userClient).mockReturnValue(
      makeSbCard04({
        actorUserId: "11111111-1111-1111-1111-000000000888",
        mayIssue: false,
      }),
    );
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );

    expect(res.status).toBe(200);
    expect(((await res.json()) as { mayIssue: boolean }).mayIssue).toBe(false);
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

  /** Card 05 §5 — every 0360 refusal leaves in the approved two lines. */
  async function decideWith(error: Record<string, unknown>) {
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    vi.mocked(userClient).mockReturnValue(makeGateSb(rpc));
    const jwt = await makeJwt("operation");
    return app.fetch(
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
  }

  it("a second decision is refused atomically — in the governed words", async () => {
    const res = await decideWith({
      code: "22023",
      message: "request is already decided",
      details: "already_decided",
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; message: string; action: string };
    expect(body.code).toBe("already_decided");
    expect(body.message).toBe("This purchase was already decided.");
    expect(body.action).toBe("Reload the Manual Purchase to see the decision.");
  });

  it("a refusal without its reason leaves as the governed two lines", async () => {
    const res = await decideWith({
      code: "22023",
      message: "a refusal needs a reason",
      details: "reason_required",
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string; action: string };
    expect(body.code).toBe("reason_required");
    expect(body.message).toBe("The decision reason is missing.");
    expect(body.action).toBe("Type why this purchase is not going ahead.");
  });

  it("an out-of-range cut leaves as the governed two lines", async () => {
    const res = await decideWith({
      code: "22023",
      message: "cut for 5539-2NA must be between 0 and 3",
      details: "invalid_cut_qty",
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("invalid_cut_qty");
    expect(body.message).toBe("The approved quantity is not valid.");
  });

  it("an unmapped door error is the honest decision fallback — never raw SQL text", async () => {
    const res = await decideWith({ code: "XX000", message: "deadlock detected" });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; message: string; action: string };
    expect(body.code).toBe("decision_not_recorded");
    expect(body.message).toBe("The decision was not recorded.");
    expect(JSON.stringify(body)).not.toContain("deadlock");
  });

  it("42501 with NO resolvable approver names the configuration hole", async () => {
    // Nobody holds the duty AND no legacy manager email exists among the
    // users: the refusal must say no approver is SET, never invent a name.
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "forbidden" },
    });
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn((table: string) =>
        table === "app_users"
          ? tableStub([{ id: U_JESS, name: "Siti", email: "siti@carres.com" }])
          : tableStub([]),
      ),
      rpc,
    } as unknown as ReturnType<typeof userClient>);
    vi.mocked(dutyHolders).mockResolvedValueOnce({});
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
    const body = (await res.json()) as { code: string; message: string; action: string };
    expect(body.code).toBe("no_purchase_approver");
    expect(body.message).toBe("No purchase approver is set.");
    expect(body.action).toBe("Ask management to set the purchase approver.");
  });
});

/**
 * CARD 05 · GET /detail/:id — the Object Detail's facts: exact PO lineage
 * with its date words, stored-fact History, and the individual-only
 * `Requested By`. No migration: every fact below is a column that already
 * exists.
 */
describe("Card 05 · GET /purchasing/requests/detail/:id", () => {
  const U_SHARED = "11111111-1111-1111-1111-00000000000b";
  const U_JESS = "11111111-1111-1111-1111-00000000000a";
  const PO_D = "PO-20260829-3333";
  const LINE_D = "dddddddd-0000-0000-0000-0000000000d1";
  const REQ_D = {
    id: REQ_A,
    req_no: "MPR-20260829-2779",
    purpose: "ready_stock",
    destination_id: DEST,
    required_by: "2026-09-12",
    why: null,
    approval_required: true,
    approved_at: "2026-08-29T02:42:00Z",
    approved_by: U_JESS,
    refused_at: null,
    refused_by: null,
    refuse_reason: null,
    for_service_case_id: null,
    for_staff_user_id: null,
    for_subsidiary_name: null,
    // The shared login raised it — an individual CANNOT be recovered.
    created_by: U_SHARED,
    created_at: "2026-08-29T01:00:00Z",
  };

  function makeDetailSb() {
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case "purchase_requests":
            return tableStub(REQ_D);
          case "purchase_demands":
            return tableStub([
              { id: LINE_D, sku: "5539-2NA", supplier_id: SUP, destination_id: DEST,
                qty: 2, approved_qty: 1, issued_qty: 1, remaining_qty: 0,
                required_by: null, remark: null, po_id: PO_D,
                cancelled_at: null, cancel_reason: null },
            ]);
          case "product_skus":
            return tableStub([
              { sku: "5539-2NA", variant: null, variant_kind: null, cost: 850,
                product_models: { category: "sofa", name: "Ohana 2 Seater" } },
            ]);
          case "purchase_order_lines":
            return tableStub([
              { po_id: PO_D, sku: "5539-2NA", qty: 1, received_qty: 0, demand_id: LINE_D },
            ]);
          case "purchase_orders":
            return tableStub([
              { id: PO_D, placed_at: "2026-08-29T03:05:00Z", eta_date: "2026-09-08" },
            ]);
          case "po_supplier_promises":
            // The supplier moved the date: the ledger holds the date we HELD.
            return tableStub([
              { po_id: PO_D, previous_date: "2026-09-01", new_date: "2026-09-08",
                recorded_at: "2026-09-02T02:00:00Z" },
            ]);
          case "purchasing_destinations":
            return tableStub([{ id: DEST, name: "Carres Klang" }]);
          case "suppliers":
            return tableStub([{ id: SUP, name: "Ohana", kind: "own_logistics" }]);
          case "app_users":
            return tableStub([
              { id: U_JESS, name: "Jess", email: "jess@carres.com", role: "principal" },
              { id: U_SHARED, name: "Operation", email: "operation@carres.com", role: "operation" },
            ]);
          default:
            return tableStub([]);
        }
      }),
      rpc: vi.fn(),
    } as unknown as ReturnType<typeof userClient>;
  }

  async function readDetail(role = "operation") {
    vi.mocked(userClient).mockReturnValue(makeDetailSb());
    const jwt = await makeJwt(role);
    return app.fetch(
      new Request(
        `https://api.test/api/operation/purchasing/requests/detail/${REQ_A}`,
        { headers: { Authorization: `Bearer ${jwt}` } },
      ),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
  }

  it("PO facts come from the exact linked document — issue time, original date, changed date", async () => {
    const res = await readDetail();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pos: Array<{
        id: string; po_no: string; placed_at: string | null;
        po_delivery_date: string | null; supplier_delivery_date: string | null;
        ordered_qty: number;
      }>;
    };
    expect(body.pos).toEqual([
      {
        id: PO_D,
        po_no: PO_D, // the PO's id IS its number — no po_no column exists
        placed_at: "2026-08-29T03:05:00Z",
        // The ORIGINAL supplier-facing date is the one the ledger says we
        // held before the supplier moved it; the moved date is the change.
        po_delivery_date: "2026-09-01",
        supplier_delivery_date: "2026-09-08",
        ordered_qty: 1,
      },
    ]);
  });

  it("History holds only stored facts — created, approved, exact PO issue", async () => {
    const res = await readDetail();
    const body = (await res.json()) as {
      history: Array<Record<string, unknown>>;
      requested_by_name: string | null;
    };
    const kinds = body.history.map((h) => h.kind);
    expect(kinds).toEqual(["created", "approved", "po_issued"]);
    const created = body.history[0];
    // The shared login is a permission, not a person — no actor is invented.
    expect(created.actor).toBeNull();
    expect(body.requested_by_name).toBeNull();
    const approved = body.history[1];
    expect(approved.actor).toBe("Jess");
    expect(approved.actor_role).toBe("principal");
    expect(approved.requested_units).toBe(2);
    expect(approved.approved_units).toBe(1);
    const issued = body.history[2];
    expect(issued.po_no).toBe(PO_D);
    expect(issued.units).toBe(1);
    expect(issued.occurred_at).toBe("2026-08-29T03:05:00Z");
  });

  it("money is absent for a non-approver — the key does not exist", async () => {
    const res = await readDetail("operation");
    const body = (await res.json()) as {
      canApprove: boolean;
      lines: Array<Record<string, unknown>>;
    };
    expect(body.canApprove).toBe(false);
    expect("unit_cost" in body.lines[0]).toBe(false);
  });

  it("the approver's money rides the line; lineage and item words ride every line", async () => {
    vi.mocked(myDuties).mockResolvedValueOnce(["ops_manager"]);
    const res = await readDetail("operation");
    const body = (await res.json()) as {
      canApprove: boolean;
      lines: Array<{ unit_cost?: number | null; item_label?: string; po_ids?: string[]; destination_id?: string }>;
    };
    expect(body.canApprove).toBe(true);
    expect(body.lines[0].unit_cost).toBe(850);
    expect(body.lines[0].item_label).toBe("Ohana 2 Seater");
    expect(body.lines[0].po_ids).toEqual([PO_D]);
    expect(body.lines[0].destination_id).toBe(DEST);
  });
});

/**
 * PURCHASING CARD 06 — the server date projection, the create form's plan
 * read, and the Delivery-Date document partition. The arithmetic itself is
 * the shared planners' (tested in packages/shared); these tests pin the
 * WIRING: the route calls the one arithmetic, stamps every line, and never
 * invents a date.
 */
import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import { expectedArrivalOf, orderByFromDeliveryDate } from "@carres/shared";

const CARD06_SETTINGS = {
  orderByBufferDays: 7,
  earliestSellDays: 21,
  logisticsCallWorkingDays: 1,
  poDays: [1, 3, 5],
  suppliers: [
    { id: SUP, name: "Hooka", categories: ["sofa"], offDays: [0], transitDays: 1 },
  ],
  productionDays: [{ supplierId: SUP, category: "sofa", workingDays: 5 }],
  destinations: [],
  lastChanges: [],
} as Awaited<ReturnType<typeof loadPurchasingSettings>>;

describe("Card 06 · GET /purchasing/requests — the server date projection", () => {
  const LINE_1 = "dddddddd-0000-0000-0000-0000000000c1";
  const DATED_REQUESTS = [
    {
      id: REQ_A, req_no: "MPR-20260830-0001", purpose: "ready_stock",
      destination_id: DEST, required_by: "2026-10-16",
      approval_required: true, approved_at: "2026-08-30T03:00:00Z", refused_at: null,
      created_at: "2026-08-30T01:00:00Z",
    },
  ];
  function makeDatedSb(sends: Array<Record<string, unknown>> = []) {
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case "purchase_requests":
            return tableStub(DATED_REQUESTS);
          case "purchase_demands":
            return tableStub(
              [
                // The line's own required_by is null — the header's Delivery
                // Date is its fallback (Card 06 §3.2).
                { id: LINE_1, request_id: REQ_A, sku: "5539-2NA", supplier_id: SUP,
                  destination_id: DEST, qty: 2, approved_qty: 2, issued_qty: 1,
                  remaining_qty: 1, required_by: null, remark: null, po_id: "PO-20260830-0001",
                  cancelled_at: null, cancel_reason: null },
              ],
              { filterInBy: "request_id" },
            );
          case "product_skus":
            return tableStub([
              { sku: "5539-2NA", variant: null, variant_kind: null,
                product_models: { category: "sofa", name: "Sonic" } },
            ]);
          case "purchase_order_lines":
            return tableStub([
              { po_id: "PO-20260830-0001", sku: "5539-2NA", qty: 1, received_qty: 0,
                demand_id: LINE_1 },
            ]);
          case "purchase_orders":
            return tableStub([{ id: "PO-20260830-0001", version: 2 }]);
          case "po_sends":
            return tableStub(sends);
          case "suppliers":
            return tableStub([{ id: SUP, name: "Hooka", kind: "own_logistics" }]);
          default:
            return tableStub([]);
        }
      }),
      rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
    } as unknown as ReturnType<typeof userClient>;
  }

  async function readRegister() {
    const jwt = await makeJwt("operation");
    return app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
  }

  it("stamps delivery_date (header fallback) and order_by via the ONE inverse planner", async () => {
    vi.mocked(loadPurchasingSettings).mockResolvedValueOnce(CARD06_SETTINGS);
    vi.mocked(userClient).mockReturnValue(makeDatedSb());
    const res = await readRegister();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lines: Array<{
        delivery_date: string | null; order_by: string | null;
        production_days_missing: boolean; transit_days_missing: boolean;
      }>;
      todayIso: string;
      planUnavailable: boolean;
    };
    expect(body.planUnavailable).toBe(false);
    expect(body.todayIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.lines[0].delivery_date).toBe("2026-10-16");
    // The wiring calls the same shared arithmetic — agreement, not a copy.
    expect(body.lines[0].order_by).toBe(
      orderByFromDeliveryDate(CARD06_SETTINGS, {
        supplierId: SUP,
        category: "sofa",
        deliveryDateIso: "2026-10-16",
      }),
    );
    expect(body.lines[0].order_by).not.toBeNull();
    expect(body.lines[0].production_days_missing).toBe(false);
    expect(body.lines[0].transit_days_missing).toBe(false);
  });

  it("missing Settings produce NO guessed date — the exact gap is named instead", async () => {
    vi.mocked(loadPurchasingSettings).mockResolvedValueOnce({
      ...CARD06_SETTINGS,
      suppliers: [
        { id: SUP, name: "Hooka", categories: ["sofa"], offDays: [0], transitDays: null },
      ],
      productionDays: [],
    } as Awaited<ReturnType<typeof loadPurchasingSettings>>);
    vi.mocked(userClient).mockReturnValue(makeDatedSb());
    const body = (await (await readRegister()).json()) as {
      lines: Array<{
        order_by: string | null;
        production_days_missing: boolean; transit_days_missing: boolean;
      }>;
    };
    expect(body.lines[0].order_by).toBeNull();
    expect(body.lines[0].production_days_missing).toBe(true);
    expect(body.lines[0].transit_days_missing).toBe(true);
  });

  it("a numbered PO is not `sent` — only the CURRENT version's confirmed-sent evidence", async () => {
    vi.mocked(loadPurchasingSettings).mockResolvedValueOnce(CARD06_SETTINGS);
    // Version 1 was confirmed sent, but the document is at Version 2 now:
    // the older evidence completes nothing.
    vi.mocked(userClient).mockReturnValue(
      makeDatedSb([{ po_id: "PO-20260830-0001", po_version: 1, kind: "confirmed_sent" }]),
    );
    let body = (await (await readRegister()).json()) as {
      pos: Array<{ id: string; sent: boolean }>;
    };
    expect(body.pos[0].sent).toBe(false);

    vi.mocked(loadPurchasingSettings).mockResolvedValueOnce(CARD06_SETTINGS);
    vi.mocked(userClient).mockReturnValue(
      makeDatedSb([{ po_id: "PO-20260830-0001", po_version: 2, kind: "confirmed_sent" }]),
    );
    body = (await (await readRegister()).json()) as {
      pos: Array<{ id: string; sent: boolean }>;
    };
    expect(body.pos[0].sent).toBe(true);
  });
});

describe("Card 06 · POST /purchasing/requests/plan — the create form's date plan", () => {
  async function plan(skus: string[]) {
    const jwt = await makeJwt("operation");
    return app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests/plan", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ skus }),
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
  }

  function makePlanSb() {
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case "product_skus":
            return tableStub([
              { sku: "5539-2NA", supplier_id: SUP, product_models: { category: "sofa" } },
              { sku: "NO-CATALOG", supplier_id: null, product_models: null },
            ]);
          case "suppliers":
            return tableStub([{ id: SUP, name: "Hooka" }]);
          default:
            return tableStub([]);
        }
      }),
      rpc: vi.fn(),
    } as unknown as ReturnType<typeof userClient>;
  }

  it("no SKUs still answers the Proceed Date preview — the server's own date", async () => {
    vi.mocked(userClient).mockReturnValue(makePlanSb());
    const res = await plan([]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { proceedDate: string; deliveryDateDefault: null };
    expect(body.proceedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.deliveryDateDefault).toBeNull();
  });

  it("complete Settings propose the arrival from the ONE forward planner", async () => {
    vi.mocked(loadPurchasingSettings).mockResolvedValueOnce(CARD06_SETTINGS);
    vi.mocked(userClient).mockReturnValue(makePlanSb());
    const res = await plan(["5539-2NA"]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      proceedDate: string;
      lines: Array<{
        sku: string; supplierName: string | null; category: string | null;
        productionDays: number | null; transitDays: number | null; arrival: string | null;
      }>;
      deliveryDateDefault: string | null;
    };
    expect(body.lines[0]).toMatchObject({
      sku: "5539-2NA",
      supplierName: "Hooka",
      category: "sofa",
      productionDays: 5,
      transitDays: 1,
    });
    // Agreement with the shared arithmetic from the same Proceed Date.
    expect(body.lines[0].arrival).toBe(
      expectedArrivalOf(CARD06_SETTINGS, {
        supplierId: SUP,
        category: "sofa",
        fromIso: body.proceedDate,
      }),
    );
    expect(body.deliveryDateDefault).toBe(body.lines[0].arrival);
  });

  it("an incomplete line proposes NOTHING — no default, nulls named, never a guess", async () => {
    vi.mocked(loadPurchasingSettings).mockResolvedValueOnce(CARD06_SETTINGS);
    vi.mocked(userClient).mockReturnValue(makePlanSb());
    const res = await plan(["5539-2NA", "NO-CATALOG"]);
    const body = (await res.json()) as {
      lines: Array<{ sku: string; arrival: string | null }>;
      deliveryDateDefault: string | null;
    };
    expect(body.lines.find((l) => l.sku === "NO-CATALOG")?.arrival).toBeNull();
    // One incomplete line means the form cannot be defaulted truthfully.
    expect(body.deliveryDateDefault).toBeNull();
  });
});

describe("Card 06 · POST /issue — Delivery Date joins the document partition", () => {
  const DATED_REQS = [
    {
      id: REQ_A, req_no: "MPR-1", purpose: "ready_stock", destination_id: DEST,
      required_by: "2026-10-10",
      approval_required: true, approved_at: "2026-08-30T03:00:00Z", refused_at: null,
    },
    {
      id: REQ_B, req_no: "MPR-2", purpose: "ready_stock", destination_id: DEST,
      required_by: "2026-10-20",
      approval_required: false, approved_at: null, refused_at: null,
    },
  ];
  const DATED_LINES = [
    { id: "dddddddd-0000-0000-0000-0000000000a1", request_id: REQ_A, sku: "5539-2NA",
      supplier_id: SUP, destination_id: DEST, qty: 1, approved_qty: null, issued_qty: 0,
      required_by: null, cancelled_at: null },
    { id: "dddddddd-0000-0000-0000-0000000000a2", request_id: REQ_B, sku: "5539-CNR",
      supplier_id: SUP, destination_id: DEST, qty: 1, approved_qty: null, issued_qty: 0,
      required_by: null, cancelled_at: null },
  ];
  function makeDatedIssueSb(rpc: ReturnType<typeof vi.fn>) {
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case "purchase_requests":
            return tableStub(DATED_REQS, { filterInBy: "id" });
          case "purchase_demands":
            return tableStub(DATED_LINES, { filterInBy: "request_id" });
          case "product_skus":
            return tableStub([
              { sku: "5539-2NA", supplier_id: SUP, cost: 850, product_models: { category: "sofa" } },
              { sku: "5539-CNR", supplier_id: SUP, cost: 400, product_models: { category: "sofa" } },
            ]);
          case "suppliers":
            return tableStub([{ id: SUP, kind: "own_logistics" }]);
          case "warehouses":
            return tableStub([
              { id: "eeeeeeee-0000-0000-0000-000000000001", name: "Carres Klang", kind: "own" },
            ]);
          default:
            return tableStub([]);
        }
      }),
      rpc: vi.fn((fn: string, args: unknown) => {
        if (fn === "purchasing_actor_may_issue") {
          return Promise.resolve({ data: true, error: null });
        }
        return rpc(fn, args);
      }),
    } as unknown as ReturnType<typeof userClient>;
  }

  it("two Delivery Dates create two POs, each saving its approved date as eta_date", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-1", "PO-2"] }, error: null });
    vi.mocked(userClient).mockReturnValue(makeDatedIssueSb(rpc));
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests/issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requestIds: [REQ_A, REQ_B],
          together: true,
          expectedCosts: REVIEWED,
        }),
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
    expect(res.status).toBe(200);
    const pos = rpc.mock.calls[0][1].p_pos as Array<Record<string, unknown>>;
    // Same supplier × category × destination × purpose — but two approved
    // Delivery Dates are two supplier commitments (Card 06 §7).
    expect(pos).toHaveLength(2);
    expect(new Set(pos.map((p) => p.eta_date))).toEqual(
      new Set(["2026-10-10", "2026-10-20"]),
    );
    expect((await res.json() as { documents: number }).documents).toBe(2);
  });
});

/**
 * EVERY REFUSAL ON THIS DOOR ARRIVES WITH WORDS (YH, 2026-09-01).
 *
 * Four throw sites on `POST /issue` were bare `c.json({ error, code })` while
 * their neighbours ten lines away already used `refuse()`. A bare body carries
 * no `message` and no `action`, so the browser fell through to the honest
 * fallback — "The Portal refused this purchase order. Tell IT the message on
 * screen." — for the TWO COMMONEST outcomes of this door. Nothing was broken
 * and nothing was said.
 *
 * These tests assert the CONTRACT, not the spelling: every refusal carries a
 * message and an action, and neither is the fallback. `purchasing-refusals.ts`
 * owns the words and its own suite pins their shape, so a ruled reword changes
 * one file and passes here untouched.
 */
describe("POST /purchasing/requests/issue — a refusal says what is wrong and what to do", () => {
  const FALLBACK = purchasingRefusal("__not_a_code__");

  type Over = {
    requests?: unknown[];
    lines?: unknown[];
    skus?: unknown[];
    suppliers?: unknown[];
    collections?: unknown[];
  };

  function sbWith(over: Over, rpc: ReturnType<typeof vi.fn>) {
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case "purchase_requests":
            return tableStub(over.requests ?? REQUESTS, { filterInBy: "id" });
          case "purchase_demands":
            return tableStub(over.lines ?? LINES, { filterInBy: "request_id" });
          case "product_skus":
            return tableStub(
              over.skus ?? [
                { sku: "5539-2NA", supplier_id: SUP, cost: 850, product_models: { category: "sofa" } },
                { sku: "5539-CNR", supplier_id: SUP, cost: 400, product_models: { category: "sofa" } },
              ],
            );
          case "suppliers":
            return tableStub(over.suppliers ?? [{ id: SUP, kind: "own_logistics", name: "Ohana" }]);
          case "purchasing_supplier_settings":
            return tableStub(over.collections ?? []);
          case "warehouses":
            return tableStub([
              { id: "eeeeeeee-0000-0000-0000-000000000001", name: "Carres Klang", kind: "own" },
            ]);
          default:
            return tableStub([]);
        }
      }),
      rpc: vi.fn((fn: string, args: unknown) => {
        if (fn === "purchasing_actor_may_issue") return Promise.resolve({ data: true, error: null });
        return rpc(fn, args);
      }),
    } as unknown as ReturnType<typeof userClient>;
  }

  async function issueAgainst(over: Over, body: unknown) {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: [] }, error: null });
    vi.mocked(userClient).mockReturnValue(sbWith(over, rpc));
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests/issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
    return { res, rpc, body: (await res.json()) as Record<string, string> };
  }

  /** The whole contract in one place: a code, words, and NOT the fallback. */
  function expectSpoken(payload: Record<string, string>, code: string) {
    expect(payload.code, "the code still travels").toBe(code);
    expect(payload.message, `${code} has a fact`).toBeTruthy();
    expect(payload.action, `${code} has an act`).toBeTruthy();
    expect(payload.message, `${code} is not the fallback`).not.toBe(FALLBACK.wrong);
    expect(payload.action, `${code} is not the fallback`).not.toBe(FALLBACK.todo);
  }

  /* ⭐ THE DELIVER TO GATE (owner, 2026-09-03). A supplier Carres collects
     from has one place its goods land, held in Purchasing Settings. A request
     that names another Deliver To is refused BEFORE any PO exists, and the
     refusal names the supplier and the governed place — the sentence the
     owner met on MPR-20260903-3381. This pre-flight had no test until now. */
  it("refuses a collected supplier's request that names another Deliver To, before creating anything", async () => {
    const OHANA = "cccccccc-0000-0000-0000-000000000002";
    const { res, rpc, body } = await issueAgainst(
      {
        suppliers: [{ id: SUP, kind: "factory_pickup", name: "Ohana" }],
        collections: [
          {
            supplier_id: SUP,
            fixed_destination_id: OHANA,
            collected_by_partner_id: "ffffffff-0000-0000-0000-000000000001",
          },
        ],
      },
      { requestIds: [REQ_A], together: true, expectedCosts: REVIEWED },
    );
    expect(res.status).toBe(422);
    expectSpoken(body, "supplier_collection_destination_mismatch");
    expect(body.message).toContain("Ohana must be collected to");
    expect(body.supplier, "the supplier travels as a fact").toBe("Ohana");
    expect(rpc, "no PO was created").not.toHaveBeenCalled();
  });

  it("names a Manual Purchase that is no longer on the list", async () => {
    const { res, rpc, body } = await issueAgainst(
      { requests: [REQUESTS[0]] },
      { requestIds: [REQ_A, REQ_B], together: true, expectedCosts: REVIEWED },
    );
    expect(res.status).toBe(404);
    expectSpoken(body, "unknown_request");
    expect(rpc, "nothing was created").not.toHaveBeenCalled();
  });

  /* ⭐ ONE CODE CANNOT SAY TWO THINGS. `not_ready_to_order` used to cover BOTH
     "nobody has approved this yet" and "somebody refused this" — opposite
     facts with opposite next acts. The route separates them; these two tests
     are what stop them being folded back together. */
  it("separates a Manual Purchase nobody has approved yet", async () => {
    const { res, rpc, body } = await issueAgainst(
      {
        requests: [
          { ...REQUESTS[0], approved_at: null, refused_at: null, approval_required: true },
        ],
      },
      { requestIds: [REQ_A], together: true, expectedCosts: REVIEWED },
    );
    expect(res.status).toBe(409);
    expectSpoken(body, "not_ready_to_order");
    expect(body.requestId, "the row is named so the operator can find it").toBe(REQ_A);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("separates a Manual Purchase somebody refused", async () => {
    const { res, body } = await issueAgainst(
      { requests: [{ ...REQUESTS[0], refused_at: "2026-08-30T02:00:00Z" }] },
      { requestIds: [REQ_A], together: true, expectedCosts: REVIEWED },
    );
    expect(res.status).toBe(409);
    expectSpoken(body, "request_refused");
    /* The two are genuinely different sentences, not one word reused. */
    expect(body.message).not.toBe(purchasingRefusal("not_ready_to_order").wrong);
  });

  it("names an issue with nothing left to buy on it", async () => {
    const { res, body } = await issueAgainst(
      { lines: [{ ...LINES[0], approved_qty: 2, issued_qty: 2 }] },
      { requestIds: [REQ_A], together: true, expectedCosts: REVIEWED },
    );
    expect(res.status).toBe(409);
    expectSpoken(body, "nothing_to_issue");
  });

  it("names the SKU whose supplier the catalog does not hold", async () => {
    const { res, body } = await issueAgainst(
      {
        lines: [LINES[0]],
        skus: [{ sku: "5539-2NA", supplier_id: null, cost: 850, product_models: { category: "sofa" } }],
      },
      { requestIds: [REQ_A], together: true, expectedCosts: REVIEWED },
    );
    expect(res.status).toBe(422);
    expectSpoken(body, "unresolved_supplier");
    /* The sentence names the SKU rather than saying "an item". */
    expect(body.message).toContain("5539-2NA");
  });

  /* ⭐ THE DELIVER TO DOOR (0421). MPR-20260903-3381 was told "Set Deliver To
     to Ohana, then issue again" and had no way to. PUT /:id/deliver-to is
     that way: it runs the same collection pre-flight as /issue, then asks the
     RPC, and every refusal leaves with its two lines. */
  describe("PUT /purchasing/requests/:id/deliver-to", () => {
    const OHANA = "cccccccc-0000-0000-0000-000000000002";

    async function moveAgainst(over: Over, rpc: ReturnType<typeof vi.fn>, destinationId = OHANA) {
      vi.mocked(userClient).mockReturnValue(sbWith(over, rpc));
      const jwt = await makeJwt("operation");
      const res = await app.fetch(
        new Request(`https://api.test/api/operation/purchasing/requests/${REQ_A}/deliver-to`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({ destinationId }),
        }),
        env as never,
        { waitUntil() {}, passThroughException() {} } as never,
      );
      return { res, rpc, body: (await res.json()) as Record<string, unknown> };
    }

    it("asks the RPC to move the request, with the request and the place", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: { id: REQ_A, req_no: "REQ-0001", destination_id: OHANA, moved: true },
        error: null,
      });
      const { res, body } = await moveAgainst({}, rpc);
      expect(res.status).toBe(200);
      expect(rpc).toHaveBeenCalledWith("purchasing_move_request_destination", {
        p_id: REQ_A,
        p_destination_id: OHANA,
      });
      expect(body.ok).toBe(true);
      expect(body.moved).toBe(true);
    });

    it("a request already on a PO is refused in the governed words", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "request is already ordered", details: "request_ordered" },
      });
      const { res, body } = await moveAgainst({}, rpc);
      expect(res.status).toBe(422);
      expectSpoken(body as Record<string, string>, "request_ordered");
      expect(body.message).toBe("This request is already ordered. Deliver To cannot move.");
      expect(body.action).toBe("Revise the purchase order instead.");
    });

    it("a request with nothing going ahead is refused in the governed words", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "request is not going ahead", details: "request_closed" },
      });
      const { res, body } = await moveAgainst({}, rpc);
      expect(res.status).toBe(422);
      expectSpoken(body as Record<string, string>, "request_closed");
    });

    it("a collected supplier's request cannot move away from its governed place — refused before the RPC", async () => {
      const rpc = vi.fn();
      const KLANG = "cccccccc-0000-0000-0000-000000000009";
      const { res, body } = await moveAgainst(
        {
          suppliers: [{ id: SUP, kind: "factory_pickup", name: "Ohana" }],
          collections: [
            {
              supplier_id: SUP,
              fixed_destination_id: OHANA,
              collected_by_partner_id: "ffffffff-0000-0000-0000-000000000001",
            },
          ],
        },
        rpc,
        KLANG,
      );
      expect(res.status).toBe(422);
      expectSpoken(body as Record<string, string>, "supplier_collection_destination_mismatch");
      expect(body.message).toContain("Ohana must be collected to");
      expect(rpc).not.toHaveBeenCalled();
    });

    it("a move TO the governed place passes the pre-flight", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: { id: REQ_A, moved: true },
        error: null,
      });
      const { res } = await moveAgainst(
        {
          suppliers: [{ id: SUP, kind: "factory_pickup", name: "Ohana" }],
          collections: [
            {
              supplier_id: SUP,
              fixed_destination_id: OHANA,
              collected_by_partner_id: "ffffffff-0000-0000-0000-000000000001",
            },
          ],
        },
        rpc,
        OHANA,
      );
      expect(res.status).toBe(200);
      expect(rpc).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * A MANUAL PURCHASE ARRIVES WHOLE, OR NOT AT ALL (0410, YH 2026-09-01).
 *
 * The create form used to POST the header, read back its id, then POST one
 * line per line in a loop — six transactions for one act. A failure on line 3
 * left a committed header holding two of five lines, on no screen and behind
 * no door, and the Register listed it as a real request.
 *
 * These tests pin the ROUTE's half of the fix: lines that arrive with the
 * header go to the one transactional door, and — because `0410` is applied by
 * hand — a build that reaches production before the migration does must still
 * be able to create a Manual Purchase.
 */
describe("POST /purchasing/requests — the whole request, or none of it", () => {
  const HEADER = {
    purpose: "ready_stock",
    destinationId: DEST,
    requiredBy: "2026-09-15",
  };

  async function post(body: unknown, rpc: ReturnType<typeof vi.fn>) {
    vi.mocked(userClient).mockReturnValue(makeSb(rpc));
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("https://api.test/api/operation/purchasing/requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env as never,
      { waitUntil() {}, passThroughException() {} } as never,
    );
    return { res, rpc };
  }

  it("sends header and lines to the ONE transactional door", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { id: REQ_A, req_no: "MPR-1", approval_required: true }, error: null });
    const { res } = await post(
      { ...HEADER, lines: [{ sku: "5539-2NA", qty: 2 }, { sku: "5539-CNR", qty: 1 }] },
      rpc,
    );
    expect(res.status).toBe(200);
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("purchasing_create_request_with_lines");
    expect(args.p_lines).toEqual([
      { sku: "5539-2NA", qty: 2, required_by: null, remark: null },
      { sku: "5539-CNR", qty: 1, required_by: null, remark: null },
    ]);
    /* ONE call. The per-line loop is what this replaces. */
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses a request with no lines before it reaches the database", async () => {
    /* An empty Manual Purchase is the orphan `0410` exists to delete. The
       route refuses it on the schema, so no transaction is even opened; the
       function refuses it again in SQL, because a screen is not a rule. */
    const rpc = vi.fn();
    const { res } = await post({ ...HEADER, lines: [] }, rpc);
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a real refusal from the transactional door untouched", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "unknown sku NOPE", details: "unknown_sku" },
    });
    const { res } = await post({ ...HEADER, lines: [{ sku: "NOPE", qty: 1 }] }, rpc);
    expect(res.status).toBe(422);
    /* It must NOT be mistaken for a missing migration and silently retried on
       the old door — that is how a refusal would become a half-written row. */
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  /* ⛔ MERGED IS NOT APPLIED — AND DEGRADING IS NOT DROPPING.
     ⭐ RE-PINNED THE SAME DAY IT WAS WRITTEN (YH, 2026-09-01). The original
     assertion here was that a missing `0410` falls back to the header-only
     door and returns 200, on the reasoning that a create form which 404s for a
     day is worse than one that degrades. The reasoning was right and what it
     pinned was wrong: the header-only door cannot write lines, the browser is
     the only caller and always sends them, so that 200 meant an EMPTY request
     and a form that ticked every line as created. An approver could approve a
     purchase with no items and it would read `Ready to order` for ever.
     A 404 is found in one second. An empty approved purchase is found weeks
     later by somebody wondering why nothing arrived. The test now pins the
     refusal, and pins that NOTHING was written behind it. */
  for (const code of ["PGRST202", "42883"]) {
    it(`refuses in words when 0410 is not applied yet, and writes nothing (${code})`, async () => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "not found" } });
      const { res } = await post({ ...HEADER, lines: [{ sku: "5539-2NA", qty: 1 }] }, rpc);
      expect(res.status).toBe(503);
      const body = (await res.json()) as Record<string, string>;
      expect(body.code).toBe("migration_not_applied");
      /* It says what happened and who fixes it — never a bare code. */
      expect(body.message).toBeTruthy();
      expect(body.action).toContain("0410");
      /* ⛔ AND IT DOES NOT QUIETLY TRY THE HEADER-ONLY DOOR. One call, one
         refusal; a second call here would be the dropped-lines bug again. */
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0][0]).toBe("purchasing_create_request_with_lines");
    });
  }

  it("still accepts a header with no lines at all, for a caller that sends none", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { id: REQ_A, req_no: "MPR-1", approval_required: true }, error: null });
    const { res } = await post(HEADER, rpc);
    expect(res.status).toBe(200);
    expect(rpc.mock.calls[0][0]).toBe("purchasing_create_request");
  });
});
