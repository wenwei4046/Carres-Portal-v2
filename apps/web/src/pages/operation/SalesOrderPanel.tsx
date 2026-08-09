/**
 * SalesOrderPanel — SO-3 (Loo, 2026-08-09). The panel is named **Sales Order**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ IT IS A QUICK-OPERATION SURFACE, NOT AN A4 DOCUMENT
 *
 * The register stays on screen beside it. `↑` and `↓` in the grid walk the
 * rows and this panel follows instantly; `⤢` opens the full-page printable
 * Sales Order (`SalesOrderDocument`), which is kept as its own screen and is
 * the thing you print. **That split is the card's, and it settles what belongs
 * here:** the four numbers an operator says on the phone, the customer, the
 * items, the history — and the two edits that do not need a document.
 *
 * `grid-findings` F31 filed the defect this closes: *the drawer REPLACES the
 * list, so opening one order costs you the list.* SO-1 inherited it (recorded
 * as debt D-G). The register is now mounted the whole time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ THERE IS NO EDIT BUTTON, AND THAT IS THREE RULES RATHER THAN A STYLE
 *
 * ```
 * LEVEL 1  edit it            phone · address · internal note
 *          The field IS the control. An Edit button that turns a field into
 *          the same field is a click that buys nothing.
 *
 * LEVEL 2  ASK for it         the customer's postpone · an item change
 *          Recorded as a change request + a history entry, and the order is
 *          NOT written. `orders.delivery_date` keeps saying what the customer
 *          was actually promised until somebody with the authority decides.
 *          A reason is required — by the RPC, not only by this form.
 *
 * LEVEL 3  never              items · prices · discount · salesperson ·
 *                             Ordered · the ORIGINAL promised date
 *          Not disabled controls — no controls. A greyed-out field still says
 *          "this is yours to change, later"; these are not.
 * ```
 *
 * **Everything Level 3 is also everything another module owns**, and
 * `ERP-ARCHITECTURE.md` Law B is why the panel shows no `Issue PO`, no stock,
 * no ETA and no delivery action: *a summary is READ-ONLY, forever — it may
 * never gain a form.*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MONEY IS `@carres/shared`'s `orderMoney` THROUGH `sales-order-facts.ts` — the
 * same call the register's row makes and the same the document makes, so three
 * surfaces cannot print three figures for one order (Law D). `Outstanding` is
 * always an explicit state: the amount, `Paid in full`, or `No price yet`.
 */
// design-standard: not-a-list-page — the panel's `<table>` is the ORDER's own
// line block, the same shape `SalesOrderDocument` carries: fixed rows, no sort,
// no selection, no filter, no scroller of its own, never longer than the order.
// `kit/DataTable` is the ONE list table and every power it brings (sorting,
// selection, a sticky head, a footer count) is a power this block must NOT have
// — the list page that belongs to this module is `SalesOrdersRegister`, which
// renders through `kit/PageShell` + `kit/DataTable` and is on screen BESIDE
// this panel the whole time it is open.
import { useEffect, useMemo, useState } from "react";
import { orderMoney } from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import Input from "@/components/kit/Input";
import Textarea from "@/components/kit/Textarea";
import DatePicker from "@/components/kit/DatePicker";
import EmptyState from "@/components/kit/EmptyState";
import Loading from "@/components/kit/Loading";
import Money from "@/components/Money";
import { fmtDate } from "@/lib/fmt-date";
import { cjkClassName } from "@/lib/cjk";
import {
  useAddAnnotation,
  useOperationOrder,
  useRequestOrderChange,
  useUpdateOrder,
  type operationOrderChangeRequestRow,
} from "@/lib/queries";
import {
  lineName,
  outstandingState,
  promiseHistory,
  valueState,
  type MoneyState,
} from "./sales-order-facts";
import { NOT_GIVEN, NOT_RECORDED, NO_DATE_YET } from "./sales-order-columns";

/** A money state is a number or a sentence — never an empty cell. */
function MoneyFact({ state }: { state: MoneyState }) {
  if (state.kind === "amount") return <Money value={state.value} />;
  return <span>{state.kind === "settled" ? "Paid in full" : "No price yet"}</span>;
}

/** One cell of the facts strip: a quiet label over one loud fact. */
function StripCell({
  label,
  value,
  second,
  testId,
  loud,
}: {
  label: string;
  value: React.ReactNode;
  second?: string;
  testId: string;
  /**
   * SO-4 — *"Outstanding visually dominant over Paid."* The one loud cell
   * steps up a type token (`text-title`, 20/600 against the others' 15/600):
   * the figure the phone call is ABOUT is the figure the eye lands on. Size,
   * not colour — red means late in this portal, and money owed is not late.
   */
  loud?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 py-2" data-testid={testId}>
      <div className="text-label text-kit-slate-11">{label}</div>
      {/* NOT `truncate`. A money figure and a promised date are the two things
          an operator reads out loud on the phone, and half of one is worse than
          a taller strip — SO-1's own rule was that the Promised cell may NEVER
          truncate. It wraps instead, and all four cells grow together, so the
          strip still has one height. */}
      <div
        className={`${loud ? "text-title" : "text-strong"} break-words text-kit-slate-12`}
      >
        {value}
      </div>
      {second ? (
        <div className="text-label text-kit-slate-11" data-testid={`${testId}-second`}>
          {second}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-kit-slate-5 px-4 py-3">
      <h3 className="text-label mb-2 text-kit-slate-11">{title}</h3>
      {children}
    </section>
  );
}

function ReadFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2 py-0.5">
      <span className="text-meta w-28 shrink-0 text-kit-slate-11">{label}</span>
      <span className="text-body min-w-0 break-words text-kit-slate-12">{value}</span>
    </div>
  );
}

/** What one waiting request says, in the operator's own words. */
function requestLine(r: operationOrderChangeRequestRow): string {
  const p = r.payload as { from?: string; to?: string; reason?: string; note?: string };
  if (r.kind === "promise_date") {
    const to = p.to ? fmtDate(p.to) : "";
    return p.from
      ? `Move ${fmtDate(p.from)} to ${to} · ${p.reason ?? ""}`
      : `Deliver on ${to} · ${p.reason ?? ""}`;
  }
  return `${p.note ?? ""} · ${p.reason ?? ""}`;
}

export default function SalesOrderPanel({
  orderId,
  position,
  total,
  onStep,
  onOpenDocument,
  onClose,
}: {
  orderId: string;
  /** `n` of `n of N` — 1-based, and the register's own position. */
  position: number;
  total: number;
  /** `-1` / `+1`. The register owns which order that lands on. */
  onStep: (delta: -1 | 1) => void;
  onOpenDocument: () => void;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useOperationOrder(orderId);
  const order = data?.order;
  const lines = useMemo(() => data?.lines ?? [], [data]);
  const addons = useMemo(() => data?.addons ?? [], [data]);
  const history = useMemo(() => data?.history ?? [], [data]);
  const requests = useMemo(() => data?.changeRequests ?? [], [data]);

  /* ── LEVEL 1 · the two fields and the note ────────────────────────────────
   * Held as draft state so [Cancel] means something. `null` = untouched, which
   * is how a Save knows to send the phone but not the address. */
  const [phone, setPhone] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  /* ── LEVEL 2 · the two requests ───────────────────────────────────────── */
  const [askDate, setAskDate] = useState<string | null>(null);
  const [askReason, setAskReason] = useState("");
  const [itemNote, setItemNote] = useState("");
  const [itemReason, setItemReason] = useState("");
  const [openAsk, setOpenAsk] = useState<"promise" | "item" | null>(null);

  /* Walking to another order abandons the drafts. It has to: a phone typed
     against SO-1207 must never be saved onto SO-1208 because the arrow key was
     faster than the fetch. */
  useEffect(() => {
    setPhone(null);
    setAddress(null);
    setNote("");
    setSaveError(null);
    setAskDate(null);
    setAskReason("");
    setItemNote("");
    setItemReason("");
    setOpenAsk(null);
  }, [orderId]);

  const update = useUpdateOrder(orderId);
  const annotate = useAddAnnotation();
  const request = useRequestOrderChange(orderId);

  const money = orderMoney({
    lineSum: lines.reduce((s, l) => s + Number(l.unit_price ?? 0) * Number(l.qty ?? 0), 0),
    addonSum: addons.reduce((s, a) => s + Number(a.unit_price ?? 0) * Number(a.qty ?? 0), 0),
    paid: order?.paid,
    controlBalance: null,
  });

  const promise = promiseHistory(history);
  const promisedLabel = order
    ? order.delivery_date_tbd
      ? NO_DATE_YET
      : fmtDate(order.delivery_date)
    : "";
  /* THE SECOND LINE APPEARS ONLY WHEN BOTH FACTS ARE REAL. A count with no
     original is not `Original —`, and an original with no count is not a
     change: the card bans both, so the cell prints neither. */
  const promisedSecond =
    promise.changes > 0 && promise.originalPromised
      ? `Original ${fmtDate(promise.originalPromised)} · changed ×${promise.changes}`
      : undefined;

  const dirty =
    (phone != null && phone !== (order?.customer_phone ?? "")) ||
    (address != null && address !== (order?.customer_address ?? "")) ||
    note.trim() !== "";
  const busy = update.isPending || annotate.isPending;

  const discard = () => {
    setPhone(null);
    setAddress(null);
    setNote("");
    setSaveError(null);
  };

  const save = async () => {
    if (!dirty || !order) return;
    setSaveError(null);
    try {
      const customer: { phone?: string; address?: string } = {};
      if (phone != null && phone !== (order.customer_phone ?? "")) customer.phone = phone;
      if (address != null && address !== (order.customer_address ?? ""))
        customer.address = address;
      if (Object.keys(customer).length > 0) {
        await update.mutateAsync({ customer });
      }
      if (note.trim()) {
        await annotate.mutateAsync({ orderId, content: note.trim(), tag: null });
      }
      discard();
      await refetch();
    } catch (e) {
      setSaveError((e as Error)?.message ?? "The change could not be saved");
    }
  };

  const pending = (kind: "promise_date" | "item_change") =>
    requests.find((r) => r.kind === kind && r.status === "pending") ?? null;

  const ask = async (kind: "promise_date" | "item_change") => {
    setSaveError(null);
    try {
      if (kind === "promise_date") {
        if (!askDate || !askReason.trim()) return;
        await request.mutateAsync({ kind, to: askDate, reason: askReason.trim() });
      } else {
        if (!itemNote.trim() || !itemReason.trim()) return;
        await request.mutateAsync({
          kind,
          note: itemNote.trim(),
          reason: itemReason.trim(),
        });
      }
      setOpenAsk(null);
      setAskDate(null);
      setAskReason("");
      setItemNote("");
      setItemReason("");
    } catch (e) {
      setSaveError((e as Error)?.message ?? "The request could not be recorded");
    }
  };

  /* SO-4 — the header is ONE line: `SO-1300 · Hand · 016-238957893`. The SO
     number keeps its weight; the name and phone follow at `text-meta`, dots
     between, and the LINE truncates as one so the row never grows. */
  const headerTail = [order?.customer_name, order?.customer_phone]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" · ");

  return (
    <aside
      data-testid="sales-order-panel"
      aria-label="Sales Order"
      /* The parent overlay owns the width (≤40% of the workspace, capped at
         420px — SO-4); the panel fills whatever it is given. */
      className="flex h-full w-full flex-col border-l border-kit-slate-5 bg-white"
    >
      {/* ── The header: SO · customer · phone on ONE line · ↑↓ · n of N · ⤢ · ✕ */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-kit-slate-5 px-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="text-strong shrink-0 text-kit-slate-12" data-testid="panel-so">
            {order ? `SO-${order.so}` : "Sales Order"}
          </span>
          {headerTail && (
            <span
              className={`text-meta truncate text-kit-slate-11 ${cjkClassName(order?.customer_name ?? "")}`}
              data-testid="panel-header-customer"
            >
              · {headerTail}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous order"
            data-testid="panel-prev"
            disabled={position <= 1}
            onClick={() => onStep(-1)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
          >
            <Icon name="collapse" size={14} />
          </button>
          <button
            type="button"
            aria-label="Next order"
            data-testid="panel-next"
            disabled={position >= total}
            onClick={() => onStep(1)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
          >
            <Icon name="expand" size={14} />
          </button>
          <span className="text-meta tabular-nums px-1 text-kit-slate-11" data-testid="panel-position">
            {position} of {total}
          </span>
          <button
            type="button"
            aria-label="Open the full sales order"
            data-testid="panel-document"
            onClick={onOpenDocument}
            className="inline-flex h-6 w-6 items-center justify-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
          >
            <Icon name="open" size={14} />
          </button>
          <button
            type="button"
            aria-label="Close"
            data-testid="panel-close"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <Loading label="Opening the sales order" />}

        {!isLoading && isError && (
          <EmptyState
            title="This sales order could not be opened"
            detail={(error as Error | undefined)?.message}
            action={
              <Button variant="neutral" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        )}

        {!isLoading && !isError && order && (
          <>
            {/* ── THE FACTS STRIP — exactly four cells, order facts only ──
             *  No analytics, no averages, no cross-module signal: what the
             *  customer owes and when they were promised, which is what the
             *  phone call is about.
             *
             *  **TWO BY TWO, not four across, and that is a measurement.**
             *  Four across a 420px panel gives each cell ~105px minus its own
             *  padding, and `Sat, 29 Aug 26` alone is ~105px of ink at
             *  `text-strong` — seen on the built page, the promised date drew
             *  as `Sat, 29 A…` and its `Original …` line as `Original Sat, …`.
             *  Widening the panel to fit them takes the width off the REGISTER,
             *  which is the thing that must stay readable. Four cells is what
             *  the card asks for; one row of four is not, and 2×2 gives every
             *  figure ~186px, which fits all of them with room. */}
            <div
              className="grid grid-cols-2 border-b border-kit-slate-5 bg-kit-slate-3"
              data-testid="panel-facts"
            >
              <StripCell
                label="Total"
                testId="fact-total"
                value={<MoneyFact state={valueState(money)} />}
              />
              <StripCell
                label="Paid"
                testId="fact-paid"
                value={<Money value={money.paid} />}
              />
              <StripCell
                label="Outstanding"
                testId="fact-outstanding"
                loud
                value={<MoneyFact state={outstandingState(money)} />}
              />
              <StripCell
                label="Promised"
                testId="fact-promised"
                value={promisedLabel}
                second={promisedSecond}
              />
            </div>

            {/* ── CUSTOMER ─────────────────────────────────────────────── */}
            <Section title="Customer">
              <div className="flex flex-col gap-2">
                <ReadFact
                  label="Name"
                  value={
                    <span className={cjkClassName(order.customer_name)}>
                      {order.customer_name}
                    </span>
                  }
                />
                <ReadFact
                  label="Salesperson"
                  value={order.salespersons?.name || NOT_RECORDED}
                />
                {/* LEVEL 1 — the field IS the control. */}
                <Input
                  id="panel-phone"
                  label="Phone"
                  value={phone ?? order.customer_phone ?? ""}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={NOT_GIVEN}
                />
                <Textarea
                  id="panel-address"
                  label="Address"
                  rows={2}
                  value={address ?? order.customer_address ?? ""}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={NOT_GIVEN}
                />
                <Textarea
                  id="panel-note"
                  label="Internal note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {/* LEVEL 2 — the promise. There is no date field to overwrite. */}
              <div className="mt-3 border-t border-kit-slate-5 pt-3">
                {pending("promise_date") ? (
                  <p className="text-meta text-kit-slate-11" data-testid="panel-promise-pending">
                    Waiting for a decision · {requestLine(pending("promise_date")!)}
                  </p>
                ) : openAsk === "promise" ? (
                  <div className="flex flex-col gap-2" data-testid="panel-promise-form">
                    <DatePicker
                      id="panel-promise-date"
                      label="The customer asks for"
                      value={askDate}
                      onChange={setAskDate}
                      placeholder={NO_DATE_YET}
                    />
                    <Input
                      id="panel-promise-reason"
                      label="Reason"
                      value={askReason}
                      onChange={(e) => setAskReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!askDate || !askReason.trim() || request.isPending}
                        onClick={() => void ask("promise_date")}
                        data-testid="panel-promise-submit"
                      >
                        Record the request
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setOpenAsk(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="neutral"
                    onClick={() => setOpenAsk("promise")}
                    data-testid="panel-promise-open"
                  >
                    Change promised date
                  </Button>
                )}
              </div>
            </Section>

            {/* ── ITEMS — read-only, and a request is the only way past it ─ */}
            <Section title="Items">
              <table className="w-full text-body" data-testid="panel-items">
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={`${l.sku}-${i}`} className="align-top">
                      <td className={`py-0.5 pr-2 ${cjkClassName(lineName(l))}`}>
                        {lineName(l)}
                      </td>
                      <td className="w-10 py-0.5 text-right tabular-nums text-kit-slate-11">
                        ×{l.qty}
                      </td>
                      <td className="w-24 py-0.5 text-right">
                        {Number(l.unit_price) > 0 ? (
                          <Money value={Number(l.unit_price) * Number(l.qty)} />
                        ) : (
                          "No price yet"
                        )}
                      </td>
                    </tr>
                  ))}
                  {addons.map((a, i) => (
                    <tr key={`addon-${i}`} className="align-top">
                      <td className="py-0.5 pr-2">{a.addon_key}</td>
                      <td className="w-10 py-0.5 text-right tabular-nums text-kit-slate-11">
                        ×{a.qty}
                      </td>
                      <td className="w-24 py-0.5 text-right">
                        <Money value={Number(a.unit_price) * Number(a.qty)} />
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && addons.length === 0 && (
                    <tr>
                      <td className="py-1 text-kit-slate-11" colSpan={3}>
                        No items on this order
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="mt-3 border-t border-kit-slate-5 pt-3">
                {pending("item_change") ? (
                  <p className="text-meta text-kit-slate-11" data-testid="panel-item-pending">
                    Waiting for a decision · {requestLine(pending("item_change")!)}
                  </p>
                ) : openAsk === "item" ? (
                  <div className="flex flex-col gap-2" data-testid="panel-item-form">
                    <Textarea
                      id="panel-item-note"
                      label="What should change"
                      rows={2}
                      value={itemNote}
                      onChange={(e) => setItemNote(e.target.value)}
                    />
                    <Input
                      id="panel-item-reason"
                      label="Reason"
                      value={itemReason}
                      onChange={(e) => setItemReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!itemNote.trim() || !itemReason.trim() || request.isPending}
                        onClick={() => void ask("item_change")}
                        data-testid="panel-item-submit"
                      >
                        Record the request
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setOpenAsk(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="neutral"
                    onClick={() => setOpenAsk("item")}
                    data-testid="panel-item-open"
                  >
                    Change items
                  </Button>
                )}
              </div>
            </Section>

            {/* ── HISTORY — read-only, oldest first, exactly as recorded ── */}
            <Section title="History">
              {history.length === 0 ? (
                <p className="text-body text-kit-slate-11">
                  Nothing has been recorded on this order yet
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5" data-testid="panel-history">
                  {history.map((h, i) => (
                    <li key={i} className="text-body flex gap-2">
                      <span className="text-meta tabular-nums shrink-0 text-kit-slate-11">
                        {fmtDate(h.occurred_at)}
                      </span>
                      <span className="min-w-0 break-words">{h.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>

      {/* ── The sticky footer — always visible, so a typed change is never
       *  one scroll away from being lost. */}
      <footer className="flex h-12 shrink-0 items-center justify-between gap-2 border-t border-kit-slate-5 bg-white px-3">
        <span className="text-meta min-w-0 truncate text-kit-red-11" data-testid="panel-error">
          {saveError ?? ""}
        </span>
        <span className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" onClick={discard} disabled={!dirty || busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!dirty || busy}>
            Save
          </Button>
        </span>
      </footer>
    </aside>
  );
}
