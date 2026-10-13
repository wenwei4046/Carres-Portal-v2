/**
 * FORECAST PURCHASE · OUTRIGHT — the page's words (owner 13 Oct 2026;
 * COPY-STANDARD "Forecast Purchase"). The page suggests and never tells the
 * person to buy: `Suggested` and `Forecast`, never `Buy` or `To buy`.
 */
import type { ForecastPurchaseBlock } from "@carres/shared";
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
  /* Why a tick cannot be taken. */
  block: (block: ForecastPurchaseBlock) => (block === "no_supplier" ? "Supplier not set" : block === "enough" ? "Enough stock · nothing to buy" : null),
  alreadyOrdered: "Already ordered",
  skipped: "Skipped this week",
  selectModel: (model: string) => `Select ${model}`,
  selectSize: (model: string, size: string) => `Select ${model} ${size}`,
  selected: (sizes: number, pieces: number, pos: number) => `${count(sizes, "item", "items")} selected · ${pcs(pieces)} · ${poCount(pos)}`,
  create: (pos: number) => `Create ${poCount(pos)}`,
  footer: (models: number) => `${count(models, "model", "models")} · in pcs · suggestion only, you decide`,
  footerOf: (shown: number, models: number) => `${shown} of ${count(models, "model", "models")} · in pcs · suggestion only, you decide`,
  weeklyForecast: "Weekly forecast",
  suggested: "Suggested",
  bySupplier: "By supplier",
  notRecorded: "Not recorded",
  /* PROPOSAL: the design gives no words for an empty list. */
  empty: "No Outright mattress or Jager bedframe was sold in the last 3 months, so there is nothing to suggest.",
  nothingSuggested: "Nothing is suggested this week. Free stock covers the last 14 days of sales.",
  nothingOrdered: "No forecast PO this week.",
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
  skipWeek: "Skip this week",
  place: (pos: number) => `Place ${poCount(pos)}`,
  /* PROPOSAL: shown until the owner rules who may place a PO from this page. */
  placeNotOn: "Placing a PO and skipping a week from this page are not switched on yet. Raise the purchase in Manual Purchase Request for now.",
} as const;
