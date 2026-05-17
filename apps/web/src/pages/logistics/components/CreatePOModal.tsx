import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  ManualCostSource,
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
} from "@carres/shared";

// T42-C1 — Form state uses `ManualCostSource` (3-value, no `auto_issued`)
// rather than the wider DB-level `CostSource` (4-value). The `auto_issued`
// label is server-only — emitted by the auto-issue path that predates
// manual create gating. This modal is the MANUAL create surface, so the
// form state must NOT originate `auto_issued`. Aligning the form-state type
// with the `createPoInput.lines[].costSource` zod (3-value enum) closes the
// typecheck regression introduced when 0055's `auto_issued` was added to
// the DB enum.
import { ApiError } from "@/lib/api";
import {
  useAwaitingStockShortage,
  useCatalog,
  useCreatePoMutation,
  useCreatePosBatch,
  useDeliveryPartners,
  useLogisticsSuppliers,
  useLogisticsWarehouse,
  useStockAlerts,
  type SupplierRow,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * CreatePOModal — proto NewPODialog (logistics-screens.jsx lines 791-1026).
 *
 * Lets logistics raise a Purchase Order. SKUs are auto-routed to suppliers via
 * the supplier's `cat_covered` array (e.g. a SKU starting `mattress:` goes to
 * the supplier whose cat_covered includes "mattress"). When multiple suppliers
 * end up matching across the line set, the modal warns + hits the create
 * endpoint once per supplier ("auto-split"). Each `factory_pickup` supplier
 * needs a delivery partner picked at creation time (proto F1.A).
 *
 * Prefill cases:
 *   - {} : empty new PO; user picks SKU/qty manually.
 *   - { dl: 1234, lines: [...] } : single-order shortage prefill.
 *   - { dlRefs: [12, 34], lines: [...] } : cross-order bundle prefill (M5.2 →
 *     M5.3 wire-up). The aggregated lines come from the parent.
 *
 * Mirrors proto §18.4 visual conventions:
 *   - intro line + Auto-match button (only when no dl)
 *   - lines table with auto-supplier column + add/remove SKU
 *   - duplicate-SKU warning band
 *   - auto-split notice band when N>1 suppliers
 *   - per-supplier group cards (orange-tinted for factory_pickup with partner
 *     select; green-tinted for own_logistics)
 *   - per-group warehouse picker (C5.2 — Q4=A blank required) + ETA picker
 *   - primary CTA: "Issue N POs · M lines" or "Issue PO · M lines"
 *
 * C5.2 — per-PO warehouse picker.
 *   The warehouse used to be a single dropdown at the modal bottom shared by
 *   all supplier groups. Now each group picks its own destination warehouse
 *   (a sofa supplier may ship to PJ while a mattress supplier ships to Klang).
 *   Default value is blank and required — submit stays disabled until every
 *   group has one.
 *   When groups > 1 we collapse the N sequential useCreatePoMutation calls
 *   into a single useCreatePosBatch call (atomic — all-or-nothing PG tx, see
 *   migration 0025).
 */
export interface CreatePoPrefill {
  /** Single-order PO — sets the `dl` foreign key. */
  dl?: number;
  /** Cross-order bundle PO — sets `dl_refs` (array of order DLs). */
  dlRefs?: number[];
  /** Pre-filled line items (sku + qty + optional attrs); comes from order
   * shortage aggregation. 0076: attrs is now carried through so bedframe
   * color/gap and sofa fabric pre-fill the cascade picker. NULL/undefined
   * means mattress (no extras) or pre-cascade legacy data. */
  lines?: { sku: string; qty: number; attrs?: Record<string, unknown> | null }[];
  /** Optional preselect (used when proto auto-issued for a known supplier). */
  supplierId?: string;
  /** Pre-selected destination warehouse. */
  warehouseId?: string;
  /** Inline annotation copy ("Auto-matched 3 SKUs across 2 orders…"). */
  note?: string;
}

interface Props {
  prefill: CreatePoPrefill;
  onClose: () => void;
}

interface DraftLine {
  // 0073 cascade picker (Loo 2026-05-09). Track the selected model separately
  // from the resolved SKU so the user can pick "Elwood" first, then choose
  // King vs Queen. modelId="" means no model picked yet; sku="" means no
  // variant picked yet. Submit gate refuses both.
  modelId: string;
  sku: string;
  qty: number;
  // T29 — per-line COGS fields. Driven by `<CogsLineEditor>` (T28). Both
  // start as null on a fresh row and must be non-null at submit time
  // (validated below). Mirrors `createPoInput.lines[]` zod shape; the API
  // edge transforms `costSource` → `cost_source` before the RPC call.
  cost: number | null;
  costSource: ManualCostSource | null;
  // 0073 cascade picker payload. Bedframe={color, gap}, Sofa={fabric_id,
  // fabric_name, fabric_surcharge}, Mattress=null. Submit gate refuses when
  // bedframe lacks color/gap or sofa lacks fabric_id.
  attrs: Record<string, unknown> | null;
}

// 2026-05-17 (Loo A→Z test bug A) — real DB SKUs (e.g. `B1201F-K`) don't carry
// a `category:model:variant` prefix the way the early proto seed did. We have
// to walk product_skus → product_models.category instead. The two helpers
// below take a SKU + the resolver maps the modal already builds.
function categoryForSku(
  sku: string,
  skuByCode: Map<string, ProductSkuDto>,
  models: ProductModelDto[],
): string {
  const skuRow = skuByCode.get(sku);
  if (!skuRow) return "";
  const model = models.find((m) => m.id === skuRow.modelId);
  return model?.category ?? "";
}
function modelIdForSku(sku: string, skuByCode: Map<string, ProductSkuDto>): string {
  return skuByCode.get(sku)?.modelId ?? "";
}
function modelById(modelId: string, models: ProductModelDto[]): ProductModelDto | null {
  return models.find((m) => m.id === modelId) ?? null;
}
// True when this line still needs cascade input (bedframe color/gap or sofa
// fabric). Mattress lines always pass.
function attrsMissingForLine(
  line: DraftLine,
  models: ProductModelDto[],
  fabricsByModel: Map<string, SofaFabricDto[]>,
): boolean {
  if (!line.modelId || !line.sku) return true;
  const model = modelById(line.modelId, models);
  if (!model) return true;
  if (model.category === "bedframe") {
    const color = (line.attrs as { color?: string } | null)?.color;
    const gap = (line.attrs as { gap?: string } | null)?.gap;
    return !color || !gap;
  }
  if (model.category === "sofa") {
    if ((fabricsByModel.get(model.id) ?? []).length === 0) return false;
    const fid = (line.attrs as { fabric_id?: string } | null)?.fabric_id;
    return !fid;
  }
  return false;
}

function findSupplierForSku(
  sku: string,
  suppliers: SupplierRow[],
  skuByCode: Map<string, ProductSkuDto>,
  models: ProductModelDto[],
): SupplierRow | null {
  // 2026-05-17 — prefer the SKU's own supplier_id when the catalog row carries
  // it; otherwise fall back to the cat_covered category match (multi-supplier
  // category, e.g. mattress from two factories). Both paths cover the
  // real-world data; the old proto-style category:model:variant split is gone.
  const skuRow = skuByCode.get(sku);
  if (skuRow?.supplierId) {
    const direct = suppliers.find((s) => s.id === skuRow.supplierId);
    if (direct) return direct;
  }
  const cat = categoryForSku(sku, skuByCode, models);
  if (!cat) return null;
  return suppliers.find((s) => (s.cat_covered ?? []).includes(cat)) ?? null;
}

export default function CreatePOModal({ prefill, onClose }: Props) {
  const suppliersQ = useLogisticsSuppliers();
  const warehousesQ = useLogisticsWarehouse();
  const catalogQ = useCatalog();
  const partnersQ = useDeliveryPartners();
  const create = useCreatePoMutation();
  const createBatch = useCreatePosBatch();

  // C5.3 — Auto-fill from awaiting stock. Lazy hook (enabled: false) — only
  // fires on the button's onClick → refetch(). The visibility rule below
  // hides the button entirely when the modal was opened with a specific
  // order/bundle prefill (those flows already know the lines and we don't
  // want to clobber them).
  //
  // 2026-05-10 — bundle prefill (`prefill.dlRefs`) re-uses this same hook
  // with `?dls=...` scoping so the cross-order bundle modal pre-fills the
  // exact lines for the operator's selection. The auto-fire effect below
  // calls `autoFillFromShortage()` once on mount when dlRefs is set; the
  // button itself stays hidden (showAutoFill checks dlRefs).
  const shortageQ = useAwaitingStockShortage(prefill.dlRefs);

  // Phase 4.5 Chunk 2 T22 — "Suggest from alerts" button. Same lazy pattern as
  // the shortage hook above: `enabled: false` so the network call only fires
  // on the button's onClick → refetch(). Source: GET /api/logistics/stock-alerts
  // (T18 route → RPC `logistics_stock_alerts()` migration 0054).
  //
  // Suggested qty per alert row uses the master plan T22 formula
  //   qty = (high_threshold || low_threshold * 2) - effective
  // The alerts feed only carries `low_threshold` today (the RPC return columns
  // are frozen by migration 0054 — adding `high_threshold` would need a new
  // migration), so the formula reduces to `low_threshold * 2 - effective`.
  // Tracking as carry-forward `phase-4.5-chunk-2-stock-alerts-high-threshold-
  // expose` for a follow-up RPC bump if Loo wants the per-row override wired
  // through. By construction (alerts only fire when `effective < low_threshold`)
  // the suggested qty is always > low_threshold, so the `Math.max(1, …)` clamp
  // below is a defensive guard rather than a hot path.
  const alertsQ = useStockAlerts({ enabled: false });

  // v3-S4.5 — Stockpile PO mode. When the user wants to procure inventory
  // ahead of demand (no specific customer order to cover), they tick this
  // toggle. The submission then drops `dl` / `dlRefs` from the payload —
  // backend RPC accepts NULL for both (validated against migration 0019/0025).
  // Spec §17.1 A3 promotes this from edge-case to 1st-class flow.
  //
  // Mutually exclusive with auto-fill prefill: when the modal is opened with
  // `dl` / `dlRefs` set, the toggle is disabled (you can't stockpile if the
  // caller already pinned the order ref). UI-locked rather than hidden so the
  // operator sees the option exists but understands why it's not available
  // here.
  const autoFillPrefilled =
    prefill.dl != null ||
    (prefill.dlRefs != null && prefill.dlRefs.length > 0);
  const [stockpile, setStockpile] = useState<boolean>(false);
  // 0076 (Loo 2026-05-10): per-variant split. OFF (default) = one combined PO
  // per supplier (bedframe workflow — multi-color in same PO). ON = one PO
  // per (supplier, sku, attrs) tuple (sofa workflow — HoOKkA needs separate
  // POs per fabric for production). Operator picks per situation.
  const [splitPerVariant, setSplitPerVariant] = useState<boolean>(false);

  const suppliers = suppliersQ.data?.suppliers ?? [];
  const warehouses = warehousesQ.data?.warehouses ?? [];
  // 0073 cascade picker (Loo 2026-05-09). Three indices over the catalog let
  // each line render its category-aware cascade in O(1):
  //   - models                : ordered list grouped by category (for the
  //                             top-of-line model dropdown).
  //   - skusByModel           : model.id → ProductSkuDto[] (size variants).
  //   - fabricsByModel        : model.id → SofaFabricDto[] (sofa fabric chips).
  // `attrsMissingForLine` reads fabricsByModel to skip the fabric-required
  // refusal for sofa models with no fabrics configured (defensive — staging
  // currently always has fabrics).
  const models = useMemo<ProductModelDto[]>(
    () => catalogQ.data?.models ?? [],
    [catalogQ.data],
  );
  const skusByModel = useMemo(() => {
    const m = new Map<string, ProductSkuDto[]>();
    for (const s of catalogQ.data?.skus ?? []) {
      const arr = m.get(s.modelId) ?? [];
      arr.push(s);
      m.set(s.modelId, arr);
    }
    return m;
  }, [catalogQ.data]);
  const fabricsByModel = useMemo(() => {
    const m = new Map<string, SofaFabricDto[]>();
    for (const f of catalogQ.data?.sofaFabrics ?? []) {
      const arr = m.get(f.modelId) ?? [];
      arr.push(f);
      m.set(f.modelId, arr);
    }
    return m;
  }, [catalogQ.data]);
  // 0074 — auto-cost lookup: line.sku → ProductSkuDto. Each line's cost is
  // pulled from product_skus.cost the moment the operator picks a variant
  // (Loo Q5=a 2026-05-09: cost is fixed in catalog, not editable per PO).
  const skuByCode = useMemo(() => {
    const m = new Map<string, ProductSkuDto>();
    for (const s of catalogQ.data?.skus ?? []) m.set(s.sku, s);
    return m;
  }, [catalogQ.data]);
  const partners = partnersQ.data?.partners ?? [];

  // ---- Lines ----
  // T29: every line carries `cost` + `costSource` driven by CogsLineEditor.
  // Both start null — the user fills them via the editor before submit (the
  // valid-form gate enforces non-null per line). Auto-fill / suggest paths
  // also leave them null so the operator picks the cost source explicitly per
  // line.
  // 0074 — auto-cost helper. When a line's sku is set, pull cost +
  // cost_source from product_skus. Returns nulls when SKU has no cost yet
  // (catalog admin needs to fill it in; submit gate refuses such lines).
  const lineCostFromSku = (
    sku: string,
  ): { cost: number | null; costSource: ManualCostSource | null } => {
    if (!sku) return { cost: null, costSource: null };
    const skuObj = skuByCode.get(sku);
    if (skuObj == null || skuObj.cost == null) {
      return { cost: null, costSource: null };
    }
    return { cost: skuObj.cost, costSource: "catalog" };
  };

  // 0073/0074 — prefill carries sku + qty + optional attrs. Derive modelId
  // for the cascade and pull cost from product_skus.cost (fixed per Loo
  // Q5=a). 0076 (Loo 2026-05-10): when prefill.lines includes attrs (auto-
  // fill from shortage now does), carry it through so bedframe/sofa cascade
  // pre-fills and the operator doesn't have to re-pick. Mattress lines pass
  // attrs undefined → null, which is correct.
  const initialLines: DraftLine[] = useMemo(() => {
    if (prefill.lines && prefill.lines.length > 0) {
      return prefill.lines.map((l) => {
        const cs = lineCostFromSku(l.sku);
        return {
          modelId: modelIdForSku(l.sku, skuByCode),
          sku: l.sku,
          qty: l.qty,
          cost: cs.cost,
          costSource: cs.costSource,
          attrs: l.attrs ?? null,
        };
      });
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill.lines, models, skuByCode]);
  const [lines, setLines] = useState<DraftLine[]>(initialLines);

  // 2026-05-11 (Loo): catalog-arrives re-sync. `useState(initialLines)` captures
  // lines on first paint, but `initialLines` is built from `models` /
  // `skuByCode` which are derived from `catalogQ.data`. On a cold-cache
  // open the catalog query is still in-flight at first paint → models = [] →
  // `modelIdForSku(sku, [])` returns undefined → SKU dropdown shows
  // "— pick model —" forever even though sku/qty/supplier autofilled
  // correctly. Re-syncing once catalog data arrives fixes the cold-cache
  // first-open case (warm-cache reopens were already correct, which is why
  // closing+reopening the modal "fixed" it).
  //
  // Ref guard: fires exactly once per modal mount, AFTER catalog data is
  // present + initialLines actually has rows. Functional setState protects
  // any in-flight user edits — only re-syncs when the current state still
  // matches the stale shape (modelId is missing on a row that has a sku).
  const initialLinesSyncRef = useRef(false);
  useEffect(() => {
    if (initialLinesSyncRef.current) return;
    if (catalogQ.data == null) return;
    if (initialLines.length === 0) return;
    setLines((prev) => {
      if (prev.length !== initialLines.length) return prev; // user added/removed
      const hasStale = prev.some(
        (l, i) => l.sku && !l.modelId && initialLines[i]?.modelId,
      );
      if (!hasStale) {
        initialLinesSyncRef.current = true;
        return prev;
      }
      initialLinesSyncRef.current = true;
      return initialLines;
    });
  }, [catalogQ.data, initialLines]);

  // Default the first line to the first SKU once the catalog loads (only when
  // we started with zero prefill lines). 0074: cost auto-fills from the SKU.
  //
  // 2026-05-10 — skip when the modal was opened with a specific order ref
  // (`prefill.dl`) or a cross-order bundle (`prefill.dlRefs`). The placeholder
  // line was misleading operators in the bundle case: a `qty=5` row with the
  // first catalog SKU has no relationship to the orders the user selected, so
  // it looked like the modal had auto-aggregated wrong totals (memory 1790,
  // 1793). Bundle flow auto-prefills via the shortage fetch effect below;
  // single-order flow expects the operator to use the auto-fill button or add
  // SKUs manually. The placeholder is reserved for the truly empty case
  // (stockpile / fresh PO from scratch with no caller hint).
  useEffect(() => {
    if (prefill.dl != null) return;
    if (prefill.dlRefs != null && prefill.dlRefs.length > 0) return;
    if (lines.length === 0 && initialLines.length === 0) {
      const firstSku = catalogQ.data?.skus?.[0];
      if (firstSku) {
        const cs = lineCostFromSku(firstSku.sku);
        setLines([
          {
            modelId: firstSku.modelId,
            sku: firstSku.sku,
            qty: 5,
            cost: cs.cost,
            costSource: cs.costSource,
            attrs: null,
          },
        ]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, catalogQ.data, initialLines.length]);

  // 2026-05-10 — bundle auto-prefill on mount. When the modal opens with
  // `prefill.dlRefs` (CrossOrderBundleSheet → "+ Create combined PO" →
  // setBundlePrefill), kick off `autoFillFromShortage()` exactly once so the
  // shortage fetch (now scoped to those dls via the hook) pre-fills the
  // lines table with the actual aggregated need from the source orders.
  // Ref guard keeps it idempotent across re-renders without coupling to the
  // dlRefs identity (parents recreate arrays on every render of the kanban).
  const bundleAutoFetchRan = useRef(false);
  useEffect(() => {
    if (bundleAutoFetchRan.current) return;
    if (prefill.dlRefs == null || prefill.dlRefs.length === 0) return;
    // Caller-supplied lines win — if the parent already aggregated, don't
    // clobber its work with a server fetch.
    if (prefill.lines && prefill.lines.length > 0) return;
    // Wait for catalog to load — `modelIdForSku` needs `models` populated to
    // resolve each line's modelId, which drives the cascade picker. Without
    // this gate the auto-fill can land before catalog → modelId stays empty
    // → operator sees "— pick model —" rows even though sku/qty are correct.
    if (!catalogQ.data) return;
    bundleAutoFetchRan.current = true;
    void autoFillFromShortage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogQ.data]);

  // C5.2 — per-supplier-group warehouse (Q4=A: blank required, no auto-default).
  // `prefill.warehouseId` (when supplied) seeds every group on first paint, so
  // shortage-aggregation flows that already know the destination still pre-fill.
  const [warehouseBySupplier, setWarehouseBySupplier] = useState<
    Record<string, string>
  >({});

  // ETA is now wired end-to-end (0083, Loo 2026-05-10). `etaDate` is a
  // required field on `createPoInput`; submit blocks until the user picks a
  // date. Single-PO route does post-RPC UPDATE; batch RPC accepts it inline.
  const [eta, setEta] = useState<string>("");
  const [partnerBySupplier, setPartnerBySupplier] = useState<
    Record<string, string>
  >({});

  // ---- Group lines by their auto-detected supplier ----
  const groups = useMemo(() => {
    const g = new Map<string, { supplier: SupplierRow; lines: DraftLine[] }>();
    const orphans: DraftLine[] = [];
    for (const l of lines) {
      const sup = findSupplierForSku(l.sku, suppliers, skuByCode, models);
      if (!sup) {
        orphans.push(l);
        continue;
      }
      if (!g.has(sup.id)) g.set(sup.id, { supplier: sup, lines: [] });
      g.get(sup.id)!.lines.push(l);
    }
    return { groups: [...g.values()], orphans };
  }, [lines, suppliers]);

  // C5.3 — Auto-fill button visibility. Hidden whenever the modal was opened
  // with a specific order or bundle prefill, since those flows already know
  // the lines (clicking the button would silently clobber the user's intent).
  // v3-S4.5 — also hidden in stockpile mode (auto-fill is order-shortage-
  // driven; stockpile by definition has no order to drive from).
  const showAutoFill =
    !stockpile &&
    prefill.dl == null && (prefill.dlRefs == null || prefill.dlRefs.length === 0);

  // T22 — "Suggest from alerts" visibility. Same prefill-guard as auto-fill
  // (don't clobber order-driven flows), but stays visible in stockpile mode —
  // stockpile + alerts is the canonical use case ("replenish based on what's
  // currently below threshold").
  const showSuggestAlerts = !autoFillPrefilled;
  // Empty result is sticky once known (mirrors auto-fill UX) — disable the
  // button until a refetch returns rows OR the modal is closed/reopened. The
  // `!isError` guard avoids a stuck "no alerts" disabled state when the last
  // refetch actually 5xx'd (data is undefined for the wrong reason).
  const lastAlertsEmpty =
    alertsQ.isFetched && !alertsQ.isError &&
    (alertsQ.data?.alerts.length ?? 0) === 0;
  const suggestAlertsDisabled = alertsQ.isFetching || lastAlertsEmpty;
  // Empty result is sticky once known — disable the button until the user
  // closes/reopens or until refetched data shows shortages. The `!isError`
  // guard prevents the button from getting stuck in the "No shortages found"
  // disabled state when the last refetch actually failed (data is undefined
  // because of a 5xx, not because the order book is clean).
  const lastShortageEmpty =
    shortageQ.isFetched && !shortageQ.isError &&
    (shortageQ.data?.shortage.length ?? 0) === 0;
  const autoFillDisabled = shortageQ.isFetching || lastShortageEmpty;

  async function autoFillFromShortage() {
    try {
      const res = await shortageQ.refetch();
      // React Query's refetch resolves with `{data, error}` rather than
      // throwing on HTTP failure. Without this branch a 5xx silently falls
      // through to the empty-data toast, claiming "no shortages" while the
      // endpoint is actually broken — misleads the operator into not raising
      // a PO they need.
      if (res.error) {
        const err: unknown = res.error;
        toast.error(
          err instanceof ApiError && err.message
            ? err.message
            : err instanceof Error
              ? err.message
              : "Auto-fill failed",
        );
        return;
      }
      const data = res.data;
      const isBundleScope =
        prefill.dlRefs != null && prefill.dlRefs.length > 0;
      if (!data || data.shortage.length === 0) {
        toast(
          isBundleScope
            ? "Selected orders are covered by current stock — no PO needed"
            : "No shortages — all awaiting orders covered by stock",
          { duration: 3000 },
        );
        return;
      }
      // Q3=A — override (replace), not append. Q2-extended — line.qty equals
      // the literal shortfall (need - available), as returned by the server.
      // 0073: derive modelId from sku.
      // 0074: cost auto-fills from product_skus.cost (Loo Q5=a 2026-05-09);
      //       SKUs without a configured cost flag red and block submit.
      // 0076 (Loo 2026-05-10): attrs now comes from the server response (the
      //       per-(sku, attrs) aggregation), so bedframe color/gap and sofa
      //       fabric pre-fill from the source order_lines.attrs instead of
      //       forcing the operator to re-pick. attrs is `Record<string,
      //       unknown> | null`; we cast through unknown because DraftLine's
      //       attrs is the same nullable record shape.
      setLines(
        data.shortage.map((s) => {
          const cs = lineCostFromSku(s.sku);
          return {
            modelId: modelIdForSku(s.sku, skuByCode),
            sku: s.sku,
            qty: s.shortage,
            cost: cs.cost,
            costSource: cs.costSource,
            attrs: s.attrs,
          };
        }),
      );
      const totalUnits = data.shortage.reduce((acc, s) => acc + s.need, 0);
      toast.success(
        isBundleScope
          ? `Pre-filled ${data.shortage.length} SKU${data.shortage.length === 1 ? "" : "s"} from ${prefill.dlRefs!.length} order${prefill.dlRefs!.length === 1 ? "" : "s"} (${totalUnits} unit${totalUnits === 1 ? "" : "s"})`
          : `Auto-filled ${data.shortage.length} SKU${data.shortage.length === 1 ? "" : "s"} from ${totalUnits} unit${totalUnits === 1 ? "" : "s"} pending`,
      );
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Auto-fill failed");
      else toast.error(e instanceof Error ? e.message : "Auto-fill failed");
    }
  }

  /**
   * T22 — Pre-populate the lines list from `logistics_stock_alerts`. Mirrors
   * `autoFillFromShortage` UX: refetch on click, replace `lines` on success
   * (Q3=A "override, not append"), surface a count toast, map 5xx onto an
   * explicit error toast rather than falling through to "no alerts found".
   *
   * Suggested qty per alert: `(high_threshold || low_threshold * 2) - effective`.
   * `high_threshold` isn't carried by the current alerts row (see comment on
   * `alertsQ` declaration), so we collapse to `low_threshold * 2 - effective`.
   * Defensive `Math.max(1, …)` keeps qty ≥1 even if a future row shape lands
   * with thresholds set such that the gap rounds non-positive.
   */
  async function suggestFromAlerts() {
    try {
      const res = await alertsQ.refetch();
      if (res.error) {
        const err: unknown = res.error;
        toast.error(
          err instanceof ApiError && err.message
            ? err.message
            : err instanceof Error
              ? err.message
              : "Suggest from alerts failed",
        );
        return;
      }
      const data = res.data;
      if (!data || data.alerts.length === 0) {
        toast(
          "No stock alerts — all configured SKUs are above threshold",
          { duration: 3000 },
        );
        return;
      }
      // Replace lines (override) — same convention as auto-fill from shortage.
      // T29: cost + costSource start null — operator picks via CogsLineEditor.
      //
      // T42-pass3-C3 — `logistics_stock_alerts()` returns one row per
      // (sku, warehouse_id), so the same SKU can appear multiple times when
      // it's below threshold across multiple warehouses. The submit path groups
      // lines by supplier into ONE PO and `purchase_order_lines` has a
      // (po_id, sku) PRIMARY KEY — duplicate skus would crash the insert with
      // 23505 unique_violation. Coalesce here BEFORE building lines: sum the
      // gap across warehouses so the suggested qty replenishes the system-wide
      // shortage, not just one warehouse's slice.
      const gapBySku = new Map<string, number>();
      for (const a of data.alerts) {
        const target = a.low_threshold * 2;
        const gap = Math.max(1, target - a.effective);
        gapBySku.set(a.sku, (gapBySku.get(a.sku) ?? 0) + gap);
      }
      // 0073: derive modelId per sku; attrs null until operator picks the
      // bedframe color/gap or sofa fabric inline (red-flagged pattern).
      // 0074: cost auto-fills from product_skus.cost.
      const nextLines = Array.from(gapBySku.entries()).map(([sku, qty]) => {
        const cs = lineCostFromSku(sku);
        return {
          modelId: modelIdForSku(sku, skuByCode),
          sku,
          qty,
          cost: cs.cost,
          costSource: cs.costSource,
          attrs: null,
        };
      });
      setLines(nextLines);
      const count = nextLines.length;
      toast.success(
        `Suggested ${count} SKU${count === 1 ? "" : "s"} from stock alerts`,
      );
    } catch (e: unknown) {
      if (e instanceof ApiError)
        toast.error(e.message || "Suggest from alerts failed");
      else toast.error(e instanceof Error ? e.message : "Suggest from alerts failed");
    }
  }

  function setLine(idx: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  // 0073 — switching the Model dropdown clears the variant + attrs + COGS
  // because none of those carry meaningfully across models. Same SKU swap
  // pattern as T42-C4 below, just lifted up one cascade step.
  function setLineModel(idx: number, modelId: string) {
    setLine(idx, {
      modelId,
      sku: "",
      attrs: null,
      cost: null,
      costSource: null,
    });
  }
  function addLine() {
    // Seed the first unused SKU so the cascade renders with sensible
    // defaults (operator can re-pick Model/Variant/etc. inline). attrs
    // starts null; cost auto-fills from product_skus.cost (0074).
    const used = new Set(lines.map((l) => l.sku));
    const next = (catalogQ.data?.skus ?? []).find((s) => !used.has(s.sku));
    const fallback = catalogQ.data?.skus?.[0];
    const seed = next ?? fallback;
    if (!seed) return;
    const cs = lineCostFromSku(seed.sku);
    setLines((ls) => [
      ...ls,
      {
        modelId: seed.modelId,
        sku: seed.sku,
        qty: 1,
        cost: cs.cost,
        costSource: cs.costSource,
        attrs: null,
      },
    ]);
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));
  }
  function setPartner(supplierId: string, partnerId: string) {
    setPartnerBySupplier((m) => ({ ...m, [supplierId]: partnerId }));
  }
  function partnerFor(sup: SupplierRow): string {
    return partnerBySupplier[sup.id] ?? partners[0]?.id ?? "";
  }
  function setWarehouseForSupplier(supplierId: string, warehouseId: string) {
    setWarehouseBySupplier((m) => ({ ...m, [supplierId]: warehouseId }));
  }
  function warehouseFor(sup: SupplierRow): string {
    // Prefer explicit pick; fall back to the prefilled hint (used by shortage
    // aggregation flows so users don't have to re-pick what was already known).
    return warehouseBySupplier[sup.id] ?? prefill.warehouseId ?? "";
  }

  // ---- Validation ----
  // T29: each line MUST carry cost (non-null, non-negative) AND costSource
  // before submit. The shared zod `createPoInput.lines[]` requires both;
  // we mirror it here so the user gets immediate per-row feedback via the
  // CogsLineEditor inline hint instead of a 422 round-trip.
  // 0073 — extend the line gate to refuse submit when bedframe lacks
  // color/gap or sofa lacks fabric_id. Mattress lines pass (no extras).
  // attrsMissingForLine returns true when the line is incomplete; the gate
  // accepts only `false` (i.e. no missing extras).
  const allLinesOk =
    lines.length > 0 &&
    lines.every(
      (l) =>
        l.sku &&
        l.qty > 0 &&
        l.cost != null &&
        l.cost >= 0 &&
        l.costSource != null &&
        !attrsMissingForLine(l, models, fabricsByModel),
    );
  const partnersOk = groups.groups.every(
    (g) => g.supplier.kind !== "factory_pickup" || !!partnerFor(g.supplier),
  );
  // Q4=A — every supplier group must have its own warehouse picked. No
  // global modal-level fallback. Empty-groups case (orphan SKUs only) is
  // handled by the orphans guard below.
  const warehousesOk = groups.groups.every((g) => !!warehouseFor(g.supplier));
  const isPending = create.isPending || createBatch.isPending;
  const valid =
    allLinesOk &&
    warehousesOk &&
    groups.orphans.length === 0 &&
    partnersOk &&
    !!eta &&
    !isPending;

  // 0076: dup detection keys on (sku, attrs canonical) so multi-variant
  // bedframe lines (same SKU, different colors) aren't falsely flagged.
  // True duplicates (same SKU + same attrs) still warn — those would crash
  // on the new (po_id, sku, coalesce(attrs::text,'')) unique index.
  const canonAttrs = (a: Record<string, unknown> | null | undefined): string => {
    if (a == null) return "";
    const keys = Object.keys(a).sort();
    const ordered: Record<string, unknown> = {};
    for (const k of keys) ordered[k] = a[k];
    return JSON.stringify(ordered);
  };
  const variantSet = new Set(lines.map((l) => `${l.sku} ${canonAttrs(l.attrs)}`));
  const dup = variantSet.size !== lines.length;
  const totalUnits = lines.reduce((s, l) => s + (l.qty || 0), 0);

  // 0076 (Loo 2026-05-10) — `issuanceGroups` is the post-split normalized list
  // of POs to be created. OFF (default): one entry per supplier (existing
  // bedframe behavior). ON: one entry per (supplier, sku, attrs) tuple — the
  // sofa workflow where HoOKkA needs separate POs per fabric.
  const issuanceGroups = useMemo(() => {
    if (!splitPerVariant) return groups.groups;
    const out: typeof groups.groups = [];
    for (const g of groups.groups) {
      const byVariant = new Map<string, typeof g.lines>();
      for (const l of g.lines) {
        const key = `${l.sku}${canonAttrs(l.attrs)}`;
        if (!byVariant.has(key)) byVariant.set(key, []);
        byVariant.get(key)!.push(l);
      }
      for (const lines of byVariant.values()) {
        out.push({ supplier: g.supplier, lines });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.groups, splitPerVariant]);

  const willSplit = issuanceGroups.length > 1;

  async function submit() {
    if (!valid) return;
    try {
      const n = issuanceGroups.length;
      // T29: emit cost + costSource per line. valid-form gate ensures both
      // are non-null at this point — `!` non-null assertion mirrors the
      // submit-time invariant (validation guard above blocks submit otherwise).
      // The API edge reshapes camelCase `costSource` → snake_case `cost_source`
      // before the RPC call.
      if (n === 1) {
        // Single PO → keep using the existing single-PO RPC.
        // This preserves the legacy contract (logistics_create_po) for the
        // common case and avoids touching tests that assert this path.
        // v3-S4.5: stockpile mode forces dl/dlRefs out of the payload —
        // backend RPC accepts NULL for both (= "this PO covers no specific
        // customer order"). Spread guards apply only when NOT stockpile.
        const g = issuanceGroups[0];
        // 0079 (Loo 2026-05-10) — pre-assign procurement-leg LP at creation.
        // Only factory_pickup suppliers need it; partnersOk gate ensures
        // the value is present when required, and own_logistics suppliers
        // pass undefined (RPC accepts null).
        const partnerId =
          g.supplier.kind === "factory_pickup"
            ? partnerFor(g.supplier) || undefined
            : undefined;
        await create.mutateAsync({
          supplierId: g.supplier.id,
          warehouseId: warehouseFor(g.supplier),
          ...(partnerId ? { procurementPartnerId: partnerId } : {}),
          lines: g.lines.map((l) => ({
            sku: l.sku,
            qty: l.qty,
            cost: l.cost!,
            costSource: l.costSource!,
            attrs: l.attrs ?? null,
          })),
          ...(!stockpile && prefill.dl ? { dl: prefill.dl } : {}),
          ...(!stockpile && prefill.dlRefs && prefill.dlRefs.length > 0
            ? { dlRefs: prefill.dlRefs }
            : {}),
          etaDate: eta,
        });
        toast.success(
          `PO issued · ${lines.length} line${lines.length === 1 ? "" : "s"} · ${totalUnits} units`,
        );
      } else {
        // 2+ POs → atomic batch RPC. Each entry carries its own warehouse
        // pick. dl_refs (if present) propagates onto every PO since a bundle
        // PO is always cross-order. dl (single) doesn't apply when splitting
        // — the batch RPC's helper is bundle-shaped only.
        // v3-S4.5: same stockpile carve-out as the single-PO branch.
        await createBatch.mutateAsync({
          pos: issuanceGroups.map((g) => {
            const partnerId =
              g.supplier.kind === "factory_pickup"
                ? partnerFor(g.supplier) || undefined
                : undefined;
            return {
              supplierId: g.supplier.id,
              warehouseId: warehouseFor(g.supplier),
              // 0079 (Loo 2026-05-10) — same per-group LP pre-assignment as
              // the single-PO branch above.
              ...(partnerId ? { procurementPartnerId: partnerId } : {}),
              lines: g.lines.map((l) => ({
                sku: l.sku,
                qty: l.qty,
                cost: l.cost!,
                costSource: l.costSource!,
                attrs: l.attrs ?? null,
              })),
              ...(!stockpile && prefill.dlRefs && prefill.dlRefs.length > 0
                ? { dlRefs: prefill.dlRefs }
                : {}),
              etaDate: eta,
            };
          }),
        });
        toast.success(`Issued ${n} POs`);
      }
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Issue PO failed");
      else toast.error(e instanceof Error ? e.message : "Issue PO failed");
    }
  }

  // v3-S4.5: stockpile mode overrides any order-ref title suffix because the
  // PO is no longer for that order. We still use Modal's static `title` prop
  // (so the test util's `getByText` lookups continue to work) and decorate
  // with a "Stockpile" pill below in the body.
  const titleSuffix = stockpile
    ? ""
    : prefill.dl
      ? ` · for order #${prefill.dl}`
      : prefill.dlRefs && prefill.dlRefs.length > 0
        ? ` · bundle of ${prefill.dlRefs.length} orders`
        : "";
  const baseTitle = stockpile
    ? "New stockpile PO"
    : prefill.dl || prefill.dlRefs?.length
      ? `New PO${titleSuffix}`
      : "New purchase order";

  return (
    <Modal title={baseTitle} onClose={onClose} size="lg">
      {/* v3-S4.5 — Stockpile PO toggle. Disabled when caller pre-pinned an
          order ref (single dl or bundle dlRefs); the prefill there dictates
          the lines and dropping it would lose the link. */}
      <div className="mb-3 flex items-center gap-2 text-[12px] font-body">
        <input
          id="stockpile-po-toggle"
          data-testid="stockpile-po-toggle"
          type="checkbox"
          checked={stockpile}
          disabled={autoFillPrefilled}
          onChange={(e) => setStockpile(e.target.checked)}
          className="h-3.5 w-3.5"
          title={
            autoFillPrefilled
              ? "Disabled — modal opened with an order/bundle prefill"
              : undefined
          }
        />
        <label
          htmlFor="stockpile-po-toggle"
          className="select-none"
          style={{ opacity: autoFillPrefilled ? 0.55 : 1 }}
        >
          <strong>Stockpile PO</strong>
          <span className="text-base-600"> (no order ref — pre-stock inventory)</span>
        </label>
        {stockpile && (
          <span
            data-testid="stockpile-mode-badge"
            className="px-2 py-0.5 rounded-full font-bold whitespace-nowrap"
            style={{
              fontSize: "9.5px",
              background: "rgba(58,89,131,.12)",
              color: "rgb(58,89,131)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Stockpile
          </span>
        )}
      </div>

      {/* 0076 (Loo 2026-05-10) — Split per variant. Sofa workflow needs one PO
          per fabric (HoOKkA's production constraint); bedframe stays combined.
          Operator chooses at submit time — no auto-detection. */}
      <div className="mb-3 flex items-center gap-2 text-[12px] font-body">
        <input
          id="split-per-variant-toggle"
          data-testid="split-per-variant-toggle"
          type="checkbox"
          checked={splitPerVariant}
          onChange={(e) => setSplitPerVariant(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        <label htmlFor="split-per-variant-toggle" className="select-none">
          <strong>Split per variant</strong>
          <span className="text-base-600">
            {" "}(one PO per (sku + color/gap/fabric) — use for sofa)
          </span>
        </label>
      </div>

      <div className="text-[12px] text-base-600 mb-3 font-body">
        {stockpile ? (
          <>
            <strong>Stockpile mode:</strong> this PO is for inventory
            replenishment only — it won&rsquo;t be linked to any specific
            customer order.
          </>
        ) : prefill.dl ? (
          <>
            Auto-routed from order <strong>#{prefill.dl}</strong>. SKUs are
            matched to suppliers automatically.
          </>
        ) : prefill.dlRefs && prefill.dlRefs.length > 0 ? (
          <>
            Bundling shortages from{" "}
            <strong>{prefill.dlRefs.length} orders</strong>. SKUs matched to
            suppliers automatically.
          </>
        ) : (
          "Pick the SKUs you need — supplier is auto-detected per item. If multiple suppliers are involved, the PO will split automatically."
        )}
      </div>

      {/* 2026-05-16 (Loo) — per-order detail card for bundle prefill. Shows each
          selected SO with its customer delivery date so the operator can see
          WHY this bundle exists. Data lands from `shortageQ.data.orders` after
          the auto-fill fetch resolves; falls back to the flat dl list when the
          fetch is still pending. */}
      {prefill.dlRefs && prefill.dlRefs.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-[4px] border border-base-200 bg-base-50 font-body">
          <div className="text-[11px] uppercase tracking-wide text-base-500 mb-1.5">
            Source orders ({prefill.dlRefs.length})
          </div>
          {shortageQ.data?.orders && shortageQ.data.orders.length > 0 ? (
            <ul className="space-y-0.5 text-[12px] text-base-700">
              {shortageQ.data.orders.map((o) => (
                <li key={o.dl} className="flex items-center gap-2">
                  <span className="font-mono font-semibold">#{o.dl}</span>
                  <span className="text-base-400">·</span>
                  <span>
                    {o.deliveryDate ? (
                      <>Deliver <span className="font-mono">{o.deliveryDate}</span></>
                    ) : (
                      <span className="text-base-400 italic">Delivery date TBD</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[12px] text-base-500 font-mono">
              {prefill.dlRefs.map((d) => `#${d}`).join(", ")}
            </div>
          )}
        </div>
      )}

      {prefill.note && (
        <div
          className="text-[11px] px-2.5 py-2 rounded-[4px] mb-3 font-body text-base-700"
          style={{
            background: "var(--signature-50, #fef3eb)",
            border: "1px solid var(--brand-signature)",
          }}
        >
          {prefill.note}
        </div>
      )}

      {/* C5.3 — Auto-fill from awaiting stock. Hidden when a specific order
          or bundle prefill is set (lines already known). Override behavior:
          on success the modal's `lines` state is fully replaced.

          T22 — "Suggest from alerts" lives in the same prefill-guarded row.
          Both buttons replace `lines` on success. */}
      {(showAutoFill || showSuggestAlerts) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {showAutoFill && (
            <button
              type="button"
              onClick={autoFillFromShortage}
              disabled={autoFillDisabled}
              data-testid="auto-fill-shortage-button"
              className="btn-ghost text-[12px] py-1.5 px-3"
              style={{ opacity: autoFillDisabled ? 0.45 : 1 }}
            >
              {shortageQ.isFetching
                ? "Loading awaiting stock..."
                : lastShortageEmpty
                  ? "⚡ No shortages found"
                  : "⚡ Auto-fill from awaiting stock"}
            </button>
          )}
          {showSuggestAlerts && (
            <button
              type="button"
              onClick={suggestFromAlerts}
              disabled={suggestAlertsDisabled}
              data-testid="suggest-from-alerts-button"
              className="btn-ghost text-[12px] py-1.5 px-3"
              style={{ opacity: suggestAlertsDisabled ? 0.45 : 1 }}
            >
              {alertsQ.isFetching
                ? "Loading alerts..."
                : lastAlertsEmpty
                  ? "⚡ No stock alerts"
                  : "⚡ Suggest from alerts"}
            </button>
          )}
        </div>
      )}

      {/* Lines table */}
      <div className="card p-0 mb-3.5" data-testid="po-lines-table">
        <div
          className="grid items-center gap-2 px-3.5 py-2.5 bg-base-50 border-b border-base-100"
          style={{ gridTemplateColumns: "1fr 130px 90px 32px" }}
        >
          <div className="label">SKU</div>
          <div className="label">Auto supplier</div>
          <div className="label text-right">Qty</div>
          <div></div>
        </div>
        {lines.map((l, i) => {
          const sup = findSupplierForSku(l.sku, suppliers, skuByCode, models);
          // 0073 cascade picker (Loo 2026-05-09). Per-line we read the model
          // record + its variant/fabric lookups to render category-aware
          // sub-row dropdowns. modelId="" means the operator hasn't picked a
          // model yet → only the top row + a hint render. Once model is
          // chosen, a sub-row appears with Variant + (color/gap | fabric).
          const model = l.modelId ? modelById(l.modelId, models) : null;
          const variants = l.modelId ? (skusByModel.get(l.modelId) ?? []) : [];
          const fabrics = l.modelId ? (fabricsByModel.get(l.modelId) ?? []) : [];
          const attrsObj = (l.attrs ?? {}) as {
            color?: string;
            gap?: string;
            fabric_id?: string;
          };
          const attrsMissing = attrsMissingForLine(l, models, fabricsByModel);
          const subGrid =
            model?.category === "bedframe"
              ? "1fr 1fr 1fr"
              : model?.category === "sofa"
                ? "1fr 1fr"
                : "1fr";
          return (
            <div
              key={i}
              className="px-3.5 py-2 border-t border-base-100 flex flex-col gap-1.5"
              data-testid={`po-line-row-${i}`}
            >
              <div
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: "1fr 130px 90px 32px" }}
              >
                {/* 0073 — Model dropdown (replaces single-SKU select). Grouped
                    by category so the operator scans by furniture type first.
                    Switching model resets variant + attrs + cost (see
                    setLineModel) since none of those carry across models. */}
                <select
                  value={l.modelId}
                  onChange={(e) => setLineModel(i, e.target.value)}
                  aria-label={`Line ${i + 1} model`}
                  className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] bg-white outline-none focus:border-base-500"
                >
                  <option value="">— pick model —</option>
                  <optgroup label="Mattress">
                    {models
                      .filter((m) => m.category === "mattress")
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Bedframe">
                    {models
                      .filter((m) => m.category === "bedframe")
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Sofa">
                    {models
                      .filter((m) => m.category === "sofa")
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
                <div
                  className="text-[11px] leading-[1.3] font-medium"
                  style={{
                    color: sup ? "var(--base-700)" : "var(--brand-signature)",
                  }}
                >
                  {sup ? (
                    <>
                      <div>{sup.name}</div>
                      <div
                        className="mt-0.5"
                        style={{
                          fontSize: "9.5px",
                          color: "var(--base-500)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {sup.kind === "factory_pickup"
                          ? "Factory pickup"
                          : "Own logistics"}
                      </div>
                    </>
                  ) : (
                    <span className="text-[10.5px]">
                      {l.modelId
                        ? "pick variant first"
                        : "pick a model"}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  value={l.qty}
                  onChange={(e) =>
                    setLine(i, {
                      qty: Math.max(1, parseInt(e.target.value, 10) || 0),
                    })
                  }
                  aria-label={`Line ${i + 1} qty`}
                  className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] text-right bg-white outline-none focus:border-base-500"
                />
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${i + 1}`}
                  className="btn-ghost text-[14px]"
                  style={{ opacity: lines.length === 1 ? 0.3 : 1 }}
                >
                  ×
                </button>
              </div>
              {/* 0073 — Cascade sub-row, only when a model is picked. Mattress
                  shows Variant only. Bedframe adds Color + Gap (from
                  model.colors/gaps arrays). Sofa adds Fabric (from
                  sofa_fabrics joined by model_id). Each select carries its
                  own aria-label so the existing tests + screen-readers can
                  address them by `Line N <field>` (parallel to the legacy SKU
                  label). */}
              {model && (
                <div
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: subGrid }}
                >
                  <select
                    value={l.sku}
                    onChange={(e) => {
                      // 0074 — switching variant pulls cost+source from
                      // product_skus.cost (Q5=a 2026-05-09). attrs persist
                      // (same model = same color/gap menu).
                      const cs = lineCostFromSku(e.target.value);
                      setLine(i, {
                        sku: e.target.value,
                        cost: cs.cost,
                        costSource: cs.costSource,
                      });
                    }}
                    aria-label={`Line ${i + 1} variant`}
                    className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] bg-white outline-none focus:border-base-500"
                  >
                    <option value="">
                      — pick {model.category === "sofa" ? "component" : "size"} —
                    </option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.sku}>
                        {v.variant}
                      </option>
                    ))}
                  </select>
                  {model.category === "bedframe" && (
                    <>
                      <select
                        value={attrsObj.color ?? ""}
                        onChange={(e) =>
                          setLine(i, {
                            attrs: {
                              ...(l.attrs ?? {}),
                              color: e.target.value,
                            },
                          })
                        }
                        aria-label={`Line ${i + 1} color`}
                        className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] bg-white outline-none focus:border-base-500"
                      >
                        <option value="">— color —</option>
                        {(model.colors ?? []).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={attrsObj.gap ?? ""}
                        onChange={(e) =>
                          setLine(i, {
                            attrs: {
                              ...(l.attrs ?? {}),
                              gap: e.target.value,
                            },
                          })
                        }
                        aria-label={`Line ${i + 1} gap`}
                        className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] bg-white outline-none focus:border-base-500"
                      >
                        <option value="">— gap —</option>
                        {(model.gaps ?? []).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {model.category === "sofa" && fabrics.length > 0 && (
                    <select
                      value={attrsObj.fabric_id ?? ""}
                      onChange={(e) => {
                        const f = fabrics.find(
                          (x) => x.id === e.target.value,
                        );
                        setLine(i, {
                          attrs: f
                            ? {
                                fabric_id: f.id,
                                fabric_name: f.fabricName,
                                fabric_surcharge: f.surcharge,
                              }
                            : null,
                        });
                      }}
                      aria-label={`Line ${i + 1} fabric`}
                      className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] bg-white outline-none focus:border-base-500"
                    >
                      <option value="">— fabric —</option>
                      {fabrics.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.fabricName}
                          {f.surcharge > 0 ? ` (+RM ${f.surcharge})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {/* 0073 red-flag (Q2=A): bedframe lines without color/gap and
                  sofa lines without fabric block submit. Inline warning gives
                  the operator a one-glance "this row is incomplete" cue. */}
              {model && attrsMissing && (
                <div
                  className="text-[10.5px] font-body"
                  style={{ color: "var(--brand-signature)" }}
                  data-testid={`po-line-attrs-missing-${i}`}
                >
                  ⚠{" "}
                  {model.category === "bedframe"
                    ? "Pick color + gap so the supplier knows which version to make."
                    : "Pick fabric so the supplier knows which version to upholster."}
                </div>
              )}
              {/* 0074 — Cost is fixed in catalog (Loo Q5=a 2026-05-09). The
                  hand-entry CogsLineEditor is gone; we show the catalog cost
                  read-only and flag SKUs whose cost hasn't been set yet. */}
              {l.sku && (
                <div
                  className="text-[10.5px] font-body flex items-center gap-2"
                  data-testid={`po-line-cost-${i}`}
                >
                  {l.cost != null ? (
                    <>
                      <span className="text-base-500">Cost</span>
                      <span className="font-mono text-base-900">
                        RM {l.cost.toLocaleString()}
                      </span>
                      <span
                        className="text-base-500"
                        style={{
                          fontSize: "9.5px",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        · catalog
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--brand-signature)" }}>
                      ⚠ No cost on this SKU yet — set it in Catalog before
                      issuing the PO.
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="flex justify-between items-center px-3.5 py-2 bg-base-50 border-t border-base-100">
          <button
            type="button"
            onClick={addLine}
            className="btn-ghost text-[11px] py-0.5 px-2"
          >
            + Add SKU
          </button>
          <div className="font-mono text-[11px] font-semibold">
            Σ {totalUnits} unit{totalUnits === 1 ? "" : "s"} · {lines.length}{" "}
            line{lines.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {dup && (
        <div className="text-[11px] text-warning mb-2.5 font-body">
          Duplicate SKUs — they&rsquo;ll be sent to the supplier as separate
          lines.
        </div>
      )}

      {willSplit && (
        <div
          className="text-[11.5px] px-3 py-2.5 rounded-[4px] mb-3 leading-[1.5] font-body"
          style={{
            background: "rgba(58,89,131,.06)",
            border: "1px solid rgba(58,89,131,.25)",
          }}
        >
          <strong>{splitPerVariant ? "Per-variant split:" : "Auto-split:"}</strong>{" "}
          this will be issued as{" "}
          <strong>{issuanceGroups.length} separate POs</strong> —{" "}
          {splitPerVariant ? "one per (sku + attrs)" : "one per supplier"}.{" "}
          {!splitPerVariant &&
            groups.groups
              .map(
                (g) =>
                  `${g.supplier.name} (${g.lines.length} line${g.lines.length === 1 ? "" : "s"})`,
              )
              .join(" · ")}
        </div>
      )}

      {/* Per-supplier groups — each picks its own destination warehouse (C5.2). */}
      <div className="flex flex-col gap-2.5 mb-3.5">
        {groups.groups.map((g) => {
          const needsPartner = g.supplier.kind === "factory_pickup";
          const groupUnits = g.lines.reduce((s, l) => s + (l.qty || 0), 0);
          const supWarehouseId = warehouseFor(g.supplier);
          return (
            <div
              key={g.supplier.id}
              data-testid={`po-supplier-group-${g.supplier.id}`}
              className="rounded-[4px] p-3"
              style={{
                background: needsPartner
                  ? "rgba(214,79,32,.04)"
                  : "rgba(50,120,80,.04)",
                border: needsPartner
                  ? "1px dashed rgba(214,79,32,.35)"
                  : "1px solid rgba(50,120,80,.25)",
              }}
            >
              <div className="flex justify-between items-start gap-3 mb-2.5">
                <div>
                  <div className="font-ui text-[13px] font-semibold">
                    {g.supplier.name}
                  </div>
                  <div className="text-[10.5px] text-base-600 mt-0.5 font-body">
                    {g.lines.length} line{g.lines.length === 1 ? "" : "s"} ·{" "}
                    {groupUnits} unit{groupUnits === 1 ? "" : "s"} ·{" "}
                    {needsPartner
                      ? "Carres partner picks up from factory"
                      : "Supplier delivers themselves"}
                  </div>
                </div>
                <div
                  className="px-2 py-0.5 rounded-full font-bold whitespace-nowrap"
                  style={{
                    fontSize: "9.5px",
                    background: needsPartner
                      ? "rgba(214,79,32,.12)"
                      : "rgba(50,120,80,.12)",
                    color: needsPartner
                      ? "var(--brand-signature)"
                      : "var(--success)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {needsPartner ? "Needs partner" : "No partner needed"}
                </div>
              </div>
              <div
                className={`grid gap-3 ${needsPartner ? "grid-cols-2" : "grid-cols-1"}`}
              >
                <div>
                  <div className="label mb-1.5">Warehouse *</div>
                  <select
                    value={supWarehouseId}
                    onChange={(e) =>
                      setWarehouseForSupplier(g.supplier.id, e.target.value)
                    }
                    aria-label={`Warehouse for ${g.supplier.name}`}
                    data-testid={`po-warehouse-${g.supplier.id}`}
                    className={INPUT_CLS}
                  >
                    <option value="">— pick a warehouse —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                {needsPartner && (
                  <div>
                    <div className="label mb-1.5">Logistics partner *</div>
                    <select
                      value={partnerFor(g.supplier)}
                      onChange={(e) =>
                        setPartner(g.supplier.id, e.target.value)
                      }
                      aria-label={`Logistics partner for ${g.supplier.name}`}
                      className={INPUT_CLS}
                    >
                      {partners.length === 0 && (
                        <option value="">— no partners configured —</option>
                      )}
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.zones ? ` · ${p.zones}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ETA — global. Warehouse moved into each supplier group above (C5.2).
          Required since 0083 (Loo 2026-05-10). */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="label mb-1.5">
            Expected delivery <span className="text-primary">*</span>
          </div>
          <input
            type="date"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            aria-label="Expected delivery date"
            aria-required="true"
            required
            className={INPUT_CLS}
          />
          {!eta && (
            <div className="text-[11px] text-base-600 mt-1 font-body">
              Pick an ETA — supplier + Finance AP both rely on it.
            </div>
          )}
        </div>
      </div>

      {!warehousesOk && groups.groups.length > 0 && (
        <div className="text-[11px] text-base-600 mb-2 font-body">
          Pick a warehouse for each PO.
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={
          willSplit
            ? `Issue ${groups.groups.length} POs · ${lines.length} line${lines.length === 1 ? "" : "s"}`
            : `Issue PO · ${lines.length} line${lines.length === 1 ? "" : "s"}`
        }
        primaryDisabled={!valid}
        primaryPending={isPending}
      />
    </Modal>
  );
}
