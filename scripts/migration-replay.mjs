/**
 * Pure helpers for `dry-run-migrations.mjs`: read psql's error output, work out
 * which failures are only knock-on effects of an earlier one, and compare a run
 * against the list of files already known not to replay.
 *
 * Kept free of I/O so `packages/shared/src/migration-replay.test.ts` can test it.
 */

/** Migration files in apply order. `0398_x` sorts before `0398a_x`. */
export function orderMigrations(files) {
  return files.filter((f) => /^\d{4}[a-z]?_[a-z0-9_]+\.sql$/.test(f)).sort();
}

/**
 * The first ERROR in psql's stderr, run with VERBOSITY=verbose:
 *   psql:<file>:56: ERROR:  42P10: there is no unique or exclusion constraint …
 *   CONTEXT:  PL/pgSQL function inline_code_block line 12 at RAISE
 */
export function parseError(stderr) {
  const lines = stderr.split(/\r?\n/);
  const at = lines.findIndex((l) => /\bERROR:\s/.test(l));
  if (at < 0) return { sqlstate: null, message: stderr.trim().slice(-400), line: null, context: null };
  const m = lines[at].match(/^(?:psql:.*?:(\d+):\s*)?ERROR:\s+(?:([0-9A-Z]{5}):\s+)?(.*)$/);
  const context = lines.slice(at + 1).find((l) => /^CONTEXT:\s/.test(l));
  return {
    sqlstate: m?.[2] ?? null,
    message: (m?.[3] ?? lines[at]).trim(),
    line: m?.[1] ? Number(m[1]) : null,
    context: context ? context.replace(/^CONTEXT:\s+/, "").trim() : null,
  };
}

/**
 * True when the file failed only because it ran inside one transaction:
 * an enum value used in the same transaction that added it (55P04), or a
 * statement like CREATE INDEX CONCURRENTLY that refuses a transaction (25001).
 */
export function needsNonTransactionalRetry(stderr) {
  return /unsafe use of new value|must be committed before they can be used|cannot run inside a transaction block/i.test(stderr);
}

const IDENT = String.raw`(?:"?[a-z_][a-z0-9_$]*"?\.)?"?([a-z_][a-z0-9_$]*)"?`;
const CREATES = [
  ["relation", new RegExp(String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${IDENT}`, "gi")],
  ["relation", new RegExp(String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?${IDENT}`, "gi")],
  ["relation", new RegExp(String.raw`\bcreate\s+sequence\s+(?:if\s+not\s+exists\s+)?${IDENT}`, "gi")],
  ["relation", new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}\s+rename\s+to\s+"?([a-z_][a-z0-9_$]*)"?`, "gi"), 2],
  ["type", new RegExp(String.raw`\bcreate\s+type\s+${IDENT}`, "gi")],
  ["function", new RegExp(String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\s+${IDENT}`, "gi")],
  ["column", /\badd\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_$]*)"?/gi],
  ["column", /\brename\s+column\s+"?[a-z_][a-z0-9_$]*"?\s+to\s+"?([a-z_][a-z0-9_$]*)"?/gi],
  ["constraint", /\bconstraint\s+"?([a-z_][a-z0-9_$]*)"?/gi],
];

/**
 * The names a migration file would create, by kind. A rough reading of the SQL
 * (regex, not a parser) — only used to guess which earlier failure caused a later one.
 * A table also counts as a type, because Postgres gives every table a row type.
 */
export function createdObjects(sql) {
  const out = { relation: new Set(), type: new Set(), function: new Set(), column: new Set(), constraint: new Set() };
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  for (const [kind, re, group = 1] of CREATES) {
    for (const m of code.matchAll(re)) out[kind].add(m[group].toLowerCase());
  }
  for (const r of out.relation) out.type.add(r);
  /* Columns declared inside `create table x ( … )` are created too. */
  for (const m of code.matchAll(/\bcreate\s+(?:unlogged\s+)?table\s+[^(;]+\(([\s\S]*?)\)\s*;/gi)) {
    for (const col of m[1].matchAll(/(?:^|,)\s*"?([a-z_][a-z0-9_$]*)"?\s+[a-z]/gim)) {
      if (!/^(constraint|primary|unique|check|foreign|exclude|like)$/i.test(col[1])) out.column.add(col[1].toLowerCase());
    }
  }
  return out;
}

/** What the error says is missing, or null when the error is about something else. */
export function missingObject(message) {
  /* Most specific first: `column "x" of relation "t" does not exist` also contains
     the words `relation "t" does not exist`. */
  const pats = [
    ["constraint", /constraint "([a-z0-9_$]+)" (?:of relation "[^"]+" )?does not exist/i],
    ["column", /column "?(?:[a-z0-9_]+\.)?([a-z0-9_$]+)"? (?:of relation "[^"]+" )?does not exist/i],
    ["function", /function (?:[a-z0-9_]+\.)?([a-z0-9_$]+)\(.*\) does not exist/i],
    ["type", /type "(?:[a-z0-9_]+\.)?([a-z0-9_$]+)(?:\[\])?" does not exist/i],
    ["relation", /relation "(?:[a-z0-9_]+\.)?([a-z0-9_$]+)" does not exist/i],
  ];
  for (const [kind, re] of pats) {
    const m = message.match(re);
    if (m) return { kind, name: m[1].toLowerCase() };
  }
  return null;
}

/**
 * Mark each failure that is probably just a knock-on of an earlier failure: its
 * error names a missing object that an earlier FAILED file would have created.
 * Everything left unmarked is a root failure and needs a human to explain it.
 *
 * `results`: [{ file, ok, error }] in apply order. `sqlOf(file)` returns the file's text.
 * Returns the same objects with `cascadeOf` (a file name) or `null` added.
 */
export function attributeCascades(results, sqlOf) {
  const failedSoFar = [];
  for (const r of results) {
    r.cascadeOf = null;
    if (r.ok) continue;
    const missing = r.error ? missingObject(r.error.message) : null;
    if (missing) {
      for (let i = failedSoFar.length - 1; i >= 0; i--) {
        const earlier = failedSoFar[i];
        if (earlier.created[missing.kind]?.has(missing.name)) {
          r.cascadeOf = earlier.cascadeOf ?? earlier.file;
          break;
        }
      }
    }
    failedSoFar.push({ file: r.file, cascadeOf: r.cascadeOf, created: createdObjects(sqlOf(r.file)) });
  }
  return results;
}

/**
 * Split the fixtures file into chunks, each loaded just before one migration.
 *   -- @before 0032_suppliers_slug
 *   insert into suppliers …;
 * Returns [{ before, sql }] in file order. `before` matches a migration by prefix.
 * Text above the first marker is ignored (the file's own header comment).
 */
export function parseFixtures(text) {
  const chunks = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^--\s*@before\s+(\S+)\s*$/);
    if (m) {
      current = { before: m[1], sql: "" };
      chunks.push(current);
    } else if (current) {
      current.sql += line + "\n";
    }
  }
  return chunks;
}

/**
 * Compare failures with the known-failing list.
 * `unexpected`: failed and not on the list — this is what should fail a gate.
 * `nowPass`: on the list but replayed cleanly — the list should drop them.
 */
export function compareToBaseline(results, baseline) {
  const known = new Set(baseline);
  const failed = new Set(results.filter((r) => !r.ok).map((r) => r.file));
  const ran = new Set(results.map((r) => r.file));
  return {
    unexpected: [...failed].filter((f) => !known.has(f)),
    nowPass: [...known].filter((f) => ran.has(f) && !failed.has(f)),
  };
}
