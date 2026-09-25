import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import {
  unitIdOf,
  deliveryGroupLabel,
  deliveryGroupOf,
  deliveryOrderStatusOf,
  signedDeliveryDocumentOf,
  deliveryReasonLabel,
  deliveryScopeSentence,
  orderDeliveryGroups,
  type DeliveryGroupKey,
  type OrderActionTone,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import { ApiError, apiFetch } from "@/lib/api";
import { renderDoPdf } from "@/lib/pdf/render";
import type { DoTemplateData } from "@/lib/pdf/types";
import Panel from "@/components/kit/Panel";
import StatusPill from "@/components/kit/StatusPill";
import Loading from "@/components/kit/Loading";
import { useDeliveryOrder, useDeliveryPhotos } from "@/lib/queries";
import { personInitials, avatarColor } from "@/lib/staff-avatar";
import SalesOrderTabs from "./SalesOrderTabs";
import { useOpenWorkSet, type WorkRow } from "./use-open-work";
import WarehouseHandoverBlock from "./components/WarehouseHandoverBlock";
import DeliveryResultAction from "./components/DeliveryResultAction";
import DeliveryEvidencePanel from "./components/DeliveryEvidencePanel";
import { NO_PROOF_REVIEW, proofReviewOf } from "./delivery-orders-register";

/**
 * THE DELIVERY ORDER OBJECT PAGE — read-only facts + doors
 * (owner-approved blueprint card, 2026-08-16, §5).
 *
 * Every block renders facts OWNED BY OTHER MODULES: customer/order facts are
 * edited on the SO object page; delivery execution happens on the Delivery
 * page; Finance owns its exception. **This page writes nothing.** The one
 * capability it adds is Print — and a reprint carries the SAME number, because
 * the number was minted once and stored (doc-number law, Jess 2026-07-19).
 *
 * Status is the ONE shared arithmetic (`deliveryOrderStatusOf`); a failed
 * document keeps its Delivery exception + reason forever — a rebooked trip is
 * a NEW document, linked from the same Sales Order.
 */

/** The §4 chain facts (0363) — display words registered in COPY-STANDARD. */
const HANDOVER_LABEL: Record<string, string> = {
  ready_for_handover: "Ready for handover",
  handed_over: "Handed over",
  received_by_logistics: "Received by logistics",
};

/** The §4 duty words — one login may hold both; the event names which acted. */
const DUTY_LABEL: Record<string, string> = {
  warehouse: "Warehouse",
  logistics: "Logistics",
};

/** Owner column ruling 2026-08-18: Created GREY · Out for delivery BLUE ·
 *  Delivered GREEN · Delivery exception AMBER. */
const STATUS_TONE: Record<string, OrderActionTone> = {
  created: "neutral",
  out_for_delivery: "info",
  arrived: "success",
  delivered: "success",
  exception: "warning",
  cancelled: "neutral",
};

/** One labelled fact line — 11px label, 13px value (the governed two ranks). */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-label font-semibold uppercase tracking-wide text-base-500">
        {label}
      </span>
      <span className="min-w-0 text-body text-base-900">{children}</span>
    </div>
  );
}

/**
 * THE LIVE DOCUMENT (Delivery MASTER §9, Card 16): the same bytes `Print`
 * opens, rendered inside the first section by the governed DO renderer. One
 * render per document; a failure is stated and the Print door still works.
 */
function useDocumentBlob(orderId: string | null, doNumber: string | null) {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  useEffect(() => {
    if (!orderId || !doNumber) return;
    let alive = true;
    let objectUrl: string | null = null;
    setState({ url: null, failed: false });
    apiFetch<DoTemplateData>(
      `/api/operation/orders/${orderId}/print-do-data?do_number=${encodeURIComponent(doNumber)}`,
    )
      .then((payload) => renderDoPdf(payload))
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, failed: false });
      })
      .catch(() => {
        if (alive) setState({ url: null, failed: true });
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orderId, doNumber]);
  return state;
}

/** A governed absence — quieter than a fact, and it still uses words. */
function Absence({ children }: { children: React.ReactNode }) {
  return <span className="text-body text-base-500">{children}</span>;
}

export default function DeliveryOrderPage() {
  const { doId = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useDeliveryOrder(doId || null);

  const d = data?.deliveryOrder;
  const order = d?.orders;

  /* 0491 — a Journey leg's document names its leg; the route prints without a
     `Leg` word and an intermediate leg records an ARRIVAL, never a delivery
     (Card 20: the word, the tone, the source stop and the proof all follow). */
  const leg = d?.leg ?? 0;
  const stops = order?.delivery_stops ?? [];
  const lastLeg = stops.reduce((max, stop) => Math.max(max, Number(stop.leg) || 0), 0);
  const legStop = leg > 0 ? stops.find((stop) => Number(stop.leg) === leg) ?? null : null;
  const legRoute = legStop ? [legStop.from_loc, legStop.to_loc].filter(Boolean).join(" → ") : null;
  const intermediateLeg = leg > 0 && leg < lastLeg;

  const status = useMemo(
    () =>
      d
        ? deliveryOrderStatusOf({
            voidedAt: d.voided_at,
            voidReason: d.void_reason,
            attempts: (data?.attempts ?? []).map((a) => ({
              result: a.result,
              reasonKey: a.reason_key,
              recordedAt: a.recorded_at,
            })),
            handoverEvents: (data?.handoverEvents ?? []).map((e) => ({
              kind: e.kind,
            })),
            intermediateLeg,
            legStop: legStop?.to_loc ?? null,
          })
        : null,
    [d, data?.attempts, data?.handoverEvents, intermediateLeg, legStop],
  );

  // Photos through the EXISTING signed-url door (0280) — one reader path.
  const photos = useDeliveryPhotos(d?.order_id ?? "", {
    enabled: Boolean(d?.order_id),
  });
  // Card 16 — the live document in section one (the bytes Print opens).
  const documentBlob = useDocumentBlob(d?.order_id ?? null, d?.do_number ?? null);

  // Card §7 — the document's ACTION LINES with their owners: the delivery-
  // track items of THIS order, from the ONE composed work set (never a second
  // engine). The owner chip is the resolved person's initials; a duty with no
  // roster holder yet shows its duty word (the canvas's measured-boundary
  // rule). The 200-row list cap means an old order may fall outside the set —
  // then no lines render, and the Work page remains the authority.
  const workSet = useOpenWorkSet();
  const DELIVERY_KEYS = new Set([
    "assign_logistics",
    "confirm_delivery_date",
    "deliver_today",
    "upload_delivery_photo",
    "check_delivery_proof",
    "arrange_new_delivery_date",
    "collect_loan_item",
  ]);
  const actionLines = useMemo(
    () =>
      workSet.items.filter(
        (i) => i.orderId === (d?.order_id ?? "") && DELIVERY_KEYS.has(i.ruleKey),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workSet.items, d?.order_id],
  );

  // THIS TRIP's lines (card §2): trip_groups NULL = the whole order; a split
  // trip carries its groups' lines. Derived through the ONE shared module the
  // booking door scoped with (0282) — never a second copy of the goods.
  const tripLines = useMemo(() => {
    const lines = order?.order_lines ?? [];
    if (!d?.trip_groups || d.trip_groups.length === 0) return lines;
    const scope = new Set(d.trip_groups);
    return lines.filter((l) => {
      const g = deliveryGroupOf(l.sku);
      return g !== null && scope.has(g);
    });
  }, [order?.order_lines, d?.trip_groups]);

  const scopeSentence = useMemo(() => {
    if (!d?.trip_groups || d.trip_groups.length === 0) return null;
    const all = orderDeliveryGroups(order?.order_lines ?? []);
    return deliveryScopeSentence(d.trip_groups as DeliveryGroupKey[], all);
  }, [d?.trip_groups, order?.order_lines]);

  const openPdf = async () => {
    if (!d || !order) return;
    try {
      const payload = await apiFetch<DoTemplateData>(
        `/api/operation/orders/${order.id}/print-do-data?do_number=${encodeURIComponent(d.do_number)}`,
      );
      const blob = await renderDoPdf(payload);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : `Delivery Order ${d.do_number} PDF failed`,
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loading label="Loading the delivery order…" />
      </div>
    );
  }
  if (isError || !d || !order || !status) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-body text-base-700">
          {notFound
            ? "This delivery order could not be found"
            : "The delivery order could not be loaded — try again"}
        </p>
        {(error as Error | undefined)?.message ? (
          <p className="text-meta text-base-500">{(error as Error).message}</p>
        ) : null}
        <button
          type="button"
          className="rounded-md border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-base-50"
          onClick={() => navigate("/operation?tab=delivery")}
        >
          Back to Delivery
        </button>
      </div>
    );
  }

  const customer = displayCustomerName(order.customer_name ?? "") || "No customer name";
  const onLoan = (data?.loans ?? []).filter((l) => l.status === "on_loan");
  const returnedLoans = (data?.loans ?? []).filter((l) => l.status === "returned");
  const photoRows = photos.data?.photos ?? [];
  /* §6.1 (0489) — the ONE review arithmetic the register and Monitor read.
     `Proof Accepted` is what turns the delivered pill green; every other
     delivered document is amber until Operation has judged its proof. */
  const signedDocument = signedDeliveryDocumentOf({ documentNumber: d.do_number, order, evidence: data?.attemptEvidence });
  const latestAttempt = [...(data?.attempts ?? [])].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).at(-1);
  /* A warehouse arrival owes no delivery proof: the customer leg's document
     carries the proof and its review (Card 20). */
  const reached =
    !intermediateLeg && (latestAttempt?.result === "delivered" || latestAttempt?.result === "partial");
  const proofReview = reached
    ? proofReviewOf({
        doNumber: d.do_number,
        ledger: photos.data ? photoRows : null,
        signedDoUploadedAt: signedDocument?.uploadedAt ?? null,
        reviews: data?.proofReviews ?? [],
        attemptEvidence: data?.attemptEvidence ?? [],
      })
    : NO_PROOF_REVIEW;
  const statusTone: OrderActionTone =
    status.kind === "delivered"
      ? proofReview.state === "accepted"
        ? "success"
        : "warning"
      : STATUS_TONE[status.kind] ?? "neutral";
  const logisticsReceived = (data?.handoverEvents ?? []).some(
    (event) => event.kind === "received_by_logistics",
  );
  const mayRecordResult =
    logisticsReceived &&
    !d.voided_at &&
    (data?.attempts ?? []).length === 0 &&
    (!d.trip_groups || d.trip_groups.length === 0);
  /* The control overlay rides the base row type with only its photo ledger;
     the detail read adds the two site instructions (Card 16). */
  const control = (Array.isArray(order.ops_order_control) ? order.ops_order_control[0] : order.ops_order_control) as
    | { customer_request?: string | null; action_for_logistic?: string | null }
    | null
    | undefined;
  const warehouse = Array.isArray(order.warehouses) ? order.warehouses[0] : order.warehouses;
  const arrangement = data?.arrangement ?? null;
  const arrangementPartner = Array.isArray(arrangement?.delivery_partners)
    ? arrangement?.delivery_partners[0]
    : arrangement?.delivery_partners;
  const attempts = data?.attempts ?? [];
  const openFinance = (data?.financeExceptions ?? []).filter((e) => e.status === "open");
  const pendingApprovals = (data?.paymentApprovals ?? []).filter((a) => a.status === "pending");
  const problemAttempts = attempts.filter((a) => a.result === "partial" || a.result === "failed");
  const siblings = (data?.siblingDocuments ?? []).filter((doc) => doc.do_number !== d.do_number);
  /* On an intermediate leg's document a `delivered` result is the ARRIVAL at
     the named stop — `Arrived`, the dictionary's word (Card 14 / Card 20). */
  const resultWord = (result: string) =>
    result === "delivered"
      ? intermediateLeg
        ? "Arrived"
        : "Delivered"
      : result === "partial"
        ? "Partially Delivered"
        : "Failed Delivery";
  const whereWord: Record<string, string> = {
    returned_to_warehouse: "Returned to Warehouse",
    still_with_logistics: "Still with Logistics",
    with_customer: "With Customer",
  };
  /* HISTORY — every append-only record, in the order it happened: the issue,
     the handover chain, the attempts, the order's own History lines, the void. */
  const historyEntries = [
    { at: d.issued_at, text: `Delivery order issued — ${d.do_number}`, meta: "issued by the system when every requirement was met" },
    ...(data?.handoverEvents ?? []).map((e) => ({
      at: e.recorded_at,
      text: `${HANDOVER_LABEL[e.kind] ?? e.kind}${e.kind === "handed_over" && e.receiver_name ? ` — received by ${e.receiver_name}` : ""}`,
      meta: [e.recorded_by_name, DUTY_LABEL[e.duty] ?? e.duty, e.company].filter(Boolean).join(" · "),
    })),
    ...attempts.map((a) => ({
      at: a.recorded_at,
      text: `${resultWord(a.result)}${a.reason_key ? ` — ${deliveryReasonLabel(a.reason_key)}` : ""}`,
      meta: a.note ?? "",
    })),
    ...(data?.history ?? []).map((h) => ({ at: h.occurred_at, text: h.text, meta: h.by_role ?? "" })),
    ...(d.voided_at
      ? [{ at: d.voided_at, text: `Cancelled — ${d.void_reason === "order_cancelled" ? "order cancelled" : "rescheduled"}`, meta: "" }]
      : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={d.do_number}
        customer={`SO-${order.so} · ${customer}`}
        backTo="/operation/delivery-orders"
        backLabel="Delivery Orders"
        docTitle={`${d.do_number} — Carres`}
        status={<StatusPill tone={statusTone}>{status.label}</StatusPill>}
        right={
          <>
            <WarehouseHandoverBlock
              doNumber={d.do_number}
              logisticsName={d.logistics_partner}
              headerAction
            />
            {mayRecordResult ? (
              <DeliveryResultAction
                order={order}
                lines={tripLines}
                leg={leg}
                lastLeg={lastLeg}
                legDestination={legStop?.to_loc ?? null}
              />
            ) : null}
            <button
              type="button"
              data-testid="do-print"
              onClick={() => void openPdf()}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-base-300 bg-white px-2.5 text-meta font-medium text-base-700 hover:bg-base-50"
              title="Reprint carries the same number — the paper the customer signed stays reproducible"
            >
              <Printer size={14} /> Print
            </button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto bg-base-100">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
          {/* 1 · DELIVERY ORDER — customer, address, Warehouse, partner,
              arrangement, goods scope, site requirements, current facts and
              the live document (Delivery MASTER §9). */}
          <Panel title="Delivery Order">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="do-section-order">
              <Fact label="Name">{customer}</Fact>
              <Fact label="Phone">
                {order.customer_phone || <Absence>No phone recorded — check the Sales Order</Absence>}
              </Fact>
              <Fact label="Emergency contact">
                {order.customer_emergency || (
                  <Absence>No emergency contact — used only if the customer cannot be reached</Absence>
                )}
              </Fact>
              <Fact label="Delivery address">
                {order.customer_address || (
                  <Absence>No address recorded — record it on the Sales Order before the trip</Absence>
                )}
              </Fact>
              {/* A Journey leg's document leaves from ITS OWN source stop — leg 1
                  the configured Carres source, a later leg the previous
                  partner's warehouse (`from_loc`). The order-level warehouse is
                  a whole-order fact and never a silent substitute (Card 20). */}
              <Fact label="Warehouse">
                {legStop
                  ? legStop.from_loc?.trim() || <Absence>No warehouse recorded</Absence>
                  : warehouse?.name || <Absence>No warehouse recorded</Absence>}
              </Fact>
              <Fact label="Logistics partner">
                {arrangementPartner?.name || d.logistics_partner || (
                  <Absence>Logistics not assigned when this document was issued</Absence>
                )}
              </Fact>
              <Fact label="Delivery appointment">
                {arrangement?.confirmed_date || d.delivery_date ? (
                  <>
                    {fmtDate((arrangement?.confirmed_date ?? d.delivery_date) as string)}
                    {(arrangement?.confirmed_time ?? d.time_slot) ? ` · ${arrangement?.confirmed_time ?? d.time_slot}` : ""}
                  </>
                ) : (
                  <Absence>No delivery date on this document</Absence>
                )}
              </Fact>
              <Fact label="ETA">
                {arrangement?.expected_arrival || <Absence>Not recorded</Absence>}
              </Fact>
              <Fact label="Driver">
                {arrangement?.driver_name || (
                  <Absence>Driver not recorded — the logistics partner assigns the driver on the day</Absence>
                )}
              </Fact>
              <Fact label="Vehicle">
                {arrangement?.vehicle || (
                  <Absence>Vehicle not recorded — the logistics partner assigns the vehicle on the day</Absence>
                )}
              </Fact>
              {legRoute ? <Fact label="Route">{legRoute}</Fact> : null}
              {d.trip_groups && d.trip_groups.length > 0 ? (
                <Fact label="Trip scope">
                  {d.trip_groups.map((g) => deliveryGroupLabel(g as DeliveryGroupKey)).join(" + ")}
                </Fact>
              ) : null}
              <Fact label="Building type">{order.building_type || <Absence>Not recorded</Absence>}</Fact>
              <Fact label="Floor">
                {order.delivery_floor == null ? <Absence>Not recorded</Absence> : String(order.delivery_floor)}
              </Fact>
              <Fact label="Lift">
                {order.delivery_has_lift == null ? <Absence>Not recorded</Absence> : order.delivery_has_lift ? "Lift" : "No lift"}
              </Fact>
              <Fact label="Stairs">{order.delivery_stair_items || <Absence>Not recorded</Absence>}</Fact>
              <Fact label="Access">{arrangement?.condo_registration || <Absence>Not recorded</Absence>}</Fact>
              <Fact label="Customer request">{control?.customer_request || <Absence>None recorded</Absence>}</Fact>
              <Fact label="Instruction for logistics">
                {arrangement?.logistics_note || control?.action_for_logistic || <Absence>None recorded</Absence>}
              </Fact>
            </div>

            <div className="mt-4 border-t border-base-200 pt-3">
              <span className="text-label font-semibold uppercase tracking-wide text-base-500">Goods on this trip</span>
              {tripLines.length === 0 ? (
                <p className="mt-1">
                  <Absence>No goods lines on this trip — the Sales Order carries the order's goods.</Absence>
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-2">
                  {tripLines.map((l, i) => (
                    <li key={`${l.sku}-${i}`} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-base-900">
                          {data?.lineDescriptions[l.sku] ?? l.sku}
                        </span>
                        <span className="block truncate font-mono text-label text-base-600">{l.sku}</span>
                      </span>
                      <span className="shrink-0 text-body tabular-nums text-base-700">× {l.qty}</span>
                    </li>
                  ))}
                </ul>
              )}
              {scopeSentence ? <p className="mt-2 text-label text-base-600">{scopeSentence}</p> : null}
            </div>

            <div className="mt-4 border-t border-base-200 pt-3" data-testid="do-document">
              <span className="text-label font-semibold uppercase tracking-wide text-base-500">The document</span>
              {documentBlob.url ? (
                <iframe
                  title={`${d.do_number} document`}
                  src={documentBlob.url}
                  className="mt-2 h-[720px] w-full rounded-md border border-base-200 bg-white"
                />
              ) : documentBlob.failed ? (
                <p className="mt-1">
                  <Absence>The document could not be rendered here — Print opens the same document.</Absence>
                </p>
              ) : (
                <p className="mt-1 text-body text-base-600">Rendering the document…</p>
              )}
            </div>
          </Panel>

          {/* 2 · DELIVERY HISTORY — every recorded trip and its result. */}
          <Panel title="Delivery history">
            {attempts.length === 0 ? (
              <Absence>
                No delivery run recorded yet — the Delivery page records the result on the day.
              </Absence>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="do-delivery-history">
                {attempts.map((a, i) => (
                  <li key={a.id ?? i} className="flex flex-col">
                    <span className="text-body text-base-900">
                      Delivery on {fmtDate(a.recorded_at)} · {resultWord(a.result)}
                      {a.reason_key ? ` — ${deliveryReasonLabel(a.reason_key)}` : ""}
                    </span>
                    <span className="text-label text-base-600">
                      {a.where_goods ? `Goods: ${whereWord[a.where_goods] ?? a.where_goods}` : "Recorded"}
                      {a.note ? ` · ${a.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* 3 · WAREHOUSE HANDOVER — the §4 chain, read-only. */}
          <Panel title="Warehouse handover">
            {(data?.handoverEvents ?? []).length === 0 ? (
              <Absence>
                No handover recorded yet — the warehouse records it on the Delivery page.
              </Absence>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="do-handover-facts">
                {(data?.handoverEvents ?? []).map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5">
                    <span className="text-body font-medium text-base-900">
                      {HANDOVER_LABEL[e.kind] ?? e.kind}
                      {e.kind === "handed_over" && e.counterparty ? ` — to ${e.counterparty}` : ""}
                      {e.kind === "handed_over" && e.receiver_name ? ` · received by ${e.receiver_name}` : ""}
                    </span>
                    <span className="text-label text-base-600">
                      {e.recorded_by_name || "Recorded"} · {DUTY_LABEL[e.duty] ?? e.duty}
                      {e.company ? ` · ${e.company}` : ""} · {fmtDate(e.recorded_at)}
                      {e.vehicle ? ` · Vehicle: ${e.vehicle}` : ""}
                    </span>
                    {e.goods && e.goods.length > 0 ? (
                      <span className="text-label text-base-600">
                        Goods: {e.goods.map((g) => `${g.sku} × ${g.qty}`).join(" · ")}
                      </span>
                    ) : null}
                    {e.note ? <span className="text-label text-base-600">{e.note}</span> : null}
                    {e.proofUrl ? (
                      <a
                        href={e.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-label font-medium text-blue-700 underline-offset-2 hover:underline"
                      >
                        Open handover proof →
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* 4 · EVIDENCE — every file bound to the event it proves, and the
              §6.1 review acts (Card 13). */}
          <DeliveryEvidencePanel
            doNumber={d.do_number}
            orderId={order.id}
            attempts={attempts}
            arrivalOnly={intermediateLeg}
            attemptEvidence={data?.attemptEvidence ?? []}
            proofReviews={data?.proofReviews ?? []}
            ledger={photos.data ? photoRows : null}
            signedDo={{ present: Boolean(signedDocument), uploadedAt: signedDocument?.uploadedAt ?? null }}
            proofReview={proofReview}
          />

          {/* LOAN COLLECTION — only while a loan exists (§9). */}
          {(onLoan.length > 0 || returnedLoans.length > 0) && (
            <Panel title="Loan collection">
              {onLoan.length > 0 ? (
                <p className="text-body text-base-900">
                  {onLoan.length} {onLoan.length === 1 ? "item" : "items"} on loan to the
                  customer · Collect back on delivery day
                </p>
              ) : (
                <p className="text-body text-base-900">Loan collected back</p>
              )}
              <ul className="mt-2 flex flex-col gap-1" data-testid="do-loan-lines">
                {[...onLoan, ...returnedLoans].map((l) => {
                  const unit = Array.isArray(l.ops_stock_items) ? l.ops_stock_items[0] : l.ops_stock_items;
                  const unitId = unitIdOf({ unitCode: unit?.unit_code ?? null, identityScope: unit?.identity_scope ?? null });
                  return (
                    <li key={l.id} className="text-label text-base-600">
                      {l.status === "on_loan"
                        ? `Loan ${unitId ?? l.loan_note_no ?? "item"} · collect back on delivery day · on loan since ${l.loaned_at ? fmtDate(l.loaned_at) : "the delivery"}`
                        : `${l.loan_note_no ?? "Loan"}${unitId ? ` ${unitId}` : ""} · Returned ${l.returned_at ? fmtDate(l.returned_at) : ""}`}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {/* 5 · EXCEPTIONS — open and historical problems with owner and next act. */}
          <Panel title="Exceptions">
            {problemAttempts.length === 0 && openFinance.length === 0 && pendingApprovals.length === 0 && !d.voided_at && actionLines.length === 0 ? (
              <p className="text-body text-base-900" data-testid="do-no-problems">No open problems</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="do-exceptions">
                {problemAttempts.map((a, i) => (
                  <li key={a.id ?? `attempt-${i}`} className="flex flex-col">
                    <span className="text-body text-base-900">
                      {resultWord(a.result)}
                      {a.reason_key ? ` — ${deliveryReasonLabel(a.reason_key)}` : ""}
                    </span>
                    <span className="text-label text-base-600">
                      {fmtDate(a.recorded_at)}
                      {a.where_goods ? ` · Goods: ${whereWord[a.where_goods] ?? a.where_goods}` : ""}
                    </span>
                  </li>
                ))}
                {openFinance.map((e) => (
                  <li key={e.id} className="flex flex-col">
                    <span className="text-body text-base-900">Finance is holding this delivery — {e.reason}</span>
                    <span className="text-label text-base-600">{e.opened_at ? fmtDate(e.opened_at) : "Open"}</span>
                  </li>
                ))}
                {pendingApprovals.map((a) => (
                  <li key={a.id} className="flex flex-col">
                    <span className="text-body text-base-900">Payment approval requested — {a.request_reason}</span>
                    <span className="text-label text-base-600">{a.requested_at ? fmtDate(a.requested_at) : "Requested"}</span>
                  </li>
                ))}
                {d.voided_at ? (
                  <li className="flex flex-col">
                    <span className="text-body text-base-900">
                      Cancelled —{" "}
                      {d.void_reason === "order_cancelled"
                        ? "the order was cancelled"
                        : "the trip was rescheduled; a new delivery order carries the new date"}
                    </span>
                    <span className="text-label text-base-600">{fmtDate(d.voided_at)}</span>
                  </li>
                ) : null}
                {actionLines.map((i: WorkRow) => (
                  <li key={`${i.orderId}:${i.ruleKey}`} className="flex items-center gap-2" data-testid="do-action-line">
                    {i.ownerId ? (
                      <span
                        aria-hidden="true"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                        style={{ backgroundColor: avatarColor(i.ownerId).bg, color: avatarColor(i.ownerId).fg }}
                        title={i.ownerName ?? undefined}
                      >
                        {personInitials(i.ownerName, "")}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-base-200 px-1.5 text-[9px] font-semibold text-base-500">
                        {i.ownerDuty ?? i.ownerName ?? "No owner yet"}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-body font-semibold text-base-900">{i.action}</span>
                      <span
                        className={`block truncate text-label font-normal ${i.workingDaysLate > 0 ? "text-danger" : "text-base-600"}`}
                      >
                        {i.workingDaysLate > 0 && i.dueIso
                          ? `Late — was due ${fmtDate(i.dueIso)}`
                          : i.dueIso
                            ? `due ${fmtDate(i.dueIso)}`
                            : i.soRef}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* 6 · HISTORY — the append-only audit of every change. */}
          <Panel title="History">
            <ul className="flex flex-col gap-2" data-testid="do-history">
              {historyEntries.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex flex-col">
                  <span className="text-body text-base-900">{h.text}</span>
                  <span className="text-label text-base-600">
                    {fmtDate(h.at)}
                    {h.meta ? ` · ${h.meta}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* 7 · RELATED RECORDS — doors to the owners, never a duplicate editor. */}
          <Panel title="Related records">
            <div className="flex flex-col gap-2" data-testid="do-related-records">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  data-testid="do-open-so"
                  className="text-body font-medium text-blue-700 underline-offset-2 hover:underline"
                  onClick={() => navigate(`/operation/orders/so/${order.id}`)}
                >
                  Open SO-{order.so} →
                </button>
                <button
                  type="button"
                  data-testid="do-open-order-route"
                  className="text-body font-medium text-blue-700 underline-offset-2 hover:underline"
                  onClick={() => navigate(`/operation/orders/so/${encodeURIComponent(order.id)}?route=1`)}
                >
                  Open Order Route →
                </button>
                <Link
                  to={`/finance/payments?order=${order.so}`}
                  data-testid="do-open-payments"
                  className="text-body font-medium text-blue-700 underline-offset-2 hover:underline"
                >
                  Open Payments →
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {(data?.scopeUnits ?? []).length === 0 ? (
                  <Absence>No exact Units recorded on this document</Absence>
                ) : (
                  (data?.scopeUnits ?? []).map((u) => (
                    <Link
                      key={u.item_id}
                      to={`/operation/stock/unit/${encodeURIComponent(u.unit_code ?? "")}`}
                      className="text-body font-medium text-blue-700 underline-offset-2 hover:underline"
                    >
                      Open Unit {u.unit_code} →
                    </Link>
                  ))
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {data?.serviceCases === null ? (
                  <Absence>Service Cases could not be read</Absence>
                ) : (data?.serviceCases ?? []).length === 0 ? (
                  <Absence>No Service Case on this order</Absence>
                ) : (
                  (data?.serviceCases ?? []).map((sc) => (
                    <Link
                      key={sc.id}
                      to={`/operation?tab=service-notes&case=${encodeURIComponent(sc.id)}`}
                      className="text-body font-medium text-blue-700 underline-offset-2 hover:underline"
                    >
                      Open Case {sc.case_no} →
                    </Link>
                  ))
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {siblings.length === 0 ? (
                  <Absence>No other delivery order on this Sales Order</Absence>
                ) : (
                  siblings.map((doc) => (
                    <Link
                      key={doc.id}
                      to={`/operation/delivery-orders/${encodeURIComponent(doc.do_number)}`}
                      className="text-body font-medium text-blue-700 underline-offset-2 hover:underline"
                    >
                      Open {doc.do_number} →{doc.voided_at ? " · cancelled" : ""}
                    </Link>
                  ))
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
