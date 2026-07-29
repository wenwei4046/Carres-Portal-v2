import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

/**
 * Operation · Inbox — Phase A step 3 (migration 0136).
 *
 * Lists AutoCount-imported orders still missing an `ops_assigned_logistic`.
 * Each row carries an inline dropdown of logistic partners (NETS / TSDD /
 * AL / HOUZS); picking one fires POST /api/orders/:id/ops-assign and the
 * order drops out of the Inbox.
 *
 * No staging table. The "Inbox" is just a server-side filter over the live
 * orders table — single source of truth (per Loo Q1=a 2026-05-20).
 */

interface InboxLine {
  sku: string;
  qty: number;
  attrs: Record<string, unknown> | null;
}

interface InboxRow {
  id: string;
  so: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_date: string | null;
  paid: string | number | null;
  source_ref: string[] | null;
  source_system: string | null;
  ops_assigned_logistic: string | null;
  placed_at: string;
  order_lines: InboxLine[];
}

interface InboxResponse {
  orders: InboxRow[];
  total: number;
}

interface PartnerOpt {
  id: string;
  name: string;
}

export default function OperationInbox() {
  const qc = useQueryClient();

  const inboxQ = useQuery<InboxResponse>({
    queryKey: qk.operation.inbox(),
    queryFn: () => apiFetch("/api/orders/inbox"),
    refetchInterval: 15_000,
  });

  // Operation's existing partners endpoint — provides the dropdown source.
  const partnersQ = useQuery<{ partners: PartnerOpt[] }>({
    queryKey: qk.operation.partners(),
    queryFn: () => apiFetch("/api/operation/partners"),
  });

  // Filter to the 4 logistic partners, rename for display, NETS first.
  const logisticPartners: PartnerOpt[] = useMemo(() => {
    const DISPLAY: Record<string, string> = {
      nets: "NETS",
      tsdd: "TSDD",
      al: "AL",
      houzs: "HOUZS",
    };
    const ORDER: Record<string, number> = { nets: 0, tsdd: 1, al: 2, houzs: 3 };
    const all = partnersQ.data?.partners ?? [];
    return all
      .filter((p) => Object.keys(DISPLAY).some((slug) => p.name.toLowerCase().startsWith(slug)))
      .map((p) => {
        const slug = Object.keys(DISPLAY).find((s) => p.name.toLowerCase().startsWith(s)) ?? "";
        return { id: p.id, name: DISPLAY[slug] ?? p.name, _order: ORDER[slug] ?? 99 };
      })
      .sort((a, b) => (a as { _order: number })._order - (b as { _order: number })._order);
  }, [partnersQ.data]);

  const assignMut = useMutation({
    mutationFn: async (args: { orderId: string; deliveryPartnerId: string | null }) =>
      apiFetch(`/api/orders/${args.orderId}/ops-assign`, {
        method: "POST",
        body: JSON.stringify({ deliveryPartnerId: args.deliveryPartnerId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.operation.inbox() });
    },
  });

  const rows = inboxQ.data?.orders ?? [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <p className="text-meta uppercase tracking-wider text-base-500 mb-1">
          Operation · Triage
        </p>
        <h1 className="text-page text-base-900">
          Inbox · awaiting logistic
        </h1>
        <p className="text-body text-base-600 mt-2">
          AutoCount-imported orders that still need a logistic partner. Pick
          NETS / TSDD / AL / HOUZS per order — the order leaves Inbox the
          moment you assign.
        </p>
      </div>

      {inboxQ.isLoading ? (
        <p className="text-body text-base-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded border border-base-200 bg-white p-12 text-center">
          <p className="text-base-700 font-medium">Inbox clear.</p>
          <p className="text-body text-base-500 mt-1">
            No AutoCount orders waiting for triage right now.
          </p>
        </div>
      ) : (
        <div className="rounded border border-base-200 bg-white overflow-hidden">
          <table className="w-full text-body">
            <thead className="bg-base-50 text-meta uppercase tracking-wider text-base-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">SO #</th>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Ref</th>
                <th className="text-left px-4 py-3 font-medium">Items</th>
                <th className="text-left px-4 py-3 font-medium">Delivery</th>
                <th className="text-left px-4 py-3 font-medium w-36">Assign Logistic</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-base-200 hover:bg-base-50 align-top">
                  <td className="px-4 py-3 font-mono text-base-900 whitespace-nowrap">SO-{r.so}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-base-900">
                      {r.customer_name ?? "—"}
                    </div>
                    <div className="text-meta text-base-500">
                      {r.customer_phone ?? ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-meta text-base-600 font-mono whitespace-nowrap">
                    {(r.source_ref ?? []).join(" + ") || "—"}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <ul className="space-y-0.5">
                      {(r.order_lines ?? []).map((l, i) => (
                        <li key={i} className="text-meta text-base-700">
                          <span className="font-mono">{l.sku}</span>
                          {l.attrs && Object.keys(l.attrs).length > 0 && (
                            <span className="text-base-500 ml-1">
                              {Object.entries(l.attrs).map(([k, v]) => `${k}:${v}`).join(" ")}
                            </span>
                          )}
                          <span className="text-base-400 ml-1">×{l.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 text-base-700 whitespace-nowrap">
                    {r.delivery_date ? fmtDate(r.delivery_date) : <span className="text-base-400">TBD</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="w-full rounded border border-base-300 bg-white px-2 py-1.5 text-body focus:border-primary focus:outline-none disabled:bg-base-100"
                      value={r.ops_assigned_logistic ?? ""}
                      disabled={assignMut.isPending}
                      onChange={(e) => {
                        const v = e.target.value;
                        assignMut.mutate({
                          orderId: r.id,
                          deliveryPartnerId: v === "" ? null : v,
                        });
                      }}
                    >
                      <option value="">— pick —</option>
                      {logisticPartners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assignMut.isError ? (
        <p className="mt-4 text-body text-error-700">
          Assign failed:{" "}
          {(assignMut.error as { message?: string })?.message ?? "unknown error"}
        </p>
      ) : null}
    </div>
  );
}
