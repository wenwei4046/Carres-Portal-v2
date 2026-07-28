/**
 * C8 — POST /api/operation/orders/:id/delay-decision.
 *
 * The gate before the customer (`docs/ORDERS-WORKING-FLOW.md` §3). A supplier
 * naming a later date is not yet a delay; Operations answers one question and
 * only the answer NO opens the call to logistics. **The customer is the last to
 * know, and only when we have tried and failed.**
 *
 * The two things these tests hold that the card would not let a build chat
 * soften: the supplier date is VALIDATED rather than trusted (a decision names
 * the thing it was made about — S4's rule), and **nothing in this route can
 * touch the promised date**, which is asserted by the route never opening the
 * `orders` table at all.
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

const ORDER_ID = "00000000-0000-0000-0000-0000000001c8";
const URL = `http://t/api/operation/orders/${ORDER_ID}/delay-decision`;
const ETA = "2026-08-30";

type Result = { data: unknown; error: unknown };

/** `ops_order_control` answers the pre-read, then the upsert's own `.select()`. */
function controlMock(read: Result) {
  const upsert = vi.fn(() => b);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    upsert,
    maybeSingle: vi.fn().mockResolvedValue(read),
    single: vi.fn().mockResolvedValue({ data: { order_id: ORDER_ID }, error: null }),
  };
  return b;
}

function makeSb(control: ReturnType<typeof controlMock>) {
  const from = vi.fn((t: string) => {
    if (t !== "ops_order_control") throw new Error(`unmocked table ${t}`);
    return control;
  });
  return {
    from,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

function post(jwt: string | null, body: unknown) {
  return app.fetch(
    new Request(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    env,
  );
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

describe("POST /:id/delay-decision", () => {
  it("records the decision, its supplier date, and who decided", async () => {
    const control = controlMock({
      data: { stock_eta: null, line_etas: { "mattress:MAT-1": ETA } },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(makeSb(control) as never);

    const res = await post(await makeJwt("operation"), {
      decision: "new_date",
      supplierEta: ETA,
    });
    expect(res.status).toBe(200);
    const written = control.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(written.delay_decision).toBe("new_date");
    expect(written.delay_decision_eta).toBe(ETA);
    expect(written.delay_decision_by).toBe("u1");
    expect(written.delay_decision_at).toEqual(expect.any(String));
  });

  it("NEVER touches the promised date — it never opens `orders` at all", async () => {
    // §3 stage 3 / the card's first invariant: `orders.delivery_date` stays at
    // what was sold, so `set_order_date` cannot be reached from this flow even
    // by accident. The proof is structural: the only table this route reads or
    // writes is the overlay, and the mock throws on anything else.
    const control = controlMock({ data: { stock_eta: ETA, line_etas: null }, error: null });
    const sb = makeSb(control);
    vi.mocked(userClient).mockReturnValue(sb as never);

    await post(await makeJwt("operation"), { decision: "keep", supplierEta: ETA });
    expect(new Set(sb.from.mock.calls.map((c) => c[0]))).toEqual(
      new Set(["ops_order_control"]),
    );
    expect(sb.rpc.mock.calls.map((c) => c[0])).toEqual(["operation_add_annotation"]);
  });

  it("REFUSES a supplier date this order does not hold", async () => {
    const control = controlMock({
      data: { stock_eta: null, line_etas: { "mattress:MAT-1": ETA } },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(makeSb(control) as never);

    const res = await post(await makeJwt("operation"), {
      decision: "keep",
      supplierEta: "2026-09-15",
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("delay_eta_unknown");
    // The error names the fix (COPY-STANDARD's error pattern), and it names the
    // dates the order really holds.
    expect(body.message).toContain(ETA);
    expect(control.upsert).not.toHaveBeenCalled();
  });

  it("says what to do first when no supplier has given a date at all", async () => {
    const control = controlMock({ data: { stock_eta: null, line_etas: null }, error: null });
    vi.mocked(userClient).mockReturnValue(makeSb(control) as never);

    const res = await post(await makeJwt("operation"), {
      decision: "keep",
      supplierEta: ETA,
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain(
      "Record the ready date first",
    );
  });

  it("refuses a third answer — the engine has no branch for one", async () => {
    const control = controlMock({ data: { stock_eta: ETA, line_etas: null }, error: null });
    vi.mocked(userClient).mockReturnValue(makeSb(control) as never);

    const res = await post(await makeJwt("operation"), {
      decision: "maybe",
      supplierEta: ETA,
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_input");
  });

  it("writes the decision into the order's own history, in plain words", async () => {
    const control = controlMock({ data: { stock_eta: ETA, line_etas: null }, error: null });
    const sb = makeSb(control);
    vi.mocked(userClient).mockReturnValue(sb as never);

    await post(await makeJwt("operation"), {
      decision: "keep",
      supplierEta: ETA,
      note: "covered from ready stock",
    });
    const [, args] = sb.rpc.mock.calls[0] as [string, { p_content: string }];
    expect(args.p_content).toContain("Delay planning");
    expect(args.p_content).toContain("we can still make the promised date");
    expect(args.p_content).toContain("covered from ready stock");
  });

  it("is operation/principal only", async () => {
    vi.mocked(userClient).mockReturnValue(
      makeSb(controlMock({ data: { stock_eta: ETA, line_etas: null }, error: null })) as never,
    );
    const res = await post(await makeJwt("dealer"), {
      decision: "keep",
      supplierEta: ETA,
    });
    expect(res.status).toBe(403);
  });
});
