import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

// The retired refunds and bank reconciliation doors are gone: no route may
// answer them, even for a finance user. userClient throws so a surviving
// route cannot pass by accident.
vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(() => {
    throw new Error("no route should reach the database");
  }),
}));

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};

const ID = "00000000-0000-0000-0000-0000000bb001";

beforeEach(() => useTestJwks());
afterAll(() => _setJwksForTesting(null));

describe("retired finance doors answer 404", () => {
  it.each([
    ["GET", "/api/finance/refunds"],
    ["POST", "/api/finance/refunds/create"],
    ["POST", `/api/finance/refunds/${ID}/apply`],
    ["POST", `/api/finance/refunds/${ID}/pay`],
    ["GET", "/api/finance/bank-statements"],
    ["POST", "/api/finance/bank-statements"],
    ["GET", `/api/finance/reconciliations/suggest/${ID}`],
    ["POST", "/api/finance/reconciliations"],
    ["DELETE", `/api/finance/reconciliations/${ID}`],
  ])("%s %s", async (method, path) => {
    const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", {
      email: "finance@x",
      app_metadata: { role: "finance" },
    });
    const res = await app.fetch(
      new Request(`http://t${path}`, {
        method,
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});
