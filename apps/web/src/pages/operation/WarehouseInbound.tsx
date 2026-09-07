import { blue } from "@radix-ui/colors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  ARRIVAL_SOURCE_TYPES,
  inboundExceptionLines,
  inboundStatusWordOf,
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

/**
 * WAREHOUSE — INBOUND (unified Inbound/Outbound card, 2026-09-07).
 *
 * One row = one dated arrival arrangement with its own goods scope. The main
 * list carries every fact the operator needs to judge the arrival — Document,
 * every Product, From, To, the date, the three counts, one progress word and
 * the exceptions beside it. Completeness outranks row height: the Product and
 * Exceptions columns wrap, never truncate.
 *
 * Clicks are explicit: the Document number opens the document; the Product
 * cell (arrow + content, ONE entry) expands the row; a Unit ID inside the
 * expansion opens that Unit's record. The row itself navigates nowhere.
 * Receiving stays the only receipt writer — the one action door here is
 * `Open Receiving Session`, inside the expansion.
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
  ["expected", "Expected"],
  ["part-received", "Part received"],
  ["received", "Received"],
  ["with-issue", "With issue"],
  ["all", "All arrivals"],
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

/** The Document number opens the DOCUMENT — never the work surface. */
function documentHref(r: InboundArrival) {
  if (r.sourceType === "supplier-delivery")
    return `/operation/procurement?po=${encodeURIComponent(r.sourceId)}`;
  return `/operation?tab=arrival-source&arrival=${encodeURIComponent(r.sourceId)}`;
}

export default function WarehouseInbound() {
  const [params, setParams] = useSearchParams();
  const [offset, setOffset] = useState(0);
  /* From the menu the register shows every UNFINISHED arrangement under its
     original date; an exact Monitor deep link (`source=…`) must show that
     arrangement even when it is already finished, so the default widens. */
  const effectiveStatus =
    params.get("status") ?? (params.get("source") || params.get("po") ? "all" : "open");
  const queryParams = useMemo(() => {
    const p = new URLSearchParams(params);
    /* Monitor's ARRIVAL card names the PO as `po`; the register's own
       contract is `source`. One scope, two spellings — honour both. */
    if (p.get("po") && !p.get("source")) p.set("source", p.get("po")!);
    p.delete("po");
    if (effectiveStatus === "all") p.delete("status");
    else p.set("status", effectiveStatus);
    return p;
  }, [params, effectiveStatus]);
  const q = useWarehouseInbound(queryParams, offset);
  const rows = q.data?.arrivals ?? [];
  const page = q.data?.page ?? { offset: 0, limit: 50, total: 0 };
  const facets = q.data?.facets ?? { status: {}, sourceType: {}, site: {} };
  const [showFilters, setShowFilters] = useState(false);
  const [railHidden, setRailHidden] = useState(false);
  const isNarrow = useIsNarrow();
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
  const filterKey = [
    params.get("status"), params.get("sourceType"), params.get("site"),
    params.get("source"), params.get("po"), params.get("date"),
    params.get("from"), params.get("to"), params.get("q"),
  ].join("|");
  useEffect(() => setOffset(0), [filterKey]);
  const onSearch = useCallback(
    (value: string) => setFilter("q", value),
    [setFilter],
  );
  const today = appTodayIso();
  const columns = useMemo<DataGridColumn<InboundArrival>[]>(
    () => [
      {
        key: "document",
        label: "Document",
        width: 150,
        searchValue: (r) => `${r.documentWord} ${r.documentNo} ${r.sourceId}`,
        accessor: (r) => (
          <div className="py-0.5 leading-[18px]">
            <div className="text-label uppercase tracking-wide text-base-400">
              {r.documentWord}
            </div>
            <Link
              className="font-mono text-kit-blue-11 hover:underline"
              onClick={(event) => event.stopPropagation()}
              to={documentHref(r)}
              data-testid={`inbound-document-${r.id}`}
            >
              {r.documentNo}
            </Link>
          </div>
        ),
        wrap: true,
      },
      {
        key: "products",
        label: "Product",
        width: 230,
        wrap: true,
        searchValue: (r) =>
          r.products
            .map((p) => `${p.name ?? ""} ${p.sku ?? ""}`)
            .concat(r.units.map((u) => u.code))
            .join(" "),
        accessor: (r) =>
          r.products.length === 0 ? (
            <span>Products not recorded</span>
          ) : (
            <div className="space-y-0.5 py-0.5 leading-[18px]">
              {r.products.map((p) => (
                <div key={p.sku ?? "no-sku"}>
                  {p.name ?? p.sku ?? "Product not recorded"}
                  {p.name && p.sku ? (
                    <span className="text-base-500"> · {p.sku}</span>
                  ) : null}
                  <span className="tabular-nums"> × {p.qty}</span>
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
        searchValue: (r) => r.from,
        accessor: (r) => r.from,
      },
      {
        key: "site",
        label: "To",
        width: 120,
        wrap: true,
        searchValue: (r) => r.site,
        accessor: (r) => r.site,
      },
      {
        key: "date",
        label: "Expected arrival",
        width: 125,
        searchValue: (r) => r.date ?? "",
        accessor: (r) => (
          <span>{r.date ? fmtDate(r.date) : "Date not recorded"}</span>
        ),
      },
      {
        key: "receivedOn",
        label: "Received on",
        width: 120,
        accessor: (r) => {
          const last = r.sessions.at(-1)?.receivedAt;
          if (!last || r.received === 0) return "";
          return (
            <span>
              {fmtDate(last)}
              {r.sessions.length > 1 ? ` · ${r.sessions.length} receipts` : ""}
            </span>
          );
        },
      },
      {
        key: "tally",
        label: "Units",
        width: 165,
        wrap: true,
        accessor: (r) => (
          <div className="py-0.5 tabular-nums leading-[18px]">
            {r.identitiesMissing ? (
              "Unit results need checking"
            ) : (
              <>
                <div>
                  Expected {r.expected} · Received {r.received}
                </div>
                <div>Not yet received {r.remaining}</div>
                {/* With issue counts INSIDE received — 4 received, 1 damaged
                    stays 4, never 5. */}
                {r.issues > 0 && <div>With issue {r.issues} of {r.received}</div>}
              </>
            )}
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        width: 140,
        searchValue: (r) => inboundStatusWordOf(r),
        accessor: (r) => inboundStatusWordOf(r),
      },
      {
        key: "exceptions",
        label: "Exceptions",
        width: 230,
        wrap: true,
        searchValue: (r) => inboundExceptionLines(r, today, fmtDate).join(" "),
        accessor: (r) => {
          const lines = inboundExceptionLines(r, today, fmtDate);
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
    [today],
  );
  const context = params.get("date") || params.get("from");
  const dateContext = context
    ? ` for ${fmtDate(context)}${params.get("to") ? ` — ${fmtDate(params.get("to")!)}` : ""}`
    : params.get("to")
      ? ` through ${fmtDate(params.get("to")!)}`
      : "";
  const empty =
    effectiveStatus === "open" && !context && !params.get("q")
      ? "No unfinished arrivals. Every arranged arrival is received."
      : `No arrivals match these filters${dateContext}.`;
  const activeSource = params.get("source") || params.get("po");
  const dateControls = (
    <>
      <label className="text-meta">
        From{" "}
        <input
          className="h-7 rounded-control border border-kit-slate-5 px-2"
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
          className="h-7 rounded-control border border-kit-slate-5 px-2"
          type="date"
          aria-label="Arrival to"
          min={params.get("date") || params.get("from") || undefined}
          value={params.get("to") || ""}
          onChange={(e) => setFilter("to", e.target.value)}
        />
      </label>
      <button
        className="h-7 px-2 text-body text-kit-blue-11"
        onClick={() =>
          setParams({ tab: "warehouse-inbound" }, { replace: true })
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
      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          className={`${showFilters ? "flex" : "hidden"} min-h-0 shrink-0 ${railHidden ? "md:hidden" : "md:flex"}`}
        >
          <FilterRail
            testId="inbound-rail"
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
            <FilterRailGroup title="ARRIVAL STATUS">
              {STATUSES.map(([value, label]) => (
                <FilterRailRow
                  key={value}
                  label={label}
                  active={effectiveStatus === value}
                  count={
                    q.isLoading || q.error
                      ? undefined
                      : facets.status[value] ?? 0
                  }
                  testId={`inbound-status-${value}`}
                  onClick={() => {
                    setFilter("status", value);
                    setShowFilters(false);
                  }}
                />
              ))}
            </FilterRailGroup>
            <FilterRailGroup title="DOCUMENT TYPE">
              {ARRIVAL_SOURCE_TYPES.map(([type, label]) => (
                <FilterRailRow
                  key={type}
                  label={label}
                  active={params.get("sourceType") === type}
                  count={
                    q.isLoading || q.error
                      ? undefined
                      : facets.sourceType[type] ?? 0
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
                      : facets.site[site.id] ?? 0
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
              stickyIdentity={{ columnKey: "document" }}
              key={params.get("q") === null ? "clear" : "search"}
              appearance="reference"
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              rowTestId={(r) => `inbound-row-${r.id}`}
              storageKey="carres.inbound.register.v2"
              exportName="Inbound"
              searchPlaceholder="Document, product, supplier or Unit ID…"
              initialSearch={params.get("q") ?? ""}
              onSearchChange={onSearch}
              isLoading={q.isLoading}
              groupBanner={false}
              emptyMessage={empty}
              rowStyle={(r) =>
                activeSource === r.sourceId
                  ? { background: blue.blue3 }
                  : undefined
              }
              toolbarStart={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint md:hidden"
                    onClick={() => setShowFilters((v) => !v)}
                    data-testid="inbound-toggle-filters"
                  >
                    <PanelLeftOpen size={14} /> Filters
                  </button>
                  {railHidden && (
                    <button
                      type="button"
                      className="hidden h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint md:inline-flex"
                      onClick={() => setRailHidden(false)}
                      data-testid="inbound-show-filters"
                    >
                      <PanelLeftClose size={14} /> Show filters
                    </button>
                  )}
                  {!isNarrow && dateControls}
                  {activeSource && (
                    <span className="text-meta" data-testid="inbound-source-context">
                      Document: {activeSource}
                    </span>
                  )}
                </div>
              }
              expandTitle="Show every product and Unit"
              expandable={{
                trigger: { columnKey: "products" },
                testId: (r) => `inbound-expand-${r.id}`,
                renderExpansion: (r) => <InboundExpansion row={r} />,
              }}
              statusSummary={() => {
                const from = page.total === 0 ? 0 : page.offset + 1;
                const to = Math.min(page.offset + page.limit, page.total);
                return (
                  <span className="flex items-center gap-3">
                    <span data-testid="inbound-page-range">
                      Showing {from}–{to} of {page.total} arrangements
                    </span>
                    <button
                      type="button"
                      data-testid="inbound-page-previous"
                      disabled={page.offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - page.limit))}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 disabled:text-kit-slate-9"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      data-testid="inbound-page-next"
                      disabled={to >= page.total}
                      onClick={() => setOffset(offset + page.limit)}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 disabled:text-kit-slate-9"
                    >
                      Next
                    </button>
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

/** The expansion: complete product data, exact Units with per-Unit results,
 *  every posted receipt, and the ONE action door — read to decide, act in
 *  Receiving. */
function InboundExpansion({ row: r }: { row: InboundArrival }) {
  return (
    <div className="space-y-3 p-3 text-body">
      {r.identitiesMissing && (
        <p>
          Unit IDs or Receiving results are not fully recorded. Open Receiving
          Session to check the source.
        </p>
      )}
      {r.products.length > 0 && (
        <div>
          <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
            Products
          </div>
          {r.products.map((p) => (
            <div key={p.sku ?? "no-sku"} className="flex flex-wrap gap-3">
              <span>{p.name ?? p.sku ?? "Product not recorded"}</span>
              {p.sku && <span className="font-mono text-base-500">{p.sku}</span>}
              <span className="tabular-nums">
                Expected {p.qty} · Received {p.received}
              </span>
            </div>
          ))}
        </div>
      )}
      {r.units.length > 0 && (
        <div>
          <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
            Units
          </div>
          {r.units.map((u) => (
            <div key={u.id} className="flex flex-wrap gap-3">
              <Link
                className="font-mono text-kit-blue-11"
                to={`/operation/stock/unit/${encodeURIComponent(u.code)}`}
              >
                {u.code}
              </Link>
              {u.product && <span className="text-base-600">{u.product}</span>}
              <span>
                {u.outcome === "received"
                  ? "Received"
                  : u.outcome === "received_with_issue"
                    ? `Received with issue · ${u.issue === "wrong_item" ? "Wrong item" : "Damaged"}`
                    : u.outcome === "unknown"
                      ? "Receiving result not recorded"
                      : "Not yet received"}
              </span>
              {u.receivedSite && u.receivedSite !== r.site && (
                <span>Received at {u.receivedSite}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {r.sessions.length > 0 && (
        <div>
          <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
            Receiving records
          </div>
          {r.sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap gap-3">
              <Link
                className="font-mono text-kit-blue-11"
                to={`/operation?${new URLSearchParams({ tab: "receiving", session: s.id })}`}
              >
                {s.grnNo ?? "Receipt"}
              </Link>
              {s.receivedAt && <span>Goods received on {fmtDate(s.receivedAt)}</span>}
              {s.actualSite && <span>at {s.actualSite}</span>}
            </div>
          ))}
        </div>
      )}
      <Link
        className="inline-block text-kit-blue-11 hover:underline"
        onClick={(event) => event.stopPropagation()}
        to={receivingHref(r)}
      >
        Open Receiving Session
      </Link>
    </div>
  );
}
