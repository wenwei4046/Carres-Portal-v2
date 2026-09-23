import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/stair-carry-restamp", () => ({
  touchesStairInputs: (h: Record<string, unknown>) => "delivery_floor" in h || "delivery_has_lift" in h || "delivery_stair_items" in h,
  restampStairCarry: vi.fn(async () => ({ ok: true })),
}));
import { userClient } from "../../lib/supabase";
import { restampStairCarry } from "../../lib/stair-carry-restamp";

const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "u" };
const ORDER_ID = "85ff15dc-4dd8-4f04-913b-e1617784868e";
const L1 = "42df7edd-c2e2-4f96-bdaa-d2dc3b296f31";
const L2 = "a7b31b91-3321-4850-8c2f-e78daabd45ea";
const A1 = "461302ba-c269-42f3-8d19-3093fafed401";
const AMEND = "dde58498-9932-48c2-bdb2-02ff2f615be4";

const ORDER = {
  id: ORDER_ID, status: "proceed_order", proceed_date: "2026-09-17", delivery_date: "2026-10-26", delivery_date_tbd: false,
  installment_months: null, customer_name: "Customer", customer_phone: "0100000000", delivery_floor: 1, delivery_has_lift: false,
  delivery_stair_items: null, entry_data: { fields: { building_type: "Landed" } },
};
const LINES = [
  { id: L1, sku: "TRION-Q", qty: 1, unit_price: "2749.00", attrs: { gap: "KIV", specials: [{ code: "Front Drawer" }] } },
  { id: L2, sku: "MEMORY-FOAM-PILLOW-asd", qty: 2, unit_price: "220.00", attrs: null },
];
const ADDONS = [{ id: A1, addon_key: "DELIVERY", qty: 1, unit_price: "250.00", attrs: { kind: "base" } }];

function mockDb(rpcImpl: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => rpcImpl(name, args));
  const table = (rows: unknown) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: rows, error: null }));
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return chain;
  };
  vi.mocked(userClient).mockReturnValue({
    from: vi.fn((t: string) =>
      table(
        t === "orders" ? ORDER
          : t === "order_lines" ? LINES
            : t === "sales_order_amendments" ? { order_id: ORDER_ID }
              : ADDONS,
      )),
    rpc,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return rpc;
}

const header = (over: Record<string, unknown> = {}) => ({
  customer_name: "Customer", customer_phone: "0100000000", proceed_date: "2026-09-17", delivery_date: "2026-10-26",
  delivery_date_tbd: false, delivery_floor: 1, delivery_has_lift: false, delivery_stair_items: null,
  entry_fields: { building_type: "Landed" }, ...over,
});
const lines = () => [
  { id: L1, sku: "TRION-Q", qty: 1, unit_price: 2749 },
  { id: L2, sku: "MEMORY-FOAM-PILLOW-asd", qty: 2, unit_price: 220 },
];
const addons = () => [{ id: A1, addon_key: "DELIVERY", qty: 1, unit_price: 250 }];

type Body = Record<string, unknown>;
const bodyOf = async (res: Response): Promise<Body> => (await res.json()) as Body;

async function post(body: unknown, role = "operation") {
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000999", { email: `${role}@carres.com`, app_metadata: { role } });
  return app.fetch(
    new Request(`http://t/api/operation/orders/${ORDER_ID}/changes`, {
      method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    env,
  );
}

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("POST /api/operation/orders/:id/changes — the server chooses the commit", () => {
  it("nothing changed is refused, nothing is written", async () => {
    const rpc = mockDb(() => ({ data: null, error: null }));
    const res = await post({ header: header(), lines: lines(), addons: addons(), reason: "x" });
    expect(res.status).toBe(422);
    expect((await bodyOf(res)).code).toBe("nothing_changed");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a phone correction SAVES — only the changed key, as a staff correction with its reason", async () => {
    const rpc = mockDb(() => ({ data: { revision: 2, changed: ["customer_phone"] }, error: null }));
    const res = await post({ header: header({ customer_phone: "0199999999" }), lines: lines(), addons: addons(), reason: "New number" });
    expect(res.status).toBe(201);
    expect((await bodyOf(res)).action).toBe("saved");
    expect(rpc).toHaveBeenCalledWith("sales_order_save_revision", {
      p_order_id: ORDER_ID, p_header: { customer_phone: "0199999999" }, p_lines: null,
      p_change: { change_type: "staff_correction", note: "New number" },
    });
  });

  it("a quantity change SUBMITS an amendment with the full line set; the stored configuration rides along", async () => {
    const rpc = mockDb((name) => ({ data: name === "sales_order_submit_amendment" ? { id: AMEND, base_revision: 1 } : {}, error: null }));
    const l = lines();
    l[1]!.qty = 1;
    const res = await post({ header: header(), lines: l, addons: addons(), reason: "Customer keeps one pillow" });
    expect(res.status).toBe(201);
    const out = await bodyOf(res);
    expect(out).toMatchObject({ action: "submitted", amendmentId: AMEND, agreementRecorded: false });
    const call = rpc.mock.calls.find(([n]) => n === "sales_order_submit_amendment")!;
    const proposed = (call[1] as { p_proposed: Record<string, unknown> }).p_proposed;
    expect(proposed.lines).toEqual([
      { id: L1, sku: "TRION-Q", qty: 1, unit_price: 2749, attrs: { gap: "KIV", specials: [{ code: "Front Drawer" }] } },
      { id: L2, sku: "MEMORY-FOAM-PILLOW-asd", qty: 1, unit_price: 220, attrs: null },
    ]);
    expect(proposed.addons).toBeUndefined();
    expect(rpc).not.toHaveBeenCalledWith("sales_order_save_revision", expect.anything());
  });

  it("a mixed change goes to review WHOLE — the phone rides in the proposal with its base, nothing is saved", async () => {
    const rpc = mockDb((name) => ({ data: name === "sales_order_submit_amendment" ? { id: AMEND, base_revision: 1 } : {}, error: null }));
    const res = await post({
      header: header({ customer_phone: "0199999999", proceed_date: "2026-09-20" }), lines: lines(), addons: [], reason: "Customer call",
      agreement: { kind: "customer_confirmation", reference: "WhatsApp 22 Sep 09:40" },
    });
    expect(res.status).toBe(201);
    expect((await bodyOf(res)).agreementRecorded).toBe(true);
    const proposed = (rpc.mock.calls.find(([n]) => n === "sales_order_submit_amendment")![1] as { p_proposed: Record<string, unknown> }).p_proposed;
    expect(proposed.header).toEqual({ customer_phone: "0199999999", proceed_date: "2026-09-20" });
    expect(proposed.base_header).toEqual({ customer_phone: "0100000000", proceed_date: "2026-09-17" });
    expect(proposed.addons).toEqual([]);
    expect(rpc).toHaveBeenCalledWith("sales_order_record_amendment_agreement", {
      p_amendment_id: AMEND, p_kind: "customer_confirmation", p_reference: "WhatsApp 22 Sep 09:40", p_detail: null,
    });
    expect(rpc).not.toHaveBeenCalledWith("sales_order_save_revision", expect.anything());
  });

  it("the delivery promise travels at the top level the impact read and banner already use", async () => {
    const rpc = mockDb((name) => ({ data: name === "sales_order_submit_amendment" ? { id: AMEND, base_revision: 1 } : {}, error: null }));
    await post({ header: header({ delivery_date: "2026-11-02" }), lines: lines(), addons: addons(), reason: "Customer moved" });
    const proposed = (rpc.mock.calls.find(([n]) => n === "sales_order_submit_amendment")![1] as { p_proposed: Record<string, unknown> }).p_proposed;
    expect(proposed).toEqual({ delivery_date: "2026-11-02" });
  });

  it("a reason is required", async () => {
    mockDb(() => ({ data: null, error: null }));
    const res = await post({ header: header({ customer_phone: "01" }), lines: lines(), addons: addons(), reason: " " });
    expect(res.status).toBe(422);
  });

  it("proposing again over an OUT-OF-DATE request withdraws it first", async () => {
    const rpc = mockDb((name) => {
      if (name === "sales_order_amendment_live") return { data: { amendment: { id: AMEND, stale: true } }, error: null };
      if (name === "sales_order_submit_amendment") return { data: { id: "ffffffff-9932-48c2-bdb2-02ff2f615be4", base_revision: 3 }, error: null };
      return { data: {}, error: null };
    });
    const l = lines();
    l[1]!.qty = 1;
    await post({ header: header(), lines: l, addons: addons(), reason: "again", replaceAmendmentId: AMEND });
    const names = rpc.mock.calls.map(([n]) => n);
    expect(names.indexOf("sales_order_withdraw_amendment")).toBeLessThan(names.indexOf("sales_order_submit_amendment"));
  });

  it("the database's refusal reaches the page as its own code", async () => {
    mockDb((name) => (name === "sales_order_submit_amendment"
      ? { data: null, error: { code: "22023", details: "amendment_exists", message: "An amendment is already open on this sales order" } }
      : { data: {}, error: null }));
    const l = lines();
    l[1]!.qty = 1;
    const res = await post({ header: header(), lines: l, addons: addons(), reason: "x" });
    expect(res.status).toBe(422);
    expect((await bodyOf(res)).code).toBe("amendment_exists");
  });
});

describe("the withdraw door", () => {
  it("withdraw requires a reason", async () => {
    mockDb(() => ({ data: null, error: null }));
    const jwt = await signTestJwt("11111111-1111-1111-1111-000000000999", { email: "o@carres.com", app_metadata: { role: "operation" } });
    const res = await app.fetch(new Request(`http://t/api/operation/orders/amendment/${AMEND}/withdraw`, {
      method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ reason: "" }),
    }), env);
    expect(res.status).toBe(422);
  });
});

describe("the approved amendment re-stamps the stair fee (0562)", () => {
  /* Until this card the three delivery inputs could not move by amendment and
     the proposal carried no quantities, so the stamped fee could not go stale
     here. It can now: without the re-stamp the order prints a fee its own
     inputs no longer produce. */
  async function decide(decision: "approve" | "reject", rpcImpl: (name: string) => { data: unknown; error: unknown }) {
    const rpc = mockDb(rpcImpl);
    const jwt = await signTestJwt("11111111-1111-1111-1111-000000000998", {
      email: "p@carres.com", app_metadata: { role: "principal" },
    });
    const res = await app.fetch(new Request(`http://t/api/operation/orders/amendment/${AMEND}/decide`, {
      method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: "ok" }),
    }), env);
    return { res, rpc };
  }

  it("re-prices the fee from the SAVED order after the change takes effect", async () => {
    vi.mocked(restampStairCarry).mockClear();
    const { res } = await decide("approve", (name) =>
      name === "sales_order_decide_amendment"
        ? { data: { id: AMEND, status: "applied", revision: 4 }, error: null }
        : { data: {}, error: null });
    expect(res.status).toBe(200);
    expect(restampStairCarry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(restampStairCarry).mock.calls[0]![1]).toBe(ORDER_ID);
  });

  it("a rejection changes nothing, so nothing is re-priced", async () => {
    vi.mocked(restampStairCarry).mockClear();
    const { res } = await decide("reject", (name) =>
      name === "sales_order_decide_amendment"
        ? { data: { id: AMEND, status: "rejected" }, error: null }
        : { data: {}, error: null });
    expect(res.status).toBe(200);
    expect(restampStairCarry).not.toHaveBeenCalled();
  });
});
