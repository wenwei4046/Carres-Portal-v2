/**
 * THE PARTY CARDS — the Work right panel's `Logistics · Customer · Supplier`
 * (owner rulings 2026-09-24, docs/workspace/MASTER.md §5.9).
 *
 * Logistics is the one card with an approved specification and its own acts.
 * Customer and Supplier share its stable shell but carry ONLY facts their
 * owners already publish, and one door to that owner — no new SOP, no action
 * of their own until their specifications are approved.
 *
 * A party card appears only when the selected work names exactly ONE Sales
 * Order: a purchase order that serves many orders has no single customer.
 */
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { OperationWorkItem } from "@carres/shared";
import Icon from "@/components/kit/Icon";
import { displayCustomerName } from "@/lib/customer-name";
import { useLogisticsCardFacts } from "@/lib/queries";
import { useDeliveryScopeCard, useOrderIdFromRef } from "../delivery-scope-card";
import LogisticsCard, { PARTY_COPY } from "./LogisticsCard";
import { WorkSection } from "./WorkCard";

export const PARTIES_COPY = {
  customer: "Customer",
  supplier: "Supplier",
  openSalesOrder: "Open Sales Order",
  noSupplier: "No purchase order for this Sales Order",
  phone: "Phone",
  address: "Delivery address",
  notRecorded: "Not recorded",
} as const;

/** The order a work item names, or null when it names several / none. */
export function orderRefOf(item: OperationWorkItem): { orderId?: string | null; soLabel?: string | null; doNumber?: string | null } | null {
  const kind = item.object.kind;
  if (kind === "sales_order" || kind === "delivery_scope") return { orderId: item.object.id };
  if (kind === "delivery_order") return { doNumber: item.object.id };
  if (/^SO-\d+/.test(item.object.label)) return { soLabel: item.object.label };
  return null;
}

function PartyShell({ title, summary, children, testId }: { title: string; summary: ReactNode; children: ReactNode; testId: string }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <WorkSection className="shrink-0" data-testid={testId} aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-[72px] w-full items-center gap-2 rounded-work px-3 text-left hover:bg-kit-slate-2 focus-visible:ring-2 focus-visible:ring-kit-blue-9 min-[960px]:h-auto min-[960px]:items-start min-[960px]:gap-3 min-[960px]:px-4 min-[960px]:py-3"
        data-testid={`${testId}-toggle`}
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <span className="grid h-10 w-10 shrink-0 place-items-center text-kit-slate-11 min-[960px]:mt-0.5 min-[960px]:h-auto min-[960px]:w-auto" data-testid={`${testId}-chevron`}><Icon name={open ? "collapse" : "expand"} size={16} /></span>
      </button>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-2 border-t border-work-line px-3 py-2.5 min-[960px]:px-4 min-[960px]:py-3">
          {children}
        </div>
      ) : null}
    </WorkSection>
  );
}

function CustomerCard({ orderId }: { orderId: string }) {
  const { card } = useDeliveryScopeCard(orderId);
  const o = card?.scope.o;
  if (!o) return null;
  const name = displayCustomerName(o.customer_name) || PARTIES_COPY.notRecorded;
  return (
    <PartyShell
      title={PARTIES_COPY.customer}
      testId="party-customer"
      summary={<span className="text-[15px] font-semibold leading-5 text-kit-slate-12">{PARTIES_COPY.customer} · {name}</span>}
    >
      <div className="text-body text-kit-slate-12">{PARTIES_COPY.phone}: {o.customer_phone || PARTIES_COPY.notRecorded}</div>
      <div className="text-body text-kit-slate-12">{PARTIES_COPY.address}: {(o.customer_address ?? "").trim() || PARTIES_COPY.notRecorded}</div>
      <Link className="inline-flex min-h-6 items-center gap-1 self-start text-label text-kit-blue-11 hover:underline" to={`/operation/orders/so/${encodeURIComponent(orderId)}`}>
        {PARTIES_COPY.openSalesOrder}
        <Icon name="open" size={14} />
      </Link>
    </PartyShell>
  );
}

function SupplierCard({ orderId }: { orderId: string }) {
  const factsQ = useLogisticsCardFacts(orderId);
  const pos = (factsQ.data?.routes ?? []).flatMap((r) => r.purchaseOrders);
  const suppliers = [...new Set(pos.map((p) => p.supplier).filter((v): v is string => Boolean(v)))];
  return (
    <PartyShell
      title={PARTIES_COPY.supplier}
      testId="party-supplier"
      summary={
        <span className="text-[15px] font-semibold leading-5 text-kit-slate-12">
          {PARTIES_COPY.supplier} · {suppliers.length > 0 ? suppliers.join(" · ") : PARTIES_COPY.noSupplier}
        </span>
      }
    >
      {pos.length === 0 ? <p className="text-body text-kit-slate-11">{PARTIES_COPY.noSupplier}</p> : null}
      {pos.map((po) => (
        <div key={po.poNo} className="text-body text-kit-slate-12">{PARTY_COPY.poLine(po.poNo, po.supplier)}</div>
      ))}
      <Link className="inline-flex min-h-6 items-center gap-1 self-start text-label text-kit-blue-11 hover:underline" to="/operation/procurement">
        {PARTY_COPY.openPurchasing}
        <Icon name="open" size={14} />
      </Link>
    </PartyShell>
  );
}

export default function WorkParties({ item }: { item: OperationWorkItem }) {
  const ref = orderRefOf(item);
  const orderId = useOrderIdFromRef(ref ?? {});
  const scope = useDeliveryScopeCard(orderId);
  /* A party card speaks only about an order Delivery can actually read: an
     order it cannot find draws nothing, never a guessed `Logistics not
     assigned`. */
  if (!ref || !orderId || (!scope.card && !scope.loading)) return null;
  return (
    <div className="flex flex-col gap-2 min-[960px]:gap-4" data-testid="work-parties">
      <LogisticsCard orderId={orderId} />
      <CustomerCard orderId={orderId} />
      <SupplierCard orderId={orderId} />
    </div>
  );
}
