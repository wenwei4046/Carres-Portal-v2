import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { mintStaffToken } from "../../lib/staff-token";
import type { Bindings } from "../../types";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/**
 * 0664 — the dealer commission statement: Finance reads any dealer's and
 * records payments to it; a dealer's store owner reads its own (D3).
 */
const STAFF_SESSION_SECRET = "test-staff-secret-0664-abcdef";
const env = {
  SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "",
  STAFF_SESSION_SECRET,
};
const DEALER = "00000000-0000-4000-8000-000000000d01";
const VOUCHER = "00000000-0000-4000-8000-0000000000a1";
const LINK = "00000000-0000-4000-8000-0000000000b1";

async function call(path: string, opts: { role?: string; dealerId?: string | null; method?: string; body?: unknown; staff?: string } = {}) {
  const role = opts.role ?? "finance";
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", {
    email: `${role}@x`,
    app_metadata: { role, ...(opts.dealerId ? { dealer_id: opts.dealerId } : {}) },
  });
  return app.fetch(new Request(`http://t/api${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(opts.staff ? { "X-Staff-Token": opts.staff } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  }), env);
}

const token = (tier: "principal" | "manager" | "salesperson") => mintStaffToken(env as unknown as Bindings, {
  sid: tier === "principal" ? null : "00000000-0000-4000-8000-00000000ff01", did: DEALER, oid: null, tier,
});

function stub(data: unknown = { ok: true }) {
  const sb = { rpc: vi.fn().mockResolvedValue({ data, error: null }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return sb;
}

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("Finance: a dealer's statement and payments to it", () => {
  it("reads the statement through its read", async () => {
    const sb = stub({ dealer: { id: DEALER, name: "Probe Dealer" } });
    expect((await call(`/finance/dealer-commission/statement/${DEALER}`)).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_commission_statement", { p_dealer_id: DEALER });
    expect((await call("/finance/dealer-commission/statement/not-an-id")).status).toBe(404);
    expect((await call(`/finance/dealer-commission/statement/${DEALER}`, { role: "operation" })).status).toBe(403);
  });

  it("offers the paid direct vouchers, counts one as a payment to the dealer, and takes it off", async () => {
    const sb = stub([]);
    expect((await call("/finance/dealer-commission/payment-choices")).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_commission_payment_choices");
    const linked = await call("/finance/dealer-commission/payments", { method: "POST", body: { voucherId: VOUCHER, dealerId: DEALER } });
    expect(linked.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_commission_payment_link", { p_voucher_id: VOUCHER, p_dealer_id: DEALER });
    expect((await call(`/finance/dealer-commission/payments/${LINK}`, { method: "DELETE" })).status).toBe(200);
    expect(sb.rpc).toHaveBeenLastCalledWith("dealer_commission_payment_unlink", { p_id: LINK });
    expect((await call("/finance/dealer-commission/payments", { method: "POST", body: { voucherId: "PV-1", dealerId: DEALER } })).status).toBe(422);
    expect((await call("/finance/dealer-commission/payments", { method: "POST", role: "operation", body: { voucherId: VOUCHER, dealerId: DEALER } })).status).toBe(403);
  });
});

describe("the dealer's own statement (D3)", () => {
  it("its store owner reads it; the database picks the dealer", async () => {
    const sb = stub({ dealer: { id: DEALER, name: "Probe Dealer" } });
    const res = await call("/dealer-commission/statement", { role: "dealer", dealerId: DEALER, staff: await token("principal") });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_commission_statement", { p_dealer_id: null });
  });

  it("refuses a manager, a salesperson, no staff token, and every other login", async () => {
    const sb = stub();
    expect((await call("/dealer-commission/statement", { role: "dealer", dealerId: DEALER, staff: await token("manager") })).status).toBe(403);
    expect((await call("/dealer-commission/statement", { role: "dealer", dealerId: DEALER, staff: await token("salesperson") })).status).toBe(403);
    expect((await call("/dealer-commission/statement", { role: "dealer", dealerId: DEALER })).status).toBe(403);
    expect((await call("/dealer-commission/statement", { role: "showroom", dealerId: DEALER, staff: await token("principal") })).status).toBe(403);
    expect((await call("/dealer-commission/statement", { role: "finance" })).status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});
