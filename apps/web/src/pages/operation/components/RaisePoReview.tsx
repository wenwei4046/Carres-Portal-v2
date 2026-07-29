// design-standard: not-a-list-page — modal review overlay (supplier cards),
// launched from the Orders bulk bar; the page shell stays underneath.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, PackagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { orderActionQueue, PURCHASING_CATEGORIES, purchasingUrgentWindowDays } from "@carres/shared";
import { apiFetch, type ApiError } from "@/lib/api";
import {
  useCatalog,
  useDeliveryPartners,
  useOperationSuppliers,
  useOperationWarehouse,
  usePurchasingSettings,
  type SupplierRow,
} from "@/lib/queries";
import {
  buildRaisePoPlan,
  type RaisePoLine,
  type RaisePoOrder,
  type RaisePoSkuMeta,
} from "./raise-po-plan";

/**
 * Consolidated Raise-PO review (Jess Option A, locked 2026-07-18 night):
 * ONE card per supplier — rows = SKU totals + SO chips, per-card Skip / Send.
 * Entry: bulk-bar Raise PO over the selection, or the PO-day banner over the
 * whole waiting set. Send posts ONE PO per card through the normal
 * POST /api/operation/pos (the server's duty gate is the second layer).
 */

const CARD_LEAD_DAYS: Record<string, number> = { sofa: 5, mattress: 7, bedframe: 7 };

function addDaysIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type CardStatus = "idle" | "sending" | "sent" | "skipped";
interface CardState {
  warehouseId: string;
  etaDate: string;
  partnerId: string;
  status: CardStatus;
}

export default function RaisePoReview({
  orders,
  availableBySku,
  onClose,
}: {
  orders: RaisePoOrder[];
  availableBySku: Map<string, number> | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const suppliersQ = useOperationSuppliers();
  const warehousesQ = useOperationWarehouse();
  const partnersQ = useDeliveryPartners();
  const catalogQ = useCatalog();

  const suppliers = useMemo(() => suppliersQ.data?.suppliers ?? [], [suppliersQ.data]);
  const supplierById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );
  const warehouses = warehousesQ.data?.warehouses ?? [];
  const partners = partnersQ.data?.partners ?? [];

  // Catalog SKU meta — supplier + category + cost for catalog-matched lines
  // (POS-born orders). AutoCount free-text SKUs simply miss here and resolve
  // via category / the operator's pick instead.
  const skuMeta = useMemo(() => {
    const modelCat = new Map(
      (catalogQ.data?.models ?? []).map((m) => [m.id, m.category as string]),
    );
    const m = new Map<string, RaisePoSkuMeta>();
    for (const s of catalogQ.data?.skus ?? []) {
      m.set(s.sku, {
        supplierId: s.supplierId ?? null,
        category: modelCat.get(s.modelId) ?? null,
        cost: s.cost ?? null,
      });
    }
    return m;
  }, [catalogQ.data]);

  // The operator's supplier picks for unresolved SKUs (sku → supplierId).
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  // P1 — the urgent window per category comes from the production working
  // days a human set (Purchasing → Settings), never from a constant.
  const purchasingSettingsQ = usePurchasingSettings();
  const urgentWindowByCategory = useMemo(() => {
    const s = purchasingSettingsQ.data;
    if (!s) return {};
    return Object.fromEntries(
      PURCHASING_CATEGORIES.map((c) => [c, purchasingUrgentWindowDays(s, [c])]),
    );
  }, [purchasingSettingsQ.data]);
  const plan = useMemo(
    () =>
      buildRaisePoPlan(
        orders,
        availableBySku,
        skuMeta,
        suppliers,
        overrides,
        new Date(),
        urgentWindowByCategory,
      ),
    [orders, availableBySku, skuMeta, suppliers, overrides, urgentWindowByCategory],
  );

  // Default warehouse: the single one, else the Klang HQ.
  const defaultWarehouse = useMemo(() => {
    if (warehouses.length === 1) return warehouses[0].id;
    return warehouses.find((w) => w.name.toLowerCase().includes("klang"))?.id ?? "";
  }, [warehouses]);

  const [cardStates, setCardStates] = useState<Map<string, CardState>>(new Map());
  const [costEdits, setCostEdits] = useState<Map<string, number>>(new Map());

  function stateOf(supplierId: string, lines: RaisePoLine[]): CardState {
    const cur = cardStates.get(supplierId);
    if (cur) return cur;
    const lead = Math.min(
      ...lines.map((l) => CARD_LEAD_DAYS[l.category] ?? 7),
    );
    return {
      warehouseId: defaultWarehouse,
      etaDate: addDaysIso(Number.isFinite(lead) ? lead : 7),
      partnerId: "",
      status: "idle",
    };
  }
  function patchState(supplierId: string, lines: RaisePoLine[], patch: Partial<CardState>) {
    setCardStates((prev) => {
      const n = new Map(prev);
      n.set(supplierId, { ...stateOf(supplierId, lines), ...patch });
      return n;
    });
  }

  const lineKey = (l: RaisePoLine) => `${l.sku}|${JSON.stringify(l.attrs ?? {})}`;
  const costOf = (l: RaisePoLine): number | null =>
    costEdits.get(lineKey(l)) ?? l.cost;

  async function sendCard(supplier: SupplierRow, lines: RaisePoLine[]) {
    const st = stateOf(supplier.id, lines);
    patchState(supplier.id, lines, { status: "sending" });
    try {
      await apiFetch(`/api/operation/pos`, {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplier.id,
          warehouseId: st.warehouseId,
          ...(supplier.kind === "factory_pickup" && st.partnerId
            ? { procurementPartnerId: st.partnerId }
            : {}),
          lines: lines.map((l) => ({
            sku: l.sku,
            qty: l.qty,
            cost: costOf(l) ?? 0,
            costSource:
              l.fromCatalog && !costEdits.has(lineKey(l)) ? "catalog" : "hand_entered",
            attrs: l.attrs,
          })),
          soRefs: [...new Set(lines.flatMap((l) => l.sos))].sort((a, b) => a - b),
          etaDate: st.etaDate,
        }),
      });
      patchState(supplier.id, lines, { status: "sent" });
      toast.success(`PO sent — ${supplier.name}`);
      void qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      void qc.invalidateQueries({ queryKey: ["operation", "orders"] });
    } catch (e) {
      patchState(supplier.id, lines, { status: "idle" });
      toast.error(`PO failed — ${(e as ApiError).message}`);
    }
  }

  const totalUnits = plan.cards.reduce(
    (s, c) => s + c.lines.reduce((t, l) => t + l.qty, 0),
    0,
  );
  const openCards = plan.cards.filter(
    (c) => stateOf(c.supplierId, c.lines).status !== "sent" &&
      stateOf(c.supplierId, c.lines).status !== "skipped",
  ).length;
  const allDone = plan.cards.length > 0 && openCards === 0 && plan.unresolved.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center overflow-y-auto py-8"
      // Close only when the press STARTS on the backdrop — a drag that ends
      // outside the panel (or a re-dispatched click) must not nuke the review.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="raise-po-review"
    >
      <div className="w-[780px] max-w-[94vw] bg-white rounded-xl border border-base-200 shadow-xl mb-8">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 h-12 border-b border-base-200">
          <PackagePlus size={16} className="text-base-500" strokeWidth={2} />
          <span className="text-body font-semibold">Raise PO — one per supplier</span>
          <span className="text-meta text-base-500 tabular-nums">
            {orders.length} order{orders.length === 1 ? "" : "s"} · {totalUnits} unit
            {totalUnits === 1 ? "" : "s"} to order
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto p-1 rounded text-base-500 hover:text-base-900 hover:bg-base-100"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* What was excluded and why — no silent drops. */}
        {(plan.alreadyOnPo > 0 || plan.coveredUnits > 0 || plan.nonCore > 0) && (
          <div className="px-5 py-2 text-meta text-base-500 border-b border-base-100">
            {[
              plan.coveredUnits > 0
                ? `${plan.coveredUnits} unit${plan.coveredUnits === 1 ? "" : "s"} covered by stock`
                : null,
              plan.alreadyOnPo > 0
                ? `${plan.alreadyOnPo} line${plan.alreadyOnPo === 1 ? "" : "s"} already have a PO — call the supplier for the ready date instead`
                : null,
              plan.nonCore > 0
                ? `${plan.nonCore} accessory/service line${plan.nonCore === 1 ? "" : "s"} skipped`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}

        {plan.cards.length === 0 && plan.unresolved.length === 0 && (
          <div className="px-5 py-8 text-body text-base-500">
            Nothing to order — every selected line is covered by stock or
            already has a PO. For stock that is already ordered, use{" "}
            <span className="font-medium text-base-700">
              {orderActionQueue("confirm_ready_date")}
            </span>{" "}
            instead.
          </div>
        )}

        {/* Supplier cards */}
        <div className="p-4 space-y-3">
          {plan.cards.map((card) => {
            const supplier = supplierById.get(card.supplierId);
            if (!supplier) return null;
            const st = stateOf(card.supplierId, card.lines);
            const units = card.lines.reduce((t, l) => t + l.qty, 0);
            const urgent = card.lines.some((l) => l.urgent);
            const missingCost = card.lines.some((l) => costOf(l) == null);
            const needsPartner = supplier.kind === "factory_pickup" && !st.partnerId;
            const blocked = !st.warehouseId || !st.etaDate || missingCost || needsPartner;
            return (
              <div
                key={card.supplierId}
                className="border border-base-200 rounded-xl overflow-hidden"
                data-testid={`raise-po-card-${supplier.name}`}
              >
                <div className="flex items-center gap-2 px-4 h-10 bg-base-50 border-b border-base-100">
                  <span className="text-body font-semibold">{supplier.name}</span>
                  <span className="text-meta text-base-500 tabular-nums">
                    {card.lines.length} SKU{card.lines.length === 1 ? "" : "s"} · {units} unit
                    {units === 1 ? "" : "s"}
                  </span>
                  {urgent && (
                    <span className="inline-flex items-center gap-1 text-meta font-semibold text-destructive">
                      <AlertTriangle size={14} strokeWidth={2} /> urgent
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {st.status === "sent" ? (
                      <span className="inline-flex items-center gap-1 text-meta font-semibold text-success">
                        <Check size={14} strokeWidth={2} /> PO sent
                      </span>
                    ) : st.status === "skipped" ? (
                      <button
                        type="button"
                        className="text-meta text-base-500 hover:text-base-900"
                        onClick={() => patchState(card.supplierId, card.lines, { status: "idle" })}
                      >
                        Skipped — undo
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-ghost text-meta py-1 px-2"
                          onClick={() =>
                            patchState(card.supplierId, card.lines, { status: "skipped" })
                          }
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          className="btn-primary text-meta py-1 px-3"
                          disabled={blocked || st.status === "sending"}
                          title={
                            needsPartner
                              ? "Pick the pickup partner first"
                              : missingCost
                                ? "Fill every line's cost first"
                                : !st.warehouseId
                                  ? "Pick the destination warehouse first"
                                  : undefined
                          }
                          onClick={() => void sendCard(supplier, card.lines)}
                        >
                          {st.status === "sending" ? "Sending…" : "Send PO"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {st.status !== "skipped" && (
                  <>
                    <table className="w-full table-fixed">
                      <tbody>
                        {card.lines.map((l) => (
                          <tr key={lineKey(l)} className="h-9 border-b border-base-100 last:border-b-0">
                            <td className="pl-4 pr-2 w-[46%]">
                              <span className="font-mono text-meta truncate block" title={l.sku}>
                                {l.sku}
                              </span>
                            </td>
                            <td className="px-2 w-[8%] text-body tabular-nums font-semibold">
                              {l.qty}×
                            </td>
                            <td className="px-2">
                              <span className="flex flex-wrap gap-1 items-center">
                                {l.sos.map((so) => (
                                  <span
                                    key={so}
                                    className="inline-flex items-center rounded-full border border-base-200 px-1.5 text-label tabular-nums text-base-600"
                                  >
                                    SO-{so}
                                  </span>
                                ))}
                                {l.urgent && (
                                  <span className="text-label font-semibold text-destructive">
                                    inside stock window
                                  </span>
                                )}
                                {/* Supplier decided by a category GUESS (or a
                                    manual pick) stays editable in place — a
                                    wrong guess must never become a wrong PO.
                                    Catalog-resolved lines are authoritative
                                    (product_skus.supplier_id) and stay fixed. */}
                                {(l.resolvedBy === "category" || l.resolvedBy === "override") && (
                                  <select
                                    value={overrides.get(l.sku) ?? card.supplierId}
                                    title="Supplier guessed from the product type — change it if wrong; the line moves to that supplier's card"
                                    onChange={(e) =>
                                      setOverrides((prev) => {
                                        const n = new Map(prev);
                                        n.set(l.sku, e.target.value);
                                        return n;
                                      })
                                    }
                                    className="border border-base-200 rounded-md text-label px-1 py-0.5 bg-white text-base-500 max-w-[130px]"
                                  >
                                    {suppliers.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </span>
                            </td>
                            <td className="px-2 w-[16%] text-right">
                              <label className="inline-flex items-center gap-1 text-label text-base-400">
                                RM
                                <input
                                  type="number"
                                  min={0}
                                  value={costOf(l) ?? ""}
                                  placeholder="cost"
                                  onChange={(e) =>
                                    setCostEdits((prev) => {
                                      const n = new Map(prev);
                                      const v = e.target.value;
                                      if (v === "") n.delete(lineKey(l));
                                      else n.set(lineKey(l), Math.max(0, Number(v)));
                                      return n;
                                    })
                                  }
                                  className="w-20 border border-base-200 rounded-md px-1.5 py-0.5 text-meta font-mono tabular-nums text-right bg-white"
                                />
                              </label>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center gap-3 px-4 py-2 border-t border-base-100 bg-white">
                      <label className="inline-flex items-center gap-1.5 text-meta text-base-500">
                        To
                        <select
                          value={st.warehouseId}
                          onChange={(e) =>
                            patchState(card.supplierId, card.lines, { warehouseId: e.target.value })
                          }
                          className="border border-base-200 rounded-md text-meta px-1.5 py-1 bg-white text-base-900 w-[180px]"
                        >
                          <option value="">Warehouse…</option>
                          {warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-meta text-base-500">
                        ETA
                        <input
                          type="date"
                          value={st.etaDate}
                          onChange={(e) =>
                            patchState(card.supplierId, card.lines, { etaDate: e.target.value })
                          }
                          className="border border-base-200 rounded-md text-meta px-1.5 py-1 bg-white text-base-900 w-[150px] tabular-nums"
                        />
                      </label>
                      {supplier.kind === "factory_pickup" && (
                        <label className="inline-flex items-center gap-1.5 text-meta text-base-500">
                          Pickup
                          <select
                            value={st.partnerId}
                            onChange={(e) =>
                              patchState(card.supplierId, card.lines, { partnerId: e.target.value })
                            }
                            className="border border-base-200 rounded-md text-meta px-1.5 py-1 bg-white text-base-900 w-[160px]"
                          >
                            <option value="">Partner…</option>
                            {partners.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Unresolved — the operator names the supplier, the row jumps into
              (or creates) that supplier's card above. */}
          {plan.unresolved.length > 0 && (
            <div className="border border-base-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 h-10 bg-base-50 border-b border-base-100">
                <span className="text-body font-semibold">Pick supplier</span>
                <span className="text-meta text-base-500">
                  {plan.unresolved.length} SKU{plan.unresolved.length === 1 ? "" : "s"} we can&rsquo;t
                  match automatically
                </span>
              </div>
              <table className="w-full table-fixed">
                <tbody>
                  {plan.unresolved.map((l) => (
                    <tr key={lineKey(l)} className="h-9 border-b border-base-100 last:border-b-0">
                      <td className="pl-4 pr-2 w-[46%]">
                        <span className="font-mono text-meta truncate block" title={l.sku}>
                          {l.sku}
                        </span>
                      </td>
                      <td className="px-2 w-[8%] text-body tabular-nums font-semibold">{l.qty}×</td>
                      <td className="px-2">
                        <span className="flex flex-wrap gap-1">
                          {l.sos.map((so) => (
                            <span
                              key={so}
                              className="inline-flex items-center rounded-full border border-base-200 px-1.5 text-label tabular-nums text-base-600"
                            >
                              SO-{so}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="px-2 w-[26%] text-right">
                        <select
                          value={overrides.get(l.sku) ?? ""}
                          onChange={(e) =>
                            setOverrides((prev) => {
                              const n = new Map(prev);
                              if (e.target.value) n.set(l.sku, e.target.value);
                              else n.delete(l.sku);
                              return n;
                            })
                          }
                          className="border border-base-200 rounded-md text-meta px-1.5 py-1 bg-white text-base-900 w-full"
                        >
                          <option value="">Supplier…</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-base-200">
          <span className="text-meta text-base-500">
            Each Send raises ONE PO for that supplier, covering every ticked SO.
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`ml-auto text-meta py-1.5 px-3 ${allDone ? "btn-primary" : "btn-secondary"}`}
          >
            {allDone ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
