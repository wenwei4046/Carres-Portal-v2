import { useState, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import type { SofaLoanDto } from "@carres/shared";
import {
  useBorrowLoan,
  useReturnLoan,
  useReturnLoanSupplier,
  type SupplierRow,
} from "@/lib/queries";
import { lineCategory } from "@/lib/line-category";
import { fmtDate } from "@/lib/fmt-date";
import type { ReserveFreeUnit } from "./ReserveStockDialog";

/**
 * LoanPanel (Jess 2026-07-19, option A): the loaner story in the SAME
 * vertical step grammar as the Storage card / left-rail spine — ONE
 * progress language across the whole order page. A loaner is a substitute
 * piece lent while the real one isn't ready: from the own WAREHOUSE (a
 * free unit, swapped back) or BORROWED from a SUPPLIER (an obligation —
 * owe them a piece back, its own step so it's never forgotten).
 * Chip/pill law: every fact in a chip or pill, no prose, no glyph arrows,
 * no how-to sentences. migration 0217.
 */

type StepState = "done" | "act" | "wait" | "todo";

const CHIP =
  "inline-flex items-center font-mono text-[12px] font-semibold text-base-800 border border-base-200 rounded-[6px] px-1.5 py-0.5 bg-white";
const SOFT = "pill bg-base-100 text-base-500";

function Node({ n, state }: { n: number; state: StepState }) {
  return (
    <span
      className={`relative z-[1] w-6 h-6 rounded-full grid place-items-center text-[12px] font-bold shrink-0 ${
        state === "done"
          ? "bg-base-800 text-white"
          : state === "act"
            ? "bg-error-soft text-danger ring-2 ring-danger"
            : state === "wait"
              ? "bg-warning-soft text-warning"
              : "bg-white border-2 border-base-300 text-base-400"
      }`}
    >
      {state === "done" ? <Check size={14} strokeWidth={3} /> : n}
    </span>
  );
}

function StepRow({
  n,
  state,
  title,
  children,
  last,
}: {
  n: number;
  state: StepState;
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`relative flex items-start gap-2.5 ${last ? "" : "pb-3"}`}>
      {!last && (
        <span
          aria-hidden="true"
          className={`absolute left-[11px] top-7 bottom-0 w-0.5 ${
            state === "done" ? "bg-base-800" : "bg-base-200"
          }`}
        />
      )}
      <Node n={n} state={state} />
      <div className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-base-900">
          {title}
        </span>
        <div className="text-[12px] text-base-500">{children}</div>
      </div>
    </div>
  );
}

/** One loan as vertical steps: lent out → at customer → (supplier) return. */
function LoanSteps({
  loan,
  onCollect,
  onReturnSupplier,
  busy,
}: {
  loan: SofaLoanDto;
  onCollect: () => void;
  onReturnSupplier: () => void;
  busy: boolean;
}) {
  const isSupplier = loan.source === "supplier";
  const swapped = loan.status === "returned";
  const owed = isSupplier && swapped && !loan.returned_to_supplier_at;
  const closed = isSupplier ? !!loan.returned_to_supplier_at : swapped;
  const piece = isSupplier
    ? (loan.borrowed_label ?? loan.borrowed_sku ?? "piece")
    : (loan.item_sku ?? "piece");
  const origin = isSupplier ? (loan.supplier_name ?? "supplier") : "Klang";
  const dayN = loan.loaned_at
    ? Math.max(
        0,
        Math.round(
          (new Date(
            `${(loan.returned_at ?? new Date().toISOString()).slice(0, 10)}T00:00:00`,
          ).getTime() -
            new Date(`${loan.loaned_at.slice(0, 10)}T00:00:00`).getTime()) /
            86_400_000,
        ),
      )
    : null;

  return (
    <div className="rounded-[10px] border border-base-200/70 p-3">
      <StepRow n={1} state="done" title="Lent out">
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <span className={CHIP}>{piece}</span>
          <span className={isSupplier ? "pill pill-warning" : SOFT}>
            {isSupplier ? `borrowed · ${origin}` : `warehouse · ${origin}`}
          </span>
          {loan.loaned_at && (
            <span className={CHIP}>{fmtDate(loan.loaned_at.slice(0, 10))}</span>
          )}
        </span>
      </StepRow>

      <StepRow
        n={2}
        state={swapped ? "done" : "wait"}
        title="At customer"
        last={!isSupplier}
      >
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          {swapped ? (
            <span className="pill pill-confirmed">
              collected
              {loan.returned_at
                ? ` · ${fmtDate(loan.returned_at.slice(0, 10))}`
                : ""}
            </span>
          ) : (
            <>
              {dayN != null && <span className={SOFT}>day {dayN}</span>}
              <button
                type="button"
                onClick={onCollect}
                disabled={busy}
                className="btn-secondary text-[12px] py-0.5 px-2"
              >
                Collect swap
              </button>
            </>
          )}
        </span>
      </StepRow>

      {isSupplier && (
        <StepRow
          n={3}
          state={closed ? "done" : owed ? "wait" : "todo"}
          title="Return to supplier"
          last
        >
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            {closed ? (
              <span className="pill pill-confirmed">returned</span>
            ) : owed ? (
              <>
                <span className="pill pill-warning">owe {origin} 1 pc</span>
                <button
                  type="button"
                  onClick={onReturnSupplier}
                  disabled={busy}
                  className="btn-secondary text-[12px] py-0.5 px-2"
                >
                  Returned
                </button>
              </>
            ) : (
              <span className={SOFT}>—</span>
            )}
          </span>
        </StepRow>
      )}
    </div>
  );
}

export default function LoanPanel({
  orderId,
  loans,
  suppliers,
  freeUnits = [],
  orderCategories = [],
  onLend,
}: {
  orderId: string;
  loans: SofaLoanDto[];
  suppliers: SupplierRow[];
  /** ALL free warehouse units (the panel scopes them to the order's
   *  categories) — the "my warehouse free stock" lend source (§7.9). */
  freeUnits?: ReserveFreeUnit[];
  /** The order's core categories (mattress/bedframe/sofa) — the same-category
   *  filter for the warehouse lend list. */
  orderCategories?: string[];
  /** Lend a picked warehouse unit (opens the loan-DO prompt in the parent). */
  onLend?: (itemId: string, sku: string) => void;
}) {
  const active = loans.filter((l) => l.status === "on_loan");
  const owed = loans.filter(
    (l) => l.source === "supplier" && !l.returned_to_supplier_at,
  );
  const returnLoan = useReturnLoan(orderId);
  const returnSupplier = useReturnLoanSupplier(orderId);
  const borrow = useBorrowLoan(orderId);

  // §7.9 lend flow — closed by default; "+ Lend" opens the two-source choice.
  const [source, setSource] = useState<"" | "warehouse" | "supplier">("");
  const [lending, setLending] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");

  const visible = [...active, ...owed.filter((l) => l.status === "returned")];

  const catSet = new Set(orderCategories);
  const lendable = freeUnits.filter((u) => catSet.has(lineCategory(u.sku)));

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
        // Expected return rides notes until it gets a real column (deploy-gated).
        notes: expectedReturn ? `expected return ${expectedReturn}` : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Borrowed — loaner out, owe the supplier a piece");
          setLending(false);
          setSource("");
          setSupplierId("");
          setLabel("");
          setCategory("");
          setExpectedReturn("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const field =
    "border border-base-300 rounded-[6px] bg-white px-1.5 py-1 text-[12px] focus:border-primary focus:outline-none";

  return (
    <div className="p-3 space-y-2.5">
      {/* header — the quiet fact + the ONE action */}
      <div className="flex items-center gap-2">
        {visible.length === 0 ? (
          <span className={SOFT}>no loaner</span>
        ) : (
          <span className={SOFT}>
            {visible.length} loaner{visible.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="flex-1" />
        {!lending && (
          <button
            type="button"
            onClick={() => setLending(true)}
            className="btn-secondary text-[12px] py-1 px-2.5 inline-flex items-center gap-1"
          >
            <Plus size={14} /> Lend
          </button>
        )}
      </div>

      {visible.map((loan) => (
        <LoanSteps
          key={loan.id}
          loan={loan}
          busy={returnLoan.isPending || returnSupplier.isPending}
          onCollect={() =>
            returnLoan.mutate(
              { loanId: loan.id },
              {
                onSuccess: () => toast.success("Collected — swap done"),
                onError: (e) => toast.error(e.message),
              },
            )
          }
          onReturnSupplier={() =>
            returnSupplier.mutate(
              { loanId: loan.id },
              {
                onSuccess: () =>
                  toast.success("Returned to supplier — obligation closed"),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        />
      ))}

      {/* lend flow — two framed sources, one open at a time */}
      {lending && (
        <div className="rounded-[10px] border border-base-200/70 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSource("warehouse")}
              aria-pressed={source === "warehouse"}
              className={`text-[12px] font-semibold px-2.5 py-1 rounded-full border ${
                source === "warehouse"
                  ? "bg-base-900 text-white border-base-900"
                  : "bg-white text-base-700 border-base-200"
              }`}
            >
              Warehouse · {lendable.length}
            </button>
            <button
              type="button"
              onClick={() => setSource("supplier")}
              aria-pressed={source === "supplier"}
              className={`text-[12px] font-semibold px-2.5 py-1 rounded-full border ${
                source === "supplier"
                  ? "bg-base-900 text-white border-base-900"
                  : "bg-white text-base-700 border-base-200"
              }`}
            >
              Borrow from supplier
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setLending(false);
                setSource("");
              }}
              className="btn-ghost text-[12px] py-0.5 px-2"
            >
              Cancel
            </button>
          </div>

          {source === "warehouse" && (
            <div className="space-y-1">
              {lendable.length === 0 && <span className={SOFT}>no free unit</span>}
              {lendable.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-2 text-[12px] border-b border-base-100 last:border-b-0 py-1"
                >
                  <span
                    className="font-mono text-base-900 truncate flex-1"
                    title={u.sku}
                  >
                    {u.sku}
                  </span>
                  {u.dateIn && (
                    <span className={SOFT}>
                      in {fmtDate(u.dateIn).split(", ")[0]}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onLend?.(u.id, u.sku)}
                    disabled={!onLend}
                    title="Issue a loan DO + mark this unit on-loan to the order"
                    className="btn-secondary text-[12px] py-0.5 px-2 shrink-0"
                  >
                    Lend out
                  </button>
                </div>
              ))}
            </div>
          )}

          {source === "supplier" && (
            <div className="space-y-1.5">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                aria-label="Supplier"
                className={`${field} w-full`}
              >
                <option value="">Supplier…</option>
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}
                  </option>
                ))}
              </select>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Piece, e.g. King bedframe"
                aria-label="Borrowed piece"
                className={`${field} w-full`}
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Category"
                className={`${field} w-full`}
              >
                <option value="">Category…</option>
                <option value="mattress">Mattress</option>
                <option value="bedframe">Bedframe</option>
                <option value="sofa">Sofa</option>
              </select>
              <label className="flex items-center gap-2 text-[12px] text-base-500">
                <span className="shrink-0">Return by</span>
                <input
                  type="date"
                  value={expectedReturn}
                  onChange={(e) => setExpectedReturn(e.target.value)}
                  aria-label="Expected return to supplier"
                  className={`${field} flex-1`}
                />
              </label>
              <div className="flex items-center justify-end pt-0.5">
                <button
                  type="button"
                  onClick={submitBorrow}
                  disabled={borrow.isPending}
                  className="btn-primary text-[12px]"
                >
                  {borrow.isPending ? "Borrowing…" : "Borrow + lend out"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
