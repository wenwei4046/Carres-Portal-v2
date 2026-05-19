/**
 * operation KPI tile — clickable card with a 3px left accent bar, label,
 * big value, and a secondary hint line.
 *
 * Mirrors `reference/proto/operation-dashboard.jsx` `KPI` (lines 64-72):
 *   - Layout: padding 20, borderLeft 3px solid {accent}
 *   - Label: small-caps tinted to the accent color
 *   - Value: 36px font-display
 *   - Hint: 12px base-600 body
 *
 * Accent palette is driven by warm-linen tokens (index.css):
 *   - "primary" → terracotta `--primary` (Today's deliveries when > 0)
 *   - "warning" → honey `--warning`     (Open POs when > 0)
 *   - "danger"  → vivid red `--danger`  (Overdue when > 0; proto #b91c1c)
 *   - "success" → olive `--success`     (counters at zero / "all clear")
 *   - "muted"   → `--base-400`          (Today when zero)
 *
 * onClick is optional — when omitted the tile renders as a non-interactive
 * div (so a11y + tab order skip past inert tiles). The proto always renders
 * KPI as a button, but we follow the Phase 3 KpiStrip convention of "no
 * cursor when nothing happens" because Loo prefers it.
 */
export type operationKpiAccent =
  | "primary"
  | "warning"
  | "danger"
  | "success"
  | "muted";

interface Props {
  label: string;
  value: number | string;
  hint: string;
  accent: operationKpiAccent;
  onClick?: () => void;
  /** Override the auto a11y label "{label}: {value}, {hint}" if needed. */
  ariaLabel?: string;
}

const accentToBorder: Record<operationKpiAccent, string> = {
  primary: "border-l-primary",
  warning: "border-l-warning",
  danger: "border-l-danger",
  success: "border-l-success",
  muted: "border-l-base-400",
};

const accentToLabel: Record<operationKpiAccent, string> = {
  primary: "text-primary",
  warning: "text-warning",
  danger: "text-danger",
  success: "text-success",
  muted: "text-base-400",
};

export default function OperationKpiTile({
  label,
  value,
  hint,
  accent,
  onClick,
  ariaLabel,
}: Props) {
  const aria = ariaLabel ?? `${label}: ${value}, ${hint}`;
  const borderCls = accentToBorder[accent];
  const labelCls = accentToLabel[accent];

  // Border-left 3px to match proto exactly. shadcn defaults are 1px, so we
  // explicit `border-l-[3px]`. Outer is white card (proto `.card` background)
  // with the same hairline border as the rest of the warm-linen surfaces.
  const baseCls =
    `bg-white border border-base-200 rounded-md p-5 border-l-[3px] ${borderCls} flex flex-col text-left`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={aria}
        className={`${baseCls} cursor-pointer hover:border-base-300 transition-colors`}
      >
        <TileBody label={label} value={value} hint={hint} labelCls={labelCls} />
      </button>
    );
  }
  return (
    <div className={baseCls} aria-label={aria}>
      <TileBody label={label} value={value} hint={hint} labelCls={labelCls} />
    </div>
  );
}

function TileBody({
  label,
  value,
  hint,
  labelCls,
}: {
  label: string;
  value: number | string;
  hint: string;
  labelCls: string;
}) {
  return (
    <>
      <div
        className={`text-[11px] uppercase tracking-[0.18em] font-semibold ${labelCls}`}
      >
        {label}
      </div>
      <div
        data-kpi-value
        className="font-display text-[36px] leading-none mt-1.5 font-bold tracking-tight text-base-900"
      >
        {value}
      </div>
      <div className="text-[12px] text-base-600 mt-1">{hint}</div>
    </>
  );
}
