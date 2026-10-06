/**
 * RECEIVING, HOSTED BY WORKSPACE (§5.10 ruling, Jess 2026-09-27 "workspace is
 * stay here to complete all job"; 2026-09-28 "why jump to others page?").
 *
 * A Goods Receipt is full width and one scroll (UI MASTER §4.1 — it never
 * splits), so it cannot sit in a Mission card. Workspace hosts Receiving's
 * OWN view across its body exactly as Inbound does (`PoReceivingView` for a
 * PO with nothing counted yet, `ReceivingRecord` for a submitted count):
 * `‹ Workspace` returns to the same order. No second receiving engine — the
 * write stays `/api/operation/pos/:id/office-receive` (law C).
 */
import { useMemo } from "react";
import {
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
  useReceivingDuty,
  type SupplierRow,
} from "@/lib/queries";
import PoReceivingView from "../components/PoReceivingView";
import ReceivingRecord from "../components/ReceivingRecord";

export type WorkReceiveTarget = { kind: "po" | "session"; id: string };

/** The Work item's own destination names the one Receiving object it opens. */
export function receiveTargetOf(destination: string): WorkReceiveTarget | null {
  const query = destination.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  if (params.get("tab") !== "receiving") return null;
  const session = params.get("session");
  if (session) return { kind: "session", id: session };
  const po = params.get("po");
  return po ? { kind: "po", id: po } : null;
}

export const encodeReceiveTarget = (t: WorkReceiveTarget) => `${t.kind}:${t.id}`;
export function decodeReceiveTarget(value: string | null): WorkReceiveTarget | null {
  const m = value?.match(/^(po|session):(.+)$/);
  return m ? { kind: m[1] as "po" | "session", id: m[2]! } : null;
}

export default function WorkReceivingView({ target, onBack }: { target: WorkReceiveTarget; onBack: () => void }) {
  const posQ = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const dutyQ = useReceivingDuty();
  const suppliers = useMemo(() => (suppliersQ.data?.suppliers ?? []) as SupplierRow[], [suppliersQ.data]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  if (target.kind === "session") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white" data-testid="work-receiving">
        <ReceivingRecord sessionId={target.id} onBack={onBack} />
      </div>
    );
  }
  if (posQ.isLoading) return <p role="status" className="p-4 text-body">Loading…</p>;
  return (
    <PoReceivingView
      poId={target.id}
      pos={posQ.data?.pos ?? []}
      suppliers={supplierById}
      warehouses={warehouseQ.data?.warehouses ?? []}
      dutyAllowed={dutyQ.data?.allowed ?? false}
      dutyKnown={!dutyQ.isLoading}
      backLabel="Workspace"
      onBack={onBack}
      testId="work-receiving"
    />
  );
}

/** The button a Receiving act wears in Workspace: COPY "Goods to receive"
 *  `Start receiving` before anything is counted; `Check in` for a submitted
 *  count waiting to be posted. Null for any other act. */
export function receiveButtonOf(destination: string): { label: string; target: WorkReceiveTarget } | null {
  const target = receiveTargetOf(destination);
  return target ? { label: target.kind === "po" ? "Start receiving" : "Check in", target } : null;
}
