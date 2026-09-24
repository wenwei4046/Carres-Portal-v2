/**
 * THE DELIVERY BRIEF — the Monitor row's expanded four panels (Delivery MASTER
 * §8.5) and, since CARD 11, the Delivery-owned writes inside them (§8.6).
 *
 * The approved journey: expand the row → act inside the panel → save → remain
 * on the same Monitor row, in the same queue, with the same narrowings; the
 * row moves queues by itself. The kit `Panel`'s right slot is the one control
 * and the panel body is the edit surface — no overflow menu, no dialog.
 *
 *   1  Customer, Address & Access   Sales Orders, read-only · `Open Sales Order to change`
 *   2  Delivery Dates               `Update date and time` → the edit state
 *   3  Logistics Details            `Assign logistics` / `Change logistics` → the edit state
 *   4  Items, Services & Stock      Sales, Purchasing, Stock, read-only
 *
 * The brief reads and links; it never duplicates Sales, Stock, Warehouse,
 * Purchasing or Payment truth. Every write goes through the arrangement's own
 * governed door (`PUT /delivery-arrangements/:orderId`), which decides the
 * later-date rule and records the customer contact in the same request.
 */
// design-standard: not-a-list-page — this is the CHILD of a Monitor register
// row (the expanded delivery brief), not a page. It has no destination, no
// toolbar and no header of its own; the register above it owns all three.
import { useCallback, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ARRIVAL_COPY,
  CANNOT_DELIVER_REASONS,
  CHANGE_LOGISTICS_REASONS,
  DELIVERY_TIME_SLOTS,
  isLogisticsChange,
  isSundayIso,
  laterThanRequested,
  myHolidaySet,
  parseEmergencyContact,
  unitIdOf,
  type DeliveryWorkStatusTone,
  type InformationReceivedFrom,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { apiFetch, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { displayCustomerName } from "@/lib/customer-name";
import Panel from "@/components/kit/Panel";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Select from "@/components/kit/Select";
import Input from "@/components/kit/Input";
import Textarea from "@/components/kit/Textarea";
import {
  useDeliveryPartners,
  useDeliveryArrangements,
  useRecordCannotDeliver,
  useSalesOrderExpansion,
  useSaveDeliveryArrangement,
} from "@/lib/queries";
import ConnectedSections from "./ConnectedSections";
import { defaultPartnerFor } from "./AssignLogisticsDialog";
import { DW } from "../delivery-work";
import {
  arrivalDayOf,
  MONITOR_COLUMN,
  MONITOR_COPY,
  type DeliveryMonitorCard,
  type MonitorExtraLine,
  type MonitorGoodsLine,
} from "../delivery-monitor";
import { requestedDeliveryText } from "../sales-order-columns";
import { lineName } from "../sales-order-facts";
import { chaseMessageFor, REPLY_PROOF_MAX_BYTES, REPLY_PROOF_TYPES } from "../delivery-chase";

/* ── THE TEXT COLOURS (§8.3 colour law) ───────────────────────────────────── */
export const STATUS_TONE_TEXT: Record<DeliveryWorkStatusTone, string> = {
  green: "text-kit-green-11",
  orange: "text-kit-amber-11",
  red: "text-kit-red-11",
  none: "text-kit-slate-12",
};

/** The kit Panel's header is `py-3` around one `text-strong` line — the elbow
 *  turns in at its middle. Stated, never measured at runtime. */
const CONNECT_AT_PANEL = "22px";

function Fact({ label, value, problem = false }: { label: string; value: ReactNode; problem?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 text-label text-kit-slate-11">{label}</span>
      <span className={`min-w-0 text-right text-body ${problem ? "text-kit-amber-11" : "text-kit-slate-12"}`}>
        {value}
      </span>
    </div>
  );
}

function absentWord(word: string) {
  return (
    <span className="text-kit-slate-9" data-absence="true">
      {word}
    </span>
  );
}

const trim = (v: string | null | undefined) => (v ?? "").trim();

/* ── THE REPLY SCREENSHOT — an upload, never a typed path ──────────────────── */
function useReplyProofUpload(orderId: string, leg: number) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      setError(null);
      if (!(REPLY_PROOF_TYPES as readonly string[]).includes(file.type)) {
        setError(MONITOR_COPY.uploadWrongType);
        return null;
      }
      if (file.size > REPLY_PROOF_MAX_BYTES) {
        setError(MONITOR_COPY.uploadTooLarge);
        return null;
      }
      setBusy(true);
      try {
        const sign = await apiFetch<{ token: string; path: string }>(
          `/api/operation/delivery-arrangements/${encodeURIComponent(orderId)}/reply-proof/sign-upload?leg=${leg}`,
          { method: "POST", body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }) },
        );
        const { error: upErr } = await supabase.storage
          .from("proof-of-delivery")
          .uploadToSignedUrl(sign.path, sign.token, file);
        if (upErr) throw new Error(upErr.message);
        return sign.path;
      } catch (err) {
        setError(err instanceof Error ? err.message : MONITOR_COPY.uploadFailed);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [orderId, leg],
  );
  return { upload, busy, error };
}

function ReplyProofField({
  id,
  path,
  busy,
  error,
  onFile,
}: {
  id: string;
  path: string | null;
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label text-kit-slate-11">{MONITOR_COPY.whatsappProof}</span>
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-control border border-kit-slate-6 bg-white px-2 py-1 text-label font-medium text-kit-slate-12 hover:bg-kit-slate-3">
          {busy ? "…" : path ? MONITOR_COPY.replaceReply : MONITOR_COPY.uploadReply}
          <input
            id={id}
            type="file"
            accept={REPLY_PROOF_TYPES.join(",")}
            className="sr-only"
            data-testid={id}
            disabled={busy}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(file);
            }}
          />
        </label>
        {path ? <span className="text-label text-kit-green-11">{MONITOR_COPY.replyAttached}</span> : null}
      </div>
      {error ? <span className="text-label text-kit-red-11">{error}</span> : null}
    </div>
  );
}

/* ── PANEL 2 · the Delivery Dates edit state (§8.6) ─────────────────────── */
function DeliveryDatesEdit({ card, onDone }: { card: DeliveryMonitorCard; onDone: () => void }) {
  const row = card.scope;
  const arrangement = row.arrangement;
  const leg = card.leg ?? 0;
  const partner = card.logisticsPartnerName;
  const save = useSaveDeliveryArrangement(card.orderId, leg);
  const proof = useReplyProofUpload(card.orderId, leg);
  const [date, setDate] = useState<string | null>(card.confirmedDate);
  const [time, setTime] = useState<string | undefined>(card.confirmedTime ?? undefined);
  const [from, setFrom] = useState<InformationReceivedFrom | undefined>(
    partner ? "partner" : "customer",
  );
  const [proofPath, setProofPath] = useState<string | null>(arrangement?.reply_proof_path ?? null);
  const holidays = useMemo(() => myHolidaySet(), []);

  const requestedIso = row.customerDeliveryIso;
  const later = laterThanRequested(date, requestedIso);
  const needsReply = later && !proofPath;
  const dayRefused = date && (isSundayIso(date) || holidays.has(date)) ? MONITOR_COPY.notDeliveryDay : undefined;
  const canSave = Boolean(date) && !needsReply && !dayRefused && !save.isPending && !proof.busy;

  const fromOptions = [
    ...(partner ? [{ value: "partner", label: partner }] : []),
    { value: "customer", label: MONITOR_COPY.customerWord },
    ...(partner ? [{ value: "operation_on_behalf", label: MONITOR_COPY.operationOnBehalfOf(partner) }] : []),
  ];

  const submit = async () => {
    if (!canSave || !date) return;
    try {
      await save.mutateAsync({
        partnerId: card.logisticsPartnerId,
        confirmedDate: date,
        confirmedTime: time ?? null,
        expectedArrival: arrangement?.expected_arrival ?? null,
        logisticsNote: arrangement?.logistics_note ?? null,
        replyProofPath: proofPath,
        driverName: arrangement?.driver_name ?? null,
        vehicle: arrangement?.vehicle ?? null,
        condoRegistration: arrangement?.condo_registration ?? null,
        informationReceivedFrom: from ?? null,
      });
      toast.success(MONITOR_COPY.deliveryConfirmedDone(fmtDate(date), time ?? null));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError || err instanceof Error ? err.message : MONITOR_COPY.uploadFailed);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="delivery-brief-dates-edit"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Fact label={MONITOR_COPY.customerRequested} value={requestedDeliveryText({ iso: requestedIso, tbd: row.customerDateTbd })} />
      <DatePicker
        id={`delivery-brief-date-${card.scopeId}`}
        label={MONITOR_COPY.confirmedDateField}
        value={date}
        onChange={setDate}
        error={dayRefused}
        required
      />
      <Select
        id={`delivery-brief-time-${card.scopeId}`}
        label={MONITOR_COPY.confirmedTimeField}
        value={time}
        onValueChange={setTime}
        options={DELIVERY_TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
      />
      <Select
        id={`delivery-brief-from-${card.scopeId}`}
        label={MONITOR_COPY.informationReceivedFrom}
        value={from}
        onValueChange={(v) => setFrom(v as InformationReceivedFrom)}
        options={fromOptions}
      />
      <ReplyProofField
        id={`delivery-brief-proof-${card.scopeId}`}
        path={proofPath}
        busy={proof.busy}
        error={proof.error}
        onFile={(file) => {
          void proof.upload(file).then((path) => {
            if (path) setProofPath(path);
          });
        }}
      />
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={!canSave}
          data-testid="delivery-brief-save-dates"
        >
          {needsReply ? MONITOR_COPY.saveConfirmedDeliveryNeedsReply : MONITOR_COPY.saveConfirmedDelivery}
        </Button>
        <Button size="sm" type="button" onClick={onDone} data-testid="delivery-brief-cancel-dates">
          {MONITOR_COPY.cancel}
        </Button>
      </div>
    </form>
  );
}

/* ── PANEL 3 · the Logistics Details edit state (§8.6) ───────────────────── */
function LogisticsDetailsEdit({ card, onDone }: { card: DeliveryMonitorCard; onDone: () => void }) {
  const row = card.scope;
  const arrangement = row.arrangement;
  const leg = card.leg ?? 0;
  const partnersQ = useDeliveryPartners();
  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);
  const save = useSaveDeliveryArrangement(card.orderId, leg);
  const cannot = useRecordCannotDeliver(card.orderId, leg);
  const proof = useReplyProofUpload(card.orderId, leg);
  const [partnerId, setPartnerId] = useState<string | undefined>(
    card.logisticsPartnerId ?? defaultPartnerFor([row], partners) ?? undefined,
  );
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [driver, setDriver] = useState(arrangement?.driver_name ?? "");
  const [vehicle, setVehicle] = useState(arrangement?.vehicle ?? "");
  const [condo, setCondo] = useState(arrangement?.condo_registration ?? "");
  const [proofPath, setProofPath] = useState<string | null>(arrangement?.reply_proof_path ?? null);
  const [cannotOpen, setCannotOpen] = useState(false);
  const [cannotReason, setCannotReason] = useState<string | undefined>(undefined);
  const [cannotNote, setCannotNote] = useState("");

  const chosen = partners.find((p) => p.id === partnerId) ?? null;
  const changing = isLogisticsChange(card.logisticsPartnerId, partnerId ?? null);
  const needsCondo = /condo|apartment|office/i.test(trim(row.o.building_type));
  const canSave = Boolean(partnerId) && (!changing || Boolean(reason)) && !save.isPending;

  const chaseMessage = useMemo(
    () =>
      chaseMessageFor({
        so: row.so,
        customer: displayCustomerName(row.o.customer_name) || null,
        address:
          trim(row.o.customer_address) ||
          [row.o.customer_address_city, row.o.customer_address_state].filter(Boolean).join(", ") ||
          null,
        building: trim(row.o.building_type) || null,
        goods: (row.o.order_lines ?? []).map((l) => lineName({ sku: l.sku })),
        requestedDate: row.customerDeliveryIso ? fmtDate(row.customerDeliveryIso) : null,
      }),
    [row],
  );
  const copyChase = async () => {
    try {
      await navigator.clipboard.writeText(chaseMessage);
      toast.success(MONITOR_COPY.copied);
      if (partnerId) {
        /* Preparation is an ACTIVITY fact (0412), recorded quietly; a failed
           record never blocks the operator mid-chase. It confirms nothing. */
        void apiFetch(
          `/api/operation/delivery-arrangements/${encodeURIComponent(card.orderId)}/message-prepared?leg=${leg}`,
          { method: "POST", body: JSON.stringify({ partnerId }) },
        ).catch(() => undefined);
      }
    } catch {
      toast.error(MONITOR_COPY.uploadFailed);
    }
  };

  const submit = async () => {
    if (!canSave) return;
    try {
      await save.mutateAsync({
        partnerId: partnerId ?? null,
        confirmedDate: card.confirmedDate,
        confirmedTime: card.confirmedTime,
        expectedArrival: arrangement?.expected_arrival ?? null,
        logisticsNote: arrangement?.logistics_note ?? null,
        replyProofPath: proofPath,
        driverName: trim(driver) || null,
        vehicle: trim(vehicle) || null,
        condoRegistration: trim(condo) || null,
        reason: changing ? (reason as never) : null,
      });
      toast.success(`${chosen?.name ?? MONITOR_COPY.partner} assigned`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError || err instanceof Error ? err.message : MONITOR_COPY.uploadFailed);
    }
  };

  const recordCannot = async () => {
    if (!card.logisticsPartnerId || !cannotReason) return;
    try {
      await cannot.mutateAsync({
        partnerId: card.logisticsPartnerId,
        reason: cannotReason as never,
        note: trim(cannotNote) || null,
      });
      toast.success(MONITOR_COPY.cannotDeliverRecorded(card.logisticsPartnerName ?? MONITOR_COPY.partner));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError || err instanceof Error ? err.message : MONITOR_COPY.uploadFailed);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="delivery-brief-logistics-edit"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Select
        id={`delivery-brief-partner-${card.scopeId}`}
        label={MONITOR_COPY.partner}
        value={partnerId}
        onValueChange={setPartnerId}
        placeholder={MONITOR_COPY.pickOne}
        options={partners.map((p) => ({ value: p.id, label: p.name }))}
        required
      />
      {changing ? (
        <Select
          id={`delivery-brief-reason-${card.scopeId}`}
          label={MONITOR_COPY.whyChanging}
          value={reason}
          onValueChange={setReason}
          placeholder={MONITOR_COPY.pickOne}
          options={CHANGE_LOGISTICS_REASONS.map((r) => ({ value: r.key, label: r.label }))}
          required
        />
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input
          id={`delivery-brief-driver-${card.scopeId}`}
          label={MONITOR_COPY.driverName}
          value={driver}
          onChange={(e) => setDriver(e.target.value)}
        />
        <Input
          id={`delivery-brief-vehicle-${card.scopeId}`}
          label={MONITOR_COPY.vehiclePlate}
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
        />
      </div>
      {needsCondo ? (
        <Textarea
          id={`delivery-brief-condo-${card.scopeId}`}
          label={MONITOR_COPY.condoRegistration}
          hint={MONITOR_COPY.condoRegistrationHint}
          value={condo}
          onChange={(e) => setCondo(e.target.value)}
        />
      ) : null}
      {/* The chase — prepared words, never confirmation (Card 05). */}
      <div className="flex flex-col gap-1 rounded-control border border-kit-slate-5 bg-kit-slate-3 p-2" data-testid="delivery-brief-chase">
        <pre className="whitespace-pre-wrap font-sans text-body text-kit-slate-12" data-testid="delivery-brief-chase-message">
          {chaseMessage}
        </pre>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="button" onClick={() => void copyChase()}>
            {MONITOR_COPY.copyMessage}
          </Button>
          {chosen?.whatsapp_group_url ? (
            <a
              className="text-label text-blue-700 underline-offset-2 hover:underline"
              href={chosen.whatsapp_group_url}
              target="_blank"
              rel="noreferrer"
            >
              {MONITOR_COPY.openGroup}
            </a>
          ) : (
            <span className="text-label text-kit-slate-9">{MONITOR_COPY.groupNotSet}</span>
          )}
        </div>
        <span className="text-label text-kit-slate-11">{MONITOR_COPY.sentIsNotConfirmed}</span>
        <ReplyProofField
          id={`delivery-brief-logistics-proof-${card.scopeId}`}
          path={proofPath}
          busy={proof.busy}
          error={proof.error}
          onFile={(file) => {
            void proof.upload(file).then((path) => {
              if (path) setProofPath(path);
            });
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" type="submit" disabled={!canSave} data-testid="delivery-brief-save-logistics">
          {card.logisticsPartnerId ? MONITOR_COPY.changeLogistics : MONITOR_COPY.assignLogistics}
        </Button>
        <Button size="sm" type="button" onClick={onDone} data-testid="delivery-brief-cancel-logistics">
          {MONITOR_COPY.cancel}
        </Button>
      </div>
      {card.logisticsPartnerId && card.logisticsPartnerName ? (
        <div className="border-t border-kit-slate-5 pt-2">
          {!cannotOpen ? (
            <Button size="sm" type="button" onClick={() => setCannotOpen(true)} data-testid="delivery-brief-cannot-open">
              {MONITOR_COPY.recordCannotDeliver(card.logisticsPartnerName)}
            </Button>
          ) : (
            <div className="flex flex-col gap-2" data-testid="delivery-brief-cannot-deliver">
              <Select
                id={`delivery-brief-cannot-reason-${card.scopeId}`}
                label={MONITOR_COPY.cannotDeliverReason}
                value={cannotReason}
                onValueChange={setCannotReason}
                placeholder={MONITOR_COPY.pickOne}
                options={CANNOT_DELIVER_REASONS.map((r) => ({ value: r.key, label: r.label }))}
                required
              />
              <Textarea
                id={`delivery-brief-cannot-note-${card.scopeId}`}
                label={MONITOR_COPY.cannotDeliverNote}
                value={cannotNote}
                onChange={(e) => setCannotNote(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  disabled={!cannotReason || (cannotReason === "other" && !trim(cannotNote)) || cannot.isPending}
                  onClick={() => void recordCannot()}
                  data-testid="delivery-brief-cannot-save"
                >
                  {MONITOR_COPY.recordCannotDeliver(card.logisticsPartnerName)}
                </Button>
                <Button size="sm" type="button" onClick={() => setCannotOpen(false)}>
                  {MONITOR_COPY.cancel}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </form>
  );
}

/* ── PANEL 4 · the goods table ──────────────────────────────────────────── */
const BRIEF_COLUMNS = [
  { key: "item", label: MONITOR_COPY.item, width: null },
  { key: "qty", label: MONITOR_COPY.qty, width: 56 },
  { key: "source", label: MONITOR_COPY.source, width: 160 },
  { key: "status", label: MONITOR_COPY.status, width: 190 },
  { key: "location", label: MONITOR_COPY.location, width: 170 },
] as const;

interface BriefLine {
  key: string;
  item: string;
  qty: number;
  /** Unit IDs with their PO, or `Counted stock`; null for a service. */
  units: Array<{ unit: string; po: string | null }> | null;
  status: string | null;
  statusTone: DeliveryWorkStatusTone;
  location: string | null;
}

/**
 * PANEL 4 · `Items, Services & Stock` — read-only, from Sales, Purchasing and
 * Stock (§8.5). Exported unchanged (Payment Monitor Card 02, 2026-09-16) so
 * the Payment collection workspace shows the SAME item, source, status and
 * location a Delivery operator sees, with the same door to the PO behind a
 * Unit — never a second stock reading.
 */
export function ItemsServicesStockPanel({
  orderId,
  items,
  extras,
  arrival,
  requestedIso,
  loans,
}: {
  orderId: string;
  items: readonly MonitorGoodsLine[];
  extras: readonly MonitorExtraLine[];
  arrival: DeliveryMonitorCard["arrival"];
  requestedIso: string | null;
  loans: DeliveryMonitorCard["scope"]["o"]["ops_sofa_loans"];
}) {
  const navigate = useNavigate();
  const expansion = useSalesOrderExpansion(orderId);
  const factsByLine = new Map((expansion.data?.lines ?? []).map((l) => [l.lineId, l]));
  const coverage = expansion.data?.unitCoverage ?? {};
  const unitScopes = expansion.data?.unitScopes ?? {};
  const placeByUnit = new Map((expansion.data?.place ?? []).map((p) => [p.unitCode, p]));
  const unitsOf = (lineId: string | null): Array<{ unit: string; po: string | null }> =>
    (lineId ? factsByLine.get(lineId)?.unitIds ?? [] : [])
      .map((code) => ({
        unit: unitIdOf({ unitCode: code, identityScope: unitScopes[code] as "unit" | "quantity" | undefined }),
        po: coverage[code] ?? null,
      }))
      .filter((u): u is { unit: string; po: string | null } => u.unit !== null);
  const locationOf = (units: Array<{ unit: string }>): string | null => {
    const places = units
      .map((u) => placeByUnit.get(u.unit))
      .map((p) => (p?.siteName ? p.siteName : p?.holderName ? MONITOR_COPY.withHolder(p.holderName) : null))
      .filter((p): p is string => Boolean(p));
    return places.length > 0 ? [...new Set(places)].join(" · ") : null;
  };
  const arrivalDay = arrivalDayOf(arrival);
  const arrivalWord = (): { word: string; tone: DeliveryWorkStatusTone } => {
    if (arrival.kind === "no_purchase_order") {
      return { word: ARRIVAL_COPY.noPurchaseOrder, tone: "orange" };
    }
    if (arrivalDay && requestedIso && arrivalDay > requestedIso) {
      return { word: MONITOR_COPY.arrivingAfterRequested, tone: "orange" };
    }
    if (arrivalDay) return { word: MONITOR_COPY.arriving(fmtDate(arrivalDay)), tone: "none" };
    return { word: MONITOR_COPY.notReceivedYet, tone: "orange" };
  };
  const goodsLine = (line: MonitorGoodsLine): BriefLine => {
    const units = unitsOf(line.lineId);
    const ready = line.shortQty === 0;
    const arrival = ready ? null : arrivalWord();
    return {
      key: line.key,
      item: line.name,
      qty: line.qty,
      units,
      status: ready ? ARRIVAL_COPY.stockReady : arrival!.word,
      statusTone: ready ? "green" : arrival!.tone,
      location: locationOf(units),
    };
  };
  const briefLines: BriefLine[] = [
    ...items.map(goodsLine),
    ...extras.filter((l) => l.kind === "accessory").map(goodsLine),
    ...extras
      .filter((l) => l.kind === "service")
      .map(
        (l): BriefLine => ({
          key: l.key,
          item: l.name,
          qty: l.qty,
          units: null,
          status: null,
          statusTone: "none",
          location: null,
        }),
      ),
    /* 0492 (Card 15) — one line per loan Unit out, naming the exact Unit ID
       the crew must bring back: `Loan {Unit ID} · collect back on delivery day`. */
    ...(loans ?? [])
      .filter((l) => l.status === "on_loan")
      .map((l, index) => {
        const unit = Array.isArray(l.ops_stock_items) ? l.ops_stock_items[0] : l.ops_stock_items;
        return {
          key: `loan-${index}`,
          item: MONITOR_COPY.loanLine(
            unitIdOf({ unitCode: unit?.unit_code ?? null, identityScope: unit?.identity_scope ?? null }),
          ),
          qty: 1,
          units: null,
          status: null,
          statusTone: "none" as const,
          location: null,
        };
      }),
  ];
  const physicalLines = briefLines.filter(line => line.units !== null);
  const serviceLines = briefLines.filter(line => line.units === null);
  return (
    <Panel title={MONITOR_COPY.panelItems} padding="none">
      {briefLines.length === 0 ? (
        <div className="px-4 py-3 text-body text-kit-slate-11">{DW.noGoods}</div>
      ) : physicalLines.length > 0 ? (
        <div className="min-w-0">
          <table className="block w-full text-left xl:table xl:table-fixed" aria-label={MONITOR_COPY.panelItems} data-testid="delivery-brief-items">
            <colgroup className="hidden xl:table-column-group">
              {BRIEF_COLUMNS.map((c) => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
            </colgroup>
            <thead className="sr-only border-b border-base-200 bg-base-50 xl:not-sr-only xl:table-header-group">
              <tr className="divide-x divide-base-200">
                {BRIEF_COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className="px-2 py-1.5 text-label font-semibold uppercase text-base-500">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="block divide-y divide-base-200 text-body xl:table-row-group">
              {physicalLines.map((line) => (
                <tr key={line.key} className="grid grid-cols-[minmax(0,1fr)_auto] align-top xl:table-row xl:divide-x xl:divide-base-200" data-testid={`delivery-brief-line-${line.key}`}>
                  <td className="min-w-0 break-words px-2 py-1.5">{line.item}</td>
                  <td className="px-2 py-1.5 tabular-nums">{line.qty}</td>
                  <td className="col-span-2 min-w-0 break-words px-2 py-1.5">
                    <span className="block text-label text-kit-slate-11 xl:hidden">{MONITOR_COPY.source}</span>
                    {!line.units?.length ? (
                      absentWord(DW.notAllocated)
                    ) : (
                      line.units.map((u) => (
                        <span key={u.unit} className="block">
                          <span className="block font-mono">{u.unit}</span>
                          <span className="block text-label">
                            {u.po ? (
                              <button
                                type="button"
                                className="text-blue-700 underline-offset-2 hover:underline"
                                onClick={() => navigate(`/operation/procurement/${encodeURIComponent(u.po!)}`)}
                              >
                                {u.po}
                              </button>
                            ) : (
                              <span className="text-kit-slate-11">{MONITOR_COPY.countedStock}</span>
                            )}
                          </span>
                        </span>
                      ))
                    )}
                  </td>
                  <td className={`col-span-2 min-w-0 break-words px-2 py-1.5 ${STATUS_TONE_TEXT[line.statusTone]}`}>
                    <span className="block text-label text-kit-slate-11 xl:hidden">{MONITOR_COPY.status}</span>
                    {line.status ?? absentWord(DW.notRecorded)}
                  </td>
                  <td className="col-span-2 min-w-0 break-words px-2 py-1.5">
                    <span className="block text-label text-kit-slate-11 xl:hidden">{MONITOR_COPY.location}</span>
                    {line.location ?? absentWord(DW.notRecorded)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {serviceLines.length ? <div className="border-t border-kit-slate-5 px-4 py-3" data-testid="delivery-brief-services">
        <h3 className="mb-2 text-body font-medium">{MONITOR_COPY.services}</h3>
        {serviceLines.map(line => <div key={line.key} className="flex items-start justify-between gap-3 py-1 text-body">
          <span className="min-w-0 break-words">{line.item}</span>
          <span className="shrink-0 tabular-nums">×{line.qty}</span>
        </div>)}
      </div> : null}
    </Panel>
  );

}

export default function DeliveryBrief({
  card,
  onOpenOrder,
}: {
  card: DeliveryMonitorCard;
  onOpenOrder: (card: DeliveryMonitorCard) => void;
}) {
  const row = card.scope;
  const o = row.o;
  const arrangement = row.arrangement;
  const allArrangements = useDeliveryArrangements();
  const emergency = parseEmergencyContact(o.customer_emergency);
  const missing = new Set(row.missingFacts);
  const [editingDates, setEditingDates] = useState(false);
  const [editingLogistics, setEditingLogistics] = useState(false);
  /* A missing REQUIRED Sales fact prints as the problem it is (orange), in
     the place the value would stand — never as a quiet absence. */
  const required = (problemWord: string, value: ReactNode) =>
    missing.has(problemWord) ? (
      <span className="text-kit-amber-11" data-testid="delivery-brief-problem">
        {problemWord}
      </span>
    ) : (
      value
    );

  /* ── PANEL 1 · Customer, Address & Access (Sales Orders, read-only) ────── */
  const addressLines = [
    trim(o.customer_address_line1),
    trim(o.customer_address_line2),
    [trim(o.customer_address_postcode), trim(o.customer_address_city)].filter(Boolean).join(" "),
    trim(o.customer_address_state),
  ].filter(Boolean);
  const address = addressLines.length > 0 ? addressLines.join(", ") : trim(o.customer_address) || null;
  const accessParts: string[] = [];
  if ((o.delivery_stair_items ?? 0) > 0) {
    accessParts.push(MONITOR_COPY.stairCarry(o.delivery_stair_items ?? 0, o.delivery_floor ?? null));
  }
  if (trim(arrangement?.condo_registration)) {
    accessParts.push(`${MONITOR_COPY.condoRegistration} · ${trim(arrangement?.condo_registration)}`);
  }
  const panelCustomer = (
    <Panel
      title={MONITOR_COPY.panelCustomer}
      right={
        <Button size="sm" onClick={() => onOpenOrder(card)}>
          {DW.openSalesOrder}
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2" data-testid="delivery-brief-customer">
        <div>
          <Fact label={MONITOR_COPY.customer} value={card.customerName} />
          <Fact label={MONITOR_COPY.phone} value={trim(o.customer_phone) || absentWord(DW.notRecorded)} />
          <Fact
            label={MONITOR_COPY.emergencyContact}
            value={emergency.name || absentWord(DW.notRecorded)}
          />
          <Fact label={MONITOR_COPY.emergencyPhone} value={emergency.phone || absentWord(DW.notRecorded)} />
          <Fact label={MONITOR_COPY.emergencyRelationship} value={emergency.relationship || absentWord(DW.notRecorded)} />
        </div>
        <div>
          <Fact label={MONITOR_COPY.address} value={address ?? absentWord(DW.notRecorded)} />
          <Fact
            label={MONITOR_COPY.buildingType}
            value={required(DW.buildingNotRecorded, trim(o.building_type) || absentWord(DW.notRecorded))}
          />
          <Fact
            label={MONITOR_COPY.floor}
            value={required(
              DW.floorNotRecorded,
              o.delivery_floor != null ? String(o.delivery_floor) : absentWord(DW.notRecorded),
            )}
          />
          <Fact
            label={MONITOR_COPY.lift}
            value={required(
              DW.liftNotRecorded,
              o.delivery_has_lift == null
                ? absentWord(DW.notRecorded)
                : o.delivery_has_lift
                  ? MONITOR_COPY.hasLift
                  : MONITOR_COPY.noLift,
            )}
          />
          <Fact
            label={MONITOR_COPY.access}
            problem={accessParts.length === 0}
            value={accessParts.length > 0 ? accessParts.join(" · ") : MONITOR_COPY.accessNotRecorded}
          />
          {missing.has(DW.stateNotRecorded) ? (
            <Fact label={MONITOR_COLUMN.state} value={required(DW.stateNotRecorded, null)} />
          ) : null}
        </div>
      </div>
    </Panel>
  );

  /* ── PANEL 2 · Delivery Dates (Delivery) ───────────────────────────────── */
  const panelDates = (
    <Panel
      title={MONITOR_COPY.panelDates}
      right={
        editingDates ? undefined : (
          <Button size="sm" onClick={() => setEditingDates(true)} data-testid="delivery-brief-update-dates">
            {MONITOR_COPY.updateDateTime}
          </Button>
        )
      }
    >
      {editingDates ? (
        <DeliveryDatesEdit card={card} onDone={() => setEditingDates(false)} />
      ) : (
        <div data-testid="delivery-brief-dates">
          <Fact
            label={MONITOR_COPY.customerRequested}
            value={required(
              DW.requestedDateNotRecorded,
              requestedDeliveryText({ iso: row.customerDeliveryIso, tbd: row.customerDateTbd }),
            )}
          />
          <Fact
            label={MONITOR_COPY.confirmedDate}
            value={card.confirmedDate ? fmtDate(card.confirmedDate) : absentWord(MONITOR_COPY.notConfirmed)}
          />
          {/* Time is optional (owner ruling 2026-09-24): printed only when recorded. */}
          {card.confirmedTime ? <Fact label={MONITOR_COPY.confirmedTime} value={card.confirmedTime} /> : null}
        </div>
      )}
    </Panel>
  );

  /* ── PANEL 3 · Logistics Details (Delivery; pickup facts from Warehouse) ─ */
  const partner = card.logisticsPartnerName;
  const pickup = row.handedOverAt
    ? [
        MONITOR_COPY.handedOver(fmtDate(row.handedOverAt, { time: true })),
        row.receivedAt
          ? MONITOR_COPY.receivedBy(partner ?? "logistics", fmtDate(row.receivedAt, { timeOnly: true }))
          : null,
      ].filter((p): p is string => Boolean(p))
    : row.receivedAt
      ? [MONITOR_COPY.receivedBy(partner ?? "logistics", fmtDate(row.receivedAt, { time: true }))]
      : [];
  const panelLogistics = (
    <Panel
      title={MONITOR_COPY.panelLogistics}
      right={
        editingLogistics ? undefined : (
          <Button size="sm" onClick={() => setEditingLogistics(true)} data-testid="delivery-brief-logistics-act">
            {partner ? MONITOR_COPY.changeLogistics : MONITOR_COPY.assignLogistics}
          </Button>
        )
      }
    >
      {editingLogistics ? (
        <LogisticsDetailsEdit card={card} onDone={() => setEditingLogistics(false)} />
      ) : (
        <div data-testid="delivery-brief-logistics">
          {card.confirmedDate && (!trim(arrangement?.driver_name) || !trim(arrangement?.vehicle) || !pickup.length || !trim(arrangement?.expected_arrival)) ?
            <p className="mb-2 text-body text-kit-amber-11">{MONITOR_COPY.logisticsIncomplete}</p> : null}
          <Fact
            label={MONITOR_COPY.partner}
            value={partner ?? <span className="text-kit-amber-11">{MONITOR_COPY.noLogistics}</span>}
          />
          <Fact label={MONITOR_COPY.driver} value={trim(arrangement?.driver_name) || absentWord(DW.notRecorded)} />
          <Fact label={MONITOR_COPY.driverPhone} value={absentWord(DW.notRecorded)} />
          <Fact label={MONITOR_COPY.vehiclePlate} value={trim(arrangement?.vehicle) || absentWord(DW.notRecorded)} />
          <Fact
            label={MONITOR_COPY.pickup}
            value={
              pickup.length > 0 ? (
                <span className="block">
                  {pickup.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              ) : (
                absentWord(MONITOR_COPY.pickupNotRecorded)
              )
            }
          />
          <Fact label={MONITOR_COPY.eta} value={trim(arrangement?.expected_arrival) || absentWord(DW.notRecorded)} />
        </div>
      )}
    </Panel>
  );

  /* ── PANEL 4 · Items, Services & Stock (Sales, Purchasing, Stock) ──────── */
  const panelItems = (
    <ItemsServicesStockPanel
      orderId={row.orderId}
      items={card.items}
      extras={card.extras}
      arrival={card.arrival}
      requestedIso={row.customerDeliveryIso}
      loans={o.ops_sofa_loans}
    />
  );

  return (
    <div data-testid="delivery-scope-expansion">
      {card.leg != null ? <div className="mb-2 flex flex-wrap gap-2" data-testid="delivery-brief-route">
        {[...(o.delivery_stops ?? [])].sort((a, b) => a.leg - b.leg).map((stop, index, stops) => {
          const booking = allArrangements.data?.arrangements.find(a => a.order_id === card.orderId && a.leg === stop.leg);
          const date = stop.leg === card.leg ? card.confirmedDate : booking?.confirmed_date ?? stop.scheduled_at?.slice(0, 10);
          const time = stop.leg === card.leg ? card.confirmedTime : booking?.confirmed_time;
          return <div key={stop.leg} aria-current={stop.leg === card.leg ? "step" : undefined}
            className={`min-w-0 flex-1 basis-52 border-l-2 px-3 py-2 text-body ${stop.leg === card.leg ? "border-kit-blue-9 bg-kit-blue-3" : "border-kit-slate-5"}`}>
            <div className="font-medium">{MONITOR_COPY.legOf(index + 1, stops.length)}</div>
            <div className="break-words">{stop.from_loc || DW.notRecorded} → {stop.to_loc || DW.notRecorded}</div>
            <div>{booking?.partner_name ?? stop.partner_name ?? MONITOR_COPY.noLogistics}</div>
            <div>{date ? fmtDate(date) : MONITOR_COPY.notConfirmed}</div>
            {time ? <div>{time}</div> : null}
          </div>;
        })}
      </div> : null}
      <ConnectedSections
        testId="delivery-brief"
        sections={[
          { key: "customer", connectAt: CONNECT_AT_PANEL, node: panelCustomer },
          { key: "dates", connectAt: CONNECT_AT_PANEL, node: panelDates },
          { key: "logistics", connectAt: CONNECT_AT_PANEL, node: panelLogistics },
          { key: "items", connectAt: CONNECT_AT_PANEL, node: panelItems },
        ]}
      />
    </div>
  );
}
