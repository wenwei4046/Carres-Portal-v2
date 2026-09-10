// The one place that decides where a login sends someone back to.
//
// Two guards in App.tsx used to make this decision separately: RequireAuth kept
// only `location.pathname`, and HomeRedirect kept nothing. So a link like
// `/finance/ar?invoice=INV-123#tab=aging` came back from login as `/finance/ar`
// — the page survived, the filter and the tab did not. A document number in a
// link is a door the operator was handed; dropping the query drops the door.
//
// Both guards now call `returnTo(location)`, and Login reads it back with
// `readReturnTo(state)`. One writer, one reader, one shape.

import type { Location } from "react-router-dom";

/** Login's own page and the home switch never make sense as a return target. */
const NOT_A_DESTINATION = new Set(["/login", "/"]);

/** The full in-app URL (path + query + hash) to return to after login, or `null` if the
 *  current page is not somewhere worth coming back to. */
export function returnTo(loc: Pick<Location, "pathname" | "search" | "hash">): string | null {
  if (NOT_A_DESTINATION.has(loc.pathname)) return null;
  return `${loc.pathname}${loc.search ?? ""}${loc.hash ?? ""}`;
}

/** The router `state` a guard hands to `<Navigate to="/login" state={…} />`. */
export function loginState(loc: Pick<Location, "pathname" | "search" | "hash">): { from: string } | undefined {
  const to = returnTo(loc);
  return to ? { from: to } : undefined;
}

/** Read the return target out of `location.state` on the login page.
 *  Only an in-app path (leading single slash) is honoured, so state can never send
 *  someone to another origin. */
export function readReturnTo(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== "string") return null;
  if (!from.startsWith("/") || from.startsWith("//")) return null;
  const path = from.split(/[?#]/, 1)[0];
  if (NOT_A_DESTINATION.has(path)) return null;
  return from;
}
