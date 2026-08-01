import { Search, Sofa } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  GuaranteeTermDto,
  PosRentalPlan,
  ProductBundleDto,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  PwpCodeDto,
  PwpDiscoverDto,
} from "@carres/shared";
import { explodeBundle, guaranteeAttrs } from "@carres/shared";
import { CATEGORY_LABEL } from "@/pages/catalog/components/atoms";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { type DraftLine, type WizardDraft } from "../new-order/draft";
import { lockedCategoriesFor, newLocalId } from "../new-order/configurators";
import { offeredSpecialsFor } from "../new-order/special-addons-picker";
import { buildCatalogIndex } from "./catalog-index";
import { cartItemCount, cartTotalExStair, lineEditTarget, mergeLine } from "./cart";
import PosSidebar, { type RailEntry, type RailKey } from "./PosSidebar";
import {
  cartAccepts,
  cartModeOf,
  isRentalLine,
  mixRefusalMessage,
} from "./rental-cart";
import RentalConfigurePage, { type RentalOfferCard } from "./RentalConfigurePage";
import CatalogSection, { railLabelOf } from "./CatalogSection";
import BundleCard from "./BundleCard";
import BundleConfigurePage from "./BundleConfigurePage";
import { assembleBundleLines, bundleNeedsConfig, type BundleSlotPick } from "./bundle-flow";
import ProductCard from "./ProductCard";
import ConfigureDrawer from "./ConfigureDrawer";
import PosConfigurePage from "./PosConfigurePage";
import SofaConfigurePage from "./SofaConfigurePage";
import CartDrawer from "./CartDrawer";
import AddonsPanel, { offerableAddons } from "./AddonsPanel";
import FloatingCartButton from "./FloatingCartButton";
import GuaranteePickerModal from "./GuaranteePickerModal";

/** The families that render as cards on the wall. Narrower than
 *  `ProductCategory` (which also carries `service`, whose models back the
 *  add-ons list and have no card) — and every member is also a `RailKey`, so a
 *  band can always ask the rail for its own word. */
type CardCategory = Extract<
  ProductCategory,
  "mattress" | "bedframe" | "sofa" | "accessory" | "guarantee"
>;

const CARD_ORDER: CardCategory[] = [
  "mattress",
  "bedframe",
  "sofa",
  "accessory",
  // 0261 — guarantees sort last: they are bought on top of something else.
  "guarantee",
];

/**
 * Step 01 — POS catalog. 2990s-parity layout: sectioned left sidebar
 * (categories / quick / principal-only MAINTAIN / pricing footer), searchable
 * card grid grouped under ONE brand-series header (Carres is a single brand —
 * the 2990s multi-brand grouping collapses to one "CARRES" section), an
 * "Add-ons" panel, a configure drawer per model, a cart drawer, and the
 * floating cart CTA. Builds `DraftLine`/`DraftAddon` objects identical to the
 * legacy wizard so the submit pipeline is untouched.
 *
 * All data-flow logic (mergeLine, mutex, toast): UNCHANGED.
 */
export default function CatalogStep({
  draft,
  onChange,
  catalog,
  onProceed,
  cartOpen,
  onCartOpenChange,
  pwpReservedCodes,
  pwpClaimGroup,
  customerPhone,
  pwpAvailableVouchers,
  onApplyVoucherCode,
  topbarContext,
  rentalPlans,
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  catalog: CatalogResponse;
  onProceed: () => void;
  cartOpen: boolean;
  onCartOpenChange: (open: boolean) => void;
  /** Loo 2026-07-26 — the topbar's `POS · {store}` label; presence turns on
   *  the configure pages' brand strip (logo = back to catalog). */
  topbarContext?: string;
  /** 0187 (Phase 8c) — the caller's RESERVED pwp_codes (from /pwp-codes/mine),
   *  feeding the CartDrawer voucher rail. Optional: absent → no voucher rail
   *  (DORMANT byte-identical). */
  pwpReservedCodes?: PwpCodeDto[];
  /** 0187 — the per-cart claimGroup correlation uuid bound onto a claimed reward
   *  line's attrs.pwp.claimGroup. Optional. */
  pwpClaimGroup?: string;
  /** 0188 (Phase 8d) — the cart's customer phone (gates the cross-order
   *  "Redeem saved voucher" affordance). Optional. */
  customerPhone?: string;
  /** 0188 — AVAILABLE carry-forward vouchers discovered for the customer phone. */
  pwpAvailableVouchers?: PwpDiscoverDto[];
  /** 0188 — manual voucher-code lookup callback (type/scan a number). */
  onApplyVoucherCode?: (code: string) => Promise<PwpDiscoverDto | null>;
  /** Loo 2026-07-26 — the rentable plans (GET /api/rental/pos-plans). Absent or
   *  empty = no Rental rail at all, so a store with nothing on rental offer
   *  sees exactly the catalog it saw before. */
  rentalPlans?: PosRentalPlan[];
}) {
  const index = useMemo(
    () =>
      buildCatalogIndex(catalog, catalog.fabricTierConfig, catalog.modelFabricTierOverrides),
    [catalog],
  );
  const activeAddons = useMemo(() => offerableAddons(catalog.addons), [catalog.addons]);

  const [activeRail, setActiveRail] = useState<RailKey>("all");
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebouncedValue(rawSearch.trim().toLowerCase(), 180);
  const [configureModelId, setConfigureModelId] = useState<string | null>(null);
  /** Loo 2026-07-26 — the rental card being configured (model id), if any. */
  const [rentalCardId, setRentalCardId] = useState<string | null>(null);
  // Cart-line EDIT (Loo 2026-07-12): the ✎ pencil re-opens the line's
  // configurator prefilled; on save the line is REPLACED in place.
  const [editingLine, setEditingLine] = useState<DraftLine | null>(null);
  const [pulse, setPulse] = useState(false);

  const lockedCats = useMemo(
    () => lockedCategoriesFor(draft.lines, index.skuToCategory),
    [draft.lines, index.skuToCategory],
  );

  // ── Rental (Loo 2026-07-26) ────────────────────────────────────────────────
  // One card per MODEL that has at least one plan on offer. A rental offer is
  // authored against a product_models row, so the card wall needs no new
  // catalog concept — the same models, filtered to those with a live plan.
  const rentalCards = useMemo<RentalOfferCard[]>(() => {
    const plans = rentalPlans ?? [];
    if (plans.length === 0) return [];
    const skuToModel = new Map<string, string>();
    for (const s of catalog.skus) skuToModel.set(s.sku, s.modelId);

    const byModel = new Map<string, Map<string, PosRentalPlan[]>>();
    for (const p of plans) {
      const modelId = skuToModel.get(p.sku);
      if (!modelId) continue; // a plan whose sku left the catalog: skip, don't crash
      const perSku = byModel.get(modelId) ?? new Map<string, PosRentalPlan[]>();
      perSku.set(p.sku, [...(perSku.get(p.sku) ?? []), p]);
      byModel.set(modelId, perSku);
    }

    return [...byModel.entries()]
      .map(([modelId, plansBySku]) => {
        const model = index.productModels.find((m) => m.id === modelId);
        return model ? { model, plansBySku } : null;
      })
      .filter((c): c is RentalOfferCard => c !== null);
  }, [rentalPlans, catalog.skus, index.productModels]);

  // The cart has committed to one kind or the other; the rails say so before a
  // tap does. This reuses the sofa-mutex lock affordance already on the rail —
  // no new UI vocabulary for the operator to learn.
  const cartMode = cartModeOf(draft.lines);
  const rentalRailLocked = cartMode === "outright";
  const outrightRailsLocked = cartMode === "rental";

  // If the active rail just got locked — by the sofa mutex, or by the cart
  // committing to rent-vs-buy — bounce somewhere the operator can still act.
  useEffect(() => {
    if (activeRail === "all" || activeRail === "addons" || activeRail === "bundles") return;
    if (activeRail === "rental") {
      // The cart turned into a normal sale: the Rental rail is no longer usable.
      if (rentalRailLocked) setActiveRail("all");
      return;
    }
    // A rental cart locks every buying rail, so "All open" would be a wall of
    // locked cards — send them to the one rail that still works.
    if (outrightRailsLocked) {
      setActiveRail("rental");
      return;
    }
    if (lockedCats.has(activeRail)) setActiveRail("all");
  }, [activeRail, lockedCats, rentalRailLocked, outrightRailsLocked]);

  const countByCat = useMemo(() => {
    const m = new Map<ProductCategory, number>();
    for (const model of index.productModels) {
      m.set(model.category, (m.get(model.category) ?? 0) + 1);
    }
    return m;
  }, [index.productModels]);

  // Which model IDs have lines in the cart (for .pos-selected ring on cards).
  // DraftLine.sku is the sku code string; match against ProductSkuDto.sku.
  const modelIdsInCart = useMemo(() => {
    const cartSkus = new Set(draft.lines.map((l) => l.sku));
    const s = new Set<string>();
    for (const [modelId, skus] of index.skusByModel) {
      if (skus.some((sk) => cartSkus.has(sk.sku))) {
        s.add(modelId);
      }
    }
    return s;
  }, [draft.lines, index.skusByModel]);

  // 0239 — bundle pricing. The API already filters to ACTIVE bundles for the
  // POS; a bundle is addable only when every component SKU is in the (live,
  // pos_active) bundle so its catalog price is known — the explode never
  // guesses a price for an off/retired component.
  const bundles = useMemo(() => catalog.bundles ?? [], [catalog.bundles]);
  const skuPrice = useMemo(
    () => new Map(catalog.skus.map((s) => [s.sku, s.price])),
    [catalog.skus],
  );
  const bundleInfo = useMemo(
    () =>
      bundles.map((b) => {
        // 0241 — availability per kind: fixed needs every component priced;
        // custom needs every slot to offer ≥1 live pick (fixed-variant slots
        // need THEIR sku live).
        const missing =
          b.kind === "custom"
            ? b.slots.some((slot) =>
                slot.variant === "fixed"
                  ? !slot.sku || !skuPrice.has(slot.sku)
                  : !slot.modelIds.some((mid) =>
                      catalog.skus.some((s) => s.modelId === mid && !s.discontinuedAt),
                    ),
              )
            : b.components.some((comp) => !skuPrice.has(comp.sku));
        const cats = new Set(
          b.kind === "custom"
            ? b.slots
                .flatMap((slot) => slot.modelIds)
                .map((mid) => catalog.models.find((m) => m.id === mid)?.category)
                .filter((cat): cat is ProductCategory => Boolean(cat))
            : b.components
                .map((comp) => index.skuToCategory.get(comp.sku))
                .filter((cat): cat is ProductCategory => Boolean(cat)),
        );
        // The "worth" the card strikes through: fixed = Σ component catalog
        // prices; custom = Σ each slot's CHEAPEST eligible pick (Loo
        // 2026-07-19 — the honest minimum a customer could assemble).
        const catalogTotal = missing
          ? 0
          : b.kind === "custom"
            ? b.slots.reduce((s, slot) => {
                if (slot.variant === "fixed")
                  return s + (skuPrice.get(slot.sku ?? "") ?? 0) * slot.qty;
                const prices = slot.modelIds.flatMap((mid) =>
                  catalog.skus
                    .filter((sk) => sk.modelId === mid && !sk.discontinuedAt)
                    .map((sk) => sk.price),
                );
                return s + (prices.length ? Math.min(...prices) : 0) * slot.qty;
              }, 0)
            : b.components.reduce((s, comp) => s + (skuPrice.get(comp.sku) ?? 0) * comp.qty, 0);
        const blob = [b.name, ...b.components.map((comp) => comp.sku)]
          .join(" ")
          .toLowerCase();
        return { bundle: b, missing, cats, catalogTotal, blob };
      }),
    [bundles, skuPrice, index.skuToCategory, catalog.skus, catalog.models],
  );

  // 0241 — the bundle currently in the slot walker (null = none open).
  const [configuringBundle, setConfiguringBundle] = useState<ProductBundleDto | null>(null);

  // 0261 — the guarantee waiting for its covered item to be picked (null = none).
  const [guaranteePick, setGuaranteePick] = useState<{
    term: GuaranteeTermDto;
    sku: ProductSkuDto;
  } | null>(null);

  const railEntries: RailEntry[] = [
    { key: "all", label: "All open", count: index.productModels.length },
    {
      key: "mattress",
      label: "Mattresses",
      count: countByCat.get("mattress") ?? 0,
      locked: lockedCats.has("mattress") || outrightRailsLocked,
    },
    {
      key: "bedframe",
      label: "Bed frames",
      count: countByCat.get("bedframe") ?? 0,
      locked: lockedCats.has("bedframe") || outrightRailsLocked,
    },
    {
      key: "sofa",
      label: "Sofas",
      count: countByCat.get("sofa") ?? 0,
      locked: lockedCats.has("sofa") || outrightRailsLocked,
    },
    // Accessories are cards too (2990s parity) — never mutex-locked.
    {
      key: "accessory",
      label: "Accessories",
      count: countByCat.get("accessory") ?? 0,
      locked: outrightRailsLocked,
    },
    // 0261 — guarantees. Shown only once the principal has authored a term;
    // never sofa-mutex-locked (a guarantee rides on top of whatever is in the
    // cart) — but a RENTAL cart still locks it, because a guarantee is bought.
    ...((countByCat.get("guarantee") ?? 0) > 0
      ? [
          {
            key: "guarantee",
            label: "Guarantees",
            count: countByCat.get("guarantee") ?? 0,
            locked: outrightRailsLocked,
          } as RailEntry,
        ]
      : []),
    // Loo 2026-07-26 — Rent-to-Own is a category now, not a hidden button.
    // Appears only when something is actually on rental offer.
    ...(rentalCards.length > 0
      ? [
          {
            key: "rental",
            label: "Rental",
            count: rentalCards.length,
            locked: rentalRailLocked,
          } as RailEntry,
        ]
      : []),
    // 0239 — bundles rail shows only when at least one active bundle exists.
    ...(bundles.length > 0
      ? [
          {
            key: "bundles",
            label: "Bundles",
            count: bundles.length,
            locked: outrightRailsLocked,
          } as RailEntry,
        ]
      : []),
    { key: "addons", label: "Add-ons", count: activeAddons.length, locked: outrightRailsLocked },
  ];

  // Rental cards show ONLY under their own rail — never mixed into "All open",
  // because the same model can be both bought and rented and two cards for one
  // product on the same wall is exactly the confusion this redesign removes.
  const shownRentals =
    activeRail === "rental"
      ? rentalCards.filter(
          (c) => !search || (index.meta.get(c.model.id)?.searchBlob.includes(search) ?? false),
        )
      : [];

  // Models to render, filtered by rail + search, in CARD_ORDER (mattress →
  // bedframe → sofa → accessory → guarantee).
  //
  // Loo 2026-08-01 — kept AS BANDS, never flattened: the wall renders one band
  // per family (2990s parity), and every "how many cards are on this wall"
  // question reads this one list instead of counting the cards a second time.
  const shownByCat = CARD_ORDER.filter((cat) => activeRail === "all" || activeRail === cat)
    .map((cat) => ({
      cat,
      models: index.productModels.filter((m) => {
        if (m.category !== cat) return false;
        if (!search) return true;
        return index.meta.get(m.id)?.searchBlob.includes(search) ?? false;
      }),
    }))
    .filter((band) => band.models.length > 0);

  const shownModelCount = shownByCat.reduce((n, band) => n + band.models.length, 0);

  // 0239 — bundle cards show first in "All open" and alone under the Bundles
  // rail; the search box matches bundle name + component SKU codes.
  const shownBundles =
    activeRail === "all" || activeRail === "bundles"
      ? bundleInfo.filter((info) => !search || info.blob.includes(search))
      : [];

  // How many bands the wall holds: bundles lead (0239), then the families,
  // then rentals (which only ever appear alone, under their own rail).
  const bandCount =
    (shownBundles.length > 0 ? 1 : 0) + shownByCat.length + (shownRentals.length > 0 ? 1 : 0);
  // A single band is already named by the rail AND by the toolbar count — a
  // third copy of the same word above the same cards is noise, so the header
  // appears only once there is something to tell apart.
  const withHeader = bandCount > 1;

  // The wall's own piece count. Rentals are cards like any other and were
  // counted NOWHERE, so the Rental rail printed "0 pieces" over a wall of
  // cards; under every other rail `shownRentals` is empty and this is the
  // number the toolbar already showed.
  const shownPieceCount = shownModelCount + shownRentals.length;

  // Sofa ↔ mattress/bedframe exclusivity, for the banner above the grid.
  // Sofa in cart locks the mattress+bedframe rails; either of those locks sofa.
  const cartHasSofa = lockedCats.has("mattress") || lockedCats.has("bedframe");
  const cartHasMainNonSofa = lockedCats.has("sofa");

  function resetFilters() {
    setRawSearch("");
    setActiveRail("all");
  }

  /**
   * The no-mixing law (Loo 2026-07-26, LOCKED): a cart is either all rental or
   * all outright. Enforced HERE, at the single funnel every add passes through
   * — card tap, configurator, bundle explode and guarantee pick all end up in
   * `addLine`, so one guard covers every door rather than four that can drift.
   */
  function addLine(line: DraftLine) {
    const kind = isRentalLine(line) ? "rental" : "outright";
    if (!cartAccepts(draft.lines, kind)) {
      toast.error(mixRefusalMessage(kind));
      return;
    }
    onChange({ ...draft, lines: mergeLine(draft.lines, line) });
    // The one-shot FAB pulse (class applied by FloatingCartButton when
    // pulse=true; cleared after 220ms) is the ONLY add feedback — no toast,
    // per Loo 2026-07-14: no notification pop-ups on cart mutations.
    setPulse(true);
    window.setTimeout(() => setPulse(false), 220);
  }

  /** 0239 — add a bundle: explode it into one line per component (Σ-exact
   *  split via the shared engine) and append them as ONE group. Bundle lines
   *  never merge with anything (the per-add `bundle_group` uuid keeps their
   *  attrs unique) and the cart removes/locks them as a group — a lone
   *  component at its split share would be silent under-pricing. */
  function addBundle(bundle: ProductBundleDto) {
    const r = explodeBundle(bundle.components, bundle.price, (sku) => skuPrice.get(sku) ?? null);
    if (!r.ok) {
      toast.error("This bundle isn't available right now — an item in it is off sale.");
      return;
    }
    const group = newLocalId();
    const modelById = new Map(catalog.models.map((m) => [m.id, m]));
    const newLines: DraftLine[] = r.lines.map((l) => {
      const sku = catalog.skus.find((s) => s.sku === l.sku);
      const name = (sku && modelById.get(sku.modelId)?.name) || l.sku;
      return {
        localId: newLocalId(),
        sku: l.sku,
        qty: l.qty,
        unitPrice: l.unitPrice,
        label: sku?.variant?.trim() ? `${name} · ${sku.variant}` : name,
        attrs: {
          bundle_key: bundle.id,
          bundle_label: bundle.name,
          bundle_group: group,
          bundle_slot: l.slot,
        },
      };
    });
    onChange({ ...draft, lines: [...draft.lines, ...newLines] });
    setPulse(true);
    window.setTimeout(() => setPulse(false), 220);
  }

  /** 0241 — a bundle card tap routes: anything with a choice or spec axes
   *  opens the slot walker; a fully-pinned no-axes fixed bundle keeps the V1
   *  direct add. */
  function handleBundleTap(bundle: ProductBundleDto) {
    // A custom bundle ALWAYS walks (its components live in slots — the V1
    // direct add would see an empty components list); a fixed bundle
    // direct-adds only when nothing needs asking.
    if (bundle.kind === "custom" || bundleNeedsConfig(bundle, catalog)) {
      setConfiguringBundle(bundle);
    } else {
      addBundle(bundle);
    }
  }

  /** 0241 — walker completion: split the bundle price across the PICKED skus
   *  (Σ-exact) + each pick's own spec surcharge on top, then append the group. */
  function completeBundle(bundle: ProductBundleDto, picks: BundleSlotPick[]) {
    const assembled = assembleBundleLines(bundle, picks, newLocalId());
    if (!assembled) {
      toast.error("This bundle isn't available right now — an item in it is off sale.");
      return;
    }
    const newLines: DraftLine[] = assembled.map((l) => ({ ...l, localId: newLocalId() }));
    onChange({ ...draft, lines: [...draft.lines, ...newLines] });
    setConfiguringBundle(null);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 220);
  }

  /** Cart-line EDIT save — swap the edited line IN PLACE (same localId, so the
   *  row identity + the PWP reserve reconciler's cartLineKey survive). Every
   *  edit surface now owns a remark field, so the new line's remark is
   *  authoritative (clearing it clears it — no carry-forward resurrection).
   *  A PWP / free claim the re-emit dropped is called out so the operator can
   *  re-apply it from the cart. */
  function replaceEditedLine(next: DraftLine) {
    const old = editingLine;
    if (!old) return;
    const oldAttrs = old.attrs as Record<string, unknown> | null;
    const nextAttrs = (next.attrs ?? null) as Record<string, unknown> | null;
    const merged: DraftLine = { ...next, localId: old.localId };
    onChange({
      ...draft,
      lines: draft.lines.map((l) => (l.localId === old.localId ? merged : l)),
    });
    // No success toast (same no-pop-up rule as addLine); the dropped-claim
    // info below stays — it's actionable, not confirmation noise.
    const hadClaim = Boolean(oldAttrs?.pwp || oldAttrs?.free_item);
    const hasClaim = Boolean(nextAttrs?.pwp || nextAttrs?.free_item);
    if (hadClaim && !hasClaim) {
      toast.info(
        "The voucher / free claim on this item was reset — re-apply it from the cart if it still applies.",
      );
    }
  }

  // Card tap. Accessories / services have no options to pick — a single-sku,
  // no-specials model adds STRAIGHT to the cart (Loo 2026-07-06: "can direct
  // add to cart", no drawer). Anything with a real choice opens the configurator.
  function handleConfigure(model: ProductModelDto) {
    const modelSkus = index.skusByModel.get(model.id) ?? [];

    // 0261 — a guarantee NEVER direct-adds. It must name the item it covers,
    // or the claim two years from now has nothing to trace back to.
    if (model.category === "guarantee") {
      const s = modelSkus[0];
      const term = (catalog.guaranteeTerms ?? []).find((t) => t.guaranteeSku === s?.sku);
      if (s && term) {
        setGuaranteePick({ term, sku: s });
      } else {
        toast.error("This guarantee isn't set up yet — ask the principal to add its terms.");
      }
      return;
    }

    const flat = model.category === "accessory" || model.category === "service";
    if (flat && modelSkus.length === 1 && offeredSpecialsFor(model, catalog.specialAddons).length === 0) {
      const s = modelSkus[0]!;
      addLine({
        localId: newLocalId(),
        sku: s.sku,
        qty: 1,
        attrs: null,
        unitPrice: s.price,
        // A variant-less sku (plain accessory) is just the model name — no
        // stranded " · " separator (Loo 2026-07-12).
        label: s.variant?.trim() ? `${model.name} · ${s.variant}` : model.name,
      });
      return;
    }
    setConfigureModelId(model.id);
  }

  const configureModel = configureModelId
    ? index.productModels.find((m) => m.id === configureModelId) ?? null
    : null;

  const itemCount = cartItemCount(draft.lines);
  const cartTotal = cartTotalExStair(draft.lines, draft.addons);

  return (
    <div className="catalog">
      {/* Left sidebar — categories / TBC / quick / MAINTAIN (principal) / footer */}
      <PosSidebar
        entries={railEntries}
        active={activeRail}
        onSelect={setActiveRail}
        onResetFilters={resetFilters}
      />

      {/* Main: toolbar + grid / add-ons */}
      <main className="cat-main">
        <div className="cat-toolbar">
          <div className="cat-search">
            <Search size={16} strokeWidth={1.75} />
            <input
              type="search"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Search by name, SKU, or detail…"
              aria-label="Search catalog"
            />
          </div>
          {/* One brand today — the series filter activates when series data exists. */}
          <select className="cat-select" value="All series" onChange={() => {}}>
            <option>All series</option>
          </select>
          <span className="cat-toolbar__count">
            {activeRail === "addons"
              ? `${activeAddons.length} add-on${activeAddons.length === 1 ? "" : "s"}`
              : activeRail === "bundles"
                ? `${shownBundles.length} bundle${shownBundles.length === 1 ? "" : "s"}`
                : `${shownPieceCount} piece${shownPieceCount === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="cat-grid-wrap">
          {/* Sofa-exclusivity notice — functional mutex feedback. */}
          {activeRail !== "addons" && (cartHasSofa || cartHasMainNonSofa) && (
            <div
              className="fade-in"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                marginBottom: 16,
                background: "var(--pos-panel)",
                border: "1px solid var(--line-strong)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--fg)",
              }}
            >
              <Sofa size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              <span>
                {cartHasSofa
                  ? "Sofa order — sofas don't share an order with mattresses or bed frames. Check out or clear the cart to switch categories."
                  : "This order has a mattress or bed frame. Sofas are placed separately — check out or clear the cart to start a sofa order."}
              </span>
            </div>
          )}

          {activeRail === "addons" ? (
            <AddonsPanel addons={activeAddons} draft={draft} onChange={onChange} />
          ) : bandCount === 0 ? (
            <div className="cat-empty">
              <h4>No pieces match.</h4>
              <p>Try clearing the search or pick a different category.</p>
              {search && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="btn btn--ghost btn--sm"
                  style={{ marginTop: 14 }}
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 0239 — bundle offers lead the wall. */}
              {shownBundles.length > 0 && (
                <CatalogSection
                  label={railLabelOf(railEntries, "bundles", "Bundles")}
                  count={shownBundles.length}
                  noun="bundle"
                  withHeader={withHeader}
                >
                  {shownBundles.map(({ bundle, missing, cats, catalogTotal }) => {
                    const mutexLocked = [...cats].some((cat) => lockedCats.has(cat));
                    return (
                      <BundleCard
                        key={bundle.id}
                        bundle={bundle}
                        catalog={catalog}
                        catalogTotal={catalogTotal}
                        locked={missing || mutexLocked}
                        lockedReason={
                          missing
                            ? "An item in this bundle is off sale right now"
                            : "Locked — this order already has a conflicting product family"
                        }
                        inCart={draft.lines.some(
                          (l) =>
                            (l.attrs as Record<string, unknown> | null)?.bundle_key === bundle.id,
                        )}
                        onAdd={() => handleBundleTap(bundle)}
                      />
                    );
                  })}
                </CatalogSection>
              )}
              {shownByCat.map(({ cat, models }) => (
                <CatalogSection
                  key={cat}
                  label={railLabelOf(railEntries, cat, CATEGORY_LABEL[cat])}
                  count={models.length}
                  withHeader={withHeader}
                >
                  {models.map((model) => (
                    <ProductCard
                      key={model.id}
                      model={model}
                      meta={index.meta.get(model.id)!}
                      locked={lockedCats.has(model.category) || outrightRailsLocked}
                      inCart={modelIdsInCart.has(model.id)}
                      onConfigure={() => handleConfigure(model)}
                    />
                  ))}
                </CatalogSection>
              ))}
              {/* Rental cards — the SAME ProductCard as everything else, which
                  is the whole point: renting must not look like another app. */}
              {shownRentals.length > 0 && (
                <CatalogSection
                  label={railLabelOf(railEntries, "rental", "Rental")}
                  count={shownRentals.length}
                  withHeader={withHeader}
                >
                  {shownRentals.map((card) => (
                    <ProductCard
                      key={`rental-${card.model.id}`}
                      model={card.model}
                      meta={index.meta.get(card.model.id)!}
                      locked={rentalRailLocked}
                      inCart={modelIdsInCart.has(card.model.id)}
                      onConfigure={() => setRentalCardId(card.model.id)}
                    />
                  ))}
                </CatalogSection>
              )}
            </>
          )}
        </div>
      </main>

      <FloatingCartButton
        itemCount={itemCount}
        total={cartTotal}
        pulse={pulse}
        onClick={() => onCartOpenChange(true)}
      />

      {/* Rent-to-Own configure page — full page, same shape as the bought
          configurators (Loo 2026-07-26). Checked BEFORE them so a model that is
          both sold and rented opens the right one. */}
      {(() => {
        const card = rentalCardId
          ? rentalCards.find((c) => c.model.id === rentalCardId) ?? null
          : null;
        if (!card) return null;
        return (
          <RentalConfigurePage
            card={card}
            catalog={catalog}
            onAdd={(line) => {
              addLine(line);
              setRentalCardId(null);
            }}
            onClose={() => setRentalCardId(null)}
            wizardTopbar={topbarContext ? { contextLabel: topbarContext } : undefined}
          />
        );
      })()}

      {(() => {
        // POS-parity (Loo 2026-07-04) — a MODULAR sofa (offers compartments)
        // jumps STRAIGHT into the full-page configurator (Quick pick +
        // Customize tabs), no drawer hop. Every other model (mattress /
        // bedframe / accessory / dropdown-sofa) keeps the drawer.
        //
        // The SAME surfaces serve the cart-line EDIT (Loo 2026-07-12): the ✎
        // pencil sets `editingLine` → its model is resolved from the sku, the
        // page opens PREFILLED, and the emit REPLACES the line in place.
        const editSku = editingLine ? catalog.skus.find((s) => s.sku === editingLine.sku) : null;
        const editModel = editSku
          ? index.productModels.find((m) => m.id === editSku.modelId) ?? null
          : null;
        const activeModel = editingLine ? editModel : configureModel;
        if (!activeModel) return null;
        const editing = editingLine ?? undefined;
        const emitLine = editing ? replaceEditedLine : addLine;
        const closeConfigure = () => {
          setConfigureModelId(null);
          setEditingLine(null);
        };
        // PWP eligibility must not count the line being edited (it's about to
        // be replaced) — else its own trigger/claim skews the allowance.
        const pwpCartLines = editing
          ? draft.lines.filter((l) => l.localId !== editing.localId)
          : draft.lines;
        const offered = (catalog.modelSofaCompartments ?? []).filter(
          (mc) => mc.modelId === activeModel.id,
        );
        // Mattress + bed frame ALSO go full page now (prototype's
        // ConfiguratorScreen — plan-view canvas + live total), same
        // straight-in convention. Accessory / pillow / dropdown-sofa /
        // service keep the drawer.
        if (
          activeModel.category === "mattress" ||
          activeModel.category === "bedframe"
        ) {
          return (
            <PosConfigurePage
              key={editing?.localId ?? activeModel.id}
              model={activeModel}
              meta={index.meta.get(activeModel.id)}
              skus={index.skusByModel.get(activeModel.id) ?? []}
              specialAddons={catalog.specialAddons}
              optionPools={catalog.optionPools}
              fabrics={catalog.fabrics}
              fabricTierConfig={catalog.fabricTierConfig}
              modelFabricTierOverrides={catalog.modelFabricTierOverrides}
              catalog={catalog}
              cartLines={pwpCartLines}
              pwpReservedCodes={pwpReservedCodes}
              pwpClaimGroup={pwpClaimGroup}
              customerPhone={customerPhone}
              onApplyVoucherCode={onApplyVoucherCode}
              editLine={editing}
              onAdd={emitLine}
              onClose={closeConfigure}
              wizardTopbar={topbarContext ? { contextLabel: topbarContext } : undefined}
            />
          );
        }
        // An EDIT of a stored sofa build re-opens the sofa page even when the
        // model's offered set has since gone empty — the geometry still
        // renders; only the palette is empty.
        if (
          activeModel.category === "sofa" &&
          (offered.length > 0 || Boolean(editing && lineEditTarget(editing, catalog) === "sofa_build"))
        ) {
          return (
            <SofaConfigurePage
              key={editing?.localId ?? activeModel.id}
              model={activeModel}
              meta={index.meta.get(activeModel.id)}
              skus={index.skusByModel.get(activeModel.id) ?? []}
              fabrics={index.fabricsByModel.get(activeModel.id) ?? []}
              masterFabrics={catalog.fabrics}
              optionPools={catalog.optionPools}
              fabricTierConfig={catalog.fabricTierConfig}
              modelFabricTierOverrides={catalog.modelFabricTierOverrides}
              sofaCompartments={catalog.sofaCompartments ?? []}
              modelCompartments={offered}
              sofaCombos={catalog.sofaCombos ?? []}
              catalog={catalog}
              cartLines={pwpCartLines}
              pwpReservedCodes={pwpReservedCodes}
              pwpClaimGroup={pwpClaimGroup}
              customerPhone={customerPhone}
              onApplyVoucherCode={onApplyVoucherCode}
              editLine={editing}
              onAdd={emitLine}
              onClose={closeConfigure}
            />
          );
        }
        // The drawer never serves an edit (lineEditTarget gates the pencil to
        // the two full-page surfaces) — this branch is add-flow only.
        if (editing) return null;
        return (
          <ConfigureDrawer
            model={activeModel}
            meta={index.meta.get(activeModel.id)}
            skus={index.skusByModel.get(activeModel.id) ?? []}
            fabrics={index.fabricsByModel.get(activeModel.id) ?? []}
            fabricTierConfig={catalog.fabricTierConfig}
            modelFabricTierOverrides={catalog.modelFabricTierOverrides}
            sofaCompartments={catalog.sofaCompartments}
            modelSofaCompartments={catalog.modelSofaCompartments}
            sofaCombos={catalog.sofaCombos}
            specialAddons={catalog.specialAddons}
            onAdd={addLine}
            onClose={closeConfigure}
          />
        );
      })()}

      {/* 0241 — the bundle slot walker (custom bundles + spec-carrying fixed
          bundles route here; fully-pinned no-axes bundles direct-add). */}
      {configuringBundle && (
        <BundleConfigurePage
          bundle={configuringBundle}
          catalog={catalog}
          index={index}
          onComplete={(picks) => completeBundle(configuringBundle, picks)}
          onClose={() => setConfiguringBundle(null)}
        />
      )}

      {/* 0261 — a guarantee card asks WHAT it covers before it can be added.
          The pick is stamped into attrs.guarantee.covers_sku, which is the
          exact path the 0262 mint trigger reads. */}
      {guaranteePick && (
        <GuaranteePickerModal
          term={guaranteePick.term}
          sku={guaranteePick.sku}
          lines={draft.lines}
          catalog={catalog}
          onCancel={() => setGuaranteePick(null)}
          onPick={(coversSku, coversLabel) => {
            addLine({
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

      {/* The cart hides while a line-edit configurator is up (one Escape = one
          layer; no stacking fight) and pops back — updated — when it closes. */}
      {cartOpen && !editingLine && (
        <CartDrawer
          draft={draft}
          onChange={onChange}
          onProceed={() => {
            onCartOpenChange(false);
            onProceed();
          }}
          onClose={() => onCartOpenChange(false)}
          catalog={catalog}
          pwpReservedCodes={pwpReservedCodes}
          pwpClaimGroup={pwpClaimGroup}
          customerPhone={customerPhone}
          pwpAvailableVouchers={pwpAvailableVouchers}
          onApplyVoucherCode={onApplyVoucherCode}
          onEditLine={(line) => {
            // The configurator portals to document.body (z-50) ABOVE the cart
            // popup, edits land back in the still-open cart on close.
            if (lineEditTarget(line, catalog)) setEditingLine(line);
          }}
        />
      )}
    </div>
  );
}
