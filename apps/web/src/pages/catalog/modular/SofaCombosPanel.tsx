import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type {
  CatalogOptionPoolDto,
  SofaCompartmentDto,
  ModelSofaCompartmentDto,
  SofaComboDto,
  SofaHeight,
  FabricTierValue,
} from "@carres/shared";
import {
  activeSofaHeights,
  sofaComboCreateInput,
  sofaComboPatchInput,
  resolveCompartmentPrice,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateSofaCombo, useDeleteSofaCombo, useUpdateSofaCombo } from "@/lib/queries";
import { INPUT_CLS, Modal } from "@/pages/operation/components/Modal";
import { skuMargin } from "../margin";

/**
 * Sofa Combos panel (migration 0179, sofa engine Phase 2) — lives INSIDE
 * ProductModelDrawer for SOFA models only, beside the P1 offered-compartments
 * panel + the fabric-tier override card (a sofa combo is model-scoped via
 * `modelId`, so a per-model panel is the natural home).
 *
 * A sofa combo = an ordered list of SLOTS (each slot an OR-set of compartment
 * `code` strings drawn from THIS model's offered set) priced per seat HEIGHT in
 * a `pricesByHeight` matrix (blank cell = null = combo n/a at that height). The
 * pricing engine (`computeSofaPrice`) picks the best-matching combo via Kuhn
 * subset matching and uses the chosen height's price.
 *
 * Principal-gated EXACTLY like the fabric / offered-compartments panels:
 * sofa_combo_pricing_write_principal RLS + the API's 403 are the real boundary;
 * the UI here just hides Add/Edit/Delete and disables inputs for non-principals
 * so they get a friendly read-only view rather than a 403 toast.
 */

const TIER_LABELS: Record<FabricTierValue, string> = {
  PRICE_1: "P1 – Base",
  PRICE_2: "P2 – Mid",
  PRICE_3: "P3 – Premium",
};

function fmtRM(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A short human summary of a combo's slots, e.g. "2A(LHF)|2A(RHF) + L(LHF)". */
function slotsSummary(slots: string[][]): string {
  if (slots.length === 0) return "—";
  return slots.map((s) => s.join("|")).join(" + ");
}

/** A short summary of which heights carry a price, e.g. "24, 28, 32". */
function pricedHeights(
  pricesByHeight: Record<string, number | null>,
  heights: readonly SofaHeight[],
): string {
  const set = heights.filter((h) => typeof pricesByHeight[h] === "number");
  return set.length === 0 ? "none" : set.join(", ");
}

export default function SofaCombosPanel({
  modelId,
  offered,
  pool,
  combos,
  optionPools,
  isPrincipal,
}: {
  modelId: string;
  /** This model's offered compartments (drives the slot code picker). */
  offered: ModelSofaCompartmentDto[];
  /** The global compartment pool (code/description/default price lookup). */
  pool: SofaCompartmentDto[];
  /** All sofa combos in the bundle (we filter to this model). */
  combos: SofaComboDto[];
  /** 0201-wiring — the Maintenance option pools; the ACTIVE `sofa_size` values
   *  drive which seat-height columns the price grid offers. */
  optionPools?: CatalogOptionPoolDto[] | null;
  isPrincipal: boolean;
}) {
  // The seat-height axis = the ACTIVE Maintenance sofa sizes (falls back to
  // the full canonical axis when the pool is empty/absent).
  const heights = useMemo(() => activeSofaHeights(optionPools), [optionPools]);
  const del = useDeleteSofaCombo();
  // null = closed · "new" = create · a SofaComboDto = edit that combo
  const [editing, setEditing] = useState<SofaComboDto | "new" | null>(null);

  const mine = useMemo(
    () => combos.filter((c) => c.modelId === modelId),
    [combos, modelId],
  );

  // The compartment codes this model offers, with their resolved à-la-carte
  // price (priceOverride ?? pool defaultPrice). Drives the slot picker + the
  // implied-discount baseline.
  const offeredCodes = useMemo(() => {
    const poolById = new Map(pool.map((p) => [p.id, p]));
    const rows = offered
      .map((o) => {
        const comp = poolById.get(o.compartmentId);
        if (!comp) return null;
        return {
          code: comp.code,
          description: comp.description,
          price: resolveCompartmentPrice(o, comp),
        };
      })
      .filter((r): r is { code: string; description: string | null; price: number } => r !== null);
    rows.sort((a, b) => a.code.localeCompare(b.code));
    return rows;
  }, [offered, pool]);

  function removeCombo(combo: SofaComboDto) {
    if (
      !confirm(
        `Disable sofa combo "${combo.label ?? slotsSummary(combo.slots)}"? It will no longer ` +
          `apply at checkout and will show as inactive here. Re-enable it later by editing it ` +
          `and toggling Active back on.`,
      )
    )
      return;
    del.mutate(combo.id, {
      onSuccess: () => toast.success("Sofa combo disabled"),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Disable failed"),
    });
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="label">Sofa combos</div>
        {isPrincipal && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="btn-ghost text-[11px] inline-flex items-center gap-1"
            data-testid="sofa-combo-add"
          >
            <Plus size={13} strokeWidth={2.4} /> New sofa combo
          </button>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-3">
        Matched-shape bundles priced per seat height. When a build matches a combo&apos;s slots,
        the combo price for the chosen height wins over à-la-carte. Pricing is principal-only.
        {!isPrincipal && " Read-only for your role."}
      </p>

      <div className="border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: "minmax(140px,1.4fr) minmax(90px,1fr) 70px 96px" }}
        >
          <div className="label">Slots</div>
          <div className="label">Priced heights</div>
          <div className="label">Tier</div>
          <div className="label text-right">{isPrincipal ? "Actions" : "Status"}</div>
        </div>
        {mine.length === 0 && (
          <div className="t-small text-base-500 px-3 py-3">
            No sofa combos yet for this model.
          </div>
        )}
        {mine.map((combo) => (
          <div
            key={combo.id}
            className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 ${
              combo.active ? "" : "opacity-50"
            }`}
            style={{ gridTemplateColumns: "minmax(140px,1.4fr) minmax(90px,1fr) 70px 96px" }}
            data-testid={`sofa-combo-row-${combo.id}`}
          >
            <div className="min-w-0">
              <div className="t-small font-semibold text-base-900 truncate">
                {combo.label ?? slotsSummary(combo.slots)}
              </div>
              {combo.label && (
                <div className="t-tiny text-base-400 truncate">{slotsSummary(combo.slots)}</div>
              )}
            </div>
            <div className="t-tiny text-base-600 t-num">{pricedHeights(combo.pricesByHeight, heights)}</div>
            <div className="t-tiny text-base-600">{combo.tier ? combo.tier.replace("PRICE_", "P") : "Any"}</div>
            <div className="text-right flex justify-end items-center gap-3">
              {isPrincipal ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(combo)}
                    className="t-tiny font-semibold text-base-700 hover:text-base-900 underline"
                    data-testid={`sofa-combo-edit-${combo.id}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCombo(combo)}
                    disabled={del.isPending}
                    className="btn-danger text-[11px]"
                    data-testid={`sofa-combo-delete-${combo.id}`}
                  >
                    Disable
                  </button>
                </>
              ) : combo.active ? (
                <span className="pill pill-confirmed">Active</span>
              ) : (
                <span className="pill pill-neutral">Inactive</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {isPrincipal && editing !== null && (
        <SofaComboEditor
          modelId={modelId}
          offeredCodes={offeredCodes}
          heights={heights}
          combo={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor (create + edit)
// ---------------------------------------------------------------------------

interface OfferedCode {
  code: string;
  description: string | null;
  price: number;
}

function SofaComboEditor({
  modelId,
  offeredCodes,
  heights,
  combo,
  onClose,
}: {
  modelId: string;
  offeredCodes: OfferedCode[];
  /** The seat-height columns to offer (ACTIVE Maintenance sofa sizes). */
  heights: readonly SofaHeight[];
  combo: SofaComboDto | null;
  onClose: () => void;
}) {
  const create = useCreateSofaCombo();
  const update = useUpdateSofaCombo();
  const editing = combo !== null;

  // slots: ordered list of OR-sets (each an array of codes). Start with one
  // empty slot when creating.
  const [slots, setSlots] = useState<string[][]>(
    combo ? combo.slots.map((s) => [...s]) : [[]],
  );
  // prices-by-height: a string per offered height ("" = null = n/a at that height).
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const h of heights) {
      const v = combo?.pricesByHeight?.[h];
      init[h] = typeof v === "number" ? String(v) : "";
    }
    return init;
  });
  // 0183 — cost-by-height: a principal-only benchmark mirroring the price grid.
  // "" = no cost at that height. The whole map collapses to null when EVERY
  // height is blank (distinct from {} = authored-but-all-n/a). Display-only —
  // cost never feeds checkout / order / finance pricing.
  const [costs, setCosts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const h of heights) {
      const v = combo?.costByHeight?.[h];
      init[h] = typeof v === "number" ? String(v) : "";
    }
    return init;
  });
  const [tier, setTier] = useState<FabricTierValue | "">(combo?.tier ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(
    combo?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
  );
  const [active, setActive] = useState(combo?.active ?? true);
  const [label, setLabel] = useState(combo?.label ?? "");

  const busy = create.isPending || update.isPending;

  const priceByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of offeredCodes) m.set(o.code, o.price);
    return m;
  }, [offeredCodes]);

  // --- derived payload ---------------------------------------------------
  // Clean slots: trim, drop empties; a slot with no codes is dropped.
  const cleanSlots = useMemo(
    () =>
      slots
        .map((s) => Array.from(new Set(s.map((c) => c.trim()).filter(Boolean))))
        .filter((s) => s.length > 0),
    [slots],
  );

  const pricesByHeight = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const h of heights) {
      const raw = prices[h]?.trim() ?? "";
      out[h] = raw === "" ? null : Number(raw);
    }
    return out;
  }, [prices]);

  // 0183 — cost benchmark map; null when NO height carries a cost (so an
  // untouched combo never gains a phantom {} cost). Otherwise blanks → null.
  const costByHeight = useMemo<Record<string, number | null> | null>(() => {
    const out: Record<string, number | null> = {};
    let anyCost = false;
    for (const h of heights) {
      const raw = costs[h]?.trim() ?? "";
      if (raw === "") {
        out[h] = null;
      } else {
        out[h] = Number(raw);
        anyCost = true;
      }
    }
    return anyCost ? out : null;
  }, [costs]);

  // --- per-height implied-discount baseline ------------------------------
  // À-la-carte baseline = Σ over slots of the FIRST code's resolved price
  // (matches what the combo's matched-subset would cost at à-la-carte; the
  // engine uses the matched cells, but the FIRST code is the representative one
  // the author authored the slot around).
  const baseline = useMemo(
    () =>
      cleanSlots.reduce((sum, slot) => sum + (priceByCode.get(slot[0]!) ?? 0), 0),
    [cleanSlots, priceByCode],
  );

  // --- validation via the shared zod (one schema, two consumers) ---------
  const candidate: Record<string, unknown> = {
    modelId,
    slots: cleanSlots,
    tier: tier === "" ? null : tier,
    pricesByHeight,
    costByHeight,
    label: label.trim() === "" ? null : label.trim(),
    effectiveFrom,
    active,
  };
  const schema = editing ? sofaComboPatchInput : sofaComboCreateInput;
  const parsed = schema.safeParse(candidate);
  const canSave = parsed.success && !busy;

  function setSlotCodes(i: number, next: string[]) {
    setSlots((ss) => ss.map((s, idx) => (idx === i ? next : s)));
  }
  function addSlot() {
    setSlots((ss) => [...ss, []]);
  }
  function removeSlot(i: number) {
    setSlots((ss) => (ss.length <= 1 ? ss : ss.filter((_, idx) => idx !== i)));
  }

  async function save() {
    if (!parsed.success) return;
    const payload = {
      modelId,
      slots: cleanSlots,
      tier: tier === "" ? null : (tier as FabricTierValue),
      pricesByHeight,
      // Always send costByHeight (null when no height carries a cost) so clearing
      // every cost on edit clears the DB benchmark.
      costByHeight,
      label: label.trim() === "" ? null : label.trim(),
      effectiveFrom,
      active,
    };
    try {
      if (editing && combo) {
        await update.mutateAsync({ id: combo.id, patch: payload });
        toast.success("Sofa combo updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Sofa combo added");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  return (
    <Modal title={editing ? "Edit sofa combo" : "New sofa combo"} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        {/* Label + scalars */}
        <div className="flex flex-wrap gap-4 items-end">
          <label className="block flex-1 min-w-[220px]">
            <span className="label block mb-1">Label (optional)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="auto from slots if blank"
              className={INPUT_CLS}
              data-testid="sofa-combo-label"
            />
          </label>
          <label className="block">
            <span className="label block mb-1">Fabric tier</span>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as FabricTierValue | "")}
              className={`${INPUT_CLS} text-[12px]`}
              data-testid="sofa-combo-tier"
            >
              <option value="">Any tier</option>
              {(Object.keys(TIER_LABELS) as FabricTierValue[]).map((t) => (
                <option key={t} value={t}>{TIER_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label block mb-1">Effective from</span>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className={`${INPUT_CLS} text-[12px]`}
              data-testid="sofa-combo-effective-from"
            />
          </label>
          <label className="inline-flex items-center gap-2 pb-2 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-primary"
              data-testid="sofa-combo-active"
            />
            <span className="t-small text-base-700">Active</span>
          </label>
        </div>

        {/* Slots editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="label">Slots (ordered OR-sets)</span>
            <button
              type="button"
              onClick={addSlot}
              className="btn-ghost text-[12px] inline-flex items-center gap-1"
              data-testid="sofa-combo-add-slot"
            >
              <Plus size={13} strokeWidth={2.4} /> Add slot
            </button>
          </div>
          {offeredCodes.length === 0 && (
            <p className="t-tiny text-base-400 mb-2">
              This model offers no compartments yet — tick some in Offered compartments above first.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {slots.map((slot, i) => (
              <div
                key={i}
                className="flex items-start gap-2 bg-base-50 border border-base-200 rounded-[4px] px-2.5 py-2"
                data-testid={`sofa-combo-slot-${i}`}
              >
                <span className="t-tiny text-base-400 t-num mt-2 w-5 shrink-0">{i + 1}</span>
                <SlotCodePicker
                  selected={slot}
                  options={offeredCodes}
                  onChange={(next) => setSlotCodes(i, next)}
                  testId={`sofa-combo-slot-${i}`}
                />
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  disabled={slots.length <= 1}
                  className="p-2 text-base-400 hover:text-danger disabled:opacity-30 mt-0.5"
                  aria-label={`remove slot ${i + 1}`}
                  data-testid={`sofa-combo-remove-slot-${i}`}
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
          <p className="t-tiny text-base-400 mt-1.5">
            Each slot must be filled by a distinct built compartment whose code is in that slot.
            Extra compartments beyond the slots add at à-la-carte.
          </p>
        </div>

        {/* Prices-by-height grid */}
        <div>
          <span className="label block mb-1.5">Combo price by seat height (RM)</span>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${heights.length}, minmax(0,1fr))` }}>
            {heights.map((h) => {
              const raw = prices[h]?.trim() ?? "";
              const priceNum = raw === "" ? null : Number(raw);
              const saves =
                priceNum !== null && Number.isFinite(priceNum) ? baseline - priceNum : null;
              return (
                <label key={h} className="block">
                  <span className="t-tiny text-base-500 block mb-0.5">{h}&Prime;</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={prices[h] ?? ""}
                    onChange={(e) => setPrices((p) => ({ ...p, [h]: e.target.value }))}
                    placeholder="n/a"
                    className={`${INPUT_CLS} text-right t-num text-[12px]`}
                    data-testid={`sofa-combo-price-${h}`}
                    aria-label={`combo price at height ${h}`}
                  />
                  {saves !== null && (
                    <span
                      className={`block t-tiny mt-0.5 text-right t-num ${
                        saves >= 0 ? "text-base-500" : "text-danger"
                      }`}
                      data-testid={`sofa-combo-implied-${h}`}
                    >
                      {saves >= 0 ? `−RM ${fmtRM(saves)}` : `+RM ${fmtRM(-saves)}`}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="t-tiny text-base-400 mt-1.5">
            Blank = the combo does not apply at that height. À-la-carte baseline (sum of each
            slot&apos;s first code):{" "}
            <b className="t-num text-base-600">RM {fmtRM(baseline)}</b>. The figure under each
            price is the implied discount (or markup) vs that baseline.
          </p>
        </div>

        {/* Cost-by-height grid (0183, principal-only benchmark, display-only) */}
        <div>
          <span className="label block mb-1.5">Cost benchmark by seat height (RM)</span>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${heights.length}, minmax(0,1fr))` }}>
            {heights.map((h) => {
              const priceRaw = prices[h]?.trim() ?? "";
              const priceNum = priceRaw === "" ? null : Number(priceRaw);
              const costRaw = costs[h]?.trim() ?? "";
              const costNum = costRaw === "" ? null : Number(costRaw);
              // Margin of the height's selling price vs its cost benchmark.
              // Reuses the canonical skuMargin (single source of truth).
              const margin =
                priceNum !== null && Number.isFinite(priceNum) && priceNum > 0
                  ? skuMargin(priceNum, costNum !== null && Number.isFinite(costNum) ? costNum : null)
                  : null;
              return (
                <label key={h} className="block">
                  <span className="t-tiny text-base-500 block mb-0.5">{h}&Prime;</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={costs[h] ?? ""}
                    onChange={(e) => setCosts((c) => ({ ...c, [h]: e.target.value }))}
                    placeholder="n/a"
                    className={`${INPUT_CLS} text-right t-num text-[12px]`}
                    data-testid={`sofa-combo-cost-${h}`}
                    aria-label={`combo cost at height ${h}`}
                  />
                  <span
                    className={`block t-tiny mt-0.5 text-right t-num ${margin != null && margin.amount < 0 ? "text-danger" : "text-base-500"}`}
                    data-testid={`sofa-combo-margin-${h}`}
                  >
                    {margin != null ? `${(margin.pct * 100).toFixed(1)}%` : "—"}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="t-tiny text-base-400 mt-1.5">
            Principal-only benchmark. Blank = no cost set at that height. The figure below each cost
            is the margin vs that height&apos;s selling price. Cost never affects checkout pricing.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-1">
          <button type="button" onClick={onClose} className="btn-ghost text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid="sofa-combo-save"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Create sofa combo"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Slot code picker — a multi-select over the model's offered compartment codes.
// A slot is an OR-set; ticking ≥1 code adds them to the slot.
// ---------------------------------------------------------------------------

function SlotCodePicker({
  selected,
  options,
  onChange,
  testId,
}: {
  selected: string[];
  options: OfferedCode[];
  onChange: (next: string[]) => void;
  testId: string;
}) {
  const selectedSet = new Set(selected);

  function toggle(code: string) {
    const next = new Set(selectedSet);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(Array.from(next));
  }

  return (
    <div className="flex-1 min-w-0">
      {/* Selected chips */}
      <div className="flex flex-wrap gap-1.5 mb-1.5" data-testid={`${testId}-selected`}>
        {selected.length === 0 ? (
          <span className="t-tiny text-base-400">No codes — tick one or more below.</span>
        ) : (
          selected.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 t-tiny font-medium px-2 py-0.5 rounded-full bg-base-900 text-white"
              data-testid={`${testId}-chip-${code}`}
            >
              {code}
              <button
                type="button"
                onClick={() => toggle(code)}
                aria-label={`remove ${code}`}
                className="text-white/70 hover:text-white leading-none"
              >
                <X size={11} strokeWidth={2.6} />
              </button>
            </span>
          ))
        )}
      </div>
      {/* Offered code options */}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selectedSet.has(o.code);
          return (
            <button
              key={o.code}
              type="button"
              onClick={() => toggle(o.code)}
              aria-pressed={on}
              title={o.description ?? undefined}
              className={`t-tiny font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                on
                  ? "bg-base-900 text-white border-base-900"
                  : "bg-white text-base-500 border-base-300 hover:border-base-500"
              }`}
              data-testid={`${testId}-opt-${o.code}`}
            >
              <span className="font-mono">{o.code}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
