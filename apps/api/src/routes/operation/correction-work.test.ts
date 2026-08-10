/**
 * STAGE 3 · card 3.4 — the correction-work door's NEGATIVE CONTROLS.
 *
 * The card's first negative control is absolute:
 *
 *   ✗ NEVER writes purchase_orders, po_receipts, invoices, payments, or a
 *     delivery record. `LINEAGE IS NOT PERMISSION.`
 *
 * That is a property of THIS layer — the database cannot stop a route from
 * issuing an extra write, so the route's supabase client is a mock that THROWS
 * on any table it is not allowed to touch. If a future edit adds a
 * `.from("purchase_orders").update(...)` anywhere in this router, these tests
 * fail with that table's name in the message.
 *
 * The close-by-raiser rule is enforced in SQL (0332) and proven against the
 * live database in the card's evidence; what the door owes is that its refusal
 * reaches the screen as the RULE, not as a login problem.
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

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
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

/** Every table this router is allowed to read. Anything else throws by name. */
const ALLOWED_TABLES = new Set(["sales_order_correction_work"]);

function makeSb(
  rows: unknown,
  touched: string[],
  rpcResult: { data: unknown; error: unknown } = { data: { id: "w1", state: "closed" }, error: null },
) {
  const builder = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      order: vi.fn(() => b),
      limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
      insert: vi.fn(() => {
        throw new Error("the correction-work door writes no table");
      }),
      update: vi.fn(() => {
        throw new Error("the correction-work door writes no table");
      }),
      delete: vi.fn(() => {
        throw new Error("the correction-work door writes no table");
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return b;
  };
  return {
    from: vi.fn((t: string) => {
      touched.push(t);
      if (!ALLOWED_TABLES.has(t)) {
        throw new Error(`LINEAGE IS NOT PERMISSION — this door must not touch ${t}`);
      }
      return builder();
    }),
    rpc: vi.fn(() => Promise.resolve(rpcResult)),
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

const BASE = "http://t/api/operation/correction-work";
const WORK_ID = "00000000-0000-0000-0000-0000000000w1".replace("w", "a");

const ROW = {
  id: WORK_ID,
  order_id: "00000000-0000-0000-0000-0000000000d1",
  revision: 2,
  module: "purchasing",
  consequence: "purchase_orders",
  fields_changed: ["order_lines"],
  classification: "B",
  potentially_affected: { po_id: "PO-2037", state: "open" },
  shared: true,
  evidence: "PO PO-2037 covers SO-1206, SO-1216 — POTENTIALLY AFFECTED · SHARED. Never auto-revised.",
  state: "open",
  raised_at: "2026-08-10T03:00:00.000Z",
  closed_at: null,
  closed_note: null,
  orders: { so: 1206, customer_name: "Tan" },
};

async function call(
  path: string,
  role: string,
  body?: unknown,
  rpcResult?: { data: unknown; error: unknown },
) {
  const touched: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(makeSb([ROW], touched, rpcResult) as any);
  const jwt = await makeJwt(role);
  const res = await app.fetch(
    new Request(`${BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
  return { res, touched };
}

describe("STAGE 3 · 3.4 — the door reads work and touches nothing downstream", () => {
  it("lists a module's open work from ONE table", async () => {
    const { res, touched } = await call("?module=purchasing&state=open", "operation");
    expect(res.status).toBe(200);
    expect(touched).toEqual(["sales_order_correction_work"]);
    const body = (await res.json()) as { work: unknown[] };
    expect(body.work).toHaveLength(1);
  });

  it("lists one order's work from the same one table", async () => {
    const { res, touched } = await call(`/order/${ROW.order_id}`, "operation");
    expect(res.status).toBe(200);
    expect(touched).toEqual(["sales_order_correction_work"]);
  });

  it("closing goes through the RPC and touches NO table at all", async () => {
    const { res, touched } = await call(`/${WORK_ID}/close`, "operation", { note: "checked" });
    expect(res.status).toBe(200);
    /* The strongest form of the negative control: not "it did not write
     * purchase_orders" but "it opened no table whatsoever". */
    expect(touched).toEqual([]);
  });

  it("refuses an unknown module name rather than filtering on it", async () => {
    const { res } = await call("?module=warehouse", "operation");
    expect(res.status).toBe(422);
  });

  it("is not open to a dealer, a supplier or a partner", async () => {
    for (const role of ["dealer", "supplier", "partner"]) {
      const { res } = await call("?module=purchasing", role);
      expect(res.status).toBe(403);
    }
  });
});

describe("STAGE 3 · 3.4 — the raiser's refusal reaches the screen as the RULE", () => {
  it("turns 0332's closed_by_raiser into a 403 carrying its own sentence", async () => {
    const { res } = await call(`/${WORK_ID}/close`, "operation", {}, {
      data: null,
      error: {
        code: "42501",
        details: "closed_by_raiser",
        message:
          "This correction work is closed by the module that receives it, not the one that raised it",
      },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("closed_by_raiser");
    /* Not "Forbidden". The operator must learn that someone else has to look. */
    expect(body.message).toMatch(/not the one that raised it/);
  });
});
