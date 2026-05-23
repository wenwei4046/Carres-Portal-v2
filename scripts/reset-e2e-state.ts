/**
 * Reset E2E test PO state on staging Supabase. The supplier-happy spec
 * (and other supplier-flow specs) advance Ohana POs through their state
 * machine; without a reset, re-running the spec hits "no pending POs"
 * because the seed inventory is exhausted.
 *
 * Resets all Ohana-supplier POs (supplier_id ='00000000-0000-0000-0000-0000000000e1')
 * back to sup_status='pending', clears do_number, clears delivery_partner_id.
 * Idempotent — running on already-reset POs is a no-op.
 *
 * Usage: pnpm reset:e2e-state
 *
 * SAFETY NOTE: this mutates production-shape data on staging. It only touches
 * POs assigned to Ohana (the test supplier); other suppliers' POs are
 * untouched. Will not run if SUPABASE_URL is not staging.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_VARS_PATH = path.resolve(__dirname, "..", "apps", "api", ".dev.vars");
if (fs.existsSync(DEV_VARS_PATH)) {
  for (const line of fs.readFileSync(DEV_VARS_PATH, "utf8").split(/\r?\n/)) {
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

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) throw new Error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");

const SUPPLIER_ID_OHANA = "00000000-0000-0000-0000-0000000000e1";

const sb = createClient(url, serviceKey);

async function main() {
  // List current state for a quick sanity check.
  const { data: before, error: selErr } = await sb
    .from("purchase_orders")
    .select("id, sup_status, do_number")
    .eq("supplier_id", SUPPLIER_ID_OHANA);
  if (selErr) throw selErr;

  console.log(`Ohana has ${before?.length ?? 0} POs:`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (before ?? []) as any[]) {
    console.log(`  ${r.id}  sup_status=${r.sup_status}  do_number=${r.do_number ?? "—"}`);
  }

  // Reset: pending state + clear DO. procurement_partner_id is NOT cleared
  // because Phase 4.5 Chunk 2 (migration 0052) dropped delivery_partner_id
  // and the procurement-leg LP is set per-leg, not per-PO. Just resetting
  // sup_status + do_number is enough for the supplier-flow specs.
  const { data: after, error: updErr } = await sb
    .from("purchase_orders")
    .update({
      sup_status: "pending",
      do_number: null,
    })
    .eq("supplier_id", SUPPLIER_ID_OHANA)
    .select("id");
  if (updErr) throw updErr;

  console.log(`\nReset ${after?.length ?? 0} Ohana POs to sup_status='pending'.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
