import { useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  ProductModelDto,
  RentalBuyPrice,
  RentalGift,
  RentalOffer,
  RentalOfferService,
  RentalOptionGroup,
  RentalPlan,
  RentalPricingMode,
  RentalSurcharge,
  ServicePackage,
} from "@carres/shared";
import { rentalMonthlySplit, serviceVisitsTotal } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { rm } from "@/lib/format-currency";
import {
  useCreateRentalBuyPrice,
  useCreateRentalOfferService,
  useCreateRentalPlan,
  useDeleteRentalBuyPrice,
  useDeleteRentalOfferService,
  useDeleteRentalPlan,
  usePatchRentalBuyPrice,
  usePatchRentalOffer,
  usePatchRentalOfferService,
  usePatchRentalPlan,
} from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import {
  colorsOnCount,
  fabricSeries,
  groupOf,
  optionGroups,
  rentTargets,
  seriesOf,
  setColor,
  setGroupRequired,
  setSeries,
  setSeriesColorsBulk,
  setValue,
  targetKey,
  valueOf,
} from "./rental-offer-model";

/**
 * RentalOfferEditor (0264, Loo 2026-07-26) — authors ONE offer end to end.
 *
 * An offer is a MODEL, not a typed SKU code: pick the model in Modular, tick
 * what is rentable, price it monthly (rent) and once (buy), price the options
 * the renter may choose (once or every month of the term), narrow the fabric
 * to the exact colours, attach the service plans, set the split.
 *
 * The sections that appear are driven by the MODEL: a mattress has sizes and
 * nothing else, a bed frame adds legs / divan / gaps / fabric, a sofa swaps
 * the size axis for compartments and combos.
 *
 * Everything is a DRAFT until Save, which lands one PATCH on the offer plus
 * the create/patch/delete diffs of its rent lines, buy prices and services
 * (the ModelEditorModal batch-save idiom).
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;
const numOr = (s: string, fallback: number): number => {
  const n = Number(s);
  return s.trim() === "" || !Number.isFinite(n) ? fallback : round2(n);
};
const blankOrNum = (s: string): number | null => (s.trim() === "" ? null : numOr(s, 0));
const errMsg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;

/** Per-target draft of the rent lane: one fee per term, plus its gifts. */
interface RentDraft {
  fees: Record<number, string>;
  gifts: RentalGift[];
}
/** Per-target draft of the buy lane. */
interface BuyDraft {
  on: boolean;
  price: string;
  gifts: RentalGift[];
}
/** Per-package draft of the attached services. */
interface ServiceDraft {
  on: boolean;
  freeLane: "" | "rent" | "buy" | "both";
  freeVisits: string;
  monthly: string;
  outright: string;
}

export default function RentalOfferEditor({
  offer,
  model,
  catalog,
  plans,
  buyPrices,
  offerServices,
  packages,
  onClose,
}: {
  offer: RentalOffer;
  model: ProductModelDto;
  catalog: CatalogResponse;
  plans: RentalPlan[];
  buyPrices: RentalBuyPrice[];
  offerServices: RentalOfferService[];
  packages: ServicePackage[];
  onClose: () => void;
}) {
  const patchOffer = usePatchRentalOffer();
  const createPlan = useCreateRentalPlan();
  const patchPlan = usePatchRentalPlan();
  const deletePlan = useDeleteRentalPlan();
  const createBuy = useCreateRentalBuyPrice();
  const patchBuy = usePatchRentalBuyPrice();
  const deleteBuy = useDeleteRentalBuyPrice();
  const createSvc = useCreateRentalOfferService();
  const patchSvc = usePatchRentalOfferService();
  const deleteSvc = useDeleteRentalOfferService();

  const isSofa = model.category === "sofa";

  /* ── draft state ─────────────────────────────────────────────────────── */

  const [pricingMode, setPricingMode] = useState<RentalPricingMode>(offer.pricingMode);
  const [rentEnabled, setRentEnabled] = useState(offer.rentEnabled);
  const [buyEnabled, setBuyEnabled] = useState(offer.buyEnabled);
  const [terms, setTerms] = useState<number[]>(
    offer.termsMonths.length > 0 ? offer.termsMonths : [60, 84],
  );
  const [overlay, setOverlay] = useState<Record<string, RentalOptionGroup>>(offer.optionPrices);
  const [surcharges, setSurcharges] = useState<RentalSurcharge[]>(offer.surcharges);
  const [supplierPct, setSupplierPct] = useState(String(offer.supplierRatePct));
  const [commissionPct, setCommissionPct] = useState(String(offer.commissionBasePct));
  const [active, setActive] = useState(offer.active);
  const [saving, setSaving] = useState(false);

  const targets = useMemo(
    () => rentTargets(model, catalog, pricingMode),
    [model, catalog, pricingMode],
  );

  // Seed the price matrix from the offer's existing rent lines / buy prices.
  const [rentDraft, setRentDraft] = useState<Record<string, RentDraft>>(() => {
    const out: Record<string, RentDraft> = {};
    for (const p of plans) {
      const key = targetKey(p.sku, p.comboId);
      out[key] ??= { fees: {}, gifts: [] };
      out[key].fees[p.termMonths] = String(p.monthlyFee);
      if (p.gifts.length > 0) out[key].gifts = p.gifts;
    }
    return out;
  });
  const [buyDraft, setBuyDraft] = useState<Record<string, BuyDraft>>(() => {
    const out: Record<string, BuyDraft> = {};
    for (const b of buyPrices) {
      out[targetKey(b.sku, b.comboId)] = {
        on: b.active,
        price: b.price == null ? "" : String(b.price),
        gifts: b.gifts,
      };
    }
    return out;
  });
  const [svcDraft, setSvcDraft] = useState<Record<string, ServiceDraft>>(() => {
    const out: Record<string, ServiceDraft> = {};
    for (const s of offerServices) {
      out[s.packageId] = {
        on: s.active,
        freeLane: s.freeLane ?? "",
        freeVisits: s.freeVisits == null ? "" : String(s.freeVisits),
        monthly: s.monthlyPrice == null ? "" : String(s.monthlyPrice),
        outright: s.outrightPrice == null ? "" : String(s.outrightPrice),
      };
    }
    return out;
  });

  const groups = useMemo(() => optionGroups(model, catalog), [model, catalog]);
  const fabrics = useMemo(() => fabricSeries(model, catalog), [model, catalog]);
  // A mattress plan never shows on a sofa offer (0264 category token).
  const attachablePackages = useMemo(
    () => packages.filter((p) => p.category == null || p.category === model.category),
    [packages, model.category],
  );

  const supplierNum = numOr(supplierPct, 0);
  const commissionNum = numOr(commissionPct, 0);
  const splitValid = supplierNum >= 0 && commissionNum >= 0 && supplierNum + commissionNum <= 100;

  /* ── save (one batch) ────────────────────────────────────────────────── */

  const rentFee = (key: string, term: number): string => rentDraft[key]?.fees[term] ?? "";

  async function save() {
    if (!splitValid || saving) return;
    setSaving(true);
    try {
      await patchOffer.mutateAsync({
        id: offer.id,
        patch: {
          pricingMode,
          rentEnabled,
          buyEnabled,
          termsMonths: terms,
          optionPrices: overlay,
          surcharges,
          supplierRatePct: supplierNum,
          commissionBasePct: commissionNum,
          active,
        },
      });

      // Rent lines — one per (target × term) with a fee typed in. A cleared
      // fee deletes the line; an unticked target never had one.
      const byKeyTerm = new Map<string, RentalPlan>();
      for (const p of plans) byKeyTerm.set(`${targetKey(p.sku, p.comboId)}|${p.termMonths}`, p);
      for (const t of targets) {
        for (const term of terms) {
          const raw = rentFee(t.key, term);
          const existing = byKeyTerm.get(`${t.key}|${term}`);
          byKeyTerm.delete(`${t.key}|${term}`);
          const gifts = rentDraft[t.key]?.gifts ?? [];
          if (raw.trim() === "") {
            if (existing) await deletePlan.mutateAsync(existing.id);
            continue;
          }
          const fee = numOr(raw, 0);
          if (existing) {
            if (
              existing.monthlyFee !== fee ||
              JSON.stringify(existing.gifts) !== JSON.stringify(gifts) ||
              existing.active !== active
            ) {
              await patchPlan.mutateAsync({
                id: existing.id,
                patch: { monthlyFee: fee, gifts, active },
              });
            }
          } else {
            await createPlan.mutateAsync({
              ...(t.sku ? { sku: t.sku } : { comboId: t.comboId }),
              lineKind: t.kind,
              termMonths: term,
              monthlyFee: fee,
              supplierRatePct: supplierNum,
              commissionBasePct: commissionNum,
              offerId: offer.id,
              gifts,
              active,
            });
          }
        }
      }
      // Lines whose target/term left the matrix (mode or term change).
      for (const stale of byKeyTerm.values()) await deletePlan.mutateAsync(stale.id);

      // Buy prices — a ticked target gets a row; unticking removes it.
      const buyByKey = new Map<string, RentalBuyPrice>();
      for (const b of buyPrices) buyByKey.set(targetKey(b.sku, b.comboId), b);
      for (const t of targets) {
        const draft = buyDraft[t.key];
        const existing = buyByKey.get(t.key);
        buyByKey.delete(t.key);
        if (!draft?.on) {
          if (existing) await deleteBuy.mutateAsync(existing.id);
          continue;
        }
        const price = blankOrNum(draft.price);
        if (existing) {
          await patchBuy.mutateAsync({
            id: existing.id,
            patch: { price, gifts: draft.gifts, active: true },
          });
        } else {
          await createBuy.mutateAsync({
            offerId: offer.id,
            input: {
              ...(t.sku ? { sku: t.sku } : { comboId: t.comboId }),
              price,
              gifts: draft.gifts,
              active: true,
            },
          });
        }
      }
      for (const stale of buyByKey.values()) await deleteBuy.mutateAsync(stale.id);

      // Attached service packages.
      const svcByPkg = new Map<string, RentalOfferService>();
      for (const s of offerServices) svcByPkg.set(s.packageId, s);
      for (const pkg of attachablePackages) {
        const draft = svcDraft[pkg.id];
        const existing = svcByPkg.get(pkg.id);
        svcByPkg.delete(pkg.id);
        if (!draft?.on) {
          if (existing) await deleteSvc.mutateAsync(existing.id);
          continue;
        }
        const body = {
          freeLane: draft.freeLane === "" ? null : draft.freeLane,
          freeVisits: draft.freeVisits.trim() === "" ? null : Math.floor(numOr(draft.freeVisits, 0)),
          monthlyPrice: blankOrNum(draft.monthly),
          outrightPrice: blankOrNum(draft.outright),
          active: true,
        };
        if (existing) await patchSvc.mutateAsync({ id: existing.id, patch: body });
        else await createSvc.mutateAsync({ offerId: offer.id, input: { packageId: pkg.id, ...body } });
      }
      for (const stale of svcByPkg.values()) await deleteSvc.mutateAsync(stale.id);

      toast.success("Offer saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e, "Save failed"));
      setSaving(false);
    }
  }

  /* ── render ──────────────────────────────────────────────────────────── */

  let step = 0;
  const nextStep = () => String(++step);
  const split = rentalMonthlySplit(100, supplierNum, commissionNum);

  return (
    <div className="card p-0 overflow-hidden" data-testid={`offer-editor-${offer.id}`}>
      {/* header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-base-200 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {model.photoUrl ? (
            <img
              src={model.photoUrl}
              alt=""
              className="w-11 h-11 rounded-[8px] object-cover border border-base-200"
            />
          ) : (
            <div className="w-11 h-11 rounded-[8px] border border-dashed border-base-300 grid place-items-center text-base-300">
              ▦
            </div>
          )}
          <div className="min-w-0">
            <div className="t-h4 font-display truncate">{model.name}</div>
            <div className="t-tiny text-base-500 truncate">
              {model.category} · {model.modelKey} · {targets.length} rentable target
              {targets.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn-ghost text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !splitValid}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid="offer-save"
          >
            {saving ? "Saving…" : "Save offer"}
          </button>
        </div>
      </div>

      {/* 1 · lanes + pricing mode */}
      <Section step={nextStep()} label="Lanes">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 t-small">
            <input
              type="checkbox"
              checked={rentEnabled}
              onChange={(e) => setRentEnabled(e.target.checked)}
              data-testid="offer-rent-enabled"
            />
            Rent monthly
          </label>
          <label className="flex items-center gap-2 t-small">
            <input
              type="checkbox"
              checked={buyEnabled}
              onChange={(e) => setBuyEnabled(e.target.checked)}
              data-testid="offer-buy-enabled"
            />
            Buy outright
          </label>
          {isSofa && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="t-tiny text-base-500">Sofa price by</span>
              {(
                [
                  ["compartment", "Compartment"],
                  ["combo", "Combo"],
                  ["both", "Both"],
                ] as [RentalPricingMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPricingMode(mode)}
                  className={`${pricingMode === mode ? "btn-primary" : "btn-ghost"} text-[11px]`}
                  data-testid={`offer-mode-${mode}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="t-tiny text-base-400 mt-2">
          {isSofa
            ? "By compartment: the customer builds the sofa and the parts add up. By combo: a fixed monthly for a set shape."
            : "Each size is priced on its own — a king rents for more than a single."}
        </p>
      </Section>

      {/* 2 · rent price matrix */}
      {rentEnabled && (
        <Section
          step={nextStep()}
          label="Rent — monthly price"
          right={
            <TermChips terms={terms} onChange={setTerms} />
          }
        >
          {targets.length === 0 ? (
            <p className="t-small text-base-500" data-testid="offer-no-targets">
              Nothing to price yet — this model has no live SKUs
              {isSofa ? " / compartments / combos" : ""}. Author them in SKU Master or Modular first.
            </p>
          ) : (
            <div className="border border-base-200 rounded-[4px] overflow-x-auto">
              <div
                className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200 min-w-[720px]"
                style={{ gridTemplateColumns: matrixCols(terms.length) }}
              >
                <div className="label">Target</div>
                <div className="label text-right">List</div>
                {terms.map((t) => (
                  <div key={t} className="label text-right">
                    RM / mo · {t}
                  </div>
                ))}
                <div className="label">Free gift</div>
              </div>
              {targets.map((t) => (
                <div
                  key={t.key}
                  className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 min-w-[720px]"
                  style={{ gridTemplateColumns: matrixCols(terms.length) }}
                  data-testid={`rent-row-${t.key}`}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] truncate">{t.label}</div>
                    <div className="t-tiny text-base-400 truncate">{t.sub}</div>
                  </div>
                  <div className="text-right t-num text-[12px] text-base-500">
                    {t.listPrice == null ? "—" : rm(t.listPrice)}
                  </div>
                  {terms.map((term) => (
                    <div key={term} className="text-right">
                      <input
                        className={`${INPUT_CLS} w-24 text-right`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={rentFee(t.key, term)}
                        placeholder="—"
                        onChange={(e) =>
                          setRentDraft((d) => ({
                            ...d,
                            [t.key]: {
                              fees: { ...(d[t.key]?.fees ?? {}), [term]: e.target.value },
                              gifts: d[t.key]?.gifts ?? [],
                            },
                          }))
                        }
                        data-testid={`rent-fee-${t.key}-${term}`}
                      />
                    </div>
                  ))}
                  <GiftCell
                    gifts={rentDraft[t.key]?.gifts ?? []}
                    catalog={catalog}
                    onChange={(gifts) =>
                      setRentDraft((d) => ({
                        ...d,
                        [t.key]: { fees: d[t.key]?.fees ?? {}, gifts },
                      }))
                    }
                    testid={`rent-gift-${t.key}`}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="t-tiny text-base-400 mt-2">
            Leave a cell blank and that term is not offered. Each monthly price is its own Stripe
            recurring price; agreements already signed keep the fee they were signed at.
          </p>
        </Section>
      )}

      {/* 3 · buy lane */}
      {buyEnabled && (
        <Section step={nextStep()} label="Buy — outright price">
          <div className="border border-base-200 rounded-[4px] overflow-x-auto">
            <div
              className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200 min-w-[640px]"
              style={{ gridTemplateColumns: BUY_COLS }}
            >
              <div className="label">Target</div>
              <div className="label text-right">List</div>
              <div className="label text-right">Outright RM</div>
              <div className="label">Free gift</div>
              <div className="label">On offer</div>
            </div>
            {targets.map((t) => {
              const d = buyDraft[t.key] ?? { on: false, price: "", gifts: [] };
              return (
                <div
                  key={t.key}
                  className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 min-w-[640px] ${d.on ? "" : "opacity-60"}`}
                  style={{ gridTemplateColumns: BUY_COLS }}
                  data-testid={`buy-row-${t.key}`}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] truncate">{t.label}</div>
                    <div className="t-tiny text-base-400 truncate">{t.sub}</div>
                  </div>
                  <div className="text-right t-num text-[12px] text-base-500">
                    {t.listPrice == null ? "—" : rm(t.listPrice)}
                  </div>
                  <div className="text-right">
                    <input
                      className={`${INPUT_CLS} w-28 text-right`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={d.price}
                      placeholder="list price"
                      onChange={(e) =>
                        setBuyDraft((s) => ({ ...s, [t.key]: { ...d, price: e.target.value } }))
                      }
                      data-testid={`buy-price-${t.key}`}
                    />
                  </div>
                  <GiftCell
                    gifts={d.gifts}
                    catalog={catalog}
                    onChange={(gifts) => setBuyDraft((s) => ({ ...s, [t.key]: { ...d, gifts } }))}
                    testid={`buy-gift-${t.key}`}
                  />
                  <div>
                    <input
                      type="checkbox"
                      checked={d.on}
                      onChange={(e) =>
                        setBuyDraft((s) => ({ ...s, [t.key]: { ...d, on: e.target.checked } }))
                      }
                      aria-label={`${t.label} sold outright`}
                      data-testid={`buy-on-${t.key}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="t-tiny text-base-400 mt-2">
            Blank price = sell at whatever SKU Master says. Cleaning and care are not part of the
            purchase — they are service plans below.
          </p>
        </Section>
      )}

      {/* 4 · options */}
      {(groups.length > 0 || fabrics.length > 0) && (
        <Section
          step={nextStep()}
          label="Options the customer may choose"
          right={
            <span className="t-tiny text-base-400">
              Every option can carry its own price — once, or every month
            </span>
          }
        >
          {groups.map((g) => (
            <div
              key={g.key}
              className="border border-base-200 rounded-[6px] p-3 mb-3 bg-base-50"
              data-testid={`option-group-${g.key}`}
            >
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <span className="label">{g.label}</span>
                <div className="flex items-center gap-1.5">
                  {[
                    [true, "Must pick one"],
                    [false, "Optional add"],
                  ].map(([req, lbl]) => (
                    <button
                      key={String(req)}
                      type="button"
                      onClick={() => setOverlay((o) => setGroupRequired(o, g.key, req as boolean))}
                      className={`${groupOf(overlay, g.key).required === req ? "btn-primary" : "btn-ghost"} text-[11px]`}
                      data-testid={`option-required-${g.key}-${String(req)}`}
                    >
                      {lbl as string}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-base-200 rounded-[4px] overflow-x-auto">
                <div
                  className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200 min-w-[560px]"
                  style={{ gridTemplateColumns: OPTION_COLS }}
                >
                  <div className="label">Option</div>
                  <div className="label">On offer</div>
                  <div className="label text-right">One-time RM</div>
                  <div className="label text-right">RM / month</div>
                  <div className="label text-right">Over the term</div>
                </div>
                {g.values.map((v) => {
                  const val = valueOf(overlay, g.key, v.value);
                  const longest = Math.max(...terms, 0);
                  return (
                    <div
                      key={v.value}
                      className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 min-w-[560px] ${val.on ? "" : "opacity-60"}`}
                      style={{ gridTemplateColumns: OPTION_COLS }}
                      data-testid={`option-row-${g.key}-${v.value}`}
                    >
                      <div className="text-[13px] truncate">{v.label}</div>
                      <div>
                        <input
                          type="checkbox"
                          checked={val.on}
                          onChange={(e) =>
                            setOverlay((o) => setValue(o, g.key, v.value, { on: e.target.checked }))
                          }
                          aria-label={`${v.label} on offer`}
                          data-testid={`option-on-${g.key}-${v.value}`}
                        />
                      </div>
                      <PriceCell
                        value={val.oneTime}
                        onChange={(n) => setOverlay((o) => setValue(o, g.key, v.value, { oneTime: n }))}
                        testid={`option-once-${g.key}-${v.value}`}
                      />
                      <PriceCell
                        value={val.monthly}
                        onChange={(n) => setOverlay((o) => setValue(o, g.key, v.value, { monthly: n }))}
                        testid={`option-monthly-${g.key}-${v.value}`}
                      />
                      <div className="text-right t-num text-[12px] text-base-500">
                        {termLine(val.oneTime, val.monthly, longest)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {fabrics.length > 0 && (
            <div className="border border-base-200 rounded-[6px] p-3 bg-base-50" data-testid="fabric-groups">
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <div>
                  <div className="label">Fabric &amp; colour</div>
                  <div className="t-tiny text-base-400">
                    Pick the series, then tick the exact colours a customer may have
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {[
                    [true, "Must pick one"],
                    [false, "Optional add"],
                  ].map(([req, lbl]) => (
                    <button
                      key={String(req)}
                      type="button"
                      onClick={() => setOverlay((o) => setGroupRequired(o, "fabrics", req as boolean))}
                      className={`${groupOf(overlay, "fabrics").required === req ? "btn-primary" : "btn-ghost"} text-[11px]`}
                      data-testid={`option-required-fabrics-${String(req)}`}
                    >
                      {lbl as string}
                    </button>
                  ))}
                </div>
              </div>
              {fabrics.map((s) => (
                <FabricSeriesRow
                  key={s.series}
                  series={s.series}
                  colors={s.colors}
                  overlay={overlay}
                  longestTerm={Math.max(...terms, 0)}
                  onOverlay={setOverlay}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 5 · surcharges */}
      <Section
        step={nextStep()}
        label="Surcharges"
        right={<span className="t-tiny text-base-400">Anything not tied to an option</span>}
      >
        {surcharges.length === 0 && (
          <p className="t-small text-base-500 mb-2" data-testid="surcharges-empty">
            No surcharges — add one for delivery, installation, a care upgrade, anything.
          </p>
        )}
        {surcharges.map((s, i) => (
          <div
            key={`${s.code}-${i}`}
            className="flex flex-wrap items-center gap-2 py-2 border-b border-base-100 last:border-b-0"
            data-testid={`surcharge-row-${i}`}
          >
            <input
              className={`${INPUT_CLS} max-w-[240px]`}
              value={s.label}
              onChange={(e) =>
                setSurcharges((list) =>
                  list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                )
              }
              placeholder="What is it called"
              data-testid={`surcharge-label-${i}`}
            />
            <span className="t-tiny text-base-500">once</span>
            <input
              className={`${INPUT_CLS} w-24 text-right`}
              type="number"
              min={0}
              step="0.01"
              value={s.oneTime}
              onChange={(e) =>
                setSurcharges((list) =>
                  list.map((x, j) => (j === i ? { ...x, oneTime: numOr(e.target.value, 0) } : x)),
                )
              }
              data-testid={`surcharge-once-${i}`}
            />
            <span className="t-tiny text-base-500">/ month</span>
            <input
              className={`${INPUT_CLS} w-24 text-right`}
              type="number"
              min={0}
              step="0.01"
              value={s.monthly}
              onChange={(e) =>
                setSurcharges((list) =>
                  list.map((x, j) => (j === i ? { ...x, monthly: numOr(e.target.value, 0) } : x)),
                )
              }
              data-testid={`surcharge-monthly-${i}`}
            />
            <button
              type="button"
              onClick={() =>
                setSurcharges((list) =>
                  list.map((x, j) => (j === i ? { ...x, required: !x.required } : x)),
                )
              }
              className={`${s.required ? "btn-primary" : "btn-ghost"} text-[11px]`}
              data-testid={`surcharge-required-${i}`}
            >
              {s.required ? "Always" : "Optional"}
            </button>
            <button
              type="button"
              onClick={() => setSurcharges((list) => list.filter((_, j) => j !== i))}
              className="btn-danger text-[11px] ml-auto"
              data-testid={`surcharge-remove-${i}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setSurcharges((list) => [
              ...list,
              {
                code: `sur-${list.length + 1}-${Math.floor(Date.now() % 100000)}`,
                label: "",
                oneTime: 0,
                monthly: 0,
                required: false,
              },
            ])
          }
          className="btn-secondary text-[12px] mt-2"
          data-testid="surcharge-add"
        >
          Add surcharge
        </button>
        <p className="t-tiny text-base-400 mt-2">
          <b>Always</b> is charged on every agreement; <b>optional</b> is a tick the store can add.
          A store can never type its own amount — every ringgit collected is authored here.
        </p>
      </Section>

      {/* 6 · service plans */}
      <Section
        step={nextStep()}
        label="Service plans"
        right={
          <span className="t-tiny text-base-400">One plan = one SKU (duration × visits a year)</span>
        }
      >
        {attachablePackages.length === 0 ? (
          <p className="t-small text-base-500" data-testid="offer-services-empty">
            No service package for this product family yet — create one below and it appears here.
          </p>
        ) : (
          <div className="border border-base-200 rounded-[4px] overflow-x-auto">
            <div
              className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200 min-w-[820px]"
              style={{ gridTemplateColumns: SERVICE_COLS }}
            >
              <div className="label">Plan</div>
              <div className="label">SKU</div>
              <div className="label">Visits</div>
              <div className="label">Free with</div>
              <div className="label text-right">Free visits</div>
              <div className="label text-right">RM / month</div>
              <div className="label text-right">Outright RM</div>
              <div className="label">On offer</div>
            </div>
            {attachablePackages.map((p) => {
              const d = svcDraft[p.id] ?? {
                on: false,
                freeLane: "",
                freeVisits: "",
                monthly: "",
                outright: "",
              };
              const set = (patch: Partial<ServiceDraft>) =>
                setSvcDraft((s) => ({ ...s, [p.id]: { ...d, ...patch } }));
              return (
                <div
                  key={p.id}
                  className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 min-w-[820px] ${d.on ? "" : "opacity-60"}`}
                  style={{ gridTemplateColumns: SERVICE_COLS }}
                  data-testid={`offer-service-${p.id}`}
                >
                  <div className="text-[13px] truncate">{p.name}</div>
                  <div className="t-tiny text-base-500 truncate">{p.sku ?? "—"}</div>
                  <div className="t-tiny text-base-600">
                    {p.visitsPerYear} / yr ·{" "}
                    <b>{serviceVisitsTotal(p.durationMonths, p.visitsPerYear)} total</b>
                  </div>
                  <div>
                    <select
                      className={`${INPUT_CLS} py-1`}
                      value={d.freeLane}
                      onChange={(e) => set({ freeLane: e.target.value as ServiceDraft["freeLane"] })}
                      data-testid={`offer-service-lane-${p.id}`}
                    >
                      <option value="">Not free</option>
                      <option value="rent">Rent</option>
                      <option value="buy">Buy</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                  <div className="text-right">
                    <input
                      className={`${INPUT_CLS} w-16 text-right`}
                      type="number"
                      min={0}
                      value={d.freeVisits}
                      placeholder="all"
                      disabled={d.freeLane === ""}
                      onChange={(e) => set({ freeVisits: e.target.value })}
                      data-testid={`offer-service-visits-${p.id}`}
                    />
                  </div>
                  <div className="text-right">
                    <input
                      className={`${INPUT_CLS} w-20 text-right`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={d.monthly}
                      placeholder="—"
                      onChange={(e) => set({ monthly: e.target.value })}
                      data-testid={`offer-service-monthly-${p.id}`}
                    />
                  </div>
                  <div className="text-right">
                    <input
                      className={`${INPUT_CLS} w-24 text-right`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={d.outright}
                      placeholder="—"
                      onChange={(e) => set({ outright: e.target.value })}
                      data-testid={`offer-service-outright-${p.id}`}
                    />
                  </div>
                  <div>
                    <input
                      type="checkbox"
                      checked={d.on}
                      onChange={(e) => set({ on: e.target.checked })}
                      aria-label={`${p.name} attached`}
                      data-testid={`offer-service-on-${p.id}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="t-tiny text-base-400 mt-2">
          <b>Free with</b> decides which lane gets the plan for nothing and <b>free visits</b> says
          how many are on us — the rest stay billable. Attach nothing and the product is
          self-service.
        </p>
      </Section>

      {/* 7 · split + live */}
      <Section step={nextStep()} label="Revenue split">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
          <div>
            <div className="label mb-1">Supplier rate (%)</div>
            <input
              className={INPUT_CLS}
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={supplierPct}
              onChange={(e) => setSupplierPct(e.target.value)}
              data-testid="offer-supplier-pct"
            />
          </div>
          <div>
            <div className="label mb-1">Commission base (%)</div>
            <input
              className={INPUT_CLS}
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              data-testid="offer-commission-pct"
            />
          </div>
        </div>
        {!splitValid && (
          <p className="t-tiny text-danger mt-2" data-testid="offer-split-error">
            Supplier + commission cannot exceed 100% — a collected month would pay out more than it
            collects.
          </p>
        )}
        {splitValid && (
          <div
            className="t-tiny text-base-600 bg-base-50 border border-base-200 rounded-[4px] px-3 py-2 mt-3"
            data-testid="offer-split-preview"
          >
            Of every RM 100 collected: supplier {rm(split.supplierShare)} · store{" "}
            {rm(split.commissionShare)} · Carres {rm(split.carresShare)}. Stores never see these two
            percentages.
          </div>
        )}
        <label className="flex items-center gap-2 t-small mt-3">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            data-testid="offer-active"
          />
          On sale — stores can rent and sell this
        </label>
      </Section>
    </div>
  );
}

/* ── small pieces ───────────────────────────────────────────────────────── */

const OPTION_COLS = "minmax(140px,1.4fr) 80px 130px 130px 120px";
const BUY_COLS = "minmax(160px,1.6fr) 90px 130px minmax(120px,1fr) 80px";
const SERVICE_COLS =
  "minmax(150px,1.4fr) minmax(120px,1fr) 130px 110px 90px 100px 110px 70px";
const matrixCols = (termCount: number): string =>
  `minmax(160px,1.6fr) 90px ${"110px ".repeat(termCount)}minmax(120px,1fr)`;

function Section({
  step,
  label,
  right,
  children,
}: {
  step: string;
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b border-base-200 last:border-b-0">
      <div className="flex items-baseline gap-2 mb-3 flex-wrap">
        <span className="inline-grid place-items-center w-5 h-5 rounded-[5px] bg-base-100 text-base-600 text-[11px] font-bold">
          {step}
        </span>
        <span className="label">{label}</span>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

/** Term columns of the price matrix — the presets Jess locked plus a custom add. */
function TermChips({ terms, onChange }: { terms: number[]; onChange: (t: number[]) => void }) {
  const [custom, setCustom] = useState("");
  const toggle = (t: number) =>
    onChange(terms.includes(t) ? terms.filter((x) => x !== t) : [...terms, t].sort((a, b) => a - b));
  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span className="t-tiny text-base-500">Terms</span>
      {[60, 84].map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => toggle(t)}
          className={`${terms.includes(t) ? "btn-primary" : "btn-ghost"} text-[11px]`}
          data-testid={`offer-term-${t}`}
        >
          {t / 12} years
        </button>
      ))}
      <input
        className={`${INPUT_CLS} w-20`}
        type="number"
        min={1}
        value={custom}
        placeholder="months"
        onChange={(e) => setCustom(e.target.value)}
        data-testid="offer-term-custom"
      />
      <button
        type="button"
        onClick={() => {
          const n = Math.floor(Number(custom));
          if (Number.isInteger(n) && n > 0 && !terms.includes(n)) {
            onChange([...terms, n].sort((a, b) => a - b));
            setCustom("");
          }
        }}
        className="btn-ghost text-[11px]"
        data-testid="offer-term-add"
      >
        Add term
      </button>
    </span>
  );
}

/** A nullable money cell — blank means "inherit / free", never 0-by-accident. */
function PriceCell({
  value,
  onChange,
  testid,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  testid: string;
}) {
  return (
    <div className="text-right">
      <input
        className={`${INPUT_CLS} w-24 text-right`}
        type="number"
        min={0}
        step="0.01"
        value={value == null ? "" : String(value)}
        placeholder="0"
        onChange={(e) => onChange(e.target.value.trim() === "" ? null : round2(Number(e.target.value)))}
        data-testid={testid}
      />
    </div>
  );
}

/** "RM 420 over 84 months" / "RM 80 once" / "included". */
function termLine(oneTime: number | null, monthly: number | null, term: number): string {
  const m = monthly ?? 0;
  const o = oneTime ?? 0;
  if (m > 0 && term > 0) return `${rm(m * term)} over ${term} mo`;
  if (o > 0) return `${rm(o)} once`;
  return "included";
}

/** One fabric series: its own price + a collapsible list of its colours. */
function FabricSeriesRow({
  series,
  colors,
  overlay,
  longestTerm,
  onOverlay,
}: {
  series: string;
  colors: { code: string; label: string }[];
  overlay: Record<string, RentalOptionGroup>;
  longestTerm: number;
  onOverlay: (fn: (o: Record<string, RentalOptionGroup>) => Record<string, RentalOptionGroup>) => void;
}) {
  const [open, setOpen] = useState(false);
  const s = seriesOf(overlay, series);
  const onCount = colorsOnCount(overlay, series, colors.map((c) => c.code));

  return (
    <div className="bg-white border border-base-200 rounded-[4px] mb-2 last:mb-0" data-testid={`fabric-series-${series}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-ghost text-[12px]"
          aria-expanded={open}
          data-testid={`fabric-toggle-${series}`}
        >
          {open ? "▾" : "▸"} {series}
        </button>
        <span className="t-tiny text-base-500">
          {colors.length} colour{colors.length === 1 ? "" : "s"} ·{" "}
          {onCount > 0 ? <b>{onCount} on offer</b> : "none on offer"}
        </span>
        <span className="flex items-center gap-2 ml-auto">
          <input
            type="checkbox"
            checked={s.on}
            onChange={(e) => onOverlay((o) => setSeries(o, series, { on: e.target.checked }))}
            aria-label={`${series} series on offer`}
            data-testid={`fabric-series-on-${series}`}
          />
          <span className="t-tiny text-base-500">once</span>
          <PriceCell
            value={s.oneTime}
            onChange={(n) => onOverlay((o) => setSeries(o, series, { oneTime: n }))}
            testid={`fabric-series-once-${series}`}
          />
          <span className="t-tiny text-base-500">/ mo</span>
          <PriceCell
            value={s.monthly}
            onChange={(n) => onOverlay((o) => setSeries(o, series, { monthly: n }))}
            testid={`fabric-series-monthly-${series}`}
          />
          <button
            type="button"
            onClick={() =>
              onOverlay((o) => setSeriesColorsBulk(o, series, colors.map((c) => c.code), true))
            }
            className="btn-ghost text-[11px]"
            data-testid={`fabric-all-on-${series}`}
          >
            All on
          </button>
          <button
            type="button"
            onClick={() =>
              onOverlay((o) => setSeriesColorsBulk(o, series, colors.map((c) => c.code), false))
            }
            className="btn-ghost text-[11px]"
          >
            All off
          </button>
        </span>
      </div>
      {open && (
        <div className="border-t border-base-200 overflow-x-auto">
          {colors.map((c) => {
            const cv = s.colors[c.code] ?? { on: false, oneTime: null, monthly: null };
            return (
              <div
                key={c.code}
                className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 min-w-[560px] ${cv.on ? "" : "opacity-60"}`}
                style={{ gridTemplateColumns: OPTION_COLS }}
                data-testid={`fabric-color-${c.code}`}
              >
                <div className="text-[13px] truncate">
                  <span className="t-tiny text-base-400 mr-1.5">{c.code}</span>
                  {c.label}
                </div>
                <div>
                  <input
                    type="checkbox"
                    checked={cv.on}
                    onChange={(e) =>
                      onOverlay((o) => setColor(o, series, c.code, { on: e.target.checked }))
                    }
                    aria-label={`${c.label} on offer`}
                    data-testid={`fabric-color-on-${c.code}`}
                  />
                </div>
                <PriceCell
                  value={cv.oneTime}
                  onChange={(n) => onOverlay((o) => setColor(o, series, c.code, { oneTime: n }))}
                  testid={`fabric-color-once-${c.code}`}
                />
                <PriceCell
                  value={cv.monthly}
                  onChange={(n) => onOverlay((o) => setColor(o, series, c.code, { monthly: n }))}
                  testid={`fabric-color-monthly-${c.code}`}
                />
                <div className="text-right t-num text-[12px] text-base-500">
                  {termLine(cv.oneTime ?? s.oneTime, cv.monthly ?? s.monthly, longestTerm)}
                </div>
              </div>
            );
          })}
          <p className="t-tiny text-base-400 px-3 py-2">
            The series price covers every colour under it; a colour row overrides only itself (blank
            = follow the series).
          </p>
        </div>
      )}
    </div>
  );
}

/** GWP cell — free gifts are real SKUs + a qty, so stock, delivery and the
 *  supplier PO all see them. */
function GiftCell({
  gifts,
  catalog,
  onChange,
  testid,
}: {
  gifts: RentalGift[];
  catalog: CatalogResponse;
  onChange: (g: RentalGift[]) => void;
  testid: string;
}) {
  const [adding, setAdding] = useState(false);
  const [sku, setSku] = useState("");
  const options = useMemo(
    () =>
      catalog.skus
        .filter((s) => !s.discontinuedAt)
        .slice()
        .sort((a, b) => a.sku.localeCompare(b.sku))
        .slice(0, 400),
    [catalog.skus],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testid}>
      {gifts.map((g) => (
        <span key={g.sku} className="pill pill-neutral">
          {g.qty} × {g.sku}
          <button
            type="button"
            onClick={() => onChange(gifts.filter((x) => x.sku !== g.sku))}
            className="ml-1 text-base-500 hover:text-danger"
            aria-label={`Remove ${g.sku}`}
            data-testid={`${testid}-remove-${g.sku}`}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <span className="flex items-center gap-1">
          <select
            className={`${INPUT_CLS} py-1 max-w-[160px]`}
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            data-testid={`${testid}-select`}
          >
            <option value="">Pick a SKU…</option>
            {options.map((s) => (
              <option key={s.id} value={s.sku}>
                {s.sku}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (!sku) return;
              const existing = gifts.find((g) => g.sku === sku);
              onChange(
                existing
                  ? gifts.map((g) => (g.sku === sku ? { ...g, qty: g.qty + 1 } : g))
                  : [...gifts, { sku, qty: 1 }],
              );
              setSku("");
              setAdding(false);
            }}
            className="btn-ghost text-[11px]"
            data-testid={`${testid}-confirm`}
          >
            Add
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn-ghost text-[11px]"
          data-testid={`${testid}-add`}
        >
          + Gift
        </button>
      )}
    </div>
  );
}
