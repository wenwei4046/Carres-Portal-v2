import { useMemo, useState } from "react";
import { toast } from "sonner";
import { maxLeadDaysFor, type Order } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCatalog, useSetOrderDate } from "@/lib/queries";
import { ModalShell } from "./TopUpDepositModal";

interface Props {
  order: Order;
  onClose: () => void;
}

/**
 * ConfirmDateModal — proto/dealer-action-modals.jsx:240-462 (slimmed). The
 * dealer picks a delivery date for an order whose `delivery.dateTbd === true`.
 * Past dates are blocked. Quick chips offer Today / +1w / +2w / +1m for
 * common scheduling shortcuts. Slot + note from proto are deferred — schema
 * doesn't carry them yet and proto's slot picker is largely informational.
 */
export default function ConfirmDateModal({ order, onClose }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // 2026-05-22 (Loo) — production lead-time floor (mattress + bedframe 14d,
  // sofa 21d, see shared DELIVERY_LEAD_DAYS). When this modal pops up the
  // order is in Place with `dateTbd: true`; the wizard's Step 3 floor never
  // ran for it, so we enforce the same gate here.
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
    return maxLeadDaysFor([...cats]);
  }, [catalogQ.data, order.lines]);
  const minPickable = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + minLeadDays);
    return d;
  }, [today, minLeadDays]);

  const initialDate = useMemo(() => {
    if (order.delivery.date && !order.delivery.dateTbd) {
      const d = new Date(order.delivery.date);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        // Snap forward if a stale TBD edge somehow stored a sub-lead date.
        if (d < minPickable) return minPickable;
        return d;
      }
    }
    return minPickable;
  }, [order.delivery.date, order.delivery.dateTbd, minPickable]);

  const [viewMonth, setViewMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );
  const [selected, setSelected] = useState<Date>(initialDate);

  // Phase 11.1 — confirming a TBD order now sets BOTH the delivery date and the
  // proceed (production-start) date. Proceed is bounded today..deliveryDate.
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayIso = toIso(today);
  const selectedIso = toIso(selected);
  const [proceedDate, setProceedDate] = useState<string>(toIso(today));
  const proceedValid = proceedDate >= todayIso && proceedDate <= selectedIso;

  const setDateMut = useSetOrderDate(order.id, {
    onSuccess: () => {
      toast.success(`Delivery date set for #${order.so}`);
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
      toast.error(err.message || "Could not set delivery date");
    },
  });

  // 6×7 grid for the visible month, week starts Monday
  const grid = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startWeekday = (first.getDay() + 6) % 7; // Mon=0
    const start = new Date(first);
    start.setDate(first.getDate() - startWeekday);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [viewMonth]);

  function shiftMonth(delta: number) {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  function pickQuick(kind: "earliest" | "1w" | "2w" | "1m") {
    let d: Date;
    if (kind === "earliest") {
      d = new Date(minPickable);
    } else {
      d = new Date(today);
      if (kind === "1w") d.setDate(d.getDate() + 7);
      if (kind === "2w") d.setDate(d.getDate() + 14);
      if (kind === "1m") d.setMonth(d.getMonth() + 1);
      // Floor to minPickable so a chip never lands on a sub-lead-time date.
      if (d < minPickable) d = new Date(minPickable);
    }
    setSelected(d);
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  const monthLabel = viewMonth.toLocaleDateString("en-MY", {
    month: "long",
    year: "numeric",
  });

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  /** Any date earlier than `minPickable` is unselectable — that covers
   *  both past dates AND the production lead-time floor when one applies. */
  const isBlocked = (d: Date) => d < minPickable;

  const canSubmit = !isBlocked(selected) && proceedValid && !setDateMut.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    setDateMut.mutate({ date: selectedIso, proceedDate });
  }
  const selectedLabel = selected.toLocaleDateString("en-MY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <header className="px-7 pt-5 pb-3.5 border-b border-base-100">
        <p className="kicker">Delivery date · #{order.so}</p>
        <h2 className="font-display text-[22px] mt-0.5 tracking-[-0.02em] leading-[1.2] font-semibold">
          Confirm delivery date
        </h2>
        <p className="text-xs text-base-600 mt-1">
          {minLeadDays > 0
            ? `Earliest is ${minPickable.toLocaleDateString("en-MY", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })} (${minLeadDays}-day production lead time).`
            : "Earliest is today. Past dates are blocked."}
        </p>
      </header>

      {/* Body */}
      <div className="px-7 py-6 overflow-auto flex-1 flex flex-col gap-4">
        {/* Quick chips */}
        <div className="flex gap-1.5 flex-wrap">
          {(
            [
              {
                key: "earliest" as const,
                label: minLeadDays > 0 ? `Earliest (+${minLeadDays}d)` : "Today",
              },
              { key: "1w" as const, label: "+1 week" },
              { key: "2w" as const, label: "+2 weeks" },
              { key: "1m" as const, label: "+1 month" },
            ]
          ).map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => pickQuick(c.key)}
              className="px-3 py-1.5 rounded border-[1.5px] border-base-200 text-xs text-base-700 hover:border-primary/40 hover:bg-signature-50 transition-colors"
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Calendar */}
        <div className="rounded border border-base-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-base-100 bg-base-50">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="text-base-700 hover:text-base-900 px-2"
              aria-label="Previous month"
            >
              ←
            </button>
            <span className="font-display font-semibold text-[15px]">{monthLabel}</span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="text-base-700 hover:text-base-900 px-2"
              aria-label="Next month"
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider font-semibold text-base-500 px-1.5 pt-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-1 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 p-1.5 pt-1">
            {grid.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const blocked = isBlocked(d);
              const isSelected = sameDay(d, selected);
              const isToday = sameDay(d, today);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={blocked}
                  onClick={() => !blocked && setSelected(d)}
                  className={`aspect-square text-[12px] rounded grid place-items-center transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold"
                      : blocked
                        ? "text-base-300 cursor-not-allowed"
                        : isToday
                          ? "bg-signature-50 text-primary font-semibold border border-primary"
                          : inMonth
                            ? "text-base-800 hover:bg-base-50"
                            : "text-base-400"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected confirmation */}
        <div className="rounded p-3 bg-base-50 border border-base-200">
          <p className="text-xs text-base-600">Selected delivery date</p>
          <p className="font-display text-[18px] font-semibold mt-0.5 text-base-900">
            {selectedLabel}
          </p>
        </div>

        {/* Phase 11.1 — proceed (production-start) date, paired with delivery */}
        <div className="rounded p-3 bg-base-50 border border-base-200">
          <label className="block">
            <span className="text-xs text-base-600">Proceed date · production start</span>
            <input
              type="date"
              value={proceedDate}
              min={todayIso}
              max={selectedIso}
              onChange={(e) => setProceedDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-base-300 rounded text-sm outline-none focus:border-primary bg-white"
              data-testid="confirm-proceed-date"
            />
          </label>
          <p className="text-[11px] text-base-500 mt-1.5">
            When production should start — on or before the delivery date.
          </p>
          {!proceedValid && (
            <p className="text-[11px] text-warning mt-1">
              Proceed date must be today or later and on/before the delivery date.
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="px-7 py-3.5 border-t border-base-100 bg-base-50 flex justify-between items-center">
        <p className="text-[11px] text-base-600">
          Order will move out of <strong>Place</strong> when all blockers cleared.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="btn-primary"
          >
            {setDateMut.isPending ? "Saving…" : "Confirm date"}
          </button>
        </div>
      </footer>
    </ModalShell>
  );
}
