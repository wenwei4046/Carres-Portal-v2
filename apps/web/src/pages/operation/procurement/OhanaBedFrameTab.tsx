import ProcurementTabContent from "./ProcurementTabContent";

/**
 * OhanaBedFrameTab — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * Thin wrapper around `ProcurementTabContent` keyed to slug 'hookka-bedframe'.
 * Backend (T33) narrows the PO list to supplier='hookka' AND any line whose
 * SKU starts with 'bedframe:' — see `apps/api/src/routes/operation/procurement-tabs.ts`.
 */
export default function OhanaBedFrameTab() {
  return <ProcurementTabContent slug="hookka-bedframe" />;
}
