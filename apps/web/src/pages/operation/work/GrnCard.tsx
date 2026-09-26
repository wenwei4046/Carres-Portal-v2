/**
 * THE GRN STEP — the Route's `GRN` point as a card (Jess, 2026-09-27: every
 * card tallies a Route step). Collapsed: `{r} of {n} received`. Expanded: one
 * line per PO — received on its GRN date, or not received yet. Read from the
 * Supplier model's receipt facts (Stock MASTER §7's one arithmetic); Work
 * counts nothing of its own.
 */
import type { ReactNode } from "react";
import { fmtDateShort } from "@/lib/fmt-date";
import { PartyCardShell, ToneLine } from "./PartyCardShell";
import { useSupplierCard } from "./SupplierCard";

export default function GrnCard({ orderId, open, onToggle, heading = "GRN · Warehouse", trailing }: {
  orderId: string; open: boolean; onToggle: (open: boolean) => void; heading?: string; trailing?: ReactNode;
}) {
  const { model } = useSupplierCard(orderId);
  const rows = model?.rows ?? [];
  /* Every goods need counts, issued or not — the same `{n}` the Route's GRN point prints. */
  const pos = rows;
  const received = pos.filter((r) => r.grnIso).length;
  const status = pos.length === 0
    ? <ToneLine tone="future">Not received yet</ToneLine>
    : <ToneLine tone={received === pos.length ? "done" : "future"} testId="work-grn-line">{`${received} of ${pos.length} received`}</ToneLine>;
  return (
    <PartyCardShell testId="work-grn" party="GRN" heading={heading} trailing={trailing} status={status} open={open} onToggle={onToggle}>
      {pos.length === 0 ? (
        <p className="text-body text-kit-slate-11">No purchase order for this Sales Order</p>
      ) : (
        <ul className="flex flex-col divide-y divide-kit-slate-4">
          {pos.map((r) => (
            <li key={r.poNo} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2 text-[13px] leading-[18px]">
              <span className="min-w-0 truncate text-kit-slate-12">{r.state === "notIssued" ? "No PO yet" : r.poNo}{r.supplier ? ` · ${r.supplier}` : ""}</span>
              <span className={r.grnIso ? "text-kit-slate-12" : "text-kit-slate-11"}>{r.grnIso ? `Received ${fmtDateShort(r.grnIso)}` : "Not received yet"}</span>
            </li>
          ))}
        </ul>
      )}
    </PartyCardShell>
  );
}
