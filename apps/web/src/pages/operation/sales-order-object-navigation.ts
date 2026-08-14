export type SalesOrderObjectView = "Order" | "Revisions" | "History" | "Order Route";

export function objectViewParams(
  current: URLSearchParams,
  view: SalesOrderObjectView,
  leavingEdit: boolean,
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (leavingEdit && view !== "Order") next.delete("edit");
  if (view === "Order Route") next.set("route", "1");
  else next.delete("route");
  return next;
}
