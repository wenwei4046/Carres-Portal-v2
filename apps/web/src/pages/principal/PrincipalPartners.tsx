import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import CreateLpAccountForm from "./components/CreateLpAccountForm";

/**
 * Principal · operation Partners admin — Phase 4.5 Chunk 1 Task 22.
 *
 * Two stacked sections:
 *   1. Create new LP account form (wraps `CreateLpAccountForm` from Task 20)
 *   2. List of all existing LPs from `GET /api/principal/partners` (Task 21)
 *
 * On successful creation, the form's `onCreated` callback invalidates the
 * `principal.partners` query so the list refreshes without a manual reload.
 *
 * `contact` and `address` are separate columns (migration 0048 — closes
 * carry-forward `lp-address-column`). The list renders them on consecutive
 * lines: phone above, address below. Either may be NULL for legacy rows.
 */
type LpRow = {
  id: string;
  name: string;
  contact: string | null;
  address: string | null;
  zones: string | null;
  onboarded_date?: string | null;
  rate_card?: unknown;
};

export default function PrincipalPartners() {
  const qc = useQueryClient();
  const { data: lps, isLoading } = useQuery({
    queryKey: qk.principal.partners(),
    queryFn: () => apiFetch<LpRow[]>("/api/principal/partners"),
  });

  return (
    <div className="px-9 py-8 pb-14 space-y-6">
      <div>
        <div className="kicker">HQ · Network</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight font-semibold">
          operation Partners
        </h1>
      </div>

      <section>
        <h2 className="text-[15px] font-semibold mb-2.5">
          Create new LP account
        </h2>
        <CreateLpAccountForm
          onCreated={() =>
            qc.invalidateQueries({ queryKey: qk.principal.partners() })
          }
        />
      </section>

      <section>
        <h2 className="text-[15px] font-semibold mb-2.5">All LPs</h2>
        {isLoading ? (
          <p className="text-[13px] text-base-600">Loading…</p>
        ) : !lps || lps.length === 0 ? (
          <p className="text-[13px] text-base-500">
            No operation partners yet.
          </p>
        ) : (
          <ul className="divide-y divide-base-200 border border-base-200 rounded">
            {lps.map((lp) => (
              <li key={lp.id} className="py-3 px-3.5 flex items-baseline gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3">
                    <strong className="text-[13px] text-base-900">
                      {lp.name}
                    </strong>
                    {lp.contact && (
                      <span className="text-[12px] text-base-500">
                        {lp.contact}
                      </span>
                    )}
                  </div>
                  {lp.address && (
                    <div className="text-[11px] text-base-500 mt-0.5">
                      {lp.address}
                    </div>
                  )}
                </div>
                {lp.zones && (
                  <span className="text-[10px] uppercase tracking-wider text-base-400">
                    {lp.zones}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
