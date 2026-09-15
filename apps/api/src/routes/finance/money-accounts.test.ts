import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/* A thin door: validate, call ONE function with the caller's JWT, map the
 * refusal. What the functions decide (next free code, the RM 0.00 rule, the
 * role check) is proven against Postgres by the 0512 probe. */

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const USER_ID = "11111111-1111-1111-1111-000000000001";

function stubRpc(result: { data: unknown; error: unknown }) {
  const sb = { rpc: vi.fn().mockResolvedValue(result) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return sb;
}

async function call(method: string, path: string, body?: unknown, role = "finance") {
  const jwt = await signTestJwt(USER_ID, { email: `${role}@x`, app_metadata: { role } });
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return app.fetch(
    new Request(`http://t/api/finance/ledger/money-accounts${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("who may use /api/finance/ledger/money-accounts", () => {
  it.each([
    ["GET", "", undefined],
    ["POST", "", { name: "CIMB", kind: "BANK" }],
    ["PATCH", "/1121", { name: "Public Bank", is_active: false }],
  ])("%s refuses operation with 403 and never reaches the database", async (method, path, body) => {
    const sb = stubRpc({ data: [], error: null });
    const res = await call(method, path, body, "operation");
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("admits principal", async () => {
    stubRpc({ data: [], error: null });
    expect((await call("GET", "", undefined, "principal")).status).toBe(200);
  });
});

describe("the list", () => {
  it("GET passes the database's rows through", async () => {
    const rows = [{ code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true }];
    const sb = stubRpc({ data: rows, error: null });
    const res = await call("GET", "");
    expect(sb.rpc).toHaveBeenCalledWith("gl_money_accounts_list");
    expect(await res.json()).toEqual(rows);
  });

  it("a list that could not be read is an error, never an empty list", async () => {
    stubRpc({ data: null, error: { code: "42501", message: "The money accounts are for Finance." } });
    expect((await call("GET", "")).status).toBe(403);
  });
});

describe("add", () => {
  it("sends the trimmed name and the kind; the database picks the code", async () => {
    const sb = stubRpc({ data: "1125", error: null });
    const res = await call("POST", "", { name: "  CIMB ", kind: "BANK" });
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("gl_money_account_add", { p_name: "CIMB", p_kind: "BANK" });
    expect(await res.json()).toEqual({ code: "1125" });
  });

  it("refuses cash and a blank name before the database", async () => {
    const sb = stubRpc({ data: "x", error: null });
    expect((await call("POST", "", { name: "Petty cash", kind: "CASH" })).status).toBe(422);
    expect((await call("POST", "", { name: " ", kind: "HOLDING" })).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("keeps the database's sentence when the range is full", async () => {
    stubRpc({
      data: null,
      error: { code: "P0001", message: "Codes 1131-1139 are all used.", details: "no_code_left" },
    });
    const res = await call("POST", "", { name: "Stripe", kind: "HOLDING" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toBe("Codes 1131-1139 are all used.");
  });
});

describe("rename and take out of use", () => {
  it("sends the code, the name and in use", async () => {
    const sb = stubRpc({ data: "1124", error: null });
    const res = await call("PATCH", "/1124", { name: "RHB Bank", is_active: false });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("gl_money_account_update", {
      p_code: "1124",
      p_name: "RHB Bank",
      p_is_active: false,
    });
  });

  it("a code that is not four digits is not on the list", async () => {
    const sb = stubRpc({ data: null, error: null });
    expect((await call("PATCH", "/abc", { name: "X", is_active: true })).status).toBe(404);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("an account not at RM 0.00 stays in use, in the database's words", async () => {
    stubRpc({
      data: null,
      error: {
        code: "P0001",
        message: "1121 Public Bank is not at RM 0.00 in the ledger. It stays in use until it is.",
        details: "money_account_not_zero",
      },
    });
    const res = await call("PATCH", "/1121", { name: "Public Bank", is_active: false });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("money_account_not_zero");
  });

  it("an account a payment method points at stays in use, in the database's words", async () => {
    const sentence =
      "Bank transfer still uses 1121 Public Bank. Move Bank transfer to another account first.";
    stubRpc({ data: null, error: { code: "P0001", message: sentence, details: "money_account_used_by_method" } });
    const res = await call("PATCH", "/1121", { name: "Public Bank", is_active: false });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "money_account_used_by_method", message: sentence });

    // The refusal lives in the database door, so a curl round the API meets it too.
    const mig = fs.readFileSync(
      path.resolve(__dirname, "../../../../../supabase/migrations/0515_a_money_account_stays_in_use_while_a_payment_method_points_at_it.sql"),
      "utf-8",
    );
    const door = mig.slice(mig.indexOf("function public.gl_money_account_update"), mig.indexOf("comment on function public.gl_money_account_update"));
    expect(door).toContain("from public.gl_payment_account_map g");
    expect(door).toContain("m.active");
    expect(door).toContain("Move % to another account first.");
    expect(door).toContain("detail = 'money_account_used_by_method'");
  });

  it("an unknown code is 404", async () => {
    stubRpc({ data: null, error: { code: "P0002", message: "That money account is not on the list." } });
    expect((await call("PATCH", "/1199", { name: "X", is_active: true })).status).toBe(404);
  });
});
