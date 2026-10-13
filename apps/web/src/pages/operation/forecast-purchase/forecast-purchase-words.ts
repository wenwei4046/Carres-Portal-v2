/**
 * FORECAST PURCHASE · OUTRIGHT — the page's words (owner 13 Oct 2026;
 * COPY-STANDARD "Forecast Purchase"). The page suggests and never tells the
 * person to buy: `Suggested` and `Forecast`, never `Buy` or `To buy`.
 */
import { MANUAL_PURCHASE_WORDS, type ForecastPurchaseBlock, type ForecastPurchaseRequestState } from "@carres/shared";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `2026-10` to `Oct`. A column header names the month alone. */
export const monthWord = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
/** `2026-10-12` to `Mon`. */
export const weekdayWord = (iso: string) => fmtDate(iso).split(",")[0] ?? "";
/** `1 pc` · `{n} pcs`. */
export const pcs = (n: number) => `${n} ${n === 1 ? "pc" : "pcs"}`;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** `1 PO` · `{n} POs`. */
export const poCount = (n: number) => count(n, "PO", "POs");
/** `mattress` to `Mattress`: Catalog's category as a word. */
export const categoryWord = (category: string) => (category ? category[0]!.toUpperCase() + category.slice(1) : "");
/** A request's state, in the Manual Purchase Request's own words. */
export const requestStateWord = (state: ForecastPurchaseRequestState) =>
  state === "ready" ? "Ready to order" : state === "sent_back" ? "Sent back for changes" : "Waiting for approval";

export const FORECAST_PURCHASE = {
  page: "Forecast Purchase",
  summary: "Summary",
  showLabel: "Forecast Purchase shown",
  showSuggested: "Suggested",
  showOrdered: "Ordered",
  showAll: "All",
  viewLabel: "Forecast Purchase view",
  view: "By model · Outright",
  groupBy: "Group by",
  byModel: "By model",
  viewFor: "For",
  outright: "Outright",
  colModel: "Model",
  colFree: "Free",
  colFreeSub: "stock",
  freeStock: "Free stock",
  lineSize: "Size",
  supplierNotSet: "Supplier not set",
  modelLine: (supplier: string | null, sizes: number) => `${supplier ?? "Supplier not set"} · ${count(sizes, "size", "sizes")}`,
  monday: (iso: string) => fmtDate(iso),
  mondayShort: (iso: string) => fmtDateShort(iso),
  /* Why a tick cannot be taken. A size already asked for says where its
     request stands, in the request's own state word. */
  block: (block: ForecastPurchaseBlock, state?: ForecastPurchaseRequestState | null) =>
    block === "no_supplier" ? "Supplier not set" : block === "enough" ? "Enough stock · nothing to buy" : block === "requested" ? requestStateWord(state ?? "waiting") : null,
  /* Under a size: what is already asked for, and what is already on a PO. */
  requestLine: (no: string | null, pieces: number, state: ForecastPurchaseRequestState) => `${no ?? "Manual Purchase Request"} · ${pcs(pieces)} · ${requestStateWord(state)}`,
  onPoLine: (pieces: number) => `On PO · ${pcs(pieces)}`,
  openRequest: (no: string | null) => `Open ${no ?? "the request"}`,
  selectModel: (model: string) => `Select ${model}`,
  selectSize: (model: string, size: string) => `Select ${model} ${size}`,
  selected: (sizes: number, pieces: number, pos: number) => `${count(sizes, "item", "items")} selected · ${pcs(pieces)} · ${poCount(pos)}`,
  reviewButton: (pos: number) => `Review ${poCount(pos)}`,
  footer: (models: number) => `${count(models, "model", "models")} · in pcs · suggestion only, you decide`,
  footerOf: (shown: number, models: number) => `${shown} of ${count(models, "model", "models")} · in pcs · suggestion only, you decide`,
  weeklyForecast: "Weekly forecast",
  suggested: "Suggested",
  bySupplier: "By supplier",
  notRecorded: "Not recorded",
  /* PROPOSAL: the design gives no words for an empty list. */
  empty: "No Outright mattress or Jager bedframe was sold in the last 3 months, so there is nothing to suggest.",
  nothingSuggested: "Nothing is suggested this week. Free stock covers the last 14 days of sales.",
  nothingOrdered: "Nothing is waiting for approval or on a PO.",
  noMatch: "No model matches. Clear the search to see every model.",
  search: "Search model or supplier",
  couldNotRead: "The forecast could not be read. Try again.",
  review: (pos: number) => `Review ${poCount(pos)}`,
  reviewLine: (pieces: number) => `${pcs(pieces)} · Outright · back to stock level`,
  reviewItem: "Item",
  reviewQty: "Qty",
  reviewSupplier: "Supplier",
  reviewNote: "Outright stock: buys each size back to its stock level. One PO per supplier and category. Sales orders take this stock first; SO Batch only buys what stock cannot cover.",
  back: "Back",
  /* Owner ruling 2026-10-14 (A): the page asks, the Purchasing Approver
     approves, PO Duty issues and sends. The verb is the Manual Purchase
     Request's own. */
  send: MANUAL_PURCHASE_WORDS.send,
  sending: "Sending",
  group: (supplier: string, category: string) => `${supplier} · ${categoryWord(category)}`,
  deliveryDate: "Delivery Date",
  deliverTo: "Supplier Deliver To",
  noDeliverTo: "No default Deliver To is set. Set one in Purchasing → Settings.",
  leadNotSet: "Production days are not set",
  leadFix: (supplier: string, category: string) => `Add production days for ${supplier} · ${categoryWord(category)} in Settings`,
  sendLeadNotSet: "Send: lead days are not set",
  planLoading: "Working out the Delivery Date",
  planFailed: "The Delivery Date could not be worked out. Try again.",
  whoNext: (approver: string | null, poDuty: string | null) =>
    `${approver ? `${approver} approves.` : "Nobody holds Purchasing Approver."} ${poDuty ?? "PO Duty"} then issues the PO and sends it to the supplier.`,
  /* What the request says it is for, on the Manual Purchase Request. */
  requirement: (monday: string) => `Forecast Purchase · week of ${fmtDate(monday, { year: "always" })}`,
  sent: (requests: number) => `${count(requests, "request", "requests")} sent for approval`,
  sentSome: (sent: number, all: number) => `${sent} of ${count(all, "request", "requests")} sent for approval. The rest were not sent.`,
  sendFailed: "The request was not sent. Try again.",
  changed: "The suggestion changed while this was open. Nothing was sent. Check the list and review again.",
} as const;
