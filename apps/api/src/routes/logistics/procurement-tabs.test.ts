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
const KID = "ptk-1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000777")
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

describe("GET /api/logistics/procurement/:slug", () => {
  /**
   * Mock the supabase query chain for the no-category path (`nice-future` only).
   * Single-pass:
   *   sb.from("purchase_orders").select(...).eq(...).order(...).limit(...)
   *   → { data, error }
   */
  function mockSinglePass(rows: unknown[]) {
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    return { from, select, eq, order, limit };
  }

  /**
   * Mock the two-pass chain for category-filtered tabs (`hookka-sofa` /
   * `hookka-bedframe`):
   *   Pass A — sb.from("purchase_order_lines").select(...).like(...).eq(...)
   *            → { data: matchedLineRows, error }
   *   Pass B — sb.from("purchase_orders").select(...).in("id", ids).order(...).limit(...)
   *            → { data: parentRows, error }
   *
   * T42-pass3-C4 — split into two passes so the embedded line array on the
   * parent rows isn't truncated by an inner-join filter.
   */
  function mockTwoPass(opts: {
    matchedLines: Array<{ po_id: string }>;
    parentRows: unknown[];
  }) {
    // Pass A chain
    const passAEq = vi.fn().mockResolvedValue({ data: opts.matchedLines, error: null });
    const passALike = vi.fn().mockReturnValue({ eq: passAEq });
    const passASelect = vi.fn().mockReturnValue({ like: passALike });

    // Pass B chain
    const passBLimit = vi.fn().mockResolvedValue({ data: opts.parentRows, error: null });
    const passBOrder = vi.fn().mockReturnValue({ limit: passBLimit });
    const passBIn = vi.fn().mockReturnValue({ order: passBOrder });
    const passBSelect = vi.fn().mockReturnValue({ in: passBIn });

    const from = vi.fn((table: string) => {
      if (table === "purchase_order_lines") return { select: passASelect };
      if (table === "purchase_orders") return { select: passBSelect };
      throw new Error(`unexpected table: ${table}`);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    return {
      from,
      passASelect,
      passALike,
      passAEq,
      passBSelect,
      passBIn,
      passBOrder,
      passBLimit,
    };
  }

  const NICE_FUTURE_PO = {
    id: "PO-3001",
    supplier_id: "00000000-0000-0000-0000-000000000a01",
    warehouse_id: "00000000-0000-0000-0000-000000000b01",
    status: "open",
    sup_status: "pending",
    dl: 5001,
    dl_refs: null,
    eta_date: "2026-05-20",
    placed_at: "2026-05-06T09:00:00Z",
    suppliers: { slug: "nice-future", name: "Nice Future" },
    purchase_order_lines: [{ sku: "mattress:carres-cloud:King", qty: 2, received_qty: 0 }],
  };

  // T42-pass3-C4 — Hookka PO with BOTH sofa AND bedframe lines. The
  // hookka-sofa tab must surface this PO with BOTH lines visible (not just
  // the sofa one), otherwise Receive/Detail modals operate on partial data.
  const HOOKKA_MIXED_PO = {
    id: "PO-3010",
    supplier_id: "00000000-0000-0000-0000-000000000a02",
    warehouse_id: "00000000-0000-0000-0000-000000000b01",
    status: "open",
    sup_status: "pending",
    dl: 5010,
    dl_refs: null,
    eta_date: "2026-05-22",
    placed_at: "2026-05-06T09:30:00Z",
    suppliers: { slug: "hookka", name: "HoOKkA" },
    purchase_order_lines: [
      { sku: "sofa:harbour:preset:3-seater", qty: 1, received_qty: 0 },
      { sku: "bedframe:savana:Queen", qty: 2, received_qty: 0 },
    ],
  };

  // ----- Happy path: nice-future (no category filter — single pass) -----
  it("nice-future: 200 + supplier-slug filter, single-pass query", async () => {
    const { from, select, eq, order, limit } = mockSinglePass([NICE_FUTURE_PO]);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/nice-future", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: typeof NICE_FUTURE_PO[] };
    expect(body.pos).toHaveLength(1);
    expect(body.pos[0]?.id).toBe("PO-3001");
    expect(body.pos[0]?.suppliers.slug).toBe("nice-future");

    expect(from).toHaveBeenCalledWith("purchase_orders");
    expect(select).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("suppliers.slug", "nice-future");
    // T42-pass3-C4 — the embed must NOT use !inner so POs with zero lines
    // still surface.
    expect(select.mock.calls[0]?.[0]).toContain(
      "purchase_order_lines(sku, qty, received_qty)",
    );
    expect(select.mock.calls[0]?.[0]).not.toContain(
      "purchase_order_lines!inner",
    );
    expect(order).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  // ----- Happy path: hookka-sofa (two-pass query) -----
  it("hookka-sofa: 200 with two-pass query preserving full embedded lines (T42-pass3-C4)", async () => {
    const { from, passASelect, passALike, passAEq, passBSelect, passBIn, passBOrder, passBLimit } =
      mockTwoPass({
        matchedLines: [{ po_id: "PO-3010" }],
        parentRows: [HOOKKA_MIXED_PO],
      });

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/hookka-sofa", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pos: Array<typeof HOOKKA_MIXED_PO>;
    };
    expect(body.pos).toHaveLength(1);
    expect(body.pos[0]?.id).toBe("PO-3010");
    // Critical assertion: BOTH lines (sofa AND bedframe) survive even though
    // the tab filter narrowed by `sofa:%`. Pre-fix, embedded `!inner` would
    // truncate the array to only the sofa row.
    expect(body.pos[0]?.purchase_order_lines).toHaveLength(2);

    // Pass A: lines table queried with category prefix + supplier slug.
    expect(from).toHaveBeenCalledWith("purchase_order_lines");
    expect(passASelect).toHaveBeenCalledTimes(1);
    expect(passALike).toHaveBeenCalledWith("sku", "sofa:%");
    expect(passAEq).toHaveBeenCalledWith(
      "purchase_orders.suppliers.slug",
      "hookka",
    );

    // Pass B: parent rows fetched by id WITHOUT line-array filter.
    expect(from).toHaveBeenCalledWith("purchase_orders");
    expect(passBSelect).toHaveBeenCalledTimes(1);
    expect(passBSelect.mock.calls[0]?.[0]).toContain(
      "purchase_order_lines(sku, qty, received_qty)",
    );
    expect(passBSelect.mock.calls[0]?.[0]).not.toContain(
      "purchase_order_lines!inner",
    );
    expect(passBIn).toHaveBeenCalledWith("id", ["PO-3010"]);
    expect(passBOrder).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(passBLimit).toHaveBeenCalledWith(200);
  });

  // ----- hookka-bedframe (two-pass query, empty match set) -----
  it("hookka-bedframe: empty match set short-circuits Pass B (T42-pass3-C4)", async () => {
    const m = mockTwoPass({ matchedLines: [], parentRows: [] });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/hookka-bedframe", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: unknown[] };
    expect(body.pos).toEqual([]);

    // Pass A fired with the bedframe prefix.
    expect(m.passALike).toHaveBeenCalledWith("sku", "bedframe:%");
    expect(m.passAEq).toHaveBeenCalledWith(
      "purchase_orders.suppliers.slug",
      "hookka",
    );
    // No matched ids → Pass B never fires (the route returns early to skip
    // an empty `.in("id", [])` round-trip).
    expect(m.passBSelect).not.toHaveBeenCalled();
  });

  // ----- hookka-sofa: dedupes po_ids when a PO has 2+ matching lines -----
  it("hookka-sofa: dedupes po_id when one PO has multiple matching lines", async () => {
    // 2 sofa lines on the same PO must collapse to a single id in Pass B.
    const m = mockTwoPass({
      matchedLines: [{ po_id: "PO-3010" }, { po_id: "PO-3010" }],
      parentRows: [HOOKKA_MIXED_PO],
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/hookka-sofa", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(m.passBIn).toHaveBeenCalledWith("id", ["PO-3010"]);
  });

  // ----- 422 invalid slug -----
  it("returns 422 for an unknown slug", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/foobar", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string; message: string };
    expect(body.code).toBe("invalid_slug");
    expect(from).not.toHaveBeenCalled();
  });

  // ----- 403 non-logistics role -----
  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/nice-future", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  // ----- 401 no auth header -----
  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/nice-future"),
      env,
    );
    expect(res.status).toBe(401);
  });

  // ----- 500 supabase error mapping (Pass A) -----
  it("maps an unexpected Pass A supabase error to 500 (category tabs)", async () => {
    const passAEq = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const passALike = vi.fn().mockReturnValue({ eq: passAEq });
    const passASelect = vi.fn().mockReturnValue({ like: passALike });
    const from = vi.fn().mockReturnValue({ select: passASelect });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/hookka-sofa", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(500);
  });

  // ----- 500 supabase error mapping (single-pass / nice-future) -----
  it("maps an unexpected supabase error to 500 (no-category tab)", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/nice-future", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(500);
  });
});
