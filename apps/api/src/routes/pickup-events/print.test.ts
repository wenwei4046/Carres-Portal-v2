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

const EVENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000010")
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

describe("GET /api/pickup-events/:id/print", () => {
  it("returns 422 when id is not a uuid", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/pickup-events/not-a-uuid/print`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_param");
  });

  it("rejects dealer role with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/pickup-events/${EVENT_ID}/print`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects bd role with 403", async () => {
    const jwt = await makeJwt("bd");
    const res = await app.fetch(
      new Request(`http://t/api/pickup-events/${EVENT_ID}/print`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it.each(["supplier", "partner", "logistics", "principal"] as const)(
    "200 — %s gets RPC payload",
    async (role) => {
      const payload = {
        event: {
          id: EVENT_ID,
          do_number: "DO-1001",
          pickup_at: "2026-05-15T03:00:00Z",
        },
        supplier: { name: "Acme Furniture Sdn Bhd", contact: "+60 3-1234 5678" },
        partner: { name: "Nets Sdn Bhd" },
        warehouse: { name: "Carres Klang", address: "1 Persiaran Test, Klang" },
        lines: [
          { sku: "MAT-K-001", variant: "King Mattress 200x200", qty: 2 },
        ],
      };
      const sb = {
        rpc: vi.fn().mockResolvedValue({ data: payload, error: null }),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(userClient).mockReturnValue(sb as any);

      const jwt = await makeJwt(role);
      const res = await app.fetch(
        new Request(`http://t/api/pickup-events/${EVENT_ID}/print`, {
          method: "GET",
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(200);
      expect(sb.rpc).toHaveBeenCalledWith("pickup_event_render_payload", {
        p_event_id: EVENT_ID,
      });
      const json = (await res.json()) as typeof payload;
      expect(json).toEqual(payload);
    },
  );

  it("maps PG 42501 (cross-tenant) to 403", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "forbidden" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/pickup-events/${EVENT_ID}/print`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
