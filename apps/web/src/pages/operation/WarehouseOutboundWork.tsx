// The dated Warehouse work over outgoing arrangements, as a governed
// Register (unified Inbound/Outbound card, 2026-09-07).
import { blue } from "@radix-ui/colors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  buildOutboundRegisterView,
  warehouseEmptyDaySentence,
  DELIVERY_PHOTO_MAX_BYTES,
  DELIVERY_PHOTO_MIMES,
  HANDOVER_EVIDENCE_MAX_FILES,
  HANDOVER_EVIDENCE_VIDEO_MAX_BYTES,
  HANDOVER_EVIDENCE_VIDEO_MIMES,
  driverCollectedLine,
  outboundExceptionLines,
  outboundStatusWordOf,
  warehouseAssignedDriverLine,
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
import { apiFetch } from "@/lib/api";
import EvidenceUploadField, {
  type EvidenceEntry,
} from "@/components/EvidenceUploadField";
import {
  useDeliveryWarehouseSchedule,
  useRecordHandoverEvent,
  useRecordOutboundPrep,
} from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import ModuleHeader from "./components/ModuleHeader";
import { Modal, ModalActions } from "./components/Modal";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";

/**
 * WAREHOUSE — OUTBOUND: one row = one dated pickup arrangement (one DO
 * scope), in the same Register grammar as Inbound: Destination Header, one
 * toolbar row, 240px rail, wrap-not-truncate Product and Exceptions columns,
 * explicit clicks only.
 *
 * From the menu the Register lists EVERY unfinished arrangement under its
 * original date; a Monitor card inherits its exact date, Site and DO scope.
 * The rail counts, the listed rows, the footer totals and the export all
 * read one shared filter pipeline — a `Loaded 1` beside an empty day can no
 * longer happen, because both numbers describe the same scope.
 *
 * The three quantities stay three facts, per product and per Unit:
 *
 *   Required           the DO scope
 *   Warehouse loaded   what the identified operator scanned and submitted
 *   Driver confirmed   what the Logistics side itself confirmed receiving
 *
 * Only matching exact-Unit evidence changes `Who has it` (the server's
 * rule). The governed acts — scan, check, pack, record loaded — live inside
 * the expansion, the arrangement's own detail; the row itself acts nowhere.
 */


/** Below Tailwind's `md` the 45px toolbar cannot hold the date controls in
 *  one row — they move into the Filters drawer (the mobile filter surface). */
function useIsNarrow(): boolean {
  const query = "(max-width: 767px)";
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}

const STATUSES = [
  ["open", "Not finished"],
  ["loaded", "Loaded"],
  ["no-evidence", "Evidence not submitted"],
  ["all", "All pickups"],
] as const;

export default function WarehouseOutboundWork() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const selectedDo = params.get("do");
  /* Menu default = every unfinished arrangement; an exact Monitor deep link
     must show its arrangement even when the work is already done. */
  const effectiveView = params.get("view") ?? (selectedDo ? "all" : "open");

  const { data, isLoading, error, refetch } = useDeliveryWarehouseSchedule();
  const allCards = useMemo(
    () =>
      warehouseOutboundCards(
        (data?.events ?? []) as DeliveryWarehouseScheduleEvent[],
      ),
    [data],
  );
  const view = useMemo(() => {
    const p = new URLSearchParams(params);
    p.set("view", effectiveView);
    return buildOutboundRegisterView(allCards, p);
  }, [allCards, params, effectiveView]);
  const siteNames = useMemo(
    () =>
      [...new Set(allCards.map((c) => c.fromLocation))]
        .filter((s) => s && s !== "Not recorded")
        .sort(),
    [allCards],
  );

  const [showFilters, setShowFilters] = useState(false);
  const [railHidden, setRailHidden] = useState(false);
  const isNarrow = useIsNarrow();
  const root = useRef<HTMLDivElement>(null);
  const scrollKey = `outbound-scroll:${params.toString()}`;
  useEffect(() => {
    if (isLoading) return;
    const scroll =
      root.current?.querySelector<HTMLElement>('[data-testid="grid-scroll"]');
    if (scroll)
      scroll.scrollTop = Number(sessionStorage.getItem(scrollKey) ?? 0);
  }, [isLoading, scrollKey]);

  const setFilter = useCallback(
    (key: string, value: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const onSearch = useCallback(
    (value: string) => setFilter("q", value),
    [setFilter],
  );

  const columns = useMemo<DataGridColumn<WarehouseOutboundCard>[]>(
    () => [
      {
        key: "date",
        label: "Scheduled handover",
        width: 140,
        wrap: true,
        searchValue: (c) => c.eventDate,
        accessor: (c) => (
          <div className="py-0.5 leading-[18px]">
            <div>{fmtDate(c.eventDate)}</div>
            <div className="text-base-500">
              {c.expectedCollectionWindow
                ? `Driver pickup ${c.expectedCollectionWindow}`
                : "Time not provided"}
            </div>
          </div>
        ),
      },
      {
        key: "document",
        label: "Document",
        width: 150,
        wrap: true,
        searchValue: (c) => `DO No ${c.doNumber} ${c.source}`,
        accessor: (c) => (
          <div className="py-0.5 leading-[18px]">
            <div className="text-label uppercase tracking-wide text-base-400">
              DO No
            </div>
            <Link
              className="font-mono text-kit-blue-11 hover:underline"
              onClick={(e) => e.stopPropagation()}
              to={c.deliveryOrderHref}
              data-testid={`outbound-document-${c.doNumber}`}
            >
              {c.doNumber}
            </Link>
          </div>
        ),
      },
      {
        key: "products",
        label: "Product",
        width: 230,
        wrap: true,
        searchValue: (c) =>
          c.products
            .map((x) => `${x.name ?? ""} ${x.sku ?? ""}`)
            .concat(c.units.map((u) => u.unitId))
            .join(" "),
        accessor: (c) =>
          c.products.length === 0 ? (
            <span>Products not recorded</span>
          ) : (
            <div className="space-y-0.5 py-0.5 leading-[18px]">
              {c.products.map((x) => (
                <div key={x.sku ?? "no-sku"}>
                  {x.name ?? x.sku ?? "Product not recorded"}
                  {x.name && x.sku ? (
                    <span className="text-base-500"> · {x.sku}</span>
                  ) : null}
                  <span className="tabular-nums"> × {x.qty}</span>
                </div>
              ))}
            </div>
          ),
      },
      {
        key: "from",
        label: "From",
        width: 140,
        wrap: true,
        searchValue: (c) => c.fromLocation,
        accessor: (c) => c.fromLocation,
      },
      {
        key: "to",
        label: "To",
        width: 190,
        wrap: true,
        searchValue: (c) => c.toCustomer,
        accessor: (c) => c.toCustomer,
      },
      {
        key: "partner",
        label: "Logistics Partner",
        width: 125,
        searchValue: (c) => c.logisticsPartner,
        accessor: (c) => c.logisticsPartner,
      },
      {
        key: "driver",
        label: "Assigned Driver",
        width: 150,
        wrap: true,
        searchValue: (c) => c.driverName ?? "",
        accessor: (c) => (
          <span data-testid={`wo-driver-${c.doNumber}`}>
            {warehouseAssignedDriverLine(c.logisticsPartner, c.driverName)}
          </span>
        ),
      },
      {
        key: "tally",
        label: "Units",
        width: 165,
        wrap: true,
        accessor: (c) => (
          <div
            className="py-0.5 tabular-nums leading-[18px]"
            data-testid={`outbound-tally-${c.doNumber}`}
          >
            <div>
              Required {c.unitsRequired} · Loaded {c.handedOver}
            </div>
            <div>Not loaded {c.notHandedOver}</div>
            <div>Driver confirmed {c.driverConfirmed}</div>
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        width: 125,
        searchValue: (c) => outboundStatusWordOf(c),
        accessor: (c) => outboundStatusWordOf(c),
      },
      {
        key: "exceptions",
        label: "Exceptions",
        width: 230,
        wrap: true,
        searchValue: (c) => outboundExceptionLines(c, today, fmtDate).join(" "),
        accessor: (c) => {
          const lines = outboundExceptionLines(c, today, fmtDate);
          return lines.length === 0 ? (
            ""
          ) : (
            <div className="space-y-0.5 py-0.5 leading-[18px]">
              {lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          );
        },
      },
      {
        key: "so",
        label: "SO No",
        defaultHidden: true,
        width: 110,
        accessor: (c) => (
          <Link
            className="font-mono text-kit-blue-11 hover:underline"
            onClick={(e) => e.stopPropagation()}
            to={c.sourceHref}
          >
            {c.source}
          </Link>
        ),
      },
      {
        key: "soDate",
        label: "SO date",
        defaultHidden: true,
        width: 110,
        accessor: (c) => (c.soDate ? fmtDate(c.soDate) : ""),
      },
      {
        key: "vehicle",
        label: "Vehicle",
        defaultHidden: true,
        width: 110,
        accessor: (c) => c.vehicle ?? "",
      },
      {
        key: "loadedAt",
        label: "Loaded at",
        defaultHidden: true,
        width: 150,
        accessor: (c) =>
          c.actualHandoverAt ? fmtDate(c.actualHandoverAt, { time: true }) : "",
      },
      {
        key: "collectedAt",
        label: "Driver collected at",
        defaultHidden: true,
        width: 150,
        accessor: (c) =>
          c.actualCollectionAt
            ? fmtDate(c.actualCollectionAt, { time: true })
            : "",
      },
    ],
    [today],
  );

  const context = params.get("date") || params.get("from");
  /* One exact date keeps the governed empty sentence; a range or other
     filters say what they are. */
  const exactDate =
    params.get("date") ||
    (params.get("from") &&
    (!params.get("to") || params.get("to") === params.get("from"))
      ? params.get("from")
      : null);
  const empty = exactDate
    ? warehouseEmptyDaySentence(fmtDate(exactDate))
    : effectiveView === "open" && !context && !params.get("q") && !selectedDo
      ? "No unfinished pickups. Every arranged pickup is loaded."
      : "No pickups match these filters.";

  const dateControls = (
    <>
      <label className="text-meta">
        From{" "}
        <input
          className="h-7 rounded-control border border-kit-slate-5 px-2"
          type="date"
          aria-label="Handover from"
          value={params.get("date") || params.get("from") || ""}
          onChange={(e) => {
            setParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                p.delete("date");
                if (e.target.value) p.set("from", e.target.value);
                else p.delete("from");
                return p;
              },
              { replace: true },
            );
          }}
        />
      </label>
      <label className="text-meta">
        To{" "}
        <input
          className="h-7 rounded-control border border-kit-slate-5 px-2"
          type="date"
          aria-label="Handover to"
          min={params.get("date") || params.get("from") || undefined}
          value={params.get("to") || ""}
          onChange={(e) => setFilter("to", e.target.value)}
        />
      </label>
      <button
        className="h-7 px-2 text-body text-kit-blue-11"
        onClick={() =>
          setParams({ tab: "warehouse-outbound" }, { replace: true })
        }
      >
        Clear filters
      </button>
    </>
  );
  return (
    <div
      ref={root}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="warehouse-outbound"
      onScrollCapture={(e) => {
        const el = e.target as HTMLElement;
        if (el.getAttribute("data-testid") === "grid-scroll")
          sessionStorage.setItem(scrollKey, String(el.scrollTop));
      }}
    >
      <ModuleHeader
        testId="warehouse-outbound-header"
        word="Outbound"
        docTitle="Outbound · Warehouse — Carres"
        destinationHeader
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          className={`${showFilters ? "flex" : "hidden"} min-h-0 shrink-0 ${railHidden ? "md:hidden" : "md:flex"}`}
        >
          <FilterRail
            testId="wo-rail"
            onHide={() => {
              setRailHidden(true);
              setShowFilters(false);
            }}
          >
            {isNarrow && (
              <div className="flex flex-wrap items-center gap-2">
                {dateControls}
              </div>
            )}
            <FilterRailGroup title="PICKUP STATUS">
              {STATUSES.map(([value, label]) => (
                <FilterRailRow
                  key={value}
                  label={label}
                  active={effectiveView === value}
                  count={
                    isLoading || error ? undefined : view.facets.view[value] ?? 0
                  }
                  testId={`wo-view-${value}`}
                  onClick={() => {
                    setFilter("view", value);
                    setShowFilters(false);
                  }}
                />
              ))}
            </FilterRailGroup>
            {siteNames.length > 1 && (
              <FilterRailGroup title="SITE">
                {siteNames.map((name) => (
                  <FilterRailRow
                    key={name}
                    label={name}
                    active={params.get("site") === name}
                    count={
                      isLoading || error
                        ? undefined
                        : view.facets.site[name] ?? 0
                    }
                    testId={`wo-site-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    onClick={() => {
                      setFilter(
                        "site",
                        params.get("site") === name ? "" : name,
                      );
                      setShowFilters(false);
                    }}
                  />
                ))}
              </FilterRailGroup>
            )}
          </FilterRail>
        </div>
        <div
          className={`${showFilters ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col p-2`}
        >
          {error ? (
            <div
              role="alert"
              className="flex flex-1 flex-col items-center justify-center gap-3 bg-white"
            >
              <p>Outbound could not be opened</p>
              <p>{error.message}</p>
              <button
                className="rounded-control border border-base-200 px-3 py-1.5 text-body"
                onClick={() => void refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <DataGrid<WarehouseOutboundCard>
              stickyIdentity={{ columnKey: "document" }}
              key={params.get("q") === null ? "clear" : "search"}
              appearance="reference"
              rows={view.rows}
              columns={columns}
              rowKey={(c) => c.doNumber}
              rowTestId={(c) => `wo-row-${c.doNumber}`}
              storageKey="carres.outbound.register.v1"
              exportName="Outbound"
              searchPlaceholder="DO, SO, product, customer, driver or Unit ID…"
              initialSearch={params.get("q") ?? ""}
              onSearchChange={onSearch}
              isLoading={isLoading}
              groupBanner={false}
              emptyMessage={empty}
              rowStyle={(c) =>
                selectedDo === c.doNumber
                  ? { background: blue.blue3 }
                  : undefined
              }
              toolbarStart={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint md:hidden"
                    onClick={() => setShowFilters((v) => !v)}
                    data-testid="wo-toggle-filters"
                  >
                    <PanelLeftOpen size={14} /> Filters
                  </button>
                  {railHidden && (
                    <button
                      type="button"
                      className="hidden h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint md:inline-flex"
                      onClick={() => setRailHidden(false)}
                      data-testid="wo-show-filters"
                    >
                      <PanelLeftClose size={14} /> Show filters
                    </button>
                  )}
                  <Link
                    to={`/operation?${(() => {
                      const back = new URLSearchParams(params);
                      back.set("tab", "warehouse-monitor");
                      back.delete("do");
                      back.delete("view");
                      back.delete("q");
                      return back.toString();
                    })()}`}
                    className="text-meta text-base-600 underline-offset-2 hover:underline"
                    data-testid="wo-back-monitor"
                  >
                    ← Monitor
                  </Link>
                  {!isNarrow && dateControls}
                  {selectedDo && (
                    <span className="text-meta" data-testid="wo-do-context">
                      Document: {selectedDo}
                    </span>
                  )}
                </div>
              }
              expandTitle="Show every product and Unit"
              expandable={{
                trigger: { columnKey: "products" },
                testId: (c) => `wo-row-toggle-${c.doNumber}`,
                defaultExpandedKeys: selectedDo ? [selectedDo] : [],
                renderExpansion: (c) => <OutboundUnitWork card={c} />,
              }}
              statusSummary={(visible) => {
                const cards = visible as WarehouseOutboundCard[];
                const required = cards.reduce((n, c) => n + c.unitsRequired, 0);
                const loaded = cards.reduce((n, c) => n + c.handedOver, 0);
                const confirmed = cards.reduce(
                  (n, c) => n + c.driverConfirmed,
                  0,
                );
                return (
                  <span data-testid="wo-range-summary">
                    {cards.length} pickup arrangement
                    {cards.length === 1 ? "" : "s"} · Units: Required {required}{" "}
                    · Loaded {loaded} · Driver confirmed {confirmed}
                  </span>
                );
              }}
            />
          )}
        </div>
      </div>
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

  const operator =
    card.units
      .filter((u) => u.unitHandedOverAt)
      .map((u) => u.unitWarehouseOperator)
      .find(Boolean) ?? null;
  return (
    <div className="border-t border-kit-slate-5 px-3 py-2" data-testid={`wo-units-${card.doNumber}`}>
      <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
        Goods scheduled for pickup
      </div>
      {/* The two evidence records, never merged (§8): the Warehouse's own
          submission and the driver's independent confirmation. */}
      <div className="mb-2 space-y-0.5 text-meta text-base-600">
        <p data-testid={`wo-loaded-${card.doNumber}`}>
          {warehouseLoadedLine(card)}
          {operator ? ` · recorded by ${operator}` : ""}
          {card.handedOver > 0
            ? card.evidenceNotSubmitted
              ? " · evidence not submitted"
              : " · evidence submitted"
            : ""}
        </p>
        <p data-testid={`wo-collected-${card.doNumber}`}>
          {/* A per-Unit confirmation IS a confirmation — the sentence may
              never say `not confirmed yet` beside a confirmed count. */}
          {card.driverConfirmed > 0
            ? `${(card.driverName ?? "").trim() || card.logisticsPartner} confirmed ${card.driverConfirmed} of ${card.unitsRequired} Units`
            : driverCollectedLine(card)}
        </p>
        {card.vehicle && <p>Vehicle {card.vehicle}</p>}
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
            <th className="py-1 pr-3 font-medium">Driver confirmed</th>
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
      <td
        className="py-1.5 pr-3 text-base-600"
        data-testid={`wo-unit-confirmed-${unit.unitId}`}
      >
        {at(unit.unitDriverConfirmedAt)}
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
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);

  /* The server names every object key; the field only carries the file. */
  const signEvidence = useCallback(
    (file: File) =>
      apiFetch<{ token: string; path: string }>(
        `/api/operation/delivery-orders/${encodeURIComponent(doId)}/handover-proof/sign-upload`,
        {
          method: "POST",
          body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
        },
      ),
    [doId],
  );

  const canSubmit =
    picked.size > 0 &&
    receiver.trim().length > 0 &&
    evidence.length > 0 &&
    !record.isPending;
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
            Proof — photos and videos of the loaded goods
          </span>
          <div className="mt-0.5" data-testid="wo-proof">
            <EvidenceUploadField
              entries={evidence}
              onChange={setEvidence}
              sign={signEvidence}
              bucket="proof-of-delivery"
              imageMimes={DELIVERY_PHOTO_MIMES}
              videoMimes={HANDOVER_EVIDENCE_VIDEO_MIMES}
              imageMaxBytes={DELIVERY_PHOTO_MAX_BYTES}
              videoMaxBytes={HANDOVER_EVIDENCE_VIDEO_MAX_BYTES}
              maxFiles={HANDOVER_EVIDENCE_MAX_FILES}
              ariaLabel="Loading evidence"
              testId="wo-evidence"
            />
          </div>
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
              evidence,
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
