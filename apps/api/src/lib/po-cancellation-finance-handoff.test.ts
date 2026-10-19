import { describe,it,expect } from "vitest";
import { cancellationFinanceHandoff } from "./po-cancellation-finance-handoff";
describe("Purchasing cancellation read contract for Finance",()=>{
 const item={id:"event-1",poId:"PO-1",poVersion:3,evidence:["PO-1/proof.pdf"],lines:[{lineId:"line-1",qty:1}]};
 it("keeps exact source/version/evidence and explicitly says it is not connected",()=>{
  const result=cancellationFinanceHandoff("PO-1",{events:[{id:item.id,kind:"effective"}],financeHandoffs:[item]});
  expect(result.connection.state).toBe("not_connected");
  expect(result.items[0]).toMatchObject({idempotencyKey:"po_cancellation:event-1:3",lines:item.lines,evidence:[{path:"PO-1/proof.pdf",url:"/api/operation/pos/PO-1/cancellations/event-1/evidence?path=PO-1%2Fproof.pdf"}]});
  expect(result).not.toHaveProperty("acknowledgedAt");
 });
 it.each(["pending","exception_approved","exception_refused"])("does not hand off a %s request",kind=>{
  expect(()=>cancellationFinanceHandoff("PO-1",{events:[{id:item.id,kind}],financeHandoffs:[item]})).toThrow();
 });
 it("refuses a foreign PO or an unreadable source instead of reporting empty success",()=>{
  expect(()=>cancellationFinanceHandoff("PO-other",{events:[{id:item.id,kind:"effective"}],financeHandoffs:[item]})).toThrow();
  expect(()=>cancellationFinanceHandoff("PO-1",null)).toThrow();
 });
});
