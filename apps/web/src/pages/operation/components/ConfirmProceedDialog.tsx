import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useConfirmProceedRequest,
  useOperationWarehouse,
  type operationOrderDetailLine,
  type operationOrderDetailOrder,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * ConfirmProceedDialog — Pipeline v2 (Phase 4 C2/C3) triage entry point.
 *
 * Surfaces when the order is in stage `proceed_request` (dealer pushed it,
 * operation needs to commit). The picker chooses the source warehouse. The
 * RPC (`operation_confirm_proceed_request`) decides:
 *   - If all lines covered at the chosen warehouse → reserve stock + flip to
 *     `ready_to_dispatch` (atomic).
 *   - If any line short → flip to `awaiting_operation_action`, no reserve. The user
 *     must `Issue POs` next.
 *
 * The dialog computes a client-side pre-flight hint from the order's lines
 * vs. available stock so the user knows which path the RPC is going to take
 * BEFORE submitting. Treat this as advisory: stock can shift between the
 * pre-flight read and the submit (race), in which case the RPC returns a
 * 422 with code `insufficient_stock_for_reserve`.
 *
 * Wires to `POST /api/operation/orders/:id/confirm-proceed`.
 */
interface Props {
  order: operationOrderDetailOrder;
  lines: operationOrderDetailLine[];
  onClose: () => void;
}

interface ApiErrorBody {
  code?: string;
  hint?: string;
  message?: string;
}

function readErrorBody(err: ApiError): ApiErrorBody {
  return (err.body ?? {}) as ApiErrorBody;
}

export default function ConfirmProceedDialog({
  order,
  lines,
  onClose,
}: Props) {
  const warehousesQ = useOperationWarehouse();
  const allWarehouses = warehousesQ.data?.warehouses ?? [];
  const byWarehouse = warehousesQ.data?.byWarehouse ?? {};

  // Default to the order's pre-assigned warehouse if it has one (C2 RPC will
  // accept NULL in that case but we prefer to be explicit), otherwise the
  // first available warehouse.
  const initialWh = order.warehouse_id ?? "";
  const [warehouseId, setWarehouseId] = useState<string>(initialWh);
  useEffect(() => {
    if (!warehouseId && allWarehouses.length > 0) {
      setWarehouseId(allWarehouses[0].id);
    }
  }, [warehouseId, allWarehouses]);

  const confirm = useConfirmProceedRequest(order.id);

  // Pre-flight: at the selected warehouse, are all order lines covered by
  // available (qty - reserved) stock? Returns the array of short lines so we
  // can show a richer hint than just "yes/no".
  const preflight = useMemo(() => {
    if (!warehouseId) return null;
    const stockAtWh = byWarehouse[warehouseId] ?? [];
    const availableBySku: Record<string, number> = {};
    for (const e of stockAtWh) {
      availableBySku[e.sku] = Math.max(0, Number(e.qty) - Number(e.reserved));
    }
    const shortages: { sku: string; need: number; have: number }[] = [];
    for (const l of lines) {
      const have = availableBySku[l.sku] ?? 0;
      if (have < l.qty) {
        shortages.push({ sku: l.sku, need: l.qty, have });
      }
    }
    return { shortages, sufficient: shortages.length === 0 };
  }, [warehouseId, byWarehouse, lines]);

  const valid = !!warehouseId && !confirm.isPending;

  async function submit() {
    if (!valid) return;
    try {
      await confirm.mutateAsync({ warehouseId });
      toast.success(
        preflight?.sufficient
          ? `#${order.so} stock reserved · ready to dispatch`
          : `#${order.so} triaged · awaiting stock`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = readErrorBody(e);
        if (body.code === "warehouse_required") {
          toast.error("Pick a warehouse first");
        } else if (body.code === "wrong_stage") {
          toast.error("Order has already been triaged — refresh and retry");
        } else if (body.code === "insufficient_stock_for_reserve") {
          toast.error("Stock changed under us — re-check and retry");
        } else {
          toast.error(e.message || "Confirm proceed failed");
        }
      } else {
        toast.error(e instanceof Error ? e.message : "Confirm proceed failed");
      }
    }
  }

  const selectedWh = allWarehouses.find((w) => w.id === warehouseId);

  return (
    <Modal title={`Confirm proceed · #${order.so}`} onClose={onClose}>
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        Pick a source warehouse. The system will reserve stock if all lines are
        covered, otherwise the order moves to <strong>Awaiting operation Action</strong>{" "}
        and you&rsquo;ll need to issue POs next.
      </div>

      <div
        className="card mb-3.5 px-3.5 py-2.5"
        style={{ background: "var(--base-50)" }}
      >
        <div className="label mb-1.5">Order lines</div>
        <div className="font-mono text-[11px] text-base-600">
          {lines.map((l) => `${l.sku} ×${l.qty}`).join(" · ") || "—"}
        </div>
      </div>

      <div className="label mb-1.5">Source warehouse *</div>
      {warehousesQ.isLoading ? (
        <div className="text-[12px] text-base-500 mb-3.5">
          Loading warehouses…
        </div>
      ) : warehousesQ.isError ? (
        <div className="text-[12px] text-destructive mb-3.5">
          Couldn&rsquo;t load warehouses — try again later.
        </div>
      ) : allWarehouses.length === 0 ? (
        <div className="text-[12px] text-warning mb-3.5">
          No warehouses on file.
        </div>
      ) : (
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          aria-label="Source warehouse"
          className={`${INPUT_CLS} mb-3.5`}
        >
          {allWarehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}

      {selectedWh && (
        <div
          className="text-[12px] text-base-600 px-3 py-2.5 rounded-[4px] mb-3.5 font-body"
          style={{ background: "var(--base-50)" }}
        >
          <div>
            <strong>{selectedWh.name}</strong>
          </div>
          {selectedWh.address && (
            <div className="font-mono text-[11px] mt-1">
              {selectedWh.address}
            </div>
          )}
        </div>
      )}

      {preflight && (
        <div
          data-testid="confirm-proceed-preflight"
          className={`text-[12px] px-3 py-2.5 rounded-[4px] mb-3.5 font-body ${
            preflight.sufficient
              ? "text-success border border-success/30 bg-success/5"
              : "text-warning border border-warning/30 bg-warning/5"
          }`}
        >
          {preflight.sufficient ? (
            <>
              <strong>Stock sufficient</strong> — order will move directly to{" "}
              <strong>Ready to dispatch</strong> and reserve stock.
            </>
          ) : (
            <>
              <strong>Some lines short</strong> — order will move to{" "}
              <strong>Awaiting operation action</strong>; you&rsquo;ll need to issue POs
              next.
              <div className="font-mono text-[11px] mt-1">
                {preflight.shortages
                  .map((s) => `${s.sku}: need ${s.need}, have ${s.have}`)
                  .join(" · ")}
              </div>
            </>
          )}
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Confirm proceed"
        primaryDisabled={!valid || allWarehouses.length === 0}
        primaryPending={confirm.isPending}
      />
    </Modal>
  );
}
