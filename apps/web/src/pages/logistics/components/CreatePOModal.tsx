import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { CostSource } from "@carres/shared";
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
import CogsLineEditor from "./CogsLineEditor";
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
  /** Pre-filled line items (sku + qty); comes from order shortage aggregation. */
  lines?: { sku: string; qty: number }[];
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
  sku: string;
  qty: number;
  // T29 — per-line COGS fields. Driven by `<CogsLineEditor>` (T28). Both
  // start as null on a fresh row and must be non-null at submit time
  // (validated below). Mirrors `createPoInput.lines[]` zod shape; the API
  // edge transforms `costSource` → `cost_source` before the RPC call.
  cost: number | null;
  costSource: CostSource | null;
}

// Convention: SKUs are formatted `category:model:variant`. The first segment
// is the category which `suppliers.cat_covered[]` is keyed by.
function categoryForSku(sku: string): string {
  return (sku || "").split(":")[0] || "";
}

function findSupplierForSku(
  sku: string,
  suppliers: SupplierRow[],
): SupplierRow | null {
  const cat = categoryForSku(sku);
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
  const shortageQ = useAwaitingStockShortage();

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

  const suppliers = suppliersQ.data?.suppliers ?? [];
  const warehouses = warehousesQ.data?.warehouses ?? [];
  const skuOptions = useMemo(() => {
    const skus = catalogQ.data?.skus ?? [];
    return skus.map((s) => ({ sku: s.sku, name: s.variant }));
  }, [catalogQ.data]);
  const partners = partnersQ.data?.partners ?? [];

  // ---- Lines ----
  // T29: every line carries `cost` + `costSource` driven by CogsLineEditor.
  // Both start null — the user fills them via the editor before submit (the
  // valid-form gate enforces non-null per line). Auto-fill / suggest paths
  // also leave them null so the operator picks the cost source explicitly per
  // line.
  const initialLines: DraftLine[] = useMemo(() => {
    if (prefill.lines && prefill.lines.length > 0) {
      return prefill.lines.map((l) => ({
        sku: l.sku,
        qty: l.qty,
        cost: null,
        costSource: null,
      }));
    }
    return [];
  }, [prefill.lines]);
  const [lines, setLines] = useState<DraftLine[]>(initialLines);

  // Default the first line to the first SKU once the catalog loads (only when
  // we started with zero prefill lines). This mirrors proto's `[{ sku: stock[0],
  // qty: 5 }]` default.
  useEffect(() => {
    if (lines.length === 0 && skuOptions.length > 0 && initialLines.length === 0) {
      setLines([{ sku: skuOptions[0].sku, qty: 5, cost: null, costSource: null }]);
    }
  }, [lines.length, skuOptions, initialLines.length]);

  // C5.2 — per-supplier-group warehouse (Q4=A: blank required, no auto-default).
  // `prefill.warehouseId` (when supplied) seeds every group on first paint, so
  // shortage-aggregation flows that already know the destination still pre-fill.
  const [warehouseBySupplier, setWarehouseBySupplier] = useState<
    Record<string, string>
  >({});

  // ETA + per-supplier partner are visual elements present in proto but the
  // current `createPoInput` zod schema (packages/shared/src/schemas/logistics.ts:84)
  // does NOT yet accept them. Per CLAUDE.md §7 schema discipline we don't extend
  // the schema without explicit Loo approval — instead we capture the values for
  // UI fidelity (proto §18.4 NewPODialog) but they aren't sent on submit. The
  // RPC defaults sup_status to 'pending' and assignment happens later via
  // useAssignPickupPartnerMutation. Tracking this carry-forward as
  // `phase-4-create-po-eta-partner` for follow-up if Loo wants the proto's
  // pre-assignment behavior wired through the schema.
  const [eta, setEta] = useState<string>("");
  const [partnerBySupplier, setPartnerBySupplier] = useState<
    Record<string, string>
  >({});

  // ---- Group lines by their auto-detected supplier ----
  const groups = useMemo(() => {
    const g = new Map<string, { supplier: SupplierRow; lines: DraftLine[] }>();
    const orphans: DraftLine[] = [];
    for (const l of lines) {
      const sup = findSupplierForSku(l.sku, suppliers);
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
      if (!data || data.shortage.length === 0) {
        toast(
          "No shortages — all awaiting orders covered by stock",
          { duration: 3000 },
        );
        return;
      }
      // Q3=A — override (replace), not append. Q2-extended — line.qty equals
      // the literal shortfall (need - available), as returned by the server.
      // T29: cost + costSource start null — operator picks via CogsLineEditor.
      setLines(
        data.shortage.map((s) => ({
          sku: s.sku,
          qty: s.shortage,
          cost: null,
          costSource: null,
        })),
      );
      const totalUnits = data.shortage.reduce((acc, s) => acc + s.need, 0);
      toast.success(
        `Auto-filled ${data.shortage.length} SKU${data.shortage.length === 1 ? "" : "s"} from ${totalUnits} unit${totalUnits === 1 ? "" : "s"} pending`,
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
      const nextLines = data.alerts.map((a) => {
        const target = a.low_threshold * 2;
        const gap = target - a.effective;
        return {
          sku: a.sku,
          qty: Math.max(1, gap),
          cost: null,
          costSource: null,
        };
      });
      setLines(nextLines);
      const count = data.alerts.length;
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
  function addLine() {
    const used = new Set(lines.map((l) => l.sku));
    const next = skuOptions.find((s) => !used.has(s.sku));
    const fallback = skuOptions[0];
    const sku = next?.sku ?? fallback?.sku ?? "";
    if (!sku) return;
    // T29: cost + costSource start null — populated via CogsLineEditor below.
    setLines((ls) => [...ls, { sku, qty: 1, cost: null, costSource: null }]);
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
  const allLinesOk =
    lines.length > 0 &&
    lines.every(
      (l) =>
        l.sku &&
        l.qty > 0 &&
        l.cost != null &&
        l.cost >= 0 &&
        l.costSource != null,
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
    !isPending;

  const skuSet = new Set(lines.map((l) => l.sku));
  const dup = skuSet.size !== lines.length;
  const totalUnits = lines.reduce((s, l) => s + (l.qty || 0), 0);
  const willSplit = groups.groups.length > 1;

  async function submit() {
    if (!valid) return;
    try {
      const n = groups.groups.length;
      // T29: emit cost + costSource per line. valid-form gate ensures both
      // are non-null at this point — `!` non-null assertion mirrors the
      // submit-time invariant (validation guard above blocks submit otherwise).
      // The API edge reshapes camelCase `costSource` → snake_case `cost_source`
      // before the RPC call.
      if (n === 1) {
        // Single supplier group → keep using the existing single-PO RPC.
        // This preserves the legacy contract (logistics_create_po) for the
        // common case and avoids touching tests that assert this path.
        // v3-S4.5: stockpile mode forces dl/dlRefs out of the payload —
        // backend RPC accepts NULL for both (= "this PO covers no specific
        // customer order"). Spread guards apply only when NOT stockpile.
        const g = groups.groups[0];
        await create.mutateAsync({
          supplierId: g.supplier.id,
          warehouseId: warehouseFor(g.supplier),
          lines: g.lines.map((l) => ({
            sku: l.sku,
            qty: l.qty,
            cost: l.cost!,
            costSource: l.costSource!,
          })),
          ...(!stockpile && prefill.dl ? { dl: prefill.dl } : {}),
          ...(!stockpile && prefill.dlRefs && prefill.dlRefs.length > 0
            ? { dlRefs: prefill.dlRefs }
            : {}),
        });
        toast.success(
          `PO issued · ${lines.length} line${lines.length === 1 ? "" : "s"} · ${totalUnits} units`,
        );
      } else {
        // 2+ supplier groups → atomic batch RPC. Each entry carries its own
        // warehouse pick. dl_refs (if present) propagates onto every PO since
        // a bundle PO is always cross-order. dl (single) doesn't apply when
        // splitting — the batch RPC's helper is bundle-shaped only.
        // v3-S4.5: same stockpile carve-out as the single-supplier branch.
        await createBatch.mutateAsync({
          pos: groups.groups.map((g) => ({
            supplierId: g.supplier.id,
            warehouseId: warehouseFor(g.supplier),
            lines: g.lines.map((l) => ({
              sku: l.sku,
              qty: l.qty,
              cost: l.cost!,
              costSource: l.costSource!,
            })),
            ...(!stockpile && prefill.dlRefs && prefill.dlRefs.length > 0
              ? { dlRefs: prefill.dlRefs }
              : {}),
          })),
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
            <strong>{prefill.dlRefs.length} orders</strong> (
            {prefill.dlRefs.map((d) => `#${d}`).join(", ")}). SKUs matched to
            suppliers automatically.
          </>
        ) : (
          "Pick the SKUs you need — supplier is auto-detected per item. If multiple suppliers are involved, the PO will split automatically."
        )}
      </div>

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
          const sup = findSupplierForSku(l.sku, suppliers);
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
                <select
                  value={l.sku}
                  onChange={(e) => setLine(i, { sku: e.target.value })}
                  aria-label={`Line ${i + 1} SKU`}
                  className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] bg-white outline-none focus:border-base-500"
                >
                  {skuOptions.map((s) => (
                    <option key={s.sku} value={s.sku}>
                      {s.name}
                    </option>
                  ))}
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
                      no supplier covers {categoryForSku(l.sku)}
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
              {/* T29 — per-line COGS editor (cost + cost_source). Sub-row
                  spans the full width below the SKU/qty grid; renders as a
                  2-cell layout (cost input + dropdown). The shared zod
                  schema `createPoInput.lines[]` requires both fields, and the
                  modal's submit gate (`allLinesOk`) blocks submit until every
                  line has both. */}
              <div className="pl-0">
                <CogsLineEditor
                  sku={l.sku}
                  cost={l.cost}
                  costSource={l.costSource}
                  onChange={(cost, costSource) =>
                    setLine(i, { cost, costSource })
                  }
                  disabled={isPending}
                />
              </div>
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
          <strong>Auto-split:</strong> this PO will be issued as{" "}
          <strong>{groups.groups.length} separate POs</strong> — one per
          supplier.{" "}
          {groups.groups
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

      {/* ETA — global. Warehouse moved into each supplier group above (C5.2). */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="label mb-1.5">Expected delivery</div>
          <input
            type="date"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            aria-label="Expected delivery date"
            className={INPUT_CLS}
          />
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
