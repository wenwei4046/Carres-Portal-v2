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
    .setSubject("11111111-1111-1111-1111-000000000006")
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

describe("GET /api/supplier/activity", () => {
  it("returns the 6 most recent po_history rows (RLS-scoped)", async () => {
    const limitFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: "h1",
          po_id: "PO-2050",
          text: "Acknowledged · production scheduled",
          by_role: "supplier",
          occurred_at: "2026-05-09T01:00:00Z",
        },
        {
          id: "h2",
          po_id: "PO-2049",
          text: "Production started",
          by_role: "supplier",
          occurred_at: "2026-05-08T22:00:00Z",
        },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: limitFn }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/activity", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("po_history");
    expect(limitFn).toHaveBeenCalledWith(6);
    const rows = (await res.json()) as Array<{ po_id: string }>;
    expect(rows.length).toBe(2);
    expect(rows[0]?.po_id).toBe("PO-2050");
  });

  it("honors ?limit= param when within bounds", async () => {
    const limitFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: limitFn }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    await app.fetch(
      new Request("http://t/api/supplier/activity?limit=20", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(limitFn).toHaveBeenCalledWith(20);
  });

  it("clamps ?limit= to MAX_LIMIT (30)", async () => {
    const limitFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: limitFn }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    await app.fetch(
      new Request("http://t/api/supplier/activity?limit=999", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(limitFn).toHaveBeenCalledWith(30);
  });

  it("falls back to default 6 on garbage limit value", async () => {
    const limitFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: limitFn }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    await app.fetch(
      new Request("http://t/api/supplier/activity?limit=garbage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(limitFn).toHaveBeenCalledWith(6);
  });

  it("rejects non-supplier roles with 403", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/supplier/activity", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
