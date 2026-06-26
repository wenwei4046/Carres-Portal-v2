import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  AddonDto,
  CatalogResponse,
  DeliveryFeeConfigDto,
  ProductCategory,
  RuleTarget,
  SofaCompartmentDto,
  SpecialDeliveryFeeRuleDto,
} from "@carres/shared";
import { MAX_DELIVERY_FLOOR } from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useCreateAddon,
  useDeleteAddon,
  usePatchAddon,
  usePatchFloorConfig,
  useUpdateDeliveryFeeConfig,
  useCreateSpecialDeliveryFeeRule,
  useUpdateSpecialDeliveryFeeRule,
  useDeleteSpecialDeliveryFeeRule,
  useUpdateFabricTierConfig,
  useCreateSofaCompartment,
  useUpdateSofaCompartment,
  useDeleteSofaCompartment,
} from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";
import OptionPoolEditor from "./OptionPoolEditor";
import RuleTargetPicker, { finalizeRuleTargets } from "./RuleTargetPicker";

/** The product categories the delivery base fee can be scoped to. */
const CHARGEABLE_CATEGORIES: ProductCategory[] = [
  "mattress",
  "bedframe",
  "sofa",
  "accessory",
  "service",
];

/** Dormant default config when the bundle carries no `deliveryFeeConfig`
 *  (pre-0184 / not loaded). Mirrors the migration 0184 seed. */
const DEFAULT_DELIVERY_FEE_CONFIG: DeliveryFeeConfigDto = {
  baseFee: 0,
  crossCategoryFee: 0,
  chargedCategories: ["sofa", "mattress", "bedframe"],
  mattressBedframeLeadDays: 14,
  sofaLeadDays: 21,
};

/**
 * Maintenance (narrow) — the global catalog config that isn't per-model:
 *   • Delivery fee (floor_config singleton) — principal-only (RLS
 *     floor_write_principal), so the editor is UI-gated to principal.
 *   • Add-ons (addons) — name / price / active, with a read-only link to the
 *     Service-category SKU each add-on charges through (addons.service_sku).
 *   • Global option pools (0182) — supplier_category + bedframe/mattress sizes,
 *     curated principal-only reference lists rendered via OptionPoolEditor.
 *
 * NOTE: the 0182 pools are GLOBAL reference lists. Per-model variant axes
 * (the actual sizes / colours / gaps / compartments a model offers) still live
 * per-model in allowed_options, edited on the Modular tab's drawer — the size
 * pools here only feed that drawer's picker as curated suggestions.
 */
export default function MaintenanceTab({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  return (
    <div className="flex flex-col gap-8 max-w-[680px]">
      <DeliveryTripFeeSection catalog={catalog} isPrincipal={isPrincipal} />
      <SpecialDeliveryRulesSection catalog={catalog} isPrincipal={isPrincipal} />
      <DeliveryFeeSection catalog={catalog} isPrincipal={isPrincipal} />
      <FabricTierDeltasCard catalog={catalog} isPrincipal={isPrincipal} />
      <SofaCompartmentsSection catalog={catalog} isPrincipal={isPrincipal} />
      <AddonsSection addons={catalog.addons} />
      <OptionPoolsSection catalog={catalog} isPrincipal={isPrincipal} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0182 — Global option pools (2990s Products parity Phase 4). Three curated
// READ-ONLY reference lists: supplier_category + the two size pools. These only
// SUGGEST — no order-side consumer reads them (sizes still live per-model in
// allowed_options.sizes; supplier_category is curate-only this phase).
// ---------------------------------------------------------------------------

function OptionPoolsSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const pools = catalog.optionPools ?? [];
  return (
    <>
      <OptionPoolEditor
        pool="supplier_category"
        title="Supplier Categories"
        description="Curated list of the product categories a supplier can cover. Reference only — supplier coverage is still set per supplier."
        entries={pools.filter((p) => p.pool === "supplier_category")}
        isPrincipal={isPrincipal}
      />
      <OptionPoolEditor
        pool="bedframe_size"
        title="Bedframe Sizes"
        description="Suggested bedframe sizes shown in the per-model size picker. Each model's active sizes stay authoritative — this only offers quick-add suggestions."
        entries={pools.filter((p) => p.pool === "bedframe_size")}
        isPrincipal={isPrincipal}
      />
      <OptionPoolEditor
        pool="mattress_size"
        title="Mattress Sizes"
        description="Suggested mattress sizes shown in the per-model size picker. Each model's active sizes stay authoritative — this only offers quick-add suggestions."
        entries={pools.filter((p) => p.pool === "mattress_size")}
        isPrincipal={isPrincipal}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 0184 — Delivery TRIP fee config (singleton) — principal-gated.
// A flat per-order base fee + a sofa × mattress/bedframe cross-category
// surcharge + the principal-selected charged-category set + the lead-day floors.
// DORMANT by default (0/0) → byte-identical order totals until rates are set.
// Distinct from the stair-carry fee above; both fold into the order total. The
// server (Hono recompute) is authoritative — it appends the fee as order_addons.
// ---------------------------------------------------------------------------

function DeliveryTripFeeSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const patch = useUpdateDeliveryFeeConfig();
  const cfg = catalog.deliveryFeeConfig ?? DEFAULT_DELIVERY_FEE_CONFIG;

  const [base, setBase] = useState(String(cfg.baseFee));
  const [cross, setCross] = useState(String(cfg.crossCategoryFee));
  const [charged, setCharged] = useState<string[]>(cfg.chargedCategories);
  const [mbLead, setMbLead] = useState(String(cfg.mattressBedframeLeadDays));
  const [sofaLead, setSofaLead] = useState(String(cfg.sofaLeadDays));

  // Re-sync when the bundle refetches (another session saved, or our own save
  // round-tripped) so the editor never shows stale numbers.
  useEffect(() => {
    setBase(String(cfg.baseFee));
    setCross(String(cfg.crossCategoryFee));
    setCharged(cfg.chargedCategories);
    setMbLead(String(cfg.mattressBedframeLeadDays));
    setSofaLead(String(cfg.sofaLeadDays));
  }, [cfg.baseFee, cfg.crossCategoryFee, cfg.chargedCategories, cfg.mattressBedframeLeadDays, cfg.sofaLeadDays]);

  const baseNum = Number(base);
  const crossNum = Number(cross);
  const mbNum = Number(mbLead);
  const sofaNum = Number(sofaLead);
  const valid =
    Number.isFinite(baseNum) && baseNum >= 0 &&
    Number.isFinite(crossNum) && crossNum >= 0 &&
    Number.isInteger(mbNum) && mbNum >= 0 &&
    Number.isInteger(sofaNum) && sofaNum >= 0;
  const sameCharged =
    charged.length === cfg.chargedCategories.length &&
    charged.every((c) => cfg.chargedCategories.includes(c));
  const dirty =
    baseNum !== cfg.baseFee ||
    crossNum !== cfg.crossCategoryFee ||
    mbNum !== cfg.mattressBedframeLeadDays ||
    sofaNum !== cfg.sofaLeadDays ||
    !sameCharged;

  function toggleCat(cat: string) {
    setCharged((cur) => (cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat]));
  }

  function save() {
    if (!valid || !dirty) return;
    patch.mutate(
      {
        baseFee: baseNum,
        crossCategoryFee: crossNum,
        // Values come only from the typed CHARGEABLE_CATEGORIES toggles + the
        // DB's existing (valid) categories; the PATCH input now enums-checks
        // these server-side too (FIX E).
        chargedCategories: charged as ProductCategory[],
        mattressBedframeLeadDays: mbNum,
        sofaLeadDays: sofaNum,
      },
      {
        onSuccess: () => toast.success("Delivery trip fee saved"),
        onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <section>
      <div className="t-h4 font-display mb-1">Delivery trip fee</div>
      <p className="t-tiny text-base-500 mb-3">
        A flat trip fee charged once per order that contains a charged-category
        line, plus a reduced cross-order follow-up rate on a second SO that
        completes a sofa + mattress/bedframe purchase across two orders. Leave
        both at 0 to keep it dormant.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>
      <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-5 items-end">
          <label className="block">
            <span className="label block mb-1">Base trip fee (RM)</span>
            <input
              type="number" min={0} step="0.01" value={base}
              disabled={!isPrincipal}
              onChange={(e) => setBase(e.target.value)}
              className={`${INPUT_CLS} w-32 disabled:opacity-60`}
              data-testid="delivery-base-fee"
            />
          </label>
          <label className="block">
            <span className="label block mb-1">Cross-order follow-up rate (RM)</span>
            <input
              type="number" min={0} step="0.01" value={cross}
              disabled={!isPrincipal}
              onChange={(e) => setCross(e.target.value)}
              className={`${INPUT_CLS} w-32 disabled:opacity-60`}
              data-testid="delivery-cross-fee"
            />
          </label>
        </div>
        <p className="t-tiny text-base-400 -mt-1">
          Reduced delivery rate on a follow-up SO that completes a cross-category
          purchase (sofa + mattress/bedframe across two orders).
        </p>
        <div>
          <span className="label block mb-1.5">Charged categories</span>
          <div className="flex flex-wrap gap-1.5">
            {CHARGEABLE_CATEGORIES.map((cat) => {
              const on = charged.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={on}
                  disabled={!isPrincipal}
                  onClick={() => toggleCat(cat)}
                  className={`rounded-[4px] border px-2.5 py-1 text-[12px] capitalize transition-colors disabled:opacity-60 ${
                    on
                      ? "border-base-900 bg-base-900 text-white"
                      : "border-base-300 bg-white text-base-600 hover:border-base-500"
                  }`}
                  data-testid={`delivery-cat-${cat}`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
          <p className="t-tiny text-base-400 mt-1.5">
            An order pays the base fee only if it has a line in one of these categories.
          </p>
        </div>
        <div className="flex flex-wrap gap-5 items-end">
          <label className="block">
            <span className="label block mb-1">Mattress / bedframe lead (days)</span>
            <input
              type="number" min={0} step="1" value={mbLead}
              disabled={!isPrincipal}
              onChange={(e) => setMbLead(e.target.value)}
              className={`${INPUT_CLS} w-32 disabled:opacity-60`}
              data-testid="delivery-mb-lead"
            />
          </label>
          <label className="block">
            <span className="label block mb-1">Sofa lead (days)</span>
            <input
              type="number" min={0} step="1" value={sofaLead}
              disabled={!isPrincipal}
              onChange={(e) => setSofaLead(e.target.value)}
              className={`${INPUT_CLS} w-32 disabled:opacity-60`}
              data-testid="delivery-sofa-lead"
            />
          </label>
          {isPrincipal && (
            <button
              type="button"
              onClick={save}
              disabled={!valid || !dirty || patch.isPending}
              className="btn-primary text-[12px] disabled:opacity-40"
              data-testid="delivery-fee-save"
            >
              {patch.isPending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 0184 — Special delivery rules — per-RuleTarget overrides of the base fee.
// A matched line's standalone fee supersedes the config base (highest wins); the
// follow-up fee is the reduced rate when the order links an earlier SO as a
// cross-category follow-up. Principal-gated.
// ---------------------------------------------------------------------------

/** Human summary of a rule's RuleTarget[] — model name + scope detail. */
function summarizeTargets(targets: RuleTarget[], catalog: CatalogResponse): string {
  if (targets.length === 0) return "Every order";
  const nameById = new Map(catalog.models.map((m) => [m.id, m.name || m.modelKey]));
  return targets
    .map((t) => {
      const name = nameById.get(t.modelId) ?? (t.modelId || "any model");
      if (t.scope === "variant" && t.sizeCodes?.length) return `${name} (${t.sizeCodes.join(", ")})`;
      if (t.scope === "combo" && t.comboIds?.length) return `${name} (${t.comboIds.length} combo${t.comboIds.length === 1 ? "" : "s"})`;
      if (t.scope === "compartment" && t.compartments?.length) return `${name} (${t.compartments.join(", ")})`;
      return name;
    })
    .join(" · ");
}

function SpecialDeliveryRulesSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const rules = (catalog.specialDeliveryFeeRules ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">Special delivery rules</div>
        {isPrincipal && (
          <button type="button" onClick={() => setAdding((v) => !v)} className="btn-ghost text-[12px]">
            {adding ? "Close" : "+ Add rule"}
          </button>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-3">
        Override the base trip fee for specific models / sizes / sofa combos /
        compartments (e.g. a bulky model that needs a special transport rate).
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {adding && isPrincipal && (
        <RuleForm catalog={catalog} onDone={() => setAdding(false)} />
      )}

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: "minmax(160px,1.6fr) 120px 120px 90px" }}
        >
          <div className="label">Target</div>
          <div className="label text-right">Standalone (RM)</div>
          <div className="label text-right">Follow-up (RM)</div>
          <div className="label text-right">Actions</div>
        </div>
        {rules.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4">No special delivery rules.</div>
        )}
        {rules.map((rule) => (
          <SpecialDeliveryRuleRow key={rule.id} rule={rule} catalog={catalog} isPrincipal={isPrincipal} />
        ))}
      </div>
    </section>
  );
}

function SpecialDeliveryRuleRow({
  rule,
  catalog,
  isPrincipal,
}: {
  rule: SpecialDeliveryFeeRuleDto;
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const del = useDeleteSpecialDeliveryFeeRule();

  function remove() {
    if (!confirm(`Delete this special delivery rule${rule.label ? ` "${rule.label}"` : ""}?`)) return;
    del.mutate(rule.id, {
      onSuccess: () => toast.success("Rule deleted"),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Delete failed"),
    });
  }

  if (editing) {
    return (
      <div className="px-3 py-3 border-b border-base-100 last:border-b-0 bg-base-50">
        <RuleForm catalog={catalog} rule={rule} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: "minmax(160px,1.6fr) 120px 120px 90px" }}
      data-testid={`delivery-rule-row-${rule.id}`}
    >
      <div className="min-w-0">
        <div className="text-[13px] truncate">{rule.label || summarizeTargets(rule.target, catalog)}</div>
        {rule.label && (
          <div className="t-tiny text-base-400 truncate">{summarizeTargets(rule.target, catalog)}</div>
        )}
        {!rule.active && <span className="pill pill-neutral mt-0.5">inactive</span>}
      </div>
      <div className="text-right font-mono text-[12px]">{rule.standaloneFee.toFixed(2)}</div>
      <div className="text-right font-mono text-[12px]">{rule.crossCategoryFollowupFee.toFixed(2)}</div>
      <div className="text-right flex justify-end gap-1.5">
        {isPrincipal && (
          <>
            <button type="button" onClick={() => setEditing(true)} className="btn-ghost text-[11px]">
              Edit
            </button>
            <button type="button" onClick={remove} disabled={del.isPending} className="btn-danger text-[11px]">
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Create / edit a special delivery rule. `rule` present = patch mode. */
function RuleForm({
  catalog,
  rule,
  onDone,
}: {
  catalog: CatalogResponse;
  rule?: SpecialDeliveryFeeRuleDto;
  onDone: () => void;
}) {
  const create = useCreateSpecialDeliveryFeeRule();
  const update = useUpdateSpecialDeliveryFeeRule();
  const [target, setTarget] = useState<RuleTarget[]>(rule?.target ?? []);
  const [standalone, setStandalone] = useState(String(rule?.standaloneFee ?? ""));
  const [followup, setFollowup] = useState(String(rule?.crossCategoryFollowupFee ?? ""));
  const [label, setLabel] = useState(rule?.label ?? "");
  const [active, setActive] = useState(rule?.active ?? true);
  const busy = create.isPending || update.isPending;

  const finalTargets = finalizeRuleTargets(target);
  const standaloneNum = standalone.trim() === "" ? 0 : Number(standalone);
  const followupNum = followup.trim() === "" ? 0 : Number(followup);
  const valid =
    finalTargets.length >= 1 &&
    Number.isFinite(standaloneNum) && standaloneNum >= 0 &&
    Number.isFinite(followupNum) && followupNum >= 0;

  async function submit() {
    if (!valid) return;
    const body = {
      target: finalTargets,
      standaloneFee: standaloneNum,
      crossCategoryFollowupFee: followupNum,
      label: label.trim() || null,
      active,
    };
    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, patch: body });
        toast.success("Rule updated");
      } else {
        await create.mutateAsync(body);
        toast.success("Rule added");
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  return (
    <div className="bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-col gap-3">
      <div>
        <span className="label block mb-1.5">Applies to</span>
        <RuleTargetPicker catalog={catalog} value={target} onChange={setTarget} />
        <p className="t-tiny text-base-400 mt-1.5">Tick at least one model. Sizes / combos / compartments narrow within a model.</p>
      </div>
      <div className="flex flex-wrap gap-4 items-end">
        <label className="block">
          <span className="label block mb-1">Standalone fee (RM)</span>
          <input
            type="number" min={0} step="0.01" value={standalone}
            onChange={(e) => setStandalone(e.target.value)}
            className={`${INPUT_CLS} w-32`}
            data-testid="rule-standalone-fee"
          />
        </label>
        <label className="block">
          <span className="label block mb-1">Follow-up fee (RM)</span>
          <input
            type="number" min={0} step="0.01" value={followup}
            onChange={(e) => setFollowup(e.target.value)}
            className={`${INPUT_CLS} w-32`}
            data-testid="rule-followup-fee"
          />
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="label block mb-1">Label (optional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Bulky sofa transport"
            className={`${INPUT_CLS} w-full`}
            data-testid="rule-label"
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4" />
          Active
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDone} className="btn-ghost text-[12px]">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || busy}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid="rule-save"
          >
            {busy ? "Saving…" : rule ? "Save" : "Add rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stair-carry fee (floor_config) — principal-gated
// ---------------------------------------------------------------------------

function DeliveryFeeSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const patch = usePatchFloorConfig();
  const fc = catalog.floorConfig;
  const [freeUpTo, setFreeUpTo] = useState(String(fc.freeUpToFloor));
  const [perFloor, setPerFloor] = useState(String(fc.perFloorPerItem));

  // Re-sync the inputs if the bundle refetches with new floor_config values
  // (another session saved, or our own save round-tripped) so the editor never
  // shows stale numbers against a changed server state.
  useEffect(() => {
    setFreeUpTo(String(fc.freeUpToFloor));
    setPerFloor(String(fc.perFloorPerItem));
  }, [fc.freeUpToFloor, fc.perFloorPerItem]);

  const freeNum = Number(freeUpTo);
  const perNum = Number(perFloor);
  const valid =
    Number.isInteger(freeNum) &&
    freeNum >= 0 &&
    Number.isFinite(perNum) &&
    perNum >= 0;
  const dirty = freeNum !== fc.freeUpToFloor || perNum !== fc.perFloorPerItem;

  function save() {
    if (!valid || !dirty) return;
    patch.mutate(
      { freeUpToFloor: freeNum, perFloorPerItem: perNum },
      {
        onSuccess: () => toast.success("Delivery fee saved"),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <section>
      <div className="t-h4 font-display mb-1">Stair-carry fee</div>
      <p className="t-tiny text-base-500 mb-3">
        Free up to a floor, then a per-floor-per-item charge. Carres does not
        stair-carry above floor {MAX_DELIVERY_FLOOR}. Separate from the delivery
        trip fee — both fold into the order total.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>
      <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-wrap gap-5 items-end">
        <label className="block">
          <span className="label block mb-1">Free up to floor</span>
          <input
            type="number"
            min={0}
            step="1"
            value={freeUpTo}
            disabled={!isPrincipal}
            onChange={(e) => setFreeUpTo(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
          />
        </label>
        <label className="block">
          <span className="label block mb-1">Per floor / item (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={perFloor}
            disabled={!isPrincipal}
            onChange={(e) => setPerFloor(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
          />
        </label>
        {isPrincipal && (
          <button
            type="button"
            onClick={save}
            disabled={!valid || !dirty || patch.isPending}
            className="btn-primary text-[12px] disabled:opacity-40"
          >
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Fabric tier deltas (global config) — principal-gated
// ---------------------------------------------------------------------------

/**
 * FabricTierDeltasCard — global RM premium for P2 and P3 sofa fabrics.
 * These apply to all sofa models unless a per-model override is set in the
 * Modular drawer. Principal-only write (RLS + UI gate).
 */
function FabricTierDeltasCard({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const patch = useUpdateFabricTierConfig();
  const cfg = catalog.fabricTierConfig;

  const [t2, setT2] = useState(String(cfg?.sofaTier2Delta ?? 0));
  const [t3, setT3] = useState(String(cfg?.sofaTier3Delta ?? 0));

  // Re-sync when bundle refetches (another session saved or our own save)
  useEffect(() => {
    setT2(String(cfg?.sofaTier2Delta ?? 0));
    setT3(String(cfg?.sofaTier3Delta ?? 0));
  }, [cfg?.sofaTier2Delta, cfg?.sofaTier3Delta]);

  const t2Num = Number(t2);
  const t3Num = Number(t3);
  const valid =
    Number.isFinite(t2Num) && t2Num >= 0 &&
    Number.isFinite(t3Num) && t3Num >= 0;
  const dirty =
    t2Num !== (cfg?.sofaTier2Delta ?? 0) ||
    t3Num !== (cfg?.sofaTier3Delta ?? 0);

  function save() {
    if (!valid || !dirty) return;
    patch.mutate(
      { sofaTier2Delta: t2Num, sofaTier3Delta: t3Num },
      {
        onSuccess: () => toast.success("Fabric tier deltas saved"),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <section>
      <div className="t-h4 font-display mb-1">Fabric tier deltas</div>
      <p className="t-tiny text-base-500 mb-3">
        Global RM premium added to the base sofa price for P2 (mid) and P3 (premium) fabrics.
        P1 fabrics always carry zero delta. Per-model overrides in the Modular tab take precedence.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>
      <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-wrap gap-5 items-end">
        <label className="block">
          <span className="label block mb-1">P2 delta (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={t2}
            disabled={!isPrincipal}
            onChange={(e) => setT2(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
            data-testid="global-tier2-delta"
          />
        </label>
        <label className="block">
          <span className="label block mb-1">P3 delta (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={t3}
            disabled={!isPrincipal}
            onChange={(e) => setT3(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
            data-testid="global-tier3-delta"
          />
        </label>
        {isPrincipal && (
          <button
            type="button"
            onClick={save}
            disabled={!valid || !dirty || patch.isPending}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid="global-tier-save"
          >
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {/* Summary pill */}
      <p className="t-tiny text-base-500 mt-2" data-testid="fabric-tier-summary">
        P2 adds <span className="font-semibold text-base-800">RM {(cfg?.sofaTier2Delta ?? 0).toFixed(2)}</span>
        &nbsp;&middot;&nbsp;
        P3 adds <span className="font-semibold text-base-800">RM {(cfg?.sofaTier3Delta ?? 0).toFixed(2)}</span>
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Add-ons CRUD
// ---------------------------------------------------------------------------

function AddonsSection({ addons }: { addons: AddonDto[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">Add-ons</div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="btn-ghost text-[12px]"
        >
          {adding ? "Close" : "+ Add add-on"}
        </button>
      </div>
      <p className="t-tiny text-base-500 mb-3">
        Optional services offered at checkout (e.g. disposal). Each charges
        through its linked Service SKU.
      </p>

      {adding && <AddonAddForm onDone={() => setAdding(false)} />}

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: "minmax(140px,1.4fr) 120px 150px 110px" }}
        >
          <div className="label">Name</div>
          <div className="label text-right">Price (RM)</div>
          <div className="label">Service SKU</div>
          <div className="label text-right">Actions</div>
        </div>
        {addons.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4">No add-ons configured.</div>
        )}
        {addons.map((a) => (
          <AddonRow key={a.key} addon={a} />
        ))}
      </div>
    </section>
  );
}

function AddonRow({ addon }: { addon: AddonDto }) {
  const patch = usePatchAddon();
  const del = useDeleteAddon();

  function commitName(raw: string) {
    const next = raw.trim();
    if (next.length < 2 || next === addon.name) return;
    patch.mutate(
      { key: addon.key, patch: { name: next } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }
  function commitPrice(raw: string) {
    const v = Number(raw.trim());
    if (!Number.isFinite(v) || v < 0 || v === addon.price) return;
    patch.mutate(
      { key: addon.key, patch: { price: v } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }
  function remove() {
    if (
      !confirm(
        `Disable add-on "${addon.name}"? It will no longer be offered at checkout and ` +
          `will drop off this list. To restore it later, "+ Add add-on" with the same key (${addon.key}).`,
      )
    )
      return;
    del.mutate(addon.key, {
      onSuccess: () => toast.success(`${addon.name} disabled`),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Disable failed"),
    });
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: "minmax(140px,1.4fr) 120px 150px 110px" }}
      data-testid={`addon-row-${addon.key}`}
    >
      <input
        defaultValue={addon.name}
        onBlur={(e) => commitName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${addon.key} name`}
        className="w-full px-2 py-1 border border-transparent hover:border-base-200 focus:border-base-400 rounded-[3px] text-[13px] outline-none bg-transparent"
      />
      <input
        type="number"
        min={0}
        step="0.01"
        defaultValue={addon.price}
        onBlur={(e) => commitPrice(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${addon.key} price`}
        className={`${INPUT_CLS} text-right font-mono text-[12px]`}
      />
      <div>{addon.serviceSku ? <CodeChip>{addon.serviceSku}</CodeChip> : <span className="t-tiny text-base-400">—</span>}</div>
      <div className="text-right">
        <button
          type="button"
          onClick={remove}
          disabled={del.isPending}
          className="btn-danger text-[11px]"
        >
          Disable
        </button>
      </div>
    </div>
  );
}

function AddonAddForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAddon();
  const patch = usePatchAddon();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [serviceSku, setServiceSku] = useState("");
  const busy = create.isPending || patch.isPending;

  const keyValid = /^[a-z0-9-]{2,60}$/.test(key.trim());
  const priceNum = Number(price);
  const skuValid = serviceSku.trim() === "" || /^SVC-[A-Z0-9-]+$/.test(serviceSku.trim());
  const valid =
    keyValid &&
    name.trim().length >= 2 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    skuValid;

  async function submit() {
    if (!valid) return;
    const body = {
      key: key.trim(),
      name: name.trim(),
      price: priceNum,
      serviceSku: serviceSku.trim() || null,
    };
    try {
      await create.mutateAsync(body);
      toast.success(`Added ${name}`);
      onDone();
    } catch (e) {
      // The GET bundle is active-only, so a previously-disabled add-on with
      // this key is invisible here and a fresh insert hits the unique key
      // (mapPgError has no 23505 case → 500 with a "duplicate key" message).
      // Treat that as "restore": PATCH the existing row back to active + update.
      const conflict =
        e instanceof ApiError && /duplicate key|already exists|unique/i.test(e.message);
      if (!conflict) {
        toast.error(e instanceof ApiError ? e.message : "Add failed");
        return;
      }
      try {
        await patch.mutateAsync({
          key: body.key,
          patch: { name: body.name, price: body.price, active: true, serviceSku: body.serviceSku },
        });
        toast.success(`Restored ${name}`);
        onDone();
      } catch (e2) {
        toast.error(e2 instanceof ApiError ? e2.message : "Restore failed");
      }
    }
  }

  return (
    <div className="bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-wrap gap-3 items-end">
      <label className="block">
        <span className="label block mb-1">Key (kebab-case)</span>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="dispose-mattress"
          className={`${INPUT_CLS} w-44`}
        />
      </label>
      <label className="block">
        <span className="label block mb-1">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Old mattress disposal"
          className={`${INPUT_CLS} w-52`}
        />
      </label>
      <label className="block">
        <span className="label block mb-1">Price (RM)</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={`${INPUT_CLS} w-28`}
        />
      </label>
      <label className="block">
        <span className="label block mb-1">Service SKU (optional)</span>
        <input
          value={serviceSku}
          onChange={(e) => setServiceSku(e.target.value)}
          placeholder="SVC-DISPOSE-MATTRESS"
          className={`${INPUT_CLS} w-52 font-mono`}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={!valid || busy}
        className="btn-primary text-[12px] disabled:opacity-40"
      >
        {busy ? "Saving…" : "Add"}
      </button>
      <p className="t-tiny text-base-400 basis-full">
        Re-using a disabled add-on's key restores it.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0178 — Sofa compartments (the "Base" pool) — principal-gated
// ---------------------------------------------------------------------------

function SofaCompartmentsSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const compartments = (catalog.sofaCompartments ?? [])
    .filter((c) => c.active)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">Sofa Compartments</div>
        {isPrincipal && (
          <button type="button" onClick={() => setAdding((v) => !v)} className="btn-ghost text-[12px]">
            {adding ? "Close" : "+ Add compartment"}
          </button>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-3">
        The compartment pool (1A(LHF), 1NA, 2A(RHF), …). A sofa is assembled from
        these; each sofa model ticks which it offers in the Modular tab.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {adding && isPrincipal && <SofaCompartmentAddForm onDone={() => setAdding(false)} />}

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: "120px minmax(160px,1.6fr) 130px 110px" }}
        >
          <div className="label">Code</div>
          <div className="label">Description</div>
          <div className="label text-right">Default price (RM)</div>
          <div className="label text-right">Actions</div>
        </div>
        {compartments.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4">No compartments configured.</div>
        )}
        {compartments.map((comp) => (
          <SofaCompartmentRow key={comp.id} comp={comp} isPrincipal={isPrincipal} />
        ))}
      </div>
    </section>
  );
}

function SofaCompartmentRow({
  comp,
  isPrincipal,
}: {
  comp: SofaCompartmentDto;
  isPrincipal: boolean;
}) {
  const patch = useUpdateSofaCompartment();
  const del = useDeleteSofaCompartment();

  function commitDescription(raw: string) {
    const next = raw.trim();
    if (next === (comp.description ?? "")) return;
    patch.mutate(
      { id: comp.id, patch: { description: next || null } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }
  function commitPrice(raw: string) {
    const v = Number(raw.trim());
    if (!Number.isFinite(v) || v < 0 || v === comp.defaultPrice) return;
    patch.mutate(
      { id: comp.id, patch: { defaultPrice: v } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }
  function remove() {
    if (!confirm(`Disable compartment "${comp.code}"? It will drop off this list.`)) return;
    del.mutate(comp.id, {
      onSuccess: () => toast.success(`${comp.code} disabled`),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Disable failed"),
    });
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: "120px minmax(160px,1.6fr) 130px 110px" }}
      data-testid={`compartment-row-${comp.code}`}
    >
      <div>
        <CodeChip>{comp.code}</CodeChip>
      </div>
      <input
        defaultValue={comp.description ?? ""}
        disabled={!isPrincipal}
        onBlur={(e) => commitDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${comp.code} description`}
        className="w-full px-2 py-1 border border-transparent hover:border-base-200 focus:border-base-400 rounded-[3px] text-[13px] outline-none bg-transparent disabled:opacity-60"
      />
      <input
        type="number"
        min={0}
        step="0.01"
        defaultValue={comp.defaultPrice}
        disabled={!isPrincipal}
        onBlur={(e) => commitPrice(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${comp.code} default price`}
        className={`${INPUT_CLS} text-right font-mono text-[12px] disabled:opacity-60`}
      />
      <div className="text-right">
        {isPrincipal && (
          <button type="button" onClick={remove} disabled={del.isPending} className="btn-danger text-[11px]">
            Disable
          </button>
        )}
      </div>
    </div>
  );
}

function SofaCompartmentAddForm({ onDone }: { onDone: () => void }) {
  const create = useCreateSofaCompartment();
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [seatCount, setSeatCount] = useState("");
  const [price, setPrice] = useState("");
  const busy = create.isPending;

  const codeValid = code.trim().length >= 1 && /^[A-Za-z0-9()\-_/. ]+$/.test(code.trim());
  const priceNum = price.trim() === "" ? 0 : Number(price);
  const seatNum = seatCount.trim() === "" ? null : Number(seatCount);
  const valid =
    codeValid &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    (seatNum === null || (Number.isInteger(seatNum) && seatNum >= 0));

  async function submit() {
    if (!valid) return;
    try {
      await create.mutateAsync({
        code: code.trim(),
        description: description.trim() || null,
        seatCount: seatNum,
        defaultPrice: priceNum,
      });
      toast.success(`Added ${code.trim()}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Add failed");
    }
  }

  return (
    <div className="bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-wrap gap-3 items-end">
      <label className="block">
        <span className="label block mb-1">Code</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="1A(LHF)" className={`${INPUT_CLS} w-32 font-mono`} />
      </label>
      <label className="block">
        <span className="label block mb-1">Description</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="1 seat, ONE arm (left)" className={`${INPUT_CLS} w-60`} />
      </label>
      <label className="block">
        <span className="label block mb-1">Seats</span>
        <input type="number" min={0} step="1" value={seatCount} onChange={(e) => setSeatCount(e.target.value)} className={`${INPUT_CLS} w-20`} />
      </label>
      <label className="block">
        <span className="label block mb-1">Default price (RM)</span>
        <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={`${INPUT_CLS} w-28`} />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={!valid || busy}
        className="btn-primary text-[12px] disabled:opacity-40"
        data-testid="compartment-add-submit"
      >
        {busy ? "Saving…" : "Add"}
      </button>
    </div>
  );
}
