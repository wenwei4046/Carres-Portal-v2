/**
 * §9.6 (migration 0548) — the Purchase Returns register's read:
 *   GET /api/operation/purchase-returns
 *
 * What these tests pin down is mostly what the router does NOT do. It never
 * writes a return (§7.4 gives that to one SQL door, behind an approved claim
 * outcome), it never adds up a quantity (the shared module owns the one
 * arithmetic), and it never lets a damage photo out as pickup proof — which is
 * the §9.6 rule most likely to be broken by somebody being helpful.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  purchaseReturnCollectedQty,
  purchaseReturnQty,
  type PurchaseReturnListRow,
} from "@carres/shared";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));
import { adminClient, userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};

async function makeJwt(role: string) {
  return signTestJwt("11111111-1111-1111-1111-000000000001", {
    email: `${role}@x`,
    app_metadata: { role },
  });
}

const RETURN = {
  id: "r1",
  pr_no: "PR-20260915-1042",
  pr_doc_date: "2026-09-15T02:00:00Z",
  supplier_id: "s1",
  supplier_claim_id: "c1",
  warehouse_receipt_id: "w1",
  document_sent_at: null,
  confirmed_pickup_date: null,
};

const UNIT = {
  purchase_return_id: "r1",
  stock_item_id: "si1",
  unit_code: "U-20260904-0142",
  po_id: "PO-20260901-0251",
  category: "Sofa",
  item: "Sofa Lyra",
  item_spec: "Left arm · Grey",
  pickup_location: "AL Sungai Buloh",
  return_to: "Hookka Factory, Muar",
  collected_by: null,
  collected_by_name: null,
  actual_pickup_date: null,
  supplier_received_date: null,
  evidence: [] as unknown[],
};

/** Chainable thenable, the same shape the claims route's tests use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function listBuilder(rows: unknown[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    order: vi.fn(() => b),
    in: vi.fn(() => b),
    eq: vi.fn(() => b),
    range: vi.fn((from: number, to: number) =>
      Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    ),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(res, rej),
  };
  return b;
}

function client(over: { returns?: unknown[]; units?: unknown[] } = {}) {
  const tables: Record<string, unknown[]> = {
    purchase_returns: over.returns ?? [RETURN],
    purchase_return_units: over.units ?? [UNIT],
    suppliers: [{ id: "s1", name: "Hookka" }],
    supplier_claims: [{ id: "c1", claim_no: "SC-1038" }],
    warehouse_receipts: [{ id: "w1", grn_no: "GRN-20260904-1064" }],
    salespersons: [],
  };
  return {
    rpc: vi.fn(async (name: string) =>
      name === "actor_display_names"
        ? { data: [{ id: "u1", name: "Faizal" }], error: null }
        : { data: null, error: null },
    ),
    from: vi.fn((t: string) => {
      if (!(t in tables)) throw new Error(`unmocked table ${t}`);
      return listBuilder(tables[t]);
    }),
  };
}

async function get(
  sb: ReturnType<typeof client>,
  role = "operation",
  query = "",
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(adminClient).mockReturnValue(sb as any);
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/operation/purchase-returns${query}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    }),
    env,
  );
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/purchase-returns", () => {
  it("returns the document with its Units, named suppliers and claim", async () => {
    const res = await get(client());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { returns: PurchaseReturnListRow[] };

    expect(body.returns).toHaveLength(1);
    const row = body.returns[0];
    expect(row.pr_no).toBe("PR-20260915-1042");
    expect(row.supplier_name).toBe("Hookka");
    expect(row.claim_no).toBe("SC-1038");
    expect(row.grn_no).toBe("GRN-20260904-1064");
    // §9.6's `Unit ID` is the Unit's readable code, never the table key.
    expect(row.units[0].unit_id).toBe("U-20260904-0142");
    expect(row.units[0]).not.toHaveProperty("stock_item_id");
  });

  it("adds nothing up — Qty is derived from the Units it returned", async () => {
    const res = await get(
      client({ units: [UNIT, { ...UNIT, stock_item_id: "si2", unit_code: "U-2" }] }),
    );
    const body = (await res.json()) as { returns: PurchaseReturnListRow[] };

    // The response carries no `qty` field at all; the one arithmetic lives in
    // the shared module and both the screen and this test read it from there.
    expect(body.returns[0]).not.toHaveProperty("qty");
    expect(purchaseReturnQty(body.returns[0])).toBe(2);
    expect(purchaseReturnCollectedQty(body.returns[0])).toBe(0);
  });

  it("never lets problem evidence out as pickup or receipt proof", async () => {
    const res = await get(
      client({
        units: [
          {
            ...UNIT,
            evidence: [
              { purpose: "problem", path: "damage.jpg" },
              { purpose: "pickup", path: "loaded.jpg" },
              { purpose: "receipt", path: "signed.mp4" },
            ],
          },
        ],
      }),
    );
    const body = (await res.json()) as { returns: PurchaseReturnListRow[] };
    const evidence = body.returns[0].units[0].evidence;

    expect(evidence.map((e) => e.purpose).sort()).toEqual(["pickup", "receipt"]);
    expect(evidence.find((e) => e.purpose === "pickup")).toMatchObject({
      photos: 1,
      videos: 0,
    });
    // A `.mp4` is a video, and the count says so rather than calling it a photo.
    expect(evidence.find((e) => e.purpose === "receipt")).toMatchObject({
      photos: 0,
      videos: 1,
    });
  });

  it("prefers the RECORDED collector over a directory lookup", async () => {
    const res = await get(
      client({
        units: [
          {
            ...UNIT,
            collected_by: "u1",
            collected_by_name: "Rahim",
            actual_pickup_date: "2026-09-17T03:00:00Z",
          },
        ],
      }),
    );
    const body = (await res.json()) as { returns: PurchaseReturnListRow[] };
    // The directory would say "Faizal". Who collected the goods that day is a
    // recorded fact and does not change when the directory does.
    expect(body.returns[0].units[0].collected_by).toBe("Rahim");
  });

  it("falls back to the directory when only the id was recorded", async () => {
    const res = await get(
      client({
        units: [
          {
            ...UNIT,
            collected_by: "u1",
            collected_by_name: null,
            actual_pickup_date: "2026-09-17T03:00:00Z",
          },
        ],
      }),
    );
    const body = (await res.json()) as { returns: PurchaseReturnListRow[] };
    expect(body.returns[0].units[0].collected_by).toBe("Faizal");
  });

  it("narrows to one Supplier Claim when asked", async () => {
    const hit = await get(client(), "operation", "?claim=SC-1038");
    expect(((await hit.json()) as { returns: unknown[] }).returns).toHaveLength(1);

    const miss = await get(client(), "operation", "?claim=SC-9999");
    expect(((await miss.json()) as { returns: unknown[] }).returns).toHaveLength(0);
  });

  it("returns an empty list, not an error, when nothing has been returned", async () => {
    const res = await get(client({ returns: [] }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { returns: unknown[] }).returns).toEqual([]);
  });

  it("is internal only", async () => {
    for (const role of ["dealer", "supplier", "partner"]) {
      const res = await get(client(), role);
      expect(res.status, role).toBe(403);
    }
    expect((await get(client(), "principal")).status).toBe(200);
  });

  it("offers no door that writes a return", async () => {
    // §7.4 gives creation to one SQL door behind an approved claim outcome.
    // A POST/PATCH/DELETE here would be a second writer (ERP-ARCHITECTURE law
    // C: a door, never a duplicate).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(client() as any);
    const jwt = await makeJwt("operation");
    for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
      const res = await app.fetch(
        new Request("http://t/api/operation/purchase-returns", {
          method,
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status, method).toBe(404);
    }
  });
});
