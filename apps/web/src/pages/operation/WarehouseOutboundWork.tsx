// design-standard: not-a-list-page — dated Warehouse work surface (Outbound
// exact-Unit scan/check/pack/load, Stock MASTER §12.6), not a Register list.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  addWorkingDays,
  DELIVERY_PHOTO_MAX_BYTES,
  DELIVERY_PHOTO_MIMES,
  driverCollectedLine,
  myHolidaySet,
  subtractWorkingDays,
  WAREHOUSE_OFF_DAYS,
  warehouseAssignedDriverLine,
  warehouseEmptyDaySentence,
  warehouseLoadedLine,
  warehouseOutboundCards,
  warehouseRecordLoadedSentence,
  warehouseUnitNotCollectedSentence,
  warehouseUnitPendingReason,
  type DeliveryWarehouseScheduleEvent,
  type WarehouseOutboundCard,
  type WarehousePrepFact,
} from "@carres/shared";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { apiFetch, ApiError } from "@/lib/api";
import {
  useDeliveryWarehouseSchedule,
  useRecordHandoverEvent,
  useRecordOutboundPrep,
} from "@/lib/queries";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import ModuleHeader from "./components/ModuleHeader";
import { Modal, ModalActions } from "./components/Modal";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";

/**
 * WAREHOUSE — OUTBOUND: the dated physical work the Warehouse owns
 * (owner replacement Card 2026-09-06 §7–§8; Stock MASTER §2).
 *
 * `240px page-specific filter rail + Outbound Register`. The rail filters
 * the same outgoing work by pickup status and Site; the toolbar's compact
 * selected-date control is only a filter — never another Calendar summary
 * (Monitor alone owns the Calendar).
 *
 * The work itself is governed and exact: scan exact Unit IDs, record check
 * and pack, then record which exact Units were LOADED to the individually
 * named receiver, with proof. Partial results persist under their original
 * date. The two evidence records stay separate forever:
 *
 *   Warehouse loaded    what the identified operator scanned and submitted
 *   Driver collected    what the driver independently confirms
 *
 * Only matching exact-Unit evidence changes `Who has it` (the server's
 * rule). The transport company and the individual driver are separate
 * stored facts and render separately; no value here is ever invented.
 */

type OutboundView = "all" | "not-loaded" | "loaded" | "no-evidence";

/** At agenda width the 240px rail would crush the list — it opens on demand
 *  from [Filters] and closes after a pick (the Monitor's own narrow rule). */
const NARROW_BREAKPOINT = 1280;

function useIsNarrow(): boolean {
  const query = `(max-width: ${NARROW_BREAKPOINT - 1}px)`;
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}

export default function WarehouseOutboundWork() {
  const [params, setParams] = useSearchParams();
  const holidays = useMemo(() => myHolidaySet(), []);
  const today = appTodayIso();
  const view = (params.get("view") ?? "all") as OutboundView;
  const site = params.get("site");
  const search = params.get("q") ?? "";
  const selectedDo = params.get("do");

  const { data, isLoading } = useDeliveryWarehouseSchedule();
  const allCards = useMemo(
    () =>
      warehouseOutboundCards(
        (data?.events ?? []) as DeliveryWarehouseScheduleEvent[],
      ),
    [data],
  );

  const selectedCard = allCards.find((c) => c.doNumber === selectedDo) ?? null;
  /* A deep link may carry `do` without `date` — the work date is the card's
     own date, never a guess. */
  const date = selectedCard?.eventDate ?? params.get("date") ?? today;

  const isNarrow = useIsNarrow();
  const [railHidden, setRailHidden] = useState(isNarrow);
  useEffect(() => {
    if (isNarrow) setRailHidden(true);
  }, [isNarrow]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: false });
  }
  function pickRail(key: string, value: string | null) {
    setParam(key, value);
    if (isNarrow) setRailHidden(true);
  }

  const siteNames = useMemo(
    () =>
      [...new Set(allCards.map((c) => c.fromLocation))]
        .filter((s) => s && s !== "Not recorded")
        .sort(),
    [allCards],
  );

  /** Rail + search narrow the SAME records (card §7). */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCards.filter((c) => {
      if (site && c.fromLocation !== site) return false;
      if (view === "not-loaded" && c.notHandedOver === 0) return false;
      if (view === "loaded" && c.notHandedOver !== 0) return false;
      if (view === "no-evidence" && !c.evidenceNotSubmitted) return false;
      if (!q) return true;
      return (
        c.doNumber.toLowerCase().includes(q) ||
        c.source.toLowerCase().includes(q) ||
        c.toCustomer.toLowerCase().includes(q) ||
        c.logisticsPartner.toLowerCase().includes(q) ||
        (c.driverName ?? "").toLowerCase().includes(q) ||
        c.units.some((u) => u.unitId.toLowerCase().includes(q))
      );
    });
  }, [allCards, site, view, search]);

  /* A status view shows its work under the ORIGINAL dates (unfinished work
     is never re-dated); the default view shows the selected date. */
  const dayRows = useMemo(
    () => filtered.filter((c) => c.eventDate === date),
    [filtered, date],
  );
  const groupedDates = useMemo(
    () => [...new Set(filtered.map((c) => c.eventDate))].sort(),
    [filtered],
  );
  const grouped = view !== "all";

  const backParams = new URLSearchParams(params);
  backParams.set("tab", "warehouse-monitor");
  backParams.delete("do");
  backParams.delete("view");
  backParams.delete("q");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="warehouse-outbound">
      <ModuleHeader
        testId="warehouse-outbound-header"
        word="Outbound"
        docTitle="Outbound · Warehouse — Carres"
        destinationHeader
      />
      <div className="flex items-center gap-3 border-b border-kit-slate-5 bg-white px-3 py-1.5">
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint"
          onClick={() => setRailHidden((h) => !h)}
          data-testid="wo-toggle-filters"
        >
          {railHidden ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          {railHidden ? "Filters" : "Hide filters"}
        </button>
        <Link
          to={`/operation?${backParams.toString()}`}
          className="text-meta text-base-600 underline-offset-2 hover:underline"
          data-testid="wo-back-monitor"
        >
          ← Monitor
        </Link>
        {!grouped && (
          <div className="flex items-center gap-1" data-testid="wo-date-control">
            <button
              type="button"
              aria-label="Previous date"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-kit-slate-5 hover:bg-hovertint"
              onClick={() =>
                setParam(
                  "date",
                  subtractWorkingDays(date, 1, {
                    offDays: WAREHOUSE_OFF_DAYS,
                    holidays,
                  }),
                )
              }
              data-testid="wo-prev"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-0 px-1 text-[13px] font-medium text-base-800" data-testid="wo-date">
              {fmtDate(date)}
            </span>
            <button
              type="button"
              aria-label="Next date"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-kit-slate-5 hover:bg-hovertint"
              onClick={() =>
                setParam(
                  "date",
                  addWorkingDays(date, 1, {
                    offDays: WAREHOUSE_OFF_DAYS,
                    holidays,
                  }),
                )
              }
              data-testid="wo-next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        <div className="ml-auto">
          <input
            type="search"
            value={search}
            placeholder="Search"
            aria-label="Search outbound work"
            className="h-7 w-52 rounded border border-kit-slate-5 px-2 text-[13px]"
            onChange={(e) => setParam("q", e.target.value)}
            data-testid="wo-search"
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {!railHidden && (
          <FilterRail testId="wo-rail">
            <FilterRailGroup title="PICKUP STATUS">
              <FilterRailRow
                label="Not loaded yet"
                count={allCards.filter((c) => c.notHandedOver > 0).length}
                active={view === "not-loaded"}
                onClick={() => pickRail("view", view === "not-loaded" ? null : "not-loaded")}
                testId="wo-view-not-loaded"
              />
              <FilterRailRow
                label="Loaded"
                count={allCards.filter((c) => c.notHandedOver === 0).length}
                active={view === "loaded"}
                onClick={() => pickRail("view", view === "loaded" ? null : "loaded")}
                testId="wo-view-loaded"
              />
              <FilterRailRow
                label="Evidence not submitted"
                count={allCards.filter((c) => c.evidenceNotSubmitted).length}
                active={view === "no-evidence"}
                onClick={() => pickRail("view", view === "no-evidence" ? null : "no-evidence")}
                testId="wo-view-no-evidence"
              />
            </FilterRailGroup>
            {siteNames.length > 1 && (
              <FilterRailGroup title="SITE">
                {siteNames.map((name) => (
                  <FilterRailRow
                    key={name}
                    label={name}
                    count={allCards.filter((c) => c.fromLocation === name).length}
                    active={site === name}
                    onClick={() => pickRail("site", site === name ? null : name)}
                    testId={`wo-site-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  />
                ))}
              </FilterRailGroup>
            )}
            {/* SOURCE is not rendered while `Delivery Order` is the only live
                source: a one-option group is a dead control. The source stays
                explicit on every row. */}
          </FilterRail>
        )}
        <div className={`min-h-0 min-w-0 flex-1 overflow-y-auto p-3${!railHidden && isNarrow ? " hidden" : ""}`}>
          {isLoading ? (
            <p className="text-[13px] text-base-500">Loading…</p>
          ) : grouped ? (
            groupedDates.length === 0 ? (
              <p className="text-[13px] text-base-500">Nothing here. Every pickup on this view is done.</p>
            ) : (
              groupedDates.map((d) => (
                <section key={d} className="mb-4" data-testid={`wo-group-${d}`}>
                  <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-base-600">
                    {fmtDate(d)}
                  </h2>
                  <RowList
                    cards={filtered.filter((c) => c.eventDate === d)}
                    selectedDo={selectedCard?.doNumber ?? null}
                    onSelectDo={(doNumber) => setParam("do", doNumber)}
                  />
                </section>
              ))
            )
          ) : dayRows.length === 0 ? (
            <p className="text-[13px] text-base-500" data-testid={`wo-empty-${date}`}>
              {warehouseEmptyDaySentence(fmtDate(date))}
            </p>
          ) : (
            <RowList
              cards={dayRows}
              selectedDo={selectedCard?.doNumber ?? dayRows[0]?.doNumber ?? null}
              onSelectDo={(doNumber) => setParam("do", doNumber)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RowList({
  cards,
  selectedDo,
  onSelectDo,
}: {
  cards: WarehouseOutboundCard[];
  selectedDo: string | null;
  onSelectDo: (doNumber: string | null) => void;
}) {
  return (
    <div className="max-w-6xl space-y-2">
      {cards.map((card) => (
        <OutboundSourceRow
          key={card.doNumber}
          card={card}
          expanded={card.doNumber === selectedDo}
          onToggle={() => onSelectDo(card.doNumber === selectedDo ? null : card.doNumber)}
        />
      ))}
    </div>
  );
}

/** One work row = one source document scope. The transport company and the
 *  individual driver are SEPARATE fields (card §8); the two evidence records
 *  are separate lines. The formal DO is LINKED, never copied into this page. */
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
  const work =
    card.notHandedOver === 0
      ? `Loaded ${card.handedOver} of ${card.unitsRequired} Units`
      : `Scan, check, pack and load ${card.notHandedOver} Unit${card.notHandedOver === 1 ? "" : "s"}`;

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
          <Field label="Pickup date" value={fmtDate(card.eventDate)} />
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
          <Field label="From" value={card.fromLocation} />
          <Field label="To" value={card.toCustomer} />
          <Field label="Logistics Partner" value={card.logisticsPartner} />
          <Field
            label="Assigned Driver"
            value={
              <span data-testid={`wo-driver-${card.doNumber}`}>
                {warehouseAssignedDriverLine(card.logisticsPartner, card.driverName)}
              </span>
            }
          />
          <Field label="Vehicle" value={card.vehicle ?? "—"} />
          <Field label="Units required" value={String(card.unitsRequired)} />
          <Field label="Warehouse operator" value={operator ?? "—"} />
          <Field
            label="Evidence"
            value={
              handed.length === 0 ? "—" : card.evidenceNotSubmitted ? "Not submitted" : "Submitted"
            }
          />
          <Field
            label="Warehouse loaded"
            value={<span data-testid={`wo-loaded-${card.doNumber}`}>{warehouseLoadedLine(card)}</span>}
          />
          <Field
            label="Driver collected"
            value={<span data-testid={`wo-collected-${card.doNumber}`}>{driverCollectedLine(card)}</span>}
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
  const [loadOpen, setLoadOpen] = useState(false);

  const remaining = card.units.filter((u) => !u.unitHandedOverAt);
  const scannedNotChecked = remaining.filter((u) => u.unitScannedAt && !u.unitCheckedAt);
  const checkedNotPacked = remaining.filter((u) => u.unitCheckedAt && !u.unitPackedAt);
  const readyUnits = remaining.filter(
    (u) => u.unitScannedAt && u.unitCheckedAt && u.unitPackedAt,
  );
  const receiverWord =
    (card.driverName ?? "").trim() || card.logisticsPartner;
  /* The DO-level collection is confirmed while an exact Unit was never
     loaded: that Unit did NOT travel — say so per Unit, never generically. */
  const notCollected =
    card.actualCollectionAt !== null
      ? remaining.map((u) =>
          warehouseUnitNotCollectedSentence(u.unitId, receiverWord, card.fromLocation),
        )
      : [];

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
      toast.error(`${match.unitId} was already loaded.`);
      return;
    }
    recordPrep("scanned", [match.unitId], `${match.unitId} scanned`);
    setScanValue("");
  }

  return (
    <div className="border-t border-kit-slate-5 px-3 py-2" data-testid={`wo-units-${card.doNumber}`}>
      <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
        Goods scheduled for pickup
      </div>
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
            onClick={() => setLoadOpen(true)}
            data-testid="wo-record-loaded"
          >
            {warehouseRecordLoadedSentence(readyUnits.length, receiverWord)}
          </button>
        )}
      </div>
      {readyUnits.length > 0 && (
        <p className="mb-2 text-label text-base-500" data-testid="wo-receiver-consequence">
          Recording the load moves the accepted Units to {card.logisticsPartner}. Name the person
          who actually receives them and attach proof.
        </p>
      )}
      {notCollected.length > 0 && (
        <div className="mb-2 space-y-0.5" data-testid="wo-not-collected">
          {notCollected.map((line) => (
            <p key={line} className="text-label text-base-600">
              {line}
            </p>
          ))}
        </div>
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
            <th className="py-1 pr-3 font-medium">Loaded</th>
            <th className="py-1 font-medium">Still to do</th>
          </tr>
        </thead>
        <tbody>
          {card.units.map((u) => (
            <UnitRow key={u.unitId} unit={u} />
          ))}
        </tbody>
      </table>
      {loadOpen && card.deliveryOrderId && (
        <RecordLoadedModal
          card={card}
          readyUnits={readyUnits}
          onClose={() => setLoadOpen(false)}
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

/** The evidence-backed loading record: pick the packed Units this batch
 *  physically moves, name the ACTUAL receiver, attach proof. A partial batch
 *  changes only the accepted Units — the server enforces every rule again. */
function RecordLoadedModal({
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
  const primaryLabel = warehouseRecordLoadedSentence(
    picked.size,
    receiver.trim() || (card.driverName ?? "").trim() || card.logisticsPartner,
  );

  return (
    <Modal title={`Record Units loaded — ${card.doNumber}`} onClose={onClose}>
      <div className="space-y-3 text-[13px]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
          <Field label="Logistics Partner" value={card.logisticsPartner} />
          <Field
            label="Assigned Driver"
            value={warehouseAssignedDriverLine(card.logisticsPartner, card.driverName)}
          />
        </div>
        <div>
          <div className="mb-1 text-label uppercase tracking-wide text-base-500">
            Units in this load
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
            Loaded to ({card.logisticsPartner})
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
        primary={primaryLabel}
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
                  `Loaded ${picked.size} of ${card.unitsRequired} Units to ${receiver.trim()}`,
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
