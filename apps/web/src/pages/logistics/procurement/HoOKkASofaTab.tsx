import ProcurementTabContent from "./ProcurementTabContent";

/**
 * HoOKkASofaTab — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * Thin wrapper around `ProcurementTabContent` keyed to slug 'hookka-sofa'.
 * Backend (T33) narrows the PO list to supplier='hookka' AND any line whose
 * SKU starts with 'sofa:' — see `apps/api/src/routes/logistics/procurement-tabs.ts`.
 */
export default function HoOKkASofaTab() {
  return <ProcurementTabContent slug="hookka-sofa" />;
}
