// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import PageShell from "@/components/kit/PageShell";
import Select from "@/components/kit/Select";

type Party = { id: string; name: string; kind: string; report_contact?: string; report_recipient?: string };
export default function IssueTrackerSettings() {
  const qc = useQueryClient(), [name,setName] = useState(""), [kind,setKind] = useState("supplier"), [contact,setContact] = useState(""), [recipient,setRecipient] = useState("");
  const parties = useQuery<{items: Party[]}>({ queryKey:["issue-related-parties"], queryFn:()=>apiFetch("/api/ops/issues/related-parties") });
  const add = useMutation({ mutationFn:()=>apiFetch("/api/ops/issues/related-parties",{method:"POST",body:JSON.stringify({name,kind,reportContact:contact,reportRecipient:recipient})}), onSuccess:()=>{qc.invalidateQueries({queryKey:["issue-related-parties"]});setName("");setContact("");setRecipient("");} });
  return <PageShell variant="settings" title="Issue Tracker Settings"><div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto rounded-card border border-kit-slate-5 bg-white p-5"><section><h2 className="text-section">Related Party master</h2><p className="mt-1 text-body text-kit-slate-11">Use one official name. Monthly reports use this name.</p></section><div className="grid grid-cols-2 gap-3"><Input id="party-name" label="Official party name" value={name} onChange={(e)=>setName(e.target.value)} /><Select id="party-kind" label="Party type" value={kind} onValueChange={setKind} options={[{value:"supplier",label:"Supplier"},{value:"logistics",label:"Logistics"},{value:"warehouse",label:"Warehouse"},{value:"customer",label:"Customer"},{value:"other",label:"Other"}]} /><Input id="party-contact" label="Carres report contact" value={contact} onChange={(e)=>setContact(e.target.value)} /><Input id="party-recipient" label="Monthly report recipient" value={recipient} onChange={(e)=>setRecipient(e.target.value)} /></div><div><Button variant="primary" disabled={!name.trim()} loading={add.isPending} onClick={()=>add.mutate()}>Add Related Party</Button></div><table className="w-full text-body"><thead><tr className="border-b border-kit-slate-5 text-left text-kit-slate-11"><th className="p-2">Official name</th><th>Type</th><th>Recipient</th></tr></thead><tbody>{(parties.data?.items??[]).map((party)=><tr key={party.id} className="border-b border-kit-slate-4"><td className="p-2 font-medium">{party.name}</td><td>{party.kind}</td><td>{party.report_recipient||"Not set"}</td></tr>)}</tbody></table></div></PageShell>;
}
