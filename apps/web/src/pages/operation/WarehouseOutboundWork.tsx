// design-standard: not-a-list-page — dated Warehouse work surface (Outbound
// exact-Unit check/pack/handover, Stock MASTER §12.6), not a Register list.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight as ChevronRightSmall } from "lucide-react";
import {
  DELIVERY_PHOTO_MAX_BYTES,
  DELIVERY_PHOTO_MIMES,
  warehouseEmptyDaySentence,
  warehouseUnitPendingReason,
  type DeliveryWarehouseScheduleEvent,
  type WarehouseOutboundCard,
  type WarehousePrepFact,
} from "@carres/shared";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { apiFetch, ApiError } from "@/lib/api";
import {
  useRecordHandoverEvent,
  useRecordOutboundPrep,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import ModuleHeader from "./components/ModuleHeader";
import { Modal, ModalActions } from "./components/Modal";

/**
 * WAREHOUSE — Outbound: the dated exact-Unit work page (card §7).
 *
 * Not a document, not a second DO, not an inventory-event register. The
 * source DO owns why the movement exists; this page tells the operator what
 * must physically be scanned, checked, packed and handed over today.
 *
 * The visible action order is governed: ① scan every required Unit ② record
 * check and pack for the scanned IDs ③ read the exact receiving Partner and
 * the consequence ④ record the physical handover with the actual receiver
 * and required evidence ⑤ every omitted/refused Unit stays under its
 * original date with its existing holder. No generic `Mark done` exists —
 * the accepted physical fact completes the work.
 */
export default function WarehouseOutboundWork({
  cards,
  date,
  selectedDo,
  isLoading,
  onSelectDo,
}: {
  cards: WarehouseOutboundCard[];
  date: string;
  selectedDo: string | null;
  isLoading: boolean;
  onSelectDo: (doNumber: string | null) => void;
}) {
  const [params] = useSearchParams();
  const selectedCard = cards.find((c) => c.doNumber === selectedDo) ?? null;
  /* A deep link may carry `do` without `date` — the work date is the card's
     own date, never a guess. */
  const workDate = selectedCard?.eventDate ?? date;
  const dayCards = useMemo(
    () => cards.filter((c) => c.eventDate === workDate),
    [cards, workDate],
  );

  const backParams = new URLSearchParams(params);
  backParams.set("tab", "warehouse-dashboard");
  backParams.delete("do");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="warehouse-outbound">
      <ModuleHeader
        testId="warehouse-outbound-header"
        word="Outbound"
        docTitle="Outbound · Warehouse — Carres"
        destinationHeader
      />
      <div className="flex items-center gap-3 border-b border-kit-slate-5 bg-white px-3 py-1.5">
        <Link
          to={`/operation?${backParams.toString()}`}
          className="text-meta text-base-600 underline-offset-2 hover:underline"
          data-testid="wo-back-dashboard"
        >
          ← Dashboard
        </Link>
        <span className="text-[13px] font-medium text-base-800" data-testid="wo-date">
          {fmtDate(workDate)}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <p className="text-[13px] text-base-500">Loading…</p>
        ) : dayCards.length === 0 ? (
          <p className="text-[13px] text-base-500" data-testid={`wo-empty-${workDate}`}>
            {warehouseEmptyDaySentence(fmtDate(workDate))}
          </p>
        ) : (
          <div className="max-w-6xl space-y-2">
            {dayCards.map((card) => (
              <OutboundSourceRow
                key={card.doNumber}
                card={card}
                expanded={card.doNumber === (selectedCard?.doNumber ?? dayCards[0]?.doNumber)}
                onToggle={() =>
                  onSelectDo(card.doNumber === selectedCard?.doNumber ? null : card.doNumber)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One work row = one source document scope, with the approved fields:
 *  Required handover · DO No · SO No · SO date · Journey/leg · From · To ·
 *  Logistics partner · Units required · Handed over · Not handed over ·
 *  Warehouse operator · Delivery person · Evidence · Work. Expanding shows
 *  the exact Units. The formal DO is LINKED, never copied into this page. */
function OutboundSourceRow({
  card,
  expanded,
  onToggle,
}: {
  card: WarehouseOutboundCard;
  expanded: boolean;
  onToggle: () => void;
}) {
  const handed = card.units.filter((u) => u.unitHandedOverAt);
  const operator = handed.map((u) => u.unitWarehouseOperator).find(Boolean) ?? null;
  const receiver = handed.map((u) => u.unitDeliveryPerson).find(Boolean) ?? null;
  const work =
    card.notHandedOver === 0
      ? `Handed over ${card.handedOver} of ${card.unitsRequired} Units`
      : `Check, pack and hand over ${card.notHandedOver} Unit${card.notHandedOver === 1 ? "" : "s"}`;

  return (
    <div className="rounded border border-kit-slate-5 bg-white" data-testid={`wo-row-${card.doNumber}`}>
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-hovertint"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`wo-row-toggle-${card.doNumber}`}
      >
        {expanded ? (
          <ChevronDown size={16} className="mt-0.5 shrink-0 text-base-500" />
        ) : (
          <ChevronRightSmall size={16} className="mt-0.5 shrink-0 text-base-500" />
        )}
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-0.5 text-[13px] md:grid-cols-4">
          <Field label="Required handover" value={fmtDate(card.eventDate)} />
          <Field
            label="DO No"
            value={
              <Link
                to={card.deliveryOrderHref}
                className="font-mono text-base-800 underline-offset-2 hover:underline"
                onClick={(e) => e.stopPropagation()}
                data-testid={`wo-do-link-${card.doNumber}`}
              >
                {card.doNumber}
              </Link>
            }
          />
          <Field
            label="SO No"
            value={
              <Link
                to={card.sourceHref}
                className="font-mono text-base-800 underline-offset-2 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {card.source}
              </Link>
            }
          />
          <Field label="SO date" value={card.soDate ? fmtDate(card.soDate) : "—"} />
          <Field label="Journey/leg" value={card.leg === 0 ? "Whole order" : `Leg ${card.leg}`} />
          <Field label="From" value={card.fromLocation} />
          <Field label="To" value={card.toCustomer} />
          <Field label="Logistics partner" value={card.logisticsPartner} />
          <Field label="Units required" value={String(card.unitsRequired)} />
          <Field label="Handed over" value={String(card.handedOver)} />
          <Field label="Not handed over" value={String(card.notHandedOver)} />
          <Field label="Warehouse operator" value={operator ?? "—"} />
          <Field label="Delivery person" value={receiver ?? "—"} />
          <Field
            label="Evidence"
            value={
              handed.length === 0 ? "—" : card.evidenceNotSubmitted ? "Not submitted" : "Submitted"
            }
          />
          <Field label="Work" value={work} />
        </div>
      </button>
      {expanded && <OutboundUnitWork card={card} />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-label uppercase tracking-wide text-base-400">{label}</div>
      <div className="truncate text-base-800">{value}</div>
    </div>
  );
}

const ALLOWED_MIMES = DELIVERY_PHOTO_MIMES;
const MAX_SIZE = DELIVERY_PHOTO_MAX_BYTES;

/** The exact Units of one DO scope, and the governed acts on them. */
export function OutboundUnitWork({ card }: { card: WarehouseOutboundCard }) {
  const doId = card.deliveryOrderId ?? "";
  const prep = useRecordOutboundPrep(doId);
  const [scanValue, setScanValue] = useState("");
  const [handoverOpen, setHandoverOpen] = useState(false);

  const remaining = card.units.filter((u) => !u.unitHandedOverAt);
  const scannedNotChecked = remaining.filter((u) => u.unitScannedAt && !u.unitCheckedAt);
  const checkedNotPacked = remaining.filter((u) => u.unitCheckedAt && !u.unitPackedAt);
  const readyUnits = remaining.filter(
    (u) => u.unitScannedAt && u.unitCheckedAt && u.unitPackedAt,
  );

  function recordPrep(fact: WarehousePrepFact, unitCodes: string[], done: string) {
    if (!doId) {
      toast.error("This delivery order cannot be addressed — reload the page.");
      return;
    }
    prep.mutate(
      { fact, unitCodes },
      {
        onSuccess: () => toast.success(done),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function scanUnit() {
    const code = scanValue.trim();
    if (!code) return;
    const match = card.units.find(
      (u) => u.unitId.toLowerCase() === code.toLowerCase(),
    );
    if (!match) {
      toast.error(`${code} is not a Unit this delivery order requires.`);
      return;
    }
    if (match.unitHandedOverAt) {
      toast.error(`${match.unitId} was already handed over.`);
      return;
    }
    recordPrep("scanned", [match.unitId], `${match.unitId} scanned`);
    setScanValue("");
  }

  return (
    <div className="border-t border-kit-slate-5 px-3 py-2" data-testid={`wo-units-${card.doNumber}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-meta text-base-600">
          Scan Unit ID
          <input
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                scanUnit();
              }
            }}
            className="h-7 w-44 rounded border border-kit-slate-5 px-2 font-mono text-[13px]"
            placeholder="U1-000-001"
            data-testid="wo-scan-input"
          />
        </label>
        <button
          type="button"
          className="btn-primary h-7 px-2.5 text-meta"
          onClick={scanUnit}
          disabled={prep.isPending || !scanValue.trim()}
          data-testid="wo-scan-btn"
        >
          Scan
        </button>
        {scannedNotChecked.length > 0 && (
          <button
            type="button"
            className="btn-primary h-7 px-2.5 text-meta"
            onClick={() =>
              recordPrep(
                "checked",
                scannedNotChecked.map((u) => u.unitId),
                `${scannedNotChecked.length} Unit(s) checked`,
              )
            }
            disabled={prep.isPending}
            data-testid="wo-check-btn"
          >
            Record check ({scannedNotChecked.length})
          </button>
        )}
        {checkedNotPacked.length > 0 && (
          <button
            type="button"
            className="btn-primary h-7 px-2.5 text-meta"
            onClick={() =>
              recordPrep(
                "packed",
                checkedNotPacked.map((u) => u.unitId),
                `${checkedNotPacked.length} Unit(s) packed`,
              )
            }
            disabled={prep.isPending}
            data-testid="wo-pack-btn"
          >
            Record pack ({checkedNotPacked.length})
          </button>
        )}
        {readyUnits.length > 0 && (
          <button
            type="button"
            className="btn-hero h-7 px-3 text-meta"
            onClick={() => setHandoverOpen(true)}
            data-testid="wo-record-handover"
          >
            Record handover
          </button>
        )}
      </div>
      {readyUnits.length > 0 && (
        <p className="mb-2 text-label text-base-500" data-testid="wo-receiver-consequence">
          Handing over moves the accepted Units to {card.logisticsPartner}. Name the person who
          actually receives them and attach proof.
        </p>
      )}
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-label uppercase tracking-wide text-base-400">
            <th className="py-1 pr-3 font-medium">Unit ID</th>
            <th className="py-1 pr-3 font-medium">Product</th>
            <th className="py-1 pr-3 font-medium">Reservation</th>
            <th className="py-1 pr-3 font-medium">Scanned</th>
            <th className="py-1 pr-3 font-medium">Checked</th>
            <th className="py-1 pr-3 font-medium">Packed</th>
            <th className="py-1 pr-3 font-medium">Handed over</th>
            <th className="py-1 font-medium">Still to do</th>
          </tr>
        </thead>
        <tbody>
          {card.units.map((u) => (
            <UnitRow key={u.unitId} unit={u} />
          ))}
        </tbody>
      </table>
      {handoverOpen && card.deliveryOrderId && (
        <RecordHandoverModal
          card={card}
          readyUnits={readyUnits}
          onClose={() => setHandoverOpen(false)}
        />
      )}
    </div>
  );
}

function UnitRow({ unit }: { unit: DeliveryWarehouseScheduleEvent }) {
  const reason = warehouseUnitPendingReason(unit);
  const at = (iso: string | null) => (iso ? fmtDate(iso, { time: true }) : "—");
  return (
    <tr className="border-t border-kit-slate-5" data-testid={`wo-unit-${unit.unitId}`}>
      <td className="py-1.5 pr-3 font-mono text-base-800">{unit.unitId}</td>
      <td className="max-w-48 truncate py-1.5 pr-3" title={unit.productName ?? unit.sku ?? undefined}>
        {unit.productName ?? unit.sku ?? "—"}
      </td>
      <td className="py-1.5 pr-3">Reserved for {unit.source}</td>
      <td className="py-1.5 pr-3 text-base-600">{at(unit.unitScannedAt)}</td>
      <td className="py-1.5 pr-3 text-base-600">{at(unit.unitCheckedAt)}</td>
      <td className="py-1.5 pr-3 text-base-600">{at(unit.unitPackedAt)}</td>
      <td className="py-1.5 pr-3 text-base-600">
        {unit.unitHandedOverAt
          ? `${at(unit.unitHandedOverAt)}${unit.unitDeliveryPerson ? ` · ${unit.unitDeliveryPerson}` : ""}`
          : "—"}
      </td>
      <td className="py-1.5 text-base-600" data-testid={`wo-unit-reason-${unit.unitId}`}>
        {reason ?? "Done"}
      </td>
    </tr>
  );
}

/** The evidence-backed handover: pick the packed Units this batch physically
 *  moves, name the ACTUAL receiver, attach proof. A partial batch changes
 *  only the accepted Units — the server enforces every rule again. */
function RecordHandoverModal({
  card,
  readyUnits,
  onClose,
}: {
  card: WarehouseOutboundCard;
  readyUnits: DeliveryWarehouseScheduleEvent[];
  onClose: () => void;
}) {
  const doId = card.deliveryOrderId as string;
  const record = useRecordHandoverEvent(doId);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(readyUnits.map((u) => u.unitId)),
  );
  const [receiver, setReceiver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadProof(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(ALLOWED_MIMES as readonly string[]).includes(file.type)) {
      setUploadError(`${file.name}: use a JPG, PNG or WEBP photo.`);
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError(`${file.name} is too large (max 10 MB).`);
      return;
    }
    setUploadBusy(true);
    try {
      const sign = await apiFetch<{ token: string; path: string }>(
        `/api/operation/delivery-orders/${encodeURIComponent(doId)}/handover-proof/sign-upload`,
        { method: "POST", body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }) },
      );
      const { error } = await supabase.storage
        .from("proof-of-delivery")
        .uploadToSignedUrl(sign.path, sign.token, file);
      if (error) throw error;
      setProofPath(sign.path);
    } catch (err) {
      setUploadError(
        err instanceof ApiError || err instanceof Error ? err.message : "Upload failed",
      );
    } finally {
      setUploadBusy(false);
      e.target.value = "";
    }
  }

  const canSubmit =
    picked.size > 0 && receiver.trim().length > 0 && Boolean(proofPath) && !record.isPending;

  return (
    <Modal title={`Record handover — ${card.doNumber}`} onClose={onClose}>
      <div className="space-y-3 text-[13px]">
        <div>
          <div className="mb-1 text-label uppercase tracking-wide text-base-500">
            Units in this handover
          </div>
          {readyUnits.map((u) => (
            <label key={u.unitId} className="flex items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={picked.has(u.unitId)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(u.unitId);
                  else next.delete(u.unitId);
                  setPicked(next);
                }}
                data-testid={`wo-pick-${u.unitId}`}
              />
              <span className="font-mono">{u.unitId}</span>
              <span className="truncate text-base-500">{u.productName ?? u.sku ?? ""}</span>
            </label>
          ))}
          <p className="mt-1 text-label text-base-500">
            Units left out keep their current holder and stay under {fmtDate(card.eventDate)}.
          </p>
        </div>
        <label className="block">
          <span className="text-label uppercase tracking-wide text-base-500">
            Received by ({card.logisticsPartner})
          </span>
          <input
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            className="mt-0.5 h-8 w-full rounded border border-kit-slate-5 px-2"
            placeholder="The person who actually received the goods"
            data-testid="wo-receiver"
          />
        </label>
        <label className="block">
          <span className="text-label uppercase tracking-wide text-base-500">
            Vehicle (when known)
          </span>
          <input
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="mt-0.5 h-8 w-full rounded border border-kit-slate-5 px-2"
            data-testid="wo-vehicle"
          />
        </label>
        <div>
          <span className="text-label uppercase tracking-wide text-base-500">
            Proof — signature, photo or reply
          </span>
          <input
            type="file"
            accept={(ALLOWED_MIMES as readonly string[]).join(",")}
            onChange={uploadProof}
            disabled={uploadBusy}
            className="mt-0.5 block w-full text-[13px]"
            data-testid="wo-proof"
          />
          {proofPath && <p className="mt-0.5 text-label text-base-600">Proof attached.</p>}
          {uploadError && <p className="mt-0.5 text-label text-base-600">{uploadError}</p>}
        </div>
      </div>
      <ModalActions
        onCancel={onClose}
        primary="Record handover"
        primaryDisabled={!canSubmit}
        primaryPending={record.isPending}
        onPrimary={() =>
          record.mutate(
            {
              kind: "handed_over",
              receiverName: receiver.trim(),
              vehicle: vehicle.trim() || undefined,
              proofPath: proofPath as string,
              unitCodes: [...picked],
            },
            {
              onSuccess: () => {
                toast.success(
                  `Handed over ${picked.size} of ${card.unitsRequired} Units to ${card.logisticsPartner}`,
                );
                onClose();
              },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </Modal>
  );
}
