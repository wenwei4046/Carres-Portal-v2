import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Trash2 } from "lucide-react";
import type { Order } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import {
  useCatalog,
  useOutlets,
  usePrincipalDealers,
  useRawCreateOrder,
  useSalespersons,
} from "@/lib/queries";

/**
 * MAINTAIN → New Order — the RAW Sales Order creator (POS-parity with the
 * 2990s Backend "New Sales Order"). Internal (principal) tooling:
 *   - NO POS gates: no signature, no terms, no payment method, no emergency
 *     contact, no lead-time floor (empty date = TBD)
 *   - lines are free-form: pick from the FULL catalog (incl. deactivated /
 *     unpriced skus) at an editable price, or type a fully custom line —
 *     every sku / qty / price is persisted exactly as entered
 * The server (POST /api/orders/raw) still enforces: dealer required, ≥1 line,
 * and the standing sofa ↔ mattress/bed-frame composition rule.
 */

interface RawLine {
  localId: string;
  sku: string;
  /** Display caption under the sku (model · variant) — catalog picks only. */
  label: string;
  qty: number;
  /** Kept as the raw input string so partial edits ("2.", "") don't fight the
   *  user; parsed at submit/total time. */
  unitPrice: string;
}

let rawLineSeq = 0;
const nextLocalId = () => `raw-line-${++rawLineSeq}`;

const priceOf = (l: RawLine) => {
  const n = Number.parseFloat(l.unitPrice);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export default function PrincipalNewOrder() {
  const navigate = useNavigate();
  const dealersQ = usePrincipalDealers();
  const outletsQ = useOutlets();
  const salespersonsQ = useSalespersons();
  const catalogQ = useCatalog({ admin: true });
  const createRaw = useRawCreateOrder();

  const [dealerId, setDealerId] = useState("");
  const [outletId, setOutletId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paid, setPaid] = useState("0");
  const [lines, setLines] = useState<RawLine[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [submitted, setSubmitted] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dealers = useMemo(
    () => (dealersQ.data?.dealers ?? []).filter((d) => d.status === "active"),
    [dealersQ.data],
  );
  const outlets = useMemo(
    () => (outletsQ.data?.outlets ?? []).filter((o) => o.dealerId === dealerId),
    [outletsQ.data, dealerId],
  );
  const salespersons = useMemo(
    () => (salespersonsQ.data?.salespersons ?? []).filter((s) => s.dealerId === dealerId),
    [salespersonsQ.data, dealerId],
  );

  // Catalog picker — search sku / model / variant across the FULL admin bundle.
  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q || !catalogQ.data) return [];
    const modelById = new Map(catalogQ.data.models.map((m) => [m.id, m]));
    return catalogQ.data.skus
      .filter((s) => {
        const model = modelById.get(s.modelId);
        return (
          s.sku.toLowerCase().includes(q) ||
          (model?.name.toLowerCase().includes(q) ?? false) ||
          (s.variant?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 8)
      .map((s) => {
        const model = modelById.get(s.modelId);
        return {
          sku: s.sku,
          label: [model?.name, s.variant].filter(Boolean).join(" · "),
          price: s.price ?? 0,
        };
      });
  }, [pickerQuery, catalogQ.data]);

  function addCatalogLine(pick: { sku: string; label: string; price: number }) {
    setLines((ls) => [
      ...ls,
      {
        localId: nextLocalId(),
        sku: pick.sku,
        label: pick.label,
        qty: 1,
        unitPrice: String(pick.price),
      },
    ]);
    setPickerQuery("");
  }

  function addCustomLine() {
    setLines((ls) => [
      ...ls,
      { localId: nextLocalId(), sku: "", label: "", qty: 1, unitPrice: "0" },
    ]);
  }

  function patchLine(localId: string, patch: Partial<RawLine>) {
    setLines((ls) => ls.map((l) => (l.localId === localId ? { ...l, ...patch } : l)));
  }

  function removeLine(localId: string) {
    setLines((ls) => ls.filter((l) => l.localId !== localId));
  }

  const total = lines.reduce((s, l) => {
    const p = priceOf(l);
    return s + (Number.isNaN(p) ? 0 : p * l.qty);
  }, 0);
  const paidNum = Number.parseFloat(paid) || 0;

  const linesValid =
    lines.length > 0 && lines.every((l) => l.sku.trim().length > 0 && l.qty > 0 && !Number.isNaN(priceOf(l)));
  const canSubmit =
    !!dealerId && customerName.trim().length > 0 && linesValid && paidNum >= 0 && !createRaw.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitError(null);
    try {
      const order = await createRaw.mutateAsync({
        dealerId,
        outletId: outletId || null,
        salespersonId: salespersonId || null,
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim() || null,
          address: customerAddress.trim() || null,
        },
        deliveryDate: deliveryDate || null,
        lines: lines.map((l) => ({
          sku: l.sku.trim(),
          qty: l.qty,
          unitPrice: priceOf(l),
        })),
        paid: paidNum,
      });
      setSubmitted(order);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Order creation failed");
    }
  }

  function startAnother() {
    setSubmitted(null);
    setSubmitError(null);
    setDealerId("");
    setOutletId("");
    setSalespersonId("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setDeliveryDate("");
    setPaid("0");
    setLines([]);
    setPickerQuery("");
  }

  if (submitted) {
    return (
      <div className="min-h-full grid place-items-center p-8">
        <div className="w-full max-w-md bg-card border border-base-200 rounded-lg shadow-sm p-7 text-center">
          <p className="t-micro text-base-400">Maintain · New order</p>
          <h1 className="t-h2 mt-1">Order SO-{submitted.so} created</h1>
          <p className="t-small text-base-500 mt-2">
            {submitted.customer.name} · {submitted.lines?.length ?? 0} line
            {(submitted.lines?.length ?? 0) === 1 ? "" : "s"} · saved exactly as entered.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" className="btn-secondary" onClick={() => navigate("/operation/orders")}>
              View orders
            </button>
            <button type="button" className="btn-primary" onClick={startAnother}>
              Create another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
      <header>
        <p className="t-micro text-base-400">Maintain · New order</p>
        <h1 className="t-h2 mt-1">New Sales Order</h1>
        <p className="t-small text-base-500 mt-1">
          Raw creation — no POS gates. Every line, price and date is saved exactly as you enter it.
        </p>
      </header>

      {/* Sale info */}
      <section className="bg-card border border-base-200 rounded-lg shadow-sm p-6">
        <h2 className="t-h4 mb-4">Sale info</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="t-tiny uppercase tracking-wide text-base-500">Dealer *</span>
            <select
              value={dealerId}
              onChange={(e) => {
                setDealerId(e.target.value);
                setOutletId("");
                setSalespersonId("");
              }}
              data-testid="raw-dealer"
              className="mt-1 w-full rounded-md border border-base-300 bg-white px-3 py-2 t-body"
            >
              <option value="">
                {dealersQ.isLoading ? "Loading…" : "Select a dealer…"}
              </option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="t-tiny uppercase tracking-wide text-base-500">Outlet</span>
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              disabled={!dealerId}
              className="mt-1 w-full rounded-md border border-base-300 bg-white px-3 py-2 t-body disabled:opacity-50"
            >
              <option value="">— optional —</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="t-tiny uppercase tracking-wide text-base-500">Salesperson</span>
            <select
              value={salespersonId}
              onChange={(e) => setSalespersonId(e.target.value)}
              disabled={!dealerId}
              className="mt-1 w-full rounded-md border border-base-300 bg-white px-3 py-2 t-body disabled:opacity-50"
            >
              <option value="">— optional —</option>
              {salespersons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Customer */}
      <section className="bg-card border border-base-200 rounded-lg shadow-sm p-6">
        <h2 className="t-h4 mb-4">Customer</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="t-tiny uppercase tracking-wide text-base-500">Full name *</span>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              data-testid="raw-customer-name"
              className="mt-1 w-full rounded-md border border-base-300 bg-white px-3 py-2 t-body"
            />
          </label>
          <label className="block">
            <span className="t-tiny uppercase tracking-wide text-base-500">Phone</span>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-base-300 bg-white px-3 py-2 t-body"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="t-tiny uppercase tracking-wide text-base-500">Delivery address</span>
            <textarea
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-base-300 bg-white px-3 py-2 t-body"
            />
          </label>
        </div>
      </section>

      {/* Items */}
      <section className="bg-card border border-base-200 rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="t-h4">Items</h2>
          <button type="button" onClick={addCustomLine} className="btn-ghost text-[12px]">
            <Plus size={14} strokeWidth={1.75} className="inline -mt-0.5 mr-1" />
            Custom line
          </button>
        </div>

        {/* Catalog picker */}
        <div className="relative mb-4">
          <Search
            size={15}
            strokeWidth={1.75}
            className="absolute left-3.5 top-[13px] text-base-400 pointer-events-none"
          />
          <input
            type="search"
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder="Add from catalog — name, SKU, variant… (includes deactivated + unpriced)"
            data-testid="raw-picker"
            className="w-full pl-9 pr-4 py-2 rounded-full border border-base-200 bg-base-50 t-small outline-none
                       focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white transition-all"
          />
          {pickerResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-base-200 rounded-lg shadow-md overflow-hidden">
              {pickerResults.map((r) => (
                <li key={r.sku}>
                  <button
                    type="button"
                    onClick={() => addCatalogLine(r)}
                    data-testid={`raw-pick-${r.sku}`}
                    className="w-full flex items-baseline justify-between gap-3 px-4 py-2 text-left hover:bg-base-50"
                  >
                    <span className="min-w-0">
                      <span className="font-mono text-[12px]">{r.sku}</span>
                      {r.label && <span className="t-tiny text-base-500 ml-2">{r.label}</span>}
                    </span>
                    <span className="font-mono text-[12px] text-base-600 shrink-0">{rm(r.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="t-small text-base-400 text-center py-6">
            No items yet — search the catalog above, or add a custom line.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="hidden sm:grid grid-cols-[1fr_84px_130px_110px_36px] gap-2 px-1">
              <span className="t-micro text-base-400">SKU / description</span>
              <span className="t-micro text-base-400">Qty</span>
              <span className="t-micro text-base-400">Unit price (RM)</span>
              <span className="t-micro text-base-400 text-right">Line total</span>
              <span />
            </div>
            {lines.map((l) => {
              const p = priceOf(l);
              return (
                <div
                  key={l.localId}
                  className="grid sm:grid-cols-[1fr_84px_130px_110px_36px] grid-cols-2 gap-2 items-center"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <input
                      type="text"
                      value={l.sku}
                      onChange={(e) => patchLine(l.localId, { sku: e.target.value })}
                      placeholder="SKU or free-text description"
                      className="w-full rounded-md border border-base-300 bg-white px-3 py-1.5 font-mono text-[12px]"
                    />
                    {l.label && <p className="t-tiny text-base-400 mt-0.5 px-1">{l.label}</p>}
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={l.qty}
                    onChange={(e) =>
                      patchLine(l.localId, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                    }
                    className="rounded-md border border-base-300 bg-white px-3 py-1.5 t-body"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) => patchLine(l.localId, { unitPrice: e.target.value })}
                    className="rounded-md border border-base-300 bg-white px-3 py-1.5 font-mono text-[13px]"
                  />
                  <span className="font-mono text-[13px] text-right">
                    {Number.isNaN(p) ? "—" : rm(p * l.qty)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.localId)}
                    aria-label="Remove line"
                    className="grid place-items-center w-8 h-8 rounded-md text-base-400 hover:text-destructive hover:bg-destructive/5"
                  >
                    <Trash2 size={15} strokeWidth={1.75} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Delivery + payment */}
      <section className="bg-card border border-base-200 rounded-lg shadow-sm p-6">
        <h2 className="t-h4 mb-4">Delivery & payment</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="t-tiny uppercase tracking-wide text-base-500">Delivery date</span>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-base-300 bg-white px-3 py-2 t-body"
            />
            <span className="t-tiny text-base-400 mt-1 block">
              Leave empty = date TBC. No lead-time floor on this path.
            </span>
          </label>
          <label className="block">
            <span className="t-tiny uppercase tracking-wide text-base-500">Paid (RM)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              className="mt-1 w-full rounded-md border border-base-300 bg-white px-3 py-2 font-mono"
            />
          </label>
        </div>
      </section>

      {/* Footer */}
      {submitError && (
        <p className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded px-3 py-2">
          {submitError}
        </p>
      )}
      <div className="flex items-center justify-between pb-10">
        <span className="t-body text-base-700">
          Total <span className="font-mono font-semibold text-base-900">{rm(total)}</span>
          {paidNum > 0 && (
            <span className="t-small text-base-500 ml-3">
              Paid {rm(paidNum)}
              {total > 0 && ` · ${Math.round((paidNum / total) * 100)}%`}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          data-testid="raw-submit"
          className="btn-hero disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createRaw.isPending ? "Creating…" : "Create order →"}
        </button>
      </div>
    </div>
  );
}
