import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/* A thin door: validate, call ONE function, pass its refusal on. The rules
 * (the 160-0000 zero, one post, reverse, the date exception, the tally
 * remark) are walked on the database itself, inside migration 0705. */

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const USER_ID = "11111111-1111-1111-1111-000000000001";
const ROW = "22222222-2222-4222-8222-222222222222";
const PARTY = "33333333-3333-4333-8333-333333333333";
const WAS = "2026-10-22T03:00:00.123456+00:00";

function stub(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { entry_no: "JE-202609-0009" }, error: null });
  const sb = {
    rpc: vi.fn().mockResolvedValue(result),
    from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return sb;
}

async function call(method: string, path: string, body?: unknown, role = "finance") {
  const jwt = await signTestJwt(USER_ID, { email: `${role}@x`, app_metadata: { role } });
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return app.fetch(new Request(`http://t/api/finance/opening-balances${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("/api/finance/opening-balances", () => {
  it.each([
    ["GET", "", undefined],
    ["GET", "/state", undefined],
    ["PUT", "/accounts", { lines: [], was: WAS }],
    ["PUT", "/stock", { rows: [], was: WAS }],
    ["POST", "/post", { was: WAS }],
  ])("%s %s refuses operation before the database", async (method, path, body) => {
    const sb = stub({ data: null, error: null });
    expect((await call(method, path, body, "operation")).status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("Post and Reverse are the principal's: Finance is refused before the database", async () => {
    const sb = stub({ data: null, error: null });
    const post = await call("POST", "/post", { was: WAS });
    expect(post.status).toBe(403);
    expect(((await post.json()) as { message: string }).message).toBe("Only the principal may post or reverse the opening balances.");
    expect((await call("POST", "/reverse", { reason: "x" })).status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("saves the Accounts tab whole, a blank side sent as null", async () => {
    const sb = stub({ data: "2026-10-22T03:00:01+00:00", error: null });
    const res = await call("PUT", "/accounts", { lines: [{ account_code: "320-0000", debit: 1500.5 }, { account_code: "500-0000", credit: 1500.5 }], was: WAS });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("fin_opening_accounts_save", {
      p_lines: [{ account_code: "320-0000", debit: 1500.5, credit: null }, { account_code: "500-0000", debit: null, credit: 1500.5 }],
      p_was: WAS,
    });
  });

  it("refuses an amount with three decimals before the database", async () => {
    const sb = stub({ data: null, error: null });
    expect((await call("PUT", "/accounts", { lines: [{ account_code: "320-0000", debit: 1.005 }], was: WAS })).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("saves one party with its open items", async () => {
    const sb = stub({ data: { id: ROW, updated_at: WAS }, error: null });
    const items = [{ doc_no: "INV-1", doc_date: "2026-08-01", due_date: null, amount: 30 }];
    const res = await call("POST", "/parties", { id: null, party_type: "SUPPLIER", party_id: PARTY, account_code: "400-0000", total: 50, items, was: WAS });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("fin_opening_party_save", {
      p_row_id: null, p_party_type: "SUPPLIER", p_party_id: PARTY, p_account_code: "400-0000", p_total: 50, p_items: items, p_was: WAS,
    });
  });

  it("passes a stale draft on as 409 with its reason", async () => {
    stub({ data: null, error: { code: "40001", message: "Someone else changed the opening balances. Reload to see them.", details: "opening_changed" } });
    const res = await call("PUT", "/stock", { rows: [{ unit_code: "U-1", unit_cost: 10 }], was: WAS });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "opening_changed", message: "Someone else changed the opening balances. Reload to see them." });
  });

  it("passes the database's sentence on when Post is refused", async () => {
    stub({ data: null, error: { code: "P0001", message: "Debits and credits differ by RM 20.00. 160-0000 Opening balance must be RM 0.00 after posting.", details: "opening_out_of_balance" } });
    const res = await call("POST", "/post", { was: WAS }, "principal");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "opening_out_of_balance" });
  });

  it("posts for the principal and names the entry", async () => {
    const sb = stub({ data: ROW, error: null });
    const res = await call("POST", "/post", { was: WAS }, "principal");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: ROW, entry_no: "JE-202609-0009" });
    expect(sb.rpc).toHaveBeenCalledWith("fin_opening_post", { p_was: WAS });
  });

  it("reverses with a reason only", async () => {
    const sb = stub({ data: ROW, error: null });
    expect((await call("POST", "/reverse", { reason: "  " }, "principal")).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect((await call("POST", "/reverse", { reason: "Cash figure wrong" }, "principal")).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("fin_opening_reverse", { p_reason: "Cash figure wrong" });
  });

  it("removes a party by its row, and refuses a malformed id", async () => {
    const sb = stub({ data: WAS, error: null });
    expect((await call("POST", "/parties/not-a-uuid/remove", { was: WAS })).status).toBe(404);
    expect((await call("POST", `/parties/${ROW}/remove`, { was: WAS })).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("fin_opening_party_remove", { p_row_id: ROW, p_was: WAS });
  });
});
