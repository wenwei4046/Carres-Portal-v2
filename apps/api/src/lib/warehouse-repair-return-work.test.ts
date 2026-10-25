import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseRepairReturnResult, type WarehouseRepairReturnFacts } from "./warehouse-repair-return-work";
const facts:WarehouseRepairReturnFacts={sourceId:"source",repairOrderId:"ro",receiptId:"receipt",grnNo:"GRN-1",actorId:"person",postedBy:"person",eventId:"event",eventSourceId:"source",eventRepairOrderId:"ro",allUnitsReturned:true};
describe("Warehouse Receiving closes only the causal repair-return Work",()=>{
 it("references the actual GRN, receipt and current actor's causal posted event",()=>{
  expect(warehouseRepairReturnResult("repair_order.return_date_passed",facts)).toBe("repair_orders=ro;warehouse_receipts=receipt;grn=GRN-1;receiving_events=event");
 });
 it.each([{allUnitsReturned:false},{eventRepairOrderId:"another-ro"},{eventSourceId:"another-source"},{postedBy:"someone-else"},{eventId:null},{grnNo:null}])("keeps Work open without its exact completion proof: %o",change=>{
  expect(warehouseRepairReturnResult("repair_order.return_date_passed",{...facts,...change})).toBeNull();
 });
 it("never completes issuance or supplier receipt from physical return",()=>expect(warehouseRepairReturnResult("repair_order.issue",facts)).toBeNull());
});

vi.mock("./supabase",()=>({userClient:vi.fn(),adminClient:vi.fn()}));
import { userClient,adminClient } from "./supabase";
import { readRepairOrderForWarehouseReceiving } from "../routes/operation/repair-orders";
beforeEach(()=>vi.resetAllMocks());
describe("repair completion reads retain current Warehouse source scope",()=>{
 const context={var:{auth:{role:"warehouse",jwt:"real-warehouse-jwt",id:"person"}},env:{}} as never;
 it("reads no administrative facts when current source attestation refuses",async()=>{
  const rpc=vi.fn().mockResolvedValue({data:false,error:null});vi.mocked(userClient).mockReturnValue({rpc} as never);
  await expect(readRepairOrderForWarehouseReceiving(context,"source")).rejects.toThrow("not available");
  expect(adminClient).not.toHaveBeenCalled();
 });
 it("does not turn an Operation actor into a Warehouse confirmer",async()=>{
  await expect(readRepairOrderForWarehouseReceiving({var:{auth:{role:"operation"}},env:{}} as never,"source")).rejects.toThrow("attestation required");
  expect(userClient).not.toHaveBeenCalled();expect(adminClient).not.toHaveBeenCalled();
 });
 it("observes no repair Work for a permitted ordinary Transfer",async()=>{
  vi.mocked(userClient).mockReturnValue({rpc:vi.fn().mockResolvedValue({data:true,error:null})} as never);
  const builder={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:{kind:"transfer",repair_order_id:null},error:null})};builder.select.mockReturnValue(builder);builder.eq.mockReturnValue(builder);
  const from=vi.fn().mockReturnValue(builder);vi.mocked(adminClient).mockReturnValue({from} as never);
  await expect(readRepairOrderForWarehouseReceiving(context,"source")).resolves.toBeNull();
  expect(from).toHaveBeenCalledTimes(1);expect(from).toHaveBeenCalledWith("arrival_sources");
 });
});
