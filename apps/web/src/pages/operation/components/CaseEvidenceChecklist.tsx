import { useRef, useState } from "react";
import { Camera, Check, Video } from "lucide-react";
import {
  caseEvidenceAccept,
  caseEvidenceChecklist,
  type CaseEvidenceRequirement,
  type CaseEvidenceSlotKey,
  type CaseIssueKey,
  type CaseReporterKey,
} from "@carres/shared";
import {
  uploadCaseEvidence,
  type CaseEvidenceTarget,
  type UploadedEvidence,
} from "@/lib/case-evidence-upload";

/**
 * S2 — the evidence tick-list. **No evidence, no service case.**
 *
 * The answer to "what is wrong" decides what must be photographed, and the
 * instruction under each line IS the training: a new hire who has never handled
 * a colour complaint still knows to film left to right, slowly, in daylight.
 *
 * One component, two homes: the wizard uploads against a `draftId` before the
 * case exists (it cannot be created without these files), and the case view
 * uploads against a `caseId` when the customer sends a photo the next day.
 *
 * Every line is a tick, a plain instruction and one obvious button — no drag
 * targets, no gallery picker chrome. Optional lines say so, so nobody hunts for
 * a box that was thrown away weeks ago.
 */
export default function CaseEvidenceChecklist({
  issueType,
  reportedBy,
  target,
  files,
  onUploaded,
}: {
  issueType: CaseIssueKey | null;
  reportedBy: CaseReporterKey | null;
  target: CaseEvidenceTarget;
  /** Everything uploaded so far, in this session or on a previous day. */
  files: readonly { slot: string }[];
  onUploaded: (file: UploadedEvidence) => void;
}) {
  const checklist = caseEvidenceChecklist(issueType, reportedBy);

  if (checklist.length === 0) {
    return (
      <p className="text-body text-base-500">
        Answer what is wrong first — it decides which photos to take.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {checklist.map((req) => (
        <EvidenceRow
          key={req.slot}
          req={req}
          have={files.filter((f) => f.slot === req.slot).length}
          target={target}
          onUploaded={onUploaded}
        />
      ))}
    </div>
  );
}

function EvidenceRow({
  req,
  have,
  target,
  onUploaded,
}: {
  req: CaseEvidenceRequirement;
  have: number;
  target: CaseEvidenceTarget;
  onUploaded: (file: UploadedEvidence) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = have >= req.minCount;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear it immediately so picking the SAME file twice still fires a change
    // (a second close-up is often the same filename from the same camera roll).
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      onUploaded(await uploadCaseEvidence(target, req.slot as CaseEvidenceSlotKey, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded border px-3 py-2.5 ${
        done ? "border-base-200 bg-success-soft" : "border-base-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            done ? "border-success bg-success text-white" : "border-base-300 bg-white"
          }`}
        >
          {done && <Check size={13} strokeWidth={3} />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-base-900">
            {req.label}
            {req.minCount > 1 && (
              <span className="text-meta ml-1.5 text-base-500">
                {have} of {req.minCount}
              </span>
            )}
            {!req.required && (
              <span className="text-meta ml-1.5 text-base-500">If you have it</span>
            )}
          </p>
          <p className="text-meta mt-0.5 text-base-600">{req.instruction}</p>
          {error && <p className="text-meta mt-1 text-error-700">{error}</p>}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="btn-secondary flex shrink-0 items-center gap-1 py-1 text-meta disabled:opacity-40"
        >
          {req.kind === "video" ? <Video size={13} /> : <Camera size={13} />}
          {busy ? "Uploading…" : `${done ? "Add another" : "Upload"} ${req.kind}`}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={caseEvidenceAccept(req.kind)}
        onChange={pick}
        className="hidden"
        aria-label={req.label}
      />
    </div>
  );
}
