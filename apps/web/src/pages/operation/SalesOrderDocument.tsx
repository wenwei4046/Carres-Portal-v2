/**
 * SalesOrderDocument — SO-1 FINAL (Loo, 2026-08-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ IT IS A DOCUMENT, NOT A COCKPIT, AND THE DIFFERENCE IS THE WHOLE POINT
 *
 * The register answers *what records exist*. This answers *what did this
 * customer commit to* — and nothing else:
 *
 *     Customer · Phone · Address · Salesperson · Ordered · Promised ·
 *     Items · Qty · Unit price · Total · Paid · Outstanding · History
 *
 * **What is FORBIDDEN here, by the card, by name:** `Issue PO` · `ETA` ·
 * `Stock` · any delivery action · `Calls` · `Current issues` · the journey
 * widget. Every one of those is EXECUTION, and
 * `../../../../docs/ERP-ARCHITECTURE.md` Law A gives each of them to the module
 * that owns the record: purchasing to Purchasing, arrival to Receiving, the
 * trip to Delivery, collection to Payment. Law B then makes the display of
 * another module's record READ-ONLY forever — *"that display may never gain a
 * form"*.
 *
 * **This file therefore writes NOTHING.** It has no mutation hook, no form, no
 * button that changes a record. That is not an oversight to be filled in later:
 * it is the property that keeps the boundary, and the mechanical test from the
 * architecture is *"if this control disappeared, would any business record
 * become unreachable?"* — no, because the owning module has it.
 *
 * The old `OperationOrderDetailDrawer` (7,717 lines, 44 panels) is untouched
 * and still reachable from every other surface that opens it. This is not its
 * replacement everywhere — it is what the REGISTER opens.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE ARITHMETIC, ONE SET OF NAMES
 *
 * Money is `@carres/shared`'s `orderMoney` through `sales-order-facts.ts`, the
 * same call the register's row makes, so the row and the document cannot print
 * two different figures for one order. Product names are the API's own
 * `label` (`Model · Variant`), resolved by the one helper the register's row
 * also reads. Both are `ERP-ARCHITECTURE.md` Law D.
 */
// design-standard: not-a-list-page — this is a DOCUMENT, not a register. Its
// `<table>` is the order's own line block, the same shape a printed sales order
// carries: fixed rows, no sort, no selection, no filter, no scroller, and it is
// never longer than the order. `kit/DataTable` is the ONE list table and every
// power it brings (sorting, selection, its own scroll container, a sticky head,
// a footer count) is a power this block must NOT have. The list page that
// belongs to this module — `SalesOrdersRegister` — renders through
// `kit/PageShell` + `kit/DataTable`, which is what Rule B exists to enforce.
import { ArrowLeft, ClipboardList } from "lucide-react";
import { orderMoney } from "@carres/shared";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import Loading from "@/components/kit/Loading";
import Money from "@/components/Money";
import { fmtDate } from "@/lib/fmt-date";
import { cjkClassName } from "@/lib/cjk";
import { useOperationOrder } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import { lineName, outstandingState, valueState, type MoneyState } from "./sales-order-facts";

/** A money state is a number or a sentence — never an empty cell (SO-1). */
function MoneyState({ state }: { state: MoneyState }) {
  if (state.kind === "amount") return <Money value={state.value} />;
  return <span>{state.kind === "settled" ? "Paid in full" : "No price yet"}</span>;
}

/** One labelled fact. The label is quiet, the fact is ink. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-label text-base-500">{label}</div>
      <div className="text-body text-base-900 mt-0.5 break-words">{value}</div>
    </div>
  );
}

export default function SalesOrderDocument({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useOperationOrder(orderId);

  const order = data?.order;
  const lines = data?.lines ?? [];
  const addons = data?.addons ?? [];

  /* The SAME call the register's row makes. Two surfaces, one arithmetic. */
  const money = orderMoney({
    lineSum: lines.reduce((s, l) => s + Number(l.unit_price ?? 0) * Number(l.qty ?? 0), 0),
    addonSum: addons.reduce((s, a) => s + Number(a.unit_price ?? 0) * Number(a.qty ?? 0), 0),
    paid: order?.paid,
    controlBalance: null,
  });

  const promised = order
    ? order.delivery_date_tbd
      ? "No date yet"
      : fmtDate(order.delivery_date)
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        testId="sales-order-doc-header"
        icon={ClipboardList}
        word="Sales Orders"
        docTitle={order ? `SO-${order.so} — Carres` : "Sales Orders — Carres"}
        right={
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            data-testid="doc-back"
          >
            <ArrowLeft size={14} /> Back to register
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto bg-kit-slate-3 px-6 py-4">
        {isLoading && <Loading label="Opening the sales order" />}

        {!isLoading && isError && (
          <div className="rounded-card border border-kit-slate-5 bg-white">
            <EmptyState
              title="This sales order could not be opened"
              detail={(error as Error | undefined)?.message}
              action={
                <Button variant="neutral" onClick={() => void refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        )}

        {!isLoading && !isError && order && (
          <div
            className="mx-auto flex max-w-4xl flex-col gap-4"
            data-testid="sales-order-document"
          >
            {/* ── The document's name ─────────────────────────────────────── */}
            <div className="rounded-card border border-kit-slate-5 bg-white px-5 py-4">
              <div className="text-page text-base-900" data-testid="doc-so">
                SO-{order.so}
              </div>
              {(order.source_ref ?? []).length > 0 && (
                <div className="text-meta text-base-500 mt-1">
                  Customer reference {(order.source_ref ?? []).join(" · ")}
                </div>
              )}
            </div>

            {/* ── The commitment ──────────────────────────────────────────── */}
            <div className="rounded-card border border-kit-slate-5 bg-white px-5 py-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
                <Fact
                  label="Customer"
                  value={
                    <span className={cjkClassName(order.customer_name)}>
                      {order.customer_name}
                    </span>
                  }
                />
                <Fact label="Phone" value={order.customer_phone || "Not given"} />
                <Fact label="Salesperson" value={order.salespersons?.name || "Not recorded"} />
                <Fact
                  label="Address"
                  value={
                    order.customer_address_unknown
                      ? "Not given"
                      : order.customer_address || "Not given"
                  }
                />
                <Fact label="Ordered" value={fmtDate(order.placed_at)} />
                <Fact label="Promised" value={promised} />
              </div>
            </div>

            {/* ── What they bought ────────────────────────────────────────── */}
            <div className="rounded-card border border-kit-slate-5 bg-white">
              <table className="w-full text-body" data-testid="doc-items">
                <thead>
                  <tr className="text-label text-base-500">
                    <th className="px-5 py-2 text-left font-medium">Item</th>
                    <th className="px-5 py-2 text-right font-medium">Qty</th>
                    <th className="px-5 py-2 text-right font-medium">Unit price</th>
                    <th className="px-5 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={`${l.sku}-${i}`} className="border-t border-kit-slate-5">
                      <td className={`px-5 py-2 ${cjkClassName(lineName(l))}`}>
                        {lineName(l)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">{l.qty}</td>
                      <td className="px-5 py-2 text-right">
                        {Number(l.unit_price) > 0 ? (
                          <Money value={Number(l.unit_price)} />
                        ) : (
                          "No price yet"
                        )}
                      </td>
                      <td className="px-5 py-2 text-right">
                        {Number(l.unit_price) > 0 ? (
                          <Money value={Number(l.unit_price) * Number(l.qty)} />
                        ) : (
                          "No price yet"
                        )}
                      </td>
                    </tr>
                  ))}
                  {addons.map((a, i) => (
                    <tr key={`addon-${i}`} className="border-t border-kit-slate-5">
                      <td className="px-5 py-2">{a.addon_key}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{a.qty}</td>
                      <td className="px-5 py-2 text-right">
                        <Money value={Number(a.unit_price)} />
                      </td>
                      <td className="px-5 py-2 text-right">
                        <Money value={Number(a.unit_price) * Number(a.qty)} />
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && addons.length === 0 && (
                    <tr className="border-t border-kit-slate-5">
                      <td className="px-5 py-3 text-base-500" colSpan={4}>
                        No items on this order
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── The money ───────────────────────────────────────────────── */}
            <div className="rounded-card border border-kit-slate-5 bg-white px-5 py-4">
              <div className="grid grid-cols-3 gap-x-6">
                <Fact label="Total" value={<MoneyState state={valueState(money)} />} />
                <Fact label="Paid" value={<Money value={money.paid} />} />
                <Fact
                  label="Outstanding"
                  value={<MoneyState state={outstandingState(money)} />}
                />
              </div>
            </div>

            {/* ── History, read-only ──────────────────────────────────────── */}
            <div className="rounded-card border border-kit-slate-5 bg-white px-5 py-4">
              <div className="text-label text-base-500">History</div>
              {(data?.history ?? []).length === 0 ? (
                <p className="text-body text-base-500 mt-2">
                  Nothing has been recorded on this order yet
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2" data-testid="doc-history">
                  {(data?.history ?? []).map((h, i) => (
                    <li key={i} className="flex gap-3 text-body">
                      <span className="shrink-0 text-meta text-base-500 tabular-nums">
                        {fmtDate(h.occurred_at, { time: true })}
                      </span>
                      <span className="min-w-0 break-words">{h.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
