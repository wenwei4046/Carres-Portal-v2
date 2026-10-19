/** The narrow SC procurement decision in the existing Purchasing source.
 * One projection serves Tasks/Workspace and the owning decision completion. */
import type { Context } from "hono";
import { operationWorkItemFromProjection, serviceCaseRemedyDecisionSchema, addWorkingDays, officeWorkingDayOptions, DEFAULT_OFFICE_CALENDAR, klDateOfIso, type WorkingDayOptions, type ServiceCaseRemedyState, type OperationWorkItem } from "@carres/shared";
import type { AppEnv } from "../types";
import { userClient } from "./supabase";
import { todayIsoMYT } from "./today";
import { workCompletion } from "./work-completion";
export function projectCaseRemedyWork(state:ServiceCaseRemedyState,today:string,office:WorkingDayOptions=officeWorkingDayOptions(DEFAULT_OFFICE_CALENDAR)):OperationWorkItem[]{
 const a=state.approver;const person=a.actor_user_id?{userId:a.actor_user_id,name:a.actorName??null}:null;
 const normal=a.normal_user_id?{userId:a.normal_user_id,name:a.normal_user_name??null}:person;const cover=a.is_cover&&a.acting_user_id?{userId:a.acting_user_id,name:a.acting_user_name??null}:null;
 return state.proposals.filter(p=>p.status==="pending"&&p.scopeCurrent).map(p=>{
 const at=state.events.find(e=>e.approvalId===p.id&&e.kind==="proposed")?.at;const due=at?addWorkingDays(klDateOfIso(at),1,office):null;
 return operationWorkItemFromProjection({
  ruleKey:"service_case.remedy_approve",module:"purchasing",soRef:state.caseNo??"Service Case",orderId:p.id,action:"Review Case remedy",ownerRule:"service_case_pic",ownerDutyKey:null,normalOwner:normal,activeCover:cover,actingPerson:person,ownerState:person?(cover?"covered":"primary"):"not_assigned",ownerName:person?.name??null,ownerUserId:person?.userId??null,tone:"warning",locked:false,broken:false,dueIso:due,workingDaysLate:0,
 },{object:{kind:"service_case_remedy",id:p.id,label:state.caseNo??"Service Case"},problem:"Case remedy requires a decision",recipient:null,requiredResult:"Exact Case remedy approved or refused",destination:`/operation?tab=service-notes&case=${encodeURIComponent(state.caseId)}`,today,noDateReason:due?null:"The proposal submission date could not be read.",sourceVersion:p.id});});
}
async function readCase(c:Context<AppEnv>,id:string):Promise<ServiceCaseRemedyState>{
 const {data,error}=await userClient(c.env,c.var.auth.jwt).rpc("service_case_remedy_read",{p_case_id:id});if(error)throw new Error(error.message);return data as ServiceCaseRemedyState;
}
export async function loadCaseRemedyWork(c:Context<AppEnv>,today:string,office?:WorkingDayOptions):Promise<OperationWorkItem[]>{
 const sb=userClient(c.env,c.var.auth.jwt);const cases=new Set<string>();
 for(let offset=0;;offset+=200){const {data,error}=await sb.from("approvals").select("id,payload").eq("payload->>domain","service_case_remedy").eq("status","pending").order("id").range(offset,offset+199);if(error)throw new Error(error.message);for(const row of data??[])cases.add(row.payload.caseId);if((data?.length??0)<200)break;}
 const items:OperationWorkItem[]=[];for(const id of cases)items.push(...projectCaseRemedyWork(await readCase(c,id),today,office??officeWorkingDayOptions(await (await import("../routes/operation/work")).officeCalendarOf(c))));return items;
}
export const caseRemedyCompletion=()=>workCompletion({targets:async c=>{
 const raw=await c.req.json().catch(()=>null);const parsed=serviceCaseRemedyDecisionSchema.safeParse(raw);if(!parsed.success)return[];const body=parsed.data;const id=body.approvalId;const caseId=c.req.param("id");if(typeof id!=="string"||!caseId)return[];
 return[{objectIds:[id],spec:{owner:"Service Case",rules:["service_case.remedy_approve"],probe:async(parent:Context<AppEnv>,approvalId:string)=>{
  const office=officeWorkingDayOptions(await (await import("../routes/operation/work")).officeCalendarOf(parent));
  const items=projectCaseRemedyWork(await readCase(parent,caseId),todayIsoMYT(),office).filter(p=>p.object.id===approvalId);
  const {readWorkLedger,supabaseWorkLedger}=await import("../routes/operation/work");const {currentId}=await readWorkLedger(parent,supabaseWorkLedger,items.map(i=>i.id));return items.map(i=>({...i,id:currentId.get(i.id)??i.id}));
 },readFacts:async(parent:Context<AppEnv>,approvalId:string)=>{const state=await readCase(parent,caseId);return state.proposals.find(p=>p.id===approvalId)??null;},result:(_rule:string,facts:ServiceCaseRemedyState["proposals"][number]|null)=>facts&&facts.status!=="pending"&&facts.decidedAt?`approvals:${facts.id}:${facts.status}@${facts.decidedAt}`:null}}];
}});
