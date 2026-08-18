import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import {
  deliveryGroupLabel,
  deliveryGroupOf,
  deliveryOrderStatusOf,
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

/** Owner column ruling 2026-08-18: Created GREY · Out for delivery BLUE ·
 *  Delivered GREEN · Delivery exception AMBER. */
const STATUS_TONE: Record<string, OrderActionTone> = {
  created: "neutral",
  out_for_delivery: "info",
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
          })
        : null,
    [d, data?.attempts],
  );

  // Photos through the EXISTING signed-url door (0280) — one reader path.
  const photos = useDeliveryPhotos(d?.order_id ?? "", {
    enabled: Boolean(d?.order_id),
  });

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
          onClick={() => navigate("/operation/delivery-orders")}
        >
          Back to Delivery Orders
        </button>
      </div>
    );
  }

  const customer = displayCustomerName(order.customer_name ?? "") || "No customer name";
  const onLoan = (data?.loans ?? []).filter((l) => l.status === "on_loan");
  const returnedLoans = (data?.loans ?? []).filter((l) => l.status === "returned");
  const photoRows = photos.data?.photos ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={d.do_number}
        customer={`SO-${order.so} · ${customer}`}
        backTo="/operation/delivery-orders"
        backLabel="Delivery Orders"
        docTitle={`${d.do_number} — Carres`}
        right={
          <button
            type="button"
            data-testid="do-print"
            onClick={() => void openPdf()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-base-300 bg-white px-2.5 text-meta font-medium text-base-700 hover:bg-base-50"
            title="Reprint carries the same number — the paper the customer signed stays reproducible"
          >
            <Printer size={14} /> Print
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto bg-base-100">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
          {/* CUSTOMER — name · phones · address of THIS trip */}
          <Panel title="Customer">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </div>
          </Panel>

          {/* GOODS — this trip's lines only */}
          <Panel title="Goods on this trip">
            {tripLines.length === 0 ? (
              <Absence>
                No goods lines on this trip — the Sales Order carries the order's goods.
              </Absence>
            ) : (
              <ul className="flex flex-col gap-2">
                {tripLines.map((l, i) => (
                  <li key={`${l.sku}-${i}`} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-base-900">
                        {data?.lineDescriptions[l.sku] ?? l.sku}
                      </span>
                      <span className="block truncate font-mono text-label text-base-600">
                        {l.sku}
                      </span>
                    </span>
                    <span className="shrink-0 text-body tabular-nums text-base-700">
                      × {l.qty}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {scopeSentence ? (
              <p className="mt-3 border-t border-base-200 pt-2 text-label text-base-600">
                {scopeSentence}
              </p>
            ) : null}
          </Panel>

          {/* DELIVERY DETAILS */}
          <Panel title="Delivery details">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Fact label="Delivery appointment">
                {d.delivery_date ? (
                  <>
                    {fmtDate(d.delivery_date)}
                    {d.time_slot ? ` · ${d.time_slot}` : ""}
                  </>
                ) : (
                  <Absence>No delivery date on this document</Absence>
                )}
              </Fact>
              <Fact label="Logistics partner">
                {d.logistics_partner || (
                  <Absence>No logistics chosen when this document was issued</Absence>
                )}
              </Fact>
              <Fact label="Driver">
                <Absence>
                  Driver not recorded — the logistics partner assigns the driver on the day
                </Absence>
              </Fact>
              <Fact label="Vehicle">
                <Absence>
                  Vehicle not recorded — the logistics partner assigns the vehicle on the day
                </Absence>
              </Fact>
              {d.trip_groups && d.trip_groups.length > 0 ? (
                <Fact label="Trip scope">
                  {d.trip_groups
                    .map((g) => deliveryGroupLabel(g as DeliveryGroupKey))
                    .join(" + ")}
                </Fact>
              ) : null}
            </div>
          </Panel>

          {/* SOURCE SALES ORDER — the door */}
          <Panel title="Source Sales Order">
            <button
              type="button"
              data-testid="do-open-so"
              className="text-body font-medium text-blue-700 underline-offset-2 hover:underline"
              onClick={() => navigate(`/operation/orders/so/${order.id}`)}
            >
              Open SO-{order.so} →
            </button>
          </Panel>

          {/* DELIVERY STATUS */}
          <Panel
            title="Delivery status"
            right={
              <StatusPill tone={STATUS_TONE[status.kind] ?? "neutral"}>
                {status.label}
              </StatusPill>
            }
          >
            {status.reasonLabel ? (
              <p className="text-body text-base-900">{status.reasonLabel}</p>
            ) : null}
            {(data?.attempts ?? []).length === 0 ? (
              <Absence>
                No delivery run recorded yet — the Delivery page records the result on the day.
              </Absence>
            ) : (
              <ul className="flex flex-col gap-2">
                {(data?.attempts ?? []).map((a, i) => (
                  <li key={i} className="flex flex-col">
                    <span className="text-body text-base-900">
                      {a.result === "delivered"
                        ? "Delivered"
                        : a.result === "partial"
                          ? "Partially delivered"
                          : "Failed delivery"}
                      {a.reason_key ? ` — ${deliveryReasonLabel(a.reason_key)}` : ""}
                    </span>
                    <span className="text-label text-base-600">
                      Recorded: {fmtDate(a.recorded_at)}
                      {a.note ? ` · ${a.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {actionLines.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2 border-t border-base-200 pt-2" data-testid="do-action-lines">
                {actionLines.map((i: WorkRow) => (
                  <li key={`${i.orderId}:${i.ruleKey}`} className="flex items-center gap-2">
                    {i.ownerId ? (
                      <span
                        aria-hidden="true"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                        style={{
                          backgroundColor: avatarColor(i.ownerId).bg,
                          color: avatarColor(i.ownerId).fg,
                        }}
                        title={i.ownerName ?? undefined}
                      >
                        {personInitials(i.ownerName, "")}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-base-200 px-1.5 text-[9px] font-semibold text-base-500">
                        {i.ownerDuty ?? "No owner yet"}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-body font-semibold text-base-900">
                        {i.action}
                      </span>
                      <span
                        className={`block truncate text-label font-normal ${
                          i.workingDaysLate > 0 ? "text-danger" : "text-base-600"
                        }`}
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
            {d.voided_at ? (
              <p className="mt-2 border-t border-base-200 pt-2 text-label text-base-600">
                Cancelled: {fmtDate(d.voided_at)} —{" "}
                {d.void_reason === "order_cancelled"
                  ? "the order was cancelled"
                  : "the trip was rescheduled; a new delivery order carries the new date"}
              </p>
            ) : null}
          </Panel>

          {/* DELIVERY PHOTO */}
          <Panel title="Delivery photo">
            {photoRows.length === 0 ? (
              <Absence>
                No delivery photo yet — delivery staff upload it after the goods are delivered.
              </Absence>
            ) : (
              <div className="flex flex-wrap gap-3">
                {photoRows.map((p, i) =>
                  p.url ? (
                    <a
                      key={i}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <img
                        src={p.url}
                        alt={`Delivery photo ${i + 1}`}
                        className="h-28 w-28 rounded-md border border-base-200 object-cover"
                      />
                      <span className="mt-1 block text-label text-base-600">
                        Uploaded: {fmtDate(p.at)}
                      </span>
                    </a>
                  ) : (
                    <span key={i} className="text-label text-base-600">
                      Photo on file · Uploaded: {fmtDate(p.at)}
                    </span>
                  ),
                )}
              </div>
            )}
          </Panel>

          {/* SIGNATURE / PROOF */}
          <Panel title="Signature / proof">
            {order.pod_signed_at || order.pod_signature_url || order.do_file_path ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {order.pod_signed_at ? (
                  <Fact label="Signed">
                    {fmtDate(order.pod_signed_at)}
                    {order.pod_signed_by ? ` · ${order.pod_signed_by}` : ""}
                  </Fact>
                ) : null}
                {order.do_file_path ? (
                  <Fact label="Signed document on file">
                    {order.do_uploaded_at ? fmtDate(order.do_uploaded_at) : "Uploaded"}
                  </Fact>
                ) : null}
              </div>
            ) : (
              <Absence>
                No signed document yet — the customer signs on delivery and the signed copy is
                uploaded here.
              </Absence>
            )}
          </Panel>

          {/* LOAN COLLECTION — only when a loan exists */}
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
              <ul className="mt-2 flex flex-col gap-1">
                {[...onLoan, ...returnedLoans].map((l) => (
                  <li key={l.id} className="text-label text-base-600">
                    {l.loan_note_no ?? "Loan"} ·{" "}
                    {l.status === "on_loan"
                      ? `On loan since ${l.loaned_at ? fmtDate(l.loaned_at) : "the delivery"}`
                      : `Returned ${l.returned_at ? fmtDate(l.returned_at) : ""}`}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/* HISTORY — who did what, when */}
          <Panel title="History">
            <ul className="flex flex-col gap-2">
              <li className="flex flex-col">
                <span className="text-body text-base-900">
                  Delivery order issued — {d.do_number}
                </span>
                <span className="text-label text-base-600">
                  {fmtDate(d.issued_at)} · issued by the system when every requirement was met
                </span>
              </li>
              {(data?.attempts ?? []).map((a, i) => (
                <li key={i} className="flex flex-col">
                  <span className="text-body text-base-900">
                    {a.result === "delivered"
                      ? "Delivered"
                      : a.result === "partial"
                        ? "Partially delivered"
                        : "Failed delivery"}
                    {a.reason_key ? ` — ${deliveryReasonLabel(a.reason_key)}` : ""}
                  </span>
                  <span className="text-label text-base-600">{fmtDate(a.recorded_at)}</span>
                </li>
              ))}
              {d.voided_at ? (
                <li className="flex flex-col">
                  <span className="text-body text-base-900">
                    Cancelled —{" "}
                    {d.void_reason === "order_cancelled" ? "order cancelled" : "rescheduled"}
                  </span>
                  <span className="text-label text-base-600">{fmtDate(d.voided_at)}</span>
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
