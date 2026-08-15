/**
 * ⭐ CUSTOMER NAME DISPLAY — CAPITALIZE UP ONLY. Owner ruling 2026-08-15 (Chai).
 *
 * **Raise a word's first letter. Never lower a letter that is already raised.**
 *
 * ```
 *   jimmy          →  Jimmy
 *   mei emi        →  Mei Emi
 *   KJ NG          →  KJ NG          ← initials survive
 *   LIM KUAN YANG  →  LIM KUAN YANG  ← unchanged
 *   o'brien        →  O'Brien
 *   lim wei-ming   →  Lim Wei-Ming
 * ```
 *
 * **Why one-directional.** A title-caser that lowercases the tail is guessing
 * that the capital was an accident. For a Malaysian customer list that guess is
 * wrong often enough to be a defect: `KJ`, `TCF`, `AL` and `Sdn Bhd` company
 * forms are initials and acronyms, and `Kj Ng` is not the reader's name. Raising
 * a letter can only ever fix a name typed in a hurry; lowering one can destroy a
 * name that was typed correctly. So the rule only ever moves in the safe
 * direction.
 *
 * **Display only — the record keeps exactly what was typed.** This never runs on
 * write, never reaches an import, and no migration normalises the column. What
 * an operator saved is what the database holds; this is a lens over it. That is
 * also why it must live in ONE file: a name shown three ways on three screens
 * reads as three customers.
 *
 * **Not for a WhatsApp greeting.** `titleCaseName` in `wa-templates.ts` answers
 * a different question — how to address a human politely in a message we are
 * about to send them — and it deliberately softens `LEE WEI YANG` to
 * `Lee Wei Yang`. That is customer-facing copy under its own rule. These two are
 * not duplicates and must not be merged without an owner ruling on the greeting.
 */

/**
 * A word starts at the string's start or after whitespace, a hyphen, a slash,
 * a dot or an apostrophe. `binti`/`a/l`-style particles are words like any
 * other — the portal has no list of names it is allowed to leave alone, and
 * inventing one is how a name gets a rule its owner never agreed to.
 */
const WORD_START = /(^|[\s\-/.'’])(\p{Ll})/gu;

/**
 * `jimmy` → `Jimmy`, `KJ NG` → `KJ NG`. Display-only.
 *
 * Returns the input unchanged when it is empty or nullish, so a caller's own
 * governed empty value (`—`, `Not given`) still decides what an absence reads
 * as — this helper never invents one.
 */
export function displayCustomerName(name: string): string;
export function displayCustomerName(name: string | null | undefined): string | null | undefined;
export function displayCustomerName(name: string | null | undefined) {
  if (!name) return name;
  return name.replace(WORD_START, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}
