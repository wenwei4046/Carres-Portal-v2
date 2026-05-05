import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Codex R5 regression test: migration 0046 installs a BEFORE UPDATE trigger
// on purchase_orders that enforces an LP-role column whitelist. LPs may only
// update partner_accepted_at / partner_rejected_at / partner_inbound_accepted_at
// / partner_inbound_rejected_at. Any attempt to update any other column from
// an LP-role JWT must raise SQLSTATE 42501 with detail
// 'lp_column_whitelist_violation'.
//
// Pre-condition: LP test user lp-test@x.com seeded (Task 23). Test PO assigned
// to LP exists. Un-fixme this test once those preconditions are met.
test.fixme("LP UPDATE column whitelist enforces 42501 on non-whitelisted columns", async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
  const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ?? "";
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { error: signInErr } = await sb.auth.signInWithPassword({
    email: "lp-test@x.com",
    password: "lp-test-password",
  });
  expect(signInErr).toBeNull();

  const TEST_PO_ID = "PO-FIXTURE-LP";

  // Whitelisted column UPDATE → should pass trigger (may still fail state guard 22023 if RFD not pending)
  const ok = await sb.from("purchase_orders").update({ partner_accepted_at: new Date().toISOString() }).eq("id", TEST_PO_ID);
  // Either succeeds OR fails with 22023 — but NEVER 42501 from trigger (Codex R5)
  if (ok.error) {
    expect(ok.error.code).not.toBe("42501");
  }

  // Non-whitelisted column UPDATEs → 42501 from trigger
  const blockedWh = await sb.from("purchase_orders").update({ warehouse_id: "fake-wh-id" }).eq("id", TEST_PO_ID);
  expect(blockedWh.error?.code).toBe("42501");
  expect(blockedWh.error?.details ?? "").toContain("lp_column_whitelist_violation");

  const blockedDp = await sb.from("purchase_orders").update({ delivery_partner_id: "00000000-0000-0000-0000-000000000000" }).eq("id", TEST_PO_ID);
  expect(blockedDp.error?.code).toBe("42501");

  const blockedSup = await sb.from("purchase_orders").update({ sup_status: "delivered" }).eq("id", TEST_PO_ID);
  expect(blockedSup.error?.code).toBe("42501");
});
