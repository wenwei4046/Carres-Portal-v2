import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  deliveryOrderStatusOf,
  type DeliveryOrderStatus,
  type OrderActionTone,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import StatusPill from "@/components/kit/StatusPill";
import {
  useDeliveryOrdersRegister,
  type DeliveryOrderAttemptRow,
  type DeliveryOrderRow,
} from "@/lib/queries";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import { conciseLocality } from "./sales-order-columns";

/**
 * THE DELIVERY ORDERS REGISTER — document truth under SALES
 * (owner-approved blueprint card, 2026-08-16; register shell law
 * docs/ui/MASTER.md §6.7; docs/delivery/MASTER.md §8).
 *
 * A register finds documents. It shows NO owner, NO avatar and NO action
 * sentence — work lives in My Work / Team Work. The columns are the card's
 * ruled seven: DO No · SO No · Customer · Delivery date · Location · Status ·
 * Created. Status is the ONE shared arithmetic (`deliveryOrderStatusOf`) over
 * the void stamp and the attempt history — nothing on this page computes a
 * second version of it.
 *
 * There is deliberately NO create button on Row 2: the SYSTEM issues a DO when
 * a trip's requirements are met (orders MASTER §8) — no Release, no Approve,
 * no Issue, anywhere. The Order Route answers "why is there no DO yet"; this
 * page answers "which DOs exist".
 */

interface DoRegisterRow {
  id: string;
  doNumber: string;
  orderId: string;
  so: number;
  customer: string;
  deliveryDate: string | null;
  timeSlot: string | null;
  location: string;
  status: DeliveryOrderStatus;
  issuedAt: string;
}

const STATUS_TONE: Record<DeliveryOrderStatus["kind"], OrderActionTone> = {
  created: "info",
  out_for_delivery: "info",
  delivered: "success",
  exception: "warning",
  cancelled: "neutral",
};

function buildRow(
  r: DeliveryOrderRow,
  attemptsByDo: Map<string, DeliveryOrderAttemptRow[]>,
): DoRegisterRow {
  const status = deliveryOrderStatusOf({
    voidedAt: r.voided_at,
    voidReason: r.void_reason,
    attempts: (attemptsByDo.get(r.do_number) ?? []).map((a) => ({
      result: a.result,
      reasonKey: a.reason_key,
      recordedAt: a.recorded_at,
    })),
  });
  return {
    id: r.id,
    doNumber: r.do_number,
    orderId: r.orders.id,
    so: r.orders.so,
    customer: displayCustomerName(r.orders.customer_name ?? "") || "No customer name",
    deliveryDate: r.delivery_date,
    timeSlot: r.time_slot,
    location: conciseLocality(
      r.orders.customer_address_city,
      r.orders.customer_address_state,
    ),
    status,
    issuedAt: r.issued_at,
  };
}

/** Governed absence words — muted, never a dash (COPY-STANDARD 2026-08-15). */
const NO_DATE = "No delivery date yet";

export default function DeliveryOrdersRegister() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useDeliveryOrdersRegister();

  const rows = useMemo<DoRegisterRow[]>(() => {
    const attemptsByDo = new Map<string, DeliveryOrderAttemptRow[]>();
    for (const a of data?.attempts ?? []) {
      if (!a.do_number) continue;
      const list = attemptsByDo.get(a.do_number) ?? [];
      list.push(a);
      attemptsByDo.set(a.do_number, list);
    }
    return (data?.deliveryOrders ?? []).map((r) => buildRow(r, attemptsByDo));
  }, [data]);

  const openDeliveryOrder = (r: DoRegisterRow) =>
    navigate(`/operation/delivery-orders/${encodeURIComponent(r.doNumber)}`);

  const columns = useMemo<DataGridColumn<DoRegisterRow>[]>(
    () => [
      {
        key: "do_number",
        label: "DO No",
        width: 150,
        sortable: true,
        chooserGroup: "Document",
        accessor: (r) => (
          <button
            type="button"
            className="font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              openDeliveryOrder(r);
            }}
          >
            {r.doNumber}
          </button>
        ),
        searchValue: (r) => r.doNumber,
        filterValue: (r) => r.doNumber,
      },
      {
        key: "so",
        label: "SO No",
        width: 85,
        sortable: true,
        chooserGroup: "Document",
        accessor: (r) => (
          <button
            type="button"
            className="font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/operation/orders/so/${r.orderId}`);
            }}
          >
            SO-{r.so}
          </button>
        ),
        searchValue: (r) => `SO-${r.so} ${r.so}`,
        filterValue: (r) => `SO-${r.so}`,
        sortFn: (a, b) => a.so - b.so,
      },
      {
        key: "customer",
        label: "Customer",
        width: 190,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.customer}>
            {r.customer}
          </span>
        ),
        searchValue: (r) => r.customer,
        filterValue: (r) => r.customer,
      },
      {
        key: "delivery_date",
        label: "Delivery date",
        width: 148,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.deliveryDate,
        accessor: (r) =>
          r.deliveryDate ? (
            <span className="block truncate">
              {fmtDate(r.deliveryDate)}
              {r.timeSlot ? (
                <span className="text-base-600"> · {r.timeSlot}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-kit-slate-9" data-absence="true">
              {NO_DATE}
            </span>
          ),
        searchValue: (r) => (r.deliveryDate ? fmtDate(r.deliveryDate) : NO_DATE),
        filterValue: (r) => (r.deliveryDate ? fmtDate(r.deliveryDate) : NO_DATE),
        sortFn: (a, b) => (a.deliveryDate ?? "").localeCompare(b.deliveryDate ?? ""),
      },
      {
        key: "location",
        label: "Location",
        width: 200,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.location}>
            {r.location}
          </span>
        ),
        searchValue: (r) => r.location,
        filterValue: (r) => r.location,
      },
      {
        key: "status",
        label: "Status",
        width: 190,
        sortable: true,
        chooserGroup: "Document",
        /* Two-line 13/11 grammar (ui MASTER §5): the pill is the document
           status; an exception's ONE reason rides line 2 in the quieter rank.
           A register still shows no action sentence — the reason is a FACT. */
        accessor: (r) => (
          <span className="block min-w-0">
            <StatusPill tone={STATUS_TONE[r.status.kind]}>{r.status.label}</StatusPill>
            {r.status.reasonLabel ? (
              <span className="block truncate text-label font-normal text-base-600">
                {r.status.reasonLabel}
              </span>
            ) : null}
          </span>
        ),
        searchValue: (r) =>
          r.status.reasonLabel ? `${r.status.label} ${r.status.reasonLabel}` : r.status.label,
        filterValue: (r) => r.status.label,
      },
      {
        key: "created",
        label: "Created",
        width: 113,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.issuedAt,
        accessor: (r) => fmtDate(r.issuedAt),
        searchValue: (r) => fmtDate(r.issuedAt),
        filterValue: (r) => fmtDate(r.issuedAt),
        sortFn: (a, b) => a.issuedAt.localeCompare(b.issuedAt),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate],
  );

  const contextMenu = (r: DoRegisterRow): DataGridContextMenuItem[] => [
    { label: "View", onClick: () => openDeliveryOrder(r) },
    { label: "Open SO-" + r.so, onClick: () => navigate(`/operation/orders/so/${r.orderId}`) },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        testId="delivery-orders-destination-header"
        word="Delivery Orders"
        docTitle="Delivery Orders — Carres"
        destinationHeader
      />
      <div className="flex min-h-0 flex-1 flex-col p-2" data-testid="register-column">
        {isError ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
            <p className="text-body text-base-700">The register could not be loaded</p>
            {(error as Error | undefined)?.message ? (
              <p className="text-meta text-base-500">{(error as Error).message}</p>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-base-50"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </div>
        ) : (
          <DataGrid<DoRegisterRow>
            appearance="reference"
            rows={rows}
            columns={columns}
            storageKey="carres.deliveryOrders.register.v1"
            rowKey={(r) => r.id}
            exportName="Delivery Orders"
            searchPlaceholder="Search delivery orders…"
            isLoading={isLoading}
            /* The governed empty state answers all three questions (COPY-
               STANDARD): what is missing, why, and who does what next. */
            emptyMessage={
              rows.length === 0
                ? "No delivery orders yet — the system issues one when a trip's goods, logistics and date are ready. The Order Route on each Sales Order shows what is still open."
                : "No matching delivery orders."
            }
            groupBanner={false}
            stickyIdentity
            chooserGroupOrder={["Document", "Customer", "Dates"]}
            onRowDoubleClick={openDeliveryOrder}
            contextMenu={contextMenu}
            statusSummary={(filtered) => {
              const word = filtered.length === 1 ? "delivery order" : "delivery orders";
              const line =
                filtered.length === rows.length
                  ? `${filtered.length} ${word}`
                  : `${filtered.length} of ${rows.length} delivery orders`;
              return (
                <span className="block truncate" title={line}>
                  {line}
                </span>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
