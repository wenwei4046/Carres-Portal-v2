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
 * **Q1 · Q3 · Q4 are FROZEN (Jess, 2026-07-28) — the PENDING REGISTER is empty.**
 * Spacing is Candidate A's eight steps, `font-bold` (700) is dead and 600 is the
 * heavy weight, and the icon stroke is Lucide's own 2. D0.5a built its ten boxes
 * from the six steps common to both spacing candidates, so the freeze cost zero
 * component changes — which is why the answer could arrive after the components.
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

/**
 * §2.2 — the three weights that survive Q3. 700 was deleted into 600 (Jess,
 * 2026-07-28): the two were doing the same job at every size on `/ui`.
 * A kit file that writes `font-bold` fails `kit-source.test.ts`.
 */
export const TYPE_WEIGHTS: readonly number[] = [400, 500, 600];

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
 * §4.1 Spacing — ✅ FROZEN Q1 = Candidate A, 8 steps (Jess, 2026-07-28).
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
  { px: 6, tailwind: "1.5", use: "icon-to-text gap — most used" },
  { px: 8, tailwind: "2", use: "inside a control" },
  { px: 12, tailwind: "3", use: "standard gap" },
  { px: 16, tailwind: "4", use: "dense card padding · table cell x-pad" },
  { px: 24, tailwind: "6", use: "between blocks · card padding" },
  { px: 32, tailwind: "8", use: "between major regions" },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * §4.4 Grid row height — TWO, and the second is a measurement rather than a
 * taste (SO-3, Loo 2026-08-09: *"row density −15%"*).
 *
 * `ui/MASTER.md` §4 rules 40px the default and names the floor precisely:
 * *"any density change below ~32px therefore moves `badge-height` too"*,
 * because the kit's expand button is 24px at any row height. 40 × 0.85 = **34**,
 * which is above that floor — the 24px control still fits with 5px either side,
 * and no second token moves.
 *
 * **34 is also exactly what the Customer cell needs**, which is why the card
 * asks for both in one breath: `text-body` is 18px of line-height and
 * `text-meta` is 16, so a name over a phone is 34px of ink and the row is 34px
 * tall. The stacked cell and the density are one decision, not two.
 * ──────────────────────────────────────────────────────────────────────── */

export type RowDensity = "default" | "compact";

/** In px. Read by `DataTable` and by the tests that hold the 40px law. */
export const ROW_HEIGHT: Record<RowDensity, number> = {
  default: 40,
  compact: 34,
};

/* ─────────────────────────────────────────────────────────────────────────
 * §5.1 Icons — exactly three sizes; stroke ✅ FROZEN Q4 = 2.
 * ──────────────────────────────────────────────────────────────────────── */

export type IconSize = 14 | 16 | 18;
export const ICON_SIZES: readonly IconSize[] = [14, 16, 18];

/**
 * Lucide's own default, and now the law (Q4, Jess 2026-07-28). `Icon` has no
 * `strokeWidth` prop at all, so this is the only stroke the portal can draw.
 */
export const ICON_STROKE = 2;
