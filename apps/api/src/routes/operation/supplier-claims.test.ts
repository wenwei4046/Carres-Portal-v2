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
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
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

async function makeJwt(role: string) {
  return signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
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

/** The actor lookup's staff door (`actor_display_names`) — it names u1. */
function namesDoor() {
  return vi.fn(async (name: string) =>
    name === "actor_display_names"
      ? { data: [{ id: "u1", name: "Shasha" }], error: null }
      : { data: null, error: null },
  );
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/supplier-claims", () => {
  it("defaults to the OPEN queue — a worklist does not open on closed rows", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const sb = {
      rpc: namesDoor(),
      from: vi.fn((t: string) => {
        if (t === "product_skus") {
          const builder = listBuilder([{ sku: "MS01-K", variant: "King", product_models: { name: "Mattress Classic" } }], eqCalls);
          builder.select = vi.fn((columns: string) => { expect(columns).toBe("sku, variant, product_models(name)"); return builder; });
          return builder;
        }
        if (t === "supplier_claims") return listBuilder([CLAIM], eqCalls);
        if (t === "suppliers")
          return listBuilder([{ id: "s1", name: "Ohana" }], eqCalls);
        if (t === "salespersons") return listBuilder([], eqCalls);
        // R4 — the two units this claim quarantined.
        if (t === "ops_stock_items")
          return listBuilder(
            [
              { hold_claim_id: "c1", hold_reason: "damaged", unit_code: "U-1001" },
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
    expect(body.claims[0].product_description).toBe("Mattress Classic");
    expect(body.claims[0].product_variant).toBe("King");
    expect(body.claims[0].held_unit_codes).toEqual(["U-1001"]);
    // R4 — the goods, read from the register rather than copied from qty.
    expect(body.claims[0].held_units).toBe(2);
    expect(body.claims[0].hold_reason).toBe("damaged");
    // §9.5 PO No line two reads EVERY Unit the claim names; a send read that
    // could not run is unknown (null), never "not sent".
    expect(body.claims[0].units.map((u: { unit_code: string | null }) => u.unit_code)).toEqual(["U-1001", null]);
    expect(body.claims[0].sent).toBeNull();
    // NEVER the admin client for a read the caller's own RLS can do.
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("prints Units could not be loaded for ONE row's failed Unit read, not a failed register", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    let stockReads = 0;
    const sb = {
      rpc: namesDoor(),
      from: vi.fn((t: string) => {
        if (t === "supplier_claims") return listBuilder([{ ...CLAIM, supplier_response_reply_id: "r1" }], eqCalls);
        if (t === "suppliers") return listBuilder([{ id: "s1", name: "Ohana" }], eqCalls);
        if (t === "document_sends") return listBuilder([{ document_id: "c1" }], eqCalls);
        if (t === "supplier_claim_replies") return listBuilder([{ id: "r1", scope: "claim", unit_ids: [], supplier_date: "2026-10-05" }], eqCalls);
        if (t === "ops_stock_items") {
          stockReads += 1;
          const b = listBuilder([], eqCalls);
          // The held-count read succeeds; the all-Units read fails.
          if (stockReads > 1) b.range = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
          return b;
        }
        return listBuilder([], eqCalls);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(new Request("http://t/api/operation/supplier-claims?status=all", { headers: { Authorization: `Bearer ${jwt}` } }), env);
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = ((await res.json()) as any).claims[0];
    expect(row.units).toBeNull();
    expect(row.sent).toBe(true);
    expect(row.response_reply).toEqual({ scope: "claim", unit_ids: [], supplier_date: "2026-10-05" });
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

  it("counts a PO's stages from head counts, not from the page it just filtered", async () => {
    /* ⛔ A COUNT MAY NOT BE DERIVED FROM AN ALREADY-FILTERED PAGE. The PO
       branch counted the rows it had fetched, and those rows are narrowed by
       `status` — so `?poId=X&status=open` reported ZERO closed claims for a PO
       that has them. Invisible while the only caller asked for `all`; the
       moment the page's `?po=` door is wired, the stage chips are read as
       "this PO has none". */
    const eqCalls: Array<[string, unknown]> = [];
    const openRows = [{ ...CLAIM, po_id: "PO-2030", supplier_id: null, reported_by: null }];
    const sb = {
      from: vi.fn((table: string) =>
        listBuilder(table === "supplier_claims" ? openRows : [], eqCalls),
      ),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/supplier-claims?status=open&poId=PO-2030", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // The PO scopes the LIST and BOTH head counts — three reads, one filter.
    expect(eqCalls.filter(([col, val]) => col === "po_id" && val === "PO-2030")).toHaveLength(3);
    // And the closed count comes from its own read rather than from the open
    // page, which by construction contains no closed row to find.
    const body = (await res.json()) as { counts: { open: number; closed: number } };
    expect(body.counts.closed).not.toBe(0);
  });

  it.each(["&poId=PO-2030", ""])("returns all claims beyond 200 for scope %s", async (scope) => {
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
      new Request(`http://t/api/operation/supplier-claims?status=all${scope}`, {
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
      rpc: namesDoor(),
      from: vi.fn((table: string) => {
        if (table === "supplier_claims") return listBuilder([CLAIM], eqCalls);
        if (table === "suppliers") return listBuilder([{ id: "s1", name: "Ohana" }], eqCalls);
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
      rpc: namesDoor(),
      from: vi.fn((t: string) => {
        tables.push(t);
        if (t === "product_skus") return listBuilder([], eqCalls);
        if (t === "supplier_claims") return listBuilder([CLAIM, LATE], eqCalls);
        if (t === "suppliers")
          return listBuilder([{ id: "s1", name: "Ohana" }], eqCalls);
        if (t === "salespersons") return listBuilder([], eqCalls);
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
      label: "Call Ohana to agree the fix",
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
      rpc: namesDoor(),
      from: vi.fn((t: string) => {
        if (t === "product_skus") return listBuilder([], eqCalls);
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

const REPLY = {
  supplier_response: "repair",
  scope: "claim",
  supplier_date: "2026-10-05",
  evidence: [{ path: "supplier_claim_reply/c1/a.jpg", kind: "photo" }],
};

describe("POST /:id/response — what the SUPPLIER answered, with scope, date and evidence (0607)", () => {
  it("passes the answer, its scope, the supplier's date and the evidence to the ONE reply door", async () => {
    const sb = rpcClient({ data: { claim_no: "SC-1001", supplier_response: "repair", formal: true } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/response", REPLY);
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_claim_record_reply", {
      p_claim_id: "c1",
      p_response: "repair",
      p_scope: "claim",
      p_unit_ids: [],
      p_supplier_date: "2026-10-05",
      p_note: null,
      p_evidence: [{ path: "supplier_claim_reply/c1/a.jpg", kind: "photo" }],
      p_spoke_with: null,
      p_spoken_at: null,
    });
    // The scope-less legacy door is never reached again.
    expect(sb.rpc).not.toHaveBeenCalledWith("supplier_claim_record_response", expect.anything());
  });

  it("carries exact Units and a phone answer (who spoke, when)", async () => {
    const sb = rpcClient({ data: {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const unit = "0b8a3b5e-7a0c-4d3e-9d44-5d6c1a2b3c4d";
    const res = await post("c1/response", {
      supplier_response: "other_agreement", scope: "units", unit_ids: [unit], note: "New cushion only",
      evidence: [], spoke_with: "Mr Tan", spoken_at: "2026-09-29T10:00:00+08:00",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_claim_record_reply", expect.objectContaining({
      p_scope: "units", p_unit_ids: [unit], p_spoke_with: "Mr Tan", p_spoken_at: "2026-09-29T10:00:00+08:00", p_note: "New cushion only",
    }));
  });

  it("refuses a reply without a scope before any round-trip", async () => {
    const sb = rpcClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/response", { supplier_response: "repair", evidence: REPLY.evidence });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("lets the DATABASE demand the evidence and the note — its detail comes back as the code", async () => {
    for (const detail of ["evidence_required", "response_note_required", "unit_not_on_claim"]) {
      const sb = rpcClient({ error: { code: "22023", details: detail, message: detail } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(userClient).mockReturnValue(sb as any);
      const res = await post("c1/response", REPLY);
      expect(res.status).toBe(422);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(((await res.json()) as any).code).toBe(detail);
    }
  });

  it("refuses an invented answer word and an evidence kind the form never offers", async () => {
    const sb = rpcClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    expect((await post("c1/response", { ...REPLY, supplier_response: "maybe_later" })).status).toBe(422);
    expect((await post("c1/response", { ...REPLY, evidence: [{ path: "x", kind: "zip" }] })).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("refuses a supplier and a dealer", async () => {
    for (const role of ["supplier", "dealer"]) {
      expect((await post("c1/response", REPLY, role)).status).toBe(403);
    }
  });
});

describe("POST /:id/send — Claim sent to supplier (document_sends, 0607)", () => {
  it("records the channel and recipient through the send door", async () => {
    const sb = rpcClient({ data: "send-1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/send", { channel: "whatsapp", recipient: "Hooka Mr Tan" });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_claim_record_send", {
      p_claim_id: "c1", p_channel: "whatsapp", p_recipient: "Hooka Mr Tan", p_note: null,
    });
  });

  it("refuses a send with no recipient or an invented channel", async () => {
    const sb = rpcClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    expect((await post("c1/send", { channel: "whatsapp", recipient: "  " })).status).toBe(422);
    expect((await post("c1/send", { channel: "fax", recipient: "Hooka" })).status).toBe(422);
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

describe("POST /:id/customer-resolution — retired (owner ruling 2026-09-29)", () => {
  it("is gone: the ONE decision door writes the Authorised Outcome", async () => {
    const sb = rpcClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/customer-resolution", { customer_resolution: "repair" });
    expect(res.status).toBe(404);
    expect(sb.rpc).not.toHaveBeenCalled();
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
      rpc: namesDoor(),
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

// ═══════════════════════════════════════════════════════════════════════════
// Layer ④ · Carres Execution (Loo, 2026-08-05 · migration 0409)
// ═══════════════════════════════════════════════════════════════════════════
//
// The business rules — the vocabulary, the stamp, the refusal on a closed
// claim, that re-recording is allowed while it is open — all live in the RPC,
// because `supplier_claims` is writable from nowhere else. What the ROUTER owes
// is what these pin: the right RPC with the right arguments, an invented option
// refused before a round-trip, the role gate, and the RPC's refusal intact.

/** 0609: the route first asks the one PO issue capability (PO Duty, dated
 *  cover or Operations Superuser); this caller holds it. */
function executionClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn(async (name: string) =>
    name === "purchasing_po_duty_may_act"
      ? { data: true, error: null }
      : { data: result.data ?? null, error: result.error ?? null });
  return { rpc };
}

describe("POST /:id/carres-execution — `Record what Carres does next` (owner ruling 2026-09-29)", () => {
  it("records the decision through the ONE door, as the caller", async () => {
    const sb = executionClient({ data: { claim_no: "SC-1001", decision: "repair" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/carres-execution", { carres_execution: "repair", note: "Hooka repairs both" });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("purchasing_po_duty_may_act", { p_user: expect.any(String) });
    expect(sb.rpc).toHaveBeenCalledWith("supplier_claim_record_carres_execution", { p_claim_id: "c1", p_execution: "repair", p_note: "Hooka repairs both" });
    expect(sb.rpc).not.toHaveBeenCalledWith("purchasing_actor_may_issue", expect.anything());
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("accepts exactly the three supplier-side decisions", async () => {
    for (const e of ["return_to_supplier", "repair", "replacement"]) {
      const sb = executionClient({ data: { decision: e } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(userClient).mockReturnValue(sb as any);
      const res = await post("c1/carres-execution", { carres_execution: e });
      expect(res.status, e).toBe(200);
    }
  });

  it("refuses the four customer movements and every other word, without touching the database", async () => {
    for (const wrong of ["collect_defective_item", "replace_first", "collect_first", "exchange_on_collection", "replace", "accept_as_is", "no_replacement_required", "returned", "written_off", "reject"]) {
      const sb = rpcClient({});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(userClient).mockReturnValue(sb as any);
      const res = await post("c1/carres-execution", { carres_execution: wrong });
      expect(res.status, wrong).toBe(422);
      expect(sb.rpc).not.toHaveBeenCalled();
    }
  });

  it("refuses a caller the Shared Duty Resolver does not name", async () => {
    const rpc = vi.fn(async (name: string) => (name === "purchasing_po_duty_may_act" ? { data: false, error: null } : { data: {}, error: null }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const res = await post("c1/carres-execution", { carres_execution: "return_to_supplier" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("not_po_duty");
    expect(rpc).not.toHaveBeenCalledWith("supplier_claim_record_carres_execution", expect.anything());
  });

  it("surfaces a locked decision in the door's own words", async () => {
    const sb = executionClient({ error: { code: "23514", details: "repair_order_issued", message: "RO260928-4827 is already issued" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post("c1/carres-execution", { carres_execution: "replacement" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "repair_order_issued", message: "RO260928-4827 is already issued" });
  });

  it("refuses a supplier, a partner and a dealer", async () => {
    for (const role of ["supplier", "partner", "dealer"]) {
      const res = await post("c1/carres-execution", { carres_execution: "repair" }, role);
      expect(res.status).toBe(403);
    }
    expect(userClient).not.toHaveBeenCalled();
  });

  it("moves no stock — the capability and the one door, nothing else", async () => {
    const sb = executionClient({ data: { decision: "return_to_supplier" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await post("c1/carres-execution", { carres_execution: "return_to_supplier" });
    expect(sb.rpc).toHaveBeenCalledTimes(2);
    expect(sb.rpc).not.toHaveBeenCalledWith("ops_stock_resolve_hold", expect.anything());
  });
});

describe("GET / carries the Carres execution", () => {
  it("selects the three layer-④ columns and returns them on the row", async () => {
    // The queue is the ONLY read the panel has, so a column left out of the
    // select is a decision the operator can record and then never see again —
    // exactly the hazard the layer-③ test above pins, and the reason this one
    // exists rather than trusting that the select was extended.
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
    const executed = {
      ...CLAIM,
      customer_resolution: "replace",
      carres_execution: "collect_first",
      carres_execution_note: "Van picks up before the new one ships",
      carres_execution_at: "2026-09-01T09:00:00Z",
    };
    const sb = {
      rpc: namesDoor(),
      from: vi.fn((t: string) => (t === "supplier_claims" ? builder([executed]) : builder([]))),
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
    expect(selects[0]).toContain("carres_execution");
    expect(selects[0]).toContain("carres_execution_note");
    expect(selects[0]).toContain("carres_execution_at");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.claims[0].carres_execution).toBe("collect_first");
    expect(body.claims[0].carres_execution_note).toBe(
      "Van picks up before the new one ships",
    );
    // Both layers survive the same read — one is not shadowing the other.
    expect(body.claims[0].customer_resolution).toBe("replace");
  });
});

describe("GET /:id/record — the claim record's Supplier facts (§9.5)", () => {
  it("returns every reply with its scope, date and signed evidence; sends; and refuses Plan Repair without an Authorised Outcome", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const replies = [
      { id: "r1", response: "replacement", scope: "claim", unit_ids: [], supplier_date: "2026-10-05", note: null, evidence: [{ path: "supplier_claim_reply/c1/a.jpg", kind: "photo" }], spoke_with: null, spoken_at: null, recorded_by: "u1", recorded_at: "2026-09-29T02:00:00Z", formal_at: "2026-09-29T02:00:00Z" },
    ];
    const sb = {
      rpc: namesDoor(),
      from: vi.fn((t: string) => {
        if (t === "supplier_claims") return listBuilder([{ id: "c1", claim_no: "SC-1001", requested_by: "u1", requested_at: "2026-09-28T02:00:00Z", responded_by: "u1", supplier_response_reply_id: "r1" }], eqCalls);
        if (t === "supplier_claim_replies") return listBuilder(replies, eqCalls);
        if (t === "document_sends") return listBuilder([{ id: "s1", version: 1, recipient: "Hooka Mr Tan", channel: "whatsapp", note: null, sent_by: "u1", sent_at: "2026-09-28T03:00:00Z" }], eqCalls);
        if (t === "ops_stock_items") return listBuilder([{ id: "u-1", unit_code: "U1-000-075", identity_scope: "unit", qty: 1, status: "on_hold" }], eqCalls);
        return listBuilder([], eqCalls);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed/a.jpg" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(adminClient).mockReturnValue({ storage: { from: vi.fn(() => ({ createSignedUrl })) } } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(new Request("http://t/api/operation/supplier-claims/c1/record", { headers: { Authorization: `Bearer ${jwt}` } }), env);
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.replies[0]).toMatchObject({ response: "replacement", scope: "claim", supplier_date: "2026-10-05", current: true, recorded_by_name: "Shasha", evidence: [{ kind: "photo", url: "https://signed/a.jpg" }] });
    expect(body.sends[0]).toMatchObject({ channel: "whatsapp", recipient: "Hooka Mr Tan", sent_by_name: "Shasha" });
    expect(body.units).toHaveLength(1);
    expect(body.plan_repair).toEqual({ allowed: false, missing: "Authorised Outcome" });
    expect(createSignedUrl).toHaveBeenCalledWith("supplier_claim_reply/c1/a.jpg", 3600);
  });
});

describe("GET /:id/inspection — the per-Unit evidence inspector's facts (§9.5 Row expansion)", () => {
  it("returns every file with its kind and its Unit when it was filed with one, and each Unit's own recorded problem", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const sb = {
      rpc: namesDoor(),
      from: vi.fn((t: string) => {
        if (t === "supplier_claims") return listBuilder([{ id: "c1", warehouse_receipt_id: "g1", photos: [{ path: "PO-1/a.jpg", at: "2026-09-04T02:00:00Z", by: "u1", unit_code: "U1-000-001" }, { path: "PO-1/b.mp4", at: "2026-09-04T02:00:00Z", by: "u1" }] }], eqCalls);
        if (t === "ops_stock_items") return listBuilder([{ id: "u-1" }], eqCalls);
        if (t === "receiving_unit_results") return listBuilder([{ stock_item_id: "u-1", note: "Scratch on left arm", outcome: "received_with_issue", created_at: "2026-09-04T02:00:00Z" }], eqCalls);
        return listBuilder([], eqCalls);
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const createSignedUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` } }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(adminClient).mockReturnValue({ storage: { from: vi.fn(() => ({ createSignedUrl })) } } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(new Request("http://t/api/operation/supplier-claims/c1/inspection", { headers: { Authorization: `Bearer ${jwt}` } }), env);
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.files).toEqual([
      { path: "PO-1/a.jpg", at: "2026-09-04T02:00:00Z", kind: "photo", unit_code: "U1-000-001", url: "https://signed/PO-1/a.jpg" },
      { path: "PO-1/b.mp4", at: "2026-09-04T02:00:00Z", kind: "video", unit_code: null, url: "https://signed/PO-1/b.mp4" },
    ]);
    expect(body.problems).toEqual([{ stock_item_id: "u-1", note: "Scratch on left arm" }]);
  });

  it("answers 404 for a claim the caller cannot read, and refuses a dealer", async () => {
    const sb = { rpc: namesDoor(), from: vi.fn(() => listBuilder([], [])) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await app.fetch(new Request("http://t/api/operation/supplier-claims/c9/inspection", { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } }), env);
    expect(res.status).toBe(404);
    const dealer = await app.fetch(new Request("http://t/api/operation/supplier-claims/c9/inspection", { headers: { Authorization: `Bearer ${await makeJwt("dealer")}` } }), env);
    expect(dealer.status).toBe(403);
  });
});
