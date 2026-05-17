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

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));
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

const PARTNER_ID = "11111111-cccc-cccc-cccc-000000000007";
const THREAD_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const THREAD_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PO_ID = "PO-9001";

async function makeJwt(role: string, opts?: { partnerId?: string }) {
  const meta: Record<string, unknown> = { role };
  if (opts?.partnerId !== undefined) meta.partner_id = opts.partnerId;
  return new SignJWT({ email: `${role}@x`, app_metadata: meta })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000007")
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

describe("POST /api/partner/pickups/batch", () => {
  // 2026-05-16 (migration 0117) — doNumber + doFilePath are optional (server
  // auto-generates DO# when omitted). VALID stays maximal for the "all args
  // forwarded" test; per-test minimal bodies cover the auto-DO# path.
  const VALID = {
    poId: PO_ID,
    threadIds: [THREAD_A, THREAD_B],
    doNumber: "DO-5301",
    doFilePath: `${PO_ID}/abc-do.pdf`,
    doNote: "Loading bay 3",
  };

  it("rejects non-partner role with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects operation role with 403", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("accepts request with NO doNumber (server auto-generates per 0117)", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          pickup_event_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          thread_count: 1,
          do_number: "DO-PO-5301-001",
          po_sup_status: "partially_shipped",
        },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          poId: PO_ID,
          threadIds: [THREAD_A],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith(
      "partner_pickup_threads",
      expect.objectContaining({ p_do_number: null, p_do_file_path: null }),
    );
  });

  it("returns 422 when doNumber present but < 3 chars (still validated when supplied)", async () => {
    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, doNumber: "DO" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when threadIds is empty", async () => {
    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, threadIds: [] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects extra `signed` field per zod strict mode (was a required literal pre-0117)", async () => {
    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, signed: true }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("calls partner_pickup_threads RPC with 5 args and returns 200", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          pickup_event_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          thread_count: 2,
          do_number: "DO-5301",
          po_sup_status: "partially_shipped",
        },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("partner_pickup_threads", {
      p_po_id: PO_ID,
      p_thread_ids: [THREAD_A, THREAD_B],
      p_do_number: "DO-5301",
      p_do_file_path: `${PO_ID}/abc-do.pdf`,
      p_do_note: "Loading bay 3",
    });
    const body = (await res.json()) as {
      pickup_event_id: string;
      thread_count: number;
      do_number: string;
      po_sup_status: string;
    };
    expect(body.thread_count).toBe(2);
    expect(body.po_sup_status).toBe("partially_shipped");
  });

  it("passes p_do_note as null when omitted", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          pickup_event_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          thread_count: 1,
          po_sup_status: "partially_shipped",
        },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const body = { ...VALID } as Partial<typeof VALID>;
    delete body.doNote;
    await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(sb.rpc).toHaveBeenCalledWith(
      "partner_pickup_threads",
      expect.objectContaining({ p_do_note: null }),
    );
  });

  it("forwards 403 when RPC returns PG 42501 (cross-tenant)", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "partner not assigned to this PO" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("forwards 422 when RPC returns PG 22023 (wrong state)", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "22023",
          message: "thread is not in ready_for_pickup state",
          details: "wrong_state",
        },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});
