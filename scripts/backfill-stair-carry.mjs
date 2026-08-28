#!/usr/bin/env node
/**
 * BACKFILL THE STAIR-CARRY FEE ONTO EXISTING ORDERS (owner instruction YH,
 * 2026-08-29 — "fix them regardless; if they should be added, they get added").
 *
 * 0393 stamps the fee on orders created from now on. 0394 re-stamps it when the
 * floor, the lift flag or the count moves. Neither touches an order that already
 * existed, so this script does — once, deliberately, run by a human.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A MIGRATION ────────────────────────────────
 *
 * Two reasons, and both are rules rather than taste:
 *
 *  1. The fee formula lives in `packages/shared/src/stair-carry.ts`. A migration
 *     would have to re-implement it in PL/pgSQL, and ownership law D is that a
 *     derived fact has ONE arithmetic. This computes through the same function
 *     the POS confirm step, the create path and the re-stamp all use, then calls
 *     `order_stamp_stair_carry` (0394), which holds no formula.
 *  2. CLAUDE.md red line 8 — a migration may never assert a production row
 *     count. Schema is what it owns; data is what it walks past.
 *
 * ── WHAT IT CHANGES, SAID PLAINLY ───────────────────────────────────────────
 *
 * An affected order's TOTAL goes UP. An order previously showing "paid in full"
 * can therefore show money owing again, because the fee was always on the paper
 * the customer signed and was never on the order. That is the point of the fix,
 * and it is why this is a separate deliberate act rather than something a deploy
 * does quietly.
 *
 * It is idempotent. `order_stamp_stair_carry` deletes before inserting, so
 * running twice leaves the same one row, and an order whose fee is 0 (a lift, a
 * free floor, an unset count) ends with NO row rather than a zero one.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/backfill-stair-carry.mjs            # DRY RUN — prints, writes nothing
 *   node scripts/backfill-stair-carry.mjs --apply    # writes
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. The key
 * is never written to source (red line 3) — export it for the one command.
 */
import { createClient } from "@supabase/supabase-js";
import { stairCarryFee } from "@carres/shared";

const APPLY = process.argv.includes("--apply");
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const cfgRes = await sb
  .from("floor_config")
  .select("free_up_to_floor, per_floor_per_item")
  .eq("id", 1)
  .maybeSingle();
if (cfgRes.error || !cfgRes.data) {
  console.error("Could not read floor_config:", cfgRes.error?.message ?? "row missing");
  process.exit(1);
}
const cfg = {
  freeUpToFloor: Number(cfgRes.data.free_up_to_floor),
  perFloorPerItem: Number(cfgRes.data.per_floor_per_item),
};
console.log(
  `rate: free up to floor ${cfg.freeUpToFloor}, RM${cfg.perFloorPerItem} per floor per item`,
);
if (cfg.perFloorPerItem === 0) {
  console.log("The rate is 0 — every order computes RM 0 and nothing would change. Stopping.");
  process.exit(0);
}

const ordersRes = await sb
  .from("orders")
  .select(
    "id, so, delivery_floor, delivery_has_lift, delivery_stair_items, order_lines(qty), order_addons(addon_key, unit_price, qty)",
  );
if (ordersRes.error) {
  console.error("Could not read orders:", ordersRes.error.message);
  process.exit(1);
}

let wouldWrite = 0;
let wouldClear = 0;
let unchanged = 0;
let failed = 0;

for (const o of ordersRes.data ?? []) {
  const itemsTotal = (o.order_lines ?? []).reduce((n, l) => n + Number(l.qty), 0);
  const fee =
    Math.round(
      stairCarryFee(
        {
          floor: o.delivery_floor ?? 0,
          hasLift: o.delivery_has_lift ?? false,
          stairItems: o.delivery_stair_items,
          itemsTotal,
        },
        cfg,
      ) * 100,
    ) / 100;

  const existing = (o.order_addons ?? []).find((a) => a.addon_key === "STAIR_CARRY");
  const current = existing ? Number(existing.unit_price) * Number(existing.qty) : 0;
  if (current === fee) {
    unchanged += 1;
    continue;
  }

  const verb = fee > 0 ? (existing ? "correct" : "add") : "remove";
  if (fee > 0) wouldWrite += 1;
  else wouldClear += 1;
  console.log(
    `SO-${o.so}: ${verb} — floor ${o.delivery_floor}, ${o.delivery_has_lift ? "lift" : "no lift"}, ` +
      `${o.delivery_stair_items ?? "unset"} of ${itemsTotal} carried · RM${current} -> RM${fee}`,
  );

  if (APPLY) {
    const { error } = await sb.rpc("order_stamp_stair_carry", {
      p_order_id: o.id,
      p_fee: fee,
    });
    if (error) {
      failed += 1;
      console.error(`  FAILED SO-${o.so}: ${error.message}`);
    }
  }
}

console.log(
  `\n${APPLY ? "APPLIED" : "DRY RUN"} · ${wouldWrite} to add/correct · ${wouldClear} to remove · ` +
    `${unchanged} already right · ${failed} failed`,
);
if (!APPLY) console.log("Nothing was written. Re-run with --apply to write.");
