/**
 * The portal's banned-word scanner (card **C12**, 2026-08-05).
 *
 * WHY IT LIVES HERE AND NOT INSIDE ONE PAGE'S TEST FILE. C1 wrote this scan
 * inside `OrderDetailDrawer.test.tsx`, so it guarded exactly one file. Payments
 * had no test file at all and was therefore never scanned — which is how fifteen
 * banned strings stayed live on it for eight days while every suite was green.
 * A guard that only reads the file it happens to sit next to is not a guard, it
 * is a coincidence.
 *
 * WHY IT IS A SOURCE SCAN AND NOT A RENDER TEST. A render test can only see the
 * branches its fixture happens to reach, and these files are thousands of lines
 * of branches. T1's `Unscheduled` survived a week in TWO places under three
 * green render tests for exactly that reason. Reading the source catches every
 * branch, including the one nobody thought to mount.
 *
 * WHAT COUNTS AS A VISIBLE STRING. Every string literal, every template-literal
 * fragment and every JSX text node, EXCEPT a single all-lowercase token with no
 * spaces (`"chase"`, `"logistic"`, `"remind"`) — those are internal keys, mode
 * values and query fragments, which COPY-STANDARD exempts by name. A word a
 * human reads on screen is either capitalised or has a space in it, so nothing
 * visible escapes through that door.
 */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/**
 * Drop what nobody reads: comments (a note ABOUT a retired word must not be
 * read as using one — every file swept by this scanner now carries a paragraph
 * naming the word it retired), and `className` values (`btn-chase`,
 * `text-chase` are internal names, exactly like a DB column).
 */
function stripNonVisible(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/className=\{`[\s\S]*?`\}/g, "className={}")
    .replace(/className="[^"]*"/g, 'className=""')
    .replace(/className=\{"[^"]*"\}/g, "className={}");
}

/**
 * A JSX text node, INCLUDING one that carries an interpolation.
 *
 * **This is the hole C12 exists to close.** C1's matcher was `>([^<>{}]{2,})<`
 * — the `{}` in that character class means a text node containing an
 * interpolation never matched at all, and party-named labels are precisely the
 * ones that carry one. That is how `Last chased {date}` sat live in the drawer
 * for eight days under a guard whose banned list already held `/chase[ds]?/`.
 *
 * The content is therefore *a run of plain characters OR a COMPLETE simple
 * interpolation*, never a bare `{` or `}`. **That containment is load-bearing
 * and was measured, not assumed.** The obvious fix — blank every `{…}` in the
 * file first, then match `>([^<>]+)<` — was written, run, and thrown away: with
 * the braces gone a capture can run straight through code, and it reported four
 * false positives in the drawer alone (`logistic: chasePartnerName,` and three
 * `pending` variable declarations). A guard that flags code is a guard the next
 * chat deletes.
 *
 * `[^{}<>]` inside the interpolation is the same restriction one level down:
 * `{cond && <b>Hi</b>}` is a CHILD ELEMENT, not an expression, so it is left
 * for the matcher to walk into rather than swallowed whole — trading one blind
 * spot for another is not a fix.
 */
const JSX_TEXT = />((?:[^<>{}]|\{[^{}<>]*\})+?)</g;

/** Every quoted literal + template fragment + JSX text node, minus the internal-key door. */
export function visibleStrings(src: string): string[] {
  const out: string[] = [];
  const body = stripNonVisible(src);
  // "…" and '…' literals — read from the UNBLANKED body, because a literal is
  // allowed to contain braces of its own and blanking would eat its words.
  for (const m of body.matchAll(/"([^"\\\n]{2,})"|'([^'\\\n]{2,})'/g))
    out.push(m[1] ?? m[2]);
  // Backtick fragments — the literal words around an ${…} interpolation.
  for (const m of body.matchAll(/`([^`\\]{2,})`/g)) out.push(...m[1].split("\n"));
  // JSX text. The interpolations are removed from the CAPTURE, not from the
  // file, so the literal words around them are read and the code inside is not.
  // Newlines are allowed inside the chunk — a label on its own indented line is
  // the common shape — and each line is then trimmed on its own.
  for (const m of body.matchAll(JSX_TEXT))
    out.push(...m[1].replace(/\{[^{}]*\}/g, " ").split("\n"));
  return out
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    // Internal keys: one all-lowercase token, no spaces (`chase`, `logistic`).
    .filter((s) => !/^[a-z0-9_.:/[\]-]+$/.test(s));
}

/** Each entry: the banned word, and why it is banned (`docs/COPY-STANDARD.md`). */
export const BANNED: readonly [RegExp, string][] = [
  [/\bPOD\b/, "POD → delivery photo"],
  [/proof of delivery/i, "Proof of Delivery → delivery photo"],
  [/\bunscheduled\b/i, "Unscheduled → the action that closes the gap"],
  [/\bnot booked\b/i, "Not booked → no date confirmed"],
  [/\bneed booking\b/i, "need booking → a to-do hidden inside a fact"],
  [/\bchase[ds]?\b/i, "Chase → Call {party} — {measurable outcome}"],
  [/\bchasing\b/i, "Chase → Call {party} — {measurable outcome}"],
  // A logistics company: `Carrier` / `Partner` / `logistic` (no s) are banned
  // UI words; DB columns and internal keys keep theirs.
  [/\bcarriers?\b/i, "Carrier → Logistics"],
  [/\blogistic\b/i, "logistic → Logistics (with the s)"],
  // Moods and gaps instead of work.
  [/\bat risk\b/i, "At Risk → say what is late and by how much"],
  [/\bneeds attention\b/i, "Attention → Due soon / Overdue"],
  [/\bpending\b/i, "Pending → the state it actually selects"],
];

/**
 * Run the whole banned list over one file.
 *
 * `minStrings` is per-file on purpose: it is the non-vacuity floor, and a floor
 * copied from the biggest file would be met by nothing else. A matcher change
 * that quietly stopped matching would otherwise make every assertion below
 * vacuously true — the one failure mode a guard must not have.
 */
export function itSaysNoBannedWord(
  file: string,
  { minStrings, expectString }: { minStrings: number; expectString: string },
): void {
  const strings = visibleStrings(readFileSync(file, "utf8"));

  it(`finds strings to check at all — ${file.split(/[\\/]/).pop()}`, () => {
    expect(strings.length).toBeGreaterThan(minStrings);
    expect(
      strings.some((s) => s.includes(expectString)),
      `the scan must reach a string it is known to contain: ${expectString}`,
    ).toBe(true);
  });

  for (const [re, why] of BANNED) {
    it(`${file.split(/[\\/]/).pop()} never says ${re.source} — ${why}`, () => {
      expect(strings.filter((s) => re.test(s))).toEqual([]);
    });
  }
}
