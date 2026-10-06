/**
 * Replay migrations on a throwaway local Postgres and report which ones fail.
 *
 * `check-migrations.mjs` only reads file names and scans for destructive SQL; it
 * never runs a migration. So an error inside a migration (0463's sanity block,
 * 2026-09-10) was first seen when it was applied to production. This script runs
 * the SQL for real, on a database nobody uses, before that happens.
 *
 *   node scripts/dry-run-migrations.mjs                      whole chain, fresh temp cluster
 *   node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json
 *                                                            exit 1 only on a failure not on the known list
 *   node scripts/dry-run-migrations.mjs --changed-since origin/main
 *                                                            replay everything, judge only the files this branch adds
 *   node scripts/dry-run-migrations.mjs --snapshot schema.sql --changed-since origin/main
 *                                                            load a schema dump, then apply only this branch's files
 *
 * Other flags: --to <prefix> stop after that file · --stop-on-first · --json <path>
 * · --write-baseline <path> · --keep (leave the database/cluster up) · --connect
 * (use an existing server from PGHOST/PGPORT/PGUSER instead of starting one)
 * · --fixtures <path> / --no-fixtures (fake production rows loaded before named
 * files; default scripts/dry-run-fixtures.sql).
 *
 * Which files fail today, and why: docs/audits/2026-09-10-MIGRATION-REPLAY.md.
 *
 * It never connects anywhere but this machine: --connect refuses any host that
 * is not localhost. Postgres binaries come from PG_BIN, then PATH, then the
 * usual install folders.
 */
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attributeCascades,
  compareToBaseline,
  needsNonTransactionalRetry,
  orderMigrations,
  parseError,
  parseFixtures,
} from "./migration-replay.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB = join(HERE, "dry-run-supabase-stub.sql");
const isWin = process.platform === "win32";
const exe = (name) => (isWin ? `${name}.exe` : name);

// ── arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const value = argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  return value;
};
const opts = {
  dir: resolve(option("--dir") ?? process.env.MIGRATIONS_DIR ?? "supabase/migrations"),
  to: option("--to"),
  snapshot: option("--snapshot"),
  changedSince: option("--changed-since"),
  baseline: option("--baseline"),
  json: option("--json"),
  writeBaseline: option("--write-baseline"),
  stopOnFirst: flag("--stop-on-first"),
  keep: flag("--keep"),
  connect: flag("--connect"),
  fixtures: flag("--no-fixtures") ? null : resolve(option("--fixtures") ?? join(HERE, "dry-run-fixtures.sql")),
};
if (opts.snapshot && !opts.changedSince) {
  throw new Error("--snapshot is a schema that already contains the old files; pass --changed-since <ref> to say which files are new");
}

// ── finding Postgres ─────────────────────────────────────────────────────────
function findPgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const which = spawnSync(isWin ? "where" : "which", ["psql"], { encoding: "utf8" });
  if (which.status === 0) return dirname(which.stdout.split(/\r?\n/)[0].trim());
  const roots = isWin ? ["C:\\Program Files\\PostgreSQL"] : ["/usr/lib/postgresql"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root).filter((v) => /^\d+$/.test(v)).sort((a, b) => b - a);
    for (const v of versions) {
      const bin = join(root, v, "bin");
      if (existsSync(join(bin, exe("psql")))) return bin;
    }
  }
  throw new Error("Could not find psql. Set PG_BIN to the Postgres bin folder.");
}
const PG_BIN = findPgBin();
const tool = (name) => join(PG_BIN, exe(name));

function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

/** Refuse anything but this machine. This harness must never reach production. */
function assertLocal(host) {
  const h = (host ?? "").trim().toLowerCase();
  const local = h === "" || h === "localhost" || h === "127.0.0.1" || h === "::1" || h.startsWith("/");
  if (!local) throw new Error(`Refusing to run migrations against non-local host "${host}".`);
  for (const v of ["PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR"]) {
    if (process.env[v]) throw new Error(`Refusing to run with ${v} set; it could point somewhere other than localhost.`);
  }
}

// ── the server: a fresh temp cluster, or an existing local one ───────────────
let cluster = null;
let conn;
if (opts.connect) {
  assertLocal(process.env.PGHOST);
  conn = { host: process.env.PGHOST || "localhost", port: process.env.PGPORT || "5432", user: process.env.PGUSER || "postgres" };
} else {
  const dataDir = mkdtempSync(join(tmpdir(), "carres-dryrun-"));
  const port = await freePort();
  const init = spawnSync(tool("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--no-locale", "--no-sync"], { encoding: "utf8" });
  if (init.status !== 0) throw new Error(`initdb failed:\n${init.stderr || init.stdout}`);
  const serverOpts = [`-p ${port}`, "-c listen_addresses=localhost", "-c fsync=off", "-c synchronous_commit=off", "-c full_page_writes=off"];
  if (!isWin) serverOpts.push(`-c unix_socket_directories=${dataDir}`);
  /* stdio must be "ignore": the server inherits pg_ctl's output handles and keeps
     them open, so capturing them would make spawnSync wait for ever. */
  const start = spawnSync(tool("pg_ctl"), ["-D", dataDir, "-l", join(dataDir, "server.log"), "-o", serverOpts.join(" "), "-w", "start"], { stdio: "ignore" });
  if (start.status !== 0) {
    const log = readLog(dataDir);
    rmSync(dataDir, { recursive: true, force: true });
    throw new Error(`pg_ctl start failed:\n${log}`);
  }
  cluster = { dataDir, port };
  conn = { host: "localhost", port: String(port), user: "postgres" };
}
function readLog(dataDir) {
  try { return readFileSync(join(dataDir, "server.log"), "utf8").slice(-2000); } catch { return ""; }
}

const env = {
  ...process.env,
  PGHOST: conn.host,
  PGPORT: conn.port,
  PGUSER: conn.user,
  PGOPTIONS: "-c client_min_messages=warning",
};
function psql(db, args) {
  return spawnSync(tool("psql"), ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-d", db, ...args], {
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
}

const db = `carres_dryrun_${Date.now()}_${process.pid}`;
let fixtureDir = null;
function cleanup() {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  if (opts.keep) {
    console.log(`Kept: database ${db} on ${conn.host}:${conn.port}${cluster ? ` (cluster ${cluster.dataDir})` : ""}`);
    return;
  }
  if (cluster) {
    spawnSync(tool("pg_ctl"), ["-D", cluster.dataDir, "-m", "immediate", "-w", "stop"], { encoding: "utf8" });
    rmSync(cluster.dataDir, { recursive: true, force: true });
  } else {
    psql("postgres", ["-c", `drop database if exists ${db}`]);
  }
}

// ── the replay ───────────────────────────────────────────────────────────────
let exitCode = 0;
try {
  const created = psql("postgres", ["-c", `create database ${db}`]);
  if (created.status !== 0) throw new Error(`create database failed:\n${created.stderr}`);
  const version = psql(db, ["-At", "-c", "show server_version"]).stdout.trim();

  const stub = psql(db, ["-1", "-f", STUB]);
  if (stub.status !== 0) throw new Error(`Supabase stub failed to load:\n${stub.stderr}`);

  let files = orderMigrations(readdirSync(opts.dir));
  if (opts.to) files = files.filter((f) => f <= opts.to || f.startsWith(opts.to));

  let newFiles = null;
  if (opts.changedSince) {
    const rel = execFileSync("git", ["diff", "--name-only", "--diff-filter=A", `${opts.changedSince}...HEAD`, "--", opts.dir], { encoding: "utf8" });
    newFiles = new Set(rel.split(/\r?\n/).filter(Boolean).map((p) => p.split("/").pop()));
  }

  if (opts.snapshot) {
    const snap = psql(db, ["-f", resolve(opts.snapshot)]);
    if (snap.status !== 0) throw new Error(`Snapshot failed to load:\n${parseError(snap.stderr).message}`);
    files = files.filter((f) => newFiles.has(f));
  }

  const fixtures = opts.fixtures && existsSync(opts.fixtures) ? parseFixtures(readFileSync(opts.fixtures, "utf8")) : [];
  fixtureDir = fixtures.length ? mkdtempSync(join(tmpdir(), "carres-dryrun-fixture-")) : null;

  console.log(`Replaying ${files.length} migration(s) on PostgreSQL ${version} (${conn.host}:${conn.port}, database ${db})`);
  if (fixtures.length) console.log(`Fixtures: ${fixtures.length} chunk(s) from ${opts.fixtures}`);
  const results = [];
  const started = Date.now();
  for (const file of files) {
    const path = join(opts.dir, file);
    for (const [i, fx] of fixtures.entries()) {
      if (!file.startsWith(fx.before)) continue;
      const fxPath = join(fixtureDir, `${i}.sql`);
      writeFileSync(fxPath, fx.sql);
      const loaded = psql(db, ["-1", "-f", fxPath]);
      if (loaded.status !== 0) throw new Error(`Fixture before ${fx.before} failed: ${parseError(loaded.stderr).message}`);
    }
    const t0 = Date.now();
    let run = psql(db, ["-1", "-f", path]);
    let nonTransactional = false;
    if (run.status !== 0 && needsNonTransactionalRetry(run.stderr)) {
      nonTransactional = true;
      run = psql(db, ["-f", path]);
    }
    const ok = run.status === 0;
    const result = { file, ok, nonTransactional, ms: Date.now() - t0, error: ok ? null : parseError(run.stderr) };
    results.push(result);
    if (!ok) console.log(`FAIL ${file}  ${result.error.sqlstate ?? ""} ${result.error.message}`);
    else if (nonTransactional) console.log(`note ${file}  applied only outside one transaction (enum value added and used, or CONCURRENTLY)`);
    if (!ok && opts.stopOnFirst) break;
  }

  attributeCascades(results, (f) => readFileSync(join(opts.dir, f), "utf8"));
  const failed = results.filter((r) => !r.ok);
  const roots = failed.filter((r) => !r.cascadeOf);

  console.log("");
  console.log(`${results.length - failed.length} applied, ${failed.length} failed (${roots.length} root, ${failed.length - roots.length} knock-on) in ${Math.round((Date.now() - started) / 1000)}s`);
  if (roots.length) {
    console.log("\nRoot failures (need a human explanation):");
    for (const r of roots) console.log(`  ${r.file}\n      ${r.error.sqlstate ?? "?????"} ${r.error.message}`);
  }
  const byRoot = new Map();
  for (const r of failed.filter((r) => r.cascadeOf)) byRoot.set(r.cascadeOf, [...(byRoot.get(r.cascadeOf) ?? []), r.file]);
  if (byRoot.size) {
    console.log("\nKnock-on failures (an earlier failed file would have created what they need):");
    for (const [root, list] of byRoot) console.log(`  ${root} -> ${list.length}: ${list.join(", ")}`);
  }

  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify({ postgres: version, dir: opts.dir, snapshot: opts.snapshot ?? null, results }, null, 2));
    console.log(`\nFull results: ${opts.json}`);
  }
  if (opts.writeBaseline) {
    writeFileSync(opts.writeBaseline, JSON.stringify(failed.map((r) => r.file), null, 2) + "\n");
    console.log(`Baseline written: ${opts.writeBaseline} (${failed.length} files)`);
  }

  // ── verdict ────────────────────────────────────────────────────────────────
  if (newFiles) {
    const judged = results.filter((r) => newFiles.has(r.file));
    const bad = judged.filter((r) => !r.ok && !r.cascadeOf);
    const unsure = judged.filter((r) => !r.ok && r.cascadeOf);
    console.log(`\nNew in this branch: ${judged.length} file(s), ${bad.length} failed, ${unsure.length} could not be judged`);
    for (const r of unsure) console.log(`  cannot judge ${r.file}: it needs objects from ${r.cascadeOf}, which does not replay from scratch`);
    if (bad.length) exitCode = 1;
  } else if (opts.baseline) {
    const { unexpected, nowPass } = compareToBaseline(results, JSON.parse(readFileSync(opts.baseline, "utf8")));
    if (unexpected.length) {
      console.log(`\nNOT on the known-failing list (${unexpected.length}):\n  ${unexpected.join("\n  ")}`);
      exitCode = 1;
    }
    if (nowPass.length) {
      console.log(`\nOn the known-failing list but replayed cleanly — remove from ${opts.baseline}:\n  ${nowPass.join("\n  ")}`);
      exitCode = 1;
    }
    if (!exitCode) console.log(`\nMatches the known-failing list (${opts.baseline}).`);
  } else if (failed.length) {
    exitCode = 1;
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  exitCode = 2;
} finally {
  cleanup();
}
process.exit(exitCode);
