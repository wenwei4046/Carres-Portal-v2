import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  unitProblemChoices,
  unitProblemConsequence,
  type UnitProblem,
  type UnitProblemUnit,
} from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import EvidenceUploadField from "@/components/EvidenceUploadField";

/**
 * REPORT A PROBLEM — the Unit Detail `⋮` door (Stock MASTER §6 · §12.4; owner-
 * approved design 2026-09-26).
 *
 * Three answers and nothing else: what you saw · at least one photo · one
 * plain sentence. The consequence is printed BEFORE submit; the Portal — not
 * the observer — decides Hold, Cannot sell, the Work owner and the due date.
 * The record is written through the ONE Issue door (0526 → 0588), so the same
 * request never records twice.
 */

type Evidence = { path: string; kind: "photo" | "video" };

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const VIDEO_MIMES = ["video/mp4", "video/quicktime"] as const;

export default function WarehouseUnitProblemReport({
  unit,
  open,
  onOpenChange,
  onRecorded,
}: {
  unit: UnitProblemUnit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded?: (result: { issueNo: string; protection: string }) => void;
}) {
  const qc = useQueryClient();
  const [problem, setProblem] = useState<UnitProblem | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  // One request id per set of answers: a retry of the same answers is the same
  // request and cannot record a second Issue (0526).
  const attempt = useRef<{ key: string; id: string } | null>(null);

  const consequence = useMemo(() => (problem ? unitProblemConsequence(unit, problem) : null), [unit, problem]);

  const save = useMutation({
    mutationFn: (body: object) =>
      apiFetch<{ issueNo: string; protection: string }>(`/api/ops/stock/register/${encodeURIComponent(unit.unitCode)}/report-problem`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["operation", "stock-unit", unit.unitCode] });
      void qc.invalidateQueries({ queryKey: ["operation", "stock-unit-issues", unit.unitCode] });
      void qc.invalidateQueries({ queryKey: ["operation", "stock-register"] });
      void qc.invalidateQueries({ queryKey: ["issues"] });
      attempt.current = null;
      setFailure(null);
      onOpenChange(false);
      setProblem(null);
      setEvidence([]);
      setNote("");
      onRecorded?.(result);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403) setFailure("You do not have access to report this.");
      else if (error instanceof ApiError && error.status === 409) setFailure(error.message || "This report was refused · Check the Unit");
      else if (error instanceof ApiError && error.status >= 400 && error.status < 500) setFailure("Problem not recorded · Check the answers");
      else setFailure("Not confirmed · Try again");
    },
  });

  const canSubmit = Boolean(problem) && evidence.length > 0 && note.trim().length >= 3 && !save.isPending;

  const submit = () => {
    if (!canSubmit || !problem) return;
    const body = { problem, note: note.trim(), evidence };
    const key = JSON.stringify(body);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    setFailure(null);
    save.mutate({ requestId: attempt.current.id, ...body });
  };

  const sign = async (file: File) =>
    apiFetch<{ token: string; path: string }>("/api/ops/issues/evidence/upload-url", {
      method: "POST",
      body: JSON.stringify({ mimeType: file.type, scope: { kind: "unit", id: unit.id } }),
    });

  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!value) setFailure(null);
        onOpenChange(value);
      }}
      title="Report a problem"
      description={`${unit.unitCode} · ${unit.productName ?? unit.sku}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="neutral" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} loading={save.isPending} onClick={submit} data-testid="unit-problem-submit">
            Report a problem
          </Button>
        </div>
      }
    >
      <div className="grid gap-4" data-testid="unit-problem-report">
        {failure ? (
          <p role="alert" className="rounded-control border border-kit-red-9 bg-kit-red-3 px-3 py-2 text-body text-kit-red-11">
            {failure}
          </p>
        ) : null}

        <section>
          <h3 className="mb-2 text-label text-kit-slate-11">What did you see?</h3>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="What did you see?">
            {unitProblemChoices.map((choice) => (
              <Button
                key={choice.value}
                variant={problem === choice.value ? "primary" : "neutral"}
                onClick={() => setProblem(choice.value)}
                aria-pressed={problem === choice.value}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-label text-kit-slate-11">Photo</h3>
          <EvidenceUploadField<Evidence>
            entries={evidence}
            onChange={setEvidence}
            sign={sign}
            bucket="issue-evidence"
            imageMimes={IMAGE_MIMES}
            videoMimes={VIDEO_MIMES}
            imageMaxBytes={10 * 1024 * 1024}
            videoMaxBytes={20 * 1024 * 1024}
            maxFiles={6}
            ariaLabel="Photo of the problem"
            disabled={save.isPending}
            testId="unit-problem-evidence"
          />
        </section>

        <section className="grid gap-1">
          <label htmlFor="unit-problem-note" className="text-label text-kit-slate-11">
            What happened, in one sentence
          </label>
          <textarea
            id="unit-problem-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
            disabled={save.isPending}
            className="w-full rounded-control border border-kit-slate-5 bg-white px-2 py-1 text-body text-kit-slate-12 focus:border-kit-blue-9 focus:outline-none focus:ring-2 focus:ring-kit-blue-9"
          />
        </section>

        {consequence ? (
          <p className="rounded-control bg-kit-slate-3 px-3 py-2 text-body text-base-800" data-testid="unit-problem-consequence">
            {consequence}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
