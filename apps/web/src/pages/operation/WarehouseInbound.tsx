import { blue } from "@radix-ui/colors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  ARRIVAL_SOURCE_TYPES,
  filterInbound,
  inboundStatusMatches,
  type InboundArrival,
} from "@carres/shared";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import ModuleHeader from "./components/ModuleHeader";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";
import { useWarehouseInbound } from "./useWarehouseInbound";
const STATUSES = [
  ["all", "All arrivals"],
  ["expected", "Expected"],
  ["part-received", "Part received"],
  ["received", "Received"],
  ["with-issue", "With issue"],
] as const;
function receivingHref(r: InboundArrival) {
  // Remaining work always opens the PO's governed Receiving workspace, never an old completed session.
  const p = new URLSearchParams({ tab: "receiving" });
  if (r.sourceType !== "supplier-delivery") {
    p.set("arrival", r.sourceId);
    return `/operation?${p}`;
  }
  if (r.sessionId && r.remaining === 0 && !r.identitiesMissing)
    p.set("session", r.sessionId);
  else p.set("po", r.sourceId);
  return `/operation?${p}`;
}
export default function WarehouseInbound() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = useWarehouseInbound();
  const all = q.data?.arrivals ?? [];
  const rows = useMemo(() => filterInbound(all, params), [all, params]);
  const [showFilters, setShowFilters] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const scrollKey = `inbound-scroll:${params.toString()}`;
  useEffect(() => {
    if (q.isLoading) return;
    const scroll =
      root.current?.querySelector<HTMLElement>('[data-testid="grid-scroll"]') ??
      root.current?.querySelector<HTMLElement>(".overflow-auto");
    if (scroll)
      scroll.scrollTop = Number(sessionStorage.getItem(scrollKey) ?? 0);
  }, [q.isLoading, scrollKey]);
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
  const columns = useMemo<DataGridColumn<InboundArrival>[]>(
    () => [
      {
        key: "date",
        label: "Expected arrival",
        width: 120,
        searchValue: (r) => r.date ?? "",
        accessor: (r) => (
          <span>{r.date ? fmtDate(r.date) : "Date not recorded"}</span>
        ),
      },
      {
        key: "source",
        label: "Source",
        width: 125,
        searchValue: (r) => `${r.sourceNo ?? ""} ${r.sourceId}`,
        accessor: (r) => (
          <Link
            className="text-kit-blue-11 hover:underline"
            onClick={(event) => event.stopPropagation()}
            to={
              r.sourceType === "supplier-delivery"
                ? receivingHref(r)
                : `/operation?tab=arrival-source&arrival=${r.sourceId}`
            }
          >
            {r.sourceNo ?? r.sourceId}
          </Link>
        ),
      },
      {
        key: "party",
        label: "Supplier/source party",
        width: 140,
        searchValue: (r) => r.party ?? "",
        accessor: (r) => r.party ?? "Not recorded",
      },
      {
        key: "site",
        label: "Destination",
        width: 120,
        searchValue: (r) => r.site,
        accessor: (r) => r.site,
      },
      {
        key: "tally",
        label: "Units",
        width: 165,
        accessor: (r) => (
          <div className="py-1 tabular-nums text-meta">
            {r.identitiesMissing ? (
              "Unit results need checking"
            ) : (
              <>
                <div>
                  Expected {r.expected} · Received {r.received}
                </div>
                <div>Not yet received {r.remaining}</div>
                <div>With issue {r.issues}</div>
              </>
            )}
          </div>
        ),
      },
      ...(["expected", "received", "remaining", "issues"] as const).map(
        (key) => ({
          key,
          defaultHidden: true,
          label: {
            expected: "Expected",
            received: "Received",
            remaining: "Not yet received",
            issues: "With issue",
          }[key],
          width: key === "remaining" ? 125 : 90,
          align: "right" as const,
          accessor: (r: InboundArrival) =>
            r.identitiesMissing ? "Not recorded" : String(r[key]),
        }),
      ),
      {
        key: "work",
        label: "Work",
        width: 220,
        searchValue: (r) => r.units.map((u) => u.code).join(" "),
        accessor: (r) => (
          <div className="py-1 text-meta">
            <div>
              {r.identitiesMissing
                ? "Check Units in Receiving"
                : r.remaining > 0
                  ? `${r.remaining} ${r.remaining === 1 ? "Unit" : "Units"} not yet received`
                  : r.issues > 0
                    ? `${r.issues} ${r.issues === 1 ? "Unit" : "Units"} received with issue`
                    : "All listed Units received"}
            </div>
            {r.date &&
              r.date < appTodayIso() &&
              r.received === 0 &&
              !r.identitiesMissing && (
                <div>
                  Expected arrival was {fmtDate(r.date)}. No posted Receiving
                  result.
                </div>
              )}
            {r.handoverGaps?.map(g=><div key={g.unitId}>{r.units.find(u=>u.id===g.unitId)?.code} · {g.originMissing?"Origin handover not recorded":"Delivery party receipt not recorded"}</div>)}
            {r.units.filter(u=>u.receivedSite && u.receivedSite!==r.site).map(u=><div key={`site-${u.id}`}>{u.code} · Received at {u.receivedSite}</div>)}
            {r.units
              .filter((u) => u.outcome === "received_with_issue")
              .map((u) => (
                <div key={u.id}>
                  {u.code} ·{" "}
                  {u.issue === "wrong_item" ? "Wrong item" : "Damaged"}
                </div>
              ))}
            <Link
              className="text-kit-blue-11 hover:underline"
              onClick={(event) => event.stopPropagation()}
              to={receivingHref(r)}
            >
              Open Receiving Session
            </Link>
          </div>
        ),
      },
      {
        key: "poDate",
        label: "PO date",
        defaultHidden: true,
        width: 140,
        accessor: (r) => (r.poDate ? fmtDate(r.poDate) : ""),
      },
      {
        key: "so",
        label: "SO No",
        defaultHidden: true,
        width: 100,
        accessor: (r) => r.so ?? "",
      },
    ],
    [],
  );
  const context = params.get("date") || params.get("from");
  const dateContext = context
    ? ` for ${fmtDate(context)}${params.get("to") ? ` — ${fmtDate(params.get("to")!)}` : ""}`
    : params.get("to")
      ? ` through ${fmtDate(params.get("to")!)}`
      : "";
  const empty = `No arrivals match these filters${dateContext}.`;
  return (
    <div
      ref={root}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="warehouse-inbound"
      onScrollCapture={(e) => {
        const el = e.target as HTMLElement;
        if (el.getAttribute("data-testid") === "grid-scroll")
          sessionStorage.setItem(scrollKey, String(el.scrollTop));
      }}
    >
      <ModuleHeader
        testId="inbound-header"
        word="Inbound"
        docTitle="Inbound · Warehouse — Carres"
        destinationHeader
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-kit-slate-5 bg-white px-3 py-2">
        <button
          className="rounded-control border border-kit-slate-5 px-2 py-1 text-body md:hidden"
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters
        </button>
        <label className="text-meta">
          From{" "}
          <input
            className="rounded-control border border-kit-slate-5 px-2 py-1"
            type="date"
            aria-label="Arrival from"
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
            className="rounded-control border border-kit-slate-5 px-2 py-1"
            type="date"
            aria-label="Arrival to"
            min={params.get("date") || params.get("from") || undefined}
            value={params.get("to") || ""}
            onChange={(e) => setFilter("to", e.target.value)}
          />
        </label>
        <button
          className="px-2 py-1 text-body text-kit-blue-11"
          onClick={() =>
            setParams({ tab: "warehouse-inbound" }, { replace: true })
          }
        >
          Clear filters
        </button>
        {params.get("source") && (
          <span className="text-meta">Source: {params.get("source")}</span>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          className={`${showFilters ? "flex" : "hidden"} min-h-0 shrink-0 md:flex`}
        >
          <FilterRail testId="inbound-rail">
            <FilterRailGroup title="ARRIVAL STATUS">
              {STATUSES.map(([value, label]) => (
                <FilterRailRow
                  key={value}
                  label={label}
                  active={(params.get("status") || "all") === value}
                  count={
                    q.isLoading || q.error
                      ? undefined
                      : filterInbound(all, params, "status").filter((r) =>
                          inboundStatusMatches(r, value),
                        ).length
                  }
                  testId={`inbound-status-${value}`}
                  onClick={() => {
                    setFilter("status", value === "all" ? "" : value);
                    setShowFilters(false);
                  }}
                />
              ))}
            </FilterRailGroup>
            <FilterRailGroup title="SOURCE TYPE">
              {ARRIVAL_SOURCE_TYPES.map(([type, label]) => (
                <FilterRailRow
                  key={type}
                  label={label}
                  active={params.get("sourceType") === type}
                  count={
                    q.isLoading || q.error
                      ? undefined
                      : filterInbound(all, params, "sourceType").filter(
                          (r) => r.sourceType === type,
                        ).length
                  }
                  testId={
                    type === "supplier-delivery"
                      ? "inbound-source-supplier"
                      : `inbound-source-${type}`
                  }
                  onClick={() => {
                    setFilter(
                      "sourceType",
                      params.get("sourceType") === type ? "" : type,
                    );
                    setShowFilters(false);
                  }}
                />
              ))}
            </FilterRailGroup>
            <FilterRailGroup title="SITE">
              {(q.data?.sites ?? []).map((site) => (
                <FilterRailRow
                  key={site.id}
                  label={site.name}
                  active={params.get("site") === site.id}
                  count={
                    q.isLoading || q.error
                      ? undefined
                      : filterInbound(all, params, "site").filter(
                          (r) => r.siteId === site.id,
                        ).length
                  }
                  testId={`inbound-site-${site.id}`}
                  onClick={() => {
                    setFilter(
                      "site",
                      params.get("site") === site.id ? "" : site.id,
                    );
                    setShowFilters(false);
                  }}
                />
              ))}
            </FilterRailGroup>
          </FilterRail>
        </div>
        <div
          className={`${showFilters ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col p-2`}
        >
          {!q.error && q.data?.unresolvedSources?.length ? (
            <div
              role="status"
              className="border-b border-kit-slate-5 bg-white p-3 text-body"
            >
              These sources have different destination instructions. Check their
              exact Units in Receiving:{" "}
              {q.data.unresolvedSources.map((id) => (
                <Link
                  key={id}
                  className="ml-2 text-kit-blue-11 hover:underline"
                  to={`/operation?${new URLSearchParams({ tab: "receiving", po: id })}`}
                >
                  {id}
                </Link>
              ))}
            </div>
          ) : null}
          {q.error ? (
            <div
              role="alert"
              className="flex flex-1 flex-col items-center justify-center gap-3 bg-white"
            >
              <p>Inbound could not be opened</p>
              <p>{q.error.message}</p>
              <button
                className="rounded-control border border-base-200 px-3 py-1.5 text-body"
                onClick={() => void q.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <DataGrid<InboundArrival>
              stickyIdentity={{ columnKey: "source" }}
              key={params.get("q") === null ? "clear" : "search"}
              appearance="reference"
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              rowTestId={(r) => `inbound-row-${r.id}`}
              storageKey="carres.inbound.register.v1"
              onRowClick={(r) => navigate(receivingHref(r))}
              exportName="Inbound"
              searchPlaceholder="Source, supplier or Unit ID…"
              initialSearch={params.get("q") ?? ""}
              onSearchChange={onSearch}
              isLoading={q.isLoading}
              groupBanner={false}
              emptyMessage={empty}
              rowStyle={(r) =>
                params.get("source") === r.sourceId
                  ? { background: blue.blue3 }
                  : undefined
              }
              expandTitle="View Unit results"
              expandable={{
                renderExpansion: (r) => (
                  <div className="space-y-1 p-3 text-body">
                    {r.identitiesMissing && (
                      <p>
                        Unit IDs or Receiving results are not fully recorded.
                        Open Receiving Session to check the source.
                      </p>
                    )}
                    {r.units.map((u) => (
                      <div key={u.id} className="flex flex-wrap gap-3">
                        <Link
                          className="font-mono text-kit-blue-11"
                          to={`/operation/stock/unit/${encodeURIComponent(u.code)}`}
                        >
                          {u.code}
                        </Link>
                        <span>
                          {u.outcome === "received"
                            ? "Received"
                            : u.outcome === "received_with_issue"
                              ? `Received with issue · ${u.issue === "wrong_item" ? "Wrong item" : "Damaged"}`
                              : u.outcome === "unknown"
                                ? "Receiving result not recorded"
                                : "Not yet received"}
                        </span>
                      </div>
                    ))}
                  </div>
                ),
              }}
              statusSummary={(visible) => (
                <span>
                  {visible.length} arrival{" "}
                  {visible.length === 1 ? "record" : "records"}
                </span>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
