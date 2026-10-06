/**
 * THE ISSUE TRACKER'S RECORD-RESULT DOOR — ONE component, two places.
 *
 * The Issue Tracker page's case dialog and the Workspace card both draw THIS
 * (ERP-ARCHITECTURE law C: a door, never a duplicate). Workspace §5.10 ruling
 * (Jess, 2026-09-27: "workspace is stay here to complete all job"; 2026-09-28
 * on the Issue Tracker jump: "why jump to others page?"): the act is finished
 * inside Workspace, so Workspace mounts the Issue Tracker's own form in place
 * and the save writes the same `/api/ops/issues/:id/actions/:actionId/result`.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import Input from "@/components/kit/Input";

export type IssueAction = { id: string; status: string; trigger: string; owner_rule: "issue_triage_duty" | "issue_review_approver"; action: string; recipient: string; required_result: string; due_on: string };
export type IssueRow = { id: string; issue_no: string; observed_on: string; official_english: string; status: string; issue_actions: IssueAction[]; issue_links: Array<{ object_label: string }>; issue_fault_owners: Array<{ owner_name: string }>; issue_money_links: Array<{ track: string; amount: number }> };
export const currentAction = (row: IssueRow | null | undefined) => row?.issue_actions.find((action) => action.status === "open") ?? null;
export type Choice = { value: string; label: string };

/* ── HF-2 · A save never fails silently (owner ruling 2026-09-17) ───────────────
 * One sentence per outcome. `warn` marks an answer the operator must re-check.
 *   stale action (404)            ⚠ Action changed · Review again
 *   validation (400 / 422)        the governed sentence of the first wrong step
 *   permission (403)              Only {acting person} can record this. / no access
 *   the server answered an error  Issue / Result not recorded · Try again
 *   no answer (network, timeout)  ⚠ Not confirmed · Try again — never "not recorded" */
export type Failure = { text: string; warn: boolean; step?: number };
export const NOT_CONFIRMED: Failure = { text: "Not confirmed · Try again", warn: true };
const SAVE_TIMEOUT_MS = 30_000;
export const saveSignal = () => (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(SAVE_TIMEOUT_MS) : undefined);

export function permissionFailure(error: ApiError): Failure {
  const acting = (error.body as { actingPerson?: unknown } | null)?.actingPerson;
  return typeof acting === "string" && acting.trim()
    ? { text: `Only ${acting.trim()} can record this.`, warn: false }
    : { text: "You do not have access to record this result.", warn: false };
}
/** A gateway that timed out or could not reach the Worker did not say whether the write happened. */
export const answered = (error: unknown): error is ApiError => error instanceof ApiError && error.status !== 502 && error.status !== 504;

function resultFailure(error: unknown, resultCode: string): Failure {
  if (!answered(error)) return NOT_CONFIRMED;
  if (error.status === 404) return { text: "Action changed · Review again", warn: true };
  if (error.status === 403) return permissionFailure(error);
  if (error.status === 400 || error.status === 422) {
    return resultCode ? { text: "Add the evidence needed for this result.", warn: false } : { text: "Choose what happened.", warn: false };
  }
  return { text: "Result not recorded · Try again", warn: false };
}

/** The failure sentence inside the open form. It takes focus when it appears. */
export function FailureMessage({ failure }: { failure: Failure | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (failure) ref.current?.focus(); }, [failure]);
  if (!failure) return null;
  return <p ref={ref} role="alert" tabIndex={-1} className={`mb-3 flex items-center gap-2 text-label outline-none ${failure.warn ? "text-kit-amber-11" : "text-kit-red-11"}`}>{failure.warn && <Icon name="late" size={14} />}{failure.text}</p>;
}

export function ChoiceGrid({ choices, selected, onChoose }: { choices: Choice[]; selected?: string; onChoose: (value: string) => void }) { return <div className="grid grid-cols-2 gap-2">{choices.map((choice) => <Button key={choice.value} variant={selected === choice.value ? "primary" : "neutral"} onClick={() => onChoose(choice.value)}>{choice.label}</Button>)}</div>; }

const RESULT_CHOICES: Choice[] = [{ value: "accepted", label: "Accepted" }, { value: "rejected", label: "Rejected" }, { value: "proof_added", label: "Proof added" }, { value: "correction_confirmed", label: "Correction confirmed" }, { value: "repair_confirmed", label: "Repair confirmed" }, { value: "replacement_confirmed", label: "Replacement confirmed" }, { value: "answer_recorded", label: "Answer recorded" }];

/** The one save of an Issue action's result: state, write, failure sentence. */
export function useIssueResult(row: IssueRow | null, onSaved: () => void) {
  const qc = useQueryClient(); const action = currentAction(row);
  const [resultCode, setResultCode] = useState(""); const [result, setResult] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null); const inFlight = useRef(false);
  // A different Issue starts clean: no earlier sentence or half-recorded result carries over.
  useEffect(() => { setFailure(null); setResultCode(""); setResult(""); }, [row?.id]);
  const saveResult = useMutation({
    mutationFn: () => apiFetch(`/api/ops/issues/${row?.id}/actions/${action?.id}/result`, { method: "POST", body: JSON.stringify({ resultCode, result }), signal: saveSignal() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["issues"] }); qc.invalidateQueries({ queryKey: ["operation", "work"] }); setFailure(null); onSaved(); },
    onError: (error) => setFailure(resultFailure(error, resultCode)),
    onSettled: () => { inFlight.current = false; },
  });
  const submit = () => { if (inFlight.current) return; inFlight.current = true; setFailure(null); saveResult.mutate(); };
  const canSave = Boolean(resultCode) && result.trim().length >= 3;
  return { action, resultCode, setResultCode, result, setResult, failure, submit, canSave, pending: saveResult.isPending };
}

/** The fields: what happened, and its evidence. */
export function IssueResultFields({ state }: { state: ReturnType<typeof useIssueResult> }) {
  return <section className="grid gap-3"><FailureMessage failure={state.failure} /><h3 className="text-section">What was the result?</h3><ChoiceGrid choices={RESULT_CHOICES} selected={state.resultCode} onChoose={state.setResultCode} /><Input id="action-result" label="Result evidence" value={state.result} onChange={(event) => state.setResult(event.target.value)} /></section>;
}

/**
 * The form IN PLACE (Workspace card): the case's official sentence as the
 * grey fact, the Issue Tracker's own fields, `Cancel` and `Record result`.
 */
export function IssueResultInPlace({ issueId, onDone, onCancel }: { issueId: string; onDone: () => void; onCancel: () => void }) {
  const one = useQuery<IssueRow>({ queryKey: ["issues", "one", issueId], queryFn: () => apiFetch(`/api/ops/issues/${encodeURIComponent(issueId)}`) });
  const state = useIssueResult(one.data ?? null, onDone);
  if (one.isLoading) return <div className="h-24 animate-pulse rounded-control bg-kit-slate-3 motion-reduce:animate-none" aria-label="Loading issue" />;
  if (one.isError || !one.data) return <p role="alert" className="text-body text-kit-red-11">Issue could not be loaded. Try again.</p>;
  return (
    <div className="grid gap-3" data-testid={`issue-result-in-place-${issueId}`}>
      <p className="text-body text-kit-slate-11">{one.data.official_english}</p>
      {state.action ? <IssueResultFields state={state} /> : <p className="text-body text-kit-slate-11">No current action</p>}
      <div className="flex justify-end gap-2">
        <Button variant="neutral" onClick={onCancel}>Cancel</Button>
        {state.action ? <Button variant="primary" disabled={!state.canSave} loading={state.pending} onClick={state.submit}>Record result</Button> : null}
      </div>
    </div>
  );
}
