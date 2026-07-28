import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  DeliveryFeeConfigDto,
  ProductCategory,
  RuleTarget,
  SpecialDeliveryFeeRuleDto,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useUpdateDeliveryFeeConfig,
  useCreateSpecialDeliveryFeeRule,
  useUpdateSpecialDeliveryFeeRule,
  useDeleteSpecialDeliveryFeeRule,
} from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
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
 * Delivery — its own top-level Product & Maintenance tab (Loo 2026-07-06;
 * previously the Maintenance tab's "Delivery Fees" sidebar panel). Hosts every
 * delivery-fee config in one place:
 *
 *   • Delivery trip fee — flat per-order base fee + cross-order follow-up rate +
 *     charged categories + lead-day floors (0184).
 *   • Special delivery rules — per-RuleTarget overrides of the base fee (0184).
 *
 * (The stair-carry fee is an order-level add-on charge, not trip config — it
 * lives in Special Add-ons › Order Add-ons since Loo 2026-07-06.)
 *
 * Both are principal-gated writes; other roles get a read-only veneer.
 */
export default function DeliveryTab({
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0184 — Delivery TRIP fee config (singleton) — principal-gated.
// A flat per-order base fee + a sofa × mattress/bedframe cross-category
// surcharge + the principal-selected charged-category set + the lead-day floors.
// DORMANT by default (0/0) → byte-identical order totals until rates are set.
// Distinct from the stair-carry fee below; both fold into the order total. The
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
        {/* P1 (2026-07-28) — the two lead-day boxes that used to sit here are
            RETIRED. They were editable, they were saved, and nothing on earth
            read them: the real floor was a constant in the code. The one
            number now lives on Purchasing → Settings as `Earliest date a store
            may sell`, and the POS + the server-side gate both read it. The
            columns stay in the table (nothing is dropped) with no writer. */}
        <div className="flex flex-wrap gap-5 items-end">
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
      <div className="text-right t-num text-[12px]">{rule.standaloneFee.toFixed(2)}</div>
      <div className="text-right t-num text-[12px]">{rule.crossCategoryFollowupFee.toFixed(2)}</div>
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

