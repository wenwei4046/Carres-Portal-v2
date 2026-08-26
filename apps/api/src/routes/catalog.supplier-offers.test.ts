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

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

/**
 * ⭐ 0388 — DUAL-SOURCING, THE RECORDING HALF (YH, 2026-08-26).
 *
 * Both Hookkas supply some of the same bedframes; the SKU's single supplier
 * slot meant the second company's own code and prices had nowhere to be
 * written. These routes record one OFFER per (sku, supplier) — and change
 * NOTHING about routing: the slot remains the only thing POs read.
 */
const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@carres.com`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
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

const SKU_ID = "00000000-0000-0000-0000-0000000000b1";
const HKI = "00000000-0000-0000-0000-0000000000c2";

const ROW = {
  supplier_id: HKI,
  supplier_code: "1007-(K)",
  price: 550,
  pwp_price: 495,
  updated_at: "2026-08-26T00:00:00Z",
  suppliers: { name: "Hookka Industries" },
};

function mockSb(opts: {
  rows?: Array<Record<string, unknown>>;
  upserted?: Record<string, unknown> | null;
  records?: Array<{ body: unknown; conflict: string | undefined }>;
  deletes?: Array<Record<string, string>>;
}) {
  vi.mocked(userClient).mockReturnValue({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: opts.rows ?? [], error: null }),
      }),
      upsert: (body: Record<string, unknown>, o?: { onConflict?: string }) => {
        opts.records?.push({ body, conflict: o?.onConflict });
        return {
          select: () => ({
            maybeSingle: async () => ({ data: opts.upserted ?? null, error: null }),
          }),
        };
      },
      delete: () => ({
        eq: (k1: string, v1: string) => ({
          eq: async (k2: string, v2: string) => {
            opts.deletes?.push({ [k1]: v1, [k2]: v2 });
            return { error: null };
          },
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("GET /api/catalog/skus/:id/supplier-offers", () => {
  it("maps rows to camelCase with the joined supplier name", async () => {
    mockSb({ rows: [ROW] });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}/supplier-offers`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { offers: Array<Record<string, unknown>> };
    expect(body.offers).toEqual([
      {
        supplierId: HKI,
        supplierName: "Hookka Industries",
        supplierCode: "1007-(K)",
        price: 550,
        pwpPrice: 495,
        updatedAt: "2026-08-26T00:00:00Z",
      },
    ]);
  });

  it("is internal-only — a dealer gets 403 with no round-trip", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}/supplier-offers`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(vi.mocked(userClient)).not.toHaveBeenCalled();
  });
});

describe("PUT /api/catalog/skus/:id/supplier-offers", () => {
  it("⭐ upserts on (sku_id, supplier_id) — a re-key UPDATES, never stacks", async () => {
    const records: Array<{ body: unknown; conflict: string | undefined }> = [];
    mockSb({ upserted: ROW, records });
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}/supplier-offers`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: HKI,
          supplierCode: "  1007-(K)  ",
          price: 550,
          pwpPrice: 495,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(records[0].conflict).toBe("sku_id,supplier_id");
    expect(records[0].body).toMatchObject({
      sku_id: SKU_ID,
      supplier_id: HKI,
      // Trimmed — a code with stray spaces will not match the quotation.
      supplier_code: "1007-(K)",
      price: 550,
      pwp_price: 495,
    });
  });

  it("stores blank code and absent prices as NULL — not quoted, never zero", async () => {
    const records: Array<{ body: unknown; conflict: string | undefined }> = [];
    mockSb({ upserted: ROW, records });
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}/supplier-offers`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: HKI, supplierCode: "   " }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(records[0].body).toMatchObject({
      supplier_code: null,
      price: null,
      pwp_price: null,
    });
  });

  it("⭐ is PRINCIPAL only — offers carry prices, the 0175/0186 boundary", async () => {
    for (const role of ["operation", "dealer"]) {
      const jwt = await makeJwt(role);
      const res = await app.fetch(
        new Request(`http://t/api/catalog/skus/${SKU_ID}/supplier-offers`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({ supplierId: HKI }),
        }),
        env,
      );
      expect(res.status).toBe(403);
    }
    expect(vi.mocked(userClient)).not.toHaveBeenCalled();
  });

  it("rejects an unknown key rather than dropping it (.strict)", async () => {
    mockSb({ upserted: ROW });
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}/supplier-offers`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: HKI, isDefault: true }),
      }),
      env,
    );
    // `isDefault` is the ROUTING half — deliberately not built (owner
    // write-up 2026-08-25). A caller sending it has misread the scope.
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/catalog/skus/:id/supplier-offers/:supplierId", () => {
  it("removes exactly one (sku, supplier) pair, idempotently", async () => {
    const deletes: Array<Record<string, string>> = [];
    mockSb({ deletes });
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}/supplier-offers/${HKI}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(deletes[0]).toEqual({ sku_id: SKU_ID, supplier_id: HKI });
  });

  it("is principal-only", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}/supplier-offers/${HKI}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
