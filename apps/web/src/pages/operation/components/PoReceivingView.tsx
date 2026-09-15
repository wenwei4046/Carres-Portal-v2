import { useState } from "react";
import type { operationPoListRow, SupplierRow } from "@/lib/queries";
import ReceivingWorkspace from "./ReceivingWorkspace";

/**
 * ONE PO's receiving — the pre-start object and the active Session.
 *
 * This lived inside `OperationReceiving.tsx` until 2026-09-15, which is why
 * Inbound could only ever LINK AWAY to Receiving: the work surface was not
 * reachable from anywhere else. Extracting it changes no behaviour and adds
 * no second receiving engine — `ReceivingWorkspace` remains the one component
 * and `/api/operation/pos/:id/office-receive` remains the one write path.
 * Inbound and Receiving now host the SAME view; only the way back differs.
 *
 * It stays FULL-WIDTH and ONE SCROLL (UI MASTER §4.1 — a Goods Receipt never
 * splits). A side panel was never an option for it.
 */
export default function PoReceivingView({
  poId,
  products = [],
  pos,
  suppliers,
  warehouses,
  dutyAllowed,
  dutyKnown = true,
  /** Where `‹ {backLabel}` returns to — the page that opened this. */
  backLabel,
  onBack,
  onOpenSession,
  onPosted,
  testId = "receiving-po-view",
}: {
  poId: string;
  products?: Array<{sku: string | null; name: string | null; category?: string | null}>;
  pos: operationPoListRow[];
  suppliers: Map<string, SupplierRow>;
  warehouses: Array<{ id: string; name: string }>;
  /** The resolved GRN authority's answer — passed in, never computed here. */
  dutyAllowed: boolean;
  /** False while the resolver is still answering. */
  dutyKnown?: boolean;
  backLabel: string;
  onBack: () => void;
  onOpenSession?: (id: string) => void;
  /** Fired after a successful post, so the host can refresh its own list. */
  onPosted?: (id: string) => void;
  testId?: string;
}) {
  const [receiving, setReceiving] = useState(false);
  const po = pos.find((p) => p.id === poId) ?? null;
  if (!po) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white"
        data-testid="receiving-po-missing"
      >
        <p className="text-body text-base-700">
          This purchase order could not be opened
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-body text-kit-blue-11 hover:underline"
        >
          ‹ {backLabel}
        </button>
      </div>
    );
  }
  const supplier = suppliers.get(po.supplier_id);
  const warehouseName =
    warehouses.find((w) => w.id === po.warehouse_id)?.name ?? "";
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white"
      data-testid={testId}
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={onBack}
          data-testid="receiving-po-back"
          className="text-body text-kit-blue-11 hover:underline"
        >
          ‹ {backLabel}
        </button>
      </div>
      <div className="w-full">
        <ReceivingWorkspace
          po={po}
          products={products}
          supplier={supplier}
          warehouseName={warehouseName}
          warehouses={warehouses}
          dutyAllowed={dutyAllowed}
          dutyKnown={dutyKnown}
          receiving={receiving}
          onReceiving={setReceiving}
          onPosted={(id) => {
            onPosted?.(id);
            onOpenSession?.(id);
          }}
        />
      </div>
    </div>
  );
}
