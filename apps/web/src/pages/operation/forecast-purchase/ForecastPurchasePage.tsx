/**
 * FORECAST PURCHASE · OUTRIGHT (owner 13 Oct 2026; Purchasing MASTER §9.14;
 * 01 §5). The weekly page of Purchasing → Buy: per model and size, what sold
 * in the last three months, the free stock, a suggested quantity for this
 * Monday and a forecast for the next two. It suggests; the person decides.
 *
 * ── EVERY NUMBER IS THE SERVER'S OR THE SHARED ARITHMETIC'S ────────────────
 *
 * `GET /api/operation/purchase/forecast` hands in the facts their owners
 * recorded (sold, free stock, on PO, supplier). `forecastPurchaseModels`
 * works out the suggestion (Law D). This file composes words and cells.
 *
 * ── ONE VIEW ────────────────────────────────────────────────────────────────
 *
 * `By model · Outright`, on the one listing engine: a model row opens to one
 * line per size, in the fixed size order. A tick on a model ticks every size
 * of it that has a suggestion; a size that cannot be ordered keeps a greyed
 * tick that says why.
 *
 * ── THE PAGE ASKS; IT NEVER ISSUES (owner ruling 2026-10-14, A) ────────────
 *
 * `Send for approval` sends WHICH sizes and HOW MANY to the forecast's submit
 * door, with one key per review. The server works everything out again from
 * its own read, refuses a quantity the forecast no longer has room for, and
 * raises one Manual Purchase Request per supplier and category through the
 * existing request door, all or none. A retry with the same key is answered
 * with the requests the first press made. The Purchasing Approver decides the
 * request on the request; PO Duty then issues the PO and sends it there, and
 * that door checks a forecast request against today's forecast again.
 *
 * ── A REQUEST IN PROGRESS IS NOT STOCK ──────────────────────────────────────
 *
 * What a request still has to put on a PO never enters `Free stock`, the
 * suggestion or the forecast: the request may be refused. It only lowers what
 * can still be asked, so a size is not asked for twice, and it is shown under
 * the size as the request it is. `Ordered` means on a PO.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  forecastPurchaseModels,
  forecastPurchaseRequestGroups,
  type ForecastPurchaseModelRow,
  type ForecastPurchaseRequestState,
  type ForecastPurchaseResponse,
  type ForecastPurchaseSizeRow,
  type ForecastPurchaseSubmitBody,
  type ForecastPurchaseSubmitResult,
} from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { notify } from "@/components/kit/Toast";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import Tabs from "@/components/kit/Tabs";
import CPopover, { CMenuGroup, CMenuItem } from "@/components/carres/CPopover";
import MIcon from "@/components/carres/MIcon";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ItemRows from "@/components/register/ItemRows";
import RowTick from "@/components/register/RowTick";
import TwoLineCell from "@/components/register/TwoLineCell";
import { FilterRail, ShowFiltersButton, useFilterRailOpen } from "../components/workspace-rail";
import ForecastRequestWorkspace from "./ForecastRequestWorkspace";
import PurchasingTabs from "../PurchasingTabs";
import { TasksPill } from "../components/ShellTasks";
import { FORECAST_PURCHASE as W, monthWord, pcs, requestStateWord, weekdayWord } from "./forecast-purchase-words";
import styles from "./ForecastPurchase.module.css";

const STORAGE_KEY = "carres.forecastPurchase.outright.v1";
const RAIL_STORAGE_KEY = "carres.forecastPurchase.summary.open";

type Show = "suggested" | "ordered" | "all";
type Row = ForecastPurchaseModelRow;

/* 01 §5, the handoff's widths: Model takes the room that is left, never under
   120; the three months 32 · 32 · 36; Free stock 48; each Monday 56. The
   listing engine pads a cell 5 a side (the kit's 10 between columns), so each
   column asks for its kit width plus 10. */
const MODEL_MIN = 120;
/* Short of room (the Tasks panel open on a narrow window) Model gives up to
   20 and its name wraps inside it, so the last Monday stays in view with no
   side scroll. It is the floor the other kit lists give their first column. */
const MODEL_FLOOR = 100;
const FIXED = { m0: 42, m1: 42, m2: 46, free: 58, week: 66 } as const;
const FIXED_TOTAL = FIXED.m0 + FIXED.m1 + FIXED.m2 + FIXED.free + FIXED.week * 3;
/* The engine's tick and arrow columns (72), and the few pixels it gives a
   sortable header beyond what its column asks for. */
const GRID_LEAD = 80;

/** A number cell. It keeps a second line slot so first lines align with the
 *  Model cell's (01 §5). `quiet` is a count of none, or a forecast. */
function Num({ value, strong = false, tone = "ink", testId }: { value: number; strong?: boolean; tone?: "ink" | "forecast" | "none"; testId?: string }) {
  const colour = tone === "none" ? "text-c-secondary" : tone === "forecast" ? "text-c-tab" : "text-c-ink";
  return (
    <span className="flex flex-col items-end" data-testid={testId}>
      <span className={`text-body tabular-nums ${strong ? "font-medium" : ""} ${colour}`}>{value}</span>
      <span className="text-meta" aria-hidden>&nbsp;</span>
    </span>
  );
}
const soldTone = (n: number) => (n > 0 ? "ink" : "none") as "ink" | "none";
const weekTone = (n: number, week: number) => (week === 0 ? "ink" : n > 0 ? "forecast" : "none") as "ink" | "forecast" | "none";

export default function ForecastPurchasePage({contextFlow=false}:{contextFlow?:boolean}={}) {
  const navigate=useNavigate();
  const [requestSelection,setRequestSelection]=useState<ForecastPurchaseSizeRow[]|null>(null);
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["forecast-purchase"],
    queryFn: () => apiFetch<ForecastPurchaseResponse>("/api/operation/purchase/forecast"),
  });

  const show: Show = params.get("show") === "suggested" ? "suggested" : params.get("show") === "ordered" ? "ordered" : "all";
  const setShow = (next: string) => {
    const copy = new URLSearchParams(params);
    if (next === "suggested" || next === "ordered") copy.set("show", next); else copy.delete("show");
    setParams(copy, { replace: true });
  };

  const models = useMemo(() => (data ? forecastPurchaseModels(data) : []), [data]);
  /* `Suggested` is the models with a suggestion this Monday: one with no
     supplier (the person must see it to set the supplier) and one whose
     request is in progress (it is not ordered until it is on a PO) included.
     `Ordered` is the models with stock on an open PO that has not arrived. */
  const shown = useMemo(
    () => (show === "all" ? models : show === "suggested" ? models.filter((m) => m.weeks[0] > 0) : models.filter((m) => m.onPo > 0)),
    [models, show],
  );

  /* ── Ticks: one set of sizes. A tick is dropped the moment its size stops
     having a suggestion (a refetch after stock arrived). ────────────────── */
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const sizeBySku = useMemo(() => new Map(models.flatMap((m) => m.sizes.map((s) => [s.sku, s] as const))), [models]);
  const live = useMemo(() => new Set([...ticked].filter((sku) => sizeBySku.get(sku)?.block === null)), [ticked, sizeBySku]);
  const tickable = (m: Row) => m.sizes.filter((s) => s.block === null).map((s) => s.sku);
  const tickedIn = (m: Row) => tickable(m).filter((sku) => live.has(sku)).length;
  const setSizes = (skus: string[], on: boolean) => setTicked((previous) => {
    const next = new Set(previous);
    for (const sku of skus) { if (on) next.add(sku); else next.delete(sku); }
    return next;
  });
  const chosen = useMemo(() => [...live].map((sku) => sizeBySku.get(sku)!).filter(Boolean), [live, sizeBySku]);
  const chosenPcs = chosen.reduce((n, s) => n + s.toAsk, 0);
  /* One request per supplier and category; each becomes one PO after approval. */
  const groups = useMemo(() => forecastPurchaseRequestGroups(chosen), [chosen]);
  const chosenRequests = groups.length;

  /* ── The Summary: this Monday's suggestion, the next two, and by supplier. */
  const totals = useMemo(() => {
    const weeks = [0, 1, 2].map((i) => models.reduce((n, m) => n + m.weeks[i]!, 0));
    const bySupplier = new Map<string, { name: string; pieces: number; models: Set<string> }>();
    const inProgress: Record<ForecastPurchaseRequestState, number> = { waiting: 0, ready: 0, sent_back: 0 };
    for (const m of models) for (const s of m.sizes) {
      for (const request of s.requests) inProgress[request.state] += request.qty;
      if (!s.supplierId || s.suggested <= 0) continue;
      const entry = bySupplier.get(s.supplierId) ?? { name: s.supplier ?? W.supplierNotSet, pieces: 0, models: new Set<string>() };
      entry.pieces += s.suggested;
      entry.models.add(m.model);
      bySupplier.set(s.supplierId, entry);
    }
    /* The headline is this Monday's suggestion for sizes that have a supplier:
       the same pieces `By supplier` splits. What is already asked for is said
       under it, by the request's own state, and is never taken off it. */
    const now = [...bySupplier.values()].reduce((n, entry) => n + entry.pieces, 0);
    return { now, weeks, inProgress, bySupplier: [...bySupplier.values()].sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name)) };
  }, [models]);

  /* ── Layout: Model takes the room the seven number columns leave. ──────── */
  const canvasRef = useRef<HTMLDivElement>(null);
  const [railOpen, setRailOpen] = useFilterRailOpen(RAIL_STORAGE_KEY, canvasRef);
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  /* The list's own column widths as it drew them (tick, arrow, then the eight
     columns), so a size line sits exactly under its model's columns. */
  const [drawn, setDrawn] = useState<number[]>([]);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setRoom(el.clientWidth);
      const widths = [...el.querySelectorAll("thead th")].map((th) => Math.round(th.getBoundingClientRect().width * 10) / 10);
      setDrawn((previous) => (previous.join() === widths.join() ? previous : widths));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const table = el.querySelector("table");
    if (table) observer.observe(table);
    measure();
    return () => observer.disconnect();
  });
  const spare = Math.floor(room - GRID_LEAD - 2 - FIXED_TOTAL);
  const tight = room > 0 && spare < MODEL_MIN;
  const modelWidth = room > 0 ? Math.max(MODEL_FLOOR, spare) : 260;
  const modelFloor = tight ? MODEL_FLOOR : MODEL_MIN;

  const months = data?.months ?? null;
  const mondays = data?.mondays ?? null;
  const columns = useMemo<DataGridColumn<Row>[]>(() => {
    const month = (i: 0 | 1 | 2): DataGridColumn<Row> => ({
      key: `m${i}`, label: months ? monthWord(months[i]) : "", width: i === 2 ? FIXED.m2 : i === 1 ? FIXED.m1 : FIXED.m0, minWidth: i === 2 ? FIXED.m2 : FIXED.m0,
      align: "right", sortable: true, filterable: false, band: i === 2,
      accessor: (m) => <Num value={m.sold[i]} strong={i === 2} tone={soldTone(m.sold[i])} testId={`forecast-sold-${i}-${m.modelId}`} />,
      numberValue: (m) => m.sold[i], exportValue: (m) => m.sold[i],
    });
    const week = (i: 0 | 1 | 2): DataGridColumn<Row> => ({
      key: `w${i}`, label: mondays ? W.mondayShort(mondays[i]) : "", headerSub: mondays ? weekdayWord(mondays[i]) : undefined,
      exportLabel: mondays ? W.monday(mondays[i]) : undefined, width: FIXED.week, minWidth: FIXED.week,
      align: "right", sortable: true, filterable: false,
      accessor: (m) => <Num value={m.weeks[i]} strong={i === 0 && m.weeks[i] > 0} tone={weekTone(m.weeks[i], i)} testId={`forecast-week-${i}-${m.modelId}`} />,
      numberValue: (m) => m.weeks[i], exportValue: (m) => m.weeks[i],
    });
    return [
      {
        key: "model", label: W.colModel, width: modelWidth, minWidth: modelFloor, sortable: true, wrap: true, filterable: false,
        accessor: (m) => <TwoLineCell strong top={m.model} sub={W.modelLine(m.supplier, m.sizes.length)} testId={`forecast-model-${m.modelId}`} />,
        sortFn: (a, b) => a.model.localeCompare(b.model),
        searchValue: (m) => `${m.model} ${m.supplier ?? W.supplierNotSet} ${m.sizes.map((s) => `${s.size} ${s.sku}`).join(" ")}`,
        exportValue: (m) => m.model,
      },
      month(0), month(1), month(2),
      {
        key: "free", label: W.colFree, headerSub: W.colFreeSub, exportLabel: W.freeStock, width: FIXED.free, minWidth: FIXED.free,
        align: "right", sortable: true, filterable: false,
        accessor: (m) => <Num value={m.have} testId={`forecast-free-${m.modelId}`} />,
        numberValue: (m) => m.have, exportValue: (m) => m.have,
      },
      week(0), week(1), week(2),
    ];
  }, [months, mondays, modelWidth, modelFloor]);

  /* A size line repeats its model's columns: its tick under the model's tick,
     its size under Model, then each number under its own header. The engine
     starts an opened row at the first data column, so the lines step back
     over the tick and arrow columns.
     The widths are copied as SHARES that may shrink (`minmax(0, Nfr)`), never
     as fixed pixels: fixed pixels held the whole list at the width it had, so
     a narrower window or a panel opened with a model open made the list scroll
     sideways (production, 14 Oct 2026). At the drawn width the shares are the
     drawn pixels exactly; while the list narrows they shrink with it, and the
     next measure makes them exact again. */
  const track = (width: number) => `minmax(0, ${width}fr)`;
  const lineColumns = (drawn.length >= 10
    ? drawn.slice(0, 10)
    : [32, 40, modelWidth, FIXED.m0, FIXED.m1, FIXED.m2, FIXED.free, FIXED.week, FIXED.week, FIXED.week]
  ).map(track).join(" ");
  const stepBack = drawn.length >= 2 ? drawn[0]! + drawn[1]! : 72;
  const cell = "flex items-center justify-end px-[5px] text-body tabular-nums";
  const sizeLine = (m: Row, s: ForecastPurchaseSizeRow) => (
    <div key={s.sku} role="row" className="grid min-h-[44px] items-stretch border-t border-c-row-line" style={{ gridTemplateColumns: lineColumns }} data-testid={`forecast-size-${s.sku}`}>
      <span role="cell" />
      <span role="cell" className="grid place-items-center">
        <RowTick testId={`forecast-size-tick-${s.sku}`} label={W.selectSize(m.model, s.size)} checked={live.has(s.sku)}
          disabled={s.block !== null} why={W.block(s.block, s.requests[0]?.state)} onChange={() => setSizes([s.sku], !live.has(s.sku))} />
      </span>
      <span role="cell" className="flex min-w-0 flex-col justify-center px-[5px] py-1">
        <span className="break-words text-body text-c-ink">{s.size || W.notRecorded}</span>
        {/* Stock on its way: each request still asking, then what a PO holds. */}
        {s.requests.map((request) => (
          <Link key={request.id} to={`/operation?tab=manual-purchase&mp=${encodeURIComponent(request.id)}`} title={W.openRequest(request.no)}
            className="break-words text-meta text-c-secondary underline decoration-dotted underline-offset-[3px] hover:decoration-solid" data-testid={`forecast-size-request-${s.sku}-${request.id}`}>
            {W.requestLine(request.no, request.qty, request.state)}
          </Link>
        ))}
        {s.onPo > 0 ? <span className="break-words text-meta text-c-secondary" data-testid={`forecast-size-onpo-${s.sku}`}>{W.onPoLine(s.onPo)}</span> : null}
      </span>
      {[0, 1, 2].map((i) => (
        <span key={i} role="cell" className={`${cell} ${i === 2 ? "bg-c-column-band font-medium" : ""} ${s.sold[i]! > 0 ? "text-c-ink" : "text-c-secondary"}`}>{s.sold[i]}</span>
      ))}
      <span role="cell" className={`${cell} text-c-ink`}>{s.have}</span>
      {[0, 1, 2].map((i) => {
        const n = s.suggestion.weeks[i]!;
        const tone = weekTone(n, i);
        return (
          <span key={i} role="cell" data-testid={`forecast-size-week-${i}-${s.sku}`}
            className={`${cell} ${i === 0 && n > 0 ? "font-medium" : ""} ${tone === "ink" ? "text-c-ink" : tone === "forecast" ? "text-c-tab" : "text-c-secondary"}`}>{n}</span>
        );
      })}
    </div>
  );

  /* ── One view button: how the rows are grouped, and which business. ─────── */
  const [viewOpen, setViewOpen] = useState(false);
  const viewMenu = (compact: boolean) => (
    <CPopover label={W.viewLabel} role="menu" open={viewOpen} onOpenChange={setViewOpen}
      trigger={
        <Button data-testid="forecast-view" aria-label={`View: ${W.view}`} title={compact ? W.view : undefined}>
          <MIcon name="stacks" size={18} className="text-c-secondary" />
          {compact ? null : W.view}
          <MIcon name="expand_more" size={18} className="text-c-secondary" />
        </Button>
      }>
      <CMenuGroup first>{W.groupBy}</CMenuGroup>
      <CMenuItem icon="stacks" checked strong testId="forecast-view-model" onSelect={() => setViewOpen(false)}>{W.byModel}</CMenuItem>
      <CMenuGroup>{W.viewFor}</CMenuGroup>
      <CMenuItem icon="sell" checked strong testId="forecast-view-outright" onSelect={() => setViewOpen(false)}>{W.outright}</CMenuItem>
    </CPopover>
  );

  /* ── The review, and the one write: `Send for approval`. ────────────────── */
  const [reviewOpen, setReviewOpen] = useState(false);
  useEffect(() => { if (chosen.length === 0) setReviewOpen(false); }, [chosen.length]);
  const leadMissing = groups.some((group) => group.deliveryDate == null);
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /* ONE KEY PER REVIEW. A press whose answer was lost is pressed again with
     the same key, and the server answers with the requests the first press
     made. A new review, or a changed selection, is a new key. */
  const submissionKey = useRef<string | null>(null);
  const askSignature = groups.map((group) => group.lines.map((line) => `${line.sku}:${line.qty}`).join(",")).join("|");
  useEffect(() => { submissionKey.current = null; setSendError(null); }, [reviewOpen, askSignature]);
  const canSend = !!data?.deliverTo && !leadMissing && groups.length > 0 && !sending;
  async function send() {
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    submissionKey.current ??= crypto.randomUUID();
    const body: ForecastPurchaseSubmitBody = {
      submissionKey: submissionKey.current,
      lines: groups.flatMap((group) => group.lines.map((line) => ({ sku: line.sku, qty: line.qty }))),
    };
    try {
      const result = await apiFetch<ForecastPurchaseSubmitResult>("/api/operation/purchase/forecast/requests", { method: "POST", body: JSON.stringify(body) });
      notify("success", W.sent(result.requests.length));
      submissionKey.current = null;
      setTicked(new Set());
      setReviewOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["operation", "purchasing", "requests"] });
    } catch (e) {
      /* A refusal carries its two lines: what is wrong, and the one act. A
         refusal wrote nothing, so the next press is a new ask with a new key;
         a lost answer (no refusal body) keeps the key for the retry. */
      const refusal = e instanceof ApiError && e.body && typeof e.body === "object" ? (e.body as { message?: string; action?: string; code?: string }) : null;
      if (refusal?.code) submissionKey.current = null;
      setSendError(refusal?.message ? [refusal.message, refusal.action].filter(Boolean).join(" ") : W.sendFailed);
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey: ["forecast-purchase"] });
    }
  }

  const emptyMessage = isError && !data ? W.couldNotRead : models.length === 0 ? W.empty : show === "suggested" ? W.nothingSuggested : show === "ordered" ? W.nothingOrdered : W.empty;

  if(contextFlow&&requestSelection!==null)return <ForecastRequestWorkspace selection={requestSelection} onDone={id=>{if(id)navigate(`/operation?tab=manual-purchase&mp=${encodeURIComponent(id)}`);else setRequestSelection(null);void refetch();}}/>;

  return (
    <div className={`${styles.page} flex h-full min-h-0 w-full flex-1 flex-col`} data-testid="forecast-purchase-page">
      <PurchasingTabs />
      <div ref={canvasRef} className={`${styles.canvas} relative flex min-h-0 flex-1 overflow-hidden`}>
        {railOpen && (
          <FilterRail testId="forecast-purchase-rail" onHide={() => setRailOpen(false)} className={styles.rail}
            header={<div className="flex min-h-[20px] items-center pr-8 text-strong text-c-ink">{W.summary}</div>}>
            <section aria-label={W.weeklyForecast} className="mx-0.5 mb-2 rounded-lg border border-c-card-border bg-white px-3 py-2.5" data-testid="forecast-summary-week">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-body font-medium text-c-ink">{W.weeklyForecast}</h3>
                <span className="shrink-0 text-meta text-c-secondary">{mondays ? W.monday(mondays[0]) : W.notRecorded}</span>
              </div>
              <div className="mt-1.5 rounded-lg bg-c-ground px-3 py-2" data-testid="forecast-summary-now">
                <div className="flex items-baseline gap-1">
                  <span className={`text-page ${totals.now > 0 ? "text-c-ink" : "text-c-secondary"}`}>{totals.now}</span>
                  <span className="text-meta text-c-secondary">{totals.now === 1 ? "pc" : "pcs"}</span>
                </div>
                <div className="text-meta text-c-tab">{W.suggested}</div>
              </div>
              <div className="mt-1 flex flex-col">
                {[1, 2].map((i) => (
                  <div key={i} className="flex min-h-8 items-center justify-between gap-3" data-testid={`forecast-summary-week-${i}`}>
                    <span className="min-w-0 text-body text-c-tab">{mondays ? W.monday(mondays[i]!) : W.notRecorded}</span>
                    <span className="shrink-0 text-body font-medium text-c-ink">{pcs(totals.weeks[i]!)}</span>
                  </div>
                ))}
                {/* What is already asked for, by the request's own state. Not stock, and not taken off the suggestion. */}
                {(["waiting", "ready", "sent_back"] as const).filter((state) => totals.inProgress[state] > 0).map((state) => (
                  <div key={state} className="flex min-h-8 items-center justify-between gap-3" data-testid={`forecast-summary-${state}`}>
                    <span className="min-w-0 text-body text-c-tab">{requestStateWord(state)}</span>
                    <span className="shrink-0 text-body font-medium text-c-ink">{pcs(totals.inProgress[state])}</span>
                  </div>
                ))}
              </div>
            </section>
            {totals.bySupplier.length > 0 && (
              <section aria-label={W.bySupplier} className="px-3.5 pb-2 pt-1" data-testid="forecast-summary-suppliers">
                <h3 className="text-label uppercase tracking-[.06em] text-c-secondary">{W.bySupplier}</h3>
                <div className="mt-1 flex flex-col">
                  {totals.bySupplier.map((entry) => (
                    <div key={entry.name} className="flex min-h-8 items-center justify-between gap-3" title={[...entry.models].join(" · ")}>
                      <span className="min-w-0 break-words text-body text-c-tab">{entry.name}</span>
                      <span className="shrink-0 text-body font-medium text-c-ink">{pcs(entry.pieces)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </FilterRail>
        )}

        <div className="flex min-w-0 flex-1 flex-col p-2">
          {/* The kit's table puts 10 between columns and no padding inside a
              cell (01 §5). The listing engine pads every cell instead, so its
              padding is 5 a side here: the same 10 between column texts. */}
          <div ref={box} className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="forecast-purchase-list">
            <DataGrid<Row>
              rows={shown}
              columns={columns}
              storageKey={STORAGE_KEY}
              sessionKey={STORAGE_KEY}
              rowKey={(m) => m.key}
              rowTestId={(m) => `forecast-row-${m.modelId}`}
              rowHeight={54}
              appearance="reference"
              palette="slate"
              presentationTools
              wrapToolbar
              searchPresentation="icon"
              allowColumnGrouping={false}
              groupBanner={false}
              isLoading={isLoading}
              errorState={isError && !data ? (
                <div className="flex flex-col items-center gap-2 p-6 text-body text-c-secondary" role="alert" data-testid="forecast-error">
                  <span>{W.couldNotRead}</span>
                  <Button onClick={() => void refetch()}>Try again</Button>
                </div>
              ) : undefined}
              emptyMessage={emptyMessage}
              noMatchMessage={W.noMatch}
              searchPlaceholder={W.search}
              exportName={W.page}
              toolbarStart={<>
                {contextFlow?<Button data-testid="forecast-new-stock-request" onClick={()=>setRequestSelection([])}>+ New stock request</Button>:null}
                {!railOpen ? <ShowFiltersButton onShow={() => setRailOpen(true)} testId="forecast-show-summary" /> : null}
                <Tabs variant="segmented" label={W.showLabel} value={show} onValueChange={setShow}
                  tabs={[{ value: "suggested", label: W.showSuggested }, { value: "ordered", label: W.showOrdered }, { value: "all", label: W.showAll }]} />
              </>}
              toolbarEnd={<div className={`${styles.toolbarTools} flex min-w-0 flex-wrap items-center gap-2`}>{viewMenu(false)}</div>}
              toolbarAfterTools={<TasksPill />}
              expandable={{
                flush: true,
                testId: (m) => `forecast-expand-${m.modelId}`,
                renderExpansion: (m) => (
                  <ItemRows label={`${m.model} sizes`} stepBack={stepBack} testId={`forecast-sizes-${m.modelId}`}>
                    <div role="row" className="grid min-h-[32px] items-stretch bg-c-info-bg text-meta font-medium text-c-secondary" style={{ gridTemplateColumns: lineColumns }}>
                      <span role="columnheader" />
                      <span role="columnheader" />
                      <span role="columnheader" className="flex items-center px-[5px]">{W.lineSize}</span>
                      {[0, 1, 2].map((i) => (
                        <span key={i} role="columnheader" className={`flex items-center justify-end px-[5px] ${i === 2 ? "bg-c-column-band" : ""}`}>{months ? monthWord(months[i]!) : ""}</span>
                      ))}
                      <span role="columnheader" /><span role="columnheader" /><span role="columnheader" /><span role="columnheader" />
                    </div>
                    {m.sizes.map((s) => sizeLine(m, s))}
                  </ItemRows>
                ),
              }}
              selectable={{
                selectedKeys: new Set(shown.filter((m) => { const ids = tickable(m); return ids.length > 0 && tickedIn(m) === ids.length; }).map((m) => m.key)),
                onToggle: (key) => {
                  const m = shown.find((x) => x.key === key); if (!m) return;
                  const ids = tickable(m);
                  setSizes(ids, tickedIn(m) !== ids.length);
                },
                onToggleAll: (keys, allSelected) => setSizes(shown.filter((m) => keys.includes(m.key)).flatMap(tickable), !allSelected),
                isSelectable: (m: Row) => m.suggestedSizes > 0,
                unselectableReason: (m: Row) => W.block(m.block, m.sizes.find((size) => size.block === "requested")?.requests[0]?.state),
                isIndeterminate: (m: Row) => { const n = tickedIn(m); return n > 0 && n < tickable(m).length; },
                testId: (m: Row) => `forecast-select-${m.modelId}`,
              }}
              selectionSummary={() => W.selected(chosen.length, chosenPcs)}
              selectionPrimary={chosen.length > 0 ? (
                <span className="flex shrink-0 items-center gap-2" data-testid="forecast-selection-actions">
                  <Button variant="primary" size="md" data-testid="forecast-review-open" onClick={() => contextFlow?setRequestSelection(chosen):setReviewOpen(true)}>
                    <MIcon name="shopping_cart" size={18} />
                    {contextFlow?"Review":W.reviewButton(chosenRequests)}
                  </Button>
                  {viewMenu(true)}
                </span>
              ) : null}
              hideSelectionExport
              statusSummary={(filtered) => (
                <span className="block" data-testid="forecast-footer">
                  {filtered.length === models.length ? W.footer(models.length) : W.footerOf(filtered.length, models.length)}
                </span>
              )}
            />
          </div>
        </div>
      </div>

      <Modal open={reviewOpen} onOpenChange={setReviewOpen} title={W.review(chosenRequests)} description={W.reviewLine(chosenPcs)}
        footer={<>
          <Button data-testid="forecast-review-back" disabled={sending} onClick={() => setReviewOpen(false)}>{W.back}</Button>
          <Button variant="primary" data-testid="forecast-review-send" disabled={!canSend} loading={sending}
            title={leadMissing ? W.sendLeadNotSet : !data?.deliverTo ? W.noDeliverTo : undefined} onClick={() => void send()}>
            {sending ? W.sending : W.send}
          </Button>
        </>}>
        <div className="flex flex-col gap-3" data-testid="forecast-review">
          <div role="table" aria-label={W.review(chosenRequests)} className="rounded-lg border border-c-card-border">
            <div role="row" className="grid h-9 grid-cols-[minmax(0,1fr)_72px_110px] items-center gap-2.5 rounded-t-lg border-b border-c-head-line bg-c-info-bg px-3 text-meta font-medium text-c-secondary">
              <span role="columnheader">{W.reviewItem}</span>
              <span role="columnheader" className="text-right">{W.reviewQty}</span>
              <span role="columnheader">{W.reviewSupplier}</span>
            </div>
            {chosen.map((s, i) => (
              <div key={s.sku} role="row" className={`grid min-h-[44px] grid-cols-[minmax(0,1fr)_72px_110px] items-center gap-2.5 px-3 py-1 ${i ? "border-t border-c-row-line" : ""}`} data-testid={`forecast-review-line-${s.sku}`}>
                <span role="cell" className="flex min-w-0 flex-col">
                  <span className="break-words text-body text-c-ink">{s.model}</span>
                  <span className="text-meta text-c-secondary">{s.size}</span>
                </span>
                <span role="cell" className="text-right text-body tabular-nums text-c-ink">{pcs(s.toAsk)}</span>
                <span role="cell" className="break-words text-body text-c-ink">{s.supplier ?? W.supplierNotSet}</span>
              </div>
            ))}
          </div>
          {/* One request per supplier and category: when it is asked to arrive, and where. */}
          <div className="flex flex-col" data-testid="forecast-review-requests">
            {groups.map((group) => (
              <div key={group.key} className="flex min-h-9 items-start justify-between gap-3 py-1.5" data-testid={`forecast-review-group-${group.key}`}>
                <span className="min-w-0 break-words text-body text-c-ink">{W.group(group.supplier, group.category)}</span>
                <span className="flex shrink-0 flex-col items-end text-right">
                  {group.deliveryDate ? (
                    <span className="text-body text-c-ink">{W.deliveryDate} {fmtDate(group.deliveryDate)}</span>
                  ) : (
                    <>
                      <span className="text-body text-c-warn-fg">{W.leadNotSet}</span>
                      <span className="max-w-[240px] break-words text-meta text-c-warn-fg">{W.leadFix(group.supplier, group.category)}</span>
                    </>
                  )}
                </span>
              </div>
            ))}
            <div className="flex min-h-9 items-center justify-between gap-3 border-t border-c-row-line py-1.5">
              <span className="text-body text-c-tab">{W.deliverTo}</span>
              <span className={`min-w-0 break-words text-right text-body ${data?.deliverTo ? "text-c-ink" : "text-c-warn-fg"}`} data-testid="forecast-review-deliver-to">
                {data?.deliverTo ? data.deliverTo.name : W.noDeliverTo}
              </span>
            </div>
          </div>
          <p className="text-meta text-c-secondary">{W.reviewNote}</p>
          <p className="text-meta text-c-secondary" data-testid="forecast-review-who">{W.whoNext(data?.approver?.name ?? null, data?.poDuty?.name ?? null)}</p>
          {sendError ? <p className="text-meta text-c-warn-fg" role="alert" data-testid="forecast-review-error">{sendError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
