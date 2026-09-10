/**
 * SEED THE CATALOG FACTS THAT BUYING NEEDS (owner request YH, 2026-09-02 —
 * "help me with the mass input of dummy catalog cost and price info? cuz when
 * it goes live these will be filled in again").
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * `/operation?tab=purchase` could not tick a single checkbox. It was reported
 * twice as a UI bug and it never was one: a row is buyable only when the SERVER
 * can hand it an `issueRef`, and it refuses to when the catalog cannot price the
 * goods. The register said so in the row expansion — "Catalog cost is missing /
 * Set the cost of H1401S in Catalog" — and nowhere else, which is a separate
 * defect now fixed.
 *
 * Three facts gate a purchase, and they gate it IN THIS ORDER. Fixing one only
 * reveals the next, which is why this script does all three in one pass:
 *
 *   1. `product_skus.supplier_id`   — else the demand is `no_supplier`
 *   2. `product_skus.cost` > 0      — else `no_cost`   ← what stopped YH
 *   3. `purchasing_production_days` — else `no_production_days`
 *      (a row per supplier × category; 0303 states there is deliberately NO
 *      per-category default to fall back on)
 *
 * ── THIS IS NOT A BACKFILL ──────────────────────────────────────────────────
 *
 * CLAUDE.md §6: every row in the database today is TEST data, at go-live it
 * starts CLEAN, and no cleanup card may be written for imported rows. This is
 * not that. It writes DUMMY configuration so the buying path can be exercised
 * before go-live, and §6 is explicit that live rows exist to prove the CODE
 * works. The real numbers are typed in Catalog at go-live and nothing here
 * survives that.
 *
 * It is therefore deliberately COWARDLY: it never overwrites a value somebody
 * set, only fills absences. Run it twice and the second run writes nothing.
 *
 * ── WHY A SCRIPT AND NOT A MIGRATION ────────────────────────────────────────
 *
 * Red line 8 — a migration may never assert a production row count. Schema is
 * what it owns; data is what it walks past. Same reasoning as
 * `backfill-stair-carry.ts`, and the same runner.
 *
 * ── USAGE (from the repo root) ──────────────────────────────────────────────
 *
 *   pnpm seed:catalog-costs                    # DRY RUN — prints, writes nothing
 *   pnpm seed:catalog-costs -- --apply         # writes
 *   pnpm seed:catalog-costs -- --cost 250      # default cost when there is no
 *                                              # price to derive one from
 *   pnpm seed:catalog-costs -- --supplier "Nice Future" --apply
 *                                              # also adopt SKUs that have NO
 *                                              # supplier at all
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. The key
 * is a Cloudflare Worker secret and never lives in this repo (red line 3).
 *
 * ⛔ SUPPLIER IS NOT GUESSED. A supplier is a business relationship, so a SKU
 * with none is REPORTED and skipped unless you name the supplier to adopt it
 * with `--supplier`. Cost is a number nobody has stated yet; a supplier is a
 * factory somebody chose.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "The service-role key is a Worker secret — never commit it.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const argValue = (flag: string): string | null => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1]! : null;
};
/** The cost used when a SKU has no price to derive one from. */
const FALLBACK_COST = Number(argValue("--cost") ?? 200);
/** A margin that keeps dummy money plausible: cost is 60% of the sell price. */
const COST_RATIO = 0.6;
const ADOPT_SUPPLIER = argValue("--supplier");

/** 0303's own seed numbers, so this agrees with the migration rather than
 *  inventing a second set. */
const PRODUCTION_DAYS: Record<string, number> = { sofa: 14, bedframe: 7, mattress: 7 };

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const money = (n: number) => Math.round(n * 100) / 100;

type SkuRow = {
  id: string;
  sku: string;
  cost: number | null;
  price: number | null;
  supplier_id: string | null;
  discontinued_at: string | null;
  product_models: { category: string | null } | null;
};

async function main() {
  console.log(APPLY ? "APPLY — this writes.\n" : "DRY RUN — nothing is written.\n");

  const { data: skus, error } = await sb
    .from("product_skus")
    .select("id, sku, cost, price, supplier_id, discontinued_at, product_models(category)")
    .order("sku");
  if (error) throw new Error(`read product_skus: ${error.message}`);

  const rows = (skus ?? []) as unknown as SkuRow[];
  /* A discontinued SKU is not bought, so it is not a blocker and not our
     business. Filling it would be noise in the report and noise in the data. */
  const live = rows.filter((r) => r.discontinued_at == null);

  const { data: suppliers, error: supErr } = await sb.from("suppliers").select("id, name");
  if (supErr) throw new Error(`read suppliers: ${supErr.message}`);
  const supplierByName = new Map(
    (suppliers ?? []).map((s: { id: string; name: string }) => [s.name.toLowerCase(), s.id]),
  );

  let adoptId: string | null = null;
  if (ADOPT_SUPPLIER) {
    adoptId = supplierByName.get(ADOPT_SUPPLIER.toLowerCase()) ?? null;
    if (!adoptId) {
      console.error(
        `No supplier named "${ADOPT_SUPPLIER}". Known: ` +
          (suppliers ?? []).map((s: { name: string }) => s.name).join(", "),
      );
      process.exit(1);
    }
  }

  // ── 1 · supplier ─────────────────────────────────────────────────────────
  const noSupplier = live.filter((r) => r.supplier_id == null);
  if (noSupplier.length > 0) {
    console.log(`SUPPLIER MISSING — ${noSupplier.length} SKU(s)`);
    for (const r of noSupplier) console.log(`  ${r.sku}`);
    if (adoptId) {
      console.log(`  → adopting all of them to "${ADOPT_SUPPLIER}"`);
      if (APPLY) {
        const { error: e } = await sb
          .from("product_skus")
          .update({ supplier_id: adoptId })
          .in("id", noSupplier.map((r) => r.id));
        if (e) throw new Error(`write supplier: ${e.message}`);
        for (const r of noSupplier) r.supplier_id = adoptId;
      } else {
        for (const r of noSupplier) r.supplier_id = adoptId; // so steps 2-3 report truly
      }
    } else {
      console.log(
        "  → SKIPPED. A supplier is a factory somebody chose, not a number\n" +
          '     nobody stated. Re-run with --supplier "<name>" to adopt them.',
      );
    }
    console.log("");
  }

  // ── 2 · cost, and the price it is derived from ───────────────────────────
  const needsCost = live.filter((r) => r.cost == null || Number(r.cost) <= 0);
  const needsPrice = live.filter((r) => r.price == null || Number(r.price) <= 0);
  console.log(`COST MISSING  — ${needsCost.length} SKU(s)`);
  console.log(`PRICE MISSING — ${needsPrice.length} SKU(s)\n`);

  const writes: Array<{ id: string; sku: string; cost?: number; price?: number }> = [];
  for (const r of live) {
    const hasCost = r.cost != null && Number(r.cost) > 0;
    const hasPrice = r.price != null && Number(r.price) > 0;
    if (hasCost && hasPrice) continue;

    const w: { id: string; sku: string; cost?: number; price?: number } = {
      id: r.id,
      sku: r.sku,
    };
    if (!hasCost) {
      /* Derive from the sell price where there is one — a flat number on every
         SKU makes every margin identical and hides arithmetic bugs that only
         show when the numbers differ. */
      w.cost = money(hasPrice ? Number(r.price) * COST_RATIO : FALLBACK_COST);
    }
    if (!hasPrice) {
      w.price = money(hasCost ? Number(r.cost) / COST_RATIO : FALLBACK_COST / COST_RATIO);
    }
    writes.push(w);
  }

  for (const w of writes) {
    const parts = [
      w.cost !== undefined ? `cost=${w.cost.toFixed(2)}` : null,
      w.price !== undefined ? `price=${w.price.toFixed(2)}` : null,
    ].filter(Boolean);
    console.log(`  ${w.sku.padEnd(18)} ${parts.join("  ")}`);
  }
  if (writes.length === 0) console.log("  (nothing to fill)");
  console.log("");

  if (APPLY) {
    for (const w of writes) {
      const patch: Record<string, number> = {};
      if (w.cost !== undefined) patch.cost = w.cost;
      if (w.price !== undefined) patch.price = w.price;
      const { error: e } = await sb.from("product_skus").update(patch).eq("id", w.id);
      if (e) throw new Error(`write ${w.sku}: ${e.message}`);
    }
    console.log(`Wrote ${writes.length} SKU row(s).\n`);
  }

  // ── 3 · production days, per supplier × category ─────────────────────────
  const { data: existing, error: pdErr } = await sb
    .from("purchasing_production_days")
    .select("supplier_id, category");
  if (pdErr) throw new Error(`read production days: ${pdErr.message}`);
  const have = new Set(
    (existing ?? []).map(
      (r: { supplier_id: string; category: string }) => `${r.supplier_id}::${r.category}`,
    ),
  );

  const wanted = new Map<string, { supplier_id: string; category: string }>();
  for (const r of live) {
    const category = r.product_models?.category ?? null;
    if (!r.supplier_id || !category) continue;
    if (!(category in PRODUCTION_DAYS)) continue; // only the three the table admits
    const key = `${r.supplier_id}::${category}`;
    if (!have.has(key)) wanted.set(key, { supplier_id: r.supplier_id, category });
  }

  console.log(`PRODUCTION DAYS MISSING — ${wanted.size} supplier × category pair(s)`);
  for (const { supplier_id, category } of wanted.values()) {
    const name =
      (suppliers ?? []).find((s: { id: string }) => s.id === supplier_id)?.name ?? supplier_id;
    console.log(`  ${String(name).padEnd(22)} ${category.padEnd(10)} ${PRODUCTION_DAYS[category]} days`);
  }
  if (wanted.size === 0) console.log("  (nothing to fill)");
  console.log("");

  if (APPLY && wanted.size > 0) {
    const { error: e } = await sb.from("purchasing_production_days").insert(
      [...wanted.values()].map((w) => ({
        supplier_id: w.supplier_id,
        category: w.category,
        working_days: PRODUCTION_DAYS[w.category]!,
      })),
    );
    if (e) throw new Error(`write production days: ${e.message}`);
    console.log(`Wrote ${wanted.size} production-day row(s).\n`);
  }

  if (!APPLY) {
    console.log("Nothing was written. Re-run with --apply to write.");
  } else {
    console.log("Done. Reload /operation?tab=purchase — the rows should tick.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
