/**
 * R5 — the supplier scorecard on GET /api/operation/suppliers-overview.
 *
 * The arithmetic is proved in `packages/shared/src/supplier-scorecard.test.ts`.
 * What THESE tests pin down is what only the route can get wrong:
 *
 *  1. It never hands `purchase_orders.status` to the score. R4's carry-forward:
 *     a PO made good by releasing held units stays `open` forever, so a
 *     scorecard keyed on that word would report a supplier as permanently
 *     undelivered for a problem they fixed.
 *  2. It converts a receipt TIMESTAMP to the MYT calendar day. The Worker runs
 *     on UTC; a delivery received at 09:00 MYT on the promised date is 01:00
 *     UTC the same day, but one at 23:00 MYT is 15:00 UTC — read in UTC, a
 *     late-evening receipt lands on the right day, while the reverse case (a
 *     receipt after 16:00 UTC) is already tomorrow in Klang and would read as
 *     a day late against its own promise.
 *  3. A missing receipt stamp stays missing. It must never become a date, or
 *     the engine's "unknown never reads as good" gate has nothing to catch.
 *  4. It states the window it looked at.
 */
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

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000001")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

/** Chainable thenable, recording the columns each table was asked for. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(rows: unknown[], selects: string[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn((cols: string) => {
      selects.push(cols);
      return b;
    }),
    order: vi.fn(() => b),
    limit: vi.fn(() => b),
    gte: vi.fn(() => b),
    eq: vi.fn(() => b),
    in: vi.fn(() => b),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null, count: rows.length }).then(res, rej),
  };
  return b;
}

const SUPPLIER = {
  id: "s1",
  name: "Ohana",
  contact: null,
  contact_email: "sales@ohana.test",
  lead_time: "14 days",
  kind: "factory_pickup",
  cat_covered: ["sofa"],
  portal_enabled: true,
  slug: "ohana",
};

function mount(pos: unknown[], lines: unknown[], claims: unknown[]) {
  const selects: string[] = [];
  const sb = {
    from: vi.fn((t: string) => {
      if (t === "suppliers") return builder([SUPPLIER], selects);
      if (t === "purchase_orders") return builder(pos, selects);
      if (t === "purchase_order_lines") return builder(lines, selects);
      if (t === "supplier_claims") return builder(claims, selects);
      throw new Error(`unmocked table ${t}`);
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return selects;
}

async function get() {
  const jwt = await makeJwt("operation");
  const res = await app.fetch(
    new Request("http://t/api/operation/suppliers-overview", {
      headers: { Authorization: `Bearer ${jwt}` },
    }),
    env,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { res, body: (await res.json()) as any };
}

/** Three complete deliveries — enough to clear the scorecard's floor. */
function threeClean(receivedAt: string) {
  const pos = ["A", "B", "C"].map((id) => ({
    id,
    supplier_id: "s1",
    status: "open", // deliberately NOT 'received' — see test 1
    sup_status: "delivered",
    eta_date: "2026-07-20",
    placed_at: "2026-07-01T00:00:00Z",
    do_uploaded_at: receivedAt,
  }));
  const lines = ["A", "B", "C"].map((po_id) => ({
    po_id,
    qty: 5,
    received_qty: 5,
    damaged_qty: 0,
    wrong_item_qty: 0,
  }));
  return { pos, lines };
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

describe("GET /api/operation/suppliers-overview — the R5 scorecard", () => {
  it("scores a PO that `status` still calls open — R4's released-hold trap", async () => {
    // All three arrived complete and early. `status` says 'open' on every one
    // of them, which is exactly what a released hold leaves behind.
    const { pos, lines } = threeClean("2026-07-18T02:00:00Z");
    mount(pos, lines, []);

    const { res, body } = await get();
    expect(res.status).toBe(200);
    const sc = body.suppliers[0].scorecard;
    expect(sc.onTime).toEqual({ known: true, pct: 100, hits: 3, of: 3 });
    expect(sc.inFull.known).toBe(true);
  });

  it("reads a receipt stamp as the MYT day, not the UTC one", async () => {
    // 2026-07-20 17:00 UTC = 2026-07-21 01:00 in Klang — the day AFTER the
    // promised date. Read in UTC this would score as on time.
    const { pos, lines } = threeClean("2026-07-20T17:00:00Z");
    mount(pos, lines, []);

    const { body } = await get();
    const sc = body.suppliers[0].scorecard;
    expect(sc.coverage.judged).toBe(3);
    expect(sc.onTime).toEqual({ known: true, pct: 0, hits: 0, of: 3 });
  });

  it("a receipt at 23:00 MYT on the promised day is still on time", async () => {
    // 15:00 UTC = 23:00 MYT, same calendar day in Klang.
    const { pos, lines } = threeClean("2026-07-20T15:00:00Z");
    mount(pos, lines, []);

    const { body } = await get();
    expect(body.suppliers[0].scorecard.onTime.pct).toBe(100);
  });

  it("a missing receipt stamp stays missing and leaves the on-time figure unanswered", async () => {
    const { pos, lines } = threeClean("2026-07-18T02:00:00Z");
    for (const p of pos) p.do_uploaded_at = null as unknown as string;
    mount(pos, lines, []);

    const { body } = await get();
    const sc = body.suppliers[0].scorecard;
    expect(sc.coverage.noDeliveryDate).toBe(3);
    expect(sc.onTime.known).toBe(false);
    expect(sc.onTime.reason).toBe("no_records");
    // Completeness is still known, so in full is still answered.
    expect(sc.inFull.known).toBe(true);
  });

  it("carries the claims through to the settle-time figures", async () => {
    const { pos, lines } = threeClean("2026-07-18T02:00:00Z");
    mount(pos, lines, [
      {
        po_id: "A",
        claim_type: "damaged",
        status: "closed",
        reported_at: "2026-07-10T02:00:00Z",
        closed_at: "2026-07-14T02:00:00Z",
      },
      {
        po_id: "B",
        claim_type: "late_delivery",
        status: "open",
        reported_at: "2026-07-12T02:00:00Z",
        closed_at: null,
      },
    ]);

    const { body } = await get();
    const sc = body.suppliers[0].scorecard;
    expect(sc.claims.closed).toBe(1);
    expect(sc.claims.open).toBe(1);
    expect(sc.claims.avgDaysToSettle).toBe(4);
    expect(sc.claimRate).toEqual({ known: true, pct: 67, hits: 2, of: 3 });
  });

  it("prints no figure at all for a supplier with no PO (live prod on ship day)", async () => {
    mount([], [], []);
    const { body } = await get();
    const sc = body.suppliers[0].scorecard;
    expect(sc.coverage.pos).toBe(0);
    expect(sc.onTime.known).toBe(false);
    expect(sc.inFull.known).toBe(false);
    expect(sc.faulty.known).toBe(false);
    expect(sc.claimRate.known).toBe(false);
  });

  it("states the window it looked at", async () => {
    mount([], [], []);
    const { body } = await get();
    expect(body.scorecardWindow.days).toBe(365);
    expect(body.scorecardWindow.truncated).toBe(false);
    expect(body.scorecardWindow.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("asks purchase_order_lines for R1's three numbers", async () => {
    const { pos, lines } = threeClean("2026-07-18T02:00:00Z");
    const selects = mount(pos, lines, []);
    await get();
    const lineSelect = selects.find((s) => s.includes("received_qty"));
    expect(lineSelect).toContain("damaged_qty");
    expect(lineSelect).toContain("wrong_item_qty");
  });

  it("refuses a role that is not operation or principal", async () => {
    mount([], [], []);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/suppliers-overview", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
