/** Inventory adapter for the shared module card (UI MASTER §0.2, §4.3.1–§4.3.3):
 *  Info (the Unit record) · Warehouse (this page's main work tab, open by default) ·
 *  Sales Order (the shared embedded SO, only when the Unit is bound to an order in this portal),
 *  over the same Unit, issue and movement reads the Unit page uses.
 *  The full Unit page (↗) keeps the three acts and the History; this card writes nothing. */
import { Link } from "react-router-dom";
import {
  inventoryStatusOf,
  stockConditionOf,
  unitIdOf,
  UNIT_LIFECYCLE_OUTCOME_LABEL,
  UNIT_OWNERSHIP_LABEL,
  goodsReceivedAbsence,
  type StockRegisterUnit,
  type UnitLifecycleOutcome,
} from "@carres/shared";
import CompactModuleCard, { type CardFact } from "@/components/kit/CompactModuleCard";
import Button from "@/components/kit/Button";
import { fmtDate } from "@/lib/fmt-date";
import { useStockMovementEvidence, useStockUnit } from "@/lib/queries";
import { EVENT_LABEL, OWNER_RULE_WORD, useUnitOpenIssues } from "../WarehouseUnitDetail";
import EmbeddedSalesOrders from "./EmbeddedSalesOrders";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function WarehouseUnitCompactView({ unit, onOpen, onClose }: {
  unit: StockRegisterUnit;
  onOpen: () => void;
  onClose: () => void;
}) {
  const code = unitIdOf(unit) ?? undefined;
  const detail = useStockUnit(code);
  const issues = useUnitOpenIssues(code);
  const movement = useStockMovementEvidence(code);

  const status = inventoryStatusOf(unit)
    ?? UNIT_LIFECYCLE_OUTCOME_LABEL[unit.lifecycleOutcome as UnitLifecycleOutcome]
    ?? unit.lifecycleOutcome;
  const item = unit.productName ?? unit.sku;
  const pending = (q: { isLoading: boolean; isError: boolean }) => (q.isError ? "Unavailable" : "Loading…");

  const issue = issues.data?.issues.find((i) => i.currentAction) ?? null;
  const action = issue?.currentAction ?? null;
  const late = !!action && action.dueOn < todayIso();
  const work: CardFact = !code
    ? { key: "work", label: "Current work", value: "Nothing to do for this record" }
    : !issues.data
      ? { key: "work", label: "Current work", value: pending(issues) }
      : action
        ? {
            key: "work",
            label: "Current work",
            value: action.action,
            status: `${OWNER_RULE_WORD[action.ownerRule] ?? action.ownerRule} · by ${fmtDate(action.dueOn)}${late ? " · late" : ""}`,
            editable: true,
            editor: () => (
              <div className="flex flex-col gap-2 text-body">
                <p>{issue!.officialEnglish}</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="primary" onClick={onOpen}>Open full page</Button>
                </div>
              </div>
            ),
          }
        : { key: "work", label: "Current work", value: "Nothing to do for this Unit." };

  const receipts = (movement.data?.evidence ?? []).filter((e) => e.direction === "in");
  const lastReceipt = receipts[receipts.length - 1];
  const receivedDate = unit.goodsReceivedDate ? fmtDate(unit.goodsReceivedDate) : goodsReceivedAbsence(unit);

  const unitDetails = (
    <dl className="grid grid-cols-2 gap-3 text-body">
      {([
        ["Ownership", UNIT_OWNERSHIP_LABEL[unit.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? unit.ownership],
        ["Supplier", unit.supplier ?? "Not recorded"],
        ["PO No / Ref No", unit.poNo
          ? <Link className="font-mono text-kit-blue-11 hover:underline" to={`/operation/procurement?po=${encodeURIComponent(unit.poNo)}`}>{unit.poNo}</Link>
          : "Not recorded"],
        ["SO No", unit.reservedRef
          ? (unit.soldOrderId
            ? <Link className="font-mono text-kit-blue-11 hover:underline" to={`/operation/orders/${encodeURIComponent(unit.soldOrderId)}`}>{unit.reservedRef}</Link>
            : `${unit.reservedRef} · not in this portal`)
          : "No SO"],
        ["Goods Received Date", receivedDate],
        ["Category", unit.category ?? "Not recorded"],
      ] as const).map(([label, value]) => (
        <div key={label}><dt className="text-kit-slate-11">{label}</dt><dd className="break-words text-kit-slate-12">{value}</dd></div>
      ))}
    </dl>
  );
  const receiptLine = !code ? "Not recorded" : !movement.data ? pending(movement) : lastReceipt?.reference ?? "Not in this portal";

  const receipts_ = receipts.length ? (
    <div className="flex flex-col gap-2 text-body">
      {receipts.map((r) => (
        <Link key={r.id} className="text-kit-blue-11 hover:underline" to={r.href}>{r.reference} · {fmtDate(r.at)}</Link>
      ))}
    </div>
  ) : null;

  return (
    <div data-testid="inventory-unit-card">
      <CompactModuleCard
        key={unit.id}
        name={item}
        reference={code ?? `${unit.sku} ×${unit.qty}`}
        referenceStatus={status === "Cannot sell" ? status : undefined}
        openLabel={code ? "Open full page" : undefined}
        onOpen={code ? onOpen : undefined}
        onClose={onClose}
        closeLabel="Close Unit"
        modulesLabel="Unit"
        initialModule="warehouse"
        modules={[
          {
            key: "info",
            label: "Info",
            detailsLabel: "Unit details",
            details: <div className="flex flex-col gap-3">{unitDetails}{receipts_}</div>,
            summary: [
              { key: "supplier", label: "Supplier", value: unit.supplier ?? "Not recorded" },
              { key: "po", label: "PO No / Ref No", value: unit.poNo ?? "Not recorded" },
              { key: "received", label: "Goods Received Date", value: receivedDate },
              { key: "grn", label: "GRN No", value: receiptLine },
            ],
          },
          {
            key: "warehouse",
            label: "Warehouse",
            summary: [
              {
                key: "status",
                label: "Inventory Status",
                value: status,
                status: status === "Reserved" ? unit.reservedRef ?? undefined : undefined,
              },
              { key: "condition", label: "Stock Condition", value: stockConditionOf(unit) },
              { key: "location", label: "Stock Location", value: unit.siteName ?? "Not recorded" },
              work,
            ],
          },
          ...(unit.soldOrderId ? [{
            key: "sales-order",
            label: "Sales Order",
            content: <EmbeddedSalesOrders orderIds={[unit.soldOrderId]} />,
          }] : []),
        ]}
        timelineStatus={code && !detail.data ? pending(detail) : undefined}
        timeline={code ? (detail.data?.events ?? []).map((e) => ({
          id: e.id,
          actorName: "Staff identity not recorded",
          actorInitial: "?",
          summary: EVENT_LABEL[e.event] ?? e.event,
          at: e.eventAt,
          result: e.fromValue || e.toValue ? [e.fromValue, e.toValue].filter(Boolean).join(" → ") : undefined,
        })) : undefined}
      />
    </div>
  );
}
