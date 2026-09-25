import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/* A thin door: validate, call ONE function, map the refusal. The rules
 * (accounts, who approves, what posts) are proven on Postgres by
 * src/test/money-moves.integration.test.ts. */

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const USER_ID = "11111111-1111-1111-1111-000000000001";
const MOVE_ID = "22222222-2222-4222-8222-222222222222";
const good = {
  kind: "CARD_PAYOUT",
  move_date: "2026-09-17",
  from_account_code: "1131",
  to_account_code: "1123",
  amount: 97.5,
  fee: 2.5,
  reference: " PO123 ",
  idempotency_key: "33333333-3333-4333-8333-333333333333",
};

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
    new Request(`http://t/api/finance/money-moves${path}`, {
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

describe("/api/finance/money-moves", () => {
  it.each([
    ["GET", "", undefined],
    ["POST", "", good],
    ["POST", `/${MOVE_ID}/approve`, undefined],
    ["POST", `/${MOVE_ID}/reverse`, { reason: "x" }],
  ])("%s %s refuses operation before the database", async (method, path, body) => {
    const sb = stubRpc({ data: [], error: null });
    expect((await call(method, path, body, "operation")).status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("prepares with the trimmed reference", async () => {
    const sb = stubRpc({ data: MOVE_ID, error: null });
    const res = await call("POST", "", good);
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("gl_money_move_create", {
      p_kind: "CARD_PAYOUT",
      p_move_date: "2026-09-17",
      p_from_account_code: "1131",
      p_to_account_code: "1123",
      p_amount: 97.5,
      p_fee: 2.5,
      p_reference: "PO123",
      p_note: null,
      p_idempotency_key: good.idempotency_key,
    });
  });

  it("refuses a fee on a transfer before the database", async () => {
    const sb = stubRpc({ data: MOVE_ID, error: null });
    expect((await call("POST", "", { ...good, kind: "TRANSFER" })).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("keeps the database's sentence on a wrong account", async () => {
    stubRpc({ data: null, error: { code: "22023", message: "A card payout goes into a bank account in use.", details: "to_account_refused" } });
    const res = await call("POST", "", good);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toBe("A card payout goes into a bank account in use.");
  });

  it("approve calls its function; the preparer's refusal keeps its code", async () => {
    const sb = stubRpc({ data: "e1", error: null });
    expect((await call("POST", `/${MOVE_ID}/approve`)).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("gl_money_move_approve", { p_move_id: MOVE_ID });

    stubRpc({ data: null, error: { code: "42501", message: "You prepared money move MM-1, so somebody else must approve it.", details: "preparer_cannot_approve" } });
    const res = await call("POST", `/${MOVE_ID}/approve`);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "preparer_cannot_approve" });
  });

  it("reverse needs a reason and passes it", async () => {
    const sb = stubRpc({ data: MOVE_ID, error: null });
    expect((await call("POST", `/${MOVE_ID}/reverse`, { reason: " " })).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect((await call("POST", `/${MOVE_ID}/reverse`, { reason: "wrong bank" })).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("gl_money_move_reverse", { p_move_id: MOVE_ID, p_reason: "wrong bank" });
  });

  it("a malformed id is a 404", async () => {
    const sb = stubRpc({ data: null, error: null });
    expect((await call("POST", "/abc/approve")).status).toBe(404);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("GET /me says whether this person may approve", async () => {
    const sb = stubRpc({ data: true, error: null });
    expect(await (await call("GET", "/me")).json()).toEqual({ mayApprove: true });
    expect(sb.rpc).toHaveBeenCalledWith("has_finance_approver", { p_user_id: USER_ID });
  });
});
