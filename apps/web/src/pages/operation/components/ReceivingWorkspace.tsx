import { useMemo, useState, type ReactNode } from "react";
import {
  caseProductCategory,
  poLineReportable,
  poReceivingProgress,
  purchasingActionButton,
  purchasingActionQueue,
  receiveLineClaimProblems,
  wrongItemClaimTypesFor,
  RECEIVE_LINE_CLAIM_PROBLEM_TEXT,
  type PurchasingOpenCall,
} from "@carres/shared";
import { fmtDateShort } from "@/lib/fmt-date";
import {
  useOfficeReceiveMutation,
  usePoReceiving,
  type operationPoListRow,
  type ReceivingEvent,
  type SupplierRow,
} from "@/lib/queries";
import DOFileUploadField from "@/components/DOFileUploadField";
import ClaimPhotoUploadField from "@/components/ClaimPhotoUploadField";
import RecordSupplierAnswerModal from "./RecordSupplierAnswerModal";

/**
 * ReceivingWorkspace — Slice B, the Office Receiving Workspace for ONE PO.
 *
 * ```
 * Read Mode → [ Start Receiving ] → Receiving Mode → Save → Posted
 * ```
 *
 * Approved by Jess 2026-08-03. It is the Purchase Orders Workspace's shape,
 * because the Purchasing module has ONE Workspace template — a continuous
 * working document, hairline small-caps sections, 24px property rows, ONE loud
 * element. Only the CONTENT differs, and here the content answers Receiving's
 * own four questions:
 *
 *   RECEIVING SUMMARY  "what has this PO taken in?"     Received · Outstanding
 *   ITEMS              "what is on it?"                 read → count
 *   EXCEPTIONS         "what went wrong?"               display + door only
 *   ACTIVITY           "what has happened?"             the event ledger
 *
 * `Start Receiving` is a PRIMARY ACTION, never a section: an operator's whole
 * job here is one press, and a section is a place, not a decision.
 *
 * Three rules this file exists to keep structural:
 *
 * 1. **The form asks "Receive this time", never "total so far"**
 *    (RECEIVING-INFORMATION-MODEL §7.1). Every input on the screen is a DELTA;
 *    the cumulative figure is the engine's and is only ever displayed.
 * 2. **The supplier's DO number is theirs.** It starts empty and has no
 *    suggestion. The retired ReceivePOModal seeded it with
 *    `"DO-" + random(5200..5999)` — a reference the supplier has never heard
 *    of, which also defeated the duplicate guard that reads it.
 * 3. **The disabled Save and the server's 422 read the SAME rule.** The claim
 *    gate is the shared `receiveLineClaimProblems`, whose twin runs inside
 *    `warehouse_receipt_validate_lines` (0314 §6). One copy of the law, two
 *    places that ask it.
 *
 * Deliberately NOT here, and each is a later slice, not an oversight:
 * Warehouse Review · Amend · Void · a Claims form · session-level photos
 * beyond the signed DO (0314 built no `photos[]`, and a control with no store
 * is banned). The Activity entries therefore carry no `⋯` menu: two of its
 * three items would do nothing.
 */

/** The Linear property row: label + value, ONE 24px line, never stacked. */
function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-body leading-6">
      <span className="w-32 shrink-0 text-label text-kit-slate-9">{label}</span>
      <span className="min-w-0 text-kit-slate-12">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 pt-3 border-t border-kit-slate-5">
      <h3 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
        {title}
      </h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

const DOC_BTN =
  "px-3 py-1 rounded border border-kit-slate-5 text-body text-kit-slate-11 hover:text-kit-slate-12";

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

export default function ReceivingWorkspace({
  po,
  supplier,
  warehouseName,
  calls,
  receiving,
  onReceiving,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  warehouseName: string;
  /** P3's open supplier calls for THIS PO, computed once by the page — the
   *  Current Action column and these buttons read the same array, so a queue
   *  word and its button can never disagree. */
  calls: PurchasingOpenCall[];
  /** Receiving Mode is the PAGE's state, because it decides the whole stage:
   *  the listing steps aside and the workspace takes the screen. */
  receiving: boolean;
  onReceiving: (on: boolean) => void;
}) {
  const lines = useMemo(() => po.purchase_order_lines ?? [], [po]);
  const progress = poReceivingProgress(lines);
  const supplierName = supplier?.name ?? po.supplier_id;
  const receivingQ = usePoReceiving(po.id);
  const [answerFor, setAnswerFor] = useState<
    { kind: "tomorrow" | "balance"; poLineId?: string } | null
  >(null);

  return (
    <div className="px-4 py-4" data-testid="receiving-workspace">
      {receiving ? (
        <ReceivingMode
          po={po}
          supplierName={supplierName}
          warehouseName={warehouseName}
          onDone={() => onReceiving(false)}
        />
      ) : (
        <ReadMode
          po={po}
          supplierName={supplierName}
          warehouseName={warehouseName}
          onStart={() => onReceiving(true)}
          calls={calls}
          onAnswer={(kind, poLineId) => setAnswerFor({ kind, poLineId })}
          events={receivingQ.data?.events ?? []}
          loadingEvents={receivingQ.isLoading}
          outstanding={progress.ordered - progress.received}
          progress={progress}
        />
      )}

      {answerFor && (
        <RecordSupplierAnswerModal
          kind={answerFor.kind}
          po={po}
          supplierName={supplierName}
          poLineId={answerFor.poLineId}
          onClose={() => setAnswerFor(null)}
        />
      )}
    </div>
  );
}

/* ── READ MODE ─────────────────────────────────────────────────────────── */

function ReadMode({
  po,
  supplierName,
  warehouseName,
  onStart,
  calls,
  onAnswer,
  events,
  loadingEvents,
  outstanding,
  progress,
}: {
  po: operationPoListRow;
  supplierName: string;
  warehouseName: string;
  onStart: () => void;
  calls: PurchasingOpenCall[];
  onAnswer: (kind: "tomorrow" | "balance", poLineId?: string) => void;
  events: ReceivingEvent[];
  loadingEvents: boolean;
  outstanding: number;
  progress: ReturnType<typeof poReceivingProgress>;
}) {
  const lines = po.purchase_order_lines ?? [];
  const closed = po.status !== "open";

  // EXCEPTIONS exists only when exceptions exist (§7.7). It DISPLAYS what is
  // held and doors into Claims — it is never an input section, because the
  // quantities are recorded on the item rows.
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
          <Prop label="Delivery To">{warehouseName}</Prop>
        </div>
        <span className="text-page font-semibold font-mono text-kit-slate-12 shrink-0">
          {po.id}
        </span>
      </div>

      {/* RECEIVING SUMMARY — never "Progress" (Jess). Outstanding is printed
          rather than left as `4 − 3`: an operator should not do arithmetic to
          learn what is still owed. */}
      <Section title="Receiving Summary">
        <Prop label="Received">
          <span className="tabular-nums" data-testid="receiving-summary-received">
            {progress.received} / {progress.ordered}
          </span>
        </Prop>
        <Prop label="Outstanding">
          <span
            className={outstanding > 0 ? "tabular-nums" : "tabular-nums text-kit-slate-9"}
            data-testid="receiving-summary-outstanding"
          >
            {outstanding}
          </span>
        </Prop>

        {/* The ONE loud element. Absent once the PO owes nothing — a button
            that can only refuse is not an action. */}
        {!closed && outstanding > 0 && (
          <button
            type="button"
            onClick={onStart}
            data-testid="start-receiving"
            className="mt-2 px-3 py-1.5 rounded-control bg-kit-blue-9 text-white text-body font-medium hover:bg-kit-blue-10"
          >
            Start Receiving
          </button>
        )}
        {closed && (
          <div className="mt-2 text-label text-kit-slate-9">
            This purchase order is closed.
          </div>
        )}

        {/* P3's two supplier calls. They were row buttons before Slice B; the
            row is a DataTable cell now, so they live where the PO's work
            lives. Every open call is shown, never just the top one — Law 1:
            one action may not suppress another, and a PO delivered short can
            genuinely carry its balance call AND its next tomorrow call at
            once. Order is §4's: tomorrow, then balance. */}
        {calls
          .filter((a) => a.key === "confirm_tomorrows_delivery")
          .map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onAnswer("tomorrow")}
              title={purchasingActionQueue("confirm_tomorrows_delivery")}
              data-testid={`receiving-tomorrow-${po.id}`}
              className={`mt-2 ml-2 text-label py-1.5 px-3 ${
                a.late ? "btn-danger" : "btn-secondary"
              }`}
            >
              {purchasingActionButton("confirm_tomorrows_delivery")}
            </button>
          ))}
        {calls
          .filter((a) => a.key === "confirm_balance_delivery_date")
          .map((a) => (
            <button
              key={a.poLineId}
              type="button"
              onClick={() => onAnswer("balance", a.poLineId)}
              title={`${a.sku} · ${purchasingActionQueue("confirm_balance_delivery_date")}`}
              data-testid={`receiving-balance-${a.poLineId}`}
              className={`mt-2 ml-2 text-label py-1.5 px-3 ${
                a.late ? "btn-danger" : "btn-secondary"
              }`}
            >
              {purchasingActionButton("confirm_balance_delivery_date")}
            </button>
          ))}
      </Section>

      <Section title="Items">
        <div className="flex gap-2 text-label uppercase tracking-wide text-kit-slate-9 border-y border-kit-slate-5 py-1">
          <span className="w-4 font-medium">#</span>
          <span className="flex-1 font-medium">Description</span>
          <span className="w-12 text-right font-medium">Ordered</span>
          <span className="w-12 text-right font-medium">Received</span>
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
            <span className="w-12 text-right tabular-nums text-kit-slate-12">
              {l.qty}
            </span>
            <span className="w-12 text-right tabular-nums text-kit-slate-9">
              {l.received_qty}
            </span>
          </div>
        ))}
        <div className="flex gap-2 py-1.5 text-body border-b border-kit-slate-5">
          <span className="w-4" />
          <span className="flex-1 text-label uppercase tracking-wide text-kit-slate-9">
            Total
          </span>
          <span className="w-12 text-right font-semibold tabular-nums text-kit-slate-12">
            {progress.ordered}
          </span>
          <span className="w-12 text-right font-semibold tabular-nums text-kit-slate-12">
            {progress.received}
          </span>
        </div>
      </Section>

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
          <a
            href="/operation/purchasing/claims"
            className="mt-1.5 inline-block text-body text-kit-blue-11 hover:underline"
            data-testid="receiving-open-claims"
          >
            Open in Claims
          </a>
        </Section>
      )}

      {/* ACTIVITY reads the Event Ledger and nothing else (§6). */}
      <Section title="Activity">
        {loadingEvents ? (
          <div className="text-label text-kit-slate-9">Loading…</div>
        ) : events.length === 0 ? (
          /* "Nothing received yet" would read as "the goods have not come"
             (Jess, 2026-08-03). What is empty is the RECORD, so that is what
             the sentence says. */
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
 * session, and `posted` carries the business date, the count and the source
 * since Jess's 2026-08-03 ruling.
 */
function eventSentence(e: ReceivingEvent): string {
  const who = e.actor_name ?? "Someone";
  const p = e.payload ?? {};
  const units =
    p.units_counted != null
      ? `${p.units_counted} unit${p.units_counted === 1 ? "" : "s"}`
      : null;
  switch (e.event) {
    case "posted":
      return [
        `Posted by ${who}`,
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

/* ── RECEIVING MODE ────────────────────────────────────────────────────── */

function ReceivingMode({
  po,
  supplierName,
  warehouseName,
  onDone,
}: {
  po: operationPoListRow;
  supplierName: string;
  warehouseName: string;
  onDone: () => void;
}) {
  const lines = useMemo(() => po.purchase_order_lines ?? [], [po]);

  const [goodsReceivedAt, setGoodsReceivedAt] = useState(todayMYT);
  // No suggestion, ever: this number is the SUPPLIER's.
  const [doNumber, setDoNumber] = useState("");
  const [doFilePath, setDoFilePath] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  /** Prefilled at each line's remaining qty — a complete delivery is zero
   *  typing (§7.2, copied from 2990's ready-to-review draft). */
  const [counts, setCounts] = useState<Record<string, Count>>(() => {
    const o: Record<string, Count> = {};
    for (const l of lines)
      o[l.id] = { ...EMPTY_COUNT, receivedNow: poLineReportable(l) };
    return o;
  });
  const setCount = (id: string, patch: Partial<Count>) =>
    setCounts((c) => ({ ...c, [id]: { ...(c[id] ?? EMPTY_COUNT), ...patch } }));

  const save = useOfficeReceiveMutation(po.id, {
    onSuccess: onDone,
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const counted = lines.reduce((s, l) => {
    const c = counts[l.id] ?? EMPTY_COUNT;
    return s + c.receivedNow + c.damagedQty + c.wrongItemQty;
  }, 0);

  /** What is still owed AFTER this save — stated quietly, never as a popup:
   *  a short receipt is normal and a routine confirm trains people to click
   *  OK (§7.4). */
  const remainingAfter = lines.reduce(
    (s, l) => s + Math.max(0, poLineReportable(l) - (counts[l.id]?.receivedNow ?? 0)),
    0,
  );

  /** The claim gate — the SAME function the RPC's twin runs, so the disabled
   *  button and the server's refusal can never disagree. */
  const claimProblems = lines.flatMap((l) => {
    const c = counts[l.id] ?? EMPTY_COUNT;
    return receiveLineClaimProblems({
      category: caseProductCategory(l.sku),
      damagedQty: c.damagedQty,
      wrongItemQty: c.wrongItemQty,
      damagedPhotos: c.damagedPhotos,
      wrongItemClaimType: c.wrongItemClaimType || null,
      wrongItemPhotos: c.wrongItemPhotos,
    });
  });

  /**
   * The button says what is MISSING (Jess: "Save Button 动态提示 很好").
   * Input ORDER is free — only completeness is frozen (§7.6) — so this reads
   * the state, never a step counter.
   */
  const blocker: string | null =
    doNumber.trim().length < 3
      ? "Save — add a DO number"
      : !doFilePath
        ? "Save — upload signed DO"
        : counted === 0
          ? "Save — count at least one unit"
          : claimProblems.length > 0
            ? `Save — ${RECEIVE_LINE_CLAIM_PROBLEM_TEXT[claimProblems[0]].toLowerCase()}`
            : null;

  function submit() {
    if (blocker || !doFilePath || save.isPending) return;
    setErr(null);
    save.mutate({
      doNumber: doNumber.trim(),
      doFilePath,
      goodsReceivedAt,
      note: note.trim() || undefined,
      lines: lines
        .map((l) => {
          const c = counts[l.id] ?? EMPTY_COUNT;
          return {
            id: l.id,
            receivedNow: c.receivedNow,
            damagedQty: c.damagedQty || undefined,
            wrongItemQty: c.wrongItemQty || undefined,
            damagedPhotos: c.damagedPhotos.length ? c.damagedPhotos : undefined,
            wrongItemClaimType: c.wrongItemClaimType || undefined,
            wrongItemPhotos: c.wrongItemPhotos.length
              ? c.wrongItemPhotos
              : undefined,
          };
        })
        // A line counting nothing is not part of this delivery.
        .filter((l) => l.receivedNow + (l.damagedQty ?? 0) + (l.wrongItemQty ?? 0) > 0),
    });
  }

  const FIELD =
    "h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9";

  return (
    <div data-testid="receiving-mode">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-body text-kit-slate-12">
          {supplierName} → {warehouseName}
        </div>
        <span className="text-page font-semibold font-mono text-kit-slate-12 shrink-0">
          {po.id}
        </span>
      </div>

      <Section title="Receiving Details">
        <div className="flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">
            Goods Received At
          </span>
          <input
            type="date"
            value={goodsReceivedAt}
            onChange={(e) => setGoodsReceivedAt(e.target.value)}
            aria-label="Goods Received At"
            data-testid="goods-received-at"
            className={FIELD}
          />
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

      <Section title="Items">
        <div className="flex gap-2 text-label uppercase tracking-wide text-kit-slate-9 border-y border-kit-slate-5 py-1">
          <span className="flex-1 font-medium">Description</span>
          <span className="w-10 text-right font-medium">Ord</span>
          <span className="w-10 text-right font-medium">Recv</span>
          <span className="w-14 text-right font-medium">Receive now</span>
          <span className="w-10 text-right font-medium">Dmgd</span>
          <span className="w-10 text-right font-medium">Wrong</span>
        </div>
        {lines.map((l) => {
          const c = counts[l.id] ?? EMPTY_COUNT;
          const cap = poLineReportable(l);
          const wrongTypes = wrongItemClaimTypesFor(caseProductCategory(l.sku));
          const clamp = (v: string) =>
            Math.max(0, Math.min(cap, Number(v) || 0));
          return (
            <div key={l.id} className="border-b border-kit-slate-4 py-1.5">
              <div className="flex items-center gap-2 text-body">
                <span className="flex-1 min-w-0 font-mono text-kit-slate-12 truncate">
                  {l.sku}
                </span>
                <span className="w-10 text-right tabular-nums text-kit-slate-12">
                  {l.qty}
                </span>
                <span className="w-10 text-right tabular-nums text-kit-slate-9">
                  {l.received_qty}
                </span>
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
                {/* Fixed inputs, never a "+ Problem?" disclosure: a damaged
                    unit is a normal outcome of a delivery, not an advanced
                    option somebody has to go looking for. */}
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
              </div>

              {/* Evidence appears only once a number asks for it. */}
              {c.damagedQty > 0 && (
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
              {c.wrongItemQty > 0 && (
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

      {/* Quiet, near Save — never a popup (§7.4). */}
      {remainingAfter > 0 && (
        <div
          className="mt-2 text-label text-kit-slate-9"
          data-testid="remaining-after-save"
        >
          Remaining after save: {remainingAfter} (stays on this PO)
        </div>
      )}

      {err && (
        <div className="mt-2 text-label text-kit-red-11" data-testid="receiving-error">
          {err}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onDone}
          data-testid="receiving-cancel"
          className="text-label text-kit-slate-9 hover:text-kit-slate-12"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={blocker != null || save.isPending}
          data-testid="receiving-save"
          className={`${DOC_BTN} ml-auto disabled:opacity-40`}
        >
          {save.isPending ? "Saving…" : (blocker ?? "Save Receiving")}
        </button>
      </div>
    </div>
  );
}
