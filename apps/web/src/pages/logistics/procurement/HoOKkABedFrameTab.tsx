import ProcurementTabContent from "./ProcurementTabContent";

/**
 * HoOKkABedFrameTab — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * Thin wrapper around `ProcurementTabContent` keyed to slug 'hookka-bedframe'.
 * Backend (T33) narrows the PO list to supplier='hookka' AND any line whose
 * SKU starts with 'bedframe:' — see `apps/api/src/routes/logistics/procurement-tabs.ts`.
 */
export default function HoOKkABedFrameTab() {
  return <ProcurementTabContent slug="hookka-bedframe" />;
}
