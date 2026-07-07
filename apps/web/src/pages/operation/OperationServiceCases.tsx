import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import type { ServiceCase, ServiceCaseListResponse } from "@carres/shared";
import ServiceCaseModal from "./components/ServiceCaseModal";

/**
 * Operation Service Cases — the case (病历) list.
 * Each case classifies an issue (Case Type + Status) and holds the medical
 * record. A printable Service Note dispatch order is generated under a case (P2).
 *
 * Filter [All][Ongoing][Closed] derives from the case status's is_closed flag.
 */
export default function OperationServiceCases() {
  const [state, setState] = useState<"" | "ongoing" | "closed">("");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const listQ = useQuery<ServiceCaseListResponse>({
    queryKey: ["ops", "service-cases", "list", state],
    queryFn: () => {
      const params = new URLSearchParams();
      if (state) params.set("state", state);
      return apiFetch(`/api/ops/service-cases?${params}`);
    },
    refetchInterval: 30_000,
  });

  const rows: ServiceCase[] = listQ.data?.items ?? [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-base-500 mb-1">Operation</p>
        <h1 className="t-h1 text-base-900">Service Cases</h1>
        <p className="text-sm text-base-600 mt-2">
          Every issue is a case · classify · record · generate a Service Note dispatch order
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded border border-base-200 overflow-hidden text-sm">
          {(["", "ongoing", "closed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={`px-3 py-1.5 font-medium ${
                state === s
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
          className="btn-hero text-[13px] py-1.5"
        >
          + New Case
        </button>
      </div>

      {/* Table */}
      {listQ.isLoading ? (
        <p className="text-sm text-base-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded border border-base-200 bg-white p-12 text-center">
          <p className="text-base-700 font-medium">No cases yet.</p>
          <p className="text-sm text-base-500 mt-1">Open a new case when an issue arises.</p>
        </div>
      ) : (
        <div className="rounded border border-base-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-base-50 text-xs uppercase tracking-wider text-base-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Case No.</th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Customer / Ref</th>
                <th className="text-left px-3 py-2 font-medium">What Happened</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Opened</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-base-200 hover:bg-base-50 cursor-pointer"
                  onClick={() => setEditId(r.id)}
                >
                  <td className="px-3 py-2 font-mono text-xs text-base-900 font-semibold whitespace-nowrap">
                    {r.caseNo}
                  </td>
                  <td className="px-3 py-2">
                    {r.caseTypeLabel ? (
                      <span className="rounded bg-base-100 px-1.5 py-0.5 text-xs text-base-700">
                        {r.caseTypeLabel}
                      </span>
                    ) : (
                      <span className="text-base-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-base-900 text-sm">{r.customerName || "—"}</div>
                    {r.refNo && <div className="text-xs text-base-500 font-mono">{r.refNo}</div>}
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <p className="text-sm text-base-700 line-clamp-2">
                      {r.whatHappened || <span className="text-base-400">—</span>}
                    </p>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`pill ${r.statusIsClosed ? "pill-confirmed" : "pill-neutral"}`}>
                      {r.statusLabel ?? "Unset"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-base-500 whitespace-nowrap">
                    {fmtDate(r.openedAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditId(r.id); }}
                      className="rounded border border-base-300 bg-white px-2 py-1 text-xs text-base-700 hover:bg-base-100"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <ServiceCaseModal mode="create" onClose={() => setShowCreate(false)} onSaved={() => setShowCreate(false)} />
      )}
      {editId && (
        <ServiceCaseModal mode="edit" id={editId} onClose={() => setEditId(null)} onSaved={() => setEditId(null)} />
      )}
    </div>
  );
}
