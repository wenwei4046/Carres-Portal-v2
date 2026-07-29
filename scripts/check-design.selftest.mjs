#!/usr/bin/env node
/**
 * THE GUARD'S NEGATIVE CONTROL — card D1.
 * FOLLOWS: UI-KIT 2026-07-27.
 *
 * A rule that reports 0 is either clean or BROKEN, and from the outside those
 * look identical. This file makes them distinguishable: it writes one file per
 * rule that violates exactly that rule, runs the guard, and asserts the count
 * went UP. A rule that cannot be made to fire is a rule measuring nothing.
 *
 * This is not a hypothetical worry. The first draft of rules L and M reported
 * ZERO on three sites reference R2 had already found by hand, because the key
 * was a `const` two lines above the call. Only a negative control catches that.
 *
 *   node scripts/check-design.selftest.mjs
 */
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAB = join(ROOT, "apps/web/src/pages/__guardlab__");
const CLAB = join(ROOT, "apps/web/src/components/__guardlab__");
const REL = "apps/web/src/{pages,components}/__guardlab__";

/** One provocation per rule. Each must raise ITS letter and be reachable. */
const PROVOCATIONS = {
  A: ['const c = "#AB12CD";', "a.tsx"],
  B: ['const flame = "#C44D2B";', "b.tsx"],
  C: ['export const X = () => <Icon name="rocket" size={17} />;', "c.tsx"],
  D: ['export const X = () => <p className="text-[19px] font-bold">hi</p>;', "d.tsx"],
  E: ['export const X = () => <p className="p-[7px] rounded-xl border-2">hi</p>;', "e.tsx"],
  F: ['export const X = () => <p className="z-50">hi</p>;', "f.tsx"],
  G: ["export const X = () => <table><tbody /></table>;", "g.tsx"],
  I: [`export const X = () => <p className="${"a-very-long-repeated-utility-class-string-over-forty-chars"}">hi</p>;`, "i1.tsx"],
  K: ['/** Where this conflicts with the kit, v4 wins. */\nexport const X = 1;', "k.tsx"],
  L: ['const railKey = "guardlab-rail-collapsed";\nlocalStorage.getItem(railKey);', "l.tsx"],
  M: ["const k = `guardlab:${title}`;\nlocalStorage.setItem(k, \"1\");", "m.tsx"],
};
// Rule I needs the SAME string in two files — that is the whole rule.
PROVOCATIONS.I2 = [PROVOCATIONS.I[0], "i2.tsx"];

/** N only reads `components/**`, so its provocation cannot live under pages. */
const COMPONENT_PROVOCATION = ['const label = "Send PO";\nexport const X = label;', "n.tsx"];

function counts() {
  const out = execSync("node scripts/check-design.mjs", { cwd: ROOT, encoding: "utf8" });
  const c = {};
  for (const m of out.matchAll(/^\s{2}([A-N])\s+(\d+)\s{2}/gm)) c[m[1]] = Number(m[2]);
  return c;
}

const clean = () => {
  for (const d of [LAB, CLAB]) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
};

clean();
const before = counts();
mkdirSync(LAB, { recursive: true });
mkdirSync(CLAB, { recursive: true });
for (const [, [body, name]] of Object.entries(PROVOCATIONS)) writeFileSync(join(LAB, name), body + "\n");
writeFileSync(join(CLAB, COMPONENT_PROVOCATION[1]), COMPONENT_PROVOCATION[0] + "\n");

let after;
try {
  after = counts();
} finally {
  clean();
}

const checked = ["A", "B", "C", "D", "E", "F", "G", "I", "K", "L", "M", "N"];
const dead = checked.filter((id) => (after[id] ?? 0) <= (before[id] ?? 0));

console.log(`\nNegative control — ${REL}, ${Object.keys(PROVOCATIONS).length} provocations\n`);
for (const id of checked) {
  const d = (after[id] ?? 0) - (before[id] ?? 0);
  console.log(`  ${id}  ${String(before[id] ?? 0).padStart(5)} → ${String(after[id] ?? 0).padStart(5)}  ${d > 0 ? `✓ fires (+${d})` : "✗ DID NOT FIRE"}`);
}

// H · J carry no provocation, and that is stated rather than passing quietly.
console.log(`
  H and J are NOT provoked here, said out loud rather than left to look clean:
  H reads ONE named file (components/kit/PageShell.tsx) and cannot be triggered
  from a throwaway page, and J asks whether a KIT file declares the edition —
  a lab file is not a kit file. J is proven by the live scan instead: it
  reports 3 real hits today. H reports 0 and is the one rule here with no
  proof of life; its provocation would mean editing PageShell.tsx, which is
  another card's file.`);

if (dead.length) {
  console.error(`\n✗ ${dead.length} rule(s) could not be made to fire: ${dead.join(", ")}\n`);
  process.exit(1);
}
console.log("\n✓ every provoked rule fires.\n");
