import { useState } from "react";
import {
  CornerUpLeft,
  Factory,
  Home,
  Plus,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import type { SofaLoanDto } from "@carres/shared";
import {
  useBorrowLoan,
  useReturnLoan,
  useReturnLoanSupplier,
  type SupplierRow,
} from "@/lib/queries";

/**
 * LoanPanel — the "Option B" loaner panel (Jess 2026-07-11), the SAME wordless
 * journey-bar language as the item Route. A loaner is a substitute piece lent to
 * the customer while the real one isn't ready; it comes from the own WAREHOUSE
 * (a free unit, swapped back) or is BORROWED from a SUPPLIER (a return obligation
 * — owe the supplier a piece back, shown as an extra "↩ return" leg so it's never
 * forgotten). migration 0217.
 */

const SEG_DONE = "#16A34A";
const SEG_ACTIVE = "#2563EB";
const SEG_PENDING = "#D8D3C8";
const SEG_OWED = "#B45309"; // amber-700 — an outstanding supplier obligation

/** One loan as a 3-node swap bar: origin → customer → back. */
function LoanSwapBar({ loan }: { loan: SofaLoanDto }) {
  const isSupplier = loan.source === "supplier";
  const swapped = loan.status === "returned";
  const owedBack = isSupplier && !loan.returned_to_supplier_at;

  const OriginIcon = isSupplier ? Factory : Warehouse;
  const originLabel = isSupplier
    ? (loan.supplier_name ?? "Supplier")
    : (loan.item_sku ?? "Klang");
  const pieceLabel = isSupplier
    ? (loan.borrowed_label ?? loan.borrowed_sku ?? "Borrowed piece")
    : (loan.item_sku ?? "Sofa");

  // seg1 (out) is always done; seg2 (customer→return) done once swapped.
  const seg2 = swapped ? SEG_DONE : SEG_ACTIVE;
  // the supplier return leg colour: done → green, else amber (owed) once swapped,
  // grey while still at the customer.
  const retColour = !isSupplier
    ? swapped
      ? SEG_DONE
      : SEG_PENDING
    : loan.returned_to_supplier_at
      ? SEG_DONE
      : swapped
        ? SEG_OWED
        : SEG_PENDING;

  return (
    <div className="rounded-md border border-base-100 bg-base-50 px-2.5 py-2">
      <div className="flex items-center gap-2 text-[12px] mb-1.5">
        <span className="font-medium truncate" title={pieceLabel}>
          {pieceLabel}
        </span>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
            isSupplier
              ? "bg-[#FEF3C7] text-[#92400E]"
              : "bg-[#DCFCE7] text-[#166534]"
          }`}
        >
          {isSupplier ? `borrow · ${originLabel}` : `warehouse · ${originLabel}`}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <OriginIcon className="w-3.5 h-3.5 shrink-0 text-base-400" strokeWidth={2} />
        <span
          className="h-1.5 flex-1 rounded-full min-w-[10px]"
          style={{ backgroundColor: SEG_DONE }}
        />
        <Home className="w-3.5 h-3.5 shrink-0 text-base-400" strokeWidth={2} />
        <span
          className="h-1.5 flex-1 rounded-full min-w-[10px]"
          style={{ backgroundColor: seg2 }}
        />
        {isSupplier ? (
          <CornerUpLeft
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: owedBack && swapped ? SEG_OWED : "#A8A398" }}
            strokeWidth={2}
          />
        ) : null}
        <span
          className="h-1.5 flex-1 rounded-full min-w-[10px]"
          style={{ backgroundColor: retColour }}
        />
        <OriginIcon className="w-3.5 h-3.5 shrink-0 text-base-400" strokeWidth={2} />
      </div>
      {owedBack && swapped && (
        <div className="mt-1.5 text-[10px] text-[#92400E] flex items-center gap-1">
          <CornerUpLeft className="w-3 h-3" strokeWidth={2} /> owe{" "}
          {originLabel} 1 piece back
        </div>
      )}
    </div>
  );
}

export default function LoanPanel({
  orderId,
  loans,
  suppliers,
}: {
  orderId: string;
  loans: SofaLoanDto[];
  suppliers: SupplierRow[];
}) {
  const active = loans.filter((l) => l.status === "on_loan");
  // Supplier loans still owed back even after the customer swap.
  const owed = loans.filter(
    (l) => l.source === "supplier" && !l.returned_to_supplier_at,
  );
  const returnLoan = useReturnLoan(orderId);
  const returnSupplier = useReturnLoanSupplier(orderId);
  const borrow = useBorrowLoan(orderId);

  const [showBorrow, setShowBorrow] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");

  const visible = [...active, ...owed.filter((l) => l.status === "returned")];

  function submitBorrow() {
    if (!supplierId || !label.trim()) {
      toast.error("Pick a supplier + describe the piece");
      return;
    }
    borrow.mutate(
      {
        supplierId,
        borrowedLabel: label.trim(),
        category: category.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Borrowed — loaner out, owe the supplier a piece");
          setShowBorrow(false);
          setSupplierId("");
          setLabel("");
          setCategory("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const field =
    "border border-base-300 rounded-[3px] bg-white px-1.5 py-1 text-[12px] focus:border-primary focus:outline-none";

  return (
    <div className="p-3 space-y-2">
      {visible.length === 0 && !showBorrow && (
        <p className="text-[11px] text-base-400">
          No loaner out. Lend a substitute if the real piece isn't ready and the
          customer can't wait.
        </p>
      )}

      {visible.map((loan) => (
        <div key={loan.id} className="space-y-1.5">
          <LoanSwapBar loan={loan} />
          <div className="flex items-center gap-2 justify-end">
            {loan.status === "on_loan" && (
              <button
                type="button"
                onClick={() =>
                  returnLoan.mutate(
                    { loanId: loan.id },
                    {
                      onSuccess: () => toast.success("Collected — swap done"),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
                disabled={returnLoan.isPending}
                className="btn-secondary text-[11px]"
              >
                Collect (swap)
              </button>
            )}
            {loan.source === "supplier" &&
              loan.status === "returned" &&
              !loan.returned_to_supplier_at && (
                <button
                  type="button"
                  onClick={() =>
                    returnSupplier.mutate(
                      { loanId: loan.id },
                      {
                        onSuccess: () =>
                          toast.success("Returned to supplier — obligation closed"),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                  disabled={returnSupplier.isPending}
                  className="btn-secondary text-[11px]"
                >
                  Returned to supplier
                </button>
              )}
          </div>
        </div>
      ))}

      {showBorrow ? (
        <div className="rounded-md border border-base-200 p-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.04em] font-semibold text-[#8C877D]">
            Borrow from supplier
          </div>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className={`${field} w-full`}
          >
            <option value="">Pick a supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What piece? e.g. King bedframe"
            className={`${field} w-full`}
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional) — mattress / sofa / bedframe"
            className={`${field} w-full`}
          />
          <div className="flex items-center justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setShowBorrow(false)}
              className="btn-ghost text-[11px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitBorrow}
              disabled={borrow.isPending}
              className="btn-primary text-[11px]"
            >
              {borrow.isPending ? "Borrowing…" : "Borrow + loan out"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowBorrow(true)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="w-3 h-3" /> Borrow from supplier
        </button>
      )}
    </div>
  );
}
