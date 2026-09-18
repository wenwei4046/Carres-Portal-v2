// design-standard: not-a-list-page — this page runs THE REGISTER ENGINE
// (components/register/DataGrid) beside the governed 240px FilterRail, the
// same composition Supplier Claims and SO Batch Purchase ship. The engine owns
// the one toolbar (search · export · columns), the grid and the status footer;
// the rail owns the factual filters; nothing wraps a second chrome around
// either (docs/ui/MASTER.md §6.5 LOCAL FILTER RAIL / REGISTER LISTING
// BOUNDARY).
/**
 * ⭐ PURCHASE RETURNS — the owner-confirmed register, `docs/purchasing/MASTER.md`
 * §9.6 (Jess, 2026-09-18) and `docs/COPY-STANDARD.md` "Purchase Returns
 * register".
 *
 * ── WHAT THIS PAGE IS ───────────────────────────────────────────────────────
 * A flat, READ-ONLY register of Purchasing's own return documents. §9.6 is
 * explicit about all three words:
 *
 *   FLAT      — "do not invent status groups". The rail carries the conditions;
 *               the grid stays one ungrouped list.
 *   READ-ONLY — "Issuing the document does not move stock", and the physical
 *               pickup is Stock's (§7.4, Stock MASTER §12.8). There is no
 *               blank `+ New` here because only an approved Claim/outcome
 *               creates a return, and no batch action because a register that
 *               selects nothing has nothing to act on (§6.7 rule 5).
 *   PURCHASING'S OWN — no Finance, no Credit Consequence, no Work column.
 *
 * ── AND WHERE ITS ROWS COME FROM ────────────────────────────────────────────
 * The page takes its rows as PROPS rather than calling a query hook, and that
 * is deliberate rather than unfinished. §9.6 is `APPROVED TARGET / NOT BUILT`:
 * the LAYOUT is confirmed, the storage and the Claim→return creation rule are
 * not. A hook pointed at an endpoint nobody has written would claim a data
 * path this repository does not have. So the approved composition ships now,
 * exercised by `dev/purchase-returns-preview` against fixtures, and the
 * container that supplies live rows arrives with the document slice — at which
 * point this file does not change.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PURCHASE_RETURN_ABSENT,
  PURCHASE_RETURN_COLUMN_LABEL,
  PURCHASE_RETURN_CONDITION_SECTION,
  PURCHASE_RETURN_RAIL_SECTIONS,
  purchaseReturnActualPickupDate,
  purchaseReturnCategory,
  purchaseReturnCollectedBy,
  purchaseReturnCollectedQty,
  purchaseReturnConditionCounts,
  purchaseReturnItemSpec,
  purchaseReturnItems,
  purchaseReturnMatches,
  purchaseReturnNo,
  purchaseReturnPickupLocation,
  purchaseReturnPoNo,
  purchaseReturnQty,
  purchaseReturnReturnTo,
  purchaseReturnSupplierCounts,
  purchaseReturnSupplierReceivedDate,
  purchaseReturnUnitCell,
  type PurchaseReturnCondition,
  type PurchaseReturnListRow,
} from "@carres/shared";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import type { IconName } from "@/components/kit/Icon";
import { fmtDate } from "@/lib/fmt-date";
import PurchasingTabs from "./PurchasingTabs";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
  ShowFiltersButton,
} from "./components/workspace-rail";
import PurchaseReturnUnitsTable from "./components/PurchaseReturnUnitsTable";
import SecondLine from "./components/register-cell";

/** `Absence` is a FACT, not an apology — `docs/COPY-STANDARD.md`. */
function Absence({ children = PURCHASE_RETURN_ABSENT }: { children?: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

/** One value, or the recorded absence. Every column goes through this, so no
 *  cell can quietly print an empty string where a fact is missing. */
const fact = (value: string | null | undefined) =>
  value ? <>{value}</> : <Absence />;

/** A date, or the recorded absence — never a guess, never today (§9.6:
 *  "never fabricate dates, collectors or receipt evidence"). */
const dateFact = (value: string | null | undefined) =>
  value ? <>{fmtDate(value)}</> : <Absence />;

/**
 * The rail's section icons, reusing Supplier Claims' own choices (§9.6:
 * "Reuse Supplier Claims' rail composition, section icons, spacing, width and
 * active state"). `delivery` carries Pickup because a pickup IS a collection
 * trip, and `attach` carries Evidence exactly as it does on Claims.
 */
const SECTION_ICON: Record<(typeof PURCHASE_RETURN_RAIL_SECTIONS)[number]["key"], IconName> = {
  supplier: "supplier",
  document: "order",
  pickup: "delivery",
  evidence: "attach",
};

/**
 * ⭐ THE RAIL OPENS ON EVERY VISIT, AND THAT IS DELIBERATE.
 *
 * Supplier Claims remembers its hidden rail in `localStorage`; this page does
 * not, for two reasons that point the same way.
 *
 *   · UI-KIT §0.4 — a browser-persisted UI SHAPE key is exactly what the
 *     design guard counts against `pages/**`. A new page does not inherit an
 *     older page's unfixed drift just because it is next door.
 *   · A filter rail somebody hid three weeks ago and forgot is a page that
 *     looks broken: the counts are gone, the conditions are gone, and nothing
 *     on screen says a rail exists. Returning it on each visit costs one click
 *     to hide again and removes that whole class of confusion.
 *
 * What IS remembered is each GROUP's collapsed state, and that already lives
 * where the law puts it — `workspace-rail.tsx` under
 * `carres.filterRail.<rail>.<group>` (UI MASTER §6.7, SLICE 1).
 */

export interface OperationPurchaseReturnsProps {
  returns: readonly PurchaseReturnListRow[];
  isLoading?: boolean;
  isError?: boolean;
  errorTitle?: string;
  errorDetail?: string;
  onRetry?: () => void;
}

export default function OperationPurchaseReturns({
  returns,
  isLoading = false,
  isError = false,
  errorTitle = "Purchase Returns could not be loaded.",
  errorDetail,
  onRetry,
}: OperationPurchaseReturnsProps) {
  const [supplier, setSupplier] = useState<string | null>(null);
  const [condition, setCondition] = useState<PurchaseReturnCondition | null>(null);
  const [railOpen, setRailVisible] = useState(true);

  /**
   * ⭐ CLICK AGAIN TO DESELECT — §9.6, and it is the rail's whole grammar.
   *
   * The same click that filters clears it, so an operator who cannot find the
   * `Clear filters` button is never trapped inside a filter they applied by
   * accident. Each group stays single-choice (UI MASTER §6.7: "Each group
   * remains single-choice; no new multi-select").
   */
  const pickSupplier = (value: string) =>
    setSupplier((previous) => (previous === value ? null : value));
  const pickCondition = (value: PurchaseReturnCondition) =>
    setCondition((previous) => (previous === value ? null : value));

  const rows = useMemo(
    () => returns.filter((row) => purchaseReturnMatches(row, { supplier, condition })),
    [returns, supplier, condition],
  );

  /* Counts respect the OTHER active dimension, never their own (§9.6:
     "counts respect the other active dimensions"). A supplier list recomputed
     under its own pick would collapse to the one row already chosen and the
     operator could not see what else is there. */
  const supplierRows = useMemo(
    () => purchaseReturnSupplierCounts(returns, { condition }),
    [returns, condition],
  );
  const conditionRows = useMemo(
    () => purchaseReturnConditionCounts(returns, { supplier }),
    [returns, supplier],
  );

  const anyFilter = supplier != null || condition != null;
  const clearFilters = () => {
    setSupplier(null);
    setCondition(null);
  };

  /**
   * ⭐ THE CONFIRMED COLUMN ORDER — §9.6, and this array IS that order.
   *
   * Every label comes from `PURCHASE_RETURN_COLUMN_LABEL` rather than a string
   * literal, so the screen and the dictionary cannot drift apart: changing a
   * word in one place changes it in both, and the shared test proves the set.
   *
   * WIDTHS ARE THE SHARED FIELD'S, not this page's (§9.6: "Use the shared
   * field-width registry and kit geometry, not page-specific width
   * standards"). A field that already prints on Supplier Claims keeps the
   * width it has there — `Supplier` 180, `PO No` 180, `GRN No.` 220, `Qty`
   * 110 right-aligned, a date 144 — because "same field/role shares its
   * default width" (UI MASTER §6.8) is a cross-page rule, not a per-page one.
   */
  const columns = useMemo<DataGridColumn<PurchaseReturnListRow>[]>(
    () => [
      {
        key: "pr_doc_date",
        label: PURCHASE_RETURN_COLUMN_LABEL.pr_doc_date,
        width: 144,
        accessor: (row) => dateFact(row.pr_doc_date),
        dateValue: (row) => row.pr_doc_date,
        filterType: "date",
        exportValue: (row) => (row.pr_doc_date ? fmtDate(row.pr_doc_date) : ""),
      },
      {
        key: "pr_no",
        label: PURCHASE_RETURN_COLUMN_LABEL.pr_no,
        width: 190,
        /* Identity opens the object (§6.7 rule 2). The object is the document
           slice's, so until it exists the number prints as the plain fact it
           is rather than as a link to nowhere — a dead link teaches an
           operator that links here do not work. */
        accessor: (row) => (
          <span className="font-semibold">{purchaseReturnNo(row.pr_no)}</span>
        ),
        searchValue: (row) => purchaseReturnNo(row.pr_no),
        exportValue: (row) => purchaseReturnNo(row.pr_no),
        filterType: "numbering",
      },
      {
        key: "supplier",
        label: PURCHASE_RETURN_COLUMN_LABEL.supplier,
        width: 180,
        accessor: (row) => fact(row.supplier_name),
        searchValue: (row) => row.supplier_name || PURCHASE_RETURN_ABSENT,
      },
      {
        key: "claim_no",
        label: PURCHASE_RETURN_COLUMN_LABEL.claim_no,
        width: 210,
        /* The authorising Claim, and it IS a live door: Supplier Claims is
           built and this is the evidence chain §7.4 names. */
        accessor: (row) =>
          row.claim_no ? (
            <Link
              className="text-kit-blue-11 underline"
              to={`/operation?tab=claims&claim=${encodeURIComponent(row.claim_no)}`}
            >
              {row.claim_no}
            </Link>
          ) : (
            <Absence />
          ),
        searchValue: (row) => row.claim_no || "",
        exportValue: (row) => row.claim_no || "",
      },
      {
        key: "category",
        label: PURCHASE_RETURN_COLUMN_LABEL.category,
        /* 148, not `GoodsMiniTable`'s 132: the same word — `Mattress
           protector`, the longest category — is measured here in the REGISTER's
           cell, which carries the sort caret and the column-filter glyph beside
           the heading. Content decides the width (CLAUDE.md §2); walked at 1440
           and the word now prints whole instead of ellipsing. */
        width: 148,
        accessor: (row) => fact(purchaseReturnCategory(row)),
        searchValue: (row) => purchaseReturnCategory(row) || "",
      },
      {
        /* ⭐ ONE CELL, TWO LINES — the document on line one and the Unit under
           it, exactly the stock picker's `PO No / Ref No` provenance cell
           (§9.1, UI MASTER §6.8). They are the two identifiers a person
           copies, and a reader who has to look across the table to pair them
           pairs them wrongly. Several Units print their COUNT here, which
           §9.6 names "the expansion entry". */
        key: "po_unit",
        label: PURCHASE_RETURN_COLUMN_LABEL.po_unit,
        width: 180,
        accessor: (row) => (
          <>
            <div className="break-words">{fact(purchaseReturnPoNo(row))}</div>
            <SecondLine>
              {purchaseReturnUnitCell(row)}
            </SecondLine>
          </>
        ),
        searchValue: (row) =>
          `${purchaseReturnPoNo(row) || ""} ${row.units.map((u) => u.unit_id).join(" ")}`,
        exportValue: (row) =>
          `${purchaseReturnPoNo(row) || ""} · ${purchaseReturnUnitCell(row)}`,
      },
      {
        key: "grn_no",
        label: PURCHASE_RETURN_COLUMN_LABEL.grn_no,
        width: 220,
        accessor: (row) => fact(row.grn_no),
        searchValue: (row) => row.grn_no || "",
        exportValue: (row) => row.grn_no || "",
      },
      {
        /* `Items` is the recorded goods summary, its specification on line two
           at 11px (Purchasing UI dictionary; UI MASTER §6.8). */
        key: "items",
        label: PURCHASE_RETURN_COLUMN_LABEL.items,
        width: 240,
        accessor: (row) => {
          const spec = purchaseReturnItemSpec(row);
          return (
            <>
              <div className="break-words">{fact(purchaseReturnItems(row))}</div>
              {spec ? (
                <SecondLine>{spec}</SecondLine>
              ) : null}
            </>
          );
        },
        searchValue: (row) =>
          `${purchaseReturnItems(row) || ""} ${purchaseReturnItemSpec(row) || ""}`,
        exportValue: (row) => purchaseReturnItems(row) || "",
      },
      {
        key: "qty",
        label: PURCHASE_RETURN_COLUMN_LABEL.qty,
        width: 110,
        align: "right",
        accessor: (row) => purchaseReturnQty(row),
        numberValue: (row) => purchaseReturnQty(row),
        filterType: "number",
        exportValue: (row) => purchaseReturnQty(row),
      },
      {
        key: "pickup_location",
        label: PURCHASE_RETURN_COLUMN_LABEL.pickup_location,
        width: 200,
        accessor: (row) => fact(purchaseReturnPickupLocation(row)),
        searchValue: (row) => purchaseReturnPickupLocation(row) || "",
      },
      {
        /* §9.6: the supplier-DESIGNATED destination. Absent means absent — a
           supplier's registered address is not where they asked goods to go. */
        key: "return_to",
        label: PURCHASE_RETURN_COLUMN_LABEL.return_to,
        width: 200,
        accessor: (row) => fact(purchaseReturnReturnTo(row)),
        searchValue: (row) => purchaseReturnReturnTo(row) || "",
      },
      {
        key: "confirmed_pickup_date",
        label: PURCHASE_RETURN_COLUMN_LABEL.confirmed_pickup_date,
        width: 144,
        accessor: (row) => dateFact(row.confirmed_pickup_date),
        dateValue: (row) => row.confirmed_pickup_date,
        filterType: "date",
        exportValue: (row) =>
          row.confirmed_pickup_date ? fmtDate(row.confirmed_pickup_date) : "",
      },
      {
        key: "collected_by",
        label: PURCHASE_RETURN_COLUMN_LABEL.collected_by,
        width: 160,
        accessor: (row) => fact(purchaseReturnCollectedBy(row)),
        searchValue: (row) => purchaseReturnCollectedBy(row) || "",
      },
      {
        key: "collected_qty",
        label: PURCHASE_RETURN_COLUMN_LABEL.collected_qty,
        width: 130,
        align: "right",
        accessor: (row) => purchaseReturnCollectedQty(row),
        numberValue: (row) => purchaseReturnCollectedQty(row),
        filterType: "number",
        exportValue: (row) => purchaseReturnCollectedQty(row),
      },
      {
        /* ⭐ THREE DATES, THREE COLUMNS, AND THEY NEVER BORROW FROM EACH OTHER
           (§9.6). Confirmed is a plan, Actual is what happened, and Supplier
           Received is the supplier's word — "fully picked up does not mean
           received by the supplier". */
        key: "actual_pickup_date",
        label: PURCHASE_RETURN_COLUMN_LABEL.actual_pickup_date,
        width: 144,
        accessor: (row) => dateFact(purchaseReturnActualPickupDate(row)),
        dateValue: (row) => purchaseReturnActualPickupDate(row),
        filterType: "date",
        exportValue: (row) => {
          const value = purchaseReturnActualPickupDate(row);
          return value ? fmtDate(value) : "";
        },
      },
      {
        key: "supplier_received_date",
        label: PURCHASE_RETURN_COLUMN_LABEL.supplier_received_date,
        width: 176,
        accessor: (row) => dateFact(purchaseReturnSupplierReceivedDate(row)),
        dateValue: (row) => purchaseReturnSupplierReceivedDate(row),
        filterType: "date",
        exportValue: (row) => {
          const value = purchaseReturnSupplierReceivedDate(row);
          return value ? fmtDate(value) : "";
        },
      },
    ],
    [],
  );

  if (isError) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="operation-purchase-returns">
        <PurchasingTabs />
        <div role="alert">
          <EmptyState
            title={errorTitle}
            detail={errorDetail}
            action={
              onRetry ? (
                <Button variant="neutral" onClick={onRetry}>
                  Try again
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="operation-purchase-returns">
      <PurchasingTabs />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {railOpen && (
          <FilterRail testId="purchase-returns-rail" onHide={() => setRailVisible(false)}>
            {PURCHASE_RETURN_RAIL_SECTIONS.map((section) => {
              /* ⭐ SUPPLIER IS A LIST, NOT A DROPDOWN — §9.6 says so in its own
                 sentence, because a dropdown hides the counts and the counts
                 are the reason to look. */
              if (section.key === "supplier") {
                if (supplierRows.length === 0) return null;
                return (
                  <FilterRailGroup
                    key={section.key}
                    title={section.title}
                    icon={SECTION_ICON.supplier}
                    chosen={supplier}
                  >
                    {supplierRows.map(({ supplier: name, count }) => (
                      <FilterRailRow
                        key={name}
                        label={name}
                        count={count}
                        active={supplier === name}
                        onClick={() => pickSupplier(name)}
                        testId={`purchase-returns-rail-supplier-${name}`}
                      />
                    ))}
                  </FilterRailGroup>
                );
              }
              /* The three condition sections. A section with nothing true of
                 any document is not drawn — an empty heading is a promise of
                 rows that do not exist. */
              const inSection = conditionRows.filter(
                ({ condition: value }) =>
                  PURCHASE_RETURN_CONDITION_SECTION[value] === section.key,
              );
              if (inSection.length === 0) return null;
              return (
                <FilterRailGroup
                  key={section.key}
                  title={section.title}
                  icon={SECTION_ICON[section.key]}
                  chosen={
                    condition && PURCHASE_RETURN_CONDITION_SECTION[condition] === section.key
                      ? condition
                      : null
                  }
                >
                  {inSection.map(({ condition: value, count }) => (
                    <FilterRailRow
                      key={value}
                      label={value}
                      count={count}
                      active={condition === value}
                      onClick={() => pickCondition(value)}
                      testId={`purchase-returns-rail-condition-${value}`}
                    />
                  ))}
                </FilterRailGroup>
              );
            })}
            {anyFilter && (
              <div>
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            )}
          </FilterRail>
        )}
        <div className="flex min-w-0 flex-1 flex-col p-2">
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            storageKey="carres.purchase-returns.register.v1"
            appearance="reference"
            /* Flat: §9.6 forbids inventing status groups on this register. */
            groupBanner={false}
            /* §6.7 rule 2 — the record date and the identity lead and pin, and
               no saved layout may hide or reorder them away. */
            leadingColumns={{ date: "pr_doc_date", identity: "pr_no" }}
            isLoading={isLoading}
            emptyMessage={
              anyFilter ? "No matching purchase returns." : "No purchase returns."
            }
            searchPlaceholder="Search purchase returns…"
            exportName="Purchase Returns"
            toolbarStart={
              !railOpen ? (
                <ShowFiltersButton
                  onShow={() => setRailVisible(true)}
                  testId="purchase-returns-show-filters"
                />
              ) : null
            }
            /* ⭐ ONE TRACKED UNIT PER EXPANDED ROW (§9.6). The expansion is the
               per-Unit truth and the evidence door; the parent row never
               combines two physical Units into one evidence row. */
            expandable={{
              renderExpansion: (row) => <PurchaseReturnUnitsTable units={row.units} />,
              testId: (row) => `purchase-return-units-${row.id}`,
            }}
            statusSummary={(visible) => {
              const units = visible.reduce((sum, row) => sum + purchaseReturnQty(row), 0);
              return (
                <span>
                  {visible.length}
                  {visible.length !== returns.length ? ` of ${returns.length}` : ""}{" "}
                  {returns.length === 1 ? "return" : "returns"} · {units}{" "}
                  {units === 1 ? "Unit" : "Units"}
                </span>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
