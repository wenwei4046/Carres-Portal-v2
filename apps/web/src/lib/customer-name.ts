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
 * **This is the ONLY name-casing rule in the portal — owner ruling 2026-08-15.**
 * It reaches the screen, the WhatsApp greeting and the PDF alike. `titleCaseName`
 * in `wa-templates.ts` used to soften `LEE WEI YANG` to `Lee Wei Yang` for a
 * greeting; the owner ruled that out, because the same guess that softens a
 * shouted name also rewrites `KJ NG` into `Kj Ng` — and a message addressed to
 * `Kj` is addressed to nobody. That function is deleted, not re-pointed: a
 * second entry point is how two rules come back.
 *
 * **A PDF prints what the screen prints.** The helper is applied in the PDF
 * TEMPLATE rather than in the payload each caller assembles, so every door into
 * a document — and every historical document regenerated later — passes through
 * the one rule. A document whose casing disagrees with the register it was
 * raised from reads as a different customer.
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
