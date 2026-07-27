import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileVideo, Paperclip } from "lucide-react";
import {
  caseEvidenceAccept,
  caseEvidenceChecklist,
  caseEvidenceSlot,
  caseEvidenceSlotLabel,
  type CaseEvidenceListResponse,
  type CaseEvidenceSlotKey,
  type CaseIssueKey,
  type CaseReporterKey,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { attachCaseEvidence } from "@/lib/case-evidence-upload";

/**
 * S2 — the evidence a case was filed with, in the case view.
 *
 * The card's second half: "each file shows its uploader role in the case view."
 * The stamp is the server's (`by_role`, written at upload and refused if absent
 * by 0288's CHECK), so this screen reports it rather than deriving it.
 *
 * Files can still be ADDED here — the customer often sends the photo the next
 * day — but never removed: the ledger is append-only in the API and the bucket
 * has no delete policy. A wrong photo is answered by uploading the right one.
 */
export default function CaseEvidenceGallery({
  caseId,
  issueType,
  reportedBy,
}: {
  caseId: string;
  issueType: CaseIssueKey | null;
  reportedBy: CaseReporterKey | null;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [addSlot, setAddSlot] = useState<CaseEvidenceSlotKey | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery<CaseEvidenceListResponse>({
    queryKey: ["ops", "service-cases", caseId, "evidence"],
    queryFn: () => apiFetch(`/api/ops/service-cases/${caseId}/evidence`),
  });

  const files = q.data?.evidence ?? [];

  // The checklist this case was filed against, so "add another" offers the slots
  // that mean something here — plus any slot already on file, so a legacy or
  // retired slot never becomes un-addable.
  const slots: CaseEvidenceSlotKey[] = Array.from(
    new Set([
      ...caseEvidenceChecklist(issueType, reportedBy).map((r) => r.slot),
      ...files
        .map((f) => f.slot)
        .filter((s): s is CaseEvidenceSlotKey => !!caseEvidenceSlot(s)),
    ]),
  );

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !addSlot) return;
    setBusy(true);
    setError(null);
    try {
      await attachCaseEvidence(caseId, addSlot, file);
      await qc.invalidateQueries({ queryKey: ["ops", "service-cases", caseId, "evidence"] });
      setAddSlot("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-base-200 bg-base-50 p-3">
      <p className="t-tiny uppercase tracking-wider text-base-500">
        Evidence{files.length > 0 ? ` · ${files.length}` : ""}
      </p>

      {q.isLoading ? (
        <p className="mt-2 text-sm text-base-500">Loading…</p>
      ) : files.length === 0 ? (
        <p className="mt-2 text-sm text-base-600">
          No photos on this case. It was filed before photos became part of opening one.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => (
            <li key={f.path} className="flex items-center gap-2.5">
              {f.url ? (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-base-200 bg-white"
                >
                  {f.kind === "video" ? (
                    <FileVideo size={16} className="text-base-500" />
                  ) : (
                    <img src={f.url} alt={caseEvidenceSlotLabel(f.slot)} className="h-full w-full object-cover" />
                  )}
                </a>
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-base-200 bg-white">
                  <Paperclip size={14} className="text-base-400" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-base-800">
                  {caseEvidenceSlotLabel(f.slot)}
                </span>
                {/* The card's own ask: who uploaded it, and when. */}
                <span className="t-tiny block text-base-500">
                  {f.byRole || "unknown"} · {stamp(f.at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {slots.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={addSlot}
            onChange={(e) => setAddSlot(e.target.value as CaseEvidenceSlotKey | "")}
            aria-label="What kind of photo to add"
            className="rounded border border-base-300 bg-white px-2 py-1 text-[13px]"
          >
            <option value="">— add a photo —</option>
            {slots.map((s) => (
              <option key={s} value={s}>
                {caseEvidenceSlotLabel(s)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!addSlot || busy}
            className="btn-secondary py-1 text-[12px] disabled:opacity-40"
          >
            {busy ? "Uploading…" : `Upload ${addSlot ? (caseEvidenceSlot(addSlot)?.kind ?? "photo") : "photo"}`}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={caseEvidenceAccept(
              addSlot ? (caseEvidenceSlot(addSlot)?.kind ?? "photo") : "photo",
            )}
            onChange={pick}
            className="hidden"
            aria-label="Evidence file"
          />
        </div>
      )}

      {error && <p className="t-tiny mt-1.5 text-error-700">{error}</p>}
    </div>
  );
}

/** "27 Jul 26 · 3:14 PM" — the date law, plus the time, because two photos of
 *  the same fault on the same day is the normal case. */
function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })} · ${d.toLocaleTimeString(
    "en-GB",
    { hour: "2-digit", minute: "2-digit" },
  )}`;
}
