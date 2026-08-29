import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
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
    /* 0383 — the document authority carries EVERY fact the paper prints: its
       own version, the supplier's address, the real issuer, the Units it minted
       and which customer order each unit is for. The route adds none of them. */
    version: 1,
    issue_date: "2026-08-01",
    supplier: {
      name: "Ohana Furniture Sdn Bhd",
      address: "No 8, Jalan Industri, Muar, Johor",
      contact: "+60 3-1234 5678",
    },
    destination: { name: "Carres Klang", address: "Lot 12, Jalan Sungai Keramat, Klang" },
    delivery_instructions: "Call Jess 1 hour before arrival.",
    eta_date: "2026-08-12",
    so_refs: [4001],
    issued_by: "Yee Jin",
    lines: [
      {
        sku: "CODY-Q", description: "Queen", qty: 1, unit: "pc",
        attrs: { color: "Walnut", gap: '14"' },
        unit_codes: ["U1-000-001"],
        sources: [{ so: 4001, qty: 1 }],
      },
      {
        sku: "JAGER-K", description: "King", qty: 2, unit: "pc", attrs: {},
        unit_codes: ["U1-000-002", "U1-000-003"],
        sources: [{ so: 4001, qty: 2 }],
      },
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
  it("the governed repair reads the audit ledger's real occurred_at column", () => {
    const sql = readFileSync(
      new URL("../../../../../supabase/migrations/0400_the_po_document_carries_every_destination.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("order by occurred_at asc");
    expect(sql).not.toMatch(/from audit_log[\s\S]{0,160}order by created_at/);
  });

  it("the document authority returns each line's effective destination", () => {
    const sql = readFileSync(
      new URL("../../../../../supabase/migrations/0400_the_po_document_carries_every_destination.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("coalesce(l.destination_id, v_po.destination_id)");
    expect(sql).toMatch(/'destination'[\s\S]{0,500}'name'[\s\S]{0,500}'address'/);
  });

  it("200 — returns the document authority's answer, and adds nothing to it", async () => {
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
    /* ⭐ THE REAL ISSUER. The route used to hard-code `null` over it. */
    expect(body.issued_by).toBe("Yee Jin");
    expect(body.version).toBe(1);
    expect(body.supplier.address).toBe("No 8, Jalan Industri, Muar, Johor");
    expect(body.lines).toHaveLength(2);
    /* ⭐ AND THE PER-LINE LINEAGE (0382), which is what feeds `SO NO` on a bulk
       purchase order instead of a blank column. */
    expect(body.lines[0].sources).toEqual([{ so: 4001, qty: 1 }]);
    expect(body.lines[0].unit_codes).toEqual(["U1-000-001"]);
  });

  it("reads the purchase order table for nothing — the RPC is the authority", async () => {
    const { fromImpl } = mockRpcAndRefs({});
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/print-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    /* A second read here was a second truth about the same paper. */
    expect(fromImpl).not.toHaveBeenCalled();
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

/**
 * ⭐ THE OUTBOUND EVIDENCE FOR ONE PURCHASE ORDER (closure §8; 0377 · 0378 · 0379).
 *
 * SO Batch Purchase issues a purchase order and then has to chase it, with no
 * register behind it. Without this read the evidence surface could only show
 * what the tab happened to remember — and a reload, a second operator or a
 * revision would each tell a different story about the same paper.
 */
describe("GET /api/operation/pos/:id/sends", () => {
  function mockSends(rows: Record<string, unknown>[], users: Record<string, unknown>[] = []) {
    const seen: string[] = [];
    const fromImpl = vi.fn((table: string) => {
      seen.push(table);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (res: any, rej: any) =>
          Promise.resolve({
            data: table === "po_sends" ? rows : users,
            error: null,
          }).then(res, rej),
      };
      return chain;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl, rpc: vi.fn() } as any);
    return { seen };
  }

  async function ask() {
    const jwt = await makeJwt("operation");
    return app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/sends`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
  }

  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request(`http://t/api/operation/pos/${PO_ID}/sends`), env);
    expect(res.status).toBe(401);
  });

  it("returns every fact that makes a row EVIDENCE, with the actor's name", async () => {
    mockSends(
      [
        {
          channel: "whatsapp",
          note: null,
          sent_at: "2026-08-24T02:10:00Z",
          kind: "confirmed_sent",
          recipient: "Hooka Purchasing Group",
          po_version: 2,
          sent_by: "u1",
          duty_user_id: "u9",
          acting_user_id: "u1",
        },
      ],
      [
        { id: "u1", name: "Shasha", email: "ss@carres.com" },
        { id: "u9", name: "Yee Jin", email: "yj@carres.com" },
      ],
    );
    const res = await ask();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sends: Record<string, unknown>[] };
    expect(body.sends).toHaveLength(1);
    /* ⭐ A UUID IS NOT AN ACTOR. Three separate names, because Team Work groups
       by the duty holder while the audit must say who acted. */
    expect(body.sends[0]).toMatchObject({
      kind: "confirmed_sent",
      po_version: 2,
      recipient: "Hooka Purchasing Group",
      channel: "whatsapp",
      sent_by_name: "Shasha",
      duty_name: "Yee Jin",
      acting_name: "Shasha",
    });
  });

  it("keeps an external OPEN as history, and it carries no version", async () => {
    mockSends(
      [
        {
          channel: "email", note: null, sent_at: "2026-08-24T02:00:00Z",
          kind: "external_open", recipient: null, po_version: null,
          sent_by: "u1", duty_user_id: null, acting_user_id: null,
        },
      ],
      [{ id: "u1", name: "Li Ching", email: "lc@carres.com" }],
    );
    const body = (await (await ask()).json()) as { sends: Record<string, unknown>[] };
    expect(body.sends[0]).toMatchObject({
      kind: "external_open",
      po_version: null,
      sent_by_name: "Li Ching",
      duty_name: null,
    });
  });

  it("returns an empty list rather than an error when nothing has left", async () => {
    mockSends([]);
    const body = (await (await ask()).json()) as { sends: unknown[] };
    expect(body.sends).toEqual([]);
  });

  it("reads only po_sends — it resolves no name it was not asked for", async () => {
    const { seen } = mockSends([]);
    await ask();
    expect(seen).toEqual(["po_sends"]);
  });
});
