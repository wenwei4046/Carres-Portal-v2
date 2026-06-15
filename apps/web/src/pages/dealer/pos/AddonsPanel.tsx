import type { AddonDto } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import {
  DISPOSAL_SIZE_OPTIONS,
  isDisposalAddon,
  type DraftAddon,
  type WizardDraft,
} from "../new-order/draft";

/**
 * Add-ons grid for the POS catalog "Add-ons" rail entry. Lifted from the
 * legacy Step2Products add-on block: a card grid over `catalog.addons`,
 * disposal add-ons carry a required size picker (red border until set — the
 * `step2Valid` disposal-size gate, surfaced again on the cart's Proceed CTA).
 * Writes to `draft.addons` only.
 */
export default function AddonsPanel({
  addons,
  draft,
  onChange,
}: {
  addons: AddonDto[];
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
}) {
  function toggleAddon(addonKey: string) {
    const existing = draft.addons.find((a) => a.key === addonKey);
    if (existing) {
      onChange({ ...draft, addons: draft.addons.filter((a) => a.key !== addonKey) });
      return;
    }
    const meta = addons.find((a) => a.key === addonKey);
    if (!meta) return;
    const next: DraftAddon = { key: meta.key, qty: 1, unitPrice: meta.price, name: meta.name };
    // Disposal add-ons need a size pick before the cart will proceed; init
    // attrs: {} so the size dropdown renders empty + the gate stays closed.
    if (isDisposalAddon(meta.key)) {
      next.attrs = {};
    }
    onChange({ ...draft, addons: [...draft.addons, next] });
  }

  function bumpAddonQty(addonKey: string, delta: number) {
    onChange({
      ...draft,
      addons: draft.addons.map((a) =>
        a.key === addonKey ? { ...a, qty: Math.max(1, a.qty + delta) } : a,
      ),
    });
  }

  function setAddonSize(addonKey: string, size: string) {
    onChange({
      ...draft,
      addons: draft.addons.map((a) =>
        a.key === addonKey
          ? { ...a, attrs: { ...(a.attrs ?? {}), size: size || undefined } }
          : a,
      ),
    });
  }

  if (addons.length === 0) {
    return <p className="t-small text-base-500">No add-ons configured.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {addons.map((a) => {
        const selected = draft.addons.find((d) => d.key === a.key);
        if (!selected) {
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => toggleAddon(a.key)}
              className="card text-left px-3.5 py-3 hover:border-primary transition-colors"
            >
              <div className="t-small font-medium">+ {a.name}</div>
              <div className="font-mono text-[11px] text-base-500 mt-1">{rm(a.price)}</div>
            </button>
          );
        }
        return (
          <div
            key={a.key}
            className="rounded-md px-3.5 py-3 border-[1.5px] border-primary bg-signature-50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="t-small font-medium truncate">+ {a.name}</div>
                <div className="font-mono text-[11px] text-base-500 mt-1">
                  {rm(selected.unitPrice)} ea
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleAddon(a.key)}
                className="text-base-500 hover:text-destructive text-sm leading-none px-1 -mt-0.5"
                aria-label={`Remove ${a.name}`}
              >
                ×
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-1.5 bg-white border border-base-300 rounded px-1.5 py-0.5">
                <button
                  type="button"
                  onClick={() => bumpAddonQty(a.key, -1)}
                  className="px-2 py-0.5 text-sm rounded hover:bg-base-100"
                  aria-label={`Decrease ${a.name} quantity`}
                >
                  −
                </button>
                <span className="font-mono text-[12px] w-5 text-center tabular-nums">
                  {selected.qty}
                </span>
                <button
                  type="button"
                  onClick={() => bumpAddonQty(a.key, 1)}
                  className="px-2 py-0.5 text-sm rounded hover:bg-base-100"
                  aria-label={`Increase ${a.name} quantity`}
                >
                  +
                </button>
              </div>
              <span className="font-mono text-[12px] font-semibold text-primary">
                {rm(selected.unitPrice * selected.qty)}
              </span>
            </div>
            {isDisposalAddon(a.key) && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-base-500">
                  Size
                </span>
                <select
                  value={selected.attrs?.size ?? ""}
                  onChange={(e) => setAddonSize(a.key, e.target.value)}
                  aria-label={`${a.name} size`}
                  className={`flex-1 h-7 px-2 border rounded text-[11.5px] bg-white outline-none focus:border-primary ${
                    selected.attrs?.size ? "border-base-300" : "border-destructive/60"
                  }`}
                >
                  <option value="">Select size…</option>
                  {(DISPOSAL_SIZE_OPTIONS[a.key] ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
