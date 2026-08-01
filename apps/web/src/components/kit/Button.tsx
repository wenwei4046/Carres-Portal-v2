/**
 * Button — UI-KIT §6 Box Dictionary, card D0.5a.
 *
 * THREE variants, and the ladder is a colour law, not a taste:
 *   primary  — `blue-9` filled. Blue is §3.3's ONE job "action · clickable",
 *              and §3.4 bans two blue actions in one block, so a block gets
 *              exactly one of these.
 *   neutral  — white surface + `slate-5` hairline. Every other action.
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
type Size = "md" | "sm";

const VARIANT: Record<Variant, string> = {
  primary: "bg-kit-blue-9 text-white border border-kit-blue-9 hover:brightness-95",
  neutral: "bg-white text-kit-slate-12 border border-kit-slate-5 hover:bg-kit-blue-3",
  ghost: "bg-transparent text-kit-slate-11 border border-transparent hover:bg-kit-blue-3",
};

/** 32px is the live control height every form row already aligns to; 24px is
 *  the dense band. Both are heights, not spacing — Q1 does not reach them. */
const SIZE: Record<Size, string> = {
  md: "h-8 px-3 gap-2",
  sm: "h-6 px-2 gap-1",
};

const ICON_SIZE: Record<Size, 14 | 16> = { md: 16, sm: 14 };

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  /**
   * `pill` = fully rounded ends (Jess, 2026-08-01 — the 2990 toolbar
   * language). The default stays `rounded-control`; a pill is a SHAPE, never
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
 * (added by D0.5b). `Modal`, `DropdownMenu`, `Popover` and `Tooltip` take a
 * Button as their trigger and hand it Radix's behaviour through `asChild`,
 * which anchors the overlay on the trigger's own DOM node. A Button that eats
 * the ref makes every one of those open in the wrong place — silently, because
 * React only warns.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
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
        `inline-flex items-center justify-center whitespace-nowrap ${shape === "pill" ? "rounded-full" : "rounded-control"} text-body font-medium ` +
        "transition-[filter,background-color] " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 focus-visible:ring-offset-1 " +
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 " +
        `${VARIANT[variant]} ${SIZE[size]}`
      }
      {...rest}
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
