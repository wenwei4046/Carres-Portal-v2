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

/** Per-table mock: orders.select().eq() resolves the AutoCount orders;
 *  order_lines.select() resolves the lines; rpc() records append calls. */
function makeSb(opts: {
  orders: { id: string; so: number; source_ref: string[] }[];
  lines: { order_id: string; sku: string; source_po: string | null }[];
  rpcResult?: { appended: number };
}) {
  const rpc = vi.fn(
    (): Promise<{
      data: { appended: number } | null;
      error: { code: string; message: string } | null;
    }> => Promise.resolve({ data: opts.rpcResult ?? { appended: 1 }, error: null }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders: any = {
    select: vi.fn(() => orders),
    eq: vi.fn(() => Promise.resolve({ data: opts.orders, error: null })),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderLines: any = {
    select: vi.fn(() => Promise.resolve({ data: opts.lines, error: null })),
  };
  const from = vi.fn((t: string) => (t === "orders" ? orders : orderLines));
  return { from, rpc };
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

const URL = "http://t/api/operation/orders/append-missing-lines";

const post = async (jwt: string, body: unknown) =>
  app.fetch(
    new Request(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );

// SO-1138 (TCF0544): portal has the HK5535 line only; the sheet carries BOTH
// sofas → the DSL9038 row is a clean append candidate.
const FIXTURE = {
  orders: [{ id: "o1138", so: 1138, source_ref: ["TCF0544"] }],
  lines: [
    { order_id: "o1138", sku: 'SF03-HK5535/30"(3 Seater)', source_po: "PO/2606-111" },
  ],
};
const ROWS = [
  { ref: "TCF0544", itemGroup: "Sofa", qty: 1, detail: 'DSL9038/30"(3 Seater)', po: "PO/2606-099" },
  { ref: "TCF0544", itemGroup: "Sofa", qty: 1, detail: 'SF03-HK5535/30"(3 Seater)', po: "PO/2606-111" },
];

describe("POST /api/operation/orders/append-missing-lines", () => {
  it("401 without a token", async () => {
    const res = await app.fetch(new Request(URL, { method: "POST", body: "{}" }), env);
    expect(res.status).toBe(401);
  });

  it("403 for a non-operation role", async () => {
    const res = await post(await makeJwt("finance"), { rows: ROWS, dryRun: true });
    expect(res.status).toBe(403);
  });

  it("422 on a bad row shape", async () => {
    const sb = makeSb(FIXTURE);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(await makeJwt("operation"), {
      rows: [{ ref: "", qty: 0, detail: "" }],
    });
    expect(res.status).toBe(422);
  });

  it("dryRun detects the missing line, writes nothing", async () => {
    const sb = makeSb(FIXTURE);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(await makeJwt("operation"), { rows: ROWS, dryRun: true });
    expect(res.status).toBe(200);
    const { result } = (await res.json()) as {
      result: {
        candidates: { po: string; clean: boolean; so: number }[];
        appended: number;
        dryRun: boolean;
      };
    };
    expect(result.dryRun).toBe(true);
    expect(result.appended).toBe(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ po: "PO/2606-099", clean: true, so: 1138 });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("commit re-detects then appends via the RPC (raw sku + source_po + item_group)", async () => {
    const sb = makeSb(FIXTURE);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(await makeJwt("operation"), { rows: ROWS });
    expect(res.status).toBe(200);
    const { result } = (await res.json()) as {
      result: { appended: number; orders: number; dryRun: boolean };
    };
    expect(result).toMatchObject({ appended: 1, orders: 1, dryRun: false });
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc).toHaveBeenCalledWith("append_autocount_order_lines", {
      p_order_id: "o1138",
      p_lines: [
        {
          sku: 'DSL9038/30"(3 Seater)',
          qty: 1,
          source_po: "PO/2606-099",
          attrs: { item_group: "Sofa" },
        },
      ],
    });
  });

  it("commit with rows whose PO already exists appends nothing (server-side re-check)", async () => {
    const sb = makeSb(FIXTURE);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(await makeJwt("operation"), {
      rows: [ROWS[1]!], // the HK5535 row — its PO is already on the order
    });
    expect(res.status).toBe(200);
    const { result } = (await res.json()) as { result: { appended: number } };
    expect(result.appended).toBe(0);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("403 surfaces when the RPC raises 42501", async () => {
    const sb = makeSb(FIXTURE);
    sb.rpc = vi.fn(() =>
      Promise.resolve({ data: null, error: { code: "42501", message: "forbidden" } }),
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(await makeJwt("operation"), { rows: ROWS });
    expect(res.status).toBe(403);
  });
});
