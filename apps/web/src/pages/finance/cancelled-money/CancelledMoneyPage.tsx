/**
 * Finance → Cancelled orders holding money, at `/finance/cancelled-money`
 * (migration 0690). READ ONLY: cancelling an order creates no refund and moves
 * no payment, so this lists the cancelled orders whose customer money is still
 * held. No refund and no move is offered here; Finance has not ruled which.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { LoadFailed } from "../other-money-in/parts";

export interface CancelledMoneyRow {
  order_id: string;
  so: number;
  customer_name: string;
  paid: number;
  refunded: number;
  held: number;
  cancelled_at: string;
}

export const useCancelledMoney = () =>
  useQuery({
    queryKey: ["finance", "cancelled-money"],
    queryFn: () => apiFetch<CancelledMoneyRow[]>("/api/finance/cancelled-money"),
  });

export default function CancelledMoneyPage() {
  const query = useCancelledMoney();
  const columns = useMemo<DataGridColumn<CancelledMoneyRow>[]>(
    () => [
      {
        key: "so",
        label: "SO No",
        width: 130,
        accessor: (r) => (
          <Link className="text-link" to={`/operation/orders/so/${r.order_id}`}>
            SO-{r.so}
          </Link>
        ),
        searchValue: (r) => `SO-${r.so}`,
        exportValue: (r) => `SO-${r.so}`,
        filterType: "numbering",
      },
      { key: "customer", label: "Customer", width: 240, accessor: (r) => r.customer_name, filterType: "enum" },
      {
        key: "held",
        label: "Money held",
        width: 140,
        align: "right",
        accessor: (r) => rm(Number(r.held)),
        numberValue: (r) => Number(r.held),
        exportValue: (r) => Number(r.held),
        filterType: "number",
      },
      {
        key: "paid",
        label: "Paid",
        width: 130,
        align: "right",
        accessor: (r) => rm(Number(r.paid)),
        numberValue: (r) => Number(r.paid),
        exportValue: (r) => Number(r.paid),
      },
      {
        key: "refunded",
        label: "Refunded",
        width: 130,
        align: "right",
        accessor: (r) => rm(Number(r.refunded)),
        numberValue: (r) => Number(r.refunded),
        exportValue: (r) => Number(r.refunded),
      },
      {
        key: "cancelled",
        label: "Cancelled",
        width: 130,
        accessor: (r) => fmtDate(r.cancelled_at),
        dateValue: (r) => r.cancelled_at,
        filterType: "date",
        exportValue: (r) => fmtDate(r.cancelled_at),
      },
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        destinationHeader
        testId="cancelled-money-destination-header"
        word="Cancelled orders holding money"
        docTitle="Cancelled orders holding money · Carres"
      />
      {query.isError ? (
        <LoadFailed what="Cancelled orders holding money" onRetry={() => void query.refetch()} />
      ) : (
        <ListPageShell register>
          <DataGrid
            rows={query.data ?? []}
            columns={columns}
            rowKey={(r) => r.order_id}
            storageKey="carres.finance.cancelled-money.v1"
            appearance="reference"
            exportName="Cancelled orders holding money"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search cancelled orders…"
            emptyMessage="No cancelled order is holding customer money."
          />
        </ListPageShell>
      )}
    </div>
  );
}
