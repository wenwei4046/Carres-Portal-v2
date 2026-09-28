// design-standard: not-a-list-page — this page runs THE REGISTER ENGINE
// (components/register/DataGrid) beside the governed 240px FilterRail, the
// same composition Purchase Returns and Supplier Claims ship. The engine owns
// the one toolbar (search · export · columns), the grid and the status footer;
// the rail owns the factual filters (docs/ui/MASTER.md §6.5).
/**
 * ⭐ REPAIR ORDERS — `docs/purchasing/MASTER.md` §9.7 (owner-confirmed
 * register 2026-09-20; object page and Create page 2026-09-28) and
 * `docs/COPY-STANDARD.md` "Repair Orders".
 *
 * One destination, three surfaces, all kept in the URL:
 *   `?tab=repair-orders`               the register
 *   `?tab=repair-orders&ro={id|RO No}` the full-width object
 *   `?tab=repair-orders&create=1`      Create Repair Order (`&claim=` prefills)
 *
 * FLAT, and `▸` is the ONE leading control: no batch write, so no checkbox.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  REPAIR_COST_RESPONSIBILITY_LABEL,
  REPAIR_ORDER_ABSENT,
  REPAIR_ORDER_COLUMN_LABEL,
  REPAIR_ORDER_CONDITION_SECTION,
  REPAIR_ORDER_NOT_ISSUED,
  REPAIR_ORDER_RAIL_SECTIONS,
  REPAIR_ORDER_SENDING_NOT_CONFIRMED,
  REPAIR_ORDER_SUPPLIER_DATE_NOT_REPORTED,
  repairOrderActualPickupDate,
  repairOrderCategory,
  repairOrderConditionCounts,
  repairOrderExpectedReturn,
  repairOrderFooter,
  repairOrderGoodsReceivedDate,
  repairOrderGrnCell,
  repairOrderItemSpec,
  repairOrderItems,
  repairOrderMatches,
  repairOrderPoNo,
  repairOrderQty,
  repairOrderRequirementCell,
  repairOrderReturnedQty,
  repairOrderSupplierCounts,
  type RepairOrderCondition,
  type RepairOrderListRow,
} from "@carres/shared";
import { useOperationRepairOrders } from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import type { IconName } from "@/components/kit/Icon";
import { fmtDate } from "@/lib/fmt-date";
import PurchasingTabs from "./PurchasingTabs";
import { FilterRail, FilterRailGroup, FilterRailRow, ShowFiltersButton } from "./components/workspace-rail";
import RepairOrderUnitsTable from "./components/RepairOrderUnitsTable";
import SecondLine from "./components/register-cell";
import RepairOrderObject from "./RepairOrderObject";
import RepairOrderCreate from "./RepairOrderCreate";

function Absence({ children = REPAIR_ORDER_ABSENT }: { children?: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}
const fact = (value: string | null | undefined) => (value ? <>{value}</> : <Absence />);
const dateFact = (value: string | null | undefined) => (value ? <>{fmtDate(value)}</> : <Absence />);

const SECTION_ICON: Record<(typeof REPAIR_ORDER_RAIL_SECTIONS)[number]["key"], IconName> = {
  supplier: "supplier",
  document: "order",
  pickup: "delivery",
  return: "delivery",
  evidence: "attach",
};

/** Units grouped under their own PO, in first-seen order. */
function groupByPo(r: RepairOrderListRow): [string | null, string[]][] {
  const groups = new Map<string | null, string[]>();
  for (const u of r.units) groups.set(u.po_no, [...(groups.get(u.po_no) ?? []), u.unit_id]);
  return [...groups.entries()];
}

export interface RepairOrdersRegisterProps {
  rows: readonly RepairOrderListRow[];
  isLoading?: boolean;
  isError?: boolean;
  errorTitle?: string;
  onRetry?: () => void;
}

/** The 17 approved columns, in the approved order (§9.7, 2026-09-20). */
export function repairOrderColumns(): DataGridColumn<RepairOrderListRow>[] {
  const L = REPAIR_ORDER_COLUMN_LABEL;
  return [
    { key: "ro_doc_date", label: L.ro_doc_date, width: W.date, accessor: (r) => dateFact(r.ro_doc_date), dateValue: (r) => r.ro_doc_date, filterType: "date", exportValue: (r) => fmtDate(r.ro_doc_date) },
    {
      key: "ro_no",
      label: L.ro_no,
      width: W.documentNo,
      /* RO No is the ONE door into the object. An unissued RO keeps its
         place, reads `Not issued` with `Sending not confirmed` beneath. */
      accessor: (r) => (
        <>
          <Link className="font-semibold text-kit-blue-11 hover:underline" to={`/operation?tab=repair-orders&ro=${encodeURIComponent(r.ro_no)}`}>
            {r.ro_no}
          </Link>
          {!r.issued && !r.cancelled_at ? (
            <>
              <SecondLine>{REPAIR_ORDER_NOT_ISSUED}</SecondLine>
              <SecondLine>{REPAIR_ORDER_SENDING_NOT_CONFIRMED}</SecondLine>
            </>
          ) : r.cancelled_at ? (
            <SecondLine>Cancelled</SecondLine>
          ) : null}
        </>
      ),
      searchValue: (r) => r.ro_no,
      exportValue: (r) => r.ro_no,
      filterType: "numbering",
    },
    { key: "supplier", label: L.supplier, width: W.supplier, accessor: (r) => fact(r.supplier_name), searchValue: (r) => r.supplier_name ?? "" },
    {
      key: "claim_no",
      label: L.claim_no,
      width: W.documentNo,
      /* EMPTY for a direct inventory repair (§9.7): no Claim, no word. */
      accessor: (r) => (
        <span data-testid="repair-order-claim-cell">
          {r.claim_no ? (
            <Link className="text-kit-blue-11 hover:underline" to={`/operation?tab=claims&claim=${encodeURIComponent(r.claim_no)}`}>{r.claim_no}</Link>
          ) : null}
        </span>
      ),
      searchValue: (r) => r.claim_no ?? "",
      exportValue: (r) => r.claim_no ?? "",
    },
    { key: "category", label: L.category, width: W.category, accessor: (r) => fact(repairOrderCategory(r)), searchValue: (r) => repairOrderCategory(r) ?? "" },
    {
      key: "po_unit",
      label: L.po_unit,
      width: W.sourceAndUnitId,
      /* The PO first and EVERY actual Unit ID beneath it (owner correction
         2026-09-20) — never `{n} Units`, never a range. Each Unit stays under
         its OWN PO; a missing original source reads `Not recorded`. */
      accessor: (r) => (
        <>
          {groupByPo(r).map(([po, ids]) => (
            <div key={po ?? "none"} className="break-words">
              <div>{fact(po)}</div>
              {ids.map((id) => (
                <SecondLine key={id}>{id}</SecondLine>
              ))}
            </div>
          ))}
        </>
      ),
      searchValue: (r) => `${repairOrderPoNo(r) ?? ""} ${r.units.map((u) => u.unit_id).join(" ")}`,
      exportValue: (r) => `${repairOrderPoNo(r) ?? ""} ${r.units.map((u) => u.unit_id).join(" ")}`.trim(),
    },
    {
      key: "items",
      label: L.items,
      width: W.items,
      accessor: (r) => (
        <>
          <div className="break-words">{fact(repairOrderItems(r))}</div>
          {repairOrderItemSpec(r) ? <SecondLine>{repairOrderItemSpec(r)}</SecondLine> : null}
        </>
      ),
      searchValue: (r) => `${repairOrderItems(r) ?? ""} ${repairOrderItemSpec(r) ?? ""}`,
      exportValue: (r) => repairOrderItems(r) ?? "",
    },
    { key: "qty", label: L.qty, width: W.qty, align: "right", accessor: (r) => repairOrderQty(r), numberValue: (r) => repairOrderQty(r), filterType: "number", exportValue: (r) => repairOrderQty(r) },
    { key: "repair_requirement", label: L.repair_requirement, width: W.items, accessor: (r) => <div className="break-words">{repairOrderRequirementCell(r)}</div>, searchValue: (r) => r.units.map((u) => u.repair_requirement).join(" ") },
    { key: "cost_responsibility", label: L.cost_responsibility, width: W.status, accessor: (r) => REPAIR_COST_RESPONSIBILITY_LABEL[r.cost_responsibility], searchValue: (r) => REPAIR_COST_RESPONSIBILITY_LABEL[r.cost_responsibility] },
    {
      key: "pickup_location",
      label: L.pickup_location,
      width: W.stockLocation,
      accessor: (r) => (
        <>
          <div>{fact(r.pickup_site_name)}</div>
          {r.units.some((u) => u.display) ? <SecondLine>Display</SecondLine> : null}
        </>
      ),
      searchValue: (r) => r.pickup_site_name ?? "",
    },
    { key: "actual_pickup_date", label: L.actual_pickup_date, width: W.date, accessor: (r) => dateFact(repairOrderActualPickupDate(r)), dateValue: (r) => repairOrderActualPickupDate(r), filterType: "date" },
    { key: "return_location", label: L.return_location, width: W.stockLocation, accessor: (r) => fact(r.return_site_name), searchValue: (r) => r.return_site_name ?? "" },
    {
      key: "expected_return_date",
      label: L.expected_return_date,
      width: W.date,
      /* The Supplier's own reported date — distinct from the Carres target. */
      accessor: (r) =>
        repairOrderExpectedReturn(r) ? <>{fmtDate(repairOrderExpectedReturn(r)!)}</> : r.latest_reply ? <Absence>{REPAIR_ORDER_SUPPLIER_DATE_NOT_REPORTED}</Absence> : <Absence />,
      dateValue: (r) => repairOrderExpectedReturn(r),
      filterType: "date",
    },
    { key: "returned_qty", label: L.returned_qty, width: W.receiptQty, align: "right", accessor: (r) => repairOrderReturnedQty(r), numberValue: (r) => repairOrderReturnedQty(r), filterType: "number", exportValue: (r) => repairOrderReturnedQty(r) },
    {
      key: "goods_received_date",
      label: L.goods_received_date,
      width: W.goodsReceivedDate,
      accessor: (r) => dateFact(repairOrderGoodsReceivedDate(r)),
      dateValue: (r) => repairOrderGoodsReceivedDate(r),
      filterType: "date",
    },
    {
      key: "grn_no",
      label: L.grn_no,
      width: W.documentNo,
      /* One GRN prints itself; several read `{n} GRNs`; none is blank. */
      accessor: (r) => repairOrderGrnCell(r),
      searchValue: (r) => r.units.map((u) => u.grn_no ?? "").join(" "),
      exportValue: (r) => repairOrderGrnCell(r),
    },
  ];
}

export function RepairOrdersRegister({ rows, isLoading = false, isError = false, errorTitle = "Repair Orders could not be loaded", onRetry }: RepairOrdersRegisterProps) {
  const [supplier, setSupplier] = useState<string | null>(null);
  const [condition, setCondition] = useState<RepairOrderCondition | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const navigate = useNavigate();
  const pickSupplier = (v: string) => setSupplier((p) => (p === v ? null : v));
  const pickCondition = (v: RepairOrderCondition) => setCondition((p) => (p === v ? null : v));

  const visible = useMemo(() => rows.filter((r) => repairOrderMatches(r, { supplier, condition })), [rows, supplier, condition]);
  const supplierRows = useMemo(() => repairOrderSupplierCounts(rows, { condition }), [rows, condition]);
  const conditionRows = useMemo(() => repairOrderConditionCounts(rows, { supplier }), [rows, supplier]);
  const columns = useMemo(() => repairOrderColumns(), []);
  const anyFilter = supplier != null || condition != null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="operation-repair-orders">
      <PurchasingTabs />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {railOpen && (
          <FilterRail testId="repair-orders-rail" onHide={() => setRailOpen(false)}>
            {REPAIR_ORDER_RAIL_SECTIONS.map((section) => {
              if (section.key === "supplier") {
                return (
                  <FilterRailGroup key={section.key} title={section.title} icon={SECTION_ICON.supplier} chosen={supplier}>
                    {supplierRows.map(({ supplier: name, count }) => (
                      <FilterRailRow key={name} label={name} count={count} active={supplier === name} onClick={() => pickSupplier(name)} testId={`repair-orders-rail-supplier-${name}`} />
                    ))}
                  </FilterRailGroup>
                );
              }
              const inSection = conditionRows.filter(({ condition: v }) => REPAIR_ORDER_CONDITION_SECTION[v] === section.key);
              return (
                <FilterRailGroup
                  key={section.key}
                  title={section.title}
                  icon={SECTION_ICON[section.key]}
                  chosen={condition && REPAIR_ORDER_CONDITION_SECTION[condition] === section.key ? condition : null}
                >
                  {inSection.map(({ condition: v, count }) => (
                    <FilterRailRow key={v} label={v} count={count} active={condition === v} onClick={() => pickCondition(v)} testId={`repair-orders-rail-condition-${v}`} />
                  ))}
                </FilterRailGroup>
              );
            })}
          </FilterRail>
        )}
        <div className="flex min-w-0 flex-1 flex-col p-2">
          <DataGrid
            rows={visible}
            columns={columns}
            rowKey={(r) => r.id}
            storageKey="carres.repair-orders.register.v1"
            appearance="reference"
            groupBanner={false}
            leadingColumns={{ date: "ro_doc_date", identity: "ro_no" }}
            isLoading={isLoading}
            emptyMessage={anyFilter ? "No Repair Orders match these filters" : "No Repair Orders yet."}
            errorState={
              isError ? (
                <div role="alert">
                  <EmptyState
                    title={errorTitle}
                    action={onRetry ? <Button variant="neutral" onClick={onRetry}>Try again</Button> : undefined}
                  />
                </div>
              ) : undefined
            }
            searchPlaceholder="Search Repair Orders"
            exportName="Repair Orders"
            toolbarStart={!railOpen ? <ShowFiltersButton onShow={() => setRailOpen(true)} testId="repair-orders-show-filters" /> : null}
            toolbarEnd={
              <Button variant="primary" onClick={() => navigate("/operation?tab=repair-orders&create=1")} data-testid="repair-orders-create">
                Create Repair Order
              </Button>
            }
            expandable={{
              renderExpansion: (r) => (
                <RepairOrderUnitsTable roId={r.id} units={r.units} pickupLocation={r.pickup_site_name} returnLocation={r.return_site_name} />
              ),
              testId: (r) => `repair-order-units-${r.id}`,
            }}
            statusSummary={(filtered) => <span>{repairOrderFooter(filtered.length, rows.length)}</span>}
          />
        </div>
      </div>
    </div>
  );
}

export default function OperationRepairOrders() {
  const [params] = useSearchParams();
  const ro = params.get("ro");
  const creating = params.get("create") === "1";
  const query = useOperationRepairOrders({ enabled: !ro && !creating });
  const status = (query.error as { status?: number } | null)?.status;

  if (creating) return <RepairOrderCreate claimId={params.get("claim")} />;
  if (ro) return <RepairOrderObject idOrNo={ro} />;
  return (
    <RepairOrdersRegister
      rows={query.data?.repairOrders ?? []}
      isLoading={query.isLoading}
      isError={query.isError}
      errorTitle={status === 403 ? "You do not have access to Repair Orders." : "Repair Orders could not be loaded"}
      onRetry={() => void query.refetch()}
    />
  );
}
