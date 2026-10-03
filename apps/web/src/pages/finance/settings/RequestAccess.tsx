import { toast } from "sonner";
import type { RequestGrantRow } from "@carres/shared/payment-requests";
import Checkbox from "@/components/kit/Checkbox";
import DataTable, { type Column } from "@/components/kit/DataTable";
import { fmtDate } from "@/lib/fmt-date";
import { useRequestGrants, useRequestMe, useSetRequestGrant } from "@/lib/payment-request-queries";
import { ReadFailed } from "../payables/PayablesParts";
import { refusal } from "../payables/payables-words";

/**
 * Finance Settings → Payment requests (migrations 0645, 0648; Chew 2026-10-03,
 * docs/finance/MASTER.md §3.3): which Operation staff may ask Finance to pay a
 * bill. Finance and the boss tick and untick; a shared login only reads.
 * Finance and the boss may always ask. Every grant is kept: unticking takes it
 * back, never deletes it.
 */
export default function RequestAccess() {
  const me = useRequestMe();
  const grants = useRequestGrants();
  const set = useSetRequestGrant();
  const mayGrant = me.data?.may_grant === true;

  const columns: readonly Column<RequestGrantRow>[] = [
    { key: "allowed", label: "May ask", width: "90px", cell: (g) => (
      <Checkbox id={`grant-${g.user_id}`} ariaLabel={`${g.name} may ask Finance to pay`} checked={g.allowed}
        disabled={!mayGrant || set.isPending}
        onCheckedChange={(on) => set.mutate({ userId: g.user_id, allowed: on }, {
          onSuccess: () => toast.success(on ? `${g.name} may ask Finance to pay` : `${g.name} may no longer ask`),
          onError: (e) => toast.error(refusal(e)),
        })} />
    ) },
    { key: "name", label: "Staff", width: "280px", cell: (g) => g.name },
    { key: "since", label: "Allowed since", width: "160px", cell: (g) => (g.allowed && g.granted_at ? fmtDate(g.granted_at) : "") },
    { key: "by", label: "Allowed by", width: "auto", cell: (g) => (g.allowed ? g.granted_by_name ?? "" : "") },
  ];

  if (grants.isError || me.isError) return <ReadFailed what="Who may ask" onRetry={() => { void grants.refetch(); void me.refetch(); }} />;
  return (
    <div className="flex flex-col gap-3 p-6" data-testid="request-access">
      <p className="text-body text-kit-slate-11">
        Operation staff ticked here may ask Finance to pay a bill, from Payment Requests. Finance and the boss always may.
        {mayGrant ? "" : " Only Finance and the boss change who may ask."}
      </p>
      <DataTable label="Who may ask Finance to pay" testId="request-access-table" rows={grants.data ?? []} columns={columns}
        rowId={(g) => g.user_id} sizing="content"
        empty={grants.isSuccess ? "No Operation staff account is active." : "Loading staff…"} />
    </div>
  );
}
