/**
 * Field — THE one input recipe (UI-KIT v4 §2, locked 2026-07-16).
 *
 * Same architecture idea as Btn: inputs/selects share ONE recipe so every
 * form row lines up (32px control height = the md button height). Textareas
 * take `fieldBase` (no fixed height). Labels are the v4 label (.t4-label).
 */
export const fieldBase =
  "w-full px-2.5 border border-base-200 rounded-md text-body bg-white outline-none focus:border-base-700 disabled:bg-base-50 disabled:text-base-400";

/** Single-line controls: input / select — 32px, aligned with Btn md. */
export const fieldCls = `h-8 ${fieldBase}`;

/** Multi-line: textarea — same skin, natural height, small padding. */
export const fieldAreaCls = `py-1.5 ${fieldBase}`;
