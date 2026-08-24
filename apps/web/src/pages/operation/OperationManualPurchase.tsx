import { useEffect, useMemo, useState } from "react";
import {
  DEMAND_PURPOSES,
  DEMAND_PURPOSE_DEFAULT,
  MANUAL_PURCHASE_STATUS_WORDS,
  MANUAL_PURCHASE_WORDS as MW,
  TO_ORDER_WORDS as W,
  manualPurchaseStatusOf,
  purchasingRefusal,
  stillNeededOf,
  type DemandPickItem,
  type DemandPurpose,
  type ManualPurchaseStatus,
  type ManualPurchaseStatusKind,
  type OrderActionTone,
} from "@carres/shared";
import { useQuery } from "@tanstack/react-query";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import {
  DataGrid,
  type DataGridColumn,
} from "@/components/register/DataGrid";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import {
  useAlreadyOnPo,
  useCreatePurchaseRequest,
  useCreatePurchaseRequestLine,
  useDecidePurchaseRequest,
  useDeliveryPartners,
  useIssuePurchaseRequests,
  useManualPurchaseDetail,
  useManualPurchaseRegister,
  type ManualPurchaseRegisterPayload,
  type PurchaseRequestLineRow,
  type PurchaseRequestRow,
} from "@/lib/queries";
import PurchasingTabs from "./PurchasingTabs";

/**
 * MANUAL PURCHASE — the request, the approval, the order
 * (CARD-2026-08-18-manual-purchase; docs/purchasing/MASTER.md §3).
 *
 * The typed lane's ONE page: purchases nobody's customer asked for. The
 * register lists requests (one per row, Excel-row law — a row never owns
 * workflow); `+ New request` opens the FULL-PAGE create workspace, never a
 * dialog. The 600px `CreatePurchaseDialog` is retired by this page: its
 * proven header/lines split and per-row submit contract move here, its
 * container does not.
 *
 * Status is ONE arithmetic — `manualPurchaseStatusOf` in packages/shared
 * (Law D) — over facts the register read returns. Nothing here computes a
 * second version, and `Arrived` has no button anywhere (the Observation Law:
 * the system reads the linked PO's posted receipt — slice 3).
 *
 * Money appears NOWHERE on this page: Purchasing has no money, and the
 * approver-only money surface is the approval slice's, server-gated.
 */

/** Register pill tones — decided states quiet, waiting states louder. */
const STATUS_TONE: Record<ManualPurchaseStatusKind, OrderActionTone> = {
  waiting_approval: "warning",
  waiting_sku: "warning",
  ready_to_order: "info",
  ordered: "neutral",
  arrived: "success",
  not_going_ahead: "neutral",
};

interface RequestRegisterRow {
  id: string;
  reqNo: string;
  purpose: string;
  purposeLabel: string;
  what: string;
  qty: number;
  deliverTo: string;
  neededBy: string | null;
  raisedBy: string;
  status: ManualPurchaseStatus;
  createdAt: string;
}

function purposeLabelOf(value: string): string {
  return DEMAND_PURPOSES.find((p) => p.value === value)?.label ?? value;
}

function buildRows(data: ManualPurchaseRegisterPayload): RequestRegisterRow[] {
  const destName = new Map(data.destinations.map((d) => [d.id, d.name]));
  const userName = new Map(data.users.map((u) => [u.id, u.name ?? ""]));
  const linesByReq = new Map<string, PurchaseRequestLineRow[]>();
  for (const l of data.lines) {
    const list = linesByReq.get(l.request_id) ?? [];
    list.push(l);
    linesByReq.set(l.request_id, list);
  }

  return data.requests.map((r: PurchaseRequestRow) => {
    const lines = linesByReq.get(r.id) ?? [];
    const live = lines.filter((l) => l.cancelled_at === null);
    const first = live[0] ?? lines[0] ?? null;
    const what =
      first === null
        ? ""
        : live.length > 1
          ? `${first.sku} + ${live.length - 1} more`
          : first.sku;
    return {
      id: r.id,
      reqNo: r.req_no,
      purpose: r.purpose,
      purposeLabel: purposeLabelOf(r.purpose),
      what,
      qty: live.reduce((n, l) => n + l.qty, 0),
      deliverTo: destName.get(r.destination_id) ?? "",
      neededBy: r.required_by,
      raisedBy: userName.get(r.created_by ?? "") ?? "",
      status: manualPurchaseStatusOf({
        approvalRequired: r.approval_required,
        approvedAt: r.approved_at,
        refusedAt: r.refused_at,
        refuseReason: r.refuse_reason,
        lines: lines.map((l) => ({
          qty: l.qty,
          issuedQty: l.issued_qty,
          remainingQty: l.remaining_qty,
          cancelledAt: l.cancelled_at,
          poId: l.po_id,
          received: l.received,
        })),
      }),
      createdAt: r.created_at,
    };
  });
}

export default function OperationManualPurchase() {
  const [mode, setMode] = useState<"register" | "create" | { detail: string }>(
    "register",
  );
  const q = useManualPurchaseRegister();

  const rows = useMemo(
    () => (q.data ? buildRows(q.data) : []),
    [q.data],
  );

  /** Rail filter — a queue row or a Need for facet narrows the register. */
  const [statusFilter, setStatusFilter] = useState<ManualPurchaseStatusKind | null>(null);
  const [purposeFilter, setPurposeFilter] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (statusFilter === null || r.status.kind === statusFilter) &&
          (purposeFilter === null || r.purpose === purposeFilter),
      ),
    [rows, statusFilter, purposeFilter],
  );

  const countOf = (kind: ManualPurchaseStatusKind) =>
    rows.filter((r) => r.status.kind === kind).length;
  /** Work waiting, never a total (rail law): decided/derived states are not
   *  somebody's queue, so only the waiting ones carry a count. */
  const queueRows: Array<{ label: string; kind: ManualPurchaseStatusKind; count: number }> = [
    { label: "Approve the purchase", kind: "waiting_approval", count: countOf("waiting_approval") },
    { label: "Issue PO", kind: "ready_to_order", count: countOf("ready_to_order") },
    { label: "Check the SKU", kind: "waiting_sku", count: countOf("waiting_sku") },
  ];

  const columns = useMemo<DataGridColumn<RequestRegisterRow>[]>(
    () => [
      {
        key: "req_no",
        label: MW.colRef,
        width: 110,
        sortable: true,
        accessor: (r) => (
          <button
            type="button"
            className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              setMode({ detail: r.id });
            }}
          >
            {r.reqNo}
          </button>
        ),
        searchValue: (r) => r.reqNo,
        filterValue: (r) => r.reqNo,
      },
      {
        key: "purpose",
        label: MW.needFor,
        width: 110,
        sortable: true,
        accessor: (r) => r.purposeLabel,
        searchValue: (r) => r.purposeLabel,
        filterValue: (r) => r.purposeLabel,
      },
      {
        key: "what",
        label: MW.colWhat,
        width: 210,
        sortable: true,
        accessor: (r) => (
          <span className="block truncate font-mono" title={r.what}>
            {r.what}
          </span>
        ),
        searchValue: (r) => r.what,
        filterValue: (r) => r.what,
      },
      {
        key: "qty",
        label: MW.colQty,
        width: 60,
        sortable: true,
        accessor: (r) => <span className="block text-right tabular-nums">{r.qty}</span>,
        searchValue: (r) => String(r.qty),
        filterValue: (r) => String(r.qty),
        sortFn: (a, b) => a.qty - b.qty,
      },
      {
        key: "deliver_to",
        label: MW.deliverTo,
        width: 150,
        sortable: true,
        accessor: (r) => (
          <span className="block truncate" title={r.deliverTo}>
            {r.deliverTo}
          </span>
        ),
        searchValue: (r) => r.deliverTo,
        filterValue: (r) => r.deliverTo,
      },
      {
        key: "needed_by",
        label: MW.neededBy,
        width: 113,
        sortable: true,
        filterType: "date",
        dateValue: (r) => r.neededBy,
        accessor: (r) => (r.neededBy ? fmtDate(r.neededBy) : null),
        searchValue: (r) => (r.neededBy ? fmtDate(r.neededBy) : ""),
        filterValue: (r) => (r.neededBy ? fmtDate(r.neededBy) : ""),
        sortFn: (a, b) => (a.neededBy ?? "").localeCompare(b.neededBy ?? ""),
      },
      {
        key: "raised_by",
        label: MW.raisedBy,
        width: 120,
        sortable: true,
        accessor: (r) => (
          <span className="block truncate" title={r.raisedBy}>
            {r.raisedBy}
          </span>
        ),
        searchValue: (r) => r.raisedBy,
        filterValue: (r) => r.raisedBy,
      },
      {
        key: "status",
        label: MW.colStatus,
        width: 190,
        sortable: true,
        accessor: (r) => (
          <span className="block min-w-0">
            <StatusPill tone={STATUS_TONE[r.status.kind]}>{r.status.label}</StatusPill>
            {r.status.reasonLabel ? (
              <span className="block truncate text-label font-normal text-base-600">
                {r.status.reasonLabel}
              </span>
            ) : null}
          </span>
        ),
        searchValue: (r) => r.status.label,
        filterValue: (r) => r.status.label,
      },
    ],
    [],
  );

  if (mode === "create") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PurchasingTabs />
        <CreateRequestWorkspace
          destinations={q.data?.destinations ?? []}
          onDone={() => {
            setMode("register");
            void q.refetch();
          }}
        />
      </div>
    );
  }

  if (typeof mode === "object") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PurchasingTabs />
        <RequestDetail
          id={mode.detail}
          readySiblingIds={(() => {
            const mine = new Set(
              (q.data?.lines ?? [])
                .filter((l) => l.request_id === mode.detail && l.cancelled_at === null)
                .map((l) => l.supplier_id),
            );
            return rows
              .filter(
                (r) =>
                  r.id !== mode.detail &&
                  r.status.kind === "ready_to_order" &&
                  (q.data?.lines ?? []).some(
                    (l) =>
                      l.request_id === r.id &&
                      l.cancelled_at === null &&
                      mine.has(l.supplier_id),
                  ),
              )
              .map((r) => r.id);
          })()}
          onBack={() => {
            setMode("register");
            void q.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PurchasingTabs />
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* The 200px rail sits on the LEFT, like every other purchasing page
            (corrections card §3 — SO Batch, Receiving and Claims all measure
            a left 200px rail; the RIGHT side is §5's supervision widgets').
            Same tiles, same counts, same behaviour — only the side changed. */}
        <RailAside
          queueRows={queueRows}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          purposeFilter={purposeFilter}
          setPurposeFilter={setPurposeFilter}
          rows={rows}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="register-column">
          <DataGrid<RequestRegisterRow>
            appearance="reference"
            /* `+ New request` is the register's PRIMARY action and lives in the
               control band (corrections §4) — a whole empty row above the grid
               was a band spent on one control. */
            toolbarStart={
              <Button
                variant="primary"
                onClick={() => setMode("create")}
                data-testid="manual-purchase-new-request"
              >
                {MW.newRequest}
              </Button>
            }
            rows={filtered}
            columns={columns}
            storageKey="carres.manualPurchase.register.v1"
            rowKey={(r) => r.id}
            exportName="Manual Purchase"
            searchPlaceholder="Search requests…"
            isLoading={q.isLoading}
            emptyMessage={
              rows.length === 0
                ? "No requests yet — press + New request to raise the first one."
                : "No matching requests."
            }
            groupBanner={false}
            stickyIdentity
            onRowDoubleClick={(r) => setMode({ detail: r.id })}
            statusSummary={(shown) => {
              const word = shown.length === 1 ? "request" : "requests";
              const line =
                shown.length === rows.length
                  ? `${shown.length} ${word}`
                  : `${shown.length} of ${rows.length} requests`;
              return (
                <span className="block truncate" title={line}>
                  {line}
                </span>
              );
            }}
          />
        </div>

      </div>
    </div>
  );
}

/* ── The left rail — queues above, the Need for facet below ──────────────── */

function RailAside({
  queueRows,
  statusFilter,
  setStatusFilter,
  purposeFilter,
  setPurposeFilter,
  rows,
}: {
  queueRows: Array<{ label: string; kind: ManualPurchaseStatusKind; count: number }>;
  statusFilter: ManualPurchaseStatusKind | null;
  setStatusFilter: (v: ManualPurchaseStatusKind | null) => void;
  purposeFilter: string | null;
  setPurposeFilter: (v: string | null) => void;
  rows: RequestRegisterRow[];
}) {
  return (
    <aside
      className="flex w-[200px] shrink-0 flex-col gap-4 overflow-auto"
      data-testid="manual-purchase-rail"
    >
      <section>
        <h3 className="px-2 pb-1 text-label font-semibold uppercase tracking-[0.14em] text-base-500">
          Queues
        </h3>
        <div className="flex flex-col gap-0.5">
          {queueRows.map((row) => {
            const on = statusFilter === row.kind;
            return (
              <button
                key={row.kind}
                type="button"
                data-testid={`mp-queue-${row.kind}`}
                onClick={() => setStatusFilter(on ? null : row.kind)}
                className={`flex w-full items-center gap-2 rounded px-2 py-[7px] text-left text-meta ${
                  on
                    ? "bg-kit-blue-3 font-semibold text-base-900"
                    : "font-medium text-base-700 hover:bg-hovertint"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {row.count > 0 ? (
                  <span className="shrink-0 tabular-nums text-base-600">{row.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <h3 className="px-2 pb-1 text-label font-semibold uppercase tracking-[0.14em] text-base-500">
          {MW.needFor}
        </h3>
        <div className="flex flex-col gap-0.5">
          {DEMAND_PURPOSES.map((p) => {
            const on = purposeFilter === p.value;
            const count = rows.filter((r) => r.purpose === p.value).length;
            return (
              <button
                key={p.value}
                type="button"
                data-testid={`mp-facet-${p.value}`}
                onClick={() => setPurposeFilter(on ? null : p.value)}
                className={`flex w-full items-center gap-2 rounded px-2 py-[7px] text-left text-meta ${
                  on
                    ? "bg-kit-blue-3 font-semibold text-base-900"
                    : "font-medium text-base-700 hover:bg-hovertint"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                {count > 0 ? (
                  <span className="shrink-0 tabular-nums text-base-600">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

/* ── The create workspace — full page, never a dialog (card §3) ───────────── */

type LineState = "idle" | "pending" | "created" | "failed";

interface LineDraft {
  id: string;
  sku: string | null;
  needle: string;
  qty: string;
  note: string;
  state: LineState;
  error: string | null;
}

let seq = 0;
const blankLine = (): LineDraft => ({
  id: `l${++seq}`,
  sku: null,
  needle: "",
  qty: "1",
  note: "",
  state: "idle",
  error: null,
});
const isBlank = (l: LineDraft) =>
  l.sku == null && l.needle === "" && l.note === "" && (l.qty === "1" || l.qty === "");

/** The picker's five columns — ported unchanged from the retired dialog
 *  (P15's list; the SKU leads because four `Booqit`s differ only by code). */
const PICK_COLUMNS: readonly Column<DemandPickItem>[] = [
  {
    key: "sku",
    label: W.pickerColSku,
    width: 30,
    cell: (i) => <span className="font-mono text-meta">{i.sku}</span>,
  },
  { key: "model", label: W.colModel, width: 30, cell: (i) => i.label },
  {
    key: "onHand",
    label: W.pickerColOnHand,
    width: 15,
    align: "right",
    numeric: true,
    cell: (i) => i.onHand,
  },
  {
    key: "reserved",
    label: W.pickerColReserved,
    width: 13,
    align: "right",
    numeric: true,
    cell: (i) => i.reserved,
  },
  {
    key: "free",
    label: W.pickerColFree,
    width: 12,
    align: "right",
    numeric: true,
    cell: (i) => i.free,
  },
];

const LINE_GRID = "minmax(0,1fr) 53px minmax(0,1fr) auto";

function CreateRequestWorkspace({
  destinations,
  onDone,
}: {
  destinations: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const email = useAuth((s) => s.session?.user?.email ?? "");

  const pick = useQuery({
    queryKey: ["to-order", "pick-items"],
    queryFn: () =>
      apiFetch<{ items: DemandPickItem[] }>(
        "/api/operation/purchase/to-order/demand/pick-items",
      ),
    staleTime: 60_000,
  });
  const items = pick.data?.items ?? [];

  const [purpose, setPurpose] = useState<DemandPurpose>(DEMAND_PURPOSE_DEFAULT);
  const [dest, setDest] = useState<string | undefined>(undefined);
  const [neededBy, setNeededBy] = useState("");
  const [why, setWhy] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [blankLine()]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The header, once created, is a record — retries reuse it. */
  const [requestId, setRequestId] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);

  const createHeader = useCreatePurchaseRequest();
  const createLine = useCreatePurchaseRequestLine();

  const active = activeId ?? lines[0]?.id;
  const chosenDest = dest ?? destinations[0]?.id;

  const patch = (id: string, p: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const qtyOk = (l: LineDraft) => Number.isInteger(Number(l.qty)) && Number(l.qty) >= 1;
  const submittable = lines.filter((l) => l.sku != null && l.state !== "created");
  const everyStartedLineNamesAnItem = lines.every((l) => l.sku != null || isBlank(l));

  /** `Why` may not be blank and the Send button stays off until it is filled
   *  (card §3) — whitespace does not pass. The DOOR enforces it again. */
  const whyOk = why.trim().length > 0;
  /** `Needed by` is one of the request's six facts (MASTER §3) — a request
   *  with no date leaves the approver and the issuer with nothing to plan
   *  against. Found empty-but-sendable on the 2026-08-19 owner walk. */
  const dateOk = neededBy !== "";

  const canSend =
    !saving &&
    whyOk &&
    dateOk &&
    chosenDest != null &&
    submittable.length > 0 &&
    submittable.every(qtyOk) &&
    everyStartedLineNamesAnItem;

  /** The disabled button NAMES its gap (the Receiving law) — the first
   *  missing header fact wins, in the form's own top-to-bottom order. */
  const sendLabel = !dateOk ? MW.sendNeedsDate : !whyOk ? MW.sendNeedsWhy : MW.send;

  function addLine() {
    const l = blankLine();
    setLines((ls) => [...ls, l]);
    setActiveId(l.id);
  }

  function removeLine(id: string) {
    setLines((ls) => {
      const rest = ls.filter((l) => l.id !== id);
      return rest.length > 0 ? rest : [blankLine()];
    });
    setActiveId((a) => (a === id ? null : a));
  }

  /**
   * ONE act with a per-row result (the retired dialog's proven contract):
   * the header lands first and is reused on retry; then one POST per line in
   * order. A failed line keeps its row with the server's own words, and
   * pressing Send again retries exactly those.
   */
  async function send() {
    if (!canSend || !chosenDest) return;
    setSaving(true);
    setHeaderError(null);

    let reqId = requestId;
    if (reqId === null) {
      try {
        const created = await createHeader.mutateAsync({
          purpose,
          destinationId: chosenDest,
          requiredBy: neededBy || null,
          why: why.trim(),
        });
        reqId = created.id;
        setRequestId(created.id);
      } catch (e) {
        setHeaderError(e instanceof Error ? e.message : W.createFailed);
        setSaving(false);
        return;
      }
    }

    const targets = submittable.map((l) => l.id);
    setLines((ls) =>
      ls.map((l) =>
        targets.includes(l.id) ? { ...l, state: "pending", error: null } : l,
      ),
    );

    let created = 0;
    for (const id of targets) {
      const line = lines.find((l) => l.id === id);
      if (!line || !line.sku) continue;
      try {
        await createLine.mutateAsync({
          requestId: reqId,
          sku: line.sku,
          qty: Number(line.qty),
          destinationId: chosenDest,
          requiredBy: neededBy || null,
          note: line.note.trim() || null,
          purpose,
        });
        created += 1;
        patch(id, { state: "created", error: null });
      } catch (e) {
        patch(id, {
          state: "failed",
          error: e instanceof Error ? e.message : W.createFailed,
        });
      }
    }
    setSaving(false);
    if (created === targets.length) onDone();
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="manual-purchase-create"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-body font-semibold uppercase tracking-[0.1em] text-base-900">
          {MW.createTitle}
        </h2>
        <span className="flex items-center gap-3">
          <Button variant="ghost" onClick={onDone}>
            {MW.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={!canSend}
            loading={saving}
            onClick={() => void send()}
            data-testid="mp-send"
          >
            {sendLabel}
          </Button>
        </span>
      </div>

      {/* ── The header — asked once for the whole request ── */}
      <div className="grid max-w-[720px] grid-cols-2 gap-3">
        <div>
          <label htmlFor="mp-purpose" className="text-meta text-kit-slate-11">
            {MW.needFor}
          </label>
          <Select
            id="mp-purpose"
            value={purpose}
            onValueChange={(v) => setPurpose(v as DemandPurpose)}
            options={DEMAND_PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>
        <div>
          <label htmlFor="mp-dest" className="text-meta text-kit-slate-11">
            {MW.deliverTo}
          </label>
          <Select
            id="mp-dest"
            value={chosenDest}
            onValueChange={setDest}
            options={destinations.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        <DatePicker
          id="mp-needed"
          label={MW.neededBy}
          value={neededBy || null}
          onChange={(v) => setNeededBy(v ?? "")}
        />
        <div>
          <span className="text-meta text-kit-slate-11">{MW.raisedBy}</span>
          {/* A FACT, never a control — the server stamps created_by itself. */}
          <p className="pt-1.5 text-body text-base-900" data-testid="mp-raised-by">
            {email.split("@")[0]} (you)
          </p>
        </div>
      </div>

      <div className="max-w-[720px]">
        <label htmlFor="mp-why" className="text-meta text-kit-slate-11">
          {MW.why}
        </label>
        {/* The sentence the approver reads; "restock" answers nothing. */}
        <textarea
          id="mp-why"
          data-testid="mp-why"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-base-200 bg-white px-3 py-2 text-body text-base-900 outline-none focus:border-kit-blue-9"
        />
      </div>

      {headerError ? (
        <p className="text-meta text-kit-red-11" data-testid="mp-header-error">
          {headerError}
        </p>
      ) : null}

      {/* ── ITEMS · one row per SKU, the dialog's proven split ── */}
      <div className="flex max-w-[900px] flex-col gap-2" data-testid="mp-lines">
        <div className="flex items-center justify-between">
          <h3 className="text-label font-semibold uppercase tracking-[0.14em] text-base-500">
            {MW.items}
          </h3>
          <Button variant="ghost" onClick={addLine} data-testid="mp-line-add">
            {MW.addLine}
          </Button>
        </div>

        <div
          className="grid items-center gap-2 text-label text-kit-slate-11"
          style={{ gridTemplateColumns: LINE_GRID }}
        >
          <span>{W.itemLabel}</span>
          <span>{W.itemsColQty}</span>
          <span>{W.remark}</span>
          <span />
        </div>

        {lines.map((line, i) => {
          const picked = items.find((it) => it.sku === line.sku) ?? null;
          const showPicker = line.id === active && line.sku == null;
          const done = line.state === "created";
          return (
            <div key={line.id} className="flex flex-col gap-1">
              <div
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: LINE_GRID }}
                data-testid={`mp-line-${i}`}
              >
                {/* SKU + Model, never the model word alone — four Booqit
                    variants rendered as the single word `Booqit` is P15's
                    own defect returned (2026-08-19 owner walk). */}
                <SearchInput
                  id={`mp-item-${i}`}
                  aria-label={W.itemLabel}
                  value={picked ? `${picked.sku} · ${picked.label}` : line.needle}
                  disabled={done}
                  onFocus={() => setActiveId(line.id)}
                  onChange={(e) => {
                    setActiveId(line.id);
                    patch(line.id, { needle: e.target.value, sku: null });
                  }}
                  placeholder={W.searchItem}
                />
                <Input
                  id={`mp-qty-${i}`}
                  aria-label={W.itemsColQty}
                  value={line.qty}
                  disabled={done}
                  onChange={(e) => patch(line.id, { qty: e.target.value })}
                />
                <Input
                  id={`mp-note-${i}`}
                  aria-label={W.remark}
                  value={line.note}
                  disabled={done}
                  onChange={(e) => patch(line.id, { note: e.target.value })}
                />
                {done ? (
                  <span className="text-meta text-kit-slate-11">{W.createdWord}</span>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => removeLine(line.id)}
                    data-testid={`mp-line-remove-${i}`}
                  >
                    {MW.remove}
                  </Button>
                )}
              </div>

              {picked?.supplier ? (
                <p className="text-meta text-kit-slate-11" data-testid={`mp-supplier-${i}`}>
                  {W.supplierLabel}: {picked.supplier}
                </p>
              ) : null}

              {picked ? (
                <AlreadyHave
                  sku={picked.sku}
                  free={picked.free}
                  qty={Number(line.qty) || 0}
                  index={i}
                />
              ) : null}

              {line.error ? (
                <p className="text-meta text-kit-red-11" data-testid={`mp-line-failed-${i}`}>
                  {line.error}
                </p>
              ) : null}

              {showPicker ? (
                <LinePicker
                  items={items}
                  needle={line.needle}
                  loading={pick.isLoading}
                  onPick={(sku) => patch(line.id, { sku, needle: "" })}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * WHAT WE ALREADY HAVE — computed BEFORE submit, per line (card §3). Half of
 * these requests are for goods Carres already has or already bought, and the
 * cheapest approval is the one nobody had to make. `free` rides the picker's
 * own read (one arithmetic); `already on PO` is the open-cover endpoint; and
 * **`still needed` is PRINTED, never left to the reader.**
 */
function AlreadyHave({
  sku,
  free,
  qty,
  index,
}: {
  sku: string;
  free: number;
  qty: number;
  index: number;
}) {
  const onPo = useAlreadyOnPo(sku);
  const already = onPo.data?.alreadyOnPo ?? 0;
  const still = stillNeededOf(qty, free, already);
  return (
    <div
      className="ml-1 flex flex-col gap-0.5 border-l-2 border-base-100 pl-3 text-meta"
      data-testid={`mp-already-have-${index}`}
    >
      <span className="text-label font-semibold uppercase tracking-[0.14em] text-base-500">
        {MW.alreadyHave}
      </span>
      <span className="text-base-700">
        {MW.freeStock} <span className="tabular-nums">{free}</span>
      </span>
      <span className="text-base-700">
        {MW.alreadyOnPo} <span className="tabular-nums">{already}</span>
        {onPo.data?.firstPo ? (
          <span className="text-base-600">
            {" "}
            · {onPo.data.firstPo.id}
            {onPo.data.firstPo.eta ? ` · ${fmtDate(onPo.data.firstPo.eta)}` : ""}
          </span>
        ) : null}
      </span>
      <span className="text-base-700" data-testid={`mp-still-needed-${index}`}>
        {MW.stillNeeded} <span className="tabular-nums font-semibold">{still}</span>
        {still === 0 && qty > 0 ? (
          <span className="text-base-600"> — this request may not be needed at all</span>
        ) : null}
      </span>
    </div>
  );
}

/** The search-result table for ONE line — ported unchanged from the dialog. */
function LinePicker({
  items,
  needle,
  loading,
  onPick,
}: {
  items: readonly DemandPickItem[];
  needle: string;
  loading: boolean;
  onPick: (sku: string) => void;
}) {
  const shown = useMemo(() => {
    const n = needle.trim().toLowerCase();
    if (!n) return items.slice(0, 8);
    return items
      .filter(
        (i) => i.label.toLowerCase().includes(n) || i.sku.toLowerCase().includes(n),
      )
      .slice(0, 8);
  }, [items, needle]);

  return (
    <DataTable<DemandPickItem>
      rows={shown}
      columns={PICK_COLUMNS}
      rowId={(i) => i.sku}
      onRowOpen={(i) => onPick(i.sku)}
      label={W.pickerTableLabel}
      loading={loading}
      empty={null}
    />
  );
}

/* ── The object detail — ONE SCROLL, no tabs (ui/MASTER §4.1; card §8) ────── */

/**
 * One request, read top to bottom: the facts the card rules (raised by ·
 * what · how many · deliver to · needed by · WHY, never blank), then
 * `WHAT WE ALREADY HAVE` per line, then — for the APPROVER only — the money
 * and the decision. The same screen renders for both roles minus the money,
 * never a permission error.
 *
 * The Approve control pre-fills `still needed`, NOT what was asked (card §4):
 * an approver who has to do the subtraction will not do it. Cutting is not
 * refusing. `Refuse` cannot be submitted without a reason.
 */
function RequestDetail({
  id,
  onBack,
  readySiblingIds,
}: {
  id: string;
  onBack: () => void;
  /** Other READY requests sharing a supplier with this one — the
   *  consolidation OFFER's candidates (card §6). */
  readySiblingIds: string[];
}) {
  const q = useManualPurchaseDetail(id);
  const pick = useQuery({
    queryKey: ["to-order", "pick-items"],
    queryFn: () =>
      apiFetch<{ items: DemandPickItem[] }>(
        "/api/operation/purchase/to-order/demand/pick-items",
      ),
    staleTime: 60_000,
  });
  const decide = useDecidePurchaseRequest();
  const issue = useIssuePurchaseRequests();
  const partnersQ = useDeliveryPartners();

  /**
   * ⭐ THE TRANSACTION COSTS THIS ISSUE WILL COMMIT TO (0380; Card 02 closure §2).
   *
   * This lane buys at the Catalog price, and the API used to read that price
   * itself and hand it straight back to the creation authority as
   * `cost_source: catalog` — so the database compared its own live value against
   * itself and agreed every time. A supplier price that moved was adopted with
   * nobody's approval and nobody's knowledge.
   *
   * The prices are therefore READ and SHOWN before `Issue PO`, and the same
   * numbers are declared with the request. `Issue as one PO` can pull in sibling
   * requests whose lines are not on this screen, so the read covers them too —
   * otherwise the operator would be declaring a price they never saw.
   */
  const issueIds = useMemo(() => [id, ...readySiblingIds], [id, readySiblingIds]);
  const costsQ = useQuery({
    queryKey: ["operation", "purchasing", "requests", "issue-costs", issueIds],
    queryFn: () =>
      apiFetch<{ costs: { sku: string; unitCost: number | null }[] }>(
        `/api/operation/purchasing/requests/issue-costs?requestIds=${encodeURIComponent(
          issueIds.join(","),
        )}`,
      ),
    staleTime: 15_000,
  });

  /** The approver's per-line numbers — seeded from `still needed` once the
   *  stock facts land; the human may override before approving. */
  const [cuts, setCuts] = useState<Record<string, string>>({});
  const [refusing, setRefusing] = useState(false);
  const [refuseReason, setRefuseReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | undefined>(undefined);
  const [issueError, setIssueError] = useState<string | null>(null);

  if (q.isLoading || !q.data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-meta text-base-500">
        {q.isError ? (q.error as Error).message : "Loading…"}
      </div>
    );
  }

  const { request, lines, destinations, users, canApprove } = q.data;
  const destName = destinations.find((d) => d.id === request.destination_id)?.name ?? "";
  const raisedBy = users.find((u) => u.id === request.created_by)?.name ?? "";
  const freeOf = (sku: string) =>
    pick.data?.items.find((i) => i.sku === sku)?.free ?? 0;

  const status = manualPurchaseStatusOf({
    approvalRequired: request.approval_required,
    approvedAt: request.approved_at,
    refusedAt: request.refused_at,
    refuseReason: request.refuse_reason,
    lines: lines.map((l) => ({
      qty: l.qty,
      issuedQty: l.issued_qty,
      remainingQty: l.remaining_qty,
      cancelledAt: l.cancelled_at,
      poId: l.po_id,
      received: l.received,
    })),
  });
  const undecided = request.approved_at === null && request.refused_at === null;
  const showDecision = canApprove && request.approval_required && undecided;

  async function submitIssue(together: boolean) {
    setIssueError(null);
    if (!q.data) return;
    const liveSuppliers = new Set(
      q.data.lines.filter((l) => l.cancelled_at === null).map((l) => l.supplier_id),
    );
    const partners: Record<string, string> = {};
    for (const sp of q.data.suppliers) {
      if (liveSuppliers.has(sp.id) && sp.kind === "factory_pickup") {
        if (!partnerId) {
          setIssueError("Select a procurement partner for this factory-pickup supplier.");
          return;
        }
        partners[sp.id] = partnerId;
      }
    }
    /* THE PRICES SHOWN ON THIS SCREEN, declared. A SKU with no Catalog price is
       a configuration hole; it is not declared as zero, and the server refuses
       the line by name. */
    const expectedCosts: Record<string, number> = {};
    for (const c of costsQ.data?.costs ?? []) {
      if (c.unitCost != null) expectedCosts[c.sku] = c.unitCost;
    }
    if (Object.keys(expectedCosts).length === 0) {
      setIssueError("The transaction costs are still loading. Wait, then issue again.");
      return;
    }
    try {
      await issue.mutateAsync({
        requestIds: together ? [id, ...readySiblingIds] : [id],
        together,
        partners: Object.keys(partners).length > 0 ? partners : null,
        expectedCosts,
      });
      onBack();
    } catch (e) {
      /* THE APPROVED TWO LINES (closure §9): the fact, then the act. */
      const body = (e as { body?: { message?: string; action?: string; code?: string } }).body;
      const fallback = purchasingRefusal(body?.code);
      setIssueError(
        `${body?.message ?? fallback.wrong} ${body?.action ?? fallback.todo}`.trim(),
      );
    }
  }

  async function submitDecision(decision: "approve" | "refuse") {
    setError(null);
    try {
      await decide.mutateAsync({
        id,
        decision,
        reason: decision === "refuse" ? refuseReason.trim() : null,
        cuts:
          decision === "approve"
            ? lines
                .filter((l) => l.cancelled_at === null)
                .map((l) => ({ id: l.id, qty: Number(cuts[l.id] ?? l.qty) }))
                .filter((c) => Number.isInteger(c.qty) && c.qty >= 0)
            : null,
      });
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision was not recorded");
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="mp-detail"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-body font-semibold text-base-900">
          <span className="font-mono">{request.req_no}</span>
          <span className="pl-3">
            <StatusPill tone={STATUS_TONE[status.kind]}>{status.label}</StatusPill>
          </span>
        </h2>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>

      {status.reasonLabel ? (
        <p className="text-meta text-base-700" data-testid="mp-detail-refuse-reason">
          {status.reasonLabel}
        </p>
      ) : null}

      {/* The facts, in the card's own order. */}
      <dl className="grid max-w-[720px] grid-cols-2 gap-x-6 gap-y-2 text-body">
        <div>
          <dt className="text-meta text-kit-slate-11">{MW.raisedBy}</dt>
          <dd className="text-base-900">{raisedBy}</dd>
        </div>
        <div>
          <dt className="text-meta text-kit-slate-11">{MW.needFor}</dt>
          <dd className="text-base-900">{purposeLabelOf(request.purpose)}</dd>
        </div>
        <div>
          <dt className="text-meta text-kit-slate-11">{MW.deliverTo}</dt>
          <dd className="text-base-900">{destName}</dd>
        </div>
        <div>
          <dt className="text-meta text-kit-slate-11">{MW.neededBy}</dt>
          <dd className="text-base-900">
            {request.required_by ? fmtDate(request.required_by) : null}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-meta text-kit-slate-11">{MW.why}</dt>
          <dd className="text-base-900" data-testid="mp-detail-why">
            {request.why}
          </dd>
        </div>
      </dl>

      {/* The lines, each with WHAT WE ALREADY HAVE — and, for the approver,
          the money and the pre-filled still-needed control. */}
      <div className="flex max-w-[900px] flex-col gap-3">
        <h3 className="text-label font-semibold uppercase tracking-[0.14em] text-base-500">
          {MW.items}
        </h3>
        {lines.map((l, i) => {
          const free = freeOf(l.sku);
          return (
            <div key={l.id} className="flex flex-col gap-1 border-b border-base-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-body text-base-900">{l.sku}</span>
                <span className="text-meta text-base-600">× {l.qty}</span>
                {l.remark ? (
                  <span className="text-meta text-base-600">· {l.remark}</span>
                ) : null}
                {l.cancelled_at ? (
                  <span className="text-meta text-base-500">
                    {MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead}
                    {l.cancel_reason ? ` — ${l.cancel_reason}` : ""}
                  </span>
                ) : null}
                {"unit_cost" in l && l.unit_cost != null ? (
                  /* THE MONEY — approver only; the server omits the key for
                     everyone else, so nothing here can leak it. */
                  <span
                    className="ml-auto tabular-nums text-meta text-base-700"
                    data-testid={`mp-detail-cost-${i}`}
                  >
                    RM {Number(l.unit_cost).toLocaleString()} × {l.qty}
                  </span>
                ) : null}
              </div>

              {l.cancelled_at === null ? (
                <AlreadyHave sku={l.sku} free={free} qty={l.qty} index={i} />
              ) : null}

              {showDecision && l.cancelled_at === null ? (
                <StillNeededControl
                  line={l}
                  free={free}
                  value={cuts[l.id]}
                  onChange={(v) => setCuts((c) => ({ ...c, [l.id]: v }))}
                  index={i}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="text-meta text-kit-red-11" data-testid="mp-decide-error">
          {error}
        </p>
      ) : null}

      {showDecision ? (
        <div className="flex max-w-[900px] items-center gap-3" data-testid="mp-decision">
          <Button
            variant="primary"
            loading={decide.isPending}
            onClick={() => void submitDecision("approve")}
            data-testid="mp-approve"
          >
            Approve
          </Button>
          {refusing ? (
            <span className="flex flex-1 items-center gap-2">
              <Input
                id="mp-refuse-reason"
                aria-label="Refuse reason"
                placeholder="Why is this not going ahead?"
                value={refuseReason}
                onChange={(e) => setRefuseReason(e.target.value)}
                data-testid="mp-refuse-reason"
              />
              {/* The reason is REQUIRED — without it a refused request is
                  simply never touched again (card §4). */}
              <Button
                variant="ghost"
                disabled={refuseReason.trim().length === 0 || decide.isPending}
                onClick={() => void submitDecision("refuse")}
                data-testid="mp-refuse-submit"
              >
                Refuse
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setRefusing(true)}
              data-testid="mp-refuse"
            >
              Refuse
            </Button>
          )}
        </div>
      ) : null}

      {/* ── ISSUE — same day, no PO-day gate; consolidation is an OFFER
          (card §6): issuing separately is ALWAYS available on the same
          screen. An offer that cannot be declined is a gate wearing an
          offer's clothes. */}
      {status.kind === "ready_to_order" ? (
        <div className="flex max-w-[900px] flex-col gap-2" data-testid="mp-issue">
          {(() => {
            const liveSuppliers = new Set(
              lines.filter((l) => l.cancelled_at === null).map((l) => l.supplier_id),
            );
            const needsPartner = q.data!.suppliers.some(
              (sp) => liveSuppliers.has(sp.id) && sp.kind === "factory_pickup",
            );
            return needsPartner ? (
              <div className="flex items-center gap-2">
                <label htmlFor="mp-issue-partner" className="text-meta text-kit-slate-11">
                  Procurement partner
                </label>
                <span className="w-[220px]">
                  <Select
                    id="mp-issue-partner"
                    value={partnerId}
                    onValueChange={setPartnerId}
                    options={(partnersQ.data?.partners ?? []).map(
                      (dp: { id: string; name: string }) => ({
                        value: dp.id,
                        label: dp.name,
                      }),
                    )}
                  />
                </span>
              </div>
            ) : null;
          })()}
          {/* ⭐ THE PRICES THIS ISSUE COMMITS TO (0380; closure §2).
              Shown before the button, because the request DECLARES them and a
              number nobody was shown is not a number anybody reviewed. `Issue as
              one PO` widens the set to the sibling requests, so this list does
              too. A SKU Catalog has no price for is named, not defaulted. */}
          {(costsQ.data?.costs ?? []).length > 0 ? (
            <div className="flex flex-col gap-0.5" data-testid="mp-issue-costs">
              <span className="text-label uppercase tracking-wide text-base-500">
                Transaction cost
              </span>
              {(costsQ.data?.costs ?? []).map((c) => (
                <span
                  key={c.sku}
                  className="flex items-center justify-between gap-3 text-meta"
                  data-testid={`mp-issue-cost-${c.sku}`}
                >
                  <span className="min-w-0 truncate font-mono">{c.sku}</span>
                  {c.unitCost == null ? (
                    <span className="flex shrink-0 flex-col text-right">
                      <span className="text-base-900">Catalog has no price.</span>
                      <span className="text-base-500">
                        Ask Catalog to set the cost of {c.sku}.
                      </span>
                    </span>
                  ) : (
                    <span className="shrink-0 tabular-nums text-base-900">
                      RM {Number(c.unitCost).toLocaleString()}
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            {readySiblingIds.length > 0 ? (
              <>
                <span className="text-meta text-base-700" data-testid="mp-issue-offer">
                  Issue as one PO? {readySiblingIds.length + 1} approved requests share
                  this supplier.
                </span>
                <Button
                  variant="primary"
                  loading={issue.isPending}
                  onClick={() => void submitIssue(true)}
                  data-testid="mp-issue-together"
                >
                  Issue as one PO
                </Button>
                <Button
                  variant="ghost"
                  disabled={issue.isPending}
                  onClick={() => void submitIssue(false)}
                  data-testid="mp-issue-separate"
                >
                  Issue separately
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                loading={issue.isPending}
                onClick={() => void submitIssue(false)}
                data-testid="mp-issue-po"
              >
                Issue PO
              </Button>
            )}
          </div>
          {issueError ? (
            <p className="text-meta text-kit-red-11" data-testid="mp-issue-error">
              {issueError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The approver's quantity — PRE-FILLED with `still needed`, never with what
 * was asked (card §4, `purchasing/MASTER.md`): an approver who has to do the
 * subtraction will not do it. The seed lands once the already-on-PO read
 * answers; a human edit afterwards is theirs and is not overwritten.
 */
function StillNeededControl({
  line,
  free,
  value,
  onChange,
  index,
}: {
  line: { id: string; sku: string; qty: number };
  free: number;
  value: string | undefined;
  onChange: (v: string) => void;
  index: number;
}) {
  const onPo = useAlreadyOnPo(line.sku);
  const still = stillNeededOf(line.qty, free, onPo.data?.alreadyOnPo ?? 0);
  const seeded = value !== undefined;
  useEffect(() => {
    if (!seeded && onPo.data) onChange(String(still));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPo.data]);
  return (
    <div className="flex items-center gap-2 text-meta">
      <label htmlFor={`mp-cut-${index}`} className="text-kit-slate-11">
        Approve
      </label>
      <span className="w-[64px]">
        <Input
          id={`mp-cut-${index}`}
          aria-label={`Approve quantity for ${line.sku}`}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          data-testid={`mp-cut-${index}`}
        />
      </span>
      <span className="text-base-600">
        of {line.qty} asked — {MW.stillNeeded} {still}
      </span>
    </div>
  );
}
