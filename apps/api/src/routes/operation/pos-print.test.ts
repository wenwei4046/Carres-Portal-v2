import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

// 2026-08-02 — the route stopped assembling a priced payload and became a
// thin door over the money-free `purchasing_po_document` RPC (migration 0307,
// docs/pdf/PO-PDF-STANDARD.md). These tests mock the RPC + the small so_refs
// lookup the route adds beside it.

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";
const PO_ID = "PO-9801";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
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

/** The RPC's happy payload — money-free by construction (0307). */
function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    po_number: PO_ID,
    po_id: PO_ID,
    issue_date: "2026-08-01",
    supplier: { name: "Ohana Furniture Sdn Bhd", address: null, contact: "+60 3-1234 5678" },
    destination: { name: "Carres Klang", address: "Lot 12, Jalan Sungai Keramat, Klang" },
    delivery_instructions: "Call Jess 1 hour before arrival.",
    eta_date: "2026-08-12",
    lines: [
      { sku: "CODY-Q", description: "Queen", qty: 1, unit: "pc", attrs: { color: "Walnut", gap: '14"' } },
      { sku: "JAGER-K", description: "King", qty: 2, unit: "pc", attrs: {} },
    ],
    terms: null,
    ...overrides,
  };
}

function mockRpcAndRefs(opts: {
  document?: Record<string, unknown> | null;
  rpcError?: { code?: string; message?: string; details?: string };
  poRow?: { so: number | null; so_refs: number[] | null } | null;
}) {
  const rpc = vi.fn(() =>
    Promise.resolve(
      opts.rpcError
        ? { data: null, error: opts.rpcError }
        : { data: opts.document ?? makeDocument(), error: null },
    ),
  );
  const fromImpl = vi.fn(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: opts.poRow === undefined ? { so: 4001, so_refs: [4001] } : opts.poRow, error: null }),
      ),
    };
    return chain;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ rpc, from: fromImpl } as any);
  return { rpc, fromImpl };
}

describe("GET /api/operation/pos/:id/print-data", () => {
  it("200 — returns the RPC document with so_refs and issued_by beside it", async () => {
    const { rpc } = mockRpcAndRefs({});
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(rpc).toHaveBeenCalledWith("purchasing_po_document", { p_po_id: PO_ID });
    expect(body.po_number).toBe(PO_ID);
    expect(body.destination.name).toBe("Carres Klang");
    expect(body.so_refs).toEqual([4001]);
    expect(body.issued_by).toBeNull();
    expect(body.lines).toHaveLength(2);
  });

  it("200 — the payload is money-free: no price key, no total key, anywhere", async () => {
    mockRpcAndRefs({});
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    const raw = await res.text();
    // The whole wire body — keys and values — must never mention money.
    expect(raw).not.toMatch(/unit_price|line_total|grand_total|currency|"RM/i);
  });

  it("200 — CJK supplier name passes through unchanged", async () => {
    mockRpcAndRefs({
      document: makeDocument({
        supplier: { name: "海尔集团", address: null, contact: "+86 10 8888 8888" },
      }),
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.supplier.name).toBe("海尔集团");
  });

  it("422 — cancelled PO refused by the RPC", async () => {
    mockRpcAndRefs({
      rpcError: { code: "P0001", message: "PO PO-9801 is cancelled", details: "po_not_printable" },
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("po_not_printable");
    expect(body.error).toBe("rule_violation");
  });

  it("422 — destination without an address is refused", async () => {
    mockRpcAndRefs({
      rpcError: { code: "P0001", message: "no address on file", details: "destination_address_missing" },
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("destination_address_missing");
  });

  it("404 — PO does not exist", async () => {
    mockRpcAndRefs({
      rpcError: { code: "42P01", message: "PO PO-9801 not found", details: "po_not_found" },
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("403 — dealer role rejected (guard fires before any Supabase call)", async () => {
    const from = vi.fn();
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from, rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("401 — missing Authorization header", async () => {
    const res = await app.fetch(new Request(`http://t/api/operation/pos/${PO_ID}/print-data`), env);
    expect(res.status).toBe(401);
  });
});
