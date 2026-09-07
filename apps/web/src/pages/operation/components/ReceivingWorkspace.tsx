import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  caseProductCategory,
  pendingDeliveryAfterSave,
  poLineReportable,
  receiveLineClaimProblems,
  receivingSaveBlocker,
  receivingSummaryOf,
  RECEIVING_UNIT_OUTCOME_LABEL,
  wrongItemClaimTypesFor,
  type ReceivingArrivalEvidence,
  type ReceivingExtraLine,
  type ReceivingUnitOutcome,
} from "@carres/shared";
import { fmtDateShort } from "@/lib/fmt-date";
import {
  useOfficeReceiveMutation,
  usePoReceiving,
  type operationPoListRow,
  type ReceivingEvent,
  type ReceivingExpectedUnit,
  type SupplierRow,
} from "@/lib/queries";
import DOFileUploadField from "@/components/DOFileUploadField";
import ClaimPhotoUploadField from "@/components/ClaimPhotoUploadField";
import ArrivalEvidenceUploadField from "@/components/ArrivalEvidenceUploadField";
import { DOC_BTN, DOC_TH, DocSection as Section, Prop } from "./workspace-doc";

/**
 * ReceivingWorkspace — the pre-start Receiving object and the active Session
 * (owner instruction 2026-09-04 §5B/§5C).
 *
 * ```
 * Pre-start object → [ Start Receiving ] → Session → Save Receiving → posted GRN
 * ```
 *
 * The Session is FULL-WIDTH, ONE SCROLL (UI MASTER §4.1 — a Goods Receipt
 * never splits), in the instruction's order: header/source facts · Receiving
 * Details · Unit checking · exceptions and evidence · Receiving Summary ·
 * posting consequences · sticky action area.
 *
 * Structural rules this file keeps:
 * 1. **The form asks "Receive this time", never "total so far"** — every
 *    input is a DELTA; the cumulative figure is the engine's.
 * 2. **The supplier's DO number is theirs.** No default, no suggestion.
 * 3. **The disabled Save and the server's refusal read the SAME rule** —
 *    `receivingSaveBlocker` + `receiveLineClaimProblems`, whose twins run in
 *    `warehouse_receipt_validate_lines` (0314 §6 / 0426 §3).
 * 4. **One physical result per governed Unit** (ERP-ARCHITECTURE §3.4):
 *    `Received · Received with issue · Not received`, the quantities DERIVED
 *    from the outcomes so the two can never disagree. A line without minted
 *    Units keeps the lawful quantity inputs.
 * 5. **Save is idempotent** — one `saveKey` per Session entry; a retried
 *    uncertain response returns the first posting instead of a second GRN.
 */

/** Today in MYT — the app's zone, never the browser's. The SERVER still owns
 *  the bounds; this only seeds the field. */
function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
}

/** What one line is counting on THIS delivery. */
interface Count {
  receivedNow: number;
  damagedQty: number;
  wrongItemQty: number;
  damagedPhotos: string[];
  wrongItemClaimType: string;
  wrongItemPhotos: string[];
}

const EMPTY_COUNT: Count = {
  receivedNow: 0,
  damagedQty: 0,
  wrongItemQty: 0,
  damagedPhotos: [],
  wrongItemClaimType: "",
  wrongItemPhotos: [],
};

interface UnitState {
  outcome: ReceivingUnitOutcome;
  issueKind: "damaged" | "wrong_item";
}

export default function ReceivingWorkspace({
  po,
  supplier,
  warehouseName,
  warehouses = [],
  dutyAllowed = true,
  dutyKnown = true,
  receiving,
  onReceiving,
  onPosted,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  warehouseName: string;
  /** Actual Site choices — the governed warehouses. */
  warehouses?: Array<{ id: string; name: string }>;
  /** The resolved GRN authority's answer (0425) — the page consumes it, it
   *  never computes it. */
  dutyAllowed?: boolean;
  /** False while the resolver is still answering — neither the button nor
   *  the refusal shows until the answer exists (a refusal that flickers at a
   *  permitted operator is a false sentence). */
  dutyKnown?: boolean;
  receiving: boolean;
  onReceiving: (on: boolean) => void;
  /** Called with the posted session id, so the page can open the GRN. */
  onPosted?: (receiptId: string) => void;
}) {
  const lines = useMemo(() => po.purchase_order_lines ?? [], [po]);
  const summary = receivingSummaryOf(lines);
  const supplierName = supplier?.name ?? po.supplier_id;
  const receivingQ = usePoReceiving(po.id);

  return (
    <div className="px-4 py-4" data-testid="receiving-workspace">
      {receiving ? (
        <ReceivingMode
          po={po}
          supplierName={supplierName}
          warehouseName={warehouseName}
          warehouses={warehouses}
          expectedUnits={receivingQ.data?.expected_units ?? []}
          onDone={() => onReceiving(false)}
          onPosted={onPosted}
        />
      ) : (
        <ReadMode
          po={po}
          supplierName={supplierName}
          warehouseName={warehouseName}
          dutyAllowed={dutyAllowed}
          dutyKnown={dutyKnown}
          onStart={() => onReceiving(true)}
          events={receivingQ.data?.events ?? []}
          loadingEvents={receivingQ.isLoading}
          expectedUnits={receivingQ.data?.expected_units ?? []}
          summary={summary}
        />
      )}
    </div>
  );
}

/* ── PRE-START OBJECT ──────────────────────────────────────────────────── */

function ReadMode({
  po,
  supplierName,
  warehouseName,
  dutyAllowed,
  dutyKnown,
  onStart,
  events,
  loadingEvents,
  expectedUnits,
  summary,
}: {
  po: operationPoListRow;
  supplierName: string;
  warehouseName: string;
  dutyAllowed: boolean;
  dutyKnown: boolean;
  onStart: () => void;
  events: ReceivingEvent[];
  loadingEvents: boolean;
  expectedUnits: ReceivingExpectedUnit[];
  summary: ReturnType<typeof receivingSummaryOf>;
}) {
  const lines = po.purchase_order_lines ?? [];
  const closed = po.status !== "open";
  const incoming = expectedUnits.filter((u) => u.status === "incoming");

  const problems = lines.filter(
    (l) => (l.damaged_qty ?? 0) > 0 || (l.wrong_item_qty ?? 0) > 0,
  );

  return (
    <>
      <div className="flex items-start gap-2" data-testid="receiving-header">
        <div className="min-w-0 flex-1">
          <Prop label="PO Issued">
            <span className="tabular-nums">
              {fmtDateShort((po.placed_at ?? "").slice(0, 10))}
            </span>
          </Prop>
          <Prop label="Supplier">{supplierName}</Prop>
          <Prop label="Deliver To">{warehouseName}</Prop>
          {po.eta_date ? (
            <Prop label="Expected arrival">
              <span className="tabular-nums">{fmtDateShort(po.eta_date)}</span>
            </Prop>
          ) : null}
        </div>
        <span className="text-page font-semibold font-mono text-kit-slate-12 shrink-0">
          {po.id}
        </span>
      </div>

      {/* RECEIVING SUMMARY — the five governed quantity words. Each fact
          prints its own number; the operator never subtracts (owner
          correction 2026-08-29). */}
      <Section title="Receiving Summary">
        <Prop label="Order Qty">
          <span className="tabular-nums" data-testid="summary-order-qty">
            {summary.orderQty}
          </span>
        </Prop>
        <Prop label="Received Qty">
          <span className="tabular-nums" data-testid="summary-received-qty">
            {summary.receivedQty}
          </span>
        </Prop>
        <Prop label="Damaged Qty">
          <span
            className={summary.damagedQty > 0 ? "tabular-nums text-kit-red-11" : "tabular-nums text-kit-slate-9"}
            data-testid="summary-damaged-qty"
          >
            {summary.damagedQty}
          </span>
        </Prop>
        <Prop label="Wrong Item Qty">
          <span
            className={summary.wrongItemQty > 0 ? "tabular-nums text-kit-red-11" : "tabular-nums text-kit-slate-9"}
            data-testid="summary-wrong-qty"
          >
            {summary.wrongItemQty}
          </span>
        </Prop>
        <Prop label="Pending Delivery Qty">
          <span
            className={summary.pendingDeliveryQty > 0 ? "tabular-nums" : "tabular-nums text-kit-slate-9"}
            data-testid="summary-pending-qty"
          >
            {summary.pendingDeliveryQty}
          </span>
        </Prop>

        {/* The ONE loud element. Absent once the PO owes nothing — a button
            that can only refuse is not an action. */}
        {!closed && summary.pendingDeliveryQty > 0 && dutyAllowed && (
          <button
            type="button"
            onClick={onStart}
            data-testid="start-receiving"
            className="mt-2 px-3 py-1.5 rounded-control bg-kit-blue-9 text-white text-body font-medium hover:brightness-95"
          >
            Start Receiving
          </button>
        )}
        {!closed && summary.pendingDeliveryQty > 0 && dutyKnown && !dutyAllowed && (
          /* The same rule the SQL door holds (0426): the fact, then who may.
             A button the server would refuse is never offered. */
          <div className="mt-2 text-label text-kit-slate-9" data-testid="receiving-duty-refusal">
            Only GRN duty may save a receiving.
          </div>
        )}
        {closed && (
          <div className="mt-2 text-label text-kit-slate-9">
            This purchase order is closed.
          </div>
        )}
      </Section>

      <Section title="Items">
        <div className={DOC_TH}>
          <span className="w-4 font-medium">#</span>
          <span className="flex-1 font-medium">Description</span>
          <span className="w-14 text-right font-medium">Order Qty</span>
          <span className="w-14 text-right font-medium">Received Qty</span>
        </div>
        {lines.map((l, i) => (
          <div
            key={l.id}
            className="flex gap-2 py-1.5 text-body border-b border-kit-slate-4"
            data-testid={`receiving-item-${i + 1}`}
          >
            <span className="w-4 text-kit-slate-9 tabular-nums">{i + 1}</span>
            <span className="flex-1 min-w-0 font-mono text-kit-slate-12 truncate">
              {l.sku}
            </span>
            <span className="w-14 text-right tabular-nums text-kit-slate-12">
              {l.qty}
            </span>
            <span className="w-14 text-right tabular-nums text-kit-slate-9">
              {l.received_qty}
            </span>
          </div>
        ))}
      </Section>

      {/* The governed expected Units — what the supplier was told to label.
          Facts, not controls; the outcomes are recorded in the Session. */}
      {incoming.length > 0 && (
        <Section title="Expected Units">
          <div className="flex flex-wrap gap-1.5" data-testid="expected-units">
            {incoming.map((u) => (
              <span
                key={u.id}
                className="rounded-full border border-kit-slate-5 px-2 py-0.5 font-mono text-label text-kit-slate-11"
              >
                {u.unit_code}
              </span>
            ))}
          </div>
        </Section>
      )}

      {problems.length > 0 && (
        <Section title="Exceptions">
          {problems.map((l) => (
            <div key={l.id} className="text-body text-kit-slate-12">
              <span className="font-mono">{l.sku}</span>
              <span className="text-kit-red-11">
                {" "}
                {[
                  (l.damaged_qty ?? 0) > 0 ? `${l.damaged_qty} damaged` : null,
                  (l.wrong_item_qty ?? 0) > 0
                    ? `${l.wrong_item_qty} wrong item`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          ))}
          {/* A door, never a form: the claim already exists — the receive that
              recorded the problem opened it in the same transaction. */}
          <Link
            to="/operation?tab=claims"
            className="mt-1.5 inline-block text-body text-kit-blue-11 hover:underline"
            data-testid="receiving-open-claims"
          >
            Open in Claims
          </Link>
        </Section>
      )}

      {/* ACTIVITY reads the Event Ledger and nothing else (§6). */}
      <Section title="Activity">
        {loadingEvents ? (
          <div className="text-label text-kit-slate-9">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-label text-kit-slate-9" data-testid="receiving-activity-empty">
            No receiving activity yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="receiving-activity">
            {events.map((e) => (
              <li key={e.id} className="flex items-baseline gap-2 text-body">
                <span className="text-label text-kit-slate-9 tabular-nums shrink-0 w-16">
                  {fmtDateShort(e.event_at.slice(0, 10))}
                </span>
                <span className="min-w-0 text-kit-slate-12">
                  {eventSentence(e)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/**
 * One ledger entry, in words. Every fact comes from the payload — the Event
 * Payload Dictionary (§6.1) is what makes this readable without opening the
 * session; `posted` carries the GRN number since 0426.
 */
/** 0442 — a Unit belongs to the line it was born for. A Unit without a line
 *  binding (born before 0442 on a PO with one line of its SKU) falls back to
 *  the SKU match, which is exact for that case. */
export function unitBelongsToLine(
  u: { sku: string; po_line_id?: string | null },
  l: { id: string; sku: string },
): boolean {
  return u.po_line_id ? u.po_line_id === l.id : u.sku === l.sku;
}

export function eventSentence(e: ReceivingEvent): string {
  const who = e.actor_name ?? "Staff identity not recorded";
  const p = e.payload ?? {};
  const units =
    p.units_counted != null
      ? `${p.units_counted} unit${p.units_counted === 1 ? "" : "s"}`
      : null;
  switch (e.event) {
    case "posted":
      return [
        `Posted by ${who}`,
        p.grn_no ?? null,
        p.do_number ? `DO ${p.do_number}` : null,
        units,
        p.goods_received_at
          ? `received ${fmtDateShort(p.goods_received_at)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "submitted":
    case "resubmitted":
      return [
        `Counted by ${who}`,
        p.do_number ? `DO ${p.do_number}` : null,
        units,
      ]
        .filter(Boolean)
        .join(" · ");
    case "returned":
      return `Sent back by ${who}${p.reason ? ` — ${p.reason}` : ""}`;
    case "voided":
      return `Voided by ${who}${p.reason ? ` — ${p.reason}` : ""}`;
    case "amended":
      return `Amended by ${who}${p.reason ? ` — ${p.reason}` : ""}`;
    default:
      return who;
  }
}

/* ── THE ACTIVE SESSION ────────────────────────────────────────────────── */

function ReceivingMode({
  po,
  supplierName,
  warehouseName,
  warehouses,
  expectedUnits,
  onDone,
  onPosted,
}: {
  po: operationPoListRow;
  supplierName: string;
  warehouseName: string;
  warehouses: Array<{ id: string; name: string }>;
  expectedUnits: ReceivingExpectedUnit[];
  onDone: () => void;
  onPosted?: (receiptId: string) => void;
}) {
  const lines = useMemo(() => po.purchase_order_lines ?? [], [po]);

  const [goodsReceivedAt, setGoodsReceivedAt] = useState(todayMYT);
  // No suggestion, ever: this number is the SUPPLIER's.
  const [doNumber, setDoNumber] = useState("");
  const [doFilePath, setDoFilePath] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  /** `Deliver To` is the instruction; `Actual Site` is where the goods
   *  physically arrived. "" = the PO's own booked warehouse. */
  const [actualSiteId, setActualSiteId] = useState<string>("");
  const [arrivalEvidence, setArrivalEvidence] = useState<
    ReceivingArrivalEvidence[]
  >([]);
  const [extraLines, setExtraLines] = useState<ReceivingExtraLine[]>([]);
  /** ONE key per Session entry — the idempotency contract (0426): a retried
   *  uncertain Save returns the first posting, never a second GRN. */
  const [saveKey] = useState(() => crypto.randomUUID());

  /** The governed Units still expected, grouped by the LINE they were born
   *  for (0442 `po_line_id`) — two lines of one SKU are two lines. */
  const unitsByLine = useMemo(() => {
    const m = new Map<string, ReceivingExpectedUnit[]>();
    for (const l of lines) {
      m.set(
        l.id,
        expectedUnits.filter((u) => u.status === "incoming" && unitBelongsToLine(u, l)),
      );
    }
    return m;
  }, [expectedUnits, lines]);

  /** One physical result per governed Unit. Prefilled `received` up to the
   *  line's remaining count — a complete delivery is zero typing — and
   *  `not_received` beyond it. */
  const [unitStates, setUnitStates] = useState<Record<string, UnitState>>(() => {
    const o: Record<string, UnitState> = {};
    for (const l of po.purchase_order_lines ?? []) {
      const units = (expectedUnits ?? []).filter(
        (u) => unitBelongsToLine(u, l) && u.status === "incoming",
      );
      const cap = poLineReportable(l);
      units.forEach((u, i) => {
        o[u.id] = {
          outcome: i < cap ? "received" : "not_received",
          issueKind: "damaged",
        };
      });
    }
    return o;
  });
  const setUnit = (id: string, patch: Partial<UnitState>) =>
    setUnitStates((s) => ({
      ...s,
      [id]: { ...(s[id] ?? { outcome: "not_received", issueKind: "damaged" }), ...patch },
    }));

  /** Legacy quantity counts, for lines with no governed Units. For a
   *  unit-checked line the quantities are DERIVED from the outcomes. */
  const [counts, setCounts] = useState<Record<string, Count>>(() => {
    const o: Record<string, Count> = {};
    for (const l of po.purchase_order_lines ?? [])
      o[l.id] = { ...EMPTY_COUNT, receivedNow: poLineReportable(l) };
    return o;
  });
  const setCount = (id: string, patch: Partial<Count>) =>
    setCounts((c) => ({ ...c, [id]: { ...(c[id] ?? EMPTY_COUNT), ...patch } }));

  /** The ONE per-line view both the button gate and the payload read. */
  const lineViews = lines.map((l) => {
    const units = unitsByLine.get(l.id) ?? [];
    const c = counts[l.id] ?? EMPTY_COUNT;
    if (units.length === 0) {
      return { line: l, units: [] as ReceivingExpectedUnit[], ...c };
    }
    let receivedNow = 0;
    let damagedQty = 0;
    let wrongItemQty = 0;
    for (const u of units) {
      const st = unitStates[u.id];
      if (!st || st.outcome === "not_received") continue;
      if (st.outcome === "received") receivedNow += 1;
      else if (st.issueKind === "wrong_item") wrongItemQty += 1;
      else damagedQty += 1;
    }
    return {
      line: l,
      units,
      receivedNow,
      damagedQty,
      wrongItemQty,
      damagedPhotos: c.damagedPhotos,
      wrongItemClaimType: c.wrongItemClaimType,
      wrongItemPhotos: c.wrongItemPhotos,
    };
  });

  const save = useOfficeReceiveMutation(po.id, {
    onSuccess: (data) => {
      const receiptId = (data as { receipt_id?: string } | null)?.receipt_id;
      onDone();
      if (receiptId && onPosted) onPosted(receiptId);
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const counted = lineViews.reduce(
    (s, v) => s + v.receivedNow + v.damagedQty + v.wrongItemQty,
    0,
  );

  const pendingAfter = pendingDeliveryAfterSave(
    lineViews.map((v) => ({
      pendingDelivery: poLineReportable(v.line),
      receivedNow: v.receivedNow,
    })),
  );

  /** The claim gate — the SAME function the RPC's twin runs. */
  const claimProblems = lineViews.flatMap((v) =>
    receiveLineClaimProblems({
      category: caseProductCategory(v.line.sku),
      damagedQty: v.damagedQty,
      wrongItemQty: v.wrongItemQty,
      damagedPhotos: v.damagedPhotos,
      wrongItemClaimType: v.wrongItemClaimType || null,
      wrongItemPhotos: v.wrongItemPhotos,
    }),
  );

  const overCounted = lineViews.some(
    (v) =>
      v.receivedNow + v.damagedQty + v.wrongItemQty >
      poLineReportable(v.line),
  );

  /** THE RECEIVING BUTTON LAW — one shared copy (COPY-STANDARD): the button
   *  names the FIRST missing fact, top to bottom. */
  const blocker = receivingSaveBlocker({
    doNumber,
    doFilePath,
    counted,
    overCounted,
    claimProblems,
  });

  function submit() {
    if (blocker || !doFilePath || save.isPending) return;
    setErr(null);
    save.mutate({
      doNumber: doNumber.trim(),
      doFilePath,
      goodsReceivedAt,
      note: note.trim() || undefined,
      actualSiteId:
        actualSiteId && actualSiteId !== po.warehouse_id
          ? actualSiteId
          : undefined,
      arrivalEvidence: arrivalEvidence.length ? arrivalEvidence : undefined,
      extraLines: extraLines.filter((x) => x.sku.trim() !== "" && x.qty > 0)
        .length
        ? extraLines
            .filter((x) => x.sku.trim() !== "" && x.qty > 0)
            .map((x) => ({ sku: x.sku.trim(), qty: x.qty, note: x.note ?? undefined }))
        : undefined,
      saveKey,
      lines: lineViews
        .map((v) => ({
          id: v.line.id,
          receivedNow: v.receivedNow,
          damagedQty: v.damagedQty || undefined,
          wrongItemQty: v.wrongItemQty || undefined,
          damagedPhotos: v.damagedPhotos.length ? v.damagedPhotos : undefined,
          wrongItemClaimType: v.wrongItemClaimType || undefined,
          wrongItemPhotos: v.wrongItemPhotos.length
            ? v.wrongItemPhotos
            : undefined,
          units: v.units.length
            ? v.units.map((u) => {
                const st = unitStates[u.id] ?? {
                  outcome: "not_received" as const,
                  issueKind: "damaged" as const,
                };
                return {
                  unitCode: u.unit_code,
                  outcome: st.outcome,
                  issueKind:
                    st.outcome === "received_with_issue"
                      ? st.issueKind
                      : undefined,
                };
              })
            : undefined,
        }))
        // A line counting nothing — and naming no unit result — is not part
        // of this delivery.
        .filter(
          (l) =>
            l.receivedNow + (l.damagedQty ?? 0) + (l.wrongItemQty ?? 0) > 0 ||
            (l.units?.some((u) => u.outcome !== "not_received") ?? false),
        ),
    });
  }

  const FIELD =
    "h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9";

  return (
    <div data-testid="receiving-mode" className="pb-20">
      {/* 1 · header and source facts */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-body text-kit-slate-12">
          {supplierName} → {warehouseName}
        </div>
        <span className="text-page font-semibold font-mono text-kit-slate-12 shrink-0">
          {po.id}
        </span>
      </div>

      {/* 2 · Receiving Details */}
      <Section title="Receiving Details">
        <div className="flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">
            Goods received on
          </span>
          <input
            type="date"
            value={goodsReceivedAt}
            onChange={(e) => setGoodsReceivedAt(e.target.value)}
            aria-label="Goods received on"
            data-testid="goods-received-at"
            className={FIELD}
          />
        </div>
        <div className="mt-1 flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">
            Deliver To
          </span>
          <span className="text-body text-kit-slate-12">{warehouseName}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">
            Goods arrived at
          </span>
          {/* Where the goods PHYSICALLY arrived. It never overwrites
              `Deliver To` — both facts are preserved (owner correction
              2026-09-06 §3; the retired label was `Actual Site`). */}
          <select
            value={actualSiteId || po.warehouse_id}
            onChange={(e) => setActualSiteId(e.target.value)}
            aria-label="Goods arrived at"
            data-testid="actual-site"
            className={FIELD}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-1 flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">
            Supplier DO No.
          </span>
          <input
            type="text"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            aria-label="Supplier DO No."
            data-testid="do-number"
            className={`${FIELD} flex-1`}
          />
        </div>
        <div className="mt-1 flex items-start gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">
            Signed DO photo
          </span>
          <span className="min-w-0 flex-1">
            <DOFileUploadField
              poId={po.id}
              doNumber={doNumber}
              onUploaded={setDoFilePath}
            />
          </span>
        </div>
        <div className="mt-1 flex items-start gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">
            Arrival evidence
          </span>
          <span className="min-w-0 flex-1">
            <ArrivalEvidenceUploadField
              poId={po.id}
              doNumber={doNumber}
              entries={arrivalEvidence}
              onChange={setArrivalEvidence}
              testId="arrival-evidence"
            />
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">
            Note (optional)
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note"
            data-testid="receiving-note"
            className={`${FIELD} flex-1`}
          />
        </div>
      </Section>

      {/* 3 · Unit checking — one physical result per governed Unit; a line
             with no minted Units keeps the quantity inputs. */}
      <Section title="Items">
        {lineViews.map((v) => {
          const l = v.line;
          const cap = poLineReportable(l);
          const wrongTypes = wrongItemClaimTypesFor(caseProductCategory(l.sku));
          const clamp = (x: string) => Math.max(0, Math.min(cap, Number(x) || 0));
          const c = counts[l.id] ?? EMPTY_COUNT;
          return (
            <div key={l.id} className="border-b border-kit-slate-4 py-1.5">
              <div className="flex items-center gap-2 text-body">
                <span className="flex-1 min-w-0 font-mono text-kit-slate-12 truncate">
                  {l.sku}
                </span>
                <span className="w-14 text-right tabular-nums text-kit-slate-12">
                  {l.qty}
                </span>
                <span className="w-14 text-right tabular-nums text-kit-slate-9">
                  {l.received_qty}
                </span>
                {v.units.length === 0 ? (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={cap}
                      value={c.receivedNow}
                      onChange={(e) =>
                        setCount(l.id, { receivedNow: clamp(e.target.value) })
                      }
                      aria-label={`Receive now ${l.sku}`}
                      data-testid={`receive-now-${l.id}`}
                      className={`${FIELD} w-14 text-right tabular-nums`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={cap}
                      value={c.damagedQty}
                      onChange={(e) =>
                        setCount(l.id, { damagedQty: clamp(e.target.value) })
                      }
                      aria-label={`Damaged ${l.sku}`}
                      data-testid={`damaged-${l.id}`}
                      className={`${FIELD} w-10 text-right tabular-nums`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={cap}
                      value={c.wrongItemQty}
                      onChange={(e) =>
                        setCount(l.id, { wrongItemQty: clamp(e.target.value) })
                      }
                      aria-label={`Wrong item ${l.sku}`}
                      data-testid={`wrong-${l.id}`}
                      className={`${FIELD} w-10 text-right tabular-nums`}
                    />
                  </>
                ) : (
                  <span
                    className="shrink-0 tabular-nums text-meta text-kit-slate-9"
                    data-testid={`derived-${l.id}`}
                  >
                    {v.receivedNow} received
                    {v.damagedQty + v.wrongItemQty > 0
                      ? ` · ${v.damagedQty + v.wrongItemQty} with issue`
                      : ""}
                  </span>
                )}
              </div>

              {/* One row per expected Unit: `Received · Received with issue ·
                  Not received` (ERP-ARCHITECTURE §3.4). */}
              {v.units.map((u) => {
                const st = unitStates[u.id] ?? {
                  outcome: "not_received" as const,
                  issueKind: "damaged" as const,
                };
                return (
                  <div
                    key={u.id}
                    className="mt-1 flex flex-wrap items-center gap-2 pl-2 text-body"
                    data-testid={`unit-${u.unit_code}`}
                  >
                    <span className="w-32 shrink-0 font-mono text-meta text-kit-slate-11">
                      {u.unit_code}
                    </span>
                    <select
                      value={st.outcome}
                      onChange={(e) =>
                        setUnit(u.id, {
                          outcome: e.target.value as ReceivingUnitOutcome,
                        })
                      }
                      aria-label={`Outcome ${u.unit_code}`}
                      data-testid={`unit-outcome-${u.unit_code}`}
                      className={FIELD}
                    >
                      {(
                        [
                          "received",
                          "received_with_issue",
                          "not_received",
                        ] as const
                      ).map((o) => (
                        <option key={o} value={o}>
                          {RECEIVING_UNIT_OUTCOME_LABEL[o]}
                        </option>
                      ))}
                    </select>
                    {st.outcome === "received_with_issue" && (
                      <select
                        value={st.issueKind}
                        onChange={(e) =>
                          setUnit(u.id, {
                            issueKind: e.target.value as "damaged" | "wrong_item",
                          })
                        }
                        aria-label={`Issue kind ${u.unit_code}`}
                        data-testid={`unit-issue-${u.unit_code}`}
                        className={FIELD}
                      >
                        <option value="damaged">Damaged</option>
                        <option value="wrong_item">Wrong item</option>
                      </select>
                    )}
                  </div>
                );
              })}

              {/* 4 · evidence appears only once a fact asks for it. */}
              {v.damagedQty > 0 && (
                <div className="mt-1 pl-2 border-l-2 border-kit-red-9">
                  <ClaimPhotoUploadField
                    poId={po.id}
                    doNumber={doNumber}
                    paths={c.damagedPhotos}
                    onChange={(paths) => setCount(l.id, { damagedPhotos: paths })}
                    label={`Damage photo — ${l.sku}`}
                    testId={`damaged-photos-${l.id}`}
                  />
                </div>
              )}
              {v.wrongItemQty > 0 && (
                <div className="mt-1 pl-2 border-l-2 border-kit-red-9">
                  <div className="flex items-center gap-2 text-body leading-6">
                    <span className="text-label text-kit-slate-9">
                      What kind of wrong?
                    </span>
                    <select
                      value={c.wrongItemClaimType}
                      onChange={(e) =>
                        setCount(l.id, { wrongItemClaimType: e.target.value })
                      }
                      aria-label={`What kind of wrong ${l.sku}`}
                      data-testid={`wrong-type-${l.id}`}
                      className={FIELD}
                    >
                      <option value="">—</option>
                      {wrongTypes.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <ClaimPhotoUploadField
                    poId={po.id}
                    doNumber={doNumber}
                    paths={c.wrongItemPhotos}
                    onChange={(paths) =>
                      setCount(l.id, { wrongItemPhotos: paths })
                    }
                    label={`Wrong-item photo — ${l.sku}`}
                    testId={`wrong-photos-${l.id}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </Section>

      {/* 4b · Extra goods — recorded separately: never Inventory, never the
             pending arithmetic. First check whether they belong to another
             PO/CO (owner instruction §6). */}
      <Section title="Extra goods">
        <p className="text-label text-kit-slate-9">
          Goods that are not on this purchase order. Check another PO first —
          extra goods never enter Inventory.
        </p>
        {extraLines.map((x, i) => (
          <div key={i} className="mt-1 flex items-center gap-2" data-testid={`extra-line-${i}`}>
            <input
              type="text"
              value={x.sku}
              onChange={(e) =>
                setExtraLines((xs) =>
                  xs.map((y, j) => (j === i ? { ...y, sku: e.target.value } : y)),
                )
              }
              aria-label={`Extra goods SKU ${i + 1}`}
              placeholder="SKU or item"
              className={`${FIELD} flex-1`}
            />
            <input
              type="number"
              min={1}
              value={x.qty}
              onChange={(e) =>
                setExtraLines((xs) =>
                  xs.map((y, j) =>
                    j === i ? { ...y, qty: Math.max(1, Number(e.target.value) || 1) } : y,
                  ),
                )
              }
              aria-label={`Extra Qty ${i + 1}`}
              className={`${FIELD} w-16 text-right tabular-nums`}
            />
            <button
              type="button"
              onClick={() => setExtraLines((xs) => xs.filter((_, j) => j !== i))}
              className="text-label text-kit-slate-9 hover:text-kit-slate-12"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setExtraLines((xs) => [...xs, { sku: "", qty: 1 }])}
          data-testid="add-extra-line"
          className="mt-1 text-body text-kit-blue-11 hover:underline"
        >
          + Add line
        </button>
      </Section>

      {/* 5 · Receiving Summary (live) + 6 · what saving will do */}
      <Section title="Receiving Summary">
        <Prop label="Received Qty">
          <span className="tabular-nums" data-testid="live-received-qty">
            {lineViews.reduce((s, v) => s + v.receivedNow, 0)}
          </span>
        </Prop>
        <Prop label="Damaged Qty">
          <span className="tabular-nums">
            {lineViews.reduce((s, v) => s + v.damagedQty, 0)}
          </span>
        </Prop>
        <Prop label="Wrong Item Qty">
          <span className="tabular-nums">
            {lineViews.reduce((s, v) => s + v.wrongItemQty, 0)}
          </span>
        </Prop>
        <div className="mt-2 text-label text-kit-slate-9" data-testid="posting-consequences">
          Valid received Units enter Inventory at{" "}
          {warehouses.find((w) => w.id === (actualSiteId || po.warehouse_id))
            ?.name ?? warehouseName}
          . Units not received stay Incoming on this PO. Damaged, wrong and
          extra goods never become available stock. A claim opens only when a
          recorded issue needs one.
        </div>
      </Section>

      {err && (
        <div className="mt-2 text-label text-kit-red-11" data-testid="receiving-error">
          {err}
        </div>
      )}

      {/* 7 · sticky action area — the live pending figure beside the one
             primary action, on desktop and mobile alike. */}
      <div className="sticky bottom-0 mt-3 flex items-center gap-2 border-t border-kit-slate-5 bg-white py-2">
        <button
          type="button"
          onClick={onDone}
          data-testid="receiving-cancel"
          className="text-label text-kit-slate-9 hover:text-kit-slate-12"
        >
          Cancel
        </button>
        <span
          className="ml-auto text-label text-kit-slate-9 tabular-nums"
          data-testid="pending-after-save"
        >
          Pending Delivery Qty after save: {pendingAfter}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={blocker != null || save.isPending}
          data-testid="receiving-save"
          className={`${DOC_BTN} disabled:opacity-40`}
        >
          {save.isPending ? "Saving…" : (blocker ?? "Save Receiving")}
        </button>
      </div>
    </div>
  );
}
