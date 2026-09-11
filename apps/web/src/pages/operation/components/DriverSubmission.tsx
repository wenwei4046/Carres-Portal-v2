/**
 * DRIVER SUBMISSION — the doors onto what came back from ONE delivery trip.
 * Owner ruling 2026-09-11 · `docs/delivery/MASTER.md` §8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT THIS FILE REFUSES TO DO
 *
 * It never shows a Sales Order's whole photo ledger as one document's proof,
 * and it never shows the warehouse's handover evidence as the driver's
 * submission. The register's counts and these viewers read the SAME predicate
 * (`submissionFilesOf`) over the SAME stamped ledger, so a button that says
 * three photos opens exactly three photos (Architecture Law D).
 *
 * ⭐ AN UPLOAD IS NOT A VERDICT
 *
 * A file here records what the driver sent. It is not proof accepted and not a
 * successful delivery — the viewer says so in words, because a count beside a
 * tick is exactly the kind of thing an operator reads as "done".
 *
 * ⭐ ONE UPLOADER, NOT TWO
 *
 * `DeliveryProofUploadButton` is the one file-picking door onto the existing
 * `useUploadDeliveryPhoto` mutation. The Sales Order drawer's delivery row and
 * the register's work-queue entry both render THIS button — a second picker
 * would be a second form for one act (Architecture Law C).
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { DELIVERY_PHOTO_MIMES, DELIVERY_VIDEO_MIMES } from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { qk, useDeliveryPhotos, useUploadDeliveryPhoto } from "@/lib/queries";
import { Modal } from "./Modal";
import { DOR_COPY, submissionFilesOf } from "../delivery-orders-register";

const ACCEPT = [...DELIVERY_PHOTO_MIMES, ...DELIVERY_VIDEO_MIMES].join(",");

/** Muted, never a dash — the portal's absence rank (COPY-STANDARD). */
function Absent({ children }: { children: string }) {
  return (
    <span className="text-kit-slate-9" data-absence="true">
      {children}
    </span>
  );
}

/**
 * THE ONE FILE-PICKING DOOR onto the delivery-proof ledger. `doNumber` names
 * the trip; the SERVER verifies that the number is one of this order's own
 * documents before it stamps anything, so passing it here asks and never
 * asserts. Photos and videos ride the same picker — the operator should not
 * have to know which kind of button to press.
 */
export function DeliveryProofUploadButton({
  orderId,
  doNumber,
  label = DOR_COPY.uploadPhoto,
  testId,
}: {
  orderId: string;
  doNumber?: string | null;
  label?: string;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDeliveryPhoto(orderId, {
    doNumber: doNumber ?? null,
    onSuccess: () => toast.success("Delivery file uploaded"),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : e.message || "Upload failed"),
  });
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-label="Delivery file"
        data-testid={testId ? `${testId}-input` : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        data-testid={testId}
        disabled={upload.isPending}
        onClick={(event) => {
          event.stopPropagation();
          inputRef.current?.click();
        }}
        className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-control border border-kit-slate-6 bg-white px-2 text-label font-medium text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12 disabled:opacity-60"
      >
        <Upload size={13} strokeWidth={1.75} aria-hidden />
        <span className="truncate">{upload.isPending ? "Uploading…" : label}</span>
      </button>
    </>
  );
}

/**
 * THE GALLERY and THE PLAYER — one component, because they answer the same
 * question about the same ledger and differ only in how a file is rendered.
 * Opened from the register's `Driver submission` count buttons.
 */
export function DriverSubmissionViewer({
  orderId,
  doNumber,
  kind,
  onClose,
}: {
  orderId: string;
  doNumber: string;
  kind: "photo" | "video";
  onClose: () => void;
}) {
  const query = useDeliveryPhotos(orderId);
  const files = submissionFilesOf(query.data?.photos, doNumber, kind);
  const title = `${kind === "photo" ? DOR_COPY.photos : DOR_COPY.videos} · ${doNumber}`;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="grid gap-3" data-testid="driver-submission-viewer">
        <p className="text-label text-kit-slate-11">{DOR_COPY.submissionMeaning}</p>
        {query.isLoading ? (
          <p className="text-body text-kit-slate-11" data-testid="driver-submission-loading">
            {DOR_COPY.loading}
          </p>
        ) : query.isError ? (
          <div className="flex items-center justify-between gap-3 text-meta text-danger">
            <span data-testid="driver-submission-failed">{DOR_COPY.mediaFailed}</span>
            <button
              type="button"
              className="rounded-control border border-base-300 bg-white px-2 py-1 font-medium text-base-700 hover:bg-hovertint"
              onClick={() => void query.refetch()}
            >
              {DOR_COPY.tryAgain}
            </button>
          </div>
        ) : files.length === 0 ? (
          <p className="text-body" data-testid="driver-submission-empty">
            <Absent>{kind === "photo" ? DOR_COPY.noPhoto : DOR_COPY.noVideo}</Absent>
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {files.map((file, index) =>
              file.url == null ? (
                /* A file whose signed url could not be minted is STILL a
                   recorded fact — it is named, not hidden. */
                <span
                  key={file.path}
                  className="text-label text-base-600"
                  data-testid="driver-submission-unsigned"
                >
                  {kind === "photo" ? DOR_COPY.photos : DOR_COPY.videos} {index + 1} ·{" "}
                  {fmtDate(file.at)}
                </span>
              ) : kind === "photo" ? (
                <a
                  key={file.path}
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                  data-testid="driver-submission-photo"
                >
                  <img
                    src={file.url}
                    alt={`${DOR_COPY.photos} ${index + 1}`}
                    className="h-36 w-36 rounded-md border border-base-200 object-cover"
                  />
                  <span className="mt-1 block text-label text-base-600">
                    {fmtDate(file.at)}
                  </span>
                </a>
              ) : (
                <span key={file.path} className="block" data-testid="driver-submission-video">
                  <video
                    src={file.url}
                    controls
                    preload="metadata"
                    className="h-44 w-72 rounded-md border border-base-200 bg-black"
                  />
                  <span className="mt-1 block text-label text-base-600">
                    {fmtDate(file.at)}
                  </span>
                </span>
              ),
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * THE SIGNED DELIVERY ORDER's viewing link.
 *
 * The url is minted ON CLICK — a signed url lives one hour, so a register that
 * pre-signed every row would hand out hundreds of links nobody opens.
 *
 * ⭐ ONE CLICK, NOT TWO (walk finding, 2026-09-11). The first build fetched
 * the url on click and then rendered an `<a>` the operator had to click
 * AGAIN — a door that answers a knock with a second door. The tab is opened
 * SYNCHRONOUSLY inside the click (so no pop-up blocker sees a delayed
 * `window.open`) and the signed url is dropped into it when it arrives. A
 * document with no paper, or a signing that fails, closes that tab again and
 * says so in the row rather than leaving a blank window open.
 */
export function SignedDeliveryDocumentLink({
  doNumber,
  present,
}: {
  doNumber: string;
  present: boolean;
}) {
  const qc = useQueryClient();
  const [state, setState] = useState<"idle" | "opening" | "missing" | "failed">("idle");

  if (!present) return <Absent>{DOR_COPY.noSignedDo}</Absent>;
  if (state === "missing" || state === "failed") {
    return (
      <span className="text-label text-danger" data-testid="signed-do-failed">
        {state === "missing" ? DOR_COPY.signedDoMissing : DOR_COPY.signedDoFailed}
      </span>
    );
  }

  const open = async () => {
    const tab = window.open("", "_blank", "noopener,noreferrer");
    setState("opening");
    try {
      /* The SAME query key the rest of the portal would read, so a second
         click inside the hour costs no round trip. */
      const data = await qc.fetchQuery({
        queryKey: qk.operation.signedDeliveryDocument(doNumber),
        queryFn: () =>
          apiFetch<{ url: string | null; uploadedAt: string | null }>(
            `/api/operation/delivery-orders/${encodeURIComponent(doNumber)}/signed-document`,
          ),
        staleTime: 10 * 60_000,
      });
      if (!data.url) {
        tab?.close();
        setState("missing");
        return;
      }
      if (tab) tab.location.href = data.url;
      else window.open(data.url, "_blank", "noopener,noreferrer");
      setState("idle");
    } catch (error) {
      tab?.close();
      setState("failed");
      toast.error(
        error instanceof ApiError ? error.message : DOR_COPY.signedDoFailed,
      );
    }
  };

  return (
    <button
      type="button"
      className="text-label font-medium text-blue-700 underline-offset-2 hover:underline"
      title={DOR_COPY.openSignedDo}
      data-testid="signed-do-link"
      disabled={state === "opening"}
      onClick={(event) => {
        event.stopPropagation();
        void open();
      }}
    >
      {state === "opening" ? DOR_COPY.loading : DOR_COPY.signedDo}
    </button>
  );
}
