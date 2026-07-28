import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MAX_DELIVERY_FLOOR,
  maxLeadDaysFor,
  minDeliveryDateISO,
  type Order,
  type UpdateOrderInput,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCatalog, useUpdateOrder } from "@/lib/queries";
import { ModalShell } from "./TopUpDepositModal";

interface Props {
  order: Order;
  onClose: () => void;
}

/**
 * EditOrderModal — Phase 2C.2 dealer-side full edit. Mirrors proto's
 * CustomerEditor (dealer-orders.jsx:472-581) but slimmer: it covers the
 * customer + delivery fields a dealer is most likely to need to fix on a
 * Place order before proceeding (typos in name/phone, billing tweaks,
 * delivery date adjustments, floor/lift updates).
 *
 * Address structured editing is delegated to AddAddressModal (for orders
 * still tagged addressUnknown) — here we expose a flat textarea for
 * cosmetic typo fixes on already-set addresses. A dealer who wants to
 * re-pick state/city/postcode can toggle addressUnknown on, save, then
 * use AddAddressModal to re-enter via the cascading picker.
 */
export default function EditOrderModal({ order, onClose }: Props) {
  // Local form state. Pre-filled from the current order.
  const [name, setName] = useState(order.customer.name);
  const [phone, setPhone] = useState(order.customer.phone ?? "");
  const [address, setAddress] = useState(order.customer.address ?? "");
  const [addressUnknown, setAddressUnknown] = useState(order.customer.addressUnknown);
  const [emergency, setEmergency] = useState(order.customer.emergency ?? "");
  const [billingSame, setBillingSame] = useState(order.customer.billingSame);
  const [billing, setBilling] = useState(order.customer.billing ?? "");
  const [deliveryDate, setDeliveryDate] = useState(order.delivery.date ?? "");
  // Phase 11.1 — proceed (production-start) date, paired with the delivery date.
  const [proceedDate, setProceedDate] = useState(order.delivery.proceedDate ?? "");
  const [dateTbd, setDateTbd] = useState(order.delivery.dateTbd);
  const [floor, setFloor] = useState(order.delivery.floor);
  const [hasLift, setHasLift] = useState(order.delivery.hasLift);

  // 2026-05-22 (Loo) — same lead-time floor as the wizard's Step 3 (mattress
  // + bedframe 14d, sofa 21d, see shared DELIVERY_LEAD_DAYS). Without this
  // gate the dealer could create with a compliant date, then open Edit and
  // shift to tomorrow — bypassing the production lead-time entirely.
  const catalogQ = useCatalog();
  const minLeadDays = useMemo(() => {
    if (!catalogQ.data || !order.lines) return 0;
    const cats = new Set<string>();
    for (const line of order.lines) {
      const sku = catalogQ.data.skus.find((s) => s.sku === line.sku);
      if (!sku) continue;
      const model = catalogQ.data.models.find((m) => m.id === sku.modelId);
      if (model) cats.add(model.category);
    }
    return maxLeadDaysFor([...cats], catalogQ.data.earliestSellDays ?? 0);
  }, [catalogQ.data, order.lines]);
  const minDate = useMemo(() => minDeliveryDateISO(minLeadDays), [minLeadDays]);

  const updateMut = useUpdateOrder(order.id, {
    onSuccess: () => {
      toast.success(`Order #${order.so} updated`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) {
        const code = (err.body as { code?: unknown } | null)?.code;
        if (code === "wrong_status") {
          toast.error("Order is no longer in Place — refresh and retry");
          return;
        }
        if (code === "no_changes") {
          toast.error("No fields changed");
          return;
        }
      }
      toast.error(err.message || "Could not save changes");
    },
  });

  // Diff vs original: send only fields that actually changed. Avoids logging
  // a "field updated" history entry for fields the dealer just looked at.
  function buildPayload(): UpdateOrderInput {
    const customer: UpdateOrderInput["customer"] = {};
    const delivery: UpdateOrderInput["delivery"] = {};
    if (name !== order.customer.name) customer.name = name.trim();
    if (phone !== (order.customer.phone ?? "")) customer.phone = phone.trim();
    if (address !== (order.customer.address ?? "")) customer.address = address.trim() || null;
    if (addressUnknown !== order.customer.addressUnknown) customer.addressUnknown = addressUnknown;
    if (billingSame !== order.customer.billingSame) customer.billingSame = billingSame;
    if (billing !== (order.customer.billing ?? "")) customer.billing = billing.trim() || null;
    if (emergency !== (order.customer.emergency ?? "")) customer.emergency = emergency.trim();
    if (deliveryDate !== (order.delivery.date ?? "")) delivery.date = deliveryDate || null;
    if (proceedDate !== (order.delivery.proceedDate ?? "")) delivery.proceedDate = proceedDate || null;
    if (dateTbd !== order.delivery.dateTbd) delivery.dateTbd = dateTbd;
    if (floor !== order.delivery.floor) delivery.floor = floor;
    if (hasLift !== order.delivery.hasLift) delivery.hasLift = hasLift;

    const out: UpdateOrderInput = {};
    if (Object.keys(customer).length > 0) out.customer = customer;
    if (Object.keys(delivery).length > 0) out.delivery = delivery;
    return out;
  }

  const payload = buildPayload();
  const hasChanges = !!payload.customer || !!payload.delivery;

  // Validation: required fields must remain non-empty after edit.
  const nameValid = name.trim().length >= 2;
  const phoneValid = !phone || /^[0-9-+\s]{8,}/.test(phone);
  const billingValid = billingSame || billing.trim().length >= 5;
  // Lead-time floor: when not TBD and a date is picked, the date must be
  // on/after today + minLeadDays. The wizard enforced this on create; this
  // closes the Edit-modal bypass.
  const dateLeadOk = dateTbd || !deliveryDate || (minLeadDays === 0 || deliveryDate >= minDate);
  const dateValid = (dateTbd || !!deliveryDate) && dateLeadOk;
  // Phase 11.1 — proceed date pairs with delivery: required when not TBD and
  // on/before the delivery date.
  const proceedValid = dateTbd || (!!proceedDate && (!deliveryDate || proceedDate <= deliveryDate));
  const canSubmit =
    nameValid && phoneValid && billingValid && dateValid && proceedValid && hasChanges && !updateMut.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    updateMut.mutate(payload);
  }

  return (
    <ModalShell onClose={onClose}>
      <header className="px-7 pt-5 pb-3.5 border-b border-base-100">
        <p className="kicker">Edit · #{order.so}</p>
        <h2 className="font-display text-[22px] mt-0.5 tracking-[-0.02em] leading-[1.2] font-semibold">
          Order details
        </h2>
        <p className="text-xs text-base-600 mt-1">
          Editable while order is in <strong>Place</strong>. Once proceeded,
          changes go through operation.
        </p>
      </header>

      <div className="px-7 py-6 overflow-auto flex-1 flex flex-col gap-5">
        {/* Customer */}
        <section>
          <h3 className="font-display text-base font-semibold tracking-[-0.01em] mb-3">
            Customer
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label block mb-1.5">Full name *</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="label block mb-1.5">Phone</span>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="012-3456789"
                className="w-full px-3 py-2.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary"
              />
            </label>
          </div>

          <label className="block mt-3">
            <span className="label block mb-1.5">Emergency contact</span>
            <input
              type="text"
              value={emergency}
              onChange={(e) => setEmergency(e.target.value)}
              placeholder="Name · phone · relationship"
              className="w-full px-3 py-2.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary"
            />
          </label>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="label">Delivery address</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-base-700">
                <input
                  type="checkbox"
                  checked={addressUnknown}
                  onChange={(e) => setAddressUnknown(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                Customer hasn&rsquo;t provided yet
              </label>
            </div>
            {addressUnknown ? (
              <div className="rounded bg-base-50 border border-dashed border-base-200 px-3 py-2.5 text-xs text-base-500">
                Address will be required before this order can move to operation.
              </div>
            ) : (
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Composed address — pickled state/city/postcode"
                className="w-full px-3 py-2.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary resize-vertical"
              />
            )}
          </div>

          <div className="mt-3">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-base-700">
              <input
                type="checkbox"
                checked={billingSame}
                onChange={(e) => setBillingSame(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              Billing address same as delivery
            </label>
            {!billingSame && (
              <textarea
                value={billing}
                onChange={(e) => setBilling(e.target.value)}
                rows={2}
                placeholder="Billing address"
                className="mt-2 w-full px-3 py-2.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary resize-vertical"
              />
            )}
          </div>
        </section>

        {/* Delivery */}
        <section>
          <h3 className="font-display text-base font-semibold tracking-[-0.01em] mb-3">
            Delivery
          </h3>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="block">
              <span className="label block mb-1.5">
                Delivery date {dateTbd && "(TBD)"}
              </span>
              <input
                type="date"
                value={deliveryDate}
                disabled={dateTbd}
                min={minLeadDays > 0 ? minDate : undefined}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className={`w-full px-3 py-2.5 border border-base-300 rounded text-sm outline-none focus:border-primary ${
                  dateTbd ? "bg-base-50 text-base-500 cursor-not-allowed" : "bg-white"
                }`}
              />
              {minLeadDays > 0 && !dateTbd && (
                <span className="text-[11px] text-base-500 block mt-1">
                  Earliest available: {minDate} ({minLeadDays}-day production lead time)
                </span>
              )}
            </label>
            <div className="pb-2.5">
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-base-700">
                <input
                  type="checkbox"
                  checked={dateTbd}
                  onChange={(e) => {
                    setDateTbd(e.target.checked);
                    if (e.target.checked) {
                      setDeliveryDate("");
                      setProceedDate("");
                    }
                  }}
                  className="w-3.5 h-3.5"
                />
                Confirm later
              </label>
            </div>
          </div>

          {/* Phase 11.1 — proceed (production-start) date */}
          <label className="block mt-3">
            <span className="label block mb-1.5">
              Proceed date · production start {dateTbd && "(TBD)"}
            </span>
            <input
              type="date"
              value={proceedDate}
              disabled={dateTbd}
              max={deliveryDate || undefined}
              onChange={(e) => setProceedDate(e.target.value)}
              className={`w-full px-3 py-2.5 border border-base-300 rounded text-sm outline-none focus:border-primary ${
                dateTbd ? "bg-base-50 text-base-500 cursor-not-allowed" : "bg-white"
              }`}
            />
            <span className="text-[11px] text-base-500 block mt-1">
              When production should start (on or before the delivery date).
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="block">
              <span className="label block mb-1.5">Floor (max {MAX_DELIVERY_FLOOR}F)</span>
              <input
                type="number"
                min={1}
                max={MAX_DELIVERY_FLOOR}
                value={floor}
                onChange={(e) =>
                  setFloor(
                    Math.max(
                      1,
                      Math.min(MAX_DELIVERY_FLOOR, parseInt(e.target.value, 10) || 1),
                    ),
                  )
                }
                className="w-full px-3 py-2.5 border border-base-300 rounded text-sm font-mono bg-white outline-none focus:border-primary"
              />
            </label>
            <div className="block">
              <span className="label block mb-1.5">Lift available?</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setHasLift(false)}
                  className={`px-3 py-2 rounded border-[1.5px] text-sm font-semibold transition-colors ${
                    !hasLift
                      ? "border-primary bg-signature-50 text-primary"
                      : "border-base-300 bg-white text-base-700 hover:border-primary/40"
                  }`}
                >
                  No lift
                </button>
                <button
                  type="button"
                  onClick={() => setHasLift(true)}
                  className={`px-3 py-2 rounded border-[1.5px] text-sm font-semibold transition-colors ${
                    hasLift
                      ? "border-primary bg-signature-50 text-primary"
                      : "border-base-300 bg-white text-base-700 hover:border-primary/40"
                  }`}
                >
                  Has lift
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Validation hints */}
        {!nameValid && (
          <p className="text-[11px] text-destructive">Name must be at least 2 characters.</p>
        )}
        {!phoneValid && (
          <p className="text-[11px] text-destructive">Phone needs at least 8 digits.</p>
        )}
        {!billingValid && (
          <p className="text-[11px] text-destructive">
            Billing address needs at least 5 characters when different from delivery.
          </p>
        )}
        {!dateValid && (dateTbd || !deliveryDate) && (
          <p className="text-[11px] text-destructive">
            Delivery date is required (or check &ldquo;Confirm later&rdquo;).
          </p>
        )}
        {!dateLeadOk && (
          <p className="text-[11px] text-destructive">
            Earliest delivery date is {minDate} ({minLeadDays}-day production lead time for this category).
          </p>
        )}
        {!proceedValid && !dateTbd && (
          <p className="text-[11px] text-destructive">
            Proceed date is required and must be on or before the delivery date.
          </p>
        )}
      </div>

      <footer className="px-7 py-3.5 border-t border-base-100 bg-base-50 flex justify-between items-center gap-4">
        <p className="text-[11px] text-base-600">
          {hasChanges ? (
            <span>Updating <strong>{Object.keys(payload.customer ?? {}).length + Object.keys(payload.delivery ?? {}).length}</strong> field(s)</span>
          ) : (
            <span>No changes</span>
          )}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="button" disabled={!canSubmit} onClick={handleSubmit} className="btn-primary">
            {updateMut.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </footer>
    </ModalShell>
  );
}
