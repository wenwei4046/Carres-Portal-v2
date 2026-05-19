import ProcurementTabContent from "./ProcurementTabContent";

/**
 * NiceFutureMattressTab — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * Thin wrapper around `ProcurementTabContent` keyed to slug 'nice-future'.
 * The body lives in ProcurementTabContent so all three channel tabs share
 * the row layout + modals + action button mapping; this file exists only to
 * own a stable, slug-bound component identity React Router can mount.
 */
export default function NiceFutureMattressTab() {
  return <ProcurementTabContent slug="nice-future" />;
}
