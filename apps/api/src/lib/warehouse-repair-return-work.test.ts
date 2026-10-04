import {describe,it,expect,vi} from "vitest";
import {Hono} from "hono";
import {projectRepairOrderReturnWork} from "@carres/shared";
import type {CompletedWrite} from "./work-completion";
import type {AppEnv} from "../types";
import {withWarehouseRepairReturnCompletion,type RepairReturnFacts} from "./warehouse-repair-return-work";

const source="11111111-1111-4111-8111-111111111111";
const actor="22222222-2222-4222-8222-222222222222";
const receipt="33333333-3333-4333-8333-333333333333";
const started="2026-10-05T01:00:00Z";
function facts(received=false):RepairReturnFacts{return {
  id:"ro-1",ro_no:"RO-261001-1001",supplier_name:"Supplier",supplier_received_at:"2026-09-20T01:00:00Z",
  return_target_date:"2026-09-30",cancelled_at:null,
  units:[{unit_id:"U1-000-001",goods_received_date:received?"2026-10-05":null,grn_no:received?"GRN-1":null}],
  receipts:received?[{id:receipt,arrival_source_id:source,posted_by:actor,posted_at:"2026-10-05T01:00:01Z",grn_no:"GRN-1"}]:[],
  acceptedReceiptIds:received?[receipt]:[],
};}
async function run(options:{after?:RepairReturnFacts;status?:number;result?:Record<string,unknown>;authority?:boolean;historyFailure?:boolean;recordFailure?:boolean;alreadyBack?:boolean;noSource?:boolean}={}){
  let state=facts(options.alreadyBack);
  const recordCompleted=vi.fn(async(_context:unknown,_write:CompletedWrite)=>{if(options.recordFailure)throw new Error("Recorder unavailable");});
  const log=vi.fn();
  const read=vi.fn(async()=>options.authority===false?null:state);
  const probe=vi.fn(async()=>{
    if(options.historyFailure) throw new Error("History unavailable");
    return projectRepairOrderReturnWork({repairOrder:state,today:"2026-10-05"}).map(item=>({...item,id:`${item.id}:g2`}));
  });
  const write=vi.fn(async()=>{state=options.after ?? facts(true);return new Response(JSON.stringify(options.result ?? {id:receipt,status:"posted"}),{status:options.status ?? 200,headers:{"Content-Type":"application/json"}});});
  const app=new Hono<AppEnv>();
  app.use("*",async(c,next)=>{c.set("auth",{id:actor,role:"warehouse",jwt:"warehouse-jwt",email:"warehouse@example.test",dealerId:null,supplierId:null,partnerId:null,outletId:null,warehouseId:source});await next();});
  app.post("/",c=>withWarehouseRepairReturnCompletion(c,options.noSource?undefined:source,write,{read,probe,
    completion:{recordCompleted,log,now:()=>started}}));
  const response=await app.request("/",{method:"POST"});
  return {response,read,probe,write,recordCompleted,log};
}
describe("Warehouse repair-return Work completion",()=>{
  it("records the exact open generation by the Warehouse actor, retaining the receipt response",async()=>{
    const result=await run();
    expect(result.response.status).toBe(200);expect(await result.response.json()).toEqual({id:receipt,status:"posted"});
    expect(result.recordCompleted).toHaveBeenCalledTimes(1);
    expect(result.recordCompleted.mock.calls[0]?.[1]).toMatchObject({actorId:actor,
      occurrenceId:"purchasing:ro-1:repair_order.return_date_passed:g2",resultReference:"grn=GRN-1",actionOn:"2026-09-30"});
  });
  it("partial physical return leaves Work open",async()=>{
    const after=facts(true);after.units.push({unit_id:"U1-000-002",goods_received_date:null,grn_no:null});
    expect((await run({after})).recordCompleted).not.toHaveBeenCalled();
  });
  it.each(["blocked","refused","cancelled","other-actor","other-source","old-retry","no-contribution","no-grn","already-back"])("does not credit %s as Warehouse completion",async kind=>{
    const after=facts(true);
    if(kind==="cancelled")after.cancelled_at=started;
    if(kind==="other-actor")after.receipts[0]!.posted_by="someone-else";
    if(kind==="other-source")after.receipts[0]!.arrival_source_id="another-source";
    if(kind==="old-retry")after.receipts[0]!.posted_at="2026-10-04T01:00:00Z";
    if(kind==="no-grn")after.receipts[0]!.grn_no=null;
    if(kind==="no-contribution")after.acceptedReceiptIds=[];
    const result=await run({after,status:kind==="refused"?403:200,
      result:kind==="blocked"?{id:receipt,status:"draft"}:undefined,alreadyBack:kind==="already-back"});
    expect(result.recordCompleted).not.toHaveBeenCalled();expect(result.write).toHaveBeenCalledTimes(1);
  });
  it("unknown history preserves business success and records no guessed generation",async()=>{
    const result=await run({historyFailure:true});expect(result.response.status).toBe(200);
    expect(result.recordCompleted).not.toHaveBeenCalled();expect(result.log).toHaveBeenCalled();
  });
  it("unauthorised sources and PO receipts do not probe RO history",async()=>{
    for(const options of [{authority:false},{noSource:true}]){
      const result=await run(options);expect(result.probe).not.toHaveBeenCalled();expect(result.recordCompleted).not.toHaveBeenCalled();
    }
  });
  it("a recorder failure does not undo or misreport the posted receipt",async()=>{
    const result=await run({recordFailure:true});expect(result.response.status).toBe(200);expect(result.log).toHaveBeenCalled();
  });
});

vi.mock("./supabase",()=>({userClient:vi.fn(),adminClient:vi.fn()}));
import {userClient,adminClient} from "./supabase";
import {readWarehouseRepairReturn,warehouseRepairReturnDeps} from "./warehouse-repair-return-work";

function sourceReaderFixture(allowed=true){
  const tables:Record<string,Record<string,unknown>[]>={
    arrival_sources:[{id:source,repair_order_id:"ro-1",kind:"repair-return",cancelled_at:null},
      {id:"foreign-source",repair_order_id:"other-ro",kind:"repair-return",cancelled_at:null}],
    repair_orders:[{id:"ro-1",ro_no:"RO-1",supplier_id:"supplier",supplier_received_at:"2026-09-01T00:00:00Z",return_target_date:"2026-09-10",cancelled_at:null}],
    repair_order_units:[{id:"unit-row-1",repair_order_id:"ro-1",stock_item_id:"unit-1",unit_code:"U1-000-001",removed_at:null},
      {id:"unit-row-2",repair_order_id:"ro-1",stock_item_id:"unit-2",unit_code:"U1-000-002",removed_at:null}],
    suppliers:[{id:"supplier",name:"Supplier"}],
    warehouse_receipts:[{id:receipt,arrival_source_id:source,status:"posted",goods_received_at:"2026-10-05",grn_no:"GRN-1",posted_by:actor,posted_at:started},
      {id:"foreign-receipt",arrival_source_id:"foreign-source",status:"posted",goods_received_at:"2026-10-05",grn_no:"FOREIGN"}],
    receiving_unit_results:[{id:"result-1",receipt_id:receipt,stock_item_id:"unit-1",outcome:"received"},
      {id:"result-2",receipt_id:receipt,stock_item_id:"unit-2",outcome:"not_received"},
      {id:"result-3",receipt_id:"foreign-receipt",stock_item_id:"unit-2",outcome:"received"}],
    work_occurrence_events:[],
  };
  const selects:Array<{table:string;columns:string}>=[];
  const user={rpc:vi.fn().mockResolvedValue({data:allowed,error:null})};
  const sb={from:vi.fn((table:string)=>{
    let rows=tables[table] ?? [];let range:[number,number]|undefined;
    const builder={select:(columns:string)=>{selects.push({table,columns});return builder;},
      eq:(key:string,value:unknown)=>{rows=rows.filter(row=>row[key]===value);return builder;},
      is:(key:string,value:unknown)=>{rows=rows.filter(row=>row[key]===value);return builder;},
      in:(key:string,values:unknown[])=>{rows=rows.filter(row=>values.includes(row[key]));return builder;},
      order:()=>builder,range:(from:number,to:number)=>{range=[from,to];return builder;},
      maybeSingle:async()=>({data:rows[0] ?? null,error:null}),
      then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:range?rows.slice(range[0],range[1]+1):rows,error:null}).then(resolve),
    };return builder;
  })};
  vi.mocked(userClient).mockReturnValue(user as never);
  vi.mocked(adminClient).mockClear();vi.mocked(adminClient).mockReturnValue(sb as never);
  const context={var:{auth:{id:actor,role:"warehouse",jwt:"warehouse-jwt"}},env:{}} as never;
  return {context,tables,user,sb,selects};
}
describe("source-authorised internal repair-return reader",()=>{
  it("reads only source-linked physical facts and excludes foreign and not-received results",async()=>{
    const f=sourceReaderFixture();const result=await readWarehouseRepairReturn(f.context,source);
    expect(f.user.rpc).toHaveBeenCalledWith("warehouse_arrival_proof_allowed",{p_source_id:source,p_require_open:false});
    expect(result?.units).toEqual([{unit_id:"U1-000-001",goods_received_date:"2026-10-05",grn_no:"GRN-1"},
      {unit_id:"U1-000-002",goods_received_date:null,grn_no:null}]);
    expect(result?.acceptedReceiptIds).toEqual([receipt]);
    expect(f.selects.map(row=>row.columns).join(" ")).not.toMatch(/price|quotation|consent|evidence|\*/);
  });
  it("does not use service access before the caller's source check succeeds",async()=>{
    const f=sourceReaderFixture(false);expect(await readWarehouseRepairReturn(f.context,source)).toBeNull();
    expect(adminClient).not.toHaveBeenCalled();
  });
  it("does not read an RO for unrelated arrival kinds or cancelled sources",async()=>{
    for(const change of [{kind:"transfer"},{cancelled_at:started}]){
      const f=sourceReaderFixture();Object.assign(f.tables.arrival_sources![0]!,change);
      expect(await readWarehouseRepairReturn(f.context,source)).toBeNull();
      expect(f.sb.from).not.toHaveBeenCalledWith("repair_orders");
    }
  });
  it("resolves the real ledger generation instead of reusing an already completed identity",async()=>{
    const f=sourceReaderFixture();const base="purchasing:ro-1:repair_order.return_date_passed";
    f.tables.work_occurrence_events=[{id:receipt,occurrence_id:base,event:"completed",actor_id:actor,at:started,
      channel:null,contact_kind:null,contact_id:null,reply_due_on:null,result_reference:"grn=OLD",source_version:"v1",action_on:"2026-09-10",object_label:"RO-1"}];
    const result=await warehouseRepairReturnDeps().probe(f.context,source,"ro-1");
    expect(result).toHaveLength(1);expect(result[0]!.id).toBe(`${base}:g2`);
  });
});
