import { describe, expect, it } from "vitest";
import { prepareWarehousePoCorrection, warehousePoCorrectionCandidates } from "./warehouse-report-correction";
import type { WarehouseConfirmationReportRow } from "./warehouse-confirmation";
import type { WarehouseIncomingPo } from "@carres/shared";
const site="00000000-0000-4000-8000-000000000401";
const line="00000000-0000-4000-8000-000000000402";
const row:WarehouseConfirmationReportRow={id:"00000000-0000-4000-8000-000000000403",po_id:null,arrival_source_id:null,source_no:null,supplier_name:null,do_number:null,status:"draft",grn_no:null,submitted_at:"2026-10-19T12:00:00Z",save_key:"00000000-0000-4000-8000-000000000404",revision:4,blockers:[{code:"source_not_available",message:"Source not available"}],raw_report:{po_id:"UNIDENTIFIED",actual_site_id:site,goods_received_at:"2026-10-19",do_number:"TEST-ORIGINAL",do_file_path:"UNIDENTIFIED/original.png",arrival_evidence:[{path:"UNIDENTIFIED/arrival.png",kind:"photo"}],note:"TEST original observation",lines:[{id:"00000000-0000-4000-8000-000000000405",received_now:2,units:[{unit_code:"U1-000-OLD",outcome:"received"}]}],extra_lines:[{sku:null,qty:1,note:"TEST physically held"}]}};
const po:WarehouseIncomingPo={po_id:"PO-TEST-CORRECT",supplier_name:"TEST Factory",eta_date:null,sup_status:"in_production",open_receipt_id:null,lines:[{id:line,sku:"TEST SAME SKU",qty:3,received_qty:0,damaged_qty:0,wrong_item_qty:0,pending_qty:3,identity_mode:"exact_unit",category:"mattress"}]};
describe("correct the source on the original unposted physical report",()=>{
 it("retains receipt/key/revision and observations, but requires a recount and source-owned proof",()=>{
  const original=structuredClone(row);const saved=prepareWarehousePoCorrection(row,po,site);
  expect(saved).toMatchObject({saveKey:row.save_key,result:{id:row.id,receipt_id:row.id,status:"draft",revision:4},report:{poId:po.po_id,actualSiteId:site,goodsReceivedAt:"2026-10-19",doNumber:"TEST-ORIGINAL",doFilePath:null,arrivalEvidence:[],note:"TEST original observation",extraLines:[{sku:null,qty:1,note:"TEST physically held"}],lines:[{id:line,receivedNow:null,damagedQty:null,wrongItemQty:null,units:[]}]}});
  expect(row).toEqual(original);
  expect(JSON.stringify(saved?.report)).not.toContain("U1-000-OLD");
 });
 it("can recount the same approved source without discarding its source-owned DO",()=>{
  const same={...row,raw_report:{...(row.raw_report as object),po_id:po.po_id,do_file_path:`${po.po_id}/original.png`}};
  expect(prepareWarehousePoCorrection(same,po,site)?.report.doFilePath).toBe(`${po.po_id}/original.png`);
 });
 it.each([{status:"posted",grn_no:"GRN-TEST"},{save_key:null},{revision:-1}])("never diverts a final or unusable original report through a new receipt: %o",change=>{
  expect(prepareWarehousePoCorrection({...row,...change},po,site)).toBeNull();
 });
 it("does not relabel an existing non-PO return through the PO-only correction door",()=>{
  expect(prepareWarehousePoCorrection({...row,raw_report:{...(row.raw_report as object),po_id:null,arrival_source_id:"00000000-0000-4000-8000-000000000497"}},po,site)).toBeNull();
 });
 it("does not silently correct an explicitly different physical Site",()=>{
  expect(prepareWarehousePoCorrection({...row,raw_report:{...(row.raw_report as object),actual_site_id:"00000000-0000-4000-8000-000000000499"}},po,site)).toBeNull();
 });
 it("offers exact admitted PO identities, excluding another report and unknown pending",()=>{
  const other={...row,id:"00000000-0000-4000-8000-000000000498",raw_report:{po_id:po.po_id}};
  const otherPo={...po,po_id:"PO-TEST-SECOND"};
  expect(warehousePoCorrectionCandidates(row,site,[po,otherPo],[row,other]).map(p=>p.po_id)).toEqual([otherPo.po_id]);
  expect(prepareWarehousePoCorrection(row,{...po,open_receipt_id:"another-report"},site)).toBeNull();
  expect(prepareWarehousePoCorrection(row,{...po,lines:po.lines.map(l=>({...l,pending_qty:undefined}))},site)).toBeNull();
 });
});
