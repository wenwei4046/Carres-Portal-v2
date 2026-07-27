/**
 * C4 — the banned-word SOURCE scanner, shared by every page that ships one.
 *
 * WHY A SOURCE SCAN AND NOT A RENDER TEST. C1 built this shape for
 * `OrderDetailDrawer` after T1's `Unscheduled` survived a week in TWO places:
 * `OrderDocuments`, `BookingSpine` and `OrderJourneyHeader` each guarded their
 * OWN component and the badge sat outside all three. A render test has the same
 * hole — it only sees the branches its fixture happens to reach — and these
 * pages are thousands of lines of branches. Reading the source catches every
 * branch, including the one nobody thought to mount.
 *
 * WHY IT MOVED HERE. C1's copy lived inside the drawer's own test file, so
 * `OperationPurchase` and `OperationPayments` — which had no test file at all —
 * were never scanned, and nine visible `Chase` strings sat on them. One scanner,
 * many pages: a new page adds three lines, not a copy of this logic.
 *
 * WHAT C4 FIXED IN THE SCANNER ITSELF. C1's JSX matcher was
 * `>([^<>{}]{2,})<` — a text node containing an interpolation was skipped
 * WHOLE, and party-named labels are exactly the ones that carry an
 * interpolation. That is why `Last chased {fmtDate(…)}` passed a guard whose
 * banned list already held /chase[ds]?/. Interpolations are now blanked before
 * the match, and the drawer's own scan found that string on the first run.
 *
 * WHAT COUNTS AS A VISIBLE STRING. Every string literal, every backtick
 * fragment and every JSX text node, MINUS:
 *   - comments (a note ABOUT a banned word is not a use of one),
 *   - `className` / `data-testid` / `testId` values — internal names nobody
 *     reads, exactly like a DB column,
 *   - a single all-lowercase token with no spaces (`"chase"`, `"logistic"`) —
 *     internal keys, mode values and query fragments, which COPY-STANDARD
 *     exempts by name.
 * A word a human reads on screen is either capitalised or has a space in it, so
 * nothing visible escapes through those doors.
 */

/** Comments, class names and test ids are not read by a human. */
function stripNonVisible(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/className=\{`[\s\S]*?`\}/g, "className={}")
    .replace(/className="[^"]*"/g, 'className=""')
    .replace(/className=\{"[^"]*"\}/g, "className={}")
    .replace(/(data-testid|testId)=\{`[^`]*`\}/g, "$1={}")
    .replace(/(data-testid|testId)="[^"]*"/g, '$1=""');
}

/** Every quoted literal + backtick fragment + JSX text node, minus the doors. */
export function visibleStrings(src: string): string[] {
  const out: string[] = [];
  const body = stripNonVisible(src);
  // "…" and '…' literals.
  for (const m of body.matchAll(/"([^"\\\n]{2,})"|'([^'\\\n]{2,})'/g))
    out.push(m[1] ?? m[2]);
  // Backtick fragments — the literal words around an ${…} interpolation.
  for (const m of body.matchAll(/`([^`\\]{2,})`/g)) out.push(...m[1].split("\n"));
  // JSX text. Interpolations are blanked first so `Last message {date}` is seen
  // as `Last message` instead of being skipped for containing a brace. Chunks
  // holding a quote, a semicolon or an `=` are code that leaked between a `>`
  // and a `<` (a type union, an arrow function) — never a label.
  const jsx = body.replace(/\{[^{}]*\}/g, " ");
  for (const m of jsx.matchAll(/>([^<>]{2,})</g))
    for (const line of m[1].split("\n"))
      if (!/["';=]/.test(line)) out.push(line);
  return out
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    // Internal keys: one all-lowercase token, no spaces (`chase`, `logistic`).
    .filter((s) => !/^[a-z0-9_.:/[\]-]+$/.test(s));
}

/** Each entry: the banned word, and why it is banned (COPY-STANDARD "Banned
 *  words — never visible anywhere"). */
export const BANNED_WORDS: readonly (readonly [RegExp, string])[] = [
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
