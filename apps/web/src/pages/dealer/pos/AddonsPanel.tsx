import { Plus, X, Minus } from "lucide-react";
import type { AddonDto } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import {
  DISPOSAL_SIZE_OPTIONS,
  isDisposalAddon,
  type DraftAddon,
  type WizardDraft,
} from "../new-order/draft";

/**
 * Add-ons grid for the POS catalog "Add-ons" rail entry. Re-skinned as small
 * .pos-card tiles; disposal add-ons keep the required-size gate (red border
 * until a size is chosen). All toggle/qty/size logic: UNCHANGED.
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
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
      {addons.map((a) => {
        const selected = draft.addons.find((d) => d.key === a.key);

        if (!selected) {
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => toggleAddon(a.key)}
              className="pos-card text-left p-4 flex flex-col gap-2 group"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="t-small font-semibold text-base-900">{a.name}</span>
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-base-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-colors">
                  <Plus size={13} strokeWidth={2} />
                </span>
              </div>
              <span className="font-mono text-[13px] text-base-500">{rm(a.price)}</span>
            </button>
          );
        }

        return (
          <div key={a.key} className="pos-card pos-selected p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="t-small font-semibold text-base-900 truncate">{a.name}</div>
                <div className="font-mono text-[12px] text-base-500 mt-0.5">
                  {rm(selected.unitPrice)} ea
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleAddon(a.key)}
                className="flex-shrink-0 w-6 h-6 rounded-full bg-base-100 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
                aria-label={`Remove ${a.name}`}
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>

            {/* Qty stepper */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 border border-base-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => bumpAddonQty(a.key, -1)}
                  className="w-7 h-7 flex items-center justify-center hover:bg-base-50 transition-colors"
                  aria-label={`Decrease ${a.name} quantity`}
                >
                  <Minus size={12} strokeWidth={2} />
                </button>
                <span className="font-mono text-[12px] w-5 text-center tabular-nums">
                  {selected.qty}
                </span>
                <button
                  type="button"
                  onClick={() => bumpAddonQty(a.key, 1)}
                  className="w-7 h-7 flex items-center justify-center hover:bg-base-50 transition-colors"
                  aria-label={`Increase ${a.name} quantity`}
                >
                  <Plus size={12} strokeWidth={2} />
                </button>
              </div>
              <span className="pos-price text-[14px]">{rm(selected.unitPrice * selected.qty)}</span>
            </div>

            {/* Disposal size gate — red border until chosen */}
            {isDisposalAddon(a.key) && (
              <div className="flex items-center gap-2 pt-1">
                <span className="kicker text-base-400">Size</span>
                <select
                  value={selected.attrs?.size ?? ""}
                  onChange={(e) => setAddonSize(a.key, e.target.value)}
                  aria-label={`${a.name} size`}
                  className={`flex-1 h-7 px-2 rounded-lg border text-[11.5px] bg-white outline-none focus:border-primary transition-colors ${
                    selected.attrs?.size ? "border-base-200" : "border-destructive/60"
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
