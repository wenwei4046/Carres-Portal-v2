import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { ghlFile, pbbFile } from "@carres/shared/__fixtures__/card-settlement-files";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/* A thin door: read the file, call ONE function, map the refusal. The matching
 * is proven on Postgres by src/test/card-settlement.integration.test.ts. */

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const USER_ID = "11111111-1111-1111-1111-000000000001";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const PAY_ID = "33333333-3333-4333-8333-333333333333";
const sale = { sett: "02092026", trans: "01092026", amt: "100.00", net: "99.00", mid: "900000000001", tid: "90000001", code: "A1B2C3", trace: "000101" };

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
    new Request(`http://t/api/finance/card-settlement${path}`, {
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

describe("/api/finance/card-settlement", () => {
  it.each([
    ["GET", "", undefined],
    ["POST", "/import", { acquirer: "PBB", fileName: "a.csv", content: pbbFile([sale]) }],
    ["POST", `/rows/${LINE_ID}/match`, { paymentId: PAY_ID }],
    ["POST", "/days/payout", {}],
  ])("%s %s refuses operation before the database", async (method, path, body) => {
    const sb = stubRpc({ data: null, error: null });
    expect((await call(method, path, body, "operation")).status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("reads the review", async () => {
    const review = { days: [], rows: [], payments: [] };
    const sb = stubRpc({ data: review, error: null });
    const res = await call("GET", "");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(review);
    expect(sb.rpc).toHaveBeenCalledWith("card_settlement_review");
  });

  it("imports the parsed rows with the whole file", async () => {
    const content = pbbFile([sale]);
    const sb = stubRpc({ data: { file_id: "f", rows: 1, imported: 1, matched: 1 }, error: null });
    const res = await call("POST", "/import", { acquirer: "PBB", fileName: " sept.csv ", content });
    expect(res.status).toBe(201);
    const [fn, args] = sb.rpc.mock.calls[0];
    expect(fn).toBe("card_settlement_import");
    expect(args).toMatchObject({ p_acquirer: "PBB", p_file_name: "sept.csv", p_content: content, p_published: null });
    expect(args.p_rows).toHaveLength(1);
    expect(args.p_rows[0]).toMatchObject({ approval_code: "A1B2C3", amount: 100, net_amount: 99 });
  });

  it("a GHL file's paid-out date is its statement date from the file name, or nothing", async () => {
    const content = ghlFile([{ at: "2026-09-16 10:00:00.0", amount: "300.00", fee: "3.90", net: "296.10", tid: "T1", txId: "1" }]);
    const sb = stubRpc({ data: { file_id: "f", rows: 1, imported: 1, matched: 0 }, error: null });
    await call("POST", "/import", { acquirer: "GHL", fileName: "StatementOfAccountDetails2026-09-17_1.csv", content });
    expect(sb.rpc.mock.calls[0][1].p_rows[0]).toMatchObject({ txn_date: "2026-09-16", payout_date: "2026-09-17" });
    await call("POST", "/import", { acquirer: "GHL", fileName: "ghl.csv", content });
    expect(sb.rpc.mock.calls[1][1].p_rows[0]).toMatchObject({ txn_date: "2026-09-16", payout_date: null });
  });

  it("Approve day calls the one payout door with the day and the staff's accounts and date", async () => {
    const sb = stubRpc({ data: { move_id: "m", move_no: "MM-1" }, error: null });
    const key = "44444444-4444-4444-8444-444444444444";
    const res = await call("POST", "/days/payout", {
      acquirer: "GHL", dayDate: "2026-09-16", groupKey: "T1", moveDate: "2026-09-17",
      fromAccountCode: "H", toAccountCode: "B", note: null, idempotencyKey: key,
    });
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("card_settlement_payout_prepare", {
      p_acquirer: "GHL", p_day_date: "2026-09-16", p_group_key: "T1", p_move_date: "2026-09-17",
      p_from_account_code: "H", p_to_account_code: "B", p_note: null, p_idempotency_key: key,
    });
  });

  it("Approve day without a date is refused before the database; a second payout keeps the database's sentence", async () => {
    const sb = stubRpc({ data: null, error: { code: "22023", message: "The payout for this day is already prepared.", details: "payout_exists" } });
    const day = { acquirer: "PBB", dayDate: "2026-09-18", groupKey: "M / T", fromAccountCode: "H", toAccountCode: "B", idempotencyKey: PAY_ID };
    const noDate = await call("POST", "/days/payout", { ...day, moveDate: "" });
    expect(noDate.status).toBe(422);
    expect(await noDate.json()).toMatchObject({ message: "Choose a date." });
    expect(sb.rpc).not.toHaveBeenCalled();
    const twice = await call("POST", "/days/payout", { ...day, moveDate: "2026-09-18" });
    expect(twice.status).toBe(422);
    expect(await twice.json()).toMatchObject({ code: "payout_exists", message: "The payout for this day is already prepared." });
  });

  it("refuses a reversal before the database, in one sentence", async () => {
    const sb = stubRpc({ data: null, error: null });
    const res = await call("POST", "/import", {
      acquirer: "GHL",
      fileName: "ghl.csv",
      content: ghlFile([{ at: "2026-09-03 10:00:00.0", amount: "300.00", fee: "0", net: "300.00", tid: "T1", txId: "1", code: "REFUND" }]),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      code: "file_refused",
      message: "Row 2 is a refund, void or chargeback. Carres cannot import it yet. Give the file to IT.",
    });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("refuses the wrong card company's file", async () => {
    const sb = stubRpc({ data: null, error: null });
    const res = await call("POST", "/import", { acquirer: "MAYBANK", fileName: "a.csv", content: pbbFile([sale]) });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ message: "This is not a Maybank settlement file. Check the card company and the file." });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("keeps the database's reason for a file imported before", async () => {
    stubRpc({ data: null, error: { code: "22023", message: "This file was imported before.", details: "file_imported" } });
    const res = await call("POST", "/import", { acquirer: "PBB", fileName: "a.csv", content: pbbFile([sale]) });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "file_imported", message: "This file was imported before." });
  });

  it("matches a row, and takes a match off with null", async () => {
    const sb = stubRpc({ data: { id: LINE_ID, payment_id: PAY_ID, matched_how: "suggestion" }, error: null });
    expect((await call("POST", `/rows/${LINE_ID}/match`, { paymentId: PAY_ID })).status).toBe(200);
    expect(sb.rpc).toHaveBeenLastCalledWith("card_settlement_match", { p_line_id: LINE_ID, p_payment_id: PAY_ID });
    expect((await call("POST", `/rows/${LINE_ID}/match`, { paymentId: null })).status).toBe(200);
    expect(sb.rpc).toHaveBeenLastCalledWith("card_settlement_match", { p_line_id: LINE_ID, p_payment_id: null });
  });

  it("a row that is not a uuid is not there; a missing row is a 404", async () => {
    const sb = stubRpc({ data: null, error: { code: "P0002", message: "That settlement row is not there.", details: "row_not_found" } });
    expect((await call("POST", "/rows/nope/match", { paymentId: PAY_ID })).status).toBe(404);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect((await call("POST", `/rows/${LINE_ID}/match`, { paymentId: PAY_ID })).status).toBe(404);
  });
});
