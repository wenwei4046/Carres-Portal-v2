import {lazy,Suspense,useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {receivingReportEvidenceFiles,type ReceivingReportEvidenceFiles} from "@carres/shared";
import EvidenceUploadField from "@/components/EvidenceUploadField";
import SavedEvidenceViewer from "@/components/kit/SavedEvidenceViewer";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import {apiFetch,ApiError} from "@/lib/api";
import {supabase} from "@/lib/supabase";
import {fmtDate} from "@/lib/fmt-date";
const PdfPreview=lazy(()=>import("@/components/kit/PdfPreview"));
type FileRow=ReceivingReportEvidenceFiles["files"][number];
/** Receipt-owned additive evidence. All identity/path/permission comes from DB;
 * physical observations, source correction, Stock and Extra are untouched. */
export default function ReceivingReportEvidence({receiptId,office=false}:{receiptId:string;office?:boolean}){
 const client=useQueryClient();
 const base=office?`/api/operation/warehouse-receipts/${receiptId}/report-evidence`:`/api/warehouse/confirmation/receipts/${receiptId}/report-evidence`;
 const key=["receiving-report-evidence",receiptId,office];
 const query=useQuery({queryKey:key,retry:false,queryFn:async()=>receivingReportEvidenceFiles.parse(await apiFetch(base))});
 const attempts=useRef(new WeakMap<File,{id:string;attached?:boolean}>());
 const [entries,setEntries]=useState<Array<{path:string;kind:string}>>([]);
 const [active,setActive]=useState<FileRow|null>(null);
 const [url,setUrl]=useState<string|null>(null);
 const [loading,setLoading]=useState(false);
 const request=useRef(0);
 async function sign(file:File){
  let attempt=attempts.current.get(file);if(!attempt){attempt={id:crypto.randomUUID()};attempts.current.set(file,attempt);}
  const slot=await apiFetch<{id:string;path:string;token:string;attached:boolean}>(`${base}/slots`,{method:"POST",body:JSON.stringify({fileId:attempt.id,name:file.name,mimeType:file.type,sizeBytes:file.size})});
  attempt.attached=slot.attached;return slot;
 }
 async function upload(slot:{path:string;token:string},file:File){
  const attempt=attempts.current.get(file);if(!attempt)throw new Error("Evidence could not be saved");
  if(!attempt.attached){
   const {error}=await supabase.storage.from("receiving-report-proofs").uploadToSignedUrl(slot.path,slot.token,file);
   // An upload response can be lost after storage commits. The SQL finaliser
   // verifies the original object owner/type/size before accepting a conflict.
   if(error&&String((error as {statusCode?:string}).statusCode)!=="409"&&!/already exists/i.test(error.message))throw error;
  }
  await apiFetch(`${base}/${attempt.id}/complete`,{method:"POST"});
  await Promise.all([client.invalidateQueries({queryKey:key}),client.invalidateQueries({queryKey:["warehouse-portal","confirmation-history",receiptId]}),client.invalidateQueries({queryKey:["operation","warehouse-receipts","session",receiptId]})]);
 }
 async function open(file:FileRow){
  const seq=++request.current;setActive(file);setUrl(null);setLoading(true);
  try{const result=await apiFetch<{url:string}>(`${base}/${file.id}`);if(seq===request.current)setUrl(result.url);return result.url;}
  catch{return null;}finally{if(seq===request.current)setLoading(false);}
 }
 const close=()=>{request.current++;setActive(null);setLoading(false);};
 if(query.isPending)return <p role="status">Loading…</p>;
 if(query.isError){const denied=query.error instanceof ApiError&&[401,403].includes(query.error.status);const missing=query.error instanceof ApiError&&[404,503].includes(query.error.status);
  return <div role="alert"><p>{missing?"Report evidence is not available yet.":denied?"Report evidence is not available to this person and Site.":"Could not be loaded"}</p>{!denied&&!missing&&<Button onClick={()=>void query.refetch()}>Try again</Button>}</div>;
 }
 return <div className="grid gap-3">
  <p className="text-body">Original report evidence</p>
  <p className="text-meta">These files belong to the original report. They do not verify a PO or Unit.</p>
  {query.data.can_upload&&!office&&<EvidenceUploadField entries={entries} onChange={setEntries} sign={sign} upload={upload} appendOnly bucket="receiving-report-proofs" imageMimes={["image/jpeg","image/png"]} videoMimes={["video/mp4","video/quicktime","video/webm"]} pdfMimes={["application/pdf"]} imageMaxBytes={10485760} videoMaxBytes={10485760} maxFiles={20} ariaLabel="Arrival evidence"/>}
  {query.data.files.length===0&&<p className="text-body">No evidence recorded yet.</p>}
  <ul className="space-y-2">{query.data.files.map(file=><li key={file.id}><span className="text-meta">{file.name} · {fmtDate(file.created_at,{time:true})}</span>{file.event_id?<Button size="sm" onClick={()=>void open(file)}>View proof</Button>:<p role="status">Evidence upload is not complete.</p>}</li>)}</ul>
  {active?.kind==="pdf"?<Modal open title="Evidence" width="viewer" onOpenChange={value=>{if(!value)close();}}>{loading?<p role="status">Loading…</p>:url?<Suspense fallback={<p>Loading…</p>}><PdfPreview src={url} title="Evidence"/></Suspense>:<p role="alert">Could not be loaded</p>}<Button onClick={()=>void open(active)}>Try again</Button></Modal>:active&&loading?<Modal open title="Evidence" onOpenChange={value=>{if(!value)close();}}><p>Loading…</p></Modal>:active&&<SavedEvidenceViewer activeId={active.id} onClose={close} files={[{id:active.id,kind:active.kind,url,context:`Original report evidence · ${active.name} · ${fmtDate(active.created_at,{time:true})}`}]} onRetry={()=>open(active)}/>}
 </div>;
}
