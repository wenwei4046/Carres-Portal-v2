import { useMemo } from "react";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import { useCatalog, useOperationSuppliers } from "@/lib/queries";
import { buildSupplierItems, missingSupplierCodeCount, type SupplierItemRow } from "./supplier-items";

/**
 * SUPPLIER ITEMS — the identity chain Loo named, as one Register.
 *
 *     internal SKU code  <>  item name  <>  supplier SKU  <>  supplier name
 *
 * ⭐ A JOIN, NOT A SECOND TABLE. Loo asked that adding a SKU also update the
 * Suppliers side. The cheap-looking way is a synced copy; it would be two
 * records of one fact, drifting the first time a write misses one (Laws C and
 * D). This page composes the catalog bundle and the supplier roster CLIENT-SIDE
 * — no new route, no new column, nothing to keep in step. A SKU added in the
 * catalog appears here on the next load because the catalog IS the list.
 *
 * READ-ONLY, and that is the boundary: a SKU is the CATALOG's record (Law A).
 * Editing a supplier code happens where SKUs are edited; this page shows the
 * chain and says what is missing from it.
 *
 * WHY THE EMPTINESS MATTERS: `supplier_code` landed on 2026-08-21 (0375), so
 * most rows are blank until someone keys a quotation in. The count in the
 * header is the size of that job.
 */
const W = {
  page: "Supplier items",
  search: "Search supplier, code or item",
  empty: "No supplier items yet — a SKU appears here once it names a supplier.",
  colSupplier: "Supplier",
  colTheirCode: "Their code",
  colDescription: "Description",
  colOurCode: "Our code",
  colOurName: "Our name",
  none: "Not recorded",
} as const;

const STORAGE_KEY = "carres.supplier-items.v1";

export default function OperationSupplierItems() {
  /* Both bundles are already cached by other screens — the catalog by the POS
     and the SKU master, the roster by the order drawer. This page adds no
     server work of its own. `admin: true` so discontinued SKUs still show:
     a supplier's item does not stop being theirs because we stopped selling it. */
  const catalogQ = useCatalog({ admin: true });
  const suppliersQ = useOperationSuppliers();

  const rows = useMemo(
    () => buildSupplierItems(catalogQ.data, suppliersQ.data?.suppliers),
    [catalogQ.data, suppliersQ.data?.suppliers],
  );
  const missing = useMemo(() => missingSupplierCodeCount(rows), [rows]);

  const columns = useMemo<DataGridColumn<SupplierItemRow>[]>(
    () => [
      {
        key: "supplier",
        label: W.colSupplier,
        width: 180,
        minWidth: 140,
        sortable: true,
        chooserGroup: "Supplier",
        accessor: (r) => r.supplierName,
      },
      {
        key: "their_code",
        label: W.colTheirCode,
        width: 160,
        minWidth: 120,
        sortable: true,
        chooserGroup: "Supplier",
        /* The absence word is the dictionary's, not this page's — and it is the
           whole reason someone opens this screen. */
        accessor: (r) =>
          r.supplierCode?.trim() ? (
            <span className="font-mono">{r.supplierCode}</span>
          ) : (
            <span className="text-base-500">{W.none}</span>
          ),
      },
      {
        key: "description",
        label: W.colDescription,
        width: 220,
        minWidth: 160,
        sortable: true,
        chooserGroup: "Item",
        accessor: (r) => r.description ?? <span className="text-base-500">{W.none}</span>,
      },
      {
        key: "our_code",
        label: W.colOurCode,
        width: 200,
        minWidth: 150,
        sortable: true,
        chooserGroup: "Item",
        accessor: (r) => <span className="font-mono">{r.sku}</span>,
      },
      {
        key: "our_name",
        label: W.colOurName,
        width: 240,
        minWidth: 160,
        sortable: true,
        chooserGroup: "Item",
        accessor: (r) => r.ourName,
      },
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-kit-canvas">
      <ModuleHeader
        testId="supplier-items-header"
        word={W.page}
        docTitle={`${W.page} · Suppliers — Carres`}
        destinationHeader
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-9 py-6">
        <DataGrid<SupplierItemRow>
          appearance="reference"
          rows={rows}
          columns={columns}
          storageKey={STORAGE_KEY}
          rowKey={(r) => r.key}
          exportName={W.page}
          searchPlaceholder={W.search}
          isLoading={catalogQ.isLoading || suppliersQ.isLoading}
          emptyMessage={W.empty}
          chooserGroupOrder={["Supplier", "Item"]}
          toolbarEnd={
            missing > 0 ? (
              <span className="text-meta text-base-600" data-testid="supplier-items-missing">
                {missing} without a supplier code
              </span>
            ) : null
          }
        />
      </div>
    </div>
  );
}
