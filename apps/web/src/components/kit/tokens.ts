/**
 * Shared runtime aliases for the ONE kit. Current values and permitted roles
 * are governed by docs/01-design-tokens.md; Tailwind owns rendered type classes.
 * Keep consumer APIs during migration. The records below describe those aliases,
 * not a second list of approved typography or a replacement for 01.
 */
import type { OrderActionTone } from "@carres/shared";

/* ─────────────────────────────────────────────────────────────────────────
 * Typography aliases — preserve names used by current consumers.
 * ──────────────────────────────────────────────────────────────────────── */

/** Current class aliases; 01 §2 governs their permitted use. */
export type TypeToken = "page" | "title" | "strong" | "body" | "meta" | "label" | "control";

export interface TypeTokenSpec {
  token: TypeToken;
  /** The Tailwind class — size, weight and line-height in one. */
  className: string;
  px: number;
  weight: number;
  lineHeight: number;
  use: string;
}

/** 01 §2 permits 700 only for 11px count badges, never general body text. */
export const TYPE_WEIGHTS: readonly number[] = [400, 500, 600, 700];

/** Current 01 §2 aliases; values match the runtime Tailwind ramp. */
export const TYPE_TOKENS: readonly TypeTokenSpec[] = [
  { token: "page", className: "text-page", px: 20, weight: 600, lineHeight: 28, use: "page title — max one per page" },
  { token: "title", className: "text-title", px: 20, weight: 600, lineHeight: 28, use: "record number — shares the one page-title role" },
  { token: "strong", className: "text-strong", px: 15, weight: 500, lineHeight: 22, use: "card title · field-group heading" },
  { token: "body", className: "text-body", px: 13, weight: 400, lineHeight: 18, use: "default — table rows, prose, buttons" },
  { token: "meta", className: "text-meta", px: 12, weight: 400, lineHeight: 16, use: "secondary info, captions, timestamps" },
  { token: "label", className: "text-label", px: 11, weight: 500, lineHeight: 14, use: "caps labels and tags; counts may use 700 per 01 §2" },
  { token: "control", className: "text-control", px: 14, weight: 400, lineHeight: 20, use: "legacy control alias; new controls use 01 §2 button roles" },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * §3 Colour — the law names the STEP, never the hex.
 * `tailwind.config.ts` reads the hexes out of `@radix-ui/colors`; no file in
 * this repo maintains a hex table, so nobody can mistype a digit.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * §3.3 — the status pairs, as soft fill + dark ink (v4 owner instruction
 * 9 Oct 2026, `docs/01-design-tokens.md` §1). The values are the `--c-*`
 * variables in `styles/carres-tokens.css`, published as Tailwind `c-*`.
 *
 * Keyed by `OrderActionTone`, the union the action engine already computes
 * (`packages/shared/src/order-actions.ts`). A surface cannot invent a sixth
 * tone: there is no sixth member, so it does not compile. `info` and
 * `neutral` share the one grey pair, exactly as §1 lists them.
 */
export const TONE_CLASS: Record<OrderActionTone, string> = {
  danger: "bg-c-err-bg text-c-err-fg",
  warning: "bg-c-warn-bg text-c-warn-fg",
  info: "bg-c-info-bg text-c-info-fg",
  success: "bg-c-ok-bg text-c-ok-fg",
  neutral: "bg-c-info-bg text-c-info-fg",
};

/** The status pill reads the same soft pairs. No solid white text remains
 *  except the one dark Hold pair below (§1). */
export const STATUS_PILL_CLASS: Record<OrderActionTone, string> = TONE_CLASS;

/** Finance hold: the ONE dark pill, charcoal with white words (§1 Hold). */
export const HOLD_PILL_CLASS = "bg-c-hold-bg text-c-hold-fg";

/** The theme's selection pair, for a chosen value shown as a pill. */
export const SELECT_PILL_CLASS = "bg-c-select-bg text-c-select-fg";

/** Every tone, in the order §3.6 lists them — used by `/ui` and by tests. */
export const TONES: readonly OrderActionTone[] = ["danger", "warning", "info", "success", "neutral"];

/* ─────────────────────────────────────────────────────────────────────────
 * §4.2 Radius — v4 (owner instruction 9 Oct 2026, 01 §3): corner 8, pill 999,
 * and the checkbox keeps its square 4. The old 6 control and 10 card corners
 * are retired; `rounded-lg` is `var(--radius)`, 8px.
 *
 * ⭐ A PILL IS A CAPSULE — owner ruling 2026-08-15 (Chai), re-ruling §4.
 *
 * The 4px row used to claim three uses and only one of them was honest. A
 * "pill" at 4px is a rounded rectangle, and it sat beside search and the pill
 * toolbar buttons, which have been fully rounded since Jess ruled the capsule
 * language on 2026-08-01. The 4px row now names the ONE control that really
 * wants it — the checkbox — and every pill and small tag joins `rounded-full`.
 *
 * `rounded-pill` KEEPS ITS NAME on purpose. §0: a label is presentation, an
 * identifier is a contract, and renaming this class would be a breaking change
 * across the Tailwind config, this record and the source scan for no gain.
 * ──────────────────────────────────────────────────────────────────────── */

export const RADII = [
  { px: 4, className: "rounded-pill", use: "checkbox" },
  { px: 8, className: "rounded-lg", use: "button · input · dropdown · popup · card · panel · modal · drawer" },
  { px: null, className: "rounded-full", use: "pill · small tag · avatar · status dot" },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * §4.1 Spacing — Q1 = Candidate A's 8 steps (Jess, 2026-07-28), plus the two
 * side paddings the v4 kit names (10 and 14, owner instruction 9 Oct 2026).
 *
 * `tailwind` is the numeric class suffix, because that is the thing a source
 * scan can check: `p-1.5` is 6px. `kit-source.test.ts` reads this record, so
 * the scan and the law cannot drift apart.
 * ──────────────────────────────────────────────────────────────────────── */

export interface SpacingStep {
  px: number;
  /** The Tailwind numeric suffix — `p-`, `gap-`, `px-` … */
  tailwind: string;
  use: string;
}

export const SPACING_SCALE: readonly SpacingStep[] = [
  { px: 2, tailwind: "0.5", use: "hairline nudge (pill y-padding)" },
  { px: 4, tailwind: "1", use: "touching" },
  { px: 6, tailwind: "1.5", use: "icon-to-text gap · popup padding" },
  { px: 8, tailwind: "2", use: "inside a control" },
  { px: 10, tailwind: "2.5", use: "v4 control, chip and menu item side (01 §3)" },
  { px: 12, tailwind: "3", use: "standard gap" },
  { px: 14, tailwind: "3.5", use: "v4 card and table cell side (01 §3 · §5)" },
  { px: 16, tailwind: "4", use: "dense card padding · table cell x-pad" },
  { px: 24, tailwind: "6", use: "between blocks · card padding" },
  { px: 32, tailwind: "8", use: "between major regions" },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * §5.1 Icons — exactly three sizes; stroke ✅ FROZEN Q4 = 2.
 * ──────────────────────────────────────────────────────────────────────── */

export type IconSize = 14 | 16 | 18;
export const ICON_SIZES: readonly IconSize[] = [14, 16, 18];

/**
 * The retired Lucide stroke (Q4, Jess 2026-07-28), kept only as the record `/ui`
 * prints. `Icon` now draws Material Symbols Rounded at weight 300 through
 * `MIcon` (01 §3), which has no stroke at all. The three `IconSize` props map
 * to glyph sizes 16 / 18 / 20 inside `Icon`.
 */
export const ICON_STROKE = 2;
