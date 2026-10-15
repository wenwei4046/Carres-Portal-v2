/**
 * Button — UI-KIT §6 Box Dictionary, card D0.5a.
 *
 * THREE variants, and the ladder is a colour law, not a taste:
 *   primary  — charcoal filled (owner-confirmed template 2026-10-08). One
 *              per area, so a block gets exactly one of these.
 *   neutral  — white surface + the grey input edge. Every other action.
 *   ghost    — no box at all. Tertiary (cancel, + add …).
 *
 * There is NO danger variant. §3.3 gives red one job — "late · act now" — and
 * §3.4 bans colour as decoration; a red button paints intent onto a control
 * instead of onto the state that earned it. A destructive action is a neutral
 * button whose WORD says what it does (COPY-STANDARD owns the word).
 *
 * **No `className`, no `style`, and that is the enforcement.** UI-KIT §0.1 says
 * a chat may not invent component styles; the way to make that true is to give
 * it nowhere to put one. Layout around the button is the caller's wrapper.
 *
 * HOVER follows §3.5 exactly: a colour-filled surface keeps its own colour and
 * darkens (`brightness-95`); an uncoloured one takes the single faint blue tint
 * — never grey, which is the RULE I ratchet in `check-design-standard.mjs`.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import Loading from "./Loading";

type Variant = "primary" | "neutral" | "ghost";
type Size = "md" | "sm" | "touch";

/* The main button is the `--c-main` token (01 §1, owner 11 Oct 2026): one per
 * area, white text. A normal button is white with the grey input edge. */
const VARIANT: Record<Variant, string> = {
  primary: "bg-c-main text-white border border-c-main hover:brightness-125",
  neutral: "bg-white text-c-ink border border-c-input-border hover:bg-c-info-bg",
  ghost: "bg-transparent text-kit-slate-11 border border-transparent hover:bg-kit-slate-3",
};

/** Keep the existing md32 toolbar contract during consumer migration; the
 *  small role is28 per current01 §3.
 *  `touch` is the Work party-card button (owner density ruling 2026-09-25):
 *  36px from 768px, 40px below, where a finger presses it. */
const SIZE: Record<Size, string> = {
  md: "h-10 px-3 gap-2 min-[768px]:h-8",
  sm: "h-7 px-2 gap-1",
  touch: "h-10 px-3 gap-1.5 min-[768px]:h-9",
};

const ICON_SIZE: Record<Size, 14 | 16> = { md: 16, sm: 14, touch: 14 };

export type ButtonProps = {
  /** Page-tools trigger: 32px desktop, 40px touch, with an accessible name. */
  iconOnly?: boolean;
  variant?: Variant;
  size?: Size;
  /**
   * `pill` = fully rounded ends (Jess, 2026-08-01 — the 2990 toolbar
   * language). The default is the v4 8px corner (`rounded-lg`); a pill is a SHAPE, never
   * a fourth variant: colour and behaviour are untouched.
   */
  shape?: "control" | "pill";
  /** A §5.3 meaning, never a Lucide import — one meaning, one glyph. */
  icon?: IconName;
  /** Busy: the spinner replaces the icon and the button stops accepting input. */
  loading?: boolean;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style">;

/**
 * **It forwards its ref, and that is load-bearing rather than tidiness**
 * (added by D0.5b). `Modal`, `CMenu`, `Popover` and `Tooltip` take a
 * Button as their trigger and hand it Radix's behaviour through `asChild`,
 * which anchors the overlay on the trigger's own DOM node. A Button that eats
 * the ref makes every one of those open in the wrong place — silently, because
 * React only warns.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    iconOnly = false,
    variant = "neutral",
    size = "md",
    shape = "control",
    icon,
    loading = false,
    disabled = false,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-kit="button"
      className={
        `inline-flex items-center justify-center whitespace-nowrap ${shape === "pill" ? "rounded-full" : "rounded-lg"} text-body ${variant === "primary" ? "font-semibold" : "font-medium"} ` +
        "transition-[filter,background-color] " +
        "focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:2px] " +
        "disabled:opacity-[0.45] disabled:cursor-not-allowed disabled:hover:brightness-100 " +
        `${VARIANT[variant]} ${iconOnly ? "h-10 w-10 p-0 min-[768px]:h-8 min-[768px]:w-8" : SIZE[size]}`
      }
      {...rest}
      title={rest.title ?? (iconOnly ? rest["aria-label"] : undefined)}
    >
      {loading ? (
        <Loading size={ICON_SIZE[size]} />
      ) : (
        icon && <Icon name={icon} size={ICON_SIZE[size]} />
      )}
      {children}
    </button>
  );
});

export default Button;
