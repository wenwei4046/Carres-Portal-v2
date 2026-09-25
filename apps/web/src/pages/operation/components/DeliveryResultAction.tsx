import { useState } from "react";
import { toast } from "sonner";
import {
  DELIVERY_REASONS,
  unitIdOf,
  type DeliveryAttemptRecordInput,
} from "@carres/shared";
import { useOrderAllocation, useRecordDeliveryAttempt } from "@/lib/queries";
import { Modal, ModalActions } from "./Modal";
import DOAttachModal from "./DOAttachModal";

interface DeliveryResultOrder {
  id: string;
  so: number;
  do_number: string | null;
}

type IncompleteResult = "partial" | "failed";

/**
 * What the operator reads beside the tick box.
 *
 * NEVER the row's database id. Until 0453 this fell back to `unit.id` — a raw
 * UUID — whenever a line had no Unit ID, which is exactly the case for counted
 * goods. Counted goods have no identity, so they are named by their product.
 */
function unitLabel(unit: { unitCode: string | null; lineSku: string }): string {
  const id = unitIdOf(unit);
  return id ? `${id} · ${unit.lineSku}` : unit.lineSku;
}

const LOCATION_OPTIONS: Array<{
  value: NonNullable<DeliveryAttemptRecordInput["whereGoods"]>;
  label: string;
}> = [
  { value: "returned_to_warehouse", label: "Returned to Warehouse" },
  { value: "still_with_logistics", label: "Still with Logistics" },
  { value: "with_customer", label: "With Customer" },
];

/** 0491 — the governed words for a Unit that did not reach the customer. The
 *  immediate inspection hold is retired: a Unit coming back rides the Inbound
 *  arrival the result plans, and the Warehouse's receipt is what checks it. */
const RETURN_ACTION_WORDS: Array<{ value: "back_to_pool" | "inspection_hold"; label: string }> = [
  { value: "inspection_hold", label: "Return to Warehouse for checking" },
  { value: "back_to_pool", label: "Release the reservation" },
];

/**
 * 0491 — an INTERMEDIATE Journey leg records its arrival at the named
 * warehouse: no Unit moves, the customer leg still owes its own result.
 */
function LegArrivalForm({
  orderId,
  leg,
  destination,
  onClose,
}: {
  orderId: string;
  leg: number;
  destination: string | null;
  onClose: () => void;
}) {
  const record = useRecordDeliveryAttempt(orderId);
  const [note, setNote] = useState("");
  return (
    <Modal title={`Arrived${destination ? ` at ${destination}` : ""}`} onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-meta text-base-600">
          This records that the goods reached the named warehouse. The customer has not received them — the next leg carries its own result.
        </p>
        <label className="grid gap-1 text-meta font-medium text-base-700">
          Note
          <textarea
            aria-label="Note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            className="rounded-md border border-base-300 bg-white px-2 py-1 text-body font-normal"
          />
        </label>
      </div>
      <ModalActions
        onCancel={onClose}
        onPrimary={() =>
          record.mutate(
            { result: "delivered", leg, note: note.trim() || null, deliveredItemIds: [], returned: [] },
            {
              onSuccess: () => {
                toast.success("Arrival recorded");
                onClose();
              },
              onError: (error) => toast.error(error.message),
            },
          )
        }
        primary="Record arrival"
        primaryDisabled={record.isPending}
        primaryPending={record.isPending}
      />
    </Modal>
  );
}

function DeliveryAttemptForm({
  orderId,
  result,
  leg = 0,
  onClose,
}: {
  orderId: string;
  result: IncompleteResult;
  leg?: number;
  onClose: () => void;
}) {
  const allocationQ = useOrderAllocation(orderId, true);
  const record = useRecordDeliveryAttempt(orderId);
  const [reasonKey, setReasonKey] = useState("");
  const [whereGoods, setWhereGoods] = useState("");
  const [note, setNote] = useState("");
  const [delivered, setDelivered] = useState<Set<string>>(new Set());
  const [returns, setReturns] = useState<Record<string, "" | "back_to_pool" | "inspection_hold">>({});

  const allocation = allocationQ.data?.allocation;
  const units = [
    ...(allocation?.lines ?? []).flatMap((line) =>
      line.reservedUnits.map((unit) => ({ ...unit, lineSku: line.sku })),
    ),
    ...(allocation?.unmatchedUnits ?? [])
      .filter((unit) => unit.status === "reserved")
      .map((unit) => ({
        ...unit,
        lineSku: unit.sku,
      })),
  ];
  const remaining = units.filter((unit) => !delivered.has(unit.id));
  const returnActionsComplete =
    whereGoods !== "returned_to_warehouse" ||
    remaining.every((unit) => Boolean(returns[unit.id]));
  const valid =
    Boolean(reasonKey) &&
    Boolean(whereGoods) &&
    note.trim().length > 0 &&
    (result === "failed" || delivered.size > 0) &&
    returnActionsComplete &&
    !allocationQ.isLoading &&
    !allocationQ.isError &&
    !record.isPending;

  const submit = () => {
    if (!valid) return;
    record.mutate(
      {
        result,
        reasonKey: reasonKey as DeliveryAttemptRecordInput["reasonKey"],
        whereGoods: whereGoods as DeliveryAttemptRecordInput["whereGoods"],
        note: note.trim(),
        leg,
        deliveredItemIds: result === "partial" ? [...delivered] : [],
        returned:
          whereGoods === "returned_to_warehouse"
            ? remaining.map((unit) => ({
                itemId: unit.id,
                action: returns[unit.id] as "back_to_pool" | "inspection_hold",
              }))
            : [],
      },
      {
        onSuccess: () => {
          toast.success(
            result === "partial"
              ? "Partially Delivered recorded"
              : "Failed Delivery recorded",
          );
          onClose();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const title = result === "partial" ? "Partially Delivered" : "Failed Delivery";
  return (
    <Modal title={title} onClose={onClose}>
      <div className="grid gap-3">
        {allocationQ.isError ? (
          <div className="flex items-center justify-between gap-3 text-meta text-danger">
            <span>Units could not be loaded</span>
            <button
              type="button"
              className="rounded-control border border-base-300 bg-white px-2 py-1 font-medium text-base-700 hover:bg-hovertint"
              onClick={() => void allocationQ.refetch()}
            >
              Try again
            </button>
          </div>
        ) : null}
        {result === "partial" ? (
          <fieldset className="grid gap-2">
            <legend className="text-meta font-semibold text-base-900">
              Delivered Units
            </legend>
            {allocationQ.isLoading ? (
              <p className="text-meta text-base-500">Loading Units…</p>
            ) : units.length === 0 ? (
              <p className="text-meta text-danger">
                No reserved Units are available to record as delivered.
              </p>
            ) : (
              units.map((unit) => (
                <label key={unit.id} className="flex items-center gap-2 text-body">
                  <input
                    type="checkbox"
                    checked={delivered.has(unit.id)}
                    onChange={() =>
                      setDelivered((current) => {
                        const next = new Set(current);
                        if (next.has(unit.id)) next.delete(unit.id);
                        else next.add(unit.id);
                        return next;
                      })
                    }
                  />
                  {unitLabel(unit)}
                </label>
              ))
            )}
          </fieldset>
        ) : null}

        <label className="grid gap-1 text-meta font-medium text-base-700">
          Delivery Result reason
          <select
            aria-label="Delivery Result reason"
            value={reasonKey}
            onChange={(event) => setReasonKey(event.target.value)}
            className="h-9 rounded-md border border-base-300 bg-white px-2 text-body font-normal"
          >
            <option value="">Select reason</option>
            {DELIVERY_REASONS.map((reason) => (
              <option key={reason.key} value={reason.key}>{reason.label}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-meta font-medium text-base-700">
          Goods location
          <select
            aria-label="Goods location"
            value={whereGoods}
            onChange={(event) => setWhereGoods(event.target.value)}
            className="h-9 rounded-md border border-base-300 bg-white px-2 text-body font-normal"
          >
            <option value="">Select goods location</option>
            {LOCATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {whereGoods === "returned_to_warehouse" && remaining.length > 0 ? (
          <fieldset className="grid gap-2">
            <legend className="text-meta font-semibold text-base-900">
              Returned Unit action
            </legend>
            {remaining.map((unit) => (
              <label key={unit.id} className="grid gap-1 text-meta text-base-700">
                {unitLabel(unit)}
                <select
                  value={returns[unit.id] ?? ""}
                  onChange={(event) =>
                    setReturns((current) => ({
                      ...current,
                      [unit.id]: event.target.value as "" | "back_to_pool" | "inspection_hold",
                    }))
                  }
                  className="h-9 rounded-md border border-base-300 bg-white px-2 text-body"
                >
                  <option value="">Select action</option>
                  {RETURN_ACTION_WORDS.map((w) => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        ) : null}

        <label className="grid gap-1 text-meta font-medium text-base-700">
          Explanation
          <textarea
            aria-label="Explanation"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="rounded-md border border-base-300 px-2 py-1.5 text-body font-normal"
          />
        </label>
      </div>
      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={result === "partial" ? "Record Partially Delivered" : "Record Failed Delivery"}
        primaryDisabled={!valid}
        primaryPending={record.isPending}
      />
    </Modal>
  );
}

/**
 * The DO object's one Delivery-owned completion door. It chooses the factual
 * result first; each result then walks the existing governed writer for that
 * fact. No Sales, Stock or Warehouse field is edited here.
 */
export default function DeliveryResultAction({
  order,
  lines,
  leg = 0,
  lastLeg = 0,
  legDestination = null,
}: {
  order: DeliveryResultOrder;
  lines: Array<{ sku: string; qty: number }>;
  /** 0491 — the Delivery scope this result belongs to (0 = the whole order). */
  leg?: number;
  /** The Journey's last leg; a leg before it records an ARRIVAL, not a delivery. */
  lastLeg?: number;
  /** The intermediate leg's named destination (`JB transit`), for the words. */
  legDestination?: string | null;
}) {
  const [chooserOpen, setChooserOpen] = useState(false);
  const [deliveredOpen, setDeliveredOpen] = useState(false);
  const [incompleteResult, setIncompleteResult] = useState<IncompleteResult | null>(null);
  const intermediateLeg = leg > 0 && leg < lastLeg;

  return (
    <>
      <button
        type="button"
        data-testid="do-result-primary-action"
        className="btn-primary inline-flex h-7 items-center px-2.5 text-meta"
        onClick={() => setChooserOpen(true)}
      >
        Record Delivery Result
      </button>
      {chooserOpen ? (
        <Modal title="Record Delivery Result" onClose={() => setChooserOpen(false)}>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              className="rounded-md border border-base-300 bg-white px-3 py-3 text-body font-medium text-base-900 hover:bg-hovertint"
              onClick={() => {
                setChooserOpen(false);
                setDeliveredOpen(true);
              }}
              data-testid="do-result-delivered"
            >
              {intermediateLeg ? "Arrived" : "Delivered"}
            </button>
            <button
              type="button"
              className="rounded-md border border-base-300 bg-white px-3 py-3 text-body font-medium text-base-900 hover:bg-hovertint"
              onClick={() => {
                setChooserOpen(false);
                setIncompleteResult("partial");
              }}
            >
              Partially Delivered
            </button>
            <button
              type="button"
              className="rounded-md border border-base-300 bg-white px-3 py-3 text-body font-medium text-base-900 hover:bg-hovertint"
              onClick={() => {
                setChooserOpen(false);
                setIncompleteResult("failed");
              }}
            >
              Failed
            </button>
          </div>
        </Modal>
      ) : null}
      {deliveredOpen && intermediateLeg ? (
        <LegArrivalForm
          orderId={order.id}
          leg={leg}
          destination={legDestination}
          onClose={() => setDeliveredOpen(false)}
        />
      ) : deliveredOpen ? (
        <DOAttachModal
          order={order}
          warehouse={null}
          lines={lines}
          onClose={() => setDeliveredOpen(false)}
        />
      ) : null}
      {incompleteResult ? (
        <DeliveryAttemptForm
          orderId={order.id}
          result={incompleteResult}
          leg={leg}
          onClose={() => setIncompleteResult(null)}
        />
      ) : null}
    </>
  );
}
