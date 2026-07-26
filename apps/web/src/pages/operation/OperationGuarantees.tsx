// design-standard: not-a-list-page — a LOOKUP desk, not a browsable register.
// It opens empty on purpose (one search box, three axes) and the result set is
// whatever the operator asked for, so the ListPageShell filter frame would be
// telling the wrong story.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  guaranteeCoverageLine,
  isGuaranteeClaimable,
  type GuaranteeEntitlementDto,
  type GuaranteeListResponse,
  type GuaranteeStatus,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { qk } from "@/lib/queries";
import ClaimGuaranteeModal from "./components/ClaimGuaranteeModal";

/**
 * Operation · Guarantees — the claim desk (0261-0263, Loo 2026-07-26).
 *
 * The question this page answers, and the ONLY one: a customer says their
 * mattress failed — did they buy the guarantee, on WHICH model, is it still
 * alive, and has it already been used? One box searches all three handles Loo
 * named: Sales Order · customer name · customer id / phone.
 *
 * State vocabulary law: no DB word reaches the screen — every status renders
 * through STATUS_DISPLAY, and it's the DERIVED status (effectiveStatus) that
 * shows, so an out-of-window guarantee reads "Expired" even though the row
 * still says 'active'.
 */

const STATUS_DISPLAY: Record<GuaranteeStatus, { label: string; pill: string }> = {
  pending: { label: "Starts on delivery", pill: "pill-sent" },
  active: { label: "Covered", pill: "pill-confirmed" },
  claimed: { label: "Used", pill: "pill-collected" },
  expired: { label: "Expired", pill: "pill-neutral" },
  void: { label: "Void", pill: "pill-neutral" },
};

const FILTERS: Array<{ key: "" | GuaranteeStatus; label: string }> = [
  { key: "", label: "All" },
  { key: "active", label: "Covered" },
  { key: "pending", label: "Not delivered" },
  { key: "claimed", label: "Used" },
  { key: "expired", label: "Expired" },
];

export default function OperationGuarantees() {
  const qc = useQueryClient();
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebouncedValue(rawSearch.trim(), 250);
  const [status, setStatus] = useState<"" | GuaranteeStatus>("");
  const [claiming, setClaiming] = useState<GuaranteeEntitlementDto | null>(null);

  // Deliberately NOT enabled on an empty box: this is a lookup desk, and
  // pulling every guarantee ever sold is neither useful nor cheap.
  const listQ = useQuery<GuaranteeListResponse>({
    queryKey: qk.guarantees.search(search, status),
    enabled: search.length > 0 || status !== "",
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (status) params.set("status", status);
      return apiFetch(`/api/guarantees?${params}`);
    },
  });

  const claimM = useMutation({
    mutationFn: (vars: { id: string; replacementSku: string | null; notes: string | null }) =>
      apiFetch(`/api/guarantees/${vars.id}/claim`, {
        method: "POST",
        body: JSON.stringify({
          replacementSku: vars.replacementSku,
          notes: vars.notes,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["guarantees"] });
      setClaiming(null);
      toast.success("Guarantee claimed — the swap is on the order's history.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listQ.data?.items ?? [];
  const idle = search.length === 0 && status === "";

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-base-500 mb-1">Operation</p>
        <h1 className="t-h1 text-base-900">Guarantees</h1>
        <p className="text-sm text-base-600 mt-2">
          Look a guarantee up by Sales Order, customer name, phone or customer ID — then swap the
          item and record the claim.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[280px]">
          <Search
            size={16}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-base-400"
          />
          <input
            type="search"
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="SO number, customer name, phone, or customer ID…"
            aria-label="Search guarantees"
            className="w-full rounded border border-base-300 bg-white pl-9 pr-3 py-2 t-body focus:border-base-500 outline-none"
          />
        </div>
        <div className="flex rounded border border-base-200 overflow-hidden text-sm">
          {FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              type="button"
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1.5 font-medium ${
                status === f.key
                  ? "bg-base-900 text-white"
                  : "bg-white text-base-600 hover:bg-hovertint"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {idle && (
        <div className="rounded border border-dashed border-base-300 bg-white p-10 text-center">
          <ShieldCheck size={28} strokeWidth={1.5} className="mx-auto text-base-300 mb-3" />
          <p className="t-body text-base-700">Search to pull up a customer's guarantee.</p>
          <p className="t-small text-base-500 mt-1">
            Any of: the Sales Order number, the customer's name, their phone, or their customer ID.
          </p>
        </div>
      )}

      {!idle && listQ.isPending && <p className="t-body text-base-600">Searching…</p>}
      {!idle && listQ.isError && (
        <p className="t-body text-danger">Couldn't load guarantees — {listQ.error.message}</p>
      )}
      {!idle && !listQ.isPending && !listQ.isError && rows.length === 0 && (
        <div className="rounded border border-base-200 bg-white p-10 text-center">
          <p className="t-body text-base-700">No guarantee found for that search.</p>
          <p className="t-small text-base-500 mt-1">
            The customer may not have bought one — check the Sales Order's items.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded border border-base-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-200 text-left">
                <th className="px-4 py-3 t-tiny uppercase tracking-wide text-base-500">Status</th>
                <th className="px-4 py-3 t-tiny uppercase tracking-wide text-base-500">Customer</th>
                <th className="px-4 py-3 t-tiny uppercase tracking-wide text-base-500">Order</th>
                <th className="px-4 py-3 t-tiny uppercase tracking-wide text-base-500">Covers</th>
                <th className="px-4 py-3 t-tiny uppercase tracking-wide text-base-500">Cover ends</th>
                <th className="px-4 py-3 t-tiny uppercase tracking-wide text-base-500 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const d = STATUS_DISPLAY[g.effectiveStatus];
                return (
                  <tr key={g.id} className="border-b border-base-100 last:border-0 align-top">
                    <td className="px-4 py-3">
                      <span className={`pill ${d.pill}`}>{d.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-base-900">{g.customerName || "—"}</div>
                      {g.customerPhone && (
                        <div className="font-mono text-[11px] text-base-500">{g.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-base-700">
                      {g.so != null ? `SO-${g.so}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-base-900">
                        {g.coversLabel ?? g.coversSku ?? (
                          <span className="text-warning">Not attached to an item</span>
                        )}
                      </div>
                      <div className="t-tiny text-base-500">
                        {g.guaranteeLabel ?? g.guaranteeSku}
                        {g.unitNo > 1 ? ` · unit ${g.unitNo}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-base-700">
                      {g.expiresOn ?? <span className="text-base-500">on delivery</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isGuaranteeClaimable(g) ? (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => setClaiming(g)}
                        >
                          Claim
                        </button>
                      ) : g.effectiveStatus === "claimed" ? (
                        <span className="t-tiny text-base-500">
                          Used {g.claimedAt?.slice(0, 10) ?? ""}
                          {g.claimCaseNo ? ` · ${g.claimCaseNo}` : ""}
                        </span>
                      ) : (
                        <span className="t-tiny text-base-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {listQ.data?.truncated && (
        <p className="t-small text-base-500 mt-3">
          Showing the first 100 matches — narrow the search to see the rest.
        </p>
      )}

      {claiming && (
        <ClaimGuaranteeModal
          guarantee={claiming}
          summary={guaranteeCoverageLine(claiming)}
          busy={claimM.isPending}
          onCancel={() => setClaiming(null)}
          onConfirm={(replacementSku, notes) =>
            claimM.mutate({ id: claiming.id, replacementSku, notes })
          }
        />
      )}
    </div>
  );
}
