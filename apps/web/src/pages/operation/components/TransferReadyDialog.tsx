import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useTransferReady,
  useOperationWarehouse,
  type operationOrderDetailLine,
  type operationOrderDetailOrder,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";
import { AlertTriangle } from "lucide-react";

/**
 * TransferReadyDialog — Pipeline v2 (Phase 4 C3) manual stock-on-hand transfer.
 *
 * Surfaces from the `in_production` ActionBar when operation realises the
 * stock is already on the floor (e.g. located outside the tracked PO flow)
 * and wants to push the order straight to `ready_to_dispatch` without going
 * through the Procurement receive path.
 *
 * Wraps `useTransferReady` → POST /api/operation/orders/:id/transfer-ready,
 * which calls RPC `operation_warehouse_pick`. That RPC's source-stage guard
 * widens to IN ('confirmed', 'in_production') AND requires a non-NULL
 * warehouse — see `transferReadyInputSchema` (warehouseId required).
 *
 * Pre-flight: client-side shortage check at the chosen warehouse. If any
 * line is short, the RPC will reject with `insufficient_stock_for_reserve`,
 * so we block submit and tell the user to use Issue POs instead.
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

export default function TransferReadyDialog({
  order,
  lines,
  onClose,
}: Props) {
  const warehousesQ = useOperationWarehouse();
  const allWarehouses = warehousesQ.data?.warehouses ?? [];
  const byWarehouse = warehousesQ.data?.byWarehouse ?? {};

  // Default to the order's pre-assigned warehouse if it has one (RPC will
  // accept that), otherwise the first available warehouse.
  const initialWh = order.warehouse_id ?? "";
  const [warehouseId, setWarehouseId] = useState<string>(initialWh);
  useEffect(() => {
    if (!warehouseId && allWarehouses.length > 0) {
      setWarehouseId(allWarehouses[0].id);
    }
  }, [warehouseId, allWarehouses]);

  const transfer = useTransferReady(order.id);

  // Pre-flight: at the selected warehouse, are all order lines covered by
  // available (qty - reserved) stock? If any line is short, RPC will fail —
  // so we treat this as a hard gate (vs ConfirmProceed which routes by it).
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

  const hasShortages = (preflight?.shortages.length ?? 0) > 0;
  const valid =
    !!warehouseId && !transfer.isPending && !hasShortages;

  async function submit() {
    if (!valid) return;
    try {
      await transfer.mutateAsync({ warehouseId });
      toast.success(`#${order.so} stock reserved · ready to dispatch`);
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = readErrorBody(e);
        if (body.code === "warehouse_required") {
          toast.error("Pick a warehouse first");
        } else if (body.code === "wrong_stage") {
          toast.error("Order has already been moved — refresh and retry");
        } else if (body.code === "insufficient_stock_for_reserve") {
          // Race-condition: stock changed between pre-flight and submit.
          toast.error(
            "Stock changed under us — re-check and use Issue POs instead",
          );
        } else {
          toast.error(e.message || "Transfer to ready failed");
        }
      } else {
        toast.error(
          e instanceof Error ? e.message : "Transfer to ready failed",
        );
      }
    }
  }

  const selectedWh = allWarehouses.find((w) => w.id === warehouseId);

  return (
    <Modal title={`Transfer to ready · #${order.so}`} onClose={onClose}>
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        Use this when stock is already on-hand (not via a tracked PO receipt).
        We&rsquo;ll reserve stock at the chosen warehouse and flip the order to{" "}
        <strong>Ready to dispatch</strong>. If any line is short, the RPC will
        reject — issue POs instead.
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
          data-testid="transfer-ready-preflight"
          className={`text-[12px] px-3 py-2.5 rounded-[4px] mb-3.5 font-body ${
            preflight.sufficient
              ? "text-success border border-success/30 bg-success/5"
              : "text-warning border border-warning/30 bg-warning/5"
          }`}
        >
          {preflight.sufficient ? (
            <>
              <strong>Stock sufficient</strong> — order will move to{" "}
              <strong>Ready to dispatch</strong> and reserve stock.
            </>
          ) : (
            <>
              <strong><AlertTriangle size={13} strokeWidth={2} className="inline -mt-px mr-1" />Some lines short</strong> — RPC will reject with{" "}
              <code className="font-mono">insufficient_stock_for_reserve</code>.
              Use <strong>Issue POs</strong> instead.
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
        primary="Transfer to ready"
        primaryDisabled={!valid || allWarehouses.length === 0}
        primaryPending={transfer.isPending}
      />
    </Modal>
  );
}
