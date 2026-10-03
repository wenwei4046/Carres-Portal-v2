import { useMemo, useState } from "react";
import { supplierPayTo, type SupplierFinanceRow } from "@carres/shared/schemas/finance-ap";
import Button from "@/components/kit/Button";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { appDateIsoOf, fmtDate } from "@/lib/fmt-date";
import { useSupplierFinance } from "@/lib/payables-queries";
import { creditorKindWord } from "./payables-words";
import { ReadFailed } from "./PayablesParts";
import SupplierFinanceModal from "./SupplierFinanceModal";

/**
 * Finance → Payables → Suppliers, at `/finance/suppliers` (migration 0636;
 * Chew 2026-10-03, docs/finance/MASTER.md §3.2).
 *
 * Finance's own tax and bank details for every supplier and other creditor.
 * The supplier itself stays Purchasing's record: its name and kind are read
 * here, never changed. Who last changed the bank details, and when, is on the
 * row, because a changed account number is where a payment can go wrong.
 */
export default function SupplierFinancePage() {
  const query = useSupplierFinance();
  const [editing, setEditing] = useState<SupplierFinanceRow | null>(null);
  const rows = query.data ?? [];
  // Where the money goes first, so it is whole on a 1440px screen with the
  // menu open; the tax facts after it. A detail nobody keyed is an empty cell
  // (UI MASTER §6.0: no glyph, no absence word for an optional fact).
  const columns = useMemo<DataGridColumn<SupplierFinanceRow>[]>(() => [
    { key: "supplier", label: "Supplier", width: 240, accessor: (r) => r.name,
      searchValue: (r) =>
        [r.name, r.tax_no, r.registration_no, r.bank_name, r.bank_account_no, r.bank_account_holder].filter(Boolean).join(" ") },
    { key: "bank", label: "Bank", width: 130, accessor: (r) => r.bank_name ?? "",
      filterValue: (r) => r.bank_name ?? "", filterType: "enum" },
    { key: "account", label: "Account No", width: 140, accessor: (r) => r.bank_account_no ?? "" },
    { key: "holder", label: "Account holder", width: 200, accessor: (r) => r.bank_account_holder ?? "" },
    { key: "changed", label: "Last changed", width: 200,
      accessor: (r) => (r.updated_at
        ? [fmtDate(r.updated_at, { time: true }), r.updated_by_name].filter(Boolean).join(" · ")
        : ""),
      dateValue: (r) => (r.updated_at ? appDateIsoOf(r.updated_at) : null), filterType: "date" },
    { key: "tax", label: "Tax No", width: 130, accessor: (r) => r.tax_no ?? "" },
    { key: "registration", label: "Registration No", width: 140, accessor: (r) => r.registration_no ?? "" },
    { key: "kind", label: "Creditor Type", width: 130, accessor: (r) => creditorKindWord(r.kind),
      filterValue: (r) => creditorKindWord(r.kind), filterType: "enum" },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="supplier-finance-destination-header" word="Suppliers"
        docTitle="Suppliers · Carres" />
      {query.isError ? <ReadFailed what="Supplier details" onRetry={() => void query.refetch()} /> : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.supplier_id}
            rowTestId={(r) => `supplier-finance-row-${r.supplier_id}`}
            storageKey="carres.finance.supplier-finance.v1"
            appearance="reference"
            exportName="Suppliers"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search suppliers…"
            emptyMessage="No supplier yet. Purchasing adds suppliers; an other creditor is added from a bill."
            expandTitle="Inspect supplier"
            onRowDoubleClick={(r) => setEditing(r)}
            expandable={{
              renderExpansion: (r) => (
                <div className="p-4 text-body flex flex-col items-start gap-1">
                  <p>{r.name} · {creditorKindWord(r.kind)}</p>
                  <p>
                    {supplierPayTo(r)
                      ? `Pay to ${supplierPayTo(r)}`
                      : "No bank account on file. A payment to this supplier names no account."}
                  </p>
                  <div className="mt-2">
                    <Button variant="neutral" onClick={() => setEditing(r)}>
                      Edit details
                    </Button>
                  </div>
                </div>
              ),
            }}
            statusSummary={(visible) => {
              const withBank = visible.filter((r) => r.bank_account_no).length;
              return (
                <span data-testid="supplier-finance-summary">
                  {visible.length} {visible.length === 1 ? "supplier" : "suppliers"} · {withBank} with a bank account
                </span>
              );
            }}
          />
        </ListPageShell>
      )}
      {editing && <SupplierFinanceModal key={editing.supplier_id} supplier={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
