import { useMemo, useState, type ReactNode } from "react";
import type { ReceivingRegisterParent } from "@carres/shared";
import {
  DataGrid,
  type DataGridColumn,
} from "@/components/register/DataGrid";
import { fmtDateShort } from "@/lib/fmt-date";

// design-standard: not-a-list-page — embedded register inside OperationReceiving's shared shell.

const ACTION =
  "inline-flex h-7 items-center rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white hover:opacity-90";
const DOCUMENT_ACTION =
  "font-mono font-semibold text-kit-blue-11 underline decoration-kit-blue-6 underline-offset-2 hover:text-kit-blue-12";

function displayDate(value: string | null): string {
  return value ? fmtDateShort(value.slice(0, 10)) : "—";
}

function quantity(value: number): ReactNode {
  return <span className="tabular-nums">{value}</span>;
}

function ChildRows({
  parent,
  onOpenSession,
}: {
  parent: ReceivingRegisterParent;
  onOpenSession: (sessionId: string, sourceId: string) => void;
}) {
  if (parent.children.length === 0) {
    return <p className="px-3 py-2 text-meta text-kit-slate-9">No Receiving Session yet.</p>;
  }

  return (
    <div className="overflow-x-auto" data-testid={`receiving-children-${parent.id}`}>
      <table className="min-w-[1500px] w-full border-collapse text-body">
        <tbody>
          {parent.children.map((child) => (
            <tr key={child.id} className="bg-kit-slate-2 [&>td]:border-r [&>td]:border-kit-slate-5 [&>td]:px-2 [&>td]:py-2 last:[&>td]:border-r-0">
              <td className="w-[160px]">
                <button
                  type="button"
                  className={DOCUMENT_ACTION}
                  aria-label={`Open ${child.grnNumber ?? "Receiving Session"}`}
                  onClick={() => onOpenSession(child.id, parent.id)}
                >
                  {child.grnNumber ?? "Receiving Session"}
                </button>
              </td>
              <td className="w-[155px] font-mono">{parent.sourceNumber}</td>
              <td>{displayDate(child.poIssuedAt)}</td>
              <td>{child.supplier || "—"}</td>
              <td>{child.deliverTo || "—"}</td>
              <td>{displayDate(child.poDeliveryDate)}</td>
              <td>{child.sameAsPo ? "Same as PO" : displayDate(child.supplierDeliveryDate)}</td>
              <td>{displayDate(child.goodsReceivedAt)}</td>
              <td>{child.orderQty}</td>
              <td>{child.receivedQty}</td>
              <td>{child.damagedQty}</td>
              <td>{child.wrongItemQty}</td>
              <td>{child.extraQty}</td>
              <td><span className="sr-only">Pending Delivery Qty </span>{child.pendingDeliveryQty}</td>
              <td className="font-mono">{child.supplierDoNo ?? "—"}</td>
              <td className="font-mono">{child.unitIds.length ? child.unitIds.join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="sr-only">Pending Delivery Qty {parent.pendingDeliveryQty}</span>
    </div>
  );
}

export default function ReceivingRegister({
  parents,
  loading,
  onOpenSession,
  onStartReceiving,
  onShowFilters,
}: {
  parents: readonly ReceivingRegisterParent[];
  loading: boolean;
  onOpenSession: (sessionId: string, sourceId: string) => void;
  onStartReceiving: (sourceId: string, sourceVersion: number) => void;
  onShowFilters?: () => void;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const selected = parents.find((parent) => selectedKeys.has(parent.id)) ?? null;
  const openSession = selected?.children.find((child) => child.grnNumber == null) ?? null;
  const columns = useMemo<DataGridColumn<ReceivingRegisterParent>[]>(() => [
    {
      key: "grn",
      label: "GRN No.",
      width: 170,
      sortable: false,
      searchValue: (row) => row.children.map((child) => child.grnNumber ?? "").join(" "),
      accessor: (row) => row.children.map((child) => child.grnNumber).filter(Boolean).join(", ") || "—",
    },
    {
      key: "source",
      label: "PO No.",
      width: 160,
      sortable: true,
      accessor: (row) => <span className="font-mono">{row.sourceNumber}</span>,
      searchValue: (row) => row.sourceNumber,
    },
    {
      key: "issued",
      label: "PO Issued",
      width: 105,
      sortable: true,
      dateValue: (row) => row.poIssuedAt,
      filterType: "date",
      accessor: (row) => displayDate(row.poIssuedAt),
    },
    { key: "supplier", label: "Supplier", width: 150, sortable: true, accessor: (row) => row.supplier || "—", searchValue: (row) => row.supplier },
    { key: "destination", label: "Deliver To", width: 155, sortable: true, accessor: (row) => row.deliverTo || "—", searchValue: (row) => row.deliverTo },
    { key: "poDate", label: "PO Delivery Date", width: 135, sortable: true, filterType: "date", dateValue: (row) => row.poDeliveryDate, accessor: (row) => displayDate(row.poDeliveryDate) },
    { key: "supplierDate", label: "Supplier Delivery Date", width: 160, sortable: true, filterType: "date", dateValue: (row) => row.supplierDeliveryDate, accessor: (row) => row.sameAsPo ? "Same as PO" : displayDate(row.supplierDeliveryDate) },
    { key: "receivedAt", label: "Goods Received At", width: 140, sortable: true, filterType: "date", dateValue: (row) => row.goodsReceivedAt, accessor: (row) => displayDate(row.goodsReceivedAt) },
    { key: "ordered", label: "Order Qty", width: 90, align: "right", sortable: true, numberValue: (row) => row.orderQty, filterType: "number", accessor: (row) => quantity(row.orderQty) },
    { key: "received", label: "Received Qty", width: 105, align: "right", sortable: true, numberValue: (row) => row.receivedQty, filterType: "number", accessor: (row) => quantity(row.receivedQty) },
    { key: "damaged", label: "Damaged Qty", width: 105, align: "right", sortable: true, numberValue: (row) => row.damagedQty, filterType: "number", accessor: (row) => quantity(row.damagedQty) },
    { key: "wrong", label: "Wrong Item Qty", width: 120, align: "right", sortable: true, numberValue: (row) => row.wrongItemQty, filterType: "number", accessor: (row) => quantity(row.wrongItemQty) },
    { key: "extra", label: "Extra Qty", width: 90, align: "right", sortable: true, numberValue: (row) => row.extraQty, filterType: "number", accessor: (row) => quantity(row.extraQty) },
    { key: "pending", label: "Pending Delivery Qty", width: 145, align: "right", sortable: true, numberValue: (row) => row.pendingDeliveryQty, filterType: "number", accessor: (row) => quantity(row.pendingDeliveryQty) },
    { key: "do", label: "Supplier DO No.", width: 140, accessor: (row) => row.children.map((child) => child.supplierDoNo).filter(Boolean).join(", ") || "—", searchValue: (row) => row.children.map((child) => child.supplierDoNo ?? "").join(" ") },
    { key: "units", label: "Unit ID", width: 180, accessor: (row) => row.children.flatMap((child) => child.unitIds).join(", ") || "—", searchValue: (row) => row.children.flatMap((child) => child.unitIds).join(" ") },
  ], []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white" data-testid="receiving-register">
      <DataGrid<ReceivingRegisterParent>
        appearance="reference"
        rows={[...parents]}
        columns={columns}
        storageKey="carres.receiving.register.v1"
        rowKey={(row) => row.id}
        exportName="Receiving"
        searchPlaceholder="Search Receiving…"
        isLoading={loading}
        emptyMessage="No open delivery balances."
        groupBanner={false}
        stickyIdentity={{ columnKey: "source" }}
        expandTitle="Show Receiving Sessions and GRNs"
        expandable={{
          rowExpansionKey: (row) => row.id,
          testId: (row) => `receiving-expand-${row.id}`,
          renderExpansion: (row) => <ChildRows parent={row} onOpenSession={onOpenSession} />,
        }}
        selectable={{
          selectedKeys,
          onToggle: (id) => setSelectedKeys((current) => current.has(id) ? new Set() : new Set([id])),
          onToggleAll: (keys, allSelected) => setSelectedKeys(allSelected || keys.length === 0 ? new Set() : new Set([keys[0]])),
          testId: (row) => `receiving-select-${(row as ReceivingRegisterParent).id}`,
        }}
        selectionSummary={(n) => `${n} delivery balance selected`}
        selectionPrimary={selected ? (
          openSession ? (
            <button type="button" className={ACTION} onClick={() => onOpenSession(openSession.id, selected.id)}>
              Open Receiving
            </button>
          ) : (
            <button type="button" className={ACTION} onClick={() => onStartReceiving(selected.id, selected.sourceVersion)}>
              Start Receiving
            </button>
          )
        ) : null}
        toolbarStart={onShowFilters ? (
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-control border border-kit-slate-5 px-2 text-meta"
            onClick={onShowFilters}
          >
            Show filters
          </button>
        ) : null}
        statusSummary={(rows) => {
          const orderQty = rows.reduce((sum, row) => sum + row.orderQty, 0);
          const receivedQty = rows.reduce((sum, row) => sum + row.receivedQty, 0);
          const pendingQty = rows.reduce((sum, row) => sum + row.pendingDeliveryQty, 0);
          return <span>{rows.length} delivery balances · Order Qty {orderQty} · Received Qty {receivedQty} · Pending Delivery Qty {pendingQty}</span>;
        }}
      />
    </div>
  );
}
