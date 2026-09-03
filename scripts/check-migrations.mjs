import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import {
  findCollisions,
  staleBaselineEntries,
  collisionMessage,
} from "./migration-collisions.mjs";

/* The directory is overridable so the gate's own regression test can run THE
   SHIPPED SCRIPT against a fixture instead of a copy of its logic. */
const DEFAULT_DIR = "supabase/migrations";
const dir = process.env.MIGRATIONS_DIR ?? DEFAULT_DIR;
const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
const invalid = files.filter((file) => !/^\d{4}[a-z]?_[a-z0-9_]+\.sql$/.test(file));
if (invalid.length) throw new Error(`Invalid migration filenames: ${invalid.join(", ")}`);

/**
 * ⭐ TWO FILES MAY NOT SHARE A MIGRATION NUMBER.
 *
 * Measured 2026-08-24: `0376_the_import_carries_the_suppliers_own_code.sql`
 * merged to `main` while a branch already carried
 * `0376_an_app_that_opened_is_not_a_pdf_that_arrived.sql`. Git saw no conflict
 * — the filenames differ — and THIS SCRIPT PASSED, because it validated the
 * SHAPE of a name and never compared one name to another. The collision was
 * found by hand, against `origin/main`, after CI was already green.
 *
 * The number IS the apply order. Two files claiming one position leaves that
 * order undefined, which is red line 7's whole subject.
 *
 * ── AND THE DAMAGE IS NOT HYPOTHETICAL ──────────────────────────────────────
 *
 * ELEVEN collisions already exist here, and in FIVE of them one file of the
 * pair NEVER APPLIED — measured against `supabase_migrations.schema_migrations`
 * on 2026-08-24:
 *
 *   0165 · `ops_order_control_payments`   NOT APPLIED
 *   0166 · `ops_bulk_complete_orders`     NOT APPLIED
 *   0204 · `pwp_codes_name_binding`       NOT APPLIED
 *   0239 · `counterparty_whatsapp_group`  NOT APPLIED
 *   0242 · `loan_logistics_legs`          NOT APPLIED
 *
 * (0206 · 0232 · 0233 · 0241 · 0255 applied both halves; 0267 applied all
 * three.) Whether those five ever run is a PRODUCTION decision and is reported
 * to the owner, not decided here.
 *
 * They are BASELINED, not fixed: they are committed, and five of them are
 * half-applied. Renumbering would edit committed migrations (red line 6) and
 * would not make the missing halves apply.
 *
 * The baseline is a FIXED LIST rather than "ignore old numbers", so a thirteenth
 * cannot join it silently, and a pair that stops colliding must leave it. A
 * suffix letter stays legal — `0376a_…` exists precisely so a follow-up can sit
 * behind a number without taking it.
 *
 * ── 0417, added 2026-09-03 ──────────────────────────────────────────────────
 * Two pull requests merged sixteen seconds apart, each having taken 0417 while
 * the other was still open:
 *   0417_the_partner_says_it_cannot_deliver.sql          (#1065)
 *   0417_the_register_names_the_site_and_the_holder.sql  (#1066)
 * Both are merged and both are applied, so the same rule the eleven above are
 * baselined under applies here: renumbering either would edit a committed
 * migration (red line 6), and a rename reaches this file's own immutability
 * check below as `R…` rather than `A`, which fails it.
 *
 * The apply order is genuinely undefined and genuinely does not matter. They
 * share no object: one adds scope columns to `ops_delivery_arrangement_events`,
 * the other adds two joined names to `stock_unit_register_v`. Neither reads
 * what the other writes.
 *
 * This unblocked main, which was red for every pull request until it landed.
 */
const COLLISION_BASELINE = new Set([
  "0165", "0166", "0204", "0206", "0232", "0233",
  "0239", "0241", "0242", "0255", "0267", "0417",
]);

const collisions = findCollisions(files, COLLISION_BASELINE);
if (collisions.length) throw new Error(collisionMessage(collisions));
/* The baseline describes THE REAL migrations directory, so it is only checked
   against that one. Running the gate over a fixture (its own regression test)
   must not report every historical pair as "no longer colliding". */
if (dir === DEFAULT_DIR) {
  const staleBaseline = staleBaselineEntries(files, COLLISION_BASELINE);
  if (staleBaseline.length) {
    throw new Error(
      `Baselined collision(s) no longer collide; remove them from COLLISION_BASELINE: ${staleBaseline.join(", ")}`,
    );
  }
}

const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "HEAD^";
let changed = [];
try {
  changed = execFileSync("git", ["diff", "--name-status", `${base}...HEAD`, "--", dir], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
} catch {
  console.log("No merge base available; filename validation only.");
}
const altered = changed.filter((line) => !line.startsWith("A\t"));
if (altered.length) throw new Error(`Committed migrations are immutable; only new files are allowed:\n${altered.join("\n")}`);
/**
 * A dollar-quoted body is CODE THIS MIGRATION DEFINES, not SQL it runs.
 *
 * The guard below exists to stop a migration from destroying production data
 * while it applies. A `delete from` inside `create function … $$ … $$` does
 * nothing at apply time: it is the application's own statement, guarded by its
 * own role checks, floors and transaction, and it runs when a user acts.
 *
 * Without this, the guard forbids ever AMENDING an RPC that prunes rows — and
 * the repository already ships several (`sales_order_save_revision` since 0340,
 * `sales_order_create` since 0327, the purchasing and rental writers). The
 * teeth are unchanged: a bare `drop table` / `truncate` / `delete from` at
 * migration level still fails, and so does one inside a `do $$ … $$` block,
 * which IS executed on apply.
 */
function stripFunctionBodies(sql) {
  return sql
    .replace(/\bdo\s+\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1?\$/gi, (m) => m)
    .replace(
      /\bcreate\s+(?:or\s+replace\s+)?function\b[\s\S]*?\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1?\$/gi,
      "create function <body omitted>",
    );
}

/**
 * A COMMENT EXECUTES NOTHING, so the guard must not read one.
 *
 * Measured 2026-08-20: migration 0367 was blocked by the sentence "it revoked
 * INSERT/UPDATE/ DELETE from `authenticated`" in its own header — prose
 * EXPLAINING a revoke, matched as `delete from`. A guard that fires on the
 * description of a change rather than the change teaches people to stop writing
 * descriptions, which is the opposite of what this repository wants.
 */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/**
 * REVOKING A PRIVILEGE IS NOT USING IT.
 *
 * `truncate` was matched as a bare word, so `revoke truncate on t from
 * authenticated` — which takes the power to empty a table AWAY — was read as
 * destroying data and blocked. Measured 2026-08-20 on migration 0367, whose
 * whole purpose is to remove write grants a new table inherits by default; the
 * TRUNCATE grant matters there precisely because TRUNCATE empties a table
 * WITHOUT firing the row trigger that refuses a delete.
 *
 * The guard now matches TRUNCATE only where it is a statement VERB — at the
 * start of a statement — so `revoke`/`grant` lists no longer trip it. Its teeth
 * are unchanged: `truncate t;` still fails, including inside a `do $$ … $$`
 * block, which IS executed on apply.
 */
const DESTRUCTIVE = [
  /\bdrop\s+(table|schema|column)\b/i,
  /(^|;)\s*truncate\b/i,
  /\bdelete\s+from\b/i,
];

for (const line of changed.filter((entry) => entry.startsWith("A\t"))) {
  const file = line.slice(2);
  const sql = await readFile(file, "utf8");
  const scanned = stripComments(stripFunctionBodies(sql));
  if (DESTRUCTIVE.some((re) => re.test(scanned))) {
    throw new Error(`${file} contains destructive SQL and requires the governed manual review/apply path.`);
  }
}
console.log(`Validated ${files.length} migration filenames and ${changed.length} migration change(s). No migration was applied.`);
