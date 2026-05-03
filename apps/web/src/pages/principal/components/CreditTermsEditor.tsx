import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useDealerSetTerms } from "@/lib/queries";
import { TOAST } from "@/lib/toast-copy";

/**
 * Inline credit terms editor inside the dealer drawer. Mirrors the proto's
 * editable card at `reference/proto/principal-dealers.jsx` lines 152-182.
 *
 * Two states (view / edit) toggle via the local `editing` flag — the parent
 * drawer doesn't need to know which mode we're in. On save we hit
 * `useDealerSetTerms(dealerId)`, which already invalidates dealer detail +
 * list caches (see queries.ts:721-754); the only thing left for us is to
 * surface the right toast and exit edit mode.
 *
 * Validation is intentionally light: the RPC enforces both fields are
 * present, so we only block the obvious "negative number" / "not a number"
 * client-side. Empty terms gets caught by the dropdown's NET 14/30/60/COD
 * fixed list.
 */
interface Props {
  dealerId: string;
  dealerName: string;
  creditLimit: number;
  paymentTerms: string;
}

export default function CreditTermsEditor({
  dealerId,
  dealerName,
  creditLimit,
  paymentTerms,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [credit, setCredit] = useState(String(creditLimit));
  const [terms, setTerms] = useState(paymentTerms);
  const setT = useDealerSetTerms(dealerId);

  async function save() {
    const parsed = parseFloat(credit);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error("Credit limit must be a non-negative number");
      return;
    }
    try {
      await setT.mutateAsync({ creditLimit: parsed, paymentTerms: terms });
      toast.success(TOAST.termsUpdated(dealerName));
      setEditing(false);
    } catch (e: unknown) {
      // Phase 2C error pattern (TopUpDepositModal:71-85). ApiError.message
      // is already pulled from the response body's `message` field by
      // apiFetch, so we can surface it directly.
      if (e instanceof ApiError) {
        toast.error(e.message || "Failed to update terms");
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to update terms");
      }
    }
  }

  function cancel() {
    setEditing(false);
    setCredit(String(creditLimit));
    setTerms(paymentTerms);
  }

  return (
    <div className="bg-white border border-base-200 rounded-md p-4 mb-[18px]">
      <div className="flex justify-between items-center mb-2">
        <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold">
          Credit terms
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-primary font-semibold bg-transparent border-0 cursor-pointer p-0"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={cancel}
              className="text-[11px] text-base-500 bg-transparent border-0 cursor-pointer p-0"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={setT.isPending}
              className="text-[11px] text-primary font-semibold bg-transparent border-0 cursor-pointer p-0 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </div>
      {!editing ? (
        <div className="grid grid-cols-2 gap-2.5 text-[13px]">
          <div>
            <span className="text-base-500">Limit · </span>
            <span className="font-mono font-semibold">
              RM {Number(creditLimit).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-base-500">Terms · </span>
            <span className="font-mono">{paymentTerms}</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <div className="text-[10px] text-base-500 mb-1">Credit limit (RM)</div>
            <input
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              className="w-full px-2 py-1.5 border border-base-200 rounded text-[12px] font-mono outline-none box-border"
            />
          </div>
          <div>
            <div className="text-[10px] text-base-500 mb-1">Payment terms</div>
            <select
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="w-full px-2 py-1.5 border border-base-200 rounded text-[12px] bg-white outline-none box-border"
            >
              <option>NET 14</option>
              <option>NET 30</option>
              <option>NET 60</option>
              <option>COD</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
