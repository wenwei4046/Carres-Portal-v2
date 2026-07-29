/**
 * WHERE THE COMMENTS ARE — one answer, two readers.
 * FOLLOWS: **UI-KIT 2026-07-27**.
 *
 * D1's guard and D2's codemod both need the same fact — *which bytes of this
 * file are a comment* — and both asked for it with the same regex:
 *
 *     /\/\*[\s\S]*?\*\/|\/\/[^\n]*​/g
 *
 * That regex cannot see a string. `href="https://carresofficial.com"` contains
 * `//`, so everything after it on the line was blanked: the guard stopped
 * counting values it should have counted, and the codemod stopped converting
 * classes it should have converted. Both failed SILENTLY and in the direction
 * that looks like success — a smaller number.
 *
 * So the question is answered once, here, by a scanner that knows the four
 * places a `/` can hide: a string, a template (including every `${…}` nested
 * inside it), a regex literal, and a comment.
 *
 * TWO PROPERTIES THE CALLERS DEPEND ON:
 *   • `blankComments` preserves LENGTH and every newline, so a reported line
 *     number is still the real one.
 *   • `codeSegments` preserves the comment TEXT, so a codemod can rewrite code
 *     without rewriting the sentence that explains the value it is retiring.
 */

/** A `/` starts a regex only after one of these; `)` and `}` mean division. */
const REGEX_OK_AFTER = new Set("=(,:;[!&|?+-*%~^<>".split(""));
const REGEX_OK_WORDS = /\b(?:return|typeof|case|in|of|delete|void|instanceof|new|do|else|yield|await)$/;

/**
 * Byte ranges of every comment in `src`, in order, as `[start, end)`.
 * Comments inside strings, templates and regex literals are not comments.
 */
export function commentRanges(src) {
  const out = [];
  const n = src.length;
  // A stack so a comment inside `${ … }` inside a template is still found.
  const stack = [{ kind: "code", depth: 0, sig: "", sigAt: 0 }];
  let i = 0;

  while (i < n) {
    const top = stack[stack.length - 1];
    const c = src[i];

    if (top.kind === "template") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { stack.pop(); i++; continue; }
      if (c === "$" && src[i + 1] === "{") { stack.push({ kind: "code", depth: 0, sig: "", sigAt: 0, inTemplate: true }); i += 2; continue; }
      i++;
      continue;
    }

    // ── code ────────────────────────────────────────────────────────────────
    if (c === "/" && src[i + 1] === "/") {
      const start = i;
      while (i < n && src[i] !== "\n") i++;
      out.push([start, i]);
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(i + 2, n);
      out.push([start, i]);
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === c || src[i] === "\n") { i++; break; }
        i++;
      }
      top.sig = c;
      top.sigAt = i - 1;
      continue;
    }
    if (c === "`") {
      stack.push({ kind: "template" });
      top.sig = "`";
      top.sigAt = i;
      i++;
      continue;
    }
    if (c === "{") { top.depth++; top.sig = "{"; top.sigAt = i; i++; continue; }
    if (c === "}") {
      if (top.depth === 0 && top.inTemplate) { stack.pop(); i++; continue; }
      top.depth = Math.max(0, top.depth - 1);
      top.sig = "}";
      top.sigAt = i;
      i++;
      continue;
    }
    if (c === "/") {
      // Regex, or division, or the `/` of a JSX self-close. `/>` and `/ ` are
      // never a regex; a regex never opens on whitespace.
      const next = src[i + 1];
      const wordBefore =
        /[A-Za-z]/.test(top.sig) && REGEX_OK_WORDS.test(src.slice(Math.max(0, top.sigAt - 12), top.sigAt + 1));
      const canBeRegex =
        next !== ">" && next !== undefined && !/\s/.test(next) && (top.sig === "" || REGEX_OK_AFTER.has(top.sig) || wordBefore);
      if (!canBeRegex) { top.sig = "/"; top.sigAt = i; i++; continue; }
      i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "\n") break; // an unterminated regex is a bad guess — stop
        else if (src[i] === "/" && !inClass) { i++; break; }
        i++;
      }
      top.sig = "/";
      top.sigAt = i - 1;
      continue;
    }
    if (!/\s/.test(c)) { top.sig = c; top.sigAt = i; }
    i++;
  }
  return out;
}

/** Comments replaced by spaces. Same length, same newlines, same line numbers. */
export function blankComments(src) {
  const ranges = commentRanges(src);
  if (!ranges.length) return src;
  const out = src.split("");
  for (const [a, b] of ranges) for (let i = a; i < b; i++) if (out[i] !== "\n") out[i] = " ";
  return out.join("");
}

/**
 * `[code, comment, code, comment, …]` — odd indexes are comments, exactly the
 * shape `String.prototype.split` with a capturing group used to return, so a
 * caller transforms the even ones and joins.
 */
export function codeSegments(src) {
  const ranges = commentRanges(src);
  const parts = [];
  let at = 0;
  for (const [a, b] of ranges) {
    parts.push(src.slice(at, a), src.slice(a, b));
    at = b;
  }
  parts.push(src.slice(at));
  return parts;
}
