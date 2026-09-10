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

const PRINCIPAL = "00000000-0000-0000-0000-0000000000p1";
const SELLER = "00000000-0000-0000-0000-0000000000s1";

/**
 * THE ACTIVITY RAIL NAMES EVERY INTERNAL ACTOR
 * (CARD-2026-08-27-activity-rail-names-internal-actors, built 2026-09-01).
 *
 * THE DEFECT. This route read `app_users` straight, under the caller's own
 * JWT. Migration `0235`'s peers policy shows an OPERATION login only
 * operation-role rows, so every act by a principal, Finance, HR or Warehouse
 * arrived unnamed — and because the rail's Person filter and its search box are
 * both built from these names, that whole class of activity was also
 * unfilterable and unfindable.
 *
 * ⚠️ WHY NOBODY CAUGHT IT: a PRINCIPAL reader could always see those names
 * (`0002` `app_users_self_read` via `is_principal()`), so the bug is invisible
 * from the account most likely to be doing the walking. The card says to walk
 * the rail as an operation account for exactly that reason.
 *
 * ⛔ AND THE FIX IS NOT A BARE `actor_display_names` CALL. That door returns
 * internal staff only, by design. `0211`'s triggers stamp a salesperson's id
 * straight into this feed, and a principal reader can name those people today —
 * so swapping the door in ALONE would have fixed one reader by breaking the
 * other. Both halves are pinned below.
 */
describe("GET /api/operation/activity — who acted, named", () => {
  function sbWith(opts: { staff?: Array<{ id: string; name: string }>; sellers?: Array<{ user_id: string; name: string }> }) {
    const rpc = vi.fn(async (fn: string) =>
      fn === "actor_display_names" ? { data: opts.staff ?? [], error: null } : { data: null, error: null },
    );
    const appUsers = vi.fn();
    return {
      sb: {
        from: vi.fn((table: string) => {
          if (table === "app_users") appUsers();
          const chain: Record<string, unknown> = {};
          const rows =
            table === "ops_activity_log"
              ? [{ id: "a1", order_id: "o1", action: "revised", detail: null, actor_id: PRINCIPAL, occurred_at: "2026-09-01T02:00:00Z", orders: { so: 1400, customer_name: "Tan" } }]
              : table === "order_annotations"
                ? [{ id: "n1", order_id: "o1", content: "rang the customer", tag: null, created_by: SELLER, created_at: "2026-09-01T01:00:00Z", orders: { so: 1400, customer_name: "Tan" } }]
                : table === "salespersons"
                  ? (opts.sellers ?? [])
                  : [];
          chain.select = vi.fn(() => chain);
          chain.order = vi.fn(() => chain);
          chain.limit = vi.fn(async () => ({ data: rows, error: null }));
          chain.in = vi.fn(async () => ({ data: rows, error: null }));
          return chain;
        }),
        rpc,
      },
      rpc,
      appUsers,
    };
  }

  async function read(opts: Parameters<typeof sbWith>[0], role = "operation") {
    const m = sbWith(opts);
    vi.mocked(userClient).mockReturnValue(m.sb as never);
    const res = await app.fetch(
      new Request("http://t/api/operation/activity", {
        headers: { Authorization: `Bearer ${await makeJwt(role)}` },
      }),
      env,
    );
    return { res, rows: (await res.json()) as Array<{ actor_name: string | null }>, ...m };
  }

  it("names a PRINCIPAL actor to an operation reader — the defect itself", async () => {
    const { res, rows } = await read({ staff: [{ id: PRINCIPAL, name: "Jess" }] });
    expect(res.status).toBe(200);
    expect(rows.map((r) => r.actor_name)).toContain("Jess");
  });

  it("still names a SALESPERSON actor, whom the staff door deliberately never returns", async () => {
    /* The regression this fix could have shipped: `0211` stamps a
       salesperson's id into this feed, and a principal reader names them
       today. The door answers internal staff only, so the second source is
       what keeps them named. */
    const { rows } = await read({
      staff: [{ id: PRINCIPAL, name: "Jess" }],
      sellers: [{ user_id: SELLER, name: "Shasha" }],
    });
    expect(rows.map((r) => r.actor_name)).toContain("Shasha");
  });

  it("asks the governed door, never app_users", async () => {
    const { rpc, appUsers } = await read({ staff: [{ id: PRINCIPAL, name: "Jess" }] });
    expect(rpc.mock.calls.map((c) => c[0])).toContain("actor_display_names");
    expect(appUsers, "the plain read is gone").not.toHaveBeenCalled();
  });

  it("leaves an unresolved actor unnamed rather than inventing one", async () => {
    const { rows } = await read({});
    expect(rows.every((r) => r.actor_name == null)).toBe(true);
  });
});
