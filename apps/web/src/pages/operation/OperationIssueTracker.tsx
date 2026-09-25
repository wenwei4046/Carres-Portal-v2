// design-standard: not-a-list-page — governed kit PageShell owns this workspace's list frame.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fmtMoney } from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import PageShell from "@/components/kit/PageShell";
import StatusPill from "@/components/kit/StatusPill";

type IssueAction = { id: string; status: string; trigger: string; owner_rule: "issue_triage_duty" | "issue_review_approver"; action: string; recipient: string; required_result: string; due_on: string };
type IssueRow = { id: string; issue_no: string; observed_on: string; official_english: string; status: string; issue_actions: IssueAction[]; issue_links: Array<{ object_label: string }>; issue_fault_owners: Array<{ owner_name: string }>; issue_money_links: Array<{ track: string; amount: number }> };
const currentAction = (row: IssueRow | null | undefined) => row?.issue_actions.find((action) => action.status === "open") ?? null;
type Choice = { value: string; label: string };
const OBJECTS: Choice[] = [{ value: "item", label: "Item" }, { value: "delivery", label: "Delivery" }, { value: "document", label: "Document" }, { value: "payment", label: "Payment" }, { value: "customer_information", label: "Customer information" }, { value: "staff_work", label: "Staff work" }, { value: "other", label: "Something else" }];
const PROBLEMS: Choice[] = [{ value: "wrong_item", label: "Wrong item" }, { value: "damaged", label: "Damaged" }, { value: "missing", label: "Missing" }, { value: "wrong_quantity", label: "Wrong quantity" }, { value: "late", label: "Late" }, { value: "no_reply", label: "No reply" }, { value: "wrong_information", label: "Wrong information" }, { value: "work_not_done", label: "Required work was not done" }, { value: "not_sure", label: "I am not sure" }];
const VIEWS: Choice[] = [{ value: "all", label: "All Issues" }, { value: "needs_triage", label: "Needs triage" }, { value: "wednesday", label: "Wednesday review" }, { value: "internal", label: "Internal issues" }, { value: "waiting_response", label: "Waiting staff response" }, { value: "waiting_review", label: "Waiting reviewer finding" }, { value: "closed", label: "Closed" }, { value: "voided", label: "Voided" }];
const moneyOf = (row: IssueRow, track: string) => row.issue_money_links.filter((m) => m.track === track).reduce((s, m) => s + Number(m.amount), 0);

/* ── HF-2 · A save never fails silently (owner ruling 2026-09-17) ───────────────
 * One sentence per outcome. `warn` marks an answer the operator must re-check.
 *   stale action (404)            ⚠ Action changed · Review again
 *   validation (400 / 422)        the governed sentence of the first wrong step
 *   permission (403)              Only {acting person} can record this. / no access
 *   the server answered an error  Issue / Result not recorded · Try again
 *   no answer (network, timeout)  ⚠ Not confirmed · Try again — never "not recorded" */
type Failure = { text: string; warn: boolean; step?: number };
const NOT_CONFIRMED: Failure = { text: "Not confirmed · Try again", warn: true };
const SAVE_TIMEOUT_MS = 30_000;
const saveSignal = () => (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(SAVE_TIMEOUT_MS) : undefined);

function permissionFailure(error: ApiError): Failure {
  const acting = (error.body as { actingPerson?: unknown } | null)?.actingPerson;
  return typeof acting === "string" && acting.trim()
    ? { text: `Only ${acting.trim()} can record this.`, warn: false }
    : { text: "You do not have access to record this result.", warn: false };
}
/** A gateway that timed out or could not reach the Worker did not say whether the write happened. */
const answered = (error: unknown): error is ApiError => error instanceof ApiError && error.status !== 502 && error.status !== 504;

type IntakeForm = Record<string, string>;
const INTAKE_CHECKS: Array<{ step: number; path: string; text: string; ok: (f: IntakeForm) => boolean }> = [
  { step: 0, path: "intake.problemObject", text: "Choose what has a problem.", ok: (f) => Boolean(f.object) },
  { step: 1, path: "intake.observedProblem", text: "Choose what you saw.", ok: (f) => Boolean(f.problem) },
  { step: 2, path: "intake.foundBy", text: "Choose who found the issue.", ok: (f) => Boolean(f.foundByName?.trim()) },
  { step: 2, path: "intake.observedOn", text: "Choose when the issue was found.", ok: (f) => /^\d{4}-\d{2}-\d{2}$/.test(f.observedOn ?? "") },
  { step: 2, path: "intake.linkedObjects", text: "Find and choose the linked record.", ok: (f) => Boolean(f.linkLabel?.trim()) },
  { step: 3, path: "intake.evidence", text: "Add the required proof.", ok: (f) => Boolean(f.evidence) },
];

function createFailure(error: unknown, form: IntakeForm): Failure {
  if (!answered(error)) return NOT_CONFIRMED;
  if (error.status === 403) return permissionFailure(error);
  if (error.status === 400 || error.status === 422) {
    const path = String((error.body as { path?: unknown } | null)?.path ?? "");
    const check = (path && INTAKE_CHECKS.find((c) => path.startsWith(c.path))) || INTAKE_CHECKS.find((c) => !c.ok(form));
    if (check) return { text: check.text, warn: false, step: check.step };
  }
  return { text: "Issue not recorded · Try again", warn: false };
}

function resultFailure(error: unknown, resultCode: string): Failure {
  if (!answered(error)) return NOT_CONFIRMED;
  if (error.status === 404) return { text: "Action changed · Review again", warn: true };
  if (error.status === 403) return permissionFailure(error);
  if (error.status === 400 || error.status === 422) {
    return resultCode ? { text: "Add the evidence needed for this result.", warn: false } : { text: "Choose what happened.", warn: false };
  }
  return { text: "Result not recorded · Try again", warn: false };
}

/** The failure sentence inside the open dialog. It takes focus when it appears. */
function FailureMessage({ failure }: { failure: Failure | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (failure) ref.current?.focus(); }, [failure]);
  if (!failure) return null;
  return <p ref={ref} role="alert" tabIndex={-1} className={`mb-3 flex items-center gap-2 text-label outline-none ${failure.warn ? "text-kit-amber-11" : "text-kit-red-11"}`}>{failure.warn && <Icon name="late" size={14} />}{failure.text}</p>;
}

export default function OperationIssueTracker() {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [view, setView] = useState("all"), [open, setOpen] = useState(false), [selected, setSelected] = useState<IssueRow | null>(null);
  const list = useQuery<{ items: IssueRow[]; total: number }>({ queryKey: ["issues", view], queryFn: () => apiFetch(`/api/ops/issues?view=${view}`) });
  const selectedRow = selected ?? list.data?.items.find((row) => row.id === search.get("issue")) ?? null;
  return <PageShell variant="list" title="Issue Tracker" titleRight={<div className="flex gap-2"><Button onClick={() => navigate("/operation/issues/reports")}>Monthly report</Button><Button variant="primary" onClick={() => setOpen(true)}>Record issue</Button></div>}
    facet={<nav aria-label="Issue views" className="flex flex-col gap-1">{VIEWS.map((item) => <Button key={item.value} variant={view === item.value ? "neutral" : "ghost"} onClick={() => setView(item.value)}>{item.label}</Button>)}</nav>} facetOpen onFacetToggle={() => {}}
    toolbar={<span className="text-body text-kit-slate-11">Every issue stays for facts, money and learning.</span>}
    footer={<span>{list.data?.total ?? 0} issues</span>}>
    <div className="min-h-0 flex-1 overflow-auto rounded-card border border-kit-slate-5 bg-white">
      <table className="w-full border-collapse text-body"><thead className="sticky top-0 bg-kit-slate-3 text-left text-label text-kit-slate-11"><tr>{["Issue No.","Observed","Issue","Linked object","Fault Owners","Current Action","Money","Review state"].map((h) => <th key={h} className="h-10 border-b border-kit-slate-5 px-3 font-medium">{h}</th>)}</tr></thead>
      <tbody>{(list.data?.items ?? []).map((row) => { const incurred = moneyOf(row, "incurred"); const action = currentAction(row); return <tr key={row.id} className="h-[38px] cursor-pointer border-b border-kit-slate-4 hover:bg-kit-slate-3" onClick={() => { setSelected(row); setSearch({ issue: row.id }); }}><td className="px-3 font-medium text-kit-blue-11">{row.issue_no}</td><td className="px-3 whitespace-nowrap">{fmtDate(row.observed_on)}</td><td className="max-w-72 px-3"><span className="line-clamp-2">{row.official_english}</span></td><td className="px-3">{row.issue_links.map((x) => x.object_label).join(", ") || "—"}</td><td className="px-3">{row.issue_fault_owners.map((x) => x.owner_name).join(", ") || "Waiting review"}</td><td className="max-w-72 px-3">{action ? <div><div className="font-medium">{action.trigger}</div><div className="text-kit-slate-11">{action.action}</div></div> : "No current action"}</td><td className="px-3 whitespace-nowrap">{row.issue_money_links.length ? fmtMoney(incurred) : "—"}</td><td className="px-3"><StatusPill tone={row.status === "closed" ? "success" : row.status.includes("waiting") ? "warning" : "info"}>{row.status.replaceAll("_", " ")}</StatusPill></td></tr>; })}</tbody></table>
    </div>
    <RecordIssueModal open={open} onOpenChange={setOpen} />
    <IssueWorkspace row={selectedRow} onClose={() => { setSelected(null); setSearch({}); }} />
  </PageShell>;
}

function ChoiceGrid({ choices, selected, onChoose }: { choices: Choice[]; selected?: string; onChoose: (value: string) => void }) { return <div className="grid grid-cols-2 gap-2">{choices.map((choice) => <Button key={choice.value} variant={selected === choice.value ? "primary" : "neutral"} onClick={() => onChoose(choice.value)}>{choice.label}</Button>)}</div>; }

function RecordIssueModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient(); const [step, setStep] = useState(0); const [form, setForm] = useState<IntakeForm>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  // The request id belongs to one set of values: a retry of the same values is the
  // same request (the server answers with the Issue it already recorded); changed
  // values are a new request.
  const attempt = useRef<{ key: string; id: string } | null>(null); const inFlight = useRef(false);
  const payload = () => ({ intake: { problemObject: form.object, observedProblem: form.problem, foundByKind: form.foundByKind || "me", foundByName: form.foundByName, observedOn: form.observedOn, linkedObjects: [{ kind: form.linkKind || "issue", id: form.linkId, label: form.linkLabel }], affectedObject: form.affectedObject, impact: form.impact, evidence: [{ kind: form.evidence, count: 1 }] }, sourceModule: form.linkKind || "other", materiality: "routine", currentAction: { trigger: form.impact, ownerRule: "issue_triage_duty", recipient: form.recipient, action: form.action, requiredResult: form.result, dueOn: form.dueOn } });
  const save = useMutation({
    mutationFn: (body: object) => apiFetch("/api/ops/issues", { method: "POST", body: JSON.stringify(body), signal: saveSignal() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["issues"] }); attempt.current = null; setFailure(null); onOpenChange(false); setStep(0); setForm({}); },
    onError: (error) => { const next = createFailure(error, form); if (next.step !== undefined) setStep(next.step); setFailure(next); },
    onSettled: () => { inFlight.current = false; },
  });
  const submit = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const body = payload(); const key = JSON.stringify(body);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    setFailure(null);
    save.mutate({ requestId: attempt.current.id, ...body });
  };
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const pages = [
    <section key="object"><h3 className="mb-3 text-section">What has a problem?</h3><ChoiceGrid choices={OBJECTS} selected={form.object} onChoose={(v) => { set("object",v); setStep(1); }} /></section>,
    <section key="problem"><h3 className="mb-3 text-section">What did you see?</h3><ChoiceGrid choices={PROBLEMS} selected={form.problem} onChoose={(v) => { set("problem",v); setStep(2); }} /></section>,
    <section key="fact" className="grid gap-3"><h3 className="text-section">Tell us the exact facts</h3><Input id="foundByName" label="Who found it?" value={form.foundByName ?? ""} onChange={(e) => set("foundByName",e.target.value)} /><Input id="observedOn" label="When did you see it? YYYY-MM-DD" value={form.observedOn ?? ""} onChange={(e) => set("observedOn",e.target.value)} /><Input id="affectedObject" label="Which item, delivery, document or staff work?" value={form.affectedObject ?? ""} onChange={(e) => set("affectedObject",e.target.value)} /><Input id="linkLabel" label="Linked number, for example SO-1319" value={form.linkLabel ?? ""} onChange={(e) => { set("linkLabel",e.target.value); set("linkId",e.target.value); }} /><h4 className="text-label">What cannot continue?</h4><ChoiceGrid choices={[{value:"Customer work cannot continue",label:"Customer work"},{value:"Delivery cannot continue",label:"Delivery"},{value:"Warehouse work cannot continue",label:"Warehouse work"},{value:"Finance work cannot continue",label:"Finance work"},{value:"No work was stopped",label:"Nothing stopped"}]} selected={form.impact} onChoose={(v)=>set("impact",v)} /></section>,
    <section key="evidence"><h3 className="mb-3 text-section">What proof do you have?</h3><ChoiceGrid choices={[{value:"photo",label:"Photo"},{value:"video",label:"Video"},{value:"whatsapp_reply",label:"WhatsApp reply"},{value:"delivery_document",label:"Delivery document"},{value:"other_document",label:"Other document"}]} selected={form.evidence} onChoose={(v)=>{set("evidence",v);setStep(4)}} /></section>,
    <section key="action" className="grid gap-3"><h3 className="text-section">What must happen next?</h3><p className="text-body text-kit-slate-11">Issue Triage Duty owns this action. Today’s cover is applied automatically.</p><h4 className="text-label">What must they do?</h4><ChoiceGrid choices={[{value:"Send the issue proof and ask for acceptance",label:"Send proof and ask"},{value:"Call about the issue and ask for an answer",label:"Call and ask"},{value:"Check the linked record and add the missing proof",label:"Check record and add proof"},{value:"Correct the item or document and get confirmation",label:"Correct and confirm"}]} selected={form.action} onChoose={(v)=>set("action",v)} /><Input id="recipient" label="Who must receive it?" value={form.recipient ?? ""} onChange={(e) => set("recipient",e.target.value)} /><h4 className="text-label">What result is needed?</h4><ChoiceGrid choices={[{value:"Acceptance or rejection is recorded",label:"Acceptance or rejection"},{value:"Repair or replacement is confirmed",label:"Repair or replacement"},{value:"The missing proof is added",label:"Missing proof added"},{value:"The corrected fact is confirmed",label:"Correction confirmed"}]} selected={form.result} onChoose={(v)=>set("result",v)} /><Input id="dueOn" label="When must it be ready? YYYY-MM-DD" value={form.dueOn ?? ""} onChange={(e) => set("dueOn",e.target.value)} /></section>,
  ];
  const canNext = (step !== 2 || ["foundByName","observedOn","affectedObject","linkLabel","impact"].every((k) => form[k]?.trim())) && (step !== 3 || Boolean(form.evidence));
  // The last step submits, so it is held to the same completeness as every other step.
  const canRecord = ["action","recipient","result","dueOn"].every((k) => form[k]?.trim());
  return <Modal open={open} onOpenChange={(value) => { if (!value) setFailure(null); onOpenChange(value); }} title="Record issue" description="Choose facts. The system writes the official English." footer={<div className="flex justify-between gap-2">{step > 0 && <Button variant="ghost" onClick={() => setStep((s) => s-1)}>Back</Button>}{step < pages.length-1 ? <Button variant="primary" disabled={!canNext} onClick={() => setStep((s) => s+1)}>Next</Button> : <Button variant="primary" disabled={!canRecord} loading={save.isPending} onClick={submit}>Record issue</Button>}</div>}><FailureMessage failure={failure} />{pages[step]}</Modal>;
}

function IssueWorkspace({ row, onClose }: { row: IssueRow | null; onClose: () => void }) {
  const qc = useQueryClient(); const action = currentAction(row); const [recording, setRecording] = useState(false); const [resultCode, setResultCode] = useState(""); const [result, setResult] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null); const inFlight = useRef(false);
  // A different Issue starts clean: no earlier sentence or half-recorded result carries over.
  useEffect(() => { setFailure(null); setRecording(false); setResultCode(""); setResult(""); }, [row?.id]);
  const saveResult = useMutation({
    mutationFn: () => apiFetch(`/api/ops/issues/${row?.id}/actions/${action?.id}/result`, { method: "POST", body: JSON.stringify({ resultCode, result }), signal: saveSignal() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["issues"] }); setFailure(null); setRecording(false); onClose(); },
    onError: (error) => setFailure(resultFailure(error, resultCode)),
    onSettled: () => { inFlight.current = false; },
  });
  const submit = () => { if (inFlight.current) return; inFlight.current = true; setFailure(null); saveResult.mutate(); };
  const resultChoices = [{ value: "accepted", label: "Accepted" }, { value: "rejected", label: "Rejected" }, { value: "proof_added", label: "Proof added" }, { value: "correction_confirmed", label: "Correction confirmed" }, { value: "repair_confirmed", label: "Repair confirmed" }, { value: "replacement_confirmed", label: "Replacement confirmed" }, { value: "answer_recorded", label: "Answer recorded" }];
  const money = row && row.issue_money_links.length > 0 ? [{ label: "Cost incurred", track: "incurred" }, { label: "Amount recoverable", track: "recoverable" }, { label: "Amount recovered", track: "recovered" }].filter((m) => row.issue_money_links.some((link) => link.track === m.track)) : [];
  return <Modal open={Boolean(row)} onOpenChange={(value) => !value && onClose()} title={row?.issue_no ?? "Issue"} width="wide" footer={<div className="flex gap-2"><Button variant="neutral" onClick={onClose}>Close</Button>{action && !recording && <Button variant="primary" onClick={() => setRecording(true)}>Record result</Button>}{recording && <Button variant="primary" disabled={!resultCode || result.trim().length < 3} loading={saveResult.isPending} onClick={submit}>Record result</Button>}</div>}><div className="grid gap-4"><section><h3 className="text-section">What is true</h3><p className="mt-1 text-body">{row?.official_english}</p></section><section className="rounded-card border border-kit-blue-9 bg-kit-blue-2 p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-section">Current Action</h3>{action && <StatusPill tone="info">{action.owner_rule === "issue_review_approver" ? "Issue Review Approver" : "Issue Triage Duty"}</StatusPill>}</div><p className="mt-2 font-medium">{action?.trigger ?? "No current action"}</p>{action && <div className="mt-1 text-body"><p>{action.action}</p><p className="text-kit-slate-11">{action.recipient} · {action.required_result} · {fmtDate(action.due_on)}</p></div>}</section>{recording && <section className="grid gap-3"><FailureMessage failure={failure} /><h3 className="text-section">What was the result?</h3><ChoiceGrid choices={resultChoices} selected={resultCode} onChoose={setResultCode}/><Input id="action-result" label="Result evidence" value={result} onChange={(event) => setResult(event.target.value)}/></section>}<div className="grid grid-cols-2 gap-3"><section><h3 className="text-section">Fault Owners</h3><p>{row?.issue_fault_owners.map((x) => x.owner_name).join(", ") || "Waiting reviewer finding"}</p></section>{row && money.length > 0 && <section><h3 className="text-section">Money</h3><dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-body">{money.map((m) => <div key={m.track} className="contents"><dt className="text-kit-slate-11">{m.label}</dt><dd className="tabular-nums">{fmtMoney(moneyOf(row, m.track))}</dd></div>)}</dl></section>}</div></div></Modal>;
}
