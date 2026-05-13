import { useState } from "react";
import { toast } from "sonner";
import type { Order } from "@carres/shared";
import MYAddressFields from "@/components/MYAddressFields";
import { ApiError } from "@/lib/api";
import { useSetOrderAddress } from "@/lib/queries";
import { composeAddress } from "@/data/malaysia-postcodes";
import { ModalShell } from "./TopUpDepositModal";

interface Props {
  order: Order;
  onClose: () => void;
}

/**
 * AddAddressModal — proto/dealer-action-modals.jsx:469-540. Wraps
 * MYAddressFields so the dealer can fill in a deferred delivery address
 * (orders submitted with `customer_address_unknown = true`).
 *
 * `composeAddress` produces the same flat string the wizard would have
 * stored at create time, so once submitted the order looks identical to one
 * that had the address from the start.
 */
export default function AddAddressModal({ order, onClose }: Props) {
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressPostcode, setAddressPostcode] = useState("");
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState(order.customer.billing ?? "");

  const setAddressMut = useSetOrderAddress(order.id, {
    onSuccess: () => {
      toast.success(`Delivery address set for #${order.dl}`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) {
        const code = (err.body as { code?: unknown } | null)?.code;
        if (code === "wrong_status") {
          toast.error("Order is no longer in Place — refresh and retry");
          return;
        }
      }
      toast.error(err.message || "Could not save address");
    },
  });

  const composed = composeAddress({
    line1: addressLine1,
    line2: addressLine2,
    state: addressState,
    city: addressCity,
    postcode: addressPostcode,
  });
  const addressComplete =
    addressLine1.trim().length >= 5 && !!addressState && !!addressCity && !!addressPostcode;
  const billingValid = billingSame || billing.trim().length >= 5;
  const canSubmit = addressComplete && billingValid && !setAddressMut.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    setAddressMut.mutate({
      address: composed,
      billing: billingSame ? null : billing.trim(),
      billingSame,
    });
  }

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <header className="px-7 pt-5 pb-3.5 border-b border-base-100">
        <p className="kicker">Delivery address · #{order.dl}</p>
        <h2 className="font-display text-[22px] mt-0.5 tracking-[-0.02em] leading-[1.2] font-semibold">
          Add delivery address
        </h2>
        <p className="text-xs text-base-600 mt-1">
          Customer: <strong>{order.customer.name}</strong>
          {order.customer.phone && (
            <span className="font-mono text-base-500"> · {order.customer.phone}</span>
          )}
        </p>
      </header>

      {/* Body */}
      <div className="px-7 py-6 overflow-auto flex-1 flex flex-col gap-4">
        <MYAddressFields
          data={{ addressLine1, addressLine2, addressState, addressCity, addressPostcode }}
          onChange={(patch) => {
            if (patch.addressLine1 !== undefined) setAddressLine1(patch.addressLine1);
            if (patch.addressLine2 !== undefined) setAddressLine2(patch.addressLine2);
            if (patch.addressState !== undefined) setAddressState(patch.addressState);
            if (patch.addressCity !== undefined) setAddressCity(patch.addressCity);
            if (patch.addressPostcode !== undefined) setAddressPostcode(patch.addressPostcode);
          }}
        />

        {/* Live composed preview */}
        {addressComplete && (
          <div className="rounded p-3 bg-base-50 border border-dashed border-base-200 text-xs text-base-700">
            ↳ Will save as: <strong className="text-base-900">{composed}</strong>
          </div>
        )}

        {/* Billing toggle */}
        <div>
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
              placeholder="Billing address"
              rows={2}
              className="mt-2 w-full px-3 py-2.5 border border-base-300 rounded text-sm font-body bg-white outline-none focus:border-primary resize-vertical"
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="px-7 py-3.5 border-t border-base-100 bg-base-50 flex justify-end items-center gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button type="button" disabled={!canSubmit} onClick={handleSubmit} className="btn-primary">
          {setAddressMut.isPending ? "Saving…" : "Save address"}
        </button>
      </footer>
    </ModalShell>
  );
}
