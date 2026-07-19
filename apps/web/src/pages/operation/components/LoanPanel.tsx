import { useMemo, useState, type ReactNode } from "react";
import {
  Check,
  Plus,
  Package,
  AlertTriangle,
  Link2,
  BedDouble,
  Bed,
  Sofa,
  type LucideIcon,
} from "lucide-react";
import Segmented from "@/components/Segmented";
import Btn from "@/components/Btn";
import { toast } from "sonner";
import type { SofaLoanDto } from "@carres/shared";
import {
  useBorrowLoan,
  useReturnLoan,
  useReturnLoanSupplier,
  type SupplierRow,
} from "@/lib/queries";
import { lineCategory } from "@/lib/line-category";
import { fmtDateShort } from "@/lib/fmt-date";
import type { ReserveFreeUnit } from "./ReserveStockDialog";

/**
 * LoanPanel — "ON MISSION" card language (Jess 2026-07-19, approved from her
 * travel-itinerary sample): a loaner is a substitute piece lent while the real
 * one isn't ready. Each loaner = a GROUNDED white card (icon header · source ·
 * product name · date top-right) with LABELED key-value rows inside; pills are
 * retired — status reads from a green ✓ / an amber "due soon" row / a red
 * "overdue" row. No floating chips, no how-to sentences.
 *
 * Lend from the own WAREHOUSE (a free unit — swapped back) or BORROW from a
 * SUPPLIER (an obligation: owe a piece back, with a return-by deadline).
 *
 * Picking a warehouse unit (Jess's rulings 2026-07-19):
 *  · we OFFER what we can lend — the customer does NOT pick, and we do NOT
 *    match the ordered size ("got what we borrow what"). Show the full unit
 *    info so staff can read it: product · condition · date-in · original PO.
 *  · DISPLAY stock first, sellable NEW stock last + a soft guard (lending new
 *    sellable inventory as a temp loaner risks it — protect the stock).
 *  · a SOFA loaner must physically ENTER the customer's space → an explicit
 *    "checked it can enter" confirm gates the lend.
 * migration 0217 (no schema change here).
 */

/** Same labels as the rev20 stock picker — one vocabulary across the drawer. */
const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  exhibition: "Display",
  old: "Fair (used)",
  refurbished: "Refurbished",
  damaged: "Damaged",
};

/** Lend order — display/used stock first, sellable NEW last (protect stock). */
const COND_RANK: Record<string, number> = {
  exhibition: 0,
  refurbished: 1,
  old: 2,
  new: 3,
  damaged: 4,
};
const condRank = (c: string) => COND_RANK[c] ?? 3;

/** Condition tag tone: used/display = safe (green), new = sellable (amber),
 *  damaged = red. */
function condTone(c: string): string {
  if (c === "new") return "bg-warning-soft text-warning";
  if (c === "damaged") return "bg-error-soft text-danger";
  return "bg-success-soft text-success";
}

const TAG =
  "inline-flex items-center rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.02em]";

/** Category → icon, SAME map as the Items-ordered panel (drawer §710): a
 *  loaned mattress wears the mattress icon, bedframe the bed, sofa the sofa. */
function catIcon(cat: string | null | undefined): LucideIcon {
  return cat === "mattress"
    ? BedDouble
    : cat === "bedframe"
      ? Bed
      : cat === "sofa"
        ? Sofa
        : Package;
}

/** The supplier return-by deadline rides notes ("expected return YYYY-MM-DD")
 *  until it earns a real column (1B). Read it back so the obligation shows a
 *  date + can go overdue — never buried. */
function parseReturnBy(notes: string | null): string | null {
  const m = notes?.match(/expected return (\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Whole-day diff from today (MYT-agnostic; date-only). */
function daysFromToday(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const t = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`).getTime();
  return Math.round((d - t) / 86_400_000);
}

/** "day N since lent" for the at-customer row. */
function dayN(loan: SofaLoanDto): number | null {
  if (!loan.loaned_at) return null;
  const end = (loan.returned_at ?? new Date().toISOString()).slice(0, 10);
  const a = new Date(`${end}T00:00:00`).getTime();
  const b = new Date(`${loan.loaned_at.slice(0, 10)}T00:00:00`).getTime();
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

/* ── one grounded loan card ──────────────────────────────────────────────── */

function Row({
  k,
  children,
  action,
  tone,
}: {
  k: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "act" | "late";
}) {
  const bg = tone === "late" ? "bg-error-soft/40" : tone === "act" ? "bg-warning-soft/40" : "";
  return (
    <div
      className={`grid grid-cols-[80px_1fr_auto] items-center gap-2.5 px-3 py-1.5 border-t border-base-100 first:border-t-0 ${bg}`}
    >
      <span className="text-[11px] text-base-500">{k}</span>
      <span className="text-[12.5px] text-base-900 font-medium min-w-0">{children}</span>
      <span className="shrink-0">{action ?? null}</span>
    </div>
  );
}

function DoneTick({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-success font-semibold">
      <Check size={13} strokeWidth={2.5} />
      {children}
    </span>
  );
}

function LoanCard({
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
  const name = isSupplier
    ? (loan.borrowed_label ?? loan.borrowed_sku ?? "Borrowed piece")
    : (loan.item_sku ?? "Warehouse unit");
  const src = isSupplier
    ? `Borrowed · ${loan.supplier_name ?? "supplier"}`
    : "Warehouse · Klang";
  const returnBy = parseReturnBy(loan.notes);
  const nDay = dayN(loan);
  // OUT leg (0242) — how the loaner reached the customer.
  const sup = loan.supplier_name ?? "supplier";
  const routeText =
    loan.out_route === "supplier_warehouse_customer"
      ? `${sup} → Klang → customer`
      : loan.out_route === "supplier_customer"
        ? `${sup} → customer`
        : "Klang → customer";
  // category icon aligned with the Items-ordered panel
  const Icon = catIcon(
    loan.category ?? (loan.item_sku ? lineCategory(loan.item_sku) : "acc"),
  );

  return (
    <div className="bg-white border border-base-200 rounded-[11px] shadow-[0_1px_2px_rgba(16,24,40,0.05)] overflow-hidden">
      {/* header — icon · source/name · lent-out date */}
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className={`h-8 w-8 shrink-0 rounded-[9px] grid place-items-center ${
              closed ? "bg-success-soft text-success" : "bg-primary/10 text-primary"
            }`}
          >
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[0.05em] uppercase text-base-400">
              {src}
            </div>
            <div className="text-[13.5px] font-semibold text-base-900 truncate" title={name}>
              {name}
            </div>
          </div>
        </div>
        {loan.loaned_at && (
          <span className="font-mono text-[11.5px] text-base-400 pt-0.5 shrink-0">
            {fmtDateShort(loan.loaned_at)}
          </span>
        )}
      </div>

      {/* body — labeled rows */}
      <div className="border-t border-base-100">
        {!isSupplier && loan.item_condition && (
          <Row k="Condition">
            <span className={`${TAG} ${condTone(loan.item_condition)}`}>
              {CONDITION_LABEL[loan.item_condition] ?? loan.item_condition}
            </span>
          </Row>
        )}
        {isSupplier && loan.category && (
          <Row k="Category">
            <span className="capitalize">{loan.category}</span>
          </Row>
        )}
        {isSupplier && (
          <Row k="Route">
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <span>{routeText}</span>
              {loan.out_partner_name && (
                <span className={`${TAG} bg-base-100 text-base-500`}>
                  {loan.out_partner_name}
                </span>
              )}
            </span>
          </Row>
        )}
        {loan.do_number && (
          <Row k="Loan DO">
            <span className="inline-flex items-center gap-1 font-mono text-[11.5px] text-primary">
              <Link2 size={12} />
              {loan.do_number}
            </span>
          </Row>
        )}
        {loan.item_po && (
          <Row k="PO">
            <span className="font-mono text-[11.5px] text-base-700">{loan.item_po}</span>
          </Row>
        )}

        {/* at customer */}
        {swapped ? (
          <Row k="At customer">
            <DoneTick>
              Collected
              {loan.returned_at ? (
                <span className="text-base-400 font-normal ml-1">
                  · {fmtDateShort(loan.returned_at)}
                </span>
              ) : null}
            </DoneTick>
          </Row>
        ) : (
          <Row
            k="At customer"
            tone="act"
            action={
              <button
                type="button"
                onClick={onCollect}
                disabled={busy}
                className="btn-secondary text-[12px] py-0.5 px-2.5"
              >
                Collected back
              </button>
            }
          >
            Waiting swap back
            {nDay != null && <span className="text-base-400 font-normal ml-1">· day {nDay}</span>}
          </Row>
        )}

        {/* return to supplier — the obligation + its deadline */}
        {isSupplier &&
          (closed ? (
            <Row k="Return">
              <DoneTick>Returned to supplier</DoneTick>
            </Row>
          ) : (
            <Row
              k="Return by"
              tone={owed ? "act" : undefined}
              action={
                owed ? (
                  <button
                    type="button"
                    onClick={onReturnSupplier}
                    disabled={busy}
                    className="btn-primary text-[12px] py-0.5 px-2.5"
                  >
                    Mark returned
                  </button>
                ) : undefined
              }
            >
              {returnBy ? (
                <>
                  <span className="font-mono">{fmtDateShort(returnBy)}</span>
                  {(() => {
                    const d = daysFromToday(returnBy);
                    return d < 0 ? (
                      <span className="text-warning font-semibold ml-1">
                        · {Math.abs(d)} {Math.abs(d) === 1 ? "day" : "days"} past
                      </span>
                    ) : (
                      <span className={`ml-1 font-semibold ${d <= 3 ? "text-warning" : "text-base-400 font-normal"}`}>
                        · in {d} {d === 1 ? "day" : "days"}
                      </span>
                    );
                  })()}
                </>
              ) : (
                <span className="text-base-400 font-normal">owe 1 piece · no date set</span>
              )}
            </Row>
          ))}
      </div>
    </div>
  );
}

/* ── warehouse pick — "offer what we can lend" ───────────────────────────── */

type UnitGroup = {
  key: string;
  sku: string;
  condition: string;
  cat: string;
  count: number;
  firstId: string;
  poNo: string | null;
  dateIn: string | null;
  location?: string | null;
};

function WarehousePick({
  lendable,
  onLend,
}: {
  lendable: ReserveFreeUnit[];
  onLend?: (itemId: string, sku: string) => void;
}) {
  // Group identical units (sku + condition) → one row + a free count.
  const groups = useMemo<UnitGroup[]>(() => {
    const m = new Map<string, UnitGroup>();
    for (const u of lendable) {
      const key = `${u.sku}__${u.condition}`;
      let g = m.get(key);
      if (!g) {
        g = {
          key,
          sku: u.sku,
          condition: u.condition,
          cat: lineCategory(u.sku),
          count: 0,
          firstId: u.id,
          poNo: u.poNo,
          dateIn: u.dateIn,
          location: u.location,
        };
        m.set(key, g);
      }
      g.count += 1;
      if (u.dateIn && (!g.dateIn || u.dateIn < g.dateIn)) g.dateIn = u.dateIn;
    }
    return [...m.values()].sort(
      (a, b) => condRank(a.condition) - condRank(b.condition) || (a.dateIn ?? "").localeCompare(b.dateIn ?? ""),
    );
  }, [lendable]);

  const safe = groups.filter((g) => g.condition !== "new");
  const sellable = groups.filter((g) => g.condition === "new");

  // Sofa loaners must be confirmed to physically enter before lending.
  const [enterOk, setEnterOk] = useState<Set<string>>(new Set());
  const toggleEnter = (k: string) =>
    setEnterOk((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  if (lendable.length === 0)
    return <div className="text-[12px] text-base-500 px-1 py-1">No free unit to lend for this order.</div>;

  function UnitRow({ g }: { g: UnitGroup }) {
    const isSofa = g.cat === "sofa";
    const gated = isSofa && !enterOk.has(g.key);
    const UIcon = catIcon(g.cat);
    return (
      <div className="bg-white border border-base-200 rounded-[10px] px-2.5 py-2 mb-2">
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 shrink-0 rounded-[9px] grid place-items-center bg-base-100 text-base-500">
            <UIcon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-base-900 truncate" title={g.sku}>
              {g.sku}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className={`${TAG} ${condTone(g.condition)}`}>
                {CONDITION_LABEL[g.condition] ?? g.condition}
                {g.condition === "new" ? " · sellable" : ""}
              </span>
              <span className="text-[11px] text-base-500">{g.count} free</span>
              {g.dateIn && (
                <span className="font-mono text-[10.5px] text-base-500">in {fmtDateShort(g.dateIn)}</span>
              )}
              {g.poNo && (
                <span className="font-mono text-[10.5px] text-base-500">PO {g.poNo}</span>
              )}
              {g.location && <span className="text-[11px] text-base-500">{g.location}</span>}
            </div>
          </div>
          <Btn size="sm" onClick={() => onLend?.(g.firstId, g.sku)} disabled={!onLend || gated}>
            Lend out
          </Btn>
        </div>
        {isSofa && (
          <label className="flex items-center gap-2 mt-2 pl-[42px] text-[11.5px] text-base-600 cursor-pointer">
            <input
              type="checkbox"
              checked={enterOk.has(g.key)}
              onChange={() => toggleEnter(g.key)}
              className="accent-primary"
            />
            Checked it can enter the customer&apos;s space
          </label>
        )}
      </div>
    );
  }

  return (
    <div>
      {safe.length > 0 && (
        <>
          <div className="text-[10px] font-bold tracking-[0.05em] uppercase text-base-500 mb-1.5 px-0.5">
            Available to lend · display stock first
          </div>
          {safe.map((g) => (
            <UnitRow key={g.key} g={g} />
          ))}
        </>
      )}

      {sellable.length > 0 && (
        <>
          <div className="text-[10px] font-bold tracking-[0.05em] uppercase text-base-500 mt-2 mb-1.5 px-0.5">
            New stock · lend only if no display
          </div>
          {safe.length > 0 && (
            <div className="flex items-start gap-1.5 bg-warning-soft/60 border border-warning/30 rounded-[8px] px-2.5 py-1.5 mb-2 text-[11px] text-warning">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              This is sellable new stock — lend a display unit above when you have one.
            </div>
          )}
          {sellable.map((g) => (
            <UnitRow key={g.key} g={g} />
          ))}
        </>
      )}
    </div>
  );
}

/* ── panel ───────────────────────────────────────────────────────────────── */

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
  /** ALL free warehouse units (scoped here to the order's categories) — the
   *  "my warehouse free stock" lend source (§7.9). */
  freeUnits?: ReserveFreeUnit[];
  /** The order's core categories (mattress/bedframe/sofa) — filters the
   *  warehouse lend list to same-category units. */
  orderCategories?: string[];
  /** Lend a picked warehouse unit (opens the loan-DO prompt in the parent). */
  onLend?: (itemId: string, sku: string) => void;
}) {
  const active = loans.filter((l) => l.status === "on_loan");
  const owed = loans.filter((l) => l.source === "supplier" && !l.returned_to_supplier_at);
  const returnLoan = useReturnLoan(orderId);
  const returnSupplier = useReturnLoanSupplier(orderId);
  const borrow = useBorrowLoan(orderId);

  // in-flight loans only (active + still-owed-to-supplier)
  const visible = [...active, ...owed.filter((l) => l.status === "returned")];

  const catSet = new Set(orderCategories);
  const lendable = freeUnits.filter((u) => catSet.has(lineCategory(u.sku)));

  // §7.9 lend flow — closed by default; "+ Lend" opens the two-source choice.
  const [lending, setLending] = useState(false);
  const [source, setSource] = useState<"warehouse" | "supplier">("warehouse");
  const [supplierId, setSupplierId] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [returnDate, setReturnDate] = useState("");
  // OUT leg (0242) — a supplier borrow ships straight to the customer, or via
  // our warehouse first.
  const [outRoute, setOutRoute] = useState<
    "supplier_customer" | "supplier_warehouse_customer"
  >("supplier_customer");

  function resetLend() {
    setLending(false);
    setSource("warehouse");
    setSupplierId("");
    setLabel("");
    setCategory("");
    setReturnDate("");
    setOutRoute("supplier_customer");
  }

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
        outRoute,
        // return-by rides notes until it earns a real column (1B).
        notes: returnDate ? `expected return ${returnDate}` : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Borrowed — loaner out, owe the supplier a piece");
          resetLend();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const field =
    "border border-base-300 rounded-[6px] bg-white px-2 py-1.5 text-[12px] focus:border-primary focus:outline-none";

  return (
    <div className="p-3 space-y-2.5">
      {visible.map((loan) => (
        <LoanCard
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
                onSuccess: () => toast.success("Returned to supplier — obligation closed"),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        />
      ))}

      {!lending && (
        <Btn size="sm" icon={Plus} onClick={() => setLending(true)}>
          Lend a loaner
        </Btn>
      )}

      {lending && (
        <div className="bg-base-50 border border-base-200 rounded-[11px] p-2.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Segmented
              ariaLabel="Loaner source"
              options={[
                { value: "warehouse", label: `Warehouse · ${lendable.length}` },
                { value: "supplier", label: "Borrow from supplier" },
              ]}
              value={source}
              onChange={(v) => setSource(v as "warehouse" | "supplier")}
            />
            <Btn size="sm" variant="ghost" onClick={resetLend}>
              Cancel
            </Btn>
          </div>

          {source === "warehouse" && <WarehousePick lendable={lendable} onLend={onLend} />}

          {source === "supplier" && (
            <div className="space-y-2">
              <div className="text-[11px] text-base-500 px-0.5">
                Borrow whatever the supplier currently has — describe the piece.
              </div>
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
              {/* OUT leg (0242) — how it reaches the customer */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11.5px] text-base-500 shrink-0">Send</span>
                <Segmented
                  ariaLabel="Loaner delivery route"
                  options={[
                    { value: "supplier_customer", label: "Direct to customer" },
                    { value: "supplier_warehouse_customer", label: "Via warehouse" },
                  ]}
                  value={outRoute}
                  onChange={(v) =>
                    setOutRoute(
                      v as "supplier_customer" | "supplier_warehouse_customer",
                    )
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-base-500 shrink-0">Return by</span>
                <ReturnByChip value={returnDate} onChange={setReturnDate} />
              </div>
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

/** Formatted date chip → reveals a native picker on click (the drawer's date
 *  law: show "31 Jul 26", never a raw dd/mm/yyyy box). */
function ReturnByChip({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open || !value) {
    return (
      <input
        type="date"
        autoFocus={open}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setOpen(false)}
        aria-label="Expected return to supplier"
        className="border border-base-300 rounded-[6px] bg-white px-2 py-1 text-[12px] focus:border-primary focus:outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center font-mono text-[12px] font-semibold text-base-800 border border-base-300 border-dashed rounded-[6px] px-2 py-1 bg-white"
    >
      {fmtDateShort(value)}
    </button>
  );
}
