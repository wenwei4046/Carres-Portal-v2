/**
 * R2 (migration 0288) — the supplier-claim queue's read routes:
 *   GET /api/operation/supplier-claims
 *   GET /api/operation/supplier-claims/:id/photos
 *
 * What these tests pin down is mostly what the router does NOT do: it never
 * writes a claim (claims are minted by the receive RPC and the nightly sweep,
 * so a hand-filed claim would be a receiving problem with no receiving behind
 * it), it defaults to the OPEN queue, and it signs photo URLs only after the
 * row has already been read through the caller's own JWT.
 */
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
  adminClient: vi.fn(),
}));
import { adminClient, userClient } from "../../lib/supabase";

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
    .setSubject("11111111-1111-1111-1111-000000000001")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

const CLAIM = {
  id: "c1",
  claim_no: "SC-1001",
  po_id: "PO-1",
  po_line_id: "l1",
  supplier_id: "s1",
  sku: "MS01-K",
  product_category: "mattress",
  claim_type: "damaged",
  qty: 2,
  status: "open",
  do_number: "DO-9",
  photos: [{ path: "PO-1/a.jpg", at: "2026-07-27T00:00:00Z", by: "u1" }],
  note: null,
  reported_by: "u1",
  reported_at: "2026-07-27T00:00:00Z",
};

/** Chainable thenable — records the filters applied so the tests can assert
 *  which status the route asked for. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function listBuilder(rows: unknown[], eqCalls: Array<[string, unknown]>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => b),
    range: vi.fn((from: number, to: number) => Promise.resolve({
      data: rows.slice(from, to + 1),
      error: null,
    })),
    in: vi.fn(() => b),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return b;
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null, count: rows.length }).then(res, rej),
  };
  return b;
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
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/supplier-claims", () => {
  it("defaults to the OPEN queue — a worklist does not open on closed rows", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const sb = {
      from: vi.fn((t: string) => {
        if (t === "supplier_claims") return listBuilder([CLAIM], eqCalls);
        if (t === "suppliers")
          return listBuilder([{ id: "s1", name: "Ohana" }], eqCalls);
        if (t === "app_users")
          return listBuilder([{ id: "u1", name: "Shasha" }], eqCalls);
        // R4 — the two units this claim quarantined.
        if (t === "ops_stock_items")
          return listBuilder(
            [
              { hold_claim_id: "c1", hold_reason: "damaged" },
              { hold_claim_id: "c1", hold_reason: "damaged" },
            ],
            eqCalls,
          );
        throw new Error(`unmocked table ${t}`);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.claims).toHaveLength(1);
    expect(eqCalls).toContainEqual(["status", "open"]);
    // The claim snapshots the supplier ID; the queue resolves today's NAME.
    expect(body.claims[0].supplier_name).toBe("Ohana");
    expect(body.claims[0].reported_by_name).toBe("Shasha");
    expect(body.claims[0].photo_count).toBe(1);
    // R4 — the goods, read from the register rather than copied from qty.
    expect(body.claims[0].held_units).toBe(2);
    expect(body.claims[0].hold_reason).toBe("damaged");
    // NEVER the admin client for a read the caller's own RLS can do.
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("`all` asks for no status at all", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const sb = {
      from: vi.fn(() => listBuilder([], eqCalls)),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims?status=all", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // Only the two head-count queries filter on status; the list itself does not.
    expect(eqCalls.filter(([c]) => c === "status")).toHaveLength(2);
  });

  it("can limit the return and claim connection to one governed PO", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const sb = { from: vi.fn(() => listBuilder([], eqCalls)) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims?status=all&poId=PO-2030", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(["po_id", "PO-2030"]);
  });

  it("returns every claim connected to one PO beyond the worklist window", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const claims = Array.from({ length: 205 }, (_, index) => ({
      ...CLAIM,
      id: `claim-${index}`,
      claim_no: `SC-${String(index).padStart(4, "0")}`,
      po_id: "PO-2030",
      supplier_id: null,
      reported_by: null,
    }));
    const sb = {
      from: vi.fn((table: string) => listBuilder(
        table === "supplier_claims" ? claims : [],
        eqCalls,
      )),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims?status=all&poId=PO-2030", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claims: unknown[] };
    expect(body.claims).toHaveLength(205);
  });

  it("reports a held-unit connection error instead of calling it zero", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const held = listBuilder([], eqCalls);
    held.range = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "held-unit read failed", details: "" },
    });
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "supplier_claims") return listBuilder([CLAIM], eqCalls);
        if (table === "suppliers") return listBuilder([{ id: "s1", name: "Ohana" }], eqCalls);
        if (table === "app_users") return listBuilder([{ id: "u1", name: "Shasha" }], eqCalls);
        if (table === "ops_stock_items") return held;
        return listBuilder([], eqCalls);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  it("an unknown status word falls back to open rather than leaking everything", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const sb = { from: vi.fn(() => listBuilder([], eqCalls)) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/supplier-claims?status=%27%20or%201=1", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eqCalls.every(([, v]) => v === "open" || v === "closed")).toBe(true);
  });

  it("refuses a supplier, a partner and a dealer", async () => {
    for (const role of ["supplier", "partner", "dealer"]) {
      const jwt = await makeJwt(role);
      const res = await app.fetch(
        new Request("http://t/api/operation/supplier-claims", {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(403);
    }
    expect(userClient).not.toHaveBeenCalled();
  });

  it("computes who owes the next move, and reads the line only for LATE claims", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const tables: string[] = [];
    const LATE = {
      ...CLAIM,
      id: "c2",
      claim_no: "SC-1002",
      claim_type: "late_delivery",
      po_line_id: "l2",
      photos: [],
      requested_action: "deliver_remaining",
      requested_at: "2026-07-27T00:00:00Z",
    };
    const sb = {
      from: vi.fn((t: string) => {
        tables.push(t);
        if (t === "supplier_claims") return listBuilder([CLAIM, LATE], eqCalls);
        if (t === "suppliers")
          return listBuilder([{ id: "s1", name: "Ohana" }], eqCalls);
        if (t === "app_users")
          return listBuilder([{ id: "u1", name: "Shasha" }], eqCalls);
        // The line still owes 1 unit → the supplier still owes the move.
        if (t === "purchase_order_lines")
          return listBuilder([{ id: "l2", qty: 3, received_qty: 2 }], eqCalls);
        if (t === "ops_stock_items") return listBuilder([], eqCalls);
        throw new Error(`unmocked table ${t}`);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    const damaged = body.claims.find((c: { claim_no: string }) => c.claim_no === "SC-1001");
    const late = body.claims.find((c: { claim_no: string }) => c.claim_no === "SC-1002");
    expect(damaged.next_move).toEqual({
      key: "ask",
      owner: "carres",
      label: "Call Ohana — agree the fix",
    });
    expect(late.next_move.owner).toBe("supplier");
    expect(late.line_pending).toBe(true);
    // ONE line query, and only because a late claim was in the page. The
    // damaged claim's goods are already in the warehouse — nothing to check.
    expect(tables.filter((t) => t === "purchase_order_lines")).toHaveLength(1);
  });

  it("a late claim whose line is gone stays PENDING — unknown never reads as delivered", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const LATE = {
      ...CLAIM,
      claim_no: "SC-1002",
      claim_type: "late_delivery",
      po_line_id: "gone",
      photos: [],
      requested_action: "deliver_remaining",
      requested_at: "2026-07-27T00:00:00Z",
    };
    const sb = {
      from: vi.fn((t: string) => {
        if (t === "supplier_claims") return listBuilder([LATE], eqCalls);
        // po_line_id is ON DELETE SET NULL — the line can simply not be there.
        if (t === "purchase_order_lines") return listBuilder([], eqCalls);
        return listBuilder([{ id: "s1", name: "Ohana" }], eqCalls);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.claims[0].line_pending).toBeNull();
    expect(body.claims[0].next_move.owner).toBe("supplier");
  });

  it("admits principal", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const sb = { from: vi.fn(() => listBuilder([], eqCalls)) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/operation/supplier-claims/:id/photos", () => {
  it("reads the row with the caller's JWT, THEN signs with the service client", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const sb = { from: vi.fn(() => listBuilder([CLAIM], eqCalls)) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: "https://x/a.jpg" }, error: null });
    vi.mocked(adminClient).mockReturnValue({
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims/c1/photos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.photos[0].url).toBe("https://x/a.jpg");
    expect(userClient).toHaveBeenCalled();
    expect(createSignedUrl).toHaveBeenCalledWith("PO-1/a.jpg", 3600);
  });

  it("404s a claim the caller cannot see — no signing round-trip at all", async () => {
    const sb = { from: vi.fn(() => listBuilder([], [])) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims/nope/photos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("returns an empty list for a late-delivery claim (nothing to photograph)", async () => {
    const sb = {
      from: vi.fn(() =>
        listBuilder([{ ...CLAIM, claim_type: "late_delivery", photos: [] }], []),
      ),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims/c1/photos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ photos: [] });
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("there is no write door — POST is not a route", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: "PO-1", claim_type: "damaged", qty: 1 }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R3 (migration 0290) — the three moves
// ═══════════════════════════════════════════════════════════════════════════
//
// The RULES live in the database (which ask is legal for which claim type,
// which answers need a note, that a close needs both sides), so these tests pin
// what the ROUTER owes: the right RPC with the right arguments, obvious junk
// refused before a round-trip, the caller's own JWT used, and the RPC's own
// refusal surfaced with its `detail` code intact so the operator sees a
// sentence rather than a 500.

function rpcClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  return { rpc };
}

async function post(path: string, body: unknown, role = "operation") {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/operation/supplier-claims/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

describe("POST /:id/request — what WE ask", () => {
  it("calls the RPC with the claim and the ask", async () => {
    const sb = rpcClient({ data: { claim_no: "SC-1001", requested_action: "replace" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/request", { requested_action: "replace" });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_claim_record_request", {
      p_claim_id: "c1",
      p_requested_action: "replace",
      p_note: null,
    });
    // A user-JWT write: RLS + the RPC's own gate are the boundary, never a
    // service-role bypass.
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("refuses a word that is not one of the asks, without touching the database", async () => {
    const sb = rpcClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/request", { requested_action: "please_fix_it" });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC's refusal with its own code — the ask freezes once answered", async () => {
    const sb = rpcClient({
      error: {
        code: "P0001",
        details: "request_frozen",
        message: "claim SC-1001 already carries the supplier's answer",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/request", { requested_action: "repair" });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("request_frozen");
  });

  it("refuses a supplier and a dealer", async () => {
    for (const role of ["supplier", "dealer"]) {
      const res = await post("c1/request", { requested_action: "replace" }, role);
      expect(res.status).toBe(403);
    }
    expect(userClient).not.toHaveBeenCalled();
  });
});

describe("POST /:id/response — what the SUPPLIER answered", () => {
  it("passes the answer and its note through", async () => {
    const sb = rpcClient({ data: { claim_no: "SC-1001", supplier_response: "reject" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/response", {
      supplier_response: "reject",
      note: "Out of warranty",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_claim_record_response", {
      p_claim_id: "c1",
      p_response: "reject",
      p_note: "Out of warranty",
    });
  });

  it("does not narrow the supplier's answer to what we asked", async () => {
    const sb = rpcClient({ data: {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    for (const answer of [
      "replacement",
      "deliver_remaining",
      "repair",
      "return_and_replace",
      "other_agreement",
    ]) {
      const res = await post("c1/response", { supplier_response: answer, note: "ok" });
      expect(res.status).toBe(200);
    }
  });

  it("lets the DATABASE be the one that demands a note for a refusal", async () => {
    // The route does not second-guess it: one rule, one place. A missing note
    // comes back as the RPC's own detail code.
    const sb = rpcClient({
      error: {
        code: "P0001",
        details: "response_note_required",
        message: "a reject answer must say what was agreed or why",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/response", { supplier_response: "reject" });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("response_note_required");
  });

  it("refuses an invented answer word", async () => {
    const sb = rpcClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/response", { supplier_response: "maybe_later" });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /:id/close — settle it", () => {
  it("closes with an optional note", async () => {
    const sb = rpcClient({ data: { claim_no: "SC-1001", status: "closed" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/close", { note: "New unit delivered 30 Jul" });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_claim_close", {
      p_claim_id: "c1",
      p_note: "New unit delivered 30 Jul",
    });
  });

  it("surfaces the refusal when a side is missing — a closed claim keeps both", async () => {
    const sb = rpcClient({
      error: {
        code: "P0001",
        details: "response_required",
        message: "claim SC-1001 cannot close: the supplier's answer is not recorded",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/close", {});
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("response_required");
  });

  it("still offers no door that CREATES a claim", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: "PO-1", claim_type: "damaged", qty: 1 }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R4 (migration 0299) — what happened to the quarantined units
// ═══════════════════════════════════════════════════════════════════════════
//
// The invisibility itself is the DATABASE's job (a trigger refuses `on_hold →
// reserved|sold|transferred` whichever door tries it, dry-run-asserted against
// live before apply). What the ROUTER owes is narrower and is what these pin:
// the right RPC with the right arguments, the note rule answered in words
// before a round-trip, an invented outcome refused, and the RPC's own refusal
// surfaced with its detail code intact.

describe("POST /:id/hold-resolve — the goods", () => {
  it("puts the units back in stock through the RPC", async () => {
    const sb = rpcClient({
      data: { claim_no: "SC-1001", outcome: "back_to_stock", units: 2 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/hold-resolve", { outcome: "back_to_stock" });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("ops_stock_resolve_hold", {
      p_claim_id: "c1",
      p_outcome: "back_to_stock",
      p_note: null,
    });
    // A user-JWT write. The RPC gates independently; there is no service-role
    // bypass anywhere on this desk.
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("sends the units back to the supplier with their note", async () => {
    const sb = rpcClient({ data: { outcome: "returned", units: 1 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/hold-resolve", {
      outcome: "returned",
      note: "Collected by Ohana's lorry",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("ops_stock_resolve_hold", {
      p_claim_id: "c1",
      p_outcome: "returned",
      p_note: "Collected by Ohana's lorry",
    });
  });

  it("refuses a write-off with no words, in a sentence, before any round-trip", async () => {
    const sb = rpcClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/hold-resolve", { outcome: "written_off" });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("unprocessable");
    expect(body.message).toBe("Say why the units were written off.");
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("a whitespace-only reason is not a reason", async () => {
    const sb = rpcClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/hold-resolve", {
      outcome: "written_off",
      note: "   ",
    });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("accepts a write-off that says why", async () => {
    const sb = rpcClient({ data: { outcome: "written_off", units: 1 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/hold-resolve", {
      outcome: "written_off",
      note: "Frame cracked through, unsellable",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("ops_stock_resolve_hold", {
      p_claim_id: "c1",
      p_outcome: "written_off",
      p_note: "Frame cracked through, unsellable",
    });
  });

  it("refuses an invented outcome without touching the database", async () => {
    const sb = rpcClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/hold-resolve", { outcome: "sold_it_cheap" });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC's refusal when nothing is on hold", async () => {
    const sb = rpcClient({
      error: {
        code: "P0001",
        details: "no_held_units",
        message: "claim SC-1001 has no units on hold",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/hold-resolve", { outcome: "returned" });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("no_held_units");
  });

  it("refuses a supplier, a partner and a dealer", async () => {
    for (const role of ["supplier", "partner", "dealer"]) {
      const res = await post("c1/hold-resolve", { outcome: "returned" }, role);
      expect(res.status).toBe(403);
    }
    expect(userClient).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Layer ③ (migration 0324) — what we are doing for the CUSTOMER
// ═══════════════════════════════════════════════════════════════════════════
//
// A SECOND decision beside the item's outcome, never a replacement for it. The
// business rules — the closed list, the refusal on a closed claim, the fact
// that re-recording is allowed while it is open — all live in the RPC, because
// `supplier_claims` is writable from nowhere else. What the ROUTER owes is what
// these pin: the right RPC with the right arguments, an invented option refused
// before a round-trip, the role gate, and the RPC's refusal surfaced intact.

describe("POST /:id/customer-resolution — the customer", () => {
  it("records the resolution through the RPC", async () => {
    const sb = rpcClient({
      data: { claim_no: "SC-1001", customer_resolution: "replace" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/customer-resolution", {
      customer_resolution: "replace",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith(
      "supplier_claim_record_customer_resolution",
      { p_claim_id: "c1", p_resolution: "replace", p_note: null },
    );
    // A user-JWT write. There is no service-role bypass on this desk.
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("carries the note when there is one", async () => {
    const sb = rpcClient({ data: { customer_resolution: "no_replacement_required" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/customer-resolution", {
      customer_resolution: "no_replacement_required",
      note: "Customer cancelled the order on 5 Aug",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith(
      "supplier_claim_record_customer_resolution",
      {
        p_claim_id: "c1",
        p_resolution: "no_replacement_required",
        p_note: "Customer cancelled the order on 5 Aug",
      },
    );
  });

  it("accepts all four of Loo's resolutions and nothing else", async () => {
    for (const r of ["replace", "repair", "accept_as_is", "no_replacement_required"]) {
      const sb = rpcClient({ data: { customer_resolution: r } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(userClient).mockReturnValue(sb as any);
      const res = await post("c1/customer-resolution", { customer_resolution: r });
      expect(res.status, r).toBe(200);
    }
  });

  it("refuses an ITEM outcome as a customer resolution, without touching the database", async () => {
    // `Return to Supplier` and `Write Off` answer what happened to the ITEM.
    // Accepting one here would be the two decisions collapsing back into one.
    for (const wrong of ["returned", "return_to_supplier", "written_off", "write_off"]) {
      const sb = rpcClient({});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(userClient).mockReturnValue(sb as any);
      const res = await post("c1/customer-resolution", { customer_resolution: wrong });
      expect(res.status, wrong).toBe(422);
      expect(sb.rpc).not.toHaveBeenCalled();
    }
  });

  it("refuses a SUPPLIER answer, and `refund`, the same way", async () => {
    // The supplier's words are not our decision, and `Refund` has no frozen
    // business meaning — nobody may guess it.
    for (const wrong of ["reject", "replacement", "return_and_replace", "refund"]) {
      const sb = rpcClient({});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(userClient).mockReturnValue(sb as any);
      const res = await post("c1/customer-resolution", { customer_resolution: wrong });
      expect(res.status, wrong).toBe(422);
      expect(sb.rpc).not.toHaveBeenCalled();
    }
  });

  it("surfaces the RPC's refusal on a closed claim", async () => {
    const sb = rpcClient({
      error: {
        code: "P0001",
        details: "claim_closed",
        message: "claim SC-1014 is already closed",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/customer-resolution", { customer_resolution: "repair" });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("claim_closed");
  });

  it("refuses a supplier, a partner and a dealer", async () => {
    for (const role of ["supplier", "partner", "dealer"]) {
      const res = await post(
        "c1/customer-resolution",
        { customer_resolution: "replace" },
        role,
      );
      expect(res.status).toBe(403);
    }
    expect(userClient).not.toHaveBeenCalled();
  });

  it("moves no stock — the item's outcome keeps its own door", async () => {
    const sb = rpcClient({ data: { customer_resolution: "accept_as_is" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await post("c1/customer-resolution", { customer_resolution: "accept_as_is" });
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc).not.toHaveBeenCalledWith(
      "ops_stock_resolve_hold",
      expect.anything(),
    );
  });
});

describe("GET / carries the customer resolution", () => {
  it("selects the three layer-③ columns and returns them on the row", async () => {
    // The queue is the ONLY read the panel has, so a column left out of the
    // select is a decision the operator can record and then never see again.
    const selects: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = (rows: unknown[]): any => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: vi.fn((cols: string) => {
          selects.push(cols);
          return b;
        }),
        order: vi.fn(() => b),
        limit: vi.fn(() => b),
        range: vi.fn((from: number, to: number) => Promise.resolve({
          data: rows.slice(from, to + 1),
          error: null,
        })),
        in: vi.fn(() => b),
        eq: vi.fn(() => b),
        maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null, count: rows.length }).then(res, rej),
      };
      return b;
    };
    const resolved = {
      ...CLAIM,
      customer_resolution: "no_replacement_required",
      customer_resolution_note: "Customer cancelled",
      customer_resolution_at: "2026-08-05T09:00:00Z",
    };
    const sb = {
      from: vi.fn((t: string) => (t === "supplier_claims" ? builder([resolved]) : builder([]))),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(selects[0]).toContain("customer_resolution");
    expect(selects[0]).toContain("customer_resolution_note");
    expect(selects[0]).toContain("customer_resolution_at");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.claims[0].customer_resolution).toBe("no_replacement_required");
    expect(body.claims[0].customer_resolution_note).toBe("Customer cancelled");
  });
});
