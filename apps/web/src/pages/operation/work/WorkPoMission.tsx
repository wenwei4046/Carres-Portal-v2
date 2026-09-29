/**
 * THE PO VIEW — Workspace MASTER §5.10 A3/A4 (LOCKED 2026-09-28).
 *
 * A PO-level act whose PO serves two or more Sales Orders (or stock) never
 * picks one order's Route — that would be a guess. The Mission shows the PO:
 *
 *   header          `{PO No} · {Supplier}` over
 *                   `PO Delivery Date {date} · Expected arrival {date} ·
 *                   Related orders · {n}`
 *   the acts        one card per act, the owning module's form inside it
 *   Related orders  one line per order: `{SO No} · {customer} · Requested
 *                   {date}`; pressing one shows that order's Route with a
 *                   `Back to {PO No}` line; it creates and completes nothing
 *
 * "Which orders" is the PO's own source-order lineage (SO Batch), never
 * inferred from goods or suppliers.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { poDocumentNumberOf } from "@carres/shared";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import RouteStop from "@/components/kit/RouteStop";
import { displayCustomerName } from "@/lib/customer-name";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useOperationOrders } from "@/lib/queries";
import type { WorkRow } from "../use-open-work";
import { useNavigate } from "react-router-dom";
import { SupplierAnswerForm, useRefreshWork, WorkDocumentSheet, type WorkDocument } from "./WorkActForms";
import type { WorkOrderIndex } from "./work-orders";
import type { WorkAct } from "./work-stops";

export const PO_VIEW_COPY = {
  poDeliveryDate: (date: string) => `PO Delivery Date ${date}`,
  expectedArrival: (date: string) => `Expected arrival ${date}`,
  related: (n: number) => `Related orders · ${n}`,
  requested: (date: string) => `Requested ${date}`,
  notRecorded: "Not recorded",
  loading: "Loading…",
} as const;

interface PoHeadRow {
  id: string;
  version?: number | null;
  official_delivery_date?: string | null;
}

export default function WorkPoMission({
  poId,
  acts,
  items,
  index,
  onOpenOrder,
  onPickAct,
}: {
  poId: string;
  acts: readonly WorkAct[];
  items: readonly WorkRow[];
  index: WorkOrderIndex;
  onOpenOrder: (orderId: string) => void;
  onPickAct: (act: WorkAct) => void;
}) {
  const refresh = useRefreshWork();
  const navigate = useNavigate();
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [doc, setDoc] = useState<WorkDocument | null>(null);
  const row = useQuery({
    queryKey: ["operation", "pos", "one", poId],
    queryFn: () => apiFetch<{ pos: PoHeadRow[] }>(`/api/operation/pos?status=all&poId=${encodeURIComponent(poId)}`),
    staleTime: 10_000,
  });
  const ordersQ = useOperationOrders();
  const po = row.data?.pos.find((p) => p.id === poId) ?? null;
  const documentNo = poDocumentNumberOf(poId, po?.version ?? 1);
  const supplierName = items.find((i) => i.recipient)?.recipient ?? null;
  const related = useMemo(() => index.poOrders.get(poId) ?? [], [index.poOrders, poId]);
  /* The supplier's newest date, as the order list carries it per PO. */
  const expected = useMemo(() => {
    for (const o of ordersQ.data?.orders ?? []) {
      const arrival = (o as { po_arrivals?: Array<{ poId: string; plannedIso: string | null }> }).po_arrivals?.find((a) => a.poId === poId);
      if (arrival?.plannedIso) return arrival.plannedIso;
    }
    return null;
  }, [ordersQ.data, poId]);

  const itemOf = (act: WorkAct) => items.find((i) => i.id === act.occurrenceId) ?? null;
  const facts = [
    PO_VIEW_COPY.poDeliveryDate(po?.official_delivery_date ? fmtDate(po.official_delivery_date) : PO_VIEW_COPY.notRecorded),
    expected ? PO_VIEW_COPY.expectedArrival(fmtDate(expected)) : null,
    PO_VIEW_COPY.related(related.length),
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="work-po-mission">
      <header className="flex h-16 shrink-0 flex-col justify-center border-b border-kit-slate-5 bg-white px-6" data-testid="work-po-header">
        <div className="flex min-w-0 items-baseline gap-2">
          <button
            type="button"
            onClick={() => setDoc({ kind: "po", poId, number: documentNo })}
            className="text-strong text-kit-slate-12 underline decoration-kit-slate-9 underline-offset-2"
            data-testid="work-po-number"
          >
            {documentNo}
          </button>
          {supplierName ? <span className="truncate text-strong text-kit-slate-12">· {supplierName}</span> : null}
        </div>
        <span className="truncate text-body text-kit-slate-11">{facts}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {acts.map((act, i) => {
          const item = itemOf(act);
          const assigned = item?.source.owner.acting;
          const formOpen = openForm === act.key;
          return (
            <RouteStop key={act.key} label={act.stop === "supplier" ? "SUPPLIER" : act.stop === "receiving" ? "RECEIVING" : "PURCHASING"} tone={act.missed ? "missed" : "due"} last={i === acts.length - 1}>
              <Block
                title={act.title}
               
                why={act.why ? { text: act.why, tone: act.missed ? "missed" : "due" } : null}
                headerSlot={
                  act.kind === "other" && item ? (
                    <Button size="touch" onClick={() => navigate(item.destination)}>{`Open ${item.source.object.label}`}</Button>
                  ) : act.kind === "supplier_answer" && !formOpen ? (
                    <Button size="touch" onClick={() => { setOpenForm(act.key); onPickAct(act); }} data-testid={`work-act-${act.key}`}>
                      {act.button}
                    </Button>
                  ) : undefined
                }
              >
                <p className="text-meta text-kit-slate-11" data-testid={`work-assigned-${act.key}`}>
                  {assigned?.userId ? `Assigned to ${assigned.name ?? "Name not recorded"}` : "Not assigned"}
                </p>
                {formOpen ? (
                  <div className="border-t border-kit-slate-5 pt-3">
                    <SupplierAnswerForm poId={poId} supplierName={supplierName ?? ""} onDone={() => { setOpenForm(null); refresh(); }} onCancel={() => setOpenForm(null)} />
                  </div>
                ) : null}
              </Block>
            </RouteStop>
          );
        })}
        <section className="mt-6" aria-label={PO_VIEW_COPY.related(related.length)} data-testid="work-po-related">
          <h3 className="mb-2 text-strong text-kit-slate-12">{PO_VIEW_COPY.related(related.length)}</h3>
          <ul className="flex flex-col rounded-control border border-kit-slate-5">
            {related.map((orderId) => {
              const f = index.orderFacts?.get(orderId) ?? null;
              const so = f?.so ?? index.soByOrder.get(orderId) ?? null;
              const line = [
                so != null ? `SO-${so}` : orderId,
                displayCustomerName(f?.customer ?? null) || null,
                f?.requested ? PO_VIEW_COPY.requested(fmtDate(f.requested)) : null,
              ].filter(Boolean).join(" · ");
              return (
                <li key={orderId} className="border-b border-kit-slate-5 last:border-b-0">
                  <button type="button" onClick={() => onOpenOrder(orderId)} className="flex min-h-10 w-full items-center px-4 text-left text-body text-kit-slate-12 hover:bg-kit-slate-2" data-testid={`work-po-related-${so ?? orderId}`}>
                    {line}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <WorkDocumentSheet doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
