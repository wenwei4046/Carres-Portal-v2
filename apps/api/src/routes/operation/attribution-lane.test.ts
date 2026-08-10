/**
 * STAGE 3 · card 3.3 — the attribution lane's NEGATIVE CONTROLS, at the door.
 *
 * The card names four things that must NOT happen. Three of them are enforced
 * inside the RPC (0329) and are proven against the live database in the card's
 * evidence; the fourth — "no `update orders set …` from a payload" — is a
 * property of THIS layer, because the API is where a payload could be spread.
 *
 * So this file asserts what only the door can assert:
 *   · the three verbs are three separate routes — one cannot perform another,
 *   · SUBMIT forwards a CLOSED field set: anything outside the four attribution
 *     fields is refused HERE, before the database is asked,
 *   · the SAVE door no longer accepts an attribution field at all (0329 made
 *     the RPC raise; a schema that still accepted one would turn a designed
 *     refusal into a 500),
 *   · HR reaches the approver lane, and reaches ONLY it. GATE 3 gives HR the
 *     right to approve a salesperson move; HR must not gain SUBMIT or APPLY.
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

type RpcCall = { name: string; args: Record<string, unknown> };

/** Records every RPC the route made — the assertions are about WHICH function
 *  was called with WHAT, which is exactly what a payload spread would leak. */
function makeSb(result: { data: unknown; error: unknown }, calls: RpcCall[]) {
  return {
    from: vi.fn(() => {
      throw new Error("the attribution lane must not touch a table directly");
    }),
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve(result);
    }),
  };
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

const ORDER_ID = "00000000-0000-0000-0000-0000000000d1";
const REQ_ID = "00000000-0000-0000-0000-0000000000e1";
const SP_ID = "00000000-0000-0000-0000-0000000000a1";
const BASE = "http://t/api/operation/orders";

async function call(
  path: string,
  role: string,
  body?: unknown,
  rpcResult: { data: unknown; error: unknown } = { data: { ok: true }, error: null },
) {
  const calls: RpcCall[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(makeSb(rpcResult, calls) as any);
  const jwt = await makeJwt(role);
  const res = await app.fetch(
    new Request(`${BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
  return { res, calls };
}

const GOOD_SUBMIT = { changes: { salesperson_id: SP_ID }, reason: "Wrong person credited" };

describe("STAGE 3 · 3.3 — SUBMIT writes a request, never the order", () => {
  it("forwards to sales_order_submit_attribution and to nothing else", async () => {
    const { res, calls } = await call(`/${ORDER_ID}/attribution`, "operation", GOOD_SUBMIT);
    expect(res.status).toBe(201);
    expect(calls.map((c) => c.name)).toEqual(["sales_order_submit_attribution"]);
    /* The order-moving verb is not reachable from this door, by construction. */
    expect(calls.map((c) => c.name)).not.toContain("sales_order_apply_attribution");
  });

  it("refuses a field outside the four attribution fields, before the database", async () => {
    const { res, calls } = await call(`/${ORDER_ID}/attribution`, "operation", {
      changes: { salesperson_id: SP_ID, customer_phone: "0123" },
      reason: "sneak a Class B field in",
    });
    expect(res.status).toBe(422);
    /* The point of the assertion: the database was never asked. A closed
     * schema is what stops an unclassified field riding an approved lane. */
    expect(calls).toHaveLength(0);
  });

  it("refuses an empty change set and a missing reason", async () => {
    const empty = await call(`/${ORDER_ID}/attribution`, "operation", { changes: {}, reason: "x" });
    expect(empty.res.status).toBe(422);
    const noReason = await call(`/${ORDER_ID}/attribution`, "operation", {
      changes: { salesperson_id: SP_ID },
      reason: "   ",
    });
    expect(noReason.res.status).toBe(422);
  });

  it("is not open to a dealer login", async () => {
    const { res } = await call(`/${ORDER_ID}/attribution`, "dealer", GOOD_SUBMIT);
    expect(res.status).toBe(403);
  });
});

describe("STAGE 3 · 3.3 — APPROVE and APPLY are two doors, never one", () => {
  it("decide calls the decision RPC only", async () => {
    const { res, calls } = await call(`/attribution/${REQ_ID}/decide`, "operation", {
      decision: "approved",
    });
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.name)).toEqual(["sales_order_decide_attribution"]);
    expect(calls[0]!.args).toMatchObject({ p_request_id: REQ_ID, p_decision: "approved" });
  });

  it("apply calls the apply RPC only, and carries nothing but the request id", async () => {
    const { res, calls } = await call(`/attribution/${REQ_ID}/apply`, "operation", {});
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.name)).toEqual(["sales_order_apply_attribution"]);
    /* No payload reaches APPLY — the order's new values come from the stored
     * request, so there is nothing here for a caller to spread over columns. */
    expect(Object.keys(calls[0]!.args)).toEqual(["p_request_id"]);
  });

  it("refuses a decision word that is neither approved nor rejected", async () => {
    const { res, calls } = await call(`/attribution/${REQ_ID}/decide`, "operation", {
      decision: "applied",
    });
    expect(res.status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it("surfaces a floor refusal with the floor's OWN sentence, not a generic error", async () => {
    const { res } = await call(`/attribution/${REQ_ID}/apply`, "operation", {}, {
      data: null,
      error: {
        code: "22023",
        details: "floor_blocked",
        message: "Reopen the run before changing who gets credit for it.",
      },
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("floor_blocked");
    expect(body.message).toBe("Reopen the run before changing who gets credit for it.");
  });
});

describe("STAGE 3 · 3.3 — GATE 3's approver reaches the lane, and only the lane", () => {
  it("HR may read the live request and decide it", async () => {
    const read = await call(`/${ORDER_ID}/attribution`, "hr");
    expect(read.res.status).toBe(200);
    expect(read.calls.map((c) => c.name)).toEqual(["sales_order_attribution_live"]);

    const decide = await call(`/attribution/${REQ_ID}/decide`, "hr", { decision: "approved" });
    expect(decide.res.status).toBe(200);
  });

  it("HR may NOT submit and may NOT apply — approving is not operating", async () => {
    const submit = await call(`/${ORDER_ID}/attribution`, "hr", GOOD_SUBMIT);
    expect(submit.res.status).toBe(403);
    const apply = await call(`/attribution/${REQ_ID}/apply`, "hr", {});
    expect(apply.res.status).toBe(403);
  });

  it("a supplier login reaches none of it", async () => {
    for (const [path, body] of [
      [`/${ORDER_ID}/attribution`, undefined],
      [`/${ORDER_ID}/attribution`, GOOD_SUBMIT],
      [`/attribution/${REQ_ID}/decide`, { decision: "approved" }],
      [`/attribution/${REQ_ID}/apply`, {}],
    ] as const) {
      const { res } = await call(path, "supplier", body);
      expect(res.status).toBe(403);
    }
  });
});

describe("STAGE 3 · 3.3 — the SAVE door lost the attribution fields", () => {
  /* 0329 made `sales_order_save_revision` RAISE on a header carrying one. A
   * schema that still accepted the field would forward it and turn a designed
   * refusal into a database error — so the refusal has to live here too. */
  for (const field of ["salesperson_id", "outlet_id", "dealer_id", "channel"] as const) {
    it(`refuses a save carrying ${field}, without asking the database`, async () => {
      const { res, calls } = await call(`/${ORDER_ID}/save`, "operation", {
        header: { customer_name: "Tan Ah Kow", [field]: SP_ID },
      });
      expect(res.status).toBe(422);
      expect(calls).toHaveLength(0);
    });
  }

  it("still saves an ordinary Class B correction", async () => {
    const { res, calls } = await call(
      `/${ORDER_ID}/save`,
      "operation",
      { header: { customer_phone: "0123456789" } },
      { data: { revision: 4, changed: ["customer_phone"] }, error: null },
    );
    expect(res.status).toBe(201);
    expect(calls.map((c) => c.name)).toEqual(["sales_order_save_revision"]);
  });
});

describe("STAGE 3 · 3.5 — the amendment spine, and the wall past it", () => {
  it("SUBMIT forwards a proposal and touches no other RPC", async () => {
    const { res, calls } = await call(`/${ORDER_ID}/amendment`, "operation", {
      proposed: { lines: [{ sku: "B1201S-K", qty: 3, unit_price: 2499 }] },
      reason: "Customer wants one more",
    });
    expect(res.status).toBe(201);
    expect(calls.map((c) => c.name)).toEqual(["sales_order_submit_amendment"]);
  });

  it("refuses a proposal carrying a CLASS B field — corrections are not amendments", async () => {
    const { res, calls } = await call(`/${ORDER_ID}/amendment`, "operation", {
      proposed: { customer_phone: "0123" },
      reason: "wrong lane",
    });
    expect(res.status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it("APPLY exists, and can only ever refuse — that refusal IS the deliverable", async () => {
    const { res } = await call(`/amendment/${REQ_ID}/apply`, "operation", {}, {
      data: null,
      error: {
        code: "22023",
        details: "accept_not_built",
        message: "Class A amendment cannot be applied - ACCEPT is not built yet",
      },
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("accept_not_built");
    expect(body.message).toMatch(/ACCEPT is not built yet/);
  });

  it("has NO issue door and NO accept door at all", async () => {
    for (const path of [`/amendment/${REQ_ID}/issue`, `/amendment/${REQ_ID}/accept`]) {
      const { res } = await call(path, "operation", {});
      /* 404 is the assertion: the route does not exist. A 403 or a 422 would
       * mean someone built the door and then guarded it. */
      expect(res.status).toBe(404);
    }
  });
});

describe("WITHDRAW — the door back out of approved", () => {
  it("forwards to the withdraw RPC and nothing else, carrying the reason", async () => {
    const { res, calls } = await call(`/attribution/${REQ_ID}/withdraw`, "principal", {
      reason: "approved by mistake",
    });
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.name)).toEqual(["sales_order_withdraw_attribution"]);
    expect(calls[0]!.args).toMatchObject({
      p_request_id: REQ_ID,
      p_reason: "approved by mistake",
    });
    /* It must not be able to perform the verb it undoes. */
    expect(calls.map((c) => c.name)).not.toContain("sales_order_apply_attribution");
  });

  it("refuses an empty reason before the database is asked — SUBMIT's rule", async () => {
    for (const body of [{}, { reason: "" }, { reason: "   " }]) {
      const { res, calls } = await call(`/attribution/${REQ_ID}/withdraw`, "principal", body);
      expect(res.status).toBe(422);
      expect(calls).toHaveLength(0);
    }
  });

  it("admits HR — the bar to take back is never higher than the bar to grant", async () => {
    const { res, calls } = await call(`/attribution/${REQ_ID}/withdraw`, "hr", { reason: "x" });
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.name)).toEqual(["sales_order_withdraw_attribution"]);
  });

  it("surfaces GATE 3's refusal as the RULE, naming the lane", async () => {
    const { res } = await call(`/attribution/${REQ_ID}/withdraw`, "hr", { reason: "x" }, {
      data: null,
      error: {
        code: "42501",
        details: "approver_principal_only",
        message: "Dealer/channel attribution is approved by the principal only",
      },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("approver_principal_only");
    expect(body.message).toMatch(/principal only/);
  });

  it("is not open to a dealer or a supplier", async () => {
    for (const role of ["dealer", "supplier"]) {
      const { res } = await call(`/attribution/${REQ_ID}/withdraw`, role, { reason: "x" });
      expect(res.status).toBe(403);
    }
  });

  it("there is NO second verb for this transition — /revoke does not exist", async () => {
    /* One state change, one verb name. A `revoke` door would be a fork the
     * ruling forbids by name. */
    const { res } = await call(`/attribution/${REQ_ID}/revoke`, "principal", { reason: "x" });
    expect(res.status).toBe(404);
  });
});
