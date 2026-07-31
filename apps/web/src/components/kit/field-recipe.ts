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

/** Everything a control shares: surface, hairline, type, focus. The RADIUS
 *  is the shape's (see `controlClass`) — a pill search and a form field share
 *  everything else. */
export const CONTROL_BASE =
  "w-full bg-white text-body text-kit-slate-12 border " +
  "placeholder:text-kit-slate-9 " +
  "focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-kit-blue-9 focus:border-kit-blue-9 " +
  "disabled:bg-kit-slate-3 disabled:text-kit-slate-9 disabled:cursor-not-allowed";

/** Resting hairline vs the error hairline. §3.3: red = "late · act now", and a
 *  refused field is exactly that — the one place red belongs on a control. */
export const CONTROL_BORDER = {
  rest: "border-kit-slate-5",
  error: "border-kit-red-9",
} as const;

/** 32px single-line control — the height every form row aligns to. */
export const CONTROL_SINGLE_LINE = "h-8 px-2";

/** Multi-line: same skin, natural height. */
export const CONTROL_MULTI_LINE = "px-2 py-1";

/**
 * `pill` — the top-strip search's shape (the Orders page's own, adopted as
 * the Portal standard 2026-08-01): fully rounded, a little more breathing
 * room, same skin as every other control.
 */
export function controlClass(error: boolean, shape: "single" | "multi" | "pill"): string {
  return [
    CONTROL_BASE,
    shape === "pill" ? "rounded-full" : "rounded-control",
    error ? CONTROL_BORDER.error : CONTROL_BORDER.rest,
    shape === "multi" ? CONTROL_MULTI_LINE : shape === "pill" ? "h-8 px-4" : CONTROL_SINGLE_LINE,
  ].join(" ");
}
