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

/**
 * /api/operation/po-duty (migration 0236) + the create-PO duty gate — mirrors
 * the bulk-complete.test.ts harness (real JWT verify via local JWKS,
 * userClient mocked). The sb mock is a per-table thenable chain: .select/.eq/
 * .neq/.in/.like/.gte/.limit return the builder; awaiting it resolves the
 * table's `list` result; .maybeSingle() consumes the table's `single` queue.
 */

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, email?: string, sub = "u1") {
  return new SignJWT({ email: email ?? `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type Result = { data: unknown; error: unknown };
type TableCfg = { list?: Result; single?: Result[] };

function makeSb(tables: Record<string, TableCfg>) {
  const upserts: { table: string; payload: unknown }[] = [];
  const sb = {
    upserts,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from(table: string) {
      const cfg = tables[table] ?? {};
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "eq", "neq", "in", "like", "gte", "limit", "order"])
        builder[m] = vi.fn(chain);
      builder.maybeSingle = vi.fn(() =>
        Promise.resolve(cfg.single?.shift() ?? { data: null, error: null }),
      );
      builder.upsert = vi.fn((payload: unknown) => {
        upserts.push({ table, payload });
        return Promise.resolve({ data: null, error: null });
      });
      builder.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
      builder.then = (
        resolve: (r: Result) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(cfg.list ?? { data: [], error: null }).then(resolve, reject);
      return builder;
    },
  };
  return sb;
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

const HOLDER = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000bb";

function req(path: string, method: string, jwt: string | null, body?: unknown) {
  return app.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: {
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
}

describe("GET /api/operation/po-duty", () => {
  it("401 without Authorization", async () => {
    const res = await req("/api/operation/po-duty", "GET", null);
    expect(res.status).toBe(401);
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await req("/api/operation/po-duty", "GET", jwt);
    expect(res.status).toBe(403);
  });

  it("fails soft to holder:null on a pre-0236 DB (relation missing)", async () => {
    vi.mocked(userClient).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSb({
        ops_po_duty: {
          single: [{ data: null, error: { code: "42P01", message: "missing" } }],
        },
      }) as any,
    );
    const jwt = await makeJwt("operation");
    const res = await req("/api/operation/po-duty", "GET", jwt);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ holder: null });
  });

  it("returns the existing month row enriched with the holder identity", async () => {
    vi.mocked(userClient).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSb({
        ops_po_duty: {
          single: [
            { data: { month: "2026-07", user_id: HOLDER, assigned_by: null }, error: null },
          ],
        },
        app_users: {
          list: {
            data: [{ id: HOLDER, email: "shasha@carres.com", name: "Shasha" }],
            error: null,
          },
        },
      }) as any,
    );
    const jwt = await makeJwt("operation");
    const res = await req("/api/operation/po-duty", "GET", jwt);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      month: string;
      holder: { userId: string; name: string | null };
      roster?: unknown[];
    };
    expect(body.month).toBe("2026-07");
    expect(body.holder).toMatchObject({ userId: HOLDER, name: "Shasha" });
  });

  it("returns the forward roster for the DUTY board", async () => {
    vi.mocked(userClient).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSb({
        ops_po_duty: {
          single: [
            { data: { month: "2026-07", user_id: HOLDER, assigned_by: null }, error: null },
          ],
          list: {
            data: [
              { month: "2026-07", user_id: HOLDER },
              { month: "2026-08", user_id: OTHER },
            ],
            error: null,
          },
        },
        app_users: {
          list: {
            data: [
              { id: HOLDER, email: "shasha@carres.com", name: "Shasha" },
              { id: OTHER, email: "liching@carres.com", name: "Li Ching" },
            ],
            error: null,
          },
        },
      }) as any,
    );
    const jwt = await makeJwt("operation");
    const res = await req("/api/operation/po-duty", "GET", jwt);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      roster: { month: string; name: string | null }[];
    };
    expect(body.roster).toEqual([
      expect.objectContaining({ month: "2026-07", name: "Shasha" }),
      expect.objectContaining({ month: "2026-08", name: "Li Ching" }),
    ]);
  });

  it("lazily fills a missing month from the pool rotation (deterministic)", async () => {
    const sb = makeSb({
      ops_po_duty: {
        // 1st maybeSingle: no row yet · list: empty history ·
        // 2nd maybeSingle: the row we just upserted.
        single: [
          { data: null, error: null },
          { data: { month: "x", user_id: HOLDER, assigned_by: null }, error: null },
        ],
        list: { data: [], error: null },
      },
      ops_staff_settings: { list: { data: [{ user_id: HOLDER }], error: null } },
      app_users: {
        list: { data: [{ id: HOLDER, status: "active" }], error: null },
        single: [
          { data: { id: HOLDER, email: "shasha@carres.com", name: "Shasha" }, error: null },
        ],
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await req("/api/operation/po-duty", "GET", jwt);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { holder: { userId: string } | null };
    expect(body.holder?.userId).toBe(HOLDER);
    expect(sb.upserts.some((u) => u.table === "ops_po_duty")).toBe(true);
  });
});

describe("PUT /api/operation/po-duty", () => {
  it("403 for non-manager operation staff", async () => {
    const jwt = await makeJwt("operation", "shasha@carres.com");
    const res = await req("/api/operation/po-duty", "PUT", jwt, { userId: HOLDER });
    expect(res.status).toBe(403);
  });

  it("403 even for the shared operation@ manager — roster edits are Jess-only", async () => {
    const jwt = await makeJwt("operation", "operation@carres.com");
    const res = await req("/api/operation/po-duty", "PUT", jwt, { userId: HOLDER });
    expect(res.status).toBe(403);
  });

  it("422 on invalid body for a manager", async () => {
    const jwt = await makeJwt("operation", "jess@carres.com");
    const res = await req("/api/operation/po-duty", "PUT", jwt, { userId: "nope" });
    expect(res.status).toBe(422);
  });

  it("200 upsert for jess@ with assigned_by stamped", async () => {
    const sb = makeSb({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation", "jess@carres.com", OTHER);
    const res = await req("/api/operation/po-duty", "PUT", jwt, { userId: HOLDER });
    expect(res.status).toBe(200);
    const up = sb.upserts.find((u) => u.table === "ops_po_duty");
    expect(up?.payload).toMatchObject({ user_id: HOLDER, assigned_by: OTHER });
  });
});

/**
 * ⭐ CARD 4B · SINGLE PO CREATION AUTHORITY (2026-08-11).
 *
 * Four tests here drove the PO-duty gate through `POST /api/operation/pos`.
 * That route is retired and `poDutyGate` went with it — those two create routes
 * were its only callers.
 *
 * The tests are replaced rather than deleted, because the fact they were really
 * asserting still matters and has MOVED: the duty roster no longer decides who
 * may create a Purchase Order, because no browser role may create one outside
 * `purchasing_issue_pos_batch(jsonb)`. The roster's remaining job is the GET/PUT
 * board above, which is untouched and still covered.
 */
describe("the PO duty gate no longer guards a creation route", () => {
  it("POST /api/operation/pos is gone for the duty holder and everyone else", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb({}) as any);
    const holder = await makeJwt("operation", "shasha@carres.com", HOLDER);
    const other = await makeJwt("operation", "liching@carres.com", OTHER);
    const manager = await makeJwt("operation", "jess@carres.com", OTHER);
    for (const jwt of [holder, other, manager]) {
      expect((await req("/api/operation/pos", "POST", jwt, {})).status).toBe(404);
      expect((await req("/api/operation/pos/batch", "POST", jwt, {})).status).toBe(404);
    }
  });

  it("the duty board itself still answers — this was a targeted retirement", async () => {
    vi.mocked(userClient).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSb({
        ops_po_duty: {
          single: [
            { data: { month: "2026-07", user_id: HOLDER, assigned_by: null }, error: null },
          ],
        },
        app_users: {
          single: [{ data: { name: "Shasha", email: "shasha@carres.com" }, error: null }],
        },
      }) as any,
    );
    const jwt = await makeJwt("operation", "liching@carres.com", OTHER);
    const res = await req("/api/operation/po-duty", "GET", jwt);
    expect(res.status).toBe(200);
  });
});
