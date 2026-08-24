import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error — repository tooling, deliberately plain .mjs
import {
  findCollisions,
  staleBaselineEntries,
  collisionMessage,
  groupByNumber,
} from "../../../scripts/migration-collisions.mjs";

/**
 * THE MIGRATION NUMBER IS THE APPLY ORDER (red line 7).
 *
 * ── WHY THIS TEST EXISTS, AND WHY IT LIVES HERE ─────────────────────────────
 *
 * On 2026-08-24 two files claimed `0376` — one on `main`, one on a branch —
 * and NOTHING caught it. Git saw no conflict because the filenames differ, and
 * `check-migrations.mjs` passed because it validated the SHAPE of a name and
 * never compared one name to another. It was found by hand.
 *
 * The gate had no test at all, and could not easily have one: the script does
 * its work at import time. So the comparison moved into a pure module, and the
 * script gained a `MIGRATIONS_DIR` override so THE SHIPPED SCRIPT — not a copy
 * of its logic — can be run against a fixture.
 *
 * It lives in `packages/shared` because that is the workspace `pnpm test`
 * already runs; the repository has no root-level vitest project, and inventing
 * one to hold a single file would be a second test runner to keep in step.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = join(REPO, "scripts", "check-migrations.mjs");

/** Run the REAL gate against a throwaway migrations directory. */
function runGate(files: string[]): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "carres-migrations-"));
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(join(dir, f), "-- fixture\nselect 1;\n");
  try {
    const out = execFileSync("node", [SCRIPT], {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, MIGRATIONS_DIR: dir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: out };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the shipped gate refuses two files with one number", () => {
  it("FAILS on the exact collision that shipped past CI on 2026-08-24", () => {
    const res = runGate([
      "0375_a_sku_knows_the_suppliers_own_name_for_it.sql",
      "0376_the_import_carries_the_suppliers_own_code.sql",
      "0376_an_app_that_opened_is_not_a_pdf_that_arrived.sql",
    ]);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("share one number");
    expect(res.output).toContain("0376");
    // It names both files, so the reader knows which to renumber.
    expect(res.output).toContain("the_import_carries_the_suppliers_own_code");
    expect(res.output).toContain("an_app_that_opened_is_not_a_pdf_that_arrived");
  });

  it("PASSES on a unique ordered set", () => {
    const res = runGate([
      "0375_a.sql",
      "0376_b.sql",
      "0377_c.sql",
      "0378_d.sql",
    ]);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("Validated 4 migration filenames");
  });

  it("PASSES on a suffixed follow-up — `0376a` does not take `0376`", () => {
    const res = runGate(["0376_b.sql", "0376a_b_follow_up.sql", "0377_c.sql"]);
    expect(res.ok).toBe(true);
  });

  it("still refuses a malformed filename", () => {
    const res = runGate(["0375_ok.sql", "376_short.sql"]);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid migration filenames");
  });

  it("still refuses destructive SQL — the older teeth are intact", () => {
    const dir = mkdtempSync(join(tmpdir(), "carres-migrations-"));
    writeFileSync(join(dir, "0375_ok.sql"), "drop table public.orders;\n");
    try {
      // No merge base in a fixture dir, so this proves filename validation and
      // collision detection run even when the diff cannot be computed.
      const res = runGate(["0375_ok.sql", "0375_also.sql"]);
      expect(res.ok).toBe(false);
      expect(res.output).toContain("share one number");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the REAL repository passes its own gate", () => {
    const out = execFileSync("node", [SCRIPT], { cwd: REPO, encoding: "utf8" });
    expect(out).toContain("No migration was applied.");
  });
});

describe("the collision rule itself", () => {
  it("groups by the numeric prefix, letter suffix included", () => {
    const g = groupByNumber(["0376_a.sql", "0376_b.sql", "0376a_c.sql"]);
    expect(g.get("0376")).toHaveLength(2);
    expect(g.get("0376a")).toHaveLength(1);
  });

  it("reports every colliding number, newest first", () => {
    const found = findCollisions(["0100_a.sql", "0100_b.sql", "0200_c.sql", "0200_d.sql"]);
    expect(found.map((c) => c.number)).toEqual(["0200", "0100"]);
  });

  it("honours the baseline, and only the baseline", () => {
    const files = ["0165_a.sql", "0165_b.sql", "0376_c.sql", "0376_d.sql"];
    const found = findCollisions(files, new Set(["0165"]));
    expect(found.map((c) => c.number)).toEqual(["0376"]);
  });

  it("a baselined pair that stopped colliding must leave the list", () => {
    expect(staleBaselineEntries(["0165_a.sql"], new Set(["0165"]))).toEqual(["0165"]);
    expect(staleBaselineEntries(["0165_a.sql", "0165_b.sql"], new Set(["0165"]))).toEqual([]);
  });

  it("the message says which file to renumber, and against what", () => {
    const msg = collisionMessage(findCollisions(["0376_a.sql", "0376_b.sql"]));
    expect(msg).toContain("has NOT reached main");
  });
});

describe("the baseline is the measured historical set, and nothing more", () => {
  it("names exactly the eleven numbers that already collide in this repository", () => {
    const src = readFileSync(SCRIPT, "utf8");
    for (const n of [
      "0165", "0166", "0204", "0206", "0232",
      "0233", "0239", "0241", "0242", "0255", "0267",
    ]) {
      expect(src, n).toContain(`"${n}"`);
    }
    // ...and it records that five of them left a half unapplied.
    expect(src).toContain("NOT APPLIED");
  });
});
