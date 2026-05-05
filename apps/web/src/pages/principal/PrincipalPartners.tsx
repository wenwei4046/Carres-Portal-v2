import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import CreateLpAccountForm from "./components/CreateLpAccountForm";

/**
 * Principal · Logistics Partners admin — Phase 4.5 Chunk 1 Task 22.
 *
 * Two stacked sections:
 *   1. Create new LP account form (wraps `CreateLpAccountForm` from Task 20)
 *   2. List of all existing LPs from `GET /api/principal/partners` (Task 21)
 *
 * On successful creation, the form's `onCreated` callback invalidates the
 * `principal.partners` query so the list refreshes without a manual reload.
 *
 * NOTE on `contact` display: `delivery_partners` has no separate `address`
 * column — the address is concatenated into the `contact` field by the LP
 * creation route (e.g. `"0123 · 1 Demo St"`). We render it as-is. Carry-forward
 * `phase-4.5-chunk-1-lp-address-column` tracks splitting these fields later.
 */
type LpRow = {
  id: string;
  name: string;
  contact: string;
  zones: string;
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
          Logistics Partners
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
            No logistics partners yet.
          </p>
        ) : (
          <ul className="divide-y divide-base-200 border border-base-200 rounded">
            {lps.map((lp) => (
              <li key={lp.id} className="py-3 px-3.5 flex items-baseline gap-3">
                <strong className="text-[13px] text-base-900">
                  {lp.name}
                </strong>
                <span className="text-[12px] text-base-500">{lp.contact}</span>
                {lp.zones && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-base-400">
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
