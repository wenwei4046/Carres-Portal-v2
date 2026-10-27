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
 *
 * YH, chat 2026-10-26: any other person with the approver's permission (any
 * active Principal) decides — never the requester, who reads "Waiting for
 * another approver". Approvers read the whole request on the row, including a
 * cancellation's supplier facts, with Approve / Reject on the row (Houzs
 * scm-v2/CancelRequests.tsx "Actions" column). A PO with a waiting request
 * carries a flag on the PO pages linking here (`PoWaitingFlags`).
 * Follows Houzs CancelRequests.tsx:174 (row Actions), document-cancel-queries.ts:237-254
 * (approve / withdraw rules) and PurchaseOrderDetailV2.tsx:1402-1430 (PO flag)
 * per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  amendment: { requested: "Waiting for approval", first_approved: "Waiting for approval", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" },
  cancellation: { requested: "Waiting for PO Duty", first_approved: "Waiting for Purchasing Approver", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" },
};
const NOUN: Record<Kind, [string, string]> = { amendment: ["amendment", "amendments"], cancellation: ["request", "requests"] };
const isOpen = (r: PoChangeRequestRow) => r.status === "requested" || r.status === "first_approved";
export const WAITING_FOR_ANOTHER = "Waiting for another approver";
const statusWord = (kind: Kind, r: PoChangeRequestRow) =>
  r.mine && isOpen(r) ? WAITING_FOR_ANOTHER : PO_CHANGE_STATUS_WORD[kind][r.status] ?? r.status;
const TAB: Record<Kind, string> = { amendment: "po-amendments", cancellation: "po-cancellation-requests" };
const SUPPLIER_REPLY: Record<string, string> = {
  awaiting: "Waiting for supplier to agree", agreed: "Supplier agrees", unable_to_supply: "Supplier cannot supply", disagreed: "Supplier disagrees",
};
const yesNo = (v: string | boolean | null | undefined) => (v === "yes" || v === true ? "Yes" : v === "no" || v === false ? "No" : "Not confirmed");
const factsOf = (r: PoChangeRequestRow) => r.supplier_facts ? {
  reply: SUPPLIER_REPLY[r.supplier_facts.supplierStatement] ?? r.supplier_facts.supplierStatement,
  fee: yesNo(r.supplier_facts.fee),
  shipped: yesNo(r.supplier_facts.shipped),
  evidence: `${r.supplier_facts.evidence.length} ${r.supplier_facts.evidence.length === 1 ? "file" : "files"}`,
} : null;

/** Open requests by PO, both queues — the PO pages' flag reads this. */
export function useWaitingPoChangeRequests() {
  const amendments = usePoChangeRequests("amendment");
  const cancellations = usePoChangeRequests("cancellation");
  return useMemo(() => {
    const byPo = new Map<string, Array<{ kind: Kind; row: PoChangeRequestRow }>>();
    for (const [kind, q] of [["amendment", amendments], ["cancellation", cancellations]] as const) {
      for (const row of q.data?.requests ?? []) {
        if (isOpen(row)) byPo.set(row.po_id, [...(byPo.get(row.po_id) ?? []), { kind, row }]);
      }
    }
    return byPo;
  }, [amendments.data, cancellations.data]);
}

/** The flag a PO with a waiting request carries, linking to the request. */
export function PoWaitingFlags({ waiting }: { waiting: Array<{ kind: Kind; row: PoChangeRequestRow }> | undefined }) {
  if (!waiting?.length) return null;
  return <>{waiting.map(({ kind, row }) => (
    <Link key={row.id} data-testid={`po-waiting-flag-${row.id}`} onClick={(event) => event.stopPropagation()}
      to={`/operation?tab=${TAB[kind]}&request=${encodeURIComponent(row.id)}`}
      className="text-meta font-medium text-c-warn-fg hover:underline">
      {statusWord(kind, row)}
    </Link>
  ))}</>;
}

export default function OperationPoChangeRequests({ kind }: { kind: Kind }) {
  const query = usePoChangeRequests(kind);
  const decide = useDecidePoChange();
  const rows = query.data?.requests ?? [];
  /* `?request=<id>` — the PO pages' flag opens the request here. */
  const [params, setParams] = useSearchParams();
  const [chosenId, setChosenId] = useState<string | null>(() => params.get("request"));
  const chosen = rows.find((r) => r.id === chosenId) ?? null;
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = rows.filter(isOpen).length;
  const word = (r: PoChangeRequestRow) => statusWord(kind, r);
  const openRequest = (r: PoChangeRequestRow) => { setChosenId(r.id); setNote(""); setProblem(null); };
  const canDecide = (r: PoChangeRequestRow) => isOpen(r) && !r.mine;
  /* Houzs withdraw: the requester or an approver (the server checks which);
     an amendment only before it is decided. */
  const canWithdraw = (r: PoChangeRequestRow) => isOpen(r) && (kind === "cancellation" || r.status === "requested");
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
    ...(kind === "cancellation"
      ? (["reply", "fee", "shipped", "evidence"] as const).map((key) => ({
          key: `supplier_${key}`, width: key === "reply" ? 180 : 120, wrap: true,
          label: { reply: "Supplier reply", fee: "Fee", shipped: "Shipped", evidence: "Evidence" }[key],
          accessor: (r: PoChangeRequestRow) => factsOf(r)?.[key] ?? "",
        }))
      : []),
    { key: "decision_note", label: "Decision reason", width: 220, wrap: true, defaultHidden: true, accessor: (r) => r.decision_note ?? "" },
    { key: "actions", label: "Actions", width: 190, accessor: (r) => canDecide(r)
      ? <span className="flex gap-2" onClick={(event) => event.stopPropagation()}>
          <Button variant="primary" onClick={() => openRequest(r)}>Approve</Button>
          <Button variant="neutral" onClick={() => openRequest(r)}>Reject</Button>
        </span>
      : "" },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [kind]);

  const close = () => {
    setChosenId(null); setNote(""); setProblem(null);
    if (params.has("request")) setParams((current) => { const next = new URLSearchParams(current); next.delete("request"); return next; }, { replace: true });
  };
  const act = (approve: boolean, withdraw = false) => {
    if (!chosen) return;
    setProblem(null);
    decide.mutate({ id: chosen.id, approve, note: note.trim() || undefined, ...(withdraw ? { withdraw } : {}) }, {
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
            onRowClick={openRequest}
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
          {chosen && canWithdraw(chosen) ? <Button variant="neutral" onClick={() => act(false, true)} disabled={decide.isPending}>Withdraw</Button> : null}
          {chosen && canDecide(chosen) ? <>
            <Button variant="neutral" onClick={() => act(false)} disabled={decide.isPending || !note.trim()}>Reject</Button>
            <Button variant="primary" onClick={() => act(true)} disabled={decide.isPending}>Approve</Button>
          </> : null}
        </>}>
        {chosen ? <div className="space-y-3 text-body">
          <div><div className="text-meta text-kit-slate-11">Change</div><div>{chosen.summary}</div></div>
          <div><div className="text-meta text-kit-slate-11">Reason</div><div>{chosen.reason}</div></div>
          <div className="text-meta text-kit-slate-11">Requested by {chosen.requested_by_name ?? "Not recorded"} · {fmtDate(chosen.requested_at)}</div>
          {factsOf(chosen) ? <div className="text-meta text-kit-slate-11">
            Supplier reply {factsOf(chosen)?.reply} · Fee {factsOf(chosen)?.fee} · Shipped {factsOf(chosen)?.shipped} · Evidence {factsOf(chosen)?.evidence}
          </div> : null}
          <Link className="text-meta font-medium text-kit-blue-11 hover:underline" to={`/operation?tab=purchase-orders&po=${encodeURIComponent(chosen.po_id)}`}>Open {chosen.po_id}</Link>
          {chosen.first_approved_by_name ? <div className="text-meta text-kit-slate-11">First approval {chosen.first_approved_by_name} · {fmtDate(chosen.first_approved_at)}</div> : null}
          {chosen.decision_note ? <div><div className="text-meta text-kit-slate-11">Decision reason</div><div>{chosen.decision_note}</div></div> : null}
          {canWithdraw(chosen) ? <Textarea id="po-change-decision-reason" label="Decision reason" hint={canDecide(chosen) ? "Needed to reject." : undefined}
            value={note} onChange={(event) => setNote(event.target.value)} disabled={decide.isPending} /> : null}
          {problem ? <p role="alert" className="text-meta text-kit-red-11">{problem}</p> : null}
        </div> : null}
      </Modal>
    </div>
  );
}
