import { expect, it } from "vitest";
import { projectCaseRemedyWork } from "./service-case-remedy-work";
it("delivers only current pending proposals to the existing Case approver and exact Case door",()=>{
 const state={caseId:"TEST-case",caseNo:"TEST-SC",events:[{approvalId:"TEST-approval",kind:"proposed",at:"2026-10-16T03:00:00Z"}],approver:{actor_user_id:"TEST-person",actorName:"TEST approver"},proposals:[{id:"TEST-approval",status:"pending",scopeCurrent:true},{id:"old",status:"approved",scopeCurrent:true},{id:"changed",status:"pending",scopeCurrent:false}]} as never;
 const items=projectCaseRemedyWork(state,"2026-10-18",{offDays:[0,6],holidays:["2026-10-19"]});expect(items).toHaveLength(1);expect(items[0]).toMatchObject({module:"purchasing",object:{id:"TEST-approval"},owner:{dutyKey:null,acting:{userId:"TEST-person"}},destination:"/operation?tab=service-notes&case=TEST-case",timing:{actionOn:"2026-10-20"}});
});
