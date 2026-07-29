import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import {
  SN_STAGE_LABELS,
  SN_STAGE_NEXT,
  type ServiceNoteListItem,
  type ServiceNoteListResponse,
  type SnStage,
} from "@carres/shared";
import ServiceNoteModal from "./components/ServiceNoteModal";
import { AlertTriangle } from "lucide-react";

/**
 * Operation Service Notes — Issue Tracker.
 * Every case gets an SN number. Cases with Section A/B can be printed as PDF.
 * Stage flow: Collected → With Supplier → Supplier Done → Scheduled → [Closed]
 */
export default function OperationServiceNotes() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | "ongoing" | "closed">("");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const listQ = useQuery<ServiceNoteListResponse>({
    queryKey: ["ops", "service-notes", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      return apiFetch(`/api/ops/service-notes?${params}`);
    },
    refetchInterval: 30_000,
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      apiFetch(`/api/ops/service-notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "service-notes"] }),
  });

  const rows: ServiceNoteListItem[] = listQ.data?.items ?? [];

  function advanceStage(r: ServiceNoteListItem) {
    const next = SN_STAGE_NEXT[r.currentStage ?? "collected"];
    if (!next) {
      patchMut.mutate({ id: r.id, body: { status: "closed" } });
    } else {
      patchMut.mutate({ id: r.id, body: { currentStage: next } });
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-meta uppercase tracking-wider text-base-500 mb-1">Operation</p>
        <h1 className="text-page text-base-900">Service Notes</h1>
        <p className="text-body text-base-600 mt-2">
          Issue tracker · every case gets an SN number · printable for NETS / supplier
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded border border-base-200 overflow-hidden text-body">
          {(["", "ongoing", "closed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 font-medium ${
                statusFilter === s
                  ? "bg-base-900 text-white"
                  : "bg-white text-base-600 hover:bg-base-50"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="btn-hero text-body py-1.5"
        >
          + New Case
        </button>
      </div>

      {/* Table */}
      {listQ.isLoading ? (
        <p className="text-body text-base-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded border border-base-200 bg-white p-12 text-center">
          <p className="text-base-700 font-medium">No cases yet.</p>
          <p className="text-body text-base-500 mt-1">Create a new case when an issue arises.</p>
        </div>
      ) : (
        <div className="rounded border border-base-200 bg-white overflow-x-auto">
          <table className="w-full text-body">
            <thead className="bg-base-50 text-meta uppercase tracking-wider text-base-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">SN No.</th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Customer / Ref</th>
                <th className="text-left px-3 py-2 font-medium">What Happened</th>
                <th className="text-left px-3 py-2 font-medium">Sections</th>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-left px-3 py-2 font-medium">Deadline</th>
                <th className="text-left px-3 py-2 font-medium">Stage</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stage = r.currentStage ?? "collected";
                const nextStage = SN_STAGE_NEXT[stage as SnStage];
                const advanceLabel = nextStage
                  ? `→ ${SN_STAGE_LABELS[nextStage]}`
                  : "→ Close";
                const isBusy = patchMut.isPending;
                const overdue = r.deadline && isOverdue(r.deadline) && r.status === "ongoing";

                return (
                  <tr key={r.id} className="border-t border-base-200 hover:bg-base-50">
                    <td className="px-3 py-2 font-mono text-meta text-base-900 font-semibold whitespace-nowrap">
                      {r.snNo}
                    </td>
                    <td className="px-3 py-2">
                      {r.type ? (
                        <span className="rounded bg-base-100 px-1.5 py-0.5 text-meta text-base-700">
                          {r.type}
                        </span>
                      ) : (
                        <span className="text-base-400 text-meta">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-base-900 text-body">{r.customerName || "—"}</div>
                      {r.refNo && (
                        <div className="text-meta text-base-500 font-mono">{r.refNo}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-xs">
                      <p className="text-body text-base-700 line-clamp-2">
                        {r.whatHappened || <span className="text-base-400">—</span>}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {r.sectionA && (
                          <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-meta text-blue-700">
                            A · Logistic
                          </span>
                        )}
                        {r.sectionB && (
                          <span className="rounded bg-orange-50 border border-orange-200 px-1.5 py-0.5 text-meta text-orange-700">
                            B · Supplier
                          </span>
                        )}
                        {r.sectionC && (
                          <span className="rounded bg-base-100 border border-base-200 px-1.5 py-0.5 text-meta text-base-600">
                            C · WH
                          </span>
                        )}
                        {!r.sectionA && !r.sectionB && !r.sectionC && (
                          <span className="text-meta text-base-400">Internal</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-meta text-base-500 whitespace-nowrap">
                      {fmtDate(r.requestDate)}
                    </td>
                    <td className="px-3 py-2 text-meta whitespace-nowrap">
                      {r.deadline ? (
                        <span className={overdue ? "text-error-700 font-semibold" : "text-base-600"}>
                          {fmtDate(r.deadline)}
                          {overdue && (
                            <AlertTriangle
                              size={11}
                              strokeWidth={2.5}
                              className="inline ml-0.5 -mt-px"
                            />
                          )}
                        </span>
                      ) : (
                        <span className="text-base-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.status === "closed" ? (
                        <span className="pill pill-confirmed">Closed</span>
                      ) : (
                        <StageBadge stage={stage as SnStage} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end items-center flex-wrap">
                        <button
                          type="button"
                          onClick={() => setEditId(r.id)}
                          className="rounded border border-base-300 bg-white px-2 py-1 text-meta text-base-700 hover:bg-base-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open(`/print/service-note/${r.id}`, "_blank")}
                          className="rounded border border-base-300 bg-white px-2 py-1 text-meta text-base-700 hover:bg-base-100"
                        >
                          Print
                        </button>
                        {r.status === "ongoing" && (
                          <button
                            type="button"
                            onClick={() => advanceStage(r)}
                            disabled={isBusy}
                            className={`rounded border px-2 py-1 text-meta font-medium disabled:opacity-40 ${
                              nextStage
                                ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                                : "border-success-300 bg-success-50 text-success-700 hover:bg-success-100"
                            }`}
                          >
                            {advanceLabel}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <ServiceNoteModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ["ops", "service-notes"] });
          }}
        />
      )}

      {/* Edit modal */}
      {editId && (
        <ServiceNoteModal
          mode="edit"
          id={editId}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            qc.invalidateQueries({ queryKey: ["ops", "service-notes"] });
          }}
        />
      )}
    </div>
  );
}

// ── Stage badge ────────────────────────────────────────────────────────────────

/** v17 pills per SN stage — with_supplier=amber (waiting on supplier),
 *  supplier_done=blue, scheduled=indigo, collected=neutral. */
const STAGE_PILL: Record<SnStage, string> = {
  collected:     "pill-neutral",
  with_supplier: "pill-warning",
  supplier_done: "pill-sent",
  scheduled:     "pill-collected",
};

function StageBadge({ stage }: { stage: SnStage }) {
  return (
    <span className={`pill ${STAGE_PILL[stage]}`}>
      {SN_STAGE_LABELS[stage]}
    </span>
  );
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}
