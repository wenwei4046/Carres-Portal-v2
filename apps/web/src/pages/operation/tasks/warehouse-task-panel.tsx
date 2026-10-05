/**
 * WAREHOUSE · RECEIVE — what a Warehouse receiving task opens in the Tasks area.
 *
 * LOCAL PROPOSAL (owner direction 2026-10-05; storyboard
 * `output/purchasing-plan-2026-10-05/tasks-complete-ux.html` screens 25b–25e,
 * agreed by Warehouse · Purchasing · UI Master the same day):
 *
 *   tabs       Info · Warehouse (open) · Sales Order
 *   Warehouse  the PO's lines READ ONLY: Order Qty · Received Qty · Pending
 *              Delivery Qty, Unit IDs one tap away; Damaged Qty / Wrong Item Qty
 *              appear only when one is above 0 (a read-only summary — the
 *              receiving page itself always keeps the first-time entry)
 *   Receive    the ONE act. A Goods Receipt is never squeezed into the side
 *              panel (Stock §7): it opens the existing full-width Receiving
 *              engine through `host.openReview` —
 *                · a submitted arrival report → THAT session (the count review,
 *                  `Save Receiving`), never a second receipt;
 *                · otherwise → `PoReceivingView` straight into Receiving Mode.
 *              Saving returns to the task with the result; a PO that still owes
 *              goods keeps the task open (the balance is PO Duty's
 *              `Ask {supplier} for the balance delivery date`, not Warehouse's).
 *
 * The receipt result also names the goods reserved to their Sales Order line
 * (owner rule 2026-10-05, APPROVED / NOT BUILT: lineage goods are reserved to
 * their SO line when Receiving posts; the local walk simulates it). The panel
 * only READS that Stock fact after the post — it never writes a reservation.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { poLineReportable } from "@carres/shared";
import CompactModuleCard, { type CardFact } from "@/components/kit/CompactModuleCard";
import DocumentTable, { type DocumentTableColumn, type DocumentTableRow } from "@/components/kit/DocumentTable";
import Button from "@/components/kit/Button";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import {
  fetchReceivingSessionDetail,
  useOperationPoUnits,
  useOperationSuppliers,
  usePoReceiving,
  useReceivingDuty,
  type operationPoListRow,
  type operationPosListResponse,
  type operationPoUnitRow,
  type operationPoUnitsResponse,
  type SupplierRow,
  qk,
} from "@/lib/queries";
import type { WorkRow } from "../use-open-work";
import EmbeddedSalesOrders, { linkedSalesOrderIds } from "../components/EmbeddedSalesOrders";
import PoReceivingView from "../components/PoReceivingView";
import ReceivingRecord from "../components/ReceivingRecord";
import type { WorkPanelHost } from "./tasks-host";

/** The Unit read, plus the SO it is reserved for when Stock holds one. */
type PoUnit = operationPoUnitRow & { reserved_ref?: string | null };
type PoLine = operationPoListRow["purchase_order_lines"][number] & { model_name?: string | null; size?: string | null };

/** Inventory Status words (COPY) for a Unit's stored status. */
const UNIT_STATUS_WORD: Record<string, string> = {
  incoming: "Incoming",
  available: "Available",
  reserved: "Reserved",
  cannot_sell: "Cannot sell",
};

const itemName = (l: PoLine) => (l.model_name ? [l.model_name, l.size].filter(Boolean).join(" ") : l.sku);
const unitsOfLine = (units: readonly PoUnit[], l: PoLine) =>
  units.filter((u) => (u.po_line_id ? u.po_line_id === l.id : u.sku === l.sku));
const pendingOf = (lines: readonly PoLine[]) => lines.reduce((n, l) => n + poLineReportable(l), 0);

function PanelState({ text, alert = false }: { text: string; alert?: boolean }) {
  return <p role={alert ? "alert" : "status"} className="p-3.5 text-body text-kit-slate-11">{text}</p>;
}

export default function WarehouseTaskPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const poId = item.source.object.id;
  const poQ = useQuery({
    queryKey: ["operation", "pos", "one", poId],
    queryFn: () => apiFetch<operationPosListResponse>(`/api/operation/pos?status=all&poId=${encodeURIComponent(poId)}`),
    staleTime: 10_000,
  });
  const suppliersQ = useOperationSuppliers();
  const unitsQ = useOperationPoUnits(poId);
  const receivingQ = usePoReceiving(poId);
  const dutyQ = useReceivingDuty();
  const [openLines, setOpenLines] = useState<Record<string, boolean>>({});

  const po = poQ.data?.pos.find((p) => p.id === poId) ?? null;
  const lines = useMemo(() => (po?.purchase_order_lines ?? []) as PoLine[], [po]);
  const units = (unitsQ.data?.units ?? []) as PoUnit[];
  /** The newest arrival report still waiting for Carres — `Receive` opens it. */
  const submitted = (receivingQ.data?.sessions ?? [])
    .filter((s) => s.status === "submitted")
    .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""))[0] ?? null;

  if (poQ.isPending) return <PanelState text="Loading…" />;
  if (poQ.isError || !po) return <PanelState text="This purchase order could not be opened" alert />;

  const supplierMap = new Map((suppliersQ.data?.suppliers ?? []).map((s) => [s.id, s as SupplierRow]));
  const supplier = supplierMap.get(po.supplier_id);
  const supplierName = supplier?.name ?? "Supplier";
  const destinations = [...(poQ.data?.destinations ?? []), ...(poQ.data?.referencedDestinations ?? [])];
  const warehouses = destinations.map((d) => ({ id: d.id, name: d.name }));
  const deliverTo = destinations.find((d) => d.id === (po.destination_id ?? po.warehouse_id))?.name ?? "";
  const poDate = po.official_delivery_date ?? po.eta_date;
  const sentForCurrent = (po.sends ?? []).some((s) => s.kind === "confirmed_sent" && s.po_version === (po.version ?? 1));
  const orderIds = linkedSalesOrderIds((po.sources ?? []).map((s) => ({ kind: s.kind, orderId: s.order_id ?? null })));
  const pending = pendingOf(lines);
  const dutyAllowed = dutyQ.data?.allowed ?? false;
  const dutyKnown = !dutyQ.isPending;
  const missed = item.timingBucket === "overdue";
  /** Some goods already received and no new arrival reported: the rest waits for the supplier. */
  const shortDelivered = !submitted && lines.some((l) => l.received_qty > 0);

  /* ── after a save: read the PO and its Units again, then say what changed ── */
  const reservedBefore = new Set(units.filter((u) => u.status === "reserved").map((u) => u.unit_code));
  async function reportSaved() {
    const [fresh, freshUnits] = await Promise.all([
      qc.fetchQuery({
        queryKey: ["operation", "pos", "one", poId],
        queryFn: () => apiFetch<operationPosListResponse>(`/api/operation/pos?status=all&poId=${encodeURIComponent(poId)}`),
        staleTime: 0,
      }),
      qc.fetchQuery({
        queryKey: qk.operation.poUnits(poId),
        queryFn: () => apiFetch<operationPoUnitsResponse>(`/api/operation/pos/${encodeURIComponent(poId)}/units`),
        staleTime: 0,
      }),
    ]);
    const after = (fresh.pos.find((p) => p.id === poId)?.purchase_order_lines ?? []) as PoLine[];
    const stillDue = pendingOf(after);
    const reserved = new Map<string, number>();
    for (const u of (freshUnits.units ?? []) as PoUnit[]) {
      if (u.status !== "reserved" || !u.reserved_ref || reservedBefore.has(u.unit_code)) continue;
      reserved.set(u.reserved_ref, (reserved.get(u.reserved_ref) ?? 0) + 1);
    }
    const words = [
      "Receipt saved",
      po!.id,
      ...[...reserved].map(([so, n]) => `${n} reserved for ${so}`),
      ...(stillDue > 0 ? [`${stillDue} ${stillDue === 1 ? "item" : "items"} still to receive`] : []),
    ];
    host.result(words.join(" · "), { stay: stillDue > 0 });
    /* The list must show the task closed (or the balance row) on return. */
    void qc.invalidateQueries({ queryKey: qk.operation.work() });
  }

  const receive = () => {
    if (submitted) {
      /* The submitted report's OWN session — one arrival, one GRN. Its back
         door also fires after `Save Receiving`; the saved status tells which. */
      const sessionId = submitted.id;
      host.openReview((close) => (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="task-receive-session">
          <ReceivingRecord
            sessionId={sessionId}
            backLabel="Tasks"
            onBack={() => {
              void fetchReceivingSessionDetail(sessionId)
                .then((d) => {
                  close();
                  if (d.receipt.status === "posted") void reportSaved();
                })
                .catch(() => close());
            }}
          />
        </div>
      ));
      return;
    }
    host.openReview((close) => (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="task-receive-po">
        <PoReceivingView
          poId={po.id}
          pos={[po]}
          suppliers={supplierMap}
          warehouses={warehouses}
          dutyAllowed={dutyAllowed}
          dutyKnown={dutyKnown}
          initialReceiving
          backLabel="Tasks"
          onBack={close}
          onPosted={() => {
            close();
            void reportSaved();
          }}
        />
      </div>
    ));
  };

  /* ── the Warehouse tab: read-only lines + the one act ───────────────────── */
  const anyDamaged = lines.some((l) => (l.damaged_qty ?? 0) > 0);
  const anyWrong = lines.some((l) => (l.wrong_item_qty ?? 0) > 0);
  const columns: DocumentTableColumn[] = [
    { key: "item", label: "Item" },
    { key: "order", label: "Order Qty", numeric: true },
    { key: "received", label: "Received Qty", numeric: true },
    ...(anyDamaged ? [{ key: "damaged", label: "Damaged Qty", numeric: true }] : []),
    ...(anyWrong ? [{ key: "wrong", label: "Wrong Item Qty", numeric: true }] : []),
    { key: "pending", label: "Pending Delivery Qty", numeric: true },
  ];
  const rows: DocumentTableRow[] = lines.map((l) => {
    const lineUnits = unitsOfLine(units, l);
    const open = openLines[l.id] ?? false;
    return {
      key: l.id,
      cells: {
        item: (
          <div className="whitespace-normal">
            {itemName(l)}
            <div className="flex flex-wrap items-center gap-x-1 text-meta text-kit-slate-11">
              <span className="font-mono">{l.sku}</span>
              {lineUnits.length > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenLines((s) => ({ ...s, [l.id]: !open }))}
                    className="text-kit-blue-11 hover:underline"
                    data-testid={`task-unit-ids-${l.id}`}
                  >
                    Unit IDs ({lineUnits.length}) {open ? "▾" : "▸"}
                  </button>
                </>
              ) : null}
            </div>
            {open ? (
              <ul className="mt-1 flex flex-col gap-0.5" data-testid={`task-unit-list-${l.id}`}>
                {lineUnits.map((u) => (
                  <li key={u.unit_code} className="text-meta text-kit-slate-12">
                    <span className="font-mono">{u.unit_code}</span>
                    <span className="text-kit-slate-11">
                      {" · "}{UNIT_STATUS_WORD[u.status] ?? u.status}
                      {u.status === "reserved" && u.reserved_ref ? ` · ${u.reserved_ref}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ),
        order: l.qty,
        received: l.received_qty,
        damaged: anyDamaged ? (l.damaged_qty ?? 0) : null,
        wrong: anyWrong ? (l.wrong_item_qty ?? 0) : null,
        pending: poLineReportable(l),
      },
    };
  });

  const warehouseTab = (
    <div className="flex flex-col gap-3 p-3" data-testid="task-warehouse">
      {!sentForCurrent ? (
        <p className="text-meta text-kit-slate-11" data-testid="task-receiving-not-sent">
          This PO is not recorded as sent, and it can still be received.
        </p>
      ) : null}
      <DocumentTable label={`Items · ${po.id}`} columns={columns} rows={rows} />
      {pending > 0 && shortDelivered ? (
        /* The rest of a short delivery is PO Duty's balance call (storyboard
           25d): offering `Receive` again here would invite a second receipt. */
        <p className="text-body text-kit-slate-11" data-testid="task-receive-balance">
          The {pending} still due {pending === 1 ? "is" : "are"} followed up by PO Duty: Ask {supplierName} for the balance delivery date.
        </p>
      ) : pending > 0 ? (
        dutyKnown && !dutyAllowed ? (
          <p className="text-label text-kit-slate-9" data-testid="task-receive-refusal">
            Only Operation staff may save a receiving.
          </p>
        ) : (
          <div className="flex justify-end">
            <Button variant="primary" onClick={receive} disabled={!dutyKnown} data-testid="task-receive">
              Receive
            </Button>
          </div>
        )
      ) : (
        <p className="text-body text-kit-slate-11" data-testid="task-receive-nothing">Nothing left to receive on this PO.</p>
      )}
    </div>
  );

  const info: CardFact[] = [
    { key: "supplier", label: "Supplier", value: supplierName },
    { key: "deliver", label: "Supplier Deliver To", value: deliverTo || "Not recorded" },
    { key: "date", label: "PO Delivery Date", value: poDate ? fmtDate(poDate) : "No date" },
    { key: "pending", label: "Pending Delivery Qty", value: String(pending) },
  ];

  return (
    <div className="p-3" data-testid="task-panel-warehouse">
      <CompactModuleCard
        name={supplierName}
        reference={[
          `${po.id}-V${po.version ?? 1}`,
          submitted ? "arrival report submitted" : poDate ? `PO Delivery Date ${fmtDate(poDate)}` : null,
        ].filter(Boolean).join(" · ")}
        referenceStatus={missed ? "Missed" : undefined}
        openLabel={`Open ${po.id}`}
        onOpen={() => navigate(`/operation/procurement?po=${encodeURIComponent(po.id)}`)}
        closeLabel="Close panel"
        onClose={host.close}
        modulesLabel="Warehouse"
        initialModule="warehouse"
        modules={[
          { key: "info", label: "Info", summary: info, communication: null },
          { key: "warehouse", label: "Warehouse", communication: null, content: warehouseTab },
          ...(orderIds.length
            ? [{ key: "sales", label: "Sales Order", communication: null, content: <EmbeddedSalesOrders orderIds={orderIds} /> }]
            : []),
        ]}
      />
    </div>
  );
}
