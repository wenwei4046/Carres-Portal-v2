// design-standard: not-a-list-page — one section of the Purchase Order object page (its
// facts column), drawn as a per-line table inside the page's own shell; not a List page.
import { useMemo, useState } from "react";
import {
  PO_DELAY_REASONS,
  poLineSupplierAnswersOf,
  recordSupplierAnswersInput,
  type PoDatePromise,
  type PoLineSupplierAnswer,
  type RecordSupplierAnswersInput,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { useRecordSupplierAnswers } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import SupplierAnswerEvidenceUploadField from "@/components/SupplierAnswerEvidenceUploadField";
import type { EvidenceEntry } from "@/components/EvidenceUploadField";

/**
 * ⭐ SUPPLIER REPLY — the supplier's answer PER GOODS LINE, as ONE TABLE
 * (Purchasing MASTER §5.7, owner 2026-09-25; compact table revision
 * 2026-09-26: "we got width, not tall").
 *
 * READ state: one 40px row per goods line — Item · Qty · To deliver ·
 * Supplier Confirmed Delivery Date · Last answer — and the Supplier DO line.
 * EDIT state: the SAME table, editable in place: Answer is one dropdown per
 * row (`No change` · `Confirmed` · `New date` · `Split delivery`); Date and
 * Reason appear in the row only when the answer needs them; a split grows a
 * sub-row per batch; ticked rows take one bulk answer. The server classifies
 * every date against the immutable PO Delivery Date; this file never writes
 * "delayed".
 *
 * Every Unit ID prints in full under its item (owner 2026-09-26) — the answer
 * itself stays per line and quantity; Receiving verifies which Units arrive.
 */
export interface SupplierReplyLine {
  id: string;
  sku: string;
  item: string;
  itemDetail?: string;
  qty: number;
  receivedQty: number;
  unitIds: string[];
}

type Channel = "whatsapp" | "email" | "phone" | "in_person";
type AnswerKind = "no_change" | "confirmed" | "new_date" | "split";

interface Batch { qty: string; date: string; reason: string; remarks: string }
interface LineDraft { answer: AnswerKind; date: string; reason: string; remarks: string; batches: Batch[]; selected: boolean }

const ANSWER_WORD: Record<AnswerKind, string> = {
  no_change: "No change",
  confirmed: "Confirmed",
  new_date: "New date",
  split: "Split delivery",
};

const control = "h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-meta";
const cell = "px-2 py-0 align-middle";
const head = "h-9 px-2 text-left text-label font-semibold text-kit-slate-11";

export function stillToDeliver(line: { qty: number; receivedQty: number }): number {
  return Math.max(0, Number(line.qty) - Number(line.receivedQty));
}

/** `3 pcs · Fri, 9 Oct` for a batch; a whole-line answer prints its date alone. */
export function batchWord(b: { qty: number | null; date: string; answer: string; reason: string | null }, batches: number): string {
  const date = fmtDate(b.date);
  const qty = batches > 1 && b.qty != null ? `${b.qty} pcs · ` : "";
  const tail = b.answer === "delayed" ? ` · Delayed${b.reason ? ` · ${b.reason}` : ""}` : b.answer === "earlier" ? " · Earlier" : b.answer === "reported" ? " · Reported" : "";
  return `${qty}${date}${tail}`;
}

function AnswerCell({ answer, previousDate, officialDate }: { answer: PoLineSupplierAnswer | undefined; previousDate: string | null; officialDate: string | null }) {
  if (!answer) return <span className="text-kit-slate-11">Not confirmed</span>;
  const changedFrom = answer.batches.some((b) => officialDate && b.date !== officialDate) ? (previousDate ?? officialDate) : null;
  return (
    <span className="flex flex-col leading-4">
      <span className="tabular-nums">{answer.batches.map((b) => batchWord(b, answer.batches.length)).join(" · ")}</span>
      {changedFrom ? <span className="text-label text-kit-slate-11">Supplier changed from {fmtDate(changedFrom)}</span> : null}
    </span>
  );
}

export default function SupplierReplySection({
  poId, version, officialDeliveryDate, supplierName, lines, promises, canRecord,
  defaultChannel, defaultRecipient, supplierDo, onSaved,
}: {
  poId: string;
  version: number;
  officialDeliveryDate: string | null;
  supplierName: string;
  lines: SupplierReplyLine[];
  promises: readonly PoDatePromise[];
  canRecord: boolean;
  defaultChannel: Channel;
  defaultRecipient: string;
  supplierDo: { number: string | null; uploadedAt: string | null; file: string | null } | null;
  onSaved: () => void;
}) {
  const record = useRecordSupplierAnswers(poId);
  const openLines = lines.filter((l) => stillToDeliver(l) > 0);
  const answers = useMemo(
    () => poLineSupplierAnswersOf(promises, version, lines.map((l) => l.id)),
    [promises, version, lines],
  );
  const lastAnswer = useMemo(() => {
    const all = [...answers.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    return all[0] ?? null;
  }, [answers]);
  const evidenceCount = useMemo(() => {
    const paths = new Set<string>();
    for (const p of promises) if (p.kind === "tomorrow_delivery" && p.po_version === version && p.evidence?.trim()) paths.add(p.evidence);
    return paths.size;
  }, [promises, version]);

  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [doReceived, setDoReceived] = useState(false);
  const [doNumber, setDoNumber] = useState("");
  const [doFile, setDoFile] = useState<EvidenceEntry[]>([]);
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [reportedBy, setReportedBy] = useState("");
  const [reportedAt, setReportedAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [bulk, setBulk] = useState<AnswerKind | "">("");
  const [problem, setProblem] = useState<string | null>(null);

  const blank = (): LineDraft => ({ answer: "no_change", date: "", reason: "", remarks: "", batches: [], selected: false });
  const draftOf = (id: string): LineDraft => drafts[id] ?? blank();
  const setDraft = (id: string, patch: Partial<LineDraft>) => setDrafts((prev) => ({ ...prev, [id]: { ...draftOf(id), ...patch } }));

  function open() {
    setDrafts({});
    setDoReceived(false); setDoNumber(""); setDoFile([]); setEvidence([]);
    setChannel(defaultChannel); setRecipient(defaultRecipient); setProblem(null); setBulk("");
    setEditing(true);
  }
  function cancel() { setEditing(false); setProblem(null); }

  const later = (date: string) => !!date && !!officialDeliveryDate && date > officialDeliveryDate;

  /* The wire, built from the drafts; `safeParse` names the first blocker. */
  const built = useMemo(() => {
    const wireLines: RecordSupplierAnswersInput["lines"] = openLines.map((l) => {
      const d = draftOf(l.id);
      if (d.answer === "split") {
        return {
          poLineId: l.id, answer: "split" as const,
          batches: d.batches.map((b) => ({
            qty: Number(b.qty) || 0, date: b.date,
            ...(later(b.date) && b.reason ? { reason: b.reason as (typeof PO_DELAY_REASONS)[number] } : {}),
            ...(b.remarks.trim() ? { remarks: b.remarks.trim() } : {}),
          })),
        };
      }
      if (d.answer === "new_date") {
        return {
          poLineId: l.id, answer: "new_date" as const, date: d.date,
          ...(later(d.date) && d.reason ? { reason: d.reason as (typeof PO_DELAY_REASONS)[number] } : {}),
          ...(d.remarks.trim() ? { remarks: d.remarks.trim() } : {}),
        };
      }
      return { poLineId: l.id, answer: d.answer, ...(d.remarks.trim() ? { remarks: d.remarks.trim() } : {}) };
    });
    const body = {
      poVersion: version, channel, recipient: recipient.trim(), reportedBy: reportedBy.trim(),
      reportedAt: reportedAt && Number.isFinite(Date.parse(reportedAt)) ? new Date(reportedAt).toISOString() : "",
      evidence: evidence.map((e) => e.path),
      ...(doReceived ? { supplierDo: { number: doNumber.trim(), file: doFile[0]?.path ?? "" } } : {}),
      lines: wireLines,
    };
    return { body, parsed: recordSupplierAnswersInput.safeParse(body) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, openLines, version, channel, recipient, reportedBy, reportedAt, evidence, doReceived, doNumber, doFile]);

  /* The Save button NAMES the gap (COPY: `Save — {what is missing}`). */
  const blocker = (): string | null => {
    const answered = openLines.filter((l) => draftOf(l.id).answer !== "no_change");
    if (answered.length === 0 && !doReceived) return "answer a line or record the Supplier DO";
    if (doReceived && (!doNumber.trim() || doNumber.trim().length < 3)) return "record the Supplier DO number";
    if (doReceived && doFile.length === 0) return "upload the Supplier DO";
    for (const l of answered) {
      const d = draftOf(l.id);
      if (d.answer === "new_date") {
        if (!d.date) return "record the supplier delivery date";
        if (later(d.date) && !d.reason) return "choose why the supplier moved the date";
        if (later(d.date) && d.reason === "Other" && !d.remarks.trim()) return "write why the supplier moved the date";
      }
      if (d.answer === "split") {
        const total = d.batches.reduce((t, b) => t + (Number(b.qty) || 0), 0);
        if (d.batches.length === 0 || total !== stillToDeliver(l)) return `the batches must total ${stillToDeliver(l)}`;
        for (const b of d.batches) {
          if (!b.date) return "record the supplier delivery date";
          if (later(b.date) && !b.reason) return "choose why the supplier moved the date";
          if (later(b.date) && b.reason === "Other" && !b.remarks.trim()) return "write why the supplier moved the date";
        }
      }
    }
    if (answered.length > 0 && evidence.length === 0 && doFile.length === 0) return "add a WhatsApp screenshot";
    if (!recipient.trim()) return "name who answered";
    if (!reportedBy.trim()) return "name who answered";
    if (!reportedAt) return "record when the supplier answered";
    if (!built.parsed.success) return "check the answer";
    return null;
  };
  const gap = editing ? blocker() : null;
  const ready = editing && !gap && !record.isPending;

  function save() {
    if (!ready || !built.parsed.success) return;
    setProblem(null);
    record.mutate(built.parsed.data, {
      onSuccess: () => { setEditing(false); onSaved(); },
      onError: (e: unknown) => {
        const body = (e as { body?: { message?: string } }).body;
        setProblem(body?.message ? `Could not save. ${body.message}` : "Could not save. Try again.");
      },
    });
  }

  function applyBulk() {
    if (!bulk) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const l of openLines) {
        const d = next[l.id] ?? blank();
        if (d.selected) next[l.id] = { ...d, answer: bulk, batches: bulk === "split" && d.batches.length === 0 ? [{ qty: String(stillToDeliver(l)), date: "", reason: "", remarks: "" }] : d.batches };
      }
      return next;
    });
  }
  const selectedCount = openLines.filter((l) => draftOf(l.id).selected).length;

  async function openFile(path: string) {
    const { data, error } = await supabase.storage.from("delivery-orders").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { setProblem("The file could not be opened"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const itemCell = (l: SupplierReplyLine) => (
    <span className="flex flex-col leading-4">
      <span>{l.item}{l.itemDetail ? <span className="text-kit-slate-11"> · {l.itemDetail}</span> : null}</span>
      {l.unitIds.length ? (
        <span className="font-mono text-label text-kit-slate-11" data-testid={`po-answer-units-${l.id}`}>{l.unitIds.join(" · ")}</span>
      ) : null}
    </span>
  );

  /* ── READ ────────────────────────────────────────────────────────────── */
  if (!editing) {
    return (
      <div className="border-t border-kit-slate-4 pt-3" data-testid="po-supplier-reply">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-label font-semibold text-kit-slate-11">Supplier reply</div>
          <div className="text-meta text-kit-slate-11">PO Delivery Date · {officialDeliveryDate ? fmtDate(officialDeliveryDate) : "Not recorded"}</div>
          <div className="flex-1" />
          {canRecord ? (
            <button type="button" onClick={open} data-testid="po-supplier-reply-record"
              className="h-8 rounded-control border border-kit-slate-5 bg-white px-3 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3">
              Record supplier answer
            </button>
          ) : null}
        </div>
        <div className="mt-2 min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-meta" data-testid="po-supplier-reply-table">
            <thead className="bg-kit-slate-3">
              <tr>
                <th className={head}>Item</th><th className={`${head} text-right`}>Qty</th><th className={`${head} text-right`}>To deliver</th>
                <th className={head}>Supplier Confirmed Delivery Date</th><th className={head}>Last answer</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const a = answers.get(l.id);
                return (
                  <tr key={l.id} className="h-10 border-t border-kit-slate-4" data-testid={`po-answer-line-${l.id}`}>
                    <td className={cell}>{itemCell(l)}</td>
                    <td className={`${cell} text-right tabular-nums`}>{l.qty}</td>
                    <td className={`${cell} text-right tabular-nums`} data-testid={`po-answer-still-${l.id}`}>{stillToDeliver(l) === 0 ? <span className="text-kit-slate-11">All received</span> : stillToDeliver(l)}</td>
                    <td className={cell} data-testid={`po-answer-date-${l.id}`}><AnswerCell answer={a} previousDate={a?.previousDate ?? null} officialDate={officialDeliveryDate} /></td>
                    <td className={cell}>{a ? <span className="flex flex-col leading-4"><span>{fmtDate(a.recordedAt)}{a.recordedByName ? ` · ${a.recordedByName}` : ""}</span>{a.evidence ? <button type="button" className="text-left text-label text-kit-blue-11 hover:underline" onClick={() => void openFile(a.evidence!)}>Evidence</button> : null}</span> : <span className="text-kit-slate-11">None recorded yet</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 text-meta text-kit-slate-11" data-testid="po-supplier-reply-foot">
          <span>Supplier DO · {supplierDo?.number ? <span className="font-medium text-kit-slate-12">{supplierDo.number}</span> : "Not recorded"}{supplierDo?.uploadedAt ? ` · ${fmtDate(supplierDo.uploadedAt)}` : ""}{supplierDo?.file ? <> · <button type="button" className="text-kit-blue-11 hover:underline" onClick={() => void openFile(supplierDo.file!)}>PDF</button></> : null}</span>
          <span>Last answer · {lastAnswer ? `${fmtDate(lastAnswer.recordedAt)}${lastAnswer.recordedByName ? ` · recorded by ${lastAnswer.recordedByName}` : ""} · Evidence ${evidenceCount}` : "None recorded yet"}</span>
        </div>
        {problem ? <div className="mt-2 text-meta text-kit-red-11">{problem}</div> : null}
      </div>
    );
  }

  /* ── EDIT ────────────────────────────────────────────────────────────── */
  const reasonSelect = (value: string, onChange: (v: string) => void, testId: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={control} data-testid={testId} aria-label="Reason">
      <option value="">Choose a reason</option>
      {PO_DELAY_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
  const noteInput = (value: string, onChange: (v: string) => void, testId: string) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Note" aria-label="Note" className={`${control} min-w-[140px]`} data-testid={testId} />
  );

  return (
    <div className="border-t border-kit-slate-4 pt-3" data-testid="po-supplier-reply">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-label font-semibold text-kit-slate-11">Record supplier answer</div>
        <label className="flex items-center gap-1.5 text-meta">
          <input type="checkbox" checked={doReceived} onChange={(e) => setDoReceived(e.target.checked)} data-testid="po-answer-do-received" />
          Supplier DO received
        </label>
        {doReceived ? (
          <>
            <input value={doNumber} onChange={(e) => setDoNumber(e.target.value)} placeholder="Supplier DO No" aria-label="Supplier DO No" className={`${control} w-36`} data-testid="po-answer-do-number" />
            <SupplierAnswerEvidenceUploadField poId={poId} poVersion={version} entries={doFile} onChange={(e) => setDoFile(e.slice(-1))} ariaLabel="DO file" maxFiles={1} testId="po-answer-do-file" />
          </>
        ) : null}
        <div className="flex-1" />
        <button type="button" onClick={cancel} className="h-8 rounded-control border border-kit-slate-5 bg-white px-3 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3" data-testid="po-answer-cancel">Cancel</button>
        <button type="button" disabled={!ready} onClick={save} data-testid="po-answer-save"
          className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white disabled:bg-kit-slate-5 disabled:text-kit-slate-11">
          {record.isPending ? "Saving…" : gap ? `Save — ${gap}` : "Save"}
        </button>
      </div>
      <div className="mt-2 min-w-0 max-w-full overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-meta" data-testid="po-answer-table">
          <thead className="bg-kit-slate-3">
            <tr>
              <th className={`${head} w-8`}><span className="sr-only">Select</span></th>
              <th className={head}>Item</th><th className={`${head} text-right`}>To deliver</th>
              <th className={head}>Answer</th><th className={head}>Date</th><th className={head}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {openLines.map((l) => {
              const d = draftOf(l.id);
              const still = stillToDeliver(l);
              const total = d.batches.reduce((t, b) => t + (Number(b.qty) || 0), 0);
              return (
                <FragmentRows key={l.id}>
                  <tr className="h-10 border-t border-kit-slate-4" data-testid={`po-answer-edit-${l.id}`}>
                    <td className={cell}><input type="checkbox" checked={d.selected} onChange={(e) => setDraft(l.id, { selected: e.target.checked })} aria-label={`Select ${l.item}`} data-testid={`po-answer-select-${l.id}`} /></td>
                    <td className={cell}>{itemCell(l)}</td>
                    <td className={`${cell} text-right tabular-nums`}>{still}</td>
                    <td className={cell}>
                      <select value={d.answer} aria-label={`Answer for ${l.item}`} data-testid={`po-answer-kind-${l.id}`} className={`${control} min-w-[140px]`}
                        onChange={(e) => {
                          const answer = e.target.value as AnswerKind;
                          setDraft(l.id, { answer, batches: answer === "split" && d.batches.length === 0 ? [{ qty: String(still), date: "", reason: "", remarks: "" }] : d.batches });
                        }}>
                        {(Object.keys(ANSWER_WORD) as AnswerKind[]).map((k) => <option key={k} value={k}>{ANSWER_WORD[k]}</option>)}
                      </select>
                    </td>
                    <td className={cell}>
                      {d.answer === "new_date" ? <input type="date" value={d.date} onChange={(e) => setDraft(l.id, { date: e.target.value })} aria-label={`Date for ${l.item}`} className={control} data-testid={`po-answer-date-input-${l.id}`} /> : null}
                    </td>
                    <td className={cell}>
                      {d.answer === "new_date" && later(d.date) ? (
                        <span className="flex flex-wrap gap-1">
                          {reasonSelect(d.reason, (v) => setDraft(l.id, { reason: v }), `po-answer-reason-${l.id}`)}
                          {d.reason === "Other" ? noteInput(d.remarks, (v) => setDraft(l.id, { remarks: v }), `po-answer-note-${l.id}`) : null}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                  {d.answer === "split" ? d.batches.map((b, i) => (
                    <tr key={`${l.id}:${i}`} className="h-9 border-t border-kit-slate-4 bg-kit-slate-2" data-testid={`po-answer-batch-${l.id}-${i}`}>
                      <td className={cell} />
                      <td className={`${cell} text-kit-slate-11`}>└ batch {i + 1}</td>
                      <td className={`${cell} text-right`}>
                        <input type="number" min={1} value={b.qty} aria-label={`Batch ${i + 1} quantity`} className={`${control} w-16 text-right`} data-testid={`po-answer-batch-qty-${l.id}-${i}`}
                          onChange={(e) => setDraft(l.id, { batches: d.batches.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} /> pcs
                      </td>
                      <td className={cell} />
                      <td className={cell}><input type="date" value={b.date} aria-label={`Batch ${i + 1} date`} className={control} data-testid={`po-answer-batch-date-${l.id}-${i}`}
                        onChange={(e) => setDraft(l.id, { batches: d.batches.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} /></td>
                      <td className={cell}>
                        <span className="flex flex-wrap items-center gap-1">
                          {later(b.date) ? reasonSelect(b.reason, (v) => setDraft(l.id, { batches: d.batches.map((x, j) => (j === i ? { ...x, reason: v } : x)) }), `po-answer-batch-reason-${l.id}-${i}`) : null}
                          {later(b.date) && b.reason === "Other" ? noteInput(b.remarks, (v) => setDraft(l.id, { batches: d.batches.map((x, j) => (j === i ? { ...x, remarks: v } : x)) }), `po-answer-batch-note-${l.id}-${i}`) : null}
                          {i === d.batches.length - 1 ? (
                            <>
                              <button type="button" className="text-meta text-kit-blue-11 hover:underline" data-testid={`po-answer-add-batch-${l.id}`}
                                onClick={() => setDraft(l.id, { batches: [...d.batches, { qty: String(Math.max(0, still - total)), date: "", reason: "", remarks: "" }] })}>+ Add another date</button>
                              <span className={`text-meta ${total === still ? "text-kit-slate-11" : "text-kit-red-11"}`} data-testid={`po-answer-total-${l.id}`}>Total {total} of {still}</span>
                            </>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  )) : null}
                </FragmentRows>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label text-kit-slate-11">Evidence</span>
          <SupplierAnswerEvidenceUploadField poId={poId} poVersion={version} entries={evidence} onChange={setEvidence} ariaLabel="Evidence" testId="po-answer-evidence" />
        </label>
        <div className="flex-1" />
        <label className="flex flex-col gap-1">
          <span className="text-label text-kit-slate-11">Channel</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={control} aria-label="Channel">
            <option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="phone">Phone</option><option value="in_person">In person</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-kit-slate-11">Recipient</span>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} className={control} aria-label="Recipient" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-kit-slate-11">Answered by</span>
          <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder={`Who at ${supplierName}`} className={control} aria-label="Answered by" data-testid="po-answer-reported-by" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-kit-slate-11">Answered by supplier on</span>
          <input type="datetime-local" value={reportedAt} onChange={(e) => setReportedAt(e.target.value)} className={control} aria-label="Answered by supplier on" data-testid="po-answer-reported-at" />
        </label>
      </div>
      {selectedCount > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-control bg-kit-blue-3 px-3 py-1.5 text-meta" data-testid="po-answer-bulk">
          <span>{selectedCount} selected · Apply to selected</span>
          <select value={bulk} onChange={(e) => setBulk(e.target.value as AnswerKind | "")} className={control} aria-label="Apply to selected" data-testid="po-answer-bulk-kind">
            <option value="">Choose answer</option>
            {(Object.keys(ANSWER_WORD) as AnswerKind[]).map((k) => <option key={k} value={k}>{ANSWER_WORD[k]}</option>)}
          </select>
          <button type="button" onClick={applyBulk} disabled={!bulk} className="h-8 rounded-control border border-kit-slate-5 bg-white px-3 text-meta font-medium disabled:text-kit-slate-11" data-testid="po-answer-bulk-apply">Apply</button>
        </div>
      ) : null}
      {problem ? <div className="mt-2 text-meta text-kit-red-11" data-testid="po-answer-problem">{problem}</div> : null}
    </div>
  );
}

/** A keyed fragment for a line row and its batch sub-rows. */
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
