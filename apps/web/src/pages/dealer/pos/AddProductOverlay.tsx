import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type {
  CatalogResponse,
  GuaranteeTermDto,
  Order,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
} from "@carres/shared";
import { guaranteeAttrs } from "@carres/shared";
import { CATEGORY_LABEL } from "@/pages/catalog/components/atoms";
import { rm } from "@/lib/format-currency";
import {
  addonRequiresSize,
  disposalUnitSizes,
  type DraftAddon,
  type DraftLine,
  type WizardDraft,
} from "../new-order/draft";
import { lockedCategoriesFor, newLocalId } from "../new-order/configurators";
import AddonsPanel, { offerableAddons } from "./AddonsPanel";
import { buildCatalogIndex } from "./catalog-index";
import ConfigureDrawer from "./ConfigureDrawer";
import GuaranteePickerModal from "./GuaranteePickerModal";
import PosConfigurePage from "./PosConfigurePage";
import ProductCard from "./ProductCard";
import SofaConfigurePage from "./SofaConfigurePage";

/**
 * AddProductOverlay — Add-product P1+P2 (0231/0232, design 2026-07-18 §4).
 * Full-screen catalog picker for appending products to a PLACE-lane order
 * from the POS order-detail drawer. Mirrors CatalogStep's surface convention:
 * mattress/bedframe → PosConfigurePage, offered-compartment sofa →
 * SofaConfigurePage (P2: builds + quick picks emit `attrs.sofa_build` lines,
 * server drift-gated + exploded), everything else → ConfigureDrawer.
 *
 * The emitted DraftLine goes to the parent, which POSTs sku/qty/attrs (+ the
 * preview unitPrice for BUILD lines only — the sofa drift gate needs it; flat
 * lines stay fully server-priced).
 *
 * PWP: the ORDER's persisted lines ride in as `cartLines` so the configurator
 * previews eligibility against the merged cart — but the VOUCHER props
 * (pwpReservedCodes / pwpClaimGroup / customerPhone / onApplyVoucherCode) are
 * deliberately withheld, so only CODE-LESS stateless claims can be emitted
 * (the 0187 voucher lifecycle is wizard-scoped; the server 409s coded claims).
 *
 * Mutex: categories locked by 0089 against the order's existing lines dim out
 * (same ProductCard `locked` affordance as the wizard).
 *
 * z-index: the POS detail drawer sits at z-100 (`.os-detail-overlay`) while
 * the configure surfaces are fixed z-60 — so everything nests in ONE z-[110]
 * container, creating a stacking context in which their own z still paints
 * above the grid.
 */
export default function AddProductOverlay({
  order,
  catalog,
  busy,
  error,
  onPick,
  onPickServices,
  serviceCta,
  onClose,
}: {
  order: Order;
  catalog: CatalogResponse;
  busy: boolean;
  error: string | null;
  /** The configured line to append — the parent runs the POST and closes on success. */
  onPick: (line: DraftLine) => void;
  /** 0257 — the picked SERVICE add-ons (Dispose old sofa/mattress …, the
   *  wizard's AddonsPanel catalog). The parent runs the POST / submission. */
  onPickServices: (addons: DraftAddon[]) => void;
  /** CTA label for the services tab ("Add to order" / "Submit for approval"). */
  serviceCta: string;
  onClose: () => void;
}) {
  const index = useMemo(
    () => buildCatalogIndex(catalog, catalog.fabricTierConfig, catalog.modelFabricTierOverrides),
    [catalog],
  );
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<ProductCategory | "all" | "services">("all");
  const [configureModel, setConfigureModel] = useState<ProductModelDto | null>(null);
  // 0257 — the services tab's local picks (AddonsPanel operates on a draft
  // whose ONLY consulted field is `addons` — shimmed below).
  const [svc, setSvc] = useState<DraftAddon[]>([]);
  const services = useMemo(() => offerableAddons(catalog.addons), [catalog.addons]);
  const svcTotal = svc.reduce((s, a) => s + a.unitPrice * a.qty, 0);
  const svcSizesOk = svc.every(
    (a) => !addonRequiresSize(a) || disposalUnitSizes(a).every((s) => s !== ""),
  );

  // 0089 mutex against the ORDER's existing lines (lockedCategoriesFor only
  // reads `.sku`, so the persisted rows adapt structurally).
  const lockedCats = useMemo(() => {
    const pseudo = (order.lines ?? []).map((l) => ({ sku: l.sku })) as unknown as Parameters<
      typeof lockedCategoriesFor
    >[0];
    return lockedCategoriesFor(pseudo, index.skuToCategory);
  }, [order.lines, index]);

  // The persisted rows as pseudo-DraftLines — PWP eligibility previews inside
  // the configurators run against the MERGED cart (existing triggers count).
  const cartLines = useMemo<DraftLine[]>(
    () =>
      (order.lines ?? []).map((l) => ({
        localId: l.id ?? newLocalId(),
        sku: l.sku,
        qty: l.qty,
        attrs: l.attrs,
        unitPrice: l.unitPrice,
        label: l.sku,
      })),
    [order.lines],
  );

  const models = useMemo(() => {
    const q = search.trim().toLowerCase();
    return index.productModels.filter((m) => {
      if (cat !== "all" && m.category !== cat) return false;
      if (q && !(index.meta.get(m.id)?.searchBlob ?? "").includes(q)) return false;
      return true;
    });
  }, [index, cat, search]);

  const cats = useMemo(() => {
    const present = new Set<ProductCategory>();
    for (const m of index.productModels) present.add(m.category);
    return [...present];
  }, [index]);

  // 0261 — adding a guarantee to an EXISTING order goes through the same gate
  // as selling one: it must name the item it covers. Without this the generic
  // ConfigureDrawer below would add it bare, and an unattached guarantee is a
  // RM150 promise nobody can trace at claim time. Now that the POS is the only
  // order entry, this overlay is the second (and last) door a guarantee line
  // can come through.
  const [guaranteePick, setGuaranteePick] = useState<{
    term: GuaranteeTermDto;
    sku: ProductSkuDto;
  } | null>(null);

  function openModel(m: ProductModelDto) {
    if (m.category === "guarantee") {
      const s = (index.skusByModel.get(m.id) ?? [])[0];
      const term = (catalog.guaranteeTerms ?? []).find((t) => t.guaranteeSku === s?.sku);
      if (s && term) setGuaranteePick({ term, sku: s });
      return;
    }
    setConfigureModel(m);
  }

  const offeredForConfigure = useMemo(
    () =>
      configureModel
        ? (catalog.modelSofaCompartments ?? []).filter((mc) => mc.modelId === configureModel.id)
        : [],
    [catalog.modelSofaCompartments, configureModel],
  );

  return (
    <div className="fixed inset-0 z-[110]" data-testid="pos-add-product-overlay">
      <div
        className="absolute inset-0 bg-base-900/55"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 sm:inset-8 bg-base-50 sm:rounded-md shadow-md flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Add product"
      >
        <header className="flex items-center gap-3 px-6 py-4 border-b border-base-200 bg-white">
          <div className="min-w-0 flex-1">
            <p className="kicker">Order SO-{order.so}</p>
            <h2 className="t-h3">Add product</h2>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            aria-label="Search products"
            className="w-[220px] px-3 py-2 border border-base-300 rounded bg-white text-sm outline-none focus:border-primary"
            data-testid="pos-add-search"
          />
          <button
            type="button"
            className="btn-ghost p-2"
            onClick={onClose}
            aria-label="Close add product"
            data-testid="pos-add-close"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex items-center gap-1.5 px-6 py-3 flex-wrap">
          <CatChip active={cat === "all"} label="All" onClick={() => setCat("all")} />
          {cats.map((ck) => (
            <CatChip
              key={ck}
              active={cat === ck}
              label={CATEGORY_LABEL[ck]}
              onClick={() => setCat(ck)}
            />
          ))}
          {/* 0257 — order add-ons (Dispose old sofa/mattress …): the same
              service catalog the wizard's AddonsPanel offers. */}
          {services.length > 0 && (
            <CatChip
              active={cat === "services"}
              label="Services"
              onClick={() => setCat("services")}
            />
          )}
        </div>

        {error && (
          <div
            className="mx-6 mb-2 px-3 py-2 rounded border border-danger/40 bg-danger/5 text-sm text-danger"
            data-testid="pos-add-error"
          >
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto px-6 pb-8">
          {busy && <div className="t-small text-base-500 mb-2">Adding…</div>}
          {cat === "services" ? (
            <div data-testid="pos-add-services">
              <AddonsPanel
                addons={services}
                draft={{ addons: svc } as unknown as WizardDraft}
                onChange={(next) => setSvc(next.addons)}
              />
              <div className="flex items-center justify-end gap-3 mt-5">
                {svc.length > 0 && (
                  <span className="font-mono t-small text-base-600">{rm(svcTotal)}</span>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || svc.length === 0 || !svcSizesOk}
                  onClick={() => onPickServices(svc)}
                  data-testid="pos-add-services-confirm"
                >
                  {serviceCta}
                </button>
              </div>
            </div>
          ) : models.length === 0 ? (
            <div className="t-small text-base-500 py-10 text-center">No products match.</div>
          ) : (
            <div className="cat-grid">
              {models.map((m) => (
                <ProductCard
                  key={m.id}
                  model={m}
                  meta={index.meta.get(m.id)!}
                  locked={lockedCats.has(m.category)}
                  onConfigure={() => openModel(m)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {guaranteePick && (
        <GuaranteePickerModal
          term={guaranteePick.term}
          sku={guaranteePick.sku}
          lines={cartLines}
          catalog={catalog}
          context="order"
          onCancel={() => setGuaranteePick(null)}
          onPick={(coversSku, coversLabel) => {
            onPick({
              localId: newLocalId(),
              sku: guaranteePick.sku.sku,
              qty: 1,
              unitPrice: guaranteePick.sku.price,
              label: `${guaranteePick.term.label} · ${coversLabel}`,
              attrs: guaranteeAttrs(coversSku, coversLabel),
            });
            setGuaranteePick(null);
          }}
        />
      )}

      {configureModel &&
        (() => {
          const emit = (line: DraftLine) => {
            setConfigureModel(null);
            onPick(line);
          };
          const close = () => setConfigureModel(null);
          // Mirror CatalogStep's surface convention (2026-07-04): mattress +
          // bed frame go full page; an offered-compartment sofa opens the
          // sofa page (P2: builds allowed); the rest keep the drawer.
          if (configureModel.category === "mattress" || configureModel.category === "bedframe") {
            return (
              <PosConfigurePage
                key={configureModel.id}
                model={configureModel}
                meta={index.meta.get(configureModel.id)}
                skus={index.skusByModel.get(configureModel.id) ?? []}
                specialAddons={catalog.specialAddons}
                optionPools={catalog.optionPools}
                fabrics={catalog.fabrics}
                fabricTierConfig={catalog.fabricTierConfig}
                modelFabricTierOverrides={catalog.modelFabricTierOverrides}
                catalog={catalog}
                cartLines={cartLines}
                onAdd={emit}
                onClose={close}
              />
            );
          }
          if (configureModel.category === "sofa" && offeredForConfigure.length > 0) {
            return (
              <SofaConfigurePage
                key={configureModel.id}
                model={configureModel}
                meta={index.meta.get(configureModel.id)}
                skus={index.skusByModel.get(configureModel.id) ?? []}
                fabrics={index.fabricsByModel.get(configureModel.id) ?? []}
                masterFabrics={catalog.fabrics}
                optionPools={catalog.optionPools}
                fabricTierConfig={catalog.fabricTierConfig}
                modelFabricTierOverrides={catalog.modelFabricTierOverrides}
                sofaCompartments={catalog.sofaCompartments ?? []}
                modelCompartments={offeredForConfigure}
                sofaCombos={catalog.sofaCombos ?? []}
                catalog={catalog}
                cartLines={cartLines}
                onAdd={emit}
                onClose={close}
              />
            );
          }
          return (
            <ConfigureDrawer
              model={configureModel}
              meta={index.meta.get(configureModel.id)}
              skus={index.skusByModel.get(configureModel.id) ?? []}
              fabrics={index.fabricsByModel.get(configureModel.id) ?? []}
              fabricTierConfig={catalog.fabricTierConfig}
              modelFabricTierOverrides={catalog.modelFabricTierOverrides}
              specialAddons={catalog.specialAddons}
              onAdd={emit}
              onClose={close}
            />
          );
        })()}
    </div>
  );
}

function CatChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-[12px] font-semibold transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-base-200 bg-white text-base-700 hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}
