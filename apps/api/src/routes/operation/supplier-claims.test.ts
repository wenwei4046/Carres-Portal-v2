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
