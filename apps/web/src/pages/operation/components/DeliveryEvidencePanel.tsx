/**
 * EVIDENCE — the Delivery Order object's §9 section (Delivery MASTER §6.1,
 * Card 13, 2026-09-13): every file bound to the event it proves, and the
 * proof-review acts.
 *
 * ⭐ AN UPLOAD IS NOT A VERDICT. A file here records what the driver sent. The
 * verdict is Operation's, in three governed words — `Proof Accepted` ·
 * `More Proof Required` · `Proof Rejected` — each with a reason, and it is
 * `Proof Accepted` that turns `Delivered` green everywhere. A newer file
 * reopens the question; a rejection reopens the upload with the reason.
 *
 * ⭐ ONE DOOR PER ACT (Architecture Law C). The photo/video uploader is the
 * SAME `DeliveryProofUploadButton` the register and the Sales Order drawer
 * render; the signed paper goes through its own §6.1 attach door, which files
 * it against the latest recorded attempt and re-records nothing — the
 * deliver-and-deduct door stays the Sales Order's order-wide act.
 *
 * The kit Panel's right slot is the one control (the signed paper's door,
 * while it is owed); the body is the edit surface — no dialog.
 */
// design-standard: not-a-list-page — an object-page section with in-panel acts
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import {
  latestEvidenceAtOf,
  proofDecisionLabel,
  type DeliveryAttemptEvidenceRow,
  type DeliveryProofReviewRow,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { ApiError, apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  useAttachSignedDeliveryOrder,
  type DeliveryOrderAttemptRow,
} from "@/lib/queries";
import Panel from "@/components/kit/Panel";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import {
  DELIVERY_RESULT_LABEL,
  DOR_COPY,
  submissionFilesOf,
  type DoProofReview,
  type DriverSubmissionFile,
} from "../delivery-orders-register";
import { DeliveryProofUploadButton, SignedDeliveryDocumentLink } from "./DriverSubmission";
import DeliveryProofReviewForm from "./DeliveryProofReviewForm";

/** ⭐ EVERY VISIBLE WORD, IN ONE PLACE (COPY-STANDARD, Delivery Order words). */
export const EVIDENCE_COPY = {
  title: "Evidence",
  deliveryOn: (day: string) => `Delivery on ${day}`,
  noResult: "No delivery result recorded yet — evidence binds to the delivery it proves.",
  /* Card 20 — an intermediate Journey leg's document. */
  arrivalOnly: "This leg ends at a partner warehouse. It owes no delivery proof — the customer leg's document carries it.",
  arrived: "Arrived",
  noFiles: "No files from this delivery yet",
  driverSubmission: DOR_COPY.driverSubmission,
  signedDo: DOR_COPY.signedDo,
  signedDoOnFile: DOR_COPY.signedDoOnFile,
  noSignedDo: DOR_COPY.noSignedDo,
  uploadSignedDo: DOR_COPY.uploadSignedDo,
  saveSignedDo: "Save signed Delivery Order",
  signedDoFile: "Signed Delivery Order file",
  signedDoFileHint: "PDF, JPG or PNG · up to 10 MB",
  signerName: "Received & signed by",
  review: "Proof review",
  checkProof: DOR_COPY.checkProof,
  notReviewed: "Not reviewed yet",
  reason: "Reason",
  reasonHint: "Say what is missing, or why the proof is refused. The reason stays on record.",
  saveReview: "Save review",
  cancel: "Cancel",
  reviewSaved: "Proof review saved",
  signedDoSaved: "Signed Delivery Order saved",
  meaning: DOR_COPY.submissionMeaning,
} as const;

const SIGNED_DO_MIMES = ["application/pdf", "image/jpeg", "image/png"];
const SIGNED_DO_MAX = 10 * 1024 * 1024;

type EvidenceFile = DeliveryAttemptEvidenceRow & { url: string | null };
type ReviewRow = DeliveryProofReviewRow & { reviewed_by_name: string | null };

function Absent({ children }: { children: string }) {
  return (
    <span className="text-body text-kit-slate-9" data-absence="true">
      {children}
    </span>
  );
}

/** One bound file — a thumbnail for a picture, a named link for the rest. */
function EvidenceFileView({
  file,
  index,
  onReadState,
}: {
  file: { url: string | null; kind: string; at: string; path: string };
  index: number;
  onReadState?: (path: string, readable: boolean) => void;
}) {
  const word = file.kind === "video" ? DOR_COPY.videos : file.kind === "document" ? DOR_COPY.signedDo : DOR_COPY.photos;
  if (!file.url) {
    return (
      <span className="text-label text-kit-slate-11" data-testid="do-evidence-unsigned">
        {word} {index + 1} · {fmtDate(file.at)}
      </span>
    );
  }
  if (file.kind === "photo") {
    return (
      <a href={file.url} target="_blank" rel="noreferrer" className="block" data-testid="do-evidence-photo">
        <img
          src={file.url}
          alt={`${word} ${index + 1}`}
          className="h-24 w-24 rounded-md border border-kit-slate-5 object-cover"
          onLoad={() => onReadState?.(file.path, true)}
          onError={() => onReadState?.(file.path, false)}
        />
        <span className="mt-1 block text-label text-kit-slate-11">{fmtDate(file.at)}</span>
      </a>
    );
  }
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noreferrer"
      className="text-label font-medium text-blue-700 underline-offset-2 hover:underline"
      data-testid={file.kind === "video" ? "do-evidence-video" : "do-evidence-document"}
    >
      {word} · {fmtDate(file.at)}
    </a>
  );
}

/**
 * THE SIGNED PAPER's attach form — in-panel, no dialog. File → the existing
 * order-level sign-upload door → the §6.1 attach door.
 */
function SignedDoAttachForm({
  doNumber,
  orderId,
  onDone,
}: {
  doNumber: string;
  orderId: string;
  onDone: () => void;
}) {
  const [path, setPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [signer, setSigner] = useState("");
  const attach = useAttachSignedDeliveryOrder(doNumber, {
    onSuccess: () => {
      toast.success(EVIDENCE_COPY.signedDoSaved);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!SIGNED_DO_MIMES.includes(file.type)) {
      setUploadError(`Unsupported file type: ${file.type || "unknown"}. Use PDF, JPG, or PNG.`);
      return;
    }
    if (file.size === 0 || file.size > SIGNED_DO_MAX) {
      setUploadError(file.size === 0 ? "File appears to be empty (0 bytes)." : "File too large. Max 10 MB.");
      return;
    }
    setUploading(true);
    setFileName(file.name);
    setPath(null);
    try {
      const sign = await apiFetch<{ token: string; path: string }>("/api/storage/dos/sign-order-upload", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId, do_number: doNumber, mime_type: file.type, size_bytes: file.size }),
      });
      const { error } = await supabase.storage.from("delivery-orders").uploadToSignedUrl(sign.path, sign.token, file);
      if (error) throw error;
      setPath(sign.path);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const canSave = Boolean(path) && !uploading && !attach.isPending;
  return (
    <form
      className="mt-3 flex flex-col gap-3 border-t border-kit-slate-4 pt-3"
      data-testid="do-signed-do-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave || !path) return;
        attach.mutate({ doFilePath: path, signerName: signer.trim() || null });
      }}
    >
      <div>
        <label className="text-label text-kit-slate-11" htmlFor={`do-signed-do-file-${doNumber}`}>
          {EVIDENCE_COPY.signedDoFile}
        </label>
        <input
          id={`do-signed-do-file-${doNumber}`}
          type="file"
          accept=".pdf,image/jpeg,image/png"
          className="mt-1 block w-full text-meta"
          onChange={(e) => void pick(e)}
          disabled={uploading || attach.isPending}
          data-testid="do-signed-do-file"
        />
        <span className="mt-1 block text-label text-kit-slate-11">
          {uploadError ? (
            <span className="text-kit-red-11" data-testid="do-signed-do-error">{uploadError}</span>
          ) : fileName ? (
            uploading ? `Uploading… ${fileName}` : path ? `Uploaded: ${fileName}` : fileName
          ) : (
            EVIDENCE_COPY.signedDoFileHint
          )}
        </span>
      </div>
      <Input
        id={`do-signed-do-signer-${doNumber}`}
        label={EVIDENCE_COPY.signerName}
        value={signer}
        onChange={(e) => setSigner(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" type="submit" disabled={!canSave} data-testid="do-signed-do-save">
          {EVIDENCE_COPY.saveSignedDo}
        </Button>
        <Button size="sm" type="button" onClick={onDone} data-testid="do-signed-do-cancel">
          {EVIDENCE_COPY.cancel}
        </Button>
      </div>
    </form>
  );
}

export default function DeliveryEvidencePanel({
  doNumber,
  orderId,
  attempts,
  attemptEvidence,
  proofReviews,
  ledger,
  signedDo,
  proofReview,
  arrivalOnly = false,
}: {
  doNumber: string;
  orderId: string;
  attempts: readonly DeliveryOrderAttemptRow[];
  attemptEvidence: readonly EvidenceFile[];
  proofReviews: readonly ReviewRow[];
  /** The order's ledger with signed urls — this document's files only are shown. */
  ledger: readonly DriverSubmissionFile[] | null | undefined;
  signedDo: { present: boolean; uploadedAt: string | null };
  proofReview: DoProofReview;
  /** Card 20 — this document is an intermediate Journey leg: its `delivered`
   *  result is an ARRIVAL at a partner warehouse, and no delivery proof is
   *  owed on it (the customer leg's document carries the proof). */
  arrivalOnly?: boolean;
}) {
  const [attaching, setAttaching] = useState(false);
  const [readablePhotos, setReadablePhotos] = useState<Record<string, boolean>>({});
  const reached = arrivalOnly
    ? []
    : [...attempts]
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
        .filter((a) => a.result === "delivered" || a.result === "partial");
  const latestReached = reached.at(-1) ?? null;
  const boundPaths = new Set(attemptEvidence.map((e) => e.path));
  /* Legacy ledger files never bound to an attempt still belong to this trip. */
  const unbound = [
    ...submissionFilesOf(ledger, doNumber, "photo"),
    ...submissionFilesOf(ledger, doNumber, "video"),
  ].filter((f) => !boundPaths.has(f.path));
  const reviewsNewestFirst = [...proofReviews].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at));
  const evidenceVersion = latestEvidenceAtOf({
    ledger,
    doNumber,
    attemptEvidence,
    signedDoUploadedAt: signedDo.uploadedAt,
  });
  const reviewPhotoPaths = latestReached
    ? [
        ...attemptEvidence.filter((file) => file.attempt_id === latestReached.id && file.kind === "photo"),
        ...unbound.filter((file) => file.kind !== "video"),
      ].map((file) => ({ path: file.path, hasUrl: Boolean(file.url) }))
    : [];
  const allEvidenceReadable = reviewPhotoPaths.every(
    (file) => file.hasUrl && readablePhotos[file.path] === true,
  );
  const recordPhotoReadState = (path: string, readable: boolean) => {
    setReadablePhotos((before) => before[path] === readable ? before : { ...before, [path]: readable });
  };

  const stateLine = (() => {
    switch (proofReview.state) {
      case "accepted":
        return { text: `${proofDecisionLabel("accepted")} · ${proofReview.reviewedAt ? fmtDate(proofReview.reviewedAt) : ""}`.trim(), tone: "text-kit-green-11" };
      case "rejected":
      case "more_required":
        return {
          text: `${proofDecisionLabel(proofReview.state)}${proofReview.reason ? ` · ${proofReview.reason}` : ""}`,
          tone: "text-kit-amber-11",
        };
      case "pending":
        return { text: EVIDENCE_COPY.checkProof, tone: "text-kit-amber-11" };
      default:
        return null;
    }
  })();

  return (
    <Panel
      title={EVIDENCE_COPY.title}
      right={
        latestReached && !signedDo.present && !attaching ? (
          <Button size="sm" type="button" onClick={() => setAttaching(true)} data-testid="do-evidence-upload-signed-do">
            {EVIDENCE_COPY.uploadSignedDo}
          </Button>
        ) : undefined
      }
    >
      <p className="text-label text-kit-slate-11">{EVIDENCE_COPY.meaning}</p>
      {arrivalOnly ? (
        <p className="mt-1 text-label text-kit-slate-11" data-testid="do-evidence-arrival-only">
          {EVIDENCE_COPY.arrivalOnly}
        </p>
      ) : null}

      {/* ── Per attempt: the files bound to the event they prove ─────────── */}
      {attempts.length === 0 ? (
        <p className="mt-3">
          <Absent>{EVIDENCE_COPY.noResult}</Absent>
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3" data-testid="do-evidence-attempts">
          {attempts.map((a, i) => {
            const files = a.id ? attemptEvidence.filter((e) => e.attempt_id === a.id) : [];
            const isLatestReached = latestReached !== null && a === latestReached;
            const shown = [
              ...files.map((f) => ({ url: f.url, kind: f.kind, at: f.recorded_at, path: f.path })),
              ...(isLatestReached
                ? unbound.map((f) => ({ url: f.url ?? null, kind: f.kind === "video" ? "video" : "photo", at: f.at, path: f.path }))
                : []),
            ];
            return (
              <li key={a.id ?? i} className="flex flex-col gap-1">
                <span className="text-body font-medium text-kit-slate-12">
                  {EVIDENCE_COPY.deliveryOn(fmtDate(a.recorded_at))} ·{" "}
                  {arrivalOnly && a.result === "delivered" ? EVIDENCE_COPY.arrived : DELIVERY_RESULT_LABEL[a.result]}
                </span>
                {shown.length === 0 ? (
                  unbound.length === 0 ? <Absent>{EVIDENCE_COPY.noFiles}</Absent> : null
                ) : (
                  <div className="flex flex-wrap items-start gap-3">
                    {shown.map((f, j) => (
                      <EvidenceFileView key={f.path} file={f} index={j} onReadState={isLatestReached ? recordPhotoReadState : undefined} />
                    ))}
                  </div>
                )}
                {isLatestReached ? (
                  <div>
                    <DeliveryProofUploadButton orderId={orderId} doNumber={doNumber} testId="do-evidence-upload-photo" />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Unbound files name this document, not an invented attempt binding. */}
      {!latestReached && unbound.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-start gap-3" data-testid="do-evidence-document-files">
          {unbound.map((file, index) => (
            <EvidenceFileView key={file.path} index={index} file={{ path: file.path, url: file.url ?? null, kind: file.kind === "video" ? "video" : "photo", at: file.at }} />
          ))}
        </div>
      ) : null}

      {/* ── The signed paper ─────────────────────────────────────────────── */}
      {!arrivalOnly || signedDo.present ? <div className="mt-3 border-t border-kit-slate-4 pt-3">
        <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-11">{EVIDENCE_COPY.signedDo}</span>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-body">
          {signedDo.present ? (
            <>
              <span className="text-kit-slate-12">
                {EVIDENCE_COPY.signedDoOnFile}
                {signedDo.uploadedAt ? ` · ${fmtDate(signedDo.uploadedAt)}` : ""}
              </span>
              <SignedDeliveryDocumentLink doNumber={doNumber} present />
            </>
          ) : (
            <Absent>{EVIDENCE_COPY.noSignedDo}</Absent>
          )}
        </div>
        {attaching && latestReached ? (
          <SignedDoAttachForm doNumber={doNumber} orderId={orderId} onDone={() => setAttaching(false)} />
        ) : null}
      </div> : null}

      {/* ── The review ───────────────────────────────────────────────────── */}
      {latestReached ? (
        <div className="mt-3 border-t border-kit-slate-4 pt-3" data-testid="do-proof-review">
          <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-11">{EVIDENCE_COPY.review}</span>
          <p className={`mt-1 text-body ${stateLine?.tone ?? "text-kit-slate-9"}`} data-testid="do-proof-review-state">
            {stateLine?.text ?? EVIDENCE_COPY.notReviewed}
          </p>
          {reviewsNewestFirst.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1" data-testid="do-proof-review-history">
              {reviewsNewestFirst.map((r) => (
                <li key={r.id} className="text-label text-kit-slate-11">
                  {proofDecisionLabel(r.decision)}
                  {r.reason ? ` · ${r.reason}` : ""} · {fmtDate(r.reviewed_at)}
                  {r.reviewed_by_name ? ` · ${r.reviewed_by_name}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {evidenceVersion ? (
            <div className="mt-3" data-testid="do-proof-review-acts">
              <DeliveryProofReviewForm
                doNumber={doNumber}
                attemptId={latestReached.id ?? null}
                sourceVersion={evidenceVersion}
                allEvidenceReadable={allEvidenceReadable}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
