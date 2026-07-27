import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

/**
 * 0300 — late interest, and settling a rental early.
 *
 * What is under test is the DOOR, not the arithmetic: the RPCs own the money
 * and were proved against live prod in a rolled-back transaction (21 assertions)
 * before 0300 was applied. So this asserts the things only the API layer can get
 * wrong — WHO may act, WHICH rpc is called with WHICH argument names, that no
 * money figure is ever sent for the interest, how each `detail` maps to a
 * status, and that a refused settlement does not leave its document behind.
 *
 * Harness copied from rental-approver.test.ts.
 */

function request(path: string, init: RequestInit | undefined, e: unknown): Promise<Response> {
  return (app as unknown as { fetch: (r: Request, env: unknown) => Promise<Response> }).fetch(
    new Request(`http://localhost${path}`, init),
    e,
  );
}

vi.mock("../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../lib/supabase";

vi.mock("../lib/stripe", () => ({
  stripeConfigured: (env: { STRIPE_SECRET_KEY?: string }) => !!env.STRIPE_SECRET_KEY,
  stripeClient: vi.fn(),
  webCryptoProvider: {},
  describePaymentMethod: () => null,
  receiptUrlOf: () => null,
}));

vi.mock("../lib/rental-stripe", () => ({
  CARRES_SOURCE: "carres-portal",
  ensureFixedTermSchedule: vi.fn(),
  ensureRentalPlanStripeObjects: vi.fn(),
}));

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  PUBLIC_WEB_URL: "https://pos.test",
};

const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;
const AG = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001";
const PDF = "data:application/pdf;base64,JVBERi0xLjQK";

async function makeJwt(role: string, dealerId: string | null = null) {
  return new SignJWT({
    email: `${role}@x`,
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

function makeSb(rpc?: { data: unknown; error: unknown }) {
  const calls = { rpc: [] as { name: string; args: unknown }[] };
  const from = vi.fn(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      order: vi.fn(() => b),
      limit: vi.fn(() => b),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res, rej),
    };
    return b;
  });
  const rpcFn = vi.fn((name: string, args: unknown) => {
    calls.rpc.push({ name, args });
    return Promise.resolve(rpc ?? { data: null, error: null });
  });
  return { from, rpc: rpcFn, calls };
}

/** Storage stub that records what was uploaded and what was removed again. */
function makeAdmin(uploadError: { message: string } | null = null) {
  const calls = { uploaded: [] as string[], removed: [] as string[][] };
  const storage = {
    from: vi.fn(() => ({
      upload: vi.fn((key: string) => {
        calls.uploaded.push(key);
        return Promise.resolve({ error: uploadError });
      }),
      remove: vi.fn((keys: string[]) => {
        calls.removed.push(keys);
        return Promise.resolve({ error: null });
      }),
    })),
  };
  return { storage, calls, from: makeSb().from, rpc: makeSb().rpc };
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

async function post(path: string, role: string, body: unknown) {
  const jwt = await makeJwt(role);
  return request(
    path,
    { method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: JSON.stringify(body) },
    env,
  );
}

describe("0300 · charging late interest", () => {
  const PATH = `/api/rental/agreements/${AG}/collections/3/interest`;

  it("calls the RPC and NEVER sends a money figure", async () => {
    const sb = makeSb({ data: { interest: 5.52, daysLate: 30 }, error: null });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(PATH, "finance", {});
    expect(res.status).toBe(200);
    expect(sb.calls.rpc).toHaveLength(1);
    expect(sb.calls.rpc[0].name).toBe("rental_charge_late_interest");
    const args = sb.calls.rpc[0].args as Record<string, unknown>;
    expect(args).toEqual({ p_agreement_id: AG, p_seq: 3, p_as_of: null, p_note: null });
    // The penalty is the server's to compute. A client that could name it could
    // name any of it — so there must be no amount-shaped key at all.
    expect(Object.keys(args).some((k) => /amount|interest/.test(k))).toBe(false);
  });

  it("refuses a showroom and a BD — the gate is narrower than internal", async () => {
    for (const role of ["showroom", "bd", "operation"]) {
      const sb = makeSb();
      vi.mocked(userClient).mockReturnValue(sb as never);
      const res = await post(PATH, role, {});
      expect(res.status, role).toBe(403);
      expect(sb.calls.rpc, role).toHaveLength(0);
    }
  });

  it("turns each honest mistake into words, not a 500", async () => {
    for (const [detail, status] of [
      ["not_overdue", 422],
      ["not_owing", 422],
      ["no_interest", 422],
      ["billing_not_found", 404],
      ["forbidden", 403],
    ] as const) {
      const sb = makeSb({ data: null, error: { message: `nope: ${detail}`, details: detail } });
      vi.mocked(userClient).mockReturnValue(sb as never);
      const res = await post(PATH, "finance", {});
      expect(res.status, detail).toBe(status);
      expect(((await res.json()) as { code?: string }).code, detail).toBe(detail);
    }
  });
});

describe("0300 · settling early", () => {
  const PATH = `/api/rental/agreements/${AG}/settle`;

  it("stores the document under a SERVER-generated key, then settles", async () => {
    const sb = makeSb({ data: { monthsSettled: 83, total: 5732.52 }, error: null });
    const admin = makeAdmin();
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);

    const res = await post(PATH, "finance", { amount: 5732.52, documentDataUrl: PDF, reference: "TT-1" });
    expect(res.status).toBe(200);
    expect(admin.calls.uploaded).toHaveLength(1);
    // No client string reaches the path: settlements/<year>/<uuid>.pdf
    expect(admin.calls.uploaded[0]).toMatch(/^settlements\/\d{4}\/[0-9a-f-]{36}\.pdf$/);
    const args = sb.calls.rpc[0].args as Record<string, unknown>;
    expect(sb.calls.rpc[0].name).toBe("rental_settle_agreement");
    expect(args.p_doc_path).toBe(`rental-agreements/${admin.calls.uploaded[0]}`);
    expect(args.p_amount).toBe(5732.52);
    expect(args.p_reference).toBe("TT-1");
  });

  it("removes the document again when the settlement is refused", async () => {
    // Otherwise a rejected settlement quietly litters an evidence bucket that
    // has no delete policy and cannot be cleaned out through the app.
    const sb = makeSb({
      data: null,
      error: { message: "Settlement must be the full remaining amount of 5732.52, got 5000", details: "amount_mismatch" },
    });
    const admin = makeAdmin();
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);

    const res = await post(PATH, "finance", { amount: 5000, documentDataUrl: PDF });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; message?: string };
    expect(body.code).toBe("amount_mismatch");
    // The real figure has to reach the operator — that is the point of refusing.
    expect(body.message).toContain("5732.52");
    expect(admin.calls.removed).toHaveLength(1);
    expect(admin.calls.removed[0]).toEqual([admin.calls.uploaded[0]]);
  });

  it("refuses anything that is not a pdf/png/jpeg data URL, before touching storage", async () => {
    const sb = makeSb();
    const admin = makeAdmin();
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const res = await post(PATH, "finance", { amount: 10, documentDataUrl: "https://evil.test/x.pdf" });
    expect(res.status).toBe(422);
    expect(admin.calls.uploaded).toHaveLength(0);
    expect(sb.calls.rpc).toHaveLength(0);
  });

  it("cannot be settled without a document at all", async () => {
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(adminClient).mockReturnValue(makeAdmin() as never);
    const res = await post(PATH, "finance", { amount: 10 });
    expect(res.status).toBe(422);
    expect(sb.calls.rpc).toHaveLength(0);
  });

  it("is finance/principal only — a BD sells these, a BD does not close them", async () => {
    for (const role of ["bd", "showroom", "operation", "dealer"]) {
      const sb = makeSb();
      vi.mocked(userClient).mockReturnValue(sb as never);
      vi.mocked(adminClient).mockReturnValue(makeAdmin() as never);
      const res = await post(PATH, role, { amount: 10, documentDataUrl: PDF });
      expect(res.status, role).toBe(403);
      expect(sb.calls.rpc, role).toHaveLength(0);
    }
  });

  it("maps every settlement rule to 422 with its code", async () => {
    for (const detail of [
      "agreement_not_active",
      "nothing_to_settle",
      "settlement_doc_required",
      "invalid_settlement_doc_path",
    ]) {
      const sb = makeSb({ data: null, error: { message: detail, details: detail } });
      vi.mocked(userClient).mockReturnValue(sb as never);
      vi.mocked(adminClient).mockReturnValue(makeAdmin() as never);
      const res = await post(PATH, "finance", { amount: 10, documentDataUrl: PDF });
      expect(res.status, detail).toBe(422);
      expect(((await res.json()) as { code?: string }).code, detail).toBe(detail);
    }
  });
});

describe("0300 · the settlement quote", () => {
  it("is read from the server, by any internal role", async () => {
    const sb = makeSb({ data: { total: 5732.52, monthsLeft: 83 }, error: null });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await request(
      `/api/rental/agreements/${AG}/settlement-quote`,
      { headers: { authorization: `Bearer ${jwt}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.calls.rpc[0].name).toBe("rental_settlement_quote");
    expect(await res.json()).toEqual({ quote: { total: 5732.52, monthsLeft: 83 } });
  });

  it("is not readable by a store", async () => {
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("dealer", "00000000-0000-0000-0000-0000000000d1");
    const res = await request(
      `/api/rental/agreements/${AG}/settlement-quote`,
      { headers: { authorization: `Bearer ${jwt}` } },
      env,
    );
    expect(res.status).toBe(403);
  });
});
