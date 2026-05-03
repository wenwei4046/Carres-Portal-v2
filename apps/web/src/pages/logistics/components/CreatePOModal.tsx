import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useCatalog,
  useCreatePoMutation,
  useDeliveryPartners,
  useLogisticsSuppliers,
  useLogisticsWarehouse,
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
 *   - warehouse + ETA pickers
 *   - primary CTA: "Issue N POs · M lines" or "Issue PO · M lines"
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

  const suppliers = suppliersQ.data?.suppliers ?? [];
  const warehouses = warehousesQ.data?.warehouses ?? [];
  const skuOptions = useMemo(() => {
    const skus = catalogQ.data?.skus ?? [];
    return skus.map((s) => ({ sku: s.sku, name: s.variant }));
  }, [catalogQ.data]);
  const partners = partnersQ.data?.partners ?? [];

  // ---- Lines ----
  const initialLines: DraftLine[] = useMemo(() => {
    if (prefill.lines && prefill.lines.length > 0) {
      return prefill.lines.map((l) => ({ sku: l.sku, qty: l.qty }));
    }
    return [];
  }, [prefill.lines]);
  const [lines, setLines] = useState<DraftLine[]>(initialLines);

  // Default the first line to the first SKU once the catalog loads (only when
  // we started with zero prefill lines). This mirrors proto's `[{ sku: stock[0],
  // qty: 5 }]` default.
  useEffect(() => {
    if (lines.length === 0 && skuOptions.length > 0 && initialLines.length === 0) {
      setLines([{ sku: skuOptions[0].sku, qty: 5 }]);
    }
  }, [lines.length, skuOptions, initialLines.length]);

  const [warehouseId, setWarehouseId] = useState<string>(
    prefill.warehouseId ?? "",
  );
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      setWarehouseId(warehouses[0].id);
    }
  }, [warehouseId, warehouses]);

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

  function setLine(idx: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    const used = new Set(lines.map((l) => l.sku));
    const next = skuOptions.find((s) => !used.has(s.sku));
    const fallback = skuOptions[0];
    const sku = next?.sku ?? fallback?.sku ?? "";
    if (!sku) return;
    setLines((ls) => [...ls, { sku, qty: 1 }]);
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

  // ---- Validation ----
  const allLinesOk =
    lines.length > 0 && lines.every((l) => l.sku && l.qty > 0);
  const partnersOk = groups.groups.every(
    (g) => g.supplier.kind !== "factory_pickup" || !!partnerFor(g.supplier),
  );
  const valid =
    allLinesOk &&
    !!warehouseId &&
    groups.orphans.length === 0 &&
    partnersOk &&
    !create.isPending;

  const skuSet = new Set(lines.map((l) => l.sku));
  const dup = skuSet.size !== lines.length;
  const totalUnits = lines.reduce((s, l) => s + (l.qty || 0), 0);
  const willSplit = groups.groups.length > 1;

  async function submit() {
    if (!valid) return;
    try {
      // One create call per supplier group (auto-split).
      for (const g of groups.groups) {
        await create.mutateAsync({
          supplierId: g.supplier.id,
          warehouseId,
          lines: g.lines.map((l) => ({ sku: l.sku, qty: l.qty })),
          ...(prefill.dl ? { dl: prefill.dl } : {}),
          ...(prefill.dlRefs && prefill.dlRefs.length > 0
            ? { dlRefs: prefill.dlRefs }
            : {}),
        });
      }
      const n = groups.groups.length;
      toast.success(
        n > 1
          ? `${n} POs issued · auto-split by supplier`
          : `PO issued · ${lines.length} line${lines.length === 1 ? "" : "s"} · ${totalUnits} units`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Issue PO failed");
      else toast.error(e instanceof Error ? e.message : "Issue PO failed");
    }
  }

  const titleSuffix = prefill.dl
    ? ` · for order #${prefill.dl}`
    : prefill.dlRefs && prefill.dlRefs.length > 0
      ? ` · bundle of ${prefill.dlRefs.length} orders`
      : "";

  return (
    <Modal
      title={prefill.dl || prefill.dlRefs?.length ? `New PO${titleSuffix}` : "New purchase order"}
      onClose={onClose}
      size="lg"
    >
      <div className="text-[12px] text-base-600 mb-3 font-body">
        {prefill.dl ? (
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
              className="grid items-center gap-2 px-3.5 py-2 border-t border-base-100"
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

      {/* Per-supplier groups */}
      <div className="flex flex-col gap-2.5 mb-3.5">
        {groups.groups.map((g) => {
          const needsPartner = g.supplier.kind === "factory_pickup";
          const groupUnits = g.lines.reduce((s, l) => s + (l.qty || 0), 0);
          return (
            <div
              key={g.supplier.id}
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
              <div
                className={`flex justify-between items-start gap-3 ${needsPartner ? "mb-2.5" : ""}`}
              >
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
              {needsPartner && (
                <div>
                  <div className="label mb-1.5">Logistics partner *</div>
                  <select
                    value={partnerFor(g.supplier)}
                    onChange={(e) => setPartner(g.supplier.id, e.target.value)}
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
          );
        })}
      </div>

      {/* Warehouse + ETA */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="label mb-1.5">Warehouse *</div>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            aria-label="Warehouse"
            className={INPUT_CLS}
          >
            {warehouses.length === 0 && <option value="">—</option>}
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
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

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={
          willSplit
            ? `Issue ${groups.groups.length} POs · ${lines.length} line${lines.length === 1 ? "" : "s"}`
            : `Issue PO · ${lines.length} line${lines.length === 1 ? "" : "s"}`
        }
        primaryDisabled={!valid}
        primaryPending={create.isPending}
      />
    </Modal>
  );
}
