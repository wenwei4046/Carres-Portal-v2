/**
 * Purchasing → PO Amendments (`?tab=po-amendments`) and Cancellation Requests
 * (`?tab=po-cancellation-requests`) — one register, two queues (0717).
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23;
 * Jess was not part of this decision): PO amendments and PO cancellations go
 * through approval queues, the Houzs way (Houzs scm-v2/PoAmendments.tsx and
 * scm-v2/CancelRequests.tsx). It overturns Purchasing MASTER "no new amendment
 * register" and "§5.8.1 is the sole cancellation journey".
 *
 *   PO Amendments          one approval: the Purchasing Approver.
 *   Cancellation Requests  PO Duty first, then the Purchasing Approver.
 *
 * The final approval runs the EXISTING engine (purchasing_revise_po /
 * operation_cancel_po) in the same transaction; a refusal leaves the request
 * waiting and says why. The server decides who may approve; this page shows
 * the buttons and prints the server's answer.
 */
import { useMemo, useState } from "react";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH } from "@/components/register/register-field-widths";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import Modal from "@/components/kit/Modal";
import Textarea from "@/components/kit/Textarea";
import { fmtDate } from "@/lib/fmt-date";
import { useDecidePoChange, usePoChangeRequests, type PoChangeRequestRow } from "@/lib/queries";
import PurchasingTabs from "./PurchasingTabs";

type Kind = "amendment" | "cancellation";

export const PO_CHANGE_STATUS_WORD: Record<Kind, Record<PoChangeRequestRow["status"], string>> = {
  amendment: { requested: "Waiting for approval", first_approved: "Waiting for approval", approved: "Approved", rejected: "Rejected" },
  cancellation: { requested: "Waiting for PO Duty", first_approved: "Waiting for Purchasing Approver", approved: "Approved", rejected: "Rejected" },
};
const NOUN: Record<Kind, [string, string]> = { amendment: ["amendment", "amendments"], cancellation: ["request", "requests"] };
const isOpen = (r: PoChangeRequestRow) => r.status === "requested" || r.status === "first_approved";

export default function OperationPoChangeRequests({ kind }: { kind: Kind }) {
  const query = usePoChangeRequests(kind);
  const decide = useDecidePoChange();
  const rows = query.data?.requests ?? [];
  const [chosen, setChosen] = useState<PoChangeRequestRow | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = rows.filter(isOpen).length;
  const word = (r: PoChangeRequestRow) => PO_CHANGE_STATUS_WORD[kind][r.status] ?? r.status;
  const [one, many] = NOUN[kind];

  const columns = useMemo<DataGridColumn<PoChangeRequestRow>[]>(() => [
    { key: "status", label: "Status", width: 220, accessor: word, filterValue: word, filterType: "enum", exportValue: word },
    { key: "po", label: "PO No", width: 150, accessor: (r) => r.po_id, searchValue: (r) => r.po_id },
    { key: "supplier", label: "Supplier", width: 160, wrap: true, accessor: (r) => r.supplier_name ?? "",
      filterValue: (r) => r.supplier_name ?? "", filterType: "enum" },
    { key: "change", label: "Change", width: 240, wrap: true, accessor: (r) => r.summary },
    { key: "reason", label: "Reason", width: 220, wrap: true, accessor: (r) => r.reason },
    { key: "requested_by", label: "Requested by", width: 140, accessor: (r) => r.requested_by_name ?? "",
      filterValue: (r) => r.requested_by_name ?? "", filterType: "enum" },
    { key: "requested_at", label: "Requested", width: REGISTER_FIELD_WIDTH.date, accessor: (r) => fmtDate(r.requested_at),
      dateValue: (r) => r.requested_at, filterType: "date", exportValue: (r) => r.requested_at },
    ...(kind === "cancellation"
      ? [{ key: "first_approved_by", label: "First approval", width: 140, accessor: (r: PoChangeRequestRow) => r.first_approved_by_name ?? "" }]
      : []),
    { key: "decided_by", label: "Decided by", width: 140, accessor: (r) => r.decided_by_name ?? "" },
    { key: "decided_at", label: "Decided", width: REGISTER_FIELD_WIDTH.date, accessor: (r) => fmtDate(r.decided_at),
      dateValue: (r) => r.decided_at ?? "", exportValue: (r) => r.decided_at ?? "" },
    { key: "decision_note", label: "Decision reason", width: 220, wrap: true, defaultHidden: true, accessor: (r) => r.decision_note ?? "" },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [kind]);

  const close = () => { setChosen(null); setNote(""); setProblem(null); };
  const act = (approve: boolean) => {
    if (!chosen) return;
    setProblem(null);
    decide.mutate({ id: chosen.id, approve, note: note.trim() || undefined }, {
      onSuccess: close,
      onError: (cause) => setProblem((cause as { body?: { message?: string } }).body?.message ?? (cause instanceof Error ? cause.message : "Not confirmed · Try again")),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={`operation-po-${kind}-requests`}>
      <PurchasingTabs />
      {query.isError ? (
        <div role="alert">
          <EmptyState title={`The ${many} could not be opened`} detail="Try again."
            action={<Button variant="neutral" onClick={() => void query.refetch()}>Try again</Button>} />
        </div>
      ) : (
        <ListPageShell register>
          <DataGrid rows={rows} columns={columns} rowKey={(r) => r.id}
            rowTestId={(r) => `po-change-row-${r.id}`}
            storageKey={`carres.operation.po-${kind}-requests.v1`} appearance="reference" fillColumn="change"
            exportName={kind === "amendment" ? "PO Amendments" : "Cancellation Requests"}
            groupBanner={false} isLoading={query.isLoading}
            onRowClick={(r) => { setChosen(r); setNote(""); setProblem(null); }}
            searchPlaceholder={`Search ${many}…`}
            emptyMessage={`No ${many} yet.`}
            statusSummary={(visible) => <span data-testid="po-change-summary">
              {visible.length} {visible.length === 1 ? one : many} · {waiting} waiting
            </span>} />
        </ListPageShell>
      )}
      <Modal open={!!chosen} onOpenChange={(open) => { if (!open) close(); }} title={chosen?.po_id ?? ""}
        description={chosen ? word(chosen) : undefined}
        footer={<>
          <Button variant="neutral" onClick={close} disabled={decide.isPending}>Back</Button>
          {chosen && isOpen(chosen) ? <>
            <Button variant="neutral" onClick={() => act(false)} disabled={decide.isPending || !note.trim()}>Reject</Button>
            <Button variant="primary" onClick={() => act(true)} disabled={decide.isPending}>Approve</Button>
          </> : null}
        </>}>
        {chosen ? <div className="space-y-3 text-body">
          <div><div className="text-meta text-kit-slate-11">Change</div><div>{chosen.summary}</div></div>
          <div><div className="text-meta text-kit-slate-11">Reason</div><div>{chosen.reason}</div></div>
          <div className="text-meta text-kit-slate-11">Requested by {chosen.requested_by_name ?? "Not recorded"} · {fmtDate(chosen.requested_at)}</div>
          {chosen.first_approved_by_name ? <div className="text-meta text-kit-slate-11">First approval {chosen.first_approved_by_name} · {fmtDate(chosen.first_approved_at)}</div> : null}
          {chosen.decision_note ? <div><div className="text-meta text-kit-slate-11">Decision reason</div><div>{chosen.decision_note}</div></div> : null}
          {isOpen(chosen) ? <Textarea id="po-change-decision-reason" label="Decision reason" hint="Needed to reject."
            value={note} onChange={(event) => setNote(event.target.value)} disabled={decide.isPending} /> : null}
          {problem ? <p role="alert" className="text-meta text-kit-red-11">{problem}</p> : null}
        </div> : null}
      </Modal>
    </div>
  );
}
