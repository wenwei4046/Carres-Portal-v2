/**
 * The ONE control skin, shared by `Input` · `Textarea` · `SearchInput`
 * (UI-KIT §6, card D0.5a).
 *
 * It lives in its own module for the reason §6.1 states: the second occurrence
 * of a UI element is a full stop — extract it first, then use it twice. Three
 * controls needed the same border, radius, focus ring and disabled treatment,
 * so the recipe is written once and imported three times rather than pasted.
 *
 * Today the codebase hand-rolls `<input>` in **134 files across 121 distinct
 * class strings**. This is the string that replaces them.
 */

/** Everything a control shares: surface, hairline, type, focus (v4 owner
 *  instruction 9 Oct 2026, 01 §3). The focus is the person's own Appearance
 *  outline, `var(--c-focus)`. The RADIUS and padding are the shape's (see
 *  `controlClass`). Pages that compose their own control read this too, so it
 *  carries no height and no padding. */
export const CONTROL_BASE =
  "w-full bg-c-card text-body text-c-ink border " +
  "placeholder:text-c-muted " +
  "focus:[outline:var(--c-focus)] focus:[outline-offset:-2px] " +
  "disabled:bg-c-search-bg disabled:text-c-muted disabled:cursor-not-allowed";

/** Resting hairline vs the refused field. 01 §1: form errors are AMBER; the
 *  red Problem pair is reserved for an evidenced problem. */
export const CONTROL_BORDER = {
  rest: "border-c-input-border",
  error: "border-c-warn-fg",
} as const;

/** The v4 control corner, 8px (`rounded-lg` is `var(--radius)`). */
export const CONTROL_RADIUS = "rounded-lg";

/** 32px single-line field, 10px sides — the height every form row aligns to. */
export const CONTROL_SINGLE_LINE = "h-8 [padding-inline:10px]";

/** Multi-line: same skin, natural height. */
export const CONTROL_MULTI_LINE = "[padding-inline:10px] py-1.5";

/**
 * `pill` — the global search (01 §3): 34px, round, the search grey and no
 * visible edge, 12px sides.
 */
export const CONTROL_SEARCH_PILL = "h-[var(--search-h)] [padding-inline:12px]";

/**
 * `toolbar` — a workspace toolbar control (Work, owner density ruling
 * 2026-09-25): 36px from 768px, 40px below, 14/20 type, 12px sides.
 */
export const CONTROL_TOOLBAR = "h-10 min-[768px]:h-9 px-3 text-control";

/** Leading glyph room: the side padding plus an 18px glyph plus a 6px gap. */
const LEADING = {
  single: "[padding-inline:34px_10px]",
  pill: "[padding-inline:36px_12px]",
  toolbar: "[padding-inline:36px_12px]",
} as const;

export function controlClass(
  error: boolean,
  shape: "single" | "multi" | "pill" | "toolbar",
  /** Room for a glyph inside the left padding (`SearchInput`). */
  leadingIcon = false,
): string {
  const border = error ? CONTROL_BORDER.error : CONTROL_BORDER.rest;
  if (shape === "toolbar") {
    return [
      CONTROL_BASE.replace("text-body ", ""),
      CONTROL_RADIUS,
      border,
      leadingIcon ? CONTROL_TOOLBAR.replace("px-3", LEADING.toolbar) : CONTROL_TOOLBAR,
    ].join(" ");
  }
  if (shape === "pill") {
    return [
      CONTROL_BASE.replace("bg-c-card ", "bg-c-search-bg "),
      "rounded-full",
      error ? CONTROL_BORDER.error : "border-transparent",
      leadingIcon ? CONTROL_SEARCH_PILL.replace("[padding-inline:12px]", LEADING.pill) : CONTROL_SEARCH_PILL,
    ].join(" ");
  }
  return [
    CONTROL_BASE,
    CONTROL_RADIUS,
    border,
    shape === "multi"
      ? CONTROL_MULTI_LINE
      : leadingIcon
        ? CONTROL_SINGLE_LINE.replace("[padding-inline:10px]", LEADING.single)
        : CONTROL_SINGLE_LINE,
  ].join(" ");
}
