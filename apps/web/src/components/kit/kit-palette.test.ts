/**
 * ⭐ THE PALETTE GUARD — a kit colour class that does not EXIST renders nothing,
 * and nothing is invisible rather than loud.
 *
 * Measured on production, 2026-08-06 (Loo could not read the To Order grid):
 * the order line's cells carried `bg-kit-slate-2` in six places across
 * `DataTable.tsx` — the group band on three live pages and every expanded
 * record — and `getComputedStyle` returned `rgba(0, 0, 0, 0)`. **The class had
 * never rendered.** `tailwind.config.ts` publishes only the steps the law
 * names (its own comment: *"a chat reaching for `bg-kit-slate-4` gets nothing,
 * which is the point"*), and `slate-2` is not one of them, so the order row was
 * byte-identical white to the item rows under it and the table had no
 * hierarchy at all.
 *
 * A doc rule would not have caught it and a render test did not: jsdom resolves
 * no Tailwind, so the class looked present in the markup either way. **The only
 * thing that catches a colour that does not exist is a scan against the
 * config.** MASTER §9: a rule in a document gets skipped; a failing test does
 * not.
 *
 * It scans the WHOLE app, not the kit alone — the defect was in the kit, but
 * the next one has no reason to be.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const CONFIG = join(HERE, "..", "..", "..", "tailwind.config.ts");

/**
 * Every `kit.<ramp>.<step>` the config actually publishes.
 *
 * Read off the RADIX REFERENCE (`9: red.red9,`) rather than by slicing the
 * `kit:` object into ramp blocks: the blocks carry multi-line comments, and a
 * `}` inside one silently ends the slice — which is how a first draft of this
 * guard reported five live tokens as missing.
 */
const RAMPS = ["slate", "blue", "green", "amber", "red"] as const;

function publishedSteps(): Map<string, Set<string>> {
  const text = readFileSync(CONFIG, "utf8");
  const out = new Map<string, Set<string>>();
  for (const ramp of RAMPS) {
    const steps = new Set<string>();
    for (const m of text.matchAll(new RegExp(`\\b${ramp}\\.${ramp}(\\d+)\\b`, "g"))) {
      steps.add(m[1]!);
    }
    out.set(ramp, steps);
  }
  return out;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, acc);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

/** Comments come out first — a file EXPLAINING a dead token must not fail. */
const read = (f: string) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the kit palette", () => {
  it("publishes every step the source asks for — an unpublished step renders NOTHING", () => {
    const published = publishedSteps();
    expect([...published.keys()].sort()).toEqual(["amber", "blue", "green", "red", "slate"]);

    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = read(file);
      for (const m of text.matchAll(/-kit-(slate|blue|green|amber|red)-(\d+)\b/g)) {
        if (!published.get(m[1]!)?.has(m[2]!)) {
          offenders.push(`${file.slice(SRC.length + 1)} → kit-${m[1]}-${m[2]}`);
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
