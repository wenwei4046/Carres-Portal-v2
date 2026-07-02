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
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

/** Per-table mock: order_lines.select().not() and ops_order_control.select().in()
 *  each resolve to their supplied data; ops_order_control.upsert() resolves ok. */
function makeSb(opts: {
  lines: { order_id: string; sku: string; source_po: string | null }[];
  existing?: { order_id: string; line_etas: Record<string, string> | null }[];
}) {
  const upsert = vi.fn((_rows: unknown) => Promise.resolve({ error: null }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderLines: any = {
    select: vi.fn(() => orderLines),
    not: vi.fn(() => Promise.resolve({ data: opts.lines, error: null })),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const control: any = {
    select: vi.fn(() => control),
    in: vi.fn(() => Promise.resolve({ data: opts.existing ?? [], error: null })),
    upsert,
  };
  const from = vi.fn((t: string) => (t === "order_lines" ? orderLines : control));
  return { from, upsert };
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

const URL = "http://t/api/operation/orders/import-stock-eta";

describe("POST /api/operation/orders/import-stock-eta", () => {
  it("401 without a token", async () => {
    const res = await app.fetch(new Request(URL, { method: "POST", body: "{}" }), env);
    expect(res.status).toBe(401);
  });

  it("403 for a non-operation role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({ rows: [{ po: "PO/1", sku: "x", eta: "2026-06-20" }] }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422 on an invalid row (bad eta format)", async () => {
    const jwt = await makeJwt("operation");
    vi.mocked(userClient).mockReturnValue(makeSb({ lines: [] }) as never);
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({ rows: [{ po: "PO/1", sku: "x", eta: "20 Jun 26" }] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("dry-run returns match counts and writes nothing", async () => {
    const jwt = await makeJwt("operation");
    const sb = makeSb({
      lines: [{ order_id: "o1", sku: "1013Jager/King/COL:PC15", source_po: "PO/2603-065" }],
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({
          dryRun: true,
          rows: [{ po: "PO/2603-065", sku: "1013Jager/King /PC1", eta: "2026-06-20" }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const { result } = (await res.json()) as {
      result: { matched: number; written: number; orders: number; dryRun: boolean };
    };
    expect(result.matched).toBe(1);
    expect(result.written).toBe(0);
    expect(result.orders).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(sb.upsert).not.toHaveBeenCalled();
  });

  it("commit merges ETAs into line_etas and reports written", async () => {
    const jwt = await makeJwt("operation");
    const sb = makeSb({
      lines: [
        { order_id: "o1", sku: "1013Jager/King/COL:PC15", source_po: "PO/2603-065" },
        { order_id: "o1", sku: "1013Jager/Queen/COL:PC15", source_po: "PO/2603-065" },
      ],
      existing: [{ order_id: "o1", line_etas: { "Other Item": "2026-01-01" } }],
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({
          rows: [
            { po: "PO/2603-065", sku: "1013Jager/Queen /PC1", eta: "2026-06-24" },
          ],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const { result } = (await res.json()) as { result: { written: number; matched: number } };
    expect(result.matched).toBe(1);
    expect(result.written).toBe(1);
    expect(sb.upsert).toHaveBeenCalledTimes(1);
    const arg = sb.upsert.mock.calls[0]![0] as unknown as {
      order_id: string;
      line_etas: Record<string, string>;
    }[];
    // merged: kept the pre-existing key, added the matched Queen line's exact sku.
    expect(arg[0].line_etas["Other Item"]).toBe("2026-01-01");
    expect(arg[0].line_etas["1013Jager/Queen/COL:PC15"]).toBe("2026-06-24");
  });
});
