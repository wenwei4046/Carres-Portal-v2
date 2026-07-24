// design-standard: not-a-list-page — commission config editors inside the HR
// tabbed shell; the page header lives in HrApp.
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CommissionMethod } from "@carres/shared";
import Btn from "@/components/Btn";
import { fieldCls } from "@/components/Field";
import Segmented from "@/components/Segmented";
import { SectionBand, SectionCard } from "@/components/SectionPanel";
import { rm } from "@/lib/format-currency";
import {
  useHrReport,
  useHrSetMilestones,
  useHrSetModelRate,
  useHrSetModelTiers,
  useHrSetScheme,
  useHrSetStaffRate,
} from "@/lib/queries";

/**
 * Commission Setup tab (0244/0245) — three stacked config blocks:
 *   a. Method per store  (percentage vs per-model; store-level default rows)
 *   b. Staff % rates     (effective-dated append; manager − seller = override)
 *   c. Per-model rates + volume tiers + overall milestones
 * Everything is dormant RM0 until authored here.
 */

const ROLE_LABEL: Record<string, string> = {
  principal: "Principal",
  manager: "Manager",
  salesperson: "Salesperson",
};

/** Milestone category choices — null means every item category counts. */
const MILESTONE_CATEGORIES: { value: string; label: string }[] = [
  { value: "", label: "All items" },
  { value: "mattress", label: "Mattress" },
  { value: "bedframe", label: "Bedframe" },
  { value: "sofa", label: "Sofa" },
  { value: "accessory", label: "Accessory" },
];

interface TierDraft {
  thresholdQty: string;
  bonusAmount: string;
}
interface MilestoneDraft {
  category: string; // "" = all
  thresholdQty: string;
  bonusAmount: string;
}

export default function HrSetupTab({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const { data, isLoading, isError } = useHrReport(year, month);

  const setScheme = useHrSetScheme();
  const setStaffRate = useHrSetStaffRate();
  const setModelRate = useHrSetModelRate();
  const setModelTiers = useHrSetModelTiers();
  const setMilestones = useHrSetMilestones();

  const [methodOpen, setMethodOpen] = useState(true);
  const [ratesOpen, setRatesOpen] = useState(true);
  const [modelOpen, setModelOpen] = useState(true);

  // b. staff % rate drafts (string; empty = untouched, shows the current pct)
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});

  // c. per-model editor state
  const [modelId, setModelId] = useState<string>("");
  const [perUnitDraft, setPerUnitDraft] = useState<string>("");
  const [tierDrafts, setTierDrafts] = useState<TierDraft[]>([]);
  const [milestoneDrafts, setMilestoneDrafts] = useState<MilestoneDraft[]>([]);
  const milestonesSeeded = useRef(false);

  const config = data?.config;
  const staff = useMemo(() => data?.staff ?? [], [data]);
  const models = useMemo(() => data?.models ?? [], [data]);

  // distinct stores (from the staff roster — one row per dealerId)
  const stores = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of staff) {
      if (!seen.has(s.dealerId)) {
        seen.set(s.dealerId, s.storeName || "Unnamed store");
      }
    }
    return [...seen.entries()].map(([dealerId, name]) => ({ dealerId, name }));
  }, [staff]);

  // models grouped by category for the picker
  const modelsByCategory = useMemo(() => {
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const m of models) {
      const g = groups.get(m.category);
      if (g) g.push(m);
      else groups.set(m.category, [{ id: m.id, name: m.name }]);
    }
    return [...groups.entries()];
  }, [models]);

  /** Latest effective-dated pct for a staff row (append-only history). */
  const currentPct = (salespersonId: string): number | null => {
    let best: { pct: number; effectiveFrom: string } | null = null;
    for (const r of config?.rates ?? []) {
      if (r.salespersonId !== salespersonId) continue;
      if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
    }
    return best?.pct ?? null;
  };

  const storeMethod = (dealerId: string): CommissionMethod =>
    config?.schemes.find((s) => s.dealerId === dealerId && s.outletId === null)
      ?.method ?? "percentage";

  // re-seed the per-model editors whenever the picked model changes
  useEffect(() => {
    if (!modelId || !config) return;
    const rate = config.modelRates.find((r) => r.modelId === modelId);
    setPerUnitDraft(rate ? String(rate.perUnitAmount) : "");
    setTierDrafts(
      config.modelTiers
        .filter((t) => t.modelId === modelId)
        .sort((a, b) => a.thresholdQty - b.thresholdQty)
        .map((t) => ({
          thresholdQty: String(t.thresholdQty),
          bonusAmount: String(t.bonusAmount),
        })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  // seed the milestones editor once, when the config first arrives
  useEffect(() => {
    if (milestonesSeeded.current || !config) return;
    milestonesSeeded.current = true;
    setMilestoneDrafts(
      config.milestones.map((m) => ({
        category: m.category ?? "",
        thresholdQty: String(m.thresholdQty),
        bonusAmount: String(m.bonusAmount),
      })),
    );
  }, [config]);

  if (isLoading) {
    return <div className="py-12 text-[13px] text-base-500">Loading commission setup…</div>;
  }
  if (isError || !data || !config) {
    return (
      <div className="py-12 text-[13px] text-danger">
        Failed to load commission setup. Refresh to retry.
      </div>
    );
  }

  const saveStaffRate = (salespersonId: string, name: string) => {
    const raw = rateDraft[salespersonId];
    const pct = Number(raw);
    if (raw === undefined || raw.trim() === "" || Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Enter a rate between 0 and 100");
      return;
    }
    setStaffRate.mutate(
      { salespersonId, pct },
      {
        onSuccess: () => {
          toast.success(`${name}'s rate set to ${pct}% from today`);
          setRateDraft((d) => {
            const next = { ...d };
            delete next[salespersonId];
            return next;
          });
        },
        onError: (e) => toast.error(e.message || "Save failed"),
      },
    );
  };

  const savePerUnit = () => {
    if (!modelId) return;
    const modelName = models.find((m) => m.id === modelId)?.name ?? "model";
    if (perUnitDraft.trim() === "") {
      // empty = remove the rate
      setModelRate.mutate(
        { modelId, perUnitAmount: null },
        {
          onSuccess: () => toast.success(`Per-unit rate removed for ${modelName}`),
          onError: (e) => toast.error(e.message || "Save failed"),
        },
      );
      return;
    }
    const amount = Number(perUnitDraft);
    if (Number.isNaN(amount) || amount < 0) {
      toast.error("Enter a per-unit amount of RM 0 or more");
      return;
    }
    setModelRate.mutate(
      { modelId, perUnitAmount: amount },
      {
        onSuccess: () => toast.success(`Per-unit rate saved for ${modelName}`),
        onError: (e) => toast.error(e.message || "Save failed"),
      },
    );
  };

  const saveTiers = () => {
    if (!modelId) return;
    const tiers: { thresholdQty: number; bonusAmount: number }[] = [];
    for (const t of tierDrafts) {
      const thresholdQty = Number(t.thresholdQty);
      const bonusAmount = Number(t.bonusAmount);
      if (
        !Number.isInteger(thresholdQty) || thresholdQty < 1 ||
        Number.isNaN(bonusAmount) || bonusAmount < 0
      ) {
        toast.error("Each tier needs a whole-number quantity (1+) and a bonus of RM 0 or more");
        return;
      }
      tiers.push({ thresholdQty, bonusAmount });
    }
    setModelTiers.mutate(
      { modelId, tiers },
      {
        onSuccess: () => toast.success("Tier ladder saved"),
        onError: (e) => toast.error(e.message || "Save failed"),
      },
    );
  };

  const saveMilestones = () => {
    const milestones: {
      category: string | null;
      thresholdQty: number;
      bonusAmount: number;
    }[] = [];
    for (const m of milestoneDrafts) {
      const thresholdQty = Number(m.thresholdQty);
      const bonusAmount = Number(m.bonusAmount);
      if (
        !Number.isInteger(thresholdQty) || thresholdQty < 1 ||
        Number.isNaN(bonusAmount) || bonusAmount < 0
      ) {
        toast.error("Each milestone needs a whole-number quantity (1+) and a bonus of RM 0 or more");
        return;
      }
      milestones.push({
        category: m.category === "" ? null : m.category,
        thresholdQty,
        bonusAmount,
      });
    }
    setMilestones.mutate(
      { milestones },
      {
        onSuccess: () => toast.success("Milestones saved"),
        onError: (e) => toast.error(e.message || "Save failed"),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* a. Method per store */}
      <SectionCard>
        <SectionBand
          title="Commission method per store"
          collapsed={!methodOpen}
          onToggle={() => setMethodOpen((v) => !v)}
          total={stores.length}
        />
        {methodOpen && (
          <div className="px-2 py-1">
            {stores.length === 0 && (
              <div className="py-4 text-[13px] text-base-500">
                No showroom stores with staff yet.
              </div>
            )}
            {stores.map((store) => (
              <div
                key={store.dealerId}
                className="h-11 flex items-center justify-between gap-3 border-b border-base-100 last:border-b-0"
              >
                <div className="text-[13px] font-semibold text-base-900 truncate">
                  {store.name}
                </div>
                <Segmented
                  ariaLabel={`Commission method for ${store.name}`}
                  options={[
                    { value: "percentage", label: "% of sales" },
                    { value: "per_model", label: "Per model" },
                  ]}
                  value={storeMethod(store.dealerId)}
                  onChange={(method) =>
                    setScheme.mutate(
                      { dealerId: store.dealerId, outletId: null, method },
                      {
                        onSuccess: () =>
                          toast.success(
                            `${store.name} now pays ${
                              method === "percentage" ? "% of sales" : "per model"
                            }`,
                          ),
                        onError: (e) => toast.error(e.message || "Save failed"),
                      },
                    )
                  }
                />
              </div>
            ))}
            <div className="py-2 text-[12px] text-base-500">
              The method applies to the whole store. Every store starts on % of
              sales until changed here.
            </div>
          </div>
        )}
      </SectionCard>

      {/* b. Staff % rates */}
      <SectionCard>
        <SectionBand
          title="Staff rates (% of sales method)"
          collapsed={!ratesOpen}
          onToggle={() => setRatesOpen((v) => !v)}
          total={staff.length}
        />
        {ratesOpen && (
          <div className="px-2 py-1">
            {staff.length === 0 && (
              <div className="py-4 text-[13px] text-base-500">
                No showroom staff yet.
              </div>
            )}
            {staff.map((s) => {
              const pct = currentPct(s.id);
              return (
                <div
                  key={s.id}
                  className="h-11 flex items-center gap-3 border-b border-base-100 last:border-b-0"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-base-900 truncate">
                      {s.name}
                    </span>
                    <span className="pill pill-neutral shrink-0">
                      {ROLE_LABEL[s.staffRole] ?? s.staffRole}
                    </span>
                    <span className="text-[11px] text-base-500 truncate">
                      {[s.storeName, s.outletName].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="shrink-0 text-[12px] text-base-500 t-num">
                    now {pct != null ? `${pct}%` : "—"}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className={`${fieldCls} w-24 text-right`}
                      aria-label={`New rate for ${s.name}`}
                      placeholder={pct != null ? String(pct) : "0"}
                      value={rateDraft[s.id] ?? ""}
                      onChange={(e) =>
                        setRateDraft((d) => ({ ...d, [s.id]: e.target.value }))
                      }
                    />
                    <span className="text-[12px] text-base-500">%</span>
                    <Btn
                      size="sm"
                      disabled={
                        rateDraft[s.id] === undefined ||
                        rateDraft[s.id].trim() === "" ||
                        setStaffRate.isPending
                      }
                      onClick={() => saveStaffRate(s.id, s.name)}
                    >
                      Save
                    </Btn>
                  </div>
                </div>
              );
            })}
            <div className="py-2 text-[12px] text-base-500">
              A new rate takes effect from today; past months keep the rate that
              was in force. Manager rate above a salesperson's rate earns the
              difference as override.
            </div>
          </div>
        )}
      </SectionCard>

      {/* c. Per-model rates + tiers + milestones */}
      <SectionCard>
        <SectionBand
          title="Per-model rates & bonuses (per-model method)"
          collapsed={!modelOpen}
          onToggle={() => setModelOpen((v) => !v)}
        />
        {modelOpen && (
          <div className="px-2 py-2 space-y-4">
            {/* model picker + per-unit rate */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className={`${fieldCls} w-72`}
                aria-label="Product model"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              >
                <option value="">Pick a product model…</option>
                {modelsByCategory.map(([category, group]) => (
                  <optgroup key={category} label={category}>
                    {group.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {modelId && (
                <>
                  <span className="text-[12px] text-base-500">
                    RM per unit sold
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${fieldCls} w-28 text-right`}
                    aria-label="Per-unit commission amount"
                    placeholder="0"
                    value={perUnitDraft}
                    onChange={(e) => setPerUnitDraft(e.target.value)}
                  />
                  <Btn size="sm" disabled={setModelRate.isPending} onClick={savePerUnit}>
                    Save rate
                  </Btn>
                  <span className="text-[11px] text-base-500">
                    Leave empty + Save to remove.
                  </span>
                </>
              )}
            </div>

            {/* tier ladder for the picked model */}
            {modelId && (
              <div className="border border-base-200 rounded-lg p-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-base-500">
                  Volume tier ladder for this model
                </div>
                {tierDrafts.length === 0 && (
                  <div className="text-[12px] text-base-500">
                    No tiers yet — add one below.
                  </div>
                )}
                {tierDrafts.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[12px] text-base-700">Sell</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className={`${fieldCls} w-20 text-right`}
                      aria-label={`Tier ${i + 1} quantity`}
                      value={t.thresholdQty}
                      onChange={(e) =>
                        setTierDrafts((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, thresholdQty: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <span className="text-[12px] text-base-700">
                      units or more → bonus RM
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className={`${fieldCls} w-28 text-right`}
                      aria-label={`Tier ${i + 1} bonus`}
                      value={t.bonusAmount}
                      onChange={(e) =>
                        setTierDrafts((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, bonusAmount: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Btn
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon={Trash2}
                      title="Remove tier"
                      aria-label={`Remove tier ${i + 1}`}
                      onClick={() =>
                        setTierDrafts((rows) => rows.filter((_, j) => j !== i))
                      }
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Btn
                    variant="ghost"
                    size="sm"
                    icon={Plus}
                    onClick={() =>
                      setTierDrafts((rows) => [
                        ...rows,
                        { thresholdQty: "", bonusAmount: "" },
                      ])
                    }
                  >
                    Add tier
                  </Btn>
                  <Btn size="sm" disabled={setModelTiers.isPending} onClick={saveTiers}>
                    Save ladder
                  </Btn>
                </div>
              </div>
            )}

            {/* overall milestones */}
            <div className="border border-base-200 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-base-500">
                Overall milestones
              </div>
              {milestoneDrafts.length === 0 && (
                <div className="text-[12px] text-base-500">
                  No milestones yet — add one below.
                </div>
              )}
              {milestoneDrafts.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className={`${fieldCls} w-36`}
                    aria-label={`Milestone ${i + 1} category`}
                    value={m.category}
                    onChange={(e) =>
                      setMilestoneDrafts((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, category: e.target.value } : r,
                        ),
                      )
                    }
                  >
                    {MILESTONE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[12px] text-base-700">Sell</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={`${fieldCls} w-20 text-right`}
                    aria-label={`Milestone ${i + 1} quantity`}
                    value={m.thresholdQty}
                    onChange={(e) =>
                      setMilestoneDrafts((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, thresholdQty: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <span className="text-[12px] text-base-700">
                    units → bonus RM
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${fieldCls} w-28 text-right`}
                    aria-label={`Milestone ${i + 1} bonus`}
                    value={m.bonusAmount}
                    onChange={(e) =>
                      setMilestoneDrafts((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, bonusAmount: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Btn
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={Trash2}
                    title="Remove milestone"
                    aria-label={`Remove milestone ${i + 1}`}
                    onClick={() =>
                      setMilestoneDrafts((rows) =>
                        rows.filter((_, j) => j !== i),
                      )
                    }
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Btn
                  variant="ghost"
                  size="sm"
                  icon={Plus}
                  onClick={() =>
                    setMilestoneDrafts((rows) => [
                      ...rows,
                      { category: "", thresholdQty: "", bonusAmount: "" },
                    ])
                  }
                >
                  Add milestone
                </Btn>
                <Btn
                  size="sm"
                  disabled={setMilestones.isPending}
                  onClick={saveMilestones}
                >
                  Save milestones
                </Btn>
              </div>
            </div>

            <div className="text-[12px] text-base-500">
              Highest reached tier pays — tiers do not stack. Example: a{" "}
              {rm(100)} bonus at 5 units and a {rm(300)} bonus at 10 units pay{" "}
              {rm(300)} (not {rm(400)}) when 10 units are sold.
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
