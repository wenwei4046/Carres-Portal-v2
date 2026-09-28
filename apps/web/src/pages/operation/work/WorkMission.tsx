/**
 * THE MISSION — the Work page's middle column (Workspace MASTER §5.10,
 * APPROVED / LOCKED 2026-09-28).
 *
 *   order header   SO No (opens its PDF) over the customer · Proceed Date ·
 *                  Customer Requested Delivery Date
 *   route stops    one stop per Order Route node; stops holding an act first,
 *                  each act a white card (title = what to do, second line =
 *                  why, checklist, `{n} of {m} done`) whose button opens the
 *                  owning module's form inside the card; every other stop one
 *                  quiet line that opens to its facts
 *
 * Only the owning form's primary button is blue. Nothing opens by itself.
 */
import { useMemo, useState } from "react";
import type { LogisticsCardModel } from "@carres/shared";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import ChecklistRow from "@/components/kit/ChecklistRow";
import Icon from "@/components/kit/Icon";
import QuietRouteRow from "@/components/kit/QuietRouteRow";
import RouteStop from "@/components/kit/RouteStop";
import { displayCustomerName } from "@/lib/customer-name";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";
import { useNavigate } from "react-router-dom";
import { AssignLogisticsForm, DeliveryDateForm, SendPoForm, SupplierAnswerForm, useRefreshWork, WorkDocumentSheet, type WorkDocument } from "./WorkActForms";
import { useWorkOrderRoute } from "./use-work-data";
import { workStopsOf, type WorkAct, type WorkPoFact, type WorkStopCard } from "./work-stops";

export const MISSION_COPY = {
  proceedDate: "Proceed Date",
  requested: "Customer Requested Delivery Date",
  notRecorded: "Not recorded",
  loading: "Loading…",
  failed: "Some information could not be refreshed.",
} as const;

function DocLink({ number, onOpen }: { number: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-meta text-kit-slate-12 underline decoration-kit-slate-9 underline-offset-2 hover:decoration-kit-slate-12"
      data-testid={`work-doc-${number}`}
    >
      {number}
    </button>
  );
}

export default function WorkMission({
  orderId,
  acts,
  items,
  pos,
  logistics,
  stacked,
  narrow = false,
  onPickAct,
  back = null,
}: {
  orderId: string;
  acts: readonly WorkAct[];
  items: readonly WorkRow[];
  pos: readonly WorkPoFact[];
  logistics: LogisticsCardModel | null;
  /** Below 1340px of page the checklist value drops under its step. */
  stacked: boolean;
  /** Below 1100px a quiet stop's status wraps instead of being cut. */
  narrow?: boolean;
  /** The act being worked picks Communication's tab. */
  onPickAct: (act: WorkAct) => void;
  /** Opened from a PO view (A3): `Back to {PO No}` above the header. */
  back?: { label: string; onBack: () => void } | null;
}) {
  const { route, detail, loading, failed } = useWorkOrderRoute(orderId);
  const refresh = useRefreshWork();
  const navigate = useNavigate();
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [openStops, setOpenStops] = useState<Record<string, boolean>>({});
  const [doc, setDoc] = useState<WorkDocument | null>(null);

  const stops = useMemo(
    () => (route ? workStopsOf({ route, acts, pos, logistics, spell: (iso) => fmtDate(iso) }) : []),
    [route, acts, pos, logistics],
  );
  const poIdOfNumber = useMemo(() => new Map(pos.map((p) => [p.documentNo, p.poId])), [pos]);
  const openDoc = (number: string) => {
    const poId = poIdOfNumber.get(number) ?? (/^PO/.test(number) ? number : null);
    if (poId) setDoc({ kind: "po", poId, number });
  };

  if (loading && !route) return <p className="p-6 text-body text-kit-slate-11" role="status">{MISSION_COPY.loading}</p>;
  if (!route || !detail) return <p className="p-6 text-body text-kit-slate-11" role="status">{failed ? MISSION_COPY.failed : MISSION_COPY.loading}</p>;

  /* The Sales Order document's own Proceed Date (A7: the document's words and values). */
  const order = detail.order as typeof detail.order & { proceed_date?: string | null };
  const soNo = `SO-${order.so}`;
  const itemOf = (act: WorkAct) => items.find((i) => i.id === act.occurrenceId) ?? null;

  const form = (act: WorkAct) => {
    const done = () => {
      setOpenForm(null);
      refresh();
    };
    const cancel = () => setOpenForm(null);
    if (act.kind === "send_po" && act.poId) {
      const fact = pos.find((p) => p.poId === act.poId);
      return <SendPoForm poId={act.poId} documentNo={fact?.documentNo ?? act.poId} supplierName={fact?.supplierName ?? ""} onDone={done} onCancel={cancel} />;
    }
    if (act.kind === "supplier_answer" && act.poId) {
      return <SupplierAnswerForm poId={act.poId} supplierName={pos.find((p) => p.poId === act.poId)?.supplierName ?? ""} onDone={done} onCancel={cancel} />;
    }
    if (act.kind === "delivery_date") return <DeliveryDateForm orderId={orderId} onDone={done} />;
    if (act.kind === "assign_logistics") return <AssignLogisticsForm orderId={orderId} onDone={done} />;
    return null;
  };

  const card = (c: WorkStopCard) => {
    const act = c.act;
    /* An act with no in-place form yet keeps its owning object's door —
       never a second copy of the act's words. */
    const doorItem = act && act.kind === "other" ? itemOf(act) : null;
    const formOpen = act !== null && openForm === act.key;
    return (
      <div key={c.key} className="min-w-0" data-testid={`work-card-${c.key}`} onFocus={() => (act ? onPickAct(act) : undefined)}>
        <Block
          title={c.title}
         
          why={c.why ? { text: c.why, tone: c.whyTone } : null}
          headerSlot={
            doorItem ? (
              <Button size="touch" onClick={() => navigate(doorItem.destination)} data-testid={`work-door-${act!.key}`}>
                {`Open ${doorItem.source.object.label}`}
              </Button>
            ) : act && act.kind !== "other" && !formOpen ? (
              <Button
                size="touch"
                onClick={() => {
                  setOpenForm(act.key);
                  onPickAct(act);
                }}
                data-testid={`work-act-${act.key}`}
              >
                {act.button}
              </Button>
            ) : undefined
          }
        >
          {c.checklist.length > 0 ? (
            <div className="flex flex-col">
              {c.checklist.map((row, i) => (
                <ChecklistRow
                  key={`${row.step}-${i}`}
                  mark={row.mark}
                  step={row.step}
                  value={row.value}
                  stacked={stacked}
                  doc={row.doc ? <DocLink number={row.doc} onOpen={() => openDoc(row.doc!)} /> : undefined}
                />
              ))}
            </div>
          ) : null}
          {c.progress ? <p className="self-end text-meta text-kit-slate-11" data-testid={`work-progress-${c.key}`}>{c.progress}</p> : null}
          {formOpen && act ? <div className="border-t border-kit-slate-5 pt-3">{form(act)}</div> : null}
        </Block>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="work-mission">
      {back ? (
        <button type="button" onClick={back.onBack} className="flex h-10 shrink-0 items-center gap-1.5 border-b border-kit-slate-5 px-6 text-left text-body text-kit-slate-12 hover:bg-kit-slate-2" data-testid="work-back-to-po">
          <Icon name="back" size={16} />
          {back.label}
        </button>
      ) : null}
      <header className="grid h-16 shrink-0 grid-cols-3 items-center gap-3 border-b border-kit-slate-5 bg-white px-6" data-testid="work-order-header">
        <div className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={() => setDoc({ kind: "so", orderId, number: soNo })}
            className="self-start text-strong text-kit-slate-12 underline decoration-kit-slate-9 underline-offset-2"
            data-testid="work-order-so"
          >
            {soNo}
          </button>
          <span className="truncate text-body text-kit-slate-11">{displayCustomerName(order.customer_name) || MISSION_COPY.notRecorded}</span>
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="text-label text-kit-slate-11">{MISSION_COPY.proceedDate}</span>
          <span className="text-body text-kit-slate-12">{order.proceed_date ? fmtDate(order.proceed_date) : MISSION_COPY.notRecorded}</span>
        </div>
        <div className="flex min-w-0 flex-col items-end text-right">
          <span className="text-label text-kit-slate-11">{MISSION_COPY.requested}</span>
          <span className="text-body text-kit-slate-12">{order.delivery_date ? fmtDate(order.delivery_date) : MISSION_COPY.notRecorded}</span>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4" data-testid="work-stops">
        {stops.map((stop, i) => {
          const open = Boolean(openStops[stop.key]);
          const toggle = () => setOpenStops((prev) => ({ ...prev, [stop.key]: !prev[stop.key] }));
          return (
            <RouteStop key={stop.key} label={stop.label} tone={stop.tone} last={i === stops.length - 1} hideLabel={stop.quiet} data-testid={`work-stop-${stop.key}`}>
              {stop.quiet ? (
                <div className="flex flex-col gap-3">
                  <QuietRouteRow label={stop.label} status={stop.status} progress={stop.progress} open={open} onToggle={toggle} wrap={narrow} data-testid={`work-quiet-${stop.key}`} />
                  {open ? stop.cards.map((c) => card(c)) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-3">{stop.cards.map((c) => card(c))}</div>
              )}
            </RouteStop>
          );
        })}
      </div>
      <WorkDocumentSheet doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
