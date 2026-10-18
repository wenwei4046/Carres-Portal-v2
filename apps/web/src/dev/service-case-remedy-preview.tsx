/** DEV ONLY; no production import/build graph. Actual signed owned-local API;
 * explicit TEST actors and Storage signing, never a production-role switch. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import ServiceCaseModal from "@/pages/operation/components/ServiceCaseModal";
import Button from "@/components/kit/Button";
import "@/index.css";
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
function Preview(){
 const [caseId,setCaseId]=useState("");const [actor,setActor]=useState("");
 async function select(role:string){const seed=await fetch(`http://127.0.0.1:43127/seed?actor=${role}`).then(r=>r.json());useAuth.setState({role:seed.actor.role,hydrated:true,loading:false,user:{id:seed.actor.id,email:seed.actor.email} as never,session:{access_token:seed.token,user:{id:seed.actor.id,email:seed.actor.email}} as never});setCaseId(seed.caseId);setActor(role);await client.invalidateQueries();}
 return <div className="p-4"><p>TEST owned local API and database · {actor||"Select an actor"}</p><Button onClick={()=>void select("requester")}>TEST requester</Button><Button onClick={()=>void select("approver")}>TEST approver</Button>{caseId&&<ServiceCaseModal mode="edit" id={caseId} onClose={()=>setCaseId("")} onSaved={()=>{}}/>}</div>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><MemoryRouter><Preview/></MemoryRouter></QueryClientProvider>);
