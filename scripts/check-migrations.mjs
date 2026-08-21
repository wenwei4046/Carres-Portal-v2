import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

const dir = "supabase/migrations";
const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
const invalid = files.filter((file) => !/^\d{4}[a-z]?_[a-z0-9_]+\.sql$/.test(file));
if (invalid.length) throw new Error(`Invalid migration filenames: ${invalid.join(", ")}`);

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
