/**
 * COMMENT MASKING FOR TS / TSX / CSS — one implementation, two callers.
 * =============================================================================
 * FOLLOWS: **UI-KIT 2026-07-27** · §13.3 (the guard's value rules) · card D2.
 *
 * WHY THIS FILE EXISTS. D1's guard scanned comments as code, so `tokens.ts` was
 * flagged twice for the sentence that EXPLAINS that 700 is dead. D2 fixed it with
 * ONE REGEX matching a block comment or a line comment — and the PM review found
 * that the cure had its own disease: **that regex is not string-aware.** A line holding
 * `"https://cdn…"` has everything after the `//` blanked, so a real violation
 * later on the same line stops being counted; a string holding a block-comment
 * OPENER blanks through to the next closer, which can swallow whole blocks. The
 * guard's number is
 * what the entire D-series is scored against, so a stripper that silently
 * DEPRESSES it is worse than one that inflates it.
 *
 * THE CODEMOD HAD THE IDENTICAL DEFECT IN MIRROR IMAGE. It split on the same
 * regex, so those same regions were never transformed — the guard hid them and
 * the codemod skipped them, and the two errors cancelled out into a number that
 * looked right. **Fixing only one of them would make them disagree**, so both
 * read this file. One concern, one implementation: a second copy is how a rule
 * drifts.
 *
 * WHAT IT DOES. Walks the source once, tracking quoted strings, template
 * literals (including `${…}`, which is code again), and regex literals, and
 * returns the ranges that are genuinely COMMENTS.
 *
 *   - `maskComments(src, file)` — the same length and the same line numbering,
 *     with comment characters replaced by spaces. Every reported line number is
 *     still the real one. This is what the guard's VALUE rules read.
 *   - `commentRanges(src, file)` — the ranges themselves, so a rewriter can
 *     transform code and leave prose alone. This is what the codemod reads.
 *
 * STRINGS ARE LEFT WHOLE ON PURPOSE. A `className` value IS a string literal, so
 * a masker that blanked strings would hide every violation in the codebase and a
 * codemod that skipped them would convert nothing.
 *
 * `//` IS A COMMENT IN TS AND IS NOT ONE IN CSS. `index.css` holds all 33 of the
 * guard's surviving rule-D findings, so mistaking `url(//…)` for a comment there
 * would corrupt the one number this card reports.
 */

/** After one of these, a `/` opens a REGEX. After anything else it divides. */
const REGEX_AFTER_SYMBOL = new Set([
  "",
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "~",
  "^",
  "<",
  ">",
  "\n",
]);
const REGEX_AFTER_WORD = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "case",
  "delete",
  "void",
  "yield",
  "await",
  "new",
  "do",
  "else",
]);

const isSpace = (c) => c === " " || c === "\t" || c === "\r" || c === "\n";
const isWordChar = (c) => /[A-Za-z0-9_$]/.test(c);

/** Past a `'…'` or `"…"`, honouring escapes; an unterminated one ends at the newline. */
function skipQuoted(src, i, quote) {
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    if (c === "\n") return i; // unterminated — do not swallow the rest of the file
    i++;
  }
  return i;
}

/** Past a `/…/flags`. A literal `//` cannot occur inside one, so this only protects quotes. */
function skipRegex(src, i) {
  i++;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "\n") return i;
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      i++;
      while (i < src.length && /[a-z]/.test(src[i])) i++;
      return i;
    }
    i++;
  }
  return i;
}

/**
 * Past a template literal. The text is opaque, but `${…}` is CODE again — so a
 * comment inside an interpolation is still found, and a `//` inside the text is
 * still safe.
 */
function skipTemplate(src, i, out, lineComments) {
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") return i + 1;
    if (c === "$" && src[i + 1] === "{") {
      i = scan(src, i + 2, out, lineComments, 1);
      continue;
    }
    i++;
  }
  return i;
}

/**
 * The one walker. `depth > 0` means we are inside a `${…}` and must stop at the
 * `}` that closes it; `depth === 0` means top level and we run to the end.
 */
function scan(src, i, out, lineComments, depth) {
  let prevSymbol = "\n";
  let prevWord = "";
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];

    if (lineComments && c === "/" && d === "/") {
      const s = i;
      while (i < src.length && src[i] !== "\n") i++;
      out.push([s, i]);
      prevSymbol = "\n";
      prevWord = "";
      continue;
    }
    if (c === "/" && d === "*") {
      const s = i;
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(i + 2, src.length);
      out.push([s, i]);
      prevSymbol = "\n";
      prevWord = "";
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipQuoted(src, i, c);
      prevSymbol = "x";
      prevWord = "";
      continue;
    }
    if (c === "`") {
      i = skipTemplate(src, i, out, lineComments);
      prevSymbol = "x";
      prevWord = "";
      continue;
    }
    if (c === "/" && (REGEX_AFTER_WORD.has(prevWord) || REGEX_AFTER_SYMBOL.has(prevSymbol))) {
      i = skipRegex(src, i);
      prevSymbol = "x";
      prevWord = "";
      continue;
    }
    if (depth > 0) {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    if (isWordChar(c)) {
      let s = i;
      while (i < src.length && isWordChar(src[i])) i++;
      prevWord = src.slice(s, i);
      prevSymbol = "x";
      continue;
    }
    if (!isSpace(c)) {
      prevSymbol = c;
      prevWord = "";
    } else if (c === "\n") {
      prevSymbol = "\n";
      prevWord = "";
    }
    i++;
  }
  return i;
}

/** The COMMENT ranges of a source file, string- and regex-aware. */
export function commentRanges(src, file = "") {
  const out = [];
  scan(src, 0, out, !/\.css$/.test(file), 0);
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * The source with every comment character replaced by a space. Same length, same
 * line numbering, strings untouched.
 */
export function maskComments(src, file = "") {
  const ranges = commentRanges(src, file);
  if (!ranges.length) return src;
  let out = "";
  let at = 0;
  for (const [s, e] of ranges) {
    if (s < at) continue; // a nested range already covered
    out += src.slice(at, s) + src.slice(s, e).replace(/[^\n]/g, " ");
    at = e;
  }
  return out + src.slice(at);
}

/** Apply `fn` to CODE ONLY, leaving comment prose exactly as written. */
export function replaceInCode(src, file, fn) {
  const ranges = commentRanges(src, file);
  if (!ranges.length) return fn(src);
  let out = "";
  let at = 0;
  for (const [s, e] of ranges) {
    if (s < at) continue;
    out += fn(src.slice(at, s)) + src.slice(s, e);
    at = e;
  }
  return out + fn(src.slice(at));
}
