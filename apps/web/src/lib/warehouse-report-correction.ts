import {
  warehouseConfirmReceiptInput,
  warehouseConfirmationResult,
  type WarehouseConfirmationReportInput,
  type WarehouseConfirmationResult,
  type WarehouseIncomingPo,
} from "@carres/shared";
import { warehouseConfirmationReportFromWire } from "@carres/shared/adapters";
import type { WarehouseConfirmationReportRow } from "./warehouse-confirmation";

export interface WarehouseReportDraft {
  saveKey: string;
  result: WarehouseConfirmationResult;
  report: WarehouseConfirmationReportInput;
}

/** An explicit source choice prepares the existing draft; it never guesses
 * item identity or writes a receipt. Physical results must be recorded again.
 * The writer retains its original receipt/key/revision and database admission. */
export function prepareWarehousePoCorrection(
  row: WarehouseConfirmationReportRow,
  po: WarehouseIncomingPo,
  siteId: string,
): WarehouseReportDraft | null {
  if (row.status !== "draft" || row.grn_no !== null || !row.save_key
      || po.open_receipt_id !== null || !po.lines.length
      || po.lines.some(line => !Number.isInteger(line.pending_qty) || line.pending_qty! <= 0)) return null;
  const original = warehouseConfirmationReportFromWire(row.raw_report);
  if (!original || original.arrivalSourceId || (original.actualSiteId && original.actualSiteId !== siteId)) return null;
  const sameSource = original.poId === po.po_id && !original.arrivalSourceId;
  const retainedDo = sameSource && original.doFilePath?.startsWith(`${po.po_id}/`)
    ? original.doFilePath : null;
  const input = warehouseConfirmReceiptInput.safeParse({
    saveKey: row.save_key, receiptId: row.id, revision: row.revision,
    report: {
      ...original, poId: po.po_id, arrivalSourceId: null, actualSiteId: siteId,
      doFilePath: retainedDo, arrivalEvidence: [], arrivalUnits: [],
      lines: po.lines.map(line => ({
        id: line.id, receivedNow: null, damagedQty: null, wrongItemQty: null, units: [],
      })),
    },
  });
  const result = warehouseConfirmationResult.safeParse({
    id: row.id, receipt_id: row.id, status: "draft", grn_no: null,
    revision: row.revision, blockers: row.blockers, already_saved: true,
  });
  if (!input.success || !result.success) return null;
  return { saveKey: input.data.saveKey, result: result.data, report: input.data.report };
}

/** Only the source reader's admitted identities can be picked. Another open
 * report stays its own original; correction must not create a parallel one. */
export function warehousePoCorrectionCandidates(
  row: WarehouseConfirmationReportRow,
  siteId: string,
  pos: readonly WarehouseIncomingPo[],
  reports: readonly WarehouseConfirmationReportRow[],
): WarehouseIncomingPo[] {
  return pos.filter(po => prepareWarehousePoCorrection(row, po, siteId) && !reports.some(other => {
    if (other.id === row.id || !["draft", "submitted", "returned"].includes(other.status)) return false;
    return other.po_id === po.po_id || warehouseConfirmationReportFromWire(other.raw_report)?.poId === po.po_id;
  }));
}
