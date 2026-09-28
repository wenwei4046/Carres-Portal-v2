/**
 * MONTHLY DEMAND — the view (Orders MASTER, Monthly demand; owner rulings
 * 2026-09-22, 2026-09-26 and 2026-09-27).
 *
 * Presentational: it receives the view `monthlyDemandOf` already computed and
 * derives nothing. Two blocks and no more:
 *
 *   1  `This month · {Mon YYYY}`   three numbers for ONE month
 *   2  `By month · …`              one table, ONE ROW PER MONTH
 *
 * No chart, no legend, no cards of numbers. Both tables are the kit's
 * (`TotalsSummary`, `DocumentTable`); this file draws none of its own.
 * Every word is COPY-STANDARD's `Monthly demand words`.
 */
import { Link } from "react-router-dom";
import {
  MONTHLY_DEMAND_CATEGORIES,
  readFailureWords,
  type MonthlyDemandRow,
  type MonthlyDemandView,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import DocumentTable, { type DocumentTableColumn, type DocumentTableRow } from "@/components/kit/DocumentTable";
import EmptyState from "@/components/kit/EmptyState";
import Loading from "@/components/kit/Loading";
import TotalsSummary from "@/components/kit/TotalsSummary";
import { appTodayIso, fmtMonth } from "@/lib/fmt-date";

/** `Oct 2026`. The months here come from the window, so they are always real. */
const fmtMonthYear = (month: string | null) => (month ? fmtMonth(month) : "");

const HEADING = "text-strong text-kit-slate-12";
const SUPPORTING = "text-label text-base-600";

/** The row's printed name, which is also what its door is named after. */
export function monthlyDemandRowLabel(row: Pick<MonthlyDemandRow, "kind" | "month">): string {
  if (row.kind === "before") return `Before ${fmtMonthYear(row.month)}`;
  if (row.kind === "after") return `After ${fmtMonthYear(row.month)}`;
  if (row.kind === "no-date") return "No delivery date";
  if (row.kind === "total") return "Total";
  return fmtMonthYear(row.month);
}

/**
 * What `Export` writes: exactly the `By month` table on screen — the same
 * rows, columns and words (`Unavailable` stays a word, never a zero).
 */
export function monthlyDemandSheet(view: MonthlyDemandView): { headers: string[]; rows: Array<Array<string | number>> } {
  const categories = [...MONTHLY_DEMAND_CATEGORIES];
  const headers = [
    "Month",
    ...categories,
    ...(view.hasNotInCatalog ? ["Not in catalog"] : []),
    "Total Qty",
    "Delivered",
    "Not delivered",
    "To buy",
  ];
  const rows = view.rows.map((row) => [
    monthlyDemandRowLabel(row),
    ...categories.map((category) => row.categories[category] ?? 0),
    ...(view.hasNotInCatalog ? [row.notInCatalog] : []),
    row.totalQty,
    row.delivered,
    row.notDelivered,
    row.toBuy === null ? "Unavailable" : row.toBuy,
  ]);
  return { headers, rows };
}

async function exportMonthlyDemand(view: MonthlyDemandView) {
  const { headers, rows } = monthlyDemandSheet(view);
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(8, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Monthly demand");
  const span = `${fmtMonthYear(view.window.first)} to ${fmtMonthYear(view.window.last)}`;
  XLSX.writeFile(wb, `Monthly demand ${span} ${appTodayIso()}.xlsx`);
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

export default function SalesOrderMonthlyDemand({
  view,
  focusMonth,
  onOpenMonth,
  error,
  loading,
  onRetry,
}: {
  view: MonthlyDemandView | null;
  /** The month the three numbers are about (`YYYY-MM`). */
  focusMonth: string;
  onOpenMonth: (row: MonthlyDemandRow) => void;
  /** Present = the read failed. */
  error?: unknown;
  loading?: boolean;
  onRetry?: () => void;
}) {
  if (error) {
    const refused = statusOf(error) === 403 ? readFailureWords(error, "sales-orders-register") : null;
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white p-4" data-testid="monthly-demand">
        <div
          role="alert"
          data-testid="monthly-demand-failure"
          data-face={refused ? "refused" : "failed"}
          className="mx-auto w-full max-w-[480px]"
        >
          {refused ? (
            <EmptyState title={refused.title} detail={refused.detail ?? undefined} />
          ) : (
            <EmptyState
              title="Monthly demand could not be loaded"
              action={
                <Button variant="neutral" onClick={() => onRetry?.()}>
                  Try again
                </Button>
              }
            />
          )}
        </div>
      </div>
    );
  }

  if (loading || !view) {
    /* The two blocks' own space is held, so the numbers arrive without a jump. */
    return (
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto bg-white p-4"
        data-testid="monthly-demand"
        data-state="loading"
      >
        <div className="min-h-[140px] w-full max-w-[360px]">
          <Loading variant="skeleton" lines={3} label="Opening monthly demand" />
        </div>
        <div className="min-h-[420px] w-full">
          <Loading variant="skeleton" lines={3} label="Opening monthly demand" />
        </div>
      </div>
    );
  }

  const columns: DocumentTableColumn[] = [
    { key: "month", label: "Month" },
    ...MONTHLY_DEMAND_CATEGORIES.map((category) => ({ key: category, label: category, numeric: true })),
    ...(view.hasNotInCatalog ? [{ key: "notInCatalog", label: "Not in catalog", numeric: true }] : []),
    { key: "totalQty", label: "Total Qty", numeric: true },
    { key: "delivered", label: "Delivered", numeric: true },
    { key: "notDelivered", label: "Not delivered", numeric: true },
    { key: "toBuy", label: "To buy", numeric: true },
  ];

  const rows: DocumentTableRow[] = view.rows.map((row) => {
    const label = monthlyDemandRowLabel(row);
    const door = row.kind === "month" || row.kind === "before" || row.kind === "after";
    return {
      key: row.key,
      total: row.kind === "total",
      ...(door ? { onOpen: () => onOpenMonth(row), openLabel: `Open Sales Orders for ${label}` } : {}),
      cells: {
        month: label,
        ...row.categories,
        notInCatalog: row.notInCatalog,
        totalQty: row.totalQty,
        delivered: row.delivered,
        notDelivered: row.notDelivered,
        toBuy: row.toBuy === null ? "Unavailable" : row.toBuy,
      },
    };
  });

  const total = view.rows.find((row) => row.kind === "total");
  const empty = (total?.totalQty ?? 0) === 0;
  const thisMonth = `This month · ${fmtMonthYear(focusMonth || view.focus.month)}`;
  const byMonth = `By month · Customer Requested Delivery Date · ${fmtMonthYear(view.window.first)} to ${fmtMonthYear(view.window.last)}`;

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto bg-white p-4"
      data-testid="monthly-demand"
    >
      {/* Row 2 of this view: Search and Columns do not apply (the columns are
          months), so Export stands alone and writes the matrix. */}
      <div className="-mx-4 -mt-4 flex justify-end border-b border-kit-slate-5 px-4 py-2" data-testid="monthly-demand-toolbar">
        <Button
          variant="neutral"
          icon="download"
          disabled={empty}
          onClick={() => void exportMonthlyDemand(view)}
          data-testid="monthly-demand-export"
        >
          Export
        </Button>
      </div>
      <section aria-label={thisMonth} className="w-full max-w-[360px]" data-testid="monthly-demand-this-month">
        <h2 className={`${HEADING} px-2 pb-2`}>{thisMonth}</h2>
        <TotalsSummary
          label={thisMonth}
          rows={[
            { key: "totalQty", label: "Total Qty", value: view.focus.totalQty },
            { key: "delivered", label: "Delivered", value: view.focus.delivered },
            { key: "notDelivered", label: "Not delivered", value: view.focus.notDelivered },
          ]}
        />
      </section>

      <section aria-label={byMonth} className="flex w-full min-w-0 flex-col gap-2" data-testid="monthly-demand-by-month">
        <h2 className={`${HEADING} px-2`}>{byMonth}</h2>
        {empty ? (
          <p className="px-2 text-body text-kit-slate-11" data-testid="monthly-demand-empty">
            No Sales Orders in these months
          </p>
        ) : null}
        <DocumentTable label={byMonth} columns={columns} rows={rows} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2">
          <p className={SUPPORTING}>Click a month to open its Sales Orders</p>
          <Link
            to="/operation?tab=purchase"
            className="inline-flex items-center text-label font-medium text-kit-blue-11 underline-offset-2 hover:underline max-md:min-h-10"
          >
            Open SO Batch Purchase →
          </Link>
        </div>
      </section>
    </div>
  );
}
