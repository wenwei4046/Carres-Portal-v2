/**
 * ConfigureTopbarBrand — Loo 2026-07-26: inside the WIZARD, a full-page
 * configure surface (PosConfigurePage / SofaConfigurePage) shows the same
 * top-left strip as the POS topbar — CARRES wordmark + `POS · {store}` +
 * the 01/02/03 step crumbs — and the LOGO is the way back to the catalog
 * (replaces the old ← arrow; PR 299 made the real topbar's logo behave the
 * same way).
 *
 * Display-only outside the logo: the step crumbs are static (01 Cart is the
 * active pill — configuring happens inside step 1; the wizard's own topbar
 * also offers no forward jumps from step 1). Callers OUTSIDE the wizard
 * (order-detail edit, AddProductOverlay) have no wizard context — they omit
 * the prop and keep the plain back arrow.
 */

const STEPS = ["Cart", "Customer", "Confirmed"] as const;

export interface WizardTopbarCtx {
  /** The topbar's `POS · {store}` label (outlet / acting store / dealer). */
  contextLabel: string;
}

export default function ConfigureTopbarBrand({
  ctx,
  onBack,
  compact = false,
}: {
  ctx: WizardTopbarCtx;
  onBack: () => void;
  /** Loo 2026-07-26 (2990s reference) — the SOFA header shares ONE row with
   *  the size/mode tabs + PWP bar + total, so it takes the logo + crumb ONLY
   *  (no step pills); the ← arrow stays beside it like the 2990s. */
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        minWidth: 0,
        // Compact rides the packed sofa header row — let the crumb give way.
        flexShrink: compact ? 1 : 0,
      }}
      data-testid="cfg-topbar-brand"
    >
      <button
        type="button"
        className="pos-wordmark"
        onClick={onBack}
        title="Back to catalog"
        aria-label="Back to catalog"
        data-testid="cfg-topbar-logo"
      >
        CARRES
      </button>
      <span
        className="pos-topbar__crumb"
        style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        POS · {ctx.contextLabel}
      </span>
      {/* Same class as the real topbar's step rail — single-source type. */}
      {!compact && (
        <span className="pos-topbar__center" style={{ justifyContent: "flex-start" }}>
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`pos-topbar__step ${i === 0 ? "is-active" : ""}`}
              aria-current={i === 0 ? "step" : undefined}
              style={{ cursor: "default", whiteSpace: "nowrap" }}
            >
              <span style={{ opacity: 0.55, marginRight: 6 }}>0{i + 1}</span>
              {label}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
