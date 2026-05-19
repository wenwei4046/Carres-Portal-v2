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
import type { AutocountImportResponse } from "@carres/shared";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-import";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};
const DEALER_HOUSE = "00000000-0000-0000-0000-0000000000d1";

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: "ops@carres.com", app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000777")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type RpcReply = { data: unknown; error: unknown };
function buildSb(reply: (payload: any) => RpcReply) {
  const calls: Array<{ name: string; payload: any }> = [];
  const sb = {
    rpc: async (name: string, args: { payload: any }) => {
      calls.push({ name, payload: args.payload });
      return reply(args.payload);
    },
    _calls: calls,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as any;
}

const row = (over: Record<string, unknown> = {}) => ({
  ref: "CR0418",
  itemGroup: "Mattress",
  qty: 1,
  detailDescription: "Breeze FirmCare-B1201F-K",
  poDocNo: "PO/2604-006",
  debtorName: "Felix Koh",
  phone: "012-6399285",
  addr1: "18 Jalan Cempaka",
  deliveryLocation: "Muar, Johor",
  balance: "RM3322 Paid",
  ...over,
});

function okReply(result = "created") {
  return (payload: any): RpcReply => ({
    data: {
      id: "00000000-0000-0000-0000-0000000000a1",
      so: 1251,
      source_ref: payload.source_ref,
      result,
    },
    error: null,
  });
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

async function post(jwt: string | null, body: unknown) {
  return app.fetch(
    new Request("http://t/api/orders/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    env,
  );
}

describe("POST /api/orders/import", () => {
  it("401 without Authorization", async () => {
    const res = await post(null, { dealerId: DEALER_HOUSE, rows: [row()] });
    expect(res.status).toBe(401);
  });

  it("403 for a non-operation/principal role", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb(okReply()));
    const jwt = await makeJwt("dealer");
    const res = await post(jwt, { dealerId: DEALER_HOUSE, rows: [row()] });
    expect(res.status).toBe(403);
  });

  it("400 on invalid body", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb(okReply()));
    const jwt = await makeJwt("operation");
    const res = await post(jwt, { dealerId: "not-a-uuid", rows: [] });
    expect(res.status).toBe(400);
  });

  it("groups rows sharing a Ref into one order; calls RPC once", async () => {
    const sb = buildSb(okReply("created"));
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [
        row({ detailDescription: "Breeze FirmCare-B1201F-K", itemGroup: "Mattress" }),
        row({ detailDescription: "Essential Memory Pillow(L)", itemGroup: "Pillow", qty: 2 }),
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.ordersTotal).toBe(1);
    expect(body.created).toBe(1);
    expect(sb._calls).toHaveLength(1);
    expect(sb._calls[0].name).toBe("import_autocount_order");
    expect(sb._calls[0].payload.source_ref).toEqual(["CR0418"]);
    expect(sb._calls[0].payload.lines).toHaveLength(2);
    expect(sb._calls[0].payload.channel).toBe("showroom"); // CR prefix
  });

  it("splits a combined Ref into a sorted unique source_ref array", async () => {
    const sb = buildSb(okReply());
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [row({ ref: "TCF0282/CR1009" })],
    });
    expect(res.status).toBe(200);
    expect(sb._calls[0].payload.source_ref).toEqual(["CR1009", "TCF0282"]);
  });

  it("flags unmatched core items in the report (SKU resolver is a pending seam)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb(okReply()));
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [
        row({ itemGroup: "Sofa", detailDescription: "Glano TH5090/30(2 Seater)" }),
        row({ itemGroup: "Service", detailDescription: "Sofa Disposal" }),
      ],
    });
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.results[0].unmatchedDescriptions).toContain("Glano TH5090/30(2 Seater)");
    // Service rows are not core → not flagged
    expect(body.results[0].unmatchedDescriptions).not.toContain("Sofa Disposal");
  });

  it("passes through skipped_locked from the RPC", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb(okReply("skipped_locked")));
    const jwt = await makeJwt("principal");
    const res = await post(jwt, { dealerId: DEALER_HOUSE, rows: [row()] });
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.skippedLocked).toBe(1);
    expect(body.results[0].result).toBe("skipped_locked");
  });

  it("records a per-order error instead of failing the whole batch", async () => {
    const sb = buildSb(() => ({ data: null, error: { message: "boom" } }));
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, { dealerId: DEALER_HOUSE, rows: [row()] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.errored).toBe(1);
    expect(body.results[0].result).toBe("error");
    expect(body.results[0].error).toBe("boom");
  });
});
