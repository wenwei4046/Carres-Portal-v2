/**
 * THE DELIVERY ORDERS REGISTER — document truth on the shared Register grammar.
 * Owner UI correction 2026-09-06 · `docs/delivery/MASTER.md` §8 ·
 * register shell law `docs/ui/MASTER.md` §6.7.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE SALES ORDERS GRAMMAR, APPLIED (owner correction 2026-09-06)
 *
 * The register lacked the shared Register powers every other document register
 * carries: row checkboxes, header select-all, the in-place selection toolbar,
 * ▸ expansion, sticky identity and a 240px page-owned FilterRail. This
 * correction adds them through the SAME engine (`register/DataGrid`) and the
 * SAME rail recipe (`FilterRail`) — nothing page-local is invented.
 *
 * ── SELECTION IS DOCUMENT-ORIENTED ──────────────────────────────────────────
 *
 * `Print {n} delivery orders` — the governed DO document per row, one file.
 * There is deliberately NO `Assign logistics` here: initial assignment lives
 * on Monitor, whose planning population includes scopes that have no DO yet.
 * A register's selection scopes OUTPUT, never a write (MASTER §8).
 *
 * ── THE RAIL ────────────────────────────────────────────────────────────────
 *
 * WORK TO DO — lenses over canonical recorded facts (delivery-orders-register
 * owns the arithmetic; a queue with no canonical record is not faked).
 * DOCUMENT STATUS — the document ladder's own five words. One document sits in
 * at most one primary queue; finished work leaves the queue and stays in the
 * status views.
 *
 * There is still NO create button: the SYSTEM issues a DO when a trip's
 * requirements are met (orders MASTER §8) — no Release, no Approve, no Issue.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ExternalLink, Image as ImageIcon, PanelLeftOpen, Video } from "lucide-react";
import { toast } from "sonner";
import type { DeliveryHandoverKind, DeliveryOrderStatus, OrderActionTone } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import StatusPill from "@/components/kit/StatusPill";
import { ApiError, apiFetch } from "@/lib/api";
import { renderCombinedDoPdf } from "@/lib/pdf/render";
import type { DoTemplateData } from "@/lib/pdf/types";
import {
  useDeliveryOrdersRegister,
  useSalesOrderExpansion,
  type DeliveryOrderAttemptRow,
} from "@/lib/queries";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import Select from "@/components/kit/Select";
import ModuleHeader from "./components/ModuleHeader";
import DeliveryResultAction from "./components/DeliveryResultAction";
import {
  DeliveryProofUploadButton,
  DriverSubmissionViewer,
  SignedDeliveryDocumentLink,
} from "./components/DriverSubmission";
import GoodsMiniTable, { goodsCategoryOf, type GoodsMiniLine } from "./components/GoodsMiniTable";
import { FilterRail, FilterRailGroup, FilterRailRow } from "./components/workspace-rail";
import { lineName } from "./sales-order-facts";
import { DATE_TO_BE_CONFIRMED_FULL } from "./sales-order-guidance";
import { requestedDeliveryText } from "./sales-order-columns";
import { DW } from "./delivery-work";
import {
  DELIVERY_RESULT_LABEL,
  DOR_COPY,
  DO_QUEUE_LABEL,
  groupProofRecords,
  DO_STATUS_KEYS,
  DO_WORK_QUEUES,
  buildDoRegisterRails,
  buildDoRegisterRow,
  doRegisterFooter,
  matchesDoFilters,
  type DoRegisterFilters,
  type DoRegisterRow,
  type DoWorkQueue,
} from "./delivery-orders-register";

/**
 * ⭐ ONE STATUS COLUMN, AND ITS SECOND LINE SAYS WHAT ACTUALLY HAPPENED
 * (owner ruling 2026-09-11, retiring the default `Delivery Result` column).
 *
 * The register used to print the outcome TWICE: a `Delivery exception` pill
 * in one column and `Partially Delivered` / `Failed Delivery` in another,
 * three columns apart, so the operator had to join them by eye. The pill keeps
 * the DOCUMENT's word; line 2 carries the RESULT that document actually
 * recorded, with its reason.
 *
 * THE ARITHMETIC DID NOT MOVE. `deliveryOrderStatusOf` still derives the kind
 * and the reason from the void stamp, the attempts and the handover facts; the
 * recorded result still comes from the attempt history. This function only
 * decides what the SECOND LINE reads - combining a display never rewrites the
 * facts underneath it, and the DO detail still holds every recorded result and
 * its whole history.
 */
export function statusDetailOf(row: {
  status: DoRegisterRow["status"];
  latestResult: DoRegisterRow["latestResult"];
}): string | null {
  const reason = row.status.reasonLabel;
  /* A partial or failed trip: name the outcome first, then why. */
  if (row.status.kind === "exception") {
    const outcome = row.latestResult ? DELIVERY_RESULT_LABEL[row.latestResult] : null;
    return [outcome, reason].filter(Boolean).join(" · ") || null;
  }
  /* An intermediate leg's arrival names the partner warehouse the goods
     reached (Card 20) — the place is the fact, never `Delivered`. */
  if (row.status.kind === "arrived") return row.status.stop;
  /* Cancelled carries its void reason; Delivered, Out for delivery and
     Created need no second line - the pill already is the whole fact. */
  return reason;
}

/** Owner column ruling 2026-08-18: Created GREY · Out for delivery BLUE ·
 *  Delivered GREEN · Delivery exception AMBER (+ its reason, small line 2). */
const STATUS_TONE: Record<DeliveryOrderStatus["kind"], OrderActionTone> = {
  created: "neutral",
  out_for_delivery: "info",
  arrived: "success",
  delivered: "success",
  exception: "warning",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<DeliveryOrderStatus["kind"], string> = {
  created: "Created",
  out_for_delivery: "Out for delivery",
  arrived: "Arrived",
  delivered: "Delivered",
  exception: "Delivery exception",
  cancelled: "Cancelled",
};

const FILTER_RAIL_STORAGE_KEY = "carres.deliveryOrders.filterRail";

/** Below this the 240px rail costs more sheet than it earns (owner ruling
 *  2026-09-11, validated at the observed 949px viewport). */
const NARROW_VIEWPORT_PX = 1100;

/** The dropdown's own value for "no status condition". Never a status. */
const ALL_STATUS = "__all__";

/** ⭐ AN ABSENCE IS QUIETER THAN A FACT — owner ruling 2026-08-15. */
function Absent({ children }: { children: string }) {
  return (
    <span className="text-kit-slate-9" data-absence="true">
      {children}
    </span>
  );
}

/**
 * ▸ HAS EXACTLY ONE JOB: this DOCUMENT's goods lines, read-only — the trip's
 * own scope (`tripLinesOf`, one arithmetic with the DO page), through the
 * shared `GoodsMiniTable`.
 */
function DoExpansion({ row }: { row: DoRegisterRow }) {
  const expansion = useSalesOrderExpansion(row.orderId);
  const factsByLine = new Map((expansion.data?.lines ?? []).map((l) => [l.lineId, l]));
  const miniLines: GoodsMiniLine[] = row.lines.map((line, index): GoodsMiniLine => {
    const fact = factsByLine.get(line.id ?? "");
    return {
      key: line.id ?? `${line.sku}-${index}`,
      testId: `do-good-${line.sku}`,
      category: goodsCategoryOf(line),
      unitIds: fact?.unitIds ?? [],
      unitAbsence: "Not allocated",
      deliverTo: (fact?.deliverTo ?? []).map((d) =>
        (fact?.deliverTo.length ?? 0) > 1 ? `${d.name} ×${d.qty}` : d.name,
      ),
      deliverToAbsence: expansion.isLoading ? "Loading…" : DW.notRecorded,
      sku: line.sku,
      qty: line.qty,
      item: lineName(line),
      selectable: true,
    };
  });
  return (
    <div data-testid="do-register-expansion">
      {miniLines.length === 0 ? (
        <div className="px-2 py-2 text-body text-kit-slate-11">{DOR_COPY.noGoods}</div>
      ) : (
        <GoodsMiniTable label={`Goods on ${row.doNumber}`} lines={miniLines} />
      )}
    </div>
  );
}

/**
 * `Print {n} delivery orders` — each document's data assembled server-side
 * under RLS exactly as the single-DO print does, then ONE file carrying one
 * governed DO page per document. READ-ONLY.
 */
async function printDeliveryOrders(rows: DoRegisterRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const bundles: DoTemplateData[] = [];
    for (const r of rows) {
      bundles.push(
        await apiFetch<DoTemplateData>(
          `/api/operation/orders/${r.orderId}/print-do-data?do_number=${encodeURIComponent(r.doNumber)}`,
        ),
      );
    }
    const blob = await renderCombinedDoPdf(bundles);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : String(error);
    toast.error(`Printing ${rows.length} delivery orders failed: ${message}`);
  }
}

/** This register's row, through the portal's ONE `Requested Delivery Date`
 *  spelling — cell, search, per-column filter and Excel export alike. */
function requestedText(r: DoRegisterRow): string {
  return requestedDeliveryText({ iso: r.requestedDelivery, tbd: r.requestedTbd });
}

/** Which viewer a click opened, and over which document. */
type ViewerPick = { row: DoRegisterRow; kind: "photo" | "video" } | null;

/**
 * ⭐ A VOIDED DOCUMENT IS OWED NOTHING (walk finding, 2026-09-11).
 *
 * The retired `Proof Status` column printed `Not delivered yet` and
 * `No signed document yet` against a CANCELLED row, which reads as two
 * outstanding jobs on a trip that will never happen — and the pill beside it
 * already says `Cancelled`. There is no governed word for "this document was
 * voided before anything came back", and inventing one to fill a cell is how a
 * dictionary rots, so the cell simply says nothing.
 *
 * It is NOT silent when files exist: a document voided AFTER a driver sent
 * something still shows what was sent. Those are recorded facts and a void
 * never erases them.
 */
function voidedWithNothingSubmitted(r: DoRegisterRow): boolean {
  return (
    r.status.kind === "cancelled" &&
    r.submission.photos === 0 &&
    r.submission.videos === 0 &&
    !r.signedDoPresent
  );
}

/**
 * ⭐ ONE SPELLING for the cell, the search, the per-column filter and the
 * Excel export - the same law the `Requested Delivery Date` column already
 * obeys. A sheet that said "2 photos" where the screen said "Not recorded"
 * would be a second arithmetic (Law D).
 */
function submissionSearchText(r: DoRegisterRow): string {
  if (voidedWithNothingSubmitted(r)) return "";
  const reached = r.latestResult === "delivered" || r.latestResult === "partial";
  const media = !r.submission.known
    ? DOR_COPY.notRecorded
    : r.submission.photos === 0 && r.submission.videos === 0
      ? reached
        ? DOR_COPY.noPhoto
        : DOR_COPY.notDelivered
      : [
          r.submission.photos > 0 ? `${DOR_COPY.photos} ${r.submission.photos}` : "",
          r.submission.videos > 0 ? `${DOR_COPY.videos} ${r.submission.videos}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
  const paper = r.signedDoPresent ? DOR_COPY.signedDoOnFile : DOR_COPY.noSignedDo;
  return `${media} · ${paper}`;
}

/** A count button: the number is the ledger's own, never a placeholder. */
function CountButton({
  icon,
  label,
  count,
  title,
  testId,
  onClick,
}: {
  icon: typeof ImageIcon;
  label: string;
  count: number;
  title: string;
  testId: string;
  onClick: () => void;
}) {
  const Glyph = icon;
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      className="inline-flex h-[22px] items-center gap-1 rounded-control border border-kit-slate-6 bg-white px-1.5 text-label font-medium text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Glyph size={12} strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
      <span className="tabular-nums font-semibold">{count}</span>
    </button>
  );
}

/**
 * THE CELL. Line 1 is what the driver sent back from THIS trip; line 2 is the
 * signed paper. Three different absences stay three different absences:
 *
 *   ledger unknown            `Not recorded` - the answer never arrived
 *   nothing recorded yet      `Not delivered yet` - nothing is due
 *   reached, no photo         `No delivery photo yet` - work is open
 *
 * A missing VIDEO is none of them: video is not required (owner ruling
 * 2026-09-11), so a trip with no video says nothing about one.
 */
function DriverSubmissionCell({
  row,
  onOpen,
}: {
  row: DoRegisterRow;
  onOpen: (pick: ViewerPick) => void;
}) {
  const reached = row.latestResult === "delivered" || row.latestResult === "partial";
  const { known, photos, videos, unbound } = row.submission;
  const unboundTitle =
    unbound > 0 ? `${unbound} ${DOR_COPY.unboundNote}` : undefined;

  /* Nothing was ever due and nothing ever came — the pill already said why. */
  if (voidedWithNothingSubmitted(row)) return null;

  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-1 truncate">
        {!known ? (
          <Absent>{DOR_COPY.notRecorded}</Absent>
        ) : photos === 0 && videos === 0 ? (
          <span title={unboundTitle}>
            <Absent>{reached ? DOR_COPY.noPhoto : DOR_COPY.notDelivered}</Absent>
          </span>
        ) : (
          <>
            {photos > 0 ? (
              <CountButton
                icon={ImageIcon}
                label={DOR_COPY.photos}
                count={photos}
                title={DOR_COPY.openPhotos}
                testId="do-submission-photos"
                onClick={() => onOpen({ row, kind: "photo" })}
              />
            ) : null}
            {videos > 0 ? (
              <CountButton
                icon={Video}
                label={DOR_COPY.videos}
                count={videos}
                title={DOR_COPY.openVideos}
                testId="do-submission-videos"
                onClick={() => onOpen({ row, kind: "video" })}
              />
            ) : null}
          </>
        )}
      </span>
      <span className="block truncate text-label font-normal">
        <SignedDeliveryDocumentLink doNumber={row.doNumber} present={row.signedDoPresent} />
      </span>
    </span>
  );
}

/**
 * ⭐ THE WORK QUEUE'S OWN DOOR, ON THE ROW (owner ruling 2026-09-11).
 *
 * Picking `Record delivery result` used to leave the operator with a list and
 * no way to do the thing the list is named after - open each document, find
 * the button, come back. This column appears ONLY while a queue is picked and
 * renders THE EXISTING OPERATION, never a second form:
 *
 *   Record delivery result        `DeliveryResultAction` - the DO object
 *                                 page's own component, rendered here
 *   Upload delivery photo         `DeliveryProofUploadButton` - the same
 *                                 uploader the Sales Order drawer renders,
 *                                 stamped with THIS document's number
 *   Upload signed Delivery Order  a door to the DO object's Evidence section,
 *                                 whose own attach door (Card 13, §6.1) files
 *                                 the paper against the latest recorded
 *                                 attempt without re-recording the delivery —
 *                                 so a partial trip is served truthfully.
 *   Check delivery proof          the same door: the three review acts live
 *                                 on the Evidence section (§6.1).
 */
function QueueAction({
  row,
  queue,
  onOpenDeliveryOrder,
}: {
  row: DoRegisterRow;
  queue: DoWorkQueue;
  onOpenDeliveryOrder: (row: DoRegisterRow) => void;
}) {
  if (queue === "record_result") {
    return (
      <DeliveryResultAction
        order={{ id: row.orderId, so: row.so, do_number: row.doNumber }}
        lines={row.lines}
        leg={row.leg}
        lastLeg={row.lastLeg}
        legDestination={row.legRoute?.split(" → ").at(-1) ?? null}
      />
    );
  }
  if (queue === "upload_photo") {
    return (
      <DeliveryProofUploadButton
        orderId={row.orderId}
        doNumber={row.doNumber}
        testId="do-queue-upload-photo"
      />
    );
  }
  return (
    <button
      type="button"
      data-testid={queue === "check_proof" ? "do-queue-check-proof" : "do-queue-open-delivery-order"}
      className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-control border border-kit-slate-6 bg-white px-2 text-label font-medium text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
      onClick={(event) => {
        event.stopPropagation();
        onOpenDeliveryOrder(row);
      }}
    >
      <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
      <span className="truncate">{queue === "check_proof" ? DOR_COPY.checkProof : DOR_COPY.uploadSignedDo}</span>
    </button>
  );
}

export default function DeliveryOrdersRegister() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceOrderId = searchParams.get("order")?.trim() || undefined;
  const { data, isLoading, isError, error, refetch } = useDeliveryOrdersRegister(
    sourceOrderId ? { orderId: sourceOrderId } : undefined,
  );

  /* ── THE RAIL PICKS RIDE THE URL ───────────────────────────────────────── */
  const workParam = searchParams.get("work");
  const statusParam = searchParams.get("status");
  const filters: DoRegisterFilters = useMemo(
    () => ({
      queue: (DO_WORK_QUEUES as readonly string[]).includes(workParam ?? "")
        ? (workParam as DoWorkQueue)
        : null,
      status: (DO_STATUS_KEYS as readonly string[]).includes(statusParam ?? "")
        ? (statusParam as DeliveryOrderStatus["kind"])
        : null,
    }),
    [workParam, statusParam],
  );
  const toggleParam = (key: "work" | "status", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (searchParams.get(key) === value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: false });
  };
  const setParam = (key: "work" | "status", value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: false });
  };
  const clearParam = (key: "work" | "status") => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: false });
  };

  /**
   * ⭐ THE RAIL STARTS COLLAPSED WHERE THERE IS NO ROOM FOR IT (owner ruling
   * 2026-09-11). At the observed 949px viewport a 240px rail spends a quarter
   * of the sheet on filters nobody has picked yet, and the dates the register
   * exists to answer scroll off the right edge. Below 1100px the rail starts
   * hidden and its `Show filters` button stays in the toolbar - collapsed is
   * not gone. A REMEMBERED choice still wins at any width: the operator who
   * opened it meant it.
   */
  const [filterRailOpen, setFilterRailOpen] = useState(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(FILTER_RAIL_STORAGE_KEY);
    } catch {
      /* Storage may be unavailable; the width rule still answers. */
    }
    if (stored === "0") return false;
    if (stored === "1") return true;
    return typeof window === "undefined"
      ? true
      : window.innerWidth >= NARROW_VIEWPORT_PX;
  });
  const setFilterRailVisible = (open: boolean) => {
    setFilterRailOpen(open);
    try {
      localStorage.setItem(FILTER_RAIL_STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* Storage may be unavailable; the live state still works. */
    }
  };

  /* Which attachment viewer is open, over which document. */
  const [viewer, setViewer] = useState<ViewerPick>(null);

  const allRows = useMemo<DoRegisterRow[]>(() => {
    const attemptsByDo = new Map<string, DeliveryOrderAttemptRow[]>();
    for (const a of data?.attempts ?? []) {
      if (!a.do_number) continue;
      const list = attemptsByDo.get(a.do_number) ?? [];
      list.push(a);
      attemptsByDo.set(a.do_number, list);
    }
    // The §4 handover facts (0363) — Received by Logistics lights the blue pill.
    const handoverByDoId = new Map<string, DeliveryHandoverKind[]>();
    for (const e of data?.handoverEvents ?? []) {
      const list = handoverByDoId.get(e.delivery_order_id) ?? [];
      list.push(e.kind);
      handoverByDoId.set(e.delivery_order_id, list);
    }
    // §6.1 (0489) — the review and evidence records, grouped once.
    const proofRecords = groupProofRecords(data?.proofReviews, data?.attemptEvidence);
    return (data?.deliveryOrders ?? []).map((r) =>
      buildDoRegisterRow(r, attemptsByDo, handoverByDoId, proofRecords),
    );
  }, [data]);

  const rails = useMemo(() => buildDoRegisterRails(allRows, filters), [allRows, filters]);
  const rows = useMemo(
    () => allRows.filter((r) => matchesDoFilters(r, filters)),
    [allRows, filters],
  );

  /* ── SELECTION — ticks scope document OUTPUT only, never a write. ──────── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleRow = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  /* Header select-all acts on the VISIBLE filtered rows the engine hands in —
     never on rows a filter hid. */
  const toggleAll = useCallback((keys: string[], allSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);

  const openDeliveryOrder = useCallback(
    (r: DoRegisterRow) =>
      navigate(`/operation/delivery-orders/${encodeURIComponent(r.doNumber)}`),
    [navigate],
  );
  const openSalesOrder = useCallback(
    (r: DoRegisterRow) =>
      navigate(`/operation/orders/so/${encodeURIComponent(r.orderId)}`),
    [navigate],
  );

  const columns = useMemo<DataGridColumn<DoRegisterRow>[]>(
    () => [
      {
        /* THE IDENTITY COLUMN — pins while optional columns widen the sheet. */
        key: "do_number",
        label: "DO No",
        width: 150,
        sortable: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) => (
          <button
            type="button"
            className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              openDeliveryOrder(r);
            }}
          >
            {r.doNumber}
          </button>
        ),
        searchValue: (r) => r.doNumber,
        filterValue: (r) => r.doNumber,
      },
      {
        /* `DO date` = the day the system issued this document (owner column
           ruling 2026-08-18). ⭐ VISIBLE BY DEFAULT, IMMEDIATELY AFTER THE
           NUMBER (owner ruling 2026-09-11, overwriting the 2026-09-09 "falls
           to the end"): a document register must be able to say when its
           documents were made, and the answer belongs beside the document's
           own identity, not seven columns away. It is still neither delivery
           date - those are the two adjacent Dates columns below. */
        key: "do_date",
        label: "DO date",
        width: 113,
        sortable: true,
        chooserGroup: "Document",
        filterType: "date",
        dateValue: (r) => r.issuedAt,
        accessor: (r) => fmtDate(r.issuedAt),
        searchValue: (r) => fmtDate(r.issuedAt),
        filterValue: (r) => fmtDate(r.issuedAt),
        sortFn: (a, b) => a.issuedAt.localeCompare(b.issuedAt),
      },
      {
        /* The fact cell stays focused on identity (owner correction
           2026-09-06): the inline `Order Route` second line is retired; the
           route stays one right-click away in the governed context menu. */
        key: "so",
        label: "SO No",
        width: 110,
        sortable: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) => (
          <button
            type="button"
            className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/operation/orders/so/${encodeURIComponent(r.orderId)}`);
            }}
          >
            SO-{r.so}
          </button>
        ),
        searchValue: (r) => `SO-${r.so} ${r.so}`,
        filterValue: (r) => `SO-${r.so}`,
        sortFn: (a, b) => a.so - b.so,
      },
      {
        key: "customer",
        label: "Customer",
        width: 190,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.customer}>
            {r.customer}
          </span>
        ),
        searchValue: (r) => r.customer,
        filterValue: (r) => r.customer,
      },
      {
        /* ⭐ ONE STATUS COLUMN, MOVED TO THE FRONT (owner ruling 2026-09-11):
           the register's first question after *which document, whose order*
           is *where is it now* - and the answer used to sit past the dates,
           past logistics, past the location. The two-line 13/11 grammar (ui
           MASTER §5) carries the DOCUMENT's pill on line 1 and the recorded
           RESULT plus its reason on line 2 (`statusDetailOf`), which is what
           the retired default `Delivery Result` column used to print alone.
           A register still shows no action sentence - the result is a FACT. */
        key: "status",
        label: "Status",
        width: 190,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Document",
        accessor: (r) => {
          const detail = statusDetailOf(r);
          return (
            <span className="block min-w-0">
              <StatusPill tone={STATUS_TONE[r.status.kind]}>{r.status.label}</StatusPill>
              {detail ? (
                <span
                  className="block truncate text-label font-normal text-base-600"
                  title={detail}
                  data-testid="do-status-detail"
                >
                  {detail}
                </span>
              ) : null}
            </span>
          );
        },
        /* The sheet and the search say what the screen says: a reader looking
           for `Partially Delivered` must find the row that recorded it, even
           though the pill spells `Delivery exception`. */
        searchValue: (r) =>
          [
            r.status.label,
            statusDetailOf(r),
            r.latestResult ? DELIVERY_RESULT_LABEL[r.latestResult] : DOR_COPY.notDelivered,
          ]
            .filter(Boolean)
            .join(" "),
        exportValue: (r) => {
          const detail = statusDetailOf(r);
          return detail ? `${r.status.label} · ${detail}` : r.status.label;
        },
        filterValue: (r) => r.status.label,
      },
      {
        /* `Requested Delivery Date` = the date the CUSTOMER asked Carres to
           deliver on, from the Sales Order — the governed word (owner ruling
           2026-08-27), read through the ONE `requestedDeliveryOf` arithmetic.
           ⭐ VISIBLE BY DEFAULT (owner correction 2026-09-09), immediately
           beside `Confirmed Delivery`: the register's job includes answering
           *what did the customer ask for, and has anyone agreed a day yet?* —
           and a column hidden in the chooser answers nobody. `DO date` — the
           day the document was issued — keeps its place at the far end; it is
           never either delivery date. */
        key: "customer_delivery",
        label: "Requested Delivery Date",
        width: 176,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.requestedDelivery,
        accessor: (r) =>
          r.requestedDelivery ? (
            requestedText(r)
          ) : (
            <span title={r.requestedTbd ? DATE_TO_BE_CONFIRMED_FULL : undefined}>
              <Absent>{requestedText(r)}</Absent>
            </span>
          ),
        /* ⭐ THE SHEET SAYS WHAT THE SCREEN SAYS. The cell prints three
           different things — a date, `To be confirmed`, `No delivery date` —
           and the export used to flatten the middle one into the last, so an
           Excel reader was told a customer had named no day when the customer
           had in fact asked for one still being settled. ONE spelling now
           feeds the cell, the search, the filter and the export. */
        searchValue: (r) => requestedText(r),
        exportValue: (r) => requestedText(r),
        filterValue: (r) => requestedText(r),
        sortFn: (a, b) =>
          (a.requestedDelivery ?? "").localeCompare(b.requestedDelivery ?? ""),
      },
      {
        /* `Confirmed Delivery` — the agreed operational day (COPY-STANDARD;
           the ambiguous `Delivery date` label is retired by the 2026-09-06
           correction). `Confirmed Time` is its own column in the chooser. */
        key: "confirmed_delivery",
        label: "Confirmed Delivery",
        width: 150,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.confirmedDelivery,
        accessor: (r) =>
          r.confirmedDelivery ? (
            fmtDate(r.confirmedDelivery)
          ) : (
            <Absent>{DOR_COPY.noConfirmedDate}</Absent>
          ),
        searchValue: (r) =>
          r.confirmedDelivery ? fmtDate(r.confirmedDelivery) : DOR_COPY.noConfirmedDate,
        filterValue: (r) =>
          r.confirmedDelivery ? fmtDate(r.confirmedDelivery) : DOR_COPY.noConfirmedDate,
        sortFn: (a, b) =>
          (a.confirmedDelivery ?? "").localeCompare(b.confirmedDelivery ?? ""),
      },
      {
        key: "confirmed_time",
        label: "Confirmed Time",
        width: 120,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Dates",
        accessor: (r) => r.confirmedTime ?? <Absent>{DOR_COPY.noTime}</Absent>,
        searchValue: (r) => r.confirmedTime ?? DOR_COPY.noTime,
        filterValue: (r) => r.confirmedTime ?? DOR_COPY.noTime,
      },
      {
        /* The partner named on the document — a snapshot fact of THIS trip. */
        key: "logistics",
        /* Shortened to `Logistics` (owner ruling 2026-09-11) so the register
           spends its width on facts rather than on a heading. The Logistics
           word law keeps the s; the full role word `Logistics Partner` stays
           the vocabulary everywhere the role itself is being named. */
        label: "Logistics",
        width: 140,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) =>
          r.logisticsPartner ?? <Absent>{DOR_COPY.noLogistics}</Absent>,
        searchValue: (r) => r.logisticsPartner ?? DOR_COPY.noLogistics,
        filterValue: (r) => r.logisticsPartner ?? DOR_COPY.noLogistics,
      },
      {
        key: "location",
        label: "Delivery Location",
        width: 180,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.location}>
            {r.location}
          </span>
        ),
        searchValue: (r) => r.location,
        filterValue: (r) => r.location,
      },
      {
        /* ⭐ DRIVER SUBMISSION - the DOORS, not a verdict (owner ruling
           2026-09-11, replacing the default `Proof Status` column).
           `Proof Status` stated two facts an operator then had to go and
           verify somewhere else; this column OPENS them: this trip's photos,
           this trip's videos, and the signed paper the customer put a name on.
           Every count is real - files stamped with THIS document's number -
           and an unknown ledger prints an unknown, never a reassuring zero.
           An upload is evidence of an upload; it is not proof accepted and
           not a successful delivery, and no tick here says otherwise. */
        key: "driver_submission",
        label: DOR_COPY.driverSubmission,
        width: 214,
        sortable: true,
        chooserGroup: "Delivery",
        accessor: (r) => <DriverSubmissionCell row={r} onOpen={setViewer} />,
        searchValue: (r) => submissionSearchText(r),
        exportValue: (r) => submissionSearchText(r),
        filterValue: (r) => {
          const reached = r.latestResult === "delivered" || r.latestResult === "partial";
          if (!reached) return DOR_COPY.notDelivered;
          if (!r.submission.known) return DOR_COPY.notRecorded;
          if (r.submission.photos === 0 || !r.signedDoPresent) return "Proof required";
          return "Proof on file";
        },
        sortFn: (a, b) =>
          a.submission.photos + a.submission.videos -
          (b.submission.photos + b.submission.videos),
      },
      {
        key: "goods",
        label: "Goods",
        width: 220,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Delivery",
        accessor: (r) => (
          <span className="block truncate" title={r.goodsSummary}>
            {r.goodsSummary}
          </span>
        ),
        searchValue: (r) => r.goodsSummary,
        filterValue: (r) => r.goodsSummary,
      },
      {
        /* Available in the chooser, OFF by default (owner ruling 2026-08-18):
           `DO date` already answers when the document was issued. */
        key: "created",
        label: "Created",
        width: 113,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.issuedAt,
        accessor: (r) => fmtDate(r.issuedAt),
        searchValue: (r) => fmtDate(r.issuedAt),
        filterValue: (r) => fmtDate(r.issuedAt),
        sortFn: (a, b) => a.issuedAt.localeCompare(b.issuedAt),
      },
      /* ⭐ THE PICKED QUEUE'S OWN DOOR - present only while a queue is
         picked, so an unfiltered register gains no column and no width.
         It sits LAST: the row is read left to right and the act is what the
         reading ends in. */
      ...(filters.queue
        ? [
            {
              key: "queue_action",
              label: DO_QUEUE_LABEL[filters.queue],
              width: 210,
              chooserGroup: "Delivery",
              /* A door states nothing, so it carries no funnel: the walk found
                 one offering a single `(blank)` option, whose only possible
                 effect was to hide the row the operator came to act on. */
              filterable: false,
              accessor: (r: DoRegisterRow) => (
                <QueueAction
                  row={r}
                  queue={filters.queue as DoWorkQueue}
                  onOpenDeliveryOrder={openDeliveryOrder}
                />
              ),
              /* A door is not a fact: it never joins the search, the export or
                 a per-column filter. */
              searchValue: () => "",
              exportValue: () => "",
            } satisfies DataGridColumn<DoRegisterRow>,
          ]
        : []),
    ],
    [navigate, openDeliveryOrder, openSalesOrder, filters.queue],
  );

  const contextMenu = useCallback(
    (r: DoRegisterRow): DataGridContextMenuItem[] => [
      { label: "View", onClick: () => openDeliveryOrder(r) },
      {
        label: "Open SO-" + r.so,
        onClick: () => navigate(`/operation/orders/so/${encodeURIComponent(r.orderId)}`),
      },
      {
        label: "Open Order Route",
        onClick: () =>
          navigate(`/operation/orders/so/${encodeURIComponent(r.orderId)}?route=1`),
      },
    ],
    [navigate, openDeliveryOrder],
  );

  const showFiltersButton = (
    <button
      type="button"
      aria-label="Show filters"
      title="Show filters"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
      data-testid="delivery-orders-show-filters"
      onClick={() => setFilterRailVisible(true)}
    >
      <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        testId="delivery-orders-destination-header"
        word={DOR_COPY.page}
        docTitle={DOR_COPY.docTitle}
        destinationHeader
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {filterRailOpen ? (
          <FilterRail
            testId="delivery-orders-rail"
            onHide={() => setFilterRailVisible(false)}
          >
            <FilterRailGroup title={DOR_COPY.railWork}>
              {DO_WORK_QUEUES.map((key) => (
                <FilterRailRow
                  key={key}
                  label={DO_QUEUE_LABEL[key]}
                  count={rails.work[key]}
                  active={filters.queue === key}
                  onClick={() => toggleParam("work", key)}
                  testId={`delivery-orders-work-${key}`}
                />
              ))}
            </FilterRailGroup>
            {/* ⭐ DOCUMENT STATUS IS THE KIT'S OWN DROPDOWN (owner ruling
                2026-09-11). Six stacked rows spent a third of the rail on a
                choice that is one value at a time; the kit Select states the
                current pick in one line and hands the rail's height back to
                WORK TO DO, which is where the day actually starts. Each row
                still carries its live count - the number is why an operator
                picks it. `All` clears the status condition ONLY; a picked
                work queue survives, because they are two questions. */}
            <FilterRailGroup title={DOR_COPY.railStatus}>
              <Select
                id="delivery-orders-status"
                value={filters.status ?? ALL_STATUS}
                onValueChange={(value) =>
                  value === ALL_STATUS
                    ? clearParam("status")
                    : setParam("status", value)
                }
                options={[
                  {
                    value: ALL_STATUS,
                    label: `${DOR_COPY.allDocuments} (${rails.total})`,
                  },
                  ...DO_STATUS_KEYS.map((key) => ({
                    value: key,
                    label: `${STATUS_LABEL[key]} (${rails.status[key]})`,
                  })),
                ]}
              />
            </FilterRailGroup>
          </FilterRail>
        ) : null}

        {/* 8px work-surface breathing room — REGISTER STATUS FOOTER law. */}
        <div className="flex min-w-0 min-h-0 flex-1 flex-col p-2" data-testid="register-column">
          {isError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-base-700">{DOR_COPY.loadFailed}</p>
              {(error as Error | undefined)?.message ? (
                <p className="text-meta text-base-500">{(error as Error).message}</p>
              ) : null}
              <button
                type="button"
                className="rounded-md border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-base-50"
                onClick={() => void refetch()}
              >
                {DOR_COPY.tryAgain}
              </button>
            </div>
          ) : (
            <DataGrid<DoRegisterRow>
              appearance="reference"
              rows={rows}
              columns={columns}
              storageKey="carres.deliveryOrders.register.v4"
              rowKey={(r) => r.id}
              exportName="Delivery Orders"
              searchPlaceholder={DOR_COPY.search}
              isLoading={isLoading}
              /* The governed empty state answers all three questions (COPY-
                 STANDARD): what is missing, why, and who does what next. */
              emptyMessage={
                allRows.length === 0 ? DOR_COPY.emptyRegister : DOR_COPY.emptyFiltered
              }
              groupBanner={false}
              stickyIdentity
              chooserGroupOrder={["Document", "Customer", "Delivery", "Dates"]}
              onRowDoubleClick={openDeliveryOrder}
              contextMenu={contextMenu}
              expandTitle="Show delivery order goods"
              expandable={{ renderExpansion: (r) => <DoExpansion row={r} /> }}
              selectable={{
                selectedKeys: selected,
                onToggle: toggleRow,
                onToggleAll: toggleAll,
              }}
              selectionSummary={(n) =>
                n === 1 ? "1 delivery order selected" : `${n} delivery orders selected`
              }
              selectionActions={[
                {
                  /* Document output only — never `Assign logistics` here:
                     initial assignment is Monitor's journey (MASTER §8). */
                  label: (n) => `Print ${n} delivery order${n === 1 ? "" : "s"}`,
                  kind: "output",
                  onClick: (picked) => {
                    void printDeliveryOrders(picked as unknown as DoRegisterRow[]);
                  },
                },
              ]}
              /* ⭐ EVERY LIVE NARROWING IN ONE LINE (owner ruling
                 2026-09-11). The rail's picks and the grid's own column
                 funnels now share one strip above the table, each removable
                 on its own, under one `Clear filters`. Without it the rail
                 could be collapsed at 949px while still hiding rows, and the
                 operator would have no way to see why. */
              activeConditions={[
                ...(filters.queue
                  ? [
                      {
                        key: "work",
                        label: DO_QUEUE_LABEL[filters.queue],
                        onClear: () => clearParam("work"),
                      },
                    ]
                  : []),
                ...(filters.status
                  ? [
                      {
                        key: "status",
                        label: STATUS_LABEL[filters.status],
                        onClear: () => clearParam("status"),
                      },
                    ]
                  : []),
              ]}
              onClearConditions={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("work");
                next.delete("status");
                setSearchParams(next, { replace: false });
              }}
              toolbarStart={!filterRailOpen ? showFiltersButton : undefined}
              statusSummary={(filtered) => {
                /* Narrowed-versus-total stays explicit against the WHOLE
                   register (REGISTER STATUS FOOTER law) — a rail pick is a
                   narrowing too. */
                const line = doRegisterFooter(filtered.length, allRows.length);
                return (
                  <span className="block truncate" title={line}>
                    {line}
                  </span>
                );
              }}
            />
          )}
        </div>
      </div>
      {/* The gallery and the player - opened from a count, showing exactly
          the files that count counted. */}
      {viewer ? (
        <DriverSubmissionViewer
          orderId={viewer.row.orderId}
          doNumber={viewer.row.doNumber}
          kind={viewer.kind}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  );
}
