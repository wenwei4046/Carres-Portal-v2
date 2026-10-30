/**
 * Sales Orders → Amendments, at `/operation/amendments`.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22; Jess was not part of this
 * decision): every Sales Order amendment waits for an approver, the Houzs way
 * (Houzs `scm-v2/Amendments.tsx`). It overturns Orders MASTER "Staff
 * amendments and Sales Approver" items 1-2, under which an ordinary amendment
 * took effect on submission.
 *
 * The approver's queue of every amendment across orders, waiting ones first.
 * A row opens its Sales Order, where the existing decision panel shows the
 * Before / After and its impact and records `Approve and apply` or `Reject`
 * (0564). The queue itself writes nothing.
 *
 * Follows Houzs frontend/src/pages/scm-v2/Amendments.tsx:1-4 (one queue of every
 * amendment, Requested first) per Weisiang's ruling (2026-10-22): clear Carres
 * rules, implement Houzs.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import { REGISTER_FIELD_WIDTH } from "@/components/register/register-field-widths";
import { fmtDate } from "@/lib/fmt-date";
import { useAmendmentQueue, type AmendmentQueueRow } from "@/lib/queries";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";

export const AMENDMENT_STATUS_WORD: Record<AmendmentQueueRow["status"], string> = {
  waiting: "Waiting for management",
  applied: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const soNo = (r: AmendmentQueueRow) => (r.so != null ? `SO-${r.so}` : "");
const statusWord = (r: AmendmentQueueRow) => AMENDMENT_STATUS_WORD[r.status] ?? r.status;

export default function SalesOrderAmendments() {
  const navigate = useNavigate();
  const query = useAmendmentQueue();
  const rows = query.data?.amendments ?? [];
  const waiting = rows.filter((r) => r.status === "waiting").length;
  const open = (r: AmendmentQueueRow) => navigate(`/operation/orders/so/${encodeURIComponent(r.orderId)}`);

  const columns = useMemo<DataGridColumn<AmendmentQueueRow>[]>(() => [
    { key: "so", label: "SO No", width: 110, accessor: soNo, searchValue: soNo, exportValue: soNo },
    { key: "status", label: "Status", width: 190, accessor: statusWord, filterValue: statusWord, filterType: "enum", exportValue: statusWord },
    { key: "customer", label: "Customer", width: 160, wrap: true, accessor: (r) => r.customerName ?? "" },
    { key: "reason", label: "Reason for change", width: 240, wrap: true, accessor: (r) => r.reason ?? "" },
    { key: "submitted_by", label: "Submitted by", width: 140, accessor: (r) => r.submittedBy ?? "",
      filterValue: (r) => r.submittedBy ?? "", filterType: "enum" },
    { key: "submitted_at", label: "Submitted", width: REGISTER_FIELD_WIDTH.date, accessor: (r) => fmtDate(r.submittedAt),
      dateValue: (r) => r.submittedAt, filterType: "date", exportValue: (r) => r.submittedAt },
    { key: "agreement", label: "Customer agreement", width: 150,
      accessor: (r) => (r.agreementRecorded ? "Recorded" : "Not recorded"), filterType: "enum",
      filterValue: (r) => (r.agreementRecorded ? "Recorded" : "Not recorded") },
    { key: "decided_by", label: "Decided by", width: 140, accessor: (r) => r.decidedBy ?? "" },
    { key: "decided_at", label: "Decided", width: REGISTER_FIELD_WIDTH.date, accessor: (r) => fmtDate(r.decidedAt),
      dateValue: (r) => r.decidedAt ?? "", exportValue: (r) => r.decidedAt ?? "" },
    { key: "decision_note", label: "Management decision reason", width: 220, wrap: true, defaultHidden: true,
      accessor: (r) => r.decisionNote ?? "" },
  ], []);

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="amendments-destination-header" word="Amendments"
      docTitle="Amendments · Carres" />
    <ListPageShell register>
      <DataGrid rows={rows} columns={columns} rowKey={(r) => r.id}
        rowTestId={(r) => `amendment-row-${r.id}`}
        storageKey="carres.operation.amendments.v1" appearance="reference" fillColumn="reason" exportName="Amendments"
        groupBanner={false} stickyIdentity isLoading={query.isLoading} wrapToolbar
        onRowClick={open}
        searchPlaceholder="Search amendments…"
        emptyMessage="No amendments yet."
        errorState={query.isError && !query.data ? (
          <div role="alert">
            <EmptyState title="Could not be loaded" detail="The amendments could not be opened."
              action={<Button variant="neutral" onClick={() => void query.refetch()}>Try again</Button>} />
          </div>
        ) : undefined}
        statusSummary={(visible) => <span data-testid="amendments-summary">
          {visible.length} {visible.length === 1 ? "amendment" : "amendments"} · {waiting} waiting for management
        </span>} />
    </ListPageShell>
  </div>;
}
