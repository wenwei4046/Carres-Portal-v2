import { Navigate, useLocation } from "react-router-dom";

/**
 * A retired Payment address forwards to its authoritative destination and
 * KEEPS its query string (owner ruling 2026-09-12 — "preserve necessary deep
 * links with safe redirects"). `/finance/invoices?invoice=<id>` was the Work
 * feed's door into the collection workspace and the Sales Order's
 * `?order=<SO No>` scope; both spellings still resolve on the Monitor.
 */
export default function LegacyPaymentRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}
