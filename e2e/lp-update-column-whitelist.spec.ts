import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Load apps/api/.dev.vars so process.env has SUPABASE_URL + SUPABASE_ANON_KEY
// (Playwright config doesn't auto-load Wrangler-format vars; do it here).
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

// Codex R5 regression test: migration 0046 (NULL-safe in 0067, stale-cols
// dropped in 0068) installs a BEFORE UPDATE trigger on purchase_orders that
// enforces an LP-role column whitelist. LPs may only update partner_accepted_at,
// partner_rejected_at, customer_rejection. Any attempt to update a non-
// whitelisted column from an LP-role JWT MUST raise SQLSTATE 42501 with
// detail 'lp_column_whitelist_violation'.
//
// Pre-condition: pnpm seed:test-users && pnpm seed:e2e-fixtures (lp-test +
// PO-FIXTURE-LP both seeded).
//
// 2026-05-09 rewrite: original spec referenced `delivery_partner_id` (dropped
// 0052). Rewritten to use `sup_status` (still on the table, in the blocklist).
test("LP UPDATE column whitelist enforces 42501 on non-whitelisted columns", async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
  expect(SUPABASE_URL).toBeTruthy();
  expect(SUPABASE_ANON).toBeTruthy();

  const sb = createClient(SUPABASE_URL!, SUPABASE_ANON!);
  const { error: signInErr } = await sb.auth.signInWithPassword({
    email: "lp-test@x.com",
    password: "lp-test-password",
  });
  expect(signInErr).toBeNull();

  const TEST_PO_ID = "PO-FIXTURE-LP";

  // Whitelisted column UPDATE → trigger lets it through. Might still fail RLS
  // RESTRICTIVE policy `partner_updates_rfd_fields` if state is wrong, but the
  // failure code MUST NOT be 42501 from our trigger.
  const ok = await sb
    .from("purchase_orders")
    .update({ partner_accepted_at: new Date().toISOString() })
    .eq("id", TEST_PO_ID);
  if (ok.error) {
    expect(ok.error.code).not.toBe("42501");
  }

  // Non-whitelisted column UPDATE → 42501 from trigger. Use sup_status
  // (exists on table + in trigger blocklist).
  const blockedSup = await sb
    .from("purchase_orders")
    .update({ sup_status: "delivered" })
    .eq("id", TEST_PO_ID);
  expect(blockedSup.error?.code).toBe("42501");
  expect(blockedSup.error?.details ?? "").toContain("lp_column_whitelist_violation");

  // Try another blocked column to be thorough.
  const blockedWh = await sb
    .from("purchase_orders")
    .update({ warehouse_id: "00000000-0000-0000-0000-000000000000" })
    .eq("id", TEST_PO_ID);
  expect(blockedWh.error?.code).toBe("42501");

  // procurement_partner_id (renamed from delivery_partner_id in 0052; in 0068's
  // updated blocklist) should also be rejected.
  const blockedPp = await sb
    .from("purchase_orders")
    .update({ procurement_partner_id: "00000000-0000-0000-0000-000000000000" })
    .eq("id", TEST_PO_ID);
  expect(blockedPp.error?.code).toBe("42501");
});
