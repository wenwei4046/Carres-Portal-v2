/**
 * KIT TOKENS — the machine-readable half of `docs/UI-KIT.md` §2 · §3 · §4 · §5.
 *
 * Card D0.5a. Every Foundation Component in `components/kit/` reads its type,
 * radius, tone and icon size FROM HERE, and `/ui` renders the same records — so
 * the showcase structurally cannot show a value the components do not use.
 *
 * **Why a TypeScript record and not a CSS class ramp.** The six type tokens are
 * declared in `tailwind.config.ts` as named `fontSize` entries (`text-page` …
 * `text-label`), which carries size + weight + line-height in ONE class and
 * makes a seventh size impossible to write without editing the config. The
 * law's own names (`t-page`, `t-body`, …) could NOT be used as CSS class names:
 * `.t-body` already exists in `index.css` as the retired v17 ramp's 14px/400,
 * used by 5 live files. Redefining it would have re-sized pages this card is
 * forbidden to touch. The mapping token → class is recorded in UI-KIT §2.1.
 *
 * **The PENDING REGISTER is EMPTY since 2026-07-28** — Jess froze all three on
 * `/ui`: spacing = the 8-step scale, `font-bold` (700) deleted into 600, icon
 * stroke = Lucide's 2. The kit's ten boxes needed **zero changes** to absorb
 * the answers, which was the property D0.5a was built to have.
 */
import type { OrderActionTone } from "@carres/shared";

/* ─────────────────────────────────────────────────────────────────────────
 * §2.1 Typography — six tokens, no seventh.
 * ──────────────────────────────────────────────────────────────────────── */

/** The six type tokens. A seventh does not exist and does not compile. */
export type TypeToken = "page" | "title" | "strong" | "body" | "meta" | "label";

export interface TypeTokenSpec {
  token: TypeToken;
  /** The Tailwind class — size, weight and line-height in one. */
  className: string;
  px: number;
  weight: number;
  lineHeight: number;
  use: string;
}

/** UI-KIT §2.1, in the order the law states it. */
export const TYPE_TOKENS: readonly TypeTokenSpec[] = [
  { token: "page", className: "text-page", px: 24, weight: 600, lineHeight: 32, use: "page title — max one per page" },
  { token: "title", className: "text-title", px: 20, weight: 600, lineHeight: 28, use: "section title · KPI hero number" },
  { token: "strong", className: "text-strong", px: 15, weight: 600, lineHeight: 22, use: "card title · field-group heading" },
  { token: "body", className: "text-body", px: 13, weight: 400, lineHeight: 18, use: "default — table rows, prose, buttons" },
  { token: "meta", className: "text-meta", px: 12, weight: 400, lineHeight: 16, use: "secondary info, captions, timestamps" },
  { token: "label", className: "text-label", px: 11, weight: 500, lineHeight: 14, use: "field labels, micro-labels, pill text" },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * §3 Colour — the law names the STEP, never the hex.
 * `tailwind.config.ts` reads the hexes out of `@radix-ui/colors`; no file in
 * this repo maintains a hex table, so nobody can mistype a digit.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * §3.3 — the four jobs colour is allowed to do, as pill fill + ink.
 *
 * Keyed by `OrderActionTone`, the union the action engine already computes
 * (`packages/shared/src/order-actions.ts`). A surface cannot invent a sixth
 * tone: there is no sixth member, so it does not compile.
 */
export const TONE_CLASS: Record<OrderActionTone, string> = {
  danger: "bg-kit-red-3 text-kit-red-11",
  warning: "bg-kit-amber-3 text-kit-amber-11",
  info: "bg-kit-blue-3 text-kit-blue-11",
  success: "bg-kit-green-3 text-kit-green-11",
  neutral: "bg-kit-slate-3 text-kit-slate-11",
};

/** Every tone, in the order §3.6 lists them — used by `/ui` and by tests. */
export const TONES: readonly OrderActionTone[] = ["danger", "warning", "info", "success", "neutral"];

/* ─────────────────────────────────────────────────────────────────────────
 * §4.2 Radius — four, frozen.
 * ──────────────────────────────────────────────────────────────────────── */

export const RADII = [
  { px: 4, className: "rounded-pill", use: "pill · small tag · checkbox" },
  { px: 6, className: "rounded-control", use: "button · input · dropdown" },
  { px: 10, className: "rounded-card", use: "card · panel · modal · drawer" },
  { px: null, className: "rounded-full", use: "avatar · status dot" },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * §4.1 Spacing — FROZEN 2026-07-28 (Jess, Q1): the 8-step scale.
 * ──────────────────────────────────────────────────────────────────────── */

/** The eight steps, with the Tailwind class suffix each one is written as. */
export const SPACING_SCALE = [
  { px: 2, suffix: "0.5", use: "hairline nudge (pill y-padding)" },
  { px: 4, suffix: "1", use: "touching" },
  { px: 6, suffix: "1.5", use: "icon-to-text gap — the most used step" },
  { px: 8, suffix: "2", use: "inside a control" },
  { px: 12, suffix: "3", use: "standard gap" },
  { px: 16, suffix: "4", use: "dense card padding · table cell x-pad" },
  { px: 24, suffix: "6", use: "between blocks · card padding" },
  { px: 32, suffix: "8", use: "between major regions" },
] as const;

/** Every legal step in px. A ninth does not exist. */
export const SPACING_STEPS: readonly number[] = SPACING_SCALE.map((s) => s.px);

/* ─────────────────────────────────────────────────────────────────────────
 * §2.2 Weight — FROZEN 2026-07-28 (Jess, Q3): 700 is deleted into 600.
 * ──────────────────────────────────────────────────────────────────────── */

export const WEIGHTS = [
  { weight: 400, className: "font-normal", use: "body text" },
  { weight: 500, className: "font-medium", use: "labels, light emphasis" },
  { weight: 600, className: "font-semibold", use: "titles, numbers" },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * §5.1 Icons — three sizes; stroke FROZEN 2026-07-28 (Jess, Q4) at Lucide's 2.
 * ──────────────────────────────────────────────────────────────────────── */

export type IconSize = 14 | 16 | 18;
export const ICON_SIZES: readonly IconSize[] = [14, 16, 18];

/**
 * The ONE stroke width. `Icon` has no prop to change it — that is the
 * enforcement, and it is why Q4 needed no component change to freeze.
 */
export const ICON_STROKE = 2;
