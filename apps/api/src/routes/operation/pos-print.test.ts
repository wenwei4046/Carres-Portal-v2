import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

/**
 * GET /api/operation/pos/:id/print-data — the EXTERNAL purchase order document.
 *
 * 2026-05-12 (Loo): route renamed `/print` → `/print-data` and returns JSON
 * instead of application/pdf — render moved to apps/web/src/lib/pdf/.
 *
 * P4 (migration 0307, Loo 2026-07-29): the route stopped ASSEMBLING the
 * document from tables and now reads `purchasing_po_document`, the ONE database
 * source for external PO documents. That is why this file no longer mocks
 * `.from()` at all — a table read appearing here again would BE the second
 * export path §5 forbids, so the mock is a `.rpc()` and the absence of `from`
 * is asserted rather than assumed.
 */
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

/** What `purchasing_po_document` returns — no money field of any kind. */
function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    po_number: PO_ID,
    po_id: PO_ID,
    issue_date: "2026-05-04",
    supplier: { name: "Acme Furniture Sdn Bhd", address: null, contact: "+60 3-1234 5678" },
    destination: { name: "AL Sungai Buloh", address: "12 Jalan Test, Sungai Buloh" },
    delivery_instructions: null,
    eta_date: "2026-06-01",
    lines: [
      { sku: "MAT-K-001", description: "King Mattress 200x200", qty: 5, unit: "pc", attrs: {} },
      {
        sku: "BED-K-002",
        description: "Oak Bedframe King",
        qty: 3,
        unit: "pc",
        attrs: { color: "Walnut", gap: "14" },
      },
    ],
    terms: null,
    ...overrides,
  };
}

/** Mock the ONE rpc the route now makes. Returns the spy so a test can assert
 *  what was called — and that nothing else was. */
function mockDocumentRpc(opts: {
  data?: Record<string, unknown> | null;
  error?: { code?: string; message?: string; details?: string };
}) {
  const rpc = vi.fn(() =>
    Promise.resolve(
      opts.error
        ? { data: null, error: opts.error }
        : { data: opts.data === undefined ? makeDocument() : opts.data, error: null },
    ),
  );
  const from = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ rpc, from } as any);
  return { rpc, from };
}

describe("GET /api/operation/pos/:id/print-data", () => {
  it("200 — serves the RPC payload, and reads no table to build it", async () => {
    const { rpc, from } = mockDocumentRpc({});
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.po_number).toBe("PO-9801");
    expect(body.supplier.name).toBe("Acme Furniture Sdn Bhd");
    expect(body.destination.name).toBe("AL Sungai Buloh");
    expect(body.lines).toHaveLength(2);

    expect(rpc).toHaveBeenCalledWith("purchasing_po_document", { p_po_id: PO_ID });
    // §5: no second direct-table external export path is allowed. A `.from()`
    // here would be that path, so its absence is the assertion.
    expect(from).not.toHaveBeenCalled();
  });

  it("200 — the document carries NO money field, and no RM anywhere in it", async () => {
    mockDocumentRpc({});
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    const raw = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = JSON.parse(raw) as any;
    expect(body).not.toHaveProperty("grand_total");
    expect(body).not.toHaveProperty("currency");
    expect(body).not.toHaveProperty("buyer");
    for (const line of body.lines) {
      expect(line).not.toHaveProperty("unit_price");
      expect(line).not.toHaveProperty("line_total");
    }
    // The serialised document as a whole — a price that slipped in under any
    // new key would still have to spell one of these.
    expect(raw).not.toMatch(/RM|MYR|unit_price|line_total|grand_total|surcharge/);
  });

  it("200 — CJK supplier name passes through unchanged in JSON", async () => {
    mockDocumentRpc({
      data: makeDocument({
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

  // ── The three locked refusals (Loo, 2026-07-29) ───────────────────────────
  //
  // The RPC raises them; this route is what turns each into a sentence. The
  // wording is ruled, so it is asserted verbatim — and `Address not set` is
  // asserted ABSENT, because that is manager Settings' own word and may never
  // reach a store.

  it("422 — a destination with no address refuses the export, in the ruled words", async () => {
    mockDocumentRpc({
      error: {
        code: "P0001",
        details: "destination_address_missing",
        message: "no address on file for AL Sungai Buloh",
      },
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("destination_address_missing");
    expect(body.message).toBe(
      "Set the destination address in Purchasing Settings before exporting the purchase order.",
    );
    expect(body.message).not.toMatch(/Address not set/);
  });

  it("422 — a cancelled PO is not exportable, in the ruled words", async () => {
    mockDocumentRpc({
      error: { code: "P0001", details: "po_not_printable", message: "PO PO-9801 is cancelled" },
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string; message: string };
    expect(body.error).toBe("rule_violation");
    expect(body.code).toBe("po_not_printable");
    expect(body.message).toBe("This purchase order cannot be exported in its current status.");
  });

  it("403 — the RPC's own role gate speaks in the ruled words", async () => {
    mockDocumentRpc({
      error: {
        code: "42501",
        details: "forbidden",
        message: "forbidden: only operation or principal can export a PO document",
      },
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("You do not have permission to export this purchase order.");
  });

  it("404 — PO does not exist", async () => {
    mockDocumentRpc({
      error: { code: "42P01", details: "po_not_found", message: "PO PO-9801 not found" },
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

  it("500 — a null payload is reported, never served as a document", async () => {
    mockDocumentRpc({ data: null });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(500);
  });

  it("403 — dealer role rejected (guard fires before any Supabase call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("401 — missing Authorization header", async () => {
    const res = await app.fetch(new Request(`http://t/api/operation/pos/${PO_ID}/print-data`), env);
    expect(res.status).toBe(401);
  });
});
