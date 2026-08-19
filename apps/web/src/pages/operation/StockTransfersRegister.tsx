import { useMemo } from "react";
import {
  STOCK_TRANSFER_STATE_LABEL,
  stockTransferPurposeLabel,
  stockTransferStateOf,
  type OrderActionTone,
  type StockTransferState,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import StatusPill from "@/components/kit/StatusPill";
import {
  useStockTransfersRegister,
  type StockTransferEventRow,
  type StockTransferRow,
} from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import StockTabs from "./StockTabs";

/**
 * THE TRANSFERS REGISTER — the cross-site custody journey under WAREHOUSE
 * (Warehouse Blueprint item 8, owner-approved 2026-08-14; card 2026-08-19;
 * register shell law docs/ui/MASTER.md §6.7).
 *
 * The owner's own default columns, in her order:
 *
 *   Transfer No. | From | To | Units | Purpose | State | Collection |
 *   Expected arrival | Received
 *
 * (`Exceptions` is the blueprint's tenth column and belongs to the
 * partial-receipt slice; a column that can only ever print nothing teaches the
 * operator to stop reading it, so it joins when it can be true.)
 *
 * State is the ONE shared arithmetic `stockTransferStateOf` over the recorded
 * events — nothing on this page computes a second version of it, and nothing
 * anywhere stores it. A register finds documents: no owner, no avatar, no
 * action sentence.
 */

/** Requested GREY · In transit BLUE (the thing in motion) · Received GREEN ·
 *  Cancelled GREY. Blue marks the current thing, which is exactly what a
 *  journey underway is (`01-design-tokens.md:101`). */
const STATE_TONE: Record<StockTransferState, OrderActionTone> = {
  requested: "neutral",
  in_transit: "info",
  received: "success",
  cancelled: "neutral",
};

interface TransferRegisterRow {
  id: string;
  transferNo: string;
  from: string;
  to: string;
  units: number;
  purpose: string;
  state: StockTransferState;
  /** When the goods actually left; null until they have. */
  collectedAt: string | null;
  expectedDate: string;
  /** When the destination actually received them; null until it has. */
  receivedAt: string | null;
  requestedAt: string;
}

/** Governed absence words — muted, never a dash (COPY-STANDARD 2026-08-15). */
const NOT_COLLECTED = "Not collected yet";
const NOT_RECEIVED = "Not received yet";

function buildRows(
  transfers: StockTransferRow[],
  events: StockTransferEventRow[],
  unitCounts: Map<string, number>,
  siteNames: Map<string, string>,
): TransferRegisterRow[] {
  const byTransfer = new Map<string, StockTransferEventRow[]>();
  for (const e of events) {
    const list = byTransfer.get(e.transfer_id) ?? [];
    list.push(e);
    byTransfer.set(e.transfer_id, list);
  }
  return transfers.map((t) => {
    const own = byTransfer.get(t.id) ?? [];
    const at = (kind: StockTransferEventRow["kind"]) =>
      own.find((e) => e.kind === kind)?.recorded_at ?? null;
    return {
      id: t.id,
      transferNo: t.transfer_no,
      // A site nobody named is said so, never left blank.
      from: siteNames.get(t.from_warehouse_id) ?? "Unknown site",
      to: siteNames.get(t.to_warehouse_id) ?? "Unknown site",
      units: unitCounts.get(t.id) ?? 0,
      purpose: stockTransferPurposeLabel(t.purpose),
      state: stockTransferStateOf(own.map((e) => ({ kind: e.kind }))),
      collectedAt: at("collected"),
      expectedDate: t.expected_date,
      receivedAt: at("arrived"),
      requestedAt: t.requested_at,
    };
  });
}

export default function StockTransfersRegister() {
  const { data, isLoading, isError, error, refetch } = useStockTransfersRegister();

  const rows = useMemo<TransferRegisterRow[]>(() => {
    const unitCounts = new Map<string, number>();
    for (const u of data?.units ?? []) {
      unitCounts.set(u.transfer_id, (unitCounts.get(u.transfer_id) ?? 0) + 1);
    }
    const siteNames = new Map<string, string>();
    for (const w of data?.warehouses ?? []) siteNames.set(w.id, w.name);
    return buildRows(data?.transfers ?? [], data?.events ?? [], unitCounts, siteNames);
  }, [data]);

  const columns = useMemo<DataGridColumn<TransferRegisterRow>[]>(
    () => [
      {
        key: "transfer_no",
        label: "Transfer No.",
        width: 150,
        sortable: true,
        chooserGroup: "Document",
        accessor: (r) => <span className="font-mono font-medium">{r.transferNo}</span>,
        searchValue: (r) => r.transferNo,
        filterValue: (r) => r.transferNo,
      },
      {
        key: "from",
        label: "From",
        width: 160,
        sortable: true,
        chooserGroup: "Journey",
        accessor: (r) => (
          <span className="block truncate" title={r.from}>
            {r.from}
          </span>
        ),
        searchValue: (r) => r.from,
        filterValue: (r) => r.from,
      },
      {
        key: "to",
        label: "To",
        width: 160,
        sortable: true,
        chooserGroup: "Journey",
        accessor: (r) => (
          <span className="block truncate" title={r.to}>
            {r.to}
          </span>
        ),
        searchValue: (r) => r.to,
        filterValue: (r) => r.to,
      },
      {
        /* The count of EXACT units this transfer carries — the blueprint's
           rejection of "只记录 SKU 数量" is why the unit rows exist at all. */
        key: "units",
        label: "Units",
        width: 80,
        sortable: true,
        chooserGroup: "Journey",
        accessor: (r) => r.units,
        searchValue: (r) => String(r.units),
        filterValue: (r) => String(r.units),
        sortFn: (a, b) => a.units - b.units,
      },
      {
        key: "purpose",
        label: "Purpose",
        width: 170,
        sortable: true,
        chooserGroup: "Journey",
        accessor: (r) => (
          <span className="block truncate" title={r.purpose}>
            {r.purpose}
          </span>
        ),
        searchValue: (r) => r.purpose,
        filterValue: (r) => r.purpose,
      },
      {
        key: "state",
        label: "State",
        width: 130,
        sortable: true,
        chooserGroup: "Document",
        accessor: (r) => (
          <StatusPill tone={STATE_TONE[r.state]}>
            {STOCK_TRANSFER_STATE_LABEL[r.state]}
          </StatusPill>
        ),
        searchValue: (r) => STOCK_TRANSFER_STATE_LABEL[r.state],
        filterValue: (r) => STOCK_TRANSFER_STATE_LABEL[r.state],
      },
      {
        /* When the goods actually LEFT — a recorded fact, never a plan. */
        key: "collection",
        label: "Collection",
        width: 130,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.collectedAt,
        accessor: (r) =>
          r.collectedAt ? (
            fmtDate(r.collectedAt)
          ) : (
            <span className="text-kit-slate-9" data-absence="true">
              {NOT_COLLECTED}
            </span>
          ),
        searchValue: (r) => (r.collectedAt ? fmtDate(r.collectedAt) : NOT_COLLECTED),
        filterValue: (r) => (r.collectedAt ? fmtDate(r.collectedAt) : NOT_COLLECTED),
        sortFn: (a, b) => (a.collectedAt ?? "").localeCompare(b.collectedAt ?? ""),
      },
      {
        key: "expected_arrival",
        label: "Expected arrival",
        width: 148,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.expectedDate,
        accessor: (r) => fmtDate(r.expectedDate),
        searchValue: (r) => fmtDate(r.expectedDate),
        filterValue: (r) => fmtDate(r.expectedDate),
        sortFn: (a, b) => a.expectedDate.localeCompare(b.expectedDate),
      },
      {
        /* When the destination actually RECEIVED them. Empty is the honest
           answer for goods still on the road — the two facts never merge. */
        key: "received",
        label: "Received",
        width: 130,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.receivedAt,
        accessor: (r) =>
          r.receivedAt ? (
            fmtDate(r.receivedAt)
          ) : (
            <span className="text-kit-slate-9" data-absence="true">
              {NOT_RECEIVED}
            </span>
          ),
        searchValue: (r) => (r.receivedAt ? fmtDate(r.receivedAt) : NOT_RECEIVED),
        filterValue: (r) => (r.receivedAt ? fmtDate(r.receivedAt) : NOT_RECEIVED),
        sortFn: (a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? ""),
      },
      {
        key: "requested",
        label: "Requested",
        width: 130,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.requestedAt,
        accessor: (r) => fmtDate(r.requestedAt),
        searchValue: (r) => fmtDate(r.requestedAt),
        filterValue: (r) => fmtDate(r.requestedAt),
        sortFn: (a, b) => a.requestedAt.localeCompare(b.requestedAt),
      },
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StockTabs />
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
          <DataGrid<TransferRegisterRow>
            appearance="reference"
            rows={rows}
            columns={columns}
            storageKey="carres.stockTransfers.register.v1"
            rowKey={(r) => r.id}
            exportName="Transfers"
            searchPlaceholder="Search transfers…"
            isLoading={isLoading}
            /* The governed empty state answers all three questions (COPY-
               STANDARD): what is missing, why, and who does what next. */
            emptyMessage={
              rows.length === 0
                ? "No transfers yet — goods move between two sites on a transfer, so the warehouse can prove who handed them over and that the same units arrived."
                : "No matching transfers."
            }
            groupBanner={false}
            stickyIdentity
            chooserGroupOrder={["Document", "Journey", "Dates"]}
            statusSummary={(filtered) => {
              const word = filtered.length === 1 ? "transfer" : "transfers";
              const line =
                filtered.length === rows.length
                  ? `${filtered.length} ${word}`
                  : `${filtered.length} of ${rows.length} transfers`;
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
