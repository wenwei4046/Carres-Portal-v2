import { test, expect, request as pwRequest } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Load apps/api/.dev.vars so process.env has SUPABASE_URL + SUPABASE_ANON_KEY
// for the supabase-js sign-in (we need a real logistics JWT for the API call).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_VARS = path.resolve(__dirname, "..", "apps", "api", ".dev.vars");
if (fs.existsSync(DEV_VARS)) {
  for (const line of fs.readFileSync(DEV_VARS, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const API_URL = process.env.API_URL ?? "http://localhost:8787";
const THREAD_ID = "99999999-7777-7777-7777-000000007777";
const PARTNER_JT_EXPRESS = "00000000-0000-0000-0000-0000000000f1";

// Race-condition regression: dispatch-customer-leg uses
// logistics_dispatch_customer_leg RPC (migration 0051). The RPC takes
// FOR UPDATE on the thread row. Two concurrent forceDispatch calls serialize:
// the first wins (200, thread → 'dispatched'), the second sees the new
// state via state guard (logistics_stage <> 'ready_to_dispatch') → SQLSTATE
// 22023 → mapPgError → HTTP 422.
//
// 2026-05-09 rewrite: original spec used pre-Chunk-2 URL/body shape (path
// param :id, snake_case body, partner_id `0001f1`). Chunk 2 (Sprint B,
// migration 0051 + apps/api/src/routes/logistics/dispatch-customer-leg.ts)
// rewrote the route: thread-id in body, camelCase, no path param, partner =
// JT Express (the seeded partner). Plus pre-condition is now seeded by
// `pnpm seed:e2e-fixtures` (thread `99999999-7777-...-000000007777` at
// logistics_stage='ready_to_dispatch'). Fixture's idempotent reset DELETE
// + reinsert ensures every run starts clean.
test("Concurrent dispatch-customer-leg on same thread: exactly one succeeds", async () => {
  // ----- Get a real logistics JWT via supabase-js sign-in --------------------
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
  expect(SUPABASE_URL).toBeTruthy();
  expect(SUPABASE_ANON).toBeTruthy();

  const sb = createClient(SUPABASE_URL!, SUPABASE_ANON!);
  const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({
    email: "logistics-test@x.com",
    password: "logistics-test-password",
  });
  expect(signInErr).toBeNull();
  const jwt = signInData.session?.access_token;
  expect(jwt).toBeTruthy();

  // ----- Fire 2 concurrent dispatch-customer-leg POSTs ----------------------
  const headers = {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({
    threadId: THREAD_ID,
    partnerId: PARTNER_JT_EXPRESS,
    confirmDeliveryDate: "2026-05-25",
    forceDispatch: true,
  });
  const url = `${API_URL}/api/logistics/pos/dispatch-customer-leg`;

  // Two independent request contexts so HTTP/2 multiplexing doesn't serialize
  // the calls before they reach the API. (Playwright's `request` fixture
  // shares a connection by default; manual contexts give true parallelism.)
  const [ctx1, ctx2] = await Promise.all([
    pwRequest.newContext(),
    pwRequest.newContext(),
  ]);

  const [r1, r2] = await Promise.all([
    ctx1.post(url, { headers, data: body }),
    ctx2.post(url, { headers, data: body }),
  ]);

  // Capture status + body BEFORE disposing the contexts (dispose invalidates
  // the response object).
  const s1 = r1.status();
  const s2 = r2.status();
  const failingBody = await (s1 === 422 ? r1 : r2).json();

  await Promise.all([ctx1.dispose(), ctx2.dispose()]);

  // First wins (200), second sees state guard → 422 (from mapPgError 22023→422).
  const statuses = [s1, s2].sort();
  expect(statuses[0]).toBe(200);
  expect(statuses[1]).toBe(422);

  // The 422 body should carry an error code (mapPgError surfaces the SQLSTATE
  // through `code`).
  expect(failingBody).toHaveProperty("code");
});
